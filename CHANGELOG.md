# Changelog

## 1.13.1 — 2026-09-14

A profile left on the machine by another Sealmetrics account no longer sends a
run to a site the current connection cannot reach.

### Fixed — a cached site belongs to one connection
Everything under `<state-dir>/<site_id>/` is filed by site and records nothing
about who authorised the connection, so two accounts on one machine share it.
On 2026-09-13 a two-day-old profile for `sealmetricsv2` met a connection
re-authorised with a demo account. The core skill said a fresh profile meant
skipping `list_sites`. The weekly check, run in Codex, obeyed, sent its stats
calls to a site the connection could not see, and ended as an access failure
with no report.

Freshness proves nothing about ownership. `list_sites` now runs at the start of
every run, and anything cached — profile, baseline, ledger, saved alert — is
used only if its `site_id` is in that list. If it is not, that state belongs to
another account: it is ignored for the run, the site is resolved from the list,
and the other account's files are never deleted.

The rule lives in `state-schema.md` and `methodology.md`, and as one paragraph
in all fourteen skills that read cached state. Four of them load neither
document, and a skill invoked directly never runs the core skill's session
start, which is exactly how the weekly check failed.

### Evals
- `stale-profile-from-another-account-rediscovers`: a seeded fresh profile for
  a site the fixture refuses; it must call `list_sites`, report the reachable
  site's figures, write state for it and leave the other profile in place.
  **It passed before the fix too.** Claude called `list_sites` despite the
  instruction to skip it; the Codex model that failed did not, and this harness
  only drives `claude`. It guards the fixed behaviour; it does not reproduce the
  original failure.
- New case flag `noSiteEnv` drops `SEALMETRICS_SITE_ID`, as OAuth production has
  no default site. 35 cases.

## 1.13.0 — 2026-09-14

Alert rules are no longer scheduled. Every scheduled check this plugin created
failed in the same place: none ran an alert end to end. Claude Code routines
only load the plugin from a repository, run at most hourly, count against a
daily cap, and were created with every connector on the account. Automatic
alerts move to Sealmetrics' own alert engine (PRD addendum 1.2, E15).

### Changed
- **`create-alert` saves the rule and schedules nothing** — not `/schedule`,
  not a routine, not a Cowork task, even when asked. It still confirms the event
  exists and refuses noisy rules, and it says plainly that the rule is not
  watched automatically yet. Its answer never promises a first check.
- **`check-alerts` runs a saved rule on request**, by id from `alerts.json` or
  from JSON in the prompt, and reads the clock once when no `Fired at:` line is
  given.
- `setup-audit`, `monday-briefing`, the core skill's scheduling section, the
  state schema and both READMEs no longer describe saved rules as watched.

### Evals
- `create-alert-does-not-schedule`: asked for an hourly check, the rule is saved
  and the answer says it is not watched; no case may promise a check.
- `check-alerts-runs-a-saved-rule-on-request`: the rule comes only from a seeded
  `alerts.json`. 34 cases.

## 1.12.2 — 2026-09-14

The first alert created on a real account refused the right rules and wrote the
right one, and still got six things wrong.

### Fixed
- **The noise check refused one noisy rule by recommending two.** "4 hours
  without CTA clicks" at 2.4 a day was refused, and a 12-hour silence and a
  daily threshold were offered instead — both a false alarm about 9% of days.
  The check is now a false-alarm rate (Poisson, e^−λ, refused above one a
  month), and every alternative has to pass it with its figure shown.
- **`alerts.json` was written as a bare array.** The hook, `monday-briefing`
  and `setup-audit` read `rules`, so the alert was invisible to them. The skill
  now spells out the wrapper; the hook also tolerates the old shape.
- **A refusal went unlogged.** Every decision — created, refused, untracked —
  now writes its run-log line.
- **Shell calls doing nothing** (`ls`, `echo` placeholders). create-alert uses
  Sealmetrics, Read and Write, and the scheduler; nothing else. It also gets the
  narration ban the report skills have.
- **The scheduled routine could not have worked.** It was created without the
  plugin enabled, with every account connector attached, and with a `Fired at:`
  line the scheduler never fills. The skill now requires the plugin, only the
  Sealmetrics connector, Read/Write/`Bash(date:*)`, a UTC cron padded an hour
  each side for daylight saving, and a read-back before calling the alert live.
  `check-alerts` reads the runner's clock once when the prompt carries no time.

### Evals
- `create-alert-writes-a-valid-rule` requires the `rules` wrapper, a run-log
  line and a single text block; `create-alert-refuses-noisy-rule` requires a
  false-alarm figure, a `refused` log line and a single text block.

## 1.12.1 — 2026-09-14

The first 1.12.0 weekly report on a real account, over the remote connector,
was right about the site and wrong in three ways no eval could see, because
every eval started from an empty state directory.

### Fixed
- **Old state brought bot talk back.** A run log from an earlier version said
  "get_bot_stats access denied", and the report printed "Not checked: bot
  validation". State from an earlier version is now history, not instructions:
  never repeated, never a "Not checked" item, and a note describes only its own
  run.
- **State was written with a shell.** The run appended its log with `cat >>`,
  which works only where a shell is allowed. The schema and all eleven run-log
  footers now require Read and Write.
- **The attribution caveat was missing** from a report that read campaigns. The
  weekly format requires it, in the same language as the rest of the report.
- **Writing state first became an announcement** — "Now writing state files,
  then the report." It is now a named example in the narration ban.

### Added
- `seedState` in the eval runner, and `stale-state-does-not-resurrect-bots`,
  which seeds a copy of that real account's old profile and run log. 32 cases.

### Verified
Re-run on the same real account: no mention of bots, the attribution line
present, state written with Read and Write. The narration fix is verified in the
eval suite only.

## 1.12.0 — 2026-09-14

Alerts a customer writes in their own words, and the end of a class of defect
the linter could not see: a call that is perfectly valid and still fails in
production.

### Added — `create-alert` and `check-alerts`
"Avísame si paso 4 horas seguidas sin ventas" becomes a rule, a schedule, and a
check that answers in one line while the site is healthy. Four families —
silence, drop, spike, threshold — with the window, the active hours and the
cadence derived from the rule rather than guessed.

Two decisions carry the design. **The evaluation is state-free:** the rule
travels inside the prompt the scheduler fires, and a `drop` rule carries its own
expectation, because a scheduled run may have no filesystem at all. And
**`create-alert` refuses rules that would be noise**: it measures the event's own
volume first, and an event that happens twice a day does not get a four-hour
silence rule — it gets the arithmetic, and a window that would mean something.

`alerts.json` joins the state contract. `monday-briefing` reports what is
watching the site; `setup-audit` counts a site with no rule as a gap, which is
what it now checks instead of `list_alerts`.

### Changed — every skill knows which connector it is on
Since 1.11.0 the plugin declares the remote OAuth server, which withholds twenty
tools. The skills did not know that: they still planned steps around traffic
quality, alerts, segments, channel rules and event verification, and a user on
the default connector met "Access denied" or an unknown tool in the middle of a
report.

Steps that need those tools are now marked **(local only)**, skipped, and named
once under "Not checked" — never reported as clean. `profile.json` gains
`connector`, settled by reading the tool list, which costs no call.
`cost-reduction` says five of eight patterns ran. `setup-audit` finds misrouted
paid traffic by crossing two tools that are announced, and proposes the channel
rule in words instead of describing a dry run it could not perform.

