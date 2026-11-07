#!/usr/bin/env python3
"""Find candidate cross-WG collaboration areas from the collected events.

Three signals, kept separate so each pair shows why it was flagged:

  co-mention   one item (forum topic, PR/issue, call, showcase entry, tutorial, WG session) names a second WG
               in its title, beyond the WG it was filed under. Roundup calls ("Workgroup Updates") are skipped.
  shared repo  a GitHub repo is the primary repo of one WG and listed under `also:` for another
               (config/working_groups.yml), weighted by that repo's recent activity.
  shared terms the same distinctive term (e.g. "fhir", "llm") shows up in the item titles of several WGs.
               Each term becomes a theme; WG pairs also get the terms they share.

Only titles and links are used (same data as the heatmap). Nothing from Teams is read.

Output: rmd/data/collab.json. Usage: python3 scripts/build_collab.py [--weeks 104] [--today YYYY-MM-DD]
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from itertools import combinations
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "collect"))
from common import match_wgs  # noqa: E402

EVENTS = ROOT / "data" / "events"
OUT = ROOT / "rmd" / "data" / "collab.json"

BUCKETS = {"community", "regional", "unassigned"}
# Types whose titles say something about the work. Comments and commits are left out of the text signals.
TEXT_TYPES = {"pr_opened", "pr_merged", "issue_opened", "release", "topic_created", "showcase_entry",
              "tutorial", "wg_session", "regional_session", "spotlight", "community_call"}
ROUNDUP = re.compile(r"work(ing)? ?group updates?|wg updates?", re.I)
RECENT_WEEKS = 26
MAX_EVIDENCE = 6
MAX_THEME_WGS = 6            # a term used by more WGs than this is generic, not a collaboration area
MIN_ITEMS_PER_WG = 2         # a WG needs this many items with the term for it to count
MIN_THEME_ITEMS = 6

STOP = set("""a about add added adding after all also an and any are as at be been before between both but by can
could do does done for from get got has have how in into is it its just like make may more most new not now of
on one only or other our out over per set should so some such than that the their them then there these they
this to up use used using via was we were what when where which while who why will with without would you your
fix fixes fixed update updates updated bump bumps release releases version versions support issue issues error
errors bug bugs test tests testing feature features option options allow allows enable fail fails failing work
works working need needs needed request pull merge branch main master readme docs doc documentation change
changes changed remove removed move moved rename renamed refactor clean cleanup improve improved improvement
example examples file files code run running build builds package packages module modules function functions
add-on initial commit comment comments question questions help please thanks thank hello hi how-to
ohdsi omop cdm data database databases table tables column columns query queries sql value values type types
name names list lists result results model models study studies analysis analyses tool tools using
call calls meeting meetings session sessions workgroup group groups wg symposium global tutorial showcase
project projects team update's version's v1 v2 v3 dev develop development github repo repository
""".split())


def tokens(text):
    out = []
    for w in re.findall(r"[a-z][a-z0-9\-]{2,}", text.lower()):
        w = w.strip("-")
        if w.endswith("s") and len(w) > 4 and not w.endswith("ss"):
            w = w[:-1]
        if w not in STOP and not w.isdigit():
            out.append(w)
    return out


def load_events(since):
    ev = []
    for p in sorted(EVENTS.glob("*.json")):
        ev += json.loads(p.read_text())
    return [e for e in ev if e["date"] >= since]


def repo_links(cfg):
    """repo -> primary WG, and (repo, other WG) pairs from `also:`."""
    primary, shared = {}, []
    for slug, w in {**{x["slug"]: x for x in cfg["working_groups"]}}.items():
        for tier in ("high", "medium", "low"):
            for r in (w.get("repos") or {}).get(tier) or []:
                primary[r] = slug
    for w in cfg["working_groups"]:
        for r in w.get("also") or []:
            if r in primary and primary[r] != w["slug"]:
                shared.append((r, primary[r], w["slug"]))
    return primary, shared


def pair_key(a, b):
    return tuple(sorted((a, b)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=104)
    ap.add_argument("--today", default=date.today().isoformat())
    args = ap.parse_args()
    today = date.fromisoformat(args.today)
    since = (today - timedelta(weeks=args.weeks)).isoformat()
    recent_since = (today - timedelta(weeks=RECENT_WEEKS)).isoformat()

    cfg = yaml.safe_load((ROOT / "config" / "working_groups.yml").read_text())
    names = {w["slug"]: w["name"] for w in cfg["working_groups"]}
    events = load_events(since)
    real = lambda s: s in names

    # ---- co-mentions -------------------------------------------------------------------------------------
    # An item counts once per (source, repo) for GitHub so one busy repo cannot make a pair look busy.
    co = defaultdict(dict)                       # pair -> unit key -> evidence
    for e in events:
        if e["type"] not in TEXT_TYPES or ROUNDUP.search(e["title"]):
            continue
        wgs = {w for w in match_wgs(e["title"]) if real(w)}
        if real(e["wg"]):
            wgs.add(e["wg"])
        if len(wgs) < 2:
            continue
        unit = ("github", e["repo"]) if e["source"] == "github" else (e.get("url") or e["title"])
        for a, b in combinations(sorted(wgs), 2):
            slot = co[(a, b)].setdefault(unit, {"s": e["source"], "t": e["type"], "title": e["title"], "url": e.get("url"),
                                                "date": e["date"], "n": 0})
            slot["n"] += 1
            if e["date"] > slot["date"]:
                slot.update(title=e["title"], url=e.get("url"), date=e["date"], t=e["type"])

    # ---- shared repos ------------------------------------------------------------------------------------
    repo_events = Counter(e["repo"] for e in events if e["source"] == "github" and e["date"] >= recent_since)
    shared = defaultdict(list)
    for repo, owner, other in repo_links(cfg)[1]:
        shared[pair_key(owner, other)].append({"repo": repo, "owner": owner, "events": repo_events.get(repo, 0),
                                               "url": f"https://github.com/OHDSI/{repo}"})

    # ---- themes ------------------------------------------------------------------------------------------
    tcfg = yaml.safe_load((ROOT / "config" / "collab_themes.yml").read_text())["themes"]
    rx = {k: re.compile(v["regex"], re.I) for k, v in tcfg.items()}
    th = defaultdict(lambda: defaultdict(dict))               # theme -> wg -> unit -> evidence
    for e in events:
        if e["type"] not in TEXT_TYPES or ROUNDUP.search(e["title"]):
            continue
        if e["type"] == "wg_session" and len(match_wgs(e["title"])) < 2:
            continue                                    # a WG's own session title only echoes its name
        unit = ("github", e["repo"]) if e["source"] == "github" else (e.get("url") or e["title"])
        for k, r in rx.items():
            if r.search(e["title"]):
                for wg in {w for w in (e["wg"], *tcfg[k].get("owners", [])) if real(w)}:
                    slot = th[k][wg].setdefault(unit, {"s": e["source"], "t": e["type"], "title": e["title"],
                                                       "url": e.get("url"), "date": e["date"], "wg": wg})
                    if e["date"] > slot["date"]:
                        slot.update(title=e["title"], url=e.get("url"), date=e["date"], t=e["type"])
    linked = {p for p, v in co.items() if len(v) >= 1}
    theme_rows, pair_themes = [], defaultdict(list)
    for k, by_wg in th.items():
        if len(by_wg) < 2 or sum(len(v) for v in by_wg.values()) < 4:
            continue
        wgs = sorted(by_wg)
        ev = []
        for w in wgs:
            ev += sorted(by_wg[w].values(), key=lambda i: i["date"], reverse=True)[:2]
        recent = {w: sum(1 for i in v.values() if i["date"] >= recent_since) for w, v in by_wg.items()}
        # A forum, call or conference item is worth two GitHub repos; a group needs a weight of 2 to count as active.
        weight = {w: sum(1 if i["s"] == "github" else 2 for i in v.values() if i["date"] >= recent_since)
                  for w, v in by_wg.items()}
        recent_wgs = sorted(w for w, n in weight.items() if n >= 2)
        unlinked = sorted(([a, b] for a, b in combinations(recent_wgs, 2) if (a, b) not in linked),
                          key=lambda p: -min(recent[p[0]], recent[p[1]]))[:10]
        seen, evidence = set(), []
        for i in sorted(ev, key=lambda i: i["date"], reverse=True):
            if i["title"] not in seen:
                seen.add(i["title"])
                evidence.append(i)
        evidence = evidence[:MAX_EVIDENCE]
        theme_rows.append({
            "id": k, "name": tcfg[k]["name"], "wgs": wgs, "recent_wgs": recent_wgs,
            "items": {w: len(v) for w, v in sorted(by_wg.items())},
            "recent": sum(recent.values()), "unlinked": unlinked,
            "touching": sorted(w for w, n in recent.items() if n and w not in recent_wgs),
            "evidence": evidence,
        })
        for a, b in combinations(wgs, 2):
            pair_themes[(a, b)].append((tcfg[k]["name"], min(len(by_wg[a]), len(by_wg[b]))))
    theme_rows = [t for t in theme_rows if len(t["recent_wgs"]) >= 2]
    theme_rows.sort(key=lambda t: (-len(t["recent_wgs"]), -t["recent"]))

    # ---- pairs -------------------------------------------------------------------------------------------
    pairs = []
    for pair in set(co) | set(shared) | set(pair_themes):
        units = sorted(co.get(pair, {}).values(), key=lambda i: i["date"], reverse=True)
        non_gh = [u for u in units if u["s"] != "github"]
        n_recent = sum(1 for u in units if u["date"] >= recent_since)
        repos = sorted(shared.get(pair, []), key=lambda r: -r["events"])
        themes_ = sorted(pair_themes.get(pair, []), key=lambda t: -t[1])
        signals = [s for s, present in (("named together", units), ("shared repo", repos), ("shared topic", themes_)) if present]
        # Explicit joint items from the forum, calls and conference count most; GitHub repos count once each.
        score = 3 * len(non_gh) + 1 * (len(units) - len(non_gh)) + 1.5 * sum(1 for r in repos if r["events"]) \
            + 0.5 * len(repos) + 0.5 * min(len(themes_), 4)
        if score < 3:
            continue
        pairs.append({
            "a": pair[0], "b": pair[1], "score": round(score, 1), "signals": signals,
            "co_items": len(units), "co_recent": n_recent,
            "sources": sorted({u["s"] for u in units}),
            "evidence": units[:MAX_EVIDENCE],
            "repos": repos[:5], "themes": [t for t, _ in themes_[:5]],
        })
    pairs.sort(key=lambda p: (-p["score"], -p["co_recent"]))

    used = {p["a"] for p in pairs} | {p["b"] for p in pairs} | {w for t in theme_rows for w in t["wgs"]}
    out = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_weeks": args.weeks, "recent_weeks": RECENT_WEEKS,
        "names": {s: n for s, n in names.items() if s in used},
        "pairs": pairs[:60],
        "themes": theme_rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out['pairs'])} pairs, {len(out['themes'])} themes")


if __name__ == "__main__":
    main()
