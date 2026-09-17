import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-paid-search-drop',
  summary: 'One campaign (generic-es) collapsed from 230 conversions to 2. Traffic is flat. The skill must isolate it and not call it seasonal.' };
const chNow = [['Organic Search', 17300, 428, 32900, 0.44], ['Paid Search', 14550, 160, 12760, 0.63],
               ['Direct', 7500, 166, 12700, 0.46], ['Paid Social', 4000, 87, 6300, 0.58], ['Email', 2300, 45, 3500, 0.39]];
const chPrev = [['Organic Search', 17400, 430, 33100, 0.44], ['Paid Search', 14800, 388, 27200, 0.49],
                ['Direct', 7600, 168, 12800, 0.46], ['Paid Social', 4100, 88, 6400, 0.58], ['Email', 2300, 46, 3600, 0.39]];
const campNow  = [['brand-es', 3850, 142, 11700, 0.38], ['generic-es', 8400, 2, 160, 0.79], ['retarget-es', 2300, 16, 900, 0.61]];
const campPrev = [['brand-es', 3900, 142, 11800, 0.38], ['generic-es', 8600, 230, 14500, 0.47], ['retarget-es', 2300, 16, 900, 0.61]];
export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  get_overview: (a) => a.compare === 'yoy'
    ? f.overview({ entrances: 45650, conversions: 886, revenue: 68160, bounce: 0.52, prev: { entrances: 44900, conversions: 1085, revenue: 80400 } })
    : f.overview({ entrances: 45650, conversions: 886, revenue: 68160, bounce: 0.52, prev: { entrances: 46200, conversions: 1120, revenue: 83100 } }),
  get_channels: (a) => f.channels('channel', ['last_week', 'last_month', 'last_quarter', 'last_year'].includes(a.period) ? chPrev : chNow),   // works with an api_key: the channel-groups router takes sites:read
  get_top_channels: (a) => f.top('channel', ['last_week', 'last_month', 'last_quarter', 'last_year'].includes(a.period) ? chPrev : chNow),
  get_campaigns: (a) => f.rows('utm_campaign', campNow, { prev: a.compare ? campPrev : null }),
  get_top_campaigns: f.top('utm_campaign', campNow),
  get_landing_pages: (a) => f.rows('landing_page',
    [['/collections/sale', 8400, 2, 160, 0.79], ['/', 9100, 210, 16800, 0.41], ['/collections/new', 4200, 96, 7900, 0.44]],
    { stringRevenue: true, prev: a.compare ? [['/collections/sale', 8600, 230, 14500, 0.47], ['/', 9000, 208, 16600, 0.41], ['/collections/new', 4100, 94, 7700, 0.44]] : null }),
  get_terms: f.rows('utm_term', [['zapatillas baratas', 5200, 0, 0, 0.83], ['zapatillas running', 3200, 2, 160, 0.71]]),
  get_devices: f.devices([['desktop', 24100, 470, 37200, 0.46], ['mobile', 19300, 386, 28100, 0.58], ['tablet', 2250, 30, 2860, 0.5]],
    { byBrowser: [['Chrome', 26000, 520, 40000, 0.5], ['Safari', 14000, 290, 22000, 0.55], ['Firefox', 5650, 76, 6160, 0.53]],
      byOs: [['Windows', 18000, 360, 28000, 0.48], ['iOS', 12000, 240, 18000, 0.57], ['macOS', 9000, 190, 14000, 0.44], ['Android', 6650, 96, 8160, 0.6]] }),
  get_browsers: f.share('browser', [['Chrome', 26000, 520, 40000, 0.5], ['Safari', 14000, 290, 22000, 0.55], ['Firefox', 5650, 76, 6160, 0.53]]),
  get_operating_systems: f.share('os', [['Windows', 18000, 360, 28000, 0.48], ['iOS', 12000, 240, 18000, 0.57], ['macOS', 9000, 190, 14000, 0.44], ['Android', 6650, 96, 8160, 0.6]]),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_conversions: (a) => f.conversions([['purchase', 886, 68160]], { prev: a.compare ? [['purchase', 1120, 83100]] : null }),
  get_microconversions: (a) => f.micro({ product_view: 28000, add_to_cart: 2500, start_checkout: 1040 },
    { prev: a.compare ? { product_view: 28400, add_to_cart: 3300, start_checkout: 1380 } : null }),
};
