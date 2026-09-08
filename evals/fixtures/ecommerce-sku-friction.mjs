import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-sku-friction',
  summary: 'SKU-8841 has heavy views and almost no carts. Must be found and classified as friction, not dead stock.' };
const views = [['SKU-1001', 4800], ['SKU-8841', 4210], ['SKU-1002', 3100], ['SKU-1003', 2400], ['SKU-1004', 900], ['SKU-1005', 620], ['SKU-1006', 140], ['SKU-1007', 28]];
const carts = [['SKU-1001', 322], ['SKU-8841', 31], ['SKU-1002', 198], ['SKU-1003', 151], ['SKU-1004', 118], ['SKU-1005', 96], ['SKU-1006', 4], ['SKU-1007', 2]];
const mk = (sku, n, device) => Array.from({ length: n }, () => ({ conversion_type: 'add_to_cart', device_type: device, timestamp_local: '2026-09-05T14:12:00', properties: { sku } }));
export const tools = {
  list_sites: f.site(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  list_property_keys: (a) => a.table === 'conversion_items'
    ? f.propertyKeys(['sku', 'price', 'quantity', 'category'], { sku: { conv: 968, micro: 0 } })
    : f.propertyKeys(['sku', 'category'], { sku: { conv: 968, micro: 16200 }, category: { conv: 968, micro: 16200 } }),
  get_property_breakdown: (a) => {
    const isCart = a.conversion_type && /cart|atc|basket/.test(a.conversion_type);
    return f.breakdown(a.property_key || 'sku', isCart ? carts : views);
  },
  get_property_values: f.propertyValues([['SKU-1001', 'google', 40, 322, 2360], ['SKU-8841', 'google', 3, 31, 360], ['SKU-1002', 'google', 26, 198, 1092]]),
  get_conversion_items_raw: { data: [
    ...Array.from({ length: 40 }, () => ({ conversion_type: 'purchase', properties: { sku: 'SKU-1001', price: 59, quantity: 1 } })),
    ...Array.from({ length: 26 }, () => ({ conversion_type: 'purchase', properties: { sku: 'SKU-1002', price: 42, quantity: 1 } })),
    ...Array.from({ length: 19 }, () => ({ conversion_type: 'purchase', properties: { sku: 'SKU-1003', price: 88, quantity: 1 } })),
    ...Array.from({ length: 14 }, () => ({ conversion_type: 'purchase', properties: { sku: 'SKU-1004', price: 35, quantity: 1 } })),
    ...Array.from({ length: 3 },  () => ({ conversion_type: 'purchase', properties: { sku: 'SKU-8841', price: 120, quantity: 1 } })),
  ], has_next: false, page: 1, page_size: 100, total: 102 },
  get_microconversions_raw: (a) => {
    const mobile = (a.device_type || []).includes('mobile');
    return f.rawEvents(mobile
      ? [...mk('SKU-1001', 44, 'mobile'), ...mk('SKU-1002', 27, 'mobile'), ...mk('SKU-1003', 21, 'mobile'), ...mk('SKU-8841', 1, 'mobile')]
      : [...mk('SKU-1001', 38, 'desktop'), ...mk('SKU-1002', 24, 'desktop'), ...mk('SKU-1003', 19, 'desktop'), ...mk('SKU-8841', 16, 'desktop')]);
  },
  get_conversions: f.conversions([['purchase', 968, 74800]]),
  get_bot_stats: f.botStats({ total: 41200, botShare: 0.05 }),
};
