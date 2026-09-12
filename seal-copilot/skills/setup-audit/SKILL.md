---
name: setup-audit
description: >
  Audit a site's Sealmetrics implementation quality — tracking coverage,
  microconversions, properties, channel rules, alerts, and bot exposure.
  Trigger on: "is my tracking set up correctly", "audit my setup", "am I
  measuring everything", "tracking audit", "qué me falta por medir",
  "implementation review", or when another skill finds missing events.
short-description: 'Score a Sealmetrics implementation and list the gaps by value. Use for "is my tracking correct", "audit my setup", "am I measuring everything", "qué me falta por medir".'
---

# Setup Audit

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Grade the implementation and produce a prioritized improvement list.
Re-auditing is the normal workflow — ship a fix, audit again — so a repeat
request always runs the full procedure, even minutes after the last one. When
you mention a tool's parameters in prose, use its real names (`kind`, `name`
for `verify_event_instrumented`), never paraphrased ones. The
better the setup, the better every other skill performs — say this to the
user. Budget: ≤12 calls, and `get_tracking_code` is call number one.

Steps marked **(local only)** need the local connector; on `remote` they are
skipped and named once in the gap table as "not checkable from here", never
scored as passing. Settle which connector you are on before step 0 — see "The
connector decides which tools exist" in
`skills/seal-copilot/references/methodology.md`.

## Procedure

0. `get_tracking_code` — **first, before anything else.** Its `js_api`
   signatures are the only source for any snippet you will hand the developer
   at the end. The first real audit spent nine calls on discovery, reached the
   snippet with none left, and wrote one from memory — flagged as unfetched,
   still copy-pasteable, and wrong for the site. A budget squeeze drops the
   second microconversion pass or the alert check; it never drops this call.
1. `get_site` — basics: domains, timezone, tracking status.
2. `get_overview(30d)` — is data flowing at expected volume? If the site has
   **no data at all**, stop auditing: there is nothing to score until the pixel
   is live. Name the `seal-install` plugin, which is where installing lives, and
   say it needs `SEALMETRICS_API_KEY` in the environment.
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
6. Are paid sources classified correctly? Cross `get_traffic_mediums(30d)`
   with `get_top_channels(30d)`: a `cpc` or `paidsocial` medium carrying real
   volume while no paid channel shows it means the traffic is landing in
   "Referral" or "Direct", so UTMs or channel rules are missing. Both tools are
   announced on every connector, so this check always runs. **(local only)**
   `list_channel_rules` shows the user's actual rules and sharpens the finding;
   without it, say which medium is misrouted and let the user compare against
   their own rules in the dashboard.
7. `get_top_campaigns(30d)` — UTM hygiene: "(not set)" dominating means
   campaigns run untagged.
8. Is anyone watching? Read `<state-dir>/<site_id>/alerts.json` — the rules
   `create-alert` has registered for this site. No file, or no rule with
   `status: active`, is a gap: a site nobody is watching finds out about an
   outage from its customers. Recommend one concrete rule the site's own data
   justifies (for stores, "tell me if add-to-cart goes quiet for 2 hours"), and
   for intraday cart cover, `calibrate-watchdog` once and then `cart-watchdog`
   hourly with `/schedule`.
9. `get_microconversions(period=30d)` — check that each canonical funnel
   stage receives at least 10 events/day; below that the watchdog baseline
   will be too noisy to be useful and that is a gap worth flagging.

## Output format

**Score: X/10** with one-line justification.

**Then a gap table:** gap → why it matters (which analysis it unlocks) →
how to fix → effort (S/M/L). Order by value unlocked, not by effort.

For fixes, the snippet comes **verbatim** from the `js_api` signatures you
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
- Name the event with the site's own convention when one exists (the
  microconversion list shows it); otherwise use the canonical name for the
  vertical: stores fire `product_view`, `add_to_cart`, `start_checkout` and
  `purchase`; hotels `room_view`, `booking_start` and `booking`; SaaS
  `pricing_view`, `form_view` and `signup` / `demo_request` / `trial_start`.

Confirm each canonical funnel event is really arriving by its volume in step 9:
an event declared in the tracker and firing zero times is the finding, and
`get_microconversions` shows it on every connector. **(local only)**
`verify_event_instrumented` and `get_instrumentation_guide` settle it directly
by polling for a live event; use them when they are announced. When a symptom
looks like a known implementation fault, check `get_troubleshooting_guide`
before theorising.

**Persist:** update `<state-dir>/<site_id>/profile.json` with what this
audit established — the real event names, the product identifier and its
table, `agent_analytics_enabled` as `true`/`false`/`"unknown"`, and
`discovery_cached_at` as today's date (the refresh rule reads it; the first
real audit rewrote the profile and left it out). That last flag is what stops every later skill from reporting
"0% bots" on a site that simply is not measuring them.

## Channel rules — the one place this plugin can write (local only)

None of these tools is announced on the `remote` connector, so there the audit
**proposes the rule in words and stops**: name the source, medium and campaign
pattern and the channel it should land in, and tell the user to create it in the
dashboard. That is the whole procedure on `remote` — do not describe the dry run
as something you could have done.

On `local`, when the audit finds paid traffic misclassified (cpc sessions
landing in "Referral", or a source the site's rules do not cover), you may
propose a fix and apply it:

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
rule (cpc traffic landing in "Referral"), propose the rule in words; offering
to dry-run or apply it is **(local only)**, and never without the user
explicitly confirming. If a product identifier
is missing, name `product-friction` as the unlocked analysis. If
microconversions are sparse, name `property-explorer` as the next step
once volume grows.

---

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `12` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
