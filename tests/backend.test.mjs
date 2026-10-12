import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import BN from 'bn.js';
import {feeSchedule,builderExport} from '../server/evidence.mjs';
import {Catalog} from '../server/catalog.mjs';
import {Providers} from '../server/providers.mjs';
import {readJSON,writeJSON} from '../server/storage.mjs';
import {SOL} from '../server/domain.mjs';
import {Connection} from '@solana/web3.js';
import {DynamicBondingCurveClient} from '@meteora-ag/dynamic-bonding-curve-sdk';

const config=(overrides={})=>({activationType:1,poolFees:{baseFee:{cliffFeeNumerator:new BN(50000000),firstFactor:10,secondFactor:new BN(30),thirdFactor:new BN(4000000),baseFeeMode:0,...overrides},dynamicFee:{initialized:1}}});
test('SDK fee schedule preserves steps, activation boundary and final rate',()=>{
  const c=config(),s=feeSchedule(c,{activationPoint:new BN(100)},new BN(145));
  assert.equal(s.points[0].feePct,5);assert.equal(s.points.at(-1).feePct,1);
  assert.equal(s.current.feePct,4.6);assert.equal(s.current.nextChangeIn,'15');
  assert.equal(feeSchedule(c,{activationPoint:100},99).current.beforeActivation,true);
  assert.equal(feeSchedule(c,{activationPoint:100},1000).current.feePct,1);
  assert.equal(feeSchedule(c).current,null);
  assert.equal(feeSchedule({...c,activationType:0}).unit,'slots');
});
test('fixed, exponential and unsupported schedules are distinguished',()=>{
  assert.equal(feeSchedule(config({secondFactor:new BN(0)})).status,'fixed');
  const s=feeSchedule(config({baseFeeMode:1,thirdFactor:new BN(1000)}));
  assert.equal(s.shape,'exponential');assert.ok(Math.abs(s.points[1].feePct-4.5)<.000001);
  assert.equal(feeSchedule(config({baseFeeMode:2})).status,'unsupported');
});
test('portable census works without source and rejects corrupted identity',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'species-test-'));
  const source=path.join(dir,'source.jsonl'),bundle=path.join(dir,'census.json.gz');
  await fs.writeFile(source,[{key:'config-a',quote:SOL,startFeeBps:100},{key:'config-b',quote:SOL,startFeeBps:100},{key:'config-c',quote:SOL,startFeeBps:200}].map(JSON.stringify).join('\n'));
  const first=new Catalog(source,bundle);await first.load();assert.equal(first.state,'ready');
  const restored=new Catalog(path.join(dir,'missing.jsonl'),bundle);await restored.load();
  assert.equal(restored.state,'ready');assert.equal(restored.loadedFrom,'portable bundle');assert.equal(restored.census.configs,3);
  assert.equal(restored.baseline(restored.ordered[0].rules).differences.length,0);
  const saved=await readJSON(bundle,true);saved.groups[0].fingerprint='bad';await writeJSON(bundle,saved,true);
  const fallback=new Catalog(source,bundle);await fallback.load();assert.equal(fallback.state,'ready');assert.equal(fallback.loadedFrom,'raw snapshot');
  await fs.writeFile(bundle,'invalid gzip');assert.equal(await readJSON(bundle,true),null);
  // Only this test's fixed temporary files are removed; no recursive deletion.
  await fs.unlink(source);await fs.unlink(bundle);await fs.rmdir(dir);
});
test('inspection coalesces concurrent reads and labels cached fallback stale',async()=>{
  const p=new Providers({});let calls=0;let release;
  p.inspectFresh=async()=>{calls++;await new Promise(r=>release=r);return {address:'same'};};
  const a=p.inspect('same'),b=p.inspect('same');release();assert.deepEqual(await a,await b);assert.equal(calls,1);
  p.cache.set('same',{value:{fetchedAt:'old',feeSchedule:{current:{feePct:2}}}});
  p.inspectFresh=async()=>{throw Error('RPC offline');};
  const stale=await p.inspect('same');assert.equal(stale.stale,true);assert.equal(stale.feeSchedule.current,null);
});
test('persisted events cannot masquerade as current live observations',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'species-replay-'));
  const p=new Providers({},dir);p.events=[{id:'recorded',receivedAt:123,type:'swap'}];await p.persist();
  const q=new Providers({},dir);await q.restore();
  assert.equal(q.liveSnapshot().events.length,0);assert.equal(q.replay().events.length,1);assert.match(q.replay().label,/not live/);
  await q.stop();await fs.unlink(path.join(dir,'observations.json'));await fs.rmdir(dir);
});
test('real-account builder export passes SDK encoding without losing integers or copying recipients',async()=>{
  const c=JSON.parse(await fs.readFile(new URL('./fixtures/fee-config.json',import.meta.url),'utf8'));
  const b=builderExport(c,'1QigotGJrKQXnrisRceoUmDBA8ontDXU9Mrotmmq6bR');assert.equal(b.status,'validated');
  assert.ok(!('feeClaimer' in b.parameters));assert.ok(!('leftoverReceiver' in b.parameters));
  const typed=structuredClone(b.parameters);for(const p of b.bnPaths){let o=typed;for(const k of p.slice(0,-1))o=o[k];o[p.at(-1)]=new BN(o[p.at(-1)]);}
  const coder=DynamicBondingCurveClient.create(new Connection('http://127.0.0.1:4173'),'confirmed').state.getProgram().coder;
  const encoded=coder.types.encode('configParameters',typed),decoded=coder.types.decode('configParameters',encoded);
  assert.equal(decoded.curve[0].liquidity.toString(),c.curve[0].liquidity);
  c.poolFees.baseFee.baseFeeMode=2;assert.equal(builderExport(c,'historical').status,'historical');
});
test('partial pool joins report successful config denominators and omit foreign pools',async()=>{
  const id='sample',catalog={detail:()=>({count:80,rank:1,sampleConfigs:['a','b']})},p=new Providers(catalog);
  p.program={coder:{accounts:{memcmp:()=>({offset:0,bytes:'disc'})}}};
  p.rpc=async(_,args)=>{if(args[1].filters[1].memcmp.bytes==='b')throw Error('unavailable');return {accounts:[{pubkey:'pool-a',account:{data:['AA==']}},{pubkey:'foreign',account:{data:['AQ==']}}],paginationKey:'next'};};
  p.decode=buffer=>({config:buffer[0]===0?'a':'foreign-config',baseMint:'mint',isMigrated:1,quoteReserve:'100',migrationProgress:2});
  const s=await p.sample(id);assert.equal(s.n,1);assert.equal(s.configAccountsAttempted,2);assert.equal(s.configAccountsSampled,1);assert.equal(s.partial,true);assert.equal(s.hasMore,true);assert.equal(s.migratedFlags,1);
});
