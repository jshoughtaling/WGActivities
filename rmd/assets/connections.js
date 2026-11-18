/* Connections: network of working groups (pairs with evidence of shared work), pair detail, and similar work.
   Reads data/collab.json and data/similar.json. URL: ?wg=<slug>&with=<slug>  ?term=<term>#similar */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-connections");
  if (!root) return;
  var NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }

  var state = { wg: WGA.param("wg") || "", pair: null, term: WGA.param("term") || "", simOnly: false };
  var col, sim, el = {};

  WGA.loadMany(["data/collab.json", "data/similar.json"]).then(function (r) {
    col = r[0]; sim = r[1];
    WGA.setNames(sim.names); WGA.setNames(col.names);
    if (state.wg && WGA.param("with")) state.pair = findPair(state.wg, WGA.param("with"));
    build();
    if (state.term && location.hash === "#similar") setTimeout(function () { var x = document.getElementById("similar"); if (x) x.scrollIntoView(); }, 50);
  }).catch(function (e) { WGA.fail(root, e); });

  function findPair(a, b) { return col.pairs.filter(function (p) { return (p.a === a && p.b === b) || (p.a === b && p.b === a); })[0] || null; }
  function key(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

  function build() {
    root.textContent = "";
    root.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: "Connections" }),
      h("p", { class: "sub wga-note", text: col.pairs.length + " pairs of groups with evidence of shared work over the last " + col.window_weeks + " weeks, and " + sim.clusters.length + " subjects that come up in several groups' work." })])]));
    var filt = h("select", { id: "c-wg" }, [h("option", { value: "", text: "All groups" })].concat(Object.keys(col.names).sort(function (a, b) { return WGA.name(a).localeCompare(WGA.name(b)); })
      .map(function (k) { return h("option", { value: k, text: WGA.shortName(k) }); })));
    filt.value = state.wg;
    filt.addEventListener("change", function () { state.wg = filt.value; state.pair = null; drawAll(); });
    var simChk = h("input", { type: "checkbox" });
    simChk.addEventListener("change", function () { state.simOnly = simChk.checked; drawNet(); });
    root.appendChild(h("div", { class: "wga-filters" }, [
      h("div", { class: "wga-group" }, [h("label", { for: "c-wg", text: "Focus on" }), filt]),
      h("label", { class: "wga-check" }, [simChk, "Show only similar-work links not yet connected"]),
    ]));
    var cols = h("div", { class: "wga-cols" });
    el.net = h("section", { class: "wga-card main", "aria-label": "Network of working groups" });
    el.pair = h("section", { class: "wga-card side", "aria-live": "polite" });
    cols.appendChild(el.net); cols.appendChild(el.pair);
    root.appendChild(cols);
    el.pairs = h("details", { class: "wga-card" });
    el.sim = h("section", { class: "wga-card", id: "similar" });
    root.appendChild(el.sim);
    root.appendChild(el.pairs);
    drawAll();
  }
  function drawAll() { drawNet(); drawPair(); drawPairs(); drawSim(); }

  /* ---------------- network ---------------- */
  var layout = null;
  function graph() {
    var edges = col.pairs.slice(0, 40).map(function (p) { return { a: p.a, b: p.b, w: p.score, p: p, kind: "pair" }; });
    var have = {}; edges.forEach(function (e) { have[key(e.a, e.b)] = 1; });
    var simCount = {};
    sim.clusters.forEach(function (c) { c.new_ties.forEach(function (t) { var k = key(t[0], t[1]); if (!have[k]) simCount[k] = (simCount[k] || []).concat([c.term]); }); });
    Object.keys(simCount).sort(function (a, b) { return simCount[b].length - simCount[a].length; }).slice(0, 18).forEach(function (k) {
      var ab = k.split("|"); edges.push({ a: ab[0], b: ab[1], w: simCount[k].length, terms: simCount[k], kind: "sim" });
    });
    var nodes = {};
    edges.forEach(function (e) { [e.a, e.b].forEach(function (n) { nodes[n] = nodes[n] || { id: n, deg: 0, str: 0 }; nodes[n].deg++; nodes[n].str += e.kind === "pair" ? e.w : 0; }); });
    return { nodes: Object.keys(nodes).map(function (k) { return nodes[k]; }), edges: edges };
  }
  function computeLayout(g, W, H) {
    // Deterministic force layout (Fruchterman-Reingold), seeded on a circle ordered by strength.
    var ns = g.nodes.slice().sort(function (a, b) { return b.str - a.str || a.id.localeCompare(b.id); });
    var n = ns.length, idx = {};
    ns.forEach(function (v, i) { var a = 2 * Math.PI * i / n; v.x = W / 2 + Math.cos(a) * W * 0.35 * (i % 2 ? 0.7 : 1); v.y = H / 2 + Math.sin(a) * H * 0.35 * (i % 2 ? 0.7 : 1); idx[v.id] = v; });
    var k = Math.sqrt(W * H / n) * 0.95, t = W / 8;
    for (var it = 0; it < 400; it++) {
      ns.forEach(function (v) { v.dx = 0; v.dy = 0; });
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
        var a = ns[i], b = ns[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01), f = k * k / d;
        a.dx += dx / d * f; a.dy += dy / d * f; b.dx -= dx / d * f; b.dy -= dy / d * f;
      }
      g.edges.forEach(function (e) {
        var a = idx[e.a], b = idx[e.b], dx = a.x - b.x, dy = a.y - b.y, d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        var f = d * d / k * (e.kind === "pair" ? 0.25 + Math.min(e.w, 20) / 40 : 0.08);
        a.dx -= dx / d * f; a.dy -= dy / d * f; b.dx += dx / d * f; b.dy += dy / d * f;
      });
      ns.forEach(function (v) {
        v.dx += (W / 2 - v.x) * 0.6; v.dy += (H / 2 - v.y) * 1.2;      // gentle gravity keeps the graph off the edges
        var d = Math.max(Math.sqrt(v.dx * v.dx + v.dy * v.dy), 0.01);
        v.x += v.dx / d * Math.min(d, t); v.y += v.dy / d * Math.min(d, t);
        v.x = Math.min(W - 70, Math.max(70, v.x)); v.y = Math.min(H - 22, Math.max(22, v.y));
      });
      t *= 0.985;
    }
    // Push overlapping labels apart (rectangles sized to their text).
    ns.forEach(function (v) { v.w = Math.min(190, 16 + WGA.shortName(v.id).length * 7) + 10; });
    for (var pass = 0; pass < 300; pass++) {
      var moved = false;
      for (var a = 0; a < n; a++) for (var b2 = a + 1; b2 < n; b2++) {
        var p1 = ns[a], p2 = ns[b2], ox = (p1.w + p2.w) / 2 - Math.abs(p1.x - p2.x), oy = 34 - Math.abs(p1.y - p2.y);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (oy < ox) { var sy = (p1.y < p2.y ? -1 : 1) * oy / 2; p1.y += sy; p2.y -= sy; }
          else { var sx = (p1.x < p2.x ? -1 : 1) * ox / 2; p1.x += sx; p2.x -= sx; }
          [p1, p2].forEach(function (v) { v.x = Math.min(W - v.w / 2, Math.max(v.w / 2, v.x)); v.y = Math.min(H - 18, Math.max(18, v.y)); });
        }
      }
      if (!moved) break;
    }
    return idx;
  }

  function drawNet() {
    var g = graph(), W = 900, H = 540;
    if (!layout) layout = computeLayout(g, W, H);
    el.net.textContent = "";
    var focus = state.wg, pk = state.pair ? key(state.pair.a, state.pair.b) : null;
    var nb = {};
    if (focus) g.edges.forEach(function (e) { if (e.a === focus) nb[e.b] = 1; if (e.b === focus) nb[e.a] = 1; });
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Network of working groups. Lines join groups with evidence of shared work; dashed orange lines join groups whose work overlaps but that are not yet connected." });
    var maxW = Math.max.apply(null, g.edges.filter(function (e) { return e.kind === "pair"; }).map(function (e) { return e.w; }).concat([1]));
    g.edges.forEach(function (e) {
      if (state.simOnly && e.kind !== "sim") return;
      var a = layout[e.a], b = layout[e.b];
      var on = !focus || e.a === focus || e.b === focus;
      var line = s("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "edge" + (e.kind === "sim" ? " sim" : "") + (on ? "" : " dim") + (pk === key(e.a, e.b) ? " sel" : ""),
        "stroke-width": e.kind === "sim" ? 2 : (1.5 + 8 * Math.sqrt(e.w / maxW)) });
      line.appendChild(s("title", {}, WGA.shortName(e.a) + " × " + WGA.shortName(e.b) + (e.kind === "sim" ? ": similar work (" + e.terms.slice(0, 3).join(", ") + "), not yet connected" : ": score " + e.w)));
      line.addEventListener("click", function () {
        if (e.kind === "pair") { state.pair = e.p; } else { state.pair = { a: e.a, b: e.b, sim: true, terms: e.terms }; }
        drawNet(); drawPair();
      });
      svg.appendChild(line);
    });
    g.nodes.forEach(function (v) {
      var p = layout[v.id], label = WGA.shortName(v.id), w = Math.min(190, 16 + label.length * 7);
      var on = !focus || v.id === focus || nb[v.id];
      var gnode = s("g", { class: "node" + (v.str > 15 ? " hub" : "") + (v.id === focus ? " sel" : "") + (on ? "" : " dim"), tabindex: "0", role: "button", "aria-label": label + ", " + v.deg + " connections" });
      gnode.appendChild(s("rect", { x: p.x - w / 2, y: p.y - 13, width: w, height: 26, rx: 13 }));
      gnode.appendChild(s("text", { x: p.x, y: p.y + 4, "text-anchor": "middle" }, label.length > 26 ? label.slice(0, 25) + "…" : label));
      var pick = function () { state.wg = state.wg === v.id ? "" : v.id; state.pair = null; document.getElementById("c-wg").value = state.wg; drawAll(); };
      gnode.addEventListener("click", pick);
      gnode.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
      svg.appendChild(gnode);
    });
    el.net.appendChild(h("div", { class: "wga-net" }, [svg]));
    el.net.appendChild(h("div", { class: "wga-legend" }, [
      h("span", { class: "item", text: "Line weight = strength of evidence (the 40 strongest pairs)" }),
      h("span", { class: "item", style: "color:var(--warm-ink)", text: "Dashed orange = similar work, not yet connected" }),
      h("span", { class: "item", text: "Select a group to focus, a line for details" }),
    ]));
  }

  /* ---------------- pair detail ---------------- */
  function drawPair() {
    el.pair.textContent = "";
    var p = state.pair;
    if (!p) {
      el.pair.appendChild(h("h3", { text: state.wg ? WGA.shortName(state.wg) : "Strongest pairs" }));
      var list = col.pairs.filter(function (q) { return !state.wg || q.a === state.wg || q.b === state.wg; }).slice(0, 8);
      list.forEach(function (q) {
        var b = h("button", { type: "button", class: "wga-lcard", style: "width:100%;text-align:left;margin-bottom:0.4em;cursor:pointer;font:inherit" }, [
          h("div", { class: "t" }, [h("span", { text: WGA.shortName(q.a) + " × " + WGA.shortName(q.b) }), h("span", { class: "m", text: "score " + q.score })]),
          h("div", { class: "m", text: q.signals.join(" · ") }),
        ]);
        b.addEventListener("click", function () { state.pair = q; drawNet(); drawPair(); });
        el.pair.appendChild(b);
      });
      if (!list.length) el.pair.appendChild(h("p", { class: "wga-empty", text: "No connections found for this group yet." }));
      return;
    }
    el.pair.appendChild(h("div", { class: "sub", text: "Selected pair" }));
    el.pair.appendChild(h("h3", {}, [h("a", { href: WGA.wgHref(p.a), text: WGA.shortName(p.a) }), " × ", h("a", { href: WGA.wgHref(p.b), text: WGA.shortName(p.b) })]));
    if (p.sim) {
      el.pair.appendChild(h("p", { class: "warm-ink", style: "color:var(--warm-ink);font-size:0.9em", text: "No item names both groups yet, but their work overlaps on: " + p.terms.join(", ") + "." }));
    } else {
      el.pair.appendChild(h("div", { class: "wga-chips" }, [WGA.badge("score " + p.score, "blue")].concat(p.signals.map(function (x) { return WGA.badge(x); }))));
      var meta = [];
      if (p.co_items) meta.push(p.co_items + " item" + (p.co_items > 1 ? "s" : "") + " naming both, " + p.co_recent + " in the last " + col.recent_weeks + " weeks");
      if (p.repos.length) meta.push("Shared repos: " + p.repos.slice(0, 3).map(function (r) { return r.repo; }).join(", "));
      if (p.themes.length) meta.push("Both active on " + p.themes.slice(0, 3).join(", "));
      el.pair.appendChild(h("ul", { class: "wga-plain" }, meta.map(function (m) { return h("li", { text: m }); })));
      if (p.evidence.length) el.pair.appendChild(WGA.itemList(p.evidence));
    }
    var shared = sim.clusters.filter(function (c) { return c.wgs.indexOf(p.a) >= 0 && c.wgs.indexOf(p.b) >= 0; });
    if (shared.length) el.pair.appendChild(h("p", { class: "wga-note", style: "margin-top:0.6em" }, ["Similar work: ", h("span", {}, shared.slice(0, 5).map(function (c, i) {
      return h("span", {}, [i ? ", " : "", h("a", { href: "?term=" + encodeURIComponent(c.term) + "#similar", text: c.term })]);
    }))]));
    var back = h("button", { type: "button", class: "wga-btn", text: "← All pairs", style: "margin-top:0.6em" });
    back.addEventListener("click", function () { state.pair = null; drawNet(); drawPair(); });
    el.pair.appendChild(back);
  }

  /* ---------------- pairs list ---------------- */
  function drawPairs() {
    el.pairs.textContent = "";
    el.pairs.appendChild(h("summary", { text: "All " + col.pairs.length + " pairs, as a table" }));
    el.pairs.appendChild(h("p", { class: "wga-note", text: "Ranked by evidence. Items from the forum, calls and the symposium count most; a busy GitHub repo counts once. Signals: named together (one item names both groups), shared repo, shared topic." }));
    var t = h("table", { class: "wga-table left" });
    t.appendChild(h("thead", {}, [h("tr", {}, ["Pair", "Score", "Signals", "Latest item naming both"].map(function (x) { return h("th", { scope: "col", text: x }); }))]));
    var tb = h("tbody");
    col.pairs.filter(function (q) { return !state.wg || q.a === state.wg || q.b === state.wg; }).forEach(function (q) {
      var b = h("button", { type: "button", class: "wga-btn", style: "padding:0.1em 0.5em", text: WGA.shortName(q.a) + " × " + WGA.shortName(q.b) });
      b.addEventListener("click", function () { state.pair = q; drawNet(); drawPair(); el.net.scrollIntoView({ behavior: "smooth" }); });
      var ev = q.evidence[0];
      tb.appendChild(h("tr", {}, [h("td", {}, [b]), h("td", { text: String(q.score) }), h("td", { style: "font-size:0.9em", text: q.signals.join(" · ") }),
        h("td", { style: "font-size:0.9em" }, [ev ? h("a", { href: WGA.safeUrl(ev.url), target: "_blank", rel: "noopener", text: ev.title }) : "–"])]));
    });
    t.appendChild(tb);
    el.pairs.appendChild(h("div", { class: "hm-scroll" }, [t]));
  }

  /* ---------------- similar work ---------------- */
  function drawSim() {
    el.sim.textContent = "";
    el.sim.appendChild(h("div", { class: "wga-row-h" }, [h("h3", { text: "Similar work in different groups", style: "margin:0" }),
      h("span", { class: "wga-note", text: "Different items, different groups, same subject · last " + Math.round(sim.window_days / 7) + " weeks" })]));
    var tf = h("input", { type: "search", class: "wga-input", id: "c-term", placeholder: "Filter subjects", value: state.term });
    var grid = h("div", { class: "wga-grid", style: "grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); margin-top:0.6em" });
    el.sim.appendChild(h("div", { class: "wga-filters", style: "margin:0.6em 0 0" }, [h("label", { for: "c-term", class: "visually-hidden", text: "Filter subjects" }), tf]));
    el.sim.appendChild(grid);
    function fill() {
      grid.textContent = "";
      var q = state.term.toLowerCase();
      var all = sim.clusters.filter(function (c) { return (!state.wg || c.wgs.indexOf(state.wg) >= 0) && (!q || c.term.indexOf(q) >= 0); });
      var cs = state.allSim || q ? all : all.slice(0, 12);
      cs.forEach(function (c) {
        var tie = c.new_ties.length ? WGA.badge(c.new_ties.length + " pair" + (c.new_ties.length > 1 ? "s" : "") + " not yet connected", "warm") : WGA.badge("groups already connected");
        var lst = h("ul", { class: "wga-mini" });
        c.items.slice(0, 6).forEach(function (i) {
          lst.appendChild(h("li", {}, [h("span", { class: "g", text: WGA.shortName(i.g) }),
            WGA.safeUrl(i.url) ? h("a", { href: i.url, target: "_blank", rel: "noopener", text: i.title }) : h("span", { text: i.title })]));
        });
        grid.appendChild(h("div", { class: "wga-lcard" + (c.term === state.term ? " sel" : ""), style: c.term === state.term ? "border-color:var(--warm)" : "" }, [
          h("div", { class: "t" }, [h("span", { text: c.term }), tie]),
          h("div", { class: "m", text: c.wgs.map(WGA.shortName).join(" · ") + " · " + c.n + " items" + (c.topic ? " · within topic " + c.topic : "") }),
          lst,
        ]));
      });
      if (!cs.length) grid.appendChild(h("p", { class: "wga-empty", text: "No similar-work clusters match." }));
      if (all.length > cs.length) {
        var more = h("button", { type: "button", class: "wga-btn", text: "Show all " + all.length });
        more.addEventListener("click", function () { state.allSim = true; fill(); });
        grid.appendChild(h("div", {}, [more]));
      }
    }
    tf.addEventListener("input", function () { state.term = tf.value; fill(); });
    fill();
    el.sim.appendChild(h("p", { class: "wga-note", text: "Found automatically: named things (FHIR, DuckDB, v5.5) and two-word phrases that appear in issue, pull request, forum, call and symposium titles of at least two groups, each with an item of its own. Leads for a conversation, not conclusions." }));
  }
})();
