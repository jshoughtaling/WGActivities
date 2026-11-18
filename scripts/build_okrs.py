#!/usr/bin/env python3
"""Build the OKR overview data from config/okrs*.yml (one file per year).

Reads config/okrs.yml (2026) and config/okrs_<year>.yml, hand-mined from the OKR community calls and the working groups'
slide decks, plus config/working_groups.yml (names) and, when it exists, rmd/data/activity.json (to show each group's
recent activity next to its latest OKRs). Writes:

  rmd/data/okrs.json   one row per group and year (objectives, key results, links to the call or deck), for each year the
                       working groups that have no OKRs yet, and who plans to work with whom (both directions, same year)

Usage: python3 scripts/build_okrs.py
"""

import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_items import CONFIG, ROOT, wg_config  # noqa: E402

OUT = ROOT / "rmd" / "data" / "okrs.json"
SITE = CONFIG / "site.yml"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def when(d):
    """'Feb 17' for a day, 'Mar 2026' for a month ('YYYY-MM' or a date with only year and month)."""
    d = str(d)
    y, m, *day = d.split("-")
    return f"{MONTHS[int(m) - 1]} {int(day[0])}" if day else f"{MONTHS[int(m) - 1]} {y}"


def okr_files():
    return sorted(CONFIG.glob("okrs*.yml"))


def build():
    _, names, _ = wg_config()
    act = {}
    ap = ROOT / "rmd" / "data" / "activity.json"
    if ap.exists():
        act = {w["slug"]: w for w in json.loads(ap.read_text()).get("wgs", [])}
    sessions, groups, years = {}, [], {}
    for f in okr_files():
        spec = yaml.safe_load(f.read_text())
        year = spec["meta"]["year"]
        for k, v in spec["meta"]["sessions"].items():
            if k in sessions:
                raise SystemExit(f"{f.name}: session key {k} is already used in another okrs file")
            sessions[k] = {"year": year, "label": v.get("label") or when(v["date"]), "date": str(v["date"]),
                           "video": v.get("video"), "slides": v["slides"]}
        for e in spec["okrs"]:
            s = sessions[e["session"]]
            gid = e.get("slug") or slugify(e["name"])
            objs = [{"objective": o["objective"], "krs": o.get("krs") or []} for o in e["objectives"]]
            groups.append({
                "id": gid, "year": year, "slug": e.get("slug"), "name": e["name"], "leads": e.get("leads") or [],
                "session": e["session"], "date": str(e.get("date") or s["date"]), "when": when(e.get("date") or s["date"]),
                "video": s["video"], "slides": e.get("slides") or s["slides"], "source": e.get("source", "slides"),
                "meets": e.get("meets"), "objectives": objs, "kr_count": sum(len(o["krs"]) for o in objs),
                "notes": e.get("notes") or [], "with": e.get("with") or [], "with_me": [],
                "status": None, "recent": None, "prior": None,
            })
        years[year] = f.name
    latest = max(years)
    for g in groups:                                          # activity is today's, so show it beside the latest OKRs only
        a = act.get(g["slug"]) if g["year"] == latest else None
        if a:
            g.update(status=a.get("status"), recent=a.get("recent"), prior=a.get("prior"))
    for y in years:
        by_slug = {g["slug"]: g for g in groups if g["year"] == y and g["slug"]}
        for g in by_slug.values():                            # reverse links: who named this group as a partner
            for t in g["with"]:
                if t in by_slug and g["slug"] not in by_slug[t]["with_me"] and g["slug"] not in by_slug[t]["with"]:
                    by_slug[t]["with_me"].append(g["slug"])
    missing = {}
    for y in years:
        seen = {g["slug"] for g in groups if g["year"] == y}
        missing[str(y)] = sorted(({"slug": s, "name": n, "status": (act.get(s) or {}).get("status")} for s, n in names.items() if s not in seen),
                                 key=lambda x: x["name"].lower())
    site = yaml.safe_load(SITE.read_text()) if SITE.exists() else {}
    groups.sort(key=lambda g: (-g["year"], g["name"].lower()))
    return {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "years": sorted(years, reverse=True),
            "sessions": sessions, "groups": groups, "missing": missing, "names": names,
            "repo": (site or {}).get("repo") or "jshoughtaling/WGActivities"}


def main():
    d = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
    for y in d["years"]:
        gs = [g for g in d["groups"] if g["year"] == y]
        print(f"okrs {y}: {len(gs)} groups, {sum(len(g['objectives']) for g in gs)} objectives, {sum(g['kr_count'] for g in gs)} key results; "
              f"{len(d['missing'][str(y)])} working groups without OKRs")
    print(f"  okrs.json {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
