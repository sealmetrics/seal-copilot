# Analysis Methodology

Reference for thresholds, diagnosis order, statistical discipline, and how to
talk to the Sealmetrics MCP correctly. All thresholds are defaults — adjust if
the customer states their own.

## Attribution and data caveats (state these when they matter)

Sealmetrics uses **last non-direct click, consentless attribution**, measured
server-side. Say this once, in the user's language, before any channel or
campaign reading:

> Sealmetrics measures last non-direct click, consentless, server-side.
> Numbers will not match GA4 (data-driven attribution, consent-dependent) or
> ad platform dashboards (platform-side click/view attribution).

Two more caveats that change recommendations:

- **Country is derived from browser timezone, not IP geolocation.** Treat
  country splits as directional. Never recommend a geo-targeted campaign on
  country data alone: require CR above site average **and** ≥30 conversions
  **and** one corroborating signal (language in `get_terms`, a localized
  landing path in `get_landing_pages`). Never use country for VAT, legal, or
  compliance claims.
- **Upper-funnel channels are undervalued by definition.** Never recommend
  cutting display or broad social awareness on last non-direct click data alone.

## MCP call rules (get these wrong and the analysis is silently wrong)

**`compare` is not universal.** It is supported on `get_overview`,
`get_traffic_sources`, `get_traffic_mediums`, `get_campaigns`, `get_terms`,
`get_pages`, `get_landing_pages`, `get_conversions`, `get_microconversions`,
`get_countries`, `get_devices`. It is **not** supported on `get_channels`,
`get_top_channels`, any `get_top_*` variant, `get_device_types`, the `*_raw`
tools, or any `list_*` tool. **Passing `compare` to a tool that ignores it
returns single-period data silently** — you will report "no change" on data
that never contained a comparison.

**Comparing channels period over period** therefore takes two calls with a
**calendar-pair preset**, diffed by you:

- `get_channels(period=this_week)` vs `get_channels(period=last_week)`
- `get_channels(period=this_month)` vs `get_channels(period=last_month)`
- `get_channels(period=this_quarter)` vs `get_channels(period=last_quarter)`

`30d` has no matching prior-window preset. When you need a rolling 30-day
channel comparison, use `start_date`/`end_date` for both windows instead.

**Valid `period` presets only:** `today`, `yesterday`, `7d`, `30d`, `90d`,
`12m`, `this_week`, `wtd`, `last_week`, `this_month`, `mtd`, `last_month`,
`this_quarter`, `qtd`, `last_quarter`, `this_year`, `ytd`, `last_year`.
There is no `last_28_days` or `last_30_days` form. For an arbitrary window,
pass `start_date` and `end_date` (account-timezone local days).

**Parameter names that are easy to get wrong:**

| Tool | Correct usage |
|---|---|
| `get_bot_stats` | `days` (1–90), not `period` |
| `get_suspicious_sessions` | `limit`, `min_score` only — no period |
| `get_microconversions` | `conversion_type`, not `type` |
| `get_microconversion_details` | `conversion_type` + filters (`device_type`, `utm_source`, `country`, `browser`, `os`). There is **no** `group_by` — segment by making one filtered call per segment |
| `get_property_breakdown` | `property_key`, `table`, `conversion_type`, `period`. No `limit`, no `sort_by` — it returns the full pivot; rank and truncate yourself |
| `get_property_values` | `group_by` accepts only `utm_source`, `utm_medium`, `utm_campaign`, `all`. It cannot filter to a single property value |
| `get_campaigns` | No `country` filter. Use `get_top_campaigns(country=XX)` for geo screening |
| `get_top_campaigns` | No `sort_by` — it is ranked by entrances |
| `get_alert_history` | `limit`, `offset`, `rule_id`, `status` — no period |
| `get_channels`, `get_device_types` | No `compare`, no `sort_by` |

