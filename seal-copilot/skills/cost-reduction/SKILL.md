---
name: cost-reduction
description: >
  Find operational waste — money bleeding through the site itself, not
  through media spend. Scans for bot traffic tax, zombie pages, broken
  tracking, dead UTMs, country flood without ROI, stale alerts/webhooks,
  and unused segments. Trigger on: "reduce expenses", "reducir gastos",
  "where am I wasting money", "operational waste", "fix the bleeding",
  "audit costs", "limpiar mi cuenta", "dónde estoy gastando de más",
  "operational audit", "tracking waste". NOT for media-spend optimization
  (use channel-mix-optimizer for that).
short-description: 'Find operational waste: bots, zombie pages, dead campaigns, broken tracking. Use for "reduce costs", "what is wasting money", "reducir costes", "operational audit".'
---

# Cost Reduction (Operational Waste)

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone. It is the reference for what a good
run of this skill looks like.

Find waste Sealmetrics can see **without** ad-spend data: traffic that
costs money on the infrastructure side but produces nothing, instrumentation
that's broken, and unused features. Budget: ≤12 calls.

> Scope note for the user: this skill targets **operational expenses**
> (infra, dev time, fraud, tool license use), not **media costs**. For ad
> spend efficiency, run `channel-mix-optimizer`.

## Patterns scanned (report only those that fire)

Three of the eight need tools the `remote` connector does not announce, and
they are marked **(local only)** below. On `remote`, five patterns run. Say so
once in the scorecard line — "3 patterns need the local connector" — and list
them as unchecked in the closing block, never as clean. A pattern that could
not be screened is not a pattern that came back empty.

### 1. Bot tax
- **(local only)** — needs `get_bot_stats` and `get_suspicious_sessions` in
  your tool list. When they are there, screen this pattern; when they are not,
  report it as unchecked rather than clean.
- Detect: `get_bot_stats(days=30)` and
  `get_suspicious_sessions(min_score=70, limit=50)` — neither takes a
  `period`. An empty `get_bot_stats` means agent analytics is off, not 0%
  bots: say so and skip this pattern. If bot share ≥ 15% of total sessions,
  or one source has bot share ≥ 40%, the cost is real (CDN egress, log
  storage, polluted analytics).
- Recommend: enable Cloudflare / WAF blocking on top bot sources;
  exclude them from Sealmetrics if they ride a UTM the user controls.
- Impact: bot sessions × site's per-session infra cost (user must supply
  €/1k sessions; if not, state hours saved in analyst time instead).

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
  if yes, add the source/term to bot exclusion to stop polluting analytics.
- Impact: ad budget still being charged for those clicks (user pulls
  spend) + cleaner reports.

### 5. Country flood without ROI
- Detect: `get_countries(period=90d, sort_by=entrances)`. Flag countries
  with ≥5% of total entrances, 0 conversions in 90d, and bot share <30%
  (so it is not just bots from that geo).
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
   that could not be screened on this connector get their own line: "Bot tax,
   stale alerts, unused segments: need the local connector, not checked."

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

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `12` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
