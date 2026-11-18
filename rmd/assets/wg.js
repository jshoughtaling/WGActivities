/* One working group: status, projects, outputs and activity, who it works with, opportunities, weekly charts. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-wg");
  if (!root) return;
  var slug = new URLSearchParams(location.search).get("wg");

  WGA.loadMany(["data/activity.json", "data/projects.json", "data/collab.json", "data/similar.json", "data/digest.json", "data/topics.json"])
    .then(function (r) { if (!slug) { location.replace("groups.html"); return; } show(r[0], slug, { proj: r[1], collab: r[2], sim: r[3], dig: r[4], top: r[5] }); })
    .catch(function (e) { WGA.fail(root, e); });

  function card(title, kids, cls) {
    return h("section", { class: "wga-card" + (cls ? " " + cls : "") }, [h("h3", { text: title })].concat(kids));
  }

  function show(d, slug, x) {
    WGA.setNames(x.proj.names);
    var w = d.wgs.concat(d.buckets).filter(function (g) { return g.slug === slug; })[0];
    root.textContent = "";
    if (!w) { root.appendChild(h("div", { class: "rmdimportant", text: "No working group named \"" + slug + "\"." })); return; }
    document.title = w.name + " · OHDSI WG Activity";

    root.appendChild(h("div", { class: "wga-crumb" }, [h("a", { href: "groups.html", text: "Groups" }), " / " + WGA.shortName(slug)]));
    var head = h("section", { class: "wga-card" }, [
      h("div", { class: "wga-row-h" }, [
        h("h2", { text: w.name, style: "margin:0;font-size:1.7em;font-weight:600" }),
        h("span", {}, [WGA.statusBadge(w.status, w.recent, w.prior)]),
      ]),
      h("p", { class: "wga-note", style: "margin:0.5em 0 0" }, [
        (WGA.STATUS[w.status] || {}).hint ? "Status: " + WGA.STATUS[w.status].hint + ". " : "",
        w.on_ohdsi_org === false ? "Not on ohdsi.org's working group list. " : "",
        "Leads and how to join: ",
        h("a", { href: "https://www.ohdsi.org/workgroups/", target: "_blank", rel: "noopener", text: "ohdsi.org/workgroups" }),
        " (not collected here yet).",
      ]),
    ]);
    var meet = h("p", { class: "wga-note", style: "margin:0.4em 0 0" });
    head.appendChild(meet);
    WGA.cal.load().then(function (cal) {
      if (!cal) return;
      var nx = WGA.cal.upcoming(cal, { wg: slug }).filter(function (e) { return e.kind === "meeting"; });
      var st = (cal.status || []).filter(function (x) { return x.wg === slug; })[0];
      if (nx.length) {
        var e = nx[0];
        meet.appendChild(h("strong", { text: "Next meeting: " }));
        meet.appendChild(document.createTextNode(WGA.cal.when(e) + (e.cancelled ? " (cancelled)" : "") + (e.note ? " (" + e.note + ")" : "") + ". "));
        if (e.cadence) meet.appendChild(document.createTextNode(e.cadence + " "));
        meet.appendChild(h("a", { href: e.url, target: "_blank", rel: "noopener", text: "Join details" }));
        meet.appendChild(document.createTextNode(" · "));
        meet.appendChild(h("a", { href: "activity.html?view=calendar&q=" + encodeURIComponent(slug), text: "calendar" }));
      } else if (st) meet.textContent = "Meetings: " + (st.state === "tbd" ? "next meeting to be decided" : st.state) + " (ohdsi.org).";
    });
    var exp = h("button", { type: "button", class: "wga-btn", text: "Download items (CSV)", style: "margin-top:0.6em" });
    exp.addEventListener("click", function () { exportCsv(d, w); });
    head.appendChild(exp);
    root.appendChild(head);

    var tiles = h("div", { class: "wga-tiles" });
    var dlt = w.recent - w.prior;
    WGA.tile(tiles, "Last 8 weeks", WGA.fmt(w.recent), "vs " + WGA.fmt(w.prior) + " the 8 before" + (w.prior ? " (" + (dlt >= 0 ? "+" : "−") + Math.round(Math.abs(dlt) / w.prior * 100) + "%)" : ""));
    if (w.sources.github) WGA.tile(tiles, "GitHub, last 12 months", WGA.fmt(WGA.sum(w.sources.github.counts)), "commits, PRs, issues, releases");
    if (w.sources.teams) WGA.tile(tiles, "Teams, last 12 months", WGA.fmt(WGA.sum(w.sources.teams.counts)), "posts, replies (counts only)");
    var conf = (w.yearly && w.yearly.conference) || {}, ys = Object.keys(conf).sort().reverse();
    if (ys.length) WGA.tile(tiles, "Symposium items", conf[ys[0]] + " in " + ys[0], ys.slice(1, 3).map(function (y) { return conf[y] + " in " + y; }).join(" · "));
    root.appendChild(tiles);

    // Projects
    var from = d.weeks.length - 26;
    var ps = x.proj.projects.filter(function (p) { return p.lead_wg === slug || p.contributing_wgs.indexOf(slug) >= 0; })
      .sort(function (a, b) { return (b.grouped - a.grouped) || b.recent - a.recent || b.total52 - a.total52; });
    if (ps.length) {
      var rows = WGA.rows([["Project", "minmax(170px, 1.5fr)"], ["Repositories", "minmax(140px, 1.4fr)"], ["Last 6 months", "minmax(140px, 1.4fr)"], ["Last 12 months", "minmax(110px, 0.8fr)"]],
        ps.map(function (p) {
          var shared = p.lead_wg !== slug;
          var ext = p.extends.map(function (id) { var q = x.proj.projects.filter(function (z) { return z.id === id; })[0]; return q ? q.name : id; });
          return [
            [h("div", { class: "nm" }, [h("a", { href: WGA.projHref(p.id), text: p.name })]), WGA.sm(WGA.KINDS[p.kind] || p.kind, "mu"),
              shared ? WGA.sm("led by " + WGA.shortName(p.lead_wg), "mu") : null,
              ext.length ? WGA.sm("Extends: " + ext.join(", "), "warm-ink") : null],
            [h("ul", {}, p.repos.map(function (r) { return h("li", {}, [h("a", { href: r.url, target: "_blank", rel: "noopener", text: r.name })]); }))],
            [p.counts ? WGA.strip(p.intensity.slice(from)) : WGA.sm("No GitHub activity in the last year.", "mu")],
            [h("div", { class: "num" }, [h("b", { text: WGA.fmt(p.total52) }), h("span", { class: "mu", text: " items" })]),
              p.releases.length ? WGA.sm(p.releases.length + " release" + (p.releases.length > 1 ? "s" : ""), "mu") : null],
          ];
        }));
      var pc = card("Projects", [rows]);
      root.appendChild(pc);
    }

    var cols = h("div", { class: "wga-cols" });
    var main = h("div", { class: "main" }), side = h("div", { class: "side" });
    cols.appendChild(main); cols.appendChild(side);
    root.appendChild(cols);

    // Recent: outputs or all activity
    var outs = x.dig.outputs.filter(function (o) { return (o.wgs || []).indexOf(slug) >= 0 && o.wgs.length <= 4; });   // roundups tagged to many groups are not this group's output
    var weeks = d.weeks.filter(function (k) { return w.items[k]; }).reverse();
    var recentBox = h("div");
    var mode = outs.length ? "outputs" : "all";
    var seg = h("div", { class: "wga-seg", role: "group", "aria-label": "Show" });
    [["outputs", "Outputs (" + outs.length + ")"], ["all", "All activity"]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(mode === o[0]) });
      b.addEventListener("click", function () { mode = o[0]; Array.prototype.forEach.call(seg.children, function (z) { z.setAttribute("aria-pressed", String(z === b)); }); drawRecent(); });
      seg.appendChild(b);
    });
    function drawRecent() {
      recentBox.textContent = "";
      if (mode === "outputs") {
        if (!outs.length) recentBox.appendChild(h("p", { class: "wga-empty", text: "No releases or symposium items in the last year." }));
        else recentBox.appendChild(WGA.feed(outs.slice(0, 25), { who: "project", projName: function (id) { var p = x.proj.projects.filter(function (q) { return q.id === id; })[0]; return p ? p.name : id; } }));
        recentBox.appendChild(h("p", { class: "wga-note", text: "Outputs are releases (nightly builds left out), symposium posters, talks, sessions and tutorials." }));
        return;
      }
      var LIMIT = 6;
      weeks.slice(0, LIMIT).forEach(function (k) {
        recentBox.appendChild(h("div", { class: "sub", text: WGA.weekLabel(d.week_starts[d.weeks.indexOf(k)]) + (k === d.partial_week ? " (in progress)" : "") }));
        recentBox.appendChild(WGA.itemList(w.items[k]));
      });
      if (!weeks.length) recentBox.appendChild(h("p", { class: "wga-empty", text: "No linked items in the last year." }));
      recentBox.appendChild(h("p", { class: "wga-note", text: "Up to 20 items per week, most substantive first. Teams content is never published." }));
    }
    main.appendChild(h("section", { class: "wga-card" }, [h("div", { class: "wga-row-h", style: "margin-bottom:0.6em" }, [h("h3", { text: "Recent", style: "margin:0" }), seg]), recentBox]));
    drawRecent();

    // Weekly charts
    var srcs = Object.keys(w.sources);
    if (srcs.length) {
      var chartCard = card("Weekly activity by source", []);
      srcs.forEach(function (s, i) { chartCard.appendChild(chart(d, w, s, i === srcs.length - 1)); });
      chartCard.appendChild(h("p", { class: "wga-note", text: "Each chart has its own scale; the number at its left is the busiest week." }));
      main.appendChild(chartCard);
    }

    // Works with
    var pairs = x.collab.pairs.filter(function (p) { return p.a === slug || p.b === slug; }).slice(0, 6);
    if (pairs.length) {
      var lst = h("div");
      pairs.forEach(function (p) {
        var other = p.a === slug ? p.b : p.a;
        var why = p.evidence.length ? p.evidence[0].title : p.repos.length ? "Shared repo " + p.repos[0].repo : p.themes.length ? "Both active on " + p.themes.slice(0, 2).join(", ") : "";
        lst.appendChild(h("a", { class: "wga-lcard", href: "connections.html?wg=" + encodeURIComponent(slug) + "&with=" + encodeURIComponent(other), style: "border:0;border-top:1px solid var(--grid);border-radius:0;padding:0.55em 0" }, [
          h("div", { class: "t" }, [h("span", { text: WGA.shortName(other) }), h("span", { class: "m", text: p.signals.join(" · ") })]),
          h("div", { class: "d", text: why }),
        ]));
      });
      side.appendChild(card("Works with", [lst]));
    }

    // Opportunities
    var opp = [];
    ps.filter(function (p) { return p.lead_wg === slug && p.extends.length; }).forEach(function (p) {
      opp.push(h("p", { class: "warm-ink", style: "margin:0 0 0.5em;font-size:0.88em" }, [h("a", { href: WGA.projHref(p.id), text: p.name, style: "color:inherit;font-weight:600" }),
        " builds on " + p.extends.map(function (id) { var q = x.proj.projects.filter(function (z) { return z.id === id; })[0]; return q ? q.name + " (" + WGA.shortName(q.lead_wg) + ")" : id; }).join(", ") +
        " to support more data. Worth coordinating with those maintainers: support upstream means less to keep in step."]));
    });
    x.proj.projects.filter(function (p) { return p.lead_wg === slug && p.extended_by.length; }).forEach(function (p) {
      opp.push(h("p", { class: "warm-ink", style: "margin:0 0 0.5em;font-size:0.88em" }, [h("a", { href: WGA.projHref(p.id), text: p.name, style: "color:inherit;font-weight:600" }),
        " is adapted by " + p.extended_by.length + " other project" + (p.extended_by.length > 1 ? "s" : "") + " to support more data. Worth a conversation about supporting it directly."]));
    });
    x.sim.clusters.filter(function (c) { return c.wgs.indexOf(slug) >= 0 && c.new_ties.some(function (t) { return t.indexOf(slug) >= 0; }); }).slice(0, 4).forEach(function (c) {
      var others = c.wgs.filter(function (g) { return g !== slug; });
      opp.push(h("p", { class: "warm-ink", style: "margin:0 0 0.5em;font-size:0.88em" }, [h("a", { href: "connections.html?term=" + encodeURIComponent(c.term) + "#similar", text: "“" + c.term + "”", style: "color:inherit;font-weight:600" }),
        " also comes up in " + others.map(WGA.shortName).join(", ") + "."]));
    });
    var ts = x.top.topics.filter(function (t) { return t.wgs_recent.some(function (z) { return z[0] === slug; }); });
    if (ts.length) opp.push(h("p", { class: "warm-ink", style: "margin:0;font-size:0.88em" }, ["Topics shared with other groups: ",
      h("span", {}, ts.slice(0, 5).map(function (t, i) { return h("span", {}, [i ? ", " : "", h("a", { href: WGA.topicHref(t.id), text: t.name, style: "color:inherit" })]); }))]));
    if (opp.length) side.appendChild(card("Opportunities", opp, "warm"));

    // Yearly totals
    var years = {};
    Object.keys(w.yearly).forEach(function (s) { Object.keys(w.yearly[s]).forEach(function (y) { years[y] = 1; }); });
    var yl = Object.keys(years).sort();
    if (yl.length) {
      var t = h("table", { class: "wga-table" });
      t.appendChild(h("thead", {}, [h("tr", {}, [h("th", { scope: "col", text: "Source" })].concat(yl.map(function (y) { return h("th", { scope: "col", text: y }); })))]));
      var tb = h("tbody");
      Object.keys(w.yearly).forEach(function (s) {
        tb.appendChild(h("tr", {}, [h("td", { text: (WGA.SOURCES[s] || { label: s }).label })].concat(yl.map(function (y) { return h("td", { text: w.yearly[s][y] ? WGA.fmt(w.yearly[s][y]) : "–" }); }))));
      });
      t.appendChild(tb);
      main.appendChild(h("details", { class: "wga-card" }, [h("summary", { text: "Totals by year (each source starts when its collection started; see About the data)" }), h("div", { class: "hm-scroll" }, [t])]));
    }
  }

  function exportCsv(d, w) {
    var rows = [["week", "source", "type", "title", "url"]];
    d.weeks.forEach(function (k) { (w.items[k] || []).forEach(function (it) { rows.push([k, it.s, it.t, it.title, it.url]); }); });
    WGA.download(w.slug + "-items.csv", WGA.csv(rows), "text/csv");
  }

  /* Weekly bar chart for one source. Marks: thin columns, 4px rounded data end, square baseline. */
  function chart(d, w, s, last) {
    var src = WGA.SOURCES[s], counts = w.sources[s].counts, n = counts.length;
    var W = 900, H = last ? 92 : 64, padL = 34, padR = 4, top = 8, base = last ? 62 : 56;
    var max = Math.max.apply(null, counts), niceMax = Math.max(max, 1);
    var step = (W - padL - padR) / n, bw = Math.min(14, step * 0.7);
    var NS = "http://www.w3.org/2000/svg";
    function svgEl(tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }

    var block = h("div", { class: "sm-block" }, [
      h("div", { class: "sm-h" }, [
        h("span", { class: "k", style: "background:" + src.color }),
        h("strong", { text: src.label }),
        h("span", { class: "tot", text: WGA.fmt(WGA.sum(counts)) + " in " + n + " weeks" }),
      ]),
    ]);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "sm-svg", role: "img", "aria-label": src.label + " activity by week for " + w.name + "; busiest week " + max });
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: base, y2: base, stroke: "var(--axis)", "stroke-width": 1 }));
    svg.appendChild(svgEl("text", { x: padL - 6, y: top + 8, "text-anchor": "end" }, WGA.fmt(niceMax)));
    svg.appendChild(svgEl("text", { x: padL - 6, y: base, "text-anchor": "end" }, "0"));
    var prevMonth = null;
    counts.forEach(function (c, i) {
      var x = padL + i * step + (step - bw) / 2;
      if (c > 0) {
        var bh = Math.max((c / niceMax) * (base - top), 2), y = base - bh, r = Math.min(4, bw / 2, bh);
        svg.appendChild(svgEl("path", {
          d: "M" + x + "," + base + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + bw - r) + "Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + "V" + base + "Z",
          fill: src.color,
        }));
      }
      var hit = svgEl("rect", { x: padL + i * step, y: 0, width: step, height: base, fill: "transparent", class: "hit", tabindex: "-1" });
      hit.addEventListener("pointermove", function (e) { WGA.tip.show(tipFor(d, w, s, i), e.clientX, e.clientY); });
      hit.addEventListener("pointerleave", WGA.tip.hide);
      svg.appendChild(hit);
      var m = WGA.month(d.week_starts[i]);
      if (last && m !== prevMonth) svg.appendChild(svgEl("text", { x: padL + i * step, y: base + 14 }, m));
      prevMonth = m;
    });
    block.appendChild(svg);
    return block;
  }

  function tipFor(d, w, s, i) {
    var box = h("div", {});
    box.appendChild(h("div", { class: "t", text: w.name }));
    box.appendChild(h("div", { class: "s", text: WGA.weekLabel(d.week_starts[i]) + (d.weeks[i] === d.partial_week ? " (in progress)" : "") }));
    box.appendChild(WGA.tipRow(WGA.SOURCES[s].color, WGA.fmt(w.sources[s].counts[i]), WGA.SOURCES[s].label));
    return box;
  }
})();
