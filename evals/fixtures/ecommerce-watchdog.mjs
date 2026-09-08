import * as f from './_lib.mjs';
export const meta = {
  name: 'ecommerce-watchdog',
  summary: 'Low-volume store (mode A calibration) whose add-to-cart went silent at 11:45 today. calibrate-watchdog must build a baseline; cart-watchdog must refuse without one, then act on it.',
};
// ~90 add-to-carts a day, well under the 4,000/30d mode-A threshold.
const day = (dateStr, hours) => hours.flatMap(([h, n]) =>
  Array.from({ length: n }, (_, i) => ({
    conversion_type: 'add_to_cart',
    timestamp_local: `${dateStr}T${String(h).padStart(2, '0')}:${String(5 + i * 3).padStart(2, '0')}:00`,
    properties: { sku: `SKU-${1000 + (i % 7)}` },
  })));
// A plausible weekday curve: quiet nights, a lunchtime bump, an evening peak.
const CURVE = [[8, 2], [9, 3], [10, 4], [11, 5], [12, 6], [13, 5], [14, 4],
               [15, 4], [16, 5], [17, 6], [18, 7], [19, 8], [20, 9], [21, 6], [22, 3]];
// Today stops after 11:00 — the last event is at 11:45.
const TODAY = [[8, 2], [9, 3], [10, 4], [11, 5]];

export const tools = {
  list_sites: f.site(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_microconversions: (a) => {
    if (a.period === 'today') return f.micro({ add_to_cart: 14 });
    return f.micro({ product_view: 9400, add_to_cart: 2680, start_checkout: 910 });
  },
  get_microconversions_raw: (a) => {
    const rows = a.period === 'today' ? day('2026-09-08', TODAY) : day('2026-09-01', CURVE);
    return { data: rows.slice(0, a.limit || 100), page: a.page || 1, has_more: false };
  },
  get_microconversion_details: (a) => ({ conversion_type: a.conversion_type,
    data: [{ segment: a.device_type || a.utm_source || 'all', count: a.device_type === 'mobile' ? 7 : 7 }] }),
  get_bot_stats: f.botStats({ total: 1400, botShare: 0.07 }),
  get_suspicious_sessions: { data: [] },
  get_conversions: { data: [{ conversion_type: 'purchase', count: 640, revenue: 49400, avg_value: 77.19 }] },
};
