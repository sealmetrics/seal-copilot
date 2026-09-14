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
import { connect, unwrap } from './mcp-client.mjs';

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
  // The event taxonomy is not in the schema, so it drifts invisibly too. The
  // live instrumentation guide is built from the same source as the verifier's
  // closed list; every name it writes has to be in evals/taxonomy.json and back.
  const taxDrift = [];
  if (live.get_instrumentation_guide) {
    const u = unwrap(await c.call('get_instrumentation_guide', {}));
    const text = typeof u.value === 'string' ? u.value : JSON.stringify(u.value);
    const seen = { conv: new Set(), micro: new Set() };
    for (const m of text.matchAll(/sealmetrics\.(conv|micro)\(\s*\\?['"]([^'"\\]+)\\?['"]/g)) {
      if (m[2] !== 'event_name') seen[m[1]].add(m[2]);   // the guide's own placeholder
    }
    const taxonomy = JSON.parse(readFileSync(join(here, 'taxonomy.json'), 'utf8'));
    for (const [kind, key] of [['conv', 'conversions'], ['micro', 'microconversions']]) {
      const saved = new Set(taxonomy[key]);
      for (const n of seen[kind]) if (!saved.has(n)) taxDrift.push(`+ ${kind} event in the live guide, not in taxonomy.json: ${n}`);
      for (const n of saved) if (!seen[kind].has(n)) taxDrift.push(`- ${kind} event in taxonomy.json, gone from the live guide: ${n}`);
    }
  } else {
    taxDrift.push('? get_instrumentation_guide is not announced; event taxonomy not checked');
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

  if (taxDrift.length) {
    console.log('Event taxonomy has drifted from evals/taxonomy.json:\n');
    for (const d of taxDrift) console.log('  ' + d);
    console.log('\nEdit taxonomy.json by hand (there is no --update for it), then re-run the linter:\n' +
                'a removed name means some skill now writes an event the verifier rejects.\n');
  }
  const taxFails = taxDrift.filter((d) => !d.startsWith('?')).length;
  if (!drift.length) {
    console.log(`No drift — ${Object.keys(live).length} tools match the snapshot` +
      (taxDrift.length ? '.' : ', and the event taxonomy matches the live guide.'));
    process.exit(taxFails ? 1 : 0);
  }
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