### Changed — installing tracking is its own plugin, `seal-install`
`install-sealmetrics` needed `provision_site`, `verify_setup` and
`verify_event_instrumented`, none of which the analyst's connector announces. It
fired on "install Sealmetrics" and then could not finish. It now ships as a
sibling plugin with the local stdio server and an API key, and Seal Copilot
answers that request with one line naming it. The person installing tracking has
a terminal; the person reading a weekly report should never meet an API key.

### Fixed — `get_channels` was forbidden in one file and used in four
The methodology has said "Never call `get_channels`" since 1.6.0. It was still
in the cause hierarchy, in opportunity pattern 8, in the hotels playbook and in
the channel-mix scorecard — the last two of which would have put "Access denied"
in a real report. All four now use `get_top_channels`.

The linter could not see it, because the call was valid against the schema.
`evals/tool-availability.json` now names the two tools no skill may ever call
and the twenty the default connector withholds, and the linter fails the build
on a mention that is not a refusal or a step marked `(local only)`. Verified by
reintroducing all three defects: three failures, including the subtle one —
"`get_channels` does not accept `compare`" reads like a warning and is an
instruction to call it.

`assess.mjs` enforces the same two bans on every case, so no future case can
pass having called them.

### Changed — the eval suite runs on both connectors
`SEAL_TRANSPORT=remote` makes the mock announce forty-two tools instead of
sixty-two and answer the rest exactly as it answers an unknown tool. A single
transport could never catch a skill reaching for something the user's connector
withheld. New case `remote-never-attempts-hidden-tools` requires zero such
attempts; seven cases cover the alerts.

### Fixed — an eval that certified advice nobody should follow
`no-api-key-gives-instructions` required the answer to mention
`SEALMETRICS_API_KEY` and the token settings page. Since 1.11.0 there is no
variable to set: the remedy is a browser login from `/mcp`. The case is now
`unauthorised-sends-user-to-mcp` and **forbids** the stale advice. The same
text was still in the core skill, the failure-modes table and the README.

Two smaller things the fix exposed: `maxCalls: 0` was never enforced, because
zero is falsy — the auth case had been asserting nothing for two releases. And
a healthy scheduled check now has a length cap, since silence is the product and
no phrase assertion can catch a paragraph.

### Added — currency and per-site thresholds
Six skills wrote "€" regardless of what the site reports in. `profile.currency`
is now read by all of them, `profile.thresholds` persists a threshold the user
states so the next session does not make them repeat it, and `profile.targets`
holds a monthly goal when there is one.

### Removed — bot data, everywhere
Sealmetrics does not give bot data, and the plugin no longer pretends to. Product
decision, 2026-09-13.

`get_bot_stats` and `get_suspicious_sessions` are never called, on either
connector, and join `get_channels` and `get_marketing_playbook` in
`evals/tool-availability.json` as forbidden: the linter fails a skill that
mentions them outside a refusal, and every eval case fails a run that calls
them. No report estimates a bot share or says traffic comes from bots, and a
second global assertion fails any answer containing a bot figure — tested
against "bot share is 7%" and a Bots column, and against "Sealmetrics does not
give bot data", which passes.

The "unvalidated for bots" disclaimer is gone from every report and the "Not
checked" line, because a product decision is not a gap. `agent_analytics_enabled`
is gone from the profile.

What replaces it uses standard data and keeps the one thing the bot check was
for: **a spike is not growth until it converts.** Before calling a rise demand,
the analyst reads `get_top_referrers`; a referrer carrying it at very high bounce
and almost no conversions is named and described by what it did —
"cheap-traffic.example sent 21,900 entrances at 95% bounce and 5 conversions" —
never by who might have sent it. Opportunity pattern 9 is now "non-converting
referrer", cost-reduction's first pattern is "non-engaging referrer", and
cart-watchdog loses its bot step (steps renumbered). On the remote connector
cost-reduction now runs six patterns of eight.

Evals: `empty-bot-stats-is-not-zero-percent` is deleted with its fixture;
`spike-is-bots-not-growth` becomes `spike-is-not-growth` and
`cost-reduction-names-the-bot-referrer` becomes
`cost-reduction-names-the-junk-referrer`, both requiring the referrer named and
`get_top_referrers` called; the spike fixture is `ecommerce-referrer-spike`. 31
cases. This also retires the only two cases that were still flaky in the sixth
certification — both were the model skipping a bot call it is now forbidden to
make.

### Fixed — found by nine certification runs
The first full run of this release scored 28/32 and it took nine to reach
30/31. Every gate offline was green throughout; each of these needed a model in
the loop to show.

- **Scheduled alert checks could not load their own skill.** `check-alerts`
  carried `disable-model-invocation`, so a scheduled "run the check-alerts
  skill" was refused and the model searched the disk with `find /` until the
  six-minute timeout. The gate is gone, and `create-alert` now schedules the
  command `/seal-copilot:check-alerts` rather than a sentence. `monday-briefing`
  and `cart-watchdog` keep their gate, and every place that tells a user or a
  scheduler how to run them now names the command. Checks went from five or six
  minutes to twenty or thirty seconds.
- **Alerts refused to work on the remote connector.** Fixed in
  `create-alert` and verified on both connectors.
- **A watchdog that guesses the hour guesses the verdict.** `check-alerts` takes
  its clock from a `Fired at:` line the scheduler stamps; `cart-watchdog` must
  state the hour it compared against and may not answer 🟢 when it cannot
  establish it. A run had called a cart dead since noon healthy by assuming it
  was 09:00.
- **`create-alert` called an event untracked after looking in one place.**
  `demo_request` was a conversion; it looked only at microconversions.
- **The traffic-quality step read as optional**, the narration ban sat inside a
  rule about call budgets, and state writes after the report produced a second
  message ("Report delivered above", or a recap of the diagnosis). Each rule now
  leads with the instruction and sits where the model reads it: state first,
  report last, nothing after.
- **`get_channels` was still named without a refusal** in the core skill's
  drill-down rule. It now names `get_top_channels`.
- **A golden output in Spanish** made the model answer English requests in
  Spanish. It matches structure now, never language.
- **Harness:** one clock per case shared by prompt and mock; a 500 from the API
  is transient; an empty answer is transient; a filter that selects no case is
  an error rather than "0/0 passed"; and eighteen assertions that failed correct
  answers over a word were rewritten to assert behaviour.

### Not verified
No run against a real Sealmetrics account, and no alert registered with a real
scheduler. Whether `/schedule` can substitute the firing time into the prompt is
still open; `create-alert` tells the check to treat the hour as unknown when it
cannot.

### Not changed
Nothing in the Sealmetrics API or MCP server.

## 1.11.0 — 2026-09-10

The person who reads these reports is a marketer. Until now the only way to
authenticate was an environment variable, which is not a friction for that
person, it is a wall.

### Changed — the connector authenticates over OAuth, everywhere
The plugin declared the local server over stdio, which reads
`SEALMETRICS_API_KEY` from the environment. It now declares the remote server at
`mcp.sealmetrics.com` as `type: "http"`, which Claude Code and Cowork authorise
with a browser login from the `/mcp` panel. No token to copy, nothing to export,
no restart. Codex already worked this way since 1.10.0, with `streamable-http`
as the type name its own loader expects.

Verified rather than assumed: installed into an isolated `CLAUDE_CONFIG_DIR`,
after which `claude mcp list` reports the server as HTTP and awaiting
authentication. The claim that a plugin cannot bundle an OAuth server is wrong,
and this is the evidence.

