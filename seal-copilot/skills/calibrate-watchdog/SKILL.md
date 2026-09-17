---
name: calibrate-watchdog
description: >
  One-off calibration run that learns a site's natural add-to-cart (or
  booking-start) rhythm and stores it as the baseline the hourly watchdog
  compares against. Run once per site before scheduling `cart-watchdog`, and
  again after any tracking change or a major shift in traffic volume. Trigger
  on: "calibrate the watchdog", "set up cart monitoring", "learn my cart
  baseline", "calibrar el vigilante", "prepare the watchdog", or when
  `cart-watchdog` reports that no baseline exists.
disable-model-invocation: true
short-description: 'Learn a site''s hourly add-to-cart rhythm so the watchdog has a baseline. Run once before cart-watchdog. Use for "calibrate watchdog", "calibrar", "set up monitoring".'
---

# Calibrate Watchdog

**Follow `skills/seal-copilot/references/run-protocol.md`:** no text until the answer, resolve the site with `list_sites` first, write state to the schema before answering, log the run. Match `examples/output.md`.

Budget: **≤40 Sealmetrics calls** — high because this runs once per site and
every later watchdog run then costs ≤6.

Build the hour-of-week baseline that makes intraday monitoring meaningful, and
store it so the hourly watchdog never has to rebuild it.

This is a **manual, explicit** skill. Never run it from a casual question and
never run it on a schedule.

## Why this is a separate skill

The MCP has no hourly time series on the aggregated tools. Hourly counts come
only from `get_microconversions_raw`, which is capped at a 31-day range and
100 rows per page. Rebuilding a 4-week baseline on every hourly check would
cost hundreds of calls, so the baseline is built once, here, and cached.

## Step 1 — Identify the watched event and the volume

1. `list_microconversion_types` — pick the add-to-cart equivalent for stores
   (`add_to_cart`, `add_to_basket`, `atc`, `cart_add`) or `booking_start` and
   equivalents for hotels. State which event you chose.
2. `get_microconversions(conversion_type=<event>, period=30d)` — the 30-day
   total. This decides the calibration mode and costs one call.

| 30d volume | Mode | What you build |
|---|---|---|
| ≤ 4,000 events | **A — full** | 168 cells (day-of-week × hour) from 28 days |
| 4,001 – 30,000 | **B — sampled** | 168 cells from the most recent complete week |
| > 30,000 | **C — daily** | 7 day-of-week daily medians, no hourly detail |

Say which mode you used and why. The mode goes in the stored baseline.

## Step 2 — Pull the events

**Mode A.** Four windows of 7 days, walking back 28 days. For each window:

```
get_microconversions_raw(conversion_type=[<event>], start_date=YYYY-MM-DD,
  end_date=YYYY-MM-DD, limit=100, page=1…)
```

Page until a page returns fewer than 100 rows, or until 9 pages in that
window — whichever comes first. Hard cap 36 pages across all four windows.

**Mode B.** The most recent complete Monday–Sunday week only, same call,
paging up to 30 pages. A single week is a real shape but a noisier one: store
`weeks: 1` so the watchdog widens its tolerance.

**Mode C.** Skip the raw tool entirely. Make 7 calls, one per day of the last
complete week:

```
get_microconversions(conversion_type=<event>, start_date=D, end_date=D)
```

That gives a daily total per day of week. At this volume an outage is visible
within an hour at day level, so hourly cells are not worth 300 calls.

If any window returns zero rows, say the event has no data in that period and
stop — a baseline built on nothing is worse than none.

## Step 3 — Build the baseline

Every row carries `date`, `hour` (local, 0–23) and `timestamp_local`. Bucket
by `date` and `hour` directly — do not parse the timestamp, and never use
`timestamp_utc`, since the site's own day boundaries are what matter.

**Modes A and B. Do not bucket 168 cells by hand** — pipe the raw rows to the
calculator, which returns `cells`, `cumulative` and `daily_median` already in
the shape `watchdog-baseline.json` requires:

```
echo '<the raw rows>' | node skills/seal-copilot/scripts/calc.mjs baseline-168
```

Each cell carries `median` (across the weeks you have) and `gap` (typical
minutes between events). `cumulative[dow][h]` is the sum of medians for hours
0…h, which is what the watchdog compares a running day-to-date total against,
because the aggregate tool returns a day total and not an hourly series. An
hour with no events on a date that *is* in the data counts as a real zero, not
as missing — the calculator handles that; a hand count does not.

**Mode C.** Store each day-of-week total as `median` with a flat hourly share,
and say explicitly that hour-level judgments are unavailable in this mode.

## Step 4 — Store it

Write `<state-dir>/<site_id>/watchdog-baseline.json`:

```json
{
  "site_id": "...",
  "event": "add_to_cart",
  "mode": "A",
  "weeks": 4,
  "calibrated_at": "2026-09-07",
  "expires_at": "2026-10-07",
  "cells": { "mon": { "0": {"median": 2, "gap": 30}, "1": {...} }, "tue": {...} },
  "cumulative": { "mon": [0, 2, 3, 5, ...] },
  "daily_median": { "mon": 140, "tue": 155, ... },
  "last_status": null
}
```

Create the directory if it does not exist. If the filesystem is not writable
(some sandboxed environments), say so plainly and print the baseline as a
JSON block for the user to save themselves — the watchdog can be pasted the
baseline instead of reading it.

## Step 5 — Report and hand off

Output, in under 15 lines:

1. **Event watched** and the mode chosen, with the 30-day volume that decided it.
2. **Rhythm summary:** busiest hour-of-week and quietest, with their medians.
   This is the sanity check — if the busiest hour looks wrong to the user,
   the event mapping is probably wrong.
3. **Confidence line:** weeks of data used, and any cell with a median below
   5, which the watchdog will treat as too quiet to judge.
4. **Expiry:** the baseline goes stale in 30 days or after any tracking change.
5. **Next step:** offer to schedule `cart-watchdog` hourly during business
   hours, and give the exact command to schedule: `/seal-copilot:cart-watchdog`.
   A sentence will not reach it; the skill is not invocable by the model.

## What you do NOT do

- Do not run on a schedule, and do not run because someone asked a general
  question about carts.
- Do not build a baseline from fewer than 7 days of data. Say the site needs
  more history and stop.
- Do not exceed the page caps to get a "better" baseline — a sampled baseline
  that exists beats a perfect one that costs 300 calls.
- Do not overwrite an existing baseline without saying what changed
  (event, mode, or median volume) versus the previous one.
