# OHDSI Working Group Activities

A weekly-refreshed site about what OHDSI working groups are doing, for transparency and to surface chances to
collaborate. Built from GitHub, the OHDSI forums, community calls, symposium materials and (counts only) MS Teams.
Pages: Overview (week at a glance + heatmap by group, project or topic), Groups, Projects, Topics, Connections
(network, pair evidence, similar work across groups), Activity (weekly digest, calendar of meetings with an .ics feed, outputs, CSV/markdown/RSS) and About.
See `PLAN.md` for the design.

## Layout

```
config/            working_groups.yml (WG -> repos), item_rules.yml (title rules that also credit an item to another WG),
                   projects.yml (repos -> projects), forum_mapping.yml, wg_aliases.yml,
                   conferences.yml, collab_themes.yml (curated topics)
scripts/collect/   one collector per source -> data/events/<source>.json
scripts/build_activity.py   merges events (+ data/teams_counts.json) -> rmd/data/activity.json
scripts/build_collab.py     finds cross-WG collaboration candidates -> rmd/data/collab.json (topics in config/collab_themes.yml)
scripts/build_views.py      projects, topics, similar work, weekly digest, calendar
                            -> rmd/data/{projects,topics,similar,digest,calendar}.json, digest.xml (RSS), calendar.ics;
                            shared item model in scripts/lib_items.py
scripts/item_rules.py       applies config/item_rules.yml when events are loaded (run it to list what each rule tags)
scripts/validate_config.py  checks the hand-edited config (slugs, regexes, project repos, extends, reviewed dates, meeting names)
scripts/build_health.py     data freshness, collector outcomes and config notices -> rmd/data/health.json (About > Data health)
scripts/record_status.py    the workflow records each collector's outcome in data/collector_status.json
rmd/               RMarkdown site (index, groups, wg, projects, topics, connections, activity, about) and assets/*.js
docs/              rendered site (GitHub Pages serves this folder from main)
prompts/           prompt for the local Claude-in-Chrome Teams count run
```

## Refresh by hand

```
python3 scripts/collect/github.py      # first run is ~1,500 API requests; uses `gh auth token` or GITHUB_TOKEN
python3 scripts/collect/forums.py
python3 scripts/collect/calls.py
python3 scripts/collect/conference.py   # needs: pip install -r requirements.txt (pypdf reads the agenda PDFs)
python3 scripts/collect/meetings.py     # upcoming WG meetings from ohdsi.org -> data/meetings.json (no join links kept)
python3 scripts/build_activity.py
python3 scripts/build_collab.py
python3 scripts/build_views.py         # needs collab.json first (to mark pairs already connected)
python3 scripts/build_health.py        # after the builders; also runs the config check
Rscript build-site.R                   # needs R, the rmarkdown package and pandoc
```

Or build the site in Docker, with no local R or pandoc:

```
docker build -t wg-activities-site -f docker/Dockerfile docker
docker run --rm -v "$PWD":/site wg-activities-site
```

Then preview it:

```
python3 -m http.server -d docs         # open http://localhost:8000 (the page fetches data/activity.json)
```

Check your changes before opening a pull request (the same commands run in `.github/workflows/checks.yml` on every pull request and push to `main`):

```
python3 scripts/validate_config.py     # errors fail; notices are printed (--strict fails on those too)
python3 scripts/collect/test_meetings.py && python3 scripts/test_validate_config.py && python3 scripts/test_build_health.py && python3 scripts/test_item_rules.py
```

Python 3.12 (the version CI uses) is needed for the builders.

To confirm a multi-repo project grouping, add `reviewed: YYYY-MM-DD by <name>` to it in `config/projects.yml`. Until then the Projects page marks it as a draft.

`.github/workflows/weekly.yml` does the same when you run it by hand (Actions tab > Run workflow; it has no schedule or push trigger) and commits `docs/`, `data/events/`,
`data/collector_status.json` and `rmd/data/`. It checks the config first, records which collectors failed, and writes the data-health summary to the run's job summary. In the repository settings, set Pages to deploy from the `main` branch, `/docs` folder. In a fork, also enable Actions (Actions tab) and allow workflows to write (Settings → Actions → General → Workflow permissions), and change `config/site.yml` plus the two links it lists.
Teams data is not collected in CI: run `prompts/collect_teams.md` locally and commit `data/teams_counts.json`.
