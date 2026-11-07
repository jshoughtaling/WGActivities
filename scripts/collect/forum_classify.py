#!/usr/bin/env python3
"""Assign a forums.ohdsi.org topic to one working group (or bucket) using config/forum_mapping.yml."""

import re
from pathlib import Path

import yaml

CONFIG = Path(__file__).resolve().parent.parent.parent / "config" / "forum_mapping.yml"
NOISY_TAG_COUNT = 4


def load_rules(path=CONFIG):
    cfg = yaml.safe_load(path.read_text())
    cfg["title_rules"] = [(r["to"], re.compile(r["match"], re.I)) for r in cfg["title_rules"]]
    return cfg


def classify(topic, cfg):
    """Return (slug, how) for a Discourse topic dict, where how is 'title', 'tag', 'category' or None."""
    title = topic.get("title", "")
    for slug, rx in cfg["title_rules"]:
        if rx.search(title):
            return slug, "title"
    tags = topic.get("tags") or []
    tags = [t["name"] if isinstance(t, dict) else t for t in tags]
    if 0 < len(tags) < NOISY_TAG_COUNT:
        for tag, slug in cfg["tag_rules"].items():
            if tag in tags:
                return slug, "tag"
    slug = cfg["category_rules"].get(topic.get("category_id"))
    if slug:
        return slug, "category"
    return None, None


if __name__ == "__main__":
    import collections
    import json
    import sys

    cfg = load_rules()
    topics = json.load(open(sys.argv[1]))
    since = sys.argv[2] if len(sys.argv) > 2 else ""
    topics = [t for t in topics if t["created_at"] >= since]
    by = collections.Counter()
    how = collections.Counter()
    for t in topics:
        slug, h = classify(t, cfg)
        by[slug] += 1
        how[h] += 1
        if "-v" in sys.argv:
            print(f"{slug or '-':22} {h or '-':8} {t['title'][:80]}")
    print(len(topics), "topics")
    for k, v in by.most_common():
        print(f"{v:4} {k}")
    print(dict(how))
