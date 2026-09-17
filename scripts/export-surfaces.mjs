#!/usr/bin/env node
/**
 * One source, several targets.
 *
 * The plugin is the single source of truth for the methodology and every
 * procedure. Every other surface — Cowork, Claude on the web, Codex — gets a
 * rendering of that same source rather than a copy someone maintains by hand.
 * Two copies of a methodology diverge; this is the whole reason the export is
 * generated and not written.
 *
 *   node scripts/export-surfaces.mjs        # writes dist/, and the Codex tree
 *
 * Every surface here reads Agent Skills natively, so nothing is transliterated:
 * what differs is the packaging. Claude Code and Cowork take the plugin bundle
 * unchanged, Claude.ai takes one ZIP per skill, and Codex takes a marketplace.
 *
 * One target is not under dist/: Codex installs from a git repository, so its
 * marketplace has to sit at the root of this one. See exportCodex.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const plugin = join(root, 'seal-copilot');
const skillsDir = join(plugin, 'skills');
const refsDir = join(skillsDir, 'seal-copilot', 'references');
const dist = join(root, 'dist');

// Where this ships from. Both one-command installs name it, and the Codex
// manifest carries it so a reviewer can find the source.
const REPO_URL = 'https://github.com/sealmetrics/seal-copilot';

/**
 * Split frontmatter from body and read one key.
 *
 * Written line-wise rather than with a regex: a folded block (`description: >`)
 * spans indented lines, and a lookahead ending in `$` under /m stops at the
 * first newline — which silently reported 70-character descriptions for
 * 500-character ones until it was measured.
 */
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fields: {}, body: md.trim() };
  const lines = m[1].split('\n');
  const fields = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-z][a-z-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].replace(/^>[-+]?\s*$/, '').trim();
    const folded = [];
    for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) folded.push(lines[j].trim());
    value = [value, ...folded].filter(Boolean).join(' ').trim();
    // Unwrap a YAML single-quoted scalar.
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    fields[kv[1]] = value;
  }
  return { fields, body: m[2].trim() };
}

const split = (md) => {
  const { fields, body } = frontmatter(md);
  return { description: fields.description || '', short: fields['short-description'] || '', body };
};

const CLAUDE_AI_DESCRIPTION_LIMIT = 200;

/**
 * Claude.ai takes Skills but not plugins, one ZIP per skill, and caps the
 * description at 200 characters where the Agent Skills spec allows 1024. Every
 * skill here therefore carries a hand-written `short-description`: truncating
 * the long one would cut the trigger phrases, which are what make a skill fire.
 */
