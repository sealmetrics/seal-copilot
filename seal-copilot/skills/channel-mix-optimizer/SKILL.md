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
---

# Channel Mix Optimizer

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Recommend budget shifts across paid channels using **Revenue Per Entrance
(RPE)** as the proxy for ROAS. Budget: ≤10 tool calls.

## Why RPE (and why state the caveat)

Sealmetrics has no ad spend. ROAS = revenue / spend is impossible from
this data alone. But RPE = revenue / entrances is a leading proxy: at
similar CPCs, the channel with higher RPE has higher ROAS. **Always tell
the user that proportional spend is the working assumption and to pull
real CPC/CPM from the ad platform to confirm.** Never present RPE as ROAS.

## Step 1 — Map the paid channels

1. `get_channels(period=90d)` — full channel list.
2. `list_channel_rules` — confirm which channels the user classifies as
   paid (Paid Search, Paid Social, Display, Affiliates, Paid Email…).

If the user has not configured paid vs organic split well, run
`get_traffic_mediums(period=30d)` and treat `cpc`, `paid`, `display`,
`paidsocial`, `cpm`, `ppc` as paid by default; say so.

## Step 2 — Channel-level scorecard

For each paid channel pull (≤4 calls total via the compact `get_top_*`
where possible):

- `get_channels(period=this_quarter)` and `get_channels(period=last_quarter)`
  — volume + trend. `get_channels` has no `compare`; diff the pair yourself.
- `get_traffic_mediums(period=90d, compare=previous)` — conversions and
  revenue per medium in one call, which is where paid/organic actually splits.
- AOV per paid channel: `get_conversions(period=90d, utm_medium=<paid medium>)`
  once per medium (≤4 calls). There is no `group_by` on `get_conversions`.

Compute per channel:

| Metric | Formula | Use |
|---|---|---|
| Entrances | from get_channels | volume |
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

Log the run in `<state-dir>/<site_id>/runs.jsonl` (skill, calls used,
budget, verdict) so budget compliance is measurable. Skip silently if the
path is not writable.
