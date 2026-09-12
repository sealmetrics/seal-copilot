---
name: monday-briefing
description: >
  The single proactive report the customer sees first thing every Monday:
  weekly performance verdict + top opportunity + watchdog status, on one
  screen, email-shareable. Trigger on: "monday briefing", "morning report",
  "weekly briefing", "informe del lunes", "start my week", "what should I
  do this week", "lunes", "executive briefing", or when run from the
  scheduled Cowork job.
disable-model-invocation: true
short-description: 'The one-page Monday briefing: verdict, week vs last, what worked, one opportunity, watchdog. Use for "Monday briefing", "briefing", "resumen del lunes", or a scheduled run.'
---

# Monday Briefing

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

The Monday-morning one-pager. Combines the highlights of three skills
into a 6-block report the user can forward to their team. Budget: ≤15
calls. Designed for **scheduled execution** — `/schedule` in Claude Code, or
the equivalent scheduled task in Cowork ("every Monday at 8 am in [site
timezone]").

## Composition

This skill **calls down** to three other skills' procedures but runs them
in compact mode — do not produce three full reports, produce one merged
report. Each section caps at the line counts below.

1. Weekly health check — slim (KPIs + verdict only, no findings).
2. Opportunity scan — top 1 only (the highest-€ pattern that fires).
3. Cart-watchdog — current status only (no historical baseline detail).

If any sub-step errors, show "—" for that section, do not abort the rest.

## Procedure

### Block 0 — Follow-up (0–2 calls)
Read `<state-dir>/<site_id>/recommendations.jsonl`. For entries with
`status: open` and `verify_on` today or earlier, re-measure and mark them
verified or failed (see `skills/seal-copilot/references/state-schema.md`).
At most two re-measurements per briefing — the rest wait a week. If nothing
is due, this block produces no output at all.

### Block A — Snapshot (3 calls)
1. `get_overview(period=7d, compare=previous)` (for hotels also
   `compare=yoy`).
2. `get_top_channels(period=7d)` — ranked, no `compare` available.
3. `get_campaigns(period=7d, sort_by=revenue, limit=5)` — use the full tool
   when you need sorting; `get_top_campaigns` is ranked by entrances only.

### Block B — Opportunity radar (3–5 calls)
Pick the **single highest-impact pattern** that fires from this short list
(do not run the full pattern library):
- Hidden star campaign (top CR + AOV, low volume) — `get_campaigns(
  sort_by=revenue, limit=20, compare=previous)`.
- Leaky campaign (high entrances, low CR) — same call, opposite end.
- Mobile gap (mobile CR <50% desktop) — `get_device_types(period=7d)`.
- Untapped country (high CR, no campaign) —
  `get_countries(period=30d, sort_by=conversions, limit=10)`. Country is
  timezone-derived: report it as a question, not a spend recommendation.

Pick one only — the one with the largest € impact. Do not list the others.

### Block C — Watchdog status (2 calls)
- `get_microconversions(conversion_type=<atc-equivalent>, period=today)` —
  today's volume so far, compared against the stored watchdog baseline if
  `calibrate-watchdog` has run. Without a baseline, compare to
  `get_microconversions(conversion_type=<atc>, period=yesterday)` and say the
  comparison is coarse.
- `get_bot_stats(days=7)` — bot share trend, when the tool is in your tool
  list. Empty means agent analytics is off, not 0%. **(local only)** — not
  announced on `remote`, and there you drop the bot line from the watchdog
  block entirely rather than printing a zero.

Status line: `🟢 normal` / `⚠️ watch — <reason>` / `🔴 act now — <reason>`.

### Block C2 — Alerts (0 calls)
Read `<state-dir>/<site_id>/alerts.json`. One line, and only when there is
something to say: how many rules are active, how many fired in the last seven
days, and any rule expiring within 30 days. A site with **no** active rule gets
the one line that matters instead — that nothing is watching it between these
reports — and an offer to set one up with `create-alert`. Omit the block
entirely if the file is unreadable.

### Block D — Validation (0 calls)
Reuse the `get_bot_stats(days=7)` result from Block C. If it was empty or
returned 403, mark every mover in Block A "unvalidated for bots". **(local
only)** — on `remote` there is no result to reuse, so every mover carries that
marking by default and the "Not checked" line says so once.

## Output format (the one-pager)

```
🦭 Seal Copilot — Monday Briefing · <site> · <week dates>

🎯 VERDICT: <✅ on track | ⚠️ watch | 🔴 act now>
<one sentence summarizing the week>

📊 THIS WEEK vs LAST
| Entrances | CR | Conversions | Revenue | AOV |
|  X (±%)   | X% | N (±%)      | €X (±%) | €X  |
(for hotels: same row vs yoy underneath)

🏆 WHAT WORKED
<the single best channel or campaign this week, with numbers>

🩹 WHAT NEEDS ATTENTION
<the single biggest negative mover, with numbers and likely cause>

💰 TOP OPPORTUNITY THIS WEEK
<pattern name>: <evidence> → <action> → <est. € impact> → <verify in 2-4 wk>

✅ FOLLOW-UP
<only if something was due: one line per recommendation checked, with the
number that moved and verified/failed. Omit the whole block if nothing was due.>

⛔ NOT CHECKED
<only if a step's call was refused or skipped: one line naming it, e.g.
"channel split and bot validation — API refused get_channels / get_bot_stats
for this site; movers above are unvalidated for bots". Omit if all ran.>

🚨 WATCHDOG
Add-to-cart: <🟢/⚠️/🔴 + one-line context>
Tracking decay (microconversions): <🟢/⚠️/🔴>
Alerts: <N active, M fired this week — or "none set up">

➡️ NEXT
Suggested follow-up: "<one concrete next prompt the user can paste>"
```

Keep the whole output under ~30 lines so it copy-pastes into email/Slack
cleanly. No code blocks except the verdict box. No filler.

Append the opportunity you reported to `recommendations.jsonl` and log the
run in `runs.jsonl` with exactly `ts`, `skill`, `calls`, `budget`, `verdict`,
`scheduled`, `notes` — `budget` is `15` for this skill, `calls` is counted.

## Scheduling guidance

On first successful run, offer:

> "Want this every Monday at 8 am? Reply 'schedule monday-briefing' and I
> will set it up."

When the scheduler fires this skill, the output is the entire response —
no preamble, no "Hi! Here is your briefing", just the one-pager above.

## What you do NOT do

- Do not include >1 opportunity. Monday is for focus.
- Do not print a bot-share line. This connector does not announce the tool, and
  a zero there would be read as a measurement.
- Do not run the full opportunity-scan, full health-check, or full
  watchdog procedures here — call them by name as follow-ups if the user
  wants depth.
- Do not include statistical caveats inside the one-pager; if a number is
  low-confidence, suffix it with "(low sample)".
- Do not personalize the verdict beyond the data — no "great job" / "bad
  week" framing.
