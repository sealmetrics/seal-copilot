import * as f from './_lib.mjs';
export const meta = { name: 'alerts-silence-fires',
  summary: 'A store whose purchases stopped five hours ago. check-alerts must fire, name the hour the gap starts, and not widen into a diagnosis.' };

// Times are relative to the run, never hardcoded — the watchdog fixture once
// only worked on Tuesdays. The last purchase is five hours before now, so the
// four-hour rule fires whatever time the suite runs at, including the small
// hours: when five hours ago falls before midnight, today's total is zero and
// the skill takes its documented second branch (widen to yesterday with an
// explicit start_date/end_date), where the same events are waiting.
// The runner's instant for this attempt, the same one stamped into the
// prompt as "Fired at:". Falls back to the wall clock when run by hand.
const now = process.env.SEAL_NOW ? new Date(process.env.SEAL_NOW) : new Date();
const LAST = new Date(now.getTime() - 5 * 3600 * 1000);
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const day = (d) => local(d).slice(0, 10);

const TODAY = day(now);
// Three purchases, the last of them five hours ago, the two before it earlier.
const purchases = [2, 1, 0].map((backHours) => ({
  conversion_type: 'purchase',
  timestamp_local: local(new Date(LAST.getTime() - backHours * 3600 * 1000)),
}));
const todayOnly = purchases.filter((p) => p.timestamp_local.slice(0, 10) === TODAY);

export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  // The day total is what the skill reads first. It is 0 when the gap crosses
  // midnight, which is exactly the case the second branch exists for.
  get_conversions: (a) => (a.period === 'today'
    ? f.conversions([['purchase', todayOnly.length, todayOnly.length * 82]])
    : f.conversions([['purchase', 640, 52480]])),
  // period=today serves only today's rows; an explicit window serves them all.
  get_conversions_raw: (a) => f.rawEvents(a.period === 'today' ? todayOnly : purchases),
  get_overview: f.overview({ entrances: 9850, conversions: 231, revenue: 17900, prev: { entrances: 9610, conversions: 224, revenue: 17250 } }),
  get_top_referrers: f.top('referrer', [['google.com', 4100, 96, 7800]]),
};
