---
name: setup-audit
description: >
  Audit a site's Sealmetrics implementation quality — tracking coverage,
  microconversions, properties, channel rules, and whether anything is watching.
  Trigger on: "is my tracking set up correctly", "audit my setup", "am I
  measuring everything", "tracking audit", "qué me falta por medir",
  "implementation review", or when another skill finds missing events.
short-description: 'Score a Sealmetrics implementation and list the gaps by value. Use for "is my tracking correct", "audit my setup", "am I measuring everything", "qué me falta por medir".'
---

# Setup Audit

**Follow `skills/seal-copilot/references/run-protocol.md`:** no text until the answer, resolve the site with `list_sites` first, write state to the schema before answering, log the run. Match `examples/output.md`.

Budget: **≤13 Sealmetrics calls.**

Grade the implementation and produce a prioritized improvement list.
Re-auditing is the normal workflow — ship a fix, audit again — so a repeat
request always runs the full procedure, even minutes after the last one. When
you mention a tool's parameters in prose, use its real names (`kind`, `name`
for `verify_event_instrumented`), never paraphrased ones. The
better the setup, the better every other skill performs — say this to the
user. Budget: ≤13 calls, 14 when an approved install plan exists (step 10), and
`get_tracking_code` is the first call after the site is resolved.

Steps marked **(local only)** need the local connector; on `remote` they are
skipped and named once in the gap table as "not checkable from here", never
scored as passing. Settle which connector you are on before step 0 — see "The
connector decides which tools exist" in
`skills/seal-copilot/references/methodology.md`.

## Procedure

0. `get_tracking_code` — **first, once the site is resolved.** Its `js_api`
   signatures are the only source for any snippet you will hand the developer
   at the end. An audit that spends its budget on discovery reaches the snippet
   with none left and writes one from memory: still copy-pasteable, and wrong
   for the site. A budget squeeze drops the second microconversion pass or the
   alert check; it never drops this call.
1. `get_site` — basics: domains, timezone, tracking status.
2. `get_overview(30d)` — is data flowing at expected volume? If the site has
   **no data at all**, stop auditing: there is nothing to score until the pixel
   is live. Name the `seal-install` plugin, which is where installing lives, and
   say it needs `SEALMETRICS_API_KEY` in the environment.
3. `list_microconversion_types` — which funnel stages are instrumented?
   Compare against the canonical funnel for the vertical (stores:
   `view_item` / `add_to_cart` / `begin_checkout`; hotels: `search` /
   `view_item` / `begin_checkout`). Older sites already fire pre-taxonomy
   names for the same stages (`product_view`, `start_checkout`, `room_view`,
   `booking_start`): count those as instrumented, not as gaps.
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
6. Are paid sources classified correctly? Cross `get_traffic_mediums(30d)`
   with `get_top_channels(30d)`: a `cpc` or `paidsocial` medium carrying real
   volume while no paid channel shows it means the traffic is landing in
   "Referral" or "Direct", so UTMs or channel rules are missing.
   `list_channel_rules` shows the user's actual rules and sharpens the finding;
   it is announced on both connectors, so this check always runs in full.
7. `get_top_campaigns(30d)` — UTM hygiene: "(not set)" dominating means
   campaigns run untagged.
8. Is anyone watching? **No call** — do not call `list_alerts`, whose rules
   this plugin does not manage. Nothing in this plugin watches a site
   between reports except `cart-watchdog`: rules in
   `<state-dir>/<site_id>/alerts.json` are saved, not scheduled. So the gap is
   intraday cover — a site nobody is watching finds out about an outage from its
   customers. For stores, recommend `calibrate-watchdog` once and then
   `cart-watchdog` hourly with `/schedule`; for any site, one concrete rule the
   site's own data justifies, saved with `create-alert` so it is ready when
   Sealmetrics' native alerts watch it.
9. `get_microconversions(period=30d)` — check that each canonical funnel
   stage receives at least 10 events/day; below that the watchdog baseline
   will be too noisy to be useful and that is a gap worth flagging.
