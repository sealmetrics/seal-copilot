#!/usr/bin/env node
// Three ways a skill file goes wrong that no other gate can see.
//
// 1. It grows. Every word is loaded before the first tool result, on every
//    question, and 1.13.2 reached 10,018 words for one weekly report.
// 2. A rule gets copied into a second file. Four of them had been written nine
//    to fifteen times, and the one eval case that would not pass three runs of
//    three failed on the rule written nine times. Repetition is not enforcement:
//    a rule belongs in references/run-protocol.md once.
// 3. An anecdote gets pasted into a skill. The rule is what the model follows;
//    the run that produced it is what a maintainer needs, and it belongs in
//    docs/incidents.md. A date is the signature of an anecdote, so a date in a
//    SKILL.md outside a code block fails.
//
//   node evals/check-skill-size.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const caps = JSON.parse(readFileSync(join(here, 'size-caps.json'), 'utf8'));

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
};

const files = ['seal-copilot', 'seal-install']
  .flatMap((d) => walk(join(root, d)))
  .map((p) => relative(root, p))
  .sort();

// Frontmatter is a manifest, not prose: its trigger phrases are what make a
// skill fire and trimming them is never the right saving.
const stripFront = (s) => s.replace(/^---\n[\s\S]*?\n---\n/, '');
const stripCode = (s) => s.replace(/```[\s\S]*?```/g, '').replace(/^(?: {4}|\t).*$/gm, '');
const words = (s) => s.split(/\s+/).filter(Boolean).length;

const problems = [];

// 1. Caps.
for (const f of files) {
  const body = stripFront(readFileSync(join(root, f), 'utf8'));
  const n = words(body);
  const cap = caps.files[f] ?? (f.endsWith('SKILL.md') || f.includes('/references/') ? caps.default : null);
  if (cap === null) continue;                       // examples/output.md is a golden output
  if (n > cap) problems.push(`${f}: ${n} words, cap ${cap} — ${n - cap} over`);
}

// 2. Paragraphs of 40+ words in more than one file.
const seen = new Map();
for (const f of files) {
  const body = stripCode(stripFront(readFileSync(join(root, f), 'utf8')));
  for (const para of body.split(/\n\s*\n/)) {
    const text = para.trim();
    if (words(text) < 40) continue;
    const key = createHash('md5').update(text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).digest('hex');
    const at = seen.get(key) || { files: [], sample: text, n: words(text) };
    if (!at.files.includes(f)) at.files.push(f);
    seen.set(key, at);
  }
}
for (const { files: fs, sample, n } of seen.values()) {
  if (fs.length < 2) continue;
  problems.push(`${n} words repeated in ${fs.length} files — move it to references/run-protocol.md:\n` +
    fs.map((x) => `      ${x}`).join('\n') + `\n      "${sample.replace(/\s+/g, ' ').slice(0, 90)}…"`);
}

// 3. Dates in a SKILL.md, outside code blocks.
for (const f of files.filter((x) => x.endsWith('SKILL.md'))) {
  const body = stripCode(stripFront(readFileSync(join(root, f), 'utf8')));
  for (const m of body.matchAll(/\b20\d\d-\d\d-\d\d\b/g)) {
    problems.push(`${f}: the date ${m[0]} is in a skill. A rule goes here in the imperative; ` +
      'the run that produced it goes in docs/incidents.md');
  }
}

// 4. What a scheduled weekly actually loads.
const cb = caps.contextBudget;
const load = cb.files.reduce((a, f) => a + words(stripFront(readFileSync(join(root, f), 'utf8'))), 0);
if (load > cb.cap) problems.push(`a weekly health check loads ${load} words of instructions, cap ${cb.cap}`);

for (const p of problems) console.log('  ' + p);
console.log(problems.length
  ? `\n${problems.length} size problem(s).`
  : `sizes ok — ${files.length} files, no duplicated paragraph, a weekly loads ${load} words (cap ${cb.cap})`);
process.exit(problems.length ? 1 : 0);
