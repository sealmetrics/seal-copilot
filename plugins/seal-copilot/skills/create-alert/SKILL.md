---
name: create-alert
description: >
  Turns a sentence like "tell me if I go four hours without conversions" into a
  sound alert rule: confirms the event exists, measures whether the rule would
  be noise, and saves it. It does not schedule anything — automatic delivery
  arrives with Sealmetrics' own alert engine; until then a saved rule runs on
  request through check-alerts. Also lists, pauses and deletes saved rules. Trigger on: "alert me if", "tell me when", "warn me if",
  "avísame si", "quiero saber cuándo", "notify me when", "set up an alert",
  "create an alert", "crea una alerta", "my alerts", "qué alertas tengo",
  "stop watching", "delete the alert", "pause the alert".
argument-hint: "[the condition to watch]"
short-description: 'Turn a sentence into a sound alert rule and save it — "tell me if 4 hours pass with no conversions". Nothing is scheduled. Use for "alert me if", "avísame si", "my alerts", "delete the alert".'
---

# Create Alert

**Before anything else: emit no text until the answer.** **Your first action
is a tool call, not a sentence** — not "Checking whether purchases are
tracked", not "Now saving the rule, then confirming". Saving the rule and
logging the run are things you do, not things you announce. Make the calls in
silence; your first and only message is the answer, and nothing comes after it.

Before writing your answer, read `examples/output.md` in this skill directory
and match its density and tone. It is the reference for what a good run of this
skill looks like.

Budget: ≤3 Sealmetrics calls — up to two to find the event and measure it, one
for the expectation a `drop` rule needs. The output of a successful run is
under 10 lines.

**The only other tools this skill uses are Read and Write** (for state). No shell: not `ls` to look for a state directory, not
`echo` as a placeholder between calls. A real run spent two shell calls doing
nothing; Read answers whether a file exists.

**Works on every connector.** These rules are the plugin's own and need none
of the tools the remote connector withholds; `list_alerts` and the other
dashboard-alert tools are not available to it and are a different product. Do
not tell a user on the remote connector that alerts need the local one.

**This skill schedules nothing.** Not `/schedule`, not a routine, not a cron,
not a Cowork task — even when the user asks for one. Routines were tried: none
ever ran an alert end to end, and they cannot. A routine only has the plugin if
a repository declares it, runs at most hourly, counts against a daily cap of
runs on the account, and was created with every connector the account has —
mail and payments included — to read one counter. Alerts that watch on their
own arrive with Sealmetrics' native alert engine. Until then, say so plainly:
the rule is saved, and "run my alert X" checks it now through `check-alerts`.
If the user asks you to schedule it, that one sentence is the answer; do not
offer a workaround.

This skill writes the rule. `check-alerts` evaluates it when the user asks. The
two share the grammar below and nothing else.

## The rule grammar

```json
{
  "id": "no-conversions-4h",
  "site_id": "demo-store",
  "family": "silence",
  "metric": { "kind": "conversion", "type": "purchase" },
  "filter": {},
  "condition": { "hours": 4 },
  "active_hours": { "from": 8, "to": 24, "days": ["mon","tue","wed","thu","fri","sat","sun"] },
  "timezone": "Europe/Madrid",
  "expected": null,
  "deliver": ["app"],
  "created_at": "2026-09-12",
  "expires_at": "2027-03-12",
  "status": "active"
}
```

| Field | Rule |
|---|---|
| `id` | Slug of what is watched plus the condition: `no-conversions-4h`, `atc-half-normal`, `revenue-under-2000`. It is how the user refers to the rule later |
| `family` | One of `silence`, `drop`, `spike`, `threshold`. See the table below |
| `metric.kind` | `conversion`, `microconversion`, `revenue` or `entrances` |
| `metric.type` | The site's **real** event name, from `list_microconversion_types` or `get_conversions`. Never the canonical name, never a guess |
| `filter` | Only filters the tool for that metric actually accepts. A filter the tool does not support is refused at creation, never passed and ignored |
| `condition` | `{ "hours": N }` for `silence`; `{ "ratio": 0.5 }` for `drop` and `spike`; `{ "below": 2000 }` or `{ "above": N }` for `threshold` |
| `active_hours` | **Mandatory for `silence` and `drop`.** Local hours `from`–`to` and the days it applies |
| `expected` | `drop` and `spike` only. The expectation **embedded at creation time**, so the check needs no stored state |
| `deliver` | `["app"]`, or add `"slack"` / `"email"` when the user has that connector and asks for it |
| `expires_at` | Six months out. An alert nobody revisits becomes noise |

