'use strict';
(() => {
  const figure=document.getElementById('site-figure');
  const holder=document.getElementById('site-image-holder');
  const marker=document.getElementById('site-marker');
  const markerLabel=document.getElementById('site-marker-label');
  const status=document.getElementById('site-imagery-status');
  const caption=document.getElementById('site-image-caption');
  const currentSource=document.getElementById('current-site-image-source');
  const source=document.getElementById('site-image-source');
  const view=document.getElementById('site-image-view');
  const layers={
    close:{id:'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',
      date:'2000-12-01',size:40,format:'image/png'},
    regional:{id:'BlueMarble_NextGeneration',size:216,format:'image/jpeg'},
    context:{id:'BlueMarble_NextGeneration',size:1800}
  };
  const localViews={
    'C-S55':{key:'close',path:'imagery/herat-weld.png'},
    'F-S34':{key:'regional',path:'imagery/antarctica-regional.jpg'}
  };
  const width=960,height=600;
  const referenceKm=5,minMarkerPixels=15;
  let request=null,referenceFraction=0;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function extent(site,km){
    const halfLat=km/2/111.2*height/width;
    const halfLon=km/2/111.2/Math.max(.05,Math.cos(site.lat*Math.PI/180));
    const south=clamp(site.lat-halfLat,-90,90-2*halfLat);
    const west=clamp(site.lon-halfLon,-180,180-2*halfLon);
    return {south,west,north:south+2*halfLat,east:west+2*halfLon};
  }
  function imageUrl(layer,{south,west,north,east},imageWidth){
    const params=new URLSearchParams({
      SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',LAYERS:layer.id,STYLES:'default',
      FORMAT:layer.format,CRS:'EPSG:4326',TRANSPARENT:String(layer.format==='image/png'),
      BBOX:[south,west,north,east].map(value=>value.toFixed(5)).join(','),WIDTH:imageWidth,HEIGHT:height
    });
    if(layer.date)params.set('TIME',layer.date);
    return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'+params;
  }
  function load(url,signal){
    return new Promise((resolve)=>{
      const image=new Image();
      function finish(result){
        clearTimeout(timer);signal.removeEventListener('abort',cancel);resolve(result);
      }
      function cancel(){finish(null);image.removeAttribute('src');}
      const timer=setTimeout(cancel,11000);
      signal.addEventListener('abort',cancel,{once:true});
      image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';
      image.width=width;image.height=height;image.src=url;
      image.decode().then(()=>finish(image),()=>finish(null));
    });
  }
  function hasCoverage(image,site,bounds){
    const sample=document.createElement('canvas');
    sample.width=40;sample.height=25;
    const context=sample.getContext('2d',{willReadFrequently:true});
    if(!context)return false;
    context.drawImage(image,0,0,sample.width,sample.height);
    const {data}=context.getImageData(0,0,sample.width,sample.height);
    const x=clamp(Math.floor((site.lon-bounds.west)/(bounds.east-bounds.west)*sample.width),0,39);
    const y=clamp(Math.floor((bounds.north-site.lat)/(bounds.north-bounds.south)*sample.height),0,24);
    function covered(offset){
      return data[offset+3]>225&&Math.max(data[offset],data[offset+1],data[offset+2])>5;
    }
    if(!covered((y*sample.width+x)*4))return false;
    let valid=0;
    for(let offset=0;offset<data.length;offset+=4)if(covered(offset))valid++;
    return valid>sample.width*sample.height*.65;
  }
  function updateMarkerLabel(){
    if(marker.hidden)return;
    const scaled=holder.clientWidth*referenceFraction>=minMarkerPixels;
    const text=scaled?'≈ '+referenceKm+' km reference':'Study center';
    if(markerLabel.textContent!==text)markerLabel.textContent=text;
  }
  new ResizeObserver(updateMarkerLabel).observe(holder);
  function present(image,key,site,name,bounds){
    const layer=layers[key];
    const description=(key==='close'?'Satellite close-up of the study area near ':'Satellite overview of the region around ')+name+
      '. The frame is centered on the study coordinates.';
    if(key==='context'){
      image.setAttribute('role','img');image.setAttribute('aria-label',description);
    }else image.alt=description;
    figure.dataset.imagery=key;holder.replaceChildren(image);status.textContent='';
    const x=(site.lon-bounds.west)/(bounds.east-bounds.west);
    const y=(bounds.north-site.lat)/(bounds.north-bounds.south);
    const kmAcross=(bounds.east-bounds.west)*111.2*Math.cos(site.lat*Math.PI/180);
    referenceFraction=referenceKm/kmAcross;
    figure.style.setProperty('--site-marker-x',x*100+'%');
    figure.style.setProperty('--site-marker-y',y*100+'%');
    figure.style.setProperty('--site-marker-span',referenceFraction*100+'%');
    figure.style.setProperty('--site-marker-min',minMarkerPixels+'px');
    marker.dataset.side=x>.50001?'left':'right';
    marker.dataset.vertical=y<.09?'top':y>.91?'bottom':'middle';
    marker.hidden=false;
    updateMarkerLabel();
    const scope=key==='close'?layer.date.slice(0,4)+' composite':'Regional overview';
    view.textContent=scope+' · ≈ '+Math.round(kmAcross)+' km across';
    const url=new URL('https://worldview.earthdata.nasa.gov/');
    url.searchParams.set('l',layer.id);
    url.searchParams.set('v',[bounds.west,bounds.south,bounds.east,bounds.north].map(n=>n.toFixed(5)).join(','));
    if(layer.date)url.searchParams.set('t',layer.date);
    source.href=url.href;
    source.textContent='View '+name+' in NASA Worldview ↗';
    currentSource.hidden=false;
    caption.hidden=false;
  }
  function clear(){
    request?.abort();request=null;
    holder.replaceChildren();marker.hidden=true;caption.hidden=true;currentSource.hidden=true;
    source.removeAttribute('href');
    source.textContent=view.textContent=status.textContent='';
  }
  async function previewRegion(site,name,signal){
    const earth=await window.EarthDiscovery.prepareImagery();
    if(!earth||signal.aborted||figure.dataset.imagery!=='loading')return;
    const bounds=extent(site,layers.context.size);
    const {south,west,north,east}=bounds;
    const preview=document.createElement('canvas');
    preview.width=width;preview.height=height;
    const context=preview.getContext('2d');
    if(!context)return;
    const scaleX=earth.naturalWidth/360,scaleY=earth.naturalHeight/180;
    context.drawImage(earth,(west+180)*scaleX,(90-north)*scaleY,(east-west)*scaleX,(north-south)*scaleY,0,0,width,height);
    present(preview,'context',site,name,bounds);
  }
  async function show(site,name){
    clear();
    const controller=new AbortController(),{signal}=controller;
    request=controller;
    figure.dataset.imagery='loading';status.textContent='Loading satellite imagery…';
    const local=localViews[site.c];
    if(local){
      const image=await load(local.path,signal);
      if(signal.aborted)return;
      if(image){
        present(image,local.key,site,name,extent(site,layers[local.key].size));
        return;
      }
    }
    // A regional frame from the hosted globe gives each site context while the close-up loads.
    const preview=previewRegion(site,name,signal);
    for(const key of ['close','regional']){
      const layer=layers[key],bounds=extent(site,layer.size);
      // High-latitude views cover more degrees of longitude for the same ground distance.
      const imageWidth=key==='regional'&&Math.abs(site.lat)>=70?2400:width;
      const image=await load(imageUrl(layer,bounds,imageWidth),signal);
      if(signal.aborted)return;
      if(image&&hasCoverage(image,site,bounds)){
        present(image,key,site,name,bounds);
        return;
      }
    }
    await preview;
    if(signal.aborted||figure.dataset.imagery==='context')return;
    figure.dataset.imagery='failed';
    status.textContent='Satellite imagery is unavailable for this view.';
  }
  window.SiteImagery={show,clear};
})();
