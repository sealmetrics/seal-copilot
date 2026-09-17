# Seal Watch

The loop that makes a saved alert rule actually watch. It runs outside
Sealmetrics and needs no change to it.

## Why this exists outside the product

Sealmetrics stores alert rules, and it can already deliver a notification by
email, Slack and signed webhook. What it does not do is evaluate a rule:
`check_and_trigger` is called only from a test, there is no cron entry for it,
and creating a rule needs the `write` scope that only a dashboard session
carries — where there is no alerts screen. So today nothing watches anything.

Everything needed to *judge* a rule, though, sits under `/stats/`, which the API
guards with `stats:read`. Every API key carries that scope. So the evaluation
can live here, reading the same data a report reads.

**It runs no model.** The verdicts are arithmetic: cheap, deterministic, and the
same every time. That is the difference from the scheduled-model approach tried
and retired in plugin 1.13.0, which could not run more often than hourly, was
capped per account per day, and needed a repository to load the plugin at all.

## What it does

Every five minutes, for each rule that is due and inside its watch window:

| Family | Reads | Fires when |
|---|---|---|
| `silence` | today's count, then the newest event's timestamp | no event for N **watched** hours |
| `drop` | today's running total | it falls to `ratio` of what this weekday and hour normally reach |
| `spike` | the same, mirrored | it reaches `ratio` above normal, and then it names what the top referrer did |
| `threshold` | one reading | a flat floor or ceiling is crossed |

One `/stats/overview` call per site per pass is shared by every rule on it, so
the whole service stays under a request a minute. The API allows 240 a minute on
a Growth plan, so the limit is never the constraint.

An incident opens once and closes when the condition recovers. A rule that is
still failing reports "still open", never a second notification, and cannot
reopen inside its cooldown.

**A failed read is never a verdict.** If the API refuses or times out, the rule
is reported as an error and nothing is delivered. Treating a failed read as
silence would page every customer during an outage of ours.

## Configuration

Two variables and one per client:

| Variable | Required | What |
|---|---|---|
| `SEAL_CONFIG` | yes, or `SEAL_CONFIG_PATH` | The JSON in `config.example.json`, inline |
| `SEAL_CONFIG_PATH` | | A path to that JSON instead, for a Railway volume |
| `SEAL_TOKEN_<SITE>` | yes, per site | **The client's own Sealmetrics API token.** Named by `token_env` in the config |
| `SEAL_SLACK_<SITE>` | | A Slack incoming webhook. Without one, and without `webhook_url`, notifications go to the log |
| `SEAL_STATE_PATH` | strongly advised | Where incidents persist. Without it they live in memory and a restart re-notifies an open one |
| `SEAL_HEARTBEAT_URL` | strongly advised | Pinged every cycle. See *If it dies* |
| `SEALMETRICS_BASE_URL` | | Defaults to `https://my.sealmetrics.com/api/v1` |

**Tokens are never in the config file.** The config names the variable; the
variable holds the token. That is what lets a client rotate or revoke their own
token without anyone editing anything, and it keeps the config committable.

A client creates their token at **my.sealmetrics.com → Settings → API Tokens**.
It needs nothing beyond the default read scopes. If they revoke it, their rules
report an error and stop; nobody else's are affected.

## Deploying on Railway

1. New service from this repository. **Root directory `/`**, Dockerfile path
   `watcher/Dockerfile`. Not root `watcher`: the rule validator is the plugin's,
   which is outside this directory, so the build context has to be the
   repository.
2. Add the variables above. One `SEAL_TOKEN_*` per client.
3. Add a volume and point `SEAL_STATE_PATH` at a file on it, for example
   `/data/incidents.json`, so a redeploy does not re-notify an open incident.
4. Point `SEAL_HEARTBEAT_URL` at a dead-man's-switch.

There is nothing to install: no dependencies, and the image runs the test suite
at build time, so a broken watcher fails the deploy instead of the first alert.

`node watcher/watch.mjs --once` runs a single pass and exits non-zero if any
site errored. That is what to use from a cron, or to check a new rule by hand
before trusting it.

## Deploying without a service: GitHub Actions

When there is no host to hand, `.github/workflows/watch.yml` runs the same
`--once` pass on a schedule with no infrastructure. It needs four repository
secrets and nothing else:

| Secret | What |
|---|---|
| `SEAL_CONFIG` | The config JSON, inline. There is no volume here, so no config file |
| `SEAL_TOKEN_<SITE>` | One per client, named by `token_env` in the config |
| `SEAL_SLACK_<SITE>` | Where the notification goes |
| `SEAL_HEARTBEAT_URL` | Pinged each run |

Incidents persist through the Actions cache, which is the only store a
scheduled workflow has. It works, and it is the part to understand: if a cache
entry is evicted, the next pass treats an open incident as new and notifies
again. A duplicate notification, not a missed one.

**Be honest about what this is.** Scheduled runs on GitHub are best-effort and
get delayed under load, and a repository with no pushes for 60 days has its
schedules disabled silently. The workflow runs every 15 minutes rather than
every 5 because the finer cadence is skipped often enough to buy nothing. For a
rule measured in hours — four hours without a sale — a ten-minute delay changes
nothing. For a rule measured in minutes, this is the wrong home and an always-on
container is the right one.

