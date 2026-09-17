---
name: product-friction
description: >
  SKU-level analysis of where the catalog leaks money. Finds products with
  high views but low add-to-cart, hidden gems, and champions. Trigger on:
  "which products convert worst", "best/worst products", "PDP problems",
  "qué producto vendo poco", "product page friction", "catalog audit",
  "view to cart by product", "productos más vistos", "what to fix in my
  catalog", or any question about per-product performance.
argument-hint: "[top-N SKUs]"
short-description: 'Per-SKU analysis of products viewed but not added to cart. Use for "which products underperform", "product friction", "qué productos no se venden", "catalog audit".'
---

# Product Friction

**Follow `skills/seal-copilot/references/run-protocol.md`:** no text until the answer, resolve the site with `list_sites` first, write state to the schema before answering, log the run. Match `examples/output.md`.

Budget: **≤12 Sealmetrics calls.**

Find catalog leaks at SKU level: products that get viewed but not bought. Read the MCP call rules in
`skills/seal-copilot/references/methodology.md` first — the property tools
have no `limit` or `sort_by`, and the raw tools are capped at 31 days and
100 rows per page.

## Step 1 — Discover the product property

Check `<state-dir>/<site_id>/profile.json` first: if
`product_identifier` is set, use it and skip the probing below. Verify it
still appears in the data on your first breakdown call — if it does not,
tracking changed, so re-probe and update the profile.

Otherwise, item properties are where product identifiers live, so probe in
this order:

1. `list_property_keys(table=conversion_items)`
2. `list_property_keys(table=microconversions)`

Accept the first key that exists, in this order: `sku`, `product_id`,
`item_id`, `product_name`, `product_sku`, `id`, `name`. State which one you
chose and which table it came from.

**Confirm the same key appears on both the view event and the add-to-cart
event.** Different identifiers on different events is a common integration
bug and makes the join meaningless. If the key exists on only one of them, or
none exists at all, stop and offer the `setup-audit` skill — name this as the
gap that blocks per-SKU analysis.

Map the event names via `list_microconversion_types`. Common variants:
`view_item`, `product_view`, `product_viewed`, `view_product`; and
`add_to_cart`, `add_to_basket`, `atc`, `cart_add`.

## Step 2 — Pull view and cart pivots

Two calls, for the chosen property `P` over 30d:

1. `get_property_breakdown(table=microconversions, conversion_type=<view-event>,
   property_key=P, period=30d)`
2. `get_property_breakdown(table=microconversions, conversion_type=<atc-event>,
   property_key=P, period=30d)`

Each response is pivoted **by UTM**: `data: [{ utm_source, utm_medium,
utm_campaign, total, values: { <sku>: count } }]`. Sum `values` across all
`data` rows to get one count per SKU. There is no revenue here and no
`limit`: rank by view count yourself and work with the top 100 SKUs. State
that you truncated and that the user can ask for more.

## Step 3 — Join and classify

Join the two pivots on `P`. For each SKU compute **view→AtC ratio** =
add_to_cart_count / view_item_count. Drop SKUs with fewer than 30 views in
the period (low confidence). Then classify:

- **Champions** — top quartile by views AND ratio ≥ site median.
  Keep promoting; do not touch.
- **Friction** — top quartile by views AND ratio ≤ 40% of site median.
  PDP problem suspected. These are the priority — drill in Step 5.
- **Hidden gems** — bottom-half views AND ratio ≥ 2× site median.
  Demand is real but exposure is missing. Recommend pushing traffic
  (paid, homepage, email) before "fixing" anything.
- **Dead stock** — bottom quartile views AND ratio ≤ site median.
  De-prioritize or retire from catalog if commercially possible.

State the site median view→AtC ratio explicitly so the user can sanity-check.

## Step 4 — Real cart→purchase per SKU (2–4 calls)

Do not assume every SKU converts at the site's average cart→purchase rate.
Pull the actual purchased items:

`get_conversion_items_raw(conversion_type=[purchase], period=30d, limit=100,
page=1…N)` — one row per product inside each purchase, with `sku`, `price`
and `quantity` always included. Page up to 4 times (400 item rows), then stop.

Count purchases per SKU from those rows and compute AtC→purchase per SKU for
the friction candidates. **This is a sample**, not the full 30 days, whenever
the store exceeds 400 purchased items in the period — say so, and fall back to
the site-wide cart→purchase rate for any SKU that does not appear in the
sample.

## Step 5 — Drill the top 3 friction SKUs (4 calls, not per SKU)

`get_property_breakdown` cannot be filtered by device or source, so use the
raw event stream and read all three SKUs out of the same responses:

1. `get_microconversions_raw(conversion_type=[<atc-event>], device_type=['mobile'],
   include_properties=true, period=7d, limit=100)`
2. The same with `device_type=['desktop']`
3. `get_microconversions_raw(conversion_type=[<atc-event>],
   utm_source=['<top paid source>'], include_properties=true, period=7d,
   limit=100)`
4. The same for the top organic or direct source

For each friction SKU, compare its **share of add-to-carts** in each sample
against its share in the overall 30d pivot from Step 2.

- Share collapses on mobile only → PDP layout / image / CTA above-fold issue.
  Recommend a mobile PDP audit.
- Share collapses in one source only → ad–product mismatch. Recommend pausing
  that source for this SKU or swapping creative.
- Share is uniformly low everywhere → price, stock, reviews or description
  problem on the PDP itself.

**These samples are 100 events over 7 days.** Label every Step 5 conclusion
"directional". If a friction SKU does not appear in any sample, say the sample
was too thin to isolate the cause rather than inventing one.

## Output format

1. **Catalog summary line:** "Analyzed N SKUs (≥30 views). Site median
   view→AtC = X%. Champions: A. Friction: B. Hidden gems: C. Dead: D."
2. **Top 3 friction SKUs table:** SKU/name · views · AtCs · ratio · vs
   median · AtC→purchase (real or site-average, say which) · drill conclusion
   (mobile / source / uniform / sample too thin).
3. **Top 3 hidden gems table:** SKU/name · views · AtCs · ratio · vs
   median · recommended traffic action.
4. **Top 3 champions** (one line each, for awareness — do not act).
5. **Estimated impact:** if friction SKUs reached site-median ratio,
   recovered AtC × that SKU's cart→purchase rate × its average price
   = €/month. State which rates were measured and which were assumed.
6. **Verify:** re-run in 2–4 weeks after fixes ship; expect ratio to move
   toward median for the SKU touched.

## What you do NOT do

- Do not score SKUs with <30 views; mention them as "insufficient sample,
  re-check next month".
- Do not recommend pausing a product based on one weak week — require 30d
  minimum.
- Do not present a raw-tool sample as a full census. Name the window and the
  row cap whenever a number came from `*_raw`.
- Do not invent stock or margin data; if the user wants margin-weighted
  ranking they must paste COGS.

---
