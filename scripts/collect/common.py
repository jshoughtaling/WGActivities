"""Shared helpers for the collectors: polite cached fetching, ISO weeks, WG alias matching."""

import hashlib
import re
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
CACHE = ROOT / "data" / "cache"
EVENTS = ROOT / "data" / "events"
UA = "wg-activities-collector (https://github.com/jshoughtaling/WGActivities)"


def fetch(url, max_age_days=1, delay=0.5):
    """GET url as text, cached on disk for max_age_days. Returns None on a 404."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")
    if path.exists() and time.time() - path.stat().st_mtime < max_age_days * 86400:
        return path.read_text()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    path.write_text(text)
    time.sleep(delay)
    return text


def fetch_pdf_pages(url, max_age_days=30, delay=0.5):
    """Text of each page of a PDF (needs pypdf), cached on disk. Returns [] if pypdf is missing or the PDF is a 404.

    Page text comes out in reading order per column block, so callers should match on phrases, not layout.
    """
    try:
        import pypdf
    except ImportError:
        print("   pypdf not installed; skipping", url)
        return []
    pdf_dir = CACHE / "pdf"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    path = pdf_dir / (hashlib.sha1(url.encode()).hexdigest() + ".pdf")
    if not (path.exists() and time.time() - path.stat().st_mtime < max_age_days * 86400):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
                path.write_bytes(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            raise
        time.sleep(delay)
    return [(p.extract_text() or "") for p in pypdf.PdfReader(str(path)).pages]


def iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_of(d):
    return iso_week(d if isinstance(d, date) else date.fromisoformat(d))


def strip_tags(s):
    import html

    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


_aliases = None


def match_wgs(text):
    """Return the WG slugs whose alias regex matches text (sorted, possibly empty)."""
    global _aliases
    if _aliases is None:
        cfg = yaml.safe_load((ROOT / "config" / "wg_aliases.yml").read_text())
        _aliases = {slug: re.compile(rx, re.I) for slug, rx in cfg["aliases"].items()}
    return sorted(slug for slug, rx in _aliases.items() if rx.search(text))


def write_events(name, events):
    EVENTS.mkdir(parents=True, exist_ok=True)
    events.sort(key=lambda e: (e["date"], e["wg"], e["title"]))
    import json

    (EVENTS / f"{name}.json").write_text(json.dumps(events, indent=1, ensure_ascii=False) + "\n")
