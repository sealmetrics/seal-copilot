# Seal Copilot

An AI marketing analyst for [Sealmetrics](https://sealmetrics.com), the
consentless analytics that measures 100% of your traffic. It diagnoses drops,
finds revenue left on the table, audits catalog friction per SKU, watches the
cart during the day, and installs tracking from scratch.

Fourteen procedures, one methodology, and a hard rule against inventing a
number: every figure in an answer comes from a tool result in that session.

Full description of what each one does: [`seal-copilot/README.md`](seal-copilot/README.md).

## Install

**Claude Code**

```bash
claude plugin marketplace add sealmetrics/seal-copilot
```

Then `claude plugin install seal-copilot@sealmetrics`. The bundled MCP server
runs locally and reads `SEALMETRICS_API_KEY` from your environment; get a token
at [my.sealmetrics.com](https://my.sealmetrics.com) under Settings → API Tokens.

**Codex**

```bash
codex plugin marketplace add sealmetrics/seal-copilot
```

Then `codex plugin add seal-copilot@sealmetrics` and `codex mcp login
sealmetrics`. There is no token to copy here: the plugin carries the remote
connector and you authorise it with your own Sealmetrics account.

**Cowork** — Customize → Plugins in the sidebar, then add the
`seal-copilot.plugin` bundle from `scripts/build-plugin.sh`. Same credentials as
Claude Code.

**Claude on the web or desktop** — Settings → Capabilities → Skills takes one
ZIP at a time. Run `node scripts/export-surfaces.mjs` and upload from
`dist/claude-ai/`. Start with `seal-copilot`, `weekly-health-check` and
`diagnose-drop` rather than all fourteen: every enabled skill is weighed on
every message. Then add `https://mcp.sealmetrics.com/mcp` as a connector.

**A custom GPT** — `dist/chatgpt/` holds the instructions and the knowledge
files, generated from the same skills. Its README says what does and does not
survive the trip.

## Layout

| Path | What it is |
|---|---|
| `seal-copilot/` | The plugin. The single source of truth. |
| `.agents/`, `plugins/` | The Codex marketplace. **Generated and committed.** |
| `scripts/export-surfaces.mjs` | Renders every other surface from the plugin. |
| `evals/` | 24 cases against a mock Sealmetrics API. |
| `docs/` | The PRD and the specification. |

The Codex tree is the one generated thing that lives in git, because a remote
marketplace *is* a git repository: what is not committed does not install. Edit
the skills, never `plugins/`, and re-run the export. `scripts/check.sh` fails
the build if the two disagree.

## Working on it

```bash
scripts/check.sh
```

Every gate that needs neither a model nor an API key: the tool-call linter, the
fixture arithmetic, the eval harness self-test, the manifest, and the export.
Add `--online` to also diff the MCP schema against the live server. The eval
suite itself is `node evals/run-evals.mjs`.

MIT licensed. Issues and pull requests welcome.
