/* Where each group puts its effort: one wedge per working group, the five sources stacked from the centre.
   Wedges are sized by volume (area proportional to items, as in a Nightingale rose). The one adjustment:
   GitHub commits count as 1/10 of an item, because a single pull request usually brings many commits and
   commits alone would drown out every other source. Everything else is counted as is.
   WGA.effort(act, { picked, onPick, clickTo }) returns { el, setPicked }.
     picked:  slug to highlight, or null
     onPick:  called with a slug (or null) when the reader picks or clears a group
     clickTo: "pick" (default) calls onPick; "page" opens the clicked group's page */
(function () {
  var h = WGA.h, NS = "http://www.w3.org/2000/svg";
  var SRC = ["github", "forums", "calls", "conference", "teams"];
  var COL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
  var COMMIT_WEIGHT = 0.1;
  WGA.EFFORT_COMMIT_WEIGHT = COMMIT_WEIGHT;
  var ORDERS = [["items", "Most items first"], ["name", "A–Z"]];

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
    var st = { picked: opts.picked || null, hover: null, order: "items", off: {} };
    var gs = act.wgs.map(function (w) {
      var raw = SRC.map(function (k) { return w.sources[k] ? WGA.sum(w.sources[k].counts) : 0; });
      var commits = (w.github_types || {}).commit || 0;
      var v = raw.slice();
      v[0] = Math.max(0, raw[0] - commits * (1 - COMMIT_WEIGHT));
      return { slug: w.slug, raw: raw, v: v, commits: commits, total: WGA.sum(v) };
    }).filter(function (g) { return g.total > 0; });
    var n = gs.length;
    var srcTot = SRC.map(function (_, i) { return WGA.sum(gs.map(function (g) { return g.v[i]; })); });
    // Totals over the sources switched on; recomputed on every draw.
    var maxT = 1;
    function shownTotal(g) { return WGA.sum(g.v.filter(function (_, i) { return !st.off[i]; })); }
    var fmt = function (x) { return WGA.fmt(Math.round(x)); };

    var el = h("div", { class: "wga-effort" });
    var ctl = h("div", { class: "wga-filters" });
    var sel = h("select", { id: "ef-g", "aria-label": "Working group", style: "max-width:280px" }, [h("option", { value: "", text: "All working groups" })]
      .concat(gs.slice().sort(function (a, b) { return WGA.name(a.slug).localeCompare(WGA.name(b.slug)); })
        .map(function (g) { return h("option", { value: g.slug, text: WGA.name(g.slug) }); })));
    var ord = h("select", { id: "ef-o", "aria-label": "Order" }, ORDERS.map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    ctl.appendChild(h("div", { class: "wga-group" }, [h("label", { for: "ef-g", text: "Highlight" }), sel]));
    ctl.appendChild(h("div", { class: "wga-group" }, [h("label", { for: "ef-o", text: "Order" }), ord]));
    el.appendChild(ctl);

    var body = h("div", { class: "ef-body" });
    var chart = h("div", { class: "ef-chart" });
    var side = h("div", { class: "ef-side" });
    var legend = h("div", { class: "ef-legend", role: "group", "aria-label": "Sources shown" });
    SRC.forEach(function (k, i) {
      var b = h("button", { type: "button", class: "ef-src", "aria-pressed": "true", title: "Show or hide " + WGA.SOURCES[k].label },
        [h("span", { class: "k", style: "background:" + COL[i] }), h("span", { class: "nm", text: WGA.SOURCES[k].label }), h("span", { class: "mu", text: fmt(srcTot[i]) + " items" })]);
      b.addEventListener("click", function () {
        st.off[i] = !st.off[i];
        if (SRC.every(function (_, j) { return st.off[j]; })) st.off[i] = false;   // keep at least one on
        b.setAttribute("aria-pressed", String(!st.off[i]));
        draw();
      });
      legend.appendChild(b);
    });
    side.appendChild(h("div", { class: "wga-note", style: "margin-bottom:-0.4em", text: "Sources shown (click to turn off; try GitHub):" }));
    side.appendChild(legend);
    var panel = h("div", { class: "ef-panel", "aria-live": "polite" });
    side.appendChild(panel);
    side.appendChild(h("p", { class: "wga-note", text: "Wedge area is proportional to items in the last 12 months; the dashed rings mark 10, 100 and 1,000 items. GitHub commits count as 1/10 of an item (a pull request usually brings many commits); everything else is counted as is. Teams is hand-collected for most but not all groups." }));
    body.appendChild(chart); body.appendChild(side);
    el.appendChild(body);

    sel.addEventListener("change", function () { pick(sel.value || null, true); });
    ord.addEventListener("change", function () { st.order = ord.value; draw(); });
    chart.addEventListener("mouseleave", function () { st.hover = null; light(); showPanel(); });

    function pick(slug, fromMenu) {
      st.picked = slug; sel.value = slug || "";
      light(); showPanel();
      if (opts.onPick) opts.onPick(slug, fromMenu);
    }

    var paths = [], texts = [];
    function draw() {
      maxT = Math.max.apply(null, gs.map(shownTotal).concat([1]));
      var idx = gs.map(function (_, k) { return k; });
      idx.sort(st.order === "name" ? function (a, b) { return WGA.name(gs[a].slug).localeCompare(WGA.name(gs[b].slug)); }
        : function (a, b) { return shownTotal(gs[b]) - shownTotal(gs[a]) || gs[b].total - gs[a].total; });
      var C = 360, R0 = 34, R1 = 250, TAU = Math.PI * 2;
      var rad = function (c) { return R0 + (R1 - R0) * Math.sqrt(c / maxT); };   // area-true stacking
      var pt = function (a, r) { return [C + r * Math.sin(a), C - r * Math.cos(a)]; };
      var f = function (x) { return x.toFixed(1); };
      var arc = function (a0, a1, r0, r1) {
        var p0 = pt(a0, r1), p1 = pt(a1, r1), p2 = pt(a1, r0), p3 = pt(a0, r0);
        return "M" + f(p0[0]) + "," + f(p0[1]) + " A" + f(r1) + "," + f(r1) + " 0 0 1 " + f(p1[0]) + "," + f(p1[1]) +
          " L" + f(p2[0]) + "," + f(p2[1]) + " A" + f(r0) + "," + f(r0) + " 0 0 0 " + f(p3[0]) + "," + f(p3[1]) + " Z";
      };
      var svg = s("svg", { viewBox: "8 8 704 704", role: "img", "aria-label": "Items per working group and source, last 12 months" });
      svg.appendChild(s("circle", { cx: C, cy: C, r: R0, fill: "none", stroke: "#e1e0d9" }));
      var ticks = [10, 100, 1000].filter(function (t) { return t < maxT; });
      ticks.forEach(function (t) { svg.appendChild(s("circle", { cx: C, cy: C, r: f(rad(t)), fill: "none", stroke: "#e1e0d9", "stroke-dasharray": "2 4" })); });
      paths = []; texts = [];
      var step = TAU / n, pad = step * 0.08;
      idx.forEach(function (k, p) {
        var g = gs[k], a0 = p * step + pad, a1 = (p + 1) * step - pad, cum = 0;
        var grp = s("g", { "data-slug": g.slug, style: "cursor:pointer" });
        SRC.forEach(function (_, i) {
          if (!g.v[i] || st.off[i]) return;
          var r0 = rad(cum); cum += g.v[i]; var r1 = rad(cum);
          if (r1 - r0 > 0.2) {
            var path = s("path", { d: arc(a0, a1, r0, r1), fill: COL[i], stroke: "#ffffff", "stroke-width": "0.8" });
            grp.appendChild(path); paths.push([g.slug, path]);
          }
        });
        var rEnd = rad(cum);
        if (R1 - rEnd > 0.3) grp.appendChild(s("path", { d: arc(a0, a1, rEnd, R1), fill: "#000000", "fill-opacity": "0" }));
        var t = s("title"); t.textContent = WGA.name(g.slug); grp.appendChild(t);
        grp.addEventListener("mouseenter", function () { st.hover = g.slug; light(); showPanel(); });
        grp.addEventListener("click", function () {
          if (opts.clickTo === "page") { location.href = WGA.wgHref(g.slug); return; }
          pick(st.picked === g.slug ? null : g.slug, false);
        });
        svg.appendChild(grp);
        var mid = (a0 + a1) / 2, deg = mid * 180 / Math.PI, left = deg > 180, lp = pt(mid, Math.max(rEnd, R0 + 60) + 6);
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
        panel.appendChild(h("p", { class: "wga-note", style: "margin:0", text: "One wedge per working group, busiest first. The colours show where its items come from. GitHub is most of the volume, so turn it off to compare forums, calls, the conference and Teams. Hover a wedge for its numbers; click it to pick that group." }));
        return;
      }
      var g = gs.filter(function (x) { return x.slug === focus; })[0];
      panel.appendChild(h("a", { href: WGA.wgHref(focus), class: "ef-name", text: WGA.name(focus) }));
      var tot = shownTotal(g);
      panel.appendChild(h("div", { class: "wga-note", text: fmt(g.total) + " items in the last 12 months" + (tot !== g.total ? " (" + fmt(tot) + " in the sources shown)" : "") }));
      var t = h("div", { class: "ef-tbl" }, [h("span"), h("span", { class: "hd", text: "Source" }), h("span", { class: "hd r", text: "Items" }), h("span", { class: "hd r", text: "Share" })]);
      SRC.forEach(function (key, i) {
        t.appendChild(h("span", { class: "k", style: "background:" + COL[i] }));
        t.appendChild(h("span", { text: WGA.SOURCES[key].label }));
        t.appendChild(h("span", { class: "r b", text: fmt(g.v[i]) }));
        t.appendChild(h("span", { class: "r mu", text: st.off[i] ? "hidden" : tot ? Math.round(100 * g.v[i] / tot) + "%" : "–" }));
      });
      panel.appendChild(t);
      if (g.commits) panel.appendChild(h("div", { class: "wga-note", text: "GitHub: " + WGA.fmt(g.raw[0]) + " items, of which " + WGA.fmt(g.commits) + " commits counted at 1/10." }));
    }

    draw();
    sel.value = st.picked || "";
    return { el: el, setPicked: function (slug) { st.picked = slug; sel.value = slug || ""; light(); showPanel(); } };
  };
})();
