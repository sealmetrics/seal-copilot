---
name: diagnose-drop
description: >
  Root-cause diagnosis for a drop or spike in Sealmetrics metrics. Trigger
  on: "why did conversions drop", "why did sales fall", "traffic spiked,
  why", "what happened yesterday/this week", "qué ha pasado con", "revenue
  is down", or any cause-seeking question about a metric change.
argument-hint: "[metric] [period]"
short-description: 'Root-cause diagnosis of a drop or spike. Use for "why did conversions drop", "sales fell", "traffic spiked, why", "what happened this week", "qué ha pasado con", "revenue is down".'
---

# Diagnose Drop (or Spike)

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

Isolate the root cause of a metric change. Budget: ≤12 tool calls.
Follow the cause hierarchy from
`skills/seal-copilot/references/methodology.md` strictly — work down,
stop at the first isolated cause.

## Procedure

0. Confirm the change: `get_overview` for the affected period with
   `compare=previous`. Totals are under `traffic` / `conversions`; the delta
   is `traffic_change` / `conversions_change`; the daily `*_series` show
   exactly which day it broke. If the user's claim is not visible in data, say so
   and show what you see instead.
1. **Tracking, or a rise that is not demand.** No bot data here — never call
   `get_bot_stats` or `get_suspicious_sessions`, and never say traffic comes
   from bots (see "No bot data" in `methodology.md`). **For a spike**, call
   `get_top_referrers` before you go looking at channels: a single referrer
   carrying the rise at 90%+ bounce and almost no conversions is not demand,
   and the diagnosis is not finished until its name is in the cause statement
   with what it did — "cheap-traffic.example sent 21,900 entrances at 95%
   bounce and 5 conversions; exclude it from decisions and block it at the CDN
   if you control the source". Do not tell the user to go and look. That call
   takes priority over every optional one, including anything gathered only to
   fill `profile.json`. Sudden near-zero on one page →
   check `get_pages(path_filter=...)` for a tag lost in a deploy. For a
   broken microconversion event (cart, checkout), compare
   `get_microconversions(period=30d, compare=previous)` per type — a single type
   collapsing while others hold is an instrumentation regression, not a
   demand problem. Cross-reference the `cart-watchdog` baseline if AtC is
   the affected metric.
2. **Channel:** `get_top_channels(period=this_week)` vs
   `get_top_channels(period=last_week)` (or the `this_month`/`last_month` pair for
   a monthly drop) — `get_top_channels` has no `compare`, so diff the pair
   yourself. All channels down evenly → jump to step 7.
3. **Campaign:** `get_campaigns(compare=previous, sort_by=conversions)`,
   filtered with `utm_source` / `utm_medium` to the channel that moved.
   **It has to be this tool.** `get_top_campaigns` is compact and tempting, and
   it ignores `compare` silently — it would hand you the campaign's 2
   conversions today and nothing to compare them against, and the cause
   statement this skill owes is "230 → 2", not "2". A drill-down that cannot
   show the prior period has not isolated anything.
4. **Landing/term:** `get_landing_pages(compare=previous)` and/or
   `get_terms(compare=previous)` filtered to the campaign.
5. **Device/country/browser:** `get_devices(compare=previous)` returns
   `by_device`, `by_browser` and `by_os` in one response, each row with
   `*_prev` twins — no separate browser or OS call needed. Add
   `get_countries(compare=previous)`. A collapse isolated to Safari, or to
   one iOS version, points at ITP or a rendering bug, not at demand.
   Country is timezone-derived — treat a country-only signal as directional.
6. **Product/SKU** (ecommerce only): if the drop concentrates on
   purchases but channels look uniform, run `get_property_breakdown` on
   the product identifier from `list_property_keys` for the affected vs
   prior period — a single SKU going out of stock or losing a top
   variant can move overall revenue noticeably.
7. **Seasonality — addressed, never skipped.** Re-run `get_overview` with
   `compare=yoy`: flat year over year means seasonal, so say so and stop. You
   may skip that call **only** when the isolation itself excludes seasonality —
   a single campaign or channel collapsed while its neighbours held flat, and
   no season does that to one line and not the others. Then say which of the
   two ruled it out. Seasonality does not get to go unmentioned because the
   cause looked obvious.
8. **Market-wide:** if nothing isolates, state it plainly.

## Output format

All four sections are **mandatory**, in this order. A one-line summary is not
an acceptable answer to this skill even when the cause is obvious: the user
cannot act on "it was campaign X" without the evidence, the fix and the check.

1. **Cause statement** — one sentence: "The drop is isolated to [X]:
   [numbers]." State confidence (high/medium/low per sample size).
2. **Evidence chain** — the 2–4 data points that led there, with numbers.
3. **Action** — what to do about it, with estimated recovery impact.
4. **Verification** — what to re-check and when. Never omit this. A diagnosis
   the user cannot confirm in a week is an opinion, not a finding.

Do not report how many tool calls you used either. The budget is an internal
constraint on you, not information for the user.

If the change is a spike, check it converts and name the referrer carrying it (step 1) before celebrating.
Never speculate beyond the data — if two causes remain plausible, present
both with their evidence.

---

**Before the report, not after it, with the Read and Write tools — never a shell:** log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `12` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
