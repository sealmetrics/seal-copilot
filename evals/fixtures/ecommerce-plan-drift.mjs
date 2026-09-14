import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-plan-drift',
  summary: 'A store installed with an approved plan three weeks ago. The data has drifted from it: begin_checkout was planned and never arrives, cta_click arrives without being planned, product_id is planned and missing from every property list, and 26 of the last 200 purchases carry amount 0. setup-audit must audit against the plan and send each finding back to seal-install, not patch it.' };
const purchases = Array.from({ length: 200 }, (_, i) => ({
  conversion_type: 'purchase',
  amount: i % 100 < 13 ? '0.00' : (39 + (i % 7) * 10).toFixed(2),
  timestamp_local: `2026-09-${String(8 + (i % 7)).padStart(2, '0')}T${String(9 + (i % 12)).padStart(2, '0')}:15:00`,
  properties: { currency: 'EUR', items: '[{"quantity":"1","price":"39.00"}]' },
}));
export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  get_overview: f.overview({ entrances: 38400, conversions: 1260, revenue: 61200, prev: { entrances: 37100, conversions: 1190, revenue: 60300 } }),
  list_microconversion_types: f.microTypes(['view_item', 'add_to_cart', 'cta_click']),
  list_property_keys: (a) => a.table === 'conversion_items'
    ? f.propertyKeys(['quantity', 'price'], { quantity: { conv: 1260, micro: 0 }, price: { conv: 1260, micro: 0 } })
    : f.propertyKeys(['currency', 'price', 'quantity', 'cta'], { currency: { conv: 1260, micro: 0 }, price: { conv: 0, micro: 21400 }, quantity: { conv: 0, micro: 2900 }, cta: { conv: 0, micro: 610 } }),
  get_conversions: f.conversions([['purchase', 1260, 61200]]),
  get_conversions_raw: (a) => f.rawEvents(purchases.slice(0, Math.min(Number(a.limit) || 200, 200))),
  get_traffic_mediums: f.rows('utm_medium', [['organic', 18200, 610, 29600, 0.44], ['cpc', 9100, 330, 16100, 0.5], ['(none)', 11100, 320, 15500, 0.46]]),
  get_top_channels: f.top('channel', [['Organic Search', 18200, 610, 29600, 0.44], ['Paid Search', 9100, 330, 16100, 0.5], ['Direct', 11100, 320, 15500, 0.46]]),
  get_traffic_sources: f.rows('utm_source', [['google', 21800, 760, 37000, 0.46]]),
  get_top_campaigns: f.top('utm_campaign', [['brand-es', 6100, 240, 11800, 0.4], ['(not set)', 3000, 90, 4300, 0.6]]),
  get_microconversions: f.micro({ view_item: 21400, add_to_cart: 2900, cta_click: 610 }),
  get_tracking_code: { site_id: 'acct_demo', script_tag: '<script src="https://t.sealmetrics.com/t.js?id=acct_demo" defer></script>', tracker_url: 'https://t.sealmetrics.com/t.js?id=acct_demo',
    js_api: { conversion: { description: '', signatures: [{ call: "sealmetrics.conv('purchase', 149.99, { currency: 'EUR' })", description: 'amount must be a number' }] },
              microconversion: { description: '', signatures: [{ call: "sealmetrics.micro('add_to_cart', { product_id: '123', price: 29.99 })", description: '' }] },
              pageview: { description: '', signatures: [] } },
    implementation_guide: { installation: [], spa_support: '', debugging: '', naming_conventions: [], content_grouping: { description: '', recommended_groups: [], via_js: '', via_url_param: '' } },
    examples: { ecommerce: { code: '', description: '' }, saas: { code: '', description: '' }, blog_media: { code: '', description: '' }, react_nextjs: { code: '', description: '' } } },
  get_troubleshooting_guide: { content: 'Revenue 0 on conversions: the amount was sent as a string; the tracker drops a non-number amount.' },
};
