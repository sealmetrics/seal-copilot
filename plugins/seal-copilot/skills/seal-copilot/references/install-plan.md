# The install plan, and what a simulation is not

Read this only when comparing planned measurement against the data, which is
`setup-audit` step 10. Nothing else needs it, which is why it is not in
`state-schema.md`: that file is loaded on every question.

## `install-plan.json` and `simulations/` — written by seal-install (local only)

The installer writes these; Seal Copilot only reads them. They record what the
user agreed to measure, which `setup-audit` compares against the data once
traffic arrives (its step 10): planned events not seen, events seen but not
planned, planned properties missing, revenue lost on planned conversions.

`install-plan.json` carries `plan_id` (the hash of `plan`), `approved_at`,
`approval_quote` (the user's own words, at most 200 characters, never anything
personal) and `plan` itself, exactly as passed to `plan_install`. The plan's own
field-by-field shape belongs to seal-install, not here. A changed plan replaces
the file only once the new one is approved. `install-plan.md` is the same plan
as the table the user saw.

`simulations/<simulation_id>.json` is a `simulate_install` result as returned. A
simulation says what the tracker *would* send. **It is not evidence that an
event arrives** — only `verify_event_instrumented` and real volume are, and a
status of `verified_by_recency` or `mismatch` is not a verification either.

If the user accepted, the plan also lives in their repository as
`.sealmetrics/plan.json` with the simulated calls in `.sealmetrics/cases.json`.
When both exist and the `plan_id` differ, the repository changed the plan after
the approval recorded here: say so, and trust neither as the current install
until the user confirms.

## The four checks against the plan (`setup-audit` step 10)

When `install-plan.json` exists for the site, the install was planned and
approved event by event, so the audit compares the data against that plan and
not only against the canonical funnel. Four checks, three of them from what
steps 3 to 5 and 9 already returned, plus one call:

- **Instrumented, not seen** — a planned `conv` or `micro` with zero events
  in the period. Planned and written, but not arriving: the deploy dropped
  it, or it fires under another name. If `approved_at` is less than 7 days
  old, say it may be too early rather than broken.
- **Drift** — an event arriving that the plan does not contain: someone added
  a call outside the plan. Name it; do not call it wrong, and never
  recommend renaming it.
- **Lost property** — a property key the plan gives an event that
  `list_property_keys` does not list (for purchase items, check
  `table=conversion_items`). Planned, and not reaching the data.
- **Broken revenue** — for each planned `conv` with a `value`:
  `get_conversions_raw(period=7d, conversion_type=[name], limit=200)`. More
  than 5% of rows with `amount` 0 or missing means revenue is being lost —
  usually a total sent as a string, which the tracker drops. Give the share
  and the row count. One call per revenue event; with more than one, check
  the one with the most conversions and say the others were not checked.

Each of these is a gap in the table, tagged **plan `<plan_id>`**, and its fix
is always the same: **plan and simulate the change with `seal-install`**, then
deploy and verify — never a code patch written here. The plan is the
contract the installer checks calls against; a hand fix drifts from it again.
Without the file, skip this step silently: most sites were not installed
with a plan.