**Raw tools** (`get_conversions_raw`, `get_microconversions_raw`,
`get_conversion_items_raw`): one row per event, `conversion_type` takes an
**array**, range capped at 31 days, ≤100 rows per page. Use them for per-event
or per-product detail, never for macro windows. `get_conversion_items_raw` is
the right tool for per-product analysis — item properties (`sku`, `price`,
`quantity`) are always included.

## Default thresholds

| Concept | Default |
|---|---|
| Anomaly | ±25% vs comparable period (previous or yoy) |
| Significant change worth mentioning | ±20% in conversions or revenue |
| Minimum sample for a confident claim | 30 conversions per cell |
| Minimum volume to compare a CR | 200 entrances for a landing or campaign |
| Leaky campaign | CR < 40% of channel average with ≥500 entrances |
| Broken landing | bounce > channel average + 20 points, with paid traffic |
| Device gap | mobile CR < 50% of desktop CR |
| Dead keyword | ≥200 entrances and 0 conversions over 90d |
| Channel drift | decline vs previous for 3+ consecutive weeks |
| Catalog friction (per-SKU) | view→AtC ratio ≤ 40% of site median, ≥30 views in 30d |
| Hidden gem (per-SKU) | view→AtC ratio ≥ 2× site median, bottom-half views |
| RPE gap between paid channels | strongest paid RPE ≥ 2× weakest paid RPE, both ≥30 conversions |
| Bot tax flag | bot share ≥15% of total sessions, or one source ≥40% bot share |
| Watchdog 🔴 (intraday) | current count <20% of baseline cell median for 2 consecutive hours, no bot anomaly |

Below the minimum sample or the minimum volume, label the finding
**"directional — low sample"**. Do not drop it silently and do not present it
as fact.

## The bot check has three outcomes, not two

`get_bot_stats(days=N)` is mandatory before reporting any spike, drop, or
anomaly. Read the result correctly:

1. **Data returned** — use it. Bot share ≥15%, or one source ≥40%, is itself
   the finding.
2. **Empty result** (`total_hits: 0`, zero-filled distribution) — this means
   **agent analytics is not enabled on the site**, not that the site has zero
   bots. Never report "0% bots". Say: *"Traffic-quality data unavailable for
   this period — agent analytics may not be enabled on this site."* Mark every
   anomaly in that report **"unvalidated for bots"** and recommend enabling it.
3. **403 / access denied** — a permissions problem, not a data problem. Say so
   plainly, do not retry, and continue the analysis with the same
   "unvalidated" marking.

## Cause hierarchy for any drop or spike

Work down this list and stop at the first isolated cause:

1. **Bots / tracking failure** — `get_bot_stats(days=…)`,
   `get_suspicious_sessions(min_score=70)`. A spike concentrated in one source
   with high bot scores is not growth. A sudden drop to near-zero on one page
   may be a tag removed in a deploy (check `get_pages(path_filter=…)`).
2. **One channel** — `get_channels` on a calendar pair (see MCP call rules).
   If all channels fell evenly, skip to step 6.
3. **One campaign** — `get_campaigns(compare=previous, sort_by=conversions)`
   filtered with `utm_source` / `utm_medium` to the moved channel.
4. **One landing or term** — `get_landing_pages(compare=previous)`,
   `get_terms(compare=previous)` filtered to the campaign.
5. **One device, country, or browser** — `get_devices(compare=previous)`,
   `get_countries(compare=previous)`, `get_browsers`. A collapse isolated to
   Safari or iOS points at ITP or a rendering bug, not at demand.
6. **Seasonality** — re-run the comparison with `compare=yoy`. If yoy is flat
   while previous-period is down, it is seasonal — say so and stop.
7. **Market-wide** — if nothing isolates, state that the decline is broad and
   suggest external factors (demand, competition, pricing).

## Triangulation rule

No recommendation from a single metric. Examples:

- Low CR + high bounce + mobile only → mobile landing/checkout problem.
- Low CR + normal bounce → offer/price problem, not UX.
- Microconversions up + conversions flat → final funnel step broken.
- Entrances up + revenue flat + one source + high bot score → bots.

