#!/usr/bin/env python3
"""Build the v2 site data: projects, topics, similar work and the weekly digest.

Reads data/events/*.json and config/{working_groups,projects,collab_themes}.yml (plus rmd/data/collab.json for the
pairs that are already connected). Writes, next to activity.json:

  rmd/data/projects.json  one row per project (config/projects.yml + one-repo projects): weekly GitHub counts,
                          repos, releases, extends/extended_by
  rmd/data/topics.json    curated topics: weekly counts, groups, items; topic x group per Global Symposium
  rmd/data/similar.json   shared-term clusters: the same subject showing up in items of several groups
  rmd/data/digest.json    last 12 weeks: per-week totals and items by group; outputs of the last 52 weeks
  rmd/data/digest.xml     RSS feed of the weekly digest

Usage: python3 scripts/build_views.py [--today YYYY-MM-DD] [--weeks 52]
"""

import argparse
import json
import math
import re
import sys
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from itertools import combinations
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_items import (BUCKETS, ROOT, TEXT_TYPES, canonical_items, load_events, projects, rank,  # noqa: E402
                       short, topics, week_start, window_weeks, wg_config)

OUT = ROOT / "rmd" / "data"
RECENT = 8                 # weeks for status and trend, same as activity.json
DIGEST_WEEKS = 12
MAX_CELL_ITEMS = 8         # drill-down items kept per row-week
SITE_URL = "https://jshoughtaling.github.io/WGActivities/"   # used in the RSS feed only


def pct_fn(values):
    vals = sorted(v for v in values if v > 0)

    def pct(v):
        if v <= 0 or not vals:
            return 0.0
        lo, hi = bisect_left(vals, v), bisect_right(vals, v)
        return round(((lo + hi) / 2) / len(vals), 3) if len(vals) > 1 else 1.0
    return pct


def status_of(total):
    recent = sum(total[-RECENT:])
    if not sum(total):
        return "dormant"
    if not recent:
        return "quiet"
    return "new" if not sum(total[:-RECENT]) else "active"


def cell_items(lst):
    lst = sorted(lst, key=lambda i: (rank(i["t"]), i["date"]))
    keep, low = [], 0
    for it in lst:
        if it["t"] in ("commit", "comment", "reply"):
            if low >= 2:
                continue
            low += 1
        keep.append(short(it))
        if len(keep) >= MAX_CELL_ITEMS:
            break
    return keep


# ---------------------------------------------------------------- projects
def build_projects(items, events, weeks, names):
    spec, repo_proj = projects()
    widx = {w: i for i, w in enumerate(weeks)}
    n = len(weeks)
    counts = defaultdict(lambda: [0] * n)
    cell = defaultdict(lambda: defaultdict(list))
    repo_stats = defaultdict(lambda: {"items": 0, "prs": 0, "issues": 0, "last": None, "release": None})
    releases = defaultdict(list)
    for e in events:
        if e["source"] != "github" or e.get("repo") not in repo_proj:
            continue
        rs = repo_stats[e["repo"]]
        rs["last"] = max(rs["last"] or "", e["date"])
        if e["week"] not in widx:
            continue
        rs["items"] += 1
        rs["prs"] += e["type"] == "pr_merged"
        rs["issues"] += e["type"] == "issue_opened"
    for it in items:
        if it["s"] != "github" or not it.get("project") or it["week"] not in widx:
            continue
        pid = it["project"]
        counts[pid][widx[it["week"]]] += 1
        cell[pid][it["week"]].append(it)
        if it["t"] == "release" and not it["nightly"]:
            releases[pid].append(short(it))
            r = repo_stats[it["repo"]]
            if not r["release"] or it["date"] > r["release"]["d"]:
                r["release"] = {"d": it["date"], "title": it["title"], "url": it["url"]}
    pct = pct_fn([c for pid in counts for c in counts[pid]])
    extended_by = defaultdict(list)
    for pid, p in spec.items():
        for x in p["extends"]:
            extended_by[x].append(pid)
    rows = []
    for pid, p in spec.items():
        c = counts.get(pid, [0] * n)
        tot = sum(c)
        if not p["grouped"] and not tot and not any(repo_stats[r]["last"] for r in p["repos"]):
            continue                                  # one-repo projects with no activity ever stay out
        row = {
            "id": pid, "name": p["name"], "lead_wg": p["lead_wg"], "lead_name": names.get(p["lead_wg"], p["lead_wg"]),
            "contributing_wgs": p["contributing_wgs"], "kind": p["kind"], "grouped": p["grouped"],
            "description": p.get("description", ""), "depends_on": p["depends_on"],
            "extends": p["extends"], "extended_by": extended_by.get(pid, []), "reviewed": p.get("reviewed"),
            "repos": [dict(name=r, url=f"https://github.com/OHDSI/{r}", **repo_stats[r]) for r in p["repos"]],
            "recent": sum(c[-RECENT:]), "prior": sum(c[-2 * RECENT:-RECENT]), "total52": tot,
            "status": status_of(c),
            "last": max([repo_stats[r]["last"] or "" for r in p["repos"]] or [""]) or None,
            "releases": sorted(releases.get(pid, []), key=lambda r: r["d"], reverse=True)[:12],
        }
        if tot:
            row["counts"] = c
            row["intensity"] = [pct(x) for x in c]
            row["items"] = {w: cell_items(v) for w, v in cell[pid].items()}
        rows.append(row)
    rows.sort(key=lambda r: (-r["recent"], -r["total52"], r["name"].lower()))
    return rows


