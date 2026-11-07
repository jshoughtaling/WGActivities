# Teams collection prompt

Run with `claude --chrome` from the repo root, signed in to Teams web in that Chrome profile. Start with the pilot (one channel) before running all channels. Replace the bracketed values.

---

Collect weekly activity counts from the OHDSI Teams channels using my signed-in Teams web session (https://teams.microsoft.com). Read-only. Produce weekly counts for every channel (public-safe), and a short summary and keywords for each meeting transcript (private, kept out of git). Never record message text, names or verbatim transcript text.

## Scope

- Team: OHDSI [adjust if the working groups live in more than one team].
- Channels: [PILOT: only the "<channel name>" channel] / [FULL: every channel that corresponds to a working group. List all channels you can see first, then map them to WGs using `config/working_groups.yml` if it exists, otherwise propose a mapping and wait for my confirmation].
- Window: from [YYYY-MM-DD, 12 months ago] to today. Weeks are ISO weeks (Monday start), labelled `YYYY-Www`.

## For each channel, for each week in the window, record

- `posts`: top-level channel posts.
- `replies`: replies to those posts.
- `active_authors`: number of distinct people who posted or replied (a number only, no names).
- `files_shared`: files attached to posts, plus files in the Files tab with a modified date in that week.
- `meetings`: meetings held in the channel (look for "Meeting started/ended" posts, the channel's calendar/Meetings entries, and recap cards).
- `meetings_with_transcript`: how many of those have a transcript available (Recap > Transcript).
- `meeting_minutes`: summed duration of those meetings, in minutes.
- `transcript_words`: total word count across available transcripts that week. Estimate from the transcript view if no count is shown, and say it is an estimate in the run log.
- `transcript_speakers_max`: the highest number of distinct speakers in any single transcript that week.

Weeks with no activity still get a row with zeros, so the heatmap can tell "quiet" from "not collected".

## How to work

1. Open the channel's Posts tab and scroll back until you pass the window start. Wait for older messages to load; scroll in steps and confirm the oldest visible date before concluding you reached the start.
2. Open the Files tab (and the Meetings/Recap view if present) for the file and meeting counts.
3. For each meeting with a transcript, open the transcript in the browser to count words and distinct speakers, and to write the summary and keywords described under Output. Read it in the page only. Do not download or save the transcript or the recording.
4. Write results after each channel, not only at the end, so a dropped session loses at most one channel.

## Rules

- Read-only. Do not post, reply, react, join a meeting, change settings, or mark anything read on purpose.
- Do not record or quote channel message content, and do not summarize channel messages. Summaries and keywords are for meeting transcripts only.
- Summaries and keywords are written in your own words: no verbatim quotes, no people's names, emails or affiliations. Refer to roles or "participants" instead. Leave out anything that looks sensitive (unpublished results, patient or site-identifying details, credentials, personnel matters).
- If you hit a login page, MFA prompt, CAPTCHA, or a permission wall, stop and tell me. Do not try to work around it.
- If a channel is not accessible to me, or you could not reach the full window, record that in the run log rather than guessing.
- If counts for a week are uncertain (for example, messages were still loading), mark that week `"partial": true`.
- Do not click links to external sites.

## Output

1. `data/teams_counts.json`: array of rows
   ```json
   {"wg": "<wg slug or channel name>", "channel": "<channel name>", "week": "2026-W14",
    "posts": 0, "replies": 0, "active_authors": 0, "files_shared": 0,
    "meetings": 0, "meetings_with_transcript": 0, "meeting_minutes": 0,
    "transcript_words": 0, "transcript_speakers_max": 0, "partial": false}
   ```
   Merge with any existing file: replace rows for the same `channel` + `week`, keep the rest.
2. `data/private/teams_meetings.json`: one row per meeting transcript, **private** (gitignored, never committed or published):
   ```json
   {"wg": "<wg slug>", "channel": "<channel name>", "date": "2026-04-07", "week": "2026-W15",
    "summary": "3-5 sentences: topics discussed, decisions made, open questions, next steps.",
    "keywords": ["5-10 short topical terms, e.g. tool, standard, dataset, or method names"],
    "action_item_count": 0}
   ```
   Keywords should be topics (e.g. `OMOP GIS extension`, `PM2.5 exposure`), not names of people. Merge by `channel` + `date`. If a transcript is too short or too garbled to summarize, write `"summary": null` and say why in the run log.
3. `data/teams_run_log.json`: per channel, the date range actually covered, channels skipped and why, estimates used, and any partial weeks.

## Pilot check

For the pilot channel, finish, then show me (for the meeting summaries, show me two or three so I can judge quality and check them for anything sensitive): the total rows written, the busiest three weeks, three weeks you spot-checked by eye against the channel (with what you saw vs. what you recorded), and how long it took. Stop there and wait for my go-ahead before running other channels.
