#!/usr/bin/env python3
"""Check the hand-edited config for mistakes that would otherwise show up as silent gaps on the site.

Errors (exit 1) are things that are broken: a slug that matches no working group, a project that extends a project that
does not exist, a regex that does not compile, a repo claimed by two projects.
Warnings (exit 0, or exit 1 with --strict) are things that work but probably are not what was meant: a project whose
repos are never collected, a meeting name that maps to no group.

Checks
  working_groups.yml  duplicate slugs, missing names, a repo listed as the primary repo of two groups
  projects.yml        lead/contributing groups exist, kind is known, repos are listed once, extends resolve,
                      `reviewed` looks like "YYYY-MM-DD" or "YYYY-MM-DD by <who>", repos are collected
  wg_aliases.yml, forum_mapping.yml, collab_themes.yml   slugs exist, regexes compile
  item_rules.yml      target and skip groups exist, regex compiles, named repos are collected
  data/meetings.json  every mapped group exists; names that map to no group are listed

Usage: python3 scripts/validate_config.py [--strict] [--root DIR]
On GitHub Actions, findings are also written as ::error:: and ::warning:: annotations.
"""

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_items import BUCKETS, ROOT  # noqa: E402

KINDS = {"platform", "package", "app", "library", "spec", "deployment", "study", "docs", "repo"}   # WGA.KINDS in wga-common.js
REVIEWED = re.compile(r"^(\d{4}-\d{2}-\d{2})(\s+(by\s+)?\S.*)?$")


def _yaml(root, name):
    p = Path(root) / "config" / name
    return yaml.safe_load(p.read_text()) if p.exists() else None


def _rx(errors, where, pattern):
    try:
        re.compile(pattern, re.I)
    except re.error as e:
        errors.append(("bad-regex", f"{where}: regex does not compile ({e}): {pattern}"))


