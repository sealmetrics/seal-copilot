---
name: install-sealmetrics
description: >
  Install Sealmetrics on a site from scratch: create the site if needed, plan
  the snippet and the events with the user, write them, simulate them against
  the real tracker before anything ships, then confirm the first hit and each
  event on the live site. Trigger on: "install Sealmetrics", "set up
  Sealmetrics", "add analytics to this site", "instalar Sealmetrics",
  "configurar el píxel", "I have no tracking yet", "add the tracking code",
  "instrument my checkout", "the install is deployed, verify it", "check the
  events arrive", "comprobar la instalación", or when another skill finds that a
  site has no data at all.
argument-hint: "[domain]"
short-description: 'Install Sealmetrics from scratch: plan the events with you, write them, simulate them, verify them live against the plan. Use for "install Sealmetrics", "set up tracking", "verify the install", "instalar Sealmetrics".'
---

# Install Sealmetrics

Take a site from no analytics to measured and verified. This is the only skill
that writes code, and the only one that can create an account — both are gated
below. Budget: ≤24 tool calls plus whatever editing the codebase takes.

**This skill needs the local connector**, the one this plugin carries:
`npx @sealmetrics/mcp` with `SEALMETRICS_API_KEY` in the environment. Most of
the procedure — `provision_site`, `verify_setup`, `get_instrumentation_guide`,
`plan_install`, `simulate_install`, `verify_event_instrumented` — is not
announced by the remote OAuth connector, which is why installing lives in its
own plugin rather than in Seal Copilot.

Check before step 0: if `provision_site` and `verify_setup` are not in your
tool list, you are on the remote connector. Say so in one line, tell the user
to install `seal-install` and set `SEALMETRICS_API_KEY`, and stop. Do not hand
over a snippet you could not fetch — that is how a site ends up with tracking
that looks right and measures nothing.

If those two are there but `plan_install` and `simulate_install` are not, the
connector predates them (`@sealmetrics/mcp` before 1.9.0). Say so in one line,
still write the plan as a table and wait for approval in Step 3, skip Step 6,
and mark every event "not simulated" in the final table.

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone.

**Three words, never merged.** An event is *planned* when the user approved it,
*simulated* when `simulate_install` ran the real tracker on the call you wrote,
and *verified* when `verify_event_instrumented` saw it arrive from the live
site as planned. Only verified means it works. Never write "verified", "confirmed" or "it
works" about an event that was only simulated.

## Step 0 — Find out where you are starting

1. `get_setup_status` — has a site already been provisioned in this session?
2. `list_sites` — does the account already have sites? If a site for this
   domain exists, **skip provisioning entirely** and go to Step 2. Creating a
   duplicate site splits the data and is hard to undo.

State which of the three starting points applies before doing anything:
no account, account without this site, or site already exists.

## Step 1 — Create the site (only if there is genuinely no site)

`provision_site` creates a real account on the user's behalf and emails them a
claim link. Treat it as the user's decision, never yours:

1. Show them the terms link — https://sealmetrics.com/terms — and say plainly
   that provisioning creates a free Sealmetrics account tied to their email.
2. Ask for the email address, the site name and the domain. Do not guess an
   email from git config, the environment, or anything else you happen to know.
3. **Wait for the user to say, in their own words, that they accept the terms.**
   Only then call `provision_site(accept_terms=true, email=…, site_name=…,
   domain=…)`.

Never pass `accept_terms=true` on your own initiative. If the user has not
explicitly accepted in the conversation, stop and ask. If they would rather
sign up on the website themselves, that is a perfectly good answer — tell them
to come back with the account id and continue from Step 2.

After it succeeds, tell them to check their email for the claim link, because
the account has no password until they set one.

## Step 2 — Discover what to install

1. `detect_framework(path=<repo root>)` when you have the repository. Without a
   repo it returns `unknown` plus the manual guide, which is fine — you will
   hand the snippet to the user instead of placing it.
2. `get_tracking_code(site_id=…)` returns `script_tag` (the exact tag to place),
   `tracker_url`, a `js_api` block whose `signatures[].call` strings are the
   pageview, conversion and microconversion calls to use verbatim, an
   `implementation_guide` with `spa_support` and `content_grouping`, and worked
   `examples` per vertical. Use those signatures as written — do not paraphrase
   them into a slightly different API.
