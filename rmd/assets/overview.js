/* Overview: last complete week at a glance, plus similar work and movers beside the heatmap. */
(function () {
  var h = WGA.h;
  var top = document.getElementById("wga-week"), side = document.getElementById("wga-side");
  if (!top) return;

  WGA.loadMany(["data/digest.json", "data/similar.json", "data/activity.json"]).then(function (r) {
    var dig = r[0], sim = r[1], act = r[2];
    WGA.setNames(dig.names);
    drawWeek(dig, sim);
    if (side) drawSide(sim, act);
  }).catch(function (e) { WGA.fail(top, e); });

  function lastComplete(dig) {
    var w = dig.weeks;
    return w[w.length - 1].week === dig.partial_week && w.length > 1 ? w[w.length - 2] : w[w.length - 1];
  }

  function drawWeek(dig, sim) {
    var w = lastComplete(dig);
    var end = new Date(w.start + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() + 6);
    var endIso = end.toISOString().slice(0, 10);
    top.textContent = "";
    top.appendChild(h("div", { class: "wga-page-h" }, [
      h("div", {}, [h("h1", { text: "This week across OHDSI working groups" })]),
      h("div", { class: "wga-note" }, ["Week of " + WGA.fmtDate(w.start) + " – " + WGA.fmtDateY(endIso) + " · ",
        h("a", { href: "activity.html?week=" + w.week, text: "Full digest →" })]),
    ]));
    var tiles = h("div", { class: "wga-tiles" });
    var bt = w.by_type;
    WGA.tile(tiles, "Public items", WGA.fmt(w.items), "from " + w.groups + " groups");
    WGA.tile(tiles, "Merged pull requests", WGA.fmt(bt.pr_merged || 0), WGA.fmt(bt.pr_opened || 0) + " opened · " + WGA.fmt(bt.issue_opened || 0) + " new issues");
    WGA.tile(tiles, "Releases (excl. nightly)", String(w.releases.length),
      w.releases.length ? w.releases.slice(0, 2).map(function (x) { return x.title; }).join(" · ") + (w.releases.length > 2 ? " …" : "") : "none this week");
    var since = new Date(w.start + "T00:00:00Z"); since.setUTCDate(since.getUTCDate() - 21);
    var fresh = sim.clusters.filter(function (c) { return c.latest >= since.toISOString().slice(0, 10); });
    WGA.tile(tiles, "Similar-work clusters", String(fresh.length), h("a", { href: "connections.html#similar", text: "active in the last 4 weeks →" }), "warm");
    top.appendChild(tiles);
    var note = document.getElementById("wga-updated");
    WGA.updated(note, dig.generated, "Counts are items from public sources; each item is counted once even when it names several groups");
  }

  function drawSide(sim, act) {
    side.textContent = "";
    var card = h("section", { class: "wga-card tight", "aria-labelledby": "ov-sim" }, [h("h3", { id: "ov-sim", text: "Similar work, different groups" })]);
    sim.clusters.filter(function (c) { return !c.topic; }).slice(0, 5).forEach(function (c) {
      card.appendChild(h("a", { class: "wga-lcard", href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", style: "margin-bottom:0.5em;background:var(--page)" }, [
        h("div", { class: "t", text: c.term }),
        h("div", { class: "m", text: c.wgs.map(WGA.shortName).join(" · ") }),
        h("div", { class: "m", text: c.n + " items · " + (c.new_ties.length ? c.new_ties.length + " pairs not yet connected" : "groups already connected") }),
      ]));
    });
    card.appendChild(h("a", { href: "connections.html#similar", text: "All overlaps →", style: "font-size:0.85em" }));
    side.appendChild(card);

    var mv = h("section", { class: "wga-card tight", "aria-labelledby": "ov-mv" }, [h("h3", { id: "ov-mv", text: "Movers, last 8 weeks" })]);
    var ws = act.wgs.filter(function (w) { return w.recent + w.prior >= 20; });
    var up = ws.slice().sort(function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior); }).slice(0, 3);
    var down = ws.slice().sort(function (a, b) { return (a.recent - a.prior) - (b.recent - b.prior); }).slice(0, 2);
    up.concat(down).forEach(function (w) {
      var d = w.recent - w.prior;
      mv.appendChild(h("div", { style: "display:flex;justify-content:space-between;gap:0.5em;font-size:0.9em;padding:0.2em 0" }, [
        h("a", { href: WGA.wgHref(w.slug), text: WGA.shortName(w.slug) }),
        h("span", { style: "font-weight:600;color:" + (d >= 0 ? "var(--accent)" : "var(--warm-ink)"), text: w.recent + " vs " + w.prior }),
      ]));
    });
    var quiet = act.wgs.filter(function (w) { return w.status === "quiet"; }).map(function (w) { return w.name; });
    var dorm = act.wgs.filter(function (w) { return w.status === "dormant"; }).map(function (w) { return w.name; });
    if (quiet.length || dorm.length) mv.appendChild(h("div", { class: "wga-note", style: "border-top:1px solid var(--grid);padding-top:0.5em;margin-top:0.4em",
      text: (quiet.length ? "Gone quiet: " + quiet.join(", ") + ". " : "") + (dorm.length ? "Dormant: " + dorm.join(", ") + "." : "") }));
    side.appendChild(mv);
  }
})();
