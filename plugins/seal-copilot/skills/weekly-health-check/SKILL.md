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

Produce a tight weekly performance report. Budget: ≤8 tool calls.
Apply the operating rules, thresholds, MCP call rules and failure modes from
`skills/seal-copilot/references/methodology.md`.

If the period has fewer than 30 conversions, report KPIs only and skip
findings — say why in one line.

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
4. If any anomaly (±25%) and `get_bot_stats` is in your tool list, call
   `get_bot_stats(days=7)` to validate it is human — do not report the
   anomaly before you have. An empty result means agent analytics is off, not
   0% bots: mark the finding "unvalidated for bots" (see `methodology.md`).
   **(local only)** — on `remote` the tool is not announced, so there you
   attempt nothing and carry that marking into the "Not checked" line.
5. Optional drill-down (1–2 calls max) only to explain the single biggest
   mover: `get_landing_pages`, `get_terms`, or `get_devices` as relevant.

## Output format

**Verdict line first:** one of
- ✅ On track — nothing needs action this week
- ⚠️ Watch — N items trending wrong, no action yet
- 🔴 Act now — N items need action this week

**Then KPI table:** entrances, CR, conversions, revenue, AOV — each with
delta vs comparable and a one-word direction.

**Then one line for anything the procedure could not do**, whenever a step's
call was refused, returned an error as text, or was skipped. The first real
run had a +35% traffic spike at 84% bounce and said nothing about the fact
that channel and bot data were refused for the site — a reader cannot tell a
validated spike from an unvalidated one unless you say so. Format:

> Not checked: channel split and bot validation — the API refused
> `get_channels` and `get_bot_stats` for this site ("Access denied"). Movers
> above are unvalidated for bots.

Omit the line only when every step ran.

**Then findings (max 3, ordered by revenue impact).** Each finding:
evidence (numbers + period) → action → estimated impact → how to verify.
If nothing fires, say so in one line — do not pad.

**Close with one suggested question** the user could ask next (e.g. "Want
me to diagnose the Paid Search drop?").

Before the final message: if no `profile.json` existed, write one with what
discovery established (site, timezone, vertical, event names,
`agent_analytics_enabled` as `true`/`false`/`"unknown"`) **and
`discovery_cached_at` as today's date** — the 7-day refresh rule reads that
field, and a profile without it can never be judged fresh or stale. Append every
finding you issued to `recommendations.jsonl` with its metric, baseline,
target and `verify_on` date. Log the run in `runs.jsonl` with exactly the
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
