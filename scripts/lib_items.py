"""Shared model for the v2 builders: canonical items, projects, topics.

Collectors emit one event per (item, WG): a poster that names three groups is three events. For counting a WG's
activity that is right, but anything that compares items across groups (similar work, outputs, digests) needs each
item once. `canonical_items()` merges events with the same link into one item with a list of WGs.

Also here: the repo -> project map (config/projects.yml, plus a one-repo project for every other mapped repo),
curated topics (config/collab_themes.yml), and what counts as an output.
"""

import json
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import yaml

from item_rules import apply_rules

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "data" / "events"
CONFIG = ROOT / "config"

BUCKETS = {"community", "regional", "unassigned", "etl", "infrastructure", "chapters", "studies_and_apps", "legacy"}
NIGHTLY = re.compile(r"\bnightly\b|\bsnapshot\b", re.I)
# Item types that are a finished thing someone can use or cite, rather than work in progress.
OUTPUT_TYPES = {"release", "showcase_entry", "tutorial", "wg_session", "regional_session"}
# Types whose titles describe the work (commits and comments are too terse to compare).
TEXT_TYPES = {"pr_opened", "pr_merged", "issue_opened", "release", "topic_created", "showcase_entry",
              "tutorial", "wg_session", "regional_session", "spotlight", "community_call"}
TYPE_RANK = ["release", "pr_merged", "wg_session", "tutorial", "showcase_entry", "spotlight", "regional_session",
             "regional_event", "topic_created", "pr_opened", "issue_opened", "community_call", "reply", "comment",
             "commit"]


def iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_start(week):
    y, w = week.split("-W")
    return date.fromisocalendar(int(y), int(w), 1)


def window_weeks(today, n):
    monday = today - timedelta(days=today.weekday())
    return [iso_week(monday - timedelta(weeks=i)) for i in range(n - 1, -1, -1)]


def load_yaml(name):
    return yaml.safe_load((CONFIG / name).read_text())


def wg_config():
    cfg = load_yaml("working_groups.yml")
    names = {w["slug"]: w["name"] for w in cfg["working_groups"]}
    primary = {}
    for w in cfg["working_groups"]:
        repos = w.get("repos") or {}
        tiers = repos.items() if isinstance(repos, dict) else [("high", repos)]
        for _, lst in tiers:
            for r in lst or []:
                primary.setdefault(r, w["slug"])
    return cfg, names, primary


def load_events():
    out = []
    for p in sorted(EVENTS.glob("*.json")):
        out += json.loads(p.read_text())
    return apply_rules(out)          # config/item_rules.yml: an item can also count for a second group


def projects():
    """Return (projects dict id -> spec, repo -> project id). Unlisted mapped repos become one-repo projects."""
    _, _, primary = wg_config()
    spec = load_yaml("projects.yml")["projects"]
    repo_proj = {}
    for pid, p in spec.items():
        p.setdefault("contributing_wgs", [])
        p.setdefault("extends", [])
        p.setdefault("depends_on", [])
        p["id"], p["grouped"] = pid, True
        for r in p["repos"]:
            if r in repo_proj:
                raise SystemExit(f"projects.yml: repo {r} is in both {repo_proj[r]} and {pid}")
            repo_proj[r] = pid
    for repo, wg in primary.items():
        if repo in repo_proj:
            continue
        pid = repo.lower()
        while pid in spec:
            pid += "-repo"
        spec[pid] = {"id": pid, "name": repo, "lead_wg": wg, "contributing_wgs": [], "kind": "repo",
                     "repos": [repo], "extends": [], "depends_on": [], "description": "", "grouped": False}
        repo_proj[repo] = pid
    return spec, repo_proj


def topics():
    t = load_yaml("collab_themes.yml")["themes"]
    return {k: {"id": k, "name": v["name"], "rx": re.compile(v["regex"], re.I), "owners": v.get("owners", [])}
            for k, v in t.items()}


def is_output(e):
    return e["type"] in OUTPUT_TYPES and not (e["type"] == "release" and NIGHTLY.search(e["title"]))


def item_key(e):
    """Same link and same kind of event = same item (a PR opened and later merged stays two events)."""
    url = e.get("url") or ""
    return e["type"] + "|" + (url or (e["source"] + ":" + e["title"] + ":" + e["date"]))


def canonical_items(events=None, since=None):
    """Merge per-WG events into one item per link: {key, date, week, source, type, title, url, repo, wgs[], ...}."""
    events = load_events() if events is None else events
    _, repo_proj = projects()
    tps = topics()
    items = {}
    for e in events:
        if since and e["date"] < since:
            continue
        k = item_key(e)
        it = items.get(k)
        if it is None:
            it = items[k] = {"key": k, "date": e["date"], "week": e["week"], "s": e["source"], "t": e["type"],
                             "title": e["title"], "url": e.get("url"), "wgs": [], "repo": e.get("repo"),
                             "project": repo_proj.get(e.get("repo")) if e.get("repo") else None,
                             "output": is_output(e), "nightly": bool(e["type"] == "release" and NIGHTLY.search(e["title"])),
                             "event": e.get("event")}
            it["topics"] = [tid for tid, t in tps.items() if e["type"] in TEXT_TYPES and t["rx"].search(e["title"])]
        if e["wg"] not in it["wgs"]:
            it["wgs"].append(e["wg"])
    for it in items.values():
        real = [w for w in it["wgs"] if w not in BUCKETS]
        it["wgs"] = sorted(real) or sorted(it["wgs"])
    return list(items.values())


def rank(t):
    return TYPE_RANK.index(t) if t in TYPE_RANK else len(TYPE_RANK)


def short(it):
    """The compact item shape the site uses everywhere."""
    out = {"d": it["date"], "s": it["s"], "t": it["t"], "title": display_title(it), "url": it["url"], "wgs": it["wgs"]}
    if it.get("project"):
        out["p"] = it["project"]
    if it.get("repo"):
        out["r"] = it["repo"]
    return out


def display_title(it):
    """Releases are often just 'v1.2.0'; prefix the repo so they read on their own."""
    if it["t"] == "release" and it.get("repo") and it["repo"].lower() not in it["title"].lower():
        return f"{it['repo']} {re.sub(r'^Release ', '', it['title'])}"
    return it["title"]
