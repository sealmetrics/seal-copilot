# Incidents

What went wrong, when, and which rule came out of it.

The skills carry the rule; this file carries the story. That split is deliberate:
between 1.12.0 and 1.13.2 every fix was written as an anecdote pasted into the
skill that failed ("A real run printed…", "That is how a real run failed on
2026-09-13"), and the files the model has to follow grew to 36,000 words. A rule
in the imperative is what a model obeys; the run that produced it is what a
maintainer needs. They do not belong in the same file.

Each entry names the rule it produced and where that rule now lives, so nothing
is lost by moving it here.

---

## 2026-09-17 · Three tools were documented as unreachable, and the remote serves all three

**Found by** reading the MCP server's own source while answering "which
transport is this session on".

`evals/tool-availability.json` kept a hand-written list of twenty tools the
remote connector supposedly withholds, and `get_channels` sat in the
`forbidden` list on the grounds that it "403s for every modern key and is never
the right call". The linter enforced both, the methodology repeated them, and
the README advertised the check as the one "that would have caught
`get_channels` sitting in four procedures".

The facts, read from `sealmetrics2/mcp-server` at 1.8.2 and from the API:

- `src/remote/gate.ts` excludes **ten** tools, not twenty: the alerts, segments,
  bot-stats and webhooks routers, which require the generic `read` scope.
- `src/remote/app.ts` also passes `omitSetupTools: true`, which withholds
  **twelve** more: the eight setup tools and the four channel-rule writers. So
  the remote announces 42 of 64, and twenty-two are hidden for two different
  reasons that the single list of twenty conflated.
- The channel-groups router is guarded by
  `require_any_scope("read", "sites:read", "channel_rules:write")`, and a modern
  API key carries `sites:read`. So **`get_channels`, `list_channel_rules` and
  `test_channel_rules` work on both connectors.** The gate module says as much
  in a comment dated to PRD-055.
- `src/index.ts`, the local entry, passes no filter at all: the local transport
  announces all 64, and the ten scope-gated ones 403. The encargo in
  `mcp-server-local-gate.md` is still unimplemented — but its premise, "twenty
  tools", was also wrong.

**What it cost.** `setup-audit` told users on the remote connector it could not
dry-run a channel rule, when `test_channel_rules` was available to them the
whole time — so the audit proposed rules in words and withheld the evidence that
would have justified them. `channel-mix-optimizer` marked
`list_channel_rules` **(local only)** and skipped the user's own channel
classification. And a self-test asserted `get_channels` was globally banned,
which kept the false claim alive through nine certifications.

**Rules produced.**
- The gated set is generated, never hand-kept:
  `evals/dump-transport-tools.mjs` reads the server source and writes
  `evals/remote-tools.json`; the linter and the mock both read that file.
  `check.sh` fails when it is stale.
- `get_channels` is a *preference*, not a prohibition. The linter's new
  `prefer-alternative` rule requires any mention to name `get_top_channels` in
  the same block, so the mention cannot read as a recommendation, without the
  plugin asserting something untrue.
- The mock's default transport is `remote`, because that is what `.mcp.json`
  gives every user. It was `local`, so 32 of 35 cases exercised a connector
  almost nobody runs.

**Still open.** The local transport announces ten tools that always 403; that
is the encargo in `docs/mcp-server-local-gate.md`, whose tool table needs
correcting before anyone implements it.

---

## 2026-09-17 · Thirty-six thousand words of instructions, and four rules written nine times over

**Found by** counting what a single `weekly-health-check` loads before its first
tool result: 10,018 words.

Every fix between 1.12.0 and 1.13.2 was written as an anecdote pasted into the
skill that had failed. Four blocks had been copied verbatim across the skills:

| Block | Copies | Words each |
|---|---|---|
| "Before anything else: emit no text until the report…" | 9 | 172 |
| "Resolve the site before any call that takes a `site_id`…" | 14 | 101 |
| The run-log footer with its seven fields | 12 | 104 |
| "Before writing your answer, read `examples/output.md`…" | 15 | 31 |

3,201 words of pure duplication, and the cost was not only context. The one
case that would not pass three runs out of three in certification 9 was
`drop-isolates-campaign`, failing on "2 text blocks, cap 1 — narrated between
tool calls". The rule it broke was the one written nine times. Repetition is not
enforcement.

**Rules produced.**
- `references/run-protocol.md` holds those four rules once, plus the state and
  ledger contracts. Every skill names it in one line with its own budget.
- `references/mcp-calls.md` takes the call rules and real response shapes out of
  `methodology.md`. They are needed at one moment in a run — composing a call
  you have not made before — while the rest of the methodology is needed
  throughout, and carrying both on every question cost 1,500 words.
- The skills carry rules in the imperative; the runs that produced them live in
  this file. `evals/check-skill-size.mjs` fails the build on a word-count cap,
  on any paragraph of 40+ words that appears in two files, and on a date inside
  a `SKILL.md` — because a date is the signature of an anecdote.

**Result.** A weekly loads 6,330 words instead of 10,018. The plugin's markdown
is 30,382 words instead of 36,043, with two new reference files in it.

---

## 2026-09-17 · The first principle had no test

**Found by** looking for what `evals/assess.mjs` actually asserts. It checks
phrases, tool calls, text blocks and state. It never checked a number.

"Every number is real (no invented data)" is the first line of the plugin's
principles and the first thing the README claims. A wrong sum inside a
hundred-SKU pivot, a ratio computed against the wrong denominator, an impact
estimate off by a factor of ten — none of it was visible to the suite, which
stayed green through nine certifications.

**Rules produced.**
- `skills/seal-copilot/scripts/calc.mjs` does the arithmetic: the model
  interprets, the script calculates. Eight operations, and every result echoes
  the operands it used so a figure can be traced to a tool result.
- `evals/fidelity.mjs` traces every number in an answer to a tool result, a
  calculator output, a documented threshold, or one arithmetic step from two of
  those. The mock logs response bodies, without which this is impossible.
- `evals/check-fidelity-golden.mjs` runs it over the eight golden outputs,
  which are reports built from known fixtures and therefore the best
  false-positive test available without spending a model.

**Three leaks found while calibrating it**, each of which would have made the
check worthless:

1. Small integers were allowed as operands, so every data number carried a band
   of a hundred around it and nothing was ever unexplained.
2. The solved operand was compared using the *displayed* number's tolerance.
   For an invented 41,320, `0.02 / 41,320` is 4.8e-7, the nearest data value is
   0, and a ±0.5 window swallowed the difference. It now recomputes the relation
   forwards: 0.02 / 0 is not 41,320.
3. `SKU-1007` parsed as −1007, and a plain space inside a number merged two
   table cells into 10014800. Both were live false positives in
   `product-friction`'s golden output.

**Why it is a warning, not a failure, in the suite.** Twelve times in this
repository a phrase ban has failed a correct answer. This assertion gets the
same probation: it warns until the suite has run clean with the warnings for
three runs.

**One documented exception.** `product-friction`'s golden output says
"roughly €2,800/month" for 238 carts × 9.7% × €120. Three operands is two steps,
and products are excluded from the derivations deliberately, because an impact
figure now comes from `calc impact` and arrives as a given number. The golden
output predates the calculator.

---

## 2026-09-17 · A test that asserted a guess

While writing `evals/calc.test.mjs`, the Poisson case asserted that a daily
"fewer than 5" rule on 10 events a day has a false-alarm probability under 1%.
The calculator returned 0.0293 and the test failed.

The calculator was right: P(X<5 | λ=10) = e^−10 × (1 + 10 + 50 + 166.67 +
416.67) = 0.0293. The assertion was a guess at the magnitude, written by
someone who had not done the arithmetic — which is the exact failure mode the
calculator exists to prevent, reproduced in the test for the calculator.

**Rule produced.** A test asserts the arithmetic, not an expectation about it.
The case now checks `p_quiet_window === 0.0293` and
`false_alarms_per_month === 0.88`, with a comment saying why.

---

## 2026-09-17 · The new assertion failed two correct answers on its first run

**Found by** running `healthy-says-so` and `drop-isolates-campaign` to check
that slimming the skills had not changed behaviour.

It had not: both answers were right. `healthy-says-so` produced the verdict,
the KPI table, the attribution line and no manufactured findings, in 8 calls
against a budget of 8. `drop-isolates-campaign` isolated the cause to one
campaign on one landing page with a full evidence chain, in 12 calls — and in a
**single text block**, which is what the case had been failing on one run in
three before the silence rule stopped being written nine times over.

Both failed anyway, on the shell assertion added the same afternoon. The
offending commands were `ls <state dir>` and `ls <plugin dir>`: the model
looking around before reading a file.

That is the pattern this repository has been bitten by twelve times — a new
assertion that fails a correct answer — and it was committed as a hard failure
on day one while the numeric-fidelity assertion beside it was given probation.
Inconsistent, and the inconsistency cost two red cases.

**Rules produced.**
- `assessShell` returns failures and warnings separately. A command that could
  **write** fails: a redirect into the state directory walks around the schema
  check and silently does nothing on a surface with no shell. A **read-only**
  command (`ls`, `find`, `cat`, `stat`…) warns: it is waste, not damage.
- The rule is now stated where a model will read it, in
  `references/run-protocol.md`: never use `ls` or `find` to see what exists,
  read the path and handle the miss. It had only ever been written inside
  `create-alert`, so no other skill had been told.

**Also fixed here.** Removing the run-log footers left a trailing horizontal
rule at the end of five skills, and `funnel-analysis` had a step numbered 7
stranded inside its Output section since before this work. Both are cosmetic,
and both were introduced or exposed by a scripted edit across fifteen files —
which is the argument for reading the diff of one after running such a script.

---

## 2026-09-17 · Naming a path the skill cannot resolve sends it hunting

**Found by** the shell warnings in the run that verified the slimming. Both
cases passed, and one of the warnings was
`find /Users/rafa/code/sealmetrics/seal-copilot -type d -name schemas`.

`run-protocol.md` and `state-schema.md` had been written to say "the schemas in
`seal-copilot/hooks/schemas/` are the contract". That reads as an instruction to
go and read them, and where they live depends entirely on how the plugin was
installed — a marketplace install, a `--plugin-dir`, a Cowork bundle and a
Claude.ai ZIP all differ. So the model searched the disk.

It never needed to. The hook validates the write and names the fields to fix,
including the field the writer probably meant; that feedback is the contract at
the moment it matters. The prose contract is `state-schema.md`, which the skill
already reaches by a path that resolves.

**Rule produced.** Both files now say the schema is checked, not where it is,
and that looking for it is unnecessary. No skill names a schema path any more.

**Also observed, unresolved.** Both cases landed exactly on their eval cap — 10
of 10 and 14 of 14 — against documented budgets of 8 and 12. One run each, so
this is not yet a trend, and the two extra calls were Sealmetrics calls rather
than file reads, which the protocol change does not touch. Worth watching in the
next certification: if the caps are being reached routinely, either the budgets
in the skills are wrong or a run is repeating a call it already made.

---

## 2026-09-17 · Seal Watch, and why the evaluation left the product

**Decided** after establishing that no customer can have an alert today: rules
are stored, delivery exists, and nothing evaluates. `check_and_trigger` is
called only from a test, creating a rule needs the `write` scope that only a
dashboard session carries, and the dashboard has no alerts screen.

The constraint was to fix it without touching `sealmetrics2`. That is possible
for one reason, verified before any code was written: **everything a rule needs
in order to be judged is under `/stats/`, which the API guards with
`stats:read`, and every API key carries that scope.** What the product does not
open up is saving and evaluating rules, and both can live outside it.

`watcher/` is that evaluator. No dependencies, no model, 50 tests against a fake
API and a fake clock. It reuses the plugin's own rule schema and validator, so a
rule the plugin's hook accepts is a rule the watcher accepts, and a malformed
one stops the service at startup naming the field — a watcher that skips the
rule it cannot parse is a watcher that silently is not watching.

**Three bugs found while building it**, all of the same kind as the ones this
repository keeps producing:

1. `activeMinutesBetween` compared its cursor to the next step *after*
   assigning it, so the guard always fired and silently dropped a minute an
   hour: a four-hour window measured 237 minutes.
2. The due-time schedule was a module-level `Map`, which made a pass
   non-reentrant. One test's schedule suppressed the next test's rule, and the
   report came back empty rather than wrong. It lives in the incident store now.
3. The deliverer did not take the injected `fetch`, so a test posted to the
   real internet and reported a delivery failure as a test failure.

**And a third guessed assertion.** The overnight test expected 120 watched
minutes between `22:00Z` and `04:00Z`. In Madrid `22:00Z` is midnight, so the
whole span sits outside a 08:00–24:00 window and zero was correct. That is the
third time in one day an assertion was written from an expectation instead of
from the arithmetic, after the Poisson tail and the DST span. The rule that
came out of it holds here too: compute the expected value, do not estimate its
magnitude.

**What this deliberately does not do.** No email, because Sealmetrics already
owns alert email and deliverability for a customer's domain is not something to
reimplement. No rules in the dashboard, because they live in the watcher's
config. And it is not the destination: when the native engine ships, the grammar
is already the one that design uses, so the rules translate.

**The seam still open.** A rule created by `create-alert` lands in
`alerts.json` on the machine that created it; Seal Watch reads its own config.
Joining them is manual today, so the skill prints the rule as JSON for the
handover and is forbidden from claiming a rule is watched, because it cannot
see whether the watcher has it.

---

## 2026-09-17 · A measure of false alarms, applied to real ones

**Found by** a failing test while building `watcher/preview.mjs`, the command
that replays a rule over a site's own history.

The replay ended with a verdict copied from `create-alert`: above one incident a
month, "too noisy". A synthetic fortnight with a single dead afternoon came back
`too noisy` at 2.1 a month, and the assertion that it was `sound` failed.

The code was doing what it was told, and what it was told was wrong.
`create-alert`'s threshold is **one FALSE alarm a month**, estimated from the
event's rate on a healthy site. A backtest counts every incident the rule would
have opened, and some of those are real problems. Calling a rule noisy because
it caught a genuine outage applies a measure of false positives to a quantity
that includes true ones.

**Rule produced.** The backtest reports and does not judge: the count, the rate,
how many distinct days fired, and the first five incidents with their times,
plus a `reading` that hands the decision to whoever knows whether the 5th was a
real outage. `preview.mjs` exits zero on any successful replay, because an exit
code would be pretending to know.

The one thing it does assert is **density**: a rule that fires on a third of all
days is describing the site's normal behaviour rather than an incident, and no
knowledge of the dates is needed to say so.

**Also built here.** The config reloads between passes, so adding or pausing a
rule needs no redeploy — and a broken edit keeps the last good config running,
because one typo in one rule would otherwise silence every rule on every site.
`watcher/rules.mjs` edits that file and refuses to write anything the watcher
could not load.

**And a third defect of the same family as the rest.** The due-time schedule
was a module-level `Map`, so one test's schedule suppressed the next test's
rule and the report came back empty instead of wrong. State that belongs to a
run does not belong to a module.

---

## 2026-09-17 · The watcher's API client, confirmed against production by accident

A stale container image was run with a fake token and reached the live API
before the timeout killed it. The result is worth keeping:

```
error acct_example (every rule) — /stats/overview → HTTP 401:
{"error":{"code":"unauthorized","message":"Invalid API key"}}
```

That is the whole read path verified end to end against
`my.sealmetrics.com/api/v1`: the base URL, the `/stats/overview` path, the
`X-API-Key` header and the `account_id` query parameter are all what the server
expects, because an invalid key produces a clean 401 rather than a 404 or a
validation error. Only the credential was wrong.

It also exercised the path that matters most: a 401 was reported as an error
against every rule on the site and **nothing fired**. A watcher that read a
refusal as silence would page every customer during an outage of ours.

Nothing here replaces `evals/validate-fixtures.mjs`, which still needs a real
key and is still unrun. But the watcher's own calls are no longer only tested
against a fake.

---

## 2026-09-17 · The reload compared timestamps, and the container has one-second timestamps

**Found by** the test suite inside the image, which is why it runs there.

`reloader()` decided whether the config had changed by comparing `mtimeMs`. The
75 tests passed on macOS and three of them failed in `node:22-alpine`: a valid
edit was not picked up.

Mtime granularity is one second on some filesystems, the container's included.
Two writes in the same second share a timestamp, so the second one is invisible.
The tests write twice in a row, which is the fast path a human hits too: edit,
notice a typo, edit again.

It now compares the file's **content**. A config is a few kilobytes read every
few minutes, so reading it is far cheaper than the class of bug that assumption
creates — a rule change that silently never takes effect, on a service whose
whole job is to not be silent.

**The lesson is about where tests run.** This is the second portability defect
in one afternoon that only appeared outside the development machine, after the
transport question that turned out to hinge on this laptop running the local
MCP connector rather than the one users get. A suite that only ever runs in one
environment is testing that environment as much as the code, which is the
argument for the `RUN node watcher/test.mjs` line in the Dockerfile: the build
failed instead of the first rule change.
