'use strict';
(() => {
  const canvas = document.getElementById('universe');
  const ctx = canvas.getContext('2d', {alpha:false,willReadFrequently:true});
  const root = document.getElementById('screen');
  const backButton = document.getElementById('back');
  const atlas = window.PlanetAtlas;
  const discover = window.EarthDiscovery;
  const investigate = window.EarthInvestigation;
  const announcement = document.getElementById('announcement');
  const buttons = {mars:document.getElementById('mars'), moon:document.getElementById('moon')};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const displayFont = '"Century Gothic","Futura","Avenir Next","Segoe UI",sans-serif';
  const bodyFont = 'Arial,sans-serif';
  const images = {};
  const stars = Array.from({length:30},(_,i) => ({
    x:((i*7919+13457)%99991)/99991,
    y:((i*15427+11239)%89989)/89989,
    r:i%6===0 ? .8 : .45,
    a:.11+(i%4)*.055
  }));
  let W=0,H=0,dpr=1,mode='overview',world='',camera=null,tween=null,raf=0;
  let pointer={x:-1,y:-1,inside:false},down=null,keyboard=false;
  let frameHits=[],hovered='',hoverValue={mars:0,moon:0,back:0},lastFrame=0;
  let paintUntil=0;
  let infoOpen='',infoOpener=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const ease=t=>(1-Math.cos(Math.PI*t))/2;
  const compact=()=>W<1120||W/H<1.44||H<650;
  const stacked=()=>W/H<1.24;

  function centeredTitleX(size,tracking){
    ctx.save();ctx.font='500 '+size+'px '+displayFont;
    const width=Array.from('ELSEWHERE').reduce((sum,c)=>sum+ctx.measureText(c).width,0)+tracking*8;
    ctx.restore();return (W-width)/2;
  }
  function projectWorlds(state){
    const o=state.orbit;
    const baseR=compact()?Math.min(H*(stacked()?.084:.093),W*.092):Math.min(H*.108,W*.146);
    for(const key of ['mars','moon']){
      const a=o.angle+(key==='moon'?-Math.PI*105/180:0);
      const z=1.1*Math.cos(a),perspective=o.lens/(o.lens-z);
      const g=state[key];
      // Keep a turning destination inside the camera framing as it passes the side of the orbit.
      const horizontal=lerp(perspective,.92+.08*Math.min(perspective,2),o.stage);
      g.x=W*o.cx+W*o.spread*Math.sin(a)*horizontal;
      g.y=H*(o.cy+o.amp*Math.cos(a));
      g.r=baseR*perspective;
      g.yaw=clamp(a*.18,-.34,.34);
      g.pitch=Math.sin(a)*.055;
      const overviewX=key==='mars'?g.x-g.r*.13:g.x;
      const overviewY=key==='mars'?g.y+g.r*.55:g.y+g.r+30;
      g.lx=lerp(overviewX,g.x,o.stage);
      g.ly=lerp(overviewY,g.y+g.r+(g.focus>.5?31:25),o.stage);
      const cover=coverFor(key);
      for(const prop of ['x','y','r','lx','ly'])g[prop]=lerp(cover[prop],g[prop],o.stage);
      g.yaw*=o.stage;g.pitch*=o.stage;
    }
    return state;
  }
  function coverFor(key){
    const mars=key==='mars';
    let x=W*(mars?.735:.50),y=H*(mars?.59:.28),r=H*(mars?.275:.105);
    if(compact()){
      if(stacked()){
        x=W*(mars?.71:.285);y=H*(mars?.69:.455);
        r=Math.min(W*(mars?.235:.15),H*(mars?.155:.10));
      }else{
        x=W*(mars?.77:.55);y=H*(mars?.56:.275);
        r=Math.min(W*(mars?.185:.075),H*(mars?.246:.105));
      }
    }
    return {x,y,r,lx:x,ly:y+r+(compact()?21:27)};
  }

  // Photographic hemispheres projected onto analytic spheres. No external renderer.
  function createSphereRenderer(){
    const surface=document.createElement('canvas');
    const gl=surface.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
    if(!gl)return null;
    function shader(type,source){
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const vertex=[
      'attribute vec2 aPosition; varying vec2 vLocal;',
      'uniform vec2 uResolution; uniform vec2 uCenter; uniform float uRadius;',
      'void main(){vLocal=aPosition; vec2 p=(uCenter+aPosition*uRadius)/uResolution*2.0-1.0; gl_Position=vec4(p*vec2(1.0,-1.0),0.0,1.0);}'
    ].join('\n');
    const fragment=[
      'precision highp float; varying vec2 vLocal;',
      'uniform sampler2D uImage; uniform float uYaw; uniform float uPitch; uniform float uOpacity;',
      'void main(){',
      'float r2=dot(vLocal,vLocal);if(r2>1.0)discard;',
      'vec3 n=vec3(vLocal.x,-vLocal.y,sqrt(max(0.0,1.0-r2)));',
      'float cy=cos(uYaw),sy=sin(uYaw),cp=cos(uPitch),sp=sin(uPitch);',
      'vec3 s=vec3(cy*n.x+sy*n.z,n.y,-sy*n.x+cy*n.z);',
      's=vec3(s.x,cp*s.y-sp*s.z,sp*s.y+cp*s.z);',
      'vec2 uv=vec2(0.5+s.x*0.45,0.5-s.y*0.45);',
      'vec4 material=texture2D(uImage,uv);',
      'float visible=smoothstep(0.0,0.12,s.z);',
      'vec3 color=mix(vec3(0.003,0.005,0.007),material.rgb,material.a*visible);',
      'float edge=1.0-smoothstep(0.996,1.0,sqrt(r2));',
      'gl_FragColor=vec4(color,edge*uOpacity);',
      '}'
    ].join('\n');
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const attr=gl.getAttribLocation(program,'aPosition');
    gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    const uniforms={};['uResolution','uCenter','uRadius','uYaw','uPitch','uOpacity','uImage'].forEach(k=>uniforms[k]=gl.getUniformLocation(program,k));
    const textures={};
    return {
      surface,
      resize(){surface.width=Math.round(W*dpr);surface.height=Math.round(H*dpr);gl.viewport(0,0,surface.width,surface.height);},
      begin(){gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(uniforms.uResolution,W,H);},
      upload(key,image){
        const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);textures[key]=texture;
      },
      draw(key,g,radius,opacity){
        if(!textures[key])return;
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[key]);gl.uniform1i(uniforms.uImage,0);
        gl.uniform2f(uniforms.uCenter,g.x,g.y);gl.uniform1f(uniforms.uRadius,radius);
        gl.uniform1f(uniforms.uYaw,g.yaw);gl.uniform1f(uniforms.uPitch,g.pitch);
        gl.uniform1f(uniforms.uOpacity,opacity);gl.drawArrays(gl.TRIANGLES,0,6);
      }
    };
  }
  let spheres;
  try {spheres=createSphereRenderer();} catch {spheres=null;}
  root.dataset.renderer=spheres?'webgl-spheres':'flat-fallback';

  function targetFor(nextMode,nextWorld){
    const narrow=compact(), vertical=stacked();
    const titleSize=narrow?(vertical?clamp(W*.091,25,62):clamp(W*.053,26,59)):clamp(W*.045,54,88);
    const titleY=narrow?Math.max(78,H*(vertical?.185:.31)):H*.33;
    const t={
      title:{x:W*.085,y:titleY,size:titleSize,tracking:titleSize*.065,weight:500,alpha:1},
      intro:{x:W*.085,y:titleY+titleSize*.65+(narrow?17:25),alpha:1},
      orbit:{angle:Math.PI/6,lens:1.4,spread:.22,cx:.5,cy:.42,amp:.18,stage:0},
      mars:{alpha:.92,ls:narrow?23:27,la:1,focus:0,weight:400,tracking:.22},
      moon:{alpha:.94,ls:narrow?20:25,la:1,focus:0,weight:400,tracking:.22},
      back:{alpha:0}
    };
    if(nextMode!=='overview'){
      const size=narrow?clamp(W*.028,17,26):clamp(W*.017,23,32),tracking=size*.13;
      t.title={x:centeredTitleX(size,tracking),y:narrow?Math.max(85,H*.114):H*.075,size,tracking,weight:500,alpha:.9};
      t.intro.alpha=0;
      t.orbit={angle:nextWorld==='mars'?0:Math.PI*105/180,lens:1.7,spread:.42,cx:.5,cy:.30,amp:.20,stage:1};
      if(narrow)Object.assign(t.orbit,vertical?{spread:.35,cy:.33,amp:.222}:{spread:.365,cy:.295,amp:.172});
      const other=nextWorld==='mars'?'moon':'mars';
      t[nextWorld]={alpha:.99,ls:narrow?26:32,la:1,focus:1,weight:400,tracking:.22};
      t[other]={alpha:.54,ls:narrow?17:20,la:.8,focus:0,weight:400,tracking:.22};
      t.back.alpha=1;
      if(isResearch(nextMode)){
        t.orbit.lens=1.26;t.orbit.cx=vertical?.5:.68;t.orbit.cy=.38;
        t[nextWorld].alpha=.73;t[nextWorld].la=0;
        t[other].alpha=0;t[other].la=0;
        t.title.alpha=0;t.back.alpha=0;
      }
    }
    return projectWorlds(t);
  }
  function sample(now){
    if(!tween)return camera;
    const linear=clamp((now-tween.started)/tween.duration,0,1);
    const p=ease(linear),out={};
    for(const group of Object.keys(tween.to)){
      out[group]={};
      for(const key of Object.keys(tween.to[group])){
        out[group][key]=lerp(tween.from[group][key],tween.to[group][key],p);
      }
    }
    if(linear>=1){camera=tween.to;tween=null;root.dataset.moving='false';}
    return projectWorlds(out);
  }
  function isResearch(scene){return scene==='atlas'||scene==='discover'||scene==='investigate';}
  function route(nextMode,nextWorld){
    if(nextMode==='investigate')return '#investigate-'+nextWorld;
    if(nextMode==='discover')return '#discover-'+nextWorld;
    return nextMode==='overview'?'':nextMode==='atlas'?'#enter-'+nextWorld:'#'+nextWorld;
  }
  function change(nextMode,nextWorld='',options={}){
    const now=performance.now();
    const from=sample(now)||targetFor('overview','');
    const previousMode=mode,previousWorld=world;
    if(previousMode==='atlas'&&nextMode!=='atlas')atlas.close({depart:nextMode==='discover'&&!reduce.matches});
    if(previousMode==='discover'&&nextMode!=='discover')discover.close();
    if(previousMode==='investigate'&&nextMode!=='investigate')investigate.close();
    mode=nextMode;world=nextWorld;
    const to=targetFor(mode,world);
    const duration=reduce.matches?0:(isResearch(mode)?760:980);
    paintUntil=now+duration+450;
    if(duration && !options.immediate)tween={from,to,started:now,duration,arc:mode==='focus'?world:''};
    else {camera=to;tween=null;}
    root.dataset.scene=mode;root.dataset.world=world;root.dataset.moving=String(Boolean(tween));
    window.ElsewhereSound.scene(mode,world,{quiet:Boolean(options.immediate)});
    document.getElementById('introduction').hidden=mode!=='overview';
    backButton.hidden=mode!=='focus';
    Object.entries(buttons).forEach(([key,button])=>{
      button.disabled=isResearch(mode);
      button.setAttribute('aria-pressed',String(mode==='focus'&&key===world));
      button.setAttribute('aria-label',(mode==='focus'&&key===world?'Explore ':'Focus ')+(key==='mars'?'Mars':'Moon'));
    });
    if(options.history!==false){
      const state={elsewhere:true,back:route(previousMode,previousWorld)};
      const query=new URLSearchParams(options.query);
      if(options.cell)query.set('cell',options.cell);
      history[options.replace?'replaceState':'pushState'](state,'',location.pathname+location.search+route(mode,world)+(query.size?'?'+query:''));
    }
    if(mode==='overview')announcement.textContent='Choose Mars or Moon.';
    else if(mode==='focus')announcement.textContent=(world==='mars'?'Mars':'Moon')+' is in focus. Activate it again to enter exploration. The other world remains available. Escape returns to both destinations.';
    else {
      announcement.textContent='';
      const settings={animate:!options.immediate&&!reduce.matches,restoreFocus:previousMode==='investigate'};
      if(mode==='atlas')atlas.open(world,options.cell,settings);
      else if(mode==='discover')discover.open(world,options.cell,options.query,settings);
      else investigate.open(world,options.cell,options.query,settings);
    }
    requestDraw();
  }
  function choose(key,options={}){
    if(infoOpen||isResearch(mode))return;
    if(mode==='focus'&&world===key)change('atlas',key,options);
    else change('focus',key,options);
  }
  function back(options={}){
    if(infoOpen){closeInfo();return;}
    if(mode==='overview')return;
    const previous=world,next=mode==='investigate'?'discover':mode==='discover'?'atlas':mode==='atlas'?'focus':'overview';
    const targetWorld=next==='overview'?'':world;
    if(history.state?.elsewhere&&history.state.back===route(next,targetWorld))history.back();
    else {
      const query=next==='discover'?new URLSearchParams(location.hash.split('?')[1]):null;
      const cell=next==='atlas'?discover.cellId:query?.get('cell');
      change(next,targetWorld,{...options,cell,query,replace:true});
      if(!isResearch(next))buttons[previous].focus({preventScroll:true});
    }
  }

  function tracked(text,x,y,size,spacing,alpha=1,align='left',weight=700){
    ctx.save();ctx.font=weight+' '+size+'px '+displayFont;
    ctx.textBaseline='middle';ctx.fillStyle='#f0eee8';ctx.globalAlpha=alpha;
    const glyphs=Array.from(text),width=glyphs.reduce((a,c)=>a+ctx.measureText(c).width,0)+spacing*(glyphs.length-1);
    let pen=align==='center'?x-width/2:x;
    for(const c of glyphs){ctx.fillText(c,pen,y);pen+=ctx.measureText(c).width+spacing;}
    ctx.restore();return width;
  }
  function simpleText(text,x,y,size,alpha=1){
    ctx.save();ctx.fillStyle='#c7c8c6';ctx.globalAlpha=alpha;
    ctx.font='400 '+size+'px '+bodyFont;ctx.textBaseline='middle';ctx.fillText(text,x,y);ctx.restore();
  }
  function drawArrow(x,y,length,alpha){
    ctx.save();ctx.strokeStyle='#f0eee8';ctx.globalAlpha=alpha;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+length,y);
    ctx.moveTo(x+length-6,y-6);ctx.lineTo(x+length,y);ctx.lineTo(x+length-6,y+6);ctx.stroke();ctx.restore();
  }
  function focusCorners(rect,alpha){
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle='#edeae1';ctx.lineWidth=1.2;
    const x=rect.x-12,y=rect.y-10,w=rect.w+24,h=rect.h+20,l=7;
    ctx.beginPath();
    [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([px,py,dx,dy])=>{
      ctx.moveTo(px+dx*l,py);ctx.lineTo(px,py);ctx.lineTo(px,py+dy*l);
    });ctx.stroke();ctx.restore();
  }
  function drawWorld(key,g){
    if(g.alpha<=.001||!images[key])return;
    const hover=hoverValue[key];
    const radius=g.r*(1+hover*.009);
    if(spheres)spheres.draw(key,g,radius,clamp(g.alpha+hover*.08,0,1));
    else {
    ctx.save();ctx.globalAlpha=clamp(g.alpha+hover*.08,0,1);
    ctx.beginPath();ctx.arc(g.x,g.y,radius,0,Math.PI*2);ctx.clip();
    // Alpha image margins are 5% on each side; the planet remains a circle.
    const size=radius*2/.90;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(images[key],g.x-size/2,g.y-size/2,size,size);
    ctx.restore();
    }
    if(!isResearch(mode))frameHits.push({key,kind:'sphere',x:g.x,y:g.y,r:radius});
  }
  function drawLabel(key,g){
    if(g.la<=.005)return;
    const hover=hoverValue[key],y=g.ly-hover*2;
    const width=tracked(key.toUpperCase(),g.lx,y,g.ls,g.ls*g.tracking,g.la,'center',Math.round(g.weight/100)*100);
    const actionY=y+g.ls*.9+12;
    const actionAlpha=g.la*(.64+hover*.30);
    const selectWidth=tracked('SELECT',g.lx,actionY,11.5,2.4,actionAlpha*(1-g.focus),'center',500);
    const enterWidth=tracked('EXPLORE',g.lx,actionY,12,2.5,actionAlpha*g.focus,'center',500);
    const arrow=clamp(g.focus+hover*.65,0,1);
    if(arrow>.005)drawArrow(g.lx+lerp(selectWidth,enterWidth,g.focus)/2+12,actionY,14+8*g.focus,g.la*arrow*.85);
    const labelHalf=Math.max(width,selectWidth,enterWidth)/2;
    const left=g.lx-labelHalf-10;
    const right=Math.max(g.lx+labelHalf,g.lx+lerp(selectWidth,enterWidth,g.focus)/2+(arrow>.005?34:0))+10;
    const top=y-g.ls*.62-5;
    const rect={key,kind:'rect',x:left,y:top,w:right-left,h:actionY+14-top};
    if(!isResearch(mode))frameHits.push(rect);
    if(hover>.01){
      ctx.save();ctx.strokeStyle='#e6e2d9';ctx.globalAlpha=g.la*hover*.55;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(g.lx-selectWidth/2,actionY+15);ctx.lineTo(g.lx-selectWidth/2+lerp(18,60,g.focus),actionY+15);ctx.stroke();ctx.restore();
    }
    if(keyboard&&document.activeElement===buttons[key])focusCorners(rect,g.la*.85);
  }
  function backGeometry(){return {key:'back',kind:'rect',x:Math.max(9,W*.035-24),y:compact()?Math.max(6,H*.051-11):H*.078-24,w:48,h:48};}
  function hitAt(x,y){
    for(let i=frameHits.length-1;i>=0;i--){
      const h=frameHits[i];
      if(h.kind==='sphere' ? Math.hypot(x-h.x,y-h.y)<=h.r : x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h)return h.key;
    }return '';
  }
  function render(now){
    raf=0;
    const elapsed=lastFrame?clamp((now-lastFrame)/1000,0,.05):.016;
    lastFrame=now;
    const g=sample(now)||targetFor(mode,world);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.fillStyle='#030608';ctx.fillRect(0,0,W,H);
    const shift=(g.mars.x-W*.85)*.008;
    for(const star of stars){
      ctx.globalAlpha=star.a;ctx.fillStyle='#bdc4ca';ctx.beginPath();
      ctx.arc(star.x*W+shift,star.y*H,star.r,0,Math.PI*2);ctx.fill();
    }ctx.globalAlpha=1;
    frameHits=[];
    const active=keyboard ? Object.keys(buttons).find(k=>buttons[k]===document.activeElement)||'' : hovered;
    let easingHover=false;
    for(const key of ['mars','moon','back']){
      const goal=key===active?1:0,delta=goal-hoverValue[key];
      hoverValue[key]+=delta*Math.min(1,elapsed*13);
      if(Math.abs(delta)>.005)easingHover=true;else hoverValue[key]=goal;
    }
    if(spheres)spheres.begin();
    ['mars','moon'].sort((a,b)=>g[a].r-g[b].r).forEach(key=>drawWorld(key,g[key]));
    if(spheres)ctx.drawImage(spheres.surface,0,0,W,H);
    if(!infoOpen){
    tracked('ELSEWHERE',g.title.x,g.title.y,g.title.size,g.title.tracking,g.title.alpha,'left',Math.round(g.title.weight/100)*100);
    if(g.intro.alpha>.005){
      const size=W<650?13:clamp(W*.011,16,18);
      simpleText('Discover where distant worlds meet Earth.',g.intro.x,g.intro.y,size,g.intro.alpha*.86);
    }
    ['mars','moon'].forEach(key=>drawLabel(key,g[key]));
    if(g.back.alpha>.005&&mode==='focus'){
      const b=backGeometry(),x=b.x+18-hoverValue.back*3,y=b.y+24;
      ctx.save();ctx.globalAlpha=g.back.alpha*.85;ctx.strokeStyle='#f0eee8';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(x+7,y-7);ctx.lineTo(x,y);ctx.lineTo(x+7,y+7);ctx.moveTo(x,y);ctx.lineTo(x+21,y);ctx.stroke();ctx.restore();
      frameHits.push(b);
      if(keyboard&&document.activeElement===backButton)focusCorners(b,g.back.alpha);
    }
    }
    if(pointer.inside&&!keyboard&&!infoOpen){
      const currentHit=hitAt(pointer.x,pointer.y);
      if(currentHit!==hovered){hovered=currentHit;easingHover=true;}
      canvas.style.cursor=hovered?'pointer':'default';
    }
    const keepPainting=Boolean(tween||easingHover||now<paintUntil)&&!(isResearch(mode)&&!tween);
    root.dataset.settled=String(!keepPainting);
    if(keepPainting)requestDraw();
  }
  function requestDraw(){if(!raf)raf=requestAnimationFrame(render);}
  function resize(){
    const bounds=root.getBoundingClientRect();
    W=bounds.width;H=bounds.height;dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    if(spheres)spheres.resize();
    camera=targetFor(mode,world);tween=null;root.dataset.moving='false';paintUntil=performance.now()+180;
    down=null;pointer.inside=false;hovered='';canvas.style.cursor='';
    if(raf)cancelAnimationFrame(raf);
    if(isResearch(mode)){raf=0;root.dataset.settled='true';}
    else render(performance.now());
  }
  function canvasPoint(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)*W/r.width,y:(event.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointermove',event=>{
    if(infoOpen)return;
    pointer={...canvasPoint(event),inside:true};
    if(event.pointerType!=='touch')keyboard=false;
    hovered=hitAt(pointer.x,pointer.y);requestDraw();
  });
  canvas.addEventListener('pointerleave',()=>{pointer.inside=false;hovered='';requestDraw();});
  canvas.addEventListener('pointerdown',event=>{
    if(infoOpen||event.button!==0)return;
    down={...canvasPoint(event),id:event.pointerId};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup',event=>{
    if(!down||down.id!==event.pointerId)return;
    const {x,y}=canvasPoint(event);
    const moved=Math.hypot(x-down.x,y-down.y);down=null;
    if(moved>8)return;
    keyboard=false;
    const hit=hitAt(x,y);
    if(hit==='back')back();
    else if(buttons[hit]){
      buttons[hit].focus({preventScroll:true});choose(hit);
    }
    requestDraw();
  });
  canvas.addEventListener('pointercancel',()=>{down=null;});
  Object.entries(buttons).forEach(([key,button])=>{
    button.addEventListener('click',()=>choose(key));
    button.addEventListener('focus',requestDraw);
    button.addEventListener('blur',requestDraw);
    button.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();keyboard=true;
        if(!event.repeat)choose(key);
      }
      if(event.key===' '&&event.repeat)event.preventDefault();
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();keyboard=true;buttons[key==='mars'?'moon':'mars'].focus({preventScroll:true});requestDraw();
      }
    });
  });
  backButton.addEventListener('click',()=>back());
  document.getElementById('atlas-back').addEventListener('click',()=>back());
  document.getElementById('discover-back').addEventListener('click',()=>back());
  document.getElementById('investigate-back').addEventListener('click',()=>back());
  document.getElementById('atlas').addEventListener('discover',event=>change('discover',world,{cell:event.detail}));
  document.getElementById('discover').addEventListener('investigate',event=>change('investigate',world,event.detail));
  backButton.addEventListener('focus',requestDraw);
  backButton.addEventListener('blur',requestDraw);
  document.addEventListener('keydown',event=>{
    if(infoOpen){
      if(event.key==='Escape'){event.preventDefault();closeInfo();return;}
      if(event.key==='Tab')trapInfoFocus(event);
      return;
    }
    if(event.key==='Tab'){keyboard=true;requestDraw();}
    if(event.key==='Escape'&&mode!=='overview'){event.preventDefault();keyboard=true;back();}
  });
  function restoreRoute(immediate=false){
    const previous=world;
    if(infoOpen)closeInfo();
    const [hash,search]=location.hash.slice(1).split('?');
    const query=new URLSearchParams(search),cell=query.get('cell');
    const options={history:false,immediate};
    if(/^enter-(mars|moon)$/.test(hash))change('atlas',hash.slice(6),{...options,cell});
    else if(/^(discover|investigate)-(mars|moon)$/.test(hash)){
      const [stage,key]=hash.split('-'),source=atlas.cell(cell);
      if(source?.key!==(key==='mars'?'ma':'mo')||source.missing)change('atlas',key,{immediate,replace:true});
      else if(stage==='investigate'&&!investigate.hasPair(source,query.get('site'))){
        query.delete('site');
        change('discover',key,{immediate,cell,query,replace:true});
      }else change(stage,key,{...options,cell,query});
    }
    else {
      const focus=['mars','moon'].includes(hash);
      change(focus?'focus':'overview',focus?hash:'',options);
      if(!immediate&&(focus||previous))buttons[focus?hash:previous].focus({preventScroll:true});
    }
  }
  addEventListener('popstate',()=>restoreRoute());
  reduce.addEventListener('change',()=>{camera=targetFor(mode,world);tween=null;root.dataset.moving='false';requestDraw();});
  new ResizeObserver(resize).observe(canvas);


  const infoLayer=document.getElementById('info-layer');
  const infoSheet=document.getElementById('info-sheet');
  const infoNav=Array.from(document.querySelectorAll('[data-info]'));
  const infoClose=document.getElementById('info-close');
  function openInfo(name,opener){
    if(infoOpen===name){closeInfo();return;}
    window.ElsewhereSound.cue('expand');
    if(!infoOpen)infoOpener=opener||document.activeElement;
    infoOpen=name;root.dataset.info=name;
    pointer.inside=false;hovered='';down=null;requestDraw();
    root.classList.add('info-open');
    infoLayer.setAttribute('role','dialog');infoLayer.setAttribute('aria-modal','true');
    infoLayer.setAttribute('aria-labelledby','heading-'+name);
    document.getElementById('destinations').inert=true;
    document.getElementById('scene-navigation').inert=true;
    atlas.setObscured(true);
    discover.setObscured(true);
    investigate.setObscured(true);
    infoSheet.inert=false;infoSheet.setAttribute('aria-hidden','false');
    infoClose.hidden=false;
    document.querySelectorAll('.info-panel').forEach(panel=>panel.hidden=panel.id!=='panel-'+name);
    infoNav.forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.info===name)));
    const panel=document.getElementById('panel-'+name);panel.scrollTop=0;
    document.getElementById('heading-'+name).focus({preventScroll:true});
  }
  function closeInfo(){
    if(!infoOpen)return;
    infoOpen='';delete root.dataset.info;root.classList.remove('info-open');
    infoLayer.removeAttribute('role');infoLayer.removeAttribute('aria-modal');infoLayer.removeAttribute('aria-labelledby');
    infoSheet.inert=true;infoSheet.setAttribute('aria-hidden','true');
    infoClose.hidden=true;
    document.getElementById('destinations').inert=false;
    document.getElementById('scene-navigation').inert=false;
    atlas.setObscured(false);
    discover.setObscured(false);
    investigate.setObscured(false);
    infoNav.forEach(button=>button.setAttribute('aria-expanded','false'));
    if(infoOpener?.isConnected)infoOpener.focus({preventScroll:true});
    requestDraw();
  }
  function trapInfoFocus(event){
    const targets=Array.from(infoLayer.querySelectorAll('button:not([hidden]),input,a[href],summary'))
      .filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
    const first=targets[0],last=targets[targets.length-1],active=document.activeElement;
    if(event.shiftKey&&(active===first||!targets.includes(active))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(active===last||!targets.includes(active))){event.preventDefault();first?.focus();}
  }
  infoNav.forEach(button=>button.addEventListener('click',()=>openInfo(button.dataset.info,button)));
  infoClose.addEventListener('click',closeInfo);
  document.getElementById('info-dismiss').addEventListener('click',closeInfo);
  infoSheet.inert=true;

  resize();
  const ready=Promise.all(['mars','moon'].map(key=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
      const graded=document.createElement('canvas');graded.width=image.naturalWidth;graded.height=image.naturalHeight;
      const material=graded.getContext('2d');material.filter=key==='mars'?'saturate(.74)':'saturate(.72)';material.drawImage(image,0,0);
      images[key]=graded;
      try {spheres?.upload(key,graded);} catch {spheres=null;}
      resolve();
    };
    image.onerror=reject;image.src='art/'+key+'-sphere-v2.png';
  })));
  ready.then(()=>{
    root.dataset.ready='true';
    restoreRoute(true);
    requestDraw();
  }).catch(()=>{document.getElementById('asset-error').hidden=false;});
})();

