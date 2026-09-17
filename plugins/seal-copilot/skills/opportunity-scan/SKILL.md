---
name: opportunity-scan
description: >
  Scan Sealmetrics data for revenue opportunities — money left on the table.
  Trigger on: "where am I losing money", "find opportunities", "what should
  I optimize", "how can I improve my campaigns", "dónde pierdo dinero",
  "what would you change", "audit my marketing", or any open-ended
  optimization request.
short-description: 'Scan for revenue left on the table. Use for "where am I losing money", "find opportunities", "what should I optimize", "dónde pierdo dinero", "audit my marketing".'
---

# Opportunity Scan

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

**Before anything else: emit no text until the report.** **Your first action
is a tool call, not a sentence** — not "State directory is empty, running
discovery", not "Let me start with the overview", not "Now writing state files,
then the report". Writing state before the report is something you do, not
something you announce. And nothing between calls
either: no "Drop confirmed, moving to channels", no "Drilling into campaigns",
no "Checking seasonality". The user reads every one of those before your answer,
and a run that narrates its way to a conclusion reads as one that has not
reached it. Make the calls in silence; your first and only message is the
finished report. **And nothing after it:** write the profile, the ledger and the
run log *before* the report, never once it is written. A tool call after the
report forces a second message, and a run that logged its diagnosis first and
then added "Diagnosis complete: the drop traces to /collections/sale" made the
user read the same finding twice.

Run the pattern library against current data and report what fires.
Patterns and detection logic:
`skills/seal-copilot/references/opportunity-patterns.md` (14 patterns
covering revenue lift, friction repair, and waste reduction).
Thresholds: `skills/seal-copilot/references/methodology.md`.
Budget: ≤12 tool calls.

> Scope: this skill is a revenue-opportunity scan. For media-budget
> reallocation use `channel-mix-optimizer`; for operational waste use
> `cost-reduction`; for per-SKU PDP issues use `product-friction`. This
> skill cross-references those when a finding clearly belongs there.

**Resolve the site before any call that takes a `site_id`, without announcing
it.** If `list_sites` has not already run in this conversation, it is your first
call: one call, counted in the budget. Use anything cached under
`<state-dir>/<site_id>/` — profile, baseline, ledger, saved alert — only if that
`site_id` is in the list. If it is not, that state was written by another
Sealmetrics account on this machine: ignore it for this run, resolve the site
from the list, asking if there are several, and never delete the other
account's files. Rules in `skills/seal-copilot/references/state-schema.md`, "A
cached site belongs to one connection".

## Procedure

0. **Read the ledger.** Load `<state-dir>/<site_id>/recommendations.jsonl`.
   Do not re-report a pattern that already has an `open` entry for the same
   subject unless its impact has grown ≥50% — then report it as an escalation
   and name the date it was first flagged. Entries marked `discarded` stay
   suppressed for 90 days. See `skills/seal-copilot/references/state-schema.md`.
1. Baseline (3 calls): `get_overview(30d, compare=previous)`,
   `get_top_channels(30d)`, `get_conversions(30d)` — site averages for CR and
   AOV, needed by every pattern.
2. Campaign patterns (1–2 calls): `get_campaigns(30d, sort_by=entrances,
   limit=50)` — screen for patterns 1 (leaky) and 2 (hidden star) in one
   pass.
3. Landing pattern (1 call): `get_landing_pages(30d, sort_by=bounce_rate)`
   — pattern 3.
4. Device pattern (1 call): `get_device_types(30d)` — pattern 4.
5. Property pattern (2 calls): `list_property_keys` →
   `get_property_breakdown` on the most business-relevant key — pattern 7.
   For ecommerce, if a product property exists (`sku`, `product_id`,
   `item_id`, `product_name`), additionally screen pattern 11 (catalog
   friction) by computing the view→AtC ratio across the top viewed SKUs;
   if it fires, recommend the full `product-friction` skill for depth.
6. Pick at most 2 more patterns based on vertical: content-group mismatch (14)
   via `get_content_groups` for blog-heavy or SaaS accounts, terms (5) for heavy SEM
   users, countries (6) for international sites, micro→macro (10) if
   microconversions are tracked, RPE gap (12) for accounts running
   multiple paid channels, intraday gap (13) only if a watchdog baseline
   already exists (`calibrate-watchdog` has run).
7. Before reporting any rise as an opportunity, screen pattern 9 with
   `get_top_referrers(period=30d)`: a referrer carrying the rise at 90%+
   bounce and almost no conversions is not demand, and a finding built on it
   is not a finding. Name it by what it did. No bot data — never call
   `get_bot_stats` and never say bots (see "No bot data" in `methodology.md`).

## Output format

**Max 3 opportunities, ordered by estimated revenue impact.** Each has all
five parts below; none is optional. Two runs out of three dropped the last one
when the finding felt obvious — a recommendation without a way to check it is
an opinion, and it cannot go into the ledger.

- **Name + pattern** (e.g. "Hidden star: campaign summer-sale-es")
- **Evidence:** the numbers, the period, vs what baseline
- **Action:** specific and executable this week
- **Impact:** estimated €/month with the assumption stated
- **Verify:** the tool to re-run, the metric that should move, and when
  (2–4 weeks; one booking cycle for hotels). Write the word "Verify".

Do not report how many tool calls you used either.

Then one line listing patterns checked that did NOT fire (transparency
builds trust), and one line for any pattern suppressed as an already-open
recommendation. If fewer than 30 conversions in a cell, label the finding
"directional — low sample" instead of dropping it silently.

Append each reported opportunity to `recommendations.jsonl` with its metric,
baseline, target, `verify_on` date, and `impact_month` with the site's
`currency` — the schema requires both, and a figure without its currency is
one a store reporting in dollars cannot use. Log the run in `runs.jsonl`. Both writes use
the Read and Write tools, never a shell command, and happen before the report.
