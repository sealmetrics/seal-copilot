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

export function assess(c, answer, calls, textBlocks = 1) {
  const failures = [];
  const names = calls.map(x => x.tool);
  const rejected = calls.filter(x => x.rejected);
  for (const re of c.mustMatch || []) if (!re.test(answer)) failures.push(`missing ${re}`);
  for (const re of c.mustNotMatch || []) if (re.test(answer)) failures.push(`forbidden ${re}`);
  for (const t of c.mustCall || []) if (!names.includes(t)) failures.push(`never called ${t}`);
  for (const t of c.mustNotCall || []) if (names.includes(t)) failures.push(`should not have called ${t}`);
  for (const t of GLOBAL_MUST_NOT_CALL)
    if (names.includes(t)) failures.push(`called ${t}, which no skill may ever call`);
  if (c.maxCalls !== undefined && calls.length > c.maxCalls) failures.push(`${calls.length} calls > budget ${c.maxCalls}`);
  // Silence is the product for a scheduled check: a healthy run that writes a
  // paragraph is a defect, and no phrase assertion can catch length.
  if (c.maxAnswerChars && answer.trim().length > c.maxAnswerChars)
    failures.push(`answer is ${answer.trim().length} chars, cap ${c.maxAnswerChars}`);
  // Process narration, caught structurally. Pass textBlocks from the stream.
  if (c.maxTextBlocks && textBlocks > c.maxTextBlocks)
    failures.push(`${textBlocks} text blocks, cap ${c.maxTextBlocks} — narrated between tool calls`);
  if (rejected.length && !c.allowRejected)
    failures.push(`${rejected.length} invalid call(s): ${rejected.map(r => r.rejected).join(' | ')}`);
  if (!answer.trim()) failures.push('empty answer');
  return failures;
}
