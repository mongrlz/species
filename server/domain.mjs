import { createHash } from 'node:crypto';

export const SOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// v2 includes every rule field retained by the original compact crawl. Recipient
// identities are excluded. This is deliberately NOT a full account fingerprint.
export const FIELDS = ['quote','startFeeBps','feeMode','periods','freq','reduction','dynamicFee','migration','migQuote','migFeeOpt','partnerLp','partnerLocked','creatorLp','creatorLocked','lpVest','tokenVestPeriods','creatorTradingFeePct','tokenType','activation','migratedFeeBps','curveHash'];
export const LEGACY_FIELDS = ['quote','startFeeBps','feeMode','periods','freq','reduction','dynamicFee','migration','migQuote','partnerLp','partnerLocked','creatorLp','creatorLocked','lpVest','tokenVestPeriods','creatorTradingFeePct','curveHash'];
export const CITATIONS = {quote:'quoteMint',startFeeBps:'poolFees.baseFee.cliffFeeNumerator',feeMode:'poolFees.baseFee.baseFeeMode',periods:'poolFees.baseFee.firstFactor',freq:'poolFees.baseFee.secondFactor',reduction:'poolFees.baseFee.thirdFactor',dynamicFee:'poolFees.dynamicFee.initialized',migration:'migrationOption',migQuote:'migrationQuoteThreshold',migFeeOpt:'migrationFeeOption',partnerLp:'partnerLiquidityPercentage',partnerLocked:'partnerPermanentLockedLiquidityPercentage',creatorLp:'creatorLiquidityPercentage',creatorLocked:'creatorPermanentLockedLiquidityPercentage',lpVest:'partnerLiquidityVestingInfo / creatorLiquidityVestingInfo',tokenVestPeriods:'lockedVestingConfig.numberOfPeriod',creatorTradingFeePct:'creatorTradingFeePercentage',tokenType:'tokenType',activation:'activationType',migratedFeeBps:'migratedPoolFeeBps',curveHash:'curve (truncated SHA-1 digest in source snapshot)'};
export function canonical(row) { return Object.fromEntries(FIELDS.map(k=>[k,row[k] ?? null])); }
export function fingerprint(row) { return createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex'); }
export function normalize(v) {
  if (v == null) return v;
  if (typeof v === 'bigint' || v.constructor?.name === 'BN') return v.toString();
  if (typeof v.toBase58 === 'function') return v.toBase58();
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)]));
  return v;
}
export function compactConfig(c, key) {
  const bf=c.poolFees.baseFee, s=v=>v==null?null:String(v);
  return {key,quote:s(c.quoteMint),partner:s(c.feeClaimer),leftover:s(c.leftoverReceiver),
    startFeeBps:Number(s(bf.cliffFeeNumerator))/1e5,feeMode:bf.baseFeeMode,periods:Number(s(bf.firstFactor)),freq:s(bf.secondFactor),reduction:s(bf.thirdFactor),dynamicFee:c.poolFees.dynamicFee.initialized,
    migration:c.migrationOption,migQuote:s(c.migrationQuoteThreshold),migFeeOpt:c.migrationFeeOption,
    partnerLp:c.partnerLiquidityPercentage,partnerLocked:c.partnerPermanentLockedLiquidityPercentage,creatorLp:c.creatorLiquidityPercentage,creatorLocked:c.creatorPermanentLockedLiquidityPercentage,
    lpVest:(c.partnerLiquidityVestingInfo?.isInitialized||0)+(c.creatorLiquidityVestingInfo?.isInitialized||0),tokenVestPeriods:s(c.lockedVestingConfig.numberOfPeriod),creatorTradingFeePct:c.creatorTradingFeePercentage,tokenType:c.tokenType,activation:c.activationType,migratedFeeBps:c.migratedPoolFeeBps,
    curveHash:createHash('sha1').update(JSON.stringify((c.curve||[]).map(p=>[s(p.sqrtPrice),s(p.liquidity)]))).digest('hex').slice(0,10)};
}
export const quoteLabel=q=>q===SOL?'SOL':q===USDC?'USDC':'Other';
export const migrationLabel=n=>n===0?'DAMM v1':n===1?'DAMM v2':`Option ${n}`;
export function units(raw, decimals) {
  if (!/^\d+$/.test(String(raw)) || !Number.isInteger(decimals) || decimals<0 || decimals>18) return null;
  const str=String(raw).padStart(decimals+1,'0');
  return decimals ? (str.slice(0,-decimals)+'.'+str.slice(-decimals)).replace(/\.?0+$/,'') : str;
}
export function traits(row) {
  const scheduled=[0,1].includes(Number(row.feeMode));
  const decay=scheduled && Number(row.periods)>0 && Number(row.reduction)>0;
  return {decay,dynamic:Boolean(row.dynamicFee),locked:Number(row.partnerLocked)+Number(row.creatorLocked),vesting:Number(row.lpVest)>0,quote:quoteLabel(row.quote),migration:migrationLabel(row.migration)};
}
export function ruleRows(row) {
  const t=traits(row), threshold=row.quote===SOL?units(row.migQuote,9):row.quote===USDC?units(row.migQuote,6):null;
  return [
    {label:'Starting base fee',value:`${(Number(row.startFeeBps)/100).toLocaleString('en-US',{maximumFractionDigits:5})}%`,detail:t.decay?'A fee schedule is configured.':'See raw fee mode for the complete fee behavior.',fields:['startFeeBps','feeMode','periods','freq','reduction']},
    {label:'Dynamic fees',value:t.dynamic?'Enabled':'Not enabled',detail:'Whether the dynamic-fee component is initialized.',fields:['dynamicFee']},
    {label:'Permanent LP allocation',value:`${t.locked}%`,detail:`Partner ${row.partnerLocked}% · Creator ${row.creatorLocked}%. Configured allocation after migration; not proof migration occurred.`,fields:['partnerLocked','creatorLocked']},
    {label:'Migration threshold',value:threshold!==null?`${threshold} ${t.quote}`:`${row.migQuote} raw units`,detail:`Configured destination: ${t.migration}.`,fields:['migQuote','quote','migration']},
    {label:'Creator trading-fee share',value:`${row.creatorTradingFeePct}%`,detail:'Configured share of trading fees, not realized earnings.',fields:['creatorTradingFeePct']},
    {label:'Vesting',value:t.vesting?'LP vesting configured':'No LP vesting flag',detail:`Token vesting periods: ${row.tokenVestPeriods}.`,fields:['lpVest','tokenVestPeriods']}
  ].map(r=>({...r,citations:r.fields.map(k=>({key:k,field:CITATIONS[k],raw:row[k]}))}));
}
export function diff(a,b) {return FIELDS.filter(k=>String(a[k]??'')!==String(b[k]??'')).map(k=>({key:k,field:CITATIONS[k],a:a[k]??null,b:b[k]??null}));}
export function safeAddress(s) {return typeof s==='string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);}
export function sanitizeEvent(event, receivedAt=Date.now()) {
  if(!event || typeof event!=='object' || Array.isArray(event)) return null;
  const d=event.data&&typeof event.data==='object'?{...event,...event.data}:event;
  // The server-side subscription filter alone is not proof of venue.
  if ((d.dex||d.venue)!=='meteora_dbc') return null;
  const addr=x=>safeAddress(x)?x:null;
  const num=x=>x!=null&&Number.isFinite(Number(x))?Number(x):null;
  const type=['swap','token_update','token_create','pool_create','meme','graduation','liquidity'].includes(event.type)?event.type:'event';
  return {type,receivedAt,signature:typeof d.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(d.signature)?d.signature:null,
    pool:addr(d.pool),mint:addr(d.mint||d.base_mint),dex:'meteora_dbc',side:['buy','sell'].includes(d.side)?d.side:null,
    volumeUsd:num(d.volume_usd),feePct:num(d.fee_pct),progressPct:num(d.progress_pct),slot:num(d.slot),blockTime:num(d.block_time)};
}
