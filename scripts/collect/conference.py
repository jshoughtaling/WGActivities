#!/usr/bin/env python3
"""Collect OHDSI Global Symposium materials: Collaborator Showcase entries (posters, demos, lightning
talks), working group sessions and tutorials.

Pages come in two shapes: tables (2025, 2026) and "N - <a>Title</a> (authors)" lists under <h2> section
headings (2020-2024). One event is emitted per entry per matched working group. Entries with no WG
match are emitted once with wg="unassigned" so the totals stay honest. Author names are used for
WG matching only and are not stored.
"""

import re
from datetime import date

import yaml

from common import ROOT, fetch, match_wgs, strip_tags, week_of, write_events

ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
ANCHOR = re.compile(r'<a [^>]*href="([^"]*showcase-\d+[^"]*)"[^>]*>(.*?)</a>(.*?)(?=<br\s*/?>|</p>|<a |</td>|</li>)', re.S)
SECTION = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S)


def parse_table(html):
    """Rows of # | Title (linked) | Authors [| Link]."""
    for row in ROW.findall(html):
        cells = CELL.findall(row)
        href = re.search(r'href="([^"]*showcase-\d+[^"]*)"', row)
        if len(cells) < 3 or not href:
            continue
        yield {"title": strip_tags(cells[1]), "authors": strip_tags(cells[2]),
               "url": href.group(1), "section": None}


def parse_list(html):
    """Anchors to showcase-N pages, with authors in the text right after the link."""
    heads = [(m.start(), strip_tags(m.group(1))) for m in SECTION.finditer(html)]
    seen = set()
    for m in ANCHOR.finditer(html):
        url = m.group(1).rstrip("/")
        title = strip_tags(m.group(2))
        if url in seen or not title:
            continue
        seen.add(url)
        section = next((t for pos, t in reversed(heads) if pos < m.start()), None)
        yield {"title": title, "authors": strip_tags(m.group(3)), "url": m.group(1), "section": section}


SECTION_H2 = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S)
PARA = re.compile(r"<p[^>]*>(.*?)</p>", re.S)
TIME = re.compile(r"(\d{1,2}(?::\d\d)?\s*[ap]m)\s*[-–]\s*(\d{1,2}(?::\d\d)?\s*[ap]m)", re.I)
ENTRY_HEAD = re.compile(r"^([^:]{3,110}?)\s*:\s*(.*)$", re.S)
SESSION_WORDS = re.compile(r"hackathon|workshop|connectathon|joint session|chapter|work ?group", re.I)
CHAPTER = re.compile(r"chapter|latin america|asia.pacific|europe|japan|korea|india|china|africa", re.I)
NOT_TUTORIAL = re.compile(r"session|^lead\b|faculty|materials|tutorials?$|^\d{4} |^\d+\.", re.I)


def session_wgs(name):
    """WG slugs for a symposium workgroup session heading. Chapters are not WGs (Africa has one)."""
    wgs = match_wgs(name + " WG")
    if re.search(r"africa", name, re.I) and "africa" not in wgs:
        wgs.append("africa")
    if not wgs and CHAPTER.search(name):
        wgs = ["regional"]
    return wgs


def parse_workgroups(html):
    """Yield {name, desc, time, part} for each session on a symposium workgroups page."""
    heads = [(m.start(), strip_tags(m.group(1))) for m in SECTION_H2.finditer(html)]
    start = next((pos for pos, t in heads if re.search(r"morning", t, re.I)), None)
    if start is None:
        return
    for m in PARA.finditer(html, start):
        text = strip_tags(m.group(1))
        h = ENTRY_HEAD.match(text)
        if not h:
            continue
        name, desc = h.group(1).strip(), h.group(2).strip()
        t = TIME.search(text)
        if not (t or SESSION_WORDS.search(name)):
            continue
        part = next((x for pos, x in reversed(heads) if pos < m.start() and re.search(r"morning|afternoon", x, re.I)), "")
        yield {"name": name, "desc": desc, "time": t.group(0) if t else None, "part": part.split()[0].lower() if part else None}


def parse_tutorials(html):
    """Yield tutorial titles: h2 headings that are not session labels, 'Lead:' lines or faculty names."""
    i = html.find("Morning")
    in_faculty = False          # 2025 lists faculty names as h2s after each title: skip the short ones
    for m in SECTION_H2.finditer(html, max(i - 400, 0)):
        t = strip_tags(m.group(1))
        if re.match(r"(lead|other faculty)", t, re.I):
            in_faculty = True
        elif in_faculty and len(t) < 28:
            continue
        elif len(t) >= 12 and not NOT_TUTORIAL.search(t):
            in_faculty = False
            yield t


def collect():
    cfg = yaml.safe_load((ROOT / "config" / "conferences.yml").read_text())
    events = []
    for sym in cfg["global_symposia"]:
        age = 30 if sym["year"] < date.today().year else 1
        base = {"date": sym["date"].isoformat(), "week": week_of(sym["date"]), "source": "conference",
                "event": f"Global Symposium {sym['year']}", "weight": 1}

        html = fetch(sym["showcase"], max_age_days=age)
        if html is None:
            print(sym["year"], "showcase not found, skipped")
        else:
            entries = list(parse_table(html)) or list(parse_list(html))
            print(sym["year"], len(entries), "showcase entries")
            for e in entries:
                for wg in match_wgs(e["title"] + " " + e["authors"]) or ["unassigned"]:
                    events.append({**base, "wg": wg, "type": "showcase_entry", "title": e["title"],
                                   "url": e["url"], "section": e["section"]})

        if sym.get("workgroups"):
            html = fetch(sym["workgroups"], max_age_days=age)
            sessions = list(parse_workgroups(html)) if html else []
            print(sym["year"], len(sessions), "workgroup sessions")
            seen = set()
            for s in sessions:
                if s["name"] in seen:       # a session can be listed under both morning and afternoon
                    continue
                seen.add(s["name"])
                wgs = session_wgs(s["name"])
                if not wgs:
                    print("   no WG matched for session:", s["name"])
                for wg in wgs or ["unassigned"]:
                    events.append({**base, "wg": wg, "type": "wg_session", "title": s["name"] + (f" ({s['time']})" if s["time"] else ""),
                                   "url": sym["workgroups"], "section": s["part"]})

        if sym.get("tutorials"):
            html = fetch(sym["tutorials"], max_age_days=age)
            titles = list(parse_tutorials(html)) if html else []
            print(sym["year"], len(titles), "tutorials")
            for t in titles:
                for wg in match_wgs(t) or ["community"]:   # general tutorials belong to no single WG
                    events.append({**base, "wg": wg, "type": "tutorial", "title": t, "url": sym["tutorials"], "section": None})
    return events


if __name__ == "__main__":
    ev = collect()
    write_events("conference", ev)
    print(len(ev), "events written")
