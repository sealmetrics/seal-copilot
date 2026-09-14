// Shared builders for fixture responses.
//
// Shapes are copied from a live capture of the Sealmetrics MCP on 2026-09-08
// (evals/real-shapes/shapes.json). Where the real server returns a string for a
// money field, so do these — skills must Number() them.

const r2 = (n) => Math.round(n * 100) / 100;
const pct = (now, prev) => prev ? r2(((now - prev) / prev) * 100) : 0;
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);   // the API sends "12345.67"

export const site = (over = {}) => [{
  site_id: 'acct_demo', name: 'demo-store.com', domains: ['demo-store.com'], timezone: 'Europe/Madrid', ...over,
}];

export const siteDetail = (over = {}) => ({
  id: 'acct_demo', name: 'demo-store.com', domains: ['demo-store.com'], timezone: 'Europe/Madrid',
  currency: 'EUR', is_active: true, is_own: null, lens_tier: 'pro', org_name: null, org_slug: 'demo',
  owner_email: null, created_by: 1, user_count: 2, created_at: '2025-11-02T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', ...over,
});

// A daily series of `days` points that sums to `total`, with a mild weekly rhythm.
const series = (metric, total, days, start = '2026-08-08') => {
  const weights = Array.from({ length: days }, (_, i) => 1 + 0.25 * Math.sin((i / 7) * Math.PI * 2));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const points = weights.map((w, i) => {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), day_of_week: null, hour: null, value: Math.round(total * w / wsum) };
  });
  const sum = points.reduce((a, p) => a + p.value, 0);
  return { metric, points, total: sum, average: r2(sum / days) };
};

// get_overview — nested, with *_change as percentage deltas and daily series.
export const overview = ({ entrances, conversions, revenue, bounce = 0.48, prev = null, days = 30, micro = null }) => {
  const engaged = Math.round(entrances * (1 - bounce));
  const pv = Math.round(entrances * 2.6);
  const microc = micro ?? Math.round(entrances * 0.09);
  const aov = conversions ? revenue / conversions : 0;
  const cr = entrances ? r2((conversions / entrances) * 100) : 0;
  const p = prev || {};
  const pEng = p.entrances ? Math.round(p.entrances * (1 - (p.bounce ?? bounce))) : 0;
  const pPv = p.entrances ? Math.round(p.entrances * 2.6) : 0;
  const pAov = p.conversions ? (p.revenue || 0) / p.conversions : 0;
  const pCr = p.entrances ? r2(((p.conversions || 0) / p.entrances) * 100) : 0;
  const end = new Date('2026-09-06'); const start = new Date(end); start.setUTCDate(end.getUTCDate() - days + 1);
  return {
    date_range: { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), days },
    traffic: { entrances, engaged_entrances: engaged, page_views: pv, bounce_rate: r2(bounce * 100),
               conversions, microconversions: microc, pages_per_session: r2(pv / entrances), revenue: money(revenue) },
    traffic_change: { entrances: pct(entrances, p.entrances), engaged_entrances: pct(engaged, pEng),
                      page_views: pct(pv, pPv), bounce_rate: r2((bounce - (p.bounce ?? bounce)) * 100),
                      conversions: pct(conversions, p.conversions), microconversions: 0,
                      pages_per_session: 0, revenue: money(revenue - (p.revenue || 0)) },
    conversions: { conversions, conversion_rate: cr, average_order_value: money(aov), revenue: money(revenue), microconversions: microc },
    conversions_change: { conversions: pct(conversions, p.conversions), conversion_rate: r2(cr - pCr),
                          average_order_value: money(aov - pAov), revenue: money(revenue - (p.revenue || 0)), microconversions: 0 },
    entrances_series: series('entrances', entrances, days),
    engaged_entrances_series: series('engaged_entrances', engaged, days),
    page_views_series: series('page_views', pv, days),
    conversions_series: series('conversions', conversions, days),
    revenue_series: series('revenue', revenue, days),
    microconversions_series: series('microconversions', microc, days),
    entrances_series_compare: series('entrances', p.entrances || 0, days, '2026-07-09'),
    page_views_series_compare: series('page_views', pPv, days, '2026-07-09'),
    conversions_series_compare: series('conversions', p.conversions || 0, days, '2026-07-09'),
  };
};

