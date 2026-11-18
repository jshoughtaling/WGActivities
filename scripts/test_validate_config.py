"""Checks for scripts/validate_config.py on a tiny config. Run: python3 scripts/test_validate_config.py"""
import json
import sys
import tempfile
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_config import check  # noqa: E402

WG = {"working_groups": [
    {"slug": "a", "name": "A", "repos": {"high": ["a1", "a2"]}, "also": ["shared"]},
    {"slug": "b", "name": "B", "repos": {"high": ["b1"]}}], "non_wg": {"infrastructure": {"repos": ["infra1"]}}}
GOOD = {"projects": {
    "pa": {"name": "PA", "lead_wg": "a", "kind": "package", "repos": ["a1", "a2"], "reviewed": "2026-11-20 by Ann"},
    "pb": {"name": "PB", "lead_wg": "b", "kind": "app", "repos": ["b1"], "extends": ["pa", "a1"]}}}


def run(projects=GOOD, extra=None, meetings=None):
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "config").mkdir()
        (root / "data").mkdir()
        files = {"working_groups.yml": WG, "projects.yml": projects, "wg_aliases.yml": {"aliases": {"a": r"\bA\b"}},
                 "forum_mapping.yml": {"title_rules": [{"to": "b", "match": "B"}], "tag_rules": {"t": "a"}, "category_rules": {1: "community"}},
                 "collab_themes.yml": {"themes": {"t": {"name": "T", "regex": "x", "owners": ["a"]}}}}
        files.update(extra or {})
        for n, v in files.items():
            (root / "config" / n).write_text(yaml.safe_dump(v))
        if meetings:
            (root / "data" / "meetings.json").write_text(json.dumps(meetings))
        e, w = check(root)
        return {c for c, _ in e}, {c for c, _ in w}


def main():
    assert run() == (set(), set()), run()
    bad = {"projects": {"p": {"name": "P", "lead_wg": "zz", "contributing_wgs": ["yy"], "kind": "gadget", "repos": ["a1"], "reviewed": "soon",
                              "extends": ["nope"]},
                        "q": {"name": "Q", "lead_wg": "a", "kind": "app", "repos": ["a1"]}}}
    e, _ = run(bad)
    assert e == {"project-lead", "project-contrib", "project-kind", "project-reviewed", "project-extends", "repo-two-projects"}, e
    # repos nobody collects: in `also:`, in non_wg, or nowhere
    e, w = run({"projects": {"p": {"name": "P", "lead_wg": "a", "kind": "app", "repos": ["shared", "infra1", "ghost"]}}})
    assert not e and w == {"project-not-collected"}, (e, w)
    e, w = run({"projects": {"p": {"name": "P", "lead_wg": "a", "kind": "app", "repos": ["b1"]}}})
    assert not e and w == {"project-owner"}, (e, w)
    e, _ = run(extra={"collab_themes.yml": {"themes": {"t": {"name": "T", "regex": "(", "owners": ["zz"]}}},
                      "wg_aliases.yml": {"aliases": {"zz": "x"}}, "forum_mapping.yml": {"title_rules": [{"to": "zz", "match": "B"}]}})
    assert e == {"bad-regex", "theme-owner", "alias-slug", "forum-slug"}, e
    e, w = run(meetings={"meetings": [{"name": "Q WG", "wg": None}, {"name": "Z", "wg": "zz"}], "status": [{"name": "R WG", "wg": None}]})
    assert e == {"meeting-slug"} and w == {"meeting-unmapped", "meeting-status-unmapped"}, (e, w)
    e, w = run(extra={"item_rules.yml": {"rules": [{"to": "zz", "match": "(", "skip_wgs": ["yy"], "repos": ["a1", "ghost"]}, {"to": "b"}]}})
    assert e == {"rule-slug", "bad-regex", "rule-match"} and w == {"rule-repo"}, (e, w)
    assert run(extra={"item_rules.yml": {"rules": [{"to": "b", "match": "geo", "repos": ["a1"]}]}}) == (set(), set())
    good = {"meta": {"year": 2026, "sessions": {"s1": {}}}, "okrs": [{"slug": "a", "name": "A", "session": "s1", "with": ["b"], "objectives": [{"objective": "x", "krs": []}]},
                                                  {"slug": None, "name": "Chapter", "session": "s1", "objectives": [{"objective": "y"}]}]}
    assert run(extra={"okrs.yml": good}) == (set(), set())
    badokr = {"meta": {"sessions": {"s1": {}}}, "okrs": [{"slug": "zz", "name": "Z", "session": "s9", "with": ["yy"], "objectives": []}]}
    e, _ = run(extra={"okrs.yml": badokr})
    assert e == {"okr-slug", "okr-session", "okr-with", "okr-objective", "okr-year"}, e
    dup = {"meta": {"year": 2025, "sessions": {"s1": {}}}, "okrs": [{"slug": "a", "name": "A", "session": "s1", "objectives": [{"objective": "x"}]}] * 2}
    e, _ = run(extra={"okrs_2025.yml": dup})
    assert e == {"okr-duplicate"}, e
    print("ok: validate_config")


if __name__ == "__main__":
    main()
