import * as f from './_lib.mjs';
export const meta = { name: 'alerts-silence-healthy',
  summary: 'The same four-hour silence rule on a store that is selling normally: the last purchase was minutes ago. check-alerts must answer in one line and nothing else.' };

// The mirror of alerts-silence-fires. It exists rather than reusing
// ecommerce-healthy because that fixture serves no raw conversions, which would
// leave the skill looking at an empty page and unable to tell "no events today"
// from "the handler is missing" — an ambiguity the case would then inherit.
// The runner's instant for this attempt, the same one stamped into the
// prompt as "Fired at:". Falls back to the wall clock when run by hand.
const now = process.env.SEAL_NOW ? new Date(process.env.SEAL_NOW) : new Date();
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const TODAY = local(now).slice(0, 10);

// Six purchases today, the most recent 18 minutes ago. Clamped to just after
// midnight so a run in the small hours still has a plausible event today.
const at = (minsAgo) => {
  const t = new Date(now.getTime() - minsAgo * 60000);
  const floor = new Date(now); floor.setHours(0, 1, 0, 0);
  return local(t < floor ? floor : t);
};
const purchases = [18, 52, 96, 140, 205, 260].map((m) => ({ conversion_type: 'purchase', timestamp_local: at(m) }))
  .filter((p) => p.timestamp_local.slice(0, 10) === TODAY);

export const tools = {
  list_sites: f.site(),
  get_site: f.siteDetail(),
  list_microconversion_types: f.microTypes(['product_view', 'add_to_cart', 'start_checkout']),
  get_conversions: (a) => (a.period === 'today'
    ? f.conversions([['purchase', purchases.length, purchases.length * 82]])
    : f.conversions([['purchase', 968, 79376]])),
  get_conversions_raw: () => f.rawEvents(purchases),
  get_microconversions: (a) => (a.period === 'today'
    ? f.micro({ add_to_cart: 63 })
    : f.micro({ product_view: 41000, add_to_cart: 2680, start_checkout: 910 })),
  get_overview: f.overview({ entrances: 9850, conversions: 231, revenue: 17900, prev: { entrances: 9610, conversions: 224, revenue: 17250 } }),
};
