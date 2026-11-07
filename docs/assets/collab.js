/* Cross-WG collaboration candidates: shared topics and group pairs, from data/collab.json. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-collab");
  if (!root) return;

  WGA.load("data/collab.json").then(draw).catch(function (e) { WGA.fail(root, e); });

  function wgLink(d, slug) {
    return h("a", { class: "wga-chip", href: "wg.html?wg=" + encodeURIComponent(slug), text: d.names[slug] || slug });
  }
  function chips(d, slugs) {
    var box = h("span", { class: "wga-chips" });
    slugs.forEach(function (s) { box.appendChild(wgLink(d, s)); });
    return box;
  }
  function pairName(d, p) { return (d.names[p.a] || p.a) + " × " + (d.names[p.b] || p.b); }

  function draw(d) {
    var t = new Date(d.generated);
    var note = document.getElementById("wga-updated");
    if (note) note.textContent = "Updated " + t.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) +
      ". Based on the last " + d.window_weeks + " weeks of titles and links; \"recent\" means the last " + d.recent_weeks + " weeks.";

    var filter = h("select", { id: "wga-collab-wg", "aria-label": "Show only this working group" }, [h("option", { value: "", text: "All working groups" })]);
    Object.keys(d.names).sort(function (a, b) { return d.names[a].localeCompare(d.names[b]); }).forEach(function (s) {
      filter.appendChild(h("option", { value: s, text: d.names[s] }));
    });
    var controls = h("div", { class: "wga-controls" }, [h("label", {}, ["Show only: ", filter])]);
    var themes = h("div", {}), pairs = h("div", {});
    root.textContent = "";
    root.appendChild(controls);
    root.appendChild(h("h3", { text: "Shared topics" }));
    root.appendChild(h("p", { class: "sub", text: "Topics that several groups have been working on recently. \"Not yet linked\" pairs are groups active on the topic that no forum post, call, session or showcase entry names together." }));
    root.appendChild(themes);
    root.appendChild(h("h3", { text: "Group pairs" }));
    root.appendChild(h("p", { class: "sub", text: "Ranked by how much evidence there is. Items from the forum, calls and conference count most; a busy GitHub repo counts once." }));
    root.appendChild(pairs);

    function render() {
      var wg = filter.value;
      themes.textContent = "";
      var ts = d.themes.filter(function (x) { return !wg || x.wgs.indexOf(wg) >= 0; });
      if (!ts.length) themes.appendChild(h("p", { class: "wga-note", text: "No shared topics for this group." }));
      ts.forEach(function (x) {
        var card = h("div", { class: "wga-card" }, [
          h("h4", { text: x.name }),
          h("div", { class: "sub", text: x.recent_wgs.length + " groups active recently · " + WGA.fmt(x.recent) + " recent items" }),
          chips(d, x.recent_wgs),
        ]);
        var un = x.unlinked.filter(function (p) { return !wg || p.indexOf(wg) >= 0; });
        if (un.length) {
          card.appendChild(h("div", { class: "sub wga-gap", text: "Not yet linked:" }));
          var ul = h("ul", { class: "wga-plain" });
          un.slice(0, 5).forEach(function (p) { ul.appendChild(h("li", { text: (d.names[p[0]] || p[0]) + " and " + (d.names[p[1]] || p[1]) })); });
          card.appendChild(ul);
        }
        card.appendChild(h("details", {}, [h("summary", { text: "Recent items" }), WGA.itemList(x.evidence.map(function (e) { return e; }))]));
        themes.appendChild(card);
      });

      pairs.textContent = "";
      var ps = d.pairs.filter(function (p) { return !wg || p.a === wg || p.b === wg; });
      if (!ps.length) pairs.appendChild(h("p", { class: "wga-note", text: "No pairs found for this group." }));
      ps.slice(0, 25).forEach(function (p) {
        var meta = [];
        if (p.co_items) meta.push(p.co_items + " item" + (p.co_items > 1 ? "s" : "") + " naming both (" + p.co_recent + " recent)");
        if (p.repos.length) meta.push(p.repos.length + " shared repo" + (p.repos.length > 1 ? "s" : "") + ": " + p.repos.slice(0, 3).map(function (r) { return r.repo; }).join(", "));
        if (p.themes.length) meta.push("both active on " + p.themes.slice(0, 3).join(", "));
        var card = h("div", { class: "wga-card" }, [
          h("h4", { text: pairName(d, p) }),
          h("div", { class: "sub", text: p.signals.join(" · ") }),
          h("ul", { class: "wga-plain" }, meta.map(function (m) { return h("li", { text: m }); })),
        ]);
        if (p.evidence.length) card.appendChild(h("details", {}, [h("summary", { text: "Items naming both" }), WGA.itemList(p.evidence)]));
        pairs.appendChild(card);
      });
    }
    filter.addEventListener("change", render);
    render();
  }
})();
