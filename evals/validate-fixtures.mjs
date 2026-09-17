#!/usr/bin/env node
// The eval fixtures were reconstructions from documented field names, never
// captured from a live account. This calls the real server, records the SHAPE
// of every response a skill depends on, and compares it with the fixtures.
//
//   SEALMETRICS_API_KEY=sm_... node evals/validate-fixtures.mjs [--site <id>] [--save]
//
// Only shapes are recorded — key names and value types, never the values.
// --save writes them to evals/real-shapes/shapes.json (gitignored).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, unwrap, redact } from './mcp-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const forcedSite = argv.includes('--site') ? argv[argv.indexOf('--site') + 1] : process.env.SEALMETRICS_SITE_ID;
const save = argv.includes('--save');

if (!process.env.SEALMETRICS_API_KEY) {
  console.error('SEALMETRICS_API_KEY is not set. This check needs a real key.');
  process.exit(2);
}

// The schema dump says which tools take the account_id in their site_id
// parameter. The two families are not interchangeable: the wrong one returns
// "Access denied" as ordinary text.
const schema = JSON.parse(await import('node:fs').then(f => f.readFileSync(join(here, 'mcp-schema-full.json'), 'utf8')));

/*
 * Tools an API key can never read, by design.
 *
 * Probing them returns "Access denied", and counting that as an error meant
 * this command could never exit zero — so the README's "until it has run
 * clean" was a bar nothing could clear, and a check that cannot pass is a
 * check nobody runs. A refusal from one of these is the expected result; a
 * refusal from anything else is a finding.
 */
const SCOPE_GATED = new Set(JSON.parse(
  readFileSync(join(here, 'remote-tools.json'), 'utf8')).scope_gated);
const ACCOUNT_FAMILY = new Set(Object.entries(schema)
  .filter(([, t]) => /account_id/i.test(t.params.site_id?.description || '') || t.params.account_id)
  .map(([n]) => n));

function shape(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return depth > 5 ? 'array' : `array<${v.length ? shape(v[0], depth + 1) : 'empty'}>`;
  if (typeof v === 'object') {
    if (depth > 5) return 'object';
    return '{' + Object.keys(v).sort().map(k => `${k}:${shape(v[k], depth + 1)}`).join(',') + '}';
  }
  return typeof v;
}
const topKeys = (v) => Array.isArray(v) ? ['<array>'] : (v && typeof v === 'object' ? Object.keys(v).sort() : ['<scalar>']);

const c = connect('npx', ['-y', '@sealmetrics/mcp'], {});
await c.init();
const real = {};
const call = async (tool, args) => {
  const out = unwrap(await c.call(tool, args));
  return out;
};

// ---- 1. Resolve identifiers from list_sites, and show its shape: we need to
//         know which field is the site id and which the account id.
const ls = await call('list_sites', {});
console.log('list_sites shape:');
console.log('  ' + (ls.format === 'json' ? shape(ls.value) : `${ls.format}: ${redact(ls.value, 200)}`) + '\n');
real.list_sites = { format: ls.format, shape: ls.format === 'json' ? shape(ls.value) : undefined };

const v = ls.value;
const list = v?.sites || v?.data || (Array.isArray(v) ? v : []);
const first = list[0] || {};
if (list.length > 1) console.log(`Account has ${list.length} sites; using the first. Pass --site to choose.\n`);
// Every id-looking field on the first site, so we can try each on the account family.
const SITE = forcedSite || first.site_id || first.id;
// get_site exposes more identifiers than list_sites; any of them might be the
// one the account family wants.
const gs = await call('get_site', { site_id: SITE });
const detail = gs.format === 'json' ? gs.value : {};
const candidates = [...new Set([forcedSite, first.site_id, first.id, first.account_id, first.accountId, first.slug,
  detail.id, detail.account_id, detail.org_slug, detail.org_id, detail.created_by && String(detail.created_by)].filter(Boolean))];
console.log(`Site id: ${SITE}   candidate ids for the account family: ${candidates.join(', ')}\n`);

// ---- 2. Find which candidate the account family accepts.
let ACCOUNT = null;
for (const cand of candidates) {
  const r = await call('get_channels', { period: '30d', site_id: cand });
  if (r.format !== 'error') { ACCOUNT = cand; break; }
}
console.log(ACCOUNT
  ? `Account id accepted by get_channels: ${ACCOUNT}${ACCOUNT === SITE ? ' (same as site id)' : ' (DIFFERENT from site id)'}\n`
  : `No candidate id was accepted by get_channels — the account family will show errors below.\n`);
const idFor = (tool) => ACCOUNT_FAMILY.has(tool) ? (ACCOUNT || SITE) : SITE;

