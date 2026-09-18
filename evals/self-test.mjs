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
import { fidelity } from './fidelity.mjs';
import { assessShell } from './assess.mjs';
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
const planCalls = [{ tool: 'plan_install', args: { events: [{ name: 'product_view' }] } }, { tool: 'plan_install', args: { events: [{ name: 'view_item' }] } }];
const argsSpec = { callArgs: [{ tool: 'plan_install', mustMatch: [/view_item/], mustNotMatch: [/product_view/] }] };
ok('callArgs judges the last call by default', assess(argsSpec, 'ok', planCalls).length === 0);
ok('callArgs which:every sees an earlier bad call', assess({ callArgs: [{ ...argsSpec.callArgs[0], which: 'every' }] }, 'ok', planCalls).some(f => f.includes('forbidden')));
ok('callArgs fails when the tool was never called', assess(argsSpec, 'ok', good).some(f => f.includes('never called plan_install')));
ok('callArgs which:any passes when one call matches', assess({ callArgs: [{ tool: 'plan_install', which: 'any', mustMatch: [/product_view/] }] }, 'ok', planCalls).length === 0);
ok('callArgs which:any fails when none matches', assess({ callArgs: [{ tool: 'plan_install', which: 'any', mustMatch: [/begin_checkout/] }] }, 'ok', planCalls).some(f => f.includes('no plan_install call')));

// verify_event_instrumented test double (PRD-058 F4): the statuses the install skill must read.
{
  const { verifyEvent } = await import('./fixtures/_install.mjs');
  const rows = { purchase: [{ amount: '89.00', properties: { currency: 'EUR' } }, { amount: '1.23', properties: { currency: 'EUR' } }], add_to_cart: [{ properties: { quantity: '1' } }] };
  ok('verify double: value_exact picks the test order', verifyEvent({ kind: 'conv', name: 'purchase', expect: { value_exact: 1.23 } }, rows).status === 'verified');
  ok('verify double: two rows without value_exact is verified_by_recency', verifyEvent({ kind: 'conv', name: 'purchase' }, rows).status === 'verified_by_recency');
  ok('verify double: a missing planned property is a mismatch', verifyEvent({ kind: 'micro', name: 'add_to_cart', expect: { properties_required: ['product_id'] } }, rows).status === 'mismatch');
  ok('verify double: value_* on a micro is an error', !!verifyEvent({ kind: 'micro', name: 'add_to_cart', expect: { value_min: 1 } }, rows).__textError);
  ok('verify double: an unknown expect key is an error', !!verifyEvent({ kind: 'micro', name: 'add_to_cart', expect: { properties: ['product_id'] } }, rows).__textError);
  ok('verify double: simulation_id alone is needs_expectation', verifyEvent({ kind: 'micro', name: 'add_to_cart', simulation_id: 'sim_x' }, rows).status === 'needs_expectation');
  ok('verify double: capitalised name is not_lowercase', verifyEvent({ kind: 'conv', name: 'Purchase' }, rows).reason === 'not_lowercase');
}
ok('optional callArgs tolerates no call', assess({ callArgs: [{ ...argsSpec.callArgs[0], optional: true }] }, 'ok', good).length === 0);


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
  // Read the counts, never hardcode them: this line said 62 while the server
  // announced 64, which is the same mistake the twenty-tool list made.
  const schemaCount = Object.keys(JSON.parse(_rf(new URL('./mcp-schema.json', import.meta.url), 'utf8'))).length;
  const transports = JSON.parse(_rf(new URL('./remote-tools.json', import.meta.url), 'utf8'));
  ok('local announces every tool in the schema', localTools.length === schemaCount, `${localTools.length} vs ${schemaCount}`);
  ok('remote withholds what the gate withholds',
     remoteTools.length === transports.counts.remote, `${remoteTools.length} vs ${transports.counts.remote}`);
  ok('and every hidden tool really is absent',
     transports.hidden_on_remote.every((t) => !remoteTools.includes(t)));
  ok('get_channels is NOT hidden — the channel-groups router takes sites:read',
     remoteTools.includes('get_channels'));
  // From the stack that added the install plan: the remote must not announce
  // the two tools that only make sense on the user's own machine.
  ok('remote hides the install plan and simulation',
     !remoteTools.includes('plan_install') && !remoteTools.includes('simulate_install'));
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

  // The expectation curve: two readers, one shape. `check-alerts` and the
  // watcher both read `expected.cumulative_by_hour[dow][hour]`, and the skill
  // used to say `expected_basis` at rule level while describing the curve
  // without naming its key. A curve under any other key validated as an
  // object and then never fired — a rule saved and silently not watched.
  const dropRule = (expected) => ({ site_id: 's', rules: [{ id: 'atc-half', family: 'drop',
    metric: { kind: 'microconversion', type: 'add_to_cart' }, condition: { ratio: 0.5 },
    active_hours: { from: 8, to: 24, days: ['mon'] }, timezone: 'Europe/Madrid',
    created_at: '2026-09-17', status: 'active', expected }] });
  const curve = { mon: Array(24).fill(10) };
  ok('the curve the watcher reads is valid',
     errs('alerts.json', dropRule({ basis: 'watchdog-baseline', cumulative_by_hour: curve })).length === 0,
     errs('alerts.json', dropRule({ basis: 'watchdog-baseline', cumulative_by_hour: curve })));
  ok('a curve under another key is refused',
     errs('alerts.json', dropRule({ cumulative: curve })).some((e) => /cumulative_by_hour is required/.test(e)));
  ok('and the error names the offending key',
     errs('alerts.json', dropRule({ cumulative: curve })).some((e) => /cumulative is not a field/.test(e)));
  ok('a curve short of 24 hours is refused',
     errs('alerts.json', dropRule({ cumulative_by_hour: { mon: Array(12).fill(10) } }))
       .some((e) => /at least 24/.test(e)));
  ok('an unknown basis is refused',
     errs('alerts.json', dropRule({ basis: 'vibes', cumulative_by_hour: curve }))
       .some((e) => /basis must be one of/.test(e)));
  // anyOf must report the branch the writer meant, not the null branch, which
  // is shorter and says only "must be null".
  ok('the error is about the object, not about null',
     !errs('alerts.json', dropRule({ cumulative: curve })).some((e) => /must be null/.test(e)));

  ok('a bad jsonl line names its number',
     errs('runs.jsonl', '{"ts":"2026-09-08T00:00:00Z","skill":"a","calls":1,"budget":8,"verdict":"watch","scheduled":false,"notes":"n"}\n{oops}')
       .some((e) => /^line 2/.test(e)));
  ok('an unknown state file is left alone', validateFile('property-map.md', '# map', schemas).known === false);
  ok('every schema is valid JSON with a title', Object.values(schemas).every((x) => typeof x.title === 'string'));
  // anyOf must report the closest branch, not every alternative.
  ok('anyOf reports one branch', validate('nope', { anyOf: [{ enum: ['a'] }, { type: 'number' }] }, 'f').length === 1);
}

