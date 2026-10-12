import React, { useId, useMemo } from 'react';

export const families=['Faceted seed','Orbital ring','Layered form','Ribbed seed','Stellate form','Twin cone'];
// Ordered 4×4 Bayer shading. Geometry and shading are deterministic, never market signals.
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const rotate=(p,a,b)=>{const [x,y,z]=p;const xx=x*Math.cos(a)+z*Math.sin(a),zz=-x*Math.sin(a)+z*Math.cos(a);return [xx,y*Math.cos(b)-zz*Math.sin(b),y*Math.sin(b)+zz*Math.cos(b)];};
const project=p=>[120+p[0]*72,120+p[1]*72];
function mesh(family,seed){
  const faces=[],N=family===0?8:family===4?16:24,M=family===0?6:family===1?12:14;
  const point=(i,j)=>{
    const t=Math.PI*i/M,u=Math.PI*2*j/N;
    let r=Math.sin(t),y=-Math.cos(t)*1.15;
    if(family===0){r=(1-Math.abs(2*i/M-1))*.98;y=(i/M*2-1)*1.2;}
    if(family===1){const v=i/M*Math.PI*2;r=.69+.29*Math.cos(v);y=.29*Math.sin(v);}
    if(family===2){r=Math.sin(t)*(i%2?.83:1.08);y=-Math.cos(t)*.92;}
    if(family===3){r*=.88+.10*Math.cos(u*8);y*=1.05;}
    if(family===4){r*=j%2?1.2:.63;y*=i%2?1.04:.87;}
    if(family===5){r=Math.abs(Math.cos(t))*.98+.06;y=-Math.cos(t)*1.08;}
    return rotate([r*Math.cos(u),y,r*Math.sin(u)],.45+(seed%9)*.055,family===1?.95:.23);
  };
  for(let i=0;i<M;i++)for(let j=0;j<N;j++){
    const ps=[point(i,j),point(i,j+1),point(i+1,j+1),point(i+1,j)];
    const pieces=family===0||family===4?[[ps[0],ps[1],ps[2]],[ps[0],ps[2],ps[3]]]:[ps];
    for(const p of pieces){const a=p[0],b=p[1],c=p[2],u=b.map((v,k)=>v-a[k]),v=c.map((w,k)=>w-a[k]);const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...normal)||1;
      faces.push({points:p.map(project).map(q=>q.map(n=>n.toFixed(2)).join(',')).join(' '),depth:p.reduce((n,q)=>n+q[2],0)/p.length,shade:Math.abs((normal[0]*.5-normal[1]*.65+normal[2]*.3)/len)});
    }
  }
  return faces.sort((a,b)=>a.depth-b.depth);
}
export default function Specimen({id='a138fa',family,style='engraved',large=false,className=''}){
  const uid=useId().replace(/:/g,''),seed=parseInt(id.slice(0,6),16)||0,f=family??seed%6;
  const faces=useMemo(()=>mesh(f,seed),[f,seed]);
  return <svg className={`specimen ${style==='dither'?'specimen-dither':''} ${large?'specimen-large':''} ${className}`} viewBox="0 0 240 240" role="img" aria-label={`${families[f]}, geometric identifier${style==='dither'?', dithered ink':''}`}>
    <defs><pattern id={`h${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)"><path d="M0 0V4" stroke="currentColor" strokeWidth=".55" opacity=".48"/></pattern>
      {style==='dither'&&Array.from({length:9},(_,level)=><pattern key={level} id={`d${uid}-${level}`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f5f3eb"/>{bayer.map((threshold,index)=>threshold<level*2&&<rect key={index} x={(index%4)*2} y={Math.floor(index/4)*2} width="1.5" height="1.5" fill="#344039"/>)}</pattern>)}
    </defs>
    {large&&<g className="specimen-guides" fill="none" stroke="currentColor" strokeWidth=".45" opacity=".3"><circle cx="120" cy="120" r="108" strokeDasharray="2 3"/><path d="M4 120H236M120 4V236M8 116V124M232 116V124M116 8H124M116 232H124"/></g>}
    <g className="specimen-form" key={`${id}-${style}`}>
      {faces.map((p,i)=><g key={i}><polygon points={p.points} fill={style==='dither'?`url(#d${uid}-${Math.max(1,Math.min(8,Math.round(p.shade*9)))})`:style==='line'?'#f5f1e8':`rgb(${Math.round(240-p.shade*77)},${Math.round(237-p.shade*76)},${Math.round(228-p.shade*73)})`} stroke="#363934" strokeWidth={style==='dither'?.28:large?.48:.65} strokeLinejoin="round"/>{style==='engraved'&&p.shade>.29&&<polygon points={p.points} fill={`url(#h${uid})`} opacity={p.shade*.78}/>}</g>)}
    </g>
  </svg>;
}
