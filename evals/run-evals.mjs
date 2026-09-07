#!/usr/bin/env node
// Runs the eval suite: each case spawns a real `claude -p` session wired to the
// mock Sealmetrics server, then asserts on the answer and on the calls the mock
// received. `claude plugin eval` is early-access and unavailable, so this is the
// suite.
//
//   node evals/run-evals.mjs                 # all cases
//   node evals/run-evals.mjs drop sku        # cases whose id matches a filter
//   node evals/run-evals.mjs --json out.json
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
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

function runCase(c) {
  return new Promise((resolve) => {
    const work = mkdtempSync(join(tmpdir(), `seal-eval-${c.id}-`));
    const callLog = join(work, 'calls.jsonl');
    const mcpConfig = JSON.stringify({
      mcpServers: {
        sealmetrics: {
          command: 'node',
          args: [join(here, 'mock-server', 'server.mjs')],
          env: { SEAL_FIXTURE: c.fixture, SEAL_CALL_LOG: callLog },
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
      env: { ...process.env, SEAL_COPILOT_STATE_DIR: join(work, 'state') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);

    const timer = setTimeout(() => { proc.kill('SIGKILL'); }, 240000);

    proc.on('close', () => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      let answer = out;
      try { const j = JSON.parse(out); answer = j.result ?? j.text ?? out; } catch {}

      const calls = existsSync(callLog)
        ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
        : [];
      const rejected = calls.filter(c2 => c2.rejected);

      const failures = assess(c, answer, calls);
      if (!answer.trim() && err) failures.push(`stderr: ${err.slice(0, 300)}`);

      rmSync(work, { recursive: true, force: true });
      resolve({ id: c.id, fixture: c.fixture, pass: failures.length === 0, failures,
                calls: calls.length, rejected: rejected.length, ms, answer });
    });
  });
}

const results = [];
for (const c of selected) {
  process.stdout.write(`· ${c.id} … `);
  const r = await runCase(c);
  results.push(r);
  console.log(r.pass ? `PASS (${r.calls} calls, ${(r.ms / 1000).toFixed(0)}s)`
                     : `FAIL (${r.calls} calls) — ${r.failures.join('; ')}`);
}

const passed = results.filter(r => r.pass).length;
const rate = results.length ? passed / results.length : 0;
console.log(`\n${passed}/${results.length} passed (${(rate * 100).toFixed(0)}%). Target ≥90%.`);
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)); console.log(`→ ${jsonOut}`); }
process.exit(rate >= 0.9 ? 0 : 1);
