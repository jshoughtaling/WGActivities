"""Checks for scripts/build_health.py. Run: python3 scripts/test_build_health.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_health import meetings_row, source_rows  # noqa: E402

TODAY = "2026-11-18"
COV = {"github": ["2025-11-01", "2026-11-10"], "forums": ["2025-11-01", "2026-10-01"], "calls": ["2022-01-11", "2026-11-03"],
       "conference": ["2020-06-01", "2026-05-01"], "teams": ["2025-11-03", "2026-03-02"]}


def main():
    by = {r["key"]: r for r in source_rows(COV, {}, TODAY)}
    assert by["github"]["status"] == "ok" and by["calls"]["status"] == "ok" and by["conference"]["status"] == "ok"
    assert by["forums"]["status"] == "stale" and by["teams"]["status"] == "stale", by      # 48 days > 14; 261 days > 60
    by = {r["key"]: r for r in source_rows(COV, {"github": {"outcome": "failure"}, "conference": {"outcome": "failure"}}, TODAY)}
    assert by["github"]["status"] == "failed" and by["conference"]["status"] == "failed"
    assert by["teams"]["manual"] and by["teams"]["outcome"] is None
    assert source_rows({}, {}, TODAY)[0]["status"] == "missing"

    cal = {"events": [{"kind": "meeting", "date": "2026-11-19"}]}
    mt = {"source_updated": "2026-11-15", "fetched": "x", "meetings": [{"name": "A", "wg": "a"}, {"name": "B", "wg": None}]}
    m = meetings_row(mt, {}, TODAY, cal)
    assert m["status"] == "ok" and m["unmapped"] == ["B"] and m["upcoming"] == 1, m
    assert meetings_row(dict(mt, source_updated="2026-10-01"), {}, TODAY, cal)["status"] == "stale"
    assert meetings_row(mt, {"meetings": {"outcome": "failure"}}, TODAY, cal)["status"] == "failed"
    assert meetings_row(mt, {}, TODAY, {"events": []})["status"] == "stale"
    assert meetings_row(None, {}, TODAY, None)["status"] == "missing"
    print("ok: build_health")


if __name__ == "__main__":
    main()
