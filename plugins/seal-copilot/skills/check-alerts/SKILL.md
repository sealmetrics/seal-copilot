---
name: check-alerts
description: >
  Evaluates one alert rule created by `create-alert` and answers in a single
  line when the site is healthy. Runs from a scheduled task, with the rule in
  its prompt, so it needs no stored state. Trigger only when a scheduled alert
  check fires, or when the user asks to run a named alert now — never from a
  general question about traffic.
disable-model-invocation: true
short-description: 'Evaluate one alert rule and stay silent unless it fires. Runs from a scheduled task with the rule in its prompt. Use for "run my alert now" or a scheduled check.'
---

# Check Alerts

Before writing your answer, read `examples/output.md` in this skill directory
and match its density. A healthy run is one line; nothing about this skill is
allowed to be chatty.

Budget: ≤3 tool calls per rule. Silence when healthy is the product — an alert
that talks every hour is one the user mutes.

## Step 0 — Read the rule and the clock

The rule arrives as JSON in the prompt. If it did not, say in one line that
this skill runs from a rule and point at `create-alert`. Do not invent a rule,
and do not fall back to a general health check.

Work out the local time in `rule.timezone`. **If now is outside
`active_hours`, stop.** Answer `🟢 <id>: outside watch hours` and make zero
calls. Most of a day's runs end here, and that is correct.

## Step 1 — Evaluate, by family

State-free by design: a scheduled run may have no filesystem, so everything the
verdict needs is either in the rule or in the calls below.

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
4. Fires when `now − last event ≥ condition.hours`, counting only active hours.

### `drop`

One call for the day-to-date figure, compared against
`rule.expected` for this weekday and the current hour. Fires when
`actual / expected ≤ condition.ratio`.

**Too quiet to judge is not an incident.** If the expectation for the elapsed
hours is under 5 events, answer 🟢 and say the window is too quiet to call.

### `spike`

The mirror: fires when `actual / expected ≥ condition.ratio`. Traffic quality
cannot be validated from here, so say the spike is unvalidated for bots and
name the top referrer as the thing to look at
(`get_top_referrers(period=today, limit=5)`, one call, only when it fires).

### `threshold`

One reading — `get_overview(period=today)` for revenue or entrances, or
`get_campaigns(period=today, sort_by=conversions, limit=50)` and read the row
for the campaign named in the rule, since that tool has no `utm_campaign`
filter — against `condition.below` or `condition.above`. Evaluate it on the last run inside
active hours, unless the rule says to fire as soon as it is crossed.

## Step 2 — Answer

**Healthy.** One line, and it is the entire response:

```
🟢 no-conversions-4h: 6 conversions today, last one 18 minutes ago.
```

No greeting, no preamble, no offer to look deeper. A scheduled run that prints
a paragraph on a healthy site is a defect.

**Firing.** Twelve lines at most:

```
🔴 no-conversions-4h — no purchase since 11:20 (4h 40m).

Today: 3 purchases, all before noon, against 14 by this hour last Tuesday.
The last one was 11:20 local; the gap started there.

Check now: open a product page, add to cart and try to pay. If that works,
look at anything deployed after 11:20.

Not checked: traffic quality — this connector does not announce it.
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

Without a filesystem, the cadence is the only limit. Say "still open since
<time>" using the incident start you just computed from the data — never from a
remembered previous run, because there is none.

## What you do NOT do

- Do not widen the analysis. A firing alert is not a diagnosis; name
  `diagnose-drop` as the follow-up and stop.
- Do not run without a rule.
- Do not page the user outside active hours, whatever the data says.
- Do not report a figure you did not fetch in this run.
- Do not claim anything about bot activity: the connector this runs on does not
  announce those tools, so every spike is reported unvalidated.

---

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `3` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`), `scheduled` (boolean), `notes` (one line).
Skip silently if the path is not writable — which, on a scheduled run, is the
normal case.
