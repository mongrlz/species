import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Catalog } from './catalog.mjs';
import { Providers, ProviderError } from './providers.mjs';
import { diff } from './domain.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env'));}catch{}
const dataPath=process.env.SPECIES_DATA_PATH||path.resolve(root,"../Coliseum World's Fair/research/probe/dbc/configs.compact.jsonl");
const catalog=new Catalog(dataPath,path.join(root,'data','census.json.gz')),providers=new Providers(catalog,path.join(root,'data'));
const production=process.argv.includes('--production');
const vite=production?null:await (await import('vite')).createServer({root,server:{middlewareMode:true,hmr:false},appType:'spa'});
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
let inFlight=0;const recent=new Map();
const server=http.createServer(async(req,res)=>{
  const allowedHost=/^(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if(!allowedHost.test(req.headers.host||''))return json(res,{error:'Localhost access only.'},403);
  if(req.headers.origin){try{if(!allowedHost.test(new URL(req.headers.origin).host))return json(res,{error:'Cross-site access is not supported.'},403);}catch{return json(res,{error:'Invalid origin.'},403);}}
  let url,p;
  try{url=new URL(req.url,'http://localhost');p=url.pathname;decodeURIComponent(p);}catch{return json(res,{error:'Invalid request path.'},400);}
  if(decodeURIComponent(p).split('/').some(segment=>segment.startsWith('.')))return json(res,{error:'Not found.'},404);
  if(p.startsWith('/api/')){
    if(req.method!=='GET')return json(res,{error:'Only read-only GET requests are supported.'},405);
    try{
      if(p==='/api/health')return json(res,{catalog:catalog.state,loaded:catalog.loaded,loadedFrom:catalog.loadedFrom,persistenceError:Boolean(providers.persistenceError||catalog.persistenceError),solamiConfigured:Boolean(providers.key),pantaConfigured:Boolean(process.env.PANTA_API_KEY||process.env.PANTA_LIVE_API_KEY)});
      if(p==='/api/live')return json(res,providers.liveSnapshot());
      if(p==='/api/replay')return json(res,providers.replay());
      if(p==='/api/outcomes')return json(res,providers.outcomeSummary());
      if(p==='/api/panta')return json(res,await providers.panta());
      if(catalog.state!=='ready')return json(res,{error:catalog.state==='loading'?'The saved census is loading. Try again in a moment.':'The saved census is unavailable.',state:catalog.state,loaded:catalog.loaded},503);
      if(p==='/api/census')return json(res,catalog.census);
      if(p==='/api/species')return json(res,catalog.list(url.searchParams));
      if(p==='/api/compare'){
        const a=catalog.detail(url.searchParams.get('a')),b=catalog.detail(url.searchParams.get('b'));if(!a||!b)throw new ProviderError('Choose two species from the atlas.',404);
        return json(res,{a,b,differences:diff(a.rules,b.rules)});
      }
      const match=p.match(/^\/api\/species\/([a-f0-9]{16})(?:\/(export|outcomes))?$/);
      if(match){const item=catalog.detail(match[1]);if(!item)throw new ProviderError('Species not found.',404);
        if(match[2]==='export'){res.setHeader('Content-Disposition',`attachment; filename="species-${item.id}.json"`);return json(res,{schema:item.schema,speciesId:item.id,fingerprint:item.fingerprint,scope:item.scope,configCount:item.count,indexedRules:item.rules,exampleConfigAddresses:item.examples,snapshotAt:item.snapshotAt,notice:'Indexed observations, not an SDK-ready creation payload. Fetch a full config via the inspector for all fields.'});}
        if(match[2]==='outcomes'){providers.queueSample(item.id);return json(res,providers.samples.get(item.id)||{status:'pending',n:0,pools:[],note:'A bounded sample is queued. It may take several minutes to reach this species.'});}
        return json(res,item);
      }
      if(p.startsWith('/api/inspect/')){
        const now=Date.now();for(const [k,v]of recent)if(now-v>60000)recent.delete(k);
        if(inFlight>=3||recent.size>=30)throw new ProviderError('Inspection request limit reached. Please wait a minute.',429);
        recent.set(`${now}-${Math.random()}`,now);inFlight++;try{return json(res,await providers.inspect(decodeURIComponent(p.slice(13))));}finally{inFlight--;}
      }
      return json(res,{error:'Endpoint not found.'},404);
    }catch(e){return json(res,{error:e instanceof ProviderError?e.message:'The request could not be completed. Please try again.'},e instanceof ProviderError?e.status:500);}
  }
  if(vite)return vite.middlewares(req,res);
  const dist=path.join(root,'dist');let file=path.resolve(dist,'.'+decodeURIComponent(p));
  if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403);return res.end();}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(dist,'index.html');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime});fs.createReadStream(file).pipe(res);
});
const port=Number(process.env.PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log(`Plainchain Species: http://localhost:${port}`));
catalog.load().then(async()=>{
  if(catalog.state!=='ready')return;
  await providers.restore();
  providers.startLive();
  for(const g of catalog.ordered.slice(0,125))providers.queueSample(g.id);
});
process.on('SIGINT',async()=>{await providers.stop();server.close();await vite?.close();process.exit(0);});
