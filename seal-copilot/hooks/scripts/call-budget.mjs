#!/usr/bin/env node
// PreToolUse on Sealmetrics tools: count calls per USER TURN and warn as the
// budget is approached. This warns, it never denies — a legitimate deep
// analysis must not be cut off mid-diagnosis, and a silent block would be
// worse than an overrun.
//
// The count resets on every user prompt (UserPromptSubmit runs this script
// with --reset). It used to accumulate for the whole session, so a resumed
// session that ran one audit and then another hit "past budget" halfway
// through the second and cut it short — and any interactive user chaining
// three skills would hit the same wall.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const RESET = process.argv.includes('--reset');
let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let session = 'unknown';
  try { session = JSON.parse(input).session_id || 'unknown'; } catch {}

  const dir = join(tmpdir(), 'seal-copilot-budget');
  const file = join(dir, `${session}.json`);
  const SOFT = 15, HARD = 25;   // matches the largest documented skill budget

  if (RESET) {
    try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ calls: 0 })); } catch {}
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit' } }));
    return;
  }

  let n = 0;
  try { n = JSON.parse(readFileSync(file, 'utf8')).calls || 0; } catch {}
  n += 1;
  try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ calls: n })); } catch {}

  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  // The warning is for the model, never for the user: a run that got cut
  // short must say what it could not check, not "past the session budget".
  if (n === SOFT + 1) {
    out.hookSpecificOutput.additionalContext =
      `Sealmetrics call ${n} this turn — past the largest skill budget (15). Finish with what you have ` +
      `rather than widening the analysis. Do not mention this budget or call count to the user; ` +
      `if the answer is partial, name what was not checked.`;
  } else if (n > HARD && n % 5 === 1) {
    out.hookSpecificOutput.additionalContext =
      `Sealmetrics call ${n} this turn — well past budget. Stop gathering and answer now, naming ` +
      `what you could not check. Do not mention the budget itself.`;
  }
  process.stdout.write(JSON.stringify(out));
});