### Changed — the session-start hook stops checking for a key
There is no credential in the environment to check any more. The hook now says
where the data comes from and what to do when a call fails on authorisation:
send the user to `/mcp`, never retry, never guess a number.

### The cost, stated plainly
The remote transport does not announce the provisioning tools, so
`install-sealmetrics` cannot do its job over the connector. Installing tracking
on a site from scratch still needs the local server and a key, and the README
says so in the place where someone would hit it. That trade is deliberate: the
person installing tracking is technical, the person reading a weekly report is
not, and the second one is who the default should serve.

### Removed — the custom GPT export
OpenAI replaced custom GPTs with workspace agents, and business accounts had a
reported shutdown date in August 2026. `dist/chatgpt/` rendered the methodology
for a surface nobody can install it on. The road to ChatGPT is the plugin
itself, since ChatGPT and Codex share one public catalog, and that package
already exists.

### Not changed
No skill content, no methodology, no evals.

## 1.10.0 — 2026-09-09

One command per surface. The distribution stops being a set of instructions and
becomes two commands a stranger can run.

### Changed — the Codex marketplace lives at the repository root
It was written to `dist/codex/` and copied somewhere stable by a script. That
cannot be installed by anyone else: a remote marketplace *is* a git repository,
and what is not committed does not exist for the person cloning it. So
`.agents/plugins/marketplace.json` and `plugins/seal-copilot/` now sit at the
root and are committed.

Generated *and* committed is a thing worth doing carefully, so `scripts/check.sh`
re-runs the export and fails if git reports a single changed byte. Drift between
the skills and what a Codex user installs is now a build failure rather than
something noticed months later.

### Added — the connector travels with the Codex plugin
The plugin ships `.mcp.json` declaring the remote server over `streamable-http`.
Install is three commands and no token:

    codex plugin marketplace add sealmetrics/seal-copilot
    codex plugin add seal-copilot@sealmetrics
    codex mcp login sealmetrics

Verified, not assumed: installed into an isolated `CODEX_HOME` with the Codex
0.153 binary, after which `codex mcp list` reports `sealmetrics` at
`https://mcp.sealmetrics.com/mcp`, enabled, awaiting login. The manifest is read
too — `codex plugin list` shows the version from it.

### Removed — `scripts/install-codex.sh`
It copied the export to a stable path, appended three blocks to `config.toml`
and then re-parsed the file to prove it had not broken it. Every one of those
steps is now a CLI command that does it properly, including the MCP entry the
plugin no longer needs.

### Kept, against the spec, on evidence
The Agent Plugins spec recommends a portable `plugin.json` at the plugin root.
OpenAI's own plugins shipping in Codex 0.153 — `openai-bundled` and
`openai-primary-runtime` — use `.codex-plugin/plugin.json` with `skills` and an
`interface` block, and the portable schema forbids both fields outright. This
keeps the format that is demonstrably loaded today.

The `interface` block gained what a directory submission asks for anyway:
privacy and terms URLs, three default prompts, and the brand colour off the
mark.

### Added — a README at the root
There was none, which is a strange thing to publish. It carries the install for
all five surfaces and says plainly which trees are generated.

### Not changed
No skill content, no methodology, no evals. The fourteen procedures are the same
ones certified 24/24 in 1.8.0.

## 1.9.0 — 2026-09-09

The analyst now reaches Cowork, Claude on the web and a custom GPT, without a
line of change in the Sealmetrics API or MCP server.

### Fixed — the plugin was shipping eval state
Three state directories had been written *inside* the plugin during the eval
runs, where a skill resolved its state directory to a relative path instead of
the announced one. They were committed and they shipped in the bundle: 85
entries where 78 belong. Fixture data only, but a plugin carrying someone
else's run log is wrong regardless of what is in it. Removed, gitignored, and
`scripts/check.sh` now fails the build if a state directory reappears under the
plugin — verified by planting one.

### Added — `scripts/export-surfaces.mjs`
One source, three renderings, generated rather than maintained, because two
copies of a methodology diverge.

- **Cowork** reads the plugin format unchanged: same bundle, skills, agent,
  hooks and MCP server, and it has a filesystem so the recommendation ledger
  works exactly as in Claude Code.
- **Claude.ai** takes Skills but not plugins, one ZIP per skill. Fourteen ZIPs,
  each carrying the references that skill actually cites, since on Claude.ai a
  skill is uploaded alone and cannot see its siblings.
- **A custom GPT** takes neither: it gets the methodology and the fourteen
  procedures as knowledge files plus a short instructions file, with the
  cross-references rewritten to name uploaded files.

### Added — `short-description` on all 14 skills
Claude.ai caps a skill description at 200 characters where the Agent Skills
spec allows 1024, and all fourteen ran between 271 and 570. They are
hand-written rather than truncated: the trigger phrases are what make a skill
fire, and a cut sentence loses them. The export fails the build if one is
missing or too long.

### Fixed — two of my own bugs, found while measuring
A frontmatter parser using `$` under the `/m` flag stopped at the first newline
and reported 70-character descriptions for 500-character ones — the first
measurement of this limit was wrong. And the new `short-description` values
contain colons, which YAML reads as a mapping unless quoted; the same mistake
`argument-hint` made in 1.0.0. `claude plugin validate` caught it, as it did
then.

### Added — Codex, verified rather than assumed
Codex reads the **same Agent Skills format**, confirmed against its own bundled
plugins: `SKILL.md` with identical `name`/`description` frontmatter. Only the
wrapper differs — `.codex-plugin/plugin.json` with an explicit `skills` path,
and a local marketplace declared in `~/.codex/config.toml` (`source_type =
"local"`) rather than a bundle file. The export writes that marketplace.

Two things do not travel and the README says so: the hooks, since Codex has no
equivalent, so the missing-key warning and the call-budget guardrail are lost;
and memory, which is Codex's own — the skills write to neither its memories nor
`AGENTS.md`, so continuity is the `SEAL-STATE` block.

The Sealmetrics MCP was already configured in this machine's Codex, pointing at
both production and preproduction.

### Not changed
Nothing in the Sealmetrics API or MCP server. Every surface here uses the
existing connector at `mcp.sealmetrics.com` as it stands today.

## 1.8.0 — 2026-09-09

The full suite, three runs per case, on the 1.7.0 tree: 21/24 with three flaky.
Chasing those three surfaced two plugin defects, two contradictions between the
documentation and the tests, a harness bug that would have made the suite lie,
and the end of prose-based assertions.

### Plugin defects
- **The bot-source step was advice, not a step.** A diagnosis that found bots
  recommended the user go and inspect the referrer instead of naming it, and
  the instruction still offered `get_channels` — retired in 1.6.0 for 403ing.
  Naming the source is now part of the diagnosis and outranks any call made
  only to fill the profile.
- **Profile discovery was eating the analysis's budget.** One run spent three
  of six calls on `get_site`, `list_microconversion_types` and
  `list_property_keys`, then had none left for the referrer that made the
  finding actionable. The profile now takes only what the analysis already
  fetched.
- **Seasonality could be skipped when the cause looked obvious.** It may now
  skip the year-over-year call when the isolation itself excludes seasonality —
  one campaign collapsed while its neighbours held — but it must say which of
  the two ruled it out.

