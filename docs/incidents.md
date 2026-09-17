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
