#!/usr/bin/env node
// Tests for seal-copilot/skills/seal-copilot/scripts/calc.mjs.
//
// Each operation gets a case built from the fixture library's real response
// shapes, and a case with the wrong shape — because a wrong shape has to be
// loud. A silently wrong number is what the calculator exists to prevent.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as f from './fixtures/_lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CALC = join(here, '..', 'seal-copilot', 'skills', 'seal-copilot', 'scripts', 'calc.mjs');

let fails = 0;
const ok = (name, cond, extra) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) { fails++; if (extra !== undefined) console.log('       got: ' + JSON.stringify(extra)); }
};
const calc = (op, input) => JSON.parse(execFileSync(process.execPath, [CALC, op],
  { input: JSON.stringify(input), encoding: 'utf8' }));
const fails2 = (op, input) => {
  try { execFileSync(process.execPath, [CALC, op], { input: JSON.stringify(input), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); return false; }
  catch { return true; }
};

console.log('delta');
{
  const r = calc('delta', { now: 486, prev: 412 });
  ok('percentage change', r.pct === 17.96, r);
  ok('absolute change', r.abs === 74, r);
  const s = calc('delta', { now: { points: [{ value: 10 }, { value: 20 }] }, prev: { points: [{ value: 5 }, { value: 5 }] } });
  ok('series are summed', s.now === 30 && s.prev === 10 && s.pct === 200, s);
  ok('a zero prior gives no percentage', calc('delta', { now: 5, prev: 0 }).pct === null);
  ok('a missing operand fails loudly', fails2('delta', { now: 1 }));
}

console.log('\nrates');
{
  // The real shape: landing pages send revenue as a string.
  const rows = f.rows('landing_page', [['/', 2000, 40, 3000, 0.5], ['/sale', 1000, 5, 250, 0.8]], { stringRevenue: true });
  const r = calc('rates', rows);
  ok('cr per row', r.rows[0].cr === 2 && r.rows[1].cr === 0.5, r.rows.map(x => x.cr));
  ok('string revenue is coerced', r.rows[0].rpe === 1.5, r.rows[0]);
  ok('aov per row', r.rows[0].aov === 75 && r.rows[1].aov === 50, r.rows.map(x => x.aov));
  ok('totals', r.total.entrances === 3000 && r.total.conversions === 45 && r.total.revenue === 3250, r.total);
  ok('the row name is found', r.rows[0].name === '/', r.rows[0].name);
  ok('a non-array fails loudly', fails2('rates', { nope: 1 }));
}

console.log('\npair-diff');
{
  const now = f.top('channel', [['Organic Search', 4160, 103, 7920], ['Paid Search', 2340, 56, 4520]]);
  const prev = f.top('channel', [['Organic Search', 4050, 100, 7700], ['Email', 530, 10, 700]]);
  const r = calc('pair-diff', { now, prev });
  const organic = r.rows.find(x => x.name === 'Organic Search');
  const paid = r.rows.find(x => x.name === 'Paid Search');
  ok('joined on the dimension', organic.entrances_prev === 4050 && organic.revenue_pct === 2.86, organic);
  ok('a channel absent last period is flagged', paid.in_prev === false, paid);
  ok('a channel gone this period is named', r.missing_now.includes('Email'), r.missing_now);
  ok('one side missing fails loudly', fails2('pair-diff', { now }));
}

console.log('\nimpact');
{
  const r = calc('impact', { gap_rate: 1.2, volume: 2000, value_per_conversion: 77.49, currency: 'EUR' });
  ok('points are read as points', r.extra_conversions === 24, r);
  ok('impact in the given currency', r.impact_month === 1859.76 && r.currency === 'EUR', r);
  const frac = calc('impact', { gap_rate: 0.012, volume: 2000, value_per_conversion: 100 });
  ok('a fraction is read as a fraction', frac.extra_conversions === 24, frac);
  ok('the assumption is stated', /2000 entrances/.test(r.assumption), r.assumption);
}

console.log('\nbaseline-168');
{
  // Four Mondays, three events each at 10:00; one Monday with none at 11:00.
  const events = [];
  for (const d of ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'])
    for (let i = 0; i < 3; i++) events.push({ date: d, hour: 10, timestamp_local: `${d}T10:0${i}:00` });
  events.push({ date: '2026-08-17', hour: 11, timestamp_local: '2026-08-17T11:00:00' });
  const r = calc('baseline-168', { data: events });
  ok('the cell median is across weeks', r.cells.mon['10'].median === 3, r.cells.mon['10']);
  ok('an absent hour is a real zero, not a gap', r.cells.mon['11'].median === 0, r.cells.mon['11']);
  ok('gap is minutes between events', r.cells.mon['10'].gap === 20, r.cells.mon['10']);
  ok('cumulative is monotonic and 24 long', r.cumulative.mon.length === 24 && r.cumulative.mon[23] >= r.cumulative.mon[10], r.cumulative.mon.slice(9, 13));
  ok('weeks counted from distinct dates', r.weeks === 4, r.weeks);
  ok('the busiest cell is named', r.busiest.cell === 'mon 10', r.busiest);
  ok('rows with no date or hour fail loudly', fails2('baseline-168', { data: [{ foo: 1 }] }));
}

console.log('\nsku-join');
{
  const views = f.breakdown('sku', [['SKU-1001', 1000], ['SKU-1002', 500], ['SKU-1003', 20]]);
  const atc = f.breakdown('sku', [['SKU-1001', 100], ['SKU-1002', 10], ['SKU-1003', 10]]);
  const r = calc('sku-join', { views, atc });
  const a = r.rows.find(x => x.sku === 'SKU-1001');
  const b = r.rows.find(x => x.sku === 'SKU-1002');
  const c = r.rows.find(x => x.sku === 'SKU-1003');
  ok('view→atc per sku', a.view_to_atc === 0.1 && b.view_to_atc === 0.02, [a.view_to_atc, b.view_to_atc]);
  ok('below the sample floor is excluded, not dropped', c.eligible === false && r.excluded_low_sample.includes('SKU-1003'), c);
  ok('the site median ignores low-sample skus', r.site_median_view_to_atc === 0.06, r.site_median_view_to_atc);
  ok('friction flagged at ≤40% of median', b.friction === true && a.friction === false, [a.friction, b.friction]);
  ok('a missing pivot fails loudly', fails2('sku-join', { views }));
}

console.log('\nfalse-alarm');
{
  // The real refusal: 4 quiet hours on a site doing 2.4 events a day.
  const r = calc('false-alarm', { count_30d: 72, active_hours_per_day: 16, window_hours: 4 });
  ok('lambda from the rate', r.lambda === 0.6, r);
  ok('a quiet 4h window is likely', r.p_quiet_window > 0.5, r);
  ok('and it is refused', r.verdict === 'too noisy' && r.incidents_per_month > 1, r);
  // Two numbers, not one. Windows and incidents differ by the number of
  // events, because a watcher notifies once per episode of silence and not
  // once per empty window. Conflating them overstated a real site by 25x.
  ok('empty windows and incidents are reported separately',
     r.empty_windows_per_month > r.incidents_per_month, r);
  ok('incidents are events x the quiet probability',
     Math.abs(r.incidents_per_month - 72 * r.p_quiet_window) < 0.05, r);
  ok('and it says both are estimates', /preview/.test(r.note), r.note);
  // A busy store: purchases every few minutes, 4 quiet hours means something.
  const busy = calc('false-alarm', { count_30d: 3000, active_hours_per_day: 16, window_hours: 4 });
  ok('on a busy site the same rule is sound', busy.verdict === 'sound', busy);
  // The case that exposed the mismatch: one lead a month, a four-hour rule.
  const rare = calc('false-alarm', { count_30d: 1, active_hours_per_day: 14, window_hours: 4 });
  ok('a rule on a monthly event names roughly one incident, not a hundred',
     rare.incidents_per_month < 2 && rare.empty_windows_per_month > 50, rare);
  // And the opposite failure, which an incident count alone hides: one
  // incident a month that never closes.
  ok('a permanently open rule is refused for being open, not for firing often',
     rare.verdict === 'too noisy' && rare.share_of_time_firing > 0.9 && /open most of the time/.test(rare.reason), rare);
  const sound = calc('false-alarm', { count_30d: 82, active_hours_per_day: 14, window_hours: 24 });
  ok('a day without CTA clicks on that site is sound', sound.verdict === 'sound', sound);
  ok('and is open only a small share of the time', sound.share_of_time_firing < 0.1, sound);
  ok('lambda scales with volume', busy.lambda === 25, busy.lambda);
  // A daily "fewer than 5" rule on 10 events a day. P(X<5 | λ=10) = 0.0293:
  // asserted against the arithmetic, not against a guess at the magnitude —
  // the first version of this test guessed <0.01 and the calculator was right.
  const thr = calc('false-alarm', { count_30d: 300, active_hours_per_day: 10, window_hours: 10, threshold: 5 });
  ok('a threshold rule uses the Poisson tail', thr.p_quiet_window === 0.0293, thr);
  // A threshold rule is evaluated once per period, so its incident rate is
  // windows x p, not the gap model a silence rule uses. Applying the gap
  // formula to it gave 8.78 incidents a month for a sound rule.
  ok('a threshold rule uses the per-period model', thr.incidents_per_month === 0.88, thr);
  ok('and is sound', thr.verdict === 'sound', thr);
  ok('and reports no share of time, which does not apply', thr.share_of_time_firing === null, thr);
  ok('zero hours fails loudly', fails2('false-alarm', { count_30d: 10, active_hours_per_day: 0, window_hours: 4 }));
}

console.log('\npace');
{
  const points = Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-0${i + 1}`.slice(0, 10), value: 100 }));
  const r = calc('pace', { points, target: 3000, days_in_month: 30 });
  ok('projects the rest of the month', r.projected_month_end === 3000, r);
  ok('and says whether that meets the target', r.on_pace === true && r.pace_pct === 100, r);
  const short = calc('pace', { points, target: 4000, days_in_month: 30 });
  ok('a miss is a miss', short.on_pace === false && short.pace_pct === 75, short);
  ok('a non-array fails loudly', fails2('pace', { nope: 1 }));
}

console.log('\nthe interface itself');
{
  ok('an unknown op fails loudly', fails2('nonsense', {}));
  let empty = false;
  try { execFileSync(process.execPath, [CALC, 'delta'], { input: '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { empty = true; }
  ok('empty stdin fails loudly', empty);
  ok('an MCP envelope is unwrapped',
     calc('delta', { content: [{ type: 'text', text: JSON.stringify({ now: 10, prev: 5 }) }] }).pct === 100);
  ok('every result carries its inputs', calc('delta', { now: 1, prev: 1 }).inputs !== undefined);
}

console.log(`\n${fails === 0 ? 'calc tests passed' : fails + ' calc test(s) FAILED'}`);
process.exit(fails ? 1 : 0);
