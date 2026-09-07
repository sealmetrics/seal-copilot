# Seal Copilot

AI marketing optimization analyst for [Sealmetrics](https://sealmetrics.com)
— consentless analytics that tracks 100% of your traffic. Seal Copilot turns
that data into diagnosis, opportunities, and concrete recommendations with
estimated revenue impact.

Because Sealmetrics needs no cookie consent, every recommendation is based
on **all** of your traffic — not the fraction that accepted cookies.

## What it does

| Ask | Skill |
|---|---|
| "How was this week?" / "Weekly report" | weekly-health-check — verdict + top 3 findings |
| "Monday briefing" / scheduled one-pager | monday-briefing — email-shareable Monday report |
| "Why did conversions drop?" | diagnose-drop — root-cause isolation, step by step |
| "Where am I losing money?" | opportunity-scan — 13-pattern revenue scan |
| "Where do users drop off?" | funnel-analysis — weakest stage + why |
| "Which products convert worst?" | product-friction — per-SKU view→cart audit |
| "Set up cart monitoring" (once per site) | calibrate-watchdog — learns the site's hour-of-week rhythm |
| "Is my cart alive?" (hourly watchdog) | cart-watchdog — intraday anomaly vs that learned baseline |
| "Where should I invest?" / "scale or cut" | channel-mix-optimizer — paid-channel RPE reallocation |
| "What can you analyze?" (first run on a new site) | property-explorer — maps your custom properties |
| "Reduce expenses" / operational waste | cost-reduction — bots, zombie pages, dead UTMs, stale alerts |
| "Install Sealmetrics on this site" | install-sealmetrics — snippet, verification, event instrumentation |
| "Is my tracking set up right?" | setup-audit — implementation score + fixes |
| Anything else about your traffic | seal-copilot — the core analyst |

Built-in playbooks for **ecommerce** (cart abandonment, AOV by channel,
product properties, per-SKU friction), **hotels** (direct vs OTA, source
markets, booking properties, yoy seasonality, booking watchdog) and
**SaaS / lead-gen** (submit-rate breaks, brand vs non-brand paid, blog-to-product
paths, plan mix by channel). The analyst detects which one applies from your
tracking and loads it automatically.

## First run (5 minutes)

1. **Install the plugin.**
2. **Get a token.** [my.sealmetrics.com](https://my.sealmetrics.com) → Settings
   → API Tokens → generate one (it starts with `sm_`).
3. **Set the environment variable** `SEALMETRICS_API_KEY`. If your account has
   more than one site, set `SEALMETRICS_SITE_ID` too, or Seal Copilot will ask
   which site you mean before every analysis.
4. **Restart the session.** On startup the plugin tells Claude whether it is
   configured, so a missing key produces setup instructions instead of a wall
   of failed calls.
5. **Map the account once:** *"Explore my properties."* This writes a property
   map that every later analysis reads, so nothing rediscovers it.
6. **Ask for the first report:** *"Run my weekly health check."*

For intraday cart monitoring, run *"calibrate the watchdog"* once and then
schedule `cart-watchdog` hourly with `/schedule`. The watchdog refuses to run
without that baseline rather than inventing a threshold.

The plugin bundles the Sealmetrics MCP server (runs locally via `npx`,
requires Node.js 18+). Your API key never leaves your machine except to call
the Sealmetrics API.

## What it remembers

Seal Copilot keeps a small state directory per site at `~/.seal-copilot/`
(override with `SEAL_COPILOT_STATE_DIR`):

- the site profile — timezone, vertical, your real event names, the product
  identifier, whether bot detection is enabled
- the property map from `property-explorer`
- the watchdog baseline from `calibrate-watchdog`
- a **recommendation ledger**: every recommendation, the metric that should
  move, and the date to check it. The weekly report opens by verifying what it
  told you two weeks ago, and the opportunity scan stops re-proposing findings
  you already have open.

Delete the directory to start clean. Nothing there is personal data.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "SEALMETRICS_API_KEY is not set" at session start | The variable is missing or was set after the session began. Export it and restart. |
| Every call returns 401 or 403 | The token is invalid, revoked, or scoped to a different account. Regenerate it in Settings → API Tokens. Seal Copilot will not retry a 403. |
| It asks which site on every question | Set `SEALMETRICS_SITE_ID`, or answer once and it is cached in the site profile. |
| Reports say "unvalidated for bots" | `get_bot_stats` returned nothing, which means agent analytics is not enabled on the site — not that you have zero bots. Enable it in your account settings. |
| The watchdog says it has no baseline | Run `calibrate-watchdog` once. It is deliberate: a watchdog with a guessed threshold is worse than none. |
| Numbers do not match GA4 or Google Ads | Expected. Sealmetrics measures last non-direct click, consentless, server-side. The other tools use different attribution and depend on consent. |
| A skill stops early saying it is past budget | A session-level hook warns once the call count exceeds the largest skill budget. Ask it to continue if you want the deeper pass. |

## Example prompts

- "Which campaign should I scale?"
- "Why did revenue fall last week?"
- "What channel brings my highest-value customers?"
- "Which product category sells best from Instagram?"
- "Which SKUs get the most views but the fewest carts?"
- "Compare my source markets year over year." (hotels)
- "How much revenue do OTAs take that I could capture directly?" (hotels)
- "Audit my tracking and tell me what I'm not measuring."
- "Where am I wasting money in operations — not on ads?"
- "Schedule my Monday briefing every Monday at 8am."
- "Calibrate the watchdog, then run it every hour from 9 to midnight."

## Principles the analyst follows

Every number is real (no invented data) · rates over volumes · minimum
sample sizes before strong claims · bot traffic checked before any anomaly
is reported · last non-direct click attribution caveats stated · every
recommendation comes with evidence, action, estimated € impact, and a
verification plan.

## Privacy

Sealmetrics is consentless by design and stores no personal identifiers.
Seal Copilot works exclusively with aggregated metrics — no PII is ever
processed or sent to the model.

## Limitations

- No ad-spend data: Sealmetrics does not ingest cost, so the analyst
  compares CR, AOV, and revenue — for ROAS, pull spend from your ads
  platform.
- Attribution is last non-direct click, consentless, measured server-side.
  Numbers will not match GA4 or your ad platform dashboards, and upper-funnel
  channels are undervalued by definition — the analyst says so when it matters.
- Country is derived from browser timezone, not IP geolocation. The analyst
  treats geography as directional and asks for corroboration before
  recommending geo-targeted spend.
- Intraday monitoring needs a one-off `calibrate-watchdog` run: the API has no
  hourly time series, so the baseline is built once from raw events and cached
  rather than rebuilt on every check.

## Support

support@sealmetrics.com · [docs.sealmetrics.com](https://docs.sealmetrics.com)