# ---------------------------------------------------------------- topics
def build_topics(items, weeks, names, today):
    tps = topics()
    widx = {w: i for i, w in enumerate(weeks)}
    n = len(weeks)
    recent_since = week_start(weeks[-26]).isoformat()
    rows = []
    per = {}
    for tid, t in tps.items():
        c = [0] * n
        wgs, wgs_recent = Counter(), Counter()
        cell, recent_items = defaultdict(list), []
        for it in items:
            if tid not in it["topics"] or it["week"] not in widx:
                continue
            c[widx[it["week"]]] += 1
            cell[it["week"]].append(it)
            if len(it["wgs"]) > 4:
                continue                                 # roundups tagged to many groups say little about who works on it
            for w in it["wgs"]:
                if w in BUCKETS:
                    continue
                wgs[w] += 1
                if it["date"] >= recent_since:
                    wgs_recent[w] += 1
            if it["date"] >= recent_since:
                recent_items.append(it)
        per[tid] = (c, wgs, wgs_recent, cell, recent_items)
    pct = pct_fn([x for v in per.values() for x in v[0]])
    for tid, (c, wgs, wgs_recent, cell, recent_items) in per.items():
        if not sum(c):
            continue
        recent_items.sort(key=lambda i: (rank(i["t"]), i["date"]))
        seen, ev = set(), []
        for it in sorted(recent_items, key=lambda i: i["date"], reverse=True):
            if it["t"] in ("commit", "comment", "reply") or it["title"] in seen:
                continue
            seen.add(it["title"])
            ev.append(short(it))
            if len(ev) >= 12:
                break
        rows.append({
            "id": tid, "name": tps[tid]["name"], "counts": c, "intensity": [pct(x) for x in c],
            "total52": sum(c), "recent": sum(c[-RECENT:]), "prior": sum(c[-2 * RECENT:-RECENT]),
            "status": status_of(c),
            "wgs": [[w, k] for w, k in wgs.most_common()], "wgs_recent": [[w, k] for w, k in wgs_recent.most_common()],
            "items": {w: cell_items(v) for w, v in cell.items()}, "evidence": ev,
        })
    rows.sort(key=lambda r: (-len(r["wgs_recent"]), -r["total52"]))
    return rows


