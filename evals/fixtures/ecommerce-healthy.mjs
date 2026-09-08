import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-healthy',
  summary: 'Nothing is wrong. The report must say so in one line and not manufacture findings.' };
const W = {
  overview: { entrances: 9850, conversions: 231, revenue: 17900, prev: { entrances: 9610, conversions: 224, revenue: 17250 }, days: 7 },
  channels: [['Organic Search', 4160, 103, 7920, 0.44], ['Paid Search', 2340, 56, 4520, 0.51],
             ['Direct', 1820, 40, 3060, 0.46], ['Paid Social', 980, 21, 1530, 0.58], ['Email', 550, 11, 870, 0.39]],
  channelsPrev: [['Organic Search', 4050, 100, 7700, 0.44], ['Paid Search', 2300, 55, 4400, 0.51],
             ['Direct', 1780, 39, 3000, 0.46], ['Paid Social', 950, 20, 1450, 0.58], ['Email', 530, 10, 700, 0.39]],
  campaigns: [['brand-es', 930, 34, 2820, 0.38], ['generic-es', 765, 15, 1030, 0.55], ['retarget-es', 645, 7, 670, 0.62]],
  campaignsPrev: [['brand-es', 910, 33, 2750, 0.38], ['generic-es', 750, 15, 1000, 0.55], ['retarget-es', 640, 7, 650, 0.62]],
};
const M = {
  overview: { entrances: 41200, conversions: 968, revenue: 74800, prev: { entrances: 40100, conversions: 941, revenue: 72100 } },
  channels: [['Organic Search', 17400, 430, 33100, 0.44], ['Paid Search', 9800, 236, 18900, 0.51],
             ['Direct', 7600, 168, 12800, 0.46], ['Paid Social', 4100, 88, 6400, 0.58], ['Email', 2300, 46, 3600, 0.39]],
  channelsPrev: [['Organic Search', 17000, 420, 32200, 0.44], ['Paid Search', 9500, 230, 18300, 0.51],
             ['Direct', 7400, 164, 12500, 0.46], ['Paid Social', 4000, 85, 6100, 0.58], ['Email', 2200, 42, 3000, 0.39]],
  campaigns: [['brand-es', 3900, 142, 11800, 0.38], ['generic-es', 3200, 61, 4200, 0.55], ['retarget-es', 2700, 33, 2900, 0.62]],
  campaignsPrev: [['brand-es', 3800, 139, 11500, 0.38], ['generic-es', 3100, 60, 4100, 0.55], ['retarget-es', 2600, 31, 2700, 0.62]],
};
const weekly = (a = {}) => ['7d', 'this_week', 'wtd', 'last_week'].includes(a.period);
const pick = (a) => (weekly(a) ? W : M);
const cmp = (a, cur, prev) => (a.compare ? prev : null);
export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  get_overview: (a) => f.overview(pick(a).overview),
  // get_channels has no compare; the calendar-pair call returns last period's rows.
  get_channels: (a) => f.rows('channel', ['last_week', 'last_month', 'last_quarter'].includes(a.period) ? pick(a).channelsPrev : pick(a).channels),
  get_top_channels: (a) => f.top('channel', pick(a).channels.slice(0, 3)),
  get_campaigns: (a) => f.rows('utm_campaign', pick(a).campaigns, { prev: cmp(a, pick(a).campaigns, pick(a).campaignsPrev) }),
  get_top_campaigns: (a) => f.top('utm_campaign', pick(a).campaigns),
  get_bot_stats: (a) => f.botStats({ total: (a.days || 30) <= 7 ? 9850 : 41200, botShare: 0.06 }),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  list_property_keys: (a) => a.table === 'conversion_items'
    ? f.propertyKeys(['sku', 'price', 'quantity', 'category'], { sku: { conv: 968, micro: 0 } })
    : f.propertyKeys(['sku', 'category', 'price_range'], { sku: { conv: 968, micro: 12400 }, category: { conv: 968, micro: 12400 }, price_range: { conv: 968, micro: 0 } }),
  get_property_breakdown: (a) => f.breakdown(a.property_key || 'category',
    a.property_key === 'sku' ? [['SKU-1001', 4800], ['SKU-1002', 3100], ['SKU-1003', 2400]]
    : [['footwear', 5200], ['apparel', 3900], ['accessories', 1600], ['bags', 900]]),
  get_property_values: (a) => f.propertyValues(a.property_key === 'sku'
    ? [['SKU-1001', 'google', 180, 2400, 10600], ['SKU-1001', 'meta', 90, 1900, 5300], ['SKU-1002', 'google', 110, 1500, 4600]]
    : [['footwear', 'meta', 36, 1700, 2620], ['footwear', 'google', 98, 2900, 7900], ['apparel', 'google', 88, 2200, 6800], ['apparel', 'direct', 40, 900, 3100]]),
  get_device_types: (a) => f.share('device_type', weekly(a)
    ? [['desktop', 5260, 136, 10760, 0.42], ['mobile', 4110, 89, 6530, 0.55], ['tablet', 480, 6, 610, 0.5]]
    : [['desktop', 22000, 570, 45000, 0.42], ['mobile', 17200, 372, 27300, 0.55], ['tablet', 2000, 26, 2500, 0.5]]),
  get_devices: (a) => f.devices(weekly(a)
    ? [['desktop', 5260, 136, 10760, 0.42], ['mobile', 4110, 89, 6530, 0.55], ['tablet', 480, 6, 610, 0.5]]
    : [['desktop', 22000, 570, 45000, 0.42], ['mobile', 17200, 372, 27300, 0.55], ['tablet', 2000, 26, 2500, 0.5]],
    { byBrowser: [['Chrome', 24000, 590, 46000, 0.45], ['Safari', 12000, 280, 21000, 0.5], ['Firefox', 5200, 98, 7800, 0.52]] }),
  get_conversions: (a) => f.conversions(weekly(a) ? [['purchase', 231, 17900]] : [['purchase', 968, 74800]],
    { prev: a.compare ? (weekly(a) ? [['purchase', 224, 17250]] : [['purchase', 941, 72100]]) : null }),
  get_microconversions: (a) => f.micro(weekly(a) ? { product_view: 6100, add_to_cart: 720, start_checkout: 310 }
                                                  : { product_view: 25600, add_to_cart: 3020, start_checkout: 1290 },
                                        { prev: a.compare ? { product_view: 25000, add_to_cart: 2950, start_checkout: 1250 } : null }),
  list_segments: [{ id: 1, name: 'All Traffic', is_system: true }, { id: 7, name: 'Returning buyers', is_system: false }],
};
