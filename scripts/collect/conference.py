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


# ---- regional events ---------------------------------------------------------------------------------------

GENERIC_LINK = re.compile(r"^(slides?|recording|video|videos|poster|posters|agenda|booklet|photos?|full session|homepage|"
                          r"home|click|link|download|register|read more|abstract|pdf|here)\b", re.I)


def page_content(html):
    """The page body, without the site header and footer."""
    i = html.find('data-elementor-type="wp-page"')
    j = html.find('data-elementor-type="footer"', i)
    return html[i:j] if i >= 0 and j > i else html


def parse_rows(html, page):
    """Table rows "N | Title | Authors [| link]". The title's own link is used when it has one."""
    for row in ROW.findall(html):
        cells = CELL.findall(row)
        if len(cells) < 3 or not re.match(r"^\d+\.?$", strip_tags(cells[0])):
            continue
        title = re.sub(r"^\d+\.\s*", "", strip_tags(cells[1]))
        href = re.search(r'href="(https?://[^"]+)"', row)
        if len(title) > 15:
            yield {"title": title, "url": href.group(1) if href else page}


def parse_links(html, page):
    """Links to posters, slides and talks whose link text is the title. Generic text ("Slides") is skipped."""
    seen = set()
    for m in re.finditer(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', page_content(html), re.S):
        url, title = m.group(1).replace("&#038;", "&").replace("&amp;", "&"), strip_tags(m.group(2))
        if not re.search(r"wp-content/uploads|sharepoint|onedrive|drive\.google|1drv", url):
            continue
        if len(title) < 12 or GENERIC_LINK.match(title) or re.search(r"\.(png|jpe?g)$", url, re.I) or title.lower() in seen:
            continue
        seen.add(title.lower())
        yield {"title": title, "url": url}


SKIP_AGENDA = re.compile(r"reception|registration|lunch|break|opening|closing|welcome|keynote|dinner|networking|photo", re.I)


def parse_agenda(html, page):
    """Agenda rows "time | program | speaker". Section rows and breaks are skipped."""
    for row in ROW.findall(html):
        cells = [strip_tags(c) for c in CELL.findall(row)]
        if len(cells) >= 2 and re.match(r"^\d{1,2}:\d\d", cells[0]) and len(cells[1]) > 18 and not SKIP_AGENDA.search(cells[1]):
            yield {"title": cells[1], "url": page}


def parse_sessions(html, page):
    """h4 headings such as "Session 2: Title" and "Tutorial session 1: Title"."""
    for m in re.finditer(r"<h4[^>]*>(.*?)</h4>", page_content(html), re.S):
        t = strip_tags(m.group(1))
        mm = re.match(r"^(Tutorial session|Session)\s*\d+\s*:\s*(.{8,})$", t, re.I)
        if mm and not re.search(r"opening|closing|remarks", mm.group(2), re.I):
            yield {"title": mm.group(2).strip(), "url": page, "tutorial": mm.group(1).lower().startswith("tutorial")}


def collect_regional(cfg):
    events = []
    for ev in cfg.get("regional_events", []):
        age = 30 if ev["year"] < date.today().year else 1
        html = fetch(ev["url"], max_age_days=age) if "ohdsi.org" in ev["url"] else None
        home = ev.get("wg") or "regional"
        base = {"date": ev["date"].isoformat(), "week": week_of(ev["date"]), "source": "conference",
                "event": ev["name"], "region": ev["region"], "weight": 1}
        found = []
        for kind in ev.get("parse", []):
            if html is None:
                break
            if kind == "list":
                found += [dict(title=e["title"], url=e["url"], type="showcase_entry", text=e["title"] + " " + e["authors"])
                          for e in parse_list(html)]
            elif kind == "rows":
                found += [dict(e, type="showcase_entry") for e in parse_rows(html, ev["url"])]
            elif kind == "links":
                found += [dict(e, type="showcase_entry") for e in parse_links(html, ev["url"])]
            elif kind == "agenda":
                found += [dict(e, type="regional_session") for e in parse_agenda(html, ev["url"])]
            elif kind == "sessions":
                found += [dict(e, type="tutorial" if e["tutorial"] else "regional_session") for e in parse_sessions(html, ev["url"])]
        print(ev["name"], len(found), "entries")
        if not found:                       # no item list: keep the event itself visible, linked to its page
            found = [dict(title=ev["name"], url=ev["url"], type="regional_event")]
        for e in found:
            for wg in match_wgs(e.get("text") or e["title"]) or [home]:
                events.append({**base, "wg": wg, "type": e["type"], "title": e["title"], "url": e["url"]})
    return events


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
    return events + collect_regional(cfg)


if __name__ == "__main__":
    ev = collect()
    write_events("conference", ev)
    print(len(ev), "events written")
