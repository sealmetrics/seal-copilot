# SealMetrics Codex Plugin

This is a local Codex plugin for SealMetrics. It bundles the existing SealMetrics MCP server from the Claude Desktop extension and adds a Codex skill for analytics, tracker installation, event instrumentation, and verification workflows.

## Included

- `server/index.js`: local MCP server launched by Codex over stdio.
- `.mcp.json`: MCP server configuration for Codex.
- `skills/sealmetrics/SKILL.md`: Codex workflow instructions.
- `assets/icon.png`: plugin icon.

## Configuration

For read-only analytics tools, launch Codex with:

```bash
export SEALMETRICS_API_KEY="your_read_only_api_key"
export SEALMETRICS_BASE_URL="https://my.sealmetrics.com/api/v1"
```

`SEALMETRICS_SITE_ID` is optional. If omitted, use the `list_sites` tool first.

Without `SEALMETRICS_API_KEY`, the MCP exposes the onboarding tools for provisioning a new site and verifying setup.

## Install Later

This folder is a plugin source. To make it appear in Codex, add it to a Codex marketplace or install it through the Codex app/plugin directory workflow.
