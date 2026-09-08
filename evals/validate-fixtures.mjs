#!/usr/bin/env node
// The eval fixtures are reconstructions from documented field names, never
// captured from a live account. If the real API returns a different shape,
// every skill breaks in production while every eval stays green. This calls
// the real server and compares the SHAPE of each response against the
// fixtures.
//
//   SEALMETRICS_API_KEY=sm_... node evals/validate-fixtures.mjs
//   ... --site acct_123        # if the key has several sites
//   ... --save                 # also write real shapes to evals/real-shapes/
//
// Only shapes are recorded — key names and value types, never the values.
// Your traffic figures do not end up on disk or in git.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, unwrap } from './mcp-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const siteId = argv.includes('--site') ? argv[argv.indexOf('--site') + 1] : process.env.SEALMETRICS_SITE_ID;
const save = argv.includes('--save');

if (!process.env.SEALMETRICS_API_KEY) {
  console.error('SEALMETRICS_API_KEY is not set. This check needs a real key — it is the\n' +
                'only thing that proves the fixtures match reality.');
  process.exit(2);
}

// Describe structure, never values.
function shape(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return depth > 3 ? 'array' : `array<${v.length ? shape(v[0], depth + 1) : 'empty'}>`;
  if (typeof v === 'object') {
    if (depth > 3) return 'object';
    return '{' + Object.keys(v).sort().map(k => `${k}:${shape(v[k], depth + 1)}`).join(',') + '}';
  }
  return typeof v;
}
const topKeys = (v) => Array.isArray(v) ? ['<array>'] : (v && typeof v === 'object' ? Object.keys(v).sort() : ['<scalar>']);

// Read-only calls with conservative parameters.
const PROBES = [
  ['get_overview', { period: '30d', compare: 'previous' }],
  ['get_channels', { period: '30d' }],
  ['get_campaigns', { period: '30d', limit: 5 }],
  ['get_conversions', { period: '30d' }],
  ['get_microconversions', { period: '30d' }],
  ['list_microconversion_types', {}],
  ['list_property_keys', { table: 'both' }],
  ['get_countries', { period: '30d', limit: 5 }],
  ['get_device_types', { period: '30d' }],
  ['get_landing_pages', { period: '30d', limit: 5 }],
  ['get_bot_stats', { days: 30 }],
];

const c = connect('npx', ['-y', '@sealmetrics/mcp'], {});
await c.init();

// Fixture shapes to compare against.
const fixtures = {};
for (const f of readdirSync(join(here, 'fixtures')).filter(x => x.endsWith('.mjs') && !x.startsWith('_'))) {
  const m = await import(pathToFileURL(join(here, 'fixtures', f)).href);
  for (const [tool, h] of Object.entries(m.tools || {})) {
    if (fixtures[tool]) continue;
    try { fixtures[tool] = typeof h === 'function' ? h({ period: '30d' }) : h; } catch {}
  }
}

console.log('Comparing fixture shapes against the live Sealmetrics API.\n');
const real = {}; let mismatches = 0, checked = 0, skipped = 0;

for (const [tool, args] of PROBES) {
  if (siteId) args.site_id = siteId;
  let res;
  try { res = unwrap(await c.call(tool, args)); }
  catch (e) { console.log(`  skip  ${tool.padEnd(28)} ${e.message.slice(0, 70)}`); skipped++; continue; }

  real[tool] = { top_level_keys: topKeys(res), shape: shape(res) };
  const fx = fixtures[tool];
  if (!fx) { console.log(`  --    ${tool.padEnd(28)} no fixture covers this tool`); continue; }

  checked++;
  const rKeys = topKeys(res), fKeys = topKeys(fx);
  const missing = fKeys.filter(k => !rKeys.includes(k));
  const extra = rKeys.filter(k => !fKeys.includes(k));

  if (!missing.length && !extra.length) { console.log(`  ok    ${tool}`); continue; }
  mismatches++;
  console.log(`  MISMATCH ${tool}`);
  if (missing.length) console.log(`           fixture has keys the API does not return: ${missing.join(', ')}`);
  if (extra.length)   console.log(`           API returns keys the fixture lacks:       ${extra.join(', ')}`);
  console.log(`           real shape: ${real[tool].shape.slice(0, 220)}`);
}
c.close();

if (save) {
  mkdirSync(join(here, 'real-shapes'), { recursive: true });
  const f = join(here, 'real-shapes', 'shapes.json');
  writeFileSync(f, JSON.stringify(real, null, 2) + '\n');
  console.log(`\nShapes written to ${f} (structure only, no values).`);
}

console.log(`\n${checked} tool(s) compared, ${mismatches} mismatch(es), ${skipped} skipped.`);
if (mismatches) {
  console.log('\nEvery mismatch means a skill is reading a field that does not exist, or\n' +
              'ignoring one that does. Fix the fixtures in evals/fixtures/ to match reality,\n' +
              'then re-run the suite — some cases should start failing, and those failures\n' +
              'are the real bugs this was built to find.');
}
process.exit(mismatches ? 1 : 0);
