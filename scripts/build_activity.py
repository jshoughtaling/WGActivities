#!/usr/bin/env python3
import argparse
import json
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "data" / "events"
TEAMS = ROOT / "data" / "teams_counts.json"
OUT = ROOT / "rmd" / "data" / "activity.json"

SOURCES = ["github", "forums", "calls", "conference", "teams"]
BUCKETS = {
    "community": "Community-wide",
    "regional": "Regional chapters",
    "unassigned": "Unassigned",
}
MAX_ITEMS = 20        # linked items kept per WG-week cell
MAX_LOW = 5           # of which at most this many may be low-information (comments, replies, commits)
LOW_INFO = {"comment", "reply", "commit"}
# When a cell has more than MAX_ITEMS, keep the most substantive first.
TYPE_PRIORITY = ["release", "pr_merged", "wg_session", "regional_session", "spotlight", "tutorial", "showcase_entry", "regional_event", "pr_opened", "topic_created",
                 "issue_opened", "community_call", "reply", "comment", "commit"]
RECENT = 8            # weeks used for status/trend flags


def iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_start(week):
    y, w = week.split("-W")
    return date.fromisocalendar(int(y), int(w), 1)


def window_weeks(today, n):
    monday = today - timedelta(days=today.weekday())
    return [iso_week(monday - timedelta(weeks=i)) for i in range(n - 1, -1, -1)]


def load_events():
    events = []
    for path in sorted(EVENTS.glob("*.json")):
        events += json.loads(path.read_text())
    return events


# Teams channels that belong to a different WG than their team, and teams that are not WGs.
TEAMS_CHANNEL_WG = {("cdm", "Vocabulary WG"): "cdm-vocabulary", ("methods-research", "PLP Workgroup"): "plp"}
TEAMS_BUCKET = {"steering-committee": "community", "workgroup-leadership": "community",
                "apac-steering-committee": "regional", "omop-fhir": "etl"}


# Channels left out of the counts (automated posts, not discussion). The drop file keeps the raw rows.
TEAMS_SKIP = {("gis", "Development")}


def teams_wg(r):
    return TEAMS_CHANNEL_WG.get((r["wg"], r.get("channel")), TEAMS_BUCKET.get(r["wg"], r["wg"]))


def load_teams():
    """Teams drop-file rows -> (events, covered). Count = posts + replies; meetings kept as detail.

    `covered` maps wg -> set of weeks with a row (zeros included), so "quiet" can be told from "not collected".
    """
    if not TEAMS.exists():
        return [], {}
    events, covered = [], defaultdict(set)
    for r in json.loads(TEAMS.read_text()):
        if (r["wg"], r.get("channel")) in TEAMS_SKIP:
            continue
        r["wg"] = teams_wg(r)
        covered[r["wg"]].add(r["week"])
        n = r.get("posts", 0) + r.get("replies", 0)
        if n or r.get("meetings"):
            events.append({
                "week": r["week"], "date": week_start(r["week"]).isoformat(), "wg": r["wg"], "source": "teams",
                "type": "channel_activity", "title": r.get("channel", ""), "url": None, "weight": n,
                "meetings": r.get("meetings", 0),
            })
    return events, covered


def percentile_maps(values_by_source):
    """For each source, return a function value -> percentile in (0, 1] among that source's non-zero values."""
    sorted_vals = {s: sorted(v for v in vals if v > 0) for s, vals in values_by_source.items()}

    def pct(source, v):
        vals = sorted_vals[source]
        if v <= 0 or not vals:
            return 0.0
        lo, hi = bisect_left(vals, v), bisect_right(vals, v)
        return ((lo + hi) / 2) / len(vals) if len(vals) > 1 else 1.0

    return pct


