> Reference output. Numbers from `evals/fixtures/ecommerce-referrer-spike.mjs`.
> Note that savings are stated as formulas the user completes, never as invented
> infrastructure costs.

Found 2 patterns firing. Estimated monthly saving: **€X of infrastructure cost
on 21,900 entrances that neither stay nor buy** (multiply by your own €/1k
sessions) **+ roughly 3 developer hours/month** in false-alarm investigation.

**1. Non-engaging referrer — one referrer is 38% of your traffic**
- **Evidence:** 21,900 of 57,100 entrances came from `cheap-traffic.example` in
  30 days, at 95% bounce and 5 conversions — against a site conversion rate
  near 1.5%.
- **Action:** block that referrer at the CDN or WAF if you control it, and
  exclude it from every growth and channel decision. It is not a traffic
  source, it is load.
- **Saving:** 21,900 entrances/month × your CDN and log cost per session. Also
  every rate on the site this month was computed with it in the denominator —
  that is the real cost.
- **Verify:** its share of entrances should fall below 5% within a week of the
  block, and the site bounce rate should drop with it.

**2. Zombie pages**
- **Evidence:** 2 pages with ≥1,000 entrances, zero conversions and bounce
  above the site average + 15 points, all organic with no UTM.
- **Action:** redirect to a working page, or add an exit-intent call to action
  if they are intentionally informational.
- **Saving:** these are dead ends, not costs — worth about 24 conversions/month
  at site CR if they routed somewhere useful.
- **Verify:** re-run in 30 days; entrances should convert or stop arriving.

**Clean:** broken tracking (no microconversion type dropped more than 8%),
dead UTM tax, country flood, over-tracked microconversions.
**Not checked:** stale alerts and webhooks, unused segments — they need the
local connector.

Note: I did not estimate ad spend. Sealmetrics does not ingest cost — plug your
CPC into the formulas above.

Want me to re-run after you ship the CDN block?
