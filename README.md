# Seal Copilot

An AI marketing analyst for [Sealmetrics](https://sealmetrics.com), the
consentless analytics that measures 100% of your traffic. It diagnoses drops,
finds revenue left on the table, audits catalog friction per SKU, watches the
cart during the day, and turns "avísame si paso 4 horas sin ventas" into a
scheduled check that stays quiet until it matters.

Fifteen procedures, one methodology, and a hard rule against inventing a
number: every figure in an answer comes from a tool result in that session.

Full description of what each one does: [`seal-copilot/README.md`](seal-copilot/README.md).

Installing Sealmetrics on a site from scratch is a second plugin,
[`seal-install`](seal-install/README.md): it needs the local MCP server and an
API key, which the analyst deliberately does not.

## Install

**Claude Code**

```bash
claude plugin marketplace add sealmetrics/seal-copilot
```

Then `claude plugin install seal-copilot@sealmetrics`, and authorise the
connector: run `/mcp`, pick **sealmetrics**, and sign in with your Sealmetrics
account in the browser. No token to copy.

To install tracking on a site, add the second plugin as well:
`claude plugin install seal-install@sealmetrics`, with `SEALMETRICS_API_KEY` in
your environment. It is a separate install because the OAuth connector cannot
reach the provisioning tools, and a skill that promises what it cannot finish is
worse than one that is not there.

**Codex**

```bash
codex plugin marketplace add sealmetrics/seal-copilot
```

Then `codex plugin add seal-copilot@sealmetrics` and `codex mcp login
sealmetrics`. There is no token to copy here: the plugin carries the remote
connector and you authorise it with your own Sealmetrics account.

**Cowork** — Customize → Plugins in the sidebar, then add the
`seal-copilot.plugin` bundle from `scripts/build-plugin.sh`. It carries the same
connector, so the sign-in is the same browser login and there is nothing to put
in the environment.

**Claude on the web or desktop** — Settings → Capabilities → Skills takes one
ZIP at a time. Run `node scripts/export-surfaces.mjs` and upload from
`dist/claude-ai/`. Start with `seal-copilot`, `weekly-health-check` and
`diagnose-drop` rather than all fifteen: every enabled skill is weighed on
every message. Then add `https://mcp.sealmetrics.com/mcp` as a connector.

**ChatGPT** — the plugin itself, once it is in the public directory that
ChatGPT and Codex share. Chat and Work both read it.

## Layout

| Path | What it is |
|---|---|
| `seal-copilot/` | The analyst. The single source of truth. |
| `seal-install/` | The installer: one skill, the local connector, its own key. |
| `.agents/`, `plugins/` | The Codex marketplace. **Generated and committed.** |
| `scripts/export-surfaces.mjs` | Renders every other surface from the plugin. |
| `evals/` | 32 cases against a mock Sealmetrics API, on both connectors. |
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
fixture arithmetic, the eval harness self-test, the manifests, and the export.
Add `--online` to also diff the MCP schema against the live server. The eval
suite itself is `node evals/run-evals.mjs`.

The linter does more than check that a tool exists. `evals/tool-availability.json`
names two tools no skill may ever call, and the twenty the default connector
does not announce; a reference to either fails the build unless the sentence
says it is unavailable, or the step is marked `(local only)`. That is the check
that would have caught `get_channels` sitting in four procedures while the
methodology said never to call it.

MIT licensed. Issues and pull requests welcome.
