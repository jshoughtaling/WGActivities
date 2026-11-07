# OHDSI Working Group Activities: Plan

A weekly-refreshed GitHub Pages site that compiles activity across all OHDSI working groups (WGs) and shows it as a heatmap.

## Decisions

| Question | Decision                                                                                                                                                                                     |
|---|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Teams access | Graph API admin consent has been requested, but may not come through. Teams is built last and reads a drop file (`data/teams_counts.json`), so the source of the counts can be Graph or a local Claude-in-Chrome run on Jared's machine. |
| WG scope | All OHDSI WGs. The list comes from ohdsi.org and is confirmed before the collectors are mapped.                                                                                              |
| History | Backfill 12 months. Extend to 24 months if the first results look useful. Conference materials: all available years.                                                                         |
| Content | Public site: counts and links only. Teams meeting transcripts also get an AI-written summary and keywords, kept private (gitignored) until reviewed. Publishing any of it is a per-WG, per-item decision. |
| Hosting | Personal repo first (`WGActivities`, served at `jshoughtaling.github.io/WGActivities`). Move to the OHDSI org later if it proves useful.                                                     |

## Reuse from the GIS repo

- RMarkdown site in `rmd/` (`_site.yml`, cosmo theme, `style.css`, `favicon.html`, OHDSI navbar and logos), rendered to `docs/` by `build-site.R`.
- Data pattern: a Python script writes a JSON file, and vanilla JS in `assets/` renders it in the browser (as in GIS `status.Rmd`, `scripts/build_status.py`, `rmd/data/status.json`).
- Weekly Action (GIS `build-site.yml`): Monday cron, run the data script with `continue-on-error`, build the site, commit `docs/` and the JSON to `main`. A second workflow deploys to Pages.

## Architecture

```
config/working_groups.yml   WG -> Teams channel, GitHub repos, forum categories/tags, call keywords
scripts/collect/            one collector per source, each emits normalized events
  github.py  forums.py  calls.py  conference.py  teams.py   (teams.py reads the drop file)
scripts/build_activity.py   merge events -> weekly per-WG per-source aggregates   (written; run `python3 scripts/build_activity.py`)
data/events/                cached raw events (so weekly runs fetch only what is new)
data/private/teams_meetings.json   per-meeting summary + keywords from transcripts; gitignored, not read by the site until reviewed
data/teams_counts.json      Teams drop file: per channel per week counts (posts, replies, authors, files, meetings, transcript stats), counts only. Prompt: prompts/collect_teams.md
rmd/data/activity.json      aggregates + links; the only file the site reads
rmd/index.Rmd, rmd/assets/heatmap.js    the visualization
.github/workflows/weekly.yml            cron Mon: collect -> build -> commit -> deploy
```

Normalized event record: `{date, wg, source, type, title, url, actor_count, weight}`. Adding a source means adding one collector.

## Sources

| Source | Method | Notes |
|---|---|---|
| GitHub repos | REST/GraphQL with the Action token. Commits, PRs, issues, comments and releases per repo per week. | Needs the WG -> repo mapping. |
| Forums | forums.ohdsi.org is Discourse. Public JSON API (`/latest.json?order=created`, `/c/<slug>.json`, `/posts.json`). | No per-WG categories, so topics are classified to WGs by title keywords, then tags, then category (`config/forum_mapping.yml`). About 30% of recent topics are community announcements and about 19% stay unassigned. The forum's "Weekly OHDSI Digest" posts may also help the community-calls collector. |
| Community calls | `scripts/collect/calls.py` parses ohdsi.org/community-calls-<year>/ (2022 to now; the 2021 page 404s). Each call is an accordion entry with a title, slide PDFs and YouTube embeds. | Done (v1). Calls are tagged to WGs by name in the title (`config/wg_aliases.yml`); about 64% of calls are community-wide and tagged `community`. Spotlight calls tag one or more WGs. |
| Conference materials | `scripts/collect/conference.py` parses the Global Symposium Collaborator Showcase pages, 2020 to 2026 (about 950 entries). Dates come from `config/conferences.yml`. | Done for the Global Symposium: showcase entries (2020 to 2026), WG sessions (the WG activity day pages, 2024 to 2026) and tutorials (2024 to 2026). WG sessions are matched by heading and are reliable; showcase tags come from title and author text, so many are topical and about 70% stay `unassigned`. Not yet covered: WG sessions and tutorials before 2024 (no pages; agenda PDFs only), Europe, APAC, Africa and India symposia, DevCon, regional tutorials, and the agenda pages. |
| Teams | Writes per-WG weekly counts to the drop file `data/teams_counts.json` (see below). | Public site shows counts only. Raw content is never committed. |

