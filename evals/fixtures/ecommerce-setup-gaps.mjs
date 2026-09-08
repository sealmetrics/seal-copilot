import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-setup-gaps',
  summary: 'Tracking is half-done: no product id on add_to_cart, no checkout event, no revenue, paid traffic misclassified as Referral, agent analytics off. setup-audit must find these and not invent a score.',
};
export const tools = {
  list_sites: f.site(),
  get_site: { site_id: 'acct_demo', name: 'demo-store.com', timezone: 'Europe/Madrid', currency: 'EUR', tracking_active: true },
  get_overview: f.overview({ entrances: 41200, conversions: 968, revenue: 0,
    prev: { entrances: 40100, conversions: 941, revenue: 0 } }),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart']),   // no start_checkout
  list_property_keys: (a) => f.propertyKeys(
    a.table === 'conversion_items' ? [] :
    a.table === 'microconversions' ? ['category'] :                             // no sku on add_to_cart
    ['category']),
  // AOV null: revenue is not being passed at all.
  get_conversions: { data: [{ conversion_type: 'purchase', count: 968, revenue: 0, avg_value: null }] },
  list_channel_rules: { rules: [{ id: 1, channel: 'Paid Search', match: 'utm_medium=cpc' }] },
  get_traffic_sources: f.rows('utm_source', [
    ['google', 9800, 236, 0, 0.51], ['meta-ads', 4100, 88, 0, 0.58]]),
  // cpc traffic landing in Referral: a rule is missing.
  get_channels: f.rows('channel', [
    ['Organic Search', 17400, 430, 0, 0.44], ['Referral', 12500, 300, 0, 0.55],
    ['Direct', 7600, 168, 0, 0.46], ['Paid Search', 3700, 70, 0, 0.51]]),
  get_top_campaigns: f.rows('utm_campaign', [['(not set)', 9200, 190, 0, 0.6], ['brand-es', 3900, 142, 0, 0.38]]),
  list_alerts: { alerts: [] },
  get_bot_stats: f.botStatsDisabled(),
  get_tracking_code: { site_id: 'acct_demo', snippet: '<script async src="https://cdn.sealmetrics.com/sm.js?id=acct_demo"></script>' },
  get_instrumentation_guide: { guide: 'sealmetrics.micro("add_to_cart", { sku, price }) — the sku must match the value sent on product_view.' },
  verify_event_instrumented: (a) => ({ event: a.name, kind: a.kind, seen: a.name !== 'start_checkout' }),
  test_channel_rules: { would_reclassify: 8800, from: 'Referral', to: 'Paid Search' },
};
