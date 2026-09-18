// Pure assertion logic, shared by the runner and the self-test.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const availability = JSON.parse(readFileSync(join(here, 'tool-availability.json'), 'utf8'));

// Two tools must never be called by any skill, in any case, on any transport.
// A per-case mustNotCall cannot express that: it has to be added to every case
// and it is forgotten on the next one. get_channels 403s for every modern key;
// get_marketing_playbook is a second methodology that contradicts this one.
export const GLOBAL_MUST_NOT_CALL = availability.forbidden.tools;

// Sealmetrics gives no bot data, so no answer may contain a bot figure — "bot
// share is 7%", "41% of sessions are bots", a Bots column with a percentage.
// A figure, not the word: "Sealmetrics does not give bot data" passes, and so
// does anything in quotes. Tested against both shapes before it went in.
export const GLOBAL_MUST_NOT_MATCH = [
  /(?<!["'“`])\bbots?\b[^.;,\n]{0,30}?\d+(\.\d+)?\s*%|\d+(\.\d+)?\s*%[^.;,\n]{0,30}?\bbots?\b(?!["'”`])/i,
];

// The shell is sanctioned for exactly two things: the deterministic calculator,
// and reading the clock in check-alerts.
//
// Two classes of unsanctioned command, and they are not equally serious.
//
// A command that WRITES into the state directory is a failure: a real run once
// appended its run log with `cat >>`, which worked because that session
// happened to allow a shell and silently does nothing on one that does not. It
// also walks around the schema validation.
//
// A read-only command — `ls` to see whether a state file exists, `find` to
// locate a skill — is waste, not damage, and the first run of this assertion
// failed two otherwise-correct answers on it. Read answers whether a file
// exists, so the rule stands; it is a warning until the protocol has had a
// chance to be read. Twelve phrase bans in this repo have failed correct
// answers, and a hard failure on day one is how that happens again.
// `date` may carry a leading environment assignment (`TZ=UTC date -u …`).
const SANCTIONED_SHELL = /calc\.mjs|^\s*(?:[A-Za-z_][A-Za-z_0-9]*=\S*\s+)*date\b/;
const READ_ONLY_SHELL = /^\s*(?:ls|find|cat|head|tail|stat|pwd|wc|file|tree|grep|rg)\b/;

/** @returns {{failures: string[], warnings: string[]}} */
export function assessShell(commands = []) {
  const failures = [], warnings = [];
  for (const c of commands) {
    if (SANCTIONED_SHELL.test(c)) continue;
    const where = JSON.stringify(String(c).slice(0, 80));
    if (READ_ONLY_SHELL.test(c)) {
      warnings.push(`used the shell to look around instead of Read: ${where}`);
    } else {
      failures.push(`ran a shell command that could change state: ${where}`);
    }
  }
  return { failures, warnings };
}

export function assess(c, answer, calls, textBlocks = 1, shellCommands = []) {
  const shell = assessShell(shellCommands);
  const failures = [...shell.failures];
  const names = calls.map(x => x.tool);
  const rejected = calls.filter(x => x.rejected);
  for (const re of c.mustMatch || []) if (!re.test(answer)) failures.push(`missing ${re}`);
  for (const re of c.mustNotMatch || []) if (re.test(answer)) failures.push(`forbidden ${re}`);
  for (const t of c.mustCall || []) if (!names.includes(t)) failures.push(`never called ${t}`);
  for (const t of c.mustNotCall || []) if (names.includes(t)) failures.push(`should not have called ${t}`);
  for (const t of GLOBAL_MUST_NOT_CALL)
    if (names.includes(t)) failures.push(`called ${t}, which no skill may ever call`);
  for (const re of GLOBAL_MUST_NOT_MATCH)
    if (re.test(answer)) failures.push(`gave a bot figure — Sealmetrics provides no bot data (${re})`);
  if (c.maxCalls !== undefined && calls.length > c.maxCalls) failures.push(`${calls.length} calls > budget ${c.maxCalls}`);
  // Silence is the product for a scheduled check: a healthy run that writes a
  // paragraph is a defect, and no phrase assertion can catch length.
  if (c.maxAnswerChars && answer.trim().length > c.maxAnswerChars)
    failures.push(`answer is ${answer.trim().length} chars, cap ${c.maxAnswerChars}`);
  // Process narration, caught structurally. Pass textBlocks from the stream.
  if (c.maxTextBlocks && textBlocks > c.maxTextBlocks)
    failures.push(`${textBlocks} text blocks, cap ${c.maxTextBlocks} — narrated between tool calls`);
  // Arguments, not just names. "It called plan_install" says nothing about WHAT
  // it planned; an install that plans product_view or an order_id passes a
  // name check. `which`: 'last' (default) judges the final call of that tool,
  // 'every' judges each call, 'any' passes when at least one call carries every
  // mustMatch (mustNotMatch still applies to all of them). `optional`: no call at
  // all is not a failure.
  for (const spec of c.callArgs || []) {
    const matching = calls.filter(x => x.tool === spec.tool && !x.rejected);
    if (!matching.length) { if (!spec.optional) failures.push(`never called ${spec.tool} (callArgs)`); continue; }
    if (spec.which === 'any') {
      const texts = matching.map(x => JSON.stringify(x.args ?? {}));
      if (!texts.some(t => (spec.mustMatch || []).every(re => re.test(t))))
        failures.push(`no ${spec.tool} call carries all of ${(spec.mustMatch || []).join(' ')}`);
      for (const t of texts) for (const re of spec.mustNotMatch || []) if (re.test(t)) failures.push(`${spec.tool} args contain forbidden ${re}`);
      continue;
    }
    const judged = spec.which === 'every' ? matching : [matching[matching.length - 1]];
    for (const call of judged) {
      const text = JSON.stringify(call.args ?? {});
      for (const re of spec.mustMatch || []) if (!re.test(text)) failures.push(`${spec.tool} args missing ${re}`);
      for (const re of spec.mustNotMatch || []) if (re.test(text)) failures.push(`${spec.tool} args contain forbidden ${re}`);
    }
  }
  if (rejected.length && !c.allowRejected)
    failures.push(`${rejected.length} invalid call(s): ${rejected.map(r => r.rejected).join(' | ')}`);
  if (!answer.trim()) failures.push('empty answer');
  return failures;
}
