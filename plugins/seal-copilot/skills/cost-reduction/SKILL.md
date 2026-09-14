---
name: cost-reduction
description: >
  Find operational waste — money bleeding through the site itself, not
  through media spend. Scans for non-engaging referrer traffic, zombie pages, broken
  tracking, dead UTMs, country flood without ROI, stale alerts/webhooks,
  and unused segments. Trigger on: "reduce expenses", "reducir gastos",
  "where am I wasting money", "operational waste", "fix the bleeding",
  "audit costs", "limpiar mi cuenta", "dónde estoy gastando de más",
  "operational audit", "tracking waste". NOT for media-spend optimization
  (use channel-mix-optimizer for that).
short-description: 'Find operational waste: junk referrers, zombie pages, dead campaigns, broken tracking. Use for "reduce costs", "what is wasting money", "reducir costes", "operational audit".'
---

# Cost Reduction (Operational Waste)

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

Find waste Sealmetrics can see **without** ad-spend data: traffic that
costs money on the infrastructure side but produces nothing, instrumentation
that's broken, and unused features. Budget: ≤12 calls.

> Scope note for the user: this skill targets **operational expenses**
> (infra, dev time, fraud, tool license use), not **media costs**. For ad
> spend efficiency, run `channel-mix-optimizer`.

**Resolve the site before any call that takes a `site_id`, without announcing
it.** If `list_sites` has not already run in this conversation, it is your first
call: one call, counted in the budget. Use anything cached under
`<state-dir>/<site_id>/` — profile, baseline, ledger, saved alert — only if that
`site_id` is in the list. If it is not, that state was written by another
Sealmetrics account on this machine: ignore it for this run, resolve the site
from the list, asking if there are several, and never delete the other
account's files. Rules in `skills/seal-copilot/references/state-schema.md`, "A
cached site belongs to one connection".

## Patterns scanned (report only those that fire)

Two of the eight need tools the `remote` connector does not announce, and
they are marked **(local only)** below. On `remote`, six patterns run. Say so
once in the scorecard line — "2 patterns need the local connector" — and list
them as unchecked in the closing block, never as clean. A pattern that could
not be screened is not a pattern that came back empty.

### 1. Non-engaging referrer
- Detect: `get_top_referrers(period=30d)`. Flag a referrer carrying ≥20% of
  entrances at bounce ≥90% and a conversion rate ≤10% of the site average.
  Standard data only: no bot data here — never call `get_bot_stats` or
  `get_suspicious_sessions`, and never say the traffic comes from bots (see
  "No bot data" in `methodology.md`). Describe what it did, not who sent it.
- **Name the referrer, or the pattern is not reported.** "Low-quality
  traffic" is an observation; "cheap-traffic.example sent 21,900 entrances at
  95% bounce and 5 conversions" is the finding. This call outranks patterns 6,
  7 and 8, which are hygiene: a run that lists unused segments and cannot name
  the referrer inflating every rate on the site spent its budget on the wrong
  thing.
- Recommend: block that domain at the CDN or WAF if the user controls it, and
  exclude it from every growth and channel decision; if it arrives on a
  campaign, pull that campaign's spend.
- Impact: those sessions × the site's per-session infra cost (user supplies
  €/1k sessions; if not, say which rates it inflates instead).

### 2. Zombie pages
- Detect: `get_pages(period=90d, sort_by=entrances, limit=50)`. Flag pages
  with ≥1,000 entrances, 0 conversions, bounce > site average + 15 pts,
  no UTM source (organic dead end).
- Recommend: redirect to a working page or remove from sitemap; if
  intentionally informational, add an exit-intent CTA.
- Impact: entrances × site CR × AOV = revenue lost to dead ends.

### 3. Broken tracking (microconversion decay)
- Detect: `get_microconversions(period=30d, compare=previous)` for each
  type from `list_microconversion_types` (the parameter is `conversion_type`,
  not `type`). Any type with ≥50% drop while
  `get_overview` sessions are flat = instrumentation broken.
- Recommend: developer must redeploy the missing event; confirm the start
  date by re-running the same call on narrower `start_date`/`end_date`
  windows until the drop is bracketed.
- Impact: hidden — every dependent analysis (funnel, product-friction)
  has been wrong since the regression. State the date the decay started.

### 4. Dead UTM tax
- Detect: `get_campaigns(period=90d, sort_by=entrances, limit=50)` and
  `get_terms(period=90d, sort_by=entrances, limit=50)` filtered to paid.
  Flag campaigns/terms with ≥200 entrances and 0 conversions over the
  full 90d — likely paused upstream but still receiving stale clicks
  (cached creatives, app-store redirects, scrapers).
- Recommend: confirm with the ads platform that the campaign is paused;
  if yes, exclude the source/term from reporting to stop polluting analytics.
- Impact: ad budget still being charged for those clicks (user pulls
  spend) + cleaner reports.

### 5. Country flood without ROI
- Detect: `get_countries(period=90d, sort_by=entrances)`. Flag countries
  with ≥5% of total entrances and 0 conversions in 90d, whose traffic is not
  already explained by pattern 1's referrer.
- Recommend: geo-block in the ads platform; add to Sealmetrics country
  exclusion if available; investigate whether shipping/legal even allows
  selling there.
- Impact: entrances × per-session infra cost + ads budget.

### 6. Stale alerts and webhooks (local only)
- Detect: `list_alerts` + `get_alert_history(limit=100)` + `get_alert_stats`
  — `get_alert_history` has no `period`; it is paged with `limit` and
  `offset` and filtered with `status`. Alerts firing ≥10 times with no
  follow-up action are noise. `list_webhooks` + `get_webhook_stats` +
  `list_webhook_deliveries` — webhooks with ≥10% failure rate or 0
  deliveries are broken integrations.
- Recommend: silence noisy alerts (raise threshold or delete), fix or
  delete failing webhooks. Each one is dev time saved.
- Impact: dev hours/month + reduced alert fatigue.

### 7. Unused segments (local only)
- Detect: `list_segments` — segments not referenced in any saved report
  or alert. Many accounts accumulate dozens of test segments.
- Recommend: delete or rename. Pure hygiene.
- Impact: clarity for the team; minor.

### 8. Over-tracking of low-signal microconversions
- Detect: from `list_microconversion_types`, find types with <10 events
  per 30d. They cost storage and noise but inform nothing.
- Recommend: remove from tracker.
- Impact: cleaner schema + lighter pixel payload.

## Output format

1. **Waste scorecard line:** "Found N patterns firing. Estimated monthly
   saving: €X (variable cost) + Y dev hours/month."
2. **Top 3 wastes, each:** name · evidence (numbers + period) · action ·
   estimated saving (with assumption stated) · how to verify in 30d.
3. **Remaining patterns** (one line each): "Zombie pages: 2 minor flags.
   Dead UTM tax: clean." — so the user sees the full scan happened. Patterns
   that could not be screened on this connector get their own line: "Stale
   alerts, unused segments: need the local connector, not checked."

4. **Single follow-up question:** name the next operational audit (e.g.
   "Want me to re-run after you ship the fixes?").

## What you do NOT do

- Do not estimate ad spend; Sealmetrics has none. State the formula and
  ask the user to plug in their CPC/CPM.
- Do not recommend deleting a microconversion just because volume is
  low — confirm with the user it is not a high-value rare event (e.g.
  "demo_request" is rare but valuable).
- Do not delete alerts/webhooks for the user; recommend, do not act.

---

**Before the report, not after it, with the Read and Write tools — never a shell:** log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `12` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
