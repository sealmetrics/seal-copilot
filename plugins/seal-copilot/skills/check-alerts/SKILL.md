---
name: check-alerts
description: >
  Evaluates one alert rule saved by `create-alert` and answers in a single
  line when the site is healthy. Runs on request — "run my alert X now" — with
  the rule read from alerts.json or given as JSON in the prompt. Trigger only
  when the user asks to run a named alert, never from a general question about
  traffic.
short-description: 'Evaluate one saved alert rule now: one line while healthy, evidence when it fires. Use for "run my alert now", "pasa la alerta".'
---

# Check Alerts

**Follow `skills/seal-copilot/references/run-protocol.md`:** no text until the answer, resolve the site with `list_sites` first, write state to the schema before answering, log the run. Match `examples/output.md`.

Budget: **≤3 Sealmetrics calls.**

A healthy run is one line. Silence when healthy is the product: an alert that
talks every hour is one the user mutes.

**This skill runs on every connector, the remote OAuth one included.** It uses
only `get_conversions`, `get_microconversions`, `get_conversions_raw`,
`get_overview`, `get_campaigns` and `get_top_referrers`, and all of them are
announced everywhere. The alert tools the remote connector withholds —
`list_alerts`, `get_alert_history`, `get_alert_stats` — are not available to
it: they belong to Sealmetrics' own dashboard alerts, a different product this
skill never touches. **Never refuse a check because of the connector.** A run
that answered "check-alerts is local-only" left a site unwatched on exactly the
connector nearly every user has.

**The rule grammar and the four families are in
`skills/seal-copilot/references/alert-grammar.md`.**

## Step 0 — Read the rule and the clock

The rule arrives as JSON in the prompt, or by its id or description ("run
no-purchases-4h", "pasa la alerta de ventas"): then read it from
`<state-dir>/<site_id>/alerts.json`. If there is no such rule, say in one line
that this skill runs a saved rule and point at `create-alert`. Do not invent a rule,
and do not fall back to a general health check.

**Take the current time from the `Fired at:` line in this prompt** and convert
it to `rule.timezone`. When that line is present, it is the clock: do not look
for another one.

**When the line is absent** — a run on request has none — read the clock once,
with `date -u +%Y-%m-%dT%H:%M:%SZ`. That is the only shell command this skill ever
runs. If it is not available either, derive what you can from the data — the
latest `date` in a `period=today` response bounds the day — and treat the hour
as unknown rather than assuming one.

**If now is outside `active_hours`, stop.** Answer `⏸ <id>: outside watch hours` and make zero
calls. **Not 🟢** — a green tick means you looked and the site is fine, and here
you did not look. An operations log full of green ticks for hours nobody watched
is how a watchdog stops being believed. Say which window the rule watches and
what today is, so the reader can see why nothing ran.

## Step 1 — Evaluate, by family

Everything the verdict needs is either in the rule or in the calls below; no
other stored state.

### `silence`

1. The day total: `get_conversions(period=today, …filter)` for
   `metric.kind: conversion`, or
   `get_microconversions(conversion_type=<type>, period=today)` for a
   microconversion.
2. **Total is 0** → the silence runs at least from the start of today's active
   hours. If that is already ≥ `condition.hours`, it fires. If it is less,
   extend the window backwards with an explicit
   `start_date`/`end_date` pair covering yesterday's active hours too, and
   measure from the last event there.
3. **Total is above 0** → one call for the most recent event. Ask for the
   **last** page rather than the first: `page = ceil(total / 100)` on
   `get_conversions_raw(conversion_type=[<type>], period=today, limit=100,
   page=N)`. Rows carry `timestamp_local` and `hour`; take the largest.
4. **Do the subtraction, and show it.** Fires when `now − last event ≥
   condition.hours`, counting only active hours. Establish the current local
   time in `rule.timezone` first, then state the gap as elapsed time — "last
   one 18 minutes ago", "no purchase for 5h 20m" — never as a bare clock time.
   The elapsed form is what makes skipping the subtraction impossible.
   **If you cannot establish the current time with confidence, do not answer
   🟢.** Say which figure you are missing. A watchdog that cannot tell the time
   reporting all-clear is worse than one that admits it, because the user stops
   checking.

### `drop`

One call for the day-to-date figure, compared against
`rule.expected` for this weekday and the current hour. Fires when
`actual / expected ≤ condition.ratio`.

**Too quiet to judge is not an incident.** If the expectation for the elapsed
hours is under 5 events, answer 🟢 and say the window is too quiet to call.

### `spike`

The mirror: fires when `actual / expected ≥ condition.ratio`. A spike is not
demand until it converts, so name the referrer carrying it
(`get_top_referrers(period=today, limit=5)`, one call, only when it fires) and
what it did — its bounce and its conversions. No bot data: never say bots.

### `threshold`

One reading — `get_overview(period=today)` for revenue or entrances, or
`get_campaigns(period=today, sort_by=conversions, limit=50)` and read the row
for the campaign named in the rule, since that tool has no `utm_campaign`
filter — against `condition.below` or `condition.above`. Evaluate it on the last run inside
active hours, unless the rule says to fire as soon as it is crossed.

## Step 2 — Answer

**The answer opens with a symbol: 🟢, ⚠️, 🔴 or ⏸.** The words `on_track`,
`watch` and `act` belong to the run log in `runs.jsonl` and nowhere else. A
reader scanning a column of scheduled results reads the symbols; "act" at
the start of a line reads as a typo.

**Healthy.** One line, and it is the entire response:

```
🟢 no-conversions-4h: 6 conversions today, last one 18 minutes ago.
```

**"18 minutes ago", not "at 13:56".** The elapsed figure is the verdict in
miniature: a reader who sees it can check your arithmetic, and a reader who
sees a clock time cannot. This holds for 🟢, ⚠️ and 🔴 alike.

No greeting, no preamble, no offer to look deeper. A run that prints a
paragraph on a healthy site is a defect.

**Firing.** Twelve lines at most:

```
🔴 no-conversions-4h — no purchase since 11:20 (4h 40m).

Today: 3 purchases, all before noon, against 14 by this hour last Tuesday.
The last one was 11:20 local; the gap started there.

Check now: open a product page, add to cart and try to pay. If that works,
look at anything deployed after 11:20.
```

Every firing answer carries, in this order: what the rule is and the headline
number · **the time the silence or the drop began**, which is what the user
cross-references against their deploy log · one concrete thing to do in the
next two minutes · what was not checked.

⚠️ is the same shape with a softer verb: the condition is close but not met, or
the sample is thin.

## Step 3 — Cooldown

With a writable filesystem, read and write `last_fired` in
`<state-dir>/<site_id>/alerts.json`. A rule that fired and is still failing does
**not** fire again until it has recovered and broken a second time; say "still
open since <time>" instead, in one line.

Without a filesystem, say "still open since <time>" using the incident start you just computed from the data — never from a
remembered previous run, because there is none.

## What you do NOT do

- Do not widen the analysis. A firing alert is not a diagnosis; name
  `diagnose-drop` as the follow-up and stop.
- Do not run without a rule.
- Do not page the user outside active hours, whatever the data says.
- Do not report a figure you did not fetch in this run.
- No bot data: never call `get_bot_stats`, never say traffic comes from bots.
  Describe a spike by the referrer carrying it and what that traffic did.
