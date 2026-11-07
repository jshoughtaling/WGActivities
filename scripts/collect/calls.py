#!/usr/bin/env python3
"""Collect OHDSI weekly community calls from ohdsi.org/community-calls-<year>/.

Each call is an accordion entry titled "Mon. D: Title (speakers)". One event is emitted per call per
matched working group; calls that match no WG are emitted once with wg="community".
"""

import re
from datetime import date

from common import fetch, match_wgs, strip_tags, week_of, write_events

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
TITLE = re.compile(r'<a class="elementor-accordion-title"[^>]*>(.*?)</a>', re.S)
HEAD = re.compile(r"^([A-Za-z]+)\.?\s+(\d{1,2})\s*[:\-–]?\s*(.*)$")
FIRST_YEAR = 2022   # the 2021 page 404s
URL = "https://www.ohdsi.org/community-calls-{year}/"


def parse_year(year, html):
    """Yield one dict per call on a year's page."""
    matches = list(TITLE.finditer(html))
    for i, m in enumerate(matches):
        h = HEAD.match(strip_tags(m.group(1)))
        if not h or h.group(1)[:3].lower() not in MONTHS:
            continue
        body = html[m.end(): matches[i + 1].start() if i + 1 < len(matches) else len(html)]
        yield {
            "date": date(year, MONTHS[h.group(1)[:3].lower()], int(h.group(2))),
            "title": h.group(3).strip(),
            "videos": sorted(set(re.findall(r"youtube\.com/embed/([\w-]{11})", body))),
            "slides": len(set(re.findall(r'href="([^"]+\.pdf)"', body, re.I))),
        }


def collect(first_year=FIRST_YEAR, last_year=None):
    last_year = last_year or date.today().year
    events = []
    for year in range(first_year, last_year + 1):
        url = URL.format(year=year)
        html = fetch(url, max_age_days=1 if year == last_year else 30)
        if html is None:
            print(f"{year}: page not found, skipped")
            continue
        calls = list(parse_year(year, html))
        print(f"{year}: {len(calls)} calls")
        for c in calls:
            wgs = match_wgs(c["title"]) or ["community"]
            for wg in wgs:
                events.append({
                    "date": c["date"].isoformat(),
                    "week": week_of(c["date"]),
                    "wg": wg,
                    "source": "calls",
                    "type": "spotlight" if re.search(r"spotlight", c["title"], re.I) else "community_call",
                    "title": c["title"],
                    "url": url,
                    "video_ids": c["videos"],
                    "slide_count": c["slides"],
                    "weight": 1,
                })
    return events


if __name__ == "__main__":
    ev = collect()
    write_events("calls", ev)
    print(len(ev), "events written")
