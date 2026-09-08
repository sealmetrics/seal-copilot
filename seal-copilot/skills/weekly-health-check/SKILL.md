---
name: weekly-health-check
description: >
  Run the Sealmetrics weekly health check — a proactive performance report
  with verdict and top findings. Trigger on: "weekly report", "health check",
  "how was this week", "informe semanal", "monday report", "give me my
  marketing report", or when run from a scheduled task.
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
2. `get_channels(period=this_week)` and `get_channels(period=last_week)` —
   which channels moved. `get_channels` does not accept `compare`; diff the
   two calendar-pair calls yourself (see `methodology.md`, MCP call rules).
3. `get_campaigns(period=7d, compare=previous, sort_by=revenue, limit=20)`
   — winners and losers.
4. If any anomaly (±25%): `get_bot_stats(days=7)` to validate it is human.
   An empty result means agent analytics is off, not 0% bots — mark the
   finding "unvalidated for bots" (see `methodology.md`).
5. Optional drill-down (1–2 calls max) only to explain the single biggest
   mover: `get_landing_pages`, `get_terms`, or `get_devices` as relevant.

## Output format

**Verdict line first:** one of
- ✅ On track — nothing needs action this week
- ⚠️ Watch — N items trending wrong, no action yet
- 🔴 Act now — N items need action this week

**Then KPI table:** entrances, CR, conversions, revenue, AOV — each with
delta vs comparable and a one-word direction.

**Then findings (max 3, ordered by revenue impact).** Each finding:
evidence (numbers + period) → action → estimated impact → how to verify.
If nothing fires, say so in one line — do not pad.

**Close with one suggested question** the user could ask next (e.g. "Want
me to diagnose the Paid Search drop?").

Append every finding you issued to `recommendations.jsonl` with its metric,
baseline, target and `verify_on` date, and log the run in `runs.jsonl`.

## Scheduling

For a scheduled Monday-morning one-pager (compact, email-shareable), use
the `monday-briefing` skill instead — it composes this skill plus
opportunity scan and cart-watchdog status into a single forwardable block.

If the user wants the full report on a schedule, offer once: "Want this
automatically every Monday morning?" and set it up with `/schedule` in
Claude Code, or the equivalent scheduled task in Cowork.