def build_symposia(all_items):
    """Topic x group counts for each Global Symposium (showcase, sessions and tutorials)."""
    tps = topics()
    out = []
    by_event = defaultdict(list)
    for it in all_items:
        if it["s"] == "conference" and it.get("event") and it["event"].startswith("Global Symposium"):
            by_event[it["event"]].append(it)
    for ev in sorted(by_event):
        its = by_event[ev]
        m = defaultdict(Counter)
        for it in its:
            if len(it["wgs"]) > 4:
                continue                                 # roundup sessions that name many groups
            for tid in it["topics"]:
                for w in it["wgs"]:
                    if w not in BUCKETS:
                        m[tid][w] += 1
        tot = Counter()
        for tid in m:
            tot.update(m[tid])
        cols = [w for w, _ in tot.most_common(10)]
        rows = []
        for tid in sorted(m, key=lambda k: -sum(m[k].values())):
            rows.append({"id": tid, "name": tps[tid]["name"], "cells": [m[tid].get(w, 0) for w in cols],
                         "groups": len(m[tid]), "total": sum(m[tid].values())})
        out.append({"event": ev, "year": ev[-4:], "items": len(its), "cols": cols, "rows": rows})
    return out


# ---------------------------------------------------------------- similar work
STOP = set("""a about add added adding after all also an and any are as at be been before between both but by can
could do does done for from get got has have how in into is it its just like make may more most new not now of
on one only or other our out over per set should so some such than that the their them then there these they
this to up use used using via was we were what when where which while who why will with without would you your
fix fixes fixed update updates updated bump bumps release releases version versions support issue issues error
errors bug bugs test tests testing feature features option options allow allows enable fail fails failing work
works working need needs needed request pull merge branch main master readme docs doc documentation change
changes changed remove removed move moved rename renamed refactor clean cleanup improve improved improvement
example examples file files code run running build builds package packages module modules function functions
initial commit comment comments question questions help please thanks thank hello hi
ohdsi omop cdm data database databases table tables column columns query queries sql value values type types
name names list lists result results model models study studies analysis analyses tool tools
call calls meeting meetings session sessions workgroup group groups wg symposium global tutorial showcase
project projects team dev develop development github repo repository vignette vignettes link links missing
default check checks add new user users report reports page pages app apps shiny r python api first based
when time date dates year years day days month cohort cohorts concept concepts patient patients health clinical
across within large real world evidence network using use case cases approach framework standard standardized
open source community monthly weekly agenda minutes call-for welcome digest vote""".split())


ENTITY = re.compile(r"^(?:[A-Z]{3,}[a-z]*|[A-Z][a-z]+[A-Z]\w*|[a-z]+[A-Z]\w*|[A-Za-z]+\d[\w.]*|v\d+\.\d+)$")
VERSION = re.compile(r"^v?\d+(\.\d+){2,}$|^v\d+$")
ENTITY_STOP = {"OHDSI", "OMOP", "CDM", "SQL", "API", "README", "WIP", "TODO", "CRAN", "HTML", "JSON", "CSV", "URL",
               "URLS", "PR", "NA", "CI", "UI", "ID", "IDS", "WG", "AI", "TRUE", "FALSE", "NULL", "ERROR", "OUT", "CLI",
               "GITHUB", "HADES", "ATLAS", "WEBAPI", "GIS", "NLP", "PLP", "GAIA", "THEMIS", "OHDSI'S", "FAQ", "PDF",
               "R", "DB", "DOI", "NEW", "FIX", "ADD", "UPDATE"}


# generic words that still make a specific phrase after a specific word ("episode table", "drug era")
TAIL_OK = {"table", "domain", "field", "model", "concept", "cohort", "data", "analysis", "check", "type", "date"}
STOP -= {"study", "studies"}
STOP |= set("common data the-ohdsi already exist variou fixe post http https record count various fixes minor typo typos".split())


def norm(w, entity=False):
    w = w.lower().strip("-.")
    if entity:
        return w
    return w[:-1] if w.endswith("s") and len(w) > 4 and not w.endswith(("ss", "us", "is", "as", "os")) else w


def terms_of(title):
    """Named things (CamelCase, ALLCAPS, versioned: DuckDB, FHIR, LSOA, v5.5) and two-word phrases."""
    raw = re.findall(r"[A-Za-z][A-Za-z0-9.\-]*", title)
    out = set()
    for w in raw:
        w2 = w.strip("-.")
        if ENTITY.match(w2) and w2.upper() not in ENTITY_STOP and len(w2) > 2 and not VERSION.match(w2):
            out.add(norm(w2, entity=True))
    words = [norm(w) for w in raw]
    for a, b in zip(words, words[1:]):
        if a and b and a not in STOP and (b not in STOP or b in TAIL_OK) and len(a) > 2 and len(b) > 2 \
                and not a.replace(".", "").isdigit() and not b.replace(".", "").isdigit():
            out.add(a + " " + b)
    return out


