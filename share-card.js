/* Mission card: a downloadable 1200x630 image of the current Stage 04 report
   (planet cell, Earth analog, best test months, engineering test) plus a link that reopens this view. */
(function () {
  "use strict";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var RELEVANT = { mars: ["mars_cold", "mars_solar", "strong_wind", "low_sun"], moon: ["night", "midnight_sun", "low_sun", "moon_lowlat_solar"] };
  var TASK = { rover_mobility: ["Rover mobility", "Move farther, slip less."], drilling_sampling: ["Drilling & sampling", "Reach beneath the surface."],
    thermal_control: ["Thermal control", "Keep systems stable in extreme temperatures."], power_continuity: ["Power continuity", "Keep the mission powered through light and darkness."],
    ice_resource_operations: ["Ice resource operations", "Turn hidden ice into usable resources."], dust_mitigation: ["Dust mitigation", "Keep dust out and missions running."] };

  function q(h, k) { var p = (h.split("?")[1] || "").split("&"); for (var i = 0; i < p.length; i++) { var a = p[i].split("="); if (a[0] === k) return decodeURIComponent(a[1] || ""); } return null; }
  function ll(lat, lon) { return Math.abs(lat).toFixed(2) + "°" + (lat < 0 ? "S" : "N") + ", " + Math.abs(lon).toFixed(2) + "°" + (lon < 0 ? "W" : "E"); }
  function ranges(ms) {
    if (!ms.length) return "";
    var out = [], s = ms[0], p = ms[0];
    for (var i = 1; i <= ms.length; i++) {
      if (i < ms.length && ms[i] === p + 1) { p = ms[i]; continue; }
      out.push(s === p ? MONTHS[s - 1] : MONTHS[s - 1] + "–" + MONTHS[p - 1]); if (i < ms.length) { s = p = ms[i]; }
    }
    if (out.length > 1 && ms[0] === 1 && ms[ms.length - 1] === 12) {        // wrap Dec–Jan into one range
      var last = out.pop(), first = out.shift(); out.unshift(last.split("–")[0] + "–" + (first.split("–")[1] || first));
    }
    return out.join(", ");
  }

  function facts() {
    var D = window.ANALOG_DATA, h = location.hash, m = h.match(/^#investigate-(mars|moon)/);
    if (!D || !m) return null;
    var row = D.rows.find(function (r) { return r.id === q(h, "site"); }); if (!row) return null;
    var site = D.sites[row.s], world = m[1], cell = D.cells[q(h, "cell")];
    var f = { world: world, worldName: world === "mars" ? "Mars" : "Moon", site: site, row: row,
      target: cell ? ll(cell[1], cell[2]) : "", env: cell ? cell[3] : row.t, best: "", bestEnv: "", task: row.mt ? TASK[row.mt.task] : null };
    var T = window.REGION_TIMELINE_DATA, ts = T && window.RegionTimeline && RegionTimeline.findSite(T, { siteId: site.c });
    if (ts) {
      var count = new Array(13).fill(0), envOf = {};
      ts.bars.forEach(function (b) { if (RELEVANT[world].indexOf(b.env) < 0) return; b.months.forEach(function (mo) { count[mo]++; (envOf[mo] = envOf[mo] || []).push(b.env); }); });
      var max = Math.max.apply(null, count);
      if (max > 0) {
        var best = []; for (var i = 1; i <= 12; i++) if (count[i] === max) best.push(i);
        var names = {}; T.environments.forEach(function (e) { names[e.key] = e.en.name; });
        f.best = ranges(best); f.bestEnv = (envOf[best[0]] || []).map(function (k) { return names[k]; }).join(", ");
      }
    }
    var dims = D.dims, top = null;
    row.pc.forEach(function (p, k) { if (p != null && row.d[k] != null && row.st[k] !== "not_applicable" && !(k === 3 && row.abs) && (!top || p < top.p)) top = { k: k, p: p }; });
    if (top) f.closest = dims[top.k] + " " + (1 - top.p).toFixed(2);
    return f;
  }

  function wrap(ctx, text, x, y, maxW, lineH, maxLines) {
    var words = text.split(" "), line = "", n = 0;
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lineH); n++; line = words[i]; if (n >= maxLines - 1) { line = words.slice(i).join(" "); break; } }
      else line = t;
    }
    while (ctx.measureText(line).width > maxW && line.length > 3) line = line.slice(0, -2);
    ctx.fillText(line, x, y + n * lineH); return n + 1;
  }

  function draw(f, withImage) {
    var W = 1200, H = 630, c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d"), font = getComputedStyle(document.getElementById("site-place") || document.body).fontFamily;
    var ink = "#f2ece2", soft = "rgba(242,236,226,.68)", mute = "rgba(242,236,226,.45)", amber = "#d9a35b";
    g.fillStyle = "#06080b"; g.fillRect(0, 0, W, H);
    // right: satellite close-up of the Earth site, when the page has it
    var img = withImage && document.querySelector("#site-image-holder img, #site-figure img");
    var IX = 640, IY = 60, IW = 500, IH = 400;
    g.fillStyle = "#11141a"; g.fillRect(IX, IY, IW, IH);
    if (img && img.complete && img.naturalWidth) {
      var r = Math.max(IW / img.naturalWidth, IH / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
      g.save(); g.beginPath(); g.rect(IX, IY, IW, IH); g.clip(); g.drawImage(img, IX + (IW - w) / 2, IY + (IH - h) / 2, w, h); g.restore();
      g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(IX + IW / 2 - 28, IY + IH / 2 - 28, 56, 56);
    }
    g.fillStyle = mute; g.font = "14px " + font; g.fillText("Earth analog site · " + ll(f.site.lat, f.site.lon), IX, IY + IH + 26);
    // left
    g.fillStyle = soft; g.font = "15px " + font; g.fillText("E L S E W H E R E", 60, 78);
    g.fillStyle = mute; g.font = "15px " + font; g.fillText(f.worldName.toUpperCase() + " · " + f.target, 60, 138);
    g.fillStyle = soft; g.font = "15px " + font; g.fillText(f.env, 60, 162);
    g.strokeStyle = amber; g.lineWidth = 2; g.beginPath(); g.moveTo(62, 186); g.lineTo(62, 222); g.stroke();
    g.beginPath(); g.moveTo(55, 214); g.lineTo(62, 223); g.lineTo(69, 214); g.stroke();
    g.fillStyle = mute; g.font = "15px " + font; g.fillText("EARTH ANALOG", 60, 258);
    g.fillStyle = ink; g.font = "300 50px " + font;
    var lines = wrap(g, f.site.name, 60, 312, 540, 56, 2);
    var y = 312 + lines * 56 + 10;
    g.font = "17px " + font;
    if (f.closest) { g.fillStyle = mute; g.fillText("Closest dimension", 60, y); g.fillStyle = ink; g.fillText(f.closest, 240, y); y += 32; }
    if (f.best) { g.fillStyle = mute; g.fillText("Best months to test", 60, y); g.fillStyle = amber; wrap(g, f.best + (f.bestEnv ? "  (" + f.bestEnv + ")" : ""), 240, y, 370, 22, 2); y += 32; }
    if (f.task) { g.fillStyle = mute; g.fillText("Engineering test", 60, y); g.fillStyle = ink; wrap(g, f.task[0] + ": " + f.task[1], 240, y, 370, 22, 2); }
    // footer: the link that reopens this view
    g.fillStyle = "rgba(242,236,226,.12)"; g.fillRect(60, 548, W - 120, 1);
    g.fillStyle = mute; g.font = "13px " + font;
    var url = location.href; while (g.measureText(url).width > W - 120 && url.length > 20) url = url.slice(0, -4) + "…";
    g.fillText(url, 60, 578);
    g.fillText("NASA Space Apps Challenge 2026 · Scenario values; not an official NASA site selection.", 60, 600);
    return c;
  }

  function download() {
    var f = facts(); if (!f) return;
    var c = draw(f, true), name = "elsewhere-" + f.site.c + "-" + f.world + ".png";
    function save(canvas) { canvas.toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, "image/png"); }
    try { save(c); } catch (e) { save(draw(f, false)); }   // image without CORS would taint the canvas: card without it
  }

  function mount() {
    var host = document.getElementById("site-finding"); if (!host || document.getElementById("share-card-row")) return;
    var css = document.createElement("style");
    css.textContent = "#share-card-row{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 0}" +
      "#share-card-row button{padding:8px 14px;border:1px solid rgba(242,236,226,.3);border-radius:999px;background:transparent;color:#f2ece2;font:inherit;font-size:13px;letter-spacing:.04em;cursor:pointer;transition:border-color .2s,background-color .2s}" +
      "#share-card-row button:hover{border-color:#d9a35b;background:rgba(217,163,91,.1)}#share-card-row button:focus-visible{outline:1px solid #d9a35b;outline-offset:3px}" +
      "#share-card-row output{align-self:center;font-size:12px;color:rgba(242,236,226,.55)}";
    document.head.appendChild(css);
    var row = document.createElement("div"); row.id = "share-card-row";
    row.innerHTML = '<button type="button" id="share-card-download">Download mission card</button><button type="button" id="share-card-copy">Copy link</button><output id="share-card-status" aria-live="polite"></output>';
    host.parentNode.insertBefore(row, host.nextSibling);
    document.getElementById("share-card-download").addEventListener("click", download);
    document.getElementById("share-card-copy").addEventListener("click", function () {
      var out = document.getElementById("share-card-status");
      (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(function () { out.textContent = "Link copied"; }, function () { out.textContent = location.href; });
      setTimeout(function () { out.textContent = ""; }, 3000);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  window.ElsewhereCard = { facts: facts, draw: draw };   // for checking
})();
