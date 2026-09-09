# Ecommerce Playbook

Load when the customer is an online store (signals: add_to_cart,
product_view, checkout microconversions; size/color/category properties;
purchase conversion type).

## Commercial funnel

Canonical stages: product_view → add_to_cart → start_checkout → purchase.
Map the customer's actual microconversion names to these stages via
`list_microconversion_types` (names vary: "atc", "cart", "begin_checkout").

Key ratios to compute and benchmark against the site's own history:

- Add-to-cart rate = add_to_cart / product_view (or / entrances)
- Cart-to-checkout = start_checkout / add_to_cart
- Checkout completion = purchase / start_checkout
- Overall CR = purchase / entrances

Find the weakest stage, then segment it by device
(`get_microconversion_details` with device_type), source, and country to
locate the cause. A checkout completion gap that exists only on mobile is
a UX bug; one that exists everywhere is shipping cost / payment options.

## Signature analyses

1. **Cart abandonment by origin.** Ratio add_to_cart → purchase per
   utm_source via `get_microconversion_details(conversion_type=add_to_cart,
   utm_source=X)` against `get_conversions(utm_source=X)`. Traffic that
   carts but never buys is retargeting fuel — name the sources.
2. **AOV by channel.** `get_conversions(sort_by=avg_value)` with
   utm_source filters. Which channel brings high-ticket buyers? Recommend
   shifting budget toward high-AOV channels even at equal CR.
3. **Property breakdowns.** `get_property_breakdown` on category, size,
   color, price_range — check `list_property_keys(table=conversion_items)`
   first, since item-level properties live there. The tool returns the full
   pivot with no `limit` or `sort_by`: rank and truncate yourself. Classic
   finding: "category X is 38% of Paid Social revenue but 12% of its
   campaigns — make dedicated campaigns".
4. **Device gap.** Mobile CR < 50% of desktop CR → audit mobile checkout.
   Quantify: lost conversions = mobile entrances × (desktop CR − mobile CR).
5. **Returning intent.** Compare engaged_entrances vs entrances per
   channel — channels with high engagement but low conversion may need
   remarketing rather than more spend.
6. **Per-SKU catalog friction.** Map view→AtC ratio per SKU; surface
   "champions" (top viewed + top ratio), "friction" (top viewed + low
   ratio), "hidden gems" (low viewed + high ratio), "dead stock" (low
   viewed + low ratio). Full procedure in the `product-friction` skill;
   classic finding: "SKU-1234 has 4,800 views but ratio 0.8% vs site
   median 6.2% — PDP problem; drill by device and source first".
7. **Intraday cart watchdog.** A learned hour-of-week baseline of
   add_to_cart catches outages within minutes — broken pixel after a
   deploy, payment provider blip, regional ISP issue. Run
   `calibrate-watchdog` once to build and store the baseline, then schedule
   `cart-watchdog` hourly. The watchdog refuses to run without a baseline
   rather than guessing a threshold.
8. **Channel mix without spend.** When the user asks "where to invest",
   compute RPE across paid channels and the strongest/weakest ratio
   instead of guessing on volume — full procedure in
   `channel-mix-optimizer`.

## Recommendation framing for stores

Always express impact in revenue using the site's own AOV from
`get_conversions`. Stores act on euros, not percentages.
