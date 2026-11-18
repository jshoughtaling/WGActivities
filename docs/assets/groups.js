/* Groups: one row per working group. Filter by name; sort by activity (default) or name. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-groups");
  if (!root) return;
  var state = { q: WGA.param("q") || "", sort: WGA.param("sort") || "recent" };
  var SORTS = [["recent", "Most active, last 8 weeks"], ["year", "Most active, last 12 months"], ["change", "Biggest rise, last 8 weeks"], ["name", "Name"]];

  Promise.all([WGA.loadMany(["data/activity.json", "data/projects.json", "data/topics.json"]), WGA.cal ? WGA.cal.load() : null]).then(function (all) {
    var r = all[0], act = r[0], proj = r[1], top = r[2], cal = all[1];
    WGA.setNames(proj.names);
    var projs = {}, tops = {}, next = {}, noMeet = {};
    proj.projects.forEach(function (p) { if (p.grouped || p.recent) (projs[p.lead_wg] = projs[p.lead_wg] || []).push(p); });
    top.topics.forEach(function (t) { t.wgs_recent.forEach(function (x) { if (x[1] >= 2) (tops[x[0]] = tops[x[0]] || []).push({ id: t.id, name: t.name, n: x[1] }); }); });
    if (cal) {
      WGA.cal.upcoming(cal).forEach(function (e) { if (e.kind === "meeting" && e.wg && !next[e.wg]) next[e.wg] = e; });
      (cal.status || []).forEach(function (x) { if (x.wg) noMeet[x.wg] = x.state; });
    }
    draw(act, projs, tops, next, noMeet);
  }).catch(function (e) { WGA.fail(root, e); });

  function draw(act, projs, tops, next, noMeet) {
    root.textContent = "";
    var q = h("input", { type: "search", class: "wga-input", id: "g-q", placeholder: "Filter by name", value: state.q });
    var sort = h("select", { id: "g-sort" }, SORTS.map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    sort.value = state.sort;
    root.appendChild(h("div", { class: "wga-filters" }, [
      h("div", { class: "wga-group" }, [h("label", { for: "g-q", class: "visually-hidden", text: "Filter by name" }), q]),
      h("div", { class: "wga-group" }, [h("label", { for: "g-sort", text: "Sort" }), sort]),
    ]));
    var count = h("p", { class: "wga-note" });
    var list = h("div");
    root.appendChild(count); root.appendChild(list);
    q.addEventListener("input", function () { state.q = q.value.toLowerCase(); fill(); });
    sort.addEventListener("change", function () { state.sort = sort.value; fill(); });
    var from = act.weeks.length - 26;

    function fill() {
      var ql = state.q.toLowerCase();
      var ws = act.wgs.filter(function (w) { return !ql || w.name.toLowerCase().indexOf(ql) >= 0 || w.slug.indexOf(ql) >= 0; });
      ws.sort({
        name: function (a, b) { return a.name.localeCompare(b.name); },
        recent: function (a, b) { return b.recent - a.recent || a.name.localeCompare(b.name); },
        change: function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior) || a.name.localeCompare(b.name); },
        year: function (a, b) { return WGA.sum(b.total) - WGA.sum(a.total) || a.name.localeCompare(b.name); },
      }[state.sort]);
      count.textContent = ws.length + " working group" + (ws.length === 1 ? "" : "s");
      list.textContent = "";
      list.appendChild(WGA.rows([["Working group", "minmax(160px, 1.5fr)"], ["Next meeting", "minmax(110px, 0.9fr)"], ["Last 6 months", "minmax(130px, 1.1fr)"], ["Last 8 weeks", "minmax(85px, 0.7fr)"], ["Projects", "minmax(200px, 1.9fr)"], ["Topics", "minmax(200px, 1.9fr)"]],
        ws.map(function (w) {
          var ps = (projs[w.slug] || []).map(function (p) { return { text: p.name, href: WGA.projHref(p.id), n: p.counts ? WGA.sum(p.counts.slice(-26)) : 0 }; })
            .sort(function (a, b) { return b.n - a.n || a.text.localeCompare(b.text); });
          var ts = (tops[w.slug] || []).map(function (t) { return { text: t.name, href: WGA.topicHref(t.id), n: t.n }; })
            .sort(function (a, b) { return b.n - a.n || a.text.localeCompare(b.text); });
          var d = w.recent - w.prior, nx = next[w.slug];
          var st = WGA.STATUS[w.status] || { label: w.status };
          return [
            [h("div", { class: "nm" }, [h("a", { href: WGA.wgHref(w.slug), text: w.name + (w.on_ohdsi_org === false ? " *" : "") })]),
              WGA.sm(st.label.charAt(0).toUpperCase() + st.label.slice(1), "mu")],
            nx ? [h("div", { class: "num", text: WGA.cal.when({ date: nx.date }) + (nx.cancelled ? " (cancelled)" : "") }),
                  WGA.sm([nx.time_et + " ET · ", h("a", { href: "activity.html?view=calendar&q=" + encodeURIComponent(w.slug), text: "calendar" })], "mu")]
               : WGA.sm(noMeet[w.slug] ? (noMeet[w.slug] === "tbd" ? "To be decided" : noMeet[w.slug].charAt(0).toUpperCase() + noMeet[w.slug].slice(1)) : "Not listed", "mu"),
            [WGA.strip(w.intensity.slice(from))],
            [h("div", { class: "num" }, [h("b", { text: WGA.fmt(w.recent) }), h("span", { class: "mu", text: " items" })]),
              WGA.sm((d >= 0 ? "+" : "−") + WGA.fmt(Math.abs(d)) + " vs the 8 before", "mu")],
            WGA.wlist(ps, "items in the last 6 months"),
            WGA.wlist(ts, "items on this topic in the last 6 months"),
          ];
        }), "No groups match."));
    }
    fill();
    root.appendChild(h("p", { class: "wga-note", text: "Strip = activity per week over the last 6 months, all sources. Next meeting = from ohdsi.org's Upcoming Working Group Calls; \"Not listed\" means the group is not on that page. * = not on ohdsi.org's working group list." }));
  }
})();
