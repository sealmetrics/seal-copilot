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
