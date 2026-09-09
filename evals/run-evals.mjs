#!/usr/bin/env node
// Runs the eval suite: each case spawns a real `claude -p` session wired to the
// mock Sealmetrics server, then asserts on the answer and on the calls the mock
// received. `claude plugin eval` is early-access and unavailable, so this is the
// suite.
//
// Note: the plugin loads with its hooks, including the SessionStart gate that
// tells the model not to touch Sealmetrics when SEALMETRICS_API_KEY is unset.
// That gate is right in production and wrong here, so every case runs with a
// dummy key the mock server ignores. Cases that exist to test the unconfigured
// path set `noApiKey: true`.
//
//   node evals/run-evals.mjs                 # all cases
//   node evals/run-evals.mjs drop sku        # cases whose id matches a filter
//   node evals/run-evals.mjs --json out.json
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assess } from './assess.mjs';
import { parseStream } from './stream.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cases = (await import(join(here, 'cases.mjs'))).default;
const schema = JSON.parse(readFileSync(join(here, 'mcp-schema.json'), 'utf8'));

const argv = process.argv.slice(2);
const jsonIdx = argv.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
const runsIdx = argv.indexOf('--runs');
const RUNS = runsIdx >= 0 ? Math.max(1, parseInt(argv[runsIdx + 1], 10) || 1) : 1;
// A case that passes 2 of 3 is flaky, not passing. Model wording varies — we saw
// the same correct answer phrased two ways — so a case must hold every time.
const REQUIRED_RATE = 1.0;
const skipIdx = new Set([jsonIdx + 1, runsIdx + 1].filter(i => i > 0));
const filters = argv.filter((a, i) => !a.startsWith('--') && !skipIdx.has(i));
const selected = filters.length ? cases.filter(c => filters.some(f => c.id.includes(f))) : cases;

// Every mock tool is pre-allowed so the run never blocks on a permission prompt.
const allowedTools = [
  ...Object.keys(schema).map(t => `mcp__sealmetrics__${t}`),
  'Read', 'Write',
].join(' ');

// The default site id must agree with what the fixture's list_sites returns,
// or the model is handed a contradiction before it starts.
async function siteIdFor(fixture) {
  try {
    const m = await import(pathToFileURL(join(here, 'fixtures', `${fixture}.mjs`)).href);
    let ls = m.tools?.list_sites;
    if (typeof ls === 'function') ls = ls({});
    return ls?.sites?.[0]?.site_id || '';
  } catch { return ''; }
}

// Read every file under the state directory, so a case can assert on what a
// skill persisted — the recommendation ledger, the site profile, the baseline.
function readState(dir) {
  const out = [];
  const walk = (d) => {
    let entries; try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { out.push(`--- ${p}\n` + readFileSync(p, 'utf8')); } catch {} }
    }
  };
  walk(dir);
  return out.join('\n');
}

