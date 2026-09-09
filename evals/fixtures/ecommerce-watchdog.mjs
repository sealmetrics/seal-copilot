import * as f from './_lib.mjs';
export const meta = { name: 'ecommerce-watchdog',
  summary: 'Low-volume store (mode A calibration) whose add-to-cart went silent at 11:45 today. calibrate-watchdog must build a baseline; cart-watchdog must refuse without one, then act on it.' };
// Dates are relative to the run, never hardcoded: a fixture that only works on
// Tuesdays is a broken fixture. Four full weeks ending yesterday, so the
// baseline has four samples for every (weekday, hour) cell whatever day it is.
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d; };

const CURVE = [[9, 2], [11, 3], [13, 3], [15, 3], [17, 4], [19, 4], [21, 2]];   // ~21/day, mode A
const TODAY = [[8, 2]];                                                          // then silence

const eventsFor = (dateStr, hours) => hours.flatMap(([h, n]) =>
  Array.from({ length: n }, (_, i) => ({
    conversion_type: 'add_to_cart',
    timestamp_local: `${dateStr}T${String(h).padStart(2, '0')}:${String(5 + i * 7).padStart(2, '0')}:00`,
    device_type: i % 2 ? 'mobile' : 'desktop',
    properties: { sku: `SKU-${1000 + (i % 7)}` },
  })));

// 28 days of history, oldest first.
const history = () => Array.from({ length: 28 }, (_, k) => eventsFor(iso(daysAgo(28 - k)), CURVE)).flat();
const todayEvents = () => eventsFor(iso(daysAgo(0)), TODAY);

export const tools = {
  list_sites: f.site(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_microconversions: (a) => a.period === 'today' ? f.micro({ add_to_cart: 2 })
    : f.micro({ product_view: 9400, add_to_cart: 2680, start_checkout: 910 }),
  get_microconversions_raw: (a) => f.rawEvents(a.period === 'today' ? todayEvents() : history().slice(0, a.limit || 700)),
  get_microconversion_details: (a) => f.microDetails(a.conversion_type || 'add_to_cart', 2, { device: [['desktop', 0.5], ['mobile', 0.5]] }),
  get_bot_stats: f.botStats({ total: 1400, botShare: 0.07 }),
  get_suspicious_sessions: { data: [] },
  get_conversions: f.conversions([['purchase', 640, 49400]]),
};
