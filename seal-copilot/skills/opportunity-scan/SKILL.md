---
name: opportunity-scan
description: >
  Scan Sealmetrics data for revenue opportunities — money left on the table.
  Trigger on: "where am I losing money", "find opportunities", "what should
  I optimize", "how can I improve my campaigns", "dónde pierdo dinero",
  "what would you change", "audit my marketing", or any open-ended
  optimization request.
disallowed-tools: Bash, Edit, NotebookEdit, WebFetch, WebSearch
context: fork
agent: general-purpose
background: false
---

# Opportunity Scan

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

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

## Procedure

0. **Read the ledger.** Load `<state-dir>/<site_id>/recommendations.jsonl`.
   Do not re-report a pattern that already has an `open` entry for the same
   subject unless its impact has grown ≥50% — then report it as an escalation
   and name the date it was first flagged. Entries marked `discarded` stay
   suppressed for 90 days. See `skills/seal-copilot/references/state-schema.md`.
1. Baseline (3 calls): `get_overview(30d, compare=previous)`,
   `get_channels(30d)`, `get_conversions(30d)` — site averages for CR and
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
7. Validate any anomaly with `get_bot_stats(days=30)` — pattern 9 — before
   reporting. An empty result means agent analytics is off, not 0% bots:
   mark the finding "unvalidated for bots".

## Output format

**Max 3 opportunities, ordered by estimated revenue impact.** Each:

- **Name + pattern** (e.g. "Hidden star: campaign summer-sale-es")
- **Evidence:** the numbers, the period, vs what baseline
- **Action:** specific and executable this week
- **Impact:** estimated €/month with the assumption stated
- **Verify:** tool + metric + when

Then one line listing patterns checked that did NOT fire (transparency
builds trust), and one line for any pattern suppressed as an already-open
recommendation. If fewer than 30 conversions in a cell, label the finding
"directional — low sample" instead of dropping it silently.

Append each reported opportunity to `recommendations.jsonl` with its metric,
baseline, target and `verify_on` date. Log the run in `runs.jsonl`.
