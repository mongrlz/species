import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';
import WebSocket from 'ws';
import path from 'node:path';
import {readJSON,writeJSON} from './storage.mjs';
import {feeSchedule,fullClauses,builderExport} from './evidence.mjs';
import { compactConfig, fingerprint, normalize, ruleRows, safeAddress, sanitizeEvent } from './domain.mjs';

export class ProviderError extends Error {constructor(message,status=502){super(message);this.status=status;}}
export class Providers {
  events=[];eventSerial=0;live={state:'connecting',connectedAt:null,lastMessageAt:null,lastEventAt:null,region:null,discarded:0,reason:null};cache=new Map();samples=new Map();attempt=0;
  constructor(catalog,stateDir=null){
    this.catalog=catalog;this.key=process.env.SOLAMI_API_KEY;
    this.stateFile=stateDir?path.join(stateDir,'observations.json'):null;this.recordedEvents=[];this.identities=new Map();this.pendingPools=new Set();this.inspections=new Map();this.sampleQueue=[];this.sampleStatus={running:false,done:0,queued:0};this.sessionStartedAt=Date.now();this.swapTimes=[];
    if(this.key){
      this.rpcUrl=`https://rpc.solami.dev/sol?api_key=${encodeURIComponent(this.key)}`;
      this.connection=new Connection(this.rpcUrl,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})});
      this.client=DynamicBondingCurveClient.create(this.connection,'confirmed');this.program=this.client.state.getProgram();
    }
  }
  async restore(){
    const saved=this.stateFile?await readJSON(this.stateFile):null;
    if(saved?.version===2){try{this.samples=new Map(saved.samples||[]);this.recordedEvents=(saved.events||[]).slice(0,1000);this.cache=new Map((saved.inspections||[]).slice(-100));this.identities=new Map((saved.identities||[]).slice(-500));}catch{this.samples.clear();this.recordedEvents=[];this.cache.clear();this.identities.clear();}}
    this.saveTimer=setInterval(()=>this.persist(),10000);this.saveTimer.unref();
    this.enrichTimer=setInterval(async()=>{if(this.enriching||!this.pendingPools.size||!this.key)return;const pool=this.pendingPools.values().next().value;this.pendingPools.delete(pool);this.enriching=true;try{await this.inspect(pool);}catch{}finally{this.enriching=false;}},5000);this.enrichTimer.unref();
  }
  async persist(){
    if(!this.stateFile||this.saving)return;this.saving=true;
    try{this.saveTask=writeJSON(this.stateFile,{version:2,savedAt:new Date().toISOString(),samples:[...this.samples],events:[...this.events,...this.recordedEvents].slice(0,1000),inspections:[...this.cache].slice(-100),identities:[...this.identities].slice(-500)});await this.saveTask;this.persistenceError=false;}catch{this.persistenceError=true;}finally{this.saving=false;}
  }
  async inspect(address){
    if(this.inspections.has(address))return this.inspections.get(address);
    const task=this.inspectFresh(address).catch(e=>{const old=this.cache.get(address);if(old?.value?.feeSchedule)return {...old.value,stale:true,unavailableReason:'Current RPC read failed; showing a previously saved account.',feeSchedule:{...old.value.feeSchedule,current:null}};throw e;}).finally(()=>this.inspections.delete(address));
    this.inspections.set(address,task);return task;
  }
  async rpc(method,params){
    if(!this.key)throw new ProviderError('Solami credentials are not configured.',503);
    try{const r=await fetch(this.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new ProviderError(`Solami returned HTTP ${r.status}.`,r.status===429?429:502);
      const j=await r.json();if(j.error)throw new ProviderError(`Solami RPC rejected ${method} (code ${j.error.code}).`);return j.result;
    }catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError('Solami could not be reached within the request window.');}
  }
  decode(data,names){for(const name of names){try{return this.program.coder.accounts.decode(name,data);}catch{}}return null;}
  async inspectFresh(address){
    if(!safeAddress(address))throw new ProviderError('Enter a valid Solana token, pool, or configuration address.',400);
    const cached=this.cache.get(address);if(cached&&Date.now()-cached.at<60000)return cached.value;
    if(!this.client)throw new ProviderError('Solami credentials are not configured. The saved atlas is still available.',503);
    let pub;try{pub=new PublicKey(address);}catch{throw new ProviderError('This is not a valid Solana public key.',400);}
    let account;try{account=await this.connection.getAccountInfo(pub);}catch{throw new ProviderError('Could not read this address from Solami RPC. Try again shortly.');}
    if(!account)throw new ProviderError('This address was not found on Solana mainnet.',404);
    let config=null,pool=null,poolAddress=null,configAddress=null,kind='configuration';
    if(account.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)){
      const raw=this.decode(account.data,['poolConfig','configWithTransferHook']);
      if(raw){config=raw.config||raw;configAddress=address;}
      else{pool=this.decode(account.data,['virtualPool','transferHookPool']);if(pool){poolAddress=address;kind='pool';}}
    }else if((account.owner.toBase58()==='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'&&account.data.length===82)||(account.owner.toBase58()==='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'&&(account.data.length===82||account.data[165]===1))){
      // Only a token-mint lookup is attempted; arbitrary wallets are never scanned.
      try{const found=await this.client.state.getPoolByBaseMint(pub);if(found){pool=found.account;poolAddress=found.publicKey.toBase58();kind='mint';}}catch{throw new ProviderError('The token-to-DBC-pool lookup is unavailable from the RPC. Try its pool or config address.');}
    }
    if(pool){const s=pool.poolState||pool;configAddress=s.config.toBase58();try{config=await this.client.state.getPoolConfig(configAddress);}catch{throw new ProviderError('The DBC pool was found, but its configuration could not be fetched.');}}
    if(!config)throw new ProviderError('No supported Meteora DBC pool or configuration was found for this address.',404);
    const row=compactConfig(config,configAddress),fp=fingerprint(row),id=fp.slice(0,16),g=this.catalog.detail(id),s=pool?(pool.poolState||pool):null;
    let progress=null;
    if(s&&BigInt(config.migrationQuoteThreshold.toString())>0n){progress=Math.min(100,Number(BigInt(s.quoteReserve.toString())*10000n/BigInt(config.migrationQuoteThreshold.toString()))/100);}
    let point=null;
    if(s){try{if(config.activationType===0)point=await this.connection.getSlot('confirmed');else{const slot=await this.connection.getSlot('confirmed');point=await this.connection.getBlockTime(slot);}}catch{}}
    const schedule=feeSchedule(config,s,point);
    const value={address,kind,configAddress,poolAddress,mint:s?.baseMint?.toBase58()||null,species:g?this.catalog.summary(g):null,fingerprint:fp,rules:row,clauses:fullClauses(config,row,schedule),feeSchedule:schedule,builder:builderExport(config,configAddress),baseline:this.catalog.baseline(row),fullConfig:normalize(config),poolState:s?normalize(s):null,progress,migratedFlag:s?Boolean(s.isMigrated):null,fetchedAt:new Date().toISOString(),stale:false,scope:'Species match covers indexed rules. Complete on-chain account is included separately.',source:'Solami mainnet RPC · Meteora DBC SDK'};
    if(poolAddress){this.identities.set(poolAddress,{speciesId:g?.id||null,rank:g?.rank||null,configAddress,fingerprint:fp,at:Date.now()});if(this.identities.size>500)this.identities.delete(this.identities.keys().next().value);}
    this.cache.set(address,{at:Date.now(),value});if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);return value;
  }
  async sample(id){
    const previous=this.samples.get(id);if(previous?.version===2&&Date.now()-Date.parse(previous.at)<(previous.partial||previous.status==='unavailable'?60000:24*3600000))return previous;
    const g=this.catalog.detail(id);if(!g)throw new ProviderError('Species not found.',404);
    const addresses=g.sampleConfigs||g.examples.slice(0,4),pools=[],reads=[];let hasMore=false;
    for(const configAddress of addresses){try{
      const disc=this.program.coder.accounts.memcmp('virtualPool');
      const result=await this.rpc('getProgramAccountsV2',[DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58(),{encoding:'base64',limit:12,filters:[{memcmp:{offset:disc.offset||0,bytes:disc.bytes}},{memcmp:{offset:72,bytes:configAddress}}]}]);
      const res=result?.value||result;if(!Array.isArray(res.accounts))throw new ProviderError('The RPC response did not contain a pool page.');
      let count=0;for(const a of res.accounts){const p=this.decode(Buffer.from(a.account.data[0],'base64'),['virtualPool']);if(!p)continue;const s=p.poolState||p;if(String(s.config)!==configAddress)continue;const address=String(a.pubkey);if(pools.some(p=>p.address===address))continue;pools.push({address,configAddress,mint:String(s.baseMint),migratedFlag:Boolean(s.isMigrated),migrationProgress:s.migrationProgress,quoteReserve:String(s.quoteReserve)});this.identities.set(address,{speciesId:id,rank:g.rank,configAddress,at:Date.now()});count++;}
      hasMore ||= Boolean(res.paginationKey);reads.push({configAddress,status:'read',poolsReturned:count,hasMore:Boolean(res.paginationKey)});
    }catch{reads.push({configAddress,status:'unavailable',poolsReturned:0});}}
    const succeeded=reads.filter(r=>r.status==='read').length;
    const sample={version:2,speciesId:id,configAddress:addresses[0],at:new Date().toISOString(),configAccountsAttempted:addresses.length,configAccountsSampled:succeeded,totalConfigsInSpecies:g.count,status:pools.length?'observed':succeeded?'empty':'unavailable',n:pools.length,migratedFlags:pools.filter(p=>p.migratedFlag).length,hasMore,pools,reads,partial:succeeded<addresses.length,limit:12,method:`Deterministic reservoir of up to 4 configuration addresses in this species; first RPC page of at most 12 standard pools per config. ${succeeded}/${addresses.length} config reads succeeded. Non-probability sample; transfer-hook pools excluded.`,note:'Migration flags are program state, not independently verified destination pools. No survival, inactivity, or species-wide graduation rate is inferred.'};
    this.samples.set(id,sample);await this.persist();return sample;
  }
  queueSample(id){if(!this.catalog.groups.has(id)||this.sampleQueue.includes(id)||this.sampleStatus.current===id)return;if(this.samples.get(id)?.version===2&&Date.now()-Date.parse(this.samples.get(id).at)<(this.samples.get(id).partial||this.samples.get(id).status==='unavailable'?60000:24*3600000))return;if(this.sampleQueue.length>=150)return;this.sampleQueue.push(id);this.sampleStatus.queued=this.sampleQueue.length;this.runSamples();}
  async runSamples(){if(this.sampleStatus.running||!this.key)return;this.sampleStatus.running=true;try{while(this.sampleQueue.length&&!this.stopping){const id=this.sampleQueue.shift();this.sampleStatus.current=id;this.sampleStatus.queued=this.sampleQueue.length;try{await this.sample(id);this.sampleStatus.done++;}catch{this.sampleStatus.failed=(this.sampleStatus.failed||0)+1;}}}finally{this.sampleStatus.current=null;this.sampleStatus.running=false;}}
  outcomeSummary(){const samples=[...this.samples.values()].filter(s=>s.version===2);return {job:this.sampleStatus,speciesSampled:samples.length,configsAttempted:samples.reduce((n,s)=>n+s.configAccountsAttempted,0),configsRead:samples.reduce((n,s)=>n+s.configAccountsSampled,0),pools:samples.reduce((n,s)=>n+s.n,0),migrationFlags:samples.reduce((n,s)=>n+s.migratedFlags,0),partial:samples.some(s=>s.partial),method:'Top 125 indexed species at startup, up to 4 configs and 12 standard pools per config. Additional species sampled on request. No population-rate inference.'};}
  startLive(){
    if(!this.key){this.live.state='unavailable';this.live.reason='Solami credentials are not configured.';return;}
    this.live.state='connecting';
    const url=`wss://ws.solami.dev/data/subscribe?chain=solana&api_key=${encodeURIComponent(this.key)}&dex=meteora_dbc&type=swap,token_update,token_create,pool_create,meme,graduation`;
    const ws=new WebSocket(url,{handshakeTimeout:12000,maxPayload:4*1024*1024});this.ws=ws;
    let alive=true;const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;if(ws.readyState===WebSocket.OPEN)ws.ping();},30000);heartbeat.unref();ws.on('pong',()=>{alive=true;});
    ws.on('open',()=>{this.live.state='connected';this.live.reason=null;this.live.connectedAt=Date.now();this.attempt=0;});
    ws.on('message',raw=>{this.live.lastMessageAt=Date.now();let m;try{m=JSON.parse(raw.toString());}catch{return;}
      if(!m||typeof m!=='object')return;
      if(m.type==='connected'){this.live.region=typeof m.region==='string'?m.region.slice(0,30):null;return;}
      for(const e of Array.isArray(m)?m:Array.isArray(m.events)?m.events:[m]){
        const clean=sanitizeEvent(e);if(!clean){this.live.discarded++;continue;}
        clean.id=`${clean.receivedAt}-${++this.eventSerial}`;
        this.events.unshift(clean);if(this.events.length>300)this.events.pop();this.live.lastEventAt=clean.receivedAt;
        if(clean.type==='swap')this.swapTimes.push(clean.receivedAt);
        this.swapTimes=this.swapTimes.filter(t=>Date.now()-t<3600000);
        if(clean.pool&&!this.identities.has(clean.pool)&&this.pendingPools.size<24)this.pendingPools.add(clean.pool);
      }
    });
    ws.on('error',()=>{this.live.reason='Live stream unavailable; reconnecting. Saved census remains available.';});
    ws.on('close',()=>{clearInterval(heartbeat);this.live.state='reconnecting';if(!this.stopping)this.retry=setTimeout(()=>this.startLive(),Math.min(60000,3000*2**Math.min(this.attempt++,5)));});
  }
  liveSnapshot(){return {...this.live,state:this.live.state==='connected'&&Date.now()-(this.live.lastMessageAt||this.live.connectedAt)>90000?'quiet':this.live.state,events:this.events.map(e=>({...e,identity:this.identities.get(e.pool)||null})),retained:this.events.length,swapsObservedLastHour:this.swapTimes.filter(t=>Date.now()-t<3600000).length,coverageStart:Math.max(this.sessionStartedAt,Date.now()-3600000),scope:'Observed during this connection session; reconnect gaps may exist. Up to 300 recent rows.',now:Date.now()};}
  replay(){return {label:'RECORDED — not live',events:this.recordedEvents.slice(0,100),notice:'Saved observations from previous server sessions, shown separately from current live events.'};}
  async stop(){this.stopping=true;clearTimeout(this.retry);clearInterval(this.saveTimer);clearInterval(this.enrichTimer);this.ws?.close();await this.saveTask?.catch(()=>{});return this.persist();}
  async panta(){
    const key=process.env.PANTA_LIVE_API_KEY||process.env.PANTA_API_KEY;if(!key)return {status:'not-configured',markets:[],message:'Create a key in the Panta playground API keys tab.'};
    if(this.pantaCache&&Date.now()-this.pantaCache.at<120000)return this.pantaCache.value;
    try{
      const response=await fetch('https://live-api.panta.market/api/v1/markets/?limit=20',{headers:{'X-Api-Key':key},signal:AbortSignal.timeout(15000)});
      if(!response.ok)return {status:'unavailable',httpStatus:response.status,markets:[],message:`Panta catalog returned HTTP ${response.status}.`};
      const j=await response.json();const arr=Array.isArray(j)?j:Array.isArray(j.items)?j.items:Array.isArray(j.results)?j.results:Array.isArray(j.markets)?j.markets:Array.isArray(j.data)?j.data:null;
      if(!arr)return {status:'unknown-schema',markets:[],message:'The catalog response needs a schema update.',keys:Object.keys(j)};
      // No arbitrary URLs or HTML, no wallet details or credential echoes.
      const markets=arr.slice(0,20).map(m=>({id:String(m.marketId||m.id||m.market_id||'').slice(0,100),question:String(m.question||m.title||'Untitled market').slice(0,300),status:String(m.status||m.phase||'unknown').slice(0,40),address:safeAddress(m.address||m.market_address)?m.address||m.market_address:null,tokenAddress:safeAddress(m.token_mint||m.mint)?m.token_mint||m.mint:null}));
      const value={status:'connected',markets,countReturned:markets.length,at:new Date().toISOString(),gate:'unproven',credentialKind:process.env.PANTA_LIVE_API_KEY?'live':'test',message:'Read-only catalog access verified. A token-linked, mechanically resolved DBC market has not been established. Panta remains an optional evaluation, not a claimed outcome integration.',attribution:'Powered by Panta'};this.pantaCache={at:Date.now(),value};return value;
    }catch{return {status:'unavailable',markets:[],message:'Panta did not respond within the request window.'};}
  }
}
