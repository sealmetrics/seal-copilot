---
name: sealmetrics
description: "Use when working with SealMetrics analytics in Codex: provision a site, install the tracker, instrument conversion or microconversion events, verify setup, or query SealMetrics traffic and conversion data through the bundled MCP server."
---

# SealMetrics

Use the bundled `sealmetrics` MCP server for SealMetrics work. Prefer MCP tools over direct API calls.

## Operating Rules

- Never invent analytics data. If the MCP is unavailable or unauthenticated, state the missing setup clearly.
- Do not expose, print, commit, or copy `SEALMETRICS_API_KEY`.
- Do not accept SealMetrics terms on the user's behalf. Before calling `provision_site`, show the user `https://sealmetrics.com/terms` and require their explicit confirmation.
- Never track personal data in event properties: no names, emails, phone numbers, addresses, user IDs, order IDs, transaction IDs, invoice numbers, or free-form personal text.
- Prefer read-only analytics tools for reporting. Use write-capable tools only when the user explicitly asks to provision a site.

## Setup Flow

1. If the user already has a SealMetrics API key, tell them Codex should be launched with `SEALMETRICS_API_KEY` available in the environment, or configured through their Codex MCP/plugin settings if supported by their install.
2. If the user does not have a site yet, use `provision_site` only after they confirm the terms. Then guide the user or edit the repo to add the returned tracker snippet.
3. Run `detect_framework` when a repository is available and the install location is unclear.
4. Add the tracker to every page through the app's root layout, document head, theme header, or equivalent framework entry point.
5. Run or instruct a real page visit, then use `verify_setup`.

## Instrumentation Flow

1. Call `get_instrumentation_guide` before adding `sealmetrics.conv()` or `sealmetrics.micro()` calls.
2. Classify events conservatively:
   - Use `sealmetrics.conv()` for business outcomes such as purchase, lead, signup, subscription, or booking.
   - Use `sealmetrics.micro()` for engagement events such as add_to_cart, begin_checkout, newsletter_signup, cta_click, file_download, video_play, scroll_50, scroll_100, search, or 404_error.
3. Keep properties structural and non-identifying: product name, category, price, currency, plan, service, counts, and location labels are acceptable.
4. After edits, run the project's normal checks and trigger the relevant UI action when feasible.
5. Use `verify_event_instrumented` to close the loop after a test event is sent.

## Analytics Flow

1. If `site_id` is unknown, call `list_sites` first.
2. Start broad with `get_overview`, then drill down with pages, landing pages, traffic sources, channels, conversions, funnels, audience, bots, segments, alerts, or webhooks tools as needed.
3. Keep result sets small first. Increase limits only when the user needs full detail.
4. Explain date periods explicitly, especially for relative periods like `today`, `7d`, `30d`, `this_month`, and `last_month`.