10. **The approved install plan, when there is one.** If
    `<state-dir>/<site_id>/install-plan.json` exists for this site, the install
    was planned and approved event by event: audit the data against that plan,
    not only against the canonical funnel. It is written by `seal-install`; its
    shape is in `skills/seal-copilot/references/state-schema.md`. Four checks,
    from what steps 3–5 and 9 already returned, plus one call:
    - **Instrumented, not seen** — a planned `conv` or `micro` with zero events
      in the period. Planned and written, but not arriving: the deploy dropped
      it, or it fires under another name. If `approved_at` is less than 7 days
      old, say it may be too early rather than broken.
    - **Drift** — an event arriving that the plan does not contain: someone added
      a call outside the plan. Name it; do not call it wrong, and never
      recommend renaming it.
    - **Lost property** — a property key the plan gives an event that
      `list_property_keys` does not list (for purchase items, check
      `table=conversion_items`). Planned, and not reaching the data.
    - **Broken revenue** — for each planned `conv` with a `value`:
      `get_conversions_raw(period=7d, conversion_type=[name], limit=200)`. More
      than 5% of rows with `amount` 0 or missing means revenue is being lost —
      usually a total sent as a string, which the tracker drops. Give the share
      and the row count. One call per revenue event; with more than one, check
      the one with the most conversions and say the others were not checked.

    Each of these is a gap in the table, tagged **plan `<plan_id>`**, and its fix
    is always the same: **plan and simulate the change with `seal-install`**, then
    deploy and verify — never a code patch written here. The plan is the
    contract the installer checks calls against; a hand fix drifts from it again.
    Without the file, skip this step silently: most sites were not installed
    with a plan.

## Output format

**Score: X/10** with one-line justification.

**Then a gap table:** gap → why it matters (which analysis it unlocks) →
how to fix → effort (S/M/L). Order by value unlocked, not by effort.

For a gap tagged with the plan, the fix is the `seal-install` round in step 10,
not a snippet. For other fixes, the snippet comes **verbatim** from the `js_api` signatures you
fetched in step 0 — or, **(local only)**, from `get_instrumentation_guide`.
Rules that are not negotiable:

- **Never write a call you did not fetch.** If for any reason you have no
  fetched signature, give no code — say "run `get_tracking_code` and use its
  `conversion` signature" and stop. A hedge like "I did not spend a call to
  fetch it, use it verbatim" attached to invented code is worse than no
  code: the hedge gets trimmed and the code gets pasted.
- **No invented numbers inside code.** A value like `1200` presented as
  "average deal size" will be pasted as-is. Use a visibly non-literal
  placeholder — `<average deal size in EUR>` — and say the developer replaces it.
- Name a missing event from the closed taxonomy, even when the site already
  fires older names for other stages: the installer's event verifier rejects
  anything else as `out_of_taxonomy`. Stores fire `view_item`, `add_to_cart`,
  `begin_checkout` and `purchase`; hotels `view_item` (with
  `item_type: 'room'`), `begin_checkout` and `booking`; SaaS `cta_click`
  (`cta: 'pricing'`), `form_submit`, and `signup` or `lead`, with the
  distinction in a property (`plan: 'trial'`, `form_name: 'demo_request'`).
  Never recommend renaming an event the site already fires: that splits its
  history, and it is the user's decision.

Confirm each canonical funnel event is really arriving by its volume in step 9:
an event declared in the tracker and firing zero times is the finding, and
`get_microconversions` shows it on every connector. **(local only)**
`verify_event_instrumented` and `get_instrumentation_guide` settle it directly
by polling for a live event; use them when they are announced. When a symptom
looks like a known implementation fault, check `get_troubleshooting_guide`
before theorising.

**Persist:** update `<state-dir>/<site_id>/profile.json` with what this
audit established — the real event names, the product identifier and its
table, `currency`, `connector`, and `discovery_cached_at` as today's date (the
refresh rule reads it; the first real audit rewrote the profile and left it
out).

## Channel rules — the one place this plugin can write

When the audit finds paid traffic misclassified (cpc sessions landing in
"Referral", or a source the site's rules do not cover):

1. Draft the rule and show it to the user in plain language.
2. Dry-run it with `test_channel_rules` and report exactly which sessions
   would reclassify and how the channel totals change. This works on **both**
   connectors, so the evidence is always available.
3. **Only after the user explicitly confirms**, apply it with
   `create_channel_rule` or `update_channel_rule` — **(local only)**. On
   `remote` the writers are not announced, so hand the user the dry-run result
   and the rule in words and tell them to create it in the dashboard.

Never call `create_channel_rule`, `update_channel_rule`, `delete_channel_rule`
or `import_channel_rules` without that confirmation in the conversation. A
channel rule rewrites how every past and future report classifies traffic, so a
silent change would invalidate the user's own history. If in doubt, propose and
stop.

**Close:** offer to re-audit after fixes ship, and name the first analysis
that becomes possible once the top gap is closed. Where the fix is a channel
rule (cpc traffic landing in "Referral"), propose the rule in words and show
the dry run; applying it is **(local only)** and never happens without the user
explicitly confirming. If a product identifier
is missing, name `product-friction` as the unlocked analysis. If
microconversions are sparse, name `property-explorer` as the next step
once volume grows.
