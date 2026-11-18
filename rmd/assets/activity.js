/* Activity: one filterable item feed. Presets: a week's digest, or outputs over the last year.
   Reads data/digest.json and data/similar.json. URL: ?week=YYYY-Www  ?view=outputs  ?q=<group or text> */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-activity");
  if (!root) return;

  var KINDS = [
    ["release", "Releases", ["release"]], ["pr_merged", "Merged PRs", ["pr_merged"]], ["issue_opened", "New issues", ["issue_opened"]],
    ["pr_opened", "Opened PRs", ["pr_opened"]], ["forum", "Forum topics", ["topic_created"]], ["call", "Community calls", ["community_call", "spotlight"]],
    ["symposium", "Symposium items", ["showcase_entry", "tutorial", "wg_session", "regional_session", "regional_event"]],
  ];
  var v0 = WGA.param("view");
  var state = { view: v0 === "outputs" || v0 === "calendar" ? v0 : "week", week: WGA.param("week"), q: WGA.param("q") || "", kinds: {} };
  KINDS.forEach(function (k) { state.kinds[k[0]] = true; });
  var dig, sim, cal, calState = { mode: WGA.param("mode") === "month" ? "month" : "week" }, el = {};

  Promise.all([WGA.loadMany(["data/digest.json", "data/similar.json"]), WGA.cal.load()]).then(function (all) {
    var r = all[0]; cal = all[1];
    dig = r[0]; sim = r[1]; WGA.setNames(dig.names);
    var weeks = dig.weeks.map(function (w) { return w.week; });
    if (weeks.indexOf(state.week) < 0) {
      var last = dig.weeks[dig.weeks.length - 1];
      state.week = (last.week === dig.partial_week && dig.weeks.length > 1 ? dig.weeks[dig.weeks.length - 2] : last).week;
    }
    build(); draw();
  }).catch(function (e) { WGA.fail(root, e); });

  function kindOf(t) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i][2].indexOf(t) >= 0) return KINDS[i][0]; return null; }
  function matchQ(it) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return it.title.toLowerCase().indexOf(q) >= 0 || (it.wgs || []).some(function (g) { return g.indexOf(q) >= 0 || WGA.name(g).toLowerCase().indexOf(q) >= 0; }) || (it.p || "").indexOf(q) >= 0;
  }
  function visible(it) { var k = kindOf(it.t); return k && state.kinds[k] && matchQ(it); }

  function build() {
    root.textContent = "";
    var cols = h("div", { class: "wga-cols" });
    var side = h("aside", { class: "wga-card side", "aria-label": "Filters", style: "flex: 1 1 240px; max-width: 300px" });
    el.main = h("div", { class: "main" });
    cols.appendChild(side); cols.appendChild(el.main);
    root.appendChild(cols);

    var seg = h("div", { class: "wga-seg", role: "group", "aria-label": "View" });
    [["week", "Week"], ["calendar", "Calendar"], ["outputs", "Outputs"]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state.view === o[0]) });
      b.addEventListener("click", function () { state.view = o[0]; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); syncSide(); draw(); });
      seg.appendChild(b);
    });
    side.appendChild(h("div", { style: "margin-bottom:1em" }, [seg]));

    var wsel = h("select", { id: "a-week", style: "width:100%" }, dig.weeks.slice().reverse().map(function (w) {
      return h("option", { value: w.week, text: "Week of " + WGA.fmtDateY(w.start) + (w.week === dig.partial_week ? " (in progress)" : "") });
    }));
    wsel.value = state.week;
    wsel.addEventListener("change", function () { state.week = wsel.value; draw(); });
    el.weekBox = h("div", { style: "margin-bottom:1em" + (state.view === "week" ? "" : ";display:none") }, [h("label", { for: "a-week", class: "wga-label", text: "Week", style: "display:block;font-size:0.8em;color:var(--ink-2)" }), wsel]);
    side.appendChild(el.weekBox);

    var fs = el.kindsBox = h("fieldset", { style: "border:0;margin:0 0 1em;padding:0" }, [h("legend", { text: "Show", style: "font-size:0.8em;color:var(--ink-2);border:0;margin:0 0 0.3em;font-weight:normal" })]);
    el.counts = {};
    KINDS.forEach(function (k) {
      var i = h("input", { type: "checkbox" }); i.checked = true;
      i.addEventListener("change", function () { state.kinds[k[0]] = i.checked; draw(); });
      el.counts[k[0]] = h("span", { class: "wga-note", style: "margin-left:auto" });
      fs.appendChild(h("label", { class: "wga-check", style: "display:flex;width:100%;padding:0.15em 0" }, [i, " " + k[1], el.counts[k[0]]]));
    });
    side.appendChild(fs);
    var q = h("input", { type: "search", class: "wga-input", id: "a-q", placeholder: "Group, project or words", value: state.q, style: "width:100%;min-width:0" });
    q.addEventListener("input", function () { state.q = q.value; draw(); });
    side.appendChild(h("div", { style: "margin-bottom:1em" }, [h("label", { for: "a-q", text: "Filter", style: "display:block;font-size:0.8em;color:var(--ink-2);font-weight:normal" }), q]));

    var csv = h("button", { type: "button", class: "wga-btn", text: "Download CSV" });
    csv.addEventListener("click", function () { WGA.download("wg-activity-" + (state.view === "week" ? state.week : "outputs") + ".csv", WGA.csv(current().map(function (it) {
      return [it.d, it.s, it.t, (it.wgs || []).map(WGA.name).join("; "), it.title, it.url]; }).reduce(function (a, r) { a.push(r); return a; }, [["date", "source", "type", "groups", "title", "url"]])), "text/csv"); });
    var md = h("button", { type: "button", class: "wga-btn", text: "Copy as forum post" });
    md.addEventListener("click", function () { WGA.copy(markdown(), md); });
    el.getDigest = h("div", { style: "display:flex;flex-direction:column;gap:0.4em;border-top:1px solid var(--grid);padding-top:0.8em" }, [
      h("div", { text: "Get this", style: "font-size:0.8em;color:var(--ink-2)" }), md, csv,
      h("a", { href: "data/digest.xml", text: "RSS feed of weekly digests", style: "font-size:0.88em" }),
    ]);
    el.getCal = h("div", { style: "display:flex;flex-direction:column;gap:0.4em;border-top:1px solid var(--grid);padding-top:0.8em" }, [
      h("div", { text: "Get this", style: "font-size:0.8em;color:var(--ink-2)" }),
      h("a", { class: "wga-btn", href: "data/calendar.ics", text: "Subscribe or download (.ics)", style: "text-align:center" }),
      h("p", { class: "wga-note", style: "margin:0", text: "To subscribe, copy the link and add it as a calendar from URL in Outlook or Google Calendar; it follows the weekly refresh." }),
    ]);
    side.appendChild(el.getDigest); side.appendChild(el.getCal);
    syncSide();
  }
  function syncSide() {
    var c = state.view === "calendar";
    el.weekBox.style.display = state.view === "week" ? "" : "none";
    el.kindsBox.style.display = c ? "none" : "";
    el.getDigest.style.display = c ? "none" : "";
    el.getCal.style.display = c ? "" : "none";
  }

  function weekObj() { return dig.weeks.filter(function (w) { return w.week === state.week; })[0]; }
  function current() {
    if (state.view === "outputs") return dig.outputs.filter(visible);
    var w = weekObj(), seen = {}, out = [];
    w.by_group.forEach(function (g) { g.items.forEach(function (it) { var k = it.t + it.url; if (!seen[k] && visible(it)) { seen[k] = 1; out.push(it); } }); });
    return out.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  }

  function draw() {
    var m = el.main; m.textContent = "";
    if (state.view === "calendar") {
      var q = state.q.toLowerCase();
      return WGA.cal.view(m, cal, calState, function (e) {
        return !q || e.title.toLowerCase().indexOf(q) >= 0 || (e.wg && (e.wg.indexOf(q) >= 0 || WGA.name(e.wg).toLowerCase().indexOf(q) >= 0));
      });
    }
    var base = state.view === "outputs" ? dig.outputs : [].concat.apply([], weekObj().by_group.map(function (g) { return g.items; }));
    var seenC = {};
    KINDS.forEach(function (k) { el.counts[k[0]].textContent = "0"; seenC[k[0]] = {}; });
    base.forEach(function (it) { var k = kindOf(it.t); if (k && matchQ(it)) seenC[k][it.t + it.url] = 1; });
    KINDS.forEach(function (k) { el.counts[k[0]].textContent = String(Object.keys(seenC[k[0]]).length); });
    if (state.view === "outputs") return drawOutputs(m);
    var w = weekObj();
    var end = new Date(w.start + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() + 6);
    m.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: "Week of " + WGA.fmtDate(w.start) + " – " + WGA.fmtDateY(end.toISOString().slice(0, 10)) }),
      h("p", { class: "sub wga-note", text: WGA.fmt(w.items) + " public items · " + w.groups + " groups" + (w.nightly ? " · " + w.nightly + " nightly builds hidden" : "") + (w.week === dig.partial_week ? " · week still in progress" : "") })])]));

    var hl = h("div", { class: "wga-tiles" });
    WGA.tile(hl, "Releases", String(w.releases.length), w.releases.length ? w.releases.slice(0, 3).map(function (r) { return r.title; }).join(" · ") : "none this week");
    WGA.tile(hl, "Merged pull requests", WGA.fmt(w.by_type.pr_merged || 0), WGA.fmt(w.by_type.issue_opened || 0) + " new issues · " + WGA.fmt(w.by_type.topic_created || 0) + " forum topics");
    var wkItems = {}; [].concat.apply([], w.by_group.map(function (g) { return g.items; })).forEach(function (it) { wkItems[it.url] = 1; });
    var touched = sim.clusters.filter(function (c) { return c.items.some(function (i) { return wkItems[i.url]; }); });
    WGA.tile(hl, "Same subject, several groups", String(touched.length), touched.length ? h("span", {}, touched.slice(0, 3).map(function (c, i) {
      return h("span", {}, [i ? " · " : "", h("a", { href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", text: c.term })]); })) : "none this week", "warm");
    m.appendChild(hl);

    var any = false;
    w.by_group.forEach(function (g) {
      var its = g.items.filter(visible);
      if (!its.length) return;
      any = true;
      var title = g.bucket ? h("span", { text: g.name }) : h("a", { href: WGA.wgHref(g.slug), text: g.name, style: "color:var(--ink)" });
      m.appendChild(h("section", { class: "wga-card" }, [
        h("div", { class: "wga-row-h", style: "margin-bottom:0.4em" }, [h("h3", { style: "margin:0" }, [title]), h("span", { class: "wga-note", text: g.n + " items including commits and comments" })]),
        WGA.feed(its, { who: "repo" }),
        g.more ? h("p", { class: "wga-note", text: "+ " + g.more + " more not shown." }) : null,
      ]));
    });
    if (!any) m.appendChild(h("p", { class: "wga-empty", text: "Nothing matches these filters this week." }));
  }

  function drawOutputs(m) {
    var its = current();
    m.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: "Outputs, last 52 weeks" }),
      h("p", { class: "sub wga-note", text: its.length + " shown · releases (nightly builds left out), symposium posters, talks, sessions and tutorials" })])]));
    m.appendChild(h("section", { class: "wga-card" }, [its.length ? WGA.feed(its.slice(0, 400)) : h("p", { class: "wga-empty", text: "Nothing matches these filters." }),
      its.length > 400 ? h("p", { class: "wga-note", text: "Showing the newest 400; download the CSV for all." }) : null]));
  }

  function markdown() {
    var lines = [];
    if (state.view === "outputs") {
      lines.push("## OHDSI working-group outputs, last 52 weeks", "");
      current().slice(0, 200).forEach(function (it) { lines.push("- " + it.d + " · " + (it.wgs || []).map(WGA.shortName).join(", ") + " · [" + it.title + "](" + it.url + ")"); });
    } else {
      var w = weekObj();
      lines.push("## OHDSI working groups, week of " + WGA.fmtDateY(w.start), "", w.items + " public items from " + w.groups + " groups.", "");
      w.by_group.forEach(function (g) {
        var its = g.items.filter(visible);
        if (!its.length) return;
        lines.push("**" + g.name + "**");
        its.slice(0, 8).forEach(function (it) { lines.push("- " + (WGA.TYPE_LABELS[it.t] || it.t) + ": [" + it.title + "](" + it.url + ")"); });
        lines.push("");
      });
    }
    lines.push("", "_From " + location.href.split("?")[0] + "_");
    return lines.join("\n");
  }
})();