## The four families

| Family | The user says | What the check does | Calls |
|---|---|---|---|
| `silence` | "four hours with no conversions", "two hours without add-to-cart on mobile" | Day total, then the timestamp of the most recent event. Fires when the gap reaches `hours` inside active hours | 1–2 |
| `drop` | "less than half of normal by mid-afternoon" | Day-to-date against the `expected` curve for this weekday and hour | 1 |
| `spike` | "if one campaign triples in an hour" | The mirror of `drop` | 1–2 |
| `threshold` | "if revenue does not reach 2,000 today", "if brand-es drops below 10 conversions a day" | One reading against a fixed number | 1 |

Anything else — rules about saved segments, about a metric
that would take more than two calls, or comparing two sites — is out of scope.
Say so plainly and offer the nearest rule that is in scope.

## Procedure

### 1. Parse, then ask once

Turn the sentence into the grammar. Whatever the user did not say, **ask — do
not assume**, and ask everything in a single message:

- The metric, when the site has several plausible events for the word they used.
- `active_hours`, for `silence` and `drop`. Zero conversions at 04:00 is normal
  on most sites; a rule without active hours pages people at night and gets
  deleted within a week. If the site profile has a watchdog baseline, propose
  the hours where the median is above zero and let the user confirm.
- Where the alert should arrive, if they have more than one option.

Sensible defaults you may apply without asking: `expires_at` six months out,
`deliver: ["app"]`, `filter: {}`.

### 2. Verify the metric exists, and that the rule will not be noise (1–2 calls)

**Check both surfaces before saying an event is not tracked.** The user says
"demo requests" or "sales"; they do not say whether the site records that as a
conversion or a microconversion, and you cannot tell from the word. Call
`list_microconversion_types`; if the name is not there, call
`get_conversions(period=30d)` before concluding anything — and the other way
round. Only when it is in **neither** is the event genuinely untracked, and only
then do you list what does exist and stop.

Getting this wrong is not a near miss. A run told a SaaS account that
`demo_request` was not being tracked, having looked only at the microconversion
list; it was the site's macro conversion, 41 of them that month. Set
`metric.kind` from where you actually found the event, never from the word the
user used.

**Noise check: how often would it fire on a normal site?** A `silence` rule of
four hours on an event that happens three times a day fires most afternoons and
teaches the user to ignore you. Measure it, from the 30-day count:

1. `rate` = 30-day count ÷ (active hours a day × 30). Use the active hours the
   user gave, or the ones you are about to propose.
2. `λ` = `rate` × the window, in active hours. For "fewer than 1 today" the
   window is one day's active hours.
3. `p` = e^−λ, the chance that a perfectly normal window holds zero events.

   | λ | 0.5 | 1 | 2 | 3 | 4 | 5 | 6 | 8 |
   |---|---|---|---|---|---|---|---|---|
   | e^−λ | 61% | 37% | 14% | 5% | 1.8% | 0.7% | 0.25% | 0.03% |

4. False alarms a month ≈ 30 × max(1, active hours a day ÷ window hours) × `p`.

**Above one false alarm a month, refuse the rule as written.** Say the figure
in the user's terms — "it would fire about 8 times a month with nothing
wrong", or "almost every day" when it is 30 or more — and show `λ` behind it.

For a `threshold` below N with N > 1, `p` is the Poisson tail P(count < N).
Shortcut: an expected count of 10 or more per period, with N at most half of
it, stays under one false alarm a month on a daily or weekly period.

