---
name: install-sealmetrics
description: >
  Install Sealmetrics on a site from scratch: create the site if needed, place
  the tracking snippet in the codebase, confirm the first hit arrives, then
  instrument the conversions and microconversions the business actually needs.
  Trigger on: "install Sealmetrics", "set up Sealmetrics", "add analytics to
  this site", "instalar Sealmetrics", "configurar el píxel", "I have no
  tracking yet", "add the tracking code", "instrument my checkout", or when
  another skill finds that a site has no data at all.
argument-hint: "[domain]"
short-description: 'Install Sealmetrics from scratch: create the site, place the pixel, verify it, instrument events. Use for "install Sealmetrics", "set up tracking", "instalar Sealmetrics".'
---

# Install Sealmetrics

Take a site from no analytics to measured and verified. This is the only skill
that writes code, and the only one that can create an account — both are gated
below. Budget: ≤15 tool calls plus whatever editing the codebase takes.

**This skill needs the local connector**, the one this plugin carries:
`npx @sealmetrics/mcp` with `SEALMETRICS_API_KEY` in the environment. Half the
procedure — `provision_site`, `verify_setup`, `get_instrumentation_guide`,
`verify_event_instrumented` — reaches backend routes that the remote OAuth
connector does not announce, which is why installing lives in its own plugin
rather than in Seal Copilot.

Check before step 0: if `provision_site` and `verify_setup` are not in your
tool list, you are on the remote connector. Say so in one line, tell the user
to install `seal-install` and set `SEALMETRICS_API_KEY`, and stop. Do not hand
over a snippet you could not fetch — that is how a site ends up with tracking
that looks right and measures nothing.

Before writing your answer, read `examples/output.md` in this skill directory
and match its density, structure and tone.

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

## Step 2 — Work out where the snippet goes

`detect_framework(path=<repo root>)` when you have the repository. Without a
repo it returns `unknown` plus the manual guide, which is fine — you will hand
the snippet to the user instead of placing it.

`get_tracking_code(site_id=…)` returns `script_tag` (the exact tag to place),
`tracker_url`, a `js_api` block whose `signatures[].call` strings are the
pageview, conversion and microconversion calls to use verbatim, an
`implementation_guide` with `spa_support` and `content_grouping`, and worked
`examples` per vertical. Use those signatures as written — do not paraphrase
them into a slightly different API.

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

Place it, show the diff, and say which file you edited.

## Step 3 — Prove it works before going further

`verify_setup(account_id=…, timeout_seconds=…)` polls until a real pageview
arrives. It can only see the live site: hits from `localhost`, staging or a
preview URL are rejected silently unless that domain is one of the site's
domains. So the snippet has to be deployed first, and deploying is the user's
call. Ask them to deploy it and open the site in a browser, then poll.

If it times out, do not guess: call `get_troubleshooting_guide` and work the
matching symptom. The usual causes are the snippet sitting outside `<head>`, a
build that has not been deployed yet, or an ad blocker on the only browser
being tested.

**Do not instrument events until a pageview is confirmed.** Everything after
this depends on the tracker loading at all.

## Step 4 — Instrument what the business actually measures

`get_instrumentation_guide(account_id=…)` returns the canonical taxonomy with
the account id substituted. Follow it — the conversion and microconversion
names are a closed set. `verify_event_instrumented` rejects any other name as
`out_of_taxonomy`, so an invented name is an event that can never be verified.

Ask what the site is for, then instrument the funnel for that vertical. What
distinguishes a room from a product, or a demo from a contact form, goes in a
property, not in a new event name:

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
  read from the DOM or a data layer is usually a string (`"149.99"`): wrap it in
  `Number()`, or the conversion arrives, verifies, and carries revenue 0.
- **Pass a product identifier** on *both* the product-view and the
  add-to-cart events, using the same key and the same value. This single
  detail is what makes per-SKU analysis possible later. Getting it right now
  costs nothing; adding it in six months means six months of unusable history.

Never send personal data. Sealmetrics is consentless by design and that
property depends on no identifiers being passed — no emails, names, user ids,
order ids, phone numbers or addresses, in any event or property.

## Step 5 — Verify each event, not just the pixel

For every event you wrote:

`verify_event_instrumented(account_id=…, kind='conv'|'micro', name=…,
timeout_seconds=…)`

Ask the user to deploy the instrumentation and perform the action on the live
site — add something to the cart, submit the form — while it polls. An event that was written but never fires is worse than
a missing one, because it looks instrumented in the code review.

Report each event as confirmed or not confirmed. Do not mark an event done
because the code looks right.

## Step 6 — Hand off

1. Write what you established into
   `<state-dir>/<site_id>/profile.json` — site id, domain, timezone,
   vertical, the real event names you used and the product identifier key.
   Seal Copilot reads that profile, so writing it here is what makes the first
   analysis cheap. The contract is `skills/seal-copilot/references/state-schema.md`
   in the Seal Copilot plugin; the fields that matter at install time are
   `site_id`, `site_name`, `timezone`, `currency`, `vertical`, `events`,
   `product_identifier` and `discovery_cached_at`.
2. Tell the user that data takes a few days to become analyzable, and name the
   first analysis that will be worth running: `property-explorer` once events
   are flowing, then `weekly-health-check`.
3. If anything is instrumented but unverified, say so explicitly and offer
   Seal Copilot's `setup-audit` to re-check once traffic arrives.

## What you do NOT do

- Do not call `provision_site` without the user's explicit acceptance of the
  terms in this conversation. Never infer acceptance from their asking you to
  install Sealmetrics.
- Do not create a second site for a domain that already has one.
- Do not pass any personal identifier into any event or property.
- Do not claim an event works because you wrote the code. Only
  `verify_event_instrumented` settles that.
- Do not invent event names outside the instrumentation guide's taxonomy.
- Do not deploy. You edit the code; shipping it is the user's call.

---

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `15` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
