#!/usr/bin/env python3
"""Build the OKR overview data from config/okrs.yml.

Reads config/okrs.yml (hand-mined from the 2026 OKR community calls), config/working_groups.yml (names) and, when it
exists, rmd/data/activity.json (to show each group's recent activity next to its OKRs). Writes:

  rmd/data/okrs.json   one row per presenting group (objectives, key results, links to the call), the groups that have
                       no OKRs yet, and who plans to work with whom (both directions)

Usage: python3 scripts/build_okrs.py
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_items import CONFIG, ROOT, wg_config  # noqa: E402

OUT = ROOT / "rmd" / "data" / "okrs.json"
SITE = CONFIG / "site.yml"


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build():
    spec = yaml.safe_load((CONFIG / "okrs.yml").read_text())
    _, names, _ = wg_config()
    sessions = spec["meta"]["sessions"]
    act = {}
    ap = ROOT / "rmd" / "data" / "activity.json"
    if ap.exists():
        act = {w["slug"]: w for w in json.loads(ap.read_text()).get("wgs", [])}

    groups, seen = [], set()
    for e in spec["okrs"]:
        gid = e.get("slug") or slugify(e["name"])
        seen.add(e.get("slug"))
        s = sessions[e["session"]]
        objs = [{"objective": o["objective"], "krs": o.get("krs") or []} for o in e["objectives"]]
        a = act.get(e.get("slug")) or {}
        groups.append({
            "id": gid, "slug": e.get("slug"), "name": e["name"], "leads": e.get("leads") or [],
            "session": e["session"], "date": str(s["date"]), "video": s["video"], "slides": s["slides"],
            "source": e.get("source", "slides"), "meets": e.get("meets"),
            "objectives": objs, "kr_count": sum(len(o["krs"]) for o in objs),
            "notes": e.get("notes") or [], "with": e.get("with") or [], "with_me": [],
            "status": a.get("status"), "recent": a.get("recent"), "prior": a.get("prior"),
        })
    by_slug = {g["slug"]: g for g in groups if g["slug"]}
    for g in groups:                                        # reverse links: who named this group as a partner
        for t in g["with"]:
            if t in by_slug and g["slug"] and g["slug"] not in by_slug[t]["with_me"] and g["slug"] not in by_slug[t]["with"]:
                by_slug[t]["with_me"].append(g["slug"])
    missing = [{"slug": s, "name": n, "status": (act.get(s) or {}).get("status")} for s, n in names.items() if s not in seen]
    missing.sort(key=lambda x: x["name"].lower())
    site = yaml.safe_load(SITE.read_text()) if SITE.exists() else {}
    return {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "year": spec["meta"]["year"],
            "sessions": {k: {**v, "date": str(v["date"])} for k, v in sessions.items()},
            "groups": groups, "missing": missing, "names": names,
            "repo": (site or {}).get("repo") or "jshoughtaling/WGActivities"}


def main():
    d = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
    krs = sum(g["kr_count"] for g in d["groups"])
    print(f"okrs {len(d['groups'])} groups, {sum(len(g['objectives']) for g in d['groups'])} objectives, {krs} key results; "
          f"{len(d['missing'])} working groups without OKRs ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
