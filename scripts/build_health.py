#!/usr/bin/env python3
"""Build rmd/data/health.json: is each source current, did its collector run, is the config sound?

Run after build_activity.py and build_views.py. Reads rmd/data/{activity,projects,calendar}.json, data/meetings.json,
data/collector_status.json (written by scripts/record_status.py in the workflow) and runs validate_config.check().
The About page ("Data health") and the calendar's out-of-date notice read it. On GitHub Actions the same summary is
appended to the run's job summary, so a quiet failure still shows up where you look after a refresh.

Usage: python3 scripts/build_health.py [--today YYYY-MM-DD]
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_items import ROOT  # noqa: E402
from validate_config import check  # noqa: E402

OUT = ROOT / "rmd" / "data"
# key: (label, how it is collected, days without a new item before it counts as stale; None = do not judge by item date)
SOURCES = {
    "github": ("GitHub", "automatic", 14),
    "forums": ("Forums", "automatic", 14),
    "calls": ("Community calls", "automatic", 21),
    "conference": ("Conference materials", "automatic", None),   # seasonal: judged by whether the collector ran
    "teams": ("MS Teams counts", "manual", 60),
}
MEETINGS_STALE_DAYS = 10      # ohdsi.org's page is hand-edited and lists about four weeks ahead


def days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def source_rows(coverage, status, today):
    rows = []
    for key, (label, how, limit) in SOURCES.items():
        last = (coverage.get(key) or [None, None])[1]
        st = status.get(key) or {}
        age = days(last, today) if last else None
        problems = []
        if how == "automatic" and st.get("outcome") not in (None, "success"):
            problems.append(f"the last collector run {st['outcome']}")
        if last is None:
            state = "missing"
            problems.append("no items collected")
        elif limit is not None and age > limit:
            state = "stale"
            problems.append(f"newest item is {age} days old (expected within {limit})")
        else:
            state = "ok"
        if state == "ok" and problems:
            state = "failed"
        rows.append({"key": key, "label": label, "manual": how == "manual", "last_item": last, "age_days": age,
                     "outcome": st.get("outcome"), "last_success": st.get("last_success"), "status": state, "problems": problems})
    return rows


def meetings_row(mt, status, today, cal):
    if not mt:
        return {"status": "missing", "problems": ["no data/meetings.json"], "unmapped": []}
    updated = mt.get("source_updated")
    age = days(updated, today) if updated else None
    st = status.get("meetings") or {}
    problems = []
    state = "ok"
    if st.get("outcome") not in (None, "success"):
        state = "failed"
        problems.append(f"the last collector run {st['outcome']}; showing the previous meetings")
    if age is None:
        state = "stale" if state == "ok" else state
        problems.append("the ohdsi.org page has no 'last updated' date")
    elif age > MEETINGS_STALE_DAYS:
        state = "stale" if state == "ok" else state
        problems.append(f"ohdsi.org's page was last updated {age} days ago")
    upcoming = [e for e in (cal or {}).get("events", []) if e["kind"] == "meeting" and e["date"] >= today]
    if not upcoming:
        state = "stale" if state == "ok" else state
        problems.append("no working-group meetings listed from today on")
    return {"status": state, "source_updated": updated, "age_days": age, "fetched": mt.get("fetched"),
            "last_success": st.get("last_success"), "outcome": st.get("outcome"), "meetings": len(mt.get("meetings", [])),
            "upcoming": len(upcoming), "unmapped": sorted({m["name"] for m in mt.get("meetings", []) if not m.get("wg")}),
            "problems": problems}


def build(today, root=ROOT):
    def load(p):
        return json.loads(p.read_text()) if p.exists() else None
    act = load(root / "rmd" / "data" / "activity.json") or {}
    proj = load(root / "rmd" / "data" / "projects.json") or {}
    cal = load(root / "rmd" / "data" / "calendar.json")
    status = load(root / "data" / "collector_status.json") or {}
    errors, warnings = check(root)
    sources = source_rows(act.get("coverage") or {}, status, today)
    meetings = meetings_row(load(root / "data" / "meetings.json"), status, today, cal)
    grouped = [p for p in proj.get("projects", []) if p.get("grouped")]
    problems = [f"{s['label']}: {x}" for s in sources for x in s["problems"]] + [f"Meetings: {x}" for x in meetings["problems"]]
    problems += [f"Config error: {m}" for _, m in errors]
    overall = "fail" if errors else "warn" if problems else "ok"
    return {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "today": today, "data_generated": act.get("generated"),
            "overall": overall, "problems": problems, "sources": sources, "meetings": meetings,
            "config": {"errors": [m for _, m in errors], "warnings": [m for _, m in warnings]},
            "projects": {"multi_repo": len(grouped), "reviewed": sum(1 for p in grouped if p.get("reviewed"))}}


def markdown(h):
    ico = {"ok": "✅", "stale": "⚠️", "failed": "❌", "missing": "❌"}
    out = [f"### Data health: {h['overall']}", "", "| Source | Status | Newest item | Last collector run |", "|---|---|---|---|"]
    for s in h["sources"]:
        out.append(f"| {s['label']} | {ico[s['status']]} {s['status']} | {s['last_item'] or '–'} | {s['outcome'] or ('manual' if s['manual'] else 'not recorded')} |")
    m = h["meetings"]
    out.append(f"| Meetings (ohdsi.org) | {ico[m['status']]} {m['status']} | page updated {m.get('source_updated') or '–'} | {m.get('outcome') or 'not recorded'} |")
    for p in h["problems"]:
        out.append(f"- {p}")
    for w in h["config"]["warnings"]:
        out.append(f"- Config notice: {w}")
    p = h["projects"]
    out.append(f"\nProject groupings confirmed by maintainers: {p['reviewed']} of {p['multi_repo']}.")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=date.today().isoformat())
    a = ap.parse_args()
    h = build(a.today)
    (OUT / "health.json").write_text(json.dumps(h, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote rmd/data/health.json: {h['overall']}; {len(h['problems'])} problem(s), {len(h['config']['warnings'])} config notice(s)")
    for p in h["problems"]:
        print("  -", p)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(markdown(h))


if __name__ == "__main__":
    main()
