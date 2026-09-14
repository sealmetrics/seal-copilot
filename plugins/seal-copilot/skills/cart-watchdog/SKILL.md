---
name: cart-watchdog
description: >
  Intraday watchdog for add-to-cart activity. Detects unusual silence or
  spikes vs the site's own learned hour-of-week baseline (not a fixed
  threshold) and needs two bad readings in a row before alerting. Requires a baseline from the
  `calibrate-watchdog` skill. Trigger on: "is my cart alive", "check add to
  cart", "carrito parado", "cart watchdog", "no estamos vendiendo", "intraday
  alert", "checkout watchdog", or when run from a scheduled task. For hotels,
  substitutes `booking_start` for `add_to_cart`.
disable-model-invocation: true
short-description: 'Intraday check of add-to-cart against the learned baseline. Silent when healthy. Use for "check the cart", "is the cart working", "cómo va el carrito", or hourly runs.'
---

# Cart Watchdog

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Catch live problems — broken AtC button, payment outage, tracking gap —
before the daily report does. Budget: ≤6 tool calls. Designed for
**scheduled execution**, hourly during business hours.

## Step 0 — Load the baseline

Read `<state-dir>/<site_id>/watchdog-baseline.json`.

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

**Establish the current local hour before you compare, and say it in the
answer.** The whole verdict hangs on it: guess an hour too early and the
expectation shrinks to almost nothing, so a cart that has been dead since noon
reads as healthy. A run did exactly that — "2 add-to-carts by ~09:00 matches the
baseline" — hours after 09:00 had passed. **If you cannot establish the current
hour with confidence, do not answer 🟢.** Say which figure you are missing. A
watchdog that cannot tell the time and reports all-clear is worse than one that
admits it, because the user stops checking.

**Status from the ratio** `actual / expected_to_date`:

- 🟢 **Healthy** — ratio ≥ 0.5
- ⚠️ **Watch** — ratio between 0.2 and 0.5
- 🔴 **Act** — ratio < 0.2 **and** `last_status` was already ⚠️ or 🔴

A single low reading is never 🔴 on its own. Two consecutive are.

For spikes, mirror it: ratio ≥ 3 is 🔴, ≥ 2 is ⚠️ — and name the source
carrying it from step 3's `by_source` split. No bot data: never say bots.

**Quiet cells are not incidents.** If the sum of medians for the elapsed
hours is below 5 events, there is not enough signal — report 🟢 and say the
window is too quiet to judge.

## Step 2 — Locate the silence (1–2 calls, only if not 🟢)

`get_microconversions_raw(conversion_type=[<event>], period=today, limit=100)`

Rows carry `hour` (local, 0–23) and `timestamp_local`. Use `hour` to bucket
and `timestamp_local` for the most recent event. Page once more only if the
first page does not contain the latest activity.

Two extra signals from this:

- **Time since last event** vs the current cell's `gap`: more than 2× gap
  supports ⚠️, more than 3× gap supports 🔴.
- **When the drop started** — the last hour with normal-looking volume is the
  incident start time. Name it; it is what the user needs to match against
  their deploy log.

## Step 3 — Isolate the cause (≤2 calls, only if 🔴)

One call is enough — `get_microconversion_details(conversion_type=<event>,
period=today)` returns `by_device`, `by_source`, `by_country` and
`by_landing_page` together, each with `count` and `percentage`. Compare the
device and source splits against the baseline's usual mix.

Mobile-only drop after a deploy → tracking probably broken on the mobile
build. One-source drop with no other anomalies → that source paused or
blocked. Uniform drop → payment or cart outage; tell the user to test
manually now.

## Step 4 — Persist the status

Write `last_status` and the check timestamp back into the baseline file so the
next run can apply the two-consecutive-checks rule. If the file is not
writable, say once that consecutive-check escalation is unavailable.

## Output format

**One status line first:** `🟢 Healthy` / `⚠️ Watch — <reason>` / `🔴 Act
now — <reason>`.

If 🟢 and the run is scheduled: that single line is the entire response.
Do not pad. Silence on a healthy run is correct.

If ⚠️ or 🔴: add the evidence (today's count vs expected-to-date, time since
last event), the incident start time, the suspected cause from Step 3, and
one concrete action — e.g. "open a product page on mobile and try to add to
cart now".

## Scheduling guidance

Recommend hourly during business hours, and schedule **the command
`/seal-copilot:cart-watchdog`** — every hour from 8 am to midnight in the site
timezone. Not a sentence asking to check the cart: this skill is not invocable
by the model, so a scheduled sentence never reaches it. The skill is silent when
healthy, so it will not become noise. Offer the schedule once, after a
successful run.

## What you do NOT do

- Do not run without a baseline. Recommend `calibrate-watchdog` instead.
- Do not alert on a single quiet hour. Two consecutive checks, or nothing.
- Do not rebuild the baseline here — that is `calibrate-watchdog`'s job and it
  costs up to 40 calls.
- Do not page the user during scheduled night hours unless they opted in.

---

**Before the report, not after it:** log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `6` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
