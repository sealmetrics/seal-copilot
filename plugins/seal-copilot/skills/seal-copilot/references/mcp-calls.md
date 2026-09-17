# MCP Call Rules

How to talk to the Sealmetrics MCP correctly: which parameters each tool takes,
which connector announces it, what a response really looks like, and how a
failure arrives.

**Read this before composing any call you have not made in this session.** Get
one of these wrong and the analysis is not wrong loudly — it is wrong quietly.
Passing `compare` to a tool that ignores it returns a single period and you
report "no change" on data that never held a comparison.

Thresholds, the cause hierarchy and what to tell the user when a call fails are
in `methodology.md`.

## MCP call rules (get these wrong and the analysis is silently wrong)

**`compare` is not universal.** It is supported on `get_overview`,
`get_traffic_sources`, `get_traffic_mediums`, `get_campaigns`, `get_terms`,
`get_pages`, `get_landing_pages`, `get_conversions`, `get_microconversions`,
`get_countries`, `get_devices`. It is **not** supported on `get_channels`,
`get_top_channels`, any `get_top_*` variant, `get_device_types`, the `*_raw`
tools, or any `list_*` tool. **Passing `compare` to a tool that ignores it
returns single-period data silently** — you will report "no change" on data
that never contained a comparison.

**Comparing channels period over period** therefore takes two calls with a
**calendar-pair preset**, diffed by you, using the compact `get_top_channels`
(`get_channels` returns the same rows and adds only pagination):

- `get_top_channels(period=this_week)` vs `get_top_channels(period=last_week)`
- `get_top_channels(period=this_month)` vs `get_top_channels(period=last_month)`
- `get_top_channels(period=this_quarter)` vs `get_top_channels(period=last_quarter)`

`30d` has no matching prior-window preset. When you need a rolling 30-day
channel comparison, use `start_date`/`end_date` for both windows instead.

**Valid `period` presets only:** `today`, `yesterday`, `7d`, `30d`, `90d`,
`12m`, `this_week`, `wtd`, `last_week`, `this_month`, `mtd`, `last_month`,
`this_quarter`, `qtd`, `last_quarter`, `this_year`, `ytd`, `last_year`.
There is no `last_28_days` or `last_30_days` form. For an arbitrary window,
pass `start_date` and `end_date` (account-timezone local days).

**Parameter names that are easy to get wrong:**

| Tool | Correct usage |
|---|---|
| `get_microconversions` | `conversion_type`, not `type` |
| `get_microconversion_details` | `conversion_type` + filters (`device_type`, `utm_source`, `country`, `browser`, `os`). There is **no** `group_by` — segment by making one filtered call per segment |
| `get_property_breakdown` | `property_key`, `table`, `conversion_type`, `period`. No `limit`, no `sort_by` — it returns the full pivot; rank and truncate yourself |
| `get_property_values` | `group_by` accepts only `utm_source`, `utm_medium`, `utm_campaign`, `all`. It cannot filter to a single property value |
| `get_campaigns` | No `country` filter. Use `get_top_campaigns(country=XX)` for geo screening |
| `get_top_campaigns` | No `sort_by` — it is ranked by entrances |
| `get_alert_history` (local only) | `limit`, `offset`, `rule_id`, `status` — no period |
| `get_device_types` | No `compare`, no `sort_by` |

**Raw tools** (`get_conversions_raw`, `get_microconversions_raw`,
`get_conversion_items_raw`): one row per event, `conversion_type` takes an
**array**, range capped at 31 days, ≤100 rows per page. Use them for per-event
or per-product detail, never for macro windows. `get_conversion_items_raw` is
the right tool for per-product analysis — item properties (`sku`, `price`,
`quantity`) are always included.


## A successful call can still be a failure

The Sealmetrics MCP reports failures as **ordinary text inside a successful
response**, not as protocol errors. A call that asks for a site the key cannot
see comes back looking like any other result, carrying:

```
Error: site_id is required. Either pass it as a parameter or set the
SEALMETRICS_SITE_ID environment variable.
```

Confirmed against the live server on 2026-09-08, on every tool tried.

So: **read what came back before using it.** If a response is a short string
beginning with "Error", "Failed", "Unauthorized", "Forbidden" or "Not found",
the call did not work. Say so, apply the matching row of the failure-modes
table below, and never let that text flow into a report as if it were data. A
report that lists an error message where a channel name belongs is worse than
one that says the data could not be fetched.

