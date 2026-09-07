#!/usr/bin/env node
// PreToolUse on Sealmetrics tools: count calls per session and warn as the
// budget is approached. This warns, it never denies — a legitimate deep
// analysis must not be cut off mid-diagnosis, and a silent block would be
// worse than an overrun.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let session = 'unknown';
  try { session = JSON.parse(input).session_id || 'unknown'; } catch {}

  const dir = join(tmpdir(), 'seal-copilot-budget');
  const file = join(dir, `${session}.json`);
  const SOFT = 15, HARD = 25;   // matches the largest documented skill budget

  let n = 0;
  try { n = JSON.parse(readFileSync(file, 'utf8')).calls || 0; } catch {}
  n += 1;
  try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ calls: n })); } catch {}

  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  if (n === SOFT + 1) {
    out.hookSpecificOutput.additionalContext =
      `Sealmetrics call ${n} this session. You are past the budget of the largest skill (15). ` +
      `Wrap up with what you have rather than widening the analysis, and say so if the answer is partial.`;
  } else if (n > HARD && n % 5 === 1) {
    out.hookSpecificOutput.additionalContext =
      `Sealmetrics call ${n} this session — well past budget. Stop gathering and answer now, ` +
      `naming what you could not check.`;
  }
  process.stdout.write(JSON.stringify(out));
});