3. `get_instrumentation_guide(account_id=…)` returns the closed taxonomy with
   the account id substituted.
4. Ask what the site is for, and read the code enough to know where each action
   happens: the product page, the add-to-cart handler, the checkout, the page
   that only renders after a payment succeeds.

**Placement rules that matter more than the framework:**

- The snippet goes in `<head>`, and it must load **before** anything that calls
  `sealmetrics.*`. Most "sealmetrics is not defined" reports are a tag manager
  firing before the tracker.
- One installation per site. Two copies double every pageview.
- In a single-page app, **do not add a pageview call on route changes.** The
  tracker already records every History API navigation by itself (React
  Router, the Next.js router, Vue Router, Nuxt, Angular). A second call on the
  route change counts every navigation twice, and it looks right in code
  review. The only exception is a site that must set the content group from
  code per route: load the tracker with `&spa=0`, which turns the automatic
  route pageview off, and fire `sealmetrics({ group })` yourself.

**The funnel per vertical.** The names are a closed set:
`verify_event_instrumented` rejects any other name as `out_of_taxonomy`, so an
invented name is an event that can never be verified. What distinguishes a room
from a product, or a demo from a contact form, goes in a property:

| Vertical | Conversions | Microconversions |
|---|---|---|
| Ecommerce | `purchase` with revenue | `view_item`, `add_to_cart`, `begin_checkout` |
| Hotel / travel | `booking` with revenue | `view_item` with `item_type: 'room'`, `begin_checkout` |
| SaaS / lead-gen | `signup` (`plan: 'trial'` for a trial), `lead` (`form_name: 'demo_request'` for a demo), `subscription` with revenue | `cta_click` (`cta: 'pricing'`), `form_submit` |

Older sites often already fire names from before the taxonomy was closed —
`product_view`, `start_checkout`, `room_view`, `pricing_view`. Do not write
new calls with those names, and do not rename working calls without asking:
renaming splits the site's history in two. Say which ones the verifier rejects
and let the user decide.

Two things to get right at install time, because retrofitting them is painful:

- **Pass revenue** on the conversion where revenue exists, **as a number**.
  Without it every later recommendation is expressed in conversions instead of
  euros. The tracker silently drops an amount that is not a number, and a total
  read from the DOM, an API or a data layer is often a string (`"149.99"`): wrap
  it in `Number()`, or the conversion arrives, verifies, and carries revenue 0.
- **Pass a product identifier** on *both* the product-view and the
  add-to-cart events, and on each purchase item, using the same key and the
  same value. This single detail is what makes per-SKU analysis possible
  later. Getting it right now costs nothing; adding it in six months means six
  months of unusable history.

Never send personal data. Sealmetrics is consentless by design and that
property depends on no identifiers being passed — no emails, names, user ids,
order ids, phone numbers or addresses, in any event, property or list item.
To avoid counting a purchase twice on a reload, key a `sessionStorage` flag on
the order id in the browser; never send the id.

## Step 3 — Plan, and get the user's approval

**Do not edit a single file before this step ends with the user's approval.**

Call `plan_install` with the whole install as top-level arguments:

- `account_id`, `vertical`, `repo_path` (absolute, when you have the repo) and
  `site: { domain }`.
- `loader: { file, snippet_url, stub }` — `snippet_url` is the `src` of the
  `script_tag` you fetched, verbatim. `stub: true` only if a tag manager or
  inline code can call the tracker before it loads.
- `events` — one entry per call you intend to write: `kind` (`conv`, `micro`,
  or `pageview` for a manual pageview), `name`, `trigger: { type, where }`
  (`page`, `click`, `submit`, `route`, `datalayer` or `code`; `where` is the
  file), `value: { source, type: 'number', example }` for revenue, and
  `properties: { key: { source, type, example } }`. A list such as purchase
  items is `{ type: 'list', max_items, item: { product_id: 'string', … } }`.
  Examples are **synthetic** values; never copy real customer data into them.
- `product_identifier: { key, applies_to: ['view_item', 'add_to_cart', 'purchase.items'] }`
  for stores.

It returns `plan_id`, `status`, `findings` and `summary_markdown`.

- **`status: blocked`** — fix every `block` finding (a name outside the
  taxonomy, an order id, a purchase without revenue, a double pageview, a
  domain the site does not list) and call `plan_install` again. **Never show a
  blocked plan to the user as your proposal.** If a block needs the user's
  decision — a domain missing from the site, an older event name to keep —
  explain it and ask.