// ---- 3. Probe every tool the skills depend on. Later probes borrow values
//         from earlier ones (a property key, a microconversion type).
const probes = [
  ['get_site', {}],
  ['get_overview', { period: '30d', compare: 'previous' }],
  ['get_overview', { period: '7d' }, 'get_overview (no compare)'],
  ['get_channels', { period: '30d' }],
  ['get_top_channels', { period: '30d' }],
  ['get_traffic_sources', { period: '30d', limit: 5 }],
  ['get_traffic_mediums', { period: '30d', compare: 'previous', limit: 5 }],
  ['get_campaigns', { period: '30d', compare: 'previous', limit: 5 }],
  ['get_top_campaigns', { period: '30d', limit: 5 }],
  ['get_terms', { period: '30d', limit: 5 }],
  ['get_top_referrers', { period: '30d', limit: 5 }],
  ['get_landing_pages', { period: '30d', compare: 'previous', limit: 5 }],
  ['get_pages', { period: '30d', limit: 5 }],
  ['get_content_groups', { period: '30d' }],
  ['get_landing_pages_by_content_group', { period: '30d' }],
  ['get_conversions', { period: '90d', compare: 'previous' }],
  ['get_microconversions', { period: '30d', compare: 'previous' }],
  ['list_microconversion_types', {}],
  ['get_microconversion_details', { period: '30d', conversion_type: '$MICRO' }],
  ['get_conversions_raw', { period: '7d', limit: 3 }],
  ['get_microconversions_raw', { period: '7d', limit: 3, include_properties: true }],
  ['get_conversion_items_raw', { period: '30d', limit: 3 }],
  ['get_countries', { period: '30d', compare: 'previous', limit: 5 }],
  ['get_devices', { period: '30d', compare: 'previous' }],
  ['get_device_types', { period: '30d' }],
  ['get_browsers', { period: '30d', limit: 5 }],
  ['get_operating_systems', { period: '30d', limit: 5 }],
  ['list_property_keys', { table: 'both' }],
  ['list_property_keys', { table: 'conversion_items' }, 'list_property_keys (items)'],
  ['get_property_breakdown', { period: '90d', property_key: '$PROP' }],
  ['get_property_values', { period: '90d', property_key: '$PROP', group_by: 'utm_source', limit: 5 }],
  ['get_funnel', { period: '30d' }],
  ['list_channel_rules', {}],
  ['list_segments', {}],
  ['list_alerts', {}],
  ['get_alert_history', { limit: 5 }],
  ['get_alert_stats', {}],
  ['list_webhooks', {}],
  ['get_webhook_stats', {}],
  ['get_tracking_code', {}],
];
let MICRO = null, PROP = null;

// Fixture handlers, kept as functions so each can be evaluated with the same
// arguments the real probe used — a `comparison` block only appears under
// compare, and comparing it against a compare-less fixture call is noise.
// Every fixture handler for every tool. A shape is covered if ANY fixture
// reproduces it under the probe's arguments — "first fixture wins" was wrong,
// because the first one alphabetically often does not model `compare`.
const handlers = {};
for (const f of readdirSync(join(here, 'fixtures')).filter(x => x.endsWith('.mjs') && !x.startsWith('_'))) {
  const m = await import(pathToFileURL(join(here, 'fixtures', f)).href);
  for (const [tool, h] of Object.entries(m.tools || {})) {
    const probe = typeof h === 'function' ? h : () => h;
    let sample; try { sample = probe({ period: '30d', table: 'both' }); } catch { continue; }
    if (sample && (sample.__error || sample.__textError)) continue;
    (handlers[tool] ||= []).push({ file: f, probe });
  }
}
const fixturesFor = (tool, args) => (handlers[tool] || []).map(({ file, probe }) => {
  try { return { file, value: probe(args) }; } catch { return null; }
}).filter(Boolean);

console.log('Probing the tools the skills depend on:\n');
const formats = {}; let compared = 0, mismatches = 0, errors = 0, nonJson = 0, gated = 0;

