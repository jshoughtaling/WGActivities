/* Shared helpers for every page. Data files live in data/ (activity, projects, topics, similar, digest, collab). */
(function () {
  var WGA = (window.WGA = {});

  WGA.SOURCES = {
    github: { label: "GitHub", color: "var(--s-github)", unit: "commits, PRs, issues, comments, releases" },
    forums: { label: "Forums", color: "var(--s-forums)", unit: "forum topics and replies" },
    calls: { label: "Community calls", color: "var(--s-calls)", unit: "weekly community calls" },
    conference: { label: "Conference", color: "var(--s-conference)", unit: "symposium showcase entries, sessions and tutorials (global and regional)" },
    teams: { label: "Teams", color: "var(--s-teams)", unit: "channel posts and replies (counts only)" },
  };
  WGA.TYPE_LABELS = {
    release: "Release", pr_merged: "PR merged", pr_opened: "PR opened", issue_opened: "Issue opened",
    comment: "Comment", commit: "Commit", topic_created: "New topic", reply: "Reply",
    community_call: "Community call", spotlight: "WG spotlight", showcase_entry: "Showcase entry",
    wg_session: "WG session", tutorial: "Tutorial", regional_session: "Regional session", regional_event: "Regional event",
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
  var RAMP = ["#dce7f6", "#afc9ec", "#8db2e3", "#6c99d7", "#4a7fc9", "#2a5ca8", "#173f80"];
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
  /* ---------------- v2 helpers ---------------- */
  WGA.loadMany = function (paths) { return Promise.all(paths.map(function (p) { return WGA.load(p); })); };
  WGA.param = function (k) { return new URLSearchParams(location.search).get(k); };
  WGA.BUCKET_NAMES = { community: "Community-wide", regional: "Regional chapters", unassigned: "Unassigned",
    etl: "ETL and data onboarding", infrastructure: "Infrastructure" };
  WGA.names = {};
  WGA.setNames = function (n) { Object.keys(n || {}).forEach(function (k) { WGA.names[k] = n[k]; }); };
  WGA.name = function (slug) { return WGA.names[slug] || WGA.BUCKET_NAMES[slug] || slug; };
  WGA.shortName = function (slug) { var n = WGA.name(slug); return n.replace(/\s*\(.*\)\s*$/, ""); };
  WGA.wgHref = function (slug) { return "wg.html?wg=" + encodeURIComponent(slug); };
  WGA.projHref = function (id) { return "projects.html?p=" + encodeURIComponent(id); };
  WGA.topicHref = function (id) { return "topics.html?t=" + encodeURIComponent(id); };
  WGA.isBucket = function (slug) { return !!WGA.BUCKET_NAMES[slug]; };
  WGA.KINDS = { platform: "platform", package: "package", app: "app", library: "library", spec: "spec",
    deployment: "deployment", study: "study template", docs: "docs", repo: "repo" };
  WGA.OUTPUT_TYPES = { release: 1, showcase_entry: 1, tutorial: 1, wg_session: 1, regional_session: 1 };
  WGA.fmtDate = function (iso) { return iso ? WGA.month(iso) + " " + parseInt(iso.slice(8, 10), 10) : ""; };
  WGA.fmtDateY = function (iso) { return iso ? WGA.fmtDate(iso) + ", " + iso.slice(0, 4) : ""; };
  WGA.safeUrl = function (u) { return /^https?:\/\//.test(u || "") ? u : null; };

  WGA.badge = function (text, cls) { return WGA.h("span", { class: "wga-badge" + (cls ? " " + cls : ""), text: text }); };
  WGA.statusBadge = function (status, recent, prior) {
    var st = WGA.STATUS[status] || { label: status };
    var rising = recent > 1.5 * prior && recent >= 10;
    return WGA.badge(st.label.charAt(0).toUpperCase() + st.label.slice(1) + (rising && status === "active" ? " · rising" : ""),
      status === "active" || status === "new" ? "blue" : "");
  };
  WGA.tile = function (box, l, v, n, cls) {
    var t = WGA.h("div", { class: "wga-tile" + (cls ? " " + cls : "") }, [WGA.h("div", { class: "l", text: l }),
      WGA.h("div", { class: "v" + (String(v).length > 16 ? " long" : ""), text: String(v) })]);
    if (n) t.appendChild(typeof n === "string" ? WGA.h("div", { class: "n", text: n }) : WGA.h("div", { class: "n" }, [n]));
    box.appendChild(t);
    return t;
  };
  /* A one-row heatmap from 0..1 intensities (or raw counts, normalised to the row's max). */
  WGA.strip = function (vals, opts) {
    opts = opts || {};
    var max = opts.raw ? Math.max.apply(null, vals.concat([1])) : 1;
    var s = WGA.h("div", { class: "wga-strip", style: "--n:" + vals.length, "aria-hidden": "true" });
    vals.forEach(function (v) {
      var c = WGA.h("span");
      var x = v / max;
      if (x > 0) c.style.background = WGA.rampColor(0.08 + 0.92 * x);
      s.appendChild(c);
    });
    return s;
  };
  WGA.chipLinks = function (slugs, cls) {
    var box = WGA.h("span", { class: "wga-chips" });
    slugs.forEach(function (s) {
      box.appendChild(WGA.isBucket(s) ? WGA.h("span", { class: "wga-chip", text: WGA.name(s) })
        : WGA.h("a", { class: "wga-chip" + (cls ? " " + cls : ""), href: WGA.wgHref(s), text: WGA.shortName(s) }));
    });
    return box;
  };
  /* Feed list. items: [{d, s, t, title, url, wgs, p}] */
  WGA.feed = function (items, opts) {
    opts = opts || {};
    var ul = WGA.h("ul", { class: "wga-feed" });
    var yr = items.reduce(function (m, it) { return it.d && it.d.slice(0, 4) > m ? it.d.slice(0, 4) : m; }, "");
    items.forEach(function (it) {
      var src = WGA.SOURCES[it.s] || { label: it.s };
      var who = opts.who === false ? "" : opts.who === "repo" ? (it.r || (it.s === "conference" ? "Symposium" : WGA.SOURCES[it.s] ? WGA.SOURCES[it.s].label : "")) : (opts.who === "project" && it.p ? (opts.projName ? opts.projName(it.p) : it.p)
        : (it.wgs || []).map(WGA.shortName).join(", "));
      ul.appendChild(WGA.h("li", {}, [
        WGA.h("span", { class: "dt", text: it.d && it.d.slice(0, 4) !== yr ? WGA.fmtDate(it.d) + " '" + it.d.slice(2, 4) : WGA.fmtDate(it.d) }),
        WGA.h("span", { class: "ty" + (WGA.OUTPUT_TYPES[it.t] ? " out" : ""), text: (WGA.TYPE_LABELS[it.t] || it.t) + (it.s === "conference" || opts.who === "repo" ? "" : " · " + src.label) }),
        WGA.h("span", { class: "who", text: who, title: who }),
        WGA.safeUrl(it.url) ? WGA.h("a", { href: it.url, target: "_blank", rel: "noopener", text: it.title }) : WGA.h("span", { text: it.title }),
      ]));
    });
    return ul;
  };
  WGA.download = function (filename, text, type) {
    var a = WGA.h("a", { href: URL.createObjectURL(new Blob([text], { type: type || "text/plain" })), download: filename });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  WGA.csv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\n") + "\n";
  };
  WGA.copy = function (text, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1500); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { WGA.download("digest.md", text, "text/markdown"); });
    else WGA.download("digest.md", text, "text/markdown");
  };
  WGA.updated = function (el, iso, extra) {
    if (!el) return;
    var t = new Date(iso);
    el.textContent = "Updated " + t.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) + (extra ? ". " + extra : ".");
  };
})();
