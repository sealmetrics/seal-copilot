# Changelog

## 1.1.0 — 2026-09-07

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