def check(root=ROOT):
    """Return (errors, warnings), each a list of (code, message)."""
    errors, warnings = [], []
    wgs = (_yaml(root, "working_groups.yml") or {})
    wg_list = wgs.get("working_groups") or []
    slugs = {}
    primary, collected = {}, set()
    for w in wg_list:
        s = w.get("slug")
        if not s:
            errors.append(("wg-slug", f"working_groups.yml: an entry has no slug ({w.get('name')})"))
            continue
        if s in slugs:
            errors.append(("wg-duplicate", f"working_groups.yml: slug {s} appears twice"))
        slugs[s] = w.get("name")
        if not w.get("name"):
            errors.append(("wg-name", f"working_groups.yml: {s} has no name"))
        repos = w.get("repos") or {}
        for tier in (repos.values() if isinstance(repos, dict) else [repos]):
            for r in tier or []:
                collected.add(r)
                if r in primary and primary[r] != s:
                    warnings.append(("repo-two-groups", f"working_groups.yml: repo {r} is listed under both {primary[r]} and {s} "
                                                        f"(counted for {primary[r]} only; use `also:` for the second group)"))
                primary.setdefault(r, s)
    known = set(slugs) | BUCKETS
    not_collected = {}                      # repo -> where it is mentioned instead
    for w in wg_list:
        for r in w.get("also") or []:
            not_collected.setdefault(r, "an `also:` list (not collected)")
    for bucket, v in (wgs.get("non_wg") or {}).items():
        for r in (v or {}).get("repos") or []:
            not_collected.setdefault(r, f"non_wg.{bucket} (not collected)")

    # ---- projects
    spec = (_yaml(root, "projects.yml") or {}).get("projects") or {}
    derived = {r.lower() for r in primary}
    repo_owner = {}
    for pid, p in spec.items():
        where = f"projects.yml: {pid}"
        for field in ("name", "lead_wg", "kind", "repos"):
            if not p.get(field):
                errors.append(("project-field", f"{where}: missing {field}"))
        if p.get("lead_wg") and p["lead_wg"] not in known:
            errors.append(("project-lead", f"{where}: lead_wg {p['lead_wg']} is not a working group or bucket"))
        for g in p.get("contributing_wgs") or []:
            if g not in known:
                errors.append(("project-contrib", f"{where}: contributing group {g} is not a working group or bucket"))
        if p.get("kind") and p["kind"] not in KINDS:
            errors.append(("project-kind", f"{where}: kind {p['kind']} is not one of {', '.join(sorted(KINDS))}"))
        rv = p.get("reviewed")
        if rv is not None:
            m = REVIEWED.match(str(rv))
            ok = bool(m)
            if m:
                try:
                    date.fromisoformat(m.group(1))
                except ValueError:
                    ok = False
            if not ok:
                errors.append(("project-reviewed", f"{where}: reviewed should be \"YYYY-MM-DD by <who>\", got {rv!r}"))
        for r in p.get("repos") or []:
            if r in repo_owner:
                errors.append(("repo-two-projects", f"{where}: repo {r} is also in project {repo_owner[r]}"))
            repo_owner[r] = pid
        miss = [r for r in p.get("repos") or [] if r not in collected]
        if miss:
            why = "; ".join(f"{r} is in {not_collected.get(r, 'no working group')}" for r in miss[:3]) + (f"; +{len(miss) - 3} more" if len(miss) > 3 else "")
            total = len(p.get("repos") or [])
            if len(miss) == total:
                what = "no repo is collected, so it will always show no activity"
            else:
                what = "%d of %d repos are not collected, so their activity is missing" % (len(miss), total)
            warnings.append(("project-not-collected", f"{where}: {what} ({why})"))
    for pid, p in spec.items():
        for x in p.get("extends") or []:
            if x not in spec and x not in derived:
                errors.append(("project-extends", f"projects.yml: {pid} extends {x}, which is not a project or a collected repo"))
    for r, pid in repo_owner.items():
        if r in primary and spec[pid].get("lead_wg") not in (primary[r], *(spec[pid].get("contributing_wgs") or [])) \
                and spec[pid].get("lead_wg") in slugs:
            warnings.append(("project-owner", f"projects.yml: {pid} (lead {spec[pid]['lead_wg']}) includes {r}, which working_groups.yml gives to {primary[r]}; "
                                              f"add {primary[r]} to contributing_wgs or move the repo"))

    # ---- aliases, forum mapping, topics
    for s, rx in ((_yaml(root, "wg_aliases.yml") or {}).get("aliases") or {}).items():
        if s not in known:
            errors.append(("alias-slug", f"wg_aliases.yml: {s} is not a working group or bucket"))
        _rx(errors, f"wg_aliases.yml: {s}", rx)
    fm = _yaml(root, "forum_mapping.yml") or {}
    for i, r in enumerate(fm.get("title_rules") or []):
        if r.get("to") not in known:
            errors.append(("forum-slug", f"forum_mapping.yml: title_rules[{i}] sends to {r.get('to')}, which is not a working group or bucket"))
        _rx(errors, f"forum_mapping.yml: title_rules[{i}]", r.get("match", ""))
    for kind in ("tag_rules", "category_rules"):
        for k, s in (fm.get(kind) or {}).items():
            if s not in known:
                errors.append(("forum-slug", f"forum_mapping.yml: {kind}[{k}] sends to {s}, which is not a working group or bucket"))
    for tid, t in ((_yaml(root, "collab_themes.yml") or {}).get("themes") or {}).items():
        if not t.get("name") or not t.get("regex"):
            errors.append(("theme-field", f"collab_themes.yml: {tid} needs a name and a regex"))
        _rx(errors, f"collab_themes.yml: {tid}", t.get("regex", ""))
        for o in t.get("owners") or []:
            if o not in known:
                errors.append(("theme-owner", f"collab_themes.yml: {tid} owner {o} is not a working group or bucket"))

    # ---- cross-tagging rules
    for i, r in enumerate((_yaml(root, "item_rules.yml") or {}).get("rules") or []):
        where = f"item_rules.yml: rule {i + 1} ({r.get('name') or r.get('to')})"
        if r.get("to") not in known:
            errors.append(("rule-slug", f"{where}: to {r.get('to')} is not a working group or bucket"))
        for g in r.get("skip_wgs") or []:
            if g not in known:
                errors.append(("rule-slug", f"{where}: skip_wgs {g} is not a working group or bucket"))
        if not r.get("match"):
            errors.append(("rule-match", f"{where}: no match regex"))
        else:
            _rx(errors, where, r["match"])
        for repo in r.get("repos") or []:
            if repo not in collected:
                warnings.append(("rule-repo", f"{where}: repo {repo} is not collected, so the rule never applies to it"))

    # ---- meetings
    mp = Path(root) / "data" / "meetings.json"
    if mp.exists():
        mt = json.loads(mp.read_text())
        for m in mt.get("meetings", []):
            if m.get("wg") and m["wg"] not in known:
                errors.append(("meeting-slug", f"meetings.json: {m['name']} maps to {m['wg']}, which is not a working group or bucket"))
        un = sorted({m["name"] for m in mt.get("meetings", []) if not m.get("wg")})
        if un:
            warnings.append(("meeting-unmapped", "meetings.json: no working group for " + "; ".join(un)
                             + " (add a pattern to NAME_MAP in scripts/collect/meetings.py or a group to working_groups.yml)"))
        unst = sorted({s["name"] for s in mt.get("status", []) if not s.get("wg")})
        if unst:
            warnings.append(("meeting-status-unmapped", "meetings.json: listed without dates and mapped to no group: " + "; ".join(unst)))
    return errors, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args()
    errors, warnings = check(a.root)
    gha = os.environ.get("GITHUB_ACTIONS") == "true"
    for lvl, items in (("error", errors), ("warning", warnings)):
        for code, msg in items:
            print(f"{lvl.upper():7} [{code}] {msg}")
            if gha:
                print(f"::{lvl} title=config {code}::{msg}")
    print(f"config check: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors or (a.strict and warnings) else 0)


if __name__ == "__main__":
    main()
