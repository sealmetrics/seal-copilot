#!/usr/bin/env node
/**
 * Replay a rule against a site's real history before trusting it.
 *
 *   SEAL_TOKEN=sm_… node watcher/preview.mjs <site_id> [days] < rule.json
 *
 * `create-alert` already refuses a rule that a Poisson estimate says would fire
 * more than once a month. This is the same question answered from the site's own
 * events: not "about three false alarms a month" but "it would have fired on the
 * 4th, the 9th and the 11th".
 *
 * Read-only. It calls the same `/stats/` endpoints the watcher does.
 */
import { client } from './lib/api.mjs';
import { backtest } from './lib/backtest.mjs';
import { validate } from '../seal-copilot/hooks/scripts/lib/validate.mjs';
import { ruleSchema } from './watch.mjs';

const die = (m) => { console.error(m); process.exit(1); };
const [siteId, daysArg] = process.argv.slice(2);
if (!siteId) die('Which site? SEAL_TOKEN=sm_… node watcher/preview.mjs <site_id> [days] < rule.json');

// The raw endpoints cap a range at 31 days, so asking for more would silently
// return less.
const days = Math.min(31, Math.max(1, Number(daysArg || 14)));
const token = process.env.SEAL_TOKEN || process.env[`SEAL_TOKEN_${siteId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
if (!token) die('No token. Set SEAL_TOKEN to the site\'s Sealmetrics API token.');

let raw = '';
if (process.stdin.isTTY) die('Pipe the rule JSON in: node watcher/preview.mjs <site_id> < rule.json');
for await (const c of process.stdin) raw += c;
let rule;
try { rule = JSON.parse(raw); } catch (e) { die(`stdin is not valid JSON: ${e.message}`); }
const errs = validate(rule, ruleSchema(), rule.id || 'rule');
if (errs.length) die('That is not a usable rule:\n' + errs.map((e) => '  · ' + e).join('\n'));

const api = client({ token, siteId });
const to = new Date();
const from = new Date(to.getTime() - days * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

// One page at a time, and honest when the history is longer than the cap: a
// truncated sample makes a rule look quieter than it is, which is the one
// direction that must never pass silently.
const PAGE_CAP = 40;
const events = [];
let truncated = false;
const kind = rule.metric.kind;
if (kind !== 'conversion' && kind !== 'microconversion') {
  die(`A ${kind} rule cannot be replayed from events: revenue and entrances have no per-event endpoint. ` +
      'Preview covers conversion and microconversion rules.');
}
const path = kind === 'microconversion' ? 'microconversions' : 'conversions';

process.stderr.write(`Reading ${days} days of ${rule.metric.type} for ${siteId}…\n`);
for (let page = 1; page <= PAGE_CAP; page++) {
  let rows;
  try {
    rows = await api.rawPage(path, { start_date: iso(from), end_date: iso(to), conversion_type: rule.metric.type, page });
  } catch (e) { die(`Reading history failed: ${e.message}`); }
  if (!rows.length) break;
  for (const r of rows) {
    const ts = r.timestamp_utc || r.timestamp_local;
    if (ts) events.push(/Z$|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + 'Z');
  }
  if (rows.length < 100) break;
  if (page === PAGE_CAP) truncated = true;
}

const result = backtest(rule, events, { from: from.toISOString(), to: to.toISOString() });
if (!result.replayable) die(`Cannot replay: ${result.reason}`);

console.log(JSON.stringify({ ...result, sample_truncated: truncated }, null, 2));
if (truncated) {
  process.stderr.write(`\nWARNING: stopped at ${PAGE_CAP} pages, so this is a partial sample and the\n` +
    'incident count is a floor, not a total. Narrow the window with fewer days.\n');
}
process.stderr.write(`\n${result.incidents} incident(s) in ${result.window.days} days ` +
  `(${result.incidents_per_month} a month, on ${result.days_with_incidents} distinct day(s)).\n` +
  `${result.reading}\n`);
// Always zero on a successful replay. Whether the rule is worth activating
// depends on whether those dates were real problems, and only a human knows
// that — an exit code would be pretending otherwise.
process.exit(0);
