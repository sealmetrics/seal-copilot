---
name: funnel-analysis
description: >
  Analyze the conversion funnel in Sealmetrics — find where users drop off
  and why. Trigger on: "analyze my funnel", "where do users drop off",
  "cart abandonment", "checkout analysis", "booking funnel", "análisis de
  funnel", "why don't visitors convert", or questions about steps between
  visit and purchase/booking.
short-description: 'Find where the conversion funnel leaks. Use for "funnel analysis", "where do users drop off", "checkout abandonment", "dónde abandonan", "conversion path".'
---

# Funnel Analysis

**Follow `skills/seal-copilot/references/run-protocol.md`:** no text until the answer, resolve the site with `list_sites` first, write state to the schema before answering, log the run. Match `examples/output.md`.

Budget: **≤10 Sealmetrics calls.**

Find the weakest funnel stage and isolate its cause.
Vertical playbooks: `skills/seal-copilot/references/ecommerce-playbook.md`
(stores) and `skills/seal-copilot/references/hotels-playbook.md` (hotels).

## Procedure

1. `get_funnel(period=30d)` — the configured funnel with per-step dropoff.
   It answers `{ error: "…" }` as JSON when no funnel is configured; check
   for `error` before reading `steps`, and build the funnel from
   microconversions instead.
2. `list_microconversion_types` — map the customer's event names to
   canonical stages (product_view/add_to_cart/start_checkout/purchase for
   stores; search/room_view/booking_start/booking for hotels).
3. Compute stage-to-stage ratios; identify the **weakest stage** relative
   to the site's own history (`compare=previous` via
   `get_microconversions`).
4. Segment the weakest stage to isolate cause (1 call).
   `get_microconversion_details(conversion_type=<stage>)` returns
   `by_device`, `by_source`, `by_country` and `by_landing_page` together, each
   with `count` and `percentage`. Read all four from the one response.
5. Triangulate per the methodology: gap only on mobile → UX; gap
   everywhere → offer/price/shipping; gap in one country → payment or
   language.
6. **Per-SKU funnel** (ecommerce, optional, ≤2 calls). If the weakest
   stage is `view_item → add_to_cart`, the leak is product-specific —
   run `get_property_breakdown` on the product identifier for both
   stages and surface the worst SKUs. Hand off to the `product-friction`
   skill for the full per-SKU treatment.

## Output format

1. **Funnel table:** stage → volume → step CR → change vs previous.
2. **Weakest link:** one sentence naming the stage and the segment where
   the gap concentrates, with numbers.
3. **Hypothesis ranked list (max 3):** each with the evidence that supports
   it and a concrete test or fix.
4. **Impact:** conversions recovered if the weak stage matched its
   best-segment rate, in € using site AOV.
5. **Verify:** re-run plan after the fix ships.

7. **Entry-path check** (1 call, optional). `get_landing_pages_by_content_group(
   period=30d)` — if one content group supplies most entrances but almost none
   of the conversions, the funnel problem starts before the first stage. This
   is the common shape on blog-heavy and SaaS sites; see pattern 14.

If the site has no funnel configured and no microconversions, say so and
offer the `setup-audit` skill instead of improvising. If microconversions
exist but their property naming is unknown, suggest `property-explorer`
as a one-time first step.

---