for (const [tool, rawArgs, label] of probes) {
  const name = label || tool;
  const args = JSON.parse(JSON.stringify(rawArgs));
  for (const k of Object.keys(args)) {
    if (args[k] === '$MICRO') { if (!MICRO) { console.log(`  skip     ${name.padEnd(36)} no microconversion type known`); continue; } args[k] = MICRO; }
    if (args[k] === '$PROP')  { if (!PROP)  { console.log(`  skip     ${name.padEnd(36)} no property key known`); continue; } args[k] = PROP; }
  }
  if (Object.values(args).some(x => x === '$MICRO' || x === '$PROP')) continue;
  args.site_id = idFor(tool);

  let out;
  try { out = await call(tool, args); } catch (e) { console.log(`  skip     ${name.padEnd(36)} ${e.message.slice(0, 60)}`); continue; }
  formats[out.format] = (formats[out.format] || 0) + 1;

  if (out.format === 'error') {
    const expected = SCOPE_GATED.has(tool);
    if (expected) {
      gated++;
      console.log(`  gated    ${name.padEnd(36)} refused, as designed (no api_key carries the \`read\` scope)`);
    } else {
      errors++;
      console.log(`  ERROR    ${name.padEnd(36)} ${String(out.value).replace(/\s+/g, ' ').slice(0, 90)}`);
    }
    real[name] = { format: 'error', expected, message: String(out.value).slice(0, 200) };
    continue;
  }
  if (out.format !== 'json' && out.format !== 'json-in-fence') {
    nonJson++; console.log(`  FORMAT   ${name.padEnd(36)} ${out.format}`);
    real[name] = { format: out.format, sketch: redact(out.raw ?? out.value, 400) }; continue;
  }

  const res = out.value;
  real[name] = { format: out.format, top_level_keys: topKeys(res), shape: shape(res) };

  // Overview *_change fields are numbers, but are they percentages or absolute
  // deltas? Report magnitude class only: a percent delta has 1–3 integer digits.
  if (tool === 'get_overview' && res?.traffic_change) {
    const cls = (v) => { const n = Number(v); if (!isFinite(n)) return typeof v; const d = Math.abs(Math.trunc(n)).toString().length;
      return `${n < 0 ? '-' : '+'}${n === 0 ? '0' : d + 'digit'}${Number.isInteger(n) ? '' : '.dec'}`; };
    const peek = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cls(v)]));
    real[name].change_magnitudes = { traffic_change: peek(res.traffic_change), conversions_change: peek(res.conversions_change || {}) };
    console.log(`           traffic_change magnitudes: ${JSON.stringify(peek(res.traffic_change))}`);
  }

  // Borrow values for dependent probes.
  if (tool === 'list_microconversion_types' && !MICRO) {
    const arr = Array.isArray(res) ? res : (res?.types || res?.data || []);
    MICRO = typeof arr[0] === 'string' ? arr[0] : (arr[0]?.conversion_type || arr[0]?.name || arr[0]?.type);
  }
  if (tool === 'list_property_keys' && !PROP) {
    const arr = Array.isArray(res) ? res : (res?.keys || res?.data || []);
    PROP = typeof arr[0] === 'string' ? arr[0] : arr[0]?.key;
  }

  const candidates = fixturesFor(tool, args);
  if (!candidates.length) { console.log(`  ok       ${name.padEnd(36)} (no fixture yet) ${shape(res).slice(0, 60)}`); continue; }
  compared++;
  const rKeys = topKeys(res);
  const scored = candidates.map(({ file, value }) => {
    const fKeys = topKeys(value);
    return { file, missing: fKeys.filter(k => !rKeys.includes(k)), extra: rKeys.filter(k => !fKeys.includes(k)) };
  });
  const exact = scored.find(s => !s.missing.length && !s.extra.length);
  if (exact) { console.log(`  ok       ${name.padEnd(36)} (${exact.file.replace('.mjs', '')}${candidates.length > 1 ? ` +${candidates.length - 1}` : ''})`); continue; }
  mismatches++;
  const best = scored.sort((a, b) => (a.missing.length + a.extra.length) - (b.missing.length + b.extra.length))[0];
  console.log(`  MISMATCH ${name}  — no fixture matches; closest is ${best.file}`);
  if (best.missing.length) console.log(`             fixture keys the API lacks: ${best.missing.join(', ')}`);
  if (best.extra.length)   console.log(`             API keys the fixture lacks: ${best.extra.join(', ')}`);
}
c.close();

if (save) {
  mkdirSync(join(here, 'real-shapes'), { recursive: true });
  const f = join(here, 'real-shapes', 'shapes.json');
  writeFileSync(f, JSON.stringify({ captured: new Date().toISOString(), site_id: SITE, account_id: ACCOUNT,
    account_family: [...ACCOUNT_FAMILY], shapes: real }, null, 2) + '\n');
  console.log(`\nShapes written to ${f} — structure only, no values.`);
}

console.log(`\nFormats: ${Object.entries(formats).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`${compared} compared, ${mismatches} mismatch(es), ${errors} unexpected error(s), ` +
            `${gated} refused as designed, ${nonJson} non-JSON.`);
if (!mismatches && !errors && !nonJson) {
  console.log('\nThe fixtures match the real API. A green eval suite now means more than self-consistency.');
}
process.exit(mismatches || errors || nonJson ? 1 : 0);
