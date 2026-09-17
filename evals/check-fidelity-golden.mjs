#!/usr/bin/env node
// Run the numeric-fidelity check over every golden output.
//
// Each `examples/output.md` is a report built from a named fixture, so it is
// the best false-positive test available without spending a model: if the check
// flags a figure in one of these, either the check is wrong or the reference
// output the model is told to imitate contains a number from nowhere.
//
// Twelve times in this repo a phrase ban failed a correct answer. That is why
// this gate exists before the assertion is ever made to fail a case.
//
//   node evals/check-fidelity-golden.mjs
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fidelity } from './fidelity.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const refsDir = join(root, 'seal-copilot', 'skills', 'seal-copilot', 'references');

// Known and explained. Each entry is a figure a correct report contains that
// one arithmetic step over the fixture cannot reach.
const KNOWN = {
  'product-friction': {
    2800: 'A three-operand impact estimate: 238 carts x 9.7% cart-to-purchase x EUR 120. ' +
          'Products are excluded from the derivations on purpose, because an impact figure ' +
          'now comes from `calc impact` and arrives as a given number in a real run. This ' +
          'golden output predates the calculator.',
  },
};

const PERIODS = ['30d', '7d', 'today', 'this_week', 'last_week', 'this_month', 'last_month', '90d', '12m', 'this_quarter', 'last_quarter'];
const EXTRAS = [{}, { property_key: 'sku' }, { property_key: 'category' }, { table: 'conversion_items' },
                { table: 'microconversions' }, { conversion_type: 'add_to_cart' }, { conversion_type: 'product_view' },
                { conversion_type: 'purchase' }, { limit: 100 }];

async function serveAll(fixture) {
  const m = await import(pathToFileURL(join(here, 'fixtures', `${fixture}.mjs`)).href);
  const calls = [];
  for (const [tool, h] of Object.entries(m.tools || {})) {
    for (const period of PERIODS) {
      for (const compare of [undefined, 'previous', 'yoy']) {
        for (const extra of EXTRAS) {
          const args = { period, ...(compare ? { compare } : {}), ...extra };
          try {
            const r = typeof h === 'function' ? h(args) : h;
            if (r && !r.__error && !r.__textError) calls.push({ tool, args, response: r });
          } catch { /* a handler that rejects these args is not serving them */ }
        }
      }
    }
  }
  return calls;
}

const skillText = ['methodology', 'state-schema', 'run-protocol', 'mcp-calls', 'opportunity-patterns',
                   'ecommerce-playbook', 'hotels-playbook', 'saas-playbook', 'alert-grammar']
  .map((n) => (existsSync(join(refsDir, `${n}.md`)) ? readFileSync(join(refsDir, `${n}.md`), 'utf8') : '')).join('\n');

// Which fixture each golden output was built from — stated in the file itself.
const skillsDir = join(root, 'seal-copilot', 'skills');
const { readdirSync } = await import('node:fs');
const pairs = [];
for (const skill of readdirSync(skillsDir)) {
  const out = join(skillsDir, skill, 'examples', 'output.md');
  if (!existsSync(out)) continue;
  const text = readFileSync(out, 'utf8');
  const m = text.match(/fixtures\/([a-z0-9-]+)/);
  if (m) pairs.push({ skill, fixture: m[1], text });
}

let problems = 0, checked = 0;
for (const { skill, fixture, text } of pairs) {
  if (!existsSync(join(here, 'fixtures', `${fixture}.mjs`))) continue;
  const calls = await serveAll(fixture);
  const own = readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8');
  const bad = fidelity(text, calls, [], skillText + own);
  const known = KNOWN[skill] || {};
  const unexplained = bad.filter((n) => !(n in known));
  checked++;
  if (unexplained.length) {
    problems += unexplained.length;
    console.log(`  ${skill} (${fixture}): ${unexplained.join(', ')} — not in the fixture and not one step from it`);
  }
}

console.log(problems
  ? `\n${problems} unexplained figure(s). Either the golden output quotes a number from nowhere, ` +
    'or the check is wrong — read fidelity.mjs before changing an output.'
  : `fidelity ok — ${checked} golden outputs, every figure traced to its fixture` +
    ` (${Object.values(KNOWN).reduce((a, k) => a + Object.keys(k).length, 0)} documented exception)`);
process.exit(problems ? 1 : 0);
