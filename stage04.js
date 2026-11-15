'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const panel=$('investigate'),D=window.ANALOG_DATA;
  const worldNames={mars:'Mars',moon:'Moon'};
  const pairs=new Map((D?.rows||[]).map(row=>[row.id,row]));
  const timelines=window.REGION_TIMELINE_DATA;
  const missions={
    rover_mobility:['Rover mobility','Move farther, slip less.','Slip ratio and normalized sinkage.',
      'Wheel load (W), soil density (ρ), gravity (g), wheel width (b), wheel diameter (D), cohesion (c), speed (v), slope (tan θ), and sinkage (z).'],
    drilling_sampling:['Drilling & sampling','Reach beneath the surface.','Specific energy, penetration rate, and sample success.',
      'Axial force (F), torque (T), rotation rate (ω), bit diameter (D), penetration rate (vₚ), density (ρ), cohesion (c), gravity (g), and grain size (d).'],
    thermal_control:['Thermal control','Keep systems stable in extreme temperatures.','Peak component temperature and thermal margin.',
      'Thermal diffusivity (α), time (t), thickness (L), heat-transfer coefficient (h), conductivity (k), emissivity (ε), Stefan–Boltzmann constant (σ), and temperature (T).'],
    power_continuity:['Power continuity','Keep the mission powered through light and darkness.','Energy availability and minimum state of charge.',
      'Load power (P), panel efficiency (η), solar irradiance (I), panel area (A), battery capacity (E), and dark-period duration (t).'],
    ice_resource_operations:['Ice resource operations','Turn hidden ice into usable resources.','Recovery fraction and energy per kilogram.',
      'Specific heat (cₚ), temperature rise (ΔT), latent heat (L_f), thermal diffusivity (α), time (t), sample size (L), and chamber pressure (P).'],
    dust_mitigation:['Dust mitigation','Keep dust out and missions running.','Dust ingress rate and deposition fraction.',
      'Particle density (ρₚ), gas density (ρ_f), particle size (d), flow speed (v), viscosity (μ), gravity (g), and surface shear (τ).']
  };
  const caveRecords=D?.caves;
  const disclosures=['site-monthly','site-engineering','site-evidence','site-caves'].map($);
  let current=null,timelineMounted=false,scrollBeforeInfo=0;
  const fmt=(lat,lon)=>`${Math.abs(lat).toFixed(2)}°${lat<0?'S':'N'}, ${Math.abs(lon).toFixed(2)}°${lon<0?'W':'E'}`;
  function el(tag,text,cls){
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(cls)node.className=cls;
    return node;
  }
  function hasPair(cell,id){
    const row=pairs.get(id);
    return Boolean(row&&row.t===cell.type&&D.sites[row.s]);
  }
  const percentile=pc=>Math.round(100*(1-pc));
  function renderHighlights(row){
    const ranked=row.pc.map((pc,k)=>({k,pc})).filter(({k,pc})=>
      pc!=null&&row.d[k]!=null&&!(k===3&&row.abs)&&row.st[k]!=='not_applicable');
    ranked.sort((a,b)=>a.pc-b.pc||a.k-b.k);
    const first=ranked[0],last=ranked.at(-1);
    const axis=$('site-percentile-axis'),finding=$('site-finding');
    axis.replaceChildren();
    $('site-highlights').hidden=!first;
    if(!first){finding.textContent='Comparison data is unavailable for this pair.';return;}
    const tied=first!==last&&first.pc===last.pc;
    if(tied)finding.textContent='The comparable dimensions share the same percentile.';
    else {
      const lead='Closest on '+D.dims[first.k].toLowerCase()+'.';
      finding.textContent=first===last?lead+' Only one dimension has comparable data.':lead+' '+D.dims[last.k]+' is the weakest match.';
    }
    const highlights=first===last||tied?[first]:[last,first];
    const labels=[];
    axis.append(el('span','0','percentile-endpoint'));
    for(const metric of highlights){
      const value=percentile(metric.pc),mark=el('span',null,'percentile-mark');
      const label=(tied?'Tied dimensions':D.dims[metric.k])+' · '+(value/100).toFixed(2);
      mark.dataset.edge=metric===first&&highlights.length>1?'closest':'weakest';
      mark.style.setProperty('--percentile',value+'%');
      mark.style.setProperty('--label-shift',value<27?'0%':value>73?'-100%':'-50%');
      mark.append(el('span',label,'percentile-label'));
      axis.append(mark);labels.push(label);
    }
    axis.append(el('span','1','percentile-endpoint'));
    axis.setAttribute('aria-label','Similarity from 0 to 1. '+labels.join('. ')+'.');
  }
  function comparisonKey(row){
    const proxies=D.dims.filter((_,k)=>row.st[k]==='used_proxy'&&row.pc[k]!=null&&
      row.d[k]!=null&&!(k===3&&row.abs));
    return '';  // owner removed the explanatory sentence under Result
  }
  function comparison(row){
    return D.dims.map((name,k)=>{
      const tr=el('tr'),label=el('th',name),value=el('td');
      label.scope='row';
      let text='';
      if(row.st[k]==='not_applicable')text='Not applicable';
      else if(k===3&&row.abs)text='No positive ice evidence';
      else if(row.d[k]==null||row.pc[k]==null){text='No data';value.className='comparison-missing';}
      else {
        const pct=percentile(row.pc[k]);
        const meter=el('div',null,'similarity-value'),track=el('span',null,'similarity-track');
        track.setAttribute('aria-hidden','true');track.style.setProperty('--similarity',pct+'%');track.append(el('span'));
        meter.append(el('span',(pct/100).toFixed(2)),track);value.append(meter);
      }
      if(text){const message=el('span',text,value.className?'comparison-unavailable comparison-missing':'comparison-unavailable');value.append(message);}
      tr.append(label,value);return tr;
    });
  }
  function timeline(){
    if(!current||timelineMounted||!$('site-monthly').open)return;
    timelineMounted=true;
    const {site,row}=current,container=$('site-timeline');
    const key={siteId:site.c,packageId:row.id,lat:site.lat,lon:site.lon};
    const climate=timelines&&window.RegionTimeline?.findSite(timelines,key);
    if(!climate){
      container.textContent='Monthly climatology is unavailable for this study area.';
      return;
    }
    window.MonthlyTestWindows.mount(container,climate,timelines.environments);
  }
  function scenario(mission,target){
    if(!mission)return [el('p','No engineering scenario is included for this Earth–planet pair.')];
    const [task,tagline,measures,variables]=missions[mission.task]||['Engineering test'];
    const source=mission.ev==='real_reference_single_run'?
      'Scenario based on one JPL rover reference run and assumed site inputs.':'Synthetic physics scenario with assumed site inputs.';
    const flow=el('div',null,'site-mission-flow'),before=el('div'),after=el('div'),transfer=el('div',null,'transfer');
    before.append(el('span','Earth · Initial mismatch'),el('strong',mission.bd.toFixed(3)));
    transfer.append(el('span','Scale transfer'),el('i'));
    after.append(el('span',target+' · Residual Π mismatch'),el('strong',mission.ad.toFixed(3)));
    flow.append(before,transfer,after);
    const recipe=el('dl',null,'site-recipe');
    for(const [input,multiplier] of mission.m){
      const block=el('div'),pct=Math.round(Math.abs(multiplier-1)*100);
      block.append(el('dt',input),el('dd',multiplier>1.03?'↑ '+pct+'%':multiplier<.97?'↓ '+pct+'%':'Unchanged'));
      recipe.append(block);
    }
    const report=[el('h4',tagline?task+' · '+tagline:task),el('p',source)];
    if(mission.ni)report.push(el('p','Both water-ice proxies are ≤ 0.05. The task assignment filters out only pairs with two exact zeros.','mission-ice-note'));
    report.push(flow,el('h4','Adjustments to the original Earth test'),recipe);
    if(measures)report.push(scenarioDetails(measures,variables,mission.g));
    return report;
  }
  function scenarioDetails(measures,variables,groups){
    const details=el('details',null,'scenario-details');
    const parameters=el('dl');
    parameters.append(el('dt','Measures'),el('dd',measures),el('dt','Candidate parameters'),el('dd',variables));
    const table=el('table',null,'comparison-table scenario-pi');
    table.setAttribute('aria-label','Absolute log mismatch by dimensionless group');
    const head=el('thead'),heading=el('tr'),readings=el('tbody');
    for(const label of ['Π group','Before','After']){
      const cell=el('th',label);
      cell.scope='col';
      heading.append(cell);
    }
    head.append(heading);
    for(const [group,before,after] of groups){
      const row=el('tr'),name=el('th',group);
      name.scope='row';
      row.append(name,el('td',before.toFixed(3)),el('td',after.toFixed(3)));
      readings.append(row);
    }
    table.append(head,readings);
    details.append(el('summary','Test parameters and Π groups'),parameters,table);
    return details;
  }
  function evidence(row,cell,target,enabled){
    const notes=[
      el('h4','Comparison basis'),
      el('p',target+' reference · '+cell.type+'. The study combines terrain descriptors with modelled and proxy inputs.')
    ];
    const omitted=D.dims.filter((_,k)=>enabled[k]==='0');
    if(omitted.length)notes.push(el('p','Candidate sorting excluded '+new Intl.ListFormat('en').format(omitted)+'.'));
    if(row.abs)notes.push(el('p','Both water-ice proxies are ≤ 0.05. Actual ice presence remains unknown.'));
    const limits=[el('h4','Research limits'),
      el('p','Field conditions and access need local verification. Planetary gravity, pressure and radiation are outside the scope of this regional comparison. This study is independent of NASA site selection.')];
    if(row.mt)limits.push(el('p','The engineering values are scenario estimates. Field measurements and certified settings remain outside its scope.'));
    return [...notes,...limits];
  }
  function pitMatches(cell,world){
    const half=world==='mars'?1.25:2.5;
    return Object.entries(caveRecords?.p||{}).filter(([,pit])=>pit.b===cell.key&&
      Math.abs(pit.lat-cell.lat)<=half&&Math.abs(((pit.lon-cell.lon+540)%360)-180)<=half);
  }
  function m(value,unit){return value==null?null:Math.round(value)+' m '+unit;}
  function caves(pits,target){
    if(!pits.length)return [el('p','The team catalogue lists no planetary pits or caves in the selected '+target+' cell.')];
    const groups=pits.map(([id,pit])=>{
      const group=el('div',null,'cave-group');
      const info=[pit.c,fmt(pit.lat,pit.lon),m(pit.w,'wide'),m(pit.d,'deep')].filter(Boolean);
      group.append(el('h4',pit.n),el('p',info.join(' · ')));
      const matches=caveRecords.x.filter(([,feature])=>feature===id).sort((a,b)=>
        a[2]===b[2]?(a[3]??9)-(b[3]??9):a[2]==='g'?-1:1).slice(0,5);
      if(!matches.length){group.append(el('p','No matching Earth cave is listed.'));return group;}
      const list=el('ul');
      for(const [earthId,,mode,distance] of matches){
        const cave=caveRecords.e[earthId],item=el('li'),place=el('div');
        const facts=[m(cave.w,'wide'),m(cave.d,'deep')].filter(Boolean);
        place.append(el('strong',cave.n));
        if(facts.length)place.append(el('span',' · '+facts.join(' · ')));
        const match=mode==='g'?(distance==null?'Geometry distance unavailable':'Geometry distance '+distance.toFixed(2)):'Same formation process';
        item.append(place,el('span',match));
        list.append(item);
      }
      group.append(list);return group;
    });
    const attribution=el('a','Cave data © OpenStreetMap contributors');
    attribution.href='https://www.openstreetmap.org/copyright';
    attribution.target='_blank';
    attribution.rel='noopener';
    const credit=el('p',null,'cave-attribution');
    credit.append(attribution);
    return [el('p','Matches come from the Earth cave shortlist. A smaller geometry distance means closer recorded dimensions. Formation matches may lack size measurements.'),...groups,credit];
  }
  function open(world,cellId,query,{animate=false}={}){
    const cell=window.PlanetAtlas.cell(cellId),row=pairs.get(query.get('site')),site=D.sites[row.s],target=worldNames[world];
    const bits=query.get('d');
    const enabled=bits&&/^[01]{6}$/.test(bits)&&bits.includes('1')?bits:'111111';
    const name=(site.name||'Site near '+fmt(site.lat,site.lon)).replace(/\s*\(estimated from coordinates\)/i,'');
    current={row,site};timelineMounted=false;
    panel.hidden=false;panel.classList.toggle('arrive',animate);panel.scrollTop=0;
    const separator=name.lastIndexOf(',');
    const place=separator>0?name.slice(0,separator).trim():name;
    const country=separator>0?name.slice(separator+1).trim():'';
    $('site-title').setAttribute('aria-label',name);
    $('site-place').textContent=place;
    $('site-country').textContent=country;
    $('site-country').hidden=!country;
    document.querySelector('.site-heading').toggleAttribute('data-long-name',place.length>22);
    $('site-coordinates').textContent=$('site-coordinates-unplaced').textContent=fmt(site.lat,site.lon);
    $('site-origin').textContent='Compared with '+(world==='moon'?'the Moon':target)+' · '+fmt(cell.lat,cell.lon);
    renderHighlights(row);
    $('comparison-key').textContent=comparisonKey(row);
    $('site-dimensions').replaceChildren(...comparison(row));
    $('site-timeline').replaceChildren();
    const hasMonths=timelines&&window.RegionTimeline?.findSite(timelines,{siteId:site.c});
    $('monthly-summary').hidden=Boolean(hasMonths);
    $('engineering-summary').hidden=Boolean(row.mt);
    $('site-mission').replaceChildren(...scenario(row.mt,target));
    $('site-evidence-content').replaceChildren(...evidence(row,cell,target,enabled));
    const pits=pitMatches(cell,world);
    $('caves-summary').hidden=Boolean(pits.length);
    $('site-cave-content').replaceChildren(...caves(pits,target));
    disclosures.forEach(details=>details.open=false);
    window.SiteImagery.show(site,name);
    $('site-title').focus({preventScroll:true});
  }
  function close(){
    window.SiteImagery.clear();current=null;
    panel.hidden=true;panel.classList.remove('arrive');
  }
  function setObscured(obscured){
    if(obscured)scrollBeforeInfo=panel.scrollTop;
    panel.inert=obscured;
    if(!obscured&&!panel.hidden)panel.scrollTop=scrollBeforeInfo;
  }
  $('site-monthly').addEventListener('toggle',timeline);
  $('go-comparison').addEventListener('click',()=>{
    const heading=$('comparison-title');
    heading.focus({preventScroll:true});
    panel.scrollTo({
      top:$('site-comparison').getBoundingClientRect().top-panel.getBoundingClientRect().top+panel.scrollTop-102,
      behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
    });
  });
  window.EarthInvestigation={open,close,setObscured,hasPair};
})();
