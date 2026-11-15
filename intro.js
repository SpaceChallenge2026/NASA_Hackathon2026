'use strict';
/* ELSEWHERE opening sequence (about 10 s). Every mark comes from window.ANALOG_DATA:
   the 12,960 Moon and Mars cells at their real coordinates, the 42 environment types they collapse into,
   and the 3,347 Earth-planet pairs linking those types to 333 Earth sites. Plays once per tab session;
   skipped for deep links and reduced-motion users. Click, tap or any key skips it. */
(function(){
  const root=document.getElementById('intro');
  if(!root)return;
  const D=window.ANALOG_DATA;
  let finished=false;
  function finish(){
    if(finished)return;finished=true;
    try{sessionStorage.setItem('elsewhere-intro','seen');}catch(e){}
    root.classList.add('done');
    setTimeout(()=>root.remove(),900);
    removeEventListener('keydown',finish,true);
  }
  if(!D||!D.cells||!D.rows){finish();return;}
  root.addEventListener('click',finish);
  addEventListener('keydown',finish,true);

  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
  const caption=root.querySelector('.intro-caption');
  const title=root.querySelector('.intro-title');
  const COL={moon:[185,192,196],mars:[208,138,95],earth:[232,226,212],lit:[243,217,168],line:[214,170,130],grid:[150,165,172]};
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Data, prepared once.
  const cells=Object.values(D.cells).map(c=>({b:c[0]==='mo'?'moon':'mars',lat:c[1],lon:c[2],a:D.arch[c[3]]}))
    .filter(c=>c.a);
  const archIds=Object.keys(D.arch);
  // Tone each environment type by its mean elevation within its own world, so real geography shows through.
  for(const b of ['moon','mars']){
    const ids=archIds.filter(id=>D.arch[id].b===b).sort((x,y)=>(D.arch[x].elev??0)-(D.arch[y].elev??0));
    ids.forEach((id,i)=>{D.arch[id]._tone=ids.length>1?i/(ids.length-1):.5;});
  }
  const sites=D.sites;
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const pairs=D.rows.map(r=>({t:r.t,s:r.s,k:rnd()})).sort((a,b)=>a.k-b.k);
  const totalCells=cells.length,totalPairs=pairs.length,totalSites=Object.keys(sites).length,totalTypes=archIds.length;

  // Layout: Moon and Mars maps side by side, Earth map below.
  let W=0,H=0,P={};
  function layout(){
    const dpr=Math.min(devicePixelRatio||1,2);
    W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const gap=Math.max(16,W*.03);
    const pw=Math.min((W-gap*3)/2,H*.25*2,560),ph=pw/2;
    const ew=Math.min(W*.7,H*.3*2,pw*2+gap),eh=ew/2;
    const vgap=Math.max(30,H*.075);
    const top=Math.max(36,(H-(ph+vgap+eh))/2-H*.06);
    const left=(W-(pw*2+gap))/2;
    P={moon:{x:left,y:top,w:pw,h:ph},mars:{x:left+pw+gap,y:top,w:pw,h:ph},earth:{x:(W-ew)/2,y:top+ph+vgap,w:ew,h:eh}};
  }
  layout();addEventListener('resize',layout);
  const proj=(p,lat,lon)=>[p.x+(lon+180)/360*p.w,p.y+(90-lat)/180*p.h];

  const ease=x=>x<=0?0:x>=1?1:x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
  const span=(t,a,b)=>Math.max(0,Math.min(1,(t-a)/(b-a)));
  const fmt=n=>Math.round(n).toLocaleString('en-US');

  function grid(p,a,label){
    if(a<=0)return;
    ctx.strokeStyle=rgba(COL.grid,.09*a);ctx.lineWidth=1;ctx.beginPath();
    for(let lon=-180;lon<=180;lon+=30){const x=Math.round(p.x+(lon+180)/360*p.w)+.5;ctx.moveTo(x,p.y);ctx.lineTo(x,p.y+p.h);}
    for(let lat=-90;lat<=90;lat+=30){const y=Math.round(p.y+(90-lat)/180*p.h)+.5;ctx.moveTo(p.x,y);ctx.lineTo(p.x+p.w,y);}
    ctx.stroke();
    ctx.fillStyle=rgba(COL.grid,.75*a);ctx.font='10px Arial,sans-serif';
    if('letterSpacing' in ctx)ctx.letterSpacing='3px';
    ctx.fillText(label,p.x,p.y-10);
    if('letterSpacing' in ctx)ctx.letterSpacing='0px';
  }

  let captionKey='';
  function setCaption(key,html){
    if(key===captionKey){if(html)caption.innerHTML=html;return;}
    captionKey=key;caption.style.opacity='0';
    setTimeout(()=>{if(captionKey===key){caption.innerHTML=html;caption.style.opacity=html?'1':'0';}},280);
  }

  const start=performance.now();
  function frame(now){
    if(finished)return;
    const t=(now-start)/1000;
    ctx.clearRect(0,0,W,H);
    const fadeAll=1-.75*ease(span(t,7.7,8.6));      // maps dim behind the title
    const scan=ease(span(t,.5,3.0));                 // scan line sweeps west to east
    const conv=ease(span(t,3.3,5.1));                // cells collapse into their environment type
    const earthIn=ease(span(t,4.9,5.7));
    const link=span(t,5.6,7.7);

    grid(P.moon,Math.min(1,t/.6)*fadeAll,'MOON');
    grid(P.mars,Math.min(1,t/.6)*fadeAll,'MARS');
    grid(P.earth,earthIn*fadeAll,'EARTH');

    // Planet cells.
    for(const c of cells){
      const p=P[c.b],f=(c.lon+180)/360;
      if(f>scan)continue;
      const appear=Math.min(1,(scan-f)*12);
      const [x0,y0]=proj(p,c.lat,c.lon),[x1,y1]=proj(p,c.a.lat,c.a.lon);
      const x=x0+(x1-x0)*conv,y=y0+(y1-y0)*conv;
      const k=.35+.65*c.a._tone;
      ctx.fillStyle=rgba(COL[c.b].map(v=>v*k),(.85-.65*conv)*appear*fadeAll);
      ctx.fillRect(x-.8,y-.8,1.6,1.6);
    }
    // Scan lines.
    if(scan>0&&scan<1)for(const b of ['moon','mars']){const p=P[b],x=p.x+scan*p.w;
      ctx.fillStyle=rgba(COL[b],.5);ctx.fillRect(x,p.y,1,p.h);}
    // Environment types.
    if(conv>0)for(const id of archIds){const a=D.arch[id],p=P[a.b],[x,y]=proj(p,a.lat,a.lon);
      ctx.strokeStyle=rgba(COL[a.b],.9*conv*fadeAll);ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,1+2.2*conv,0,Math.PI*2);ctx.stroke();}

    // Links to Earth sites.
    const lit=new Set();
    if(link>0){
      const n=Math.floor(ease(link)*totalPairs);
      ctx.lineWidth=.6;
      for(let i=0;i<n;i++){
        const pr=pairs[i],a=D.arch[pr.t],s=sites[pr.s];if(!a||!s)continue;
        const [x0,y0]=proj(P[a.b],a.lat,a.lon),[x1,y1]=proj(P.earth,s.lat,s.lon);
        ctx.strokeStyle=rgba(COL.line,.038*fadeAll);ctx.beginPath();ctx.moveTo(x0,y0);
        ctx.quadraticCurveTo((x0+x1)/2,(y0+y1)/2-30,x1,y1);ctx.stroke();lit.add(pr.s);
      }
    }
    if(earthIn>0)for(const id in sites){const s=sites[id],[x,y]=proj(P.earth,s.lat,s.lon),on=lit.has(id);
      ctx.fillStyle=rgba(on?COL.lit:COL.earth,(on?.95:.3)*earthIn*fadeAll);ctx.fillRect(x-1,y-1,on?2.2:1.6,on?2.2:1.6);}

    // Captions with live counts.
    if(t<3.2)setCaption('cells',`<b>${fmt(totalCells*scan)}</b> surface cells on the Moon and Mars<small>LRO LOLA · MGS MOLA and TES</small>`);
    else if(t<5.5)setCaption('types',`<b>${fmt(totalCells-(totalCells-totalTypes)*conv)}</b> environment types<small>farthest-first coverage, no fixed number</small>`);
    else if(t<7.7)setCaption('pairs',`<b>${fmt(totalPairs*ease(link))}</b> Earth–planet pairs · ${totalSites} Earth sites<small>six dimensions, compared one by one</small>`);
    else setCaption('end','');

    if(t>=7.9&&!root.classList.contains('titled'))root.classList.add('titled');
    if(t>=9.4){finish();return;}
    requestAnimationFrame(frame);
  }
  // Letter-by-letter title.
  const h=title.querySelector('h2');
  h.innerHTML=[...h.textContent].map((ch,i)=>`<span style="transition-delay:${(i*.09).toFixed(2)}s">${ch}</span>`).join('');
  requestAnimationFrame(frame);
})();