def build(today, n_weeks):
    cfg = yaml.safe_load((ROOT / "config" / "working_groups.yml").read_text())
    wgs = {w["slug"]: w for w in cfg["working_groups"]}
    weeks = window_weeks(today, n_weeks)
    week_set, week_idx = set(weeks), {w: i for i, w in enumerate(weeks)}

    teams_events, teams_covered = load_teams()
    events = load_events() + teams_events
    unknown = defaultdict(int)
    counts = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))   # wg -> source -> week -> n
    meetings = defaultdict(lambda: defaultdict(int))                         # wg -> week -> teams meetings
    items = defaultdict(lambda: defaultdict(list))                           # wg -> week -> [item]
    yearly = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))    # wg -> source -> year -> n
    coverage = {}                                                            # source -> [first, last] event date

    for e in events:
        wg, src = e["wg"], e["source"]
        if wg not in wgs and wg not in BUCKETS:
            unknown[wg] += 1
            continue
        yearly[wg][src][e["date"][:4]] += e.get("weight", 1)
        first, last = coverage.get(src, [e["date"], e["date"]])
        coverage[src] = [min(first, e["date"]), max(last, e["date"])]
        if e["week"] not in week_set:
            continue
        counts[wg][src][e["week"]] += e.get("weight", 1)
        if src == "teams":
            meetings[wg][e["week"]] += e.get("meetings", 0)
        elif e.get("url"):
            items[wg][e["week"]].append({"s": src, "t": e.get("type"), "title": e["title"], "url": e["url"]})

    def rank(item):
        t = item["t"]
        return TYPE_PRIORITY.index(t) if t in TYPE_PRIORITY else len(TYPE_PRIORITY)

    for by_week in items.values():
        for w, lst in by_week.items():
            lst.sort(key=rank)          # stable: keeps date order within a type
            keep, low = [], 0
            for it in lst:
                if it["t"] in LOW_INFO:
                    if low >= MAX_LOW:
                        continue
                    low += 1
                if len(keep) < MAX_ITEMS:
                    keep.append(it)
            lst[:] = keep

    active_sources = [s for s in SOURCES if any(counts[wg][s] for wg in counts)]
    pct = percentile_maps({s: [counts[wg][s].get(w, 0) for wg in counts for w in weeks] for s in active_sources})

    def row(slug, name, extra=None):
        per_source = {}
        for s in active_sources:
            c = [counts[slug][s].get(w, 0) for w in weeks]
            if any(c):
                per_source[s] = {"counts": [int(x) for x in c], "intensity": [round(pct(s, x), 3) for x in c]}
        total = [sum(per_source[s]["counts"][i] for s in per_source) for i in range(n_weeks)]
        combined = []
        for i in range(n_weeks):
            keep = 1.0
            for s in per_source:
                keep *= 1 - per_source[s]["intensity"][i]
            combined.append(round(1 - keep, 3))
        recent, prior = sum(total[-RECENT:]), sum(total[-2 * RECENT:-RECENT])
        status = ("active" if recent else "quiet" if sum(total) else "dormant")
        if recent and not sum(total[:-RECENT]):
            status = "new"
        out = {
            "slug": slug, "name": name, "sources": per_source,
            "total": total, "intensity": combined,
            "recent": recent, "prior": prior, "status": status,
            "items": {w: items[slug][w] for w in weeks if items[slug].get(w)},
            "yearly": {s: {y: int(n) for y, n in sorted(v.items())} for s, v in yearly[slug].items()},
        }
        if meetings.get(slug):
            out["teams_meetings"] = [meetings[slug].get(w, 0) for w in weeks]
        if slug in teams_covered:
            out["teams_covered"] = [w in teams_covered[slug] for w in weeks]
        out.update(extra or {})
        return out

    wg_rows = [row(s, w["name"], {"on_ohdsi_org": w.get("on_ohdsi_org", False)}) for s, w in wgs.items()]
    wg_rows.sort(key=lambda r: (-r["recent"], -sum(r["total"]), r["name"].lower()))
    bucket_rows = [row(s, n) for s, n in BUCKETS.items() if s in counts]

    for slug, n in unknown.items():
        print(f"warning: {n} events for unknown wg '{slug}' skipped")
    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "weeks": weeks,
        "week_starts": [week_start(w).isoformat() for w in weeks],
        "partial_week": weeks[-1],     # the current ISO week is still in progress
        "sources": active_sources,
        "coverage": coverage,
        "wgs": wg_rows,
        "buckets": bucket_rows,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=52)
    ap.add_argument("--today", type=date.fromisoformat, default=date.today())
    args = ap.parse_args()
    data = build(args.today, args.weeks)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB): {len(data['wgs'])} WGs, "
          f"{len(data['weeks'])} weeks, sources {data['sources']}")
