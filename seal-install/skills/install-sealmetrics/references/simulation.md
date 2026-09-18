# Simulating an install before it ships

Read this at Step 6. Two levels: the calls, and the page. A simulation says
what the tracker *would* send. It is never evidence that an event arrives.

## Step 6 — Simulate before anything ships

Call `simulate_install` with the approved `plan` (the same object you passed to
`plan_install`), its `plan_id`, `repo_path`, and one case per event:

- `event` — the planned name.
- `code` — the call **exactly as you wrote it**, as plain JavaScript (strip
  TypeScript types).
- `vars` — synthetic values for every variable the call reads, **with the
  types the site really produces**. If the orders API returns the total as a
  string, `vars.order.total` is `"149.99"`, not `149.99`: the point is to catch
  the string.
- `source: { file, line }` — where the call is.

It returns `verdict`, and per case the `hits` with what pixel-service would
store (`stored_as`) and `checks`:

- **`status: stale_plan`** — the plan changed after approval. Back to Step 3.
- **A `fail` check** — fix the code (`SM-04` is revenue that is not a number,
  `SM-02` the tracker not loaded yet, `SM-06` personal data, `SM-08` a hit the
  server would reject) and simulate again. **At most three rounds.** After the
  third, stop, show what still fails, and do not ask the user to deploy.
- **`verdict: pass`** — say the install is simulated, not verified.

Write the result to `<state-dir>/<site_id>/simulations/<simulation_id>.json`.

### Step 6b — Simulate in a browser, when the dev server is running

The call-level simulation checks the calls. It cannot see the page: the snippet
placed twice, a framework that runs the call before the tracker loads, a CSP
that blocks it, a router that counts a navigation twice. When the site runs
locally, `simulate_install` with `level: 'page'` walks it in a local browser.

**Only offer it when the dev server is running.** The user said so, or gave you
its URL. Do not start it yourself, and if they have not mentioned one, ask once
whether it is running and on which port; if not, skip this step and say so in
the final table.

Call it with the same `plan` and `plan_id`, and:

- `base_url` — the local address, e.g. `http://localhost:3000`. Never a
  production, staging or preview URL: `allow_remote_url` is only passed when
  the user explicitly asks to simulate against a non-local address, and it stays
  their decision.
- `flows` — one per planned event, with the steps a person takes to trigger it
  on that dev server: `{ event: 'add_to_cart', steps: [{ goto: '/products/tee',
  expect_pageviews: 1 }, { click: '<selector from the code>', expect_hit: { e:
  'add_to_cart', m: true } }] }`. Take selectors from the components you read;
  never guess one you did not see. A flow for `pageview` checks the tag and the
  count on navigation: `[{ goto: '/' , expect_pageviews: 1 }, { click: '<an
  internal link>', expect_pageviews: 2 }]`. A purchase that needs a real payment
  cannot be walked: skip that flow and say why.

What comes back:

- **`status: unavailable`** — no browser on this machine, or the optional
  `playwright-core` is missing. Show the `install` commands, **ask whether to
  install them, and never run them yourself.** If the user declines, the install
  stays call-simulated only.
- **A result without `level: 'page'`** — the connector predates page simulation.
  Say so in one line and move on.
- **A `fail` check** — `SP-01` the tag is not there exactly once, `SP-02` the
  tracker did not load, `SP-03` a CSP blocks it, `SP-04` a console error from the
  tracker, `SP-05` an expected hit did not arrive exactly once, `SP-06` the
  pageviews are off. Fix the code and run it again, within the same three rounds
  as Step 6. A failure in your own steps (a selector that does not exist) is not
  a finding about the site: fix the flow, not the site.
- **`verdict: pass`** — still simulated, not verified.

Write it next to the call-level result, under `simulations/`.
