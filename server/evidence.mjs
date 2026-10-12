import BN from 'bn.js';
import {DynamicBondingCurveIdl, getBaseFeeNumeratorByPeriod, validateConfigParameters} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {PublicKey} from '@solana/web3.js';
import {normalize,ruleRows,units} from './domain.mjs';
const bn=v=>new BN(String(v));
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());

export function feeSchedule(config,pool=null,chainPoint=null){
  const b=config.poolFees.baseFee,mode=Number(b.baseFeeMode),n=Number(b.firstFactor),freq=bn(b.secondFactor),cliff=bn(b.cliffFeeNumerator),reduction=bn(b.thirdFactor);
  const base={mode,unit:config.activationType===0?'slots':'seconds',dynamic:Boolean(config.poolFees.dynamicFee.initialized),activationPoint:pool?.activationPoint?.toString()||null,clock:chainPoint?.toString()||null,source:'poolFees.baseFee · activationType · pool.activationPoint',notice:'Configured base fee only. Dynamic fees and first-swap exceptions can change an observed total fee.'};
  if(![0,1].includes(mode))return {...base,status:'unsupported',points:[],description:'Rate-limited or unsupported fee mode; a time-decay chart would be misleading.'};
  try{
    const fixed=freq.isZero()||n===0||reduction.isZero(),count=fixed?0:n;
    const indices=[...new Set(Array.from({length:Math.min(count,120)+1},(_,i)=>count?Math.round(i*count/Math.min(count,120)):0))];
    const points=indices.map(i=>({period:i,offset:freq.muln(i).toString(),feePct:getBaseFeeNumeratorByPeriod(cliff,n,new BN(i),reduction,mode).toNumber()/1e7}));
    let current=null;
    if(pool?.activationPoint!=null&&chainPoint!=null){
      const start=bn(pool.activationPoint),clock=bn(chainPoint),elapsed=BN.max(new BN(0),clock.sub(start)),period=fixed?0:Math.min(n,elapsed.div(freq).toNumber());
      const remaining=clock.lt(start)?start.sub(clock):(!fixed&&period<n?start.add(freq.muln(period+1)).sub(clock):null);
      current={period,feePct:getBaseFeeNumeratorByPeriod(cliff,n,new BN(period),reduction,mode).toNumber()/1e7,offset:elapsed.toString(),beforeActivation:clock.lt(start),nextChangeIn:remaining?.toString()||null};
    }
    return {...base,status:fixed?'fixed':'scheduled',shape:mode===0?'linear':'exponential',periods:count,sampled:count>120,frequency:freq.toString(),duration:freq.muln(count).toString(),points,current,description:fixed?`Base fee is fixed at ${points[0].feePct}%.`:`Base fee starts at ${points[0].feePct}%, then decreases ${mode===0?'linearly':'exponentially'} to ${points.at(-1).feePct}% over ${count} steps, every ${freq} ${base.unit}.`};
  }catch{return {...base,status:'unsupported',points:[],description:'The fee schedule could not be computed safely from these fields.'};}
}
export function fullClauses(config,row,schedule){
  const c=normalize(config),rows=ruleRows(row);rows[0].detail=schedule.description;
  for(const r of rows)for(const citation of r.citations){const fields=citation.field.split(' / ');citation.raw=fields.length>1?Object.fromEntries(fields.map(f=>[f,c[f]])):citation.field.split('.').reduce((o,k)=>o?.[k],c);}
  const extra=(label,value,detail,fields)=>({label,value,detail,citations:fields.map(field=>({key:field,field,raw:field.split('.').reduce((o,k)=>o?.[k],c)}))});
  return [...rows,
    extra('Token supply',c.fixedTokenSupplyFlag?'Fixed supply configured':'Supply from curve',`Before migration: ${units(c.preMigrationTokenSupply,c.tokenDecimal)??'unknown'} tokens. After migration: ${units(c.postMigrationTokenSupply,c.tokenDecimal)??'unknown'} tokens.`,['fixedTokenSupplyFlag','preMigrationTokenSupply','postMigrationTokenSupply','tokenDecimal']),
    extra('Activation & token program',`${c.activationType===0?'Slot':'Timestamp'} activation · ${c.tokenType===0?'SPL Token':'Token-2022'}`,'Schedule durations follow this activation unit; slots are not converted to estimated seconds.',['activationType','tokenType']),
    extra('Token vesting schedule',`${c.lockedVestingConfig.numberOfPeriod} periods`,`Cliff unlock: ${units(c.lockedVestingConfig.cliffUnlockAmount,c.tokenDecimal)} tokens; ${units(c.lockedVestingConfig.amountPerPeriod,c.tokenDecimal)} per period. Frequency ${c.lockedVestingConfig.frequency} seconds; cliff ${c.lockedVestingConfig.cliffDurationFromMigrationTime} seconds after migration.`,['lockedVestingConfig']),
    extra('Migration & creation charges',`${c.migrationFeePercentage}% migration fee`,`Creator share of migration fee: ${c.creatorMigrationFeePercentage}%. Configured pool-creation fee: ${units(c.poolCreationFee,9)} SOL.`,['migrationFeePercentage','creatorMigrationFeePercentage','poolCreationFee']),
    extra('Unlocked LP distribution',`Partner ${c.partnerLiquidityPercentage}% · Creator ${c.creatorLiquidityPercentage}%`,'These configured allocations are separate from the permanently locked allocations above. Vesting schedules may apply.',['partnerLiquidityPercentage','creatorLiquidityPercentage','partnerLiquidityVestingInfo','creatorLiquidityVestingInfo']),
    extra('Curve & collection mode',`${c.curve.filter(p=>p.liquidity!=='0').length} active curve segments`,`Fees collected in ${c.collectFeeMode===0?'quote token':c.collectFeeMode===1?'the swap output token':'mode '+c.collectFeeMode}. Complete sqrt-price and liquidity values are preserved in the account and SDK exports.`,['collectFeeMode','sqrtStartPrice','curve'])
  ];
}

