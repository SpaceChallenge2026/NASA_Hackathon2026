/* Mission sites: one-tap jumps to real mission locations on the Stage 02 surface map.
   Coordinates are the IAU Gazetteer of Planetary Nomenclature centres of the named features
   (planetarynames.wr.usgs.gov, read 2026-11-15). NASA's Artemis III candidate regions (NASA release
   of 28 Oct 2024) are areas about 15 km across near these features, so each button opens the
   2.5° (Mars) or 5° (Moon) cell that contains the feature, not an exact landing point. */
(function () {
  "use strict";
  var SITES = {
    moon: [
      { group: "Artemis III candidate regions" },
      { name: "Peak near Cabeus B", lat: -82.26, lon: -54.58 },
      { name: "Haworth", lat: -87.45, lon: -5.17 },
      { name: "Malapert Massif", lat: -85.98, lon: -1.67 },
      { name: "Mons Mouton & Plateau", lat: -84.60, lon: 31.00 },
      { name: "Nobile Rim 1 & 2", lat: -85.28, lon: 53.27 },
      { name: "de Gerlache Rim 2", lat: -88.48, lon: -88.34 },
      { name: "Slater Plain", lat: -88.08, lon: 111.29 },
      { group: "South pole" },
      { name: "Shackleton crater", lat: -89.67, lon: 129.78 }
    ],
    mars: [
      { group: "Rover landing craters" },
      { name: "Jezero (Perseverance)", lat: 18.41, lon: 77.69 },
      { name: "Gale (Curiosity)", lat: -5.37, lon: 137.81 }
    ]
  };
  var NOTE = "Centres of the named features from the IAU Gazetteer. Artemis III regions are about 15 km across, so each button opens the surface cell that contains the feature.";

  var css = document.createElement("style");
  css.textContent =
    ".mission-sites{margin:0 0 18px;padding:16px 0 0;border-top:1px solid rgba(242,236,226,.14)}" +
    ".mission-sites .msl{margin:0 0 10px;font-size:11px;letter-spacing:.18em;color:rgba(242,236,226,.62)}" +
    ".mission-sites .msg{margin:12px 0 6px;font-size:12px;color:rgba(242,236,226,.55)}" +
    ".mission-sites .msc{display:flex;flex-wrap:wrap;gap:6px}" +
    "#mission-sites .msc button{width:auto!important;min-height:0!important;margin:0!important;padding:5px 11px!important;border:1px solid rgba(242,236,226,.24)!important;border-radius:999px!important;background:transparent!important;color:rgba(242,236,226,.88)!important;font-size:12.5px!important;line-height:1.3!important;letter-spacing:.01em!important;text-align:left!important;cursor:pointer;transition:border-color .2s,color .2s,background-color .2s}" +
    "#mission-sites .msc button:hover{border-color:#d9a35b!important;color:#f2ece2!important}" +
    ".mission-sites button:focus-visible{outline:1px solid #d9a35b;outline-offset:3px}" +
    "#mission-sites .msc button[aria-pressed=true]{border-color:#d9a35b!important;background:rgba(217,163,91,.14)!important;color:#f2ece2!important}" +
    ".mission-sites .msn{margin:10px 0 0;font-size:11.5px;line-height:1.45;color:rgba(242,236,226,.45)}";
  document.head.appendChild(css);

  function world() { var m = location.hash.match(/^#enter-(mars|moon)/); return m ? m[1] : null; }

  function render() {
    var w = world(), ways = document.getElementById("ways");
    var box = document.getElementById("mission-sites");
    if (!w || !ways) { if (box) box.hidden = true; return; }
    if (!box) {
      box = document.createElement("section"); box.id = "mission-sites"; box.className = "mission-sites";
      box.setAttribute("aria-label", "Mission sites");
      ways.parentNode.insertBefore(box, ways);
    }
    if (box.dataset.world === w) { box.hidden = false; return; }
    box.dataset.world = w; box.hidden = false; box.replaceChildren();
    var label = document.createElement("p"); label.className = "msl"; label.textContent = "MISSION SITES"; box.append(label);
    var row = null;
    SITES[w].forEach(function (s) {
      if (s.group) {
        var g = document.createElement("p"); g.className = "msg"; g.textContent = s.group; box.append(g);
        row = document.createElement("div"); row.className = "msc"; box.append(row); return;
      }
      var b = document.createElement("button"); b.type = "button"; b.textContent = s.name; b.setAttribute("aria-pressed", "false");
      b.title = s.name + " · " + Math.abs(s.lat).toFixed(2) + "°" + (s.lat < 0 ? "S" : "N") + ", " + Math.abs(s.lon).toFixed(2) + "°" + (s.lon < 0 ? "W" : "E");
      b.addEventListener("click", function () { jump(s, b); });
      row.append(b);
    });
    var n = document.createElement("p"); n.className = "msn"; n.textContent = NOTE; box.append(n);
  }

  function jump(s, btn) {
    var form = document.getElementById("coordinates"), lat = document.getElementById("latitude"), lon = document.getElementById("longitude");
    if (!form || !lat || !lon) return;
    lat.value = s.lat; lon.value = s.lon;
    if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { cancelable: true }));
    document.querySelectorAll("#mission-sites button").forEach(function (x) { x.setAttribute("aria-pressed", x === btn ? "true" : "false"); });
  }

  window.addEventListener("hashchange", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
})();
