#!/usr/bin/env python3
"""Record whether each collector step succeeded, in data/collector_status.json.

The collectors run with continue-on-error so one broken source cannot stop a refresh; this keeps that failure from
being invisible. build_health.py reads the file and the site's About page shows it.

Usage: python3 scripts/record_status.py github=success forums=failure meetings=skipped ...
(`outcome` values are GitHub Actions step outcomes: success, failure, cancelled, skipped.) `last_success` only moves
forward when the outcome is success.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "collector_status.json"


def main(argv):
    status = json.loads(PATH.read_text()) if PATH.exists() else {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for arg in argv:
        key, _, outcome = arg.partition("=")
        if not key or not outcome:
            raise SystemExit(f"expected source=outcome, got {arg!r}")
        row = status.setdefault(key, {})
        row.update(outcome=outcome, last_run=now)
        if outcome == "success":
            row["last_success"] = now
    PATH.write_text(json.dumps(status, indent=1, sort_keys=True) + "\n")
    print("recorded:", ", ".join(argv))


if __name__ == "__main__":
    main(sys.argv[1:])
