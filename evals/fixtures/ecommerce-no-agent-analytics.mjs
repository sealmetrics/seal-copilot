import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-no-agent-analytics',
  summary: 'Same shape as the bot spike, but get_bot_stats is zero-filled because agent analytics is off. The skill must say it could not validate, never "0% bots".',
};
const ch = [['Referral', 18600, 12, 900, 0.92], ['Organic Search', 17300, 429, 33000, 0.44],
            ['Paid Search', 9700, 233, 18700, 0.51], ['Direct', 7500, 167, 12700, 0.46],
            ['Paid Social', 4000, 87, 6300, 0.58]];
export const tools = {
  list_sites: f.site(),
  get_overview: f.overview({ entrances: 57100, conversions: 928, revenue: 71600, bounce: 0.74,
    prev: { entrances: 40100, conversions: 941, revenue: 72100 } }),
  get_channels: f.rows('channel', ch),
  get_top_referrers: f.rows('referrer', [['unknown-source.example', 17900, 8, 610, 0.93]]),
  get_bot_stats: f.botStatsDisabled(),
  get_suspicious_sessions: { data: [] },
  get_conversions: { data: [{ conversion_type: 'purchase', count: 928, revenue: 71600, avg_value: 77.16 }] },
};
