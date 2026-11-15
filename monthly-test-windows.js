'use strict';

(() => {
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const metrics=[
    {key:'temperature',name:'Temperature',unit:'K · mean / min',fields:['temp_mean_K','temp_min_K'],decimals:0},
    {key:'sunlight',name:'Sunlight',unit:'W/m² · 24 h mean',fields:['solar_MJ_m2_day'],decimals:0,scale:11.574},
    {key:'elevation',name:'Noon sun elevation',unit:'° · Negative = below horizon',fields:['noon_sun_elevation_deg'],decimals:0},
    {key:'wind',name:'Wind',unit:'m/s',fields:['wind_m_s'],decimals:1},
    {key:'pressure',name:'Dynamic pressure',unit:'Pa · derived',fields:['dynamic_pressure_Pa'],decimals:1}
  ];
  const rules={
    night:{metric:'sunlight',tone:'blue'},
    midnight_sun:{tone:'gold'},
    low_sun:{metric:'elevation',tone:'gold'},
    mars_cold:{metric:'temperature',tone:'blue'},
    mars_solar:{metric:'sunlight',tone:'gold'},
    moon_lowlat_solar:{metric:'sunlight',tone:'gold'},
    strong_wind:{metric:'pressure',tone:'blue'}
  };

  function element(tag,text,css){
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(css)node.className=css;
    return node;
  }

  function heading(scope,text){
    const node=element('th',text);
    node.scope=scope;
    return node;
  }

  function formatReading(value,metric){
    if(!Number.isFinite(value))return '—';
    const adjusted=value*(metric.scale??1);
    const formatted=metric.decimals?adjusted.toFixed(metric.decimals):String(Math.round(adjusted));
    return formatted.replace('-', '−');
  }

  function mount(container,climate,environments){
    const panel=element('div',null,'monthly-test-windows');
    const names=new Map(environments.map(environment=>[environment.key,environment.en]));
    const windows=climate.bars.flatMap(bar=>{
      const info=names.get(bar.env);
      return info?[{bar,info,rule:rules[bar.env]??{tone:'blue'}}]:[];
    });
    const finding=element('section',null,'window-finding');
    finding.setAttribute('aria-labelledby','window-matching-title');
    const tally=element('div',null,'window-tally');
    const findingTitle=element('h4','Matching months');
    findingTitle.id='window-matching-title';
    const count=element('p',null,'window-count');
    count.setAttribute('role','status');
    const countValue=element('strong','—');
    count.append(countValue,element('span',' / 12'));
    tally.append(findingTitle,count);
    const calendar=element('ol',null,'window-calendar');
    calendar.setAttribute('aria-label','Matching months from January to December');
    const monthLights=months.map(month=>{
      const item=element('li',null,'window-month');
      const light=element('span',null,'window-light');
      light.setAttribute('aria-hidden','true');
      for(const tone of ['blue','gold']){
        const layer=element('span',null,'window-light-layer');
        layer.dataset.tone=tone;
        light.append(layer);
      }
      item.append(light,element('span',month,'window-month-name'));
      calendar.append(item);
      return item;
    });
    finding.append(tally,calendar);

    const evidenceHeading=element('div',null,'window-evidence-heading');
    evidenceHeading.append(element('h4','Site conditions'),element('p','Modelled monthly climatology, 2016–2025.','window-climate-note'));
    const scroll=element('div',null,'window-grid-scroll');
    scroll.tabIndex=0;
    scroll.setAttribute('role','region');
    scroll.setAttribute('aria-label','Monthly site conditions');

    const table=element('table',null,'window-grid');
    table.setAttribute('aria-label','Monthly climate data for this site');
    const columns=element('colgroup'),monthColumns=element('col');
    monthColumns.span=12;
    columns.append(element('col'),monthColumns);
    const tableHead=element('thead'),headRow=element('tr');
    headRow.append(heading('col','Metric'),...months.map(month=>heading('col',month)));
    tableHead.append(headRow);

    const readings=element('tbody');
    const fields=metrics.map(metric=>{
      const row=element('tr');
      row.dataset.metric=metric.key;
      const label=heading('row',metric.name);
      label.append(element('small',metric.unit,'window-unit'));
      row.append(label);
      const cells=months.map((_,index)=>{
        const cell=element('td',null,'window-reading');
        const values=metric.fields.map(field=>formatReading(climate.months[index]?.[field],metric));
        cell.append(element('span',values[0],'window-value'));
        if(values.length>1)cell.append(element('span',values[1],'window-minimum'));
        row.append(cell);
        return cell;
      });
      readings.append(row);
      return {metric,row,cells};
    });

    table.append(columns,tableHead,readings);
    scroll.append(table);

    const controls=element('div',null,'window-switch');
    controls.setAttribute('role','group');
    controls.setAttribute('aria-label','Test window');
    const summary=element('div');
    summary.setAttribute('aria-live','polite');
    const details=element('dl',null,'window-details');
    const definition=element('div'),suggestion=element('div');
    const ruleText=element('dd'),testText=element('dd');
    definition.append(element('dt','Rule'),ruleText);
    suggestion.append(element('dt','Suggested test'),testText);
    details.append(definition,suggestion);
    summary.append(details);

    let active=null;
    const buttons=windows.map((entry,index)=>{
      const button=element('button',entry.info.name);
      button.type='button';
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>select(active===entry?null:entry));
      button.addEventListener('keydown',event=>{
        const move=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0;
        if(!move)return;
        event.preventDefault();
        const next=(index+move+buttons.length)%buttons.length;
        buttons[next].focus();
        select(windows[next]);
      });
      controls.append(button);
      return button;
    });

    function select(entry){
      active=entry;
      const match=new Set(entry?.bar.months);
      const tone=entry?.rule.tone;
      finding.dataset.tone=tone??'';
      finding.classList.toggle('has-selection',Boolean(entry));
      countValue.textContent=entry||!windows.length?String(match.size):'—';
      for(const {metric,row,cells} of fields){
        const isSource=metric.key===entry?.rule.metric;
        if(isSource)row.dataset.tone=tone;
        row.classList.toggle('is-source',isSource);
        cells.forEach((cell,index)=>{
          const lit=isSource&&match.has(index+1);
          if(lit)cell.dataset.tone=tone;
          cell.classList.toggle('is-evidence',lit);
        });
      }
      monthLights.forEach((cell,index)=>{
        const lit=match.has(index+1);
        if(lit){
          cell.dataset.tone=tone;
          cell.classList.toggle('is-run-start',!match.has(index));
          cell.classList.toggle('is-run-end',!match.has(index+2));
        }
        cell.classList.toggle('is-match',lit);
        cell.setAttribute('aria-label',months[index]+(entry?(lit?' meets the selected rule':' is outside the selected window'):''));
      });
      buttons.forEach((button,index)=>{
        const selected=entry===windows[index];
        if(selected)button.dataset.tone=tone;
        button.setAttribute('aria-pressed',String(selected));
      });
      details.hidden=!entry;
      if(entry){
        ruleText.textContent=entry.info.rule;
        testText.textContent=entry.info.experiments;
      }
    }

    select(windows[0]??null);
    if(windows.length)panel.append(controls);
    panel.append(finding,evidenceHeading,scroll,summary);
    container.replaceChildren(panel);
  }

  window.MonthlyTestWindows={mount};
})();
