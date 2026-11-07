/* Shared helpers for the heatmap and working group pages. Reads data/activity.json. */
(function () {
  var WGA = (window.WGA = {});

  WGA.SOURCES = {
    github: { label: "GitHub", color: "var(--s-github)", unit: "commits, PRs, issues, comments, releases" },
    forums: { label: "Forums", color: "var(--s-forums)", unit: "forum topics and replies" },
    calls: { label: "Community calls", color: "var(--s-calls)", unit: "weekly community calls" },
    conference: { label: "Conference", color: "var(--s-conference)", unit: "symposium showcase entries" },
    teams: { label: "Teams", color: "var(--s-teams)", unit: "channel posts and replies (counts only)" },
  };
  WGA.TYPE_LABELS = {
    release: "Release", pr_merged: "PR merged", pr_opened: "PR opened", issue_opened: "Issue opened",
    comment: "Comment", commit: "Commit", topic_created: "New topic", reply: "Reply",
    community_call: "Community call", spotlight: "WG spotlight", showcase_entry: "Showcase entry",
    wg_session: "WG session", tutorial: "Tutorial",
  };
  WGA.STATUS = {
    new: { glyph: "▲", label: "new", hint: "first activity in the last 8 weeks" },
    active: { glyph: "●", label: "active", hint: "activity in the last 8 weeks" },
    quiet: { glyph: "◐", label: "quiet", hint: "activity earlier in the window, none in the last 8 weeks" },
    dormant: { glyph: "○", label: "dormant", hint: "no activity found in the window" },
  };

  /* Build DOM safely: text always goes through textContent. */
  WGA.h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "style") el.setAttribute("style", attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  };

  WGA.load = function (path) {
    return fetch(path || "data/activity.json").then(function (r) {
      if (!r.ok) throw new Error("Could not load " + (path || "data/activity.json") + " (" + r.status + ")");
      return r.json();
    });
  };

  WGA.fail = function (root, err) {
    root.textContent = "";
    root.appendChild(WGA.h("div", { class: "rmdimportant", text: String(err.message || err) }));
  };

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  WGA.month = function (iso) { return MONTHS[parseInt(iso.slice(5, 7), 10) - 1]; };
  WGA.weekLabel = function (iso) {
    return "week of " + MONTHS[parseInt(iso.slice(5, 7), 10) - 1] + " " + parseInt(iso.slice(8, 10), 10) + ", " + iso.slice(0, 4);
  };
  WGA.fmt = function (n) { return Math.round(n).toLocaleString("en-US"); };
  WGA.sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };

  /* Sequential blue ramp, light -> dark, steps 100..700 of the reference palette. */
  var RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  function hex(c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); }
  WGA.RAMP = RAMP;
  WGA.rampColor = function (p) {
    var x = Math.min(Math.max(p, 0), 1) * (RAMP.length - 1);
    var i = Math.min(Math.floor(x), RAMP.length - 2), f = x - i;
    var a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
    return "rgb(" + a.map(function (v, k) { return Math.round(v + (b[k] - v) * f); }).join(",") + ")";
  };
  WGA.rampGradient = function () { return "linear-gradient(90deg," + RAMP.join(",") + ")"; };

  /* One tooltip for the whole page. */
  var tip;
  WGA.tip = {
    show: function (node, x, y) {
      if (!tip) { tip = WGA.h("div", { id: "wga-tip", role: "tooltip" }); document.body.appendChild(tip); }
      tip.textContent = "";
      tip.appendChild(node);
      tip.style.display = "block";
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var left = x + 14, top = y + 14;
      if (left + w > window.innerWidth - 8) left = x - w - 14;
      if (top + h > window.innerHeight - 8) top = y - h - 14;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    },
    hide: function () { if (tip) tip.style.display = "none"; },
  };
  WGA.tipRow = function (color, value, name) {
    return WGA.h("div", { class: "r" }, [
      WGA.h("span", { class: "k", style: "background:" + color }),
      WGA.h("span", { class: "v", text: value }),
      WGA.h("span", { class: "n", text: name }),
    ]);
  };

  /* A list of linked items, grouped by source. items: [{s, t, title, url}] */
  WGA.itemList = function (items) {
    var ul = WGA.h("ul", { class: "wga-list" });
    items.forEach(function (it) {
      var src = WGA.SOURCES[it.s] || { color: "var(--axis)", label: it.s };
      ul.appendChild(WGA.h("li", {}, [
        WGA.h("span", { class: "k", style: "background:" + src.color, title: src.label }),
        WGA.h("span", { class: "ty", text: src.label + " · " + (WGA.TYPE_LABELS[it.t] || it.t || "") }),
        WGA.h("a", { href: /^https?:\/\//.test(it.url || "") ? it.url : null, target: "_blank", rel: "noopener", text: it.title }),
      ]));
    });
    return ul;
  };
})();
