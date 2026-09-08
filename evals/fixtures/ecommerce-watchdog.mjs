import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-watchdog',
  summary: 'Low-volume store (mode A calibration) whose add-to-cart went silent at 11:45 today. calibrate-watchdog must build a baseline; cart-watchdog must refuse without one, then act on it.' };
const day = (dateStr, hours) => hours.flatMap(([h, n]) =>
  Array.from({ length: n }, (_, i) => ({ conversion_type: 'add_to_cart',
    timestamp_local: `${dateStr}T${String(h).padStart(2, '0')}:${String(5 + i * 3).padStart(2, '0')}:00`,
    device_type: i % 2 ? 'mobile' : 'desktop', properties: { sku: `SKU-${1000 + (i % 7)}` } })));
const CURVE = [[8, 2], [9, 3], [10, 4], [11, 5], [12, 6], [13, 5], [14, 4], [15, 4], [16, 5], [17, 6], [18, 7], [19, 8], [20, 9], [21, 6], [22, 3]];
// Two events at 08:00 and then nothing. Whatever hour the eval runs at, the
// day-to-date ratio is far below 50%, so the verdict does not depend on the
// clock — a time-dependent fixture is a flaky fixture.
const TODAY = [[8, 2]];
export const tools = {
  list_sites: f.site(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_microconversions: (a) => a.period === 'today' ? f.micro({ add_to_cart: 2 })
    : f.micro({ product_view: 9400, add_to_cart: 2680, start_checkout: 910 }),
  get_microconversions_raw: (a) => f.rawEvents((a.period === 'today' ? day('2026-09-08', TODAY) : day('2026-09-01', CURVE)).slice(0, a.limit || 100)),
  get_microconversion_details: (a) => f.microDetails(a.conversion_type || 'add_to_cart', 2, { device: [['desktop', 0.5], ['mobile', 0.5]] }),
  get_bot_stats: f.botStats({ total: 1400, botShare: 0.07 }),
  get_suspicious_sessions: { data: [] },
  get_conversions: f.conversions([['purchase', 640, 49400]]),
};
