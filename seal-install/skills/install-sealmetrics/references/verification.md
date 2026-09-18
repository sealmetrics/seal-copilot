# Verifying each event against the plan

Read this at Step 9. The pixel arriving proves the snippet loaded and nothing
else. Each planned event has to be proved on its own.

## Step 9 — Verify each event, not just the pixel

For every event you wrote, ask the user to perform the action on the live site —
add something to the cart, submit the form, place the test order — and call:

`verify_event_instrumented(account_id=…, kind='conv'|'micro', name=…,
simulation_id=…, expect={ value_min, value_exact, properties_required },
timeout_seconds=…)`

Those three are the only keys `expect` takes; any other is an error. For the
store in `examples/output.md`, after the user placed a 1.23 € test order:

```
verify_event_instrumented(account_id='acct_demo', kind='micro', name='add_to_cart',
  simulation_id='sim_…', expect={ properties_required: ['product_id', 'quantity'] })
verify_event_instrumented(account_id='acct_demo', kind='conv', name='purchase',
  simulation_id='sim_…', expect={ value_min: 0.01, value_exact: 1.23,
  properties_required: ['currency', 'items'] })
```

**Every call carries `expect`** when the plan gives the event revenue or
properties — microconversions included. A call with only `simulation_id`
compares nothing when the simulation ran in another session, which after a
deploy it almost always did.

**Coming back after the deploy.** When the user returns to verify, possibly in
a new conversation, start at Step 8 from `<state-dir>/<site_id>/install-plan.json`
and the latest file in `simulations/`. Do not plan or simulate again unless
something fails.

- `simulation_id` — the last passing call-level simulation in
  `<state-dir>/<site_id>/simulations/`. The connector derives from it what the
  row should carry, but only in the session that ran the simulation.
- `expect` — always pass it too, built from the approved plan in
  `install-plan.json`, because the deploy usually happens in a later session:
  - `value_min: 0.01` for a conversion the plan gives revenue;
  - `value_exact` — the test order's total, **exactly as the user told you**;
    never a number you picked. Without one, leave it out;
  - `properties_required` — every property key **the plan** gives that event.
    Take them from `install-plan.json`, never from the code as it is now:
    checking that the deployed code still sends what was approved is the point,
    and a key that a later edit dropped is exactly what this catches. Leave out
    only a key the plan itself describes as conditional (a coupon that exists on
    some orders), or a real row without it is a false mismatch.

  `value_min` and `value_exact` are for conversions only: microconversions carry
  no amount.
- `lookback_minutes` — only if the user did the action more than 15 minutes ago.

Build the `expect` of every event from the plan before the first call, and
pass `value_exact` on the first call when the user already told you the amount.

Read the status literally:

- **`verified`** — the row arrived as planned. This is the only ✓.
- **`verified_by_recency`** — rows with that name arrived, but several did and
  nothing identified the test: it may be a real visitor's. Write "✓ by recency"
  and say so; for a conversion, ask for the test order with a recognisable total
  and verify again with `value_exact`.
- **`mismatch`** — it arrived, but not as the install sends it. Quote
  `mismatches`. No revenue on a conversion that simulated with revenue means
  production reads the amount from somewhere else (a string, another data layer,
  a different build): find where, fix it, simulate again (Step 6), and ask for a
  new deploy. A missing property is the same loop. Never report a mismatch as
  verified.
- **`warning_pii`** — personal data reached Sealmetrics. Say which keys, remove
  them from the code first, and tell the user plainly that the rows already stored
  carry it.
- **`pending`** — nothing arrived in the window. The message says whether rows
  came with a different amount. Ask whether the action was done on the live site,
  then run it again; do not loop more than twice per event.
- **`rejected`** — `out_of_taxonomy` or `not_lowercase`: the name in the code is
  wrong. Fix the code, which is a change to the plan (Step 3).
- **`needs_expectation`** — you passed a `simulation_id` from another session and
  no `expect`, so nothing could be compared. Call again with `expect` from the
  plan; it is not a result to report.

If the result carries `simulation: "not_in_session"`, the simulation ran in
another session: the explicit `expect` is what was checked. If it carries no
`expectation` at all while you passed one, the connector predates expectations
(`@sealmetrics/mcp` before 1.9.0): say so in one line, and write "✓ arrived,
not compared" rather than ✓.

Whenever you verify — in the same session as the install or a later one — end
with the table from Step 10: the statuses above go in its `Verified live` column,
one row per event.

An event that was written but never fires is worse than a missing one, because it
looks instrumented in the code review. A purchase needs a real test order; if
nobody places one, the event stays unverified.
