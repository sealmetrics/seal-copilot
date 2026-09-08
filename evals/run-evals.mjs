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
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assess } from './assess.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cases = (await import(join(here, 'cases.mjs'))).default;
const schema = JSON.parse(readFileSync(join(here, 'mcp-schema.json'), 'utf8'));

const argv = process.argv.slice(2);
const jsonIdx = argv.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
const filters = argv.filter((a, i) => !a.startsWith('--') && !(jsonIdx >= 0 && i === jsonIdx + 1));
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

function runCase(c, siteId) {
  return new Promise((resolve) => {
    const work = mkdtempSync(join(tmpdir(), `seal-eval-${c.id}-`));
    const callLog = join(work, 'calls.jsonl');
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
      '-p', c.prompt,
      '--mcp-config', mcpConfig,
      '--strict-mcp-config',
      '--plugin-dir', join(root, 'seal-copilot'),
      '--allowed-tools', allowedTools,
      '--output-format', 'json',
      '--no-session-persistence',
    ];

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
      let answer = out, cliError = null;
      try {
        const j = JSON.parse(out);
        answer = j.result ?? j.text ?? out;
        if (j.is_error) cliError = String(answer || "unknown CLI error");
      } catch { if (!out.trim() && err.trim()) cliError = err.trim().slice(0, 300); }

      const calls = existsSync(callLog)
        ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
        : [];
      const rejected = calls.filter(c2 => c2.rejected);

      if (cliError) {
        rmSync(work, { recursive: true, force: true });
        return resolve({ id: c.id, fixture: c.fixture, pass: false, error: cliError,
                         failures: [`the CLI never ran the case: ${cliError}`],
                         calls: calls.length, rejected: 0, ms, answer });
      }
      const failures = assess(c, answer, calls);

      rmSync(work, { recursive: true, force: true });
      resolve({ id: c.id, fixture: c.fixture, pass: failures.length === 0, failures,
                calls: calls.length, rejected: rejected.length, ms, answer,
                toolNames: [...new Set(calls.map(x => x.tool))] });
    });
  });
}

const results = [];
for (const c of selected) {
  process.stdout.write(`· ${c.id} … `);
  const r = await runCase(c, await siteIdFor(c.fixture));
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
  console.log(r.pass ? `PASS (${r.calls} calls, ${(r.ms / 1000).toFixed(0)}s)`
                     : `FAIL (${r.calls} calls) — ${r.failures.join('; ')}`);
  if (!r.pass) {
    const called = r.toolNames?.length ? r.toolNames.join(', ') : '(none)';
    console.log(`    tools called: ${called}`);
    console.log('    answer: ' + (r.answer || '').trim().replace(/\s+/g, ' ').slice(0, 1200));
    try {
      mkdirSync(join(here, 'results'), { recursive: true });
      const f = join(here, 'results', `${r.id}.txt`);
      writeFileSync(f, `# ${r.id} (${r.fixture})\n# failures: ${r.failures.join('; ')}\n` +
                       `# tools: ${called}\n\n${r.answer || ''}`);
      console.log(`    full answer: ${f}\n`);
    } catch { console.log(''); }
  }
}

const passed = results.filter(r => r.pass).length;
const rate = results.length ? passed / results.length : 0;
console.log(`\n${passed}/${results.length} passed (${(rate * 100).toFixed(0)}%). Target ≥90%.`);
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)); console.log(`→ ${jsonOut}`); }
process.exit(rate >= 0.9 ? 0 : 1);
