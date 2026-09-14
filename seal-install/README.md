# Seal Install

Takes a site from no analytics to measured and verified: creates the
Sealmetrics site if it does not exist, places the tracking snippet in your
codebase, confirms the first pageview actually arrives, then instruments the
conversions and microconversions the business needs — and verifies each one
fires.

It is one skill. The analysis lives in its sibling,
[Seal Copilot](../seal-copilot/README.md).

## Why this is a separate plugin

Seal Copilot connects over the remote server at `mcp.sealmetrics.com`, which
each user authorises with a browser login. That connector deliberately does not
announce the provisioning and verification tools — `provision_site`,
`verify_setup`, `get_instrumentation_guide`, `verify_event_instrumented` — so
half of an installation cannot be done over it.

Rather than ship a skill that fires on "install Sealmetrics" and then discovers
it cannot finish, installing lives here, with the local server and an API key.
The person installing tracking is a developer and already has a terminal; the
person reading a weekly report is not, and should never meet an API key.

## Install

```bash
claude plugin marketplace add sealmetrics/seal-copilot
```

Then `claude plugin install seal-install@sealmetrics`, and put your key in the
environment before starting the session:

```bash
export SEALMETRICS_API_KEY=sm_...
```

Generate one at my.sealmetrics.com → Settings → API Tokens. The key is read by
`npx @sealmetrics/mcp`, which this plugin declares; nothing is stored here.

Claude Code and Cowork only. Codex and Claude.ai have no way to run a local
stdio server with a key from your environment, so Seal Copilot ships there and
this does not.

## What it does

1. Works out where you are starting: no account, an account without this site,
   or a site that already exists. It never creates a duplicate.
2. Creates the site — only after you accept the terms in your own words.
3. Detects the framework, fetches the real snippet and the event taxonomy, and
   reads your code to find where each action happens.
4. **Plans the install with you before touching a file:** `plan_install` checks
   the event names, personal data, revenue sent as a number, double pageviews,
   your site's domains and the payload size, and you approve the plan.
5. Places the snippet and writes the planned events — and only those.
6. **Simulates them before anything ships:** `simulate_install` runs the real
   Sealmetrics tracker on the calls it wrote, in a local sandbox, and fixes what
   the server would store wrongly or reject.
7. Asks you to deploy, then proves the first pageview and each event on the
   live site.
8. Writes the approved plan and the site profile Seal Copilot reads, so the
   first analysis is cheap.

Planned, simulated and verified are reported separately. Only verified means an
event reaches Sealmetrics.

## What it will not do

Create an account without your explicit acceptance of the terms · edit a file
before you approve the plan · write an event the plan does not contain · pass
any personal identifier into an event · invent an event name outside the
instrumentation taxonomy · call a simulated event verified · deploy your site.

Planning and simulation need `@sealmetrics/mcp` 1.9.0 or later. On an older
server the skill still asks for your approval of a written plan, and marks every
event "not simulated".

## Next

Data takes a few days to become analyzable. Then install Seal Copilot and run
`property-explorer` once, followed by `weekly-health-check`.

MIT licensed. support@sealmetrics.com
