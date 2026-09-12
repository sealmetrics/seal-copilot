#!/usr/bin/env bash
# Every gate that does not need a model or an API key. Safe for CI.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "→ No skill state inside the plugin"
STRAY=$(find "$ROOT/seal-copilot" "$ROOT/seal-install" -type d \( -name state -o -name .state \) 2>/dev/null)
if [ -n "$STRAY" ]; then
  echo "  A skill wrote its state inside the plugin, which then ships in the bundle:"
  echo "$STRAY" | sed 's/^/    /'
  echo "  Delete it, and fix the skill that resolved <state-dir> to a relative path."
  exit 1
fi
echo "  clean"

echo "→ Tool-call linter";        node "$ROOT/evals/lint-tool-calls.mjs" "$ROOT/seal-copilot"
echo "→ Tool-call linter (seal-install)"; node "$ROOT/evals/lint-tool-calls.mjs" "$ROOT/seal-install"
echo "→ Fixture arithmetic";      node "$ROOT/evals/fixtures/_check-coherence.mjs" | tail -1
echo "→ Eval harness self-test";  node "$ROOT/evals/self-test.mjs" | tail -1
echo "→ Assertions vs golden outputs"; node "$ROOT/evals/check-assertion-contradictions.mjs" | tail -1
echo "→ Plugin manifests";        claude plugin validate "$ROOT/seal-copilot" | tail -1
                             claude plugin validate "$ROOT/seal-install" | tail -1
echo "→ Surface exports"; node "$ROOT/scripts/export-surfaces.mjs" | sed 's/^/  /'

# The Codex marketplace is generated but committed, because a remote marketplace
# *is* a git repository: what is not committed does not install. The export just
# rewrote it, so anything git reports here is drift between the skills and what
# a Codex user would get.
echo "→ Codex tree matches the skills"
DRIFT=$(cd "$ROOT" && git status --porcelain -- .agents plugins)
if [ -n "$DRIFT" ]; then
  echo "  The export changed the committed Codex tree:"
  echo "$DRIFT" | sed 's/^/    /'
  echo "  Commit it, or Codex installs skills older than the plugin."
  exit 1
fi
echo "  in sync"
if [ "${1:-}" = "--online" ]; then
  echo "→ MCP schema drift"; node "$ROOT/evals/check-schema-drift.mjs"
fi
echo "✔ all offline checks passed${1:+ (plus online checks)}"
