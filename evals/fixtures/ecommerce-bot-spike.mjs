import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-bot-spike',
  summary: 'Entrances +42% while revenue fell 10%. 41% of sessions are bots from one referrer. Must not be reported as growth.',
};
const ch = [['Referral', 22600, 9, 700, 0.94], ['Organic Search', 17300, 429, 33000, 0.44],
            ['Paid Search', 9700, 233, 18700, 0.51], ['Direct', 7500, 167, 12700, 0.46]];
export const tools = {
  list_sites: f.site(),
  get_overview: f.overview({ entrances: 57100, conversions: 838, revenue: 65100, bounce: 0.79,
    prev: { entrances: 40100, conversions: 941, revenue: 72100 } }),
  get_channels: f.rows('channel', ch),
  get_top_channels: f.rows('channel', ch.slice(0, 3)),
  get_top_referrers: f.rows('referrer', [['cheap-traffic.example', 21900, 5, 380, 0.95], ['news.example', 700, 4, 320, 0.61]]),
  get_bot_stats: f.botStats({ total: 57100, botShare: 0.41,
    top: [{ flag: 'headless_user_agent', hits: 19800 }, { flag: 'no_mouse_events', hits: 17400 }] }),
  get_suspicious_sessions: { data: Array.from({ length: 5 }, (_, i) => ({
    session_id: `s${i}`, score: 92, referrer: 'cheap-traffic.example',
    flags: ['headless_user_agent', 'no_mouse_events'] })) },
  get_conversions: { data: [{ conversion_type: 'purchase', count: 838, revenue: 65100, avg_value: 77.68 }] },
};