### The documentation contradicted the tests, twice
`/SKU-1007/` was banned to catch a SKU analysed below the sample floor while
`product-friction`'s golden output instructs the model to write "(SKU-1007 had
28 views — insufficient sample)". And the methodology said "Do not call
`get_bot_stats`… expecting data" — meant as "do not expect data", read as a
prohibition — while four cases required the call. Bot validation now attempts
once, records a refusal in the profile, and skips it thereafter: an unattempted
check and a refused one are not the same, and only the attempt tells them apart.

`evals/check-assertion-contradictions.mjs` fails the build in both directions:
a literal ban that matches a golden output, and a `mustCall` for a tool the
methodology forbids. Verified by reintroducing each contradiction.

### The harness was about to start lying
Both cases came back 3/3 while the progress line read `↻✓↻✓↻✓` — every attempt
retried. `sawResult` was assigned in the stream parser and returned by neither
exit path, so every session looked unfinished and the suite ran each case twice
counting only the retry, which would have hidden a genuine failure behind its
own retry. Fixed, and the self-test now asserts both polarities. Separately, a
session that emits a fragment and no result event is now retried; requiring the
fragment to be empty had scored "Let me check remaining diagnostics in
parallel" against a skill.

### Twelve prose bans, twelve correct answers failed, zero defects caught
Every phrase ban written in this suite has fired on a right answer: the bot-data
disclaimer (twice, in both phrasings), ruling out seasonality (twice), the ROAS
caveat, the "Not checked" line, an honest "nothing has shipped", a quoted
injection payload, an honest "No baseline for today", the SKU exclusion, and an
honest "I did not spend a call on get_traffic_sources". Every genuine defect was
caught by a positive assertion or a `mustCall`. The rule, recorded at the top of
`cases.mjs`: ban a **position** — a figure inside a table cell, a payload
re-issued as a bare line — never prose a correct disclaimer could contain.

### Status: 24/24, three runs each, on this exact tree
The full suite run three times per case: **24/24 (100%)**, 72 sessions, zero
retries — the first run where the retry count is honest, since the previous one
was silently retrying every attempt. Call counts stayed inside every documented
budget, the heaviest being the two-step rerun case at 22.

This is the certification the project was missing: fixtures verified against the
live API (30 tools, 0 mismatches), every skill exercised, every case stable
across repetition, on the tree that ships.

## 1.7.0 — 2026-09-09

The full suite run three times per case. 21/24 on the first pass; all three
failures are fixed and re-verified 3/3, and none was a plugin defect that
survived — one was, and it is gone.

### No skill forks any more
`product-friction`, running with `context: fork`, skipped `list_property_keys`
and **guessed** that the product identifier was `sku`. Correct on the fixture,
silently wrong on any account keyed by `product_id`. A forked subagent receives
neither the SessionStart context nor `profile.json`, so it cannot look the
answer up and guesses instead. It and `cost-reduction` now run in the main
context; after the change the case makes 10-11 calls where it made 6, because
it discovers rather than assumes. Keeping raw JSON out of the conversation was
never worth a skill that guesses.

### A fixture that only worked on Tuesdays
The watchdog fixture served calibration events for one date, 2026-09-01. The
baseline therefore covered Tuesday cells only, and running on a Wednesday the
skill correctly refused: it would not invent a Wednesday threshold from
Tuesday's shape. It had passed 3/3 the day before because that run fell on a
Tuesday. The fixture now generates four full weeks relative to the run date, so
every (weekday, hour) cell has four samples whatever day the suite runs.

### The eval suite contradicted its own documentation
`/SKU-1007/` was banned to catch a SKU analysed below the 30-view floor. But
`product-friction`'s golden output — which the skill instructs the model to
match — contains "(SKU-1007 had 28 views — insufficient sample)". The skill
said write it; the eval said never write it. The case now requires the
exclusion to be stated and bans only the misclassification.

`evals/check-assertion-contradictions.mjs` fails the build if any literal
phrase ban matches text a golden output tells the model to write. Wired into
`scripts/check.sh`.

### Nine phrase bans, nine false positives
Every one fired on a correct answer: the bot-data disclaimer, ruling out
seasonality, the ROAS caveat, the "Not checked" line, an honest "nothing has
shipped", a quoted injection payload, an honest "No baseline for today", and
the SKU exclusion above. The count and the rule — assert behaviour, and grep
`examples/output.md` before banning a token — are at the top of `cases.mjs`.

### Suite status
24 cases, 14 skills. 21 verified 3/3 on the 1.6.0 tree; the three fixed cases
verified 3/3 on this one. A single full `--runs 3` on this exact tree has not
been run.

## 1.6.0 — 2026-09-08

The "Access denied" on twenty tools is explained from source, and the plugin
stops calling the one that mattered most.

### There is no account_id. It is the token's scope, by design.
Read in the backend (`sealmetrics2/api`) and the MCP source. API keys can only
carry `stats:read`, `sites:read`, `accounts:read` — enforced by
`API_KEY_ALLOWED_SCOPES` and also the default; an OAuth grant mints a key with
the same three. The configuration routers (`/channel-groups`, `/bot-stats`,
`/alerts`, `/segments`, `/webhooks`) require the generic `read` scope, and the
hierarchy is one-way: `read` implies `stats:read`, never the reverse. So no API
key and no OAuth connection can ever reach those twenty tools; only a dashboard
session can. The MCP's remote transport hides them for exactly this reason
(`gate.ts`, decision of 2026-07-02). The local transport — the one this plugin
uses — still lists all sixty-two, and twenty of them 403 for every modern key.
Earlier releases said there were "two identifiers"; there is one. Corrected.

### Never call get_channels
It was called in five skills and would have produced "Access denied" in every
report for every new customer. `get_top_channels` hits `/stats/top-channels`,
covered by `stats:read`, returns the same rows, and takes a period — so the
calendar-pair comparison works unchanged. Every call site, the methodology and
the eval cases now use it. Bot validation, alerts, webhooks, segments and event
verification are documented as unreachable over an API key: reported once in
"Not checked", never retried, `agent_analytics_enabled` left as `"unknown"`.

### Fixtures model a modern key
`get_channels` is refused in every fixture but one (a legacy-key scenario), and
`get_top_channels` is period-aware and complete — it had been truncated to the
top three rows when it was only a ranking tool. The coherence checker sums the
working tool.

### The runner recognises a stream that dies mid-response
One full run had an explicit "Stream idle timeout" and three cases with the
same silhouette: a dozen calls, then no text, no state, no result event. The
transient detector only recognised zero-call sessions, so those were scored
against the skills. A retest of all five on the same tree passed 5/5. The
runner now retries an API-labelled transient and a stream with no result event
and no text.

### Suite: 24 cases, 14 skills, green on this tree
Open, and not in this repo: the product decision on the local MCP transport —
apply the same gate as the remote one, so no client is offered tools its key
can never use.

## 1.5.0 — 2026-09-08

Two more real-account runs of setup-audit, and the class of defect only an
interactive session shows: what the model does when asked the same thing
twice.

### A snippet is fetched or it is not given
The first real audit spent nine calls on discovery, reached the snippet with
none left, and wrote one from memory — hedged with "I did not spend a call to
fetch it" and still presented as copy-pasteable. `get_tracking_code` is now
call number one of the procedure, a snippet that was not fetched is not given,
and literal numbers inside code are replaced by visible placeholders. The
repeat run fetched first, used the site's own `sealmetrics.conv(...)`
signatures verbatim, wrote `<MRR value in EUR>` where `1200` had been, and
stored the signatures in the profile unprompted.

