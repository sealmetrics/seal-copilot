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
to install `seal-install` and set `SEALMETRICS_API_KEY`, and stop. Never hand
over a snippet you could not fetch, which is how a site ends up with tracking
that looks right and measures nothing. If those two are there but
`plan_install` and `simulate_install` are not, the connector predates them
(`@sealmetrics/mcp` before 1.9.0): still write the plan and wait for approval
in Step 3, skip Step 6, and mark every event "not simulated" in the final
table.

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

**Before writing any call, read `references/instrumentation.md`:** where the
snippet goes, why a single-page app must not fire its own pageview, the closed
event names per vertical, and the two things that are painful to retrofit,
revenue as a number and one product identifier across all three events.

**Never send personal data.** No emails, names, user ids, order ids, phone
numbers or addresses, in any event, property or list item. Sealmetrics is
consentless by design and that property depends on it.

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

`simulate_install` runs the approved plan without shipping it: the call level
checks each call you wrote against the real tracker, and the page level walks
the running site in a local browser. **Follow
`references/simulation.md`** for the arguments, the case shape, when to offer
the page level, and how to read a failure. A simulation is not evidence that
an event arrives.

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

The pixel proves the snippet loaded, nothing more. For every event you wrote,
ask the user to perform the action on the live site, then call
`verify_event_instrumented` with the `simulation_id` and an `expect` of
`value_min`, `value_exact` or `properties_required`. **Follow
`references/verification.md`** for the statuses and what each one licenses you
to say. A status of `verified_by_recency` or `mismatch` is not a verification.

## Step 10 — Hand off

Give the user one table with three separate status columns, Planned,
Simulated and Verified live, never merged, then write what you established
into state. **Follow `references/handoff.md`** for the table, the state fields
and what to say about anything still unverified.

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
