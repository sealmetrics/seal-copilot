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
}

const byKind = errors.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
for (const e of errors) console.log(`${e.file}:${e.line}  [${e.kind}] ${e.msg}`);
console.log(`\n${errors.length} error(s) across ${files.length} markdown files.`,
  Object.keys(byKind).length ? JSON.stringify(byKind) : '');
process.exit(errors.length ? 1 : 0);
