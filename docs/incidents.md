# Incidents

What went wrong, when, and which rule came out of it.

The skills carry the rule; this file carries the story. That split is deliberate:
between 1.12.0 and 1.13.2 every fix was written as an anecdote pasted into the
skill that failed ("A real run printed…", "That is how a real run failed on
2026-09-13"), and the files the model has to follow grew to 36,000 words. A rule
in the imperative is what a model obeys; the run that produced it is what a
maintainer needs. They do not belong in the same file.

Each entry names the rule it produced and where that rule now lives, so nothing
is lost by moving it here.

---

## 2026-09-17 · Three tools were documented as unreachable, and the remote serves all three

**Found by** reading the MCP server's own source while answering "which
transport is this session on".

`evals/tool-availability.json` kept a hand-written list of twenty tools the
remote connector supposedly withholds, and `get_channels` sat in the
`forbidden` list on the grounds that it "403s for every modern key and is never
the right call". The linter enforced both, the methodology repeated them, and
the README advertised the check as the one "that would have caught
`get_channels` sitting in four procedures".

The facts, read from `sealmetrics2/mcp-server` at 1.8.2 and from the API:

- `src/remote/gate.ts` excludes **ten** tools, not twenty: the alerts, segments,
  bot-stats and webhooks routers, which require the generic `read` scope.
- `src/remote/app.ts` also passes `omitSetupTools: true`, which withholds
  **twelve** more: the eight setup tools and the four channel-rule writers. So
  the remote announces 42 of 64, and twenty-two are hidden for two different
  reasons that the single list of twenty conflated.
- The channel-groups router is guarded by
  `require_any_scope("read", "sites:read", "channel_rules:write")`, and a modern
  API key carries `sites:read`. So **`get_channels`, `list_channel_rules` and
  `test_channel_rules` work on both connectors.** The gate module says as much
  in a comment dated to PRD-055.
- `src/index.ts`, the local entry, passes no filter at all: the local transport
  announces all 64, and the ten scope-gated ones 403. The encargo in
  `mcp-server-local-gate.md` is still unimplemented — but its premise, "twenty
  tools", was also wrong.

**What it cost.** `setup-audit` told users on the remote connector it could not
dry-run a channel rule, when `test_channel_rules` was available to them the
whole time — so the audit proposed rules in words and withheld the evidence that
would have justified them. `channel-mix-optimizer` marked
`list_channel_rules` **(local only)** and skipped the user's own channel
classification. And a self-test asserted `get_channels` was globally banned,
which kept the false claim alive through nine certifications.

**Rules produced.**
- The gated set is generated, never hand-kept:
  `evals/dump-transport-tools.mjs` reads the server source and writes
  `evals/remote-tools.json`; the linter and the mock both read that file.
  `check.sh` fails when it is stale.
- `get_channels` is a *preference*, not a prohibition. The linter's new
  `prefer-alternative` rule requires any mention to name `get_top_channels` in
  the same block, so the mention cannot read as a recommendation, without the
  plugin asserting something untrue.
- The mock's default transport is `remote`, because that is what `.mcp.json`
  gives every user. It was `local`, so 32 of 35 cases exercised a connector
  almost nobody runs.

**Still open.** The local transport announces ten tools that always 403; that
is the encargo in `docs/mcp-server-local-gate.md`, whose tool table needs
correcting before anyone implements it.