function runStep(c, step, siteId, work, callLog, resumeId = null) {
  return new Promise((resolve) => {
    const mcpConfig = JSON.stringify({
      mcpServers: {
        sealmetrics: {
          // process.execPath, not 'node': under nvm there is no `node` on a
          // system PATH, and the env block below may replace rather than extend
          // the server's environment. An absolute interpreter removes the doubt.
          command: process.execPath,
          args: [join(here, 'mock-server', 'server.mjs')],
          env: { SEAL_FIXTURE: c.fixture, SEAL_CALL_LOG: callLog, PATH: process.env.PATH || '' },
        },
      },
    });

    const args = [
      '-p', step.prompt,
      '--mcp-config', mcpConfig,
      '--strict-mcp-config',
      '--plugin-dir', join(root, 'seal-copilot'),
      '--allowed-tools', allowedTools,
      '--output-format', 'stream-json', '--verbose',
    ];
    // A continued step resumes the previous step's session so the model sees
    // its own earlier answer — the only way to test "run it again" behaviour.
    // Cases that never continue keep sessions off disk.
    const continues = (c.steps || []).some(s => s.continue);
    if (resumeId) args.push('--resume', resumeId);
    if (!continues) args.push('--no-session-persistence');

    const started = Date.now();
    const proc = spawn('claude', args, {
      cwd: work,
      // The plugin's SessionStart hook refuses to let the model touch Sealmetrics
      // when SEALMETRICS_API_KEY is unset — correct in production, fatal here,
      // since the mock server needs no credential. Give every case a dummy key,
      // except the case whose whole point is the missing-key path.
      env: (() => {
        const e = { ...process.env, SEAL_COPILOT_STATE_DIR: join(work, 'state'),
                    SEALMETRICS_API_KEY: 'sm_eval_mock', SEALMETRICS_SITE_ID: siteId };
        if (c.noApiKey) { delete e.SEALMETRICS_API_KEY; delete e.SEALMETRICS_SITE_ID; }
        if (c.multiSite) delete e.SEALMETRICS_SITE_ID;
        return e;
      })(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);

    const timer = setTimeout(() => { proc.kill('SIGKILL'); }, 240000);

    proc.on('close', () => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      // stream-json: one event per line. The final "result" event carries only
      // the last assistant turn; a skill that writes state after its report
      // leaves "profile cached" as the result and the report earlier in the
      // stream. Concatenate every assistant text block instead.
      const parsed = parseStream(out);
      let answer = parsed.text, cliError = null;
      const sessionId = parsed.sessionId || null;
      const truncated = !parsed.sawResult;        // stream ended before the CLI's result event
      if (parsed.isError) cliError = parsed.result || 'unknown CLI error';
      if (!answer.trim() && !cliError && err.trim()) cliError = err.trim().slice(0, 300);

      const calls = existsSync(callLog)
        ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
        : [];
      const rejected = calls.filter(c2 => c2.rejected);

      resolve({ cliError, calls, rejected, ms, answer, sessionId, truncated,
                toolNames: [...new Set(calls.map(x => x.tool))] });
    });
  });
}

async function runCase(c, siteId) {
  const work = mkdtempSync(join(tmpdir(), `seal-eval-${c.id}-`));
  const callLog = join(work, 'calls.jsonl');
  const steps = c.steps || [c];
  const failures = [];
  let calls = 0, rejected = 0, ms = 0, answer = '', toolNames = [], cliError = null;

  let seen = 0, lastSession = null, truncatedStep = false;
  for (const [i, step] of steps.entries()) {
    const r = await runStep(c, step, siteId, work, callLog, step.continue ? lastSession : null);
    ms += r.ms;
    const stepCalls = r.calls.slice(seen);   // the log is cumulative; judge this step on its own calls
    seen = r.calls.length;
    calls = r.calls.length;
    rejected = r.rejected.length;
    answer = r.answer;
    toolNames = r.toolNames;
    lastSession = r.sessionId || lastSession;
    if (r.truncated) truncatedStep = true;
    if (r.cliError) { cliError = r.cliError; break; }
    if (step.continue && !lastSession) failures.push(`step ${i + 1}: could not resume — no session id from step ${i}`);
    const label = steps.length > 1 ? `step ${i + 1}: ` : '';
    for (const f of assess({ ...step, maxCalls: undefined, allowRejected: c.allowRejected }, r.answer, stepCalls))
      failures.push(label + f);
  }

  // Budget and rejections are judged once, across the whole case.
  if (!cliError) {
    if (c.maxCalls !== undefined && calls > c.maxCalls) failures.push(`${calls} calls > budget ${c.maxCalls}`);
    if (rejected && !c.allowRejected) failures.push(`${rejected} invalid call(s)`);
    if (c.stateMustContain) {
      const state = readState(join(work, 'state'));
      for (const re of c.stateMustContain)
        if (!re.test(state)) failures.push(`nothing under the state dir matches ${re}`);
    }
  }

  const state = readState(join(work, 'state'));
  rmSync(work, { recursive: true, force: true });
  return { id: c.id, fixture: c.fixture, error: cliError, state, truncated: truncatedStep,
           pass: !cliError && failures.length === 0,
           failures: cliError ? [`the CLI never ran the case: ${cliError}`] : failures,
           calls, rejected, ms, answer, toolNames };
}

// A session that never really ran: no answer, no tool call and no error — or
// an error the API itself labels transient (stream idle timeout, overloaded,
// rate limit). Neither is a verdict on the skill; retry once.
const TRANSIENT = /stream idle timeout|partial response|overloaded|rate limit|529|503|ECONNRESET|ETIMEDOUT/i;
const isTransient = (r) =>
  (!r.error && !r.calls && !(r.answer || '').trim())   // never started
  || (r.error && TRANSIENT.test(r.error))                // the API said so
  // No result event means the session never finished, so whatever text arrived
  // is a fragment: one attempt made nine calls and left "Let me check remaining
  // diagnostics in parallel." Scoring that against the skill is nonsense, so a
  // non-empty fragment no longer disqualifies the retry.
  || r.truncated;

const results = [];
for (const c of selected) {
  process.stdout.write(`· ${c.id} … `);
  const siteId = await siteIdFor(c.fixture);
  const attempts = [];
  let r;
  for (let n = 0; n < RUNS; n++) {
    r = await runCase(c, siteId);
    if (isTransient(r)) {
      process.stdout.write('↻');
      r = await runCase(c, siteId);              // one retry, then it counts
      if (isTransient(r)) r = { ...r, failures: ['session produced nothing twice — transient CLI failure, not a skill result', ...r.failures] };
    }
    attempts.push(r);
    if (r.error) break;                       // environment failure: do not repeat it
    if (RUNS > 1) process.stdout.write(r.pass ? '✓' : '✗');
  }
  const passes = attempts.filter(a => a.pass).length;
  const rate = passes / attempts.length;
  // Report the first failing attempt, since that is the one worth reading.
  r = attempts.find(a => !a.pass) || attempts[0];
  r = { ...r, attempts: attempts.length, passes, rate, pass: rate >= REQUIRED_RATE };
  if (RUNS > 1 && passes > 0 && passes < attempts.length)
    r.failures = [`FLAKY — passed ${passes}/${attempts.length}`, ...r.failures];
  results.push(r);
  if (r.error && /not logged in|\/login|authentication|unauthoriz/i.test(r.error)) {
    console.log('ENVIRONMENT');
    console.error(
      '\nThe Claude CLI is not authenticated, so no case can run.\n' +
      'These evals spawn real `claude -p` sessions, which need the CLI itself\n' +
      'to be logged in. Being signed in to the Claude desktop app does NOT\n' +
      'cover the terminal binary — they keep separate sessions.\n\n' +
      '  Option A (subscription): run `claude` in a terminal, complete /login,\n' +
      '                           then re-run this suite.\n' +
      '  Option B (API billing):  export ANTHROPIC_API_KEY=sk-ant-...\n' +
      '                           Better for CI: no interactive step.\n\n' +
      'Everything that needs no model is checked by `bash scripts/check.sh`.\n');
    process.exit(2);
  }
  const runLabel = RUNS > 1 ? ` ${r.passes}/${r.attempts}` : '';
  console.log(r.pass ? ` PASS${runLabel} (${r.calls} calls, ${(r.ms / 1000).toFixed(0)}s)`
                     : ` FAIL${runLabel} (${r.calls} calls) — ${r.failures.join('; ')}`);
  if (!r.pass) {
    const called = r.toolNames?.length ? r.toolNames.join(', ') : '(none)';
    console.log(`    tools called: ${called}`);
    console.log('    answer: ' + (r.answer || '').trim().replace(/\s+/g, ' ').slice(0, 1200));
    try {
      mkdirSync(join(here, 'results'), { recursive: true });
      const f = join(here, 'results', `${r.id}.txt`);
      writeFileSync(f, `# ${r.id} (${r.fixture})\n# failures: ${r.failures.join('; ')}\n` +
                       `# tools: ${called}\n\n${r.answer || ''}` +
                       (r.state ? `\n\n\n===== STATE DIR AFTER RUN =====\n${r.state}` : '\n\n(state dir empty)'));
      console.log(`    full answer: ${f}\n`);
    } catch { console.log(''); }
  }
}

const passed = results.filter(r => r.pass).length;
const rate = results.length ? passed / results.length : 0;
const flaky = results.filter(r => r.passes > 0 && r.passes < r.attempts);
console.log(`\n${passed}/${results.length} cases passed (${(rate * 100).toFixed(0)}%)` +
            (RUNS > 1 ? `, ${RUNS} runs each` : '') + '. Target ≥90%.');
if (flaky.length) console.log(`${flaky.length} flaky: ${flaky.map(f => `${f.id} (${f.passes}/${f.attempts})`).join(', ')}`);
if (RUNS === 1) console.log('Single run — model wording varies. Use --runs 3 before trusting a green suite.');
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)); console.log(`→ ${jsonOut}`); }
process.exit(rate >= 0.9 ? 0 : 1);
