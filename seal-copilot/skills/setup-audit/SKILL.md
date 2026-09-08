---
name: setup-audit
description: >
  Audit a site's Sealmetrics implementation quality — tracking coverage,
  microconversions, properties, channel rules, alerts, and bot exposure.
  Trigger on: "is my tracking set up correctly", "audit my setup", "am I
  measuring everything", "tracking audit", "qué me falta por medir",
  "implementation review", or when another skill finds missing events.
---

# Setup Audit

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Grade the implementation and produce a prioritized improvement list. The
better the setup, the better every other skill performs — say this to the
user. Budget: ≤10 calls.

## Procedure

1. `get_site` — basics: domains, timezone, tracking status.
2. `get_overview(30d)` — is data flowing at expected volume? If the site has
   **no data at all**, stop auditing and hand off to `install-sealmetrics`:
   there is nothing to score until the pixel is live.
3. `list_microconversion_types` — which funnel stages are instrumented?
   Compare against the canonical funnel for the vertical (stores:
   product_view/add_to_cart/start_checkout; hotels: search/room_view/
   booking_start).
4. `list_property_keys(table=conversion_items)` first, then `(table=both)` — what
   enrichment exists? Flag high-value missing properties for the vertical
   (stores: category, price_range; hotels: room_type, lead_time). For
   stores, **verify that at least one product identifier exists**
   (`sku`, `product_id`, `item_id`, `product_name`) on both `view_item`
   and `add_to_cart` — without this, `product-friction` and any
   per-SKU analysis are impossible. Note which identifier is used; if
   the same product carries different identifiers on different events
   (a common integration bug), flag it as a top gap.
5. `get_conversions(30d)` — are revenue values being passed? Rows carry
   `avg_value`; 0 or null means revenue tracking is missing. Note
   `list_property_keys` returns objects with `key` and counts, not names.
6. `list_channel_rules` — are paid sources classified correctly? Spot-check
   against `get_traffic_sources`: cpc traffic landing in "Referral" means
   missing UTMs or rules.
7. `get_top_campaigns(30d)` — UTM hygiene: "(not set)" dominating means
   campaigns run untagged.
8. `list_alerts` + `get_bot_stats(days=30)` — is anyone watching? Is bot
   traffic material? An empty bot result means agent analytics is off, which
   is itself a gap worth listing. If no live monitoring of add-to-cart
   exists, recommend running `calibrate-watchdog` once and then scheduling
   `cart-watchdog` hourly with `/schedule`.
9. `get_microconversions(period=30d)` — check that each canonical funnel
   stage receives at least 10 events/day; below that the watchdog baseline
   will be too noisy to be useful and that is a gap worth flagging.

## Output format

**Score: X/10** with one-line justification.

**Then a gap table:** gap → why it matters (which analysis it unlocks) →
how to fix → effort (S/M/L). Order by value unlocked, not by effort.

For fixes, fetch concrete snippets with `get_tracking_code` and
`get_instrumentation_guide`, and include the exact event/property call the
developer needs — copy-pasteable. Do not improvise snippets when the guide has
one. For each canonical funnel event, confirm it is really arriving with
`verify_event_instrumented` rather than inferring it from counts. When a symptom
looks like a known implementation fault, check `get_troubleshooting_guide`
before theorising.

**Persist:** update `~/.seal-copilot/<site_id>/profile.json` with what this
audit established — the real event names, the product identifier and its
table, and `agent_analytics_enabled` based on whether `get_bot_stats`
returned data. That last flag is what stops every later skill from reporting
"0% bots" on a site that simply is not measuring them.

## Channel rules — the one place this plugin can write

When the audit finds paid traffic misclassified (cpc sessions landing in
"Referral", or a source the site's rules do not cover), you may propose a fix:

1. Draft the rule and show it to the user in plain language.
2. Dry-run it with `test_channel_rules` and report exactly which sessions
   would reclassify and how the channel totals change.
3. **Only after the user explicitly confirms**, apply it with
   `create_channel_rule` or `update_channel_rule`.

Never call `create_channel_rule`, `update_channel_rule`, `delete_channel_rule`
or `import_channel_rules` without that confirmation in the conversation. A
channel rule rewrites how every past and future report classifies traffic, so a
silent change would invalidate the user's own history. If in doubt, propose and
stop.

**Close:** offer to re-audit after fixes ship, and name the first analysis
that becomes possible once the top gap is closed. Where the fix is a channel
rule (cpc traffic landing in "Referral"), propose the rule and offer to test
it with `test_channel_rules` — never create or update a rule without the
user explicitly confirming. If a product identifier
is missing, name `product-friction` as the unlocked analysis. If
microconversions are sparse, name `property-explorer` as the next step
once volume grows.

---

Log the run in `~/.seal-copilot/<site_id>/runs.jsonl` (skill, calls used,
budget, verdict) so budget compliance is measurable. Skip silently if the
path is not writable.
