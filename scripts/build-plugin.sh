#!/usr/bin/env bash
# Rebuilds seal-copilot.plugin from the source tree.
# Refuses to package if the tool-call linter finds an invalid MCP call.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/seal-copilot"
OUT="$ROOT/seal-copilot.plugin"

echo "→ Linting tool calls against evals/mcp-schema.json"
node "$ROOT/evals/lint-tool-calls.mjs" "$SRC"

echo "→ Validating plugin manifest"
claude plugin validate "$SRC"

echo "→ Self-testing the eval harness"
node "$ROOT/evals/self-test.mjs" > /dev/null && echo "  harness ok"

VERSION=$(node -e "console.log(require('$SRC/.claude-plugin/plugin.json').version)")
echo "→ Packaging seal-copilot v$VERSION"
rm -f "$OUT"
( cd "$SRC" && zip -r -q -X "$OUT" . -x '.DS_Store' -x '**/.DS_Store' )
echo "→ Wrote $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') entries)"
