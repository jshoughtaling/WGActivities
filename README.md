# OHDSI Working Group Activities

A weekly-refreshed heatmap of activity across OHDSI working groups, built from GitHub, the OHDSI forums,
community calls, Global Symposium materials and (counts only) MS Teams. See `PLAN.md` for the design.

## Layout

```
config/            working_groups.yml (WG -> repos), forum_mapping.yml, wg_aliases.yml, conferences.yml
scripts/collect/   one collector per source -> data/events/<source>.json
scripts/build_activity.py   merges events (+ data/teams_counts.json) -> rmd/data/activity.json
scripts/build_collab.py     finds cross-WG collaboration candidates -> rmd/data/collab.json (topics in config/collab_themes.yml)
rmd/               RMarkdown site (index = heatmap, wg = one group, about) and assets/*.js
docs/              rendered site (GitHub Pages serves this folder from main)
prompts/           prompt for the local Claude-in-Chrome Teams count run
```

## Refresh by hand

```
python3 scripts/collect/github.py      # first run is ~1,500 API requests; uses `gh auth token` or GITHUB_TOKEN
python3 scripts/collect/forums.py
python3 scripts/collect/calls.py
python3 scripts/collect/conference.py
python3 scripts/build_activity.py
python3 scripts/build_collab.py
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
`rmd/data/activity.json`. In the repository settings, set Pages to deploy from the `main` branch, `/docs` folder.
Teams data is not collected in CI: run `prompts/collect_teams.md` locally and commit `data/teams_counts.json`.