One governance point: the token in a repository secret is readable by anyone who
can administer the repository. That is a different trust boundary from a
client's token in a deployment platform, and worth a decision rather than a
default.

## Running it locally

A single pass from a `cron` or a `launchd` timer works the same way:

```
SEAL_CONFIG_PATH=~/seal-watch/config.json \
SEAL_STATE_PATH=~/seal-watch/incidents.json \
SEAL_TOKEN_MYSITE=sm_… \
node watcher/watch.mjs --once
```

It exits non-zero if any site errored, which is what a timer should alert on.
The obvious limit is that it only watches while that machine is awake, so it is
a way to start rather than a way to run.

## If it dies

This is the failure that matters: if the service stops, nothing fires and
nobody notices, because silence is what a healthy watchdog produces. Two
defences, and neither is optional in production.

- **The heartbeat.** Every cycle it logs a line and, if `SEAL_HEARTBEAT_URL` is
  set, posts the cycle summary. Point it at a service that alerts when the ping
  *stops* (healthchecks.io and Better Stack both do this for free). A watchdog
  without a watchdog is a single point of silent failure.
- **`--once` from a second place.** A daily `--once` run somewhere else, whose
  failure you would see, proves the whole chain still works end to end.

## What it is not

- **No email.** Sealmetrics already has alert email with templates and an
  unsubscribe path. Reimplementing that here would mean owning deliverability
  for someone else's domain. Slack and webhooks cover the same need until the
  native engine ships.
- **No rules in the dashboard.** These rules live here, not in the product, so
  they do not appear in the Sealmetrics UI.
- **Not the destination.** When Sealmetrics' own evaluator ships, rules migrate:
  the grammar here is deliberately the one the product's design uses, so that is
  a translation and not a rewrite.

## Putting a rule in, and taking one out

The watcher re-reads its config between passes, so a rule change needs no
redeploy. **A broken edit never stops the watch**: if the new config does not
parse or does not validate, the problem is logged and the last good one keeps
running, because one typo in one rule would otherwise silence every rule on
every site.

With the config on a volume (`SEAL_CONFIG_PATH`), edit it with the CLI rather
than by hand — it refuses to write anything the watcher could not load:

```
node watcher/rules.mjs site acct_example SEAL_TOKEN_ACCT_EXAMPLE SEAL_SLACK_ACCT_EXAMPLE
node watcher/rules.mjs list
node watcher/rules.mjs add acct_example < rule.json
node watcher/rules.mjs import acct_example ~/.seal-copilot/acct_example/alerts.json
node watcher/rules.mjs pause acct_example no-purchases-4h
node watcher/rules.mjs remove acct_example no-purchases-4h
node watcher/rules.mjs check
```

`site` creates the entry, and takes the **name** of the variable rather than
the token: it refuses a value that looks like one, because that is the mistake
that puts a credential in a file.

`add` takes the rule JSON that `create-alert` prints. `import` takes the whole
file it writes — `<state-dir>/<site_id>/alerts.json` — which is the realistic
handover: someone had the conversation, the rules are on that machine, and this
brings them across in one command.

Import is deliberately narrow about what it will take:

- **Only `active` rules.** A paused or deleted rule stays where it is;
  importing it would quietly re-arm something that was switched off.
- **Only valid rules**, checked one at a time so the error names the rule.
- **It says what it skipped**, every time. A rule the operator believes is
  watched and is not is the failure this service exists to prevent, so a silent
  skip is worse than a refusal.

A removed rule is kept in the file marked `deleted` with the date, so "did I
have an alert on that?" has an answer.

`node watcher/watch.mjs --check` validates the config and exits without
watching, which is what to run after an edit.

## Before trusting a rule: replay it

```
SEAL_TOKEN=sm_… node watcher/preview.mjs acct_example 14 < rule.json
```

`create-alert` already refuses a rule that a Poisson estimate says would fire
more than once a month on a healthy site. This answers the same question from
the site's own events: not "about three false alarms a month" but "it would have
fired on the 4th, the 9th and the 11th".

It reports the count, the rate, how many distinct days fired, and the first five
incidents with their times. **It does not pronounce a rule noisy**, and that is
deliberate: a backtest counts real incidents as well as false ones, so the
"one false alarm a month" threshold does not apply to it. The one thing it will
assert is density — a rule that fires on a third of all days is describing the
site's normal behaviour rather than an incident.

Conversion and microconversion rules only: revenue and entrances have no
per-event endpoint to replay. The raw endpoints cap a range at 31 days and a
page at 100 rows, so the command stops at 4,000 events and says when the sample
was truncated, because a partial history makes a rule look quieter than it is.

## The rule grammar

One grammar, three readers: the `create-alert` skill writes it, `check-alerts`
evaluates it on request, and this service watches it. It is validated against
`seal-copilot/hooks/schemas/alerts.json`, the same schema the plugin's hook
enforces, so a rule that is valid for one is valid for all three. The families
and every field are documented in
`seal-copilot/skills/seal-copilot/references/alert-grammar.md`.

A malformed rule stops the service at startup with the field to fix. That is
deliberate: a watcher that skips the rule it cannot parse is a watcher that
silently is not watching.

## Tests

```
node watcher/test.mjs
```

96 checks against a fake API and a fake clock, including the two that matter
most: overnight hours do not count toward a silence window, and a refused read
is never reported as silence. `scripts/check.sh` runs them.
