#!/usr/bin/env bash
# Install the Codex export into this machine's Codex.
#
# The generated marketplace lives under dist/, which the exporter deletes and
# rewrites on every run, so it is copied to a stable path first — pointing Codex
# at dist/ would break it the next time anyone regenerates.
#
# Idempotent: re-running refreshes the marketplace and leaves config.toml alone
# if the blocks are already there.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/dist/codex/marketplace"
DEST="$HOME/.codex/marketplaces/sealmetrics"
CONFIG="$HOME/.codex/config.toml"

[ -d "$SRC" ] || { echo "Run scripts/export-surfaces.mjs first."; exit 1; }
[ -f "$CONFIG" ] || { echo "No Codex config at $CONFIG — is Codex installed?"; exit 1; }

cp "$CONFIG" "$CONFIG.bak-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "→ Marketplace at $DEST"

add_block() {          # add_block <grep-pattern> <toml>
  if grep -q "$1" "$CONFIG"; then
    echo "→ Already present: $1"
  else
    printf '\n%s\n' "$2" >> "$CONFIG"
    echo "→ Added: $1"
  fi
}

add_block 'marketplaces.sealmetrics' "$(printf '[marketplaces.sealmetrics]\nsource_type = "local"\nsource = "%s"' "$DEST")"
add_block 'seal-copilot@sealmetrics' '[plugins."seal-copilot@sealmetrics"]
enabled = true'
add_block 'mcp_servers.sealmetrics_mcp' '[mcp_servers.sealmetrics_mcp]
url = "https://mcp.sealmetrics.com/mcp"'

python3 - "$CONFIG" <<'PY'
import sys, tomllib
try:
    tomllib.load(open(sys.argv[1], "rb"))
except Exception as e:
    print(f"config.toml no longer parses: {e}\nRestore the newest .bak beside it.")
    sys.exit(1)
print("→ config.toml still parses")
PY
echo "✔ Installed. Restart Codex to pick it up."
