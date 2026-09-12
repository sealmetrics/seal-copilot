import * as f from './_lib.mjs';
export const meta = { name: 'alerts-drop-with-baseline',
  summary: 'Add-to-cart running at a fraction of the expectation the rule carries. check-alerts must fire on the embedded curve alone, with no stored state and no claim about bot activity.' };

// The rule passed to the skill carries its own `expected` curve, so nothing
// here depends on a baseline file: a scheduled run may have no filesystem at
// all. Today is 8 add-to-carts against an expectation of 60 by any hour —
// a ratio of 0.13 against a 0.5 threshold, at any time of day.
export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_microconversions: (a) => (a.period === 'today'
    ? f.micro({ add_to_cart: 8 })
    : f.micro({ product_view: 41000, add_to_cart: 2680, start_checkout: 910 })),
  get_microconversions_raw: f.rawEvents([]),
  get_microconversion_details: (a) => f.microDetails(a.conversion_type || 'add_to_cart', 8,
    { device: [['desktop', 0.88], ['mobile', 0.12]] }),
  get_overview: f.overview({ entrances: 9850, conversions: 231, revenue: 17900 }),
  get_top_referrers: f.top('referrer', [['google.com', 4100, 96, 7800]]),
};