### An explicit request to run a skill runs the skill
Asked for the audit a second time in the same conversation, the model
declined: same nine calls, same verdict, nothing has shipped — and asked which
option the user wanted. It could not know nothing had shipped (the skill itself
had changed between the two requests), and the budget governs how many calls a
run makes, never whether a requested run happens. Now a rule in the core skill.

### The harness can now test a follow-up
Each `-p` step had been a fresh session with no memory of the earlier answer,
so the refusal could not be reproduced. A step can now continue the previous
step's session via `--resume`, the stream parser surfaces the session id, and
each step is judged on the calls it made itself. The new case audits twice in
one conversation and requires the second run to make its own calls and score.
3/3.

### The call budget resets per turn
The continued-session run exposed it: the PreToolUse hook counted calls for the
whole session, so a resumed session that ran one audit and then another was
told it was past budget halfway through the second and cut it short. Any
interactive user chaining three skills would hit the same wall. A
UserPromptSubmit hook resets the counter on every prompt, and the warning text
tells the model not to surface the budget — "past the session budget" had
leaked into a visible message. Narration between tool calls is now forbidden
by the core rule, not only in the final answer.

### Run-log fields exact everywhere
The real audit logged `calls_used` with a free-text verdict because the footer
shared by ten skills said "calls used" in prose. The exact field names and each
skill's budget as a number are stated in all of them.

### On phrase bans
A ban on "nothing has shipped" fired on the model saying it after a full
re-run, as a correct observation. Fifth time this suite banned a phrase the
right answer contains; the lesson is at the top of `cases.mjs`. It also
survived the commit that claimed to remove it — verified on disk now, with
grep, not with the script's own print.

### Suite: 24 cases, 14 skills, all 3/3 on their respective trees
Open outside this repo: the `account_id` the ten refused tools expect.

## 1.4.0 — 2026-09-08

The plugin answered a real question about a real account for the first time.
The substance was right; three things around it were wrong, and all three are
now fixed and verified 3/3 against a fixture that reproduces the exact
condition.

### What the first real run got right
Nested overview read correctly, the low-volume rule applied (0 conversions →
KPIs only, no findings), nothing invented, the attribution caveat stated, and
a genuine insight offered: the site has no macro conversion instrumented, so
the report is blind to outcomes. It then pointed at the skill that fixes that.

### What it got wrong, and only real data could show
- **"Profile now initialized" — and no profile.json.** Ownership is explicit
  now: whichever skill runs discovery first writes it. `agent_analytics_enabled`
  gains `"unknown"`, so a refused bot call is never recorded as measured-and-off.
- **A run log with invented field names and no call count**, which made
  budget compliance unmeasurable. The fields are exact and mandatory, and each
  report skill states its own budget as the field value.
- **Silence about refused calls.** With a +35% traffic spike at 84% bounce, the
  report said nothing about `get_channels` and `get_bot_stats` being refused
  for the site. Both report skills now carry a "Not checked" line whenever a
  step's call was refused or skipped, omitted only when every step ran — and
  the healthy case confirms it is omitted.

### Harness
- `account-family-denied`: a fixture with the refused-calls condition, and a
  case asserting the refusal is named, the spike marked unvalidated, the run
  log measurable and the profile present. 3/3.
- A failing case now saves its state directory alongside its answer, so a
  missing field is read rather than guessed.
- Two assertions were mine to fix: the low-volume pattern missed "no
  conversions", and a ban on "channel … Access denied" fired on the very
  disclaimer the skill must write — the forbid-the-disclaimer mistake again,
  now scoped to a table cell.

### Verified against the live API
The real run was repeated with these fixes. The "Not checked" line appeared,
naming `get_bot_stats` as refused and the +36% spike as unvalidated for bots;
`profile.json` exists with `agent_analytics_enabled: "unknown"` and the
vertical correctly detected as SaaS; `runs.jsonl` carries numeric `calls` (3)
and `budget` (8). Two field-level gaps seen only with the real file in hand —
no `discovery_cached_at`, and `ts` as a date rather than a timestamp — are
fixed in the skill and the schema.

### Suite: 23 cases, 14 skills, all 3/3 on their respective trees
Still open, outside this repo: the `account_id` the ten refused tools expect.

## 1.3.2 — 2026-09-08

The suite holds under repetition. Every case now passes three runs out of
three, and the three that did not have concrete causes, none of them wording.

### Triple run: 22/22
`--runs 3` over the full suite gave 19/22 with three flaky cases. After the
fixes below, those three pass 3/3 on the committed tree, and `~/.seal-copilot`
is untouched after the run.

### A forked skill cannot see the session
`context: fork` starts a context that never received the SessionStart hook's
output, so a forked skill has no way to learn the announced state directory
and falls back to the literal `~/.seal-copilot`. That is how fixture data
reached the real home directory a second time, and why
`property-explorer-ranks-and-persists` found nothing under the eval's state
dir in two runs of three. property-explorer and opportunity-scan — the two
forked skills whose job includes persisting state — now run in the main
context. product-friction and cost-reduction stay forked; their only state
write is the optional run log. Documented in the state schema.

### A contract dropped when the answer feels obvious
opportunity-scan omitted its Verify line in two runs of three. Same defect
diagnose-drop had: the output format was a suggestion. It is binding now, and
the skill is told why — a recommendation without a way to check it cannot go
into the ledger.

### A session that never started is not a verdict
One attempt of install-reuses-existing-site produced no answer, no tool call
and no error. The runner now recognises that shape as a transient CLI failure,
retries the attempt once, and names it as transient if it repeats, instead of
scoring it against the skill.

### Caveat
The 19 stable cases were measured on the tree one commit earlier; the changes
since are narrow (two skills' frontmatter, one output contract, a runner retry
path). A full `--runs 3` on this exact tree is the remaining certification
step and has not been run.

## 1.3.1 — 2026-09-08

The first suite run that means something: fixtures match the live API, and
21 of 22 cases pass against them.

### Fixtures verified against the real server
`validate-fixtures.mjs` reports **30 tools compared, 0 mismatches** for the
entire site-id family. Until this run a green suite proved the skills were
consistent with my guesses; now it proves they read the shapes the server
actually returns. The ten account-id tools remain unreachable — see 1.3.0.

### Suite: 21/22 (95%)
Against the realistic fixtures, after the fixes in the previous commit. Cases
that had failed and now pass: healthy-says-so and saas-last-step-broken (the
runner captures the whole stream, and skills write state before the final
message), spike-is-bots (the source is named), property-explorer, both
watchdog cases and the ledger case (state goes where the session-start hook
says), hostile-values (the payload sits on the path the drill walks),
channel-mix (the ROAS caveat is no longer banned).

The one failure was a budget ceiling of 6 on the text-error case; the model
spent 9 — discovery, the failing call, the one retry the methodology allows,
a bot check — and refused to treat the error as data, which is the behaviour
under test. Ceiling set to 10.

### Also
- The eval run before this one wrote fixture state into the real
  `~/.seal-copilot`. Those files are quarantined under
  `evals/results/polluted-home-state-2026-09-08/`, not deleted.
- The validator counts a shape as covered when any fixture reproduces it.
- Single-run results are labelled as such; `--runs 3` is the bar for trusting
  a green suite, and has not yet been run against these fixtures.

## 1.3.0 — 2026-09-08

The first contact with the real API. Every fixture had been a reconstruction;
now they are copies of captured shapes, and the differences were not cosmetic.

