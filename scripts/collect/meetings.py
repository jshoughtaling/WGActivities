#!/usr/bin/env python3
"""Collect upcoming working-group meetings from ohdsi.org/upcoming-working-group-calls/.

The page lists, for roughly the next four weeks, one line per meeting ("GIS WG: Thursday, Nov. 19 at 10am ET
(Meeting Link)") followed by a cadence sentence ("Meetings are traditionally scheduled for every Thursday at 10am
ET"), and a few groups without dates ("Health Equity WG: TBD", "... no longer meeting"). The page is edited by hand,
so the parser is lenient: month typos, missing brackets and stray words are expected.

Join links are NOT stored: the calendar links to the ohdsi.org page instead (see PLAN.md, v2 calendar), and only
the meeting platform (teams, zoom, gotomeeting) is kept.

Output: data/meetings.json. Usage: python3 scripts/collect/meetings.py [--file saved.html]
"""

import argparse
import difflib
import html as htmllib
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, fetch, match_wgs  # noqa: E402

URL = "https://www.ohdsi.org/upcoming-working-group-calls/"
OUT = ROOT / "data" / "meetings.json"
ET = ZoneInfo("America/New_York")
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
DAYS = "mon|tue|wed|thu|fri|sat|sun"

ENTRY = re.compile(
    r"^(?P<name>[^:\n]{3,100}?)\s*[:–—-]\s*"
    rf"(?P<wd>(?:{DAYS})[a-z]*)\.?,?\s+"
    r"(?P<mon>[A-Za-z]{3,9})\.?\s*(?P<day>\d{1,2})(?:st|nd|rd|th)?,?\s+"
    r"(?:at\s+)?(?P<time>\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|noon))"
    r"(?P<rest>.*)$", re.I)
STATUS = re.compile(r"^(?P<name>[^:\n]{3,100}?)\s*:\s*(?P<state>TBD|on hiatus|hiatus|no longer meeting)\b", re.I)
CADENCE = re.compile(r"(meetings? (?:are|is) (?:traditionally |usually |typically )?(?:scheduled|held)|meets? (?:every|on the))", re.I)
UPDATED = re.compile(r"last updated[:\s]+([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})", re.I)
LINK = re.compile(r'<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>', re.I | re.S)

# Names on the page that the WG alias regexes do not catch. Chapters and regional calls go to the "regional" bucket.
NAME_MAP = [
    (r"africa", "africa"),
    (r"chapter|european community call|india community call|latin america|apac|korea|japan|china", "regional"),
    (r"healthcare systems|health systems", "health-systems"),
    (r"generative ai|\bgaia\b", "gaia-genai"),
    (r"animal health", "animal-health"),
    (r"early.stage", "early-stage-researchers"),
    (r"women of ohdsi|\bwoo\b", "women-of-ohdsi"),
    (r"surgery", "surgery-perioperative"),
    (r"respiratory", "respiratory"),
    (r"openehr", "openehr-omop"),
    (r"cdm survey", "cdm-survey"),
    (r"eye ?care", "eye-care-vision"),
    (r"transplant", "transplant"),
    (r"industry", "industry"),
    (r"open.source community", "open-source-community"),
    (r"vocabulary subgroup|cdm wg.{0,3}vocabulary", "cdm-vocabulary"),
    (r"oncology", "oncology"),
    (r"health economics", "health-economics"),
]


def text_lines(page):
    """HTML -> lines of text. Links become 'text [[href]]' so the platform can be read; block tags become newlines."""
    page = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page)
    page = LINK.sub(lambda m: f"{m.group(2)} [[{m.group(1)}]]", page)
    page = re.sub(r"(?i)<br\s*/?>|</(p|li|div|h[1-6]|tr|td)>|<(p|li|h[1-6])\b[^>]*>", "\n", page)
    page = htmllib.unescape(re.sub(r"<[^>]+>", " ", page)).replace("\xa0", " ")
    return [re.sub(r"\s+", " ", ln).strip() for ln in page.split("\n") if ln.strip()]


def month_of(word):
    w = word[:3].lower()
    if w in MONTHS:
        return MONTHS.index(w) + 1
    near = difflib.get_close_matches(w, MONTHS, n=1, cutoff=0.6)     # "Dex" -> dec
    return MONTHS.index(near[0]) + 1 if near else None


def time_of(s):
    s = s.lower().replace(".", "").replace(" ", "")
    if s == "noon":
        return 12, 0
    m = re.match(r"(\d{1,2})(?::(\d{2}))?(am|pm)", s)
    if not m:
        return None
    h, mi = int(m.group(1)) % 12, int(m.group(2) or 0)
    return (h + 12 if m.group(3) == "pm" else h), mi


