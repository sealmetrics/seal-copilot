# Opportunity Pattern Library

Fourteen patterns that find money left on the table. For each: detection
logic (exact tools) and the recommendation template. Report only patterns
that fire; order by estimated revenue impact; max 3 per report.

Patterns 1–10 are revenue-lift / friction-repair scans, runnable from any
account. Patterns 11–14 have prerequisites: product identifiers (11), multiple
paid channels (12), a calibrated intraday baseline (13), or configured content
groups (14).

Read the **MCP call rules** in `methodology.md` before using these — several
tools here do not accept `compare`, and passing it returns single-period data
silently.

## 1. Leaky campaign
- Detect: `get_campaigns(period=30d, sort_by=entrances, limit=50)` → campaign
  with ≥500 entrances and CR < 40% of its channel's average CR.
- Recommend: check ad–landing message match; if landing bounce is also
  high (`get_landing_pages`), fix landing first; otherwise pause and
  reallocate. Impact = entrance volume × CR gap × AOV.

## 2. Hidden star
- Detect: `get_campaigns(period=30d, sort_by=revenue)` → campaign with CR and
  AOV above channel average but bottom-half entrances.
- Recommend: scale budget 25–50%, watch CR for dilution. Impact = added
  entrances × current CR × AOV.

## 3. Broken landing
- Detect: `get_landing_pages(period=30d, sort_by=bounce_rate)` → landing with
  paid traffic and bounce > channel average + 20 pts. Requires ≥200 entrances.
- Recommend: speed test + message match audit; urgent if paid. Impact =
  paid entrances × (expected CR − actual CR) × AOV.

## 4. Device gap
- Detect: `get_device_types(period=30d)` or `get_devices(period=30d,
  compare=previous)` → mobile CR < 50% of desktop.
- Recommend: audit mobile checkout/booking flow end to end. Impact =
  mobile entrances × CR gap × AOV.

## 5. Dead keyword
- Detect: `get_terms(period=90d, sort_by=entrances, utm_medium=cpc)` → term
  with ≥200 entrances, 0 conversions.
- Recommend: negative-match or rewrite ad group. Impact = the spend on
  those clicks (user must pull cost from ads platform).

## 6. Untapped country
- Detect: `get_countries(period=90d, sort_by=conversions)` → country with CR
  above site average and ≥30 conversions, then
  `get_top_campaigns(country=XX, period=90d)` empty or minimal.
  `get_campaigns` has no country filter — use the `get_top_campaigns` variant.
- **Corroborate before recommending.** Country comes from browser timezone,
  not IP (see `methodology.md`). Require one supporting signal: matching
  language in `get_terms(country=XX)` or a localized path in
  `get_landing_pages(country=['XX'])`. Without it, report as a question to
  investigate, not a recommendation.
- Recommend: launch geo-targeted campaign; for hotels, localized landing +
  currency. Impact = modeled from organic CR × incremental paid traffic.

## 7. Winning property
- Detect: `get_property_breakdown(property_key=P, period=30d)` → property
  value with revenue share ≥2× its traffic share, confirmed within one channel
  via `get_property_values(property_key=P, group_by=utm_source, period=30d)`.
  Note `get_property_breakdown` returns counts and revenue per value, not CR.
- Recommend: dedicated creatives/ad sets for that value. Impact = channel
  revenue × share gap.

## 8. Channel drift
- Detect: `get_top_channels` on consecutive calendar pairs — `this_week` vs
  `last_week`, then the same for the two weeks before via `start_date` /
  `end_date` — showing 3+ consecutive declines. It does not accept `compare`;
  diff the results yourself.
- Recommend: run the diagnose-drop cause hierarchy on that channel before
  it compounds. Impact = cumulative weekly loss × 4.

## 9. Bot inflation (local only)
- **Connector:** only the `local` connector announces these tools. On `remote`
  this pattern cannot be screened at all — report it as unchecked rather than
  as not firing.
