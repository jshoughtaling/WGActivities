#!/usr/bin/env python3
"""Collect GitHub activity for the repos mapped to working groups in config/working_groups.yml.

Per repo, in the window: commits (non-bot), PRs opened and merged (non-bot), issues opened (non-bot),
issue/PR comments (non-bot) and releases. Only `repos:` entries are counted; `also:` repos and the
non_wg buckets are not.

Incremental: data/github_state.json records when each repo was last fetched, and later runs
re-fetch from a week before that. Events are deduplicated by id. The first run needs roughly 1,500
requests, so it wants a personal token (5,000/hour); the Action's GITHUB_TOKEN has a lower limit.

Usage: python3 scripts/collect/github.py [--weeks 56] [--repo NAME ...]
Token: GITHUB_TOKEN or GH_TOKEN, else `gh auth token`.
"""

import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

import yaml

from common import EVENTS, ROOT, week_of, write_events

ORG = "OHDSI"
STATE = EVENTS.parent / "github_state.json"
LINK_NEXT = re.compile(r'<([^>]+)>;\s*rel="next"')


def token():
    t = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if t:
        return t
    try:
        return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


TOKEN = token()


def get(url):
    """One GET with retry on rate limits. Returns (json, next_url)."""
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "wg-activities"})
        if TOKEN:
            req.add_header("Authorization", f"Bearer {TOKEN}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                m = LINK_NEXT.search(r.headers.get("Link", ""))
                return json.load(r), (m.group(1) if m else None)
        except urllib.error.HTTPError as e:
            if e.code in (404, 409, 451):          # missing, empty repo, blocked
                return [], None
            if e.code in (403, 429):
                reset = e.headers.get("X-RateLimit-Reset")
                wait = max(int(reset) - time.time(), 5) if reset and e.headers.get("X-RateLimit-Remaining") == "0" else 30 * (attempt + 1)
                print(f"rate limited, sleeping {int(wait)}s")
                time.sleep(min(wait + 1, 3700))
                continue
            if e.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    raise RuntimeError(f"giving up on {url}")


def pages(url, stop=None):
    """Iterate items across pages; stop(item) -> True ends iteration (for newest-first lists)."""
    while url:
        data, url = get(url)
        for item in data:
            if stop and stop(item):
                return
            yield item


def api(repo, path, **params):
    q = urllib.parse.urlencode({"per_page": 100, **params})
    return f"https://api.github.com/repos/{ORG}/{repo}/{path}?{q}"


def is_bot(user):
    return not user or user.get("type") == "Bot" or user.get("login", "").endswith("[bot]")


def day(ts):
    return ts[:10]


def fetch_repo(repo, since, pushed_since):
    """Return events for one repo from `since` (ISO date) on."""
    ev = []

    def add(kind, key, ts, title, url):
        if ts and day(ts) >= since:
            ev.append({"id": f"{repo}:{kind}:{key}", "date": day(ts), "source": "github", "type": kind,
                       "title": title[:140], "url": url, "repo": repo, "weight": 1})

    for pr in pages(api(repo, "pulls", state="all", sort="updated", direction="desc"),
                    stop=lambda p: day(p["updated_at"]) < since):
        if is_bot(pr["user"]):
            continue
        add("pr_opened", pr["number"], pr["created_at"], pr["title"], pr["html_url"])
        add("pr_merged", pr["number"], pr.get("merged_at"), pr["title"], pr["html_url"])
    for it in pages(api(repo, "issues", state="all", since=since + "T00:00:00Z", sort="updated", direction="desc")):
        if "pull_request" in it or is_bot(it["user"]):
            continue
        add("issue_opened", it["number"], it["created_at"], it["title"], it["html_url"])
    for c in pages(api(repo, "issues/comments", since=since + "T00:00:00Z")):
        if is_bot(c["user"]):
            continue
        n = c["issue_url"].rsplit("/", 1)[-1]
        add("comment", c["id"], c["created_at"], f"Comment on #{n}", c["html_url"])
    if pushed_since:
        for c in pages(api(repo, "commits", since=since + "T00:00:00Z")):
            if is_bot(c.get("author")):
                continue
            add("commit", c["sha"][:10], c["commit"]["author"]["date"], c["commit"]["message"].split("\n")[0], c["html_url"])
        for rel in pages(api(repo, "releases"), stop=lambda r: day(r.get("published_at") or r["created_at"]) < since):
            add("release", rel["id"], rel.get("published_at"), rel.get("name") or rel["tag_name"], rel["html_url"])
    return ev


def mapped_repos():
    """repo name -> (wg slug, confidence) for every `repos:` entry of a working group."""
    cfg = yaml.safe_load((ROOT / "config" / "working_groups.yml").read_text())
    out = {}
    for w in cfg["working_groups"]:
        for conf, names in (w.get("repos") or {}).items():
            for n in names:
                out[n] = (w["slug"], conf)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=56)
    ap.add_argument("--repo", nargs="*", help="only these repos (for testing)")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    window_since = (date.today() - timedelta(weeks=args.weeks)).isoformat()
    mapping = mapped_repos()
    org = {r["name"]: r for r in pages(f"https://api.github.com/orgs/{ORG}/repos?per_page=100&type=public")}
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    existing = {}
    path = EVENTS / "github.json"
    if path.exists():
        existing = {e["id"]: e for e in json.loads(path.read_text())}

    todo = [r for r in mapping if r in org and (not args.repo or r in args.repo)]
    missing = [r for r in mapping if r not in org]
    if missing:
        print("mapped but not in org (renamed or private?):", missing)
    started = datetime.now(timezone.utc).date().isoformat()

    def work(repo):
        # Re-fetch from a week before the last run so late edits and comments are picked up.
        since = window_since
        if repo in state:
            since = max(window_since, (date.fromisoformat(state[repo]) - timedelta(days=7)).isoformat())
        meta = org[repo]
        # Issues and comments can change without a push, so those are always fetched; commits and
        # releases only if the repo was pushed to since then.
        pushed = (meta.get("pushed_at") or "")[:10] >= since
        if meta.get("archived") and not pushed:
            return repo, []
        return repo, fetch_repo(repo, since, pushed)

    n_new = 0
    with ThreadPoolExecutor(args.workers) as pool:
        for i, (repo, events) in enumerate(pool.map(work, todo), 1):
            wg, conf = mapping[repo]
            for e in events:
                e.update(wg=wg, confidence=conf, week=week_of(e["date"]))
                n_new += e["id"] not in existing
                existing[e["id"]] = e
            state[repo] = started
            if i % 25 == 0 or i == len(todo):
                print(f"{i}/{len(todo)} repos, {len(existing)} events")
    cutoff = window_since
    kept = [e for e in existing.values() if e["date"] >= cutoff and e["repo"] in mapping]
    write_events("github", kept)
    STATE.write_text(json.dumps(state, indent=1, sort_keys=True) + "\n")
    print(f"{len(kept)} events kept ({n_new} new)")


if __name__ == "__main__":
    main()
