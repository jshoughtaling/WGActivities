/* Where each group puts its effort: one wedge per working group, the five sources stacked from the centre.
   Each source's band is scored against the other groups on that same source, so commit volume does not
   drown out forums, calls, the symposium or Teams.
   WGA.effort(act, { picked, onPick, clickTo }) returns { el, setPicked }.
     picked:  slug to highlight, or null
     onPick:  called with a slug (or null) when the reader picks or clears a group
     clickTo: "filter" (default) calls onPick; "page" opens the clicked group's page */
(function () {
  var h = WGA.h, NS = "http://www.w3.org/2000/svg";
  var SRC = ["github", "forums", "calls", "conference", "teams"];
  var COL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
  var ORDERS = [["score", "Highest score first"], ["items", "Most items first"], ["name", "A–Z"]];
  var SCALES = [["rank", "Rank among groups"], ["max", "Share of busiest group"]];

  function s(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); });
    return el;
  }
  function label(slug) {
    var n = WGA.name(slug), m = n.match(/\(([^)]{1,6})\)\s*$/);
    var t = m ? m[1] : WGA.shortName(slug);
    return t.length > 18 ? t.slice(0, 17) + "…" : t;
  }

  WGA.effort = function (act, opts) {
    opts = opts || {};
    var st = { picked: opts.picked || null, hover: null, order: "score", scale: "rank" };
    var gs = act.wgs.map(function (w) {
      return { slug: w.slug, v: SRC.map(function (k) { return w.sources[k] ? WGA.sum(w.sources[k].counts) : 0; }) };
    }).filter(function (g) { return WGA.sum(g.v); });
    var n = gs.length;
    var srcTot = SRC.map(function (_, i) { return WGA.sum(gs.map(function (g) { return g.v[i]; })); });

    var el = h("div", { class: "wga-effort" });
    var ctl = h("div", { class: "wga-filters" });
    var sel = h("select", { id: "ef-g", "aria-label": "Working group", style: "max-width:280px" }, [h("option", { value: "", text: "All working groups" })]
      .concat(gs.slice().sort(function (a, b) { return WGA.name(a.slug).localeCompare(WGA.name(b.slug)); })
        .map(function (g) { return h("option", { value: g.slug, text: WGA.name(g.slug) }); })));
    var ord = h("select", { id: "ef-o", "aria-label": "Order" }, ORDERS.map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    var seg = h("div", { class: "wga-seg", role: "group", "aria-label": "Scale" });
    SCALES.forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(st.scale === o[0]) });
      b.addEventListener("click", function () {
        st.scale = o[0];
        Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        draw();
      });
      seg.appendChild(b);
    });
    ctl.appendChild(h("div", { class: "wga-group" }, [h("label", { for: "ef-g", text: "Working group" }), sel]));
    ctl.appendChild(h("div", { class: "wga-group" }, [h("label", { for: "ef-o", text: "Order" }), ord]));
    ctl.appendChild(h("div", { class: "wga-group", style: "margin-left:auto" }, [seg]));
    el.appendChild(ctl);

    var body = h("div", { class: "ef-body" });
    var chart = h("div", { class: "ef-chart" });
    var side = h("div", { class: "ef-side" });
    var legend = h("div", { class: "ef-legend" }, SRC.map(function (k, i) {
      return h("div", {}, [h("span", { class: "k", style: "background:" + COL[i] }), h("span", { class: "nm", text: WGA.SOURCES[k].label }),
        h("span", { class: "mu", text: WGA.fmt(srcTot[i]) + " items" })]);
    }));
    var panel = h("div", { class: "ef-panel", "aria-live": "polite" });
    side.appendChild(legend); side.appendChild(panel);
    side.appendChild(h("p", { class: "wga-note", text: "Hover a wedge for its numbers; click it to pick that group. Teams is hand-collected for most but not all groups, so a short pink band can mean \"not collected\" as well as \"quiet\"." }));
    body.appendChild(chart); body.appendChild(side);
    el.appendChild(body);

    sel.addEventListener("change", function () { pick(sel.value || null); });
    ord.addEventListener("change", function () { st.order = ord.value; draw(); });
    chart.addEventListener("mouseleave", function () { st.hover = null; light(); showPanel(); });

    function pick(slug) {
      st.picked = slug; sel.value = slug || "";
      light(); showPanel();
      if (opts.onPick) opts.onPick(slug);
    }

    // scores, 0..1 per group per source
    var score, usedN;
    function computeScores() {
      usedN = SRC.map(function (_, i) { return gs.filter(function (g) { return g.v[i] > 0; }).length; });
      score = gs.map(function () { return SRC.map(function () { return 0; }); });
      SRC.forEach(function (_, i) {
        var used = gs.map(function (g) { return g.v[i]; }).filter(function (v) { return v > 0; });
        var mx = Math.max.apply(null, used.concat([1]));
        gs.forEach(function (g, k) {
          var v = g.v[i];
          if (!v) return;
          // Rank only among groups that use the source, so one community call does not outrank most groups.
          score[k][i] = st.scale === "rank" ? (used.filter(function (u) { return u < v; }).length + 1) / used.length : Math.sqrt(v / mx);
        });
      });
    }

    var paths = [], texts = [];
    function draw() {
      computeScores();
      var idx = gs.map(function (_, k) { return k; });
      idx.sort(st.order === "name" ? function (a, b) { return WGA.name(gs[a].slug).localeCompare(WGA.name(gs[b].slug)); }
        : st.order === "items" ? function (a, b) { return WGA.sum(gs[b].v) - WGA.sum(gs[a].v); }
        : function (a, b) { return WGA.sum(score[b]) - WGA.sum(score[a]); });
      st.rank = {};
      idx.forEach(function (k, p) { st.rank[gs[k].slug] = p + 1; });
      var C = 360, R0 = 40, R1 = 250, TAU = Math.PI * 2, band = (R1 - R0) / SRC.length;
      var pt = function (a, r) { return [C + r * Math.sin(a), C - r * Math.cos(a)]; };
      var f = function (x) { return x.toFixed(1); };
      var arc = function (a0, a1, r0, r1) {
        var p0 = pt(a0, r1), p1 = pt(a1, r1), p2 = pt(a1, r0), p3 = pt(a0, r0);
        return "M" + f(p0[0]) + "," + f(p0[1]) + " A" + f(r1) + "," + f(r1) + " 0 0 1 " + f(p1[0]) + "," + f(p1[1]) +
          " L" + f(p2[0]) + "," + f(p2[1]) + " A" + f(r0) + "," + f(r0) + " 0 0 0 " + f(p3[0]) + "," + f(p3[1]) + " Z";
      };
      var svg = s("svg", { viewBox: "8 8 704 704", role: "img", "aria-label": "Effort by working group and source; the table on this page has the same groups" });
      svg.appendChild(s("circle", { cx: C, cy: C, r: R0, fill: "none", stroke: "#e1e0d9" }));
      SRC.forEach(function (_, i) { svg.appendChild(s("circle", { cx: C, cy: C, r: R0 + band * (i + 1), fill: "none", stroke: "#e1e0d9", "stroke-dasharray": "2 4" })); });
      paths = []; texts = [];
      var step = TAU / n, pad = step * 0.08;
      idx.forEach(function (k, p) {
        var g = gs[k], a0 = p * step + pad, a1 = (p + 1) * step - pad, r = R0;
        var grp = s("g", { "data-slug": g.slug, style: "cursor:pointer" });
        SRC.forEach(function (_, i) {
          var hh = band * score[k][i];
          if (hh > 0.3) {
            var path = s("path", { d: arc(a0, a1, r, r + hh), fill: COL[i], stroke: "#ffffff", "stroke-width": "0.8" });
            grp.appendChild(path); paths.push([g.slug, path]);
          }
          r += hh;
        });
        if (R1 - r > 0.3) grp.appendChild(s("path", { d: arc(a0, a1, r, R1), fill: "#000000", "fill-opacity": "0" }));
        var t = s("title"); t.textContent = WGA.name(g.slug); grp.appendChild(t);
        grp.addEventListener("mouseenter", function () { st.hover = g.slug; light(); showPanel(); });
        grp.addEventListener("click", function () {
          if (opts.clickTo === "page") { location.href = WGA.wgHref(g.slug); return; }
          pick(st.picked === g.slug ? null : g.slug);
        });
        svg.appendChild(grp);
        var mid = (a0 + a1) / 2, deg = mid * 180 / Math.PI, left = deg > 180, lp = pt(mid, Math.max(r, R0 + 70) + 6);
        var tx = s("text", { x: f(lp[0]), y: f(lp[1]), "text-anchor": left ? "end" : "start", "dominant-baseline": "middle", "font-size": "11",
          transform: "rotate(" + f(left ? deg + 90 : deg - 90) + " " + f(lp[0]) + " " + f(lp[1]) + ")" });
        tx.textContent = label(g.slug);
        svg.appendChild(tx); texts.push([g.slug, tx]);
      });
      chart.textContent = "";
      chart.appendChild(svg);
      light(); showPanel();
    }

    function light() {
      var focus = st.hover || st.picked;
      paths.forEach(function (x) { x[1].setAttribute("fill-opacity", !focus || focus === x[0] ? "0.92" : "0.18"); });
      texts.forEach(function (x) {
        x[1].setAttribute("fill", !focus || focus === x[0] ? "#0b0b0b" : "#b5b3ab");
        x[1].setAttribute("font-weight", focus === x[0] ? "700" : "400");
      });
    }

    function showPanel() {
      panel.textContent = "";
      var focus = st.hover || st.picked;
      if (!focus) {
        panel.appendChild(h("p", { class: "wga-note", style: "margin:0", text: st.scale === "rank"
          ? "Each band is the group's rank on that source among the groups that use it: a full band is the busiest group on that source, half a band is the middle. A tall wedge is a group active everywhere; a lopsided one leans on one or two sources. The dashed rings mark where each band would end if a group led every source."
          : "Each band is the group's items on that source compared with the busiest group on it (square-root scale, so mid-sized groups stay visible). This keeps real size differences that the rank view flattens." }));
        return;
      }
      var k = gs.findIndex(function (g) { return g.slug === focus; }), g = gs[k];
      panel.appendChild(h("a", { href: WGA.wgHref(focus), class: "ef-name", text: WGA.name(focus) }));
      panel.appendChild(h("div", { class: "wga-note", text: WGA.fmt(WGA.sum(g.v)) + " items in the last 12 months" + (st.order === "score" ? " · #" + st.rank[focus] + " of " + n + " on the combined score" : "") }));
      var t = h("div", { class: "ef-tbl" }, [h("span"), h("span", { class: "hd", text: "Source" }), h("span", { class: "hd r", text: "Items" }),
        h("span", { class: "hd r", text: st.scale === "rank" ? "Rank" : "vs busiest" })]);
      SRC.forEach(function (key, i) {
        var v = g.v[i], sc = score[k][i];
        t.appendChild(h("span", { class: "k", style: "background:" + COL[i] }));
        t.appendChild(h("span", { text: WGA.SOURCES[key].label }));
        t.appendChild(h("span", { class: "r b", text: WGA.fmt(v) }));
        t.appendChild(h("span", { class: "r mu", text: !v ? "–" : st.scale === "rank" ? "#" + Math.round(usedN[i] - (sc * usedN[i] - 1)) + " of " + usedN[i] : Math.round(100 * sc * sc) + "% of top" }));
      });
      panel.appendChild(t);
    }

    draw();
    sel.value = st.picked || "";
    return { el: el, setPicked: function (slug) { st.picked = slug; sel.value = slug || ""; light(); showPanel(); } };
  };
})();
