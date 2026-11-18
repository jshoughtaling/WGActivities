/* Projects: a catalog (filters) and, with ?p=<id>, one project's page. Reads data/projects.json. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-projects");
  if (!root) return;
  var id = WGA.param("p");

  WGA.loadMany(["data/projects.json", "data/similar.json"]).then(function (r) {
    WGA.setNames(r[0].names);
    var byId = {};
    r[0].projects.forEach(function (p) { byId[p.id] = p; });
    if (id) page(r[0], byId[id], byId, r[1]); else catalog(r[0]);
  }).catch(function (e) { WGA.fail(root, e); });

  /* ---------------- catalog ---------------- */
  function catalog(d) {
    var state = { q: WGA.param("q") || "", kind: "", wg: WGA.param("wg") || "", scope: WGA.param("wg") ? "active" : "grouped", sort: WGA.param("sort") || "recent" };
    root.textContent = "";
    root.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: "Projects" }),
      h("p", { class: "sub wga-note", text: "Software and specifications, between a working group and its repositories. Multi-repo projects are a draft grouping (config/projects.yml) for maintainers to confirm." })])]));
    var q = h("input", { type: "search", class: "wga-input", id: "p-q", placeholder: "Filter by name or repo", value: state.q });
    var kinds = {}; d.projects.forEach(function (p) { kinds[p.kind] = 1; });
    var kind = h("select", { id: "p-kind" }, [h("option", { value: "", text: "All kinds" })].concat(Object.keys(kinds).sort().map(function (k) { return h("option", { value: k, text: WGA.KINDS[k] || k }); })));
    var wgs = {}; d.projects.forEach(function (p) { wgs[p.lead_wg] = 1; });
    var wg = h("select", { id: "p-wg" }, [h("option", { value: "", text: "All groups" })].concat(Object.keys(wgs).sort(function (a, b) { return WGA.name(a).localeCompare(WGA.name(b)); }).map(function (k) { return h("option", { value: k, text: WGA.shortName(k) }); })));
    wg.value = state.wg;
    var scope = h("div", { class: "wga-seg", role: "group", "aria-label": "Show" });
    [["grouped", "Multi-repo projects"], ["active", "+ active single repos"], ["all", "Everything"]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state.scope === o[0]) });
      b.addEventListener("click", function () { state.scope = o[0]; Array.prototype.forEach.call(scope.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); list(); });
      scope.appendChild(b);
    });
    var sort = h("select", { id: "p-sort" }, [["recent", "Most active, last 8 weeks"], ["total", "Most active, last 12 months"], ["name", "Name"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    sort.value = state.sort;
    root.appendChild(h("div", { class: "wga-filters" }, [
      h("div", { class: "wga-group" }, [h("label", { for: "p-q", class: "visually-hidden", text: "Filter" }), q]),
      h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: "Show" }), scope]),
      h("div", { class: "wga-group" }, [h("label", { for: "p-kind", class: "visually-hidden", text: "Kind" }), kind]),
      h("div", { class: "wga-group" }, [h("label", { for: "p-wg", class: "visually-hidden", text: "Lead group" }), wg]),
      h("div", { class: "wga-group" }, [h("label", { for: "p-sort", text: "Sort" }), sort]),
    ]));
    var count = h("p", { class: "wga-note" });
    var grid = h("div");
    root.appendChild(count); root.appendChild(grid);
    [[q, "input", "q"], [kind, "change", "kind"], [wg, "change", "wg"], [sort, "change", "sort"]].forEach(function (x) {
      x[0].addEventListener(x[1], function () { state[x[2]] = x[0].value; list(); });
    });
    var from = d.weeks.length - 26;

    function list() {
      var ql = state.q.toLowerCase();
      var ps = d.projects.filter(function (p) {
        if (state.scope === "grouped" && !p.grouped) return false;
        if (state.scope === "active" && !p.grouped && !p.recent) return false;
        if (state.kind && p.kind !== state.kind) return false;
        if (state.wg && p.lead_wg !== state.wg && p.contributing_wgs.indexOf(state.wg) < 0) return false;
        if (ql && p.name.toLowerCase().indexOf(ql) < 0 && !p.repos.some(function (r) { return r.name.toLowerCase().indexOf(ql) >= 0; })) return false;
        return true;
      });
      ps.sort({ recent: function (a, b) { return b.recent - a.recent || b.total52 - a.total52; }, total: function (a, b) { return b.total52 - a.total52; },
        name: function (a, b) { return a.name.localeCompare(b.name); } }[state.sort]);
      count.textContent = ps.length + " project" + (ps.length === 1 ? "" : "s");
      grid.textContent = "";
      grid.appendChild(WGA.rows([["Project", "minmax(150px, 1.3fr)"], ["Lead group", "minmax(120px, 1fr)"], ["Repositories", "minmax(140px, 1.3fr)"], ["Last 6 months", "minmax(130px, 1.3fr)"], ["Last 8 weeks", "minmax(80px, 0.65fr)"], ["About", "minmax(170px, 1.7fr)"]],
        ps.map(function (p) {
          var ext = p.extends.map(function (x) { var q = d.projects.filter(function (z) { return z.id === x; })[0]; return q ? q.name : x; });
          var extBy = p.extended_by.map(function (x) { var q = d.projects.filter(function (z) { return z.id === x; })[0]; return q ? q.name : x; });
          return [
            [h("div", { class: "nm" }, [h("a", { href: WGA.projHref(p.id), text: p.name })]), WGA.sm(WGA.KINDS[p.kind] || p.kind, "mu")],
            [h("div", { class: "sm", style: "margin-top:0.15em" }, [WGA.isBucket(p.lead_wg) ? h("span", { text: WGA.name(p.lead_wg) }) : h("a", { href: WGA.wgHref(p.lead_wg), text: WGA.shortName(p.lead_wg) })]),
              p.contributing_wgs.length ? WGA.sm("with " + p.contributing_wgs.map(WGA.shortName).join(", "), "mu") : null],
            [h("ul", {}, p.repos.map(function (r) { return h("li", {}, [h("a", { href: r.url, target: "_blank", rel: "noopener", text: r.name })]); }))],
            [p.counts ? WGA.strip(p.intensity.slice(from)) : WGA.sm("No GitHub activity in the last year" + (p.last ? " (last " + WGA.fmtDateY(p.last) + ")" : ""), "mu")],
            [h("div", { class: "num" }, [h("b", { text: WGA.fmt(p.recent) }), h("span", { class: "mu", text: " items" })]),
              p.releases.length ? WGA.sm(p.releases.length + " release" + (p.releases.length > 1 ? "s" : "") + " in 12 months", "mu") : null],
            [WGA.sm(p.description || "–"),
              ext.length ? WGA.sm("Extends: " + ext.join(", "), "warm-ink") : null,
              extBy.length ? WGA.sm("Extended by: " + extBy.join(", "), "warm-ink") : null],
          ];
        }), "No projects match."));
    }
    list();
  }

  /* ---------------- one project ---------------- */
  function page(d, p, byId, sim) {
    root.textContent = "";
    if (!p) { root.appendChild(h("div", { class: "rmdimportant", text: "No project \"" + id + "\". " }, [h("a", { href: "projects.html", text: "All projects" })])); return; }
    document.title = p.name + " · OHDSI WG Activity";
    root.appendChild(h("div", { class: "wga-crumb" }, [h("a", { href: "projects.html", text: "Projects" }), " / " + p.name]));
    var head = h("section", { class: "wga-card" }, [
      h("div", { class: "wga-row-h" }, [
        h("h2", { text: p.name, style: "margin:0;font-size:1.7em;font-weight:600" }),
        h("span", {}, [WGA.badge(WGA.KINDS[p.kind] || p.kind, "blue"), " ", WGA.statusBadge(p.status, p.recent, p.prior)]),
      ]),
      p.description ? h("p", { style: "margin:0.5em 0;color:var(--ink-2)", text: p.description }) : null,
      h("div", { class: "wga-note", style: "display:flex;flex-wrap:wrap;gap:0.4em 1.4em" }, [
        h("span", {}, ["Lead group: ", WGA.isBucket(p.lead_wg) ? WGA.name(p.lead_wg) : h("a", { href: WGA.wgHref(p.lead_wg), text: WGA.shortName(p.lead_wg) })]),
        h("span", {}, ["Contributing: ", p.contributing_wgs.length ? WGA.chipLinks(p.contributing_wgs) : "none recorded"]),
        p.depends_on.length ? h("span", { text: "Depends on: " + p.depends_on.join(", ") }) : null,
        h("span", { text: p.grouped ? "Grouping: config/projects.yml (" + (p.reviewed ? "reviewed " + p.reviewed : "not yet reviewed") + ")" : "A single repository" }),
      ]),
    ]);
    root.appendChild(head);

    // repos
    var t = h("table", { class: "wga-table left" });
    t.appendChild(h("thead", {}, [h("tr", {}, ["Repository", "Items, last 12 months", "PRs merged", "Issues opened", "Last activity", "Latest release"].map(function (x) { return h("th", { scope: "col", text: x }); }))]));
    var tb = h("tbody");
    p.repos.slice().sort(function (a, b) { return b.items - a.items; }).forEach(function (r) {
      tb.appendChild(h("tr", {}, [
        h("td", {}, [h("a", { href: r.url, target: "_blank", rel: "noopener", text: r.name })]),
        h("td", { text: WGA.fmt(r.items) }), h("td", { text: WGA.fmt(r.prs) }), h("td", { text: WGA.fmt(r.issues) }),
        h("td", { text: r.last ? WGA.fmtDateY(r.last) : "–" }),
        h("td", {}, [r.release ? h("a", { href: WGA.safeUrl(r.release.url), target: "_blank", rel: "noopener", text: r.release.title + " (" + WGA.fmtDate(r.release.d) + ")" }) : "–"]),
      ]));
    });
    t.appendChild(tb);
    root.appendChild(h("section", { class: "wga-card" }, [h("h3", { text: "Repositories" }), h("div", { class: "hm-scroll" }, [t])]));

    var cols = h("div", { class: "wga-cols" });
    var main = h("div", { class: "main" }), side = h("div", { class: "side" });
    cols.appendChild(main); cols.appendChild(side); root.appendChild(cols);

    if (p.counts) {
      main.appendChild(h("section", { class: "wga-card" }, [h("h3", { text: "GitHub activity, last 12 months" }),
        WGA.strip(p.intensity), h("p", { class: "wga-note", text: WGA.fmt(p.total52) + " items · " + WGA.fmt(p.recent) + " in the last 8 weeks (" + WGA.fmt(p.prior) + " the 8 before)." })]));
    }
    if (p.releases.length) main.appendChild(h("section", { class: "wga-card" }, [h("h3", { text: "Releases" }), WGA.feed(p.releases, { who: "repo" }),
      h("p", { class: "wga-note", text: "Nightly builds are left out." })]));
    var weeks = Object.keys(p.items || {}).sort().reverse();
    if (weeks.length) {
      var box = h("section", { class: "wga-card" }, [h("h3", { text: "Recent items" })]);
      weeks.slice(0, 5).forEach(function (k) {
        box.appendChild(h("div", { class: "sub", text: WGA.weekLabel(d.week_starts[d.weeks.indexOf(k)]) }));
        box.appendChild(WGA.itemList(p.items[k]));
      });
      main.appendChild(box);
    }

    // extension / forks
    var ext = [];
    p.extends.forEach(function (x) { var q = byId[x]; ext.push(h("p", { style: "margin:0 0 0.4em;font-size:0.88em" }, ["Adapts ", q ? h("a", { href: WGA.projHref(x), text: q.name }) : x, q ? " (" + WGA.shortName(q.lead_wg) + ")" : ""])); });
    p.extended_by.forEach(function (x) { var q = byId[x]; ext.push(h("p", { style: "margin:0 0 0.4em;font-size:0.88em" }, ["Adapted by ", q ? h("a", { href: WGA.projHref(x), text: q.name }) : x, q ? " (" + WGA.shortName(q.lead_wg) + ")" : ""])); });
    if (ext.length) {
      ext.push(h("p", { class: "warm-ink", style: "margin:0.4em 0 0;font-size:0.85em", text: "A project that adapts another to support extra data (a CDM extension, say) is a sign the two could work together on supporting it upstream." }));
      side.appendChild(h("section", { class: "wga-card warm" }, [h("h3", { text: "Adapts and adapted by" })].concat(ext)));
    }
    var repoNames = p.repos.map(function (r) { return r.name.toLowerCase(); });
    var cl = sim.clusters.filter(function (c) { return c.items.some(function (i) { return i.p === p.id; }) || repoNames.indexOf(c.term) >= 0; });
    if (cl.length) {
      side.appendChild(h("section", { class: "wga-card tight" }, [h("h3", { text: "Similar work elsewhere" }), h("ul", { class: "wga-plain" }, cl.slice(0, 5).map(function (c) {
        return h("li", {}, [h("a", { href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", text: c.term }), " · " + c.wgs.map(WGA.shortName).join(", ")]);
      }))]));
    }
    side.appendChild(h("section", { class: "wga-card tight" }, [h("h3", { text: "Compatibility" }),
      h("p", { class: "wga-note", style: "margin:0", text: "Not collected yet. Planned: which databases, CDM versions and language versions each repo supports, with how we know (tested in CI, declared in a package file or README, reported by users, or unknown), and which CDM extensions it reads." })]));
  }
})();
