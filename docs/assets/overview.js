/* Overview: last complete week at a glance, plus similar work and movers beside the heatmap. */
(function () {
  var h = WGA.h;
  var top = document.getElementById("wga-week"), side = document.getElementById("wga-side");
  if (!top) return;

  Promise.all([WGA.loadMany(["data/digest.json", "data/similar.json", "data/activity.json"]), WGA.cal.load()]).then(function (all) {
    var r = all[0], dig = r[0], sim = r[1], act = r[2];
    WGA.setNames(dig.names);
    drawWeek(dig, sim);
    if (side) { drawSide(sim, act); if (all[1]) drawComing(all[1]); }
  }).catch(function (e) { WGA.fail(top, e); });

  function drawComing(cal) {
    var up = WGA.cal.upcoming(cal, { skipExpected: true }).slice(0, 6);
    var card = h("section", { class: "wga-card tight", "aria-labelledby": "ov-cal" }, [h("h3", { id: "ov-cal", text: "Coming up" })]);
    if (up.length) {
      var ul = h("ul", { class: "cal-list" });
      var lastDay = null;
      up.forEach(function (e) {
        if (e.date !== lastDay) { ul.appendChild(h("li", { class: "cal-dh", text: WGA.cal.when({ date: e.date }) })); lastDay = e.date; }
        ul.appendChild(WGA.cal.row(e, true));
      });
      card.appendChild(ul);
    } else card.appendChild(h("p", { class: "wga-empty", text: "No upcoming meetings listed" + (cal.source_updated ? " (ohdsi.org's list was last updated " + WGA.fmtDateY(cal.source_updated) + ")." : ".") }));
    card.appendChild(h("a", { href: "activity.html?view=calendar", text: "Full calendar →", style: "font-size:0.85em" }));
    side.insertBefore(card, side.firstChild);
  }

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
        h("a", { href: "activity.html?view=week&week=" + w.week, text: "Full digest →" })]),
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
    var ul = h("ul", { class: "wga-plain", style: "padding-left:0;list-style:none;margin:0" });
    sim.clusters.filter(function (c) { return !c.topic; }).slice(0, 6).forEach(function (c) {
      ul.appendChild(h("li", { style: "padding:0.4em 0;border-top:1px solid var(--grid)" }, [
        h("a", { href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", text: c.term, style: "font-weight:600" }),
        h("div", { class: "wga-note", text: c.wgs.map(WGA.shortName).join(" · ") }),
      ]));
    });
    card.appendChild(ul);
    card.appendChild(h("a", { href: "connections.html#similar", text: "All overlaps →", style: "font-size:0.85em" }));
    side.appendChild(card);

    var mv = h("section", { class: "wga-card tight", "aria-labelledby": "ov-mv" }, [h("h3", { id: "ov-mv", text: "Movers, last 8 weeks" })]);
    var ws = act.wgs.filter(function (w) { return w.recent + w.prior >= 20; });
    var up = ws.slice().sort(function (a, b) { return (b.recent - b.prior) - (a.recent - a.prior); }).slice(0, 3);
    var down = ws.slice().sort(function (a, b) { return (a.recent - a.prior) - (b.recent - b.prior); }).slice(0, 2);
    mv.appendChild(h("p", { class: "wga-note", style: "margin:0 0 0.4em", text: "Items in the last 8 weeks compared with the 8 weeks before (groups with 20+ items)." }));
    // Layout is inline so the box still lines up if an older style.css is cached.
    var mg = h("div", { class: "wga-movers", style: "display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:0.25em 0.9em;align-items:baseline;font-size:0.9em" });
    var num = "text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;";
    mg.appendChild(h("span"));
    mg.appendChild(h("span", { style: num + "font-size:0.78em;font-weight:600;color:var(--ink-muted)", text: "Last 8 wks" }));
    mg.appendChild(h("span", { style: num + "font-size:0.78em;font-weight:600;color:var(--ink-muted)", text: "8 before" }));
    up.concat(down).forEach(function (w) {
      var d = w.recent - w.prior;
      mg.appendChild(h("a", { href: WGA.wgHref(w.slug), text: WGA.shortName(w.slug), title: WGA.name(w.slug), style: "line-height:1.3" }));
      mg.appendChild(h("span", { style: num + "font-weight:600;color:" + (d >= 0 ? "var(--accent)" : "var(--warm-ink)"), text: (d >= 0 ? "▲ " : "▼ ") + WGA.fmt(w.recent) }));
      mg.appendChild(h("span", { style: num + "color:var(--ink-muted)", text: WGA.fmt(w.prior) }));
    });
    mv.appendChild(mg);
    var quiet = act.wgs.filter(function (w) { return w.status === "quiet"; }).map(function (w) { return w.name; });
    var dorm = act.wgs.filter(function (w) { return w.status === "dormant"; }).map(function (w) { return w.name; });
    if (quiet.length || dorm.length) mv.appendChild(h("div", { class: "wga-note", style: "border-top:1px solid var(--grid);padding-top:0.5em;margin-top:0.4em",
      text: (quiet.length ? "Gone quiet: " + quiet.join(", ") + ". " : "") + (dorm.length ? "Dormant: " + dorm.join(", ") + "." : "") }));
    side.appendChild(mv);
  }
})();
