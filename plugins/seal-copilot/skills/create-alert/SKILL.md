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

**Follow `skills/seal-copilot/references/run-protocol.md`:** no text until the answer, resolve the site with `list_sites` first, write state to the schema before answering, log the run. Match `examples/output.md`.

Budget: **≤3 Sealmetrics calls.**

Two calls to find the event and measure it, one for the expectation a `drop`
rule needs. A successful run is under 10 lines.

**The only other tools are Read and Write**, for state. No shell — not `ls` to
see whether a state file exists; Read answers that.

**Works on every connector**, and never refuse a rule because of one: these
are the plugin's own and need none of the tools the remote connector withholds.

**This skill schedules nothing** — not `/schedule`, not a routine, not a cron,
not a Cowork task, even when asked. Continuous watching is Seal Watch's job, not
a host task's. Say so plainly: the rule is saved, "run my alert X" checks it
now, and Seal Watch is what watches it between checks.

**The rule grammar and the four families are in
`skills/seal-copilot/references/alert-grammar.md`.** Read it before parsing the
user's sentence.

Out of scope, whatever the wording: rules about saved segments, a metric that
would take more than two calls, and comparisons between two sites. Say so
plainly and offer the nearest rule that is in scope.

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

Set `metric.kind` from where you actually found the event, never from the word
the user used: a run that checked only the microconversion list told a SaaS
account its macro conversion was untracked.

**Noise check: how often would it fire on a normal site?** A four-hour
`silence` rule on an event that happens three times a day fires most afternoons
and teaches the user to ignore you. **Do not do this arithmetic yourself** —
run the calculator:

```
echo '{"count_30d":72,"active_hours_per_day":16,"window_hours":4}' \
  | node skills/seal-copilot/scripts/calc.mjs false-alarm
```

For a `threshold` rule pass `threshold` too, and it uses the Poisson tail.

**When its verdict is `too noisy`, refuse the rule as written.** Say the figure
in the user's terms — "it would fire about 8 times a month with nothing wrong",
or "almost every day" past 30 — and give the λ behind it.

**Every alternative you propose goes through the calculator too, and you quote
its figure.** Refusing one noisy rule and offering another with the same λ is
the easiest mistake here: on a site doing 2.4 clicks a day, a 12-hour silence
and a daily "fewer than 1" threshold both sit at λ = 2.4. If nothing short
enough to be useful passes, say so: at that volume an alert can catch broken
tracking, not a bad afternoon.

λ is an estimate. `watcher/preview.mjs` replays the rule over the site's real
history and names the days it would have fired; mention it when the user wants
more than an estimate.

Without a shell, do the arithmetic and say in the answer that it was done
without the calculator.

### 3. Fill `expected`, for `drop` and `spike` only (0–1 calls)

- If `<state-dir>/<site_id>/watchdog-baseline.json` exists and has not expired,
  take the cumulative-by-hour curve from it. No call.
- Otherwise one call for the same weekday last week, spread across active hours,
  and set `"expected_basis": "last-week-flat"` so the check can say the
  comparison is coarse.

Never leave `expected` null on a `drop` or `spike` rule. A check that has to
invent its own expectation is the guessed threshold this plugin refuses to use.

### 4. Save it

Read `<state-dir>/<site_id>/alerts.json`, append to its `rules` array, and
write the whole object back. It is what makes "my alerts", "run my alert X" and
"delete the alert" answerable later. If the filesystem is not writable, say so
once and print the rule as JSON so the user can keep it.

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
2. One honest line: it is saved, and this plugin watches nothing by itself.
3. How to use it today: "run my alert <id>" checks it now.
4. For continuous watching, print the rule as JSON and say it goes into Seal
   Watch (`watcher/README.md`). Never claim it is already watched: you cannot
   see from here whether that service has this site.
5. One line on how to delete it.

**Never** a first check time, a cadence, or "I'll let you know": no process
exists that would keep that promise. Then nothing — no summary of the JSON, no
explanation of the grammar.

On a refusal, give the number that caused it and the specific alternative with
its own false-alarm figure. Never a bare "that would be too noisy".

## What you do NOT do

- Do not create a rule on an event you did not confirm exists on one of the two
  surfaces.
- Do not create a second rule that duplicates an active one; say which existing
  rule covers it.
- Do not imply anything is watching. The schema refuses a `silence` or `drop`
  rule with no active hours and a `drop` with no expectation, so those are
  settled; this one is on you.
