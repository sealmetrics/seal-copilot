#!/usr/bin/env node
// The linter validates every tool call against evals/mcp-schema.json — a
// snapshot. If the server changes a parameter, the snapshot goes stale, the
// linter passes, and production breaks. This re-dumps the live schema and
// fails on any difference.
//
//   node evals/check-schema-drift.mjs           # compare
//   node evals/check-schema-drift.mjs --update  # accept the new schema
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './mcp-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, 'mcp-schema.json');
const update = process.argv.includes('--update');

// tools/list needs no real credentials; a placeholder is enough to start the server.
const c = connect('npx', ['-y', '@sealmetrics/mcp'],
  { SEALMETRICS_API_KEY: process.env.SEALMETRICS_API_KEY || 'sm_schema_probe' });

try {
  await c.init();
  const { tools } = await c.listTools();
  const live = {};
  for (const t of tools) {
    live[t.name] = {
      params: Object.keys(t.inputSchema?.properties || {}).sort(),
      enums: Object.fromEntries(Object.entries(t.inputSchema?.properties || {})
        .filter(([, v]) => v.enum).map(([k, v]) => [k, v.enum])),
    };
  }
  c.close();

  if (update) {
    writeFileSync(file, JSON.stringify(live, null, 2) + '\n');
    console.log(`Updated ${file} — ${Object.keys(live).length} tools. Re-run the linter.`);
    process.exit(0);
  }

  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const drift = [];
  const names = new Set([...Object.keys(saved), ...Object.keys(live)]);
  for (const n of [...names].sort()) {
    if (!saved[n]) { drift.push(`+ new tool: ${n}`); continue; }
    if (!live[n])  { drift.push(`- tool removed: ${n}`); continue; }
    const added = live[n].params.filter(p => !saved[n].params.includes(p));
    const gone  = saved[n].params.filter(p => !live[n].params.includes(p));
    if (added.length) drift.push(`~ ${n}: new parameter(s) ${added.join(', ')}`);
    if (gone.length)  drift.push(`! ${n}: parameter(s) REMOVED ${gone.join(', ')} — skills using them now break`);
    for (const k of new Set([...Object.keys(saved[n].enums || {}), ...Object.keys(live[n].enums || {})])) {
      const a = (saved[n].enums?.[k] || []).join(','), b = (live[n].enums?.[k] || []).join(',');
      if (a !== b) drift.push(`~ ${n}.${k}: allowed values changed`);
    }
  }

  if (!drift.length) { console.log(`No drift — ${Object.keys(live).length} tools match the snapshot.`); process.exit(0); }
  console.log('MCP schema has drifted from evals/mcp-schema.json:\n');
  for (const d of drift) console.log('  ' + d);
  console.log('\nRun with --update to accept, then re-run the linter: a removed parameter\n' +
              'means some skill is now writing a call the server will reject.');
  process.exit(1);
} catch (e) {
  console.error(`Could not reach the Sealmetrics MCP server: ${e.message}`);
  console.error(c.stderr().slice(0, 400));
  console.error('\nThis check needs network access to install @sealmetrics/mcp via npx.');
  process.exit(2);
}