**Every alternative you propose passes the same test, and you give its
figure.** A real run refused "4 hours without CTA clicks" on a site doing 2.4 a
day, then offered a 12-hour silence and a daily "fewer than 1" threshold. Both
have λ = 2.4 — a false alarm about 9% of days, nearly three a month — so it
refused one noisy rule by recommending two. At that volume the sound options
are longer: two days without a click (λ = 4.8, about one false alarm a
quarter), or a weekly threshold. If nothing short enough to be useful passes,
say so: at this volume the alert can catch broken tracking, not a bad
afternoon.

### 3. Fill `expected`, for `drop` and `spike` only (0–1 calls)

- If `<state-dir>/<site_id>/watchdog-baseline.json` exists and has not expired,
  take the cumulative-by-hour curve from it. No call.
- Otherwise one call for the same weekday last week, spread across active hours,
  and set `"expected_basis": "last-week-flat"` so the check can say the
  comparison is coarse.

Never leave `expected` null on a `drop` or `spike` rule. A check that has to
invent its own expectation is the guessed threshold this plugin refuses to use.

### 4. Save it

Add the rule to `<state-dir>/<site_id>/alerts.json`. **The file is an object
with a `rules` array, never a bare list:**

```json
{ "site_id": "demo-store", "rules": [ { "id": "no-conversions-4h", … } ] }
```

Read the file first; if it exists, append to its `rules` and write the whole
object back. The session-start hook, `monday-briefing` and `setup-audit` read
`rules` — a bare array written by a real run was invisible to all three. Full
schema in `skills/seal-copilot/references/state-schema.md`. This file is what
makes "my alerts", "run my alert X" and "delete the alert" answerable later.
If the filesystem is not writable, say once that the rule could not be saved,
and print it as JSON so the user can keep it.

## Managing what exists

- **"My alerts"** — read `alerts.json`, list `status: active` rules one line
  each: what it watches, the condition, the hours. Name any rule expiring
  within 30 days. Never describe them as being watched.
- **"Run my alert X now"** — that is `check-alerts`, with the rule read from
  `alerts.json`.
- **"Delete the alert" / "stop watching X"** — name the rule you are about to
  remove and wait for confirmation. Then set `status: "deleted"` with the date;
  keep the entry.
- **"Pause it"** — `status: "paused"`, rule kept so it can be restored verbatim.
- **Scheduled tasks from an earlier version.** If the user mentions one, say it
  can be deleted at claude.ai/code/routines. Do not change or delete it
  yourself.

## Output format

Under 10 lines on a successful creation:

1. The rule in one sentence, in the user's own terms, with the hours it covers.
2. One honest line: it is saved, not watched automatically yet — automatic
   alerts arrive with Sealmetrics' native alert engine.
3. How to use it today: "run my alert <id>" checks it now.
4. One line on how to delete it.

**Never** a first check time, a cadence, or "I'll let you know": no process
exists that would keep that promise.

Then nothing. No summary of the JSON, no explanation of the grammar.

If you refused the rule as noisy, say the number that made you refuse and offer
the specific alternative, with its own false-alarm figure — never a bare "that
would be too noisy".

## What you do NOT do

- Do not create a rule on an event you did not confirm exists.
- Do not create a `silence` or `drop` rule without active hours.
- Do not create a scheduled task, routine, cron or Cowork task for a rule, and
  do not say or imply that a rule is being watched automatically.
- Do not create a second rule that duplicates one already active; say which
  existing rule covers it.

---

**Every run that ends in a decision logs it — a rule created, a rule refused as
noisy, an event not tracked. Before the answer, not after it, with the Read and
Write tools — never a shell:** log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `3` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`), `scheduled` (always `false` here), `notes` (one line).
Use `on_track` for a rule created, `refused` for a rule declined as noisy or on
an untracked event. A real run logged its first refusal and skipped the second,
so the log said one alert request had happened when two had. A run that only
stops to ask the question in step 1 logs when it finishes. Skip silently if
the path is not writable.
