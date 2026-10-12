import React,{useState,useEffect} from 'react';

const stamp=s=>new Date(s).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const short=s=>`${s.slice(0,5)}…${s.slice(-4)}`;
function download(value,name,type='application/json'){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function FeeChart({schedule:s}){
  if(!s)return null;
  const pts=s.points||[],duration=Number(s.duration)||1,max=Math.max(1,...pts.map(p=>p.feePct)),x=v=>52+Number(v)/duration*640,y=v=>194-v/max*160;
  const d=pts.length===1?`M52 ${y(pts[0].feePct)}H692`:pts.map((p,i)=>i?`H${x(p.offset)}V${y(p.feePct)}`:`M${x(p.offset)} ${y(p.feePct)}`).join(' ');
  const current=s.current,now=current?Math.min(duration,Number(current.offset)):null;
  return <section className="evidence-panel fee-panel"><div className="section-heading"><div><div className="eyebrow">Configured schedule</div><h2>How the base fee changes</h2></div><span className="mono">{s.dynamic?'Dynamic fees enabled':'Base fee only'}</span></div><p>{s.description}</p>{pts.length>0&&<svg className="fee-chart" viewBox="0 0 730 240" role="img" aria-label={s.description}>
    {[0,.25,.5,.75,1].map(f=><g key={f}><line x1="52" x2="692" y1={y(max*f)} y2={y(max*f)} className="chart-grid"/><text x="42" y={y(max*f)+4} textAnchor="end">{(max*f).toFixed(2)}%</text></g>)}
    <path d={d} className="fee-line"/>{pts.length>1&&[0,.25,.5,.75,1].map(f=><text key={f} x={x(duration*f)} y="217" textAnchor="middle">{Math.round(duration*f)}</text>)}
    {now!=null&&<g><line x1={x(now)} x2={x(now)} y1="27" y2="194" className="now-line"/><circle cx={x(now)} cy={y(current.feePct)} r="5"/></g>}
    <text x="372" y="238" textAnchor="middle">{s.status==='fixed'?'Fixed configured rate':`${s.unit} after activation`}</text>
  </svg>}<div className="fee-facts">{current?<><strong>{current.feePct}% base fee at last read</strong><span>{current.beforeActivation?'Activation has not occurred':current.nextChangeIn?`Next step in ${current.nextChangeIn} ${s.unit} at that read`:'Final configured step reached'}</span></>:<span>Inspect a pool to place its activation on this schedule.</span>}</div><p className="tiny">{s.sampled?`Plot samples ${s.points.length} boundaries from ${s.periods} steps. `:""}{s.notice} Source: {s.source}.</p></section>;
}
export function Baseline({baseline:b}){
  if(!b)return null;
  return <section className="evidence-panel"><div className="eyebrow">Separate comparison profile</div><div className="section-heading"><h2>{b.differences.length} differences from the baseline</h2><a href={`#/species/${b.species.id}`}>Species No. {b.species.rank} →</a></div><p>{b.method}</p>{b.differences.length>0?<div className="table-scroll"><table><thead><tr><th>Source field</th><th>Baseline</th><th>This config</th></tr></thead><tbody>{b.differences.map(d=><tr key={d.key}><td>{d.field||d.key}</td><td className="mono">{String(d.a)}</td><td className="mono">{String(d.b)}</td></tr>)}</tbody></table></div>:<p>This configuration exactly matches the baseline’s indexed fields.</p>}<p className="tiny">{b.notice}</p></section>;
}
export function Builder({data:d}){
  const [tab,setTab]=useState('sdk'),[copied,setCopied]=useState('');const b=d.builder;
  if(!b)return null;
  const endpoint=`/api/inspect/${d.configAddress}`;
  const code=tab==='sdk'?b.snippet:tab==='json'?JSON.stringify(b.parameters||d.fullConfig,null,2):`// Read-only local API. No credentials in the browser.\nconst response = await fetch('${endpoint}');\nif (!response.ok) throw new Error('Account unavailable');\nconst { fullConfig, builder, feeSchedule, species } = await response.json();`;
  return <section className="evidence-panel builder-panel"><div className="eyebrow">Builders / Observed configuration</div><h2>Take the rules with you</h2><p>{b.validation}</p><p className="tiny">{b.notice}</p><div className="tabs">{[['sdk','SDK parameters'],['json','Parameter JSON'],['api','Read API']].map(([key,label])=><button key={key} aria-pressed={key===tab} disabled={key==='sdk'&&!b.snippet} onClick={()=>{setTab(key);setCopied('');}}>{label}</button>)}</div>{code?<><div className="actions"><button onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied('Copied');}catch{setCopied('Use download instead');}}}>{copied||'Copy code'}</button><button onClick={()=>download(code,`species-config.${tab==='json'?'json':'ts'}`,tab==='json'?'application/json':'text/plain')}>Download {tab==='json'?'JSON':'TypeScript'}</button></div><details><summary>Preview {tab==='sdk'?'typed SDK parameters':tab==='json'?'parameter JSON':'API example'}</summary><pre>{code}</pre></details></>:<p>SDK mapping is unavailable for this account. The complete decoded account is available in the Source account section.</p>}</section>;
}
export function CollectionProgress(){
  const [data,set]=useState(null);useEffect(()=>{let active=true;const load=()=>fetch('/api/outcomes').then(r=>r.ok?r.json():null).then(d=>active&&set(d)).catch(()=>{});load();const t=setInterval(load,15000);return()=>{active=false;clearInterval(t);};},[]);
  return data?<div className="collection-progress"><span className="eyebrow">Outcome evidence collection</span><p><strong>{data.pools.toLocaleString()} pools</strong> returned from {data.configsRead.toLocaleString()} successful config lookups across {data.speciesSampled} sampled species.{data.job.running?` ${data.job.queued} species still queued.`:' Current collection pass finished.'}</p><p className="tiny">{data.method}</p></div>:null;
}
export function RecordedTape(){
  const [data,set]=useState(null),[error,setError]=useState('');
  const load=()=>{setError('');fetch('/api/replay').then(r=>{if(!r.ok)throw Error();return r.json();}).then(set).catch(()=>setError('Saved observations could not be loaded.'));};
  return <section className="evidence-panel"><div className="section-heading"><div><div className="eyebrow">Recorded observations</div><h2>Previous session’s field notes</h2></div><button onClick={load}>Load recorded tape</button></div><p>Separate from the live feed. Receipt times show when these events were originally observed.</p>{error&&<p role="alert">{error}</p>}{data&&(data.events.length?<><p className="tiny">{data.label} · {data.notice}</p><div className="table-scroll"><table><thead><tr><th>Originally received</th><th>Event</th><th>Pool or token</th></tr></thead><tbody>{data.events.slice(0,30).map(e=><tr key={e.id}><td>{stamp(e.receivedAt)}</td><td>{e.type.replaceAll('_',' ')}</td><td>{e.pool||e.mint?<a href={`#/inspect/${e.pool||e.mint}`}>{short(e.pool||e.mint)} →</a>:'Not supplied'}</td></tr>)}</tbody></table></div></>:<p>No saved events from a previous session yet.</p>)}</section>;
}
