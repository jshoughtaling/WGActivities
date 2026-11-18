/* OKRs: the 2026 objectives and key results each working group presented on the community calls. Reads data/okrs.json. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-okrs");
  if (!root) return;
  var state = { q: WGA.param("q") || "", session: WGA.param("session") || "", sort: WGA.param("sort") || "name", pick: WGA.param("g") || "" };

  WGA.load("data/okrs.json").then(function (d) { WGA.setNames(d.names); draw(d); }).catch(function (e) { WGA.fail(root, e); });

  function text(g) {
    var t = [g.name, (g.leads || []).join(" ")];
    g.objectives.forEach(function (o) { t.push(o.objective); o.krs.forEach(function (k) { t.push(k); }); });
    (g.notes || []).forEach(function (n) { t.push(n); });
    return t.join(" ").toLowerCase();
  }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function nameOf(slug) { return WGA.shortName(slug); }

  function draw(d) {
    var edit = "https://github.com/" + d.repo + "/edit/main/config/okrs.yml";
    root.textContent = "";
    var presenting = d.groups.filter(function (g) { return g.slug; }).length, listed = Object.keys(d.names).length;
    root.appendChild(h("div", { class: "wga-page-h" }, [h("div", {}, [h("h1", { text: d.year + " OKRs" }),
      h("p", { class: "sub wga-note" }, ["Objectives and key results the working groups presented on the OHDSI community calls of ",
        h("a", { href: d.sessions.s1.video, target: "_blank", rel: "noopener", text: WGA.fmtDate(d.sessions.s1.date) }), " and ",
        h("a", { href: d.sessions.s2.video, target: "_blank", rel: "noopener", text: WGA.fmtDate(d.sessions.s2.date) }),
        ". Taken from the presented slides, and from the recording where a group had no slide. Not reviewed by the groups; see how to correct them at the bottom."])])]));

    var tiles = h("div", { class: "wga-tiles" });
    var objs = WGA.sum(d.groups.map(function (g) { return g.objectives.length; })), krs = WGA.sum(d.groups.map(function (g) { return g.kr_count; }));
    WGA.tile(tiles, "Groups presenting", d.groups.length, presenting + " of " + listed + " working groups on this site, plus " + (d.groups.length - presenting) + " not in its list");
    WGA.tile(tiles, "Objectives", objs, "about " + (objs / d.groups.length).toFixed(1) + " per group");
    WGA.tile(tiles, "Key results and planned work", krs);
    WGA.tile(tiles, "Still to present", d.missing.length, "working groups with no OKRs here");
    root.appendChild(tiles);

    var q = h("input", { type: "search", class: "wga-input", id: "o-q", placeholder: "Search objectives, key results, leads", value: state.q });
    var ses = h("div", { class: "wga-seg", role: "group", "aria-label": "Call" });
    [["", "Both calls"], ["s1", WGA.fmtDate(d.sessions.s1.date)], ["s2", WGA.fmtDate(d.sessions.s2.date)]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "data-v": o[0], "aria-pressed": String(state.session === o[0]) });
      b.addEventListener("click", function () { state.session = o[0]; sync(); }); ses.appendChild(b);
    });
    var sort = h("select", { id: "o-sort" }, [["name", "Name"], ["krs", "Most key results"], ["recent", "Most active, last 8 weeks"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    sort.value = state.sort;
    root.appendChild(h("div", { class: "wga-filters" }, [
      h("div", { class: "wga-group" }, [h("label", { for: "o-q", class: "visually-hidden", text: "Search" }), q]),
      h("div", { class: "wga-group" }, [h("span", { class: "wga-label", text: "Call" }), ses]),
      h("div", { class: "wga-group" }, [h("label", { for: "o-sort", text: "Sort" }), sort]),
    ]));
    var count = h("p", { class: "wga-note", "aria-live": "polite" });
    var list = h("div", { class: "okr-list" });
    root.appendChild(count);
    root.appendChild(list);
    var dl = h("button", { type: "button", class: "wga-btn", text: "Download all (CSV)" });
    dl.addEventListener("click", function () {
      var rows = [["group", "slug", "call", "objective", "key result"]];
      d.groups.forEach(function (g) { g.objectives.forEach(function (o) { (o.krs.length ? o.krs : [""]).forEach(function (k) { rows.push([g.name, g.slug || "", g.date, o.objective, k]); }); }); });
      WGA.download("okrs-" + d.year + ".csv", WGA.csv(rows), "text/csv");
    });
    root.appendChild(h("p", {}, [dl]));
    q.addEventListener("input", function () { state.q = q.value; fill(); });
    sort.addEventListener("change", function () { state.sort = sort.value; fill(); });
    root.appendChild(missingCard(d, edit));
    root.appendChild(h("p", { class: "wga-note" }, ["Call index: ", h("a", { href: "https://www.ohdsi.org/community-calls-2026/", target: "_blank", rel: "noopener", text: "ohdsi.org/community-calls-2026" }),
      ". Source data: ", h("a", { href: edit, target: "_blank", rel: "noopener", text: "config/okrs.yml" }), "."]));

    function sync() {
      Array.prototype.forEach.call(ses.children, function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-v") === state.session)); });
      var qs = [state.q ? "q=" + encodeURIComponent(state.q) : "", state.session ? "session=" + state.session : "", state.sort !== "name" ? "sort=" + state.sort : ""].filter(Boolean).join("&");
      try { history.replaceState(null, "", qs ? "?" + qs : location.pathname); } catch (e) { /* file:// */ }
      fill();
    }
    function fill() {
      var needle = state.q.trim().toLowerCase();
      var rows = d.groups.filter(function (g) { return (!state.session || g.session === state.session) && (!needle || text(g).indexOf(needle) >= 0); });
      rows.sort(function (a, b) {
        if (state.sort === "krs") return b.kr_count - a.kr_count || a.name.localeCompare(b.name);
        if (state.sort === "recent") return (b.recent || -1) - (a.recent || -1) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
      count.textContent = rows.length === d.groups.length ? plural(rows.length, "group") : rows.length + " of " + d.groups.length + " groups";
      list.textContent = "";
      rows.forEach(function (g) { list.appendChild(card(d, g, needle)); });
      if (!rows.length) list.appendChild(h("div", { class: "wga-rows" }, [h("div", { class: "empty", text: "No group's OKRs match." })]));
      if (state.pick) { var el = document.getElementById("okr-" + state.pick); if (el) { el.scrollIntoView(); state.pick = ""; } }
    }
    fill();
  }

  function card(d, g, needle) {
    var title = g.slug ? h("a", { href: WGA.wgHref(g.slug), text: g.name }) : h("span", { text: g.name });
    var badges = h("span", { class: "wga-chips" }, [WGA.badge(WGA.fmtDate(g.date), "")]);
    if (g.source === "transcript") badges.appendChild(WGA.badge("From the recording", "warm"));
    if (!g.slug) badges.appendChild(WGA.badge("Not a group on this site's list", ""));
    if (g.status) badges.appendChild(WGA.statusBadge(g.status, g.recent, g.prior));
    var meta = [];
    if (g.leads.length) meta.push("Leads: " + g.leads.join(", "));
    if (g.meets) meta.push("Meets: " + g.meets);
    var el = h("section", { class: "wga-card okr", id: "okr-" + g.id }, [
      h("div", { class: "wga-card-h" }, [h("h3", {}, [title]), badges]),
      meta.length ? h("p", { class: "wga-note", style: "margin:0 0 0.6em", text: meta.join(" · ") }) : null,
    ]);
    g.objectives.forEach(function (o, i) {
      var hit = needle && (o.objective.toLowerCase().indexOf(needle) >= 0 || o.krs.join(" ").toLowerCase().indexOf(needle) >= 0);
      el.appendChild(h("div", { class: "okr-obj" + (hit ? " hit" : "") }, [
        h("div", { class: "okr-o" }, [h("span", { class: "okr-n", text: "O" + (i + 1) }), h("span", { text: o.objective })]),
        o.krs.length ? h("ul", { class: "okr-krs" }, o.krs.map(function (k) { return h("li", { text: k }); })) : null,
      ]));
    });
    if (g.notes.length) el.appendChild(h("details", {}, [h("summary", { text: "From the call" }), h("ul", { class: "okr-krs" }, g.notes.map(function (n) { return h("li", { text: n }); }))]));
    var foot = h("div", { class: "okr-foot" });
    var rel = g.with.concat(g.with_me);
    if (rel.length) {
      if (g.with.length) { foot.appendChild(h("span", { class: "wga-label", text: "Works with" })); foot.appendChild(WGA.chipLinks(g.with)); }
      if (g.with_me.length) { foot.appendChild(h("span", { class: "wga-label", text: "Named by" })); foot.appendChild(WGA.chipLinks(g.with_me)); }
    }
    foot.appendChild(h("span", { class: "okr-links" }, [
      h("a", { href: g.video, target: "_blank", rel: "noopener", text: "Recording" }), " · ",
      h("a", { href: g.slides, target: "_blank", rel: "noopener", text: "Slides (all groups, " + WGA.fmtDate(g.date) + ")" }),
      g.slug ? " · " : "", g.slug ? h("a", { href: WGA.wgHref(g.slug), text: "Activity" }) : null]));
    el.appendChild(foot);
    return el;
  }

  function missingCard(d, edit) {
    var chips = h("span", { class: "wga-chips" }, d.missing.map(function (m) { return h("a", { class: "wga-chip", href: WGA.wgHref(m.slug), text: WGA.shortName(m.slug) }); }));
    var body = "Working group: \nOur 2026 OKRs (objectives and key results):\n\n";
    return h("section", { class: "wga-card" }, [h("h3", { text: "Groups with no OKRs here yet" }),
      h("p", { class: "wga-note", text: "These working groups did not present OKRs on the two calls above, or have not sent them. Leads: send yours and they will be added." }),
      chips,
      h("p", { class: "wga-note" }, [h("a", { href: "https://github.com/" + d.repo + "/issues/new?title=" + encodeURIComponent("OKRs: ") + "&body=" + encodeURIComponent(body), target: "_blank", rel: "noopener", text: "Send or correct OKRs" }),
        " · ", h("a", { href: edit, target: "_blank", rel: "noopener", text: "Edit okrs.yml" })])]);
  }
})();
