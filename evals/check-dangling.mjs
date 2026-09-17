#!/usr/bin/env node
// Two ways a plugin drifts out of step with itself, both invisible to every
// other gate:
//
// 1. A file names something that does not exist — a skill, a reference, a
//    script. The README promised a `SEAL-STATE` block no skill ever emitted.
// 2. A file exists that nothing names. The `sealmetrics-analyst` agent was
//    shipped in every bundle for ten days after `state-schema.md` explained why
//    no skill can use it.
//
//   node evals/check-dangling.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const problems = [];

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

for (const pluginName of ['seal-copilot', 'seal-install']) {
  const plugin = join(root, pluginName);
  if (!existsSync(plugin)) continue;
  const all = walk(plugin).map((p) => relative(plugin, p));
  const docs = all.filter((p) => p.endsWith('.md'));
  const text = docs.map((p) => readFileSync(join(plugin, p), 'utf8')).join('\n');

  const skills = readdirSync(join(plugin, 'skills')).filter((s) => existsSync(join(plugin, 'skills', s, 'SKILL.md')));

  // 1. Named but missing.
  const named = new Set();
  for (const m of text.matchAll(/`(?:skills\/seal-copilot\/)?references\/([a-z0-9-]+)\.md`/g)) named.add(`references/${m[1]}.md`);
  for (const m of text.matchAll(/`?(?:skills\/seal-copilot\/)?scripts\/([a-z0-9-]+\.mjs)`?/g)) named.add(`scripts/${m[1]}`);
  for (const m of text.matchAll(/`(?:seal-copilot\/)?hooks\/schemas\/([a-z0-9.-]+)`/g)) named.add(`hooks/schemas/${m[1]}`);
  for (const ref of named) {
    // Resolve where a reader would look: inside the skill, inside the plugin,
    // at the repo root (a developer README says `scripts/usage-report.mjs`),
    // and in the sibling plugin — seal-install names Seal Copilot's state
    // contract on purpose, and that is a reference, not a dangling one.
    const candidates = [
      join(plugin, 'skills', 'seal-copilot', ref), join(plugin, ref), join(root, ref),
      ...skills.map((s) => join(plugin, 'skills', s, ref)),
      join(root, 'seal-copilot', 'skills', 'seal-copilot', ref), join(root, 'seal-copilot', ref),
    ];
    if (!candidates.some(existsSync)) problems.push(`${pluginName}: ${ref} is named in the docs and does not exist`);
  }
  // A skill named as a skill has to be one.
  for (const m of text.matchAll(/`([a-z][a-z-]{4,})`\s+skill/g)) {
    const name = m[1];
    if (!skills.includes(name) && !['seal-install', 'seal-copilot'].includes(name)) {
      problems.push(`${pluginName}: the "${name}" skill is named in the docs and does not exist`);
    }
  }

  // 2. Present but unnamed. Only the directories where a dead file is a real
  //    cost: an agent, a reference or a script nobody reads still ships.
  for (const dir of ['agents', 'skills/seal-copilot/references', 'skills/seal-copilot/scripts', 'hooks/scripts', 'hooks/schemas']) {
    const abs = join(plugin, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (statSync(join(abs, f)).isDirectory()) continue;
      const stem = basename(f).replace(/\.(md|mjs|json|jsonl)$/, '');
      // hooks/scripts are named by hooks.json, not by prose.
      const hooksJson = existsSync(join(plugin, 'hooks', 'hooks.json')) ? readFileSync(join(plugin, 'hooks', 'hooks.json'), 'utf8') : '';
      const libDir = dir === 'hooks/scripts' && existsSync(join(abs, 'lib'));
      const referenced = text.includes(stem) || hooksJson.includes(f)
        || (libDir && readdirSync(abs).some((x) => x.endsWith('.mjs') && readFileSync(join(abs, x), 'utf8').includes(stem)))
        || readdirSync(abs).filter((x) => x.endsWith('.mjs')).some((x) => x !== f && readFileSync(join(abs, x), 'utf8').includes(stem));
      if (!referenced) {
        problems.push(`${pluginName}: ${dir}/${f} is in the bundle and nothing names it — ` +
          'delete it, or name it where it is meant to be used');
      }
    }
  }
}

for (const p of problems) console.log('  ' + p);
console.log(problems.length ? `\n${problems.length} dangling reference(s).` : 'no dangling references');
process.exit(problems.length ? 1 : 0);
