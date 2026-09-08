#!/usr/bin/env node
// The PRD sets success metrics — budget compliance, recommendations verified —
// with nothing to measure them. This reads the local state directory and
// reports them.
//
// It sends nothing anywhere. Everything stays on this machine; publishing any
// of it is the user's decision, not the plugin's.
//
//   node scripts/usage-report.mjs [--dir <state dir>]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const root = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1]
  : (process.env.SEAL_COPILOT_STATE_DIR || join(homedir(), '.seal-copilot'));

if (!existsSync(root)) {
  console.log(`No state directory at ${root} — nothing has run yet, or state was not writable.`);
  process.exit(0);
}

const lines = (p) => existsSync(p)
  ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

const sites = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
if (!sites.length) { console.log(`No sites under ${root}.`); process.exit(0); }

console.log(`Seal Copilot usage · ${root}\n`);
let allRuns = [], allRecs = [];

for (const site of sites) {
  const dir = join(root, site);
  const runs = lines(join(dir, 'runs.jsonl'));
  const recs = lines(join(dir, 'recommendations.jsonl'));
  allRuns = allRuns.concat(runs); allRecs = allRecs.concat(recs);

  let profile = {};
  try { profile = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')); } catch {}
  console.log(`${site}${profile.site_name ? ` (${profile.site_name})` : ''}` +
              `${profile.vertical ? ` · ${profile.vertical}` : ''} — ${runs.length} run(s), ${recs.length} recommendation(s)`);
}

if (allRuns.length) {
  const bySkill = {};
  for (const r of allRuns) {
    const s = bySkill[r.skill] ||= { n: 0, calls: 0, over: 0 };
    s.n++; s.calls += r.calls || 0;
    if (r.budget && r.calls > r.budget) s.over++;
  }
  console.log('\nSkill usage — how often each runs, and whether it respects its budget:\n');
  console.log('  skill                    runs   avg calls   over budget');
  for (const [skill, s] of Object.entries(bySkill).sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${skill.padEnd(24)} ${String(s.n).padStart(4)}   ${(s.calls / s.n).toFixed(1).padStart(9)}   ${String(s.over).padStart(11)}`);
  const over = allRuns.filter(r => r.budget && r.calls > r.budget).length;
  console.log(`\n  Budget compliance: ${(100 * (1 - over / allRuns.length)).toFixed(0)}% (PRD target ≥95%)`);
}

if (allRecs.length) {
  const by = (s) => allRecs.filter(r => r.status === s).length;
  const closed = by('verified') + by('failed');
  console.log(`\nRecommendation ledger — the measure of whether advice actually worked:\n`);
  console.log(`  open ${by('open')} · verified ${by('verified')} · failed ${by('failed')} · discarded ${by('discarded')}`);
  if (closed) console.log(`  Verified share of closed: ${(100 * by('verified') / closed).toFixed(0)}% (PRD target ≥60%)`);
  const due = allRecs.filter(r => r.status === 'open' && r.verify_on && r.verify_on <= new Date().toISOString().slice(0, 10));
  if (due.length) console.log(`  ${due.length} due for verification now: ${due.slice(0, 5).map(r => r.subject).join(', ')}`);
  const impact = allRecs.filter(r => r.status === 'verified').reduce((s, r) => s + (r.impact_eur_month || 0), 0);
  if (impact) console.log(`  Estimated monthly impact of verified recommendations: €${impact.toLocaleString()}`);
} else {
  console.log('\nNo recommendations logged yet. Run a health check or an opportunity scan.');
}
