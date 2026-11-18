/* Topics: curated cross-group topics over time, topic x group at each Global Symposium, shared terms not yet a topic.
   With ?t=<id>, one topic's page. Reads data/topics.json and data/similar.json. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-topics");
  if (!root) return;
  var tid = WGA.param("t");

  WGA.loadMany(["data/topics.json", "data/similar.json"]).then(function (r) {
    WGA.setNames(r[0].names);
    if (tid) page(r[0], r[1]); else overview(r[0], r[1]);
  }).catch(function (e) { WGA.fail(root, e); });

  function overview(d, sim) {
    var state = { view: WGA.param("view") || "time", year: d.symposia.length ? d.symposia[d.symposia.length - 1].year : null };
    root.textContent = "";
    var seg = h("div", { class: "wga-seg", role: "group", "aria-label": "View" });
    var body = h("div");
    [["time", "Last 6 months"], ["symposium", "At the Global Symposium"]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state.view === o[0]) });
      b.addEventListener("click", function () { state.view = o[0]; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); draw(); });
      seg.appendChild(b);
    });
    root.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: "Topics" }),
      h("p", { class: "sub wga-note", text: "Subjects that cut across groups: curated topics (config/collab_themes.yml) and shared terms found automatically." })]), seg]));
    root.appendChild(body);

    function draw() {
      body.textContent = "";
      if (state.view === "symposium") body.appendChild(crosswalk(d, state));
      else body.appendChild(radar(d));
      body.appendChild(terms(sim));
    }
    draw();
  }

  function radar(d) {
    var from = d.weeks.length - 26;
    var t = h("table", { class: "wga-table left" });
    t.appendChild(h("thead", {}, [h("tr", {}, ["Topic", "Groups, last 6 months", "Items, last 12 months", "Week by week, last 6 months", "Most active groups, last 6 months (items)"].map(function (x) { return h("th", { scope: "col", text: x }); }))]));
    var tb = h("tbody");
    d.topics.forEach(function (x) {
      tb.appendChild(h("tr", {}, [
        h("td", {}, [h("a", { href: WGA.topicHref(x.id), text: x.name, style: "font-weight:600" })]),
        h("td", { text: String(x.wgs_recent.length) }),
        h("td", { text: WGA.fmt(x.total52) }),
        h("td", { style: "min-width:200px" }, [WGA.strip(x.intensity.slice(from))]),
        h("td", {}, [weighted(x.wgs_recent.slice(0, 6))]),
      ]));
    });
    t.appendChild(tb);
    return h("section", { class: "wga-card" }, [h("div", { class: "hm-scroll" }, [t]),
      h("p", { class: "wga-note", text: "An item counts for a topic when its title matches the topic's keywords; commits and comments are left out, and items tagged to more than four groups do not count toward a group. Strip colour is relative across topics." })]);
  }

  /* One group per line, linked, with a bar sized by its items on the topic: more involved groups take more space. */
  function weighted(list) {
    if (!list.length) return h("span", { class: "wga-note", text: "–" });
    var max = list[0][1] || 1;
    return h("ul", { class: "wga-wlist" }, list.map(function (g) {
      return h("li", {}, [
        WGA.isBucket(g[0]) ? h("span", { text: WGA.name(g[0]) }) : h("a", { href: WGA.wgHref(g[0]), text: WGA.shortName(g[0]), title: WGA.name(g[0]) }),
        h("span", { "aria-hidden": "true" }, [h("span", { class: "bar", style: "display:block;width:" + Math.max(6, Math.round(100 * g[1] / max)) + "%" })]),
        h("span", { class: "n", text: String(g[1]), title: g[1] + " items in the last 6 months" }),
      ]);
    }));
  }

  function crosswalk(d, state) {
    var box = h("section", { class: "wga-card" });
    var sel = h("select", { id: "t-year" }, d.symposia.slice().reverse().map(function (s) { return h("option", { value: s.year, text: s.event }); }));
    sel.value = state.year;
    var inner = h("div");
    sel.addEventListener("change", function () { state.year = sel.value; fill(); });
    box.appendChild(h("div", { class: "wga-filters" }, [h("label", { for: "t-year", class: "visually-hidden", text: "Symposium" }), sel]));
    box.appendChild(inner);
    function fill() {
      inner.textContent = "";
      var s = d.symposia.filter(function (x) { return x.year === state.year; })[0];
      if (!s) return;
      inner.appendChild(h("p", { class: "wga-note", text: s.items + " posters, talks, sessions and tutorials. Each cell counts the items on a topic credited to a group. A topic spread across three or more groups is a candidate for a joint session." }));
      var n = s.cols.length;
      var m = h("div", { class: "wga-matrix", style: "grid-template-columns: 210px repeat(" + n + ", minmax(0, 1fr)) 90px" });
      m.appendChild(h("div"));
      s.cols.forEach(function (c) { m.appendChild(h("a", { class: "h", href: WGA.wgHref(c), text: WGA.shortName(c) })); });
      m.appendChild(h("div", { class: "h", text: "Joint session?" }));
      s.rows.forEach(function (r) {
        m.appendChild(h("a", { class: "r", href: WGA.topicHref(r.id), text: r.name }));
        r.cells.forEach(function (v, i) {
          var c = h("div", { class: "c", text: v ? String(v) : "·", title: r.name + " · " + WGA.name(s.cols[i]) + ": " + v });
          if (v) { c.style.background = WGA.rampColor(Math.min(1, 0.15 + v / 12)); c.style.color = v >= 6 ? "#fff" : "var(--accent-ink)"; }
          m.appendChild(c);
        });
        m.appendChild(h("div", { class: "flag", text: r.groups >= 3 ? r.groups + " groups" : "" }));
      });
      inner.appendChild(h("div", { class: "hm-scroll" }, [m]));
      inner.appendChild(h("p", { class: "wga-note", text: "Columns are the ten groups with the most topic-matched items at this symposium. Showcase entries are matched to groups by title and authors, so many credits are by subject, not by the group itself." }));
    }
    fill();
    return box;
  }

  function terms(sim) {
    var free = sim.clusters.filter(function (c) { return !c.topic; }).slice(0, 10);
    var grid = WGA.rows([["Term", "minmax(140px, 1fr)"], ["Groups", "minmax(200px, 2.4fr)"], ["Items, last 12 months", "minmax(110px, 0.8fr)"]],
      free.map(function (c) {
        return [[h("div", { class: "nm" }, [h("a", { href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", text: c.term })])],
          [WGA.sm(c.wgs.map(WGA.shortName).join(" · "))], [h("div", { class: "num", text: String(c.n) })]];
      }));
    return h("section", { class: "wga-card warm" }, [h("h3", { text: "Shared terms this year, not yet a curated topic" }), grid,
      h("p", { class: "wga-note warm-ink", text: "Found automatically from item titles. To make one a topic, add it to config/collab_themes.yml." })]);
  }

  function page(d, sim) {
    var x = d.topics.filter(function (t) { return t.id === tid; })[0];
    root.textContent = "";
    if (!x) { root.appendChild(h("div", { class: "rmdimportant" }, ["No topic \"" + tid + "\". ", h("a", { href: "topics.html", text: "All topics" })])); return; }
    document.title = x.name + " · OHDSI WG Activity";
    root.appendChild(h("div", { class: "wga-crumb" }, [h("a", { href: "topics.html", text: "Topics" }), " / " + x.name]));
    root.appendChild(h("section", { class: "wga-card" }, [
      h("div", { class: "wga-row-h" }, [h("h2", { text: x.name, style: "margin:0;font-size:1.7em;font-weight:600" }), WGA.statusBadge(x.status, x.recent, x.prior)]),
      h("p", { class: "wga-note", text: WGA.fmt(x.total52) + " items in the last 12 months · " + x.wgs_recent.length + " groups in the last 6 months" }),
      WGA.strip(x.intensity),
    ]));
    var cols = h("div", { class: "wga-cols" });
    var main = h("div", { class: "main" }), side = h("div", { class: "side" });
    cols.appendChild(main); cols.appendChild(side); root.appendChild(cols);
    main.appendChild(h("section", { class: "wga-card" }, [h("h3", { text: "Recent items" }), x.evidence.length ? WGA.feed(x.evidence) : h("p", { class: "wga-empty", text: "None in the last 6 months." })]));
    var t = h("table", { class: "wga-table" });
    t.appendChild(h("thead", {}, [h("tr", {}, ["Group", "Last 6 months", "Last 12 months"].map(function (z) { return h("th", { scope: "col", text: z }); }))]));
    var rec = {}; x.wgs_recent.forEach(function (g) { rec[g[0]] = g[1]; });
    var tb = h("tbody");
    x.wgs.slice(0, 15).forEach(function (g) { tb.appendChild(h("tr", {}, [h("td", {}, [h("a", { href: WGA.wgHref(g[0]), text: WGA.shortName(g[0]) })]), h("td", { text: String(rec[g[0]] || 0) }), h("td", { text: String(g[1]) })])); });
    t.appendChild(tb);
    side.appendChild(h("section", { class: "wga-card tight" }, [h("h3", { text: "Groups" }), t]));
    var hist = d.symposia.map(function (s) { var r = s.rows.filter(function (z) { return z.id === tid; })[0]; return [s.year, r ? r.total : 0, r ? r.groups : 0]; });
    side.appendChild(h("section", { class: "wga-card tight" }, [h("h3", { text: "At the Global Symposium" }),
      h("ul", { class: "wga-plain" }, hist.map(function (y) { return h("li", { text: y[0] + ": " + y[1] + " items, " + y[2] + " groups" }); }))]));
    var cl = sim.clusters.filter(function (c) { return c.topic === tid; });
    if (cl.length) side.appendChild(h("section", { class: "wga-card warm tight" }, [h("h3", { text: "Shared terms within it" })].concat(cl.slice(0, 5).map(function (c) {
      return h("p", { style: "margin:0 0 0.4em;font-size:0.88em" }, [h("a", { href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", text: c.term }), " · " + c.wgs.map(WGA.shortName).join(", ")]);
    }))));
  }
})();
