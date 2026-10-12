import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { canonical,fingerprint,traits,ruleRows,LEGACY_FIELDS,diff } from './domain.mjs';
import { readJSON,writeJSON } from './storage.mjs';

export class Catalog {
  groups=new Map(); addresses=new Map(); ordered=[]; state='loading'; loaded=0; census=null;
  constructor(source,bundle=null){this.source=source;this.bundle=bundle;}
  async load(){
    const legacy=new Map(); let locked=0,decay=0;
    try{
      const stat=await fs.promises.stat(this.source).catch(()=>null);
      const saved=this.bundle?await readJSON(this.bundle,true):null;
      if(saved?.version===1&&saved.census?.schema==='compact-rules-v2'&&(!stat||(saved.sourceSize===stat.size&&saved.census.snapshotAt===stat.mtime.toISOString()))){
        try{this.ordered=saved.groups;this.groups=new Map(saved.groups.map(g=>[g.id,g]));this.addresses=new Map(saved.addresses);this.census=saved.census;this.loaded=this.census.configs;
        if(this.groups.size!==this.census.species||this.addresses.size!==this.loaded||this.ordered.reduce((n,g)=>n+g.count,0)!==this.loaded||this.ordered.some(g=>fingerprint(g.rules)!==g.fingerprint||g.id!==g.fingerprint.slice(0,16))||[...this.addresses.values()].some(id=>!this.groups.has(id)))throw Error('Invalid census bundle');
        this.state='ready';this.loadedFrom='portable bundle';return;
        }catch{this.ordered=[];this.groups.clear();this.addresses.clear();this.census=null;this.loaded=0;}
      }
      if(!stat)throw Error('Snapshot missing');
      const lines=readline.createInterface({input:fs.createReadStream(this.source),crlfDelay:Infinity});
      for await(const line of lines){if(!line.trim())continue;const row=JSON.parse(line),hash=fingerprint(row),id=hash.slice(0,16);
        if(this.addresses.has(row.key)) throw new Error('Duplicate configuration in snapshot');
        this.addresses.set(row.key,id);let g=this.groups.get(id);
        if(g&&g.fingerprint!==hash)throw new Error('Fingerprint ID collision');
        if(!g){g={id,fingerprint:hash,rules:canonical(row),count:0,examples:[],traits:traits(row)};this.groups.set(id,g);}
        g.count++; if(g.examples.length<24)g.examples.push(row.key);
        // Deterministic reservoir spreads the bounded outcome sample throughout
        // each species instead of taking only the first page of addresses.
        g.sampleConfigs??=[];if(g.sampleConfigs.length<4)g.sampleConfigs.push(row.key);
        else{let h=2166136261;for(const ch of row.key)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;const j=h%g.count;if(j<4)g.sampleConfigs[j]=row.key;}
        const old=LEGACY_FIELDS.map(k=>row[k]).join('|');legacy.set(old,(legacy.get(old)||0)+1);
        this.loaded++; if(g.traits.locked>0)locked++;if(g.traits.decay)decay++;
      }
      this.ordered=[...this.groups.values()].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
      this.ordered.forEach((g,i)=>{g.rank=i+1;g.share=g.count/this.loaded*100;});
      const single=this.ordered.filter(x=>x.count===1).length;
      let n75=0,covered=0;while(covered<this.loaded*.75&&n75<this.ordered.length)covered+=this.ordered[n75++].count;
      this.census={configs:this.loaded,species:this.groups.size,singleUse:single,singleUsePct:single/this.groups.size*100,cover75Count:n75,cover75Pct:covered/this.loaded*100,
        legacySpecies:legacy.size,legacySingleUse:[...legacy.values()].filter(n=>n===1).length,anyLockedPct:locked/this.loaded*100,decayPct:decay/this.loaded*100,
        snapshotAt:stat.mtime.toISOString(),schema:'compact-rules-v2',scope:'Identical indexed rules; not a complete account fingerprint.',source:'Solami RPC → Meteora DBC poolConfig accounts',sourceFile:path.basename(this.source),
        distribution:[{label:'1 config',min:1,max:1},{label:'2–9',min:2,max:9},{label:'10–99',min:10,max:99},{label:'100–999',min:100,max:999},{label:'1,000+',min:1000,max:Infinity}].map(b=>({label:b.label,species:this.ordered.filter(x=>x.count>=b.min&&x.count<=b.max).length,configs:this.ordered.filter(x=>x.count>=b.min&&x.count<=b.max).reduce((a,x)=>a+x.count,0)}))};
      this.state='ready';this.loadedFrom='raw snapshot';
      if(this.bundle)try{await writeJSON(this.bundle,{version:1,sourceSize:stat.size,census:this.census,groups:this.ordered,addresses:[...this.addresses]},true);}catch{this.persistenceError=true;}
      console.log(`Census ready: ${this.loaded} configs, ${this.groups.size} indexed species (${legacy.size} historical profiles).`);
    }catch{this.state='unavailable';console.error('Census unavailable: check SPECIES_DATA_PATH and the compact snapshot format.');}
  }
  summary(g){return {id:g.id,rank:g.rank,count:g.count,share:g.share,traits:g.traits,rules:g.rules,example:g.examples[0]};}
  baseline(row,preferred=null){
    const candidates=preferred?[this.groups.get(preferred)].filter(Boolean):this.ordered.slice(0,this.census.cover75Count).filter(g=>g.rules.quote===row.quote&&g.rules.migration===row.migration);
    const found=candidates.map(g=>({g,changes:diff(g.rules,row)})).sort((a,b)=>a.changes.length-b.changes.length||b.g.count-a.g.count)[0];
    return found?{species:this.summary(found.g),differences:found.changes,method:preferred?'Explicit comparison profile.':'Fewest differing indexed fields among prevalent species covering 75% of saved configs, with the same quote and migration destination. Ties use prevalence.',notice:'A comparison baseline does not change this configuration’s exact indexed species.'}:null;
  }
  detail(id){const g=this.groups.get(id);return g?{...g,clauses:ruleRows(g.rules),snapshotAt:this.census.snapshotAt,scope:this.census.scope,schema:this.census.schema}:null;}
  list(params){
    const q=(params.get('q')||'').trim().toLowerCase(),quote=params.get('quote'),fee=params.get('fee'),lock=params.get('lock'),migration=params.get('migration');
    const page=Math.max(1,Math.min(100000,parseInt(params.get('page')||'1')||1)),limit=Math.max(1,Math.min(48,parseInt(params.get('limit')||'12')||12));
    const addressMatch=this.addresses.get(params.get('q'));
    let rows=this.ordered.filter(g=>(!q||g.id.startsWith(q)||String(g.rank)===q||g.id===addressMatch||`${g.traits.quote} ${g.traits.migration}`.toLowerCase().includes(q))&&(!quote||g.traits.quote===quote)&&(!fee||(fee==='decay'?g.traits.decay:fee==='dynamic'?g.traits.dynamic:!g.traits.decay&&!g.traits.dynamic))&&(!lock||(lock==='all'?g.traits.locked===100:lock==='some'?g.traits.locked>0:g.traits.locked===0))&&(!migration||String(g.rules.migration)===migration));
    if(params.get('sort')==='least')rows=rows.slice().reverse();
    return {items:rows.slice((page-1)*limit,page*limit).map(g=>this.summary(g)),total:rows.length,page,pages:Math.ceil(rows.length/limit),limit};
  }
}
