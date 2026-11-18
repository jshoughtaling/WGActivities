"""Checks for scripts/item_rules.py. Run: python3 scripts/test_item_rules.py"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from item_rules import apply_rules  # noqa: E402


def ev(i, wg, title, repo="Ares", source="github", typ="pr_opened"):
    return {"id": f"{repo}:{typ}:{i}", "wg": wg, "title": title, "repo": repo, "source": source, "type": typ,
            "url": f"https://github.com/OHDSI/{repo}/pull/{i}", "date": "2026-10-24", "week": "2026-W43"}


RULE = {"name": "geo", "to": "gis", "rx": re.compile(r"\b(geo|geospatial|GIS)\b", re.I), "repos": set(), "sources": {"github"}, "skip": {"gaia-genai"}}


def main():
    a = ev(1, "evidence-network", "Add geospatial data support")
    out = apply_rules([a], [RULE])
    assert len(out) == 2 and out[0] is a, out
    c = out[1]
    assert (c["wg"], c["from_wg"], c["via"], c["id"], c["url"]) == ("gis", "evidence-network", "rule", "Ares:pr_opened:1@gis", a["url"]), c
    assert a["wg"] == "evidence-network", "the original event must not change"
    assert len(apply_rules([ev(2, "data-quality", "Add support for Geo data export", "Achilles")], [RULE])) == 2
    assert len(apply_rules([ev(3, "evidence-network", "Fix the build")], [RULE])) == 1                       # no match
    assert len(apply_rules([ev(4, "gis", "GIS docs")], [RULE])) == 1                                          # already GIS
    assert len(apply_rules([ev(5, "gaia-genai", "Gaia geospatial agent")], [RULE])) == 1                      # skip_wgs
    assert len(apply_rules([ev(6, "forums", "geospatial", source="forums")], [RULE])) == 1                    # sources
    assert len(apply_rules([ev(7, "evidence-network", "geospatial"), ev(7, "gis", "geospatial")], [RULE])) == 2   # collector already filed it
    assert len(apply_rules([a], [dict(RULE, repos={"Achilles"})])) == 1                                       # repos filter
    assert len(apply_rules(apply_rules([a], [RULE]), [RULE])) == 2                                            # idempotent
    assert apply_rules([a], []) == [a]
    print("ok: item_rules")


if __name__ == "__main__":
    main()
