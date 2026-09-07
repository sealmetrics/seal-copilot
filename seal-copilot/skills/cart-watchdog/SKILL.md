---
name: cart-watchdog
description: >
  Intraday watchdog for add-to-cart activity. Detects unusual silence or
  spikes vs the site's own learned hour-of-week baseline (not a fixed
  threshold) and rules out bots before alerting. Requires a baseline from the
  `calibrate-watchdog` skill. Trigger on: "is my cart alive", "check add to
  cart", "carrito parado", "cart watchdog", "no estamos vendiendo", "intraday
  alert", "checkout watchdog", or when run from a scheduled task. For hotels,
  substitutes `booking_start` for `add_to_cart`.
disable-model-invocation: true
---

# Cart Watchdog

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Catch live problems — broken AtC button, payment outage, tracking gap —
before the daily report does. Budget: ≤6 tool calls. Designed for
**scheduled execution**, hourly during business hours.

## Step 0 — Load the baseline

Read `~/.seal-copilot/<site_id>/watchdog-baseline.json`.

- **No file** → do not improvise a threshold. Reply in one line: *"No baseline
  yet — run `calibrate-watchdog` once and I can watch this properly."* Stop.
- **Expired** (`expires_at` in the past) → still run, but prefix the status
  with "baseline stale, recalibrate" and widen every threshold by half.
- **Mode C** (daily-only baseline) → skip the hourly logic below and judge on
  the day-to-date total alone. Say that hour-level detail is unavailable.

The file also carries `last_status` from the previous run. You need it: a 🔴
requires two consecutive bad checks, and this is the only way to know about
the previous one.

## Step 1 — Today's volume so far (1 call)

`get_microconversions(conversion_type=<event>, period=today)`

This returns the day total, not an hourly series. Compare it against the
baseline's `cumulative[day_of_week][current_hour]` — the expected count for
the hours elapsed so far today, in the site's timezone.

**Status from the ratio** `actual / expected_to_date`:

- 🟢 **Healthy** — ratio ≥ 0.5
- ⚠️ **Watch** — ratio between 0.2 and 0.5
- 🔴 **Act** — ratio < 0.2 **and** `last_status` was already ⚠️ or 🔴

A single low reading is never 🔴 on its own. Two consecutive are.

For spikes, mirror it: ratio ≥ 3 is 🔴 (likely bots), ≥ 2 is ⚠️.

**Quiet cells are not incidents.** If the sum of medians for the elapsed
hours is below 5 events, there is not enough signal — report 🟢 and say the
window is too quiet to judge.

## Step 2 — Locate the silence (1–2 calls, only if not 🟢)

`get_microconversions_raw(conversion_type=[<event>], period=today, limit=100)`

Read `timestamp_local` from the rows to find the most recent event. Page once
more only if the first page does not contain the latest activity.

Two extra signals from this:

- **Time since last event** vs the current cell's `gap`: more than 2× gap
  supports ⚠️, more than 3× gap supports 🔴.
- **When the drop started** — the last hour with normal-looking volume is the
  incident start time. Name it; it is what the user needs to match against
  their deploy log.

## Step 3 — Rule out bots (1 call, mandatory before any 🔴)

`get_bot_stats(days=1)`

- Drop coinciding with a bot spike → the drop is real but the metric was
  previously inflated. Say so and recommend recalibrating.
- Spike that is bots → demote 🔴 to ⚠️ "bot inflation" and explain.
- **Empty result** → agent analytics is off, not 0% bots. Keep the status but
  mark it "unvalidated for bots" (see `methodology.md`).

## Step 4 — Isolate the cause (≤2 calls, only if 🔴)

`get_microconversion_details` has no `group_by`; make one filtered call per
segment you want to compare:

1. `get_microconversion_details(conversion_type=<event>, period=today,
   device_type='mobile')` and the same with `device_type='desktop'`

or, when device looks even:

2. `get_microconversion_details(conversion_type=<event>, period=today,
   utm_source='<top source>')`

Mobile-only drop after a deploy → tracking probably broken on the mobile
build. One-source drop with no other anomalies → that source paused or
blocked. Uniform drop → payment or cart outage; tell the user to test
manually now.

## Step 5 — Persist the status

Write `last_status` and the check timestamp back into the baseline file so the
next run can apply the two-consecutive-checks rule. If the file is not
writable, say once that consecutive-check escalation is unavailable.

## Output format

**One status line first:** `🟢 Healthy` / `⚠️ Watch — <reason>` / `🔴 Act
now — <reason>`.

If 🟢 and the run is scheduled: that single line is the entire response.
Do not pad. Silence on a healthy run is correct.

If ⚠️ or 🔴: add the evidence (today's count vs expected-to-date, time since
last event), the incident start time, the suspected cause from Step 4, and
one concrete action — e.g. "open a product page on mobile and try to add to
cart now".

## Scheduling guidance

Recommend hourly during business hours: *"Run cart-watchdog every hour from
8 am to midnight in [site timezone]."* The skill is silent when healthy, so
it will not become noise. Offer the schedule once, after a successful run.

## What you do NOT do

- Do not run without a baseline. Recommend `calibrate-watchdog` instead.
- Do not alert on a single quiet hour. Two consecutive checks, or nothing.
- Do not rebuild the baseline here — that is `calibrate-watchdog`'s job and it
  costs up to 40 calls.
- Do not page the user during scheduled night hours unless they opted in.

---

Log the run in `~/.seal-copilot/<site_id>/runs.jsonl` (skill, calls used,
budget, verdict) so budget compliance is measurable. Skip silently if the
path is not writable.
