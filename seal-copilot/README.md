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
| "Where am I losing money?" | opportunity-scan — 14-pattern revenue scan |
| "Where do users drop off?" | funnel-analysis — weakest stage + why |
| "Which products convert worst?" | product-friction — per-SKU view→cart audit |
| "Set up cart monitoring" (once per site) | calibrate-watchdog — learns the site's hour-of-week rhythm |
| "Is my cart alive?" (hourly watchdog) | cart-watchdog — intraday anomaly vs that learned baseline |
| "Where should I invest?" / "scale or cut" | channel-mix-optimizer — paid-channel RPE reallocation |
| "What can you analyze?" (first run on a new site) | property-explorer — maps your custom properties |
| "Reduce expenses" / operational waste | cost-reduction — zombie pages, dead UTMs, tracking decay |
| "Alert me if four hours pass with no sales" | create-alert — turns the sentence into a scheduled check |
| (the scheduled check itself, hourly) | check-alerts — one line while healthy, evidence when not |
| "Is my tracking set up right?" | setup-audit — implementation score + fixes |
| Anything else about your traffic | seal-copilot — the core analyst |

Built-in playbooks for **ecommerce** (cart abandonment, AOV by channel,
product properties, per-SKU friction), **hotels** (direct vs OTA, source
markets, booking properties, yoy seasonality, booking watchdog) and
**SaaS / lead-gen** (submit-rate breaks, brand vs non-brand paid, blog-to-product
paths, plan mix by channel). The analyst detects which one applies from your
tracking and loads it automatically.

**Installing tracking from scratch is a different plugin.**
[`seal-install`](../seal-install/README.md) carries the local connector and the
provisioning tools, which the connector here deliberately does not expose.

## Alerts you describe in a sentence

> "Avísame si paso 4 horas seguidas sin ventas."

`create-alert` turns that into a rule — the metric, the window, the hours it
watches, how often it checks — verifies the event exists and has enough volume
to be worth watching, and registers a scheduled check. `check-alerts` runs it
and answers in one line while the site is healthy:

```
🟢 no-conversions-4h: 6 purchases today, last one 18 minutes ago.
```

When it fires, it names the hour the silence started — the thing you match
against your deploy log — and one concrete thing to try in the next two minutes.

It refuses rules that would be noise. Ask it to watch an event that happens
twice a day for four quiet hours and it says so, with the arithmetic, and offers
a window that would mean something.

Four kinds of rule: **silence** (N hours with no event), **drop** and **spike**
(against what this site normally does at this hour), and **threshold** (a flat
number for the day). Ask "what am I watching?" to list them, and "stop watching
X" to remove one.

## Install

```
claude plugin marketplace add sealmetrics/seal-copilot
claude plugin install seal-copilot@sealmetrics
```

A local checkout works the same way: pass its path instead of the repository.

On **Codex** the same repository is a marketplace too, and the connector travels
with the plugin rather than needing a token:

```
codex plugin marketplace add sealmetrics/seal-copilot
codex plugin add seal-copilot@sealmetrics
codex mcp login sealmetrics
```

Every other surface — Cowork, Claude on the web, a custom GPT — is in the
[repository README](../README.md).

## First run (5 minutes)

1. **Install the plugin** (above).
2. **Authorise the connector.** Run `/mcp`, select **sealmetrics**, and sign in
   with your Sealmetrics account in the browser. Nothing to copy, nothing to
   put in your environment.
3. **Name your site**, if your account has more than one: set
   `SEALMETRICS_SITE_ID`, or Seal Copilot asks which site you mean before every
   analysis.
4. **Map the account once:** *"Explore my properties."* This writes a property
   map that every later analysis reads, so nothing rediscovers it.
5. **Ask for the first report:** *"Run my weekly health check."*

For intraday cart monitoring, run *"calibrate the watchdog"* once and then
schedule `cart-watchdog` hourly with `/schedule`. The watchdog refuses to run
without that baseline rather than inventing a threshold.

## The connector, and what it can reach

The plugin bundles the Sealmetrics connector as the remote server at
`mcp.sealmetrics.com`, authorised per user over OAuth. You hold no token and
the plugin stores no credential. That is the right default for the person this
is built for: a marketer, who should never meet an API key.

It costs something, and the plugin says so rather than working around it in
silence. Twenty tools reach backend routes that need a broader permission than
any API key or OAuth grant can carry, so the connector does not offer them:
alerts, webhooks, saved segments, channel rules and event verification. Every skill knows this. Steps that need them are marked
*(local only)*, skipped, and named once at the end of a report under **Not
checked** — never quietly reported as passing.