TOPICS = topics()


def build_similar(items, linked_pairs, today):
    since = date.fromordinal(today.toordinal() - 365).isoformat()
    pool = [it for it in items if it["t"] in TEXT_TYPES and it["t"] != "release" and it["date"] >= since
            and 1 <= len([w for w in it["wgs"] if w not in BUCKETS]) <= 3]
    df = Counter()
    by_term = defaultdict(list)
    for it in pool:
        for t in terms_of(it["title"]):
            df[t] += 1
            by_term[t].append(it)
    clusters = []
    for t, its in by_term.items():
        if df[t] > 40 or len(its) < 3:
            continue
        wg_items = defaultdict(list)
        for it in its:
            for w in it["wgs"]:
                if w not in BUCKETS:
                    wg_items[w].append(it)
        if len(wg_items) < 2:
            continue
        # every group must contribute an item that no other group in the cluster shares (not one co-tagged poster)
        solo = [w for w, lst in wg_items.items() if any(len(i["wgs"]) == 1 for i in lst)]
        if len(solo) < 2:
            continue
        wgs = sorted(wg_items, key=lambda w: -len(wg_items[w]))
        missing = [[a, b] for a, b in combinations(sorted(wgs), 2) if (a, b) not in linked_pairs]
        # spread across groups matters most, with diminishing returns; rarer terms are more specific
        score = 3 * math.log2(1 + len(solo)) + math.log(len(its)) + 0.4 * min(len(missing), 5) - 0.05 * df[t]
        if any(tp["rx"].search(t) for tp in TOPICS.values()):
            score -= 2                                   # a curated topic already covers it; prefer specific subjects
        clusters.append({"term": t, "wgs": wgs, "n": len(its), "score": round(score, 2), "missing_ties": missing,
                         "keys": {i["key"] for i in its}, "its": its, "wg_items": wg_items,
                         "latest": max(i["date"] for i in its)})
    clusters.sort(key=lambda c: -c["score"])
    kept = []
    for c in clusters:                                   # drop near-duplicates (a word and the phrase it sits in)
        if any(len(c["keys"] & k["keys"]) / len(c["keys"] | k["keys"]) > 0.5 for k in kept):
            continue
        kept.append(c)
        if len(kept) >= 40:
            break
    tps = topics()
    out = []
    for c in kept:
        ev = []
        for w in c["wgs"]:                               # one or two items per group, newest first
            for it in sorted(c["wg_items"][w], key=lambda i: i["date"], reverse=True)[:2]:
                if all(it["key"] != e["_k"] for e in ev):
                    ev.append(dict(short(it), _k=it["key"], g=w))
        for e in ev:
            e.pop("_k")
        topic = next((tid for tid, t in tps.items() if t["rx"].search(c["term"])), None)
        out.append({"term": c["term"], "wgs": c["wgs"], "n": c["n"], "score": c["score"],
                    "new_ties": c["missing_ties"][:6], "latest": c["latest"], "topic": topic,
                    "items": sorted(ev, key=lambda e: e["d"], reverse=True)[:10]})
    return out


