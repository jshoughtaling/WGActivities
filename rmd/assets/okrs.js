/* OKRs: the objectives and key results each working group presented on the community calls or in its slide deck, by year.
   Reads data/okrs.json. URL: ?year=2025&session=a4&q=text&sort=krs&g=<group id> */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-okrs");
  if (!root) return;
  var state = { year: WGA.param("year") || "", q: WGA.param("q") || "", session: WGA.param("session") || "", sort: WGA.param("sort") || "name", pick: WGA.param("g") || "" };

  WGA.load("data/okrs.json").then(function (d) {
    WGA.setNames(d.names);
    if (!state.year || d.years.indexOf(+state.year) < 0) state.year = String(d.years[0]);
    draw(d);
  }).catch(function (e) { WGA.fail(root, e); });

  function text(g) {
    var t = [g.name, (g.leads || []).join(" ")];
    g.objectives.forEach(function (o) { t.push(o.objective); o.krs.forEach(function (k) { t.push(k); }); });
    (g.notes || []).forEach(function (n) { t.push(n); });
    return t.join(" ").toLowerCase();
  }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  function draw(d) {
    var edit = "https://github.com/" + d.repo + "/edit/main/config/" + (+state.year === d.years[0] ? "okrs.yml" : "okrs_" + state.year + ".yml");
    var yearGroups = d.groups.filter(function (g) { return String(g.year) === state.year; });
    var sess = {}; yearGroups.forEach(function (g) { sess[g.session] = 1; });
    var sessKeys = Object.keys(sess).sort(function (a, b) { return d.sessions[a].date < d.sessions[b].date ? -1 : 1; });
    if (state.session && !sess[state.session]) state.session = "";
    root.textContent = "";

    var withVideo = sessKeys.filter(function (k) { return d.sessions[k].video; });
    var intro = ["Objectives and key results the working groups presented on the OHDSI community calls", withVideo.length ? " of " : ""];
    withVideo.forEach(function (k, i) {
      intro.push(i ? (i === withVideo.length - 1 ? " and " : ", ") : "");
      intro.push(h("a", { href: d.sessions[k].video, target: "_blank", rel: "noopener", text: d.sessions[k].label }));
    });
    if (sessKeys.length > withVideo.length) intro.push(withVideo.length ? ", and from the slide decks on ohdsi.org" : " and in slide decks on ohdsi.org");
    intro.push(". Taken from the presented slides, and from the recording where a group had no slide. Not reviewed by the groups; see how to correct them at the bottom.");
    var yr = h("div", { class: "wga-seg", role: "group", "aria-label": "Year" });
    d.years.forEach(function (y) {
      var b = h("button", { type: "button", text: String(y), "aria-pressed": String(String(y) === state.year) });
      b.addEventListener("click", function () { state.year = String(y); state.session = ""; state.pick = ""; urlSync(); draw(d); });
      yr.appendChild(b);
    });
    root.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: state.year + " OKRs" }), h("p", { class: "sub wga-note" }, intro)]),
      d.years.length > 1 ? h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: "Year" }), yr]) : null]));

    var tiles = h("div", { class: "wga-tiles" });
    var objs = WGA.sum(yearGroups.map(function (g) { return g.objectives.length; })), krs = WGA.sum(yearGroups.map(function (g) { return g.kr_count; }));
    var presenting = yearGroups.filter(function (g) { return g.slug; }).length, listed = Object.keys(d.names).length;
    WGA.tile(tiles, "Groups presenting", yearGroups.length, presenting + " of " + listed + " working groups on this site" + (yearGroups.length > presenting ? ", plus " + (yearGroups.length - presenting) + " not in its list" : ""));
    WGA.tile(tiles, "Objectives", objs, "about " + (objs / Math.max(1, yearGroups.length)).toFixed(1) + " per group");
    WGA.tile(tiles, "Key results and planned work", krs);
    WGA.tile(tiles, "No OKRs found", (d.missing[state.year] || []).length, "working groups with none here for " + state.year);
    root.appendChild(tiles);

    var q = h("input", { type: "search", class: "wga-input", id: "o-q", placeholder: "Search objectives, key results, leads", value: state.q });
    var ses = h("div", { class: "wga-seg", role: "group", "aria-label": "Source" });
    if (sessKeys.length > 1) [""].concat(sessKeys).forEach(function (k) {
      var b = h("button", { type: "button", text: k ? d.sessions[k].label : "All", "data-v": k, "aria-pressed": String(state.session === k) });
      b.addEventListener("click", function () { state.session = k; sync(); }); ses.appendChild(b);
    });
    var sort = h("select", { id: "o-sort" }, [["name", "Name"], ["krs", "Most key results"]].concat(+state.year === d.years[0] ? [["recent", "Most active, last 8 weeks"]] : []).map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    if (state.sort === "recent" && +state.year !== d.years[0]) state.sort = "name";
    sort.value = state.sort;
    root.appendChild(h("div", { class: "wga-filters" }, [
      h("div", { class: "wga-group" }, [h("label", { for: "o-q", class: "visually-hidden", text: "Search" }), q]),
      sessKeys.length > 1 ? h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: "Source" }), ses]) : null,
      h("div", { class: "wga-group" }, [h("label", { for: "o-sort", text: "Sort" }), sort]),
    ]));
    var count = h("p", { class: "wga-note", "aria-live": "polite" });
    var list = h("div", { class: "okr-list" });
    root.appendChild(count);
    root.appendChild(list);
    var dl = h("button", { type: "button", class: "wga-btn", text: "Download all years (CSV)" });
    dl.addEventListener("click", function () {
      var rows = [["year", "group", "slug", "call or deck date", "objective", "key result"]];
      d.groups.forEach(function (g) { g.objectives.forEach(function (o) { (o.krs.length ? o.krs : [""]).forEach(function (k) { rows.push([g.year, g.name, g.slug || "", g.date, o.objective, k]); }); }); });
      WGA.download("okrs.csv", WGA.csv(rows), "text/csv");
    });
    root.appendChild(h("p", {}, [dl]));
    q.addEventListener("input", function () { state.q = q.value; urlSync(); fill(); });
    sort.addEventListener("change", function () { state.sort = sort.value; urlSync(); fill(); });
    root.appendChild(missingCard(d, edit));
    root.appendChild(h("p", { class: "wga-note" }, ["Call index: ", h("a", { href: "https://www.ohdsi.org/community-calls-" + state.year + "/", target: "_blank", rel: "noopener", text: "ohdsi.org/community-calls-" + state.year }),
      ". Source data: ", h("a", { href: edit, target: "_blank", rel: "noopener", text: edit.split("/main/")[1] }), "."]));

    function urlSync() {
      var qs = [+state.year !== d.years[0] ? "year=" + state.year : "", state.q ? "q=" + encodeURIComponent(state.q) : "", state.session ? "session=" + state.session : "", state.sort !== "name" ? "sort=" + state.sort : ""].filter(Boolean).join("&");
      try { history.replaceState(null, "", qs ? "?" + qs : location.pathname); } catch (e) { /* file:// */ }
    }
    function sync() {
      Array.prototype.forEach.call(ses.children, function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-v") === state.session)); });
      urlSync(); fill();
    }
    function fill() {
      var needle = state.q.trim().toLowerCase();
      var rows = yearGroups.filter(function (g) { return (!state.session || g.session === state.session) && (!needle || text(g).indexOf(needle) >= 0); });
      rows.sort(function (a, b) {
        if (state.sort === "krs") return b.kr_count - a.kr_count || a.name.localeCompare(b.name);
        if (state.sort === "recent") return (b.recent || -1) - (a.recent || -1) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
      count.textContent = rows.length === yearGroups.length ? plural(rows.length, "group") : rows.length + " of " + yearGroups.length + " groups";
      list.textContent = "";
      rows.forEach(function (g) { list.appendChild(card(d, g, needle)); });
      if (!rows.length) list.appendChild(h("div", { class: "wga-rows" }, [h("div", { class: "empty", text: "No group's OKRs match." })]));
      if (state.pick) { var el = document.getElementById("okr-" + state.pick + "-" + state.year); if (el) { el.scrollIntoView(); state.pick = ""; } }
    }
    fill();
  }

  function card(d, g, needle) {
    var title = g.slug ? h("a", { href: WGA.wgHref(g.slug), text: g.name }) : h("span", { text: g.name });
    var badges = h("span", { class: "wga-chips" }, [WGA.badge(g.when, "")]);
    if (g.source === "transcript") badges.appendChild(WGA.badge("From the recording", "warm"));
    if (!g.slug) badges.appendChild(WGA.badge("Not a group on this site's list", ""));
    if (g.status) badges.appendChild(WGA.statusBadge(g.status, g.recent, g.prior));
    var meta = [];
    if (g.leads.length) meta.push("Leads: " + g.leads.join(", "));
    if (g.meets) meta.push("Meets: " + g.meets);
    var el = h("section", { class: "wga-card okr", id: "okr-" + g.id + "-" + g.year }, [
      h("div", { class: "wga-card-h" }, [h("h3", {}, [title]), badges]),
      meta.length ? h("p", { class: "wga-note", style: "margin:0 0 0.6em", text: meta.join(" · ") }) : null,
    ]);
    WGA.okrBody(g, needle).forEach(function (x) { el.appendChild(x); });
    if (g.notes.length) el.appendChild(h("details", {}, [h("summary", { text: "From the call and slides" }), h("ul", { class: "okr-krs" }, g.notes.map(function (n) { return h("li", { text: n }); }))]));
    var foot = h("div", { class: "okr-foot" });
    if (g.with.length) { foot.appendChild(h("span", { class: "wga-label", text: "Works with" })); foot.appendChild(WGA.chipLinks(g.with)); }
    if (g.with_me.length) { foot.appendChild(h("span", { class: "wga-label", text: "Named by" })); foot.appendChild(WGA.chipLinks(g.with_me)); }
    var shared = d.sessions[g.session].slides === g.slides;
    var links = [];
    if (g.video) links.push(h("a", { href: g.video, target: "_blank", rel: "noopener", text: "Recording" }));
    links.push(h("a", { href: g.slides, target: "_blank", rel: "noopener", text: shared ? "Slides (all groups, " + d.sessions[g.session].label + ")" : "Slides" }));
    if (g.slug) links.push(h("a", { href: WGA.wgHref(g.slug), text: "Activity" }));
    foot.appendChild(h("span", { class: "okr-links" }, links.reduce(function (a, x, i) { return a.concat(i ? [" · ", x] : [x]); }, [])));
    el.appendChild(foot);
    return el;
  }

  function missingCard(d, edit) {
    var miss = d.missing[state.year] || [];
    var chips = h("span", { class: "wga-chips" }, miss.map(function (m) { return h("a", { class: "wga-chip", href: WGA.wgHref(m.slug), text: WGA.shortName(m.slug) }); }));
    var body = "Working group: \nYear: " + state.year + "\nOur OKRs (objectives and key results):\n\n";
    return h("section", { class: "wga-card" }, [h("h3", { text: "Groups with no " + state.year + " OKRs here yet" }),
      h("p", { class: "wga-note", text: "These working groups did not present OKRs that year in the sources above, or have not sent them. Leads: send yours and they will be added." }),
      chips,
      h("p", { class: "wga-note" }, [h("a", { href: "https://github.com/" + d.repo + "/issues/new?title=" + encodeURIComponent("OKRs: ") + "&body=" + encodeURIComponent(body), target: "_blank", rel: "noopener", text: "Send or correct OKRs" }),
        " · ", h("a", { href: edit, target: "_blank", rel: "noopener", text: "Edit the data file" })])]);
  }
})();