// One dimension row. `spec` = [name, entrances, conversions, revenue, bounce?]
// `dim` names the dimension field (channel, utm_campaign, country, ...).
// `stringRevenue` mirrors the API: landing pages and countries send "123.45".
export const row = (dim, spec, { prev = null, stringRevenue = false, extra = {} } = {}) => {
  const [name, entrances, conversions, revenue, bounce = 0.5] = spec;
  const engaged = Math.round(entrances * (1 - bounce));
  const out = {
    [dim]: name, entrances, engaged_entrances: engaged, page_views: Math.round(entrances * 2.6),
    bounces: entrances - engaged, bounce_rate: r2(bounce * 100),
    conversions, conversion_rate: entrances ? r2((conversions / entrances) * 100) : 0,
    microconversions: Math.round(entrances * 0.09),
    revenue: stringRevenue ? money(revenue) : revenue, ...extra,
  };
  if (prev) {
    const [, pe, pc, pr, pb = 0.5] = prev;
    const pEng = Math.round(pe * (1 - pb));
    Object.assign(out, { entrances_prev: pe, engaged_entrances_prev: pEng, page_views_prev: Math.round(pe * 2.6),
      conversions_prev: pc, microconversions_prev: Math.round(pe * 0.09),
      revenue_prev: stringRevenue ? money(pr) : pr });
  }
  return out;
};

// Paginated envelope for the full list tools. Pass `prev` (aligned by name) to
// get *_prev fields on rows and a `comparison` block, as the API does with compare.
export const rows = (dim, list, { prev = null, stringRevenue = false } = {}) => {
  const byName = new Map((prev || []).map(p => [p[0], p]));
  const data = list.map(spec => row(dim, spec, { prev: prev ? byName.get(spec[0]) : null, stringRevenue }));
  const out = { data, has_next: false, page: 1, page_size: data.length, total: data.length };
  if (prev) {
    const sum = (k) => data.reduce((a, r) => a + (r[k] || 0), 0);
    out.comparison = { date_range: { start_date: '2026-07-09', end_date: '2026-08-07' },
      entrances: sum('entrances_prev'), engaged_entrances: sum('engaged_entrances_prev'),
      page_views: sum('page_views_prev'), conversions: sum('conversions_prev'),
      microconversions: sum('microconversions_prev'), revenue: (prev || []).reduce((a, p) => a + p[3], 0) };
  }
  return out;
};

// get_top_* — a bare array, no envelope, never a comparison.
export const top = (dim, list) => list.map(spec => row(dim, spec));

// get_devices — three breakdowns in one response, each with *_prev fields.
export const devices = (byDevice, { byBrowser = [], byOs = [], prev = null } = {}) => {
  const mk = (dim, list) => list.map((spec, i) => {
    const total = list.reduce((a, s) => a + s[1], 0);
    return { ...row(dim, spec, { prev: prev ? (prev[i] || spec) : spec }), percentage: r2((spec[1] / total) * 100) };
  });
  return { by_device: mk('device_type', byDevice), by_browser: mk('browser', byBrowser), by_os: mk('os', byOs) };
};

// get_device_types / get_browsers / get_operating_systems — envelope with percentage.
export const share = (dim, list) => {
  const total = list.reduce((a, s) => a + s[1], 0);
  const data = list.map(spec => ({ ...row(dim, spec), percentage: r2((spec[1] / total) * 100) }));
  return { data, has_next: false, page: 1, page_size: data.length, total: data.length };
};

export const microTypes = (types) => types;                       // array<string>

// get_microconversions — rows carry a by_source breakdown; compare adds a comparison block.
export const micro = (counts, { prev = null, sources = ['google', 'direct', 'meta'] } = {}) => {
  const data = Object.entries(counts).map(([conversion_type, count]) => ({
    conversion_type, count,
    by_source: sources.map((utm_source, i) => {
      const c = Math.round(count * [0.5, 0.3, 0.2][i]);
      return { utm_source, utm_medium: utm_source === 'direct' ? '(none)' : 'cpc', utm_campaign: '(not set)',
               utm_content: '', utm_term: '', count: c, percentage: r2((c / count) * 100) };
    }),
  }));
  const out = { data, has_next: false, page: 1, page_size: data.length, total: data.length };
  if (prev) out.comparison = { date_range: { start_date: '2026-07-09', end_date: '2026-08-07' },
    microconversions: Object.values(prev).reduce((a, b) => a + b, 0) };
  return out;
};

