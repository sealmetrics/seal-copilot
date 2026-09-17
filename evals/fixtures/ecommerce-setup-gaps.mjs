import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-setup-gaps',
  summary: 'Tracking is half-done: no product id on add_to_cart, no checkout event, no revenue, paid traffic misclassified as Referral. setup-audit must find these and not invent a score.' };
export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  get_overview: f.overview({ entrances: 41200, conversions: 968, revenue: 0, prev: { entrances: 40100, conversions: 941, revenue: 0 } }),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart']),          // no start_checkout
  list_property_keys: (a) => a.table === 'conversion_items' ? []                        // nothing on items
    : f.propertyKeys(['category'], { category: { conv: 968, micro: 9400 } }),          // and no sku anywhere
  get_conversions: f.conversions([['purchase', 968, 0]]),                              // revenue never passed
  // Captured 2026-09-17: rules carry the pattern fields and the draft flags
  // PRD-055 added, and the envelope counts defaults separately from custom.
  list_channel_rules: { rules: [{ id: 1, account_id: 'acct_demo', channel_name: 'Paid Search',
    source_pattern: '*', medium_pattern: 'cpc', campaign_pattern: null, priority: 10,
    is_default: false, is_active: true, created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z', draft_forced: false, draft_forced_reason: null }],
    total: 1, default_count: 0, custom_count: 1 },
  get_traffic_sources: f.rows('utm_source', [['google', 9800, 236, 0, 0.51], ['meta-ads', 4100, 88, 0, 0.58]]),
  get_channels: f.channels('channel', [['Organic Search', 17400, 430, 0, 0.44], ['Referral', 12500, 300, 0, 0.55], ['Direct', 7600, 168, 0, 0.46], ['Paid Search', 3700, 70, 0, 0.51]]),   // works with an api_key: the channel-groups router takes sites:read
  get_top_channels: f.top('channel', [['Organic Search', 17400, 430, 0, 0.44], ['Referral', 12500, 300, 0, 0.55], ['Direct', 7600, 168, 0, 0.46], ['Paid Search', 3700, 70, 0, 0.51]]),
  get_top_campaigns: f.top('utm_campaign', [['(not set)', 9200, 190, 0, 0.6], ['brand-es', 3900, 142, 0, 0.38]]),
  get_microconversions: f.micro({ product_view: 25600, add_to_cart: 3020 }),
  list_alerts: { alerts: [] },
  get_tracking_code: { site_id: 'acct_demo', script_tag: '<script async src="https://cdn.sealmetrics.com/sm.js?id=acct_demo"></script>', tracker_url: 'https://cdn.sealmetrics.com/sm.js',
    js_api: { conversion: { description: '', signatures: [{ call: 'sealmetrics.conv("purchase", {revenue})', description: '' }] },
              microconversion: { description: '', signatures: [{ call: 'sealmetrics.micro("add_to_cart", {sku, price})', description: '' }] },
              pageview: { description: '', signatures: [] } },
    implementation_guide: { installation: [], spa_support: '', debugging: '', naming_conventions: [], content_grouping: { description: '', recommended_groups: [], via_js: '', via_url_param: '' } },
    examples: { ecommerce: { code: 'sealmetrics.micro("add_to_cart", { sku: product.sku, price: product.price })', description: 'the sku must match product_view' }, saas: { code: '', description: '' }, blog_media: { code: '', description: '' }, react_nextjs: { code: '', description: '' } } },
  get_instrumentation_guide: { guide: 'sealmetrics.micro("add_to_cart", { sku, price }) — the sku must match the value sent on product_view. sealmetrics.conv("purchase", { revenue }) — always pass revenue.' },
  verify_event_instrumented: (a) => ({ event: a.name, kind: a.kind, seen: a.name !== 'start_checkout' }),
  test_channel_rules: { would_reclassify: 8800, from: 'Referral', to: 'Paid Search' },
};
