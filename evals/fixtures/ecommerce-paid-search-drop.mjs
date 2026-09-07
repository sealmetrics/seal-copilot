import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-paid-search-drop',
  summary: 'One campaign (generic-es) collapsed from 230 conversions to 2. Traffic is flat. The skill must isolate it and not call it seasonal.',
};
// Coherent by construction: campaigns sum to Paid Search, channels sum to overview.
const chNow = [['Organic Search', 17300, 428, 32900, 0.44], ['Paid Search', 14550, 160, 12760, 0.63],
               ['Direct', 7500, 166, 12700, 0.46], ['Paid Social', 4000, 87, 6300, 0.58],
               ['Email', 2300, 45, 3500, 0.39]];
const chPrev = [['Organic Search', 17400, 430, 33100, 0.44], ['Paid Search', 14800, 388, 27200, 0.49],
                ['Direct', 7600, 168, 12800, 0.46], ['Paid Social', 4100, 88, 6400, 0.58],
                ['Email', 2300, 46, 3600, 0.39]];
export const tools = {
  list_sites: f.site(),
  get_site: { site_id: 'acct_demo', name: 'demo-store.com', timezone: 'Europe/Madrid', currency: 'EUR' },
  get_overview: (a) => a.compare === 'yoy'
    // Year over year is also down: this is not seasonality.
    ? f.overview({ entrances: 45650, conversions: 886, revenue: 68160, bounce: 0.52,
        prev: { mode: 'yoy', entrances: 44900, conversions: 1085, revenue: 80400 } })
    : f.overview({ entrances: 45650, conversions: 886, revenue: 68160, bounce: 0.52,
        prev: { entrances: 46200, conversions: 1120, revenue: 83100 } }),
  // No `compare` on get_channels — the skill must call the calendar pair.
  get_channels: (a) => f.rows('channel',
    ['last_week', 'last_month', 'last_quarter', 'last_year'].includes(a.period) ? chPrev : chNow),
  get_top_channels: f.rows('channel', chNow.slice(0, 3)),
  get_campaigns: (a) => f.rows('utm_campaign', a.compare === 'previous'
    ? [['brand-es', 3900, 142, 11800, 0.38], ['generic-es', 8600, 230, 14500, 0.47], ['retarget-es', 2300, 16, 900, 0.61]]
    : [['brand-es', 3850, 142, 11700, 0.38], ['generic-es', 8400, 2, 160, 0.79], ['retarget-es', 2300, 16, 900, 0.61]]),
  get_landing_pages: f.rows('landing_page', [
    ['/collections/sale', 8400, 2, 160, 0.79], ['/', 9100, 210, 16800, 0.41], ['/collections/new', 4200, 96, 7900, 0.44]]),
  get_terms: f.rows('utm_term', [
    ['zapatillas baratas', 5200, 0, 0, 0.83], ['zapatillas running', 3200, 2, 160, 0.71]]),
  get_devices: f.rows('device', [['desktop', 24100, 470, 37200, 0.46], ['mobile', 19300, 386, 28100, 0.58], ['tablet', 2250, 30, 2860, 0.5]]),
  get_bot_stats: f.botStats({ total: 45650, botShare: 0.07 }),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_conversions: { data: [{ conversion_type: 'purchase', count: 886, revenue: 68160, avg_value: 76.93 }] },
};
