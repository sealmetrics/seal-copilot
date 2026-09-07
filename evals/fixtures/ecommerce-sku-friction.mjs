import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-sku-friction',
  summary: 'SKU-8841 has heavy views and almost no carts. Must be found and classified as friction, not dead stock.',
};
const views = [['SKU-1001', 4800], ['SKU-8841', 4210], ['SKU-1002', 3100], ['SKU-1003', 2400],
               ['SKU-1004', 900], ['SKU-1005', 620], ['SKU-1006', 140], ['SKU-1007', 28]];
const carts = [['SKU-1001', 322], ['SKU-8841', 31], ['SKU-1002', 198], ['SKU-1003', 151],
               ['SKU-1004', 118], ['SKU-1005', 96], ['SKU-1006', 4], ['SKU-1007', 2]];
export const tools = {
  list_sites: f.site(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  list_property_keys: (a) => f.propertyKeys(
    a.table === 'conversion_items' ? ['sku', 'price', 'quantity', 'category']
    : a.table === 'microconversions' ? ['sku', 'category'] : ['sku', 'category', 'price']),
  get_property_breakdown: (a) => {
    if (a.conversion_type && /view/.test(a.conversion_type)) return f.breakdown('sku', views);
    if (a.conversion_type && /cart|atc|basket/.test(a.conversion_type)) return f.breakdown('sku', carts);
    return f.breakdown('sku', views);
  },
  get_conversion_items_raw: { data: [
    ...Array.from({ length: 40 }, () => ({ properties: { sku: 'SKU-1001', price: 59, quantity: 1 } })),
    ...Array.from({ length: 26 }, () => ({ properties: { sku: 'SKU-1002', price: 42, quantity: 1 } })),
    ...Array.from({ length: 19 }, () => ({ properties: { sku: 'SKU-1003', price: 88, quantity: 1 } })),
    ...Array.from({ length: 14 }, () => ({ properties: { sku: 'SKU-1004', price: 35, quantity: 1 } })),
    ...Array.from({ length: 3 },  () => ({ properties: { sku: 'SKU-8841', price: 120, quantity: 1 } })),
  ], page: 1, has_more: false },
  // Mobile sample: SKU-8841 barely appears. Desktop sample: it appears normally.
  get_microconversions_raw: (a) => {
    const mobile = (a.device_type || []).includes('mobile');
    const mk = (sku, n) => Array.from({ length: n }, () => ({ conversion_type: 'add_to_cart',
      timestamp_local: '2026-09-05T14:12:00', properties: { sku } }));
    return { data: mobile
      ? [...mk('SKU-1001', 44), ...mk('SKU-1002', 27), ...mk('SKU-1003', 21), ...mk('SKU-8841', 1)]
      : [...mk('SKU-1001', 38), ...mk('SKU-1002', 24), ...mk('SKU-1003', 19), ...mk('SKU-8841', 16)],
      page: 1, has_more: false };
  },
  get_conversions: { data: [{ conversion_type: 'purchase', count: 968, revenue: 74800, avg_value: 77.3 }] },
  get_bot_stats: f.botStats({ total: 41200, botShare: 0.05 }),
};
