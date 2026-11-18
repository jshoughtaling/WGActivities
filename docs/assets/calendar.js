/* Calendar: upcoming working-group meetings (from ohdsi.org's Upcoming Working Group Calls page), community calls and
   symposium dates. Reads data/calendar.json. Used by the Activity page (Calendar view), Overview (Coming up) and
   group pages (next meeting). Join links are not copied: every meeting links to the ohdsi.org page. */
(function () {
  var h = WGA.h;
  var CAL = (WGA.cal = {});
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var KIND = { meeting: "Working group", community_call: "Community call", symposium: "Symposium" };

  CAL.load = function () {
    return fetch("data/calendar.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  };
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
  CAL.today = function () { return iso(new Date()); };
  CAL.STALE_DAYS = 10;      // keep in step with MEETINGS_STALE_DAYS in scripts/build_health.py
  /* A notice when ohdsi.org's page has not been edited for a while, or lists nothing ahead; null when the list looks current. */
  CAL.staleNote = function (cal) {
    if (!cal) return null;
    var t = CAL.today(), age = cal.source_updated ? Math.round((parse(t) - parse(cal.source_updated)) / 86400000) : null;
    var none = !CAL.upcoming(cal, { skipExpected: true }).some(function (e) { return e.kind === "meeting"; });
    if (age !== null && age <= CAL.STALE_DAYS && !none) return null;
    return h("div", { class: "wga-card warm tight", role: "note", style: "margin:0 0 0.8em" }, [h("p", { class: "wga-note warm-ink", style: "margin:0" }, [
      h("strong", { text: "These meetings may be out of date. " }),
      none ? "No working-group meetings are listed from today on. " : "",
      age === null ? "ohdsi.org's page shows no update date. " : age > CAL.STALE_DAYS ? "ohdsi.org's page was last updated " + age + " days ago (" + WGA.fmtDateY(cal.source_updated) + "). " : "",
      "Check the ohdsi.org page before relying on a date. ", h("a", { href: "about.html#data-health", text: "Data health" }), "."])]);
  };

  CAL.upcoming = function (cal, opts) {
    opts = opts || {};
    var t = CAL.today();
    return cal.events.filter(function (e) {
      return e.date >= t && (!opts.wg || e.wg === opts.wg) && (opts.kinds ? opts.kinds[e.kind] : true) && !(opts.skipExpected && e.expected);
    });
  };
  CAL.who = function (e) { return e.wg && !WGA.isBucket(e.wg) ? WGA.shortName(e.wg) : null; };
  /* The group's name, unless the meeting title already says it ("GIS WG" needs no "· GIS"). */
  CAL.extraWho = function (e) {
    var w = CAL.who(e);
    if (!w) return null;
    var core = w.replace(/\s+(WG|work ?group)$/i, "").toLowerCase();
    return e.title.toLowerCase().indexOf(core) >= 0 ? null : w;
  };
  CAL.when = function (e) { var d = parse(e.date); return DOW[(d.getDay() + 6) % 7] + " " + WGA.fmtDate(e.date) + (e.time_et ? ", " + e.time_et + " ET" : ""); };

  /* One event as a row in a list. */
  CAL.row = function (e, compact) {
    var title = e.cancelled ? h("s", { text: e.title }) : h("span", { text: e.title });
    var link = WGA.safeUrl(e.url) ? h("a", { href: e.url, target: "_blank", rel: "noopener", text: e.kind === "meeting" ? "Join details" : e.kind === "community_call" ? "Call page" : "Event page" }) : null;
    var meta = [e.cancelled ? "Cancelled" : null, e.note, compact ? null : e.cadence, e.platform && e.platform !== "teams" ? "on " + e.platform : null].filter(Boolean).join(" · ");
    return h("li", { class: "cal-ev k-" + e.kind + (e.cancelled ? " x" : "") }, [
      h("span", { class: "cal-t", text: e.all_day ? "all day" : (e.time_et || "") }),
      h("span", { class: "cal-b" }, [
        h("span", { class: "cal-n" }, [title, CAL.extraWho(e) ? h("a", { class: "cal-g", href: WGA.wgHref(e.wg), text: " · " + CAL.extraWho(e) }) : null]),
        meta ? h("span", { class: "cal-m", text: meta }) : null,
        h("span", { class: "cal-l" }, [link, e.recording ? h("span", {}, [" · ", h("a", { href: e.recording, target: "_blank", rel: "noopener", text: "Recording" })]) : null]),
      ]),
    ]);
  };

  /* Full calendar view (Activity page). state: {mode: week|month, anchor: Date, q: string} */
  CAL.view = function (box, cal, state, match) {
    box.textContent = "";
    if (!cal) { box.appendChild(h("p", { class: "wga-empty", text: "The meeting calendar is not available yet (data/calendar.json is missing)." })); return; }
    state.mode = state.mode || "week";
    if (!state.anchor) {
      var t = parse(CAL.today()), lo = parse(cal.window[0]), hi = parse(cal.window[1]);
      state.anchor = t < lo || t > hi ? parse(cal.source_updated || cal.window[0]) : t;
    }
    var stale = CAL.staleNote(cal);
    if (stale) box.appendChild(stale);
    var evs = cal.events.filter(match || function () { return true; });
    var head = h("div", { class: "wga-page-h" });
    var title = h("h1");
    var seg = h("div", { class: "wga-seg", role: "group", "aria-label": "Calendar range" });
    [["week", "Week"], ["month", "Month"]].forEach(function (o) {
      var b = h("button", { type: "button", text: o[1], "aria-pressed": String(state.mode === o[0]) });
      b.addEventListener("click", function () { state.mode = o[0]; CAL.view(box, cal, state, match); });
      seg.appendChild(b);
    });
    var prev = h("button", { type: "button", class: "wga-btn", "aria-label": "Previous", text: "←" });
    var next = h("button", { type: "button", class: "wga-btn", "aria-label": "Next", text: "→" });
    var tbtn = h("button", { type: "button", class: "wga-btn", text: "Today" });
    prev.addEventListener("click", function () { state.anchor = state.mode === "week" ? addDays(state.anchor, -7) : new Date(state.anchor.getFullYear(), state.anchor.getMonth() - 1, 1); CAL.view(box, cal, state, match); });
    next.addEventListener("click", function () { state.anchor = state.mode === "week" ? addDays(state.anchor, 7) : new Date(state.anchor.getFullYear(), state.anchor.getMonth() + 1, 1); CAL.view(box, cal, state, match); });
    tbtn.addEventListener("click", function () { state.anchor = parse(CAL.today()); CAL.view(box, cal, state, match); });
    head.appendChild(h("div", {}, [title, h("p", { class: "sub wga-note" }, [
      "Working-group meetings from ohdsi.org's ", h("a", { href: cal.source, target: "_blank", rel: "noopener", text: "Upcoming Working Group Calls" }),
      cal.source_updated ? " (page last updated " + WGA.fmtDateY(cal.source_updated) + ")" : "", ", community calls and symposium dates. Times are US Eastern."])]));
    head.appendChild(h("div", { style: "display:flex;gap:0.4em;align-items:center;flex-wrap:wrap" }, [prev, tbtn, next, seg]));
    box.appendChild(head);

    var byDay = {};
    evs.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });
    var todayIso = CAL.today();
    if (state.mode === "week") {
      var m0 = monday(state.anchor);
      title.textContent = "Week of " + WGA.fmtDateY(iso(m0));
      var list = h("div", { class: "wga-card" });
      var any = false;
      for (var i = 0; i < 7; i++) {
        var d = iso(addDays(m0, i)), es = byDay[d] || [];
        if (!es.length && i >= 5) continue;
        any = any || es.length > 0;
        list.appendChild(h("div", { class: "cal-day" + (d === todayIso ? " today" : "") }, [
          h("div", { class: "cal-dh", text: DOW[i] + " " + WGA.fmtDate(d) + (d === todayIso ? " · today" : "") }),
          es.length ? h("ul", { class: "cal-list" }, es.map(function (e) { return CAL.row(e); })) : h("div", { class: "wga-empty", text: "Nothing scheduled." }),
        ]));
      }
      if (!any) list.appendChild(h("p", { class: "wga-note", text: outOfRange(m0, addDays(m0, 6)) }));
      box.appendChild(list);
    } else {
      var first = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1);
      title.textContent = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      var grid = h("div", { class: "cal-month", role: "grid", "aria-label": title.textContent });
      DOW.forEach(function (x) { grid.appendChild(h("div", { class: "cal-mh", role: "columnheader", text: x })); });
      var start = monday(first);
      for (var k = 0; k < 42; k++) {
        var dd = addDays(start, k), di = iso(dd);
        if (k >= 35 && dd.getMonth() !== first.getMonth()) break;
        var cell = h("div", { class: "cal-mc" + (dd.getMonth() !== first.getMonth() ? " out" : "") + (di === todayIso ? " today" : ""), role: "gridcell" }, [h("div", { class: "cal-md", text: String(dd.getDate()) })]);
        var es2 = byDay[di] || [];
        es2.slice(0, 4).forEach(function (e) {
          cell.appendChild(h("a", { class: "cal-chip k-" + e.kind + (e.cancelled ? " x" : ""), href: WGA.safeUrl(e.url) || "#", target: "_blank", rel: "noopener",
            title: CAL.when(e) + " · " + e.title + (e.cancelled ? " (cancelled)" : ""), text: (e.time_et ? e.time_et + " " : "") + (CAL.who(e) || e.title) }));
        });
        if (es2.length > 4) {
          var more = h("button", { type: "button", class: "cal-more", text: "+" + (es2.length - 4) + " more" });
          (function (d0) { more.addEventListener("click", function () { state.mode = "week"; state.anchor = d0; CAL.view(box, cal, state, match); }); })(dd);
          cell.appendChild(more);
        }
        grid.appendChild(cell);
      }
      box.appendChild(h("div", { class: "wga-card" }, [h("div", { class: "hm-scroll" }, [grid]),
        h("div", { class: "wga-legend" }, [
          h("span", { class: "item" }, [h("span", { class: "sw cal-sw k-meeting" }), "Working group"]),
          h("span", { class: "item" }, [h("span", { class: "sw cal-sw k-community_call" }), "Community call"]),
          h("span", { class: "item" }, [h("span", { class: "sw cal-sw k-symposium" }), "Symposium"]),
          h("span", { class: "item", text: "Struck through = cancelled. Select a +more to see the full day in the week view." }),
        ])]));
    }
    var tail = h("div", { class: "wga-cols" });
    if (cal.status && cal.status.length) {
      tail.appendChild(h("section", { class: "wga-card tight", style: "flex:1 1 320px" }, [h("h3", { text: "Not on the schedule" }),
        h("ul", { class: "wga-plain" }, cal.status.map(function (s) {
          return h("li", {}, [s.wg && !WGA.isBucket(s.wg) ? h("a", { href: WGA.wgHref(s.wg), text: s.name }) : s.name, ": " + (s.state === "tbd" ? "next meeting to be decided" : s.state)]);
        }))]));
    }
    tail.appendChild(h("section", { class: "wga-card tight", style: "flex:1 1 320px" }, [h("h3", { text: "About this calendar" }),
      h("p", { class: "wga-note", style: "margin:0", text: "ohdsi.org lists about four weeks ahead; later weeks fill in as the page is updated. Community calls after the last collected one are expected Tuesday calls, titled when announced. " +
        "Join links are not copied here: \"Join details\" opens the ohdsi.org page, where the current link is. Meeting lengths are not published, so calendar apps show one hour." }),
      cal.source_note ? h("p", { class: "wga-note", text: cal.source_note }) : null]));
    box.appendChild(tail);

    function outOfRange(a, b) {
      if (iso(b) < cal.window[0]) return "This week is before the calendar's range (" + WGA.fmtDateY(cal.window[0]) + " onward).";
      if (iso(a) > cal.window[1]) return "ohdsi.org has not listed meetings this far ahead yet (it lists through " + WGA.fmtDateY(cal.window[1]) + ").";
      return "Nothing scheduled this week.";
    }
  };
})();
