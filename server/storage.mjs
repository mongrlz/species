import fs from 'node:fs/promises';
import path from 'node:path';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
const zip=promisify(gzip),unzip=promisify(gunzip);
export async function readJSON(file,compressed=false){try{const b=await fs.readFile(file);return JSON.parse(compressed?await unzip(b):b.toString());}catch{return null;}}
export async function writeJSON(file,value,compressed=false){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=`${file}.${process.pid}.tmp`,data=JSON.stringify(value);
  await fs.writeFile(tmp,compressed?await zip(data):data);await fs.rename(tmp,file);
}
