import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-bot-spike',
  summary: 'Entrances +42% while revenue fell 10%. 41% of sessions are bots from one referrer. Must not be reported as growth.' };
const ch = [['Referral', 22600, 9, 700, 0.94], ['Organic Search', 17300, 429, 33000, 0.44],
            ['Paid Search', 9700, 233, 18700, 0.51], ['Direct', 7500, 167, 12700, 0.46]];
export const tools = {
  list_sites: f.site(),
  get_overview: f.overview({ entrances: 57100, conversions: 838, revenue: 65100, bounce: 0.79, prev: { entrances: 40100, conversions: 941, revenue: 72100 } }),
  get_channels: f.rows('channel', ch),
  get_top_channels: f.top('channel', ch.slice(0, 3)),
  get_top_referrers: f.top('domain', [['cheap-traffic.example', 21900, 5, 380, 0.95], ['news.example', 700, 4, 320, 0.61]]),
  get_pages: f.rows('path', [['/blog/old-post', 1400, 0, 0, 0.9], ['/landing-2023', 1100, 0, 0, 0.88], ['/', 9100, 210, 16800, 0.41]]),
  get_bot_stats: f.botStats({ total: 57100, botShare: 0.41, top: [{ flag: 'headless_user_agent', hits: 19800 }, { flag: 'no_mouse_events', hits: 17400 }] }),
  get_suspicious_sessions: { data: Array.from({ length: 5 }, (_, i) => ({ session_id: `s${i}`, score: 92, referrer: 'cheap-traffic.example', flags: ['headless_user_agent', 'no_mouse_events'] })) },
  get_conversions: f.conversions([['purchase', 838, 65100]]),
  get_microconversions: (a) => f.micro({ product_view: 21000, add_to_cart: 2700, start_checkout: 1150 },
    { prev: a.compare ? { product_view: 20800, add_to_cart: 2750, start_checkout: 1180 } : null }),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_campaigns: f.rows('utm_campaign', [['brand-es', 3900, 142, 11800, 0.38], ['generic-es', 3200, 61, 4200, 0.55]]),
  get_terms: f.rows('utm_term', [['zapatillas', 900, 12, 980, 0.52]]),
  get_countries: f.rows('country', [['ES', 30000, 700, 54000, 0.5], ['XX', 22600, 9, 700, 0.94], ['PT', 4500, 129, 10400, 0.47]], { stringRevenue: true }),
  list_alerts: { alerts: [] }, list_webhooks: { webhooks: [] }, list_segments: [],
  get_alert_history: { data: [], total: 0 }, get_alert_stats: { total_rules: 0, fired_90d: 0 }, get_webhook_stats: { deliveries: 0, failures: 0 },
};
