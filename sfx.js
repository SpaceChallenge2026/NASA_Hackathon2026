'use strict';
/* ELSEWHERE interface sounds.
   Every sound is synthesised in the browser with the Web Audio API: no audio files, no samples,
   so there is nothing to license. Sounds start after the first click or key press (browser autoplay rule).
   A SOUND ON/OFF switch is added to the ABOUT / HOW TO PLAY / CREDITS row; the choice is remembered on this device.
   Options on the script tag:
     data-toggle="none"  do not add the switch (use ElsewhereSfx.setEnabled from your own sound switch instead)
     data-boost="5"      overall loudness multiplier
   API: ElsewhereSfx.setEnabled(true|false), ElsewhereSfx.isEnabled(), and ElsewhereSfx.hover() / click() / on() / off() /
        select() / zoomIn() / zoomOut() / deny() / forward() / back() to play one sound from your own code. */
(function(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  const SCRIPT=document.currentScript||{dataset:{}};
  const KEY='elsewhere-sfx';
  const BOOST=+(SCRIPT.dataset.boost||5); // overall loudness of every sound; raise or lower this one number to tune
  let on=true;try{on=localStorage.getItem(KEY)!=='off';}catch(e){}
  let paint=null,ctx=null,out=null,echo=null,noiseBuf=null,lastHover=0,hoverEl=null;

  function init(){
    if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
    ctx=new AC();
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-4;comp.ratio.value=12;comp.attack.value=.002;comp.release.value=.12;comp.connect(ctx.destination);
    out=ctx.createGain();out.gain.value=1;out.connect(comp);
    // a soft space echo used by the larger sounds
    echo=ctx.createGain();echo.gain.value=.3;
    const d=ctx.createDelay(1);d.delayTime.value=.19;const fb=ctx.createGain();fb.gain.value=.32;
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2600;
    echo.connect(d);d.connect(lp);lp.connect(fb);fb.connect(d);lp.connect(out);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
    const ch=noiseBuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;
  }
  ['pointerdown','keydown','touchstart'].forEach(t=>addEventListener(t,init,{capture:true,passive:true}));

  function tone(f,dur,o={}){
    if(!on||!ctx||ctx.state!=='running')return;
    const t=ctx.currentTime+(o.at||0),g=ctx.createGain(),osc=ctx.createOscillator();
    osc.type=o.type||'sine';osc.frequency.setValueAtTime(f,t);
    if(o.to)osc.frequency.exponentialRampToValueAtTime(o.to,t+dur);
    const v=Math.min(.95,(o.gain||.05)*BOOST),a=o.attack||.004;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    osc.connect(g);g.connect(out);if(o.echo)g.connect(echo);
    osc.start(t);osc.stop(t+dur+.02);
  }
  function whoosh(from,to,dur,gain){
    if(!on||!ctx||ctx.state!=='running')return;
    const t=ctx.currentTime,src=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),g=ctx.createGain();
    src.buffer=noiseBuf;bp.type='bandpass';bp.Q.value=1.4;
    bp.frequency.setValueAtTime(from,t);bp.frequency.exponentialRampToValueAtTime(to,t+dur);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(Math.min(.95,gain*BOOST),t+dur*.35);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    src.connect(bp);bp.connect(g);g.connect(out);g.connect(echo);src.start(t);src.stop(t+dur+.05);
  }
  const S={
    hover(){const n=performance.now();if(n-lastHover<45)return;lastHover=n;tone(1500,.06,{to:1300,gain:.03});},
    click(){tone(540,.07,{type:'triangle',to:800,gain:.06});tone(1620,.03,{gain:.018});},
    on(){tone(660,.07,{type:'triangle',gain:.045});tone(990,.09,{type:'triangle',gain:.045,at:.055});},
    off(){tone(990,.07,{type:'triangle',gain:.04});tone(660,.09,{type:'triangle',gain:.04,at:.055});},
    select(){tone(1320,.42,{gain:.045,echo:true});tone(1980,.3,{gain:.016,at:.012,echo:true});},
    zoomIn(){tone(620,.06,{type:'triangle',to:900,gain:.045});},
    zoomOut(){tone(900,.06,{type:'triangle',to:620,gain:.045});},
    deny(){tone(170,.09,{type:'square',gain:.018});},
    forward(){whoosh(320,2200,.5,.07);tone(220,.45,{to:440,gain:.025,echo:true});},
    back(){whoosh(2000,300,.42,.06);tone(440,.38,{to:220,gain:.022});}
  };
  const api={setEnabled(v){on=!!v;try{localStorage.setItem(KEY,on?'on':'off');}catch(e){}if(on)init();if(paint)paint();},isEnabled(){return on;}};
  Object.defineProperties(S,{setEnabled:{value:api.setEnabled},isEnabled:{value:api.isEnabled}}); // not enumerable: only the sounds are listed
  window.ElsewhereSfx=S;

  const ACT='button,a[href],summary,input[type=checkbox],input[type=radio],input[type=submit],select,[role=button],[role=tab],[role=option]';
  const usable=el=>el&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('[hidden],[inert]');
  // hover over anything clickable
  document.addEventListener('pointerover',e=>{
    if(e.pointerType==='touch')return;
    const el=e.target.closest(ACT);
    if(el===hoverEl)return;hoverEl=el;
    if(el&&usable(el)&&!el.classList.contains('sr-only')&&el.closest('.sr-only')===null)S.hover();
  });
  // keyboard focus gets the same cue
  document.addEventListener('focusin',e=>{
    const el=e.target.closest&&e.target.closest(ACT);
    if(el&&usable(el)&&el.matches(':focus-visible'))S.hover();
  });
  // clicks
  document.addEventListener('click',e=>{
    const el=e.target.closest(ACT);if(!el||el.id==='sfx-toggle')return;
    if(el.tagName==='LABEL')return;
    if(!usable(el)){S.deny();return;}
    if(/^(zoom-in|earth-in)$/.test(el.id))return S.zoomIn();
    if(/^(zoom-out|earth-out)$/.test(el.id))return S.zoomOut();
    if(el.tagName==='SUMMARY'){const d=el.parentElement;return d&&d.open?S.off():S.on();}
    if(el.type==='checkbox'||el.type==='radio')return el.checked?S.on():S.off();
    S.click();
  },true);
  // clicks inside disabled buttons never reach "click": catch them here
  document.addEventListener('pointerdown',e=>{const el=e.target.closest('button:disabled');if(el)S.deny();},true);

  // globes drawn on canvas
  let down=null;
  document.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:e.target};},true);
  document.addEventListener('pointerup',e=>{
    if(!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y)>7,t=down.t;down=null;if(moved)return;
    if(t.id==='universe'&&t.style.cursor==='pointer')S.click();
  },true);
  function watch(id,attr,test){
    const el=document.getElementById(id);if(!el)return;let was=test(el);
    new MutationObserver(()=>{const now=test(el);if(now&&!was&&!el.classList.contains('dragging'))S.hover();was=now;}).observe(el,{attributes:true,attributeFilter:[attr]});
  }
  watch('universe','style',el=>el.style.cursor==='pointer');
  watch('earth-globe','class',el=>el.classList.contains('on-candidate'));

  // a whoosh when the journey moves forward or back a stage
  const depth=()=>{const h=location.hash.slice(1).split('?')[0];
    return /^investigate-/.test(h)?4:/^discover-/.test(h)?3:/^enter-/.test(h)?2:/^(mars|moon)$/.test(h)?1:0;};
  // a ping when a region (cell) or an Earth site is picked, by mouse, keyboard or the coordinate form
  const pick=()=>{const q=new URLSearchParams(location.hash.split('?')[1]||'');return (q.get('cell')||'')+'|'+(q.get('site')||'');};
  let lastDepth=depth(),lastPick=pick();
  const moved=()=>{const d=depth(),p=pick();
    if(d!==lastDepth)(d>lastDepth?S.forward:S.back)();
    else if(p!==lastPick&&p!=='|')S.select();
    lastDepth=d;lastPick=p;};
  ['pushState','replaceState'].forEach(k=>{const f=history[k];history[k]=function(){const r=f.apply(this,arguments);setTimeout(moved,0);return r;};});
  addEventListener('popstate',()=>setTimeout(moved,0));

  // mute switch
  const css=document.createElement('style');
  // the switch sits in the ABOUT / HOW TO PLAY / CREDITS row and borrows its style
  css.textContent='#sfx-toggle{display:inline-flex;align-items:center;gap:7px}'+
    '#sfx-toggle svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}'+
    '#sfx-toggle[aria-pressed="false"] .w{display:none}#sfx-toggle[aria-pressed="true"] .x{display:none}'+
    '#sfx-toggle.float{position:fixed;left:18px;bottom:16px;z-index:50;color:#b8bebf;background:rgba(3,6,8,.72);border:1px solid rgba(216,221,217,.22);padding:0 10px;min-height:32px;font-size:10px;letter-spacing:.16em;cursor:pointer}';
  document.head.appendChild(css);
  if(SCRIPT.dataset.toggle==='none')return;
  const b=document.createElement('button');b.type='button';b.id='sfx-toggle';
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="m17 9 5 6m0-6-5 6"/></svg><span></span>';
  paint=()=>{b.setAttribute('aria-pressed',on);b.setAttribute('aria-label',on?'Sound on, press to mute':'Sound off, press to unmute');b.querySelector('span').textContent=on?'SOUND ON':'SOUND OFF';};
  b.addEventListener('click',()=>{api.setEnabled(!on);if(on)setTimeout(S.on,30);});
  paint();
  const nav=document.querySelector('.aux-nav');if(nav)nav.appendChild(b);else{b.classList.add('float');document.body.appendChild(b);}
})();