# ---------------------------------------------------------------- digest
def build_digest(items, weeks, names):
    out_weeks = []
    widx = {w: i for i, w in enumerate(weeks)}
    for wk in weeks[-DIGEST_WEEKS:]:
        its = [i for i in items if i["week"] == wk]
        by_type = Counter(i["t"] for i in its)
        groups = defaultdict(list)
        for i in its:
            for w in i["wgs"]:
                groups[w].append(i)
        g_rows = []
        for w, lst in groups.items():
            substantive = sorted((i for i in lst if i["t"] not in ("commit", "comment", "reply") and not i["nightly"]),
                                 key=lambda i: (rank(i["t"]), i["date"]))
            g_rows.append({"slug": w, "name": names.get(w, {"community": "Community-wide", "regional": "Regional chapters",
                                                            "unassigned": "Unassigned", "etl": "ETL and data onboarding"}.get(w, w)),
                           "n": len(lst), "bucket": w in BUCKETS, "items": [short(i) for i in substantive[:80]],
                           "more": max(0, len(substantive) - 80)})
        g_rows.sort(key=lambda g: (g["bucket"], -g["n"]))
        out_weeks.append({
            "week": wk, "start": week_start(wk).isoformat(), "items": len(its),
            "groups": len([g for g in g_rows if not g["bucket"]]),
            "by_type": dict(by_type), "nightly": sum(1 for i in its if i["nightly"]),
            "releases": [short(i) for i in its if i["t"] == "release" and not i["nightly"]],
            "by_group": g_rows,
        })
    since = week_start(weeks[0]).isoformat()
    outputs = sorted((short(i) for i in items if i["output"] and i["date"] >= since), key=lambda i: i["d"], reverse=True)
    return {"weeks": out_weeks, "outputs": outputs}


def rss(digest, generated):
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0"><channel>',
             "<title>OHDSI working groups: weekly digest</title>", f"<link>{SITE_URL}activity.html</link>",
             "<description>What OHDSI working groups did each week, from public sources.</description>",
             f"<lastBuildDate>{generated.strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>"]
    for w in reversed(digest["weeks"]):
        top = ", ".join(f"{g['name']} ({g['n']})" for g in w["by_group"] if not g["bucket"])[:400]
        rel = "; ".join(r["title"] for r in w["releases"][:8])
        desc = f"{w['items']} public items from {w['groups']} groups. Most active: {top}." + (f" Releases: {rel}." if rel else "")
        d = datetime.fromisoformat(w["start"]).replace(tzinfo=timezone.utc)
        parts.append(f"<item><title>Week of {escape(w['start'])}</title><link>{SITE_URL}activity.html?week={w['week']}</link>"
                     f"<guid isPermaLink=\"false\">wga-digest-{w['week']}</guid><pubDate>{d.strftime('%a, %d %b %Y 00:00:00 +0000')}</pubDate>"
                     f"<description>{escape(desc)}</description></item>")
    parts.append("</channel></rss>")
    return "\n".join(parts) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", type=date.fromisoformat, default=date.today())
    ap.add_argument("--weeks", type=int, default=52)
    a = ap.parse_args()
    _, names, _ = wg_config()
    weeks = window_weeks(a.today, a.weeks)
    events = [e for e in load_events() if e["date"] <= a.today.isoformat()]
    all_items = canonical_items(events)
    since = week_start(weeks[0]).isoformat()
    items = [i for i in all_items if i["date"] >= since]
    collab_path = OUT / "collab.json"
    linked = set()
    if collab_path.exists():
        linked = {tuple(sorted((p["a"], p["b"]))) for p in json.loads(collab_path.read_text())["pairs"]}

    gen = datetime.now(timezone.utc)
    head = {"generated": gen.isoformat(timespec="seconds"), "weeks": weeks,
            "week_starts": [week_start(w).isoformat() for w in weeks], "partial_week": weeks[-1]}
    proj = build_projects(items, events, weeks, names)
    tops = build_topics(items, weeks, names, a.today)
    sim = build_similar(all_items, linked, a.today)
    dig = build_digest(items, weeks, names)
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "projects.json": dict(head, projects=proj, names=names),
        "topics.json": dict(head, topics=tops, symposia=build_symposia(all_items), names=names),
        "similar.json": {"generated": head["generated"], "window_days": 365, "clusters": sim, "names": names},
        "digest.json": dict(head, names=names, **dig),
    }
    for fn, data in files.items():
        (OUT / fn).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    (OUT / "digest.xml").write_text(rss(dig, gen))
    print(f"projects {len(proj)} ({sum(p['grouped'] for p in proj)} grouped) · topics {len(tops)} · "
          f"similar {len(sim)} · digest {len(dig['weeks'])} weeks, {len(dig['outputs'])} outputs")
    for fn in list(files) + ["digest.xml"]:
        print(f"  {fn}: {(OUT / fn).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