// get_microconversion_details — the breakdowns are built in; no group_by needed.
export const microDetails = (type, total, { device = null, source = null, country = null, landing = null } = {}) => {
  const split = (dim, parts) => (parts || []).map(([name, share]) => ({ [dim]: name, count: Math.round(total * share), percentage: r2(share * 100) }));
  return {
    conversion_type: type, date_from: '2026-08-08', date_to: '2026-09-06', totals: { count: total },
    by_device: split('device_type', device || [['desktop', 0.55], ['mobile', 0.4], ['tablet', 0.05]]),
    by_country: split('country', country || [['ES', 0.7], ['PT', 0.15], ['FR', 0.15]]),
    by_landing_page: split('landing_page', landing || [['/', 0.6], ['/collections/sale', 0.4]]),
    by_source: (source || [['google', 'cpc', 0.5], ['direct', '(none)', 0.3], ['meta', 'cpc', 0.2]])
      .map(([utm_source, utm_medium, s]) => ({ utm_source, utm_medium, count: Math.round(total * s), percentage: r2(s * 100) })),
  };
};

// list_property_keys — objects with counts, not names.
export const propertyKeys = (keys, counts = {}) => keys.map(key => {
  const c = counts[key] || { conv: 900, micro: 4800 };
  return { key, conversions_count: c.conv, microconversions_count: c.micro, total_count: c.conv + c.micro };
});

// get_property_breakdown — pivoted by UTM, `values` is an object {value: count}.
// No revenue here; revenue-per-value lives in get_property_values.
export const breakdown = (key, pairs, { sources = [['google', 'cpc', '(not set)'], ['direct', '(none)', '(not set)']] } = {}) => {
  const total = pairs.reduce((a, [, n]) => a + n, 0);
  const data = sources.map(([utm_source, utm_medium, utm_campaign], i) => {
    const w = i === 0 ? 0.6 : 0.4;
    const values = Object.fromEntries(pairs.map(([v, n]) => [v, Math.round(n * w)]));
    return { utm_source, utm_medium, utm_campaign, total: Object.values(values).reduce((a, b) => a + b, 0), values };
  });
  return { property_key: key, property_values: pairs.map(([v]) => v), total_events: total,
           date_from: '2026-08-08', date_to: '2026-09-06', data };
};

// get_property_values — one row per (value, source), with counts and revenue.
export const propertyValues = (rowsSpec) => {
  const data = rowsSpec.map(([property_value, utm_source, conv, micro, revenue]) =>
    ({ property_value, utm_source, conversions_count: conv, microconversions_count: micro, revenue }));
  return { data, has_next: false, page: 1, page_size: data.length, total: data.length };
};

// get_conversions — envelope; rows carry avg_value; compare adds comparison.
export const conversions = (list, { prev = null } = {}) => {
  const data = list.map(([conversion_type, count, revenue]) =>
    ({ conversion_type, count, revenue, avg_value: count ? r2(revenue / count) : 0 }));
  const out = { data, has_next: false, page: 1, page_size: data.length, total: data.length };
  if (prev) out.comparison = { date_range: { start_date: '2026-07-09', end_date: '2026-08-07' },
    conversions: prev.reduce((a, p) => a + p[1], 0), revenue: prev.reduce((a, p) => a + p[2], 0) };
  return out;
};

// Raw event rows — envelope, with `date` and `hour` alongside the timestamps.
export const rawEvents = (events) => {
  const data = events.map(e => {
    const ts = e.timestamp_local || '2026-09-05T14:12:00';
    return { conversion_type: e.conversion_type || 'add_to_cart', date: ts.slice(0, 10), hour: parseInt(ts.slice(11, 13), 10),
      timestamp_local: ts, timestamp_utc: ts.replace('T', 'T').slice(0, 19) + 'Z',
      device_type: e.device_type || 'desktop', browser: 'Chrome', os: 'macOS', country: 'ES', country_name: 'Spain',
      channel_group: e.channel_group || 'Paid Search', landing_page: e.landing_page || '/',
      utm_source: e.utm_source || 'google', utm_medium: 'cpc', utm_campaign: '(not set)', utm_content: '', utm_term: '',
      properties: e.properties || {} };
  });
  return { data, has_next: false, page: 1, page_size: data.length, total: data.length };
};
