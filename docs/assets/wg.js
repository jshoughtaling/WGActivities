/* One working group: weekly activity by source (small multiples), recent items, yearly totals. */
(function () {
  var h = WGA.h;
  var root = document.getElementById("wga-wg");
  if (!root) return;
  var slug = new URLSearchParams(location.search).get("wg");

  WGA.load().then(function (d) { slug ? show(d, slug) : index(d); }).catch(function (e) { WGA.fail(root, e); });

  function index(d) {
    root.textContent = "";
    root.appendChild(h("p", { class: "wga-note", text: "Choose a working group, or select one from the heatmap." }));
    var ul = h("ul", { class: "wga-list" });
    d.wgs.concat(d.buckets).forEach(function (w) {
      var st = WGA.STATUS[w.status];
      ul.appendChild(h("li", {}, [
        h("span", { class: "ty", text: st.glyph + " " + st.label }),
        h("a", { href: "wg.html?wg=" + encodeURIComponent(w.slug), text: w.name }),
      ]));
    });
    root.appendChild(ul);
  }

  function show(d, slug) {
    var w = d.wgs.concat(d.buckets).filter(function (x) { return x.slug === slug; })[0];
    root.textContent = "";
    if (!w) { root.appendChild(h("div", { class: "rmdimportant", text: "No working group named \"" + slug + "\"." })); return; }
    document.title = w.name + " · OHDSI WG Activities";
    var st = WGA.STATUS[w.status];
    root.appendChild(h("h2", { text: w.name }));
    root.appendChild(h("p", { class: "wga-note" }, [
      st.glyph + " " + st.label + " (" + st.hint + ")." + (w.on_ohdsi_org === false ? " Not on ohdsi.org's working group list. " : " "),
      h("a", { href: "index.html", text: "← All working groups" }),
    ]));

    var tiles = h("div", { class: "wga-tiles" });
    function tile(l, v, n) { tiles.appendChild(h("div", { class: "wga-tile" }, [h("div", { class: "l", text: l }), h("div", { class: "v", text: v }), n ? h("div", { class: "n", text: n }) : null])); }
    tile("Last 8 weeks", WGA.fmt(w.recent), "items, all sources");
    tile("Prior 8 weeks", WGA.fmt(w.prior), "items, all sources");
    tile("Last " + d.weeks.length + " weeks", WGA.fmt(WGA.sum(w.total)), "items, all sources");
    root.appendChild(tiles);

    var srcs = Object.keys(w.sources);
    if (!srcs.length) { root.appendChild(h("p", { class: "wga-note", text: "No activity found in the last " + d.weeks.length + " weeks." })); }
    else {
      var card = h("div", { class: "wga-card" }, [h("h4", { text: "Weekly activity by source" })]);
      srcs.forEach(function (s, i) { card.appendChild(chart(d, w, s, i === srcs.length - 1)); });
      card.appendChild(h("p", { class: "wga-note", text: "Each chart has its own scale; the number at its left is the busiest week." }));
      root.appendChild(card);
    }

    // Recent items, newest week first
    var weeks = d.weeks.filter(function (k) { return w.items[k]; }).reverse();
    if (weeks.length) {
      var box = h("div", { class: "wga-card" }, [h("h4", { text: "Recent items" })]);
      var shown = 0, LIMIT = 8;
      var more = h("button", { type: "button", class: "btn btn-default btn-sm", text: "Show older weeks" });
      weeks.forEach(function (k, i) {
        var sec = h("div", { style: i >= LIMIT ? "display:none" : "", "data-old": i >= LIMIT ? "1" : null }, [
          h("div", { class: "sub", text: WGA.weekLabel(d.week_starts[d.weeks.indexOf(k)]) + (k === d.partial_week ? " (in progress)" : "") }),
          WGA.itemList(w.items[k]),
        ]);
        sec.style.margin = "0 0 0.8rem";
        box.appendChild(sec);
      });
      if (weeks.length > LIMIT) {
        more.addEventListener("click", function () {
          Array.prototype.forEach.call(box.querySelectorAll("[data-old]"), function (x) { x.style.display = ""; });
          more.remove();
        });
        box.appendChild(more);
      }
      box.appendChild(h("p", { class: "wga-note", text: "Up to 20 items per week are listed, most substantive first (releases, merged PRs, sessions, calls), with at most 5 comments, replies or commits. Teams content is never published." }));
      root.appendChild(box);
    }

    // Yearly totals
    var years = {};
    Object.keys(w.yearly).forEach(function (s) { Object.keys(w.yearly[s]).forEach(function (y) { years[y] = 1; }); });
    var ys = Object.keys(years).sort();
    if (ys.length) {
      var t = h("table", { class: "wga-table" });
      t.appendChild(h("thead", {}, [h("tr", {}, [h("th", { scope: "col", text: "Source" })].concat(ys.map(function (y) { return h("th", { scope: "col", text: y }); })))]));
      var tb = h("tbody");
      Object.keys(w.yearly).forEach(function (s) {
        tb.appendChild(h("tr", {}, [h("td", { text: (WGA.SOURCES[s] || { label: s }).label })].concat(ys.map(function (y) { return h("td", { text: w.yearly[s][y] ? WGA.fmt(w.yearly[s][y]) : "–" }); }))));
      });
      t.appendChild(tb);
      var det = h("details", { class: "wga-card" }, [h("summary", { text: "Totals by year (each source starts when its collection started; see About the data)" }), h("div", { class: "hm-scroll" }, [t])]);
      root.appendChild(det);
    }
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