- **`status: ok`** — show `summary_markdown`, each `warn` finding in one line,
  and the files you will edit. Then **ask for approval and wait.** Being asked
  to install Sealmetrics is not approval of this plan; only an answer to the
  plan is.

When the user approves, write
`<state-dir>/<site_id>/install-plan.json` — the plan exactly as you passed it,
`plan_id`, `approved_at` (ISO, UTC) and `approval_quote` (their words, at most
200 characters) — and `install-plan.md` with `summary_markdown`. If they ask for
a change, change the plan and go back to the top of this step: a changed plan
has a new `plan_id` and needs its own approval.

## Step 4 — Place the snippet

Exactly as planned: the file, the tag, and the stub when `stub: true`. Show the
diff and say which file you edited.

## Step 5 — Instrument the planned events, and only those

Write one call per planned event, where the plan says. An event that is not in
the approved plan is not written — if one turns out to be needed, that is a
change: back to Step 3.

## Step 6 — Simulate before anything ships

Call `simulate_install` with the approved `plan` (the same object you passed to
`plan_install`), its `plan_id`, `repo_path`, and one case per event:

- `event` — the planned name.
- `code` — the call **exactly as you wrote it**, as plain JavaScript (strip
  TypeScript types).
- `vars` — synthetic values for every variable the call reads, **with the
  types the site really produces**. If the orders API returns the total as a
  string, `vars.order.total` is `"149.99"`, not `149.99`: the point is to catch
  the string.
- `source: { file, line }` — where the call is.

It returns `verdict`, and per case the `hits` with what pixel-service would
store (`stored_as`) and `checks`:

- **`status: stale_plan`** — the plan changed after approval. Back to Step 3.
- **A `fail` check** — fix the code (`SM-04` is revenue that is not a number,
  `SM-02` the tracker not loaded yet, `SM-06` personal data, `SM-08` a hit the
  server would reject) and simulate again. **At most three rounds.** After the
  third, stop, show what still fails, and do not ask the user to deploy.
- **`verdict: pass`** — say the install is simulated, not verified.

Write the result to `<state-dir>/<site_id>/simulations/<simulation_id>.json`.

### Step 6b — Simulate in a browser, when the dev server is running

The call-level simulation checks the calls. It cannot see the page: the snippet
placed twice, a framework that runs the call before the tracker loads, a CSP
that blocks it, a router that counts a navigation twice. When the site runs
locally, `simulate_install` with `level: 'page'` walks it in a local browser.

**Only offer it when the dev server is running.** The user said so, or gave you
its URL. Do not start it yourself, and if they have not mentioned one, ask once
whether it is running and on which port; if not, skip this step and say so in
the final table.

Call it with the same `plan` and `plan_id`, and:

- `base_url` — the local address, e.g. `http://localhost:3000`. Never a
  production, staging or preview URL: `allow_remote_url` is only passed when
  the user explicitly asks to simulate against a non-local address, and it stays
  their decision.
- `flows` — one per planned event, with the steps a person takes to trigger it
  on that dev server: `{ event: 'add_to_cart', steps: [{ goto: '/products/tee',
  expect_pageviews: 1 }, { click: '<selector from the code>', expect_hit: { e:
  'add_to_cart', m: true } }] }`. Take selectors from the components you read;
  never guess one you did not see. A flow for `pageview` checks the tag and the
  count on navigation: `[{ goto: '/' , expect_pageviews: 1 }, { click: '<an
  internal link>', expect_pageviews: 2 }]`. A purchase that needs a real payment
  cannot be walked: skip that flow and say why.

What comes back:

- **`status: unavailable`** — no browser on this machine, or the optional
  `playwright-core` is missing. Show the `install` commands, **ask whether to
  install them, and never run them yourself.** If the user declines, the install
  stays call-simulated only.
- **A result without `level: 'page'`** — the connector predates page simulation.
  Say so in one line and move on.
- **A `fail` check** — `SP-01` the tag is not there exactly once, `SP-02` the
  tracker did not load, `SP-03` a CSP blocks it, `SP-04` a console error from the
  tracker, `SP-05` an expected hit did not arrive exactly once, `SP-06` the
  pageviews are off. Fix the code and run it again, within the same three rounds
  as Step 6. A failure in your own steps (a selector that does not exist) is not
  a finding about the site: fix the flow, not the site.
