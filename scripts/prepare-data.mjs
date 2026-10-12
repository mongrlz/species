import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Catalog} from '../server/catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env'));}catch{}
const catalog=new Catalog(process.env.SPECIES_DATA_PATH||path.resolve(root,"../Coliseum World's Fair/research/probe/dbc/configs.compact.jsonl"),path.join(root,'data','census.json.gz'));
await catalog.load();
if(catalog.state!=='ready'||catalog.persistenceError){console.error('Census bundle could not be prepared. Check source location and data-folder permissions.');process.exitCode=1;}
else console.log(`Portable census ready: ${catalog.loaded} configuration accounts. Include data/census.json.gz when moving this local app; never include .env.`);
