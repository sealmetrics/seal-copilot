---
name: property-explorer
description: >
  One-time discovery run that maps which custom properties this customer
  tracks and ranks them by analytical signal (cardinality, revenue
  concentration, channel variance). Output is a personalized list of the
  3 highest-value analyses available for this account. Trigger on:
  "onboarding", "first time", "what can you analyze", "explore my data",
  "what properties do I have", "qué propiedades tengo", "what data is
  there", "discover my setup", or as the first thing to run on a new site.
disallowed-tools: Bash, Edit, NotebookEdit, WebFetch, WebSearch
context: fork
agent: general-purpose
background: false
---

# Property Explorer

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Discover the analytical surface area of a specific Sealmetrics account so
every later skill knows what to use. Run **once per site** at engagement
start, then again after major tracking changes. Budget: ≤15 calls — higher
than other skills because the value compounds across every future run.

## Step 1 — List all property keys across all tables

```
list_property_keys(table=conversions)
list_property_keys(table=microconversions)
list_property_keys(table=conversion_items)
```

Also run `list_segments` — saved segments are part of the analytical surface
and belong in the inventory. For up to three that look business-relevant, call
`get_segment` and record their size and share of conversions: a segment that is
8% of sessions and 35% of conversions is a finding in itself.

Build a deduped table: property name · which table(s) · which conversion
or microconversion types it appears on.

## Step 2 — Score each property on three dimensions

For each property `P`, call `get_property_breakdown(property_key=P,
period=90d)` and compute. The tool has no `limit` or `sort_by` — it returns
the full pivot, so rank and truncate the values yourself, and skip properties
you already know are identifier-like (thousands of values) rather than pulling
the whole list:

- **Cardinality** = distinct values returned.
  - 2–10: categorical (gender, plan, room_type) — easy to act on.
  - 11–100: enumerated (category, country code, color) — segmentation gold.
  - 100–1,000: long tail (city, sub-category) — useful with aggregation.
  - 1,000+: identifier (sku, product_id, user_id) — needs SKU-style skills.
- **Revenue concentration** = revenue share of top 3 values ÷ total.
  - ≥60%: Pareto — strong signal, name the top values.
  - 30–60%: spread.
  - <30%: noise or true uniform demand.
- **Channel variance** — one call:
  `get_property_values(property_key=P, group_by=utm_source, period=90d,
  limit=100)`. This returns every value already split by source, so read the
  top 3 values out of that single response — the tool cannot filter to one
  value, and `group_by` accepts only `utm_source`, `utm_medium`,
  `utm_campaign` or `all`. If the distribution by source is materially
  different (e.g. value X is 60% of Paid Social but 10% of Organic), this
  property is **strategic** — it explains channel performance.

## Step 3 — Rank and recommend

Score each property 0–3 across cardinality usefulness, Pareto strength,
and channel variance; total 0–9. List the top 5.

For each top property, name the **best follow-up analysis** in plain
language:

| Property profile | Best follow-up |
|---|---|
| Low cardinality + high Pareto | `get_property_breakdown` quarterly review |
| Mid cardinality + high channel variance | run `channel-mix-optimizer` filtered by top value |
| SKU-like (1,000+ values) | run `product-friction` |
| Geographic-like (country/region) | run hotels/ecommerce country playbook |
| Funnel-stage-like (cart, checkout) | run `funnel-analysis` |

## Output format

1. **Inventory table** — every property: name · table · types · cardinality
   · score.
2. **Top 5 with one-line explanation each** of why each scored high.
3. **3 recommended starter analyses** — concrete commands the user can
   paste back (e.g. "Run product-friction on `sku`", "Run channel-mix
   filtered by `category=footwear`").
4. **Gaps** — short list of properties typically valuable for this
   vertical that are **missing**, with a note to add them in tracking
   (ecommerce: `category`, `price_range`, `brand`; hotels: `room_type`,
   `rate_plan`, `lead_time`, `stay_length`).
5. **Persist.** Write the inventory and the top 5 to
   `~/.seal-copilot/<site_id>/property-map.md`, and update
   `~/.seal-copilot/<site_id>/profile.json` with the vertical you detected,
   the site's real event names, and the product identifier (key + table) if
   one exists. Every later skill reads these instead of rediscovering them —
   see `skills/seal-copilot/references/state-schema.md`. Tell the user the
   map is stored and goes stale in 30 days or after any tracking change.

## What you do NOT do

- Do not analyze deeply here — this is discovery, not diagnosis. Refer
  the user to the right specialist skill instead.
- Do not call `get_property_breakdown` on an identifier-like property
  (thousands of values) just to count them — the tool returns the full pivot
  with no `limit`. Infer cardinality from `get_property_values(limit=100)`
  first and note "identifier-like, 100+ values" instead.
- Do not score properties with <50 events total — say "insufficient
  coverage, revisit when more data arrives".

---

Log the run in `~/.seal-copilot/<site_id>/runs.jsonl` (skill, calls used,
budget, verdict) so budget compliance is measurable. Skip silently if the
path is not writable.