function exportClaudeAi() {
  const out = join(dist, 'claude-ai');
  mkdirSync(out, { recursive: true });
  const skills = readdirSync(skillsDir).filter((s) => existsSync(join(skillsDir, s, 'SKILL.md')));
  const problems = [];

  for (const skill of skills) {
    const src = join(skillsDir, skill, 'SKILL.md');
    const { short, body } = split(readFileSync(src, 'utf8'));
    if (!short) { problems.push(`${skill}: no short-description`); continue; }
    if (short.length > CLAUDE_AI_DESCRIPTION_LIMIT) {
      problems.push(`${skill}: short-description is ${short.length} chars, limit ${CLAUDE_AI_DESCRIPTION_LIMIT}`);
      continue;
    }
    // The ZIP holds a folder named after the skill, with SKILL.md inside.
    const stage = join(out, '.stage', skill);
    mkdirSync(stage, { recursive: true });
    // Each skill is uploaded alone here, so a path that reaches across the
    // plugin resolves to nothing. Flatten them to the copies staged below.
    const flat = body
      .replace(/`skills\/seal-copilot\/references\//g, '`references/')
      .replace(/skills\/seal-copilot\/scripts\//g, 'scripts/')
      .replace(/seal-copilot\/hooks\/schemas\//g, 'schemas/');
    writeFileSync(join(stage, 'SKILL.md'), `---\nname: ${skill}\ndescription: ${JSON.stringify(short)}\n---\n\n${flat}\n`);

    // Skills that lean on a shared reference get their own copy: on Claude.ai
    // each skill is uploaded alone and cannot see its siblings.
    const needed = [...body.matchAll(/`(?:skills\/seal-copilot\/)?references\/([a-z-]+)\.md`/g)].map((m) => m[1]);
    // run-protocol is unconditional: every skill's first line names it, and a
    // skill that arrives without it has no instructions about silence, site
    // resolution or state at all.
    const refs = [...new Set(['run-protocol', 'methodology', ...needed])];
    mkdirSync(join(stage, 'references'), { recursive: true });
    for (const r of refs) {
      const rp = join(refsDir, `${r}.md`);
      if (existsSync(rp)) {
        writeFileSync(join(stage, 'references', `${r}.md`), readFileSync(rp, 'utf8')
          .replace(/`skills\/seal-copilot\/references\//g, '`references/')
          .replace(/skills\/seal-copilot\/scripts\//g, 'scripts/'));
      }
    }
    // The calculator, for any skill that calls it. Claude on the web has no
    // shell, so the skill says so and does the arithmetic itself — but Cowork
    // and a local Codex do, and the file has to be there when they look.
    if (/calc\.mjs/.test(body) || refs.some((r) => /calc\.mjs/.test(
          existsSync(join(refsDir, `${r}.md`)) ? readFileSync(join(refsDir, `${r}.md`), 'utf8') : ''))) {
      mkdirSync(join(stage, 'scripts'), { recursive: true });
      writeFileSync(join(stage, 'scripts', 'calc.mjs'), readFileSync(join(skillsDir, 'seal-copilot', 'scripts', 'calc.mjs'), 'utf8'));
    }
    // The state schemas, for the same reason: they are the contract the skill
    // is told to write to.
    const schemaDir = join(plugin, 'hooks', 'schemas');
    if (existsSync(schemaDir)) {
      mkdirSync(join(stage, 'schemas'), { recursive: true });
      for (const f of readdirSync(schemaDir)) writeFileSync(join(stage, 'schemas', f), readFileSync(join(schemaDir, f), 'utf8'));
    }
  }
  if (problems.length) {
    console.error('Cannot export for Claude.ai:\n' + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }

  const stage = join(out, '.stage');
  for (const skill of readdirSync(stage)) {
    execFileSync('zip', ['-qr', join(out, `${skill}.zip`), skill], { cwd: stage });
  }
  rmSync(stage, { recursive: true, force: true });

  writeFileSync(join(out, 'README.md'), `# Skills for Claude on the web and desktop

Generated from the plugin by \`scripts/export-surfaces.mjs\`. Do not edit these
ZIPs: edit the skills and re-run the export.

## Installing

Claude.ai takes Skills but not plugins, one at a time: **Settings → Features →
Skills**, then upload each \`.zip\` here. Install the ones you will use rather
than all ${skills.length} — every enabled skill's description is weighed on
every message.

Start with \`seal-copilot.zip\` (the analyst itself), \`weekly-health-check.zip\`
and \`diagnose-drop.zip\`.

## Before they can do anything

Add the Sealmetrics connector so Claude can reach the data:
\`https://mcp.sealmetrics.com/mcp\`. You authenticate with your own Sealmetrics
account; no API key to handle.

## What is different from Claude Code

Descriptions are trimmed to Claude.ai's 200-character limit, so a skill fires on
fewer phrasings — name it directly if it does not trigger.

There is no filesystem here, so nothing persists on its own. Every answer
closes with a fenced \`seal-state\` block — the site profile and any open
recommendations. Paste it back at the start of your next conversation, or keep
it in a Project so every conversation there starts with it, and the next report
can follow up on the last one.

There is no shell either, so the arithmetic is done by the model rather than by
\`scripts/calc.mjs\`. The skills say so in the answer when it matters.
`);
  return { skills: skills.length };
}

/**
 * Codex reads the same Agent Skills format — verified against its own plugins,
 * whose SKILL.md files carry the identical `name`/`description` frontmatter and
 * whose manifests are `.codex-plugin/plugin.json` with an explicit `skills`
 * path and an `interface` block. Re-checked against the `openai-bundled` and
 * `openai-primary-runtime` marketplaces that ship with Codex 0.153: the
 * portable `plugin.json` the spec now recommends is not what OpenAI's own
 * plugins use, so this keeps the format that is demonstrably loaded today.
 *
 * Unlike the other surfaces this one writes into the repository root, because
 * that is what makes the one-command install work:
 *
 *     codex plugin marketplace add sealmetrics/seal-copilot
 *
 * A remote marketplace is a git repository with `.agents/plugins/marketplace.json`
 * at its root and the plugins beside it. The tree is therefore generated *and*
 * committed, which is a thing worth doing carefully — `scripts/check.sh` fails
 * the build when the committed tree and a fresh export disagree.
 */
const codexMarketRel = ['.agents', 'plugins', 'marketplace.json'];
const codexPluginDir = join(root, 'plugins', 'seal-copilot');

function exportCodex() {
  rmSync(codexPluginDir, { recursive: true, force: true });
  mkdirSync(join(codexPluginDir, '.codex-plugin'), { recursive: true });

  // Skills travel unchanged; the format is shared.
  const skills = readdirSync(skillsDir).filter((s) => existsSync(join(skillsDir, s, 'SKILL.md')));
  for (const skill of skills) {
    const from = join(skillsDir, skill);
    const to = join(codexPluginDir, 'skills', skill);
    mkdirSync(to, { recursive: true });
    const walk = (a, b) => {
      for (const e of readdirSync(a, { withFileTypes: true })) {
        if (e.isDirectory()) { mkdirSync(join(b, e.name), { recursive: true }); walk(join(a, e.name), join(b, e.name)); }
        else writeFileSync(join(b, e.name), readFileSync(join(a, e.name)));
      }
    };
    walk(from, to);
  }

  const src = JSON.parse(readFileSync(join(plugin, '.claude-plugin', 'plugin.json'), 'utf8'));

  // Codex shows a plugin in its own UI, so it wants an interface block and a
  // logo where the other surfaces want neither. The icons are the one thing
  // that could not be regenerated from the 2026-06 Codex plugin this replaces.
  const assets = join(plugin, 'assets');
  const hasIcons = existsSync(join(assets, 'icon.svg'));
  if (hasIcons) {
    mkdirSync(join(codexPluginDir, 'assets'), { recursive: true });
    for (const f of readdirSync(assets)) writeFileSync(join(codexPluginDir, 'assets', f), readFileSync(join(assets, f)));
  }

  writeFileSync(join(codexPluginDir, '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: src.name,
    version: src.version,
    description: src.description,
    author: src.author,
    homepage: src.homepage,
    repository: REPO_URL,
    license: src.license,
    keywords: src.keywords,
    skills: './skills/',
    interface: {
      displayName: 'Seal Copilot',
      shortDescription: 'Marketing analyst for Sealmetrics',
      longDescription:
        'Diagnose drops, find revenue left on the table, audit catalog friction per SKU, ' +
        'watch the cart during the day and install tracking from scratch — over 100% of ' +
        'your traffic, consentless and unsampled.',
      developerName: 'Sealmetrics',
      category: 'Analytics',
      capabilities: ['Read'],
      websiteURL: 'https://sealmetrics.com',
      privacyPolicyURL: 'https://sealmetrics.com/privacy/',
      termsOfServiceURL: 'https://sealmetrics.com/terms/',
      defaultPrompt: [
        'How was my traffic this week?',
        'Why did conversions drop yesterday?',
        'Where am I leaving money on the table?',
      ],
      brandColor: '#CBFF3D',
      ...(hasIcons ? { composerIcon: './assets/icon.svg', logo: './assets/icon.svg', logoDark: './assets/icon.svg' } : {}),
    },
  }, null, 2) + '\n');

  // The connector travels with the plugin here, where on Claude Code it is the
  // stdio server and a key in the environment. Codex authenticates against
  // Sealmetrics over OAuth on install, so this is one command and no token to
  // copy — the difference between "install it" and "install it, then read a
  // setup page".
  writeFileSync(join(codexPluginDir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      sealmetrics: { type: 'streamable-http', url: 'https://mcp.sealmetrics.com/mcp' },
    },
  }, null, 2) + '\n');

  mkdirSync(join(root, '.agents', 'plugins'), { recursive: true });
  writeFileSync(join(root, ...codexMarketRel), JSON.stringify({
    name: 'sealmetrics',
    interface: { displayName: 'Sealmetrics' },
    plugins: [{
      name: 'seal-copilot',
      source: { source: 'local', path: './plugins/seal-copilot' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Analytics',
    }],
  }, null, 2) + '\n');

  return { skills: skills.length };
}

/**
 * The repository README quotes how many eval cases there are, and it said 32
 * when there were 35. A number kept by hand in prose drifts; this one is
 * generated between markers and `check.sh` fails when it is stale.
 */
function stampReadme() {
  const f = join(root, 'README.md');
  if (!existsSync(f)) return;
  const cases = (readFileSync(join(root, 'evals', 'cases.mjs'), 'utf8').match(/^    id: '/gm) || []).length;
  const before = readFileSync(f, 'utf8');
  const after = before.replace(/<!-- gen:cases -->[\s\S]*?<!-- \/gen:cases -->/,
    `<!-- gen:cases -->${cases} cases<!-- /gen:cases -->`);
  if (after !== before) writeFileSync(f, after);
  return cases;
}

rmSync(dist, { recursive: true, force: true });
const stamped = stampReadme();
if (stamped) console.log(`README.md — ${stamped} eval cases`);
const ai = exportClaudeAi();
console.log(`dist/claude-ai — ${ai.skills} skills as ZIPs`);

// Cowork reads the plugin format unchanged; there is nothing to convert.
const cowork = join(dist, 'cowork');
mkdirSync(cowork, { recursive: true });
for (const name of ['seal-copilot.plugin', 'seal-install.plugin']) {
  const bundle = join(root, name);
  if (existsSync(bundle)) writeFileSync(join(cowork, name), readFileSync(bundle));
}
writeFileSync(join(cowork, 'README.md'), `# Cowork

Cowork reads the same plugin format as Claude Code, so nothing here is
converted: \`seal-copilot.plugin\` is the same bundle, skills, agent, hooks and
MCP server included. Run \`scripts/build-plugin.sh\` to refresh it.

## Installing

**Customize → Plugins** in the Cowork sidebar, then add this file. Plugins are
in beta and install locally to your machine; sharing one across an organisation
is not available yet.

## Before it can do anything

Authorise the bundled connector with your own Sealmetrics account — a browser
login, no token to copy. If your account has more than one site, name the
default:

    SEALMETRICS_SITE_ID=your-site

## What you get

Everything Claude Code gets: every skill, the methodology, the session hooks,
and memory in files on this machine — Cowork has a filesystem, so the
recommendation ledger works, alerts can be listed, and the weekly report opens
by verifying what it told you two weeks ago.

Installing tracking from scratch is the separate \`seal-install\` plugin, which
carries the local MCP server and reads \`SEALMETRICS_API_KEY\` from your
environment.
`);
console.log('dist/cowork — the plugin bundle, unchanged');
const codex = exportCodex();
console.log(`.agents/ + plugins/ — ${codex.skills} skills as the Codex marketplace (committed)`);
