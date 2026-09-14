#!/usr/bin/env node
// Validates every Sealmetrics MCP tool call written in the plugin's markdown
// against the real server schema (evals/mcp-schema.json).
// Usage: node evals/lint-tool-calls.mjs [rootDir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || join(here, '..', 'seal-copilot');
const schema = JSON.parse(readFileSync(join(here, 'mcp-schema.json'), 'utf8'));
const TOOLS = new Set(Object.keys(schema));

// Two tools exist in the schema and must still never be called, and twenty more
// are not announced by the connector nearly every user has. The schema check
// below cannot see either problem: both are perfectly valid calls that fail in
// production. See evals/tool-availability.json and PRD E14.
const availability = JSON.parse(readFileSync(join(here, 'tool-availability.json'), 'utf8'));
const FORBIDDEN = new Set(availability.forbidden.tools);
const GATED = new Set(availability.gated.tools);
const REFUSAL = availability.markers.refusal;
const LOCAL_ONLY = availability.markers.localOnly.toLowerCase();
const LOCAL_ROOTS = availability.localOnlyRoots;

// The closed event taxonomy. A tool call can be schema-perfect and still write
// an event verify_event_instrumented rejects; seal-install 1.12.0 recommended
// eight such names. See evals/taxonomy.json and docs/PRD-plan-simulate-v1.md, E1.
const taxonomy = JSON.parse(readFileSync(join(here, 'taxonomy.json'), 'utf8'));
const EVENTS = { conv: new Set(taxonomy.conversions), micro: new Set(taxonomy.microconversions) };
const LEGACY = taxonomy.legacyNames.names;
const WRITERS = taxonomy.writers.paths;
const EXISTING_NAME = taxonomy.writers.existingNameMarkers;

// Emphasis sits inside phrases we match on: "It is **not** supported on" has to
// read as "not supported". Strip the markers before looking for one.
const plain = (text) => text.toLowerCase().replace(/[*_]+/g, '');
const hasRefusal = (text) => { const t = plain(text); return REFUSAL.some((k) => t.includes(k)); };

/**
 * Split a markdown file into blocks (separated by blank lines), then each block
 * into sentences and table cells, keeping the line number each one started on.
 *
 * Block-first matters: soft-wrapped prose has to be rejoined before sentences
 * can be found, but flattening the whole file would let a refusal marker in one
 * paragraph excuse a call instruction in the next.
 */
function units(raw) {
  const out = [];
  const lines = raw.split('\n');
  let block = [], start = 0, heading = '';
  const flush = () => {
    if (!block.length) return;
    const flat = block.join(' ').replace(/\s+/g, ' ');
    if (/^#{1,6}\s/.test(block[0])) heading = flat;
    for (const piece of flat.split(/(?<=[.!?])\s+|\|/)) {
      if (piece.trim()) out.push({ text: piece, line: start + 1, block: flat, heading });
    }
    block = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) { flush(); continue; }
    if (!block.length) start = i;
    block.push(lines[i].trim());
  }
  flush();
  return out;
}

// `(local only)` marks a STEP, so it is inherited: writing it once on the
// section heading covers every sentence under that heading. Requiring it on
// each sentence would push authors to sprinkle it, which is how a marker stops
// being read.
const isLocalOnly = (u) =>
  [u.text, u.block, u.heading].some((t) => plain(t || '').includes(plain(LOCAL_ONLY)));

// Identifiers that match the tool-name shape but are state fields, config keys
// or prose — not MCP tools. Extend deliberately, never to silence a real bug.
const NOT_TOOLS = new Set([
  'verify_on', 'verify_setup_status',
  'list_of', 'get_started', 'search_engine', 'detect_the', 'update_the',
]);
// Argument values that are placeholders, not literals.
const isPlaceholder = (v) => !v || /^[<{]/.test(v) || /^\.\.\.$/.test(v) || v.includes('|');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

function splitArgs(s) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '<' || ch === '[' || ch === '{') depth++;
    if (ch === '>' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth <= 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(x => x.trim()).filter(Boolean);
}