- **`verdict: pass`** — still simulated, not verified.

Write it next to the call-level result, under `simulations/`.

## Step 7 — Ask the user to deploy

Everything so far is in their working tree. Deploying is their call: ask them to
ship the snippet and the events, and to tell you when it is live. For each
conversion with revenue, ask them to place **one test order with a recognisable
total** once it is live — `1.23`, or whatever the store allows — and to tell you
the exact amount: that total is how Step 9 tells the test from a real customer.
`verify_setup` and `verify_event_instrumented` can only see the live site —
hits from `localhost`, staging or a preview URL are rejected silently unless
that domain is one of the site's domains.

## Step 8 — Prove the pixel on the live site

`verify_setup(account_id=…, timeout_seconds=…)` polls until a real pageview
arrives. Ask the user to open the site in a browser while it runs.

If it times out, do not guess: call `get_troubleshooting_guide` and work the
matching symptom. The usual causes are the snippet sitting outside `<head>`, a
build that has not been deployed yet, or an ad blocker on the only browser
being tested. **Do not verify events until a pageview is confirmed.**

## Step 9 — Verify each event, not just the pixel

For every event you wrote, ask the user to perform the action on the live site —
add something to the cart, submit the form, place the test order — and call:

`verify_event_instrumented(account_id=…, kind='conv'|'micro', name=…,
simulation_id=…, expect={ value_min, value_exact, properties_required },
timeout_seconds=…)`

Those three are the only keys `expect` takes; any other is an error. For the
store in `examples/output.md`, after the user placed a 1.23 € test order:

```
verify_event_instrumented(account_id='acct_demo', kind='micro', name='add_to_cart',
  simulation_id='sim_…', expect={ properties_required: ['product_id', 'quantity'] })
verify_event_instrumented(account_id='acct_demo', kind='conv', name='purchase',
  simulation_id='sim_…', expect={ value_min: 0.01, value_exact: 1.23,
  properties_required: ['currency', 'items'] })
```

**Every call carries `expect`** when the plan gives the event revenue or
properties — microconversions included. A call with only `simulation_id`
compares nothing when the simulation ran in another session, which after a
deploy it almost always did.

**Coming back after the deploy.** When the user returns to verify, possibly in
a new conversation, start at Step 8 from `<state-dir>/<site_id>/install-plan.json`
and the latest file in `simulations/`. Do not plan or simulate again unless
something fails.

- `simulation_id` — the last passing call-level simulation in
  `<state-dir>/<site_id>/simulations/`. The connector derives from it what the
  row should carry, but only in the session that ran the simulation.
- `expect` — always pass it too, built from the approved plan in
  `install-plan.json`, because the deploy usually happens in a later session:
  - `value_min: 0.01` for a conversion the plan gives revenue;
  - `value_exact` — the test order's total, **exactly as the user told you**;
    never a number you picked. Without one, leave it out;
  - `properties_required` — every property key **the plan** gives that event.
    Take them from `install-plan.json`, never from the code as it is now:
    checking that the deployed code still sends what was approved is the point,
    and a key that a later edit dropped is exactly what this catches. Leave out
    only a key the plan itself describes as conditional (a coupon that exists on
    some orders), or a real row without it is a false mismatch.

  `value_min` and `value_exact` are for conversions only: microconversions carry
  no amount.
- `lookback_minutes` — only if the user did the action more than 15 minutes ago.

Build the `expect` of every event from the plan before the first call, and
pass `value_exact` on the first call when the user already told you the amount.

Read the status literally:

- **`verified`** — the row arrived as planned. This is the only ✓.
- **`verified_by_recency`** — rows with that name arrived, but several did and
  nothing identified the test: it may be a real visitor's. Write "✓ by recency"
  and say so; for a conversion, ask for the test order with a recognisable total
  and verify again with `value_exact`.
- **`mismatch`** — it arrived, but not as the install sends it. Quote
  `mismatches`. No revenue on a conversion that simulated with revenue means
  production reads the amount from somewhere else (a string, another data layer,
  a different build): find where, fix it, simulate again (Step 6), and ask for a
  new deploy. A missing property is the same loop. Never report a mismatch as
  verified.
- **`warning_pii`** — personal data reached Sealmetrics. Say which keys, remove
  them from the code first, and tell the user plainly that the rows already stored
  carry it.
