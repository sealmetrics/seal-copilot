#!/usr/bin/env node
// SessionStart: tell the model up front whether Sealmetrics is usable, and
// what it already knows about this user's sites, so no skill wastes calls
// rediscovering it or fails halfway through for a missing credential.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

let ctx;
const key = process.env.SEALMETRICS_API_KEY;

if (!key) {
  ctx = [
    'Seal Copilot is installed but SEALMETRICS_API_KEY is not set, so no Sealmetrics',
    'tool can succeed. Do not call them and do not retry. If the user asks for any',
    'analytics work, give them these steps instead:',
    '  1. Open my.sealmetrics.com → Settings → API Tokens and generate a token (starts with sm_).',
    '  2. Export SEALMETRICS_API_KEY with that value, and optionally SEALMETRICS_SITE_ID.',
    '  3. Restart the session.',
  ].join('\n');
} else {
  const stateRoot = process.env.SEAL_COPILOT_STATE_DIR || join(homedir(), '.seal-copilot');
  const lines = ['Seal Copilot is configured (SEALMETRICS_API_KEY is set).'];
  if (process.env.SEALMETRICS_SITE_ID) lines.push(`Default site: ${process.env.SEALMETRICS_SITE_ID}.`);
  lines.push(`State directory: ${stateRoot}`);
  try {
    const sites = existsSync(stateRoot)
      ? readdirSync(stateRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      : [];
    if (!sites.length) {
      lines.push('No cached site profile yet — the first analysis should run discovery and write one.');
    } else {
      for (const s of sites) {
        try {
          const p = JSON.parse(readFileSync(join(stateRoot, s, 'profile.json'), 'utf8'));
          const age = p.discovery_cached_at
            ? Math.floor((Date.now() - Date.parse(p.discovery_cached_at)) / 86400000) : null;
          lines.push(`Cached profile ${s}: vertical=${p.vertical ?? '?'}, tz=${p.timezone ?? '?'}, ` +
            `product_id=${p.product_identifier?.key ?? 'none'}, agent_analytics=${p.agent_analytics_enabled}` +
            (age === null ? '' : `, cached ${age}d ago${age > 7 ? ' (STALE — refresh discovery)' : ''}`));
        } catch { lines.push(`Cached state for ${s} exists but has no readable profile.json.`); }
      }
    }
  } catch { /* state is optional; never block the session on it */ }
  ctx = lines.join('\n');
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
}));
