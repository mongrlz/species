import React,{useEffect,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';

// Decorative cellular field. It never encodes market activity or outcomes.
function Field({running}) {
  const canvas=useRef(null),engine=useRef(null);
  useEffect(()=>{
    const el=canvas.current,ctx=el.getContext('2d');
    if(!ctx)return;
    let width=0,height=0,cols=0,rows=0,cells,previous,frame=0,last=0,generationAt=0,generation=0;
    const cell=10,period=900;
    const draw=(blend=1)=>{
      ctx.clearRect(0,0,width,height);
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const i=y*cols+x,alpha=previous[i]*(1-blend)+cells[i]*blend;
        if(!alpha)continue;
        // Quiet beneath reading areas, more visible around the page perimeter.
        const edge=Math.pow(Math.abs(x/Math.max(1,cols-1)-.5)*2,2);
        ctx.fillStyle=`rgba(58,83,66,${alpha*(.035+.13*edge)})`;
        ctx.fillRect(x*cell+1,y*cell+1,cell-3,cell-3);
      }
    };
    const seed=()=>{
      cells=new Uint8Array(cols*rows);
      let random=7319;const rand=()=>{random=(random*1664525+1013904223)>>>0;return random/4294967296;};
      const motifs=[[[1,0],[2,1],[0,2],[1,2],[2,2]],[[0,1],[1,1],[2,1]],[[1,0],[2,0],[0,1],[1,1],[1,2]]];
      for(let y=2;y<rows-5;y+=9)for(let x=2;x<cols-5;x+=10){
        if(rand()>.64)continue;
        const dx=Math.floor(rand()*4),dy=Math.floor(rand()*3),motif=motifs[Math.floor(rand()*motifs.length)];
        for(const [mx,my]of motif)cells[(y+dy+my)*cols+x+dx+mx]=1;
      }
      previous=cells.slice();generation=0;generationAt=performance.now();
    };
    const resize=()=>{
      width=innerWidth;height=innerHeight;cols=Math.ceil(width/cell);rows=Math.ceil(height/cell);
      const ratio=Math.min(devicePixelRatio||1,2);el.width=Math.round(width*ratio);el.height=Math.round(height*ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);seed();draw();
    };
    const step=()=>{
      previous=cells;const next=new Uint8Array(cells.length);
      for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
        const i=y*cols+x;let n=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)n+=cells[i+dy*cols+dx];
        next[i]=n===3||(cells[i]&&n===2)?1:0;
      }
      cells=next;generation++;
      if(generation%70===0)seed();
    };
    const tick=t=>{
      if(t-last>=80){if(t-generationAt>=period){step();generationAt=t;}draw(Math.min(1,(t-generationAt)/320));last=t;}
      frame=requestAnimationFrame(tick);
    };
    const sync=()=>{
      cancelAnimationFrame(frame);
      if(engine.current?.running&&!document.hidden){generationAt=performance.now();frame=requestAnimationFrame(tick);}
    };
    engine.current={running:false,sync};resize();
    addEventListener('resize',resize);document.addEventListener('visibilitychange',sync);
    return()=>{cancelAnimationFrame(frame);removeEventListener('resize',resize);document.removeEventListener('visibilitychange',sync);engine.current=null;};
  },[]);
  useEffect(()=>{if(engine.current){engine.current.running=running;engine.current.sync();}},[running]);
  return <canvas ref={canvas} className="cell-field" aria-hidden="true"/>;
}

export default function CellField(){
  const [paused,setPaused]=useState(()=>localStorage.getItem('species-motion')==='paused');
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(q.matches);q.addEventListener('change',change);return()=>q.removeEventListener('change',change);},[]);
  const running=!paused&&!reduced;
  useEffect(()=>{document.documentElement.dataset.motion=running?'running':'paused';},[running]);
  return <><Field running={running}/><button className="motion-toggle" aria-label={reduced?'Background motion disabled by system preference':running?'Pause background animation':'Resume background animation'} aria-pressed={running} disabled={reduced} title={reduced?'Your reduced-motion preference is respected':undefined} onClick={()=>{setPaused(!paused);localStorage.setItem('species-motion',paused?'running':'paused');}}>{running?<Pause size={12}/>:<Play size={12}/>}<span>Motion {running?'on':'off'}</span></button></>;
}
