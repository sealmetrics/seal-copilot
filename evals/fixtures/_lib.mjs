// Shared builders for fixture responses.
//
// CAVEAT: these shapes are reconstructed from the field names the Sealmetrics
// MCP documents (entrances, engaged_entrances, page_views, bounce_rate,
// conversions, revenue, total_hits). They are NOT captured from a live
// account. They are sufficient to exercise skill *logic* — does it isolate the
// right campaign, does it refuse to claim 0% bots — but replace them with
// recorded real responses as soon as an API key is available.

export const site = (over = {}) => ({
  sites: [{ site_id: 'acct_demo', name: 'demo-store.com', url: 'https://demo-store.com',
            timezone: 'Europe/Madrid', currency: 'EUR', ...over }],
});

export const overview = ({ entrances, conversions, revenue, bounce = 0.48, prev = null }) => ({
  period: { start: '2026-08-08', end: '2026-09-06', timezone: 'Europe/Madrid' },
  entrances, engaged_entrances: Math.round(entrances * (1 - bounce)),
  page_views: Math.round(entrances * 2.6), bounce_rate: bounce,
  conversions, revenue, avg_order_value: conversions ? +(revenue / conversions).toFixed(2) : 0,
  ...(prev ? { comparison: { mode: 'previous', ...prev } } : {}),
});

export const rows = (name, list) => ({ data: list.map(r => ({ [name]: r[0], entrances: r[1],
  conversions: r[2], revenue: r[3], bounce_rate: r[4] ?? 0.5,
  engaged_entrances: Math.round(r[1] * (1 - (r[4] ?? 0.5))) })) });

export const botStats = ({ total, botShare, top = [] }) => ({
  total_hits: total,
  score_distribution: total ? { '0-25': Math.round(total * (1 - botShare)), '75-100': Math.round(total * botShare) } : { '0-25': 0, '75-100': 0 },
  bot_share: total ? botShare : 0,
  top_flags: top,
});

// An account with agent analytics switched off returns a zero-filled payload —
// NOT a real 0% bot rate. Skills must not read this as "clean".
export const botStatsDisabled = () => botStats({ total: 0, botShare: 0 });

export const microTypes = (types) => ({ types: types.map(t => ({ conversion_type: t })) });

export const micro = (counts) => ({ data: Object.entries(counts).map(([conversion_type, count]) => ({ conversion_type, count })) });

export const propertyKeys = (keys) => ({ keys });

export const breakdown = (key, pairs) => ({ property_key: key,
  values: pairs.map(([value, count, revenue = 0]) => ({ value, count, revenue })) });
