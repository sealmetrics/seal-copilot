# Handing off a finished install

Read this at Step 10. What the user gets, what goes into state, and the three
status columns that are never merged into one.

## Step 10 — Hand off

1. The final table, with three status columns that are never merged:

   | Event | Kind | Where | Planned | Simulated | Verified live |
   |---|---|---|---|---|---|

   `Planned` carries the `plan_id`; `Simulated` says which levels ran — `✓ call`,
   `✓ call · ✓ page`, or what failed — and, when the page level did not run, why
   (no dev server, no browser, the user declined); `Verified live` is ✓ only for
   `verified`, "✓ by recency" for `verified_by_recency`, and otherwise what is
   wrong or still missing (a mismatch, a test order, a deploy).
2. Write what you established into `<state-dir>/<site_id>/profile.json` — site
   id, domain, timezone, vertical, the real event names you used and the
   product identifier key. Seal Copilot reads that profile, so writing it here
   is what makes the first analysis cheap. The contract is
   `skills/seal-copilot/references/state-schema.md` in the Seal Copilot plugin;
   the fields that matter at install time are `site_id`, `site_name`,
   `timezone`, `currency`, `vertical`, `events`, `product_identifier` and
   `discovery_cached_at`.
3. **Offer to keep the plan in the repository**, and write it only if the user
   says yes: `.sealmetrics/plan.json` with `{ "plan_id": …, "plan": … }` — the
   approved plan exactly as in `install-plan.json` — and `.sealmetrics/cases.json`
   with `{ "cases": […] }`, the cases of the last passing simulation. In the
   repository the plan is reviewed with the code in each pull request, and the
   next agent starts from it. With it, the `sealmetrics` CLI (0.2.0 or later)
   checks the install in CI: `sealmetrics plan` fails when the plan changed
   without a new approval, `sealmetrics simulate` when a call breaks. Mention
   that; add a CI workflow only if they ask for one, and then use the recipe in
   the CLI's README rather than writing your own.
4. Tell the user that data takes a few days to become analyzable, and name the
   first analysis worth running: `property-explorer` once events are flowing,
   then `weekly-health-check`.
5. If anything is simulated but not verified, say so explicitly and offer Seal
   Copilot's `setup-audit` to re-check once traffic arrives.

## Log the run

Log the run in `<state-dir>/<site_id>/runs.jsonl` with exactly these fields
and no others: `ts` (ISO timestamp, UTC), `skill`, `calls` (the number of
Sealmetrics calls you made, counted), `budget` (this skill's documented
ceiling, a number — `24` here), `verdict` (one of `on_track`, `watch`, `act`,
`kpis_only`, `refused`, `error`, or the score for an audit), `scheduled`
(boolean), `notes` (one line). The first real audit wrote `calls_used` and a
free-text verdict because this footer said "calls used" in prose; the field
names are the contract. Skip silently if the path is not writable.
