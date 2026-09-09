#!/usr/bin/env node
// A phrase ban must never forbid something a skill's own golden output tells
// the model to write. That happened: /SKU-1007/ was banned to catch a SKU
// analysed below the sample floor, while product-friction's examples/output.md
// instructs "(SKU-1007 had 28 views — insufficient sample)". The eval
// contradicted the documentation the skill is told to match, and the case
// failed 0/3 on a correct answer.
//
// Only distinctive literal tokens are checked (4+ chars, no regex
// metacharacters). Short symbols like an emoji appear across many outputs and
// would be noise: banning 🔴 in a hotel-seasonality answer is legitimate even
// though the watchdog's output uses it.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(here, '..', 'seal-copilot', 'skills');
const cases = (await import(join(here, 'cases.mjs'))).default;

const outputs = readdirSync(skillsDir)
  .map((s) => ({ skill: s, file: join(skillsDir, s, 'examples', 'output.md') }))
  .filter((o) => existsSync(o.file))
  .map((o) => ({ ...o, text: readFileSync(o.file, 'utf8') }));

let bad = 0, checked = 0;
for (const c of cases) {
  const bans = [...(c.mustNotMatch || []), ...(c.steps || []).flatMap((s) => s.mustNotMatch || [])];
  for (const re of bans) {
    const src = re.source;
    if (src.length < 4) continue;                       // too short to be distinctive
    if (/[|(){}[\]*+?^$\\]/.test(src)) continue;        // not a literal token
    checked++;
    for (const o of outputs) {
      if (new RegExp(src, 'i').test(o.text)) {
        console.log(`  CONTRADICTION  case "${c.id}" bans /${src}/, which ${o.skill}/examples/output.md instructs the model to write`);
        bad++;
      }
    }
  }
}
console.log(bad
  ? `\n${bad} assertion(s) contradict a golden output. Fix the assertion, not the output.`
  : `no assertion contradicts a golden output (${checked} literal ban(s) checked)`);
process.exit(bad ? 1 : 0);