- Detect: `get_bot_stats(days=30)` → one source's traffic with high suspicion
  share; confirm with `get_suspicious_sessions(min_score=70, limit=50)`.
  An empty result means agent analytics is off, not 0% bots — see the
  three-outcome rule in `methodology.md`.
- Recommend: exclude that source from decisions; if paid, add IP/placement
  exclusions. Impact = the budget being spent on non-human clicks.

## 10. Micro→macro break
- Detect: `get_microconversions(period=30d, compare=previous)` up ≥20% while
  `get_conversions(period=30d, compare=previous)` flat or down.
- Recommend: inspect the final step (payment, form, stock); check
  `get_funnel` last-stage dropoff. Impact = excess microconversions ×
  historical close rate × AOV.

## 11. Catalog friction (per-SKU)
- Detect: `list_property_keys(table=conversion_items)` then
  `(table=microconversions)` → product identifier (`sku`, `product_id`,
  `item_id`, `product_name`). Then two full-pivot calls,
  `get_property_breakdown(table=microconversions, conversion_type=<view>,
  property_key=P, period=30d)` and the same for `<add_to_cart>`. Rank and
  truncate the pivot yourself — the tool has no `limit` or `sort_by`. Flag
  SKUs with ≥30 views where view→AtC ratio is ≤40% of the site median.
- Recommend: drill the worst 3 SKUs by device and source with filtered
  `get_microconversions_raw` calls — if mobile-only, PDP layout audit; if
  one-source, ad–product mismatch; if uniform, price / stock / description
  issue. Hand off to the `product-friction` skill for full treatment.
- Impact: friction SKUs reaching site-median ratio × site cart→purchase
  rate × site AOV.

## 12. RPE gap across paid channels
- Detect: `get_top_channels(period=90d)` plus `get_traffic_mediums(period=90d)`
  filtered to paid mediums. Compute RPE = revenue / entrances per channel.
  Flag when the strongest paid channel's RPE is ≥2× the weakest's AND both
  have ≥30 conversions.
- Recommend: at constant CPC, shifting one € from the weakest to the
  strongest should produce ≈RPE_ratio more revenue — verify CPC on the
  ad platforms before moving budget. Hand off to `channel-mix-optimizer`
  for the full procedure including campaign-level scale/cut candidates.
- Impact: weakest-channel entrances × RPE delta, capped at the user's
  willingness to reallocate (state assumption).

## 13. Intraday silence (cart watchdog)
- Detect: requires a stored baseline from the `calibrate-watchdog` skill.
  Compare `get_microconversions(conversion_type=<atc>, period=today)` against
  the baseline's expectation for the elapsed hours; when the day total is
  short, locate the silent hours with
  `get_microconversions_raw(conversion_type=[<atc>], period=today, limit=100)`.
  Fires when a cell is below 20% of its median for two consecutive hours with
  no matching bot anomaly.
- Recommend: test add-to-cart manually now; check for an outage in
  payment / cart / pixel since the drop window started. Hand off to
  `cart-watchdog` for full procedure and scheduling guidance.
- Impact: hours of silence × cell median AtC × site cart→purchase ×
  AOV = revenue at risk per hour the outage continues.

## 14. Content-group mismatch
- Detect: `get_content_groups(period=30d)` and
  `get_landing_pages_by_content_group(period=30d)`. Flag a group that takes
  ≥25% of entrances while converting at ≤25% of the site CR. Skip entirely if
  content groups are not configured — say so and name it as a setup gap.
- **Read it correctly.** Informational groups (blog, docs, help) are *supposed*
  to convert far below product pages. The finding is not "the blog converts
  badly", it is "the blog is most of your acquisition and there is no path from
  it to the product". Check whether the group's visitors ever reach a
  product or pricing page at all before recommending anything.
- Recommend: build the path — contextual calls to action, related-product
  links, a content upgrade — rather than trying to convert the group directly.
- Impact: group entrances × (site CR − group CR) × AOV, stated as the ceiling
  if every visitor behaved like the site average. Say that it is a ceiling; the
  realistic capture is a fraction of it.
