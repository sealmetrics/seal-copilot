#!/usr/bin/env node
// Fixture arithmetic must hold in every window a skill might ask for: channel
// rows have to sum to the overview. Incoherent fixtures teach wrong maths to
// both the eval assertions and the golden outputs derived from them.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let bad = 0, checked = 0;
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol);

for (const file of readdirSync(here).filter(f => f.endsWith('.mjs') && !f.startsWith('_'))) {
  const m = await import(pathToFileURL(join(here, file)).href);
  const t = m.tools || {};
  const call = (n, a) => { const h = t[n]; if (h === undefined) return null;
    try { return typeof h === 'function' ? h(a) : h; } catch { return null; } };
  let any = false;
  for (const period of ['30d', '7d']) {
    const ov = call('get_overview', { period, compare: 'previous' });
    const ch = call('get_channels', { period });
    if (!ov || !ch?.data) continue;
    any = true; checked++;
    // Real shape: totals live under ov.traffic, and revenue arrives as "1234.56".
    const tr = ov.traffic || ov;
    const sum = k => ch.data.reduce((s, r) => s + Number(r[k] || 0), 0);
    const fails = [['entrances', sum('entrances'), Number(tr.entrances)],
                   ['conversions', sum('conversions'), Number(tr.conversions)],
                   ['revenue', sum('revenue'), Number(tr.revenue)]]
      .filter(([, g, w]) => !near(g, w));
    for (const [k, g, w] of fails) { console.log(`  FAIL  ${file} (${period}): channels ${k} sum ${g} ≠ overview ${w}`); bad++; }
    if (!fails.length) console.log(`  ok    ${file} (${period})`);
  }
  if (!any) console.log(`  skip  ${file} (no overview/channels)`);
}
console.log(bad ? `\n${bad} incoherence(s) across ${checked} windows` : `\nall fixtures coherent (${checked} windows checked)`);
process.exit(bad ? 1 : 0);
