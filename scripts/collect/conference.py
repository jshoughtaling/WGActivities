#!/usr/bin/env python3
"""Collect OHDSI Global Symposium materials: Collaborator Showcase entries (posters, demos, lightning
talks), working group sessions and tutorials.

Pages come in two shapes: tables (2025, 2026) and "N - <a>Title</a> (authors)" lists under <h2> section
headings (2020-2024). One event is emitted per entry per matched working group. Entries with no WG
match are emitted once with wg="unassigned" so the totals stay honest. Author names are used for
WG matching only and are not stored.
"""

import json
import re
from datetime import date

import yaml

from common import ROOT, fetch, fetch_pdf_pages, match_wgs, strip_tags, week_of, write_events

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


EU_BASE = "https://www.ohdsi-europe.org"


def parse_euposters(ev):
    """Poster and abstract rows from ohdsi-europe.org. The page fills its table from
    /custom/data/symposium-<year>-posters.json: `rows` ([n, title, authors]) or `rows_html` (<tr> strings)."""
    raw = fetch(f"{EU_BASE}/custom/data/symposium-{ev['year']}-posters.json", max_age_days=30 if ev["year"] < date.today().year else 1)
    if raw is None:
        return
    data = json.loads(raw)
    for r in data.get("rows", []):
        yield {"title": r[1].strip(), "url": ev["url"] + "#acc-posters", "text": f"{r[1]} {r[2]}"}
    for html in data.get("rows_html", []):
        cells = CELL.findall(html)
        if len(cells) < 3 or not re.match(r"^\d+$", strip_tags(cells[0])):      # section header rows have one cell
            continue
        href = re.search(r'href="([^"]+)"', cells[1]) or re.search(r'(https?://[^&"]+)', cells[3] if len(cells) > 3 else "")
        url = href.group(1).replace("&amp;", "&") if href else ev["url"] + "#acc-posters"
        if not url.startswith("http"):
            url = f"{EU_BASE}/{url.lstrip('/')}"
        yield {"title": strip_tags(cells[1]), "url": url, "text": f"{strip_tags(cells[1])} {strip_tags(cells[2])}"}


# ---- agenda PDFs -------------------------------------------------------------------------------------------
# Agenda layouts differ by year, so these read the common shapes instead of one table format:
#   weekend agendas   "Title / presenters / Description:" blocks, and "- Name WG (lead)" lines for workgroup meetings
#   main-day agendas  numbered showcase talks, title wrapped over lines, the last line of each item being the presenter
TIME_LEAD = re.compile(r"^\s*\d{1,2}[:.]\d\d\s*(?:[–-]\s*\d{1,2}[:.]\d\d\s*)?")
SKIP_TITLE = re.compile(r"lunch|coffee|registration|break|target audience|drinks|social activity|networking|^description", re.I)
WG_LINE = re.compile(r"^\s*[-•]\s*(.+?\b(?:WG|work ?group)\b)", re.I)
QUOTED_WORKSHOP = re.compile(r"Workshop\s+[“\"](.+?)[”\"]")


def session_type(title):
    if re.search(r"work ?group|\bWG\b|deep dive", title, re.I) or [w for w in session_wgs(title) if w != "regional"]:
        return "wg_session"
    if re.search(r"national node", title, re.I):
        return "regional_session"
    return "tutorial" if re.search(r"workshop|tutorial|introduction|hands-on|hackathon|training", title, re.I) else "regional_session"


PRESENTER = re.compile(r"^(?=[A-Z])(?:.*[,(]|[A-Z][\w'’.-]+ [A-Z][\w'’.-]+$|[A-Z][\w'’.-]+ [A-Z]\w+ [A-Z][\w'’.-]+$)")
TIME_ONLY = re.compile(r"^[\d:.\s–-]+$")


def parse_weekend_agenda(pages):
    """Sessions from workshop and workgroup-meeting agenda pages.

    A session block reads "title (maybe wrapped) / presenters / Description". Walking up from "Description", the
    block starts after a blank line, a time-only line, a line ending a sentence (the previous column's text) or a
    line that starts with a time. Wrapped title lines are the non-presenter lines before the first presenter line.
    """
    seen = set()

    def emit(title):
        title = re.sub(r"\s+", " ", re.sub(r"\s*\(?\btutorial\)?\s*$", "", title, flags=re.I)).strip(" -–:")
        if (title and title.lower() not in seen and len(title) > 3 and not SKIP_TITLE.search(title)
                and title[0].isupper() and len(title) < 110
                and not re.match(r"^(saturday|sunday|agenda)\b|track\b|^in this timeslot|^workshop\s+[“\"]", title, re.I)):
            seen.add(title.lower())
            return {"title": title}

    for text in pages:
        lines = [l.rstrip() for l in text.splitlines()]
        for i, line in enumerate(lines):
            m = WG_LINE.match(line) or QUOTED_WORKSHOP.search(line)
            if m:
                e = emit("Workshop: " + m.group(1) if QUOTED_WORKSHOP.search(line) else m.group(1))
                if e:
                    yield e
                continue
            if not line.strip().lower().startswith("description"):
                continue
            j = i - 1
            while j >= 0 and not lines[j].strip() and i - j < 3:      # "title / blank / Description"
                j -= 1
            block = []
            while j >= 0 and len(block) < 8:
                l = lines[j].strip()
                if not l or TIME_ONLY.match(l) or (block and l.endswith((".", "?", "!"))):
                    break
                block.insert(0, l)
                if TIME_LEAD.match(l):
                    break
                j -= 1
            block = [b for b in (TIME_LEAD.sub("", l).strip() for l in block) if b]
            if not block:
                continue
            title, k = block[0], 1
            while k < len(block) and not PRESENTER.search(re.sub(r"^tutorial\s+", "", block[k])):
                title += " " + block[k]                                  # a wrapped title line
                k += 1
            e = emit(title)
            if e:
                yield e


