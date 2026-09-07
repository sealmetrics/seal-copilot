#!/usr/bin/env node
// Proves the eval wiring end to end with one cheap model call: is the CLI
// authenticated, does the mock MCP server start, does the model see its tools,
// and is the plugin's skill loaded. Run this before debugging a failing case.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const schema = JSON.parse(readFileSync(join(here, 'mcp-schema.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'seal-preflight-'));
const callLog = join(work, 'calls.jsonl');

const mcpConfig = JSON.stringify({ mcpServers: { sealmetrics: {
  command: process.execPath,
  args: [join(here, 'mock-server', 'server.mjs')],
  env: { SEAL_FIXTURE: 'ecommerce-healthy', SEAL_CALL_LOG: callLog, PATH: process.env.PATH || '' },
} } });

console.log('Preflight — one model call, checks the whole chain.\n');

const proc = spawn('claude', [
  '-p', 'Call the Sealmetrics get_overview tool for period 30d, then reply with exactly the number of entrances it returned and nothing else.',
  '--mcp-config', mcpConfig, '--strict-mcp-config',
  '--plugin-dir', join(root, 'seal-copilot'),
  '--allowed-tools', Object.keys(schema).map(t => `mcp__sealmetrics__${t}`).join(' '),
  '--output-format', 'json', '--no-session-persistence',
], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'],
   env: { ...process.env, SEAL_COPILOT_STATE_DIR: join(work, 'state'),
          SEALMETRICS_API_KEY: 'sm_eval_mock', SEALMETRICS_SITE_ID: 'acct_demo' } });

let out = '', err = '';
proc.stdout.on('data', d => out += d);
proc.stderr.on('data', d => err += d);
proc.on('close', () => {
  let answer = out, isError = false;
  try { const j = JSON.parse(out); answer = String(j.result ?? ''); isError = !!j.is_error; } catch {}
  const calls = existsSync(callLog)
    ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

  const say = (label, ok, detail) => console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);

  say('CLI authenticated', !/not logged in|\/login/i.test(answer), /not logged in/i.test(answer) ? 'run `claude` and /login, or set ANTHROPIC_API_KEY' : '');
  say('CLI returned a result', !isError && !!answer.trim(), isError ? answer.slice(0, 160) : '');
  say('mock MCP server reachable', calls.length > 0,
      calls.length ? '' : 'the model called no Sealmetrics tool — server did not start, or its tools were not offered');
  say('tool call succeeded', calls.some(c => !c.rejected),
      calls.some(c => c.rejected) ? 'rejected: ' + calls.find(c => c.rejected).rejected : '');
  say('model read the response', /41[,.]?200/.test(answer), `answer was: ${answer.trim().slice(0, 120)}`);

  if (calls.length) console.log(`\n  tools called: ${[...new Set(calls.map(c => c.tool))].join(', ')}`);
  if (err.trim()) console.log(`\n  stderr: ${err.trim().slice(0, 400)}`);
  rmSync(work, { recursive: true, force: true });
  process.exit(calls.length && /41[,.]?200/.test(answer) ? 0 : 1);
});
