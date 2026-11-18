/* Heatmap: one row per working group, project or topic (the "lens"), one column per ISO week.
   Groups can expand into their projects. Reads data/activity.json, data/projects.json, data/topics.json. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-heatmap");
  if (!root) return;

  var state = { view: WGA.param("view") === "table" ? "table" : "grid", lens: WGA.param("lens") || "groups", source: "all", range: 26, sort: "recent", showEmpty: false, showExtra: true, sel: null, open: {} };
  var data, proj, topics, rows, cols, projByWg = {};

  var RANGES = [[13, "3 months"], [26, "6 months"], [52, "12 months"]];
  var SORTS = [["recent", "Most active, last 8 weeks"], ["change", "Biggest rise, last 8 weeks"], ["total", "Most active, whole range"], ["name", "Name"]];
  var LENSES = [["groups", "Groups"], ["projects", "Projects"], ["topics", "Topics"]];
  var NOUN = { groups: "working group", projects: "project", topics: "topic" };

  WGA.loadMany(["data/activity.json", "data/projects.json", "data/topics.json"]).then(function (r) {
    data = r[0]; proj = r[1]; topics = r[2];
    WGA.setNames(proj.names);
    proj.projects.forEach(function (p) {
      if (!p.counts) return;
      (projByWg[p.lead_wg] = projByWg[p.lead_wg] || []).push(p);
    });
    build(); render();
  }).catch(function (e) { WGA.fail(root, e); });

  /* ---------- rows for the current lens and filters ---------- */
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function summarize(r) {
    r.recent = WGA.sum(r.counts.slice(-8)); r.prior = WGA.sum(r.counts.slice(-16, -8)); r.total = WGA.sum(r.counts);
    r.status = r.total === 0 ? "dormant" : r.recent === 0 ? "quiet" : (WGA.sum(r.counts.slice(0, -8)) === 0 ? "new" : "active");
    return r;
  }

  function groupRow(w, from) {
    var src = state.source, counts, inten, na = null;
    if (src === "all") { counts = w.total.slice(from); inten = w.intensity.slice(from); }
    else {
      var s = w.sources[src];
      counts = s ? s.counts.slice(from) : zeros(cols.n);
      inten = s ? s.intensity.slice(from) : zeros(cols.n);
      na = notCollected(w, src, from);
    }
    var subs = (projByWg[w.slug] || []).filter(function (p) { return WGA.sum(p.counts.slice(from)) > 0; });
    return summarize({
      key: "g:" + w.slug, name: w.name, href: WGA.wgHref(w.slug), star: w.on_ohdsi_org === false,
      counts: counts, inten: inten, na: na, wg: w, nsub: subs.length, subs: subs,
      items: function (wk) { return (w.items[wk] || []).filter(function (it) { return src === "all" || it.s === src; }); },
      sources: function (wi) {
        return Object.keys(w.sources).filter(function (s) { return src === "all" || src === s; }).map(function (s) {
          return [WGA.SOURCES[s].color, w.sources[s].counts[wi], WGA.SOURCES[s].label];
        });
      },
    });
  }
  function projRow(p, from, sub) {
    return summarize({
      key: "p:" + p.id, name: p.name, href: WGA.projHref(p.id), sub: sub,
      tag: sub ? (p.repos.length > 1 ? p.repos.length + " repos" : "") : WGA.shortName(p.lead_wg) + (p.repos.length > 1 ? " · " + p.repos.length + " repos" : ""),
      counts: p.counts.slice(from), inten: p.intensity.slice(from), na: null,
      items: function (wk) { return p.items[wk] || []; },
      sources: function (wi) { return [[WGA.SOURCES.github.color, p.counts[wi], "GitHub (" + p.repos.length + " repo" + (p.repos.length > 1 ? "s" : "") + ")"]]; },
    });
  }
  function topicRow(t, from) {
    return summarize({
      key: "t:" + t.id, name: t.name, href: WGA.topicHref(t.id), tag: t.wgs_recent.length + " groups",
      counts: t.counts.slice(from), inten: t.intensity.slice(from), na: null,
      items: function (wk) { return t.items[wk] || []; },
      sources: function (wi) { return [["var(--accent)", t.counts[wi], "items matching the topic"]]; },
    });
  }

  function compute() {
    var n = Math.min(state.range, data.weeks.length), from = data.weeks.length - n;
    cols = { n: n, from: from, weeks: data.weeks.slice(from), starts: data.week_starts.slice(from) };
    var all;
    if (state.lens === "projects") all = proj.projects.filter(function (p) { return p.counts; }).map(function (p) { return projRow(p, from); });
    else if (state.lens === "topics") all = topics.topics.map(function (t) { return topicRow(t, from); });
    else all = data.wgs.filter(function (w) { return state.showExtra || w.on_ohdsi_org; }).map(function (w) { return groupRow(w, from); });
    rows = state.showEmpty ? all.slice() : all.filter(function (r) { return r.total > 0; });
    var cmp = {
      recent: function (a, b) { return b.recent - a.recent || b.total - a.total; },
      change: function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior) || b.recent - a.recent; },
      total: function (a, b) { return b.total - a.total; },
      name: function (a, b) { return a.name.localeCompare(b.name); },
    }[state.sort];
    rows.sort(function (a, b) { return cmp(a, b) || a.name.localeCompare(b.name); });
    rows.hidden = all.filter(function (r) { return r.total === 0; });
    if (state.lens === "groups") {
      var out = [];
      rows.forEach(function (r) {
        out.push(r);
        if (state.open[r.key]) r.subs.map(function (p) { return projRow(p, from, true); })
          .sort(function (a, b) { return b.recent - a.recent || b.total - a.total; }).slice(0, 10).forEach(function (s) { out.push(s); });
      });
      out.hidden = rows.hidden; rows = out;
    }
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
    el.card = h("div", { class: "wga-card" });
    el.detail = h("div", { class: "wga-card wga-detail", "aria-live": "polite" });
    el.table = h("div", { class: "wga-card" });
    root.appendChild(el.filters); root.appendChild(el.card);
    root.appendChild(el.detail); root.appendChild(el.table);
    buildFilters();
    resetDetail();
  }

  function seg(label, options, key) {
    var wrap = h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: label })]);
    var box = h("div", { class: "wga-seg", role: "group", "aria-label": label });
    options.forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state[key] === o[0]), "data-v": o[0] });
      b.addEventListener("click", function () {
        state[key] = o[0]; state.sel = null;
        Array.prototype.forEach.call(box.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        if (key === "lens" || key === "view") syncLens();
        render(); resetDetail();
      });
      box.appendChild(b);
    });
    wrap.appendChild(box);
    return wrap;
  }

  function buildFilters() {
    var f = el.filters;
    f.appendChild(seg("View", [["grid", "Grid"], ["table", "Table"]], "view"));
    f.appendChild(seg("Rows", LENSES, "lens"));
    f.appendChild(seg("Range", RANGES, "range"));
    var srcs = [["all", "All sources"]].concat(data.sources.map(function (s) { return [s, WGA.SOURCES[s] ? WGA.SOURCES[s].label : s]; }));
    el.srcSeg = seg("Source", srcs, "source");
    f.appendChild(el.srcSeg);
    var sel = h("select", { id: "hm-sort", "aria-label": "Sort rows" }, SORTS.map(function (s) { return h("option", { value: s[0], text: s[1] }); }));
    sel.addEventListener("change", function () { state.sort = sel.value; render(); });
    f.appendChild(h("div", { class: "wga-group" }, [h("label", { for: "hm-sort", text: "Sort" }), sel]));
    f.appendChild(check("Show rows with no activity", "showEmpty"));
    el.extra = check("Include groups not on ohdsi.org's list", "showExtra");
    f.appendChild(el.extra);
    syncLens();
  }
  function syncLens() {
    var g = state.lens === "groups";
    el.srcSeg.style.display = g ? "" : "none";
    el.extra.style.display = g ? "" : "none";
    if (!g) state.source = "all";
    var t = state.view === "table";
    el.card.style.display = t ? "none" : "";
    el.detail.style.display = t ? "none" : "";
    el.table.style.display = t ? "" : "none";
    var qs = [g ? "" : "lens=" + state.lens, t ? "view=table" : ""].filter(Boolean).join("&");
    try { history.replaceState(null, "", qs ? "?" + qs : location.pathname); } catch (e) { /* file:// */ }
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
    renderHeatmap();
    renderTable();
  }

  function renderHeatmap() {
    var n = cols.n;
    el.card.textContent = "";
    var scroll = h("div", { class: "hm-scroll" });
    var grid = h("div", { class: "hm", role: "grid", "aria-label": NOUN[state.lens] + " activity by week", style: "--cols:" + n });
    scroll.appendChild(grid);

    var head = h("div", { class: "hm-row hm-head", role: "row", "aria-hidden": "true" });
    head.appendChild(h("div", { text: NOUN[state.lens].charAt(0).toUpperCase() + NOUN[state.lens].slice(1) }));
    var prev = null;
    cols.starts.forEach(function (s, i) {
      var m = WGA.month(s);
      head.appendChild(h("div", { class: "m", text: m !== prev && i < n - 3 ? m : "", style: "grid-column:" + (i + 2) }));
      prev = m;
    });
    head.appendChild(h("div", { class: "hm-meta", text: "Last 8 wks" }));
    grid.appendChild(head);

    rows.forEach(function (r, ri) {
      var row = h("div", { class: "hm-row" + (r.sub ? " sub" : ""), role: "row" });
      var kids = [];
      if (r.nsub) {
        var tg = h("button", { type: "button", class: "tg", "aria-expanded": String(!!state.open[r.key]),
          "aria-label": (state.open[r.key] ? "Hide" : "Show") + " projects of " + r.name, text: state.open[r.key] ? "▾" : "▸" });
        tg.addEventListener("click", function () { state.open[r.key] = !state.open[r.key]; render(); });
        kids.push(tg);
      }
      kids.push(h("a", { href: r.href, text: r.name }));
      if (r.star) kids.push(h("span", { class: "x", text: " *", title: "Not on ohdsi.org's working group list" }));
      if (r.tag) kids.push(h("span", { class: "tag", text: " · " + r.tag }));
      var name = h("div", { class: "hm-name", role: "rowheader", title: r.name }, kids);
      row.appendChild(name);
      r.counts.forEach(function (c, ci) {
        var na = r.na && r.na[ci];
        var cell = h("div", {
          class: "hm-cell" + (na ? " na" : "") + (ci === n - 1 ? " cur" : ""),
          role: "gridcell", tabindex: ri === 0 && ci === n - 1 ? "0" : "-1",
          "data-r": ri, "data-c": ci,
          "aria-label": r.name + ", " + WGA.weekLabel(cols.starts[ci]) + ": " + (na ? "not collected" : c + " items"),
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
    if (!rows.length) el.card.appendChild(h("p", { class: "hm-empty", text: "Nothing matches these filters." }));
    if (rows.hidden.length && !state.showEmpty && state.lens === "groups") {
      el.card.appendChild(h("p", { class: "hm-empty", text: "No activity found in this range for: " + rows.hidden.map(function (r) { return r.name; }).join(", ") + "." }));
    }
    if (state.lens === "projects") el.card.appendChild(h("p", { class: "hm-empty", text: "Projects are counted from GitHub only. Multi-repo projects come from config/projects.yml (a draft); every other repo is its own project." }));
    if (state.lens === "topics") el.card.appendChild(h("p", { class: "hm-empty", text: "An item counts for a topic when its title matches the topic's keywords (config/collab_themes.yml). Commits and comments are left out." }));
    if (state.source === "teams") el.card.appendChild(h("p", { class: "hm-empty", text: "Teams data is collected by hand and so far covers only some groups. Hatched cells were not collected." }));
    el.card.appendChild(legend());

    wire(grid);
    if (state.sel) markSelected(grid);
  }

  function legend() {
    var lg = h("div", { class: "wga-legend" });
    lg.appendChild(h("span", { class: "item" }, [h("span", { class: "sw" }), "No activity"]));
    var ramp = h("span", { class: "ramp" }); ramp.style.background = WGA.rampGradient();
    lg.appendChild(h("span", { class: "item" }, ["Lower", ramp, "Higher (relative to each source's own range)"]));
    if (state.lens === "groups") {
      lg.appendChild(h("span", { class: "item" }, [h("span", { class: "sw na" }), "Not collected"]));
      lg.appendChild(h("span", { class: "item", text: "▸ expands a group into its projects. * = not on ohdsi.org's list." }));
    }
    lg.appendChild(h("span", { class: "item", text: "Grey bar under a cell = current week, still in progress." }));
    return lg;
  }

  /* ---------- interaction ---------- */
  function cellData(node) { return { r: rows[+node.getAttribute("data-r")], c: +node.getAttribute("data-c") }; }

  function tipFor(node) {
    var d = cellData(node), r = d.r, w = cols.weeks[d.c], wi = cols.from + d.c;
    var box = h("div", {});
    box.appendChild(h("div", { class: "t", text: r.name }));
    box.appendChild(h("div", { class: "s", text: WGA.weekLabel(cols.starts[d.c]) + (w === data.partial_week ? " (in progress)" : "") }));
    if (r.na && r.na[d.c]) { box.appendChild(h("div", { class: "n", text: "Not collected for this source." })); return box; }
    var any = false;
    r.sources(wi).forEach(function (s) { if (s[1] > 0) { any = true; box.appendChild(WGA.tipRow(s[0], WGA.fmt(s[1]), s[2])); } });
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
    state.sel = { key: d.r.key, week: cols.weeks[d.c] };
    markSelected(grid);
    renderDetail(d.r, d.c);
  }
  function markSelected(grid) {
    Array.prototype.forEach.call(grid.querySelectorAll(".hm-cell.sel"), function (x) { x.classList.remove("sel"); });
    if (!state.sel) return;
    var ri = rows.findIndex(function (r) { return r.key === state.sel.key; }), ci = cols.weeks.indexOf(state.sel.week);
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
    el.detail.appendChild(h("h4", { text: r.name + " — " + WGA.weekLabel(cols.starts[c]) }));
    var parts = r.sources(wi).filter(function (s) { return s[1]; }).map(function (s) { return WGA.fmt(s[1]) + " " + s[2]; });
    el.detail.appendChild(h("div", { class: "sub", text: parts.length ? parts.join(" · ") : "No activity this week." }));
    var items = r.items(wk);
    if (items.length) {
      el.detail.appendChild(WGA.itemList(items));
      var total = WGA.sum(r.sources(wi).filter(function (s) { return s[2] !== WGA.SOURCES.teams.label; }).map(function (s) { return s[1]; }));
      if (total > items.length) el.detail.appendChild(h("p", { class: "wga-note", text: "Showing " + items.length + " of " + WGA.fmt(total) + " items, most substantive first (comments, replies and commits are sampled)." }));
    }
    if (r.wg) {
      var t = r.wg.sources.teams;
      if (t && (state.source === "all" || state.source === "teams") && t.counts[wi]) {
        var mt = r.wg.teams_meetings ? r.wg.teams_meetings[wi] : 0;
        el.detail.appendChild(h("p", { class: "wga-note", text: "Teams: " + t.counts[wi] + " channel posts and replies" + (mt ? ", " + mt + " meeting" + (mt > 1 ? "s" : "") : "") + ". Teams content is not published, only counts." }));
      }
    }
    el.detail.appendChild(h("p", {}, [h("a", { href: r.href, text: "Open the " + r.name + " page →" })]));
  }

  /* ---------- table twin ---------- */
  function renderTable() {
    el.table.textContent = "";
    el.table.appendChild(h("p", { class: "wga-note", style: "margin-top:0", text: "The grid's numbers as a table. The filters and sort above apply to both views." }));
    var srcs = state.lens === "groups" ? data.sources.filter(function (s) { return state.source === "all" || state.source === s; }) : [];
    var t = h("table", { class: "wga-table" });
    var head = [NOUN[state.lens].charAt(0).toUpperCase() + NOUN[state.lens].slice(1), "Status", "Last 8 wks", "Prior 8 wks", "In range"]
      .concat(srcs.map(function (s) { return WGA.SOURCES[s].label; }));
    t.appendChild(h("thead", {}, [h("tr", {}, head.map(function (x) { return h("th", { scope: "col", text: x }); }))]));
    var tb = h("tbody");
    rows.forEach(function (r) {
      if (r.sub) return;
      var tr = h("tr", {}, [
        h("td", {}, [h("a", { href: r.href, text: r.name })]),
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
