# Run Protocol

How every skill in this plugin runs. Each one names this file and its own call
budget; nothing below is repeated in the skills.

## 1. Say nothing until the answer

**Your first action is a tool call, not a sentence.** Emit no text between tool
calls — no "checking channels next", no "drop confirmed, moving on", no "writing
state files". The user reads every one of those before the answer, and a run
that narrates its way to a conclusion reads as one that has not reached it.

Your first message is the finished answer, and it is your only message. A single
line of progress breaks this as surely as a paragraph. Never mention the call
budget or a call count.

**And nothing after it.** All state writes happen *before* the answer, so the
last thing the user reads is the answer itself — never "profile cached", never a
closing recap of what the report just said. After the answer: no tool call and
no further text.

## 2. Match the reference output

Read `examples/output.md` in your own skill directory before writing, and match
its density, structure and tone. A skill's documented output format is binding:
do not compress a required report into a summary because the cause turned out to
be obvious.

## 3. Resolve the site first

Before any call that takes a `site_id`, and without announcing it: if
`list_sites` has not already run in this conversation, it is your first call, and
it counts against your budget.

Use anything cached under `<state-dir>/<site_id>/` — profile, property map,
baseline, ledger, saved alert — **only if that `site_id` is in the list**.
Freshness proves nothing about ownership: two Sealmetrics accounts on one
machine share the state directory. If the cached id is absent from the list, that
state belongs to another account. Ignore it for this run, resolve the site from
the list (ask if there are several), and never delete the other account's files.
Say so once, in one line, in the answer and in the run-log notes.

## 4. Write state to the contract

The schemas in `seal-copilot/hooks/schemas/` are the contract, and a hook
enforces them: a write that does not match is refused, naming the fields to fix.

- Use the **Read and Write tools, never a shell**, and write each file whole. An
  `Edit` on a state file is refused because it skips the check.
- **Never use `ls` or `find` to see what exists.** Read a path and handle the
  miss; that is the answer, in one call, on every surface. Two runs spent shell
  calls listing a directory before reading the file in it.
- Anything the schema does not name goes under `extra`. Never invent a
  top-level field.
- State is optional. If the filesystem is not writable, do the work anyway and
  say once, in one line, that nothing could be cached. Never block on it.

**Where there is no state directory at all** — Claude on the web and desktop
have no filesystem, and no `State directory:` line appears — memory has to
travel through the conversation instead. Close the answer with a fenced
`seal-state` block of at most 25 lines: the profile as the schema defines it,
plus any ledger entries still `open`. Say in one line that pasting it back at
the start of the next conversation is what lets the next report follow up.

When a prompt contains such a block, parse it as the starting state, under the
same rule as the disk: its `site_id` has to be in what `list_sites` returns, or
it belongs to another account and is ignored.

Emit it **only** when no state directory was announced. In Claude Code and
Cowork the files are the memory and a pasted block would compete with them.

## 5. Log the run, before the answer

Append one line to `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (full ISO timestamp in UTC, not a date), `skill`, `calls`
(the Sealmetrics calls you made, counted, not estimated), `budget` (the ceiling
your skill documents), `verdict` (`on_track`, `watch`, `act`, `kpis_only`,
`refused`, `error`, or an audit score like `3/10`), `scheduled`, `notes` (one
line about *this* run). Every run that reaches a decision logs it, including a
refusal. Skip silently if the path is not writable.

## 6. Let the calculator do the arithmetic

**Any calculation beyond one operation goes through
`skills/seal-copilot/scripts/calc.mjs`.** Pipe the tool result in unchanged and
report the numbers it returns:

```
echo '<the tool result>' | node skills/seal-copilot/scripts/calc.mjs <op>
```

| op | For |
|---|---|
| `delta` | period over period, from two figures or two series |
| `rates` | CR, RPE and AOV per row, plus totals, with string money coerced |
| `pair-diff` | two calendar-pair calls joined and diffed, ranked by movement |
| `impact` | gap × volume × value, with the assumption stated |
| `baseline-168` | raw events → the watchdog baseline, in the schema's shape |
| `sku-join` | two property pivots → view→cart per SKU against the site median |
| `false-alarm` | whether an alert rule would fire on a healthy site |
| `pace` | month-to-date against a target, weighted by day of week |

Every result carries `inputs`, the operands it used, so a figure in your answer
can be traced to a tool result.

**Where no shell is available** (Claude on the web, a host that denies it), do
the arithmetic yourself and add one line to the answer saying it was done
without the calculator. That is the only exception; a shell is never used for
anything else, least of all state.

## 7. Log a recommendation so it can be verified

Every recommendation you issue goes in `<state-dir>/<site_id>/recommendations.jsonl`
with `metric`, `baseline`, `target`, `verify_on`, and `impact_month` alongside
the site's `currency` from `profile.json`. Without those it cannot be checked
later, and checking is what makes a report consulting rather than an opinion.

Full field lists: `state-schema.md`.
