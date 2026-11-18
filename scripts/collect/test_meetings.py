"""Checks for the meetings parser on the quirks seen on ohdsi.org/upcoming-working-group-calls/ (2026-11).

Run: python3 scripts/collect/test_meetings.py
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meetings import parse  # noqa: E402

PAGE = """<div><p><em>Last updated November 15, 2026</em></p>
<p><strong>GIS WG:</strong> Thursday, Nov. 19 at 10am ET (<a href="https://teams.microsoft.com/l/meetup-join/x">Meeting Link</a>)<br>
Meetings are traditionally scheduled for every Thursday at 10am ET.</p>
<p><strong>OMOP CDM Oncology – Vocabulary/Development Subgroup:</strong> Thursday, Nov. 19 at 9am ET (<a href="https://teams.microsoft.com/x">Meeting Link</a>) CANCELLED</p>
<p><strong>Africa Chapter:</strong> Thursday, Nov. 19 at 9am ET (5pm EAT) <a href="https://www.google.com/url?q=https://us02web.zoom.us/j/1">ZOOM</a></p>
<p><strong>Women of OHDSI (WoO) WG:</strong> Wednesday, Nov. 25 at 10am ET (<a href="https://teams.microsoft.com/x">Meeting Link</a></p>
<p><strong>China Chapter WG:</strong> Friday, Dex. 11 at 11pm ET (<a href="https://global.gotomeeting.com/join/1">Meeting Link</a>)</p>
<p><strong>Atlas/WebAPI WG:</strong> Thursday, Jan. 7 at 10:30am ET (<a href="https://teams.microsoft.com/x">Meeting Link</a>)</p>
<p><strong>Registry WG:</strong> No longer meeting</p>
<p><strong>Health Equity WG:</strong> TBD</p></div>"""


def main():
    d = parse(PAGE, date(2026, 11, 17))
    by = {m["name"]: m for m in d["meetings"]}
    assert d["source_updated"] == "2026-11-15"
    assert len(d["meetings"]) == 6, len(d["meetings"])
    gis = by["GIS WG"]
    assert (gis["wg"], gis["date"], gis["time_et"], gis["platform"]) == ("gis", "2026-11-19", "10am", "teams"), gis
    assert gis["start"] == "2026-11-19T10:00:00-05:00" and gis["cadence"].startswith("Meetings are traditionally")
    assert by["OMOP CDM Oncology – Vocabulary/Development Subgroup"]["cancelled"] is True
    assert by["Africa Chapter"]["platform"] == "zoom" and by["Africa Chapter"]["wg"] == "africa"
    assert by["Africa Chapter"]["note"] == "5pm EAT"
    assert by["Women of OHDSI (WoO) WG"]["wg"] == "women-of-ohdsi"
    assert by["China Chapter WG"]["date"] == "2026-12-11" and by["China Chapter WG"]["platform"] == "gotomeeting"
    assert by["Atlas/WebAPI WG"]["date"] == "2027-01-07" and by["Atlas/WebAPI WG"]["time_et"] == "10:30am"
    st = {s["name"]: s for s in d["status"]}
    assert st["Registry WG"]["state"] == "no longer meeting" and st["Registry WG"]["wg"] is None
    assert st["Health Equity WG"]["state"] == "tbd"
    assert not any("teams.microsoft" in str(v) for m in d["meetings"] for v in m.values()), "join links must not be stored"
    print("ok: meetings parser")


if __name__ == "__main__":
    main()
