#!/usr/bin/env node
// One rule grammar, four definitions of it. Do they still agree?
//
//   1. `seal-copilot/hooks/schemas/alerts.json` — what may be written
//   2. `references/alert-grammar.md` — what a reader is told
//   3. `skills/check-alerts/SKILL.md` — the on-request evaluator, in prose
//   4. `watcher/lib/families.mjs` — the continuous evaluator, in code
//
// Two evaluators of one grammar is the next version of the defect that shipped
// on 2026-09-17: `create-alert` described an expectation curve in one shape
// while two readers expected another, and the rule saved cleanly and never
// fired. Nothing was checking that they agreed, so nothing noticed.
//
// This checks the structural parts — the families, the metric kinds, the
// condition fields — because those are what someone changes in one place. It
// cannot check that the arithmetic agrees; `watcher/test.mjs` does that against
// worked examples.
//
//   node evals/check-alert-contract.mjs
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const problems = [];
const same = (what, a, b, whereA, whereB) => {
  const missA = b.filter((x) => !a.includes(x));
  const missB = a.filter((x) => !b.includes(x));
  for (const x of missA) problems.push(`${what}: ${whereB} has \`${x}\` and ${whereA} does not`);
  for (const x of missB) problems.push(`${what}: ${whereA} has \`${x}\` and ${whereB} does not`);
};

// 1. The schema.
const rule = JSON.parse(read('seal-copilot/hooks/schemas/alerts.json')).properties.rules.items;
const schemaFamilies = rule.properties.family.enum;
const schemaKinds = rule.properties.metric.properties.kind.enum;

// 2. The reference a reader is given: the families table.
const grammar = read('seal-copilot/skills/seal-copilot/references/alert-grammar.md');
const docFamilies = [...grammar.matchAll(/^\|\s*`(silence|drop|spike|threshold)`/gm)].map((m) => m[1]);
const docKinds = [...(grammar.match(/`metric\.kind`[^|]*\|([^|]*)\|/) || [])[1]?.matchAll(/`([a-z]+)`/g) || []]
  .map((m) => m[1]);

// 3. The prose evaluator: check-alerts gives each family its own heading.
const checkAlerts = read('seal-copilot/skills/check-alerts/SKILL.md');
const proseFamilies = [...checkAlerts.matchAll(/^###\s+`(silence|drop|spike|threshold)`/gm)].map((m) => m[1]);

// 4. The code evaluator.
const watcherPath = join(root, 'watcher', 'lib', 'families.mjs');
if (!existsSync(watcherPath)) {
  console.log('watcher/lib/families.mjs is absent — nothing to compare. Is the watcher still in this repo?');
  process.exit(1);
}
const { FAMILIES } = await import(pathToFileURL(watcherPath).href);
const codeFamilies = Object.keys(FAMILIES);
const familiesSrc = readFileSync(watcherPath, 'utf8');

same('families', schemaFamilies, codeFamilies, 'the schema', 'the watcher');
same('families', schemaFamilies, docFamilies, 'the schema', 'alert-grammar.md');
same('families', schemaFamilies, proseFamilies, 'the schema', 'check-alerts');
if (docKinds.length) same('metric kinds', schemaKinds, docKinds, 'the schema', 'alert-grammar.md');

// The watcher must be able to fetch every kind the schema permits, or a rule
// validates and then cannot be evaluated — which is how this class of bug
// always presents.
const gatherSrc = readFileSync(join(root, 'watcher', 'watch.mjs'), 'utf8');
const gather = gatherSrc.slice(gatherSrc.indexOf('async function gather'), gatherSrc.indexOf('async function checkRule'));
for (const kind of schemaKinds) {
  if (!gather.includes(`'${kind}'`)) {
    problems.push(`metric kinds: the schema permits \`${kind}\` and the watcher's gather() has no branch for it, ` +
      'so such a rule would validate and then never be read');
  }
}

// Condition fields, per family, as the code actually reads them.
const bodyOf = (name) => {
  const start = familiesSrc.indexOf(`export function ${name}(`);
  if (start < 0) return '';
  const next = ['silence', 'drop', 'spike', 'threshold']
    .map((n) => familiesSrc.indexOf(`export function ${n}(`))
    .filter((i) => i > start).sort((a, b) => a - b)[0] ?? familiesSrc.length;
  return familiesSrc.slice(start, next);
};
const DOCUMENTED = { silence: ['hours'], drop: ['ratio'], spike: ['ratio'], threshold: ['below', 'above'] };
for (const [family, fields] of Object.entries(DOCUMENTED)) {
  const body = bodyOf(family);
  const used = [...new Set([...body.matchAll(/condition\.(\w+)/g)].map((m) => m[1]))];
  for (const f of used) {
    if (!fields.includes(f)) {
      problems.push(`condition fields: the watcher's \`${family}\` reads \`condition.${f}\`, which this gate does not ` +
        `know about. If that is a new field, document it in alert-grammar.md and add it here.`);
    }
  }
  for (const f of fields) {
    if (!body.includes(`condition.${f}`) && !(family === 'threshold' && body.includes('condition;'))) {
      problems.push(`condition fields: \`${family}\` is documented with \`condition.${f}\` and the watcher never reads it`);
    }
  }
  if (!grammar.includes(`\`${family}\``)) problems.push(`alert-grammar.md never names the \`${family}\` family`);
}

for (const p of problems) console.log('  ' + p);
console.log(problems.length
  ? `\n${problems.length} disagreement(s) about the alert grammar. Two evaluators of one grammar drift silently: ` +
    'a rule that validates and never fires looks exactly like a quiet site.'
  : `alert grammar agrees across all four definitions (${schemaFamilies.length} families, ${schemaKinds.length} metric kinds)`);
process.exit(problems.length ? 1 : 0);
