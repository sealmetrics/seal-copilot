---
name: channel-mix-optimizer
description: >
  Suggests how to reallocate marketing budget across paid channels without
  needing ad-spend data, using Revenue Per Entrance, CR, and AOV from
  Sealmetrics. Trigger on: "where should I invest", "budget reallocation",
  "channel mix", "scale or cut", "qué canal escalar", "shift budget",
  "media plan", "what to scale", or any allocation question. Always pairs
  the recommendation with the caveat that ROAS requires real spend from the
  ad platform.
argument-hint: "[period]"
short-description: 'Reallocate paid budget across channels by revenue per entrance. Use for "which channel is best", "where should I spend", "budget allocation", "dónde invierto".'
---

# Channel Mix Optimizer

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

Recommend budget shifts across paid channels using **Revenue Per Entrance
(RPE)** as the proxy for ROAS. Budget: ≤10 tool calls.

**Resolve the site before any call that takes a `site_id`, without announcing
it.** If `list_sites` has not already run in this conversation, it is your first
call: one call, counted in the budget. Use anything cached under
`<state-dir>/<site_id>/` — profile, baseline, ledger, saved alert — only if that
`site_id` is in the list. If it is not, that state was written by another
Sealmetrics account on this machine: ignore it for this run, resolve the site
from the list, asking if there are several, and never delete the other
account's files. Rules in `skills/seal-copilot/references/state-schema.md`, "A
cached site belongs to one connection".

## Why RPE (and why state the caveat)

Sealmetrics has no ad spend. ROAS = revenue / spend is impossible from
this data alone. But RPE = revenue / entrances is a leading proxy: at
similar CPCs, the channel with higher RPE has higher ROAS. **Always tell
the user that proportional spend is the working assumption and to pull
real CPC/CPM from the ad platform to confirm.** Never present RPE as ROAS.

## Step 1 — Map the paid channels

1. `get_top_channels(period=90d)` — full channel list.
2. `get_traffic_mediums(period=30d)` — this is where paid and organic actually
   split, and it is the main route: treat `cpc`, `paid`, `display`,
   `paidsocial`, `cpm`, `ppc` as paid, and say that is the classification you
   used.
3. **(local only)** `list_channel_rules` — the user's own classification, which
   beats the default above when it exists. Not announced on `remote`, so on
   that connector step 2 is the whole answer and there is nothing to report as
   missing.

## Step 2 — Channel-level scorecard

For each paid channel pull (≤4 calls total via the compact `get_top_*`
where possible):

- `get_top_channels(period=this_quarter)` and `get_top_channels(period=last_quarter)`
  — volume + trend. `get_top_channels` has no `compare`; diff the pair yourself.
- `get_traffic_mediums(period=90d, compare=previous)` — conversions and
  revenue per medium in one call, which is where paid/organic actually splits.
- AOV per paid channel: `get_conversions(period=90d, utm_medium=<paid medium>)`
  once per medium (≤4 calls). There is no `group_by` on `get_conversions`.

Compute per channel:

| Metric | Formula | Use |
|---|---|---|
| Entrances | from get_top_channels | volume |
| CR | conversions / entrances | quality |
| AOV | revenue / conversions | ticket |
| **RPE** | revenue / entrances | the ranking metric |
| Trend | RPE this 30d vs previous 30d | momentum |

Site weighted-average RPE is the reference line.

## Step 3 — Campaign-level inside each paid channel

For the top 2 paid channels by revenue:

`get_campaigns(period=90d, sort_by=revenue, limit=20, utm_medium=<paid>,
compare=previous)`

Apply per-campaign:

- **Scale candidate** — RPE ≥ 1.3 × channel RPE AND ≥30 conversions AND
  trend ≥ flat.
- **Cut/optimize candidate** — RPE ≤ 0.5 × channel RPE AND ≥500
  entrances AND ≥30d running.
- **Maintain** — neither.

## Step 4 — Cross-channel reallocation logic

The recommendation is **relative**, not absolute. Use the form:

> "Channel A delivers €X per entrance vs Channel B's €Y. Assuming similar
> CPC, every euro shifted from B to A should produce ≈ X/Y times more
> revenue. To confirm, pull CPC from your ads platform and compare
> CPC×(1/CR_A)×AOV_A vs CPC×(1/CR_B)×AOV_B."

Never tell the user "spend more on Google, less on Meta" as an absolute —
budget decisions need their cost reality. Provide the **ratio** and the
**verification formula**.

## Output format

1. **Channel scorecard table** (paid channels only): entrances · CR · AOV
   · RPE · RPE vs site avg · 90d trend.
2. **Top 3 scale candidates** (campaign level): name · entrances · CR ·
   AOV · RPE · why · expected € lift at constant CPC.
3. **Top 3 cut/optimize candidates:** name · entrances · CR · AOV · RPE ·
   why · what to test first (creative / landing / audience) before cutting.
4. **Cross-channel ratios:** "1 € from <weakest paid channel> ≈ K € from
   <strongest paid channel>, assuming equal CPC. Verify CPC on each
   platform before shifting budget."
5. **Caveats line:** state the proportional-CPC assumption and recommend
   pulling spend from the ad platform.

## What you do NOT do

- Do not claim ROAS — repeat: Sealmetrics has no spend data.
- Do not recommend cutting an upper-funnel channel (display, broad social
  awareness) on RPE alone; last non-direct click undervalues assists — flag it.
- Do not recommend scaling a campaign with <30 conversions; flag as
  "directional only".
- Do not propose absolute budget numbers; propose ratios and tests.

---

**Before the report, not after it, with the Read and Write tools — never a shell:** log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `10` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
