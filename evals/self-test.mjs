#!/usr/bin/env node
// Verifies the eval harness itself, with no model in the loop:
//  1. every fixture loads and answers the calls its case declares
//  2. the mock rejects invalid parameters over real JSON-RPC
//  3. the assertion logic passes what it should and fails what it should
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assess, GLOBAL_MUST_NOT_CALL, GLOBAL_MUST_NOT_MATCH } from './assess.mjs';
import { validate, validateFile } from '../seal-copilot/hooks/scripts/lib/validate.mjs';
import { readdirSync as _rd, readFileSync as _rf } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const cases = (await import(join(here, 'cases.mjs'))).default;
let fails = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ' — ' + detail}`);
  if (!cond) fails++;
};

import { execFileSync } from 'node:child_process';

console.log('fixture arithmetic');
try {
  execFileSync(process.execPath, [join(here, 'fixtures', '_check-coherence.mjs')], { stdio: 'pipe' });
  ok('all fixture windows reconcile', true);
} catch (e) {
  ok('all fixture windows reconcile', false, String(e.stdout || e).slice(0, 400));
}

// A regex carrying a control character matches nothing and says nothing about
// it. Four of them reached cases.mjs when a \b meant for a word boundary was
// written through a language that reads it as backspace: /traffic is the
// problem/i stopped matching "Traffic is the problem" and the case went quietly
// green. Source files hold no control characters but newline and tab.
console.log('\neval sources are free of control characters');
for (const f of ['cases.mjs', 'assess.mjs', 'run-evals.mjs', 'stream.mjs']) {
  const text = readFileSync(join(here, f), 'utf8');
  const bad = [...new Set([...text].filter(ch => ch.charCodeAt(0) < 32 && ch !== '\n' && ch !== '\t'))];
  ok(`${f} has none`, bad.length === 0,
     bad.map(c => 'U+' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(' '));
}

console.log('\nfixtures serve their cases');
for (const c of cases) {
  const mod = await import(pathToFileURL(join(here, 'fixtures', `${c.fixture}.mjs`)).href);
  ok(`${c.fixture} loads with meta`, !!mod.meta?.name);
  for (const t of c.mustCall || []) {
    const h = mod.tools[t];
    let served = h !== undefined;
    if (typeof h === 'function') { try { h({ period: '30d' }); } catch (e) { served = false; } }
    ok(`${c.fixture} serves ${t}`, served, 'fixture has no handler or it threw');
  }
}

console.log('\nmock server over JSON-RPC');
const rpc = (fixture, calls, env = {}) => new Promise((resolve) => {
  const p = spawn('node', [join(here, 'mock-server', 'server.mjs')], { env: { ...process.env, SEAL_FIXTURE: fixture, ...env } });
  const out = [];
  let buf = '';
  p.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      if (l.trim()) out.push(JSON.parse(l));
      if (out.length === calls.length + 1) { p.kill(); resolve(out.slice(1)); }
    }
  });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
  calls.forEach((c, i) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: c }) + '\n'));
  setTimeout(() => { p.kill(); resolve(out.slice(1)); }, 8000);
});

const r = await rpc('ecommerce-healthy', [
  { name: 'get_overview', arguments: { period: '30d', compare: 'previous' } },
  { name: 'get_channels', arguments: { period: '7d', compare: 'previous' } },
  { name: 'get_microconversions', arguments: { type: 'add_to_cart' } },
  { name: 'get_microconversions', arguments: { conversion_type: 'add_to_cart', period: '7d' } },
  { name: 'get_microconversions', arguments: { period: 'last_28_days' } },
]);
ok('valid call succeeds', !!r[0]?.result);
ok('get_channels(compare) is rejected', /Invalid parameter/.test(r[1]?.error?.message || ''), JSON.stringify(r[1]));
ok('get_microconversions(type) is rejected', /Invalid parameter/.test(r[2]?.error?.message || ''), JSON.stringify(r[2]));
ok('get_microconversions(conversion_type) succeeds', !!r[3]?.result);
ok('period=last_28_days is rejected', /Invalid value/.test(r[4]?.error?.message || ''), JSON.stringify(r[4]));

console.log('\nstream-json parsing');
{
  const { parseStream } = await import('./stream.mjs');
  const ev = (o) => JSON.stringify(o);
  const stream = [
    ev({ type: 'assistant', message: { content: [{ type: 'text', text: '✅ On track — nothing needs action.' }] } }),
    ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write' }] } }),
    ev({ type: 'assistant', message: { content: [{ type: 'text', text: 'Site profile cached.' }] } }),
    ev({ type: 'result', result: 'Site profile cached.', is_error: false }),
  ].join('\n');
  const r = parseStream(stream);
  ok('captures the report, not only the final turn', /On track/.test(r.text) && /cached/.test(r.text));
  ok('surfaces CLI errors', parseStream(ev({ type: 'result', result: 'Not logged in', is_error: true })).isError);
  ok('plain output passes through', parseStream('hello').text === 'hello');
  // A missing sawResult reads as undefined -> truncated -> every attempt
  // retried, which hides real failures. Assert both polarities.
  ok('a completed stream reports sawResult', parseStream(stream).sawResult === true);
  ok('a cut-off stream reports !sawResult',
     parseStream(ev({ type: 'assistant', message: { content: [{ type: 'text', text: 'half' }] } })).sawResult === false);
  ok('plain output is not treated as truncated', parseStream('hello').sawResult === true);
  ok('counts the assistant text blocks', parseStream(stream).textBlocks === 2, String(parseStream(stream).textBlocks));
}

console.log('\nassertion logic');
const c = { mustMatch: [/on track/i], mustNotMatch: [/🔴/], mustCall: ['get_overview'],
            mustNotCall: ['get_channels'], maxCalls: 3 };
const good = [{ tool: 'get_overview' }, { tool: 'get_campaigns' }];
ok('clean case passes', assess(c, 'Verdict: on track.', good).length === 0);
ok('missing phrase fails', assess(c, 'All good.', good).some(f => f.startsWith('missing')));
ok('forbidden phrase fails', assess(c, 'on track 🔴', good).some(f => f.startsWith('forbidden')));
ok('uncalled required tool fails', assess(c, 'on track', [{ tool: 'get_campaigns' }]).some(f => f.includes('never called')));
ok('forbidden tool fails', assess(c, 'on track', [...good, { tool: 'get_channels' }]).some(f => f.includes('should not')));
ok('over budget fails', assess(c, 'on track', [...good, { tool: 'a' }, { tool: 'b' }]).some(f => f.includes('budget')));
ok('rejected call fails', assess(c, 'on track', [...good, { tool: 'x', rejected: 'bad param' }]).some(f => f.includes('invalid call')));
ok('allowRejected tolerates rejections', assess({ ...c, allowRejected: true }, 'on track', [...good, { tool: 'x', rejected: 'bad' }]).length === 0);
ok('empty answer fails', assess(c, '   ', good).some(f => f.includes('empty')));


// The connector a user actually has announces forty-two tools, not sixty-two.
// A mock that always served all of them could never catch a skill planning a
// step around a tool the connector withheld — the whole of E14.
console.log('\ntransport gating');
{
  const list = (env) => new Promise((resolve) => {
    const p = spawn('node', [join(here, 'mock-server', 'server.mjs')],
      { env: { ...process.env, SEAL_FIXTURE: 'ecommerce-healthy', ...env } });
    let buf = '', out = [];
    p.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        if (l.trim()) out.push(JSON.parse(l));
        if (out.length === 2) { p.kill(); resolve(out[1].result.tools.map(t => t.name)); }
      }
    });
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
    setTimeout(() => { p.kill(); resolve([]); }, 8000);
  });
  const localTools = await list({ SEAL_TRANSPORT: 'local' });
  const remoteTools = await list({ SEAL_TRANSPORT: 'remote' });
  ok('local announces every tool in the schema', localTools.length === 62, `${localTools.length}`);
  ok('remote withholds the twenty gated tools', remoteTools.length === 42, `${remoteTools.length}`);
  ok('remote still offers the replacement', remoteTools.includes('get_top_channels'));
  ok('remote hides list_alerts', !remoteTools.includes('list_alerts'));
  const r = await rpc('ecommerce-healthy', [{ name: 'list_alerts', arguments: {} }], { SEAL_TRANSPORT: 'remote' });
  ok('calling a withheld tool fails like an unknown one', /Unknown tool/.test(r[0]?.error?.message || ''), JSON.stringify(r[0]));
}

console.log('\nglobal bans and answer length');
{
  const base = { mustMatch: [], mustCall: [] };
  ok('get_marketing_playbook fails every case', assess(base, 'ok', [{ tool: 'get_marketing_playbook' }]).some(f => /no skill may ever call/.test(f)));
  // get_channels was banned here until 2026-09-17 because the methodology said
  // it 403s for every modern key. The channel-groups router accepts sites:read,
  // so the ban asserted something false and this check kept it alive. It is a
  // preference now (get_top_channels is compact), enforced by the linter's
  // prefer-alternative rule, not by a global ban on calling it.
  ok('get_channels is not globally banned', !GLOBAL_MUST_NOT_CALL.includes('get_channels'));
  ok('calling get_channels is not a global failure', assess(base, 'ok', [{ tool: 'get_channels' }]).length === 0);
  ok('the ban list is the one the linter reads', GLOBAL_MUST_NOT_CALL.includes('get_marketing_playbook'));
  ok('a zero call budget is enforced', assess({ ...base, maxCalls: 0 }, 'ok', [{ tool: 'get_overview' }]).some(f => /budget/.test(f)));
  ok('an over-long healthy answer fails', assess({ ...base, maxAnswerChars: 40 }, 'x'.repeat(80), []).some(f => /cap 40/.test(f)));
  ok('a short answer passes the cap', assess({ ...base, maxAnswerChars: 40 }, 'ok', []).length === 0);
  // No bot data, enforced on every case: calls and figures both.
  ok('calling get_bot_stats fails every case', assess(base, 'ok', [{ tool: 'get_bot_stats' }]).some(f => /no skill may ever call/.test(f)));
  ok('a bot figure fails every case', assess(base, 'Bot share is 7%, unchanged.', []).some(f => /bot figure/.test(f)));
  ok('a bot figure in a table cell fails', assess(base, '| Bots | 41% |', []).some(f => /bot figure/.test(f)));
  ok('saying there is no bot data passes', assess(base, 'Sealmetrics does not give bot data.', []).length === 0);
  ok('a referrer described by what it did passes',
     assess(base, 'cheap-traffic.example sent 21,900 entrances at 95% bounce and 5 conversions.', []).length === 0);
  ok('there is exactly one global text ban', GLOBAL_MUST_NOT_MATCH.length === 1);
  // Process narration, caught by structure rather than by wording.
  ok('narrating between tool calls fails', assess({ ...base, maxTextBlocks: 1 }, 'ok', [], 3).some(f => /narrated between tool calls/.test(f)));
  ok('a single report block passes', assess({ ...base, maxTextBlocks: 1 }, 'ok', [], 1).length === 0);
  ok('cases without the cap are unaffected', assess(base, 'ok', [], 5).length === 0);
}

// ---- the state contract. Prose held it until 2026-09-17, and in certification
// 9 twelve skills wrote twelve different profiles with the suite green. These
// checks are on the validator the PreToolUse hook and the runner both use.
console.log('\nstate contract');
{
  const dir = new URL('../seal-copilot/hooks/schemas/', import.meta.url);
  const schemas = Object.fromEntries(_rd(dir).map((f) => [f, JSON.parse(_rf(new URL(f, dir), 'utf8'))]));
  const errs = (file, obj) => validateFile(file, typeof obj === 'string' ? obj : JSON.stringify(obj), schemas).errors;

  const goodProfile = {
    site_id: 'acct_demo', site_name: 'demo-store.com', connector: 'remote',
    timezone: 'Europe/Madrid', currency: 'EUR', vertical: 'ecommerce',
    events: { purchase: 'purchase', add_to_cart: 'add_to_cart' },
    product_identifier: { key: 'sku', table: 'conversion_items' },
    discovery_cached_at: '2026-09-17',
  };
  ok('a contract-shaped profile passes', errs('profile.json', goodProfile).length === 0);

  // The exact shape certification 9 wrote, twelve times out of twelve.
  const cert9 = { site_id: 'acct_demo', name: 'demo-store.com', domains: ['demo-store.com'],
    timezone: 'Europe/Madrid', currency: 'EUR', connector: 'remote-oauth', vertical: 'ecommerce',
    event_names: [], discovery_cached_at: '2026-09-13' };
  const c9 = errs('profile.json', cert9);
  ok('the profile certification 9 wrote is rejected', c9.length > 0);
  ok('the error names site_name, not just "unknown field"', c9.some((e) => /write site_name instead/.test(e)));
  ok('connector "remote-oauth" is rejected', c9.some((e) => /connector must be one of/.test(e)));
  ok('event_names is pointed at events', c9.some((e) => /write events instead/.test(e)));

  ok('a profile with no discovery_cached_at is rejected',
     errs('profile.json', { ...goodProfile, discovery_cached_at: undefined }).some((e) => /discovery_cached_at is required/.test(e)));
  ok('a date where a timestamp belongs is rejected',
     errs('runs.jsonl', { ts: '2026-09-08', skill: 'x', calls: 1, budget: 8, verdict: 'watch', scheduled: false, notes: 'n' })
       .some((e) => /ts does not look right/.test(e)));
  ok('calls_used is pointed at calls',
     errs('runs.jsonl', { ts: '2026-09-08T00:00:00Z', skill: 'x', calls_used: 9, budget: 10, verdict: 'watch', scheduled: false, notes: 'n' })
       .some((e) => /write calls instead/.test(e)));
  ok('an audit score is a valid verdict',
     errs('runs.jsonl', { ts: '2026-09-08T00:00:00Z', skill: 'setup-audit', calls: 9, budget: 10, verdict: '3/10', scheduled: false, notes: 'n' }).length === 0);
  ok('free text is not a valid verdict',
     errs('runs.jsonl', { ts: '2026-09-08T00:00:00Z', skill: 'x', calls: 1, budget: 8, verdict: 'pixel live', scheduled: false, notes: 'n' })
       .some((e) => /verdict must be one of/.test(e)));

  ok('alerts.json as a bare array is rejected',
     errs('alerts.json', [{ id: 'x' }]).some((e) => /must be object/.test(e)));
  const dropNoExpected = { site_id: 's', rules: [{ id: 'd', family: 'drop', metric: { kind: 'microconversion', type: 'add_to_cart' },
    condition: { ratio: 0.5 }, timezone: 'Europe/Madrid', created_at: '2026-09-17', status: 'active', expected: null }] };
  const dn = errs('alerts.json', dropNoExpected);
  ok('a drop rule without active_hours is rejected', dn.some((e) => /active_hours is required when/.test(e)));
  ok('a drop rule with expected null is rejected', dn.some((e) => /expected must be filled in/.test(e)));
  ok('a threshold rule needs no active_hours',
     errs('alerts.json', { site_id: 's', rules: [{ id: 't', family: 'threshold', metric: { kind: 'revenue' },
       condition: { below: 2000 }, timezone: 'Europe/Madrid', created_at: '2026-09-17', status: 'active' }] }).length === 0);

  ok('impact_eur_month is pointed at impact_month',
     errs('recommendations.jsonl', { id: 'a', date: '2026-09-17', skill: 's', pattern: 'p', subject: 'x',
       evidence: 'e', action: 'a', impact_eur_month: 1840, metric: 'cr', baseline: 0.008, target: 0.021,
       verify_on: '2026-10-05', status: 'open' }).some((e) => /write impact_month instead/.test(e)));
  ok('a ledger entry must name its currency',
     errs('recommendations.jsonl', { id: 'a', date: '2026-09-17', skill: 's', pattern: 'p', subject: 'x',
       evidence: 'e', action: 'a', impact_month: 1840, metric: 'cr', baseline: 0.008, target: 0.021,
       verify_on: '2026-10-05', status: 'open' }).some((e) => /currency is required/.test(e)));

  ok('a bad jsonl line names its number',
     errs('runs.jsonl', '{"ts":"2026-09-08T00:00:00Z","skill":"a","calls":1,"budget":8,"verdict":"watch","scheduled":false,"notes":"n"}\n{oops}')
       .some((e) => /^line 2/.test(e)));
  ok('an unknown state file is left alone', validateFile('property-map.md', '# map', schemas).known === false);
  ok('every schema is valid JSON with a title', Object.values(schemas).every((x) => typeof x.title === 'string'));
  // anyOf must report the closest branch, not every alternative.
  ok('anyOf reports one branch', validate('nope', { anyOf: [{ enum: ['a'] }, { type: 'number' }] }, 'f').length === 1);
}

console.log(`\n${fails === 0 ? 'harness self-test passed' : fails + ' harness check(s) FAILED'}`);
process.exit(fails ? 1 : 0);