def platform_of(text):
    t = text.lower()
    for key, name in (("teams.microsoft", "teams"), ("teams.live", "teams"), ("urldefense", "teams"), ("zoom.us", "zoom"),
                      ("gotomeeting", "gotomeeting"), ("goto.com", "gotomeeting"), ("meet.google", "google meet")):
        if key in t:
            return name
    return "teams" if "meeting link" in t else None


def wg_of(name, wg_names):
    n = name.lower()
    for rx, slug in NAME_MAP:
        if re.search(rx, n):
            return slug
    for slug, full in wg_names.items():
        short = re.sub(r"\s*\(.*?\)", "", full).lower()
        bare = re.sub(r"\s+(wg|work ?group|working group)$", "", n).strip()
        if short and (re.search(r"\b" + re.escape(short) + r"\b", n) or bare == short):
            return slug
    hits = match_wgs(name)
    return hits[0] if len(hits) == 1 else None


def parse(page, today=None):
    today = today or date.today()
    lines = text_lines(page)
    updated = None
    for ln in lines:
        m = UPDATED.search(ln)
        if m and month_of(m.group(1)):
            updated = date(int(m.group(3)), month_of(m.group(1)), int(m.group(2)))
            break
    base = updated or today
    cfg = yaml.safe_load((ROOT / "config" / "working_groups.yml").read_text())
    wg_names = {w["slug"]: w["name"] for w in cfg["working_groups"]}
    meetings, status, last = [], [], None
    for i, ln in enumerate(lines):
        clean = re.sub(r"\[\[[^\]]*\]\]", "", ln).strip()
        m = ENTRY.match(clean)
        if m:
            mon, tm = month_of(m.group("mon")), time_of(m.group("time"))
            if not mon or not tm:
                continue
            day = int(m.group("day"))
            try:
                d = date(base.year, mon, day)
            except ValueError:
                continue
            if d < base - timedelta(days=60):          # the page has no year: January listed in December
                d = date(base.year + 1, mon, day)
            start = datetime(d.year, d.month, d.day, tm[0], tm[1], tzinfo=ET)
            name = re.sub(r"^\W+|\s+$", "", m.group("name"))
            rest = m.group("rest")
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if ENTRY.match(re.sub(r"\[\[[^\]]*\]\]", "", nxt).strip()) or STATUS.match(nxt):
                nxt = ""                                 # the next line is another meeting, not a continuation
            last = {
                "name": name, "wg": wg_of(name, wg_names), "date": d.isoformat(),
                "start": start.isoformat(), "time_et": f"{start.hour % 12 or 12}{':%02d' % start.minute if start.minute else ''}{'pm' if start.hour >= 12 else 'am'}",
                "note": re.sub(r"\s+", " ", re.sub(r"^\s*(ET|EST|EDT)\b|\(?\s*meeting( link)?\s*\)?|\(|\)|zoom|cancell?ed", " ", rest, flags=re.I)).strip(" ,;-") or None,
                "platform": platform_of(ln) or platform_of(nxt),
                "cancelled": bool(re.search(r"cancel", ln + " " + nxt, re.I)),
                "cadence": None,
            }
            if last["note"] and len(last["note"]) > 60:
                last["note"] = None
            meetings.append(last)
            continue
        s = STATUS.match(clean)
        if s:
            name = s.group("name").strip()
            status.append({"name": name, "wg": wg_of(name, wg_names), "state": s.group("state").lower().replace("hiatus", "on hiatus").replace("on on", "on")})
            last = None
            continue
        if last and CADENCE.search(clean) and not last["cadence"]:
            last["cadence"] = re.sub(r"\s+", " ", clean)[:200]
    # A group's cadence is often written only once; copy it to its other listed meetings.
    by_name = {}
    for mt in meetings:
        if mt["cadence"]:
            by_name.setdefault(mt["name"].lower(), mt["cadence"])
    for mt in meetings:
        mt["cadence"] = mt["cadence"] or by_name.get(mt["name"].lower())
    meetings.sort(key=lambda x: x["start"])
    return {"source": URL, "source_updated": updated.isoformat() if updated else None,
            "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "meetings": meetings, "status": status}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="parse a saved copy of the page instead of fetching it")
    ap.add_argument("--today", type=date.fromisoformat, default=date.today())
    a = ap.parse_args()
    page = Path(a.file).read_text() if a.file else fetch(URL, max_age_days=0.5)
    if not page:
        raise SystemExit(f"could not fetch {URL}")
    data = parse(page, a.today)
    if not data["meetings"]:
        raise SystemExit("no meetings parsed; the page layout may have changed (data/meetings.json left as is)")
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    unmapped = sorted({m["name"] for m in data["meetings"] if not m["wg"]})
    print(f"wrote {OUT.relative_to(ROOT)}: {len(data['meetings'])} meetings, {len(data['status'])} without dates; "
          f"page updated {data['source_updated']}; unmapped: {', '.join(unmapped) or 'none'}")


if __name__ == "__main__":
    main()
