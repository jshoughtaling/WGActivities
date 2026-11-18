/* Groups directory: one card per working group. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-groups");
  if (!root) return;
  var state = { q: "", status: "all", sort: "recent" };

  WGA.loadMany(["data/activity.json", "data/projects.json", "data/topics.json"]).then(function (r) {
    var act = r[0], proj = r[1], top = r[2];
    WGA.setNames(proj.names);
    var projs = {}, tops = {};
    proj.projects.forEach(function (p) { if (p.grouped || p.recent) (projs[p.lead_wg] = projs[p.lead_wg] || []).push(p); });
    top.topics.forEach(function (t) { t.wgs_recent.forEach(function (x) { if (x[1] >= 2) (tops[x[0]] = tops[x[0]] || []).push(t); }); });
    draw(act, projs, tops);
  }).catch(function (e) { WGA.fail(root, e); });

  function draw(act, projs, tops) {
    root.textContent = "";
    var q = h("input", { type: "search", class: "wga-input", id: "g-q", placeholder: "Filter by name" });
    var sort = h("select", { id: "g-sort" }, [["recent", "Most active, last 8 weeks"], ["change", "Biggest rise"], ["name", "Name"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    var seg = h("div", { class: "wga-seg", role: "group", "aria-label": "Status" });
    [["all", "All"], ["active", "Active"], ["quiet", "Quiet or dormant"]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state.status === o[0]) });
      b.addEventListener("click", function () { state.status = o[0]; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); list(); });
      seg.appendChild(b);
    });
    root.appendChild(h("div", { class: "wga-filters" }, [
      h("div", { class: "wga-group" }, [h("label", { for: "g-q", class: "visually-hidden", text: "Filter by name" }), q]),
      h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: "Status" }), seg]),
      h("div", { class: "wga-group" }, [h("label", { for: "g-sort", text: "Sort" }), sort]),
    ]));
    var grid = h("div", { class: "wga-grid" });
    root.appendChild(grid);
    q.addEventListener("input", function () { state.q = q.value.toLowerCase(); list(); });
    sort.addEventListener("change", function () { state.sort = sort.value; list(); });
    var n = 26, from = act.weeks.length - n;

    function list() {
      grid.textContent = "";
      var ws = act.wgs.filter(function (w) {
        if (state.q && w.name.toLowerCase().indexOf(state.q) < 0 && w.slug.indexOf(state.q) < 0) return false;
        if (state.status === "active") return w.status === "active" || w.status === "new";
        if (state.status === "quiet") return w.status === "quiet" || w.status === "dormant";
        return true;
      });
      ws.sort({
        recent: function (a, b) { return b.recent - a.recent; },
        change: function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior); },
        name: function (a, b) { return a.name.localeCompare(b.name); },
      }[state.sort]);
      if (!ws.length) grid.appendChild(h("p", { class: "wga-empty", text: "No groups match." }));
      ws.forEach(function (w) {
        var ps = (projs[w.slug] || []).slice().sort(function (a, b) { return b.recent - a.recent; });
        var ts = (tops[w.slug] || []).slice(0, 3);
        var d = w.recent - w.prior;
        grid.appendChild(h("a", { class: "wga-lcard", href: WGA.wgHref(w.slug) }, [
          h("div", { class: "t" }, [h("span", { text: w.name + (w.on_ohdsi_org === false ? " *" : "") }), WGA.statusBadge(w.status, w.recent, w.prior)]),
          WGA.strip(w.intensity.slice(from)),
          h("div", { class: "m", text: WGA.fmt(w.recent) + " items in the last 8 weeks (" + (d >= 0 ? "+" : "−") + WGA.fmt(Math.abs(d)) + ")" }),
          ps.length ? h("div", { class: "d", text: "Projects: " + ps.slice(0, 3).map(function (p) { return p.name; }).join(", ") + (ps.length > 3 ? " +" + (ps.length - 3) : "") }) : null,
          ts.length ? h("div", { class: "d", text: "Topics: " + ts.map(function (t) { return t.name; }).join(", ") }) : null,
        ]));
      });
    }
    list();
    root.appendChild(h("p", { class: "wga-note", text: "Strip = the last 26 weeks, all sources. * = not on ohdsi.org's working group list. Leads, meeting times and how to join are not collected yet; see each group's page on ohdsi.org." }));
  }
})();