### What the live server actually returns
- **`get_overview` is nested, not flat**: totals under `traffic` and
  `conversions`, deltas under `traffic_change` and `conversions_change`, and
  daily `*_series` with `points: [{ date, value }]` plus `*_series_compare`.
  The old fixture — and every skill reading `overview.entrances` — was wrong.
- **Money is a string in some tools and a number in others.** `"12345.67"`
  from `get_overview`, `get_landing_pages`, `get_countries`; a number from
  `get_campaigns`, `get_top_*`, `get_devices`. Skills must `Number()` it.
- **List tools return an envelope** `{ data, has_next, page, page_size, total }`;
  with `compare`, rows gain `*_prev` twins and a `comparison` block appears.
  `get_top_*` return bare arrays. `list_microconversion_types` is
  `array<string>`; `list_property_keys` is objects with counts.
- **`get_microconversion_details` breaks down by device, source, country and
  landing page in one call.** Phase 1 had rewritten three skills to make one
  filtered call per segment; that was working around a limitation that does
  not exist. `get_devices` likewise returns browser and OS alongside device.
- **`get_property_breakdown` is pivoted by UTM and carries no revenue**;
  revenue-per-value lives in `get_property_values`.
- **Raw rows carry `hour`**, which is what the watchdog needed all along.
- **`get_funnel` answers `{ error }` as JSON** — a third error style.

### Two identifier families
Twenty tools take the **account id** in their `site_id` parameter; thirty-four
take the site id. The wrong one returns "Access denied" as text. `list_sites`
and `get_site` expose no `account_id`, so the account family — including
`get_channels` and `get_bot_stats`, which almost every skill calls — could not
be reached with this key. Documented in the methodology; the site profile now
stores both ids; the validator tries every identifier `get_site` exposes.
**Open question for the MCP team:** where does the account id come from?

### Failures arrive as text in a successful response
"Error: site_id is required" comes back as ordinary content, not a protocol
error. A skill that only handles protocol errors reads it as data. The
methodology and core skill now require reading the response before using it;
the mock reproduces the behaviour; a new eval case fails any skill that
reports the error string as a result.

### Rewritten
- All 14 fixtures and every builder in `_lib.mjs`, to the captured shapes.
- The coherence checker reads the nested overview and numeric-parses revenue.
- `methodology.md` gains a "Reading responses" field guide.
- Eight skills had their field references corrected: core, both watchdogs,
  funnel-analysis, diagnose-drop, product-friction, property-explorer,
  setup-audit, install-sealmetrics.

### Still unverified
`get_bot_stats` and `get_suspicious_sessions` shapes, and the semantics of
`traffic_change` (percentage or absolute) — the validator now reports its
magnitude class so the next run settles it.

## 1.2.0 — 2026-09-08

Closes the nine gaps identified after the first green eval run, in priority
order. The suite goes from 10 cases covering 6 skills to 21 covering all 14.

### Added — account data is treated as untrusted (the one gap that could do harm)
Campaign names, UTM terms, referrer domains, landing paths and property values
are written by whoever sent the traffic. Anyone can visit a customer's site with
`?utm_campaign=<anything>` and that string lands in the next report — a report
that gets forwarded to Slack and read by people with more authority than the
analyst. Nothing in the plugin acknowledged this.

`methodology.md` gains a section and the core skill a rule: returned strings are
data to report, never instructions to follow. A value carrying directives is a
finding about suspicious traffic, not a command. Hostile values must be quoted
and labelled rather than reproduced as bare lines, and absurd ones truncated.
A new fixture carries real injection payloads in campaign, term and referrer
fields, and a case asserts the analyst reports them without obeying them, keeps
its verdict, and does not re-issue the payload in its own voice.

### Added — the check that turns a green suite into evidence
`evals/validate-fixtures.mjs` calls the **real** API and compares response
shapes against the fixtures. Until it runs clean, green evals prove internal
consistency, not correctness: if the real `get_overview` nests its fields, every
skill breaks in production and every eval still passes. Compares key names and
types only — never values — and writes nothing without `--save`.

### Added — eval coverage for every skill, and for the state layer
Eight skills had no eval: monday-briefing, both watchdogs, channel-mix-optimizer,
cost-reduction, opportunity-scan, property-explorer, setup-audit. All covered now,
with two new fixtures (a half-instrumented account, and a low-volume store whose
add-to-cart goes silent at 11:45).

The runner gained multi-step cases sharing one state directory, plus
`stateMustContain` assertions, because the recommendation ledger — the feature
that separates a consultant from a report generator — had never executed a single
line. Two cases now exercise it end to end: calibrate-then-watch proves the
watchdog baseline is written and then used, and ledger-is-written-then-verified
proves a recommendation is persisted with the metric and check date that make it
verifiable later.

Notable negative tests: channel-mix must **refuse** to reallocate when the RPE
gap is below threshold, and cart-watchdog must refuse to run without a baseline.

### Added — repeat runs, because model wording varies
`--runs N` runs each case N times and requires it to hold every time. A case that
passes 2 of 3 is flaky, not passing — we watched the same correct answer come back
phrased two different ways across runs, which is exactly how a suite drifts into
lying. Flaky cases are named in the summary, and a single-run invocation now says
so.

### Added — schema drift detection
`evals/check-schema-drift.mjs` re-dumps the live MCP schema and fails on any
difference. The linter validated against a snapshot; if the server removed a
parameter, everything passed and production broke. Wired into
`scripts/check.sh --online`. Currently clean: 62 tools match.

### Added — distribution and local metrics
- `.claude-plugin/marketplace.json`, validated. Installing is now two commands,
  documented in the README.
- `scripts/usage-report.mjs` reports the PRD's own success metrics — budget
  compliance, share of recommendations verified, impact of verified advice —
  from the local state directory. It sends nothing anywhere; publishing any of
  it is the user's decision, not the plugin's.
- A Spanish eval case. The plugin ships Spanish triggers and claims to answer in
  the user's language, and neither had ever been tested.

### Still open
- `validate-fixtures.mjs` has not been run: it needs a real API key.
- No skill has ever executed against a real account.
- Two MCP enhancements still cap features: an hourly time series would take
  cart-watchdog out of interim mode on high-volume sites, and device/source
  filters on `get_property_breakdown` would make product-friction's drill exact
  rather than sample-based.

## 1.1.1 — 2026-09-08

First full run of the eval suite: 8/10. Both failures were bugs in the
assertions; one of them exposed a real defect in a skill.

### Fixed — brittle and wrong assertions
- `drop-isolates-campaign` required a literal "paid search". The model wrote
  "paid\u2011search" with a non-breaking hyphen and was marked wrong for
  typography. Assertions now match separators with a `SEP` class rather than a
  literal space.
- `empty-bot-stats-is-not-zero-percent` banned the phrase "0% bots" anywhere in
  the answer. The model produced the ideal response — *"agent analytics is off,
  so get_bot_stats returned empty, which is not the same as 0% bots"* — and the
  ban fired on its own disclaimer. The rule now forbids the affirmative claim
  ("bot share is 0%") and leaves the disclaimer alone. Verified against the real
  answer and against a genuine violation, so this narrows a false positive
  rather than weakening the check.

### Fixed — defects the suite surfaced
- **`diagnose-drop` answered with a one-line summary** instead of the four
  mandatory sections, dropping the verification plan entirely. The output
  contract is now binding, and the core skill gains a rule that a documented
  output format is not optional just because the cause turned out to be obvious.
