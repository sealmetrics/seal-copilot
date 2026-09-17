#!/usr/bin/env node
/**
 * Deterministic arithmetic for Seal Copilot.
 *
 * Every number in a report has to be real, and until now the model did the
 * arithmetic in its head: 168-cell medians, pivot joins across SKUs, Poisson
 * false-alarm rates, every delta and ratio. That is the one rule of this plugin
 * with no mechanism behind it. Here the model interprets and this script
 * calculates.
 *
 *   <tool result JSON> | node calc.mjs <op>
 *
 * Reads JSON on stdin, writes JSON on stdout. Never touches the network or the
 * filesystem. Exits 2 with a one-line message when the input is not the shape
 * the operation needs — a wrong shape must be loud, because a silently wrong
 * number is what this exists to prevent.
 *
 * Every result carries `inputs`: the operands actually used. That is what lets
 * the eval suite trace a figure in an answer back to a tool result.
 */

const OPS = {};
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
// Money arrives as "12345.67" from some tools and 12345.67 from others.
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const die = (msg) => { process.stderr.write(msg + '\n'); process.exit(2); };
const pct = (now, prev) => (prev ? r2(((now - prev) / prev) * 100) : null);

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------- delta
// { now, prev } or two series { points: [{date, value}] }.
OPS.delta = (input) => {
  const val = (x) => (x && Array.isArray(x.points)
    ? x.points.reduce((a, p) => a + num(p.value), 0)
    : num(x && typeof x === 'object' ? (x.total ?? x.value) : x));
  if (input.now === undefined || input.prev === undefined) die('delta needs { now, prev }');
  const now = val(input.now), prev = val(input.prev);
  return { now, prev, abs: r2(now - prev), pct: pct(now, prev), inputs: { now, prev } };
};

// ---------------------------------------------------------------- rates
// Rows with entrances / conversions / revenue → cr, rpe, aov per row + totals.
OPS.rates = (input) => {
  const rows = Array.isArray(input) ? input : (input.data || input.rows);
  if (!Array.isArray(rows)) die('rates needs an array of rows, or { data: [...] }');
  const out = rows.map((r) => {
    const e = num(r.entrances), c = num(r.conversions), rev = num(r.revenue);
    return {
      name: r.channel ?? r.utm_campaign ?? r.utm_source ?? r.landing_page ?? r.country ?? r.device_type ?? r.name ?? null,
      entrances: e, conversions: c, revenue: r2(rev),
      cr: e ? r2((c / e) * 100) : null,           // percent, like the API's own
      rpe: e ? r2(rev / e) : null,
      aov: c ? r2(rev / c) : null,
    };
  });
  const t = out.reduce((a, r) => ({ e: a.e + r.entrances, c: a.c + r.conversions, rev: a.rev + r.revenue }), { e: 0, c: 0, rev: 0 });
  return {
    rows: out,
    total: { entrances: t.e, conversions: t.c, revenue: r2(t.rev),
             cr: t.e ? r2((t.c / t.e) * 100) : null, rpe: t.e ? r2(t.rev / t.e) : null, aov: t.c ? r2(t.rev / t.c) : null },
    inputs: { rows: rows.length },
  };
};