const errors = [];
const files = walk(root);

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  // Collapse soft-wrapped calls: join a line with the next while parens are unbalanced.
  const flat = raw.replace(/\s*\n\s*/g, ' ');
  const rel = relative(join(here, '..'), file);

  const lineOf = (needle) => {
    const key = needle.slice(0, 40).replace(/\s+/g, ' ');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].replace(/\s+/g, ' ').includes(key.split(' ')[0])) return i + 1;
    }
    return 0;
  };

  // 1. Unknown tool-looking identifiers.
  const idRe = /\b((?:get|list|create|update|delete|verify|test|import|search|provision|detect)_[a-z_]+)\b/g;
  let m;
  const seenUnknown = new Set();
  while ((m = idRe.exec(flat))) {
    const name = m[1];
    if (TOOLS.has(name) || seenUnknown.has(name) || NOT_TOOLS.has(name)) continue;
    if (name.endsWith('_')) continue;                // globs like get_top_*
    // Ignore words that are clearly domain vocabulary, not tool calls.
    if (/^(get_started|list_of|test_the|search_engine|verify_that|detect_the|update_the|create_a|delete_the|import_the|provision_the)/.test(name)) continue;
    seenUnknown.add(name);
    errors.push({ file: rel, line: lineOf(name), kind: 'unknown-tool', msg: `\`${name}\` is not a tool in the MCP schema` });
  }

  // 2. Parameter and enum validation on explicit calls.
  const callRe = /\b([a-z_]+)\s*\(([^()]*)\)/g;
  while ((m = callRe.exec(flat))) {
    const [, name, argstr] = m;
    if (!TOOLS.has(name)) continue;
    const def = schema[name];
    for (const arg of splitArgs(argstr)) {
      const eq = arg.indexOf('=');
      if (eq < 0) continue;                       // prose like `get_channels(full list)`
      const key = arg.slice(0, eq).trim();
      const val = arg.slice(eq + 1).trim().replace(/[`'"]/g, '');
      if (!/^[a-z_]+$/.test(key)) continue;
      if (!def.params.includes(key)) {
        errors.push({ file: rel, line: lineOf(name + '('), kind: 'bad-param',
          msg: `${name}(${key}=…) — no such parameter. Valid: ${def.params.join(', ')}` });
        continue;
      }
      const en = def.enums?.[key];
      if (en && !isPlaceholder(val) && !en.includes(val)) {
        errors.push({ file: rel, line: lineOf(name + '('), kind: 'bad-enum',
          msg: `${name}(${key}=${val}) — not allowed. Valid: ${en.join(', ')}` });
      }
    }
  }

  // 3. Tools that exist in the schema but must not be called, and tools the
  //    default connector does not announce. Both are invisible to rules 1-2.
  const localRoot = LOCAL_ROOTS.some((r) => rel.split('/').includes(r));
  for (const u of units(raw)) {
    for (const name of new Set([...FORBIDDEN, ...GATED])) {
      if (!new RegExp(`\\b${name}\\b`).test(u.text)) continue;
      if (hasRefusal(u.text)) continue;
      if (FORBIDDEN.has(name)) {
        errors.push({ file: rel, line: u.line, kind: 'forbidden-tool',
          msg: `\`${name}\` must never be called. Name it only in a sentence that says so (${REFUSAL.slice(0, 4).join(', ')}…): "${u.text.trim().slice(0, 70)}"` });
        continue;
      }
      if (localRoot || isLocalOnly(u)) continue;
      errors.push({ file: rel, line: u.line, kind: 'gated-tool',
        msg: `\`${name}\` is not announced by the remote connector. Mark the step \`${availability.markers.localOnly}\` or say it is unavailable: "${u.text.trim().slice(0, 70)}"` });
    }
  }

  // 4. Tracker calls. A literal event name must be in the closed taxonomy for
  //    its kind, anywhere: a snippet in any skill or golden output gets pasted.
  const trackerRe = /\b(?:window\.)?(?:sealmetrics|_?sm)\??\.(conv|micro)\(\s*['"]([^'"]+)['"]/g;
  while ((m = trackerRe.exec(flat))) {
    const [, kind, name] = m;
    if (name.endsWith('_') || EVENTS[kind].has(name)) continue;
    const other = kind === 'conv' ? 'micro' : 'conv';
    const hint = EVENTS[other].has(name) ? ` It is a ${other === 'conv' ? 'conversion' : 'microconversion'}: use sealmetrics.${other}().`
      : LEGACY[name] ? ` Write ${LEGACY[name]}.` : '';
    errors.push({ file: rel, line: lineOf(`.${kind}(`), kind: 'event-name',
      msg: `sealmetrics.${kind}('${name}') — not in the closed ${kind} taxonomy; verify_event_instrumented rejects it.${hint}` });
  }
  //    The tracker has no command-style API. `sm('event', …)` was written from
  //    memory into a golden output and is exactly what a developer would paste.
  const inventedRe = /\b_?(?:sm|sealmetrics)\(\s*['"](?:event|track|conversion|micro)['"]/g;
  while ((m = inventedRe.exec(flat))) {
    errors.push({ file: rel, line: lineOf(m[0]), kind: 'invented-api',
      msg: `\`${m[0]}…\` is not the tracker API. Use the fetched js_api signatures: sealmetrics.conv(type, amount, props) / sealmetrics.micro(type, props)` });
  }

  // 5. Files that tell someone which event to write must not recommend a legacy
  //    name, unless the sentence says it is what the site already fires. Analysis
  //    skills are outside this rule: they have to recognise those names in data.
  const writer = WRITERS.some((p) => rel === p || rel.startsWith(p + '/'));
  if (writer) {
    for (const u of units(raw)) {
      for (const [name, instead] of Object.entries(LEGACY)) {
        // A quoted value is a property ('demo_request' as a form_name), not an event.
        if (!new RegExp(`(?<!['"])\\b${name}\\b(?!['"])`).test(u.text)) continue;
        if (EXISTING_NAME.some((k) => plain(u.text).includes(plain(k)))) continue;
        errors.push({ file: rel, line: u.line, kind: 'legacy-event',
          msg: `\`${name}\` is outside the closed taxonomy and cannot be verified. Recommend ${instead}, or say it is the site's existing name: "${u.text.trim().slice(0, 70)}"` });
      }
    }
  }
}

const byKind = errors.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
for (const e of errors) console.log(`${e.file}:${e.line}  [${e.kind}] ${e.msg}`);
console.log(`\n${errors.length} error(s) across ${files.length} markdown files.`,
  Object.keys(byKind).length ? JSON.stringify(byKind) : '');
process.exit(errors.length ? 1 : 0);
