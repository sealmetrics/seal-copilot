#!/usr/bin/env node
// SessionStart: tell the model up front whether Sealmetrics is usable, and
// what it already knows about this user's sites, so no skill wastes calls
// rediscovering it or fails halfway through for a missing credential.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// The connector is the remote Sealmetrics server and it authenticates over
// OAuth, so there is no credential in the environment to check any more. What
// the hook can still do is spare the model a wall of failed calls: an
// unauthenticated session shows up as a tool error on the first call, and the
// remedy is a browser login, not a token to paste.
const lines = [
  'Seal Copilot is installed. Its data comes from the Sealmetrics connector,',
  'which each user authorises with their own Sealmetrics account.',
  'If a Sealmetrics tool fails with an authentication or authorisation error,',
  'stop calling them and tell the user to open the /mcp panel and authenticate',
  'the sealmetrics server. Never retry the call, and never guess the numbers.',
  '',
  'Before planning any analysis, settle which connector you are on by looking',
  'at the tool list you were given — it costs no call. The remote OAuth',
  "connector withholds twenty tools — the account's own dashboard alert rules,",
  'webhooks, saved segments, channel rules and event verification. Steps',
  'marked (local only) in a skill are skipped there and named once in the report.',
  "This plugin's own alerts (create-alert, check-alerts) are a different thing:",
  'they use none of those tools and work on every connector. Never refuse them.',
  'Installing tracking is the separate seal-install plugin, not this one.',
  'Sealmetrics gives no bot data: never call get_bot_stats or',
  'get_suspicious_sessions, and never attribute traffic to bots.',
];
{
  const stateRoot = process.env.SEAL_COPILOT_STATE_DIR || join(homedir(), '.seal-copilot');
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
            `currency=${p.currency ?? '?'}, connector=${p.connector ?? 'unknown'}, ` +
            `product_id=${p.product_identifier?.key ?? 'none'}` +
            (age === null ? '' : `, cached ${age}d ago${age > 7 ? ' (STALE — refresh discovery)' : ''}`));
          // What is watching this site between reports. Cheap to read, and a
          // site with no rule is a finding the weekly report should carry.
          try {
            const a = JSON.parse(readFileSync(join(stateRoot, s, 'alerts.json'), 'utf8'));
            const active = (a.rules || []).filter(r => r.status === 'active');
            lines.push(`  alerts for ${s}: ${active.length} active` +
              (active.length ? ` (${active.map(r => r.id).join(', ')})` : ' — nothing is watching this site'));
          } catch { /* no alerts file yet; create-alert writes it */ }
        } catch { lines.push(`Cached state for ${s} exists but has no readable profile.json.`); }
      }
    }
  } catch { /* state is optional; never block the session on it */ }
}
const ctx = lines.join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
}));