// ---------------------------------------------------------------- pair-diff
// Two calendar-pair calls (this_week vs last_week), joined and diffed. The
// tools that return channels take no `compare`, so this is the only honest way.
OPS['pair-diff'] = (input) => {
  const arr = (x) => (Array.isArray(x) ? x : (x && x.data) || null);
  const now = arr(input.now), prev = arr(input.prev);
  if (!now || !prev) die('pair-diff needs { now, prev }, each an array or { data: [...] }');
  const key = (r) => r.channel ?? r.utm_campaign ?? r.utm_source ?? r.utm_medium ?? r.landing_page ?? r.country ?? r.device_type ?? r.name ?? r.conversion_type;
  const byName = new Map(prev.map((r) => [key(r), r]));
  const rows = now.map((r) => {
    const p = byName.get(key(r)) || {};
    const e = num(r.entrances), pe = num(p.entrances);
    const c = num(r.conversions), pc = num(p.conversions);
    const rev = num(r.revenue), prev_ = num(p.revenue);
    return {
      name: key(r), entrances: e, entrances_prev: pe, entrances_pct: pct(e, pe),
      conversions: c, conversions_prev: pc, conversions_pct: pct(c, pc),
      revenue: r2(rev), revenue_prev: r2(prev_), revenue_pct: pct(rev, prev_),
      cr: e ? r2((c / e) * 100) : null, cr_prev: pe ? r2((pc / pe) * 100) : null,
      in_prev: byName.has(key(r)),
    };
  });
  const gone = prev.filter((r) => !now.some((n) => key(n) === key(r))).map((r) => key(r));
  rows.sort((a, b) => Math.abs(num(b.revenue) - num(b.revenue_prev)) - Math.abs(num(a.revenue) - num(a.revenue_prev)));
  return { rows, missing_now: gone, inputs: { now: now.length, prev: prev.length } };
};

// ---------------------------------------------------------------- impact
OPS.impact = (input) => {
  const { gap_rate, volume, value_per_conversion, currency } = input;
  if ([gap_rate, volume, value_per_conversion].some((x) => x === undefined)) {
    die('impact needs { gap_rate, volume, value_per_conversion, currency? }');
  }
  const g = num(gap_rate), v = num(volume), val = num(value_per_conversion);
  // gap_rate may arrive as 1.2 (percentage points) or 0.012 (a fraction).
  const frac = g > 1 ? g / 100 : g;
  const extra = frac * v;
  return {
    extra_conversions: r2(extra),
    impact_month: r2(extra * val),
    currency: currency || null,
    assumption: `closing a ${r2(frac * 100)} point gap on ${v} entrances at ${val} per conversion`,
    inputs: { gap_rate: g, volume: v, value_per_conversion: val },
  };
};

