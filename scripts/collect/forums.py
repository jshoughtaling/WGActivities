#!/usr/bin/env python3
"""Collect forums.ohdsi.org (Discourse) activity: new topics and replies, per working group.

Posts come from /posts.json (newest first, paged with `before`). Topic tags are not in that feed, so
topics active in the window are read from /latest.json?order=activity to get tags and categories;
topics missing from it are classified on title and category alone. Each topic is assigned to one WG
or bucket by scripts/collect/forum_classify.py (config/forum_mapping.yml).

Events: topic_created (post_number 1) and reply, weight 1 each. Usernames and post text are not kept.

Usage: python3 scripts/collect/forums.py [--weeks 56]
"""

import argparse
import json
import time
import urllib.request
from datetime import date, timedelta

from common import UA, week_of, write_events
from forum_classify import classify, load_rules

BASE = "https://forums.ohdsi.org"


def get_json(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                time.sleep(0.4)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(20 * (attempt + 1))
                continue
            raise
    raise RuntimeError(f"giving up on {path}")


def active_topics(since):
    """topic id -> {title, tags, category_id} for topics bumped since `since`."""
    topics, page = {}, 0
    while True:
        data = get_json(f"/latest.json?order=activity&ascending=false&page={page}")
        batch = data["topic_list"]["topics"]
        if not batch:
            break
        for t in batch:
            topics[t["id"]] = {"title": t["title"], "tags": t.get("tags") or [], "category_id": t["category_id"]}
        if max(t["bumped_at"] for t in batch)[:10] < since:   # pinned topics sit first, so test the newest
            break
        page += 1
    return topics


def posts(since):
    """Yield posts newest first until older than `since`."""
    before = None
    while True:
        data = get_json("/posts.json" + (f"?before={before}" if before else ""))
        batch = data["latest_posts"]
        if not batch:
            return
        for p in batch:
            if p["created_at"][:10] < since:
                return
            yield p
        before = min(p["id"] for p in batch)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=56)
    args = ap.parse_args()
    since = (date.today() - timedelta(weeks=args.weeks)).isoformat()

    cfg = load_rules()
    meta = active_topics(since)
    print(len(meta), "topics active since", since)
    events, n_posts = [], 0
    for p in posts(since):
        n_posts += 1
        if p.get("post_type") not in (None, 1):      # skip whispers and system posts
            continue
        topic = dict(meta.get(p["topic_id"]) or {"title": p["topic_title"], "tags": [], "category_id": p["category_id"]})
        wg, _ = classify(topic, cfg)
        d = p["created_at"][:10]
        events.append({
            "id": f"post:{p['id']}", "date": d, "week": week_of(d), "wg": wg or "unassigned",
            "source": "forums", "type": "topic_created" if p["post_number"] == 1 else "reply",
            "title": topic["title"][:140], "url": f"{BASE}/t/{p['topic_slug']}/{p['topic_id']}/{p['post_number']}",
            "weight": 1,
        })
    write_events("forums", events)
    print(f"{n_posts} posts read, {len(events)} events written")


if __name__ == "__main__":
    main()
