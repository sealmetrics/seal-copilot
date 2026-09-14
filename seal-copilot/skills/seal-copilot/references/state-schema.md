# Persistent State

Seal Copilot remembers what it learned about a site between runs. Without
this, every scheduled run rediscovers the same facts, every scan re-proposes
the same finding, and no recommendation is ever verified.

**Location — `<state-dir>`:** the SessionStart hook announces it as
"State directory: …" at the top of every session. **Use that path, exactly as
announced.** It is `$SEAL_COPILOT_STATE_DIR` when set, otherwise
`~/.seal-copilot`. Never write to the literal `~/.seal-copilot` when a
different directory was announced: the override exists so that test runs and
sandboxes stay isolated from a real account's state, and ignoring it has
already put fixture data into a real home directory once. If no directory was
announced at all, fall back to `~/.seal-copilot`.

Everything below lives under `<state-dir>/<site_id>/`, outside the plugin
directory (which is read-only after install). Create it on first write.

**No skill forks, and none should.** `context: fork` starts a fresh context
that never received the SessionStart hook's output. A forked skill therefore
cannot learn `<state-dir>` (it falls back to the literal `~/.seal-copilot` —
how fixture data reached a real home directory twice) and cannot read
`profile.json` before deciding what to do. The second cost is worse than the
first: `product-friction`, forked, skipped `list_property_keys` and *guessed*
that the product identifier was `sku`. It was right on the fixture and would
be silently wrong on any account keyed by `product_id`. Keeping raw JSON out
of the main conversation is not worth a skill that guesses instead of asking.

**Every read is optional.** If a file is missing or the filesystem is not
writable (some sandboxed environments), run the discovery you would have run
anyway and say once, in one line, that results could not be cached. Never
fail a skill because state is unavailable, and never block on it.

**Every write is append-or-replace, never a read-modify-write race.**
Scheduled skills can overlap; keep writes small and idempotent.

## The protocol every skill follows

1. **Load** `profile.json` at the start. It answers questions that otherwise
   cost calls: which site, which timezone, which vertical, what the site's
   real event names are, which product identifier to use.
2. **Use it** instead of re-discovering. If a cached value is past its TTL,
   refresh just that value, not the whole profile.
3. **Write back** anything you learned that a later run would otherwise have
   to rediscover.
4. **Log the run** in `runs.jsonl`.

## `profile.json`

Written by **whichever skill runs discovery first** — the core skill's session
start, `property-explorer`, `setup-audit`, or a report skill on a site with no
profile yet. Read by all. If you called `list_sites` or `get_site` and there
was no profile, you write it; saying "profile initialized" without writing the
file is the one thing the first real run got wrong here.

```json
{
  "site_id": "example-com",
  "account_id": "refused",
  "site_name": "example.com",
  "connector": "remote",
  "timezone": "Europe/Madrid",
  "currency": "EUR",
  "vertical": "ecommerce",
  "events": {
    "view": "product_view",
    "add_to_cart": "add_to_cart",
    "checkout": "start_checkout",
    "purchase": "purchase"
  },
  "product_identifier": { "key": "sku", "table": "conversion_items" },
  "thresholds": {},
  "targets": {},
  "first_data_date": "2025-11-02",
  "discovery_cached_at": "2026-09-07",
  "scheduling_offered": { "monday_briefing": true, "cart_watchdog": false }
}
```

**These field names are the contract.** A real run wrote `name`, `domain`,
`event_names` and `product_identifier_table` instead, and every skill that
later looked for `site_name`, `events` and `product_identifier.key` found
nothing and re-ran discovery — which is the one thing the profile exists to
prevent. Write these names, not synonyms of them. The eval suite asserts on
them.

`connector` is `"remote"` or `"local"`, and it is free to determine: `remote`
is the one where `list_alerts` and `list_segments` are not announced in the
tool list you were given.
It decides which steps of every skill can run, so write it on the first run and
read it before planning an analysis. See "The connector decides which tools
exist" in `methodology.md`.

`currency` is the ISO code the site reports in, from `get_site`. **Every money
figure in every report uses it.** The default is not euros; the default is
whatever this site says. A store reporting in USD that is handed a report in €
cannot use any number in it.

`thresholds` overrides the defaults in `methodology.md`, per site, for the
values that table lists — `anomaly_pct`, `min_conversions`, `min_entrances`,
`leaky_campaign_ratio`, and so on. Empty means use the defaults. When the user
states a threshold of their own ("under 500 entrances I do not care"), write it
here; without that, the next session forgets and the correction has to be
repeated.

`targets` holds monthly goals when the user states them — `revenue`,
`conversions` or `leads`, plus the month they apply to. Absent means the user
has not set one; never invent a target.

`account_id` is **not a second identifier**: the configuration tools send the
same site id under that wire name. Keep the field as a record of whether that
family answered — `"same-as-site"` when it works, `"refused"` when the backend
returns 403 — so later skills know without spending a call. See "A successful
call can still be a failure" in `methodology.md`.

**Never spend a Sealmetrics call just to fill the profile.** Write it from
what the analysis already fetched and leave the rest absent; a field you did
not need is not worth a call. A diagnosis once spent three of its six calls on
`get_site`, `list_microconversion_types` and `list_property_keys` to populate
the profile, and ran out of budget before naming the referrer carrying the
spike — the one thing that made the finding actionable. The analysis owns the
budget; the profile gets the leftovers.

**`discovery_cached_at` is mandatory** — write it whenever you write the
profile. The first real run omitted it, which left the TTL below with nothing
to read. **TTL: 7 days** on `discovery_cached_at`. Past that, re-run `list_sites`,
`list_microconversion_types` and `list_property_keys` and refresh the file.
Refresh immediately, regardless of TTL, if any skill finds an event name or
property key that contradicts the profile — that means tracking changed.

