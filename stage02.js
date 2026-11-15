'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const atlas=$('atlas'),globe=$('globe'),title=$('atlas-title'),ways=$('ways');
  const D=window.ANALOG_DATA;
  const base='https://trek.nasa.gov/tiles/';
  const bodies={
    mars:{key:'ma',name:'Mars',step:2.5,view:{lat:-9.5,lon:-69.5,zoom:1},
      tiles:base+'Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'},
    moon:{key:'mo',name:'Moon',step:5,view:{lat:10.5,lon:-18,zoom:1},
      tiles:base+'Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'}
  };
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const wrap=lon=>((lon+180)%360+360)%360-180;
  const keyOf=(lat,lon)=>lat+','+lon;
  const fmt=(lat,lon)=>`${Math.abs(lat).toFixed(2)}°${lat<0?'S':'N'}, ${Math.abs(lon).toFixed(2)}°${lon<0?'W':'E'}`;
  const cells={ma:new Map(),mo:new Map()},byId=new Map(),counts=new Map();
  const storage='elsewhere-atlas-v1';
  let saved={};
  try {saved=JSON.parse(sessionStorage.getItem(storage))||{};} catch {}
  let body='',config,state,frame=0,drag=null,highlight=null,keyboardCell=null;
  let resizePending=true,scrollBeforeInfo=0,departTimer=0;
  let map;

  for(const [id,[key,lat,lon,type,distance]] of Object.entries(D?.cells||{})){
    const cell={id,key,lat,lon,type,distance,missing:!D.arch?.[type]};
    cells[key].set(keyOf(lat,lon),cell);byId.set(id,cell);
  }
  for(const row of D?.rows||[])counts.set(row.t,(counts.get(row.t)||0)+1);
  for(const config of Object.values(bodies)){
    const {key,step}=config,half=step/2;
    config.pits=Object.entries(D?.caves?.p||{})
      .filter(([,feature])=>feature.b===key)
      .map(([id,feature])=>({id,...feature}))
      .sort((a,b)=>a.n.localeCompare(b.n));
    config.missing=[];
    for(let lat=-90+half;lat<90;lat+=step){
      for(let lon=-180+half;lon<180;lon+=step){
        const cell=cells[key].get(keyOf(lat,lon));
        if(!cell||cell.missing)config.missing.push({lat,lon});
      }
    }
  }
  function cellAt(lat,lon,cfg=config){
    const step=cfg.step,half=step/2;
    const cl=clamp(Math.floor((lat+90)/step)*step-90+half,-90+half,90-half);
    const cn=Math.floor((wrap(lon)+180)/step)*step-180+half;
    return cells[cfg.key].get(keyOf(cl,cn))||{lat:cl,lon:cn,missing:true};
  }
  function store(){
    if(!body)return;
    saved[body]={
      view:state.view,selection:state.selected?[state.selected.lat,state.selected.lon]:null,
      pit:state.pit,ways:ways.open
    };
    try {sessionStorage.setItem(storage,JSON.stringify(saved));} catch {}
  }
  const approach=['Typical of its class','Fairly typical','Loosely typical','Atypical, read with care'];
  function renderSelection(){
    const c=state.selected;
    $('region-coordinates').textContent=c?fmt(c.lat,c.lon):'No region selected';
    $('region-status').textContent=c?.missing?'No study data for this region.':'';
    $('region-data').hidden=!c||c.missing;
    $('discover-next').hidden=!c||c.missing;
    if(c&&!c.missing){
      const a=D.arch[c.type],q=D.cellDist?.[config.key];
      const index=q?.findIndex(bound=>c.distance<=bound)??-1;
      $('region-type').textContent='Shared by '+a.n.toLocaleString('en-US')+' cells';
      $('region-typicality').textContent=c.distance==null?'Not reported':c.distance.toFixed(2)+(q?' · '+approach[index<0?3:index]:'');
      const conditions=[];
      if(a.elev!=null)conditions.push(a.elev.toLocaleString('en-US')+' m elevation');
      if(a.tm!=null)conditions.push(Math.round(a.tm+273.15)+' K mean temperature');
      if(a.p!=null)conditions.push(a.p+' kPa pressure');
      $('region-conditions').textContent=conditions.join(' · ')||'Not reported';
      $('region-count').textContent=counts.get(c.type)?.toLocaleString('en-US')||'No Earth sites compared';
    }
    const pits=c?config.pits.filter(p=>cellAt(p.lat,p.lon).lat===c.lat&&cellAt(p.lat,p.lon).lon===c.lon):[];
    $('region-pits').replaceChildren(...pits.map(p=>{
      const li=document.createElement('li');
      const size=[p.w==null?'':Math.round(p.w)+' m wide',p.d==null?'':Math.round(p.d)+' m deep'].filter(Boolean);
      li.textContent=[p.n,p.c,...size].join(' · ');return li;
    }));
    $('region-pits').hidden=pits.length===0;
  }
  function mapStatus(status){
    atlas.dataset.imagery=status;
    $('map-status').textContent={
      ready:'',loading:'Loading surface imagery…',
      failed:'Surface imagery could not load. The coordinate grid is still selectable.',
      unavailable:'WebGL is unavailable. The coordinate grid is still selectable.'
    }[status];
    $('map-source').textContent=status==='failed'||status==='unavailable'?'Coordinate globe':'';
    draw();
  }
  function draw(){
    if(!body||atlas.inert||frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      if(!body||atlas.inert)return;
      if(resizePending){map.resize();resizePending=false;}
      map.paint({...state,hover:highlight||keyboardCell,step:config.step,total:64800/config.step**2,missing:config.missing,pits:config.pits});
      const c=highlight||keyboardCell;
      $('cursor').textContent=c?fmt(c.lat,c.lon)+(c.missing?' · No data':''):'';
    });
  }
  function updateView(view){
    state.view={lat:clamp(view.lat,-89.75,89.75),lon:wrap(view.lon),zoom:clamp(view.zoom,1,6)};
    $('zoom-in').disabled=state.view.zoom>=6;$('zoom-out').disabled=state.view.zoom<=1;
    draw();
  }
  function select(cell,{center=false,pit=null}={}){
    if(!cell.missing)window.ElsewhereSound.cue('select');
    state.selected=cell;state.pit=pit;
    if(pit)$('pit-choice').value=pit;
    highlight=keyboardCell=null;
    if(center)updateView({lat:cell.lat,lon:cell.lon,zoom:state.view.zoom});
    $('latitude').value=cell.lat;$('longitude').value=cell.lon;
    renderSelection();store();draw();
    writeCellHash(cell);
    $('announcement').textContent=fmt(cell.lat,cell.lon)+(cell.missing?'. No study data.':'.');
  }
  function writeCellHash(cell){
    const [path]=location.hash.split('?');
    history.replaceState(history.state,'',path+'?cell='+encodeURIComponent(cell.id||keyOf(cell.lat,cell.lon)));
  }
  function fromHash(token){
    const cell=byId.get(token);
    if(cell?.key===config.key)return cell;
    if(token&&/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(token)){
      const [lat,lon]=token.split(',').map(Number);
      if(Math.abs(lat)<=90&&Math.abs(lon)<=180)return cellAt(lat,lon);
    }
    return null;
  }
  function open(key,token,{animate=false}={}){
    map??=window.createPlanetMap($('globe-surface'),$('grid-map'),mapStatus);
    const fresh=body!==key;
    body=key;config=bodies[key];
    const pref=saved[key]||{};
    const linked=fromHash(token);
    const selected=linked||(pref.selection?cellAt(...pref.selection):null);
    const recenter=linked&&(!pref.selection||pref.selection[0]!==linked.lat||pref.selection[1]!==linked.lon);
    state={selected,pit:recenter?null:pref.pit||null,view:pref.view||{...config.view}};
    if(recenter)state.view={...state.view,lat:linked.lat,lon:linked.lon};
    highlight=keyboardCell=drag=null;
    clearTimeout(departTimer);
    atlas.hidden=false;atlas.inert=false;atlas.classList.remove('depart');
    atlas.classList.toggle('arrive',animate);
    if(fresh){atlas.scrollTop=0;ways.open=Boolean(pref.ways);}
    title.textContent=config.name;
    globe.setAttribute('aria-label',config.name+' globe, '+config.step+' degree grid');
    $('map-hint').textContent='Drag to rotate. Click or tap a '+config.step+'° region to inspect it.';
    $('latitude').value=selected?.lat??'';
    $('longitude').value=selected?.lon??'';
    $('pit-choice').replaceChildren(...config.pits.map(p=>new Option(p.n,p.id)));
    if(state.pit)$('pit-choice').value=state.pit;
    $('locate-pit').disabled=config.pits.length===0;
    $('pit-count').textContent='('+config.pits.length+')';
    const total=Math.round(64800/config.step**2);
    $('atlas-coverage').textContent=D?
      `${(total-config.missing.length).toLocaleString('en-US')} / ${total.toLocaleString('en-US')} cells covered`:
      'Research data could not load. Reload to restore region details.';
    renderSelection();
    if(fresh){
      map.load(key,config.tiles,null,'imagery/'+key+'-{z}-{y}-{x}.jpg');
      if(atlas.dataset.imagery!=='unavailable'&&!navigator.connection?.saveData)window.EarthDiscovery.prepareImagery();
    }
    resizePending=true;updateView(state.view);
    title.focus({preventScroll:true});
    store();
    if(selected&&!token)writeCellHash(selected);
  }
  function close({depart=false}={}){
    store();body='';drag=highlight=keyboardCell=null;
    cancelAnimationFrame(frame);frame=0;
    map.hide();atlas.classList.remove('arrive');
    if(depart){
      atlas.inert=true;atlas.classList.add('depart');
      departTimer=setTimeout(()=>{atlas.hidden=true;atlas.classList.remove('depart');},480);
    }else atlas.hidden=true;
  }
  function setObscured(obscured){
    if(obscured)scrollBeforeInfo=atlas.scrollTop;
    atlas.inert=obscured||atlas.classList.contains('depart');
    if(!obscured&&!atlas.hidden){atlas.scrollTop=scrollBeforeInfo;resizePending=true;draw();}
  }
  function point(event){
    const rect=globe.getBoundingClientRect();
    return [event.clientX-rect.left,event.clientY-rect.top];
  }
  function fromPoint(point){
    const pos=map.locationAt(...point);
    return pos?cellAt(pos.lat,pos.lon):null;
  }
  function discoverSelection(){
    if(state.selected&&!state.selected.missing)atlas.dispatchEvent(new CustomEvent('discover',{detail:state.selected.id}));
  }
  globe.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||!body)return;
    const pos=point(event);
    drag={origin:pos,view:state.view,moving:false,id:event.pointerId};
    keyboardCell=null;
    globe.setPointerCapture(event.pointerId);
    globe.focus({preventScroll:true});
  });
  globe.addEventListener('pointermove',event=>{
    if(!body||!event.isPrimary)return;
    const pos=point(event);
    if(drag?.id===event.pointerId){
      const dx=pos[0]-drag.origin[0],dy=pos[1]-drag.origin[1];
      if(Math.hypot(dx,dy)>7)drag.moving=true;
      if(drag.moving){
        globe.classList.add('dragging');highlight=null;
        const move=55/Math.max(1,map.radius);
        updateView({...drag.view,lat:drag.view.lat+dy*move,lon:drag.view.lon-dx*move});
        return;
      }
    }
    if(event.pointerType!=='touch')highlight=fromPoint(pos);
    globe.classList.toggle('over-surface',Boolean(highlight));draw();
  });
  globe.addEventListener('pointerup',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const cell=fromPoint(point(event));
    if(!drag.moving&&cell)select(cell);
    finishDrag();
  });
  function finishDrag(){drag=null;globe.classList.remove('dragging');store();draw();}
  globe.addEventListener('pointercancel',finishDrag);
  globe.addEventListener('lostpointercapture',()=>{if(drag)finishDrag();});
  globe.addEventListener('pointerleave',()=>{highlight=null;globe.classList.remove('over-surface');draw();});
  globe.addEventListener('wheel',event=>{
    if(!body||event.ctrlKey||!fromPoint(point(event)))return;
    event.preventDefault();
    zoom(Math.exp(clamp(-event.deltaY*(event.deltaMode===1?.03:.0018),-.4,.4)));
  },{passive:false});
  function zoom(multiplier){updateView({...state.view,zoom:state.view.zoom*multiplier});store();}
  $('zoom-in').addEventListener('click',()=>zoom(1.35));
  $('zoom-out').addEventListener('click',()=>zoom(1/1.35));
  globe.addEventListener('keydown',event=>{
    const keys={ArrowUp:[1,0],ArrowDown:[-1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
    if(!Object.hasOwn(keys,event.key)&&!['Enter',' ','+','=','-','_'].includes(event.key))return;
    event.preventDefault();
    highlight=null;
    const c=keyboardCell||state.selected||cellAt(state.view.lat,state.view.lon);
    if(keys[event.key]){
      const [dLat,dLon]=keys[event.key];
      keyboardCell=cellAt(c.lat+dLat*config.step,c.lon+dLon*config.step);
      updateView({...state.view,lat:keyboardCell.lat,lon:keyboardCell.lon});
      $('announcement').textContent='Target '+fmt(keyboardCell.lat,keyboardCell.lon);
      store();
    }else if(event.key==='Enter'||event.key===' ')select(c,{center:true});
    else zoom(event.key==='+'||event.key==='='?1.35:1/1.35);
  });
  globe.addEventListener('blur',()=>{keyboardCell=null;draw();});
  $('coordinates').addEventListener('submit',event=>{
    event.preventDefault();
    select(cellAt($('latitude').valueAsNumber,$('longitude').valueAsNumber),{center:true});
  });
  $('locate-pit').addEventListener('click',()=>{
    const pit=config.pits.find(item=>item.id===$('pit-choice').value);
    if(!pit)return;
    select(cellAt(pit.lat,pit.lon),{pit:pit.id});
    updateView({lat:pit.lat,lon:pit.lon,zoom:Math.max(state.view.zoom,1.6)});
    store();
  });
  $('discover-next').addEventListener('click',discoverSelection);
  ways.addEventListener('toggle',store);
  new ResizeObserver(()=>{resizePending=true;draw();}).observe(globe);
  window.PlanetAtlas={open,close,setObscured,cell:id=>byId.get(id)};
})();
