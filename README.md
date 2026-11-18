# OHDSI Working Group Activities

A weekly-refreshed site about what OHDSI working groups are doing, for transparency and to surface chances to
collaborate. Built from GitHub, the OHDSI forums, community calls, symposium materials and (counts only) MS Teams.
Pages: Overview (week at a glance + heatmap by group, project or topic), Groups, Projects, Topics, Connections
(network, pair evidence, similar work across groups), Activity (weekly digest, calendar of meetings with an .ics feed, outputs, CSV/markdown/RSS) and About.
See `PLAN.md` for the design.

## Layout

```
config/            working_groups.yml (WG -> repos), projects.yml (repos -> projects), forum_mapping.yml, wg_aliases.yml,
                   conferences.yml, collab_themes.yml (curated topics)
scripts/collect/   one collector per source -> data/events/<source>.json
scripts/build_activity.py   merges events (+ data/teams_counts.json) -> rmd/data/activity.json
scripts/build_collab.py     finds cross-WG collaboration candidates -> rmd/data/collab.json (topics in config/collab_themes.yml)
scripts/build_views.py      projects, topics, similar work, weekly digest, calendar
                            -> rmd/data/{projects,topics,similar,digest,calendar}.json, digest.xml (RSS), calendar.ics;
                            shared item model in scripts/lib_items.py
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

`.github/workflows/weekly.yml` does the same when you run it by hand (Actions tab > Run workflow; it has no schedule or push trigger) and commits `docs/`, `data/events/` and
`rmd/data/`. In the repository settings, set Pages to deploy from the `main` branch, `/docs` folder.
Teams data is not collected in CI: run `prompts/collect_teams.md` locally and commit `data/teams_counts.json`.
