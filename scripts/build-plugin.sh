#!/usr/bin/env bash
# Rebuilds the .plugin bundles from the source tree.
# Refuses to package if the tool-call linter finds an invalid MCP call.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ Self-testing the eval harness"
node "$ROOT/evals/self-test.mjs" > /dev/null && echo "  harness ok"

# Both plugins ship: the analyst, and the installer that carries the local
# connector. Cowork takes one bundle at a time, so it needs both files.
for PLUGIN in seal-copilot seal-install; do
  SRC="$ROOT/$PLUGIN"
  OUT="$ROOT/$PLUGIN.plugin"
  [ -d "$SRC" ] || continue

  echo "→ Linting tool calls in $PLUGIN against evals/mcp-schema.json"
  node "$ROOT/evals/lint-tool-calls.mjs" "$SRC"

  echo "→ Validating $PLUGIN manifest"
  claude plugin validate "$SRC"

  VERSION=$(node -e "console.log(require('$SRC/.claude-plugin/plugin.json').version)")
  echo "→ Packaging $PLUGIN v$VERSION"
  rm -f "$OUT"
  ( cd "$SRC" && zip -r -q -X "$OUT" . -x '.DS_Store' -x '**/.DS_Store' )
  echo "  wrote $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') entries)"
done