// ---------------------------------------------------------------- baseline-168
// Raw event rows → the watchdog baseline, in the shape the schema requires.
OPS['baseline-168'] = (input) => {
  const rows = Array.isArray(input) ? input : (input.data || input.rows || input.events);
  if (!Array.isArray(rows)) die('baseline-168 needs raw event rows, or { data: [...] }');
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  // Count per (date, hour) first: the median is across WEEKS for that cell, so
  // collapsing straight to day-of-week would average a day with itself.
  const perDay = new Map();
  for (const r of rows) {
    const date = r.date || String(r.timestamp_local || '').slice(0, 10);
    const hour = r.hour !== undefined && r.hour !== null ? Number(r.hour)
      : Number(String(r.timestamp_local || '').slice(11, 13));
    if (!date || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const k = `${date}|${hour}`;
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  if (!perDay.size) die('baseline-168 found no usable rows: every row needs `date` and `hour`');
  // Group each (day-of-week, hour) cell's per-date counts.
  const cellCounts = {}, datesSeen = new Set();
  for (const [k, n] of perDay) {
    const [date, hour] = k.split('|');
    datesSeen.add(date);
    const dow = DAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
    ((cellCounts[dow] ||= {})[hour] ||= []).push(n);
  }
  // A date present in the data with no events in a cell is a real zero, so
  // every cell is measured over the number of distinct dates for its weekday.
  const datesByDow = {};
  for (const d of datesSeen) {
    const dow = DAYS[new Date(d + 'T00:00:00Z').getUTCDay()];
    (datesByDow[dow] ||= new Set()).add(d);
  }
  const cells = {}, cumulative = {}, daily_median = {};
  for (const dow of DAYS) {
    const weeks = (datesByDow[dow] || new Set()).size;
    if (!weeks) continue;
    cells[dow] = {};
    let running = 0;
    const cum = [];
    for (let h = 0; h < 24; h++) {
      const counts = (cellCounts[dow]?.[h] || []).slice();
      while (counts.length < weeks) counts.push(0);     // the zeros are data
      const med = median(counts);
      cells[dow][h] = { median: med, gap: med >= 1 ? Math.round(60 / med) : 60 };
      running += med;
      cum.push(r2(running));
    }
    cumulative[dow] = cum;
    daily_median[dow] = r2(running);
  }
  const weeksOverall = Math.max(...DAYS.map((d) => (datesByDow[d] || new Set()).size));
  const quiet = [];
  for (const [dow, hrs] of Object.entries(cells))
    for (const [h, c] of Object.entries(hrs)) if (c.median > 0 && c.median < 5) quiet.push(`${dow} ${h}`);
  return {
    cells, cumulative, daily_median,
    weeks: weeksOverall,
    busiest: Object.entries(cells).flatMap(([d, hrs]) => Object.entries(hrs).map(([h, c]) => ({ cell: `${d} ${h}`, median: c.median })))
      .sort((a, b) => b.median - a.median)[0] || null,
    quietest_nonzero: quiet.length,
    inputs: { rows: rows.length, dates: datesSeen.size, events: [...perDay.values()].reduce((a, b) => a + b, 0) },
  };
};

// ---------------------------------------------------------------- sku-join
// Two get_property_breakdown pivots (views, add-to-carts) → per-SKU ratios.
OPS['sku-join'] = (input) => {
  const sum = (bd) => {
    const out = new Map();
    const data = bd && (bd.data || bd);
    if (!Array.isArray(data)) die('sku-join needs { views, atc } — each a get_property_breakdown response');
    for (const row of data)
      for (const [value, n] of Object.entries(row.values || {})) out.set(value, (out.get(value) || 0) + num(n));
    return out;
  };
  const views = sum(input.views), atc = sum(input.atc);
  const minViews = input.min_views ?? 30;
  const purchases = new Map();
  for (const row of (input.items?.data || input.items || [])) {
    const k = row.sku ?? row.product_id ?? row.item_id ?? row.properties?.sku;
    if (k) purchases.set(String(k), (purchases.get(String(k)) || 0) + num(row.quantity ?? 1));
  }
  const rows = [...views.entries()].map(([sku, v]) => {
    const a = atc.get(sku) || 0, p = purchases.get(sku) || 0;
    return { sku, views: v, atc: a, purchases: p,
             view_to_atc: v ? r4(a / v) : null,
             atc_to_purchase: a ? r4(p / a) : null };
  });
  const eligible = rows.filter((r) => r.views >= minViews && r.view_to_atc !== null);
  const siteMedian = median(eligible.map((r) => r.view_to_atc));
  const viewMedian = median(rows.map((r) => r.views));
  for (const r of rows) {
    r.eligible = r.views >= minViews;
    r.ratio_vs_median = siteMedian ? r2(r.view_to_atc / siteMedian) : null;
    r.friction = r.eligible && siteMedian > 0 && r.view_to_atc <= 0.4 * siteMedian;
    r.hidden_gem = r.eligible && siteMedian > 0 && r.view_to_atc >= 2 * siteMedian && r.views <= viewMedian;
  }
  rows.sort((a, b) => (a.view_to_atc ?? 1) - (b.view_to_atc ?? 1));
  return {
    rows, site_median_view_to_atc: r4(siteMedian), min_views: minViews,
    excluded_low_sample: rows.filter((r) => !r.eligible).map((r) => r.sku),
    inputs: { skus: rows.length, eligible: eligible.length,
              views_total: [...views.values()].reduce((a, b) => a + b, 0),
              atc_total: [...atc.values()].reduce((a, b) => a + b, 0) },
  };
};

// ---------------------------------------------------------------- false-alarm
// Would this rule fire on a site where nothing is wrong?
OPS['false-alarm'] = (input) => {
  const { count_30d, active_hours_per_day, window_hours } = input;
  if ([count_30d, active_hours_per_day, window_hours].some((x) => x === undefined)) {
    die('false-alarm needs { count_30d, active_hours_per_day, window_hours, threshold? }');
  }
  const n = num(count_30d), ah = num(active_hours_per_day), w = num(window_hours);
  if (ah <= 0 || w <= 0) die('false-alarm needs active_hours_per_day and window_hours above zero');
  const rate = n / (ah * 30);                 // events per active hour
  const lambda = rate * w;                    // expected events in the window
  const threshold = input.threshold ?? 1;     // fires when count < threshold
  // Poisson tail: P(X < threshold) = sum_{k<threshold} e^-λ λ^k / k!
  let p = 0, term = Math.exp(-lambda);
  for (let k = 0; k < threshold; k++) {
    p += term;
    term = term * lambda / (k + 1);
  }
  const windowsPerMonth = 30 * Math.max(1, ah / w);
  const perMonth = windowsPerMonth * p;
  return {
    rate_per_active_hour: r4(rate), lambda: r2(lambda), threshold,
    p_quiet_window: r4(p),
    false_alarms_per_month: r2(perMonth),
    windows_per_month: r2(windowsPerMonth),
    verdict: perMonth > 1 ? 'too noisy' : 'sound',
    inputs: { count_30d: n, active_hours_per_day: ah, window_hours: w, threshold },
  };
};

// ---------------------------------------------------------------- pace
// Month-to-date revenue against a target, weighted by day of week.
OPS.pace = (input) => {
  const points = (input.points || input.series?.points || input);
  if (!Array.isArray(points)) die('pace needs { points: [{date, value}], target?, days_in_month? }');
  const byDow = {};
  for (const p of points) {
    const d = new Date(String(p.date) + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) continue;
    (byDow[d.getUTCDay()] ||= []).push(num(p.value));
  }
  const weight = {};
  const all = points.map((p) => num(p.value));
  const overall = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  for (const [dow, xs] of Object.entries(byDow)) {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    weight[dow] = overall ? r4(mean / overall) : 1;
  }
  const soFar = all.reduce((a, b) => a + b, 0);
  const elapsed = points.length;
  const daysInMonth = input.days_in_month ?? 30;
  const remaining = Math.max(0, daysInMonth - elapsed);
  // Project the remaining days with this month's own weekday rhythm.
  const last = points.length ? new Date(String(points[points.length - 1].date) + 'T00:00:00Z') : null;
  let projected = soFar;
  for (let i = 1; i <= remaining && last; i++) {
    const d = new Date(last.getTime() + i * 86400000);
    projected += overall * (weight[d.getUTCDay()] ?? 1);
  }
  const target = input.target !== undefined ? num(input.target) : null;
  return {
    so_far: r2(soFar), elapsed_days: elapsed, remaining_days: remaining,
    daily_average: r2(overall), projected_month_end: r2(projected),
    target, pace_pct: target ? r2((projected / target) * 100) : null,
    on_pace: target ? projected >= target : null,
    inputs: { points: points.length, days_in_month: daysInMonth, target },
  };
};

// ---------------------------------------------------------------- main
const op = process.argv[2];
if (!op || !OPS[op]) {
  die(`calc: unknown operation ${JSON.stringify(op || '')}. One of: ${Object.keys(OPS).sort().join(', ')}`);
}
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  if (!raw.trim()) die(`calc ${op}: nothing on stdin. Pipe the tool result in.`);
  let input;
  try { input = JSON.parse(raw); }
  catch (e) { die(`calc ${op}: stdin is not JSON (${e.message})`); }
  // Tool results sometimes arrive wrapped in the MCP envelope.
  if (input && input.content && Array.isArray(input.content)) {
    try { input = JSON.parse(input.content[0].text); } catch { /* leave as-is */ }
  }
  let out;
  try { out = OPS[op](input); }
  catch (e) { die(`calc ${op}: ${e.message}`); }
  process.stdout.write(JSON.stringify({ op, ...out }, null, 2) + '\n');
});