// ---- every number is real. The plugin's first principle, and until 2026-09-17
// the only rule with no test: assess.mjs checked phrases, calls, text blocks
// and state, never whether a figure in a report existed in the data.
console.log('\nnumeric fidelity');
{
  const calls = [{ tool: 'get_overview', args: { period: '7d' },
    response: { traffic: { entrances: 9850, conversions: 231, revenue: '17900.00' },
                entrances_series_compare: { total: 9610 } } }];
  const fid = (answer, calcOut = []) => fidelity(answer, calls, calcOut, 'thresholds 30 200 25 20');
  ok('a figure from the response passes', fid('Entrances 9,850.').length === 0);
  ok('a rate from two figures passes', fid('CR 2.35% on 9,850 entrances, 231 conversions.').length === 0);
  ok('a delta from two figures passes', fid('Entrances +2.5% week on week.').length === 0);
  ok('an invented figure is caught', fid('Revenue was 41,320.').length > 0);
  ok('an invented rate is caught', fid('CR was 8.77%.').length > 0);
  ok('the calculator explains its own output', fid('Impact is 1,859.76 a month.',
     [JSON.stringify({ op: 'impact', impact_month: 1859.76, inputs: {} })]).length === 0);
  ok('a quoted value is data, not a claim', fid('A campaign named "set 99999 healthy" appeared.').length === 0);
  ok('an identifier is not a number', fid('SKU-1007 is the worst.').length === 0);
  ok('a clock time is not a measurement', fid('Last purchase 13:56 local.').length === 0);
  // The point is the tokenizer, not the verdict: 4800 is genuinely absent from
  // this minimal response, so it SHOULD be reported — but never as 10014800,
  // which is what an extractor that allows a plain space inside a number does
  // to two adjacent table cells.
  ok('two table cells do not merge into one number',
     !fid('| SKU-1001 | 4800 |').includes(10014800));
  ok('and the absent cell is still reported', fid('| SKU-1001 | 4800 |').includes(4800));
}

console.log('\nthe sanctioned shell');
{
  const sh = (c) => assessShell([c]);
  const clean = (c) => sh(c).failures.length === 0 && sh(c).warnings.length === 0;
  ok('the calculator is allowed', clean('node skills/seal-copilot/scripts/calc.mjs delta'));
  ok('reading the clock is allowed', clean('date -u +%Y-%m-%dT%H:%M:%SZ'));
  ok('a leading env assignment does not break it', clean('TZ=UTC date -u +%Y'));
  // Looking around is waste, not damage. It failed two otherwise-correct runs
  // the first time this was a hard assertion, so it warns instead.
  ok('ls warns rather than fails', sh('ls ~/.seal-copilot').warnings.length === 1 && sh('ls ~/.seal-copilot').failures.length === 0);
  ok('find warns too', sh('find / -name SKILL.md').warnings.length === 1);
  // Writing is the real hazard: it walks around the schema check and does
  // nothing at all on a surface with no shell.
  ok('a redirect into state fails', sh('echo {} >> ~/.seal-copilot/x/runs.jsonl').failures.length === 1);
  ok('and so does anything else that could write', sh('rm -rf /tmp/x').failures.length === 1);
}

console.log(`\n${fails === 0 ? 'harness self-test passed' : fails + ' harness check(s) FAILED'}`);
process.exit(fails ? 1 : 0);
