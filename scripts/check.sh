#!/usr/bin/env bash
# Every gate that does not need a model or an API key. Safe for CI.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "→ Tool-call linter";        node "$ROOT/evals/lint-tool-calls.mjs" "$ROOT/seal-copilot"
echo "→ Fixture arithmetic";      node "$ROOT/evals/fixtures/_check-coherence.mjs" | tail -1
echo "→ Eval harness self-test";  node "$ROOT/evals/self-test.mjs" | tail -1
echo "→ Plugin manifest";         claude plugin validate "$ROOT/seal-copilot" | tail -1
if [ "${1:-}" = "--online" ]; then
  echo "→ MCP schema drift"; node "$ROOT/evals/check-schema-drift.mjs"
fi
echo "✔ all offline checks passed${1:+ (plus online checks)}"
