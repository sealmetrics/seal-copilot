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
  "connector announces 42 of the 64 tools — it withholds the account's own",
  'dashboard alert rules, webhooks and saved segments, and every setup and',
  'channel-rule-write tool. Reading and testing channel rules does work. Steps',
  'marked (local only) in a skill are skipped there and named once in the report.',
  "This plugin's own alerts (create-alert, check-alerts) are a different thing:",
  'they use none of those tools and work on every connector. Never refuse them.',
  'Installing tracking is the separate seal-install plugin, not this one.',
  'Sealmetrics gives no bot data: never call get_bot_stats or',
  'get_suspicious_sessions, and never attribute traffic to bots.',
  '',
  // The run protocol, in the form a model needs before its first tool call.
  // The full text is skills/seal-copilot/references/run-protocol.md; this is
  // here so the rules are in context without costing a Read, and because four
  // of them used to be copied into fifteen skills to achieve the same thing.
  'Every skill in this plugin follows the same protocol:',
  '1. Emit no text until the answer. The first action is a tool call, not a',
  '   sentence, and nothing is said between tool calls. The answer is the only',
  '   message, and no tool call follows it.',
  '2. Resolve the site with list_sites before any call that takes a site_id.',
  '   Cached state under <state-dir>/<site_id>/ applies only if that site_id is',
  '   in the list; freshness proves nothing about which account connected.',
  '3. Write state with Read and Write, never a shell, and write each file whole.',
  '   The schemas in hooks/schemas/ are the contract and a hook enforces them:',
  '   a write that does not match is refused with the fields to fix. Anything',
  '   the schema does not name goes under "extra".',
  '4. Log the run in runs.jsonl before the answer, never after it.',
  '5. Any arithmetic beyond one operation goes through',
  '   skills/seal-copilot/scripts/calc.mjs. Without a shell, do it yourself and',
  '   say in the answer that it was done without the calculator.',
  'Full text: skills/seal-copilot/references/run-protocol.md.',
];
{
  const stateRoot = process.env.SEAL_COPILOT_STATE_DIR || join(homedir(), '.seal-copilot');
  if (process.env.SEALMETRICS_SITE_ID) lines.push(`Default site: ${process.env.SEALMETRICS_SITE_ID}.`);
  // SEAL_COPILOT_NO_STATE imitates a surface with no filesystem (Claude on the
  // web), where memory has to travel in the conversation instead. Without it
  // there is no way to exercise the seal-state fallback.
  if (process.env.SEAL_COPILOT_NO_STATE) {
    lines.push('No state directory on this surface: nothing persists between conversations.',
      'Close the answer with a fenced seal-state block (profile + open ledger entries,',
      '≤25 lines) and say that pasting it back next time is what lets the next report',
      'follow up. If the prompt already carries one, use it as the starting state.');
  } else {
    lines.push(`State directory: ${stateRoot}`);
  }
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
            // A bare array is what a run wrote before the schema was spelled out.
            const active = (Array.isArray(a) ? a : (a.rules || [])).filter(r => r.status === 'active');
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
