'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const panel=$('discover'),globe=$('earth-globe'),list=$('candidate-list'),refine=$('refine');
  const candidateDetail=$('candidate-focus'),candidateNotes=$('candidate-notes'),investigateButton=$('candidate-investigate');
  const D=window.ANALOG_DATA;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const tiles='https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/{z}/{y}/{x}.jpg';
  const imageryUrl=(bounds,width,height)=>'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'+new URLSearchParams({
    SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',LAYERS:'BlueMarble_NextGeneration',STYLES:'default',
    FORMAT:'image/jpeg',CRS:'EPSG:4326',BBOX:bounds.join(','),TRANSPARENT:'false',WIDTH:width,HEIGHT:height
  });
  const storage='elsewhere-discovery-v1';
  const wrap=lon=>((lon+180)%360+360)%360-180;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const fmt=(lat,lon)=>`${Math.abs(lat).toFixed(2)}°${lat<0?'S':'N'}, ${Math.abs(lon).toFixed(2)}°${lon<0?'W':'E'}`;
  const names=D?.dims||[];
  const groups=new Map();
  for(const row of D?.rows||[]){
    const site=D.sites[row.s];
    if(!groups.has(row.t))groups.set(row.t,[]);
    groups.get(row.t).push({row,id:row.id,lat:site.lat,lon:site.lon,
      name:(site.name||'Site near '+fmt(site.lat,site.lon)).replace(/\s*\(estimated from coordinates\)/i,'')});
  }
  let saved={};
  try {saved=JSON.parse(sessionStorage.getItem(storage))||{};} catch {}
  let world='',source,state,points=[],activePreview=null,priority=[],drag=null;
  let frame=0,resizePending=true,offsetBeforeInfo=0,flight=null;
  const buttons=new Map();
  let map;
  let imageRequest,detailRequest=null,loadedDetail=null;
  function prepareImagery(){
    if(imageRequest)return imageRequest;
    imageRequest=new Promise(resolve=>{
      const image=new Image();
      function finish(value){clearTimeout(timer);resolve(value);}
      const timer=setTimeout(()=>{finish(null);image.removeAttribute('src');},12000);
      image.crossOrigin='anonymous';
      image.referrerPolicy='no-referrer';
      image.src='imagery/earth-blue-marble.jpg';
      image.decode().then(()=>finish(image),()=>finish(null));
    });
    return imageRequest;
  }
  const inputs=names.map((name,index)=>{
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';
    input.addEventListener('change',()=>{
      if(!input.checked&&state.enabled.filter(Boolean).length===1){input.checked=true;return;}
      state.enabled[index]=input.checked;
      window.ElsewhereSound.cue('select');
      renderList();store();writeHash();
    });
    label.append(input,document.createTextNode(name));
    $('comparison-dimensions').append(label);
    return input;
  });
  function imageryStatus(status){
    panel.dataset.imagery=status;
    if(status==='unavailable'){cancelDetailRequest();loadedDetail=null;}
    $('earth-status').textContent={
      loading:'Loading Earth imagery…',ready:'',
      limited:'High-resolution imagery could not load. A lower-resolution map is available.',
      unavailable:'WebGL is unavailable. Candidate locations and the list are available.',
      failed:'Earth imagery could not load. Candidate locations and the list are available.'
    }[status];
    $('earth-source').textContent=status==='failed'||status==='unavailable'?'Coordinate globe':'';
    draw();
  }
  function cancelDetailRequest(){
    if(!detailRequest)return;
    clearTimeout(detailRequest.timer);
    detailRequest.controller?.abort();
    detailRequest=null;
  }
  function coversView(bounds){
    if(!bounds)return false;
    const {south,west,north,east}=bounds,{lat,lon}=state.view;
    return lat>=(south===-90?south:south+4)&&lat<=(north===90?north:north-4)&&
      lon>=(west===-180?west:west+6)&&lon<=(east===180?east:east-6);
  }
  function updateDetail(){
    const hasImagery=['ready','limited'].includes(panel.dataset.imagery);
    if(!hasImagery||state.view.zoom<3.2||map.radius*Math.min(devicePixelRatio||1,1.5)<850||
       navigator.connection?.saveData||flight||drag){
      cancelDetailRequest();
      return;
    }
    if(coversView(loadedDetail)){cancelDetailRequest();return;}
    if(coversView(detailRequest?.bounds))return;
    // Snap the bounds so small rotations reuse the same image.
    const south=clamp(Math.round(state.view.lat/12)*12-12,-90,66);
    const west=clamp(Math.round(state.view.lon/18)*18-18,-180,144);
    cancelDetailRequest();
    const bounds={south,west,north:south+24,east:west+36};
    const request={bounds,timer:setTimeout(()=>loadDetail(request),420)};
    detailRequest=request;
  }
  async function loadDetail(request){
    const controller=new AbortController();
    request.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),6500);
    try {
      const {bounds}=request,{south,west,north,east}=bounds;
      const response=await fetch(imageryUrl([south,west,north,east],1536,1024),{
        signal:controller.signal,referrerPolicy:'no-referrer'
      });
      if(!response.ok)return;
      const image=await createImageBitmap(await response.blob());
      try {
        if(detailRequest!==request||controller.signal.aborted)return;
        map.setDetail(image,bounds);
        loadedDetail=bounds;
        draw();
      }finally{image.close();}
    }catch{
      // Keep the full globe visible when a regional image cannot be fetched.
    }finally{clearTimeout(timeout);}
  }
  // Same ordering as integration/site/template.html, including how its comparator handles lunar Dust.
  function score(row){
    let weakest=null,missing=0;
    state.enabled.forEach((enabled,k)=>{
      if(!enabled)return;
      if(row.d[k]==null||(k===3&&row.abs)){missing++;return;}
      const similarity=1-row.pc[k];
      weakest=weakest==null?similarity:Math.min(weakest,similarity);
    });
    return {weakest,missing};
  }
  function sort(){
    priority=points.map(point=>({point,...score(point.row)}))
      .sort((a,b)=>a.missing-b.missing||((b.weakest??-1)-(a.weakest??-1)))
      .map(entry=>entry.point);
  }
  function store(){
    if(!world)return;
    const entry=saved[world]??={sources:{}};
    entry.enabled=state.enabled;entry.refine=refine.open;
    entry.sources[source.id]={view:state.view,site:state.site,listTop:list.scrollTop,pageTop:panel.scrollTop};
    try {sessionStorage.setItem(storage,JSON.stringify(saved));} catch {}
  }
  function writeHash(){
    const query=new URLSearchParams({cell:source.id,d:state.enabled.map(Number).join('')});
    if(state.site)query.set('site',state.site);
    history.replaceState(history.state,'','#discover-'+world+'?'+query);
  }
  function renderList(){
    const top=list.scrollTop;
    sort();buttons.clear();
    $('candidate-count').textContent='('+priority.length+')';
    $('candidates-empty').hidden=priority.length>0;
    $('candidates-empty').textContent='No Earth sites have been compared with this environment type.';
    const medals=['gold','silver','bronze'];
    list.replaceChildren(...priority.map((point,i)=>{
      const li=document.createElement('li'),button=document.createElement('button');
      button.type='button';button.className='candidate';button.dataset.site=point.id;
      // Top three get a medal frame, but only when every selected dimension has data.
      const rank=score(point.row),medal=i<3&&rank.missing===0&&rank.weakest!=null?medals[i]:null;
      if(medal){
        li.className='medal medal-'+medal;
        const badge=document.createElement('span');badge.className='medal-rank';badge.textContent=String(i+1);
        badge.setAttribute('aria-label','Rank '+(i+1));button.append(badge);
      }
      const label=document.createElement('span'),small=document.createElement('small'),arrow=document.createElement('span');
      label.textContent=point.name;small.textContent=fmt(point.lat,point.lon);label.append(small);
      arrow.className='candidate-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';button.append(label,arrow);
      button.setAttribute('aria-pressed',String(point.id===state.site));
      button.setAttribute('aria-expanded','false');
      button.addEventListener('click',()=>select(point));
      li.append(button);buttons.set(point.id,button);return li;
    }));
    renderSelected();
    list.scrollTop=top;
  }
  function renderSelected(point=points.find(p=>p.id===state.site)){
    const button=buttons.get(point?.id);
    candidateDetail.hidden=!button;
    if(!button)return;
    button.after(candidateDetail);
    button.setAttribute('aria-expanded','true');
    button.setAttribute('aria-controls',candidateDetail.id);
    const notes=[],missing=names.filter((_,k)=>point.row.d[k]==null&&point.row.st[k]!=='not_applicable');
    if(missing.length)notes.push('No data for '+missing.join(', '));
    if(point.row.abs)notes.push('No positive ice evidence');
    if(point.row.st[5]==='not_applicable')notes.push('Dust not applicable');
    candidateNotes.textContent=notes.join(' · ');
    investigateButton.setAttribute('aria-label','Investigate site · '+point.name);
  }
  function fly(to){
    if(reduce.matches){flight=null;state.view=to;updateZoomButtons();}
    else flight={from:{...state.view},to,start:performance.now()};
    draw();
  }
  function draw(){
    if(!world||panel.inert||frame)return;
    frame=requestAnimationFrame(now=>{
      frame=0;
      if(!world||panel.inert)return;
      if(resizePending){map.resize();resizePending=false;}
      if(flight){
        const t=clamp((now-flight.start)/560,0,1),p=(1-Math.cos(Math.PI*t))/2,{from,to}=flight;
        state.view={lat:from.lat+(to.lat-from.lat)*p,lon:wrap(from.lon+wrap(to.lon-from.lon)*p),zoom:from.zoom+(to.zoom-from.zoom)*p};
        if(t===1){flight=null;updateZoomButtons();store();}
      }
      map.paint({view:state.view,points,active:state.site,preview:activePreview?.id});
      updateDetail();
      const label=activePreview||points.find(point=>point.id===state.site);
      $('earth-point').textContent=label?.name||'';
      if(flight)draw();
    });
  }
  function aim(point,zoom=state.view.zoom){
    return {lat:clamp(point.lat,-89.75,89.75),lon:point.lon,zoom};
  }
  function select(point,fromMap=false){
    if(state.site!==point.id)window.ElsewhereSound.cue('confirm');
    const previous=buttons.get(state.site),button=buttons.get(point.id);
    const scroller=getComputedStyle(list).overflowY==='auto'?list:panel;
    const rowTop=button.getBoundingClientRect().top;
    state.site=point.id;activePreview=null;
    if(previous&&previous!==button){
      previous.setAttribute('aria-pressed','false');
      previous.setAttribute('aria-expanded','false');
      previous.removeAttribute('aria-controls');
    }
    button.setAttribute('aria-pressed','true');renderSelected(point);
    if(!fromMap)scroller.scrollTop+=button.getBoundingClientRect().top-rowTop;
    const bounds=scroller.getBoundingClientRect();
    const visibleTop=scroller===list?bounds.top:80;
    const visibleBottom=Math.min(innerHeight,bounds.bottom)-6;
    if(fromMap&&button.getBoundingClientRect().top<visibleTop){
      scroller.scrollTop+=button.getBoundingClientRect().top-visibleTop;
    }
    const overflow=candidateDetail.getBoundingClientRect().bottom-visibleBottom;
    if(overflow>0)scroller.scrollTop+=overflow;
    fly(aim(point,Math.max(1.08,state.view.zoom)));
    writeHash();store();
    $('announcement').textContent=point.name+' selected.';
  }
  investigateButton.addEventListener('click',()=>{
    if(!state.site)return;
    panel.dispatchEvent(new CustomEvent('investigate',{detail:{
      cell:source.id,query:new URLSearchParams({site:state.site,d:state.enabled.map(Number).join('')})
    }}));
  });
  function open(key,id,query,{animate=false,restoreFocus=false}={}){
    map??=window.createPlanetMap($('earth-surface'),$('earth-overlay'),imageryStatus);
    world=key;source=window.PlanetAtlas.cell(id);
    points=groups.get(source.type)||[];
    const pref=saved[world]||{},sourcePref=pref.sources?.[id]||{};
    const bits=query?.get('d');
    const valid=bits&&/^[01]{6}$/.test(bits)&&bits.includes('1');
    const requested=query?.get('site')||sourcePref.site;
    const picked=points.find(point=>point.id===requested);
    state={enabled:valid?Array.from(bits,bit=>bit==='1'):[...(pref.enabled||names.map(()=>true))],site:picked?.id||null,view:null};
    sort();
    const first=picked||priority[0];
    state.view=sourcePref.view&&(!picked||picked.id===sourcePref.site)?sourcePref.view:
      first?{lat:clamp(first.lat,-55,55),lon:first.lon,zoom:1}:{lat:18,lon:20,zoom:1};
    if(picked&&picked.id!==sourcePref.site)state.view=aim(picked);
    activePreview=drag=flight=null;
    panel.hidden=false;panel.classList.toggle('arrive',animate);
    $('discover-origin').textContent=(world==='mars'?'Mars':'Moon')+' · '+fmt(source.lat,source.lon)+' · Environment type '+source.type;
    refine.open=Boolean(pref.refine);inputs.forEach((input,k)=>input.checked=state.enabled[k]);
    renderList();map.load('earth',tiles,prepareImagery);resizePending=true;
    panel.scrollTop=sourcePref.pageTop||0;list.scrollTop=sourcePref.listTop||0;
    if(picked&&picked.id!==sourcePref.site)candidateDetail.scrollIntoView({block:'nearest'});
    (restoreFocus&&state.site?investigateButton:$('discover-title')).focus({preventScroll:true});
    updateZoomButtons();writeHash();draw();
  }
  function close(){
    if(flight)state.view=flight.to;
    store();world='';activePreview=drag=flight=null;
    cancelAnimationFrame(frame);frame=0;
    cancelDetailRequest();loadedDetail=null;
    map.hide();panel.hidden=true;panel.classList.remove('arrive');
  }
  function setObscured(value){
    if(value){offsetBeforeInfo=panel.scrollTop;activePreview=null;cancelDetailRequest();}
    panel.inert=value;
    if(!value&&!panel.hidden){panel.scrollTop=offsetBeforeInfo;resizePending=true;draw();}
  }
  function local(event){
    const r=globe.getBoundingClientRect();
    return [(event.clientX-r.left)*globe.clientWidth/r.width,(event.clientY-r.top)*globe.clientHeight/r.height];
  }
  function updateZoomButtons(){
    $('earth-in').disabled=state.view.zoom>=6;$('earth-out').disabled=state.view.zoom<=1;
  }
  function update(view){
    flight=null;state.view={lat:clamp(view.lat,-89.75,89.75),lon:wrap(view.lon),zoom:clamp(view.zoom,1,6)};
    updateZoomButtons();draw();
  }
  function zoom(amount){update({...state.view,zoom:state.view.zoom*amount});store();}
  globe.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||!world)return;
    flight=null;
    drag={id:event.pointerId,at:local(event),view:state.view,moved:false};
    globe.setPointerCapture(event.pointerId);globe.focus({preventScroll:true});
  });
  globe.addEventListener('pointermove',event=>{
    if(!world||!event.isPrimary)return;
    const [x,y]=local(event);
    if(drag?.id===event.pointerId){
      const dx=x-drag.at[0],dy=y-drag.at[1];
      if(Math.hypot(dx,dy)>7)drag.moved=true;
      if(drag.moved){
        activePreview=null;globe.classList.add('dragging');
        const scale=55/Math.max(1,map.radius);
        update({...drag.view,lat:drag.view.lat+dy*scale,lon:drag.view.lon-dx*scale});return;
      }
    }
    if(event.pointerType==='mouse')activePreview=map.pointAt(x,y,points);
    globe.classList.toggle('on-candidate',Boolean(activePreview));draw();
  });
  function endDrag(){
    drag=null;globe.classList.remove('dragging');store();draw();
  }
  globe.addEventListener('pointerup',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const point=map.pointAt(...local(event),points);
    if(!drag.moved&&point)select(point,true);
    endDrag();
  });
  globe.addEventListener('pointercancel',endDrag);
  globe.addEventListener('lostpointercapture',()=>{if(drag)endDrag();});
  globe.addEventListener('pointerleave',()=>{activePreview=null;globe.classList.remove('on-candidate');draw();});
  globe.addEventListener('wheel',event=>{
    if(!world||event.ctrlKey||!map.locationAt(...local(event)))return;
    event.preventDefault();zoom(Math.exp(clamp(-event.deltaY*(event.deltaMode===1?.03:.0018),-.4,.4)));
  },{passive:false});
  globe.addEventListener('keydown',event=>{
    const direction={ArrowLeft:[0,-10],ArrowRight:[0,10],ArrowUp:[10,0],ArrowDown:[-10,0]}[event.key];
    if(direction){
      event.preventDefault();
      update({...state.view,lat:state.view.lat+direction[0],lon:state.view.lon+direction[1]});store();
    }else if(['+','=','-','_'].includes(event.key)){
      event.preventDefault();zoom(event.key==='+'||event.key==='='?1.35:1/1.35);
    }
  });
  $('earth-in').addEventListener('click',()=>zoom(1.35));
  $('earth-out').addEventListener('click',()=>zoom(1/1.35));
  refine.addEventListener('toggle',store);
  reduce.addEventListener('change',()=>{if(flight){const to=flight.to;update(to);store();}});
  new ResizeObserver(()=>{resizePending=true;draw();}).observe(globe);
  window.EarthDiscovery={open,close,setObscured,prepareImagery,get cellId(){return source?.id;}};
})();