def parse_mainday_agenda(pages):
    """Numbered showcase talks "1. Title (wrapped)" followed by a presenter line."""
    lines = [l for text in pages for l in text.splitlines()]
    start = [i for i, l in enumerate(lines) if re.match(r"^\s*\d\s*\.\s*\S", l)]
    for n, i in enumerate(start):
        end = start[n + 1] if n + 1 < len(start) else len(lines)
        item = []
        for l in lines[i:end]:
            if re.match(r"^\s*(Theatre|\d{1,2}:\d\d)", l) or re.search(r"Collaborator Showcase|Moderated by", l):
                break
            item.append(l.strip())
        if len(item) >= 2:
            title = re.sub(r"\s+", " ", re.sub(r"^\d\s*\.\s*", "", " ".join(item[:-1]))).strip()
            if len(title) > 10:
                yield {"title": title}


def parse_agenda_pdfs(ev):
    for pdf in ev.get("agenda_pdfs", []):
        pages = fetch_pdf_pages(pdf["url"])
        if pdf.get("pages"):
            pages = [pages[i - 1] for i in pdf["pages"] if 0 < i <= len(pages)]
        parser = parse_mainday_agenda if pdf.get("kind") == "mainday" else parse_weekend_agenda
        for e in parser(pages):
            yield {"title": e["title"], "url": pdf["url"], "type": "showcase_entry" if pdf.get("kind") == "mainday" else session_type(e["title"])}


def collect_regional(cfg):
    events = []
    for ev in cfg.get("regional_events", []):
        age = 30 if ev["year"] < date.today().year else 1
        html = fetch(ev["url"], max_age_days=age) if re.search(r"ohdsi(-europe)?\.org", ev["url"]) else None
        home = ev.get("wg") or "regional"
        base = {"date": ev["date"].isoformat(), "week": week_of(ev["date"]), "source": "conference",
                "event": ev["name"], "region": ev["region"], "weight": 1}
        found = []
        for kind in ev.get("parse", []):
            if kind == "euposters":
                found += [dict(e, type="showcase_entry") for e in parse_euposters(ev)]
                continue
            if kind == "agenda_pdfs":
                found += list(parse_agenda_pdfs(ev))
                continue
            if kind == "listed":
                # typed in where the PDF text cannot be read reliably; wins over a parsed title that starts the same way
                norm = lambda t: re.sub(r"\W+", "", t.lower().replace("thematic deep dive", ""))
                mine = [norm(x["title"]) for x in ev.get("sessions", [])]
                found = [f for f in found if f["type"] == "showcase_entry" or not any(
                    len(norm(f["title"])) >= 6 and (m.startswith(norm(f["title"])) or norm(f["title"]).startswith(m)) for m in mine)]
                found += [dict(title=x["title"], url=ev["url"], type=x["type"], wgs=x.get("wg")) for x in ev.get("sessions", [])]
                continue
            if html is None:
                break
            if kind == "list":
                found += [dict(title=e["title"], url=e["url"], type="showcase_entry", text=e["title"] + " " + e["authors"])
                          for e in parse_list(html)]
            elif kind == "rows":
                rows_html = fetch(ev["rows_url"], max_age_days=age) if ev.get("rows_url") else html
                found += [dict(e, type="showcase_entry") for e in parse_rows(rows_html, ev.get("rows_url") or ev["url"])]
            elif kind == "links":
                found += [dict(e, type="showcase_entry") for e in parse_links(html, ev["url"])]
            elif kind == "agenda":
                found += [dict(e, type="regional_session") for e in parse_agenda(html, ev["url"])]
            elif kind == "sessions":
                found += [dict(e, type="tutorial" if e["tutorial"] else "regional_session") for e in parse_sessions(html, ev["url"])]
        seen, unique = set(), []
        for e in found:                      # the same title can come from two sources for one event
            if e["title"].lower() not in seen:
                seen.add(e["title"].lower())
                unique.append(e)
        found = unique
        print(ev["name"], len(found), "entries")
        if not found:                       # no item list: keep the event itself visible, linked to its page
            found = [dict(title=ev["name"], url=ev["url"], type="regional_event")]
        for e in found:
            for wg in e.get("wgs") or match_wgs(e.get("text") or e["title"]) or [home]:
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
