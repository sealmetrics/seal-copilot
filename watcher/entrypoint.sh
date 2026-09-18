#!/bin/sh
# Railway mounts the volume owned by root; the watcher runs as `node`. Hand the
# state directory to `node` while we still have the privilege, then drop it and
# run unprivileged.
#
# Confirmed in production on 2026-09-18, not guessed: with USER node the service
# logged `EACCES: permission denied, open '/data/incidents.json'`. Until the
# store was hardened that failure was silent, so every redeploy re-notified an
# incident that was still open.
set -e

if [ -n "$SEAL_STATE_PATH" ]; then
  dir=$(dirname "$SEAL_STATE_PATH")
  mkdir -p "$dir" 2>/dev/null || true
  chown -R node:node "$dir" 2>/dev/null \
    || echo "WARNING: could not take ownership of $dir; the watcher will report what it can actually write"
fi

exec su-exec node "$@"