### Teams ingestion

The pipeline only ever reads `data/teams_counts.json`. Two ways to produce it:

1. **Graph API** (if consent is granted): run in the Action with credentials in secrets.
2. **Claude in Chrome** (fallback, likely path): a local run in Jared's own signed-in Chrome on Teams web. It opens each WG channel, scrolls back through the backfill window, and counts messages and meetings per week. Jared reviews and commits only the counts file. Other local options, in order of preference: the built-in browser pane, then computer use on the native app. Manual transcript download from meeting recaps is a no-AI fallback.

Limits of the local path: it is not unattended (login, MFA and session expiry), it is slower and more fragile than an API (page changes can break it), and it only sees channels Jared is a member of. Check with the OHDSI admin that scraping Teams as a member is acceptable before running it across all channels. Pilot on one WG channel first.

**Privacy.** No transcript or chat text is published or committed. Transcript-derived summaries and keywords are written locally to `data/private/teams_meetings.json` (gitignored), contain no names or verbatim quotes, and are reviewed before any of them is published. Only per-week counts and (where the source is public) links go into `activity.json`. Teams items link to nothing public, so they appear as counts only. Graph credentials live in Action secrets.

## Visualization

- **Main view:** heatmap, one row per WG, one column per week (last 52, extendable to 104). Source toggle: All / GitHub / Forums / Calls / Conference / Teams. Optionally split each row into thin per-source strips.
- **Normalization:** intensity is a percentile within each source's own history, so GitHub volume does not swamp forums or Teams.
- **Drill-down:** clicking a cell lists that week's items with links.
- **Sorting and flags:** rows sort by recent activity. Badges mark WGs that are newly active or gone quiet.
- **Secondary views:** "This week" digest, per-WG pages (timeline, repos, forum categories), and conference-year markers on the time axis.
- **Implementation:** plain SVG or CSS grid in vanilla JS. Use D3 only if the interactions need it.

## Phases

1. **Scaffold.** Copy the GIS `rmd/` skeleton, `_site.yml`, `build-site.R` and workflow. Write `working_groups.yml` from the ohdsi.org WG list.
2. **GitHub and forums collectors.** Aggregation and a first heatmap on real data (12-month backfill). Needs no credentials beyond the Action token.
3. **Community calls and conference collectors,** with WG tagging rules.
4. **Weekly workflow.** Cron, event caching, and per-source failure isolation so one broken source does not fail the build. Decide whether to extend to 24 months.
5. **Teams.** Build the drop-file reader and schema first. Pilot the Claude-in-Chrome counting run on one WG channel, then extend to all channels. Swap in Graph if consent arrives. Counts only.
6. **Move to the OHDSI org** if the site proves useful (Pages and token setup change).

## Status (2026-11-07)

Phases 1 to 4 are built: config, all collectors except Teams-by-API, the aggregator, the RMarkdown site
(`rmd/`: heatmap, per-WG page, about) and the refresh workflow (manual for now; the Monday cron is commented out in `weekly.yml` until the repo moves to the OHDSI org). Teams comes from the local drop file.
Not yet done: render the site with R in CI for the first time, turn on Pages (main, /docs), review the
repo and forum mappings with the WGs, and decide whether to extend to 24 months.

## Open items

- Review the draft WG -> repo mapping in `config/working_groups.yml` (all 397 public OHDSI repos assigned; medium/low confidence entries need WG-lead checks). Forum mapping is drafted in `config/forum_mapping.yml` (keyword/tag rules, because the forum has no per-WG categories) with a classifier in `scripts/collect/forum_classify.py`. Teams channels are still to do.
- Check on Graph consent status. If it is denied, the Claude-in-Chrome path above is the plan.
- Confirm with the OHDSI admin that member-level scraping of Teams for counts is acceptable.
- Pick the final Pages URL and repo settings (Pages source, Action write permissions).