## Quantifying impact

Estimated impact = (metric gap) × (affected volume) × (value per conversion).
Example: campaign with 2,000 entrances at CR 0.8% vs channel average 2.0%:
closing the gap is worth (2.0%−0.8%) × 2,000 = 24 extra conversions/period
× AOV. State the assumption used. Round honestly; do not fake precision.

## Revenue Per Entrance (RPE) — the cross-channel proxy

`RPE = revenue / entrances`. Use it to compare paid channels when ad spend
is unavailable (the default in Sealmetrics). At similar CPC, the channel
with higher RPE has higher ROAS — but Sealmetrics cannot prove that on
its own. Always state the proportional-CPC assumption and recommend
pulling real spend before moving budget. Never label RPE as ROAS.

## Intraday baseline math (watchdogs)

For event-rate watchdogs, build a **day-of-week × hour-of-day** matrix
(168 cells) from the last 4 weeks. For each cell store the median event
count. Compare current activity to the **matching cell**, not the daily
average — a quiet 3 am Sunday is normal and should not page anyone.

The MCP has no hourly time series on the aggregated tools. Hourly counts come
from `get_microconversions_raw`, which returns ≤100 rows per page over a
≤31-day range, so the baseline is expensive and is built **once** by the
`calibrate-watchdog` skill and stored, not rebuilt on every check. With fewer
than 4 full weeks, or a median below 5 events per cell, fall back to a
day-of-week daily baseline and say the baseline is still warming up.

## Product-level (SKU) analysis

Product identifiers vary by integration. Probe `list_property_keys(table=
conversion_items)` first — item properties are where `sku`, `product_id`,
`price` and `quantity` live — then `table=microconversions`. Accept the first
of `sku`, `product_id`, `item_id`, `product_name`, `product_sku`, `id`, `name`
that exists, and confirm the **same** key appears on both the view and the
add-to-cart event; different identifiers on different events is a common
integration bug and blocks the analysis.

Compute view→AtC per SKU from two `get_property_breakdown` calls, and
AtC→purchase from `get_conversion_items_raw`. Site median is the reference
line. Drop SKUs with <30 views (low confidence). Drill the worst friction SKUs
by device and source with filtered `get_microconversions_raw` calls.

## Verification plan

Every recommendation ends with how to verify: the tool to re-run, the
period to wait (2–4 weeks or one full booking cycle for hotels), and the
metric that should move.

## Failure modes

| Situation | Behavior |
|---|---|
| No `SEALMETRICS_API_KEY` | Do not call the MCP. Tell the user to generate a token at my.sealmetrics.com → Settings → API Tokens and set the variable |
| 401 / 403 | "Permission problem, not a data problem." Do not retry. Say where to regenerate the token |
| Multiple sites, no `SEALMETRICS_SITE_ID` | List sites by name and URL, ask which one, then proceed |
| Fewer than 14 days of data | Skip yoy, warn that comparisons are noisy, label every verdict directional |
| Fewer than 30 conversions in the period | Report KPIs only; do not issue findings or impact estimates |
| A tool returns empty | Say so. Never fill the gap. If `list_microconversion_types` is empty, offer `setup-audit` |
| A tool errors or times out | Retry once, then show "—" for that section and continue the rest of the report |

## Tool efficiency

- Rankings → `get_top_channels`, `get_top_campaigns`, `get_top_sources`,
  `get_top_terms`, `get_top_landing_pages`, `get_top_pages` (compact, no
  `compare`, no `sort_by`).
- Drill-down with filters/compare → full tools (`get_campaigns`,
  `get_traffic_sources`, `get_conversions`…).
- Property analysis → `list_property_keys` first, then
  `get_property_breakdown` (full pivot) or `get_property_values` (by UTM).
- Never paginate past page 2 unless the user asks for the long tail.