`scheduling_offered` exists so the plugin offers a schedule **once** and then
stops asking.

## `property-map.md`

Written by `property-explorer` only. Read by `product-friction`,
`opportunity-scan`, `channel-mix-optimizer` and the core skill.

Human-readable Markdown, not JSON — the user is meant to read and correct it.
It holds the inventory table (property, table, types, cardinality, score), the
top 5 with their reasons, and the recommended starter analyses.

**TTL: 30 days.** Past that, say it is stale and offer to re-run
`property-explorer` before relying on it for a recommendation.

## `watchdog-baseline.json`

Written by `calibrate-watchdog`, read and status-updated by `cart-watchdog`.
Schema and TTL are documented in the `calibrate-watchdog` skill.

## `recommendations.jsonl`

One JSON object per line, appended by any skill that issues a recommendation.
This is the ledger that turns a report into consulting.

```json
{"id":"2026-09-07-leaky-summer-sale-es","date":"2026-09-07","skill":"opportunity-scan","pattern":"leaky-campaign","subject":"summer-sale-es","evidence":"2,014 entrances, CR 0.8% vs channel avg 2.1%, 30d","action":"Fix ad-to-landing message match, or pause and reallocate","impact_eur_month":1840,"metric":"campaign CR","baseline":0.008,"target":0.021,"verify_on":"2026-10-05","status":"open"}
```

- `id` — `<date>-<pattern>-<subject>`, slugified. Used to detect repeats.
- `metric`, `baseline`, `target` — what must move, and from where to where.
  Without these the recommendation cannot be verified later, so never omit
  them.
- `verify_on` — today + the verification window the recommendation stated
  (2–4 weeks; one full booking cycle for hotels).
- `status` — `open` → `verified` | `failed` | `discarded`.

### Follow-up (weekly-health-check and monday-briefing)

Before reporting anything new, read the ledger and act on entries where
`status` is `open` and `verify_on` is today or earlier:

1. Re-run the one call that measures `metric` for `subject`.
2. Moved to `target` or beyond → `verified`. Moved less than a third of the
   way, or backwards → `failed`. In between → leave `open` and push
   `verify_on` out by two weeks, once only; a second inconclusive check
   becomes `failed`.
3. Report the outcome in one line each, above the new findings. Verified
   recommendations are the plugin's track record — show them.
4. Rewrite the file with updated statuses.

### Repeat suppression (opportunity-scan)

Do not re-report a pattern that already has an `open` entry for the same
`subject`, unless the recomputed `impact_eur_month` has grown by ≥50%. In
that case report it as an escalation and say it was already flagged on
`date`. Patterns with a `discarded` entry stay suppressed for 90 days.

## `alerts.json`

Written and maintained by `create-alert`, read by `check-alerts`,
`monday-briefing` and `setup-audit`. One object per rule, in a list:

```json
{
  "site_id": "example-com",
  "rules": [
    {
      "id": "no-conversions-4h",
      "family": "silence",
      "metric": { "kind": "conversion", "type": "purchase" },
      "filter": {},
      "condition": { "hours": 4 },
      "active_hours": { "from": 8, "to": 24, "days": ["mon","tue","wed","thu","fri","sat","sun"] },
      "cadence_minutes": 60,
      "timezone": "Europe/Madrid",
      "expected": null,
      "deliver": ["app"],
      "created_at": "2026-09-12",
      "expires_at": "2027-03-12",
      "status": "active",
      "last_fired": null
    }
  ]
}
```

The full grammar, the four families and what each field means live in the
`create-alert` skill. Three rules matter here:

- **The file is a convenience, never a dependency.** `check-alerts` receives
  its rule inside the prompt the scheduler fires, because a scheduled run may
  have no filesystem at all. This file exists so that "what am I watching?" and
  "stop watching X" can be answered without the user remembering.
- `status` is `active` | `paused` | `deleted`. Deleted rules stay in the file
  with the date, so a later "did I have an alert on that?" has an answer.
- `last_fired` is an ISO timestamp or `null`, used for the cooldown. A rule
  that fired an hour ago and is still failing does not fire again until it has
  recovered and broken a second time.

## `runs.jsonl`

One line per skill execution. Cheap, and it is what makes the call budget
measurable — **only if the fields are exactly these.** The first real run
wrote `run_at`, `reason` and `findings_issued` and omitted `calls` and
`budget`, which made budget compliance unmeasurable and the usage report
blank. Use these names and no others; add nothing, rename nothing.

```json
{"ts":"2026-09-07T08:00:12Z","skill":"monday-briefing","calls":13,"budget":15,"verdict":"watch","scheduled":true,"notes":"channel split refused"}
```

- `ts` — ISO timestamp, UTC.
- `calls` — the number of Sealmetrics tool calls this run actually made.
  Count them; do not estimate.
- `budget` — the ceiling the skill documents for itself.
- `verdict` — one of `on_track`, `watch`, `act`, `kpis_only`, `refused`,
  `error`.
- `notes` — free text, one line, for anything a reader would need: a call
  that was refused, a step skipped and why.

Read by `cost-reduction` (to spot skills that consistently overrun) and by the
eval suite. No skill needs to read it to do its own job.

## Writing state from a skill

Use the `Read` and `Write` tools against the paths above. Two rules:

- **Never write PII into state.** These files hold site configuration,
  aggregate metrics and recommendation text. Nothing else.
- **Never invent a cached value.** If a field is absent, it is unknown — go
  and measure it, do not assume a default.
