---
name: weekly-health-check
description: >
  Run the Sealmetrics weekly health check — a proactive performance report
  with verdict and top findings. Trigger on: "weekly report", "health check",
  "how was this week", "informe semanal", "monday report", "give me my
  marketing report", or when run from a scheduled task.
short-description: 'Weekly Sealmetrics performance report with a verdict and top findings. Use for "weekly report", "health check", "how was this week", "informe semanal", "Monday report".'
---

# Weekly Health Check

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

**Before anything else: emit no text until the report.** **Your first action
is a tool call, not a sentence** — not "State directory is empty, running
discovery", not "Let me start with the overview", not "Now writing state files,
then the report". Writing state before the report is something you do, not
something you announce. And nothing between calls
either: no "Drop confirmed, moving to channels", no "Drilling into campaigns",
no "Checking seasonality". The user reads every one of those before your answer,
and a run that narrates its way to a conclusion reads as one that has not
reached it. Make the calls in silence; your first and only message is the
finished report. **And nothing after it:** write the profile, the ledger and the
run log *before* the report, never once it is written. A tool call after the
report forces a second message, and a run that logged its diagnosis first and
then added "Diagnosis complete: the drop traces to /collections/sale" made the
user read the same finding twice.

Produce a tight weekly performance report. Budget: ≤8 tool calls.
Apply the operating rules, thresholds, MCP call rules and failure modes from
`skills/seal-copilot/references/methodology.md`.

If the period has fewer than 30 conversions, report KPIs only and skip
findings — say why in one line.

**Resolve the site before any call that takes a `site_id`, without announcing
it.** If `list_sites` has not already run in this conversation, it is your first
call: one call, counted in the budget. Use anything cached under
`<state-dir>/<site_id>/` — profile, baseline, ledger, saved alert — only if that
`site_id` is in the list. If it is not, that state was written by another
Sealmetrics account on this machine: ignore it for this run, resolve the site
from the list, asking if there are several, and never delete the other
account's files. Rules in `skills/seal-copilot/references/state-schema.md`, "A
cached site belongs to one connection".

## Procedure

0. **Follow up on past recommendations first.** Read
   `<state-dir>/<site_id>/recommendations.jsonl` and act on entries with
   `status: open` and `verify_on` today or earlier: re-run the one call that
   measures each `metric`, mark them verified/failed, and rewrite the file.
   Report the outcomes in one line each, above the new findings — see
   `skills/seal-copilot/references/state-schema.md`. Skip silently if the
   ledger is empty or unreadable.
1. `get_overview(period=7d, compare=previous)` — KPIs and deltas. For
   seasonal businesses (hotels) also run `compare=yoy` and prefer it.
2. `get_top_channels(period=this_week)` and `get_top_channels(period=last_week)` —
   which channels moved. `get_top_channels` does not accept `compare`; diff the
   two calendar-pair calls yourself (see `methodology.md`, MCP call rules).
3. `get_campaigns(period=7d, compare=previous, sort_by=revenue, limit=20)`
   — winners and losers.
4. If traffic rose ≥25% without conversions rising with it, call
   `get_top_referrers(period=7d)` before calling it growth: a single referrer
   at 90%+ bounce and almost no conversions is not demand — name it and what
   it did. No bot data: never call `get_bot_stats` and never say bots (see
   "No bot data" in `methodology.md`).
5. Optional drill-down (1–2 calls max) only to explain the single biggest
   mover: `get_landing_pages`, `get_terms`, or `get_devices` as relevant.

## Output format

**Verdict line first:** one of
- ✅ On track — nothing needs action this week
- ⚠️ Watch — N items trending wrong, no action yet
- 🔴 Act now — N items need action this week

**Then KPI table:** entrances, CR, conversions, revenue, AOV — each with
delta vs comparable and a one-word direction.

**Then the attribution line, always, in the same language as the rest of the
report:** "Sealmetrics
measures last non-direct click, so these figures will not match GA4 or your ad
platforms." Every weekly report reads channels or campaigns, and a real one
named a Bing campaign's collapse without it. One line; not optional because the
week was quiet.

**Then one line for anything the procedure could not do**, whenever a step's
call was refused, returned an error as text, or was skipped. The first real
run had a +35% traffic spike at 84% bounce and said nothing about the fact
that the channel split was refused for the site — a reader cannot tell a
complete report from a partial one unless you say so. Format:

> Not checked: channel split — the API refused the channel breakdown for this
> site ("Access denied"), so movers above are not broken down by channel.

Omit the line only when every step ran. "Not checked" lists calls this run
made that failed, or steps this connector cannot run — never a product decision
such as bot data, and never something copied from an older run's notes.

**Then findings (max 3, ordered by revenue impact).** Each finding:
evidence (numbers + period) → action → estimated impact → how to verify.
If nothing fires, say so in one line — do not pad.

**Close with one suggested question** the user could ask next (e.g. "Want
me to diagnose the Paid Search drop?").

Before the final message: if no `profile.json` existed, write one with what
discovery established (site, timezone, currency, connector, vertical, event
names) **and
`discovery_cached_at` as today's date** — the 7-day refresh rule reads that
field, and a profile without it can never be judged fresh or stale. Append every
finding you issued to `recommendations.jsonl` with its metric, baseline,
target, `verify_on` date, and `impact_month` with the site's `currency`. Log the run in `runs.jsonl` — with the Read and
Write tools, never a shell command — with exactly the
fields the state schema lists: `ts`, `skill`, `calls`, `budget`, `verdict`,
`scheduled`, `notes`. `ts` is a full ISO timestamp in UTC (`2026-09-08T14:02:11Z`),
not a date. For this skill `budget` is `8`. `calls` is the number
of Sealmetrics calls you made, counted, not estimated. Both are numbers.

## Scheduling

For a scheduled Monday-morning one-pager (compact, email-shareable), use
the `monday-briefing` skill instead — it composes this skill plus
opportunity scan and cart-watchdog status into a single forwardable block.

If the user wants the full report on a schedule, offer once: "Want this
automatically every Monday morning?" and set it up with `/schedule` in
Claude Code, or the equivalent scheduled task in Cowork.
