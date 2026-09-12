---
name: create-alert
description: >
  Turns a sentence like "tell me if I go four hours without conversions" into a
  scheduled check that stays quiet while the site is healthy and warns with
  evidence when it is not. Also lists, pauses and deletes the rules already
  watching a site. Trigger on: "alert me if", "tell me when", "warn me if",
  "avísame si", "quiero saber cuándo", "notify me when", "set up an alert",
  "create an alert", "crea una alerta", "my alerts", "qué alertas tengo",
  "stop watching", "delete the alert", "pause the alert".
argument-hint: "[the condition to watch]"
short-description: 'Create, list or delete an alert from a sentence: "tell me if 4 hours pass with no conversions". Use for "alert me if", "avísame si", "my alerts", "stop watching".'
---

# Create Alert

Before writing your answer, read `examples/output.md` in this skill directory
and match its density and tone. It is the reference for what a good run of this
skill looks like.

Budget: ≤3 tool calls — up to two to find the event and measure it, one
for the expectation a `drop` rule needs. The output of a successful run is
under 10 lines.

This skill writes the rule. `check-alerts` evaluates it, on a schedule. The two
share the grammar below and nothing else — deliberately, because a scheduled
run may have no filesystem and must carry everything it needs in its prompt.

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
  "cadence_minutes": 60,
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
| `cadence_minutes` | How often the check runs. Never more than half the window: `condition.hours × 30`, floor 30 |
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

Anything else — rules about bot activity, about saved segments, about a metric
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

Sensible defaults you may apply without asking: `cadence_minutes` from the
formula, `expires_at` six months out, `deliver: ["app"]`, `filter: {}`.

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

**Noise check.** Compute the median events per active window from the 30-day
volume. **Below 5, refuse the rule as written** and propose either a longer
window or the `threshold` family on a daily figure. A `silence` rule of four
hours on an event that happens three times a day fires most afternoons and
teaches the user to ignore you. Say the arithmetic out loud: "demo_request runs
at about 1.4 a day, so four quiet hours is normal — at 12 hours it would mean
something."

### 3. Fill `expected`, for `drop` and `spike` only (0–1 calls)

- If `<state-dir>/<site_id>/watchdog-baseline.json` exists and has not expired,
  take the cumulative-by-hour curve from it. No call.
- Otherwise one call for the same weekday last week, spread across active hours,
  and set `"expected_basis": "last-week-flat"` so the check can say the
  comparison is coarse.

Never leave `expected` null on a `drop` or `spike` rule. A check that has to
invent its own expectation is the guessed threshold this plugin refuses to use.

### 4. Compile the prompt the scheduler will run

The scheduled task must work with no filesystem, so everything travels in the
prompt:

```
Run the check-alerts skill for this rule and output only its result.

Fired at: <the scheduler's local time, ISO 8601 with offset>

<the rule, as JSON>
```

**The firing time is not optional.** The verdict is a comparison against the
hours elapsed so far today, so a check that has to guess the hour guesses the
verdict. Where the scheduler can substitute the time, have it do so. Where it
cannot, say in the rule's `notes` that the time is not supplied, so the check
knows to derive it rather than assume it.

### 5. Register it

- **Claude Code:** `/schedule`, at `cadence_minutes` in the rule's timezone,
  running the prompt from step 4.
- **Cowork:** the equivalent scheduled task.
- **Codex, Claude.ai:** there is no scheduler you can write to. Print the prompt
  and the cadence, say plainly that they have to register it themselves, and do
  not claim the alert is live.

### 6. Persist, if you can

Append the rule to `<state-dir>/<site_id>/alerts.json` (schema in
`skills/seal-copilot/references/state-schema.md`). This is what makes "what am
I watching?" and "stop watching X" answerable later. If the filesystem is not
writable, say once that the rule is live but not listed, and move on.

## Managing what exists

- **"My alerts"** — read `alerts.json`, list `status: active` rules one line
  each: what it watches, the condition, the cadence, when it last fired. Name
  any rule expiring within 30 days.
- **"Stop watching X" / "delete the alert"** — name the rule you are about to
  remove and wait for confirmation. Then cancel the scheduled task and set
  `status: "deleted"` with the date; keep the entry. Never cancel a task you
  have not named, and never cancel one the user did not mean.
- **"Pause it"** — `status: "paused"`, task cancelled, rule kept so it can be
  restored verbatim.

## Output format

Under 10 lines on a successful creation:

1. The rule in one sentence, in the user's own terms.
2. When it checks, and during which hours.
3. Where the alert will arrive.
4. When the first check runs.
5. One line on how to stop it.

Then nothing. No summary of the JSON, no explanation of the grammar.

If you refused the rule as noisy, say the number that made you refuse and offer
the specific alternative — never a bare "that would be too noisy".

## What you do NOT do

- Do not create a rule on an event you did not confirm exists.
- Do not create a `silence` or `drop` rule without active hours.
- Do not promise delivery to a channel the session cannot reach.
- Do not claim a rule is scheduled on a surface where you could not schedule it.
- Do not create a second rule that duplicates one already active; say which
  existing rule covers it.

---

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `3` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`), `scheduled` (boolean), `notes` (one line).
Use `refused` when you declined the rule as noisy. Skip silently if the path is
not writable.
