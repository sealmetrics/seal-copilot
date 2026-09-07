import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-healthy',
  summary: 'Nothing is wrong. The report must say so in one line and not manufacture findings.',
};
// Weekly and monthly windows both reconcile: channels sum to the overview,
// campaigns sum to Paid Search.
const W = {
  overview: { entrances: 9850, conversions: 231, revenue: 17900, prev: { entrances: 9610, conversions: 224, revenue: 17250 } },
  channels: [['Organic Search', 4160, 103, 7920, 0.44], ['Paid Search', 2340, 56, 4520, 0.51],
             ['Direct', 1820, 40, 3060, 0.46], ['Paid Social', 980, 21, 1530, 0.58], ['Email', 550, 11, 870, 0.39]],
  campaigns: [['brand-es', 930, 34, 2820, 0.38], ['generic-es', 765, 15, 1030, 0.55], ['retarget-es', 645, 7, 670, 0.62]],
};
const M = {
  overview: { entrances: 41200, conversions: 968, revenue: 74800, prev: { entrances: 40100, conversions: 941, revenue: 72100 } },
  channels: [['Organic Search', 17400, 430, 33100, 0.44], ['Paid Search', 9800, 236, 18900, 0.51],
             ['Direct', 7600, 168, 12800, 0.46], ['Paid Social', 4100, 88, 6400, 0.58], ['Email', 2300, 46, 3600, 0.39]],
  campaigns: [['brand-es', 3900, 142, 11800, 0.38], ['generic-es', 3200, 61, 4200, 0.55], ['retarget-es', 2700, 33, 2900, 0.62]],
};
const weekly = (a = {}) => ['7d', 'this_week', 'wtd', 'last_week'].includes(a.period);
export const tools = {
  list_sites: f.site(),
  get_site: { site_id: 'acct_demo', name: 'demo-store.com', timezone: 'Europe/Madrid', currency: 'EUR' },
  get_overview: (a) => f.overview(weekly(a) ? W.overview : M.overview),
  get_channels: (a) => f.rows('channel', (weekly(a) ? W : M).channels),
  get_top_channels: (a) => f.rows('channel', (weekly(a) ? W : M).channels.slice(0, 3)),
  get_campaigns: (a) => f.rows('utm_campaign', (weekly(a) ? W : M).campaigns),
  get_top_campaigns: (a) => f.rows('utm_campaign', (weekly(a) ? W : M).campaigns),
  get_bot_stats: (a) => f.botStats({ total: (a.days || 30) <= 7 ? 9850 : 41200, botShare: 0.06 }),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  list_property_keys: (a) => f.propertyKeys(a.table === 'conversion_items' ? ['sku', 'price', 'quantity', 'category'] : ['sku', 'category', 'price_range']),
  get_device_types: (a) => f.rows('device_type', weekly(a)
    ? [['desktop', 5260, 136, 10760, 0.42], ['mobile', 4110, 89, 6530, 0.55], ['tablet', 480, 6, 610, 0.5]]
    : [['desktop', 22000, 570, 45000, 0.42], ['mobile', 17200, 372, 27300, 0.55], ['tablet', 2000, 26, 2500, 0.5]]),
  get_conversions: (a) => ({ data: [weekly(a)
    ? { conversion_type: 'purchase', count: 231, revenue: 17900, avg_value: 77.49 }
    : { conversion_type: 'purchase', count: 968, revenue: 74800, avg_value: 77.27 }] }),
};
