#!/usr/bin/env python3
"""Cross-tagging: add an item to a second working group because of its title (config/item_rules.yml).

`apply_rules(events)` returns the events plus one copy per extra group, marked `"via": "rule"`. It never changes or removes
an event, and it runs on every load of data/events (build_activity, build_collab, lib_items), not in the collectors, so
rules take effect on already-collected data. Copies get id "<id>@<group>" and keep the same url, so anything that merges by
link (lib_items.canonical_items) still sees one item.

Usage: python3 scripts/item_rules.py     lists what each rule tags
"""
import json
import re
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def load_rules(root=ROOT):
    p = Path(root) / "config" / "item_rules.yml"
    rules = (yaml.safe_load(p.read_text()) or {}).get("rules") or [] if p.exists() else []
    out = []
    for r in rules:
        out.append({"name": r.get("name") or r["to"], "to": r["to"], "rx": re.compile(r["match"], re.I),
                    "repos": set(r.get("repos") or []), "sources": set(r.get("sources") or []), "skip": set(r.get("skip_wgs") or [])})
    return out


def apply_rules(events, rules=None):
    rules = load_rules() if rules is None else rules
    if not rules:
        return events
    extra, have = [], {(e.get("url") or e["id"], e["type"], e["wg"]) for e in events}
    for e in events:
        for r in rules:
            if e["wg"] == r["to"] or e["wg"] in r["skip"] or (r["repos"] and e.get("repo") not in r["repos"]) \
                    or (r["sources"] and e["source"] not in r["sources"]) or not r["rx"].search(e["title"]):
                continue
            key = (e.get("url") or e["id"], e["type"], r["to"])
            if key in have:
                continue                         # already filed under the target group (by a collector or an earlier rule)
            have.add(key)
            extra.append(dict(e, wg=r["to"], id=f"{e['id']}@{r['to']}", via="rule", confidence="rule", rule=r["name"], from_wg=e["wg"]))
    return events + extra


def main():
    ev = []
    for p in sorted((ROOT / "data" / "events").glob("*.json")):
        ev += json.loads(p.read_text())
    out = [e for e in apply_rules(ev) if e.get("via") == "rule"]
    print(f"{len(out)} events added by {len(load_rules())} rule(s)")
    for rule, n in Counter(e["rule"] for e in out).items():
        print(f"\n{rule}: {n} events")
    seen = set()
    for e in sorted(out, key=lambda e: e["date"], reverse=True):
        k = (e["repo"], e["title"])
        if k not in seen:
            seen.add(k)
            print(f"  {e['date']}  {e['repo']:<18} {e['type']:<13} -> {e['wg']:<4} (was {e['from_wg']})  {e['title'][:70]}")


if __name__ == "__main__":
    main()