// Project the observed account into the SDK's creation-parameter schema. Recipient
// addresses and signers remain a builder choice, never inherited silently.
export function builderExport(config,address){
  const c=normalize(config),paths=[];
  const bytes=Buffer.from(c.migratedPoolBaseFeeBytes||Array(16).fill(0));
  const mapped={...c,poolFees:{...c.poolFees,dynamicFee:c.poolFees.dynamicFee.initialized?c.poolFees.dynamicFee:null},lockedVesting:c.lockedVestingConfig,
    tokenSupply:c.fixedTokenSupplyFlag?{preMigrationTokenSupply:c.preMigrationTokenSupply,postMigrationTokenSupply:c.postMigrationTokenSupply}:null,
    migrationFee:{feePercentage:c.migrationFeePercentage,creatorFeePercentage:c.creatorMigrationFeePercentage},
    migratedPoolFee:{collectFeeMode:c.migratedCollectFeeMode,dynamicFee:c.migratedDynamicFee,poolFeeBps:c.migratedPoolFeeBps},
    migratedPoolMarketCapFeeSchedulerParams:{numberOfPeriod:bytes.readUInt16LE(0),sqrtPriceStepBps:bytes.readUInt16LE(2),schedulerExpirationDuration:bytes.readUInt32LE(4),reductionFactor:bytes.readBigUInt64LE(8).toString()},
    enableFirstSwapWithMinFee:Boolean(c.enableFirstSwapWithMinFee),compoundingFeeBps:c.migratedCompoundingFeeBps,padding:[0,0],curve:c.curve.filter(p=>p.liquidity!=='0')};
  function project(type,v,p=[]){
    if(typeof type==='string'){if(v==null)throw Error('Missing field');if(['u64','u128','i64','i128'].includes(type)){paths.push(p);return String(v);}return v;}
    if(type.option)return v==null?null:project(type.option,v,p);
    if(type.vec)return v.map((x,i)=>project(type.vec,x,[...p,i]));
    if(type.array)return v.map((x,i)=>project(type.array[0],x,[...p,i]));
    const fields=DynamicBondingCurveIdl.types.find(t=>t.name===type.defined.name).type.fields;
    return Object.fromEntries(fields.map(f=>{const k=camel(f.name);return [k,project(f.type,v?.[k],[...p,k])];}));
  }
  try{
    const parameters=project({defined:{name:'ConfigParameters'}},mapped);
    const typed=structuredClone(parameters);for(const p of paths){let o=typed;for(const k of p.slice(0,-1))o=o[k];o[p.at(-1)]=bn(o[p.at(-1)]);}
    let valid=true;try{validateConfigParameters({...typed,leftoverReceiver:new PublicKey(c.leftoverReceiver)});}catch{valid=false;}
    const snippet=`// Observed Meteora DBC rules from ${address}\n// SDK 1.5.13. No signing, transaction construction, or broadcast.\nimport BN from 'bn.js';\nimport type { ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk';\nconst raw = ${JSON.stringify(parameters,null,2)};\nconst bnPaths = ${JSON.stringify(paths)};\nconst hydrated: any = structuredClone(raw);\nfor (const path of bnPaths) {\n  let parent = hydrated;\n  for (const key of path.slice(0, -1)) parent = parent[key];\n  const key = path[path.length - 1];\n  parent[key] = new BN(parent[key]);\n}\nexport const configParameters: ConfigParameters = hydrated;\n// Choose your own quote mint, payer, config keypair, fee claimer, and leftover receiver.\n// Validate with the current SDK before separately constructing any transaction.\n`;
    return {status:valid?'validated':'historical',parameters,bnPaths:paths,snippet,sdk:'1.5.13',sourceConfig:address,validation:valid?'Accepted by SDK parameter validation; not a transaction simulation.':'Historical account mapped, but current SDK creation validation rejects it. Do not reuse unchanged.',notice:'Observed parameters only. Choose recipients and authorities deliberately; no wallet or transaction is included.'};
  }catch{return {status:'unavailable',sourceConfig:address,validation:'This account cannot be mapped completely to the supported SDK creation schema.',snippet:null};}
}
