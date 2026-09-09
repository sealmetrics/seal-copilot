> Reference output. Numbers from `evals/fixtures/ecommerce-bot-spike.mjs`.
> Note that savings are stated as formulas the user completes, never as invented
> infrastructure costs.

Found 2 patterns firing. Estimated monthly saving: **€X of infrastructure cost
on 23,400 non-human sessions** (multiply by your own €/1k sessions) **+ roughly
3 developer hours/month** in false-alarm investigation.

**1. Bot tax — one referrer is 39% of your traffic**
- **Evidence:** 22,600 of 57,100 sessions came from `cheap-traffic.example` in
  30 days, at 94% bounce and 9 conversions. Bot detection scores 41% of all
  sessions as suspicious, flagged on `headless_user_agent` and `no_mouse_events`.
- **Action:** block that referrer at the CDN or WAF. It is not a traffic source,
  it is load.
- **Saving:** 22,600 sessions/month × your CDN and log cost per session. Also
  every report you have read this month was wrong — that is the real cost.
- **Verify:** bot share should fall below 15% within a week of the block.

**2. Zombie pages**
- **Evidence:** 2 pages with ≥1,000 entrances, zero conversions and bounce
  above the site average + 15 points, all organic with no UTM.
- **Action:** redirect to a working page, or add an exit-intent call to action
  if they are intentionally informational.
- **Saving:** these are dead ends, not costs — worth about 24 conversions/month
  at site CR if they routed somewhere useful.
- **Verify:** re-run in 30 days; entrances should convert or stop arriving.

**Clean:** broken tracking (no microconversion type dropped more than 8%),
dead UTM tax, country flood, stale alerts, webhook failures, unused segments,
over-tracked microconversions.

Note: I did not estimate ad spend. Sealmetrics does not ingest cost — plug your
CPC into the formulas above.

Want me to re-run after you ship the CDN block?
