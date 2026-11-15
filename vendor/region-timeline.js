/* Region F test timeline component. No dependencies.
   Usage:
     RegionFTimeline.mount(containerElement, data, { lang: 'en' | 'zh', siteIds: ['F-S31', ...] (optional) });
   data = contents of region_F_test_timeline.json (or window.REGION_F_TIMELINE_DATA). */
(function (root) {
  'use strict';
  var MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  };
  var T = {
    en: { temp: 'Temperature (mean / min)', tempSub: 'K', solar: 'Sunlight', solarSub: 'W/m², 24-h mean', sun: 'Noon sun elevation', sunSub: 'deg (negative = sun does not rise)', wind: 'Wind', windSub: 'm/s', simulates: 'Simulates', rule: 'Rule', exp: 'Experiments', months: 'Months', none: 'No space-environment window at this site.' },
    zh: { temp: '溫度（均溫 / 最低）', tempSub: 'K', solar: '日照', solarSub: 'W/m²，全日平均', sun: '正午太陽高度', sunSub: '度（負值＝不升起）', wind: '風速', windSub: 'm/s', simulates: '模擬', rule: '判定', exp: '實驗', months: '月份', none: '這個地點沒有可模擬的太空環境時段。' }
  };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function tempColor(k) { var t = Math.max(203, Math.min(303, k)); var a = (t - 203) / 100; return 'hsl(' + (210 - a * 190).toFixed(0) + ' 60% ' + (92 - Math.abs(a - 0.5) * 30).toFixed(0) + '%)'; }
  function sunColor(s) { return 'hsl(42 90% ' + (96 - Math.min(s, 35) / 35 * 45).toFixed(0) + '%)'; }
  function monthText(runs, lang) {
    var M = MONTHS[lang];
    return runs.map(function (r) { return r[0] === r[1] ? M[r[0] - 1] : M[r[0] - 1] + '–' + M[r[1] - 1]; }).join(lang === 'zh' ? '、' : ', ');
  }
  function renderSite(site, data, lang) {
    var L = T[lang], M = MONTHS[lang];
    var envs = {}; data.environments.forEach(function (e) { envs[e.key] = e; });
    var box = el('section', 'rft-site'); box.id = 'rft-' + site.site_id;
    var h = el('h3', 'rft-title'); h.appendChild(document.createTextNode((lang === 'zh' ? (site.name_zh || site.name_en) : (site.name_en || site.name_zh)) || site.site_id));
    box.appendChild(h);
    if (!site.name_en && lang === 'en') box.appendChild(el('small', 'rft-coord', 'English place name not provided yet'));
    var sc = el('div', 'rft-scroll'), g = el('div', 'rft-grid');
    g.appendChild(el('div'));
    M.forEach(function (m) { g.appendChild(el('div', 'rft-hd', m)); });
    function row(label, sub, fn, style) {
      var l = el('div', 'rft-lab'); l.appendChild(el('b', null, label)); l.appendChild(el('small', null, sub)); g.appendChild(l);
      site.months.forEach(function (m) { var c = el('div', 'rft-cell'); var v = fn(m); if (typeof v === 'string') c.textContent = v; else c.appendChild(v); if (style) c.setAttribute('style', style(m)); g.appendChild(c); });
    }
    row(L.temp, L.tempSub, function (m) {
      var w = el('div', 'rft-temp'); w.appendChild(el('span', 'rft-tmean', Math.round(m.temp_mean_K))); w.appendChild(el('span', 'rft-tmin', Math.round(m.temp_min_K))); return w;
    }, function (m) { return 'background:' + tempColor(m.temp_mean_K) + ';color:#14181d'; });
    row(L.solar, L.solarSub, function (m) { return String(Math.round(m.solar_MJ_m2_day * 11.574)); }, function (m) { return 'background:' + sunColor(m.solar_MJ_m2_day) + ';color:#14181d'; });
    row(L.sun, L.sunSub, function (m) { return String(Math.round(m.noon_sun_elevation_deg)); });
    row(L.wind, L.windSub, function (m) { return m.wind_m_s.toFixed(1); });
    g.appendChild(el('div', 'rft-sep'));
    if (!site.bars.length) { var n = el('div', 'rft-none', L.none); g.appendChild(n); }
    site.bars.forEach(function (b) {
      var e = envs[b.env], t = e[lang];
      var l = el('div', 'rft-lab'); var nb = el('b'); var d = el('span', 'rft-swatch'); d.style.background = e.color; nb.appendChild(d); nb.appendChild(document.createTextNode(t.name));
      l.appendChild(nb); l.appendChild(el('small', null, t.experiments)); g.appendChild(l);
      var lane = el('div', 'rft-lane');
      b.runs.forEach(function (r) {
        var bar = el('div', 'rft-bar'); bar.style.background = e.color;
        bar.style.left = 'calc(' + (r[0] - 1) + ' / 12 * 100% + 2px)'; bar.style.width = 'calc(' + (r[1] - r[0] + 1) + ' / 12 * 100% - 4px)';
        var tip = t.name + ' · ' + L.months + ': ' + monthText([r], lang) + '\n' + L.simulates + ': ' + t.space + '\n' + L.rule + ': ' + t.rule;
        bar.title = tip; bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', tip.replace(/\n/g, '; '));
        lane.appendChild(bar);
      });
      g.appendChild(lane);
    });
    sc.appendChild(g); box.appendChild(sc);
    return box;
  }
  function mount(container, data, opts) {
    opts = opts || {}; var lang = opts.lang === 'zh' ? 'zh' : 'en';
    container.classList.add('rft-root'); container.innerHTML = '';
    var sites = data.sites.filter(function (s) { return (!opts.siteIds || opts.siteIds.indexOf(s.site_id) >= 0) && (!opts.regions || opts.regions.indexOf(s.region_id) >= 0); });
    if (opts.showLegend !== false) {
      var lg = el('div', 'rft-legend');
      data.environments.forEach(function (e) {
        var t = e[lang], it = el('div', 'rft-legend-item'), b = el('b'); var d = el('span', 'rft-swatch'); d.style.background = e.color;
        b.appendChild(d); b.appendChild(document.createTextNode(t.name)); it.appendChild(b);
        it.appendChild(el('span', null, T[lang].simulates + ': ' + t.space + ' · ' + T[lang].rule + ': ' + t.rule)); lg.appendChild(it);
      });
      container.appendChild(lg);
    }
    sites.forEach(function (s) { container.appendChild(renderSite(s, data, lang)); });
    if (opts.showNotes !== false) container.appendChild(el('p', 'rft-notes', data.notes[lang]));
    return container;
  }
  /* Find a Region F site from whatever the host page knows about the clicked Earth location.
     key: { siteId, packageId, candidateId, lat, lon, tolerance } — any one is enough. Returns the site object or null. */
  function findSite(data, key) {
    key = key || {}; var tol = key.tolerance == null ? 0.01 : key.tolerance;
    for (var i = 0; i < data.sites.length; i++) {
      var s = data.sites[i];
      if (key.siteId && s.site_id === key.siteId) return s;
      if (key.packageId && s.linked_packages.some(function (p) { return p.package_id === key.packageId; })) return s;
      if (key.candidateId && (s.source_candidate_ids || []).indexOf(key.candidateId) >= 0) return s;
      if (key.lat != null && key.lon != null && Math.abs(s.lat - key.lat) <= tol && Math.abs(((s.lon - key.lon + 540) % 360) - 180) <= tol) return s;
    }
    return null;
  }
  /* Render one site into a container (e.g. the Earth-site detail panel). Returns false if the site is not in Region F. */
  function mountSite(container, data, key, opts) {
    var s = findSite(data, key); if (!s) { container.innerHTML = ''; return false; }
    opts = Object.assign({ showLegend: false, showNotes: true }, opts || {}, { siteIds: [s.site_id] });
    mount(container, data, opts); return true;
  }
  var api = { mount: mount, mountSite: mountSite, findSite: findSite, renderSite: renderSite, version: '1.2.0' };
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.RegionTimeline = api; root.RegionFTimeline = api; }
})(typeof window !== 'undefined' ? window : this);
