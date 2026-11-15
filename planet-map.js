'use strict';
window.createPlanetMap=function(host,overlay,onStatus){
  const surface=document.createElement('canvas');
  host.append(surface);
  const ctx=overlay.getContext('2d');
  const gl=surface.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false});
  const radians=Math.PI/180,degrees=1/radians;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const wrap=lon=>((lon+180)%360+360)%360-180;
  let width=0,height=0,ratio=1,cloud=null,initialImage=null,baseTiles=null,body='',imagery=null,view=null;
  let detailRect=null;
  let radius=0,cx=0,cy=0,sinLat=0,cosLat=1;
  const imageryCache=new Map();
  function renderer(){
    if(!gl)return null;
    const program=gl.createProgram();
    function attach(type,source){
      const shader=gl.createShader(type);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    attach(gl.VERTEX_SHADER,`
      attribute vec2 a; varying vec2 screen;
      void main(){screen=a;gl_Position=vec4(a,0.,1.);}
    `);
    attach(gl.FRAGMENT_SHADER,`
      precision highp float;
      varying vec2 screen;
      uniform vec2 uScale,uCenter,uLat;
      uniform float uLon,uImage,uMars,uEarth;
      uniform sampler2D uMap,uDetail;
      uniform vec4 uDetailRect;
      void main(){
        vec2 xy=(screen-uCenter)*uScale;
        float r=length(xy);
        if(r>1.)discard;
        vec3 n=vec3(xy,sqrt(max(0.,1.-dot(xy,xy))));
        float lat=asin(clamp(n.y*uLat.y+n.z*uLat.x,-1.,1.));
        float lon=uLon+atan(n.x,n.z*uLat.y-n.y*uLat.x);
        float u=.5+lon/6.28318531;
        vec2 uv=vec2(uEarth>.5?fract(u):u,.5-lat/3.14159265);
        vec3 img=texture2D(uMap,uv).rgb;
        if(uDetailRect.z>0.){
          vec2 local=(uv-uDetailRect.xy)/uDetailRect.zw;
          vec2 edge=min(local,1.-local);
          float blend=smoothstep(0.,.12,min(edge.x,edge.y));
          if(blend>0.)img=mix(img,texture2D(uDetail,local).rgb,blend);
        }
        float lum=dot(img,vec3(.299,.587,.114));
        float keyLight=max(0.,dot(n,normalize(vec3(-.58,.28,1.))));
        float light=.53+.51*keyLight;
        if(uEarth>.5){
          float blue=smoothstep(.005,.055,img.b-max(img.r,img.g));
          float shadows=1.-smoothstep(.035,.27,lum);
          vec3 lift=mix(vec3(.028,.039,.049),vec3(.058,.104,.158),blue);
          img=mix(vec3(lum),img,.86)+shadows*lift;
          light=.66+.36*keyLight;
        }else{
          img=mix(vec3(lum),img,.72);
        }
        vec3 base=mix(vec3(.14,.17,.20),vec3(.24,.16,.14),uMars);
        vec3 rgb=mix(base,img,uImage)*light;
        gl_FragColor=vec4(rgb,1.-smoothstep(.993,1.,r));
      }
    `);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const attr=gl.getAttribLocation(program,'a');
    gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    const u=Object.fromEntries(['uScale','uCenter','uLat','uLon','uImage','uMars','uEarth','uDetail','uDetailRect'].map(k=>[k,gl.getUniformLocation(program,k)]));
    const texture=gl.createTexture();
    const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const detail=gl.createTexture();
    const empty=new Uint8Array([0,0,0,255]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,detail);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,empty);
    gl.uniform1i(u.uDetail,1);
    gl.activeTexture(gl.TEXTURE0);
    return {
      upload(image){
        const imageWidth=image.naturalWidth||image.width;
        if(imageWidth>maxTextureSize){
          const scaled=document.createElement('canvas');
          scaled.width=maxTextureSize;scaled.height=maxTextureSize/2;
          const resample=scaled.getContext('2d');
          resample.imageSmoothingQuality='high';
          resample.drawImage(image,0,0,scaled.width,scaled.height);
          image=scaled;
        }
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,body==='earth'?gl.CLAMP_TO_EDGE:gl.REPEAT);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      },
      uploadDetail(image){
        gl.activeTexture(gl.TEXTURE1);
        if(image)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,empty);
        gl.activeTexture(gl.TEXTURE0);
      },
      paint(){
        gl.viewport(0,0,surface.width,surface.height);
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(u.uScale,width/(2*radius),height/(2*radius));
        gl.uniform2f(u.uCenter,cx/width*2-1,1-cy/height*2);
        gl.uniform2f(u.uLat,sinLat,cosLat);gl.uniform1f(u.uLon,view.lon*radians);
        gl.uniform1f(u.uImage,imagery?1:0);gl.uniform1f(u.uMars,body==='mars'?1:0);
        gl.uniform1f(u.uEarth,body==='earth'?1:0);
        if(detailRect&&view.zoom>=3.2)gl.uniform4fv(u.uDetailRect,detailRect);
        else gl.uniform4f(u.uDetailRect,0,0,0,0);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }
    };
  }
  let drawSurface;
  try {drawSurface=renderer();} catch {drawSurface=null;}
  surface.addEventListener('webglcontextlost',event=>{
    event.preventDefault();drawSurface=null;imagery=null;detailRect=null;
    surface.style.visibility='hidden';if(body)onStatus('unavailable');
  });
  surface.addEventListener('webglcontextrestored',()=>{
    try {drawSurface=renderer();surface.style.visibility='';}
    catch {return;}
    if(body&&cloud)load(body,cloud,initialImage,baseTiles);
  });
  function load(nextBody,url,prepareImage=null,bootstrapUrl=url){
    body=nextBody;cloud=url;initialImage=prepareImage;baseTiles=bootstrapUrl;imagery=null;
    if(!drawSurface){onStatus('unavailable');return;}
    let item=imageryCache.get(body);
    if(!item||item.status==='failed'){
      item={status:'loading',image:null,level:-1,requestedLevel:prepareImage?2:0};
      imageryCache.set(body,item);
      if(prepareImage)loadInitialImage(nextBody,url,item,prepareImage);
      else loadLevel(nextBody,bootstrapUrl,item,0,bootstrapUrl===url?null:url);
    }
    if(item.image)useImage(item.image);
    onStatus(item.status);
  }
  async function loadInitialImage(key,url,item,prepareImage){
    const image=await prepareImage();
    if(!image){
      loadLevel(key,url,item,item.requestedLevel);
      return;
    }
    applyImage(key,item,image,'ready');
  }
  function applyImage(key,item,image,status){
    item.image=image;item.status=status;
    if(body!==key||!drawSurface)return;
    useImage(image);onStatus(status);
  }
  async function loadLevel(key,url,item,level,fallbackUrl=null){
    // GIBS geographic tiles are 512 px and pad their eastern and southern edges.
    const earth=key==='earth';
    const span=earth?288/2**level:180/2**level;
    const rows=Math.ceil(180/span),cols=Math.ceil(360/span);
    const image=document.createElement('canvas');
    image.width=256*2**(level+1);image.height=image.width/2;
    const tiles=image.getContext('2d');
    const tileCount=cols*rows;
    const readTile=i=>new Promise((resolve,reject)=>{
      const tile=new Image();
      const finish=(callback)=>{clearTimeout(timeout);tile.onload=null;tile.onerror=null;callback();};
      const timeout=setTimeout(()=>finish(()=>{tile.removeAttribute('src');reject();}),7500);
      tile.crossOrigin='anonymous';tile.referrerPolicy='no-referrer';
      tile.onload=()=>finish(()=>{
        const x=i%cols,y=Math.floor(i/cols);
        const lon=Math.min(span,360-x*span),lat=Math.min(span,180-y*span);
        const left=Math.round(x*span*image.width/360),right=Math.round((x*span+lon)*image.width/360);
        const top=Math.round(y*span*image.height/180),bottom=Math.round((y*span+lat)*image.height/180);
        tiles.drawImage(tile,0,0,tile.naturalWidth*lon/span,tile.naturalHeight*lat/span,
          left,top,right-left,bottom-top);
        resolve();
      });
      tile.onerror=()=>finish(reject);
      tile.src=url.replace('{z}',level).replace('{y}',Math.floor(i/cols)).replace('{x}',i%cols);
    });
    let next=0;
    async function readTiles(){
      while(next<tileCount)await readTile(next++);
    }
    try {
      await Promise.all(Array.from({length:Math.min(6,tileCount)},readTiles));
    }catch{
      next=tileCount;
      if(fallbackUrl){loadLevel(key,fallbackUrl,item,level);return;}
      if(!item.image){
        item.status='failed';if(body===key&&drawSurface)onStatus('failed');
      }
      return;
    }
    item.level=level;
    applyImage(key,item,image,earth?'limited':'ready');
  }
  function useImage(image){drawSurface.upload(image);imagery=image;}
  function resize(){
    width=overlay.clientWidth;height=overlay.clientHeight;
    ratio=Math.min(devicePixelRatio||1,1.5);
    if(width&&height){
      overlay.width=surface.width=Math.round(width*ratio);
      overlay.height=surface.height=Math.round(height*ratio);
    }
  }
  function setDetail(image,{south,west,north,east}){
    if(!drawSurface)return;
    drawSurface.uploadDetail(image);
    detailRect=[(west+180)/360,(90-north)/180,(east-west)/360,(north-south)/180];
  }
  function hide(){
    body='';cloud=initialImage=baseTiles=null;
    if(detailRect)drawSurface?.uploadDetail(null);
    detailRect=null;
  }
  function project(lat,lon){
    const a=lat*radians,l=(lon-view.lon)*radians;
    const c=Math.cos(a),s=Math.sin(a),f=Math.cos(l);
    return [cx+radius*c*Math.sin(l),cy-radius*(cosLat*s-sinLat*c*f),sinLat*s+cosLat*c*f];
  }
  function locationAt(x,y){
    if(!view||!radius)return null;
    const a=(x-cx)/radius,b=(cy-y)/radius,r2=a*a+b*b;
    if(r2>1)return null;
    const z=Math.sqrt(1-r2);
    return {
      lat:Math.asin(clamp(b*cosLat+z*sinLat,-1,1))*degrees,
      lon:wrap(view.lon+Math.atan2(a,z*cosLat-b*sinLat)*degrees)
    };
  }
  function line(points){
    let previousVisible=false;
    points.forEach(([lat,lon])=>{
      const [x,y,z]=project(lat,lon);
      if(z>=0){if(previousVisible)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
      previousVisible=z>=0;
    });
  }
  function box(lat,lon,half,color,thickness,dashed=false){
    const south=lat-half,north=lat+half,west=lon-half,east=lon+half;
    ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.setLineDash(dashed?[3,3]:[]);
    ctx.beginPath();
    const segment=Array.from({length:13},(_,i)=>i/12);
    line(segment.map(t=>[south,west+(east-west)*t]));
    line(segment.map(t=>[south+(north-south)*t,east]));
    line(segment.map(t=>[north,east-(east-west)*t]));
    line(segment.map(t=>[north-(north-south)*t,west]));
    ctx.stroke();ctx.setLineDash([]);
  }
  function grid(step){
    ctx.beginPath();
    for(let lat=-90+step;lat<90;lat+=step){
      line(Array.from({length:181},(_,i)=>[lat,i*2-180]));
    }
    for(let lon=-180;lon<180;lon+=step){
      line(Array.from({length:91},(_,i)=>[i*2-90,lon]));
    }
    ctx.stroke();
  }
  function paint(state){
    if(!width||!height)return;
    view=state.view;
    cx=width*.5;cy=(height-34)*.5;
    radius=Math.max(1,Math.min(width*.465,(height-52)*.487))*view.zoom;
    const item=imageryCache.get(body);
    const targetLevel=radius*ratio>=225?2:1;
    if(body!=='earth'&&drawSurface&&item?.status==='ready'&&item.level===item.requestedLevel&&item.level<targetLevel){
      item.requestedLevel=item.level+1;
      loadLevel(body,cloud,item,item.requestedLevel);
    }
    sinLat=Math.sin(view.lat*radians);cosLat=Math.cos(view.lat*radians);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    if(drawSurface)drawSurface.paint();
    if(!drawSurface){
      const fill=ctx.createRadialGradient(cx-radius*.28,cy-radius*.22,radius*.08,cx,cy,radius);
      fill.addColorStop(0,body==='mars'?'#43312b':body==='earth'?'#263e4b':'#2f383f');fill.addColorStop(1,'#121920');
      ctx.fillStyle=fill;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fill();
    }
    ctx.save();
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
    ctx.strokeStyle=imagery?'rgba(230,233,229,.17)':'rgba(191,207,219,.28)';
    ctx.lineWidth=.8;
    grid(state.step&&view.zoom>2.25?state.step:30);
    if(state.missing?.length>0&&state.missing.length/state.total<.22){
      for(const cell of state.missing){
        const [x,y,z]=project(cell.lat,cell.lon);
        if(z>0&&x>-45&&x<width+45&&y>-45&&y<height+45)box(cell.lat,cell.lon,state.step/2,'#101315',1.8,true);
      }
    }
    for(const pit of state.pits||[]){
      const [x,y,z]=project(pit.lat,pit.lon);
      if(z<.05)continue;
      const size=pit.id===state.pit?9:5;
      ctx.strokeStyle=pit.id===state.pit?'#def3ff':'#89bdd1';
      ctx.lineWidth=1;ctx.strokeRect(x-size/2,y-size/2,size,size);
    }
    if(state.hover)box(state.hover.lat,state.hover.lon,state.step/2,'#fff7e6',1.25,state.hover.missing);
    if(state.selected)box(state.selected.lat,state.selected.lon,state.step/2,'#f1bf92',2,state.selected.missing);
    for(const point of state.points||[]){
      const [x,y,z]=project(point.lat,point.lon);
      if(z<.02)continue;
      const active=point.id===state.active||point.id===state.preview;
      ctx.lineWidth=active?1.5:1;ctx.strokeStyle=active?'#fff4dc':'#e9ad80';
      const r=active?6:3;
      ctx.strokeRect(x-r,y-r,r*2,r*2);
    }
    ctx.restore();
  }
  function pointAt(x,y,points){
    if(!locationAt(x,y))return null;
    let distance=14,nearest=null;
    for(const point of points){
      const [px,py,z]=project(point.lat,point.lon);
      const d=Math.hypot(x-px,y-py);
      if(z>=.02&&d<distance){distance=d;nearest=point;}
    }
    return nearest;
  }
  return {load,hide,resize,paint,setDetail,locationAt,pointAt,project,get radius(){return radius;}};
};
