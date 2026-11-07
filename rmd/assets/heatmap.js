/* Heatmap of working group activity: one row per WG, one column per ISO week. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-heatmap");
  if (!root) return;

  var state = { source: "all", range: 52, sort: "recent", showEmpty: false, showExtra: true, sel: null };
  var data, rows, cols;

  var RANGES = [[12, "12 weeks"], [26, "26 weeks"], [52, "52 weeks"]];
  var SORTS = [["recent", "Most active, last 8 weeks"], ["change", "Biggest rise, last 8 weeks"], ["total", "Most active, whole range"], ["name", "Name"]];

  WGA.load().then(function (d) { data = d; build(); render(); }).catch(function (e) { WGA.fail(root, e); });

  /* ---------- derive the rows for the current filters ---------- */
  function compute() {
    var n = Math.min(state.range, data.weeks.length), from = data.weeks.length - n;
    var src = state.source;
    cols = { n: n, from: from, weeks: data.weeks.slice(from), starts: data.week_starts.slice(from) };
    rows = data.wgs.filter(function (w) { return state.showExtra || w.on_ohdsi_org; }).map(function (w) {
      var counts, inten, na;
      if (src === "all") {
        counts = w.total.slice(from); inten = w.intensity.slice(from); na = null;
      } else {
        var s = w.sources[src];
        counts = s ? s.counts.slice(from) : cols.weeks.map(function () { return 0; });
        inten = s ? s.intensity.slice(from) : cols.weeks.map(function () { return 0; });
        na = notCollected(w, src, from);
      }
      var rec = WGA.sum(counts.slice(-8)), prior = WGA.sum(counts.slice(-16, -8)), tot = WGA.sum(counts);
      return { wg: w, counts: counts, inten: inten, na: na, recent: rec, prior: prior, total: tot };
    });
    rows.forEach(function (r) {
      r.status = r.total === 0 ? "dormant" : r.recent === 0 ? "quiet" : (WGA.sum(r.counts.slice(0, -8)) === 0 ? "new" : "active");
    });
    var all = rows;
    if (!state.showEmpty) rows = rows.filter(function (r) { return r.total > 0; });
    var cmp = {
      recent: function (a, b) { return b.recent - a.recent || b.total - a.total; },
      change: function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior) || b.recent - a.recent; },
      total: function (a, b) { return b.total - a.total; },
      name: function (a, b) { return a.wg.name.localeCompare(b.wg.name); },
    }[state.sort];
    rows.sort(function (a, b) { return cmp(a, b) || a.wg.name.localeCompare(b.wg.name); });
    rows.hidden = all.filter(function (r) { return r.total === 0; });
  }

  /* Weeks where a source was not being collected for this WG (as opposed to quiet). */
  function notCollected(w, src, from) {
    var n = data.weeks.length, out = [], i;
    if (src === "teams") {
      for (i = from; i < n; i++) out.push(!(w.teams_covered && w.teams_covered[i]));
    } else {
      var first = data.coverage[src] ? data.coverage[src][0] : null;
      for (i = from; i < n; i++) out.push(first ? data.week_starts[i] < mondayOf(first) : true);
    }
    return out;
  }
  function mondayOf(iso) {
    var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  /* ---------- static structure ---------- */
  var el = {};
  function build() {
    root.textContent = "";
    el.filters = h("div", { class: "wga-filters" });
    el.tiles = h("div", { class: "wga-tiles" });
    el.card = h("div", { class: "wga-card" });
    el.detail = h("div", { class: "wga-card wga-detail", "aria-live": "polite" });
    el.table = h("details", { class: "wga-card" });
    root.appendChild(el.filters); root.appendChild(el.tiles); root.appendChild(el.card);
    root.appendChild(el.detail); root.appendChild(el.table);
    buildFilters();
    el.detail.appendChild(h("p", { class: "wga-note", text: "Select a cell to list that week's items." }));
  }

  function seg(label, options, key, fmt) {
    var wrap = h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: label })]);
    var box = h("div", { class: "wga-seg", role: "group", "aria-label": label });
    options.forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state[key] === o[0]), "data-v": o[0] });
      b.addEventListener("click", function () {
        state[key] = o[0]; state.sel = null;
        Array.prototype.forEach.call(box.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        render(); resetDetail();
      });
      box.appendChild(b);
    });
    wrap.appendChild(box);
    return wrap;
  }

  function buildFilters() {
    var f = el.filters;
    f.appendChild(seg("Range", RANGES.map(function (r) { return [r[0], r[1]]; }), "range"));
    var srcs = [["all", "All sources"]].concat(data.sources.map(function (s) { return [s, WGA.SOURCES[s] ? WGA.SOURCES[s].label : s]; }));
    f.appendChild(seg("Source", srcs, "source"));
    var sel = h("select", { id: "hm-sort", "aria-label": "Sort rows" }, SORTS.map(function (s) { return h("option", { value: s[0], text: s[1] }); }));
    sel.addEventListener("change", function () { state.sort = sel.value; render(); });
    f.appendChild(h("div", { class: "wga-group" }, [h("label", { for: "hm-sort", text: "Sort" }), sel]));
    f.appendChild(check("Show groups with no activity", "showEmpty"));
    f.appendChild(check("Include groups not on ohdsi.org's list", "showExtra"));
  }
  function check(label, key) {
    var i = h("input", { type: "checkbox" });
    i.checked = !!state[key];
    i.addEventListener("change", function () { state[key] = i.checked; render(); });
    return h("label", { class: "wga-check" }, [i, label]);
  }

  /* ---------- render ---------- */
  function render() {
    compute();
    renderTiles();
    renderHeatmap();
    renderTable();
  }

  function renderTiles() {
    var active = rows.concat(rows.hidden).filter(function (r) { return r.recent > 0; });
    var events = WGA.sum(rows.map(function (r) { return r.total; }));
    var top = rows.slice().sort(function (a, b) { return b.recent - a.recent; })[0];
    var rise = rows.slice().sort(function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior); })[0];
    var all = rows.length + rows.hidden.length;
    el.tiles.textContent = "";
    function tile(l, v, n) { el.tiles.appendChild(h("div", { class: "wga-tile" }, [h("div", { class: "l", text: l }), h("div", { class: "v" + (v.length > 16 ? " long" : ""), text: v }), n ? h("div", { class: "n", text: n }) : null])); }
    tile("Groups active, last 8 weeks", active.length + " of " + all, "groups with any activity");
    tile("Items in range", WGA.fmt(events), cols.n + " weeks, " + (state.source === "all" ? "all sources" : WGA.SOURCES[state.source].label));
    tile("Most active, last 8 weeks", top && top.recent ? top.wg.name : "none", top && top.recent ? WGA.fmt(top.recent) + " items" : "");
    var d = rise ? rise.recent - rise.prior : 0;
    tile("Biggest rise vs. prior 8 weeks", d > 0 ? rise.wg.name : "none", d > 0 ? "+" + WGA.fmt(d) + " items" : "");
  }

  function renderHeatmap() {
    var n = cols.n;
    el.card.textContent = "";
    var scroll = h("div", { class: "hm-scroll" });
    var grid = h("div", { class: "hm", role: "grid", "aria-label": "Working group activity by week", style: "--cols:" + n });
    scroll.appendChild(grid);

    // header: month labels
    var head = h("div", { class: "hm-row hm-head", role: "row", "aria-hidden": "true" });
    head.appendChild(h("div", { text: "Working group" }));
    var prev = null;
    cols.starts.forEach(function (s, i) {
      var m = WGA.month(s);
      head.appendChild(h("div", { class: "m", text: m !== prev && i < n - 3 ? m : "", style: "grid-column:" + (i + 2) }));
      prev = m;
    });
    head.appendChild(h("div", { class: "hm-meta", text: "Last 8 wks" }));
    grid.appendChild(head);

    rows.forEach(function (r, ri) {
      var row = h("div", { class: "hm-row", role: "row" });
      var name = h("div", { class: "hm-name", role: "rowheader" }, [
        h("a", { href: "wg.html?wg=" + encodeURIComponent(r.wg.slug), text: r.wg.name }),
        r.wg.on_ohdsi_org ? null : h("span", { class: "x", text: " *", title: "Not on ohdsi.org's working group list" }),
      ]);
      name.title = r.wg.name;
      row.appendChild(name);
      r.counts.forEach(function (c, ci) {
        var na = r.na && r.na[ci];
        var cell = h("div", {
          class: "hm-cell" + (na ? " na" : "") + (ci === n - 1 ? " cur" : ""),
          role: "gridcell", tabindex: ri === 0 && ci === n - 1 ? "0" : "-1",
          "data-r": ri, "data-c": ci,
          "aria-label": r.wg.name + ", " + WGA.weekLabel(cols.starts[ci]) + ": " + (na ? "not collected" : c + " items"),
        });
        if (!na && c > 0) cell.style.background = WGA.rampColor(0.08 + 0.92 * r.inten[ci]);
        row.appendChild(cell);
      });
      var st = WGA.STATUS[r.status];
      var dlt = r.recent - r.prior;
      row.appendChild(h("div", { class: "hm-meta", title: st.label + ": " + st.hint }, [
        h("span", { text: st.glyph + " " + WGA.fmt(r.recent) }),
        h("span", { class: "d", text: r.prior || r.recent ? " (" + (dlt >= 0 ? "+" : "−") + WGA.fmt(Math.abs(dlt)) + ")" : "" }),
      ]));
      grid.appendChild(row);
    });

    el.card.appendChild(scroll);
    if (!rows.length) el.card.appendChild(h("p", { class: "hm-empty", text: "No working groups match these filters." }));
    if (rows.hidden.length && !state.showEmpty) {
      el.card.appendChild(h("p", { class: "hm-empty", text: "No activity found in this range for: " + rows.hidden.map(function (r) { return r.wg.name; }).join(", ") + "." }));
    }
    if (state.source === "teams") {
      el.card.appendChild(h("p", { class: "hm-empty", text: "Teams data is collected by hand and so far covers only some groups. Hatched cells were not collected." }));
    }
    el.card.appendChild(legend());

    wire(grid);
    if (state.sel) markSelected(grid);
  }

  function legend() {
    var lg = h("div", { class: "wga-legend" });
    lg.appendChild(h("span", { class: "item" }, [h("span", { class: "sw" }), "No activity"]));
    var ramp = h("span", { class: "ramp" }); ramp.style.background = WGA.rampGradient();
    lg.appendChild(h("span", { class: "item" }, ["Lower", ramp, "Higher activity (relative to each source's own range)"]));
    lg.appendChild(h("span", { class: "item" }, [h("span", { class: "sw na" }), "Not collected"]));
    lg.appendChild(h("span", { class: "item", text: "Grey bar under a cell = current week, still in progress. * = not on ohdsi.org's list." }));
    return lg;
  }

  /* ---------- interaction ---------- */
  function cellData(node) {
    var r = rows[+node.getAttribute("data-r")], c = +node.getAttribute("data-c");
    return { r: r, c: c };
  }

  function tipFor(node) {
    var d = cellData(node), r = d.r, w = cols.weeks[d.c], wi = cols.from + d.c;
    var box = h("div", {});
    box.appendChild(h("div", { class: "t", text: r.wg.name }));
    box.appendChild(h("div", { class: "s", text: WGA.weekLabel(cols.starts[d.c]) + (w === data.partial_week ? " (in progress)" : "") }));
    if (r.na && r.na[d.c]) {
      box.appendChild(h("div", { class: "n", text: "Not collected for this source." }));
      return box;
    }
    var any = false;
    Object.keys(r.wg.sources).forEach(function (s) {
      if (state.source !== "all" && state.source !== s) return;
      var v = r.wg.sources[s].counts[wi];
      if (v > 0) { any = true; box.appendChild(WGA.tipRow(WGA.SOURCES[s].color, WGA.fmt(v), WGA.SOURCES[s].label)); }
    });
    if (!any) box.appendChild(h("div", { class: "n", text: "No activity." }));
    else box.appendChild(h("div", { class: "h", text: "Select the cell for links." }));
    return box;
  }

  function wire(grid) {
    grid.addEventListener("pointermove", function (e) {
      var cell = e.target.closest && e.target.closest(".hm-cell");
      if (cell) WGA.tip.show(tipFor(cell), e.clientX, e.clientY); else WGA.tip.hide();
    });
    grid.addEventListener("pointerleave", WGA.tip.hide);
    grid.addEventListener("focusin", function (e) {
      var cell = e.target.closest && e.target.closest(".hm-cell");
      if (!cell) return;
      var b = cell.getBoundingClientRect();
      WGA.tip.show(tipFor(cell), b.right, b.top);
    });
    grid.addEventListener("focusout", WGA.tip.hide);
    grid.addEventListener("click", function (e) {
      var cell = e.target.closest && e.target.closest(".hm-cell");
      if (cell && !cell.classList.contains("na")) select(cell, grid);
    });
    grid.addEventListener("keydown", function (e) {
      var cell = e.target.closest && e.target.closest(".hm-cell");
      if (!cell) return;
      var r = +cell.getAttribute("data-r"), c = +cell.getAttribute("data-c"), nr = r, nc = c;
      if (e.key === "ArrowRight") nc = Math.min(c + 1, cols.n - 1);
      else if (e.key === "ArrowLeft") nc = Math.max(c - 1, 0);
      else if (e.key === "ArrowDown") nr = Math.min(r + 1, rows.length - 1);
      else if (e.key === "ArrowUp") nr = Math.max(r - 1, 0);
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!cell.classList.contains("na")) select(cell, grid); return; }
      else return;
      e.preventDefault();
      var next = grid.querySelector('.hm-cell[data-r="' + nr + '"][data-c="' + nc + '"]');
      if (next) { cell.setAttribute("tabindex", "-1"); next.setAttribute("tabindex", "0"); next.focus(); }
    });
  }

  function select(cell, grid) {
    var d = cellData(cell);
    state.sel = { slug: d.r.wg.slug, week: cols.weeks[d.c] };
    markSelected(grid);
    renderDetail(d.r, d.c);
  }
  function markSelected(grid) {
    Array.prototype.forEach.call(grid.querySelectorAll(".hm-cell.sel"), function (x) { x.classList.remove("sel"); });
    if (!state.sel) return;
    var ri = rows.findIndex(function (r) { return r.wg.slug === state.sel.slug; }), ci = cols.weeks.indexOf(state.sel.week);
    var c = ri >= 0 && ci >= 0 && grid.querySelector('.hm-cell[data-r="' + ri + '"][data-c="' + ci + '"]');
    if (c) c.classList.add("sel");
  }

  function resetDetail() {
    el.detail.textContent = "";
    el.detail.appendChild(h("p", { class: "wga-note", text: "Select a cell to list that week's items." }));
  }

  function renderDetail(r, c) {
    var wk = cols.weeks[c], wi = cols.from + c;
    el.detail.textContent = "";
    el.detail.appendChild(h("h4", { text: r.wg.name + " — " + WGA.weekLabel(cols.starts[c]) }));
    var parts = [];
    Object.keys(r.wg.sources).forEach(function (s) {
      if (state.source !== "all" && state.source !== s) return;
      var v = r.wg.sources[s].counts[wi];
      if (v) parts.push(WGA.fmt(v) + " " + WGA.SOURCES[s].label);
    });
    el.detail.appendChild(h("div", { class: "sub", text: parts.length ? parts.join(" · ") : "No activity this week." }));
    var items = (r.wg.items[wk] || []).filter(function (it) { return state.source === "all" || it.s === state.source; });
    if (items.length) {
      el.detail.appendChild(WGA.itemList(items));
      var shown = items.length, total = WGA.sum(Object.keys(r.wg.sources).filter(function (s) { return s !== "teams" && (state.source === "all" || state.source === s); }).map(function (s) { return r.wg.sources[s].counts[wi]; }));
      if (total > shown) el.detail.appendChild(h("p", { class: "wga-note", text: "Showing " + shown + " of " + WGA.fmt(total) + " items, most substantive first (comments, replies and commits are sampled)." }));
    }
    var t = r.wg.sources.teams;
    if (t && (state.source === "all" || state.source === "teams") && t.counts[wi]) {
      var mt = r.wg.teams_meetings ? r.wg.teams_meetings[wi] : 0;
      el.detail.appendChild(h("p", { class: "wga-note", text: "Teams: " + t.counts[wi] + " channel posts and replies" + (mt ? ", " + mt + " meeting" + (mt > 1 ? "s" : "") : "") + ". Teams content is not published, only counts." }));
    }
    el.detail.appendChild(h("p", {}, [h("a", { href: "wg.html?wg=" + encodeURIComponent(r.wg.slug), text: "Open the " + r.wg.name + " page →" })]));
  }

  /* ---------- table twin ---------- */
  function renderTable() {
    el.table.textContent = "";
    el.table.appendChild(h("summary", { text: "Table view of the same numbers" }));
    var srcs = data.sources.filter(function (s) { return state.source === "all" || state.source === s; });
    var t = h("table", { class: "wga-table" });
    var hr = h("tr", {}, ["Working group", "Status", "Last 8 wks", "Prior 8 wks", "In range"].concat(srcs.map(function (s) { return WGA.SOURCES[s].label; })).map(function (x) { return h("th", { scope: "col", text: x }); }));
    t.appendChild(h("thead", {}, [hr]));
    var tb = h("tbody");
    rows.forEach(function (r) {
      var tr = h("tr", {}, [
        h("td", {}, [h("a", { href: "wg.html?wg=" + encodeURIComponent(r.wg.slug), text: r.wg.name })]),
        h("td", { text: r.status }), h("td", { text: WGA.fmt(r.recent) }), h("td", { text: WGA.fmt(r.prior) }), h("td", { text: WGA.fmt(r.total) }),
      ]);
      srcs.forEach(function (s) {
        var sc = r.wg.sources[s];
        tr.appendChild(h("td", { text: sc ? WGA.fmt(WGA.sum(sc.counts.slice(cols.from))) : "0" }));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    el.table.appendChild(h("div", { class: "hm-scroll" }, [t]));
  }
})();