- **`pending`** — nothing arrived in the window. The message says whether rows
  came with a different amount. Ask whether the action was done on the live site,
  then run it again; do not loop more than twice per event.
- **`rejected`** — `out_of_taxonomy` or `not_lowercase`: the name in the code is
  wrong. Fix the code, which is a change to the plan (Step 3).
- **`needs_expectation`** — you passed a `simulation_id` from another session and
  no `expect`, so nothing could be compared. Call again with `expect` from the
  plan; it is not a result to report.

If the result carries `simulation: "not_in_session"`, the simulation ran in
another session: the explicit `expect` is what was checked. If it carries no
`expectation` at all while you passed one, the connector predates expectations
(`@sealmetrics/mcp` before 1.9.0): say so in one line, and write "✓ arrived,
not compared" rather than ✓.

Whenever you verify — in the same session as the install or a later one — end
with the table from Step 10: the statuses above go in its `Verified live` column,
one row per event.

An event that was written but never fires is worse than a missing one, because it
looks instrumented in the code review. A purchase needs a real test order; if
nobody places one, the event stays unverified.

## Step 10 — Hand off

1. The final table, with three status columns that are never merged:

   | Event | Kind | Where | Planned | Simulated | Verified live |
   |---|---|---|---|---|---|

   `Planned` carries the `plan_id`; `Simulated` says which levels ran — `✓ call`,
   `✓ call · ✓ page`, or what failed — and, when the page level did not run, why
   (no dev server, no browser, the user declined); `Verified live` is ✓ only for
   `verified`, "✓ by recency" for `verified_by_recency`, and otherwise what is
   wrong or still missing (a mismatch, a test order, a deploy).
2. Write what you established into `<state-dir>/<site_id>/profile.json` — site
   id, domain, timezone, vertical, the real event names you used and the
   product identifier key. Seal Copilot reads that profile, so writing it here
   is what makes the first analysis cheap. The contract is
   `skills/seal-copilot/references/state-schema.md` in the Seal Copilot plugin;
   the fields that matter at install time are `site_id`, `site_name`,
   `timezone`, `currency`, `vertical`, `events`, `product_identifier` and
   `discovery_cached_at`.
3. **Offer to keep the plan in the repository**, and write it only if the user
   says yes: `.sealmetrics/plan.json` with `{ "plan_id": …, "plan": … }` — the
   approved plan exactly as in `install-plan.json` — and `.sealmetrics/cases.json`
   with `{ "cases": […] }`, the cases of the last passing simulation. In the
   repository the plan is reviewed with the code in each pull request, and the
   next agent starts from it. With it, the `sealmetrics` CLI (0.2.0 or later)
   checks the install in CI: `sealmetrics plan` fails when the plan changed
   without a new approval, `sealmetrics simulate` when a call breaks. Mention
   that; add a CI workflow only if they ask for one, and then use the recipe in
   the CLI's README rather than writing your own.
4. Tell the user that data takes a few days to become analyzable, and name the
   first analysis worth running: `property-explorer` once events are flowing,
   then `weekly-health-check`.
5. If anything is simulated but not verified, say so explicitly and offer Seal
   Copilot's `setup-audit` to re-check once traffic arrives.

## What you do NOT do

- Do not call `provision_site` without the user's explicit acceptance of the
  terms in this conversation. Never infer acceptance from their asking you to
  install Sealmetrics.
- Do not create a second site for a domain that already has one.
- Do not edit any file before the user approves the plan, and do not write a
  call for an event the approved plan does not contain.
- Do not show a `blocked` plan to the user as a proposal.
- Do not pass any personal identifier into any event, property or list item.
- Do not invent event names outside the instrumentation guide's taxonomy.
- Do not say "verified", "confirmed" or "it works" about an event that was only
  simulated. Only `verify_event_instrumented`, on the live site, settles that —
  and only with `status: verified`: `verified_by_recency` and `mismatch` are not a ✓.
- Do not invent the test order's amount for `value_exact`; it is what the user
  paid, in their words.
- Do not write `.sealmetrics/` into the repository, or add a CI workflow, without
  the user's yes.
- Do not ask the user to deploy while a simulation still fails.
- Do not install a browser or `playwright-core`, start a dev server, or simulate
  against a non-local URL without the user's explicit say-so.
- Do not deploy. You edit the code; shipping it is the user's call.

---

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `24` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
