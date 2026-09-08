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
---

# Install Sealmetrics

Take a site from no analytics to measured and verified. This is the only skill
that writes code, and the only one that can create an account — both are gated
below. Budget: ≤15 tool calls plus whatever editing the codebase takes.

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
- In a single-page app, the tracker must be told about route changes rather
  than reloading — otherwise you get one pageview per session, or duplicates,
  depending on how the router is wired. Follow the API reference for the
  framework you detected.

Place it, show the diff, and say which file you edited.

## Step 3 — Prove it works before going further

`verify_setup(account_id=…, timeout_seconds=…)` polls until a real pageview
arrives. Ask the user to open the site in a browser while it runs.

If it times out, do not guess: call `get_troubleshooting_guide` and work the
matching symptom. The usual causes are the snippet sitting outside `<head>`, a
build that has not been deployed yet, or an ad blocker on the only browser
being tested.

**Do not instrument events until a pageview is confirmed.** Everything after
this depends on the tracker loading at all.

## Step 4 — Instrument what the business actually measures

`get_instrumentation_guide(account_id=…)` returns the canonical taxonomy with
the account id substituted. Follow it — the conversion and microconversion
names are a closed set, and inventing names is what makes later analysis
impossible.

Ask what the site is for, then instrument the funnel for that vertical:

| Vertical | Conversions | Microconversions |
|---|---|---|
| Ecommerce | `purchase` with revenue | `product_view`, `add_to_cart`, `start_checkout` |
| Hotel / travel | `booking` with revenue | `room_view`, `booking_start` |
| SaaS / lead-gen | `signup`, `demo_request`, `trial_start` | `pricing_view`, `cta_click`, `form_view` |

Two things to get right at install time, because retrofitting them is painful:

- **Pass revenue** on the conversion where revenue exists. Without it every
  later recommendation is expressed in conversions instead of euros.
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

Ask the user to perform the action — add something to the cart, submit the
form — while it polls. An event that was written but never fires is worse than
a missing one, because it looks instrumented in the code review.

Report each event as confirmed or not confirmed. Do not mark an event done
because the code looks right.

## Step 6 — Hand off

1. Write what you established into
   `<state-dir>/<site_id>/profile.json` — site id, domain, timezone,
   vertical, the real event names you used and the product identifier key.
   See `skills/seal-copilot/references/state-schema.md`.
2. Tell the user that data takes a few days to become analyzable, and name the
   first analysis that will be worth running: `property-explorer` once events
   are flowing, then `weekly-health-check`.
3. If anything is instrumented but unverified, say so explicitly and offer
   `setup-audit` to re-check once traffic arrives.

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