What that means in practice:

| You will see | Why |
|---|---|
| `cost-reduction` scanning six patterns instead of eight | Two of them need the account's alerts, webhooks and saved segments |
| `setup-audit` proposing a channel rule in words instead of testing it | It can read that `cpc` traffic is misrouted, and cannot write the rule that fixes it. Create it in the dashboard |

Everything that matters for analysis — traffic, channels, campaigns, terms,
landings, conversions, microconversions, properties, funnels, raw events — is
fully available.

## What it remembers

Seal Copilot keeps a small state directory per site at `~/.seal-copilot/`
(override with `SEAL_COPILOT_STATE_DIR`):

- the site profile — timezone, vertical, your real event names, the product
  identifier, the currency, and which connector you are on
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
| Every call fails on authentication | The connector is not authorised yet. Run `/mcp`, pick **sealmetrics**, sign in. Seal Copilot will not retry, and will not guess the numbers. |
| It asks which site on every question | Set `SEALMETRICS_SITE_ID`, or answer once and it is cached in the site profile. |
| It says installing tracking is a different plugin | It is. Install [`seal-install`](../seal-install/README.md), which carries the local connector and an API key. |
| An alert never fires, or fires every day | Ask "what am I watching?" and check the window. `create-alert` sizes the window against the event's own volume; if the volume changed, the rule needs resizing. |
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
- "Avísame si paso 4 horas seguidas sin ventas."
- "What am I watching on this site?"

## Principles the analyst follows

Every number is real (no invented data) · rates over volumes · minimum
sample sizes before strong claims · a spike is not called growth until it
converts, and the referrer carrying it is named · last non-direct click attribution caveats stated · every
recommendation comes with evidence, action, estimated € impact, and a
verification plan.

## Privacy

Sealmetrics is consentless by design and stores no personal identifiers.
Seal Copilot works exclusively with aggregated metrics — no PII is ever
processed or sent to the model.

## Limitations

- No bot data. Sealmetrics does not provide it, so Seal Copilot never estimates
  a bot share or says traffic comes from bots. What it does instead is check
  whether a spike engages and converts, and name the referrer carrying it when
  it does not.
- No ad-spend data: Sealmetrics does not ingest cost, so the analyst
  compares CR, AOV, and revenue — for ROAS, pull spend from your ads
  platform.
- Alerts, segments and channel rules are not reachable over the default
  connector. See "The connector, and what it can
  reach"; the skills that touch them say so rather than reporting a zero.
- Attribution is last non-direct click, consentless, measured server-side.
  Numbers will not match GA4 or your ad platform dashboards, and upper-funnel
  channels are undervalued by definition — the analyst says so when it matters.
- Country is derived from browser timezone, not IP geolocation. The analyst
  treats geography as directional and asks for corroboration before
  recommending geo-targeted spend.
- Intraday monitoring needs a one-off `calibrate-watchdog` run: the API has no
  hourly time series, so the baseline is built once from raw events and cached
  rather than rebuilt on every check.

## Development

Two checks, from the repository root:

```
bash scripts/check.sh              # linter, fixture arithmetic, self-test, manifests
bash scripts/check.sh --online     # the above plus MCP schema drift
node evals/run-evals.mjs           # 31 cases against a mock Sealmetrics server
node evals/run-evals.mjs --runs 3  # each case three times; model wording varies
node evals/preflight.mjs           # one cheap call: proves the whole chain works
node scripts/usage-report.mjs      # local metrics from your own state directory
```

With a real API key, one more check matters more than all of these:

```
SEALMETRICS_API_KEY=sm_... node evals/validate-fixtures.mjs
```

The eval fixtures are reconstructions from documented field names. Until that
command has run clean, a green suite proves the skills are self-consistent, not
that they match the real API. It compares response **shapes** only — key names
and types, never your figures — and writes nothing unless you pass `--save`.

`check.sh` needs no model and no API key — it is what CI should run.

The eval suite spawns real `claude -p` sessions, so it costs tokens and needs
the **CLI** to be authenticated. Being signed in to the Claude desktop app does
not cover the terminal binary; they keep separate sessions. Either run `claude`
in a terminal once and complete `/login`, or export `ANTHROPIC_API_KEY` — the
second is the better route for CI since it needs no interactive step. Filter to
one case while iterating: `node evals/run-evals.mjs healthy-says-so`.

## Support

support@sealmetrics.com · [docs.sealmetrics.com](https://docs.sealmetrics.com)