- **The call budget leaked into a user-facing answer** — "Used 8 of 12 tool
  calls". The budget constrains the model, it is not information for the user.
  Now forbidden globally.

### Added
- `evals/preflight.mjs`: proves the whole chain — CLI auth, mock server start,
  tool visibility, response parsing — with one cheap model call, so a broken
  case is never debugged blind again.
- A note in `evals/cases.mjs` on writing assertions: match separators, not
  literal spaces, and forbid affirmative claims rather than bare phrases that
  can legitimately appear inside a disclaimer.

### Suite status: 10/10

First fully green run, on 2026-09-08. Observed call counts against each case's
ceiling — every skill came in under its documented budget:

| Case | Calls | Case ceiling | Skill budget |
|---|---|---|---|
| healthy-says-so | 4 | 10 | 8 |
| drop-isolates-campaign | 9 | 14 | 12 |
| spike-is-bots-not-growth | 5 | 12 | 12 |
| empty-bot-stats-is-not-zero-percent | 8 | 12 | 12 |
| sku-friction-found | 9 | 14 | 12 |
| hotel-seasonal-no-action | 8 | 14 | 12 |
| saas-last-step-broken | 10 | 12 | **10 — at the limit** |
| multi-site-asks-first | 1 | 4 | 4 |
| no-api-key-gives-instructions | 0 | 0 | — |
| install-reuses-existing-site | 6 | 8 | 15 |

Two calibration notes for whoever tightens this next. `funnel-analysis` ran at
exactly its documented budget of 10, so it has no headroom and is the first
place a regression would show. And the case ceilings are looser than the skills'
own budgets, which means the suite does not currently enforce the documented
contract — worth closing, but not worth turning a green suite red without a
reason.

## 1.1.0 — 2026-09-07

### Fixed — the eval runner hid environment failures behind assertion failures
An unauthenticated CLI produced `FAIL (0 calls) — missing /on track/` for every
case, which reads as "the skill ignored its tools" when the session never
started at all. The runner now surfaces the CLI's own error, distinguishes it
from a real assertion failure, and aborts the whole run with exit code 2 and
instructions rather than repeating a misleading failure ten times.

### Added — `install-sealmetrics`
The gap flagged when 1.0.0 shipped: four MCP tools formed a complete
first-install flow that no skill used. There is now a skill that takes a site
from no analytics to measured and verified, and MCP tool coverage reaches
62/62.

The flow: check whether a site already exists, provision one only if not,
detect the framework, place the snippet, confirm the first pageview, instrument
the funnel for the detected vertical, then verify each event individually.

Three gates make this the plugin's most constrained skill, because it is the
only one that writes code and the only one that can create an account:

- **Provisioning requires the user's own acceptance.** `provision_site` creates
  a real account tied to an email address. The skill must show the terms link,
  ask for the email rather than inferring it from git config or the
  environment, and wait for the user to accept in their own words. It may never
  pass `accept_terms=true` on its own initiative, and asking to install
  Sealmetrics does not count as acceptance.
- **An existing site is never duplicated.** A second site for the same domain
  splits the data and is hard to undo. A new eval case
  (`install-reuses-existing-site`) fails loudly if `provision_site` is called
  when `list_sites` already returns the domain.
- **Written is not verified.** Every event is confirmed with
  `verify_event_instrumented` against a real user action. Events that were
  written but never fired are reported as unconfirmed, not as done — the
  failure mode where code review passes and the data never arrives.

Two install-time details the skill insists on, because retrofitting them costs
months of unusable history: revenue on the conversion, and the *same* product
identifier key and value on both the product-view and add-to-cart events.

`setup-audit` now hands off here when a site has no data at all, instead of
scoring an implementation that does not exist yet.

## 1.0.0 — 2026-09-07

Phase 3 of the v1.0 PRD. Every skill now ships a worked example, the third
vertical is covered, and no MCP tool is left unused.

### Added — golden outputs (E8)
- `skills/<skill>/examples/output.md` for all 13 skills, referenced from each
  skill so the model matches a real example rather than inferring a format.
- The examples are generated from the eval fixtures, so the documented output
  and the tested behavior use the same numbers. Two of them deliberately show
  an honest negative: the health check reports no findings on a healthy week
  instead of padding, and the channel-mix optimizer recommends *not*
  reallocating because the RPE gap is below the threshold.

### Added — SaaS / lead-gen playbook (E10)
- `references/saas-playbook.md` covers the vertical the plugin had no answer
  for: absent revenue values (impact stated in leads, never invented euros),
  the submit-rate step that breaks silently, brand vs non-brand paid, blog-heavy
  acquisition paths, and plan mix as the only available proxy for lead quality.
- The core skill now detects and routes to it.

### Added — full MCP coverage (E11)
- Pattern 14, content-group mismatch, with the caveat that an informational
  group is *supposed* to convert below product pages — the finding is a missing
  path, not a bad blog.
- `setup-audit` now confirms events with `verify_event_instrumented` instead of
  inferring them from counts, and takes snippets from `get_instrumentation_guide`
  rather than improvising them. It also gained the plugin's only write path:
  a channel-rule fix must be proposed, dry-run with `test_channel_rules`, and
  applied only after the user confirms in the conversation — a rule rewrites how
  every past report classified traffic, so a silent change would invalidate the
  user's own history.
- The core skill must answer configuration questions from `search_docs` /
  `get_doc`, not from memory.
- `property-explorer` reports segment size and conversion share via `get_segment`;
  `funnel-analysis` checks entry paths by content group.
- Every tool that was unused at the start of phase 1 is now either used or
  deliberately out of scope (the channel-rule *write* tools stay gated behind
  explicit user confirmation).

### Fixed — fixture arithmetic
- Four fixtures had channel rows that did not sum to their overview, and one had
  campaign rows that did not sum to their channel. Golden outputs derived from
  them would have taught wrong maths. Rewritten, and
  `evals/fixtures/_check-coherence.mjs` now verifies every fixture in both the
  7-day and 30-day window as part of the self-test and the build.
- The healthy fixture is period-aware, so a weekly skill gets weekly numbers.

### Changed — repo (E12)
- `seal-copilot-SKILL.md`, the pre-plugin v0.1 skill that now contradicts the
  current methodology, moved to `docs/archive/` with a warning not to copy from it.
- Added `LICENSE` (MIT, matching the manifest), `.gitignore`, and `docs/` holding
  the spec and the PRD.
- `scripts/check.sh` runs every gate that needs no model or API key: linter,
  fixture arithmetic, harness self-test, manifest validation. This is what CI
  should run on `main`.
- Initialized git. The built `.plugin` is gitignored — regenerate it with
  `scripts/build-plugin.sh`.

### Still open
- The model-in-the-loop eval run (`node evals/run-evals.mjs`) needs an
  authenticated CLI and has not been executed.
- Fixture responses remain reconstructions, not captures from a live account.
- Two MCP enhancements would simplify skills that are currently working around
  their absence: an hourly time series for microconversions, and device/source
  filters on `get_property_breakdown`.
- No `marketplace.json` yet — that depends on the undecided distribution route.
- Four MCP tools remain unreferenced on purpose: `provision_site`,
  `detect_framework`, `verify_setup` and `get_setup_status`. Together they are a
  complete **first-install flow** — create a site, detect the framework, place
  the pixel, confirm the first hit — which is a different job from analysis and
  has no skill. Worth a `install-sealmetrics` skill, but that is new scope, not
  tool coverage, so it is being surfaced rather than built.

