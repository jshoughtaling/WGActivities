/* Data health (About page): is each source current, did its collector run, is the config sound? Reads data/health.json,
   which scripts/build_health.py writes at every refresh. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-health");
  if (!root) return;
  var LABEL = { ok: "Current", stale: "Out of date", failed: "Collector failed", missing: "No data" };

  fetch("data/health.json").then(function (r) { if (!r.ok) throw new Error("health.json " + r.status); return r.json(); })
    .then(draw).catch(function () { root.textContent = "Data health is not available yet: it is written at each refresh (data/health.json)."; });

  function when(iso) { return iso ? WGA.fmtDateY(iso.slice(0, 10)) : "–"; }
  function badge(state) { return WGA.badge(LABEL[state] || state, state === "ok" ? "blue" : "warm"); }

  function draw(d) {
    root.textContent = "";
    var head = d.overall === "ok"
      ? "Every source is current and the config checks passed."
      : d.problems.length + " thing" + (d.problems.length === 1 ? "" : "s") + " to look at before relying on the newest numbers.";
    root.appendChild(h("div", { class: "wga-card" + (d.overall === "ok" ? "" : " warm") + " tight", role: "note" }, [
      h("p", { style: "margin:0" }, [h("strong", { text: head }), " Checked " + when(d.generated) + "; data built " + when(d.data_generated) + "."]),
      d.problems.length ? h("ul", { class: "wga-plain", style: "margin:0.4em 0 0" }, d.problems.map(function (p) { return h("li", { text: p }); })) : null,
    ]));

    var t = h("table", { class: "wga-table left", style: "margin-top:0.8em" });
    t.appendChild(h("thead", {}, [h("tr", {}, ["Source", "Status", "Newest item", "Last successful collection", "How"].map(function (x) { return h("th", { scope: "col", text: x }); }))]));
    var tb = h("tbody");
    d.sources.forEach(function (s) {
      tb.appendChild(h("tr", {}, [h("td", { text: s.label }), h("td", {}, [badge(s.status)]),
        h("td", { text: s.last_item ? WGA.fmtDateY(s.last_item) + " (" + s.age_days + " days ago)" : "–" }),
        h("td", { text: s.manual ? "by hand" : when(s.last_success) }),
        h("td", { text: s.manual ? "Counts collected locally and committed (prompts/collect_teams.md)" : s.outcome ? "last run: " + s.outcome : "run not recorded" })]));
    });
    var m = d.meetings;
    tb.appendChild(h("tr", {}, [h("td", { text: "Meetings (ohdsi.org)" }), h("td", {}, [badge(m.status)]),
      h("td", { text: m.source_updated ? "page updated " + WGA.fmtDateY(m.source_updated) + " (" + m.age_days + " days ago)" : "–" }),
      h("td", { text: when(m.last_success || m.fetched) }),
      h("td", { text: (m.meetings || 0) + " meetings read, " + (m.upcoming || 0) + " upcoming" + (m.unmapped && m.unmapped.length ? "; no group for " + m.unmapped.join(", ") : "") })]));
    t.appendChild(tb);
    root.appendChild(h("div", { class: "hm-scroll" }, [t]));

    var p = d.projects;
    root.appendChild(h("p", { class: "wga-note", style: "margin-top:0.8em" }, [
      h("strong", { text: p.reviewed + " of " + p.multi_repo }), " multi-repo project groupings have been confirmed by a maintainer. ",
      h("a", { href: "projects.html?review=draft", text: "See the drafts" }), "."]));

    var notes = d.config.errors.map(function (x) { return ["Error", x]; }).concat(d.config.warnings.map(function (x) { return ["Notice", x]; }));
    if (notes.length) {
      root.appendChild(h("details", {}, [h("summary", { text: "Config check: " + d.config.errors.length + " error" + (d.config.errors.length === 1 ? "" : "s") + ", " + d.config.warnings.length + " notice" + (d.config.warnings.length === 1 ? "" : "s") }),
        h("ul", { class: "wga-plain" }, notes.map(function (n) { return h("li", {}, [h("strong", { text: n[0] + ": " }), n[1]]); })),
        h("p", { class: "wga-note", text: "From scripts/validate_config.py. Notices are things that work but may not be what was meant, for example a project whose repositories are not collected." })]));
    }
  }
})();