The common case is a missing `site_id`. Resolve it with `list_sites` at the
start of every run, cache it in `profile.json`, and pass it explicitly when the
account has more than one site. A cached `site_id` that `list_sites` does not
return belongs to another account on the same machine: ignore it rather than
calling a site this connection cannot reach (see "A cached site belongs to one
connection" in `state-schema.md`).

**Ten tools will refuse that same id with "Access denied" — by design.**
API keys (`sm_…`) carry only `stats:read`, `sites:read`, `accounts:read` and
the two channel-rule write scopes; an OAuth grant mints a read-only
server-side key. The alerts, segments, bot-stats and webhooks routers require
the generic `read` scope, and the hierarchy is one-way: `read` implies
`stats:read`, never the reverse. So no API key and no OAuth connection can
ever call `list_alerts`, `get_alert_history`, `get_alert_stats`,
`list_segments`, `get_segment`, `list_webhooks`, `list_webhook_deliveries`,
`get_webhook_stats`, `get_bot_stats` or `get_suspicious_sessions` — only a
dashboard session can. The remote transport does not announce them; the local
transport lists them and they 403.

**`get_channels`, `list_channel_rules` and `test_channel_rules` are not among
them.** The channel-groups router accepts `sites:read`, so reading channel
metrics, reading the account's own channel rules and dry-running a rule work on
both connectors. Prefer `get_top_channels` for a breakdown — the same rows in a
compact array, while `get_channels` adds only `page` — but that is a
preference, not a restriction. Only the four channel-rule **writers** are out of
reach on `remote`, and they are not announced there at all.

The lists live in `evals/remote-tools.json`, generated from the MCP server's
own source. Nothing here is hand-kept: the previous hand-kept list of twenty
named these three as unreachable and was wrong for two months.


## The connector decides which tools exist — read this before step one

There are two ways this plugin reaches Sealmetrics, and they expose different
tool sets. **Establish which one you are on before you plan any analysis**,
because it decides which steps of a skill can run at all.

**Look at the tools you were given.** The list is already in front of you; it
costs nothing to read and there is no call that reveals it.

| What you see | Connector | What it means |
|---|---|---|
| `list_alerts` and `list_segments` are not announced | `remote` — the OAuth connector in `.mcp.json`, which is what nearly every user installs | 42 tools. The ten scope-gated ones and the twelve setup and channel-rule-write ones are **not announced**. Do not plan a step around them |
| The list has 64 tools, among them `provision_site` and `detect_framework`, which are hidden on `remote` | `local` — `npx @sealmetrics/mcp` with `SEALMETRICS_API_KEY` | Everything is announced. The ten scope-gated ones still 403 for any key, so treat those as best-effort |

Write the answer into `profile.json` as `connector`, once, so no later run has
to work it out again. See `references/state-schema.md`.

**The rule, on either connector: never call a tool that is not in your list.**
A tool the connector did not announce is not a tool you have. Guessing at its
name produces an "unknown tool" error, burns a call, and tells the user nothing
they can act on.

**What that changes, concretely:**

- Steps marked **(local only)** in any skill are skipped on `remote`. Skip them
  silently in the procedure and account for them once, at the end, in the
  report's "Not checked" line. One line, naming what was not checked and what
  it would have added — never a paragraph of apology, and never a retry.
  The marker is on **steps**, never on a whole skill: no skill in this plugin is
  unavailable on `remote`. In particular the plugin's own alerts —
  `create-alert`, `check-alerts` — use none of the withheld tools; the withheld
  alert tools are not available to them and belong to Sealmetrics' dashboard
  alerts, a different thing.
- **Use `get_top_channels` for a channel breakdown, on either connector.** It
  returns a bare array of the same rows and takes a `period`, so a calendar pair
  (`this_week` vs `last_week`) works. `get_channels` reaches the same data and
  adds only `page`; neither accepts `compare`, so the compact one costs nothing.
- **Reading and testing channel rules works on `remote`.** `list_channel_rules`
  and `test_channel_rules` are announced everywhere. Writing a rule
  (`create_channel_rule` and the other three) is **(local only)**.
- **Installing tracking from scratch is a different plugin.** `seal-install`
  carries the local connector and the provisioning tools. When a user on
  `remote` asks you to install Sealmetrics, say so in one line and name it —
  do not improvise a snippet from memory.


## Reading responses — the real shapes

Captured from the live server on 2026-09-08. Skills that read the wrong field
silently report nothing or the wrong number, so this is the reference.

**`get_overview` is nested, not flat.** Totals are under `traffic`
(`entrances`, `engaged_entrances`, `page_views`, `bounce_rate` as a percentage,
`conversions`, `microconversions`, `pages_per_session`, `revenue`) and under
`conversions` (`conversions`, `conversion_rate`, `average_order_value`,
`revenue`). There is no `prev` block. `traffic_change` and
`conversions_change` exist with the same keys, but **do not rely on them for
the period-over-period delta**: on the live server their values did not
behave like percentage changes (all zero with `compare=previous` on one
window, current-sized figures without it on another). The unambiguous source
is the series: `entrances_series.total` is the current window and
`entrances_series_compare.total` the prior one — likewise `conversions_series`
and `page_views_series`. Compute the delta from those. Revenue has
`revenue_series` but no `_compare` twin; for a prior-window revenue figure,
call `get_overview` again with explicit `start_date`/`end_date`, or read
`comparison.revenue` from `get_conversions(compare=previous)`. The series
points (`{ date, value }`, daily) also show exactly which day a change began.

**Money is a string in some tools and a number in others.** `revenue` and
`average_order_value` arrive as `"12345.67"` from `get_overview`,
`get_landing_pages`, `get_landing_pages_by_content_group` and `get_countries`,
and as numbers from `get_campaigns`, `get_top_*`, `get_traffic_sources`,
`get_device_types` and `get_devices`. Always `Number()` a money field before
arithmetic; never compare a string to a number.

**List tools return an envelope:** `{ data: [...], has_next, page, page_size,
total }`. With `compare`, each row also carries `*_prev` twins
(`entrances_prev`, `conversions_prev`, `revenue_prev` …) and the envelope
gains a `comparison` block with the prior window's totals and `date_range`.
Rows include `conversion_rate` and `bounce_rate` precomputed — as
percentages, so 2.4 means 2.4%.

**`get_top_*` tools return a bare array** of the same row shape, no envelope,
never a comparison.

**`list_microconversion_types` returns `array<string>`.**
**`list_property_keys` returns `array<{ key, conversions_count,
microconversions_count, total_count }>`** — the counts are free signal for
property-explorer's coverage scoring.

**`get_microconversion_details` already breaks down by everything.** One call
returns `totals.count`, `by_device`, `by_country`, `by_source` (with
`utm_source`/`utm_medium`) and `by_landing_page`, each `[{ …, count,
percentage }]`. Do not make one filtered call per segment to rebuild what one
call already contains; use the filters only to narrow.

**`get_devices` returns three breakdowns at once:** `by_device`, `by_browser`,
`by_os`, each with `percentage` and, under `compare`, `*_prev` fields. A
Safari- or iOS-only collapse is visible from this single call.

**`get_microconversions` rows carry `by_source`** — a per-row split by
`utm_source`/`utm_medium`/`utm_campaign` with `count` and `percentage`.

**Property tools:**
- `get_property_breakdown` is pivoted **by UTM**: `data: [{ utm_source,
  utm_medium, utm_campaign, total, values: { <value>: count } }]`, plus
  `property_values` (the list of values seen) and `total_events`. **There is no
  revenue here.** Sum across `data[].values` to get a per-value count.
- `get_property_values` is one row per (value, source): `{ property_value,
  utm_source, conversions_count, microconversions_count, revenue }`. This is
  where revenue-per-value lives.

**Raw event rows** include `date`, `hour` (0–23, local), `timestamp_local`,
`timestamp_utc`, `device_type`, `browser`, `os`, `country`, `channel_group`,
`landing_page`, all UTMs, and `properties` (only with `include_properties`).
`hour` is what the watchdog needs; do not parse it out of the timestamp.

**`get_funnel` answers `{ error: "…" }` as JSON** when no funnel is configured
— a third error style alongside protocol errors and text errors. Check for an
`error` key before reading `steps`.

**`get_tracking_code` is rich:** `script_tag`, `tracker_url`, `js_api` with
`signatures[].call` for pageview/conversion/microconversion, an
`implementation_guide` with `spa_support` and `content_grouping`, and
`examples` per vertical. Use the signatures verbatim whenever you hand a
developer a snippet — never a call you did not fetch.


## Tool efficiency

- Rankings → `get_top_channels`, `get_top_campaigns`, `get_top_sources`,
  `get_top_terms`, `get_top_landing_pages`, `get_top_pages` (compact, no
  `compare`, no `sort_by`).
- Drill-down with filters/compare → full tools (`get_campaigns`,
  `get_traffic_sources`, `get_conversions`…).
- Property analysis → `list_property_keys` first, then
  `get_property_breakdown` (full pivot) or `get_property_values` (by UTM).
- Never paginate past page 2 unless the user asks for the long tail.