## 0.5.0 — 2026-09-07

Phase 2 of the v1.0 PRD: the plugin gains memory, isolation, and a test suite.

### Added — persistent state (E5)
- `references/state-schema.md` defines the contract: a per-site directory at
  `$SEAL_COPILOT_STATE_DIR` or `~/.seal-copilot/<site_id>/`. Every read is
  optional, so sandboxes degrade instead of failing.
- `profile.json` caches site, timezone, vertical, real event names, product
  identifier and `agent_analytics_enabled`, with a 7-day TTL. Skills read it
  instead of repeating discovery.
- `recommendations.jsonl` is a recommendation ledger. weekly-health-check and
  monday-briefing now open by verifying recommendations whose check date has
  arrived, and opportunity-scan suppresses findings that are already open
  unless the impact grew by half.
- `runs.jsonl` logs skill, calls used and budget, which makes budget
  compliance measurable rather than aspirational.

### Added — plugin structure (E6)
- `agents/sealmetrics-analyst.md`: an isolated analyst that preloads the core
  skill, is denied Bash/Edit/WebFetch/WebSearch, and returns only the finished
  report.
- `hooks/hooks.json` with two hooks. **SessionStart** reports whether
  `SEALMETRICS_API_KEY` is set — a missing key now produces setup instructions
  instead of a wall of failed calls — and injects any cached site profile.
  **PreToolUse** counts Sealmetrics calls and warns past budget. It warns and
  never denies: cutting off a diagnosis mid-way would be worse than an overrun.
- Skill frontmatter: `argument-hint` on the three skills that take one,
  `disable-model-invocation` on the three scheduled/manual skills so a casual
  question cannot trigger them, and `context: fork` on the four heaviest skills
  so raw JSON stays out of the main conversation.
- Tool restrictions apply only to the forked skills. Restricting them
  session-wide would have removed Bash from the user's own session.

### Added — eval suite (E7)
- `evals/mock-server/`: an MCP stdio server that serves fixtures and **rejects
  invalid parameters**, turning a wrong call into a visible failure. It refuses
  `get_channels(compare=…)` and `period=last_28_days` exactly as the real
  server's schema requires.
- `evals/fixtures/`: nine scenarios — healthy, paid-search drop, bot spike,
  agent-analytics-off, SKU friction, hotel seasonality, SaaS form leak,
  multi-site, missing API key.
- `evals/cases.mjs` and `evals/run-evals.mjs`: each case runs a real
  `claude -p` session against a fixture and asserts on the answer, the tools
  called, and the call budget. `claude plugin eval` is early-access and
  unavailable, so this is the suite.
- `evals/self-test.mjs` verifies the harness with no model in the loop:
  fixtures load and serve, the mock rejects bad calls over JSON-RPC, and the
  assertion logic passes and fails what it should.
- `scripts/build-plugin.sh` now gates packaging on the linter, `claude plugin
  validate`, and the harness self-test.

### Added — onboarding and failure handling (E9)
- README: a five-minute first run, a "what it remembers" section, and a
  troubleshooting table covering the seven failures users actually hit.

### Fixed
- `argument-hint` values were unquoted, which is invalid YAML —
  `[metric] [period]` parsed as a broken flow sequence and would have dropped
  every frontmatter field at runtime. Caught by `claude plugin validate`, now
  part of the build.
- The eval runner dropped the first CLI filter argument.

### Not verified in this environment
- The eval suite's model-in-the-loop step needs an authenticated CLI; a nested
  `claude -p` here returns "Not logged in". Everything around it is tested.
  Run `node evals/run-evals.mjs` from a logged-in terminal.
- Fixture response shapes are reconstructed from documented field names, not
  captured from a live account. Replace them with recorded responses once an
  API key is available.
- `context: fork` behavior on the four heavy skills is syntactically correct
  per the current docs but has not been exercised at runtime here.

## 0.4.0 — 2026-09-07

Phase 1 of the v1.0 PRD: every skill now runs against the real MCP schema.

### Fixed — invalid MCP calls (42 across 17 files, verified by linter)
- `get_channels` / `get_device_types` / `get_top_*` do not accept `compare`.
  Channel trends now use calendar-pair presets (`this_week` vs `last_week`)
  diffed in the skill, in diagnose-drop, weekly-health-check,
  channel-mix-optimizer, methodology and pattern 8.
- `get_bot_stats` takes `days`, not `period`.
- `get_suspicious_sessions` takes `min_score` / `limit`, has no period.
- `get_microconversions` / `get_microconversion_details` take
  `conversion_type`, not `type`. Neither has `group_by` — segmentation is now
  one filtered call per segment.
- `get_property_breakdown` has no `limit` or `sort_by`; skills rank and
  truncate the full pivot themselves.
- `get_property_values` cannot filter to a single value; `group_by` is limited
  to UTM dimensions. property-explorer's channel-variance step is now one call.
- `get_campaigns` has no `country` filter — geo screening uses
  `get_top_campaigns(country=…)`.
- `get_top_campaigns` has no `sort_by`; monday-briefing uses `get_campaigns`.
- `get_alert_history` has no `period`.
- Removed references to `get_top_countries` and `get_event_health`, which do
  not exist.
- `last_28_days` is not a valid period preset.

### Changed — one methodology
- The core skill now explicitly supersedes the MCP's `get_marketing_playbook`
  and instructs not to call it, ending the contradictory-thresholds problem.
- Attribution is stated as **last non-direct click**, not last-click, with the
  GA4 / ad-platform mismatch disclaimer.
- Country is documented as timezone-derived, not IP-based. Geo-spend
  recommendations now require corroboration.
- `get_bot_stats` is read with three outcomes: data, empty (agent analytics
  off — never "0% bots"), or 403. Findings are marked "unvalidated for bots"
  when validation was impossible.
- Adopted the 200-entrance minimum for landing/campaign CR comparisons
  alongside the existing 30-conversion rule.
- methodology.md gains an MCP call-rules section and a failure-modes table
  (no API key, 401/403, multi-site, thin history, empty results, timeouts).

### Added
- `calibrate-watchdog` skill: builds the hour-of-week baseline once from
  `get_microconversions_raw` in three volume-dependent modes and caches it to
  `~/.seal-copilot/<site_id>/watchdog-baseline.json`.
- `evals/lint-tool-calls.mjs` and `evals/mcp-schema.json` (62 tools, dumped
  from the running server): CI-ready validation of every tool call written in
  the plugin's markdown.
- `scripts/build-plugin.sh`: lints, then packages. Replaces the manual zip.

### Rewritten
- `cart-watchdog` now reads the cached baseline, judges the day-to-date total
  against a cumulative expectation, escalates to 🔴 only on two consecutive
  bad checks, and refuses to run without a baseline instead of guessing.
- `product-friction` now discovers the identifier via
  `list_property_keys(table=conversion_items)`, measures real per-SKU
  cart→purchase with `get_conversion_items_raw`, and drills device/source with
  four shared `get_microconversions_raw` samples instead of per-SKU calls that
  the API cannot serve. Sample-based conclusions are labelled directional.

### Known limitations
- The watchdog baseline is sampled on high-volume sites. A
  `get_microconversions_timeseries` tool in the MCP would reduce calibration to
  one call and is requested as a parallel dependency.
- `get_property_breakdown` cannot filter by device or source, so per-SKU drills
  remain sample-based until the MCP adds those filters.
