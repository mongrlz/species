import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, diff, units, normalize, traits, sanitizeEvent, SOL } from '../server/domain.mjs';

test('identity ignores account recipients but includes previously omitted rule fields',()=>{
  const a={quote:SOL,startFeeBps:200,activation:0,tokenType:0,migFeeOpt:1,migratedFeeBps:25};
  assert.equal(fingerprint(a),fingerprint({...a,key:'different',partner:'another recipient'}));
  for(const field of ['activation','tokenType','migFeeOpt','migratedFeeBps']){
    const b={...a,[field]:a[field]+1};
    assert.notEqual(fingerprint(a),fingerprint(b));
    assert.deepEqual(diff(a,b).map(x=>x.key),[field]);
  }
  assert.equal(fingerprint(a),fingerprint(Object.fromEntries(Object.entries(a).reverse())));
});
test('large token amounts retain every digit',()=>{
  assert.equal(units('18446744073709551615',9),'18446744073.709551615');
  assert.equal(units('50000000',6),'50');
  assert.equal(units('0',9),'0');
  assert.equal(units('100',0),'100');
  assert.equal(units('1e9',9),null);
  assert.equal(normalize({amount:18446744073709551615n}).amount,'18446744073709551615');
});
test('rate limiter and missing reduction are not described as fee schedules',()=>{
  const a={feeMode:0,periods:10,reduction:'100',partnerLocked:90,creatorLocked:10};
  assert.equal(traits(a).decay,true);
  assert.equal(traits({...a,feeMode:2}).decay,false);
  assert.equal(traits({...a,reduction:undefined}).decay,false);
  assert.equal(traits(a).locked,100);
});
test('live events require explicit venue and discard arbitrary metadata',()=>{
  for(const invalid of [null,undefined,42,'message',[]])assert.equal(sanitizeEvent(invalid),null);
  const event={type:'swap',data:{dex:'meteora_dbc',pool:SOL,volume_usd:4,side:'buy',signature:'2'.repeat(88),name:'untrusted metadata',api_key:'must not propagate',url:'https://untrusted.invalid'}};
  const clean=sanitizeEvent(event,123);
  assert.equal(clean.receivedAt,123);assert.equal(clean.volumeUsd,4);
  assert.equal(clean.signature,'2'.repeat(88));
  assert.equal(clean.name,undefined);assert.equal(clean.api_key,undefined);assert.equal(clean.url,undefined);
  assert.equal(sanitizeEvent({...event,data:{...event.data,dex:'raydium'}}),null);
  assert.equal(sanitizeEvent({type:'swap',pool:SOL}),null);
  assert.equal(sanitizeEvent({...event,data:{...event.data,pool:'<script>',volume_usd:'NaN'}}).pool,null);
});
