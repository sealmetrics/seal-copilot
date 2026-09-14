import * as f from './_lib.mjs';
export const meta = { name: 'stale-profile-other-account',
  summary: 'The real failure of 2026-09-13. The state dir holds a two-day-old profile for sealmetricsv2, left by a different Sealmetrics account; this connection can only reach demo-site. Stats calls on the cached site are refused. The report must come from demo-site instead of ending as an access failure, and the other account\'s profile must survive.' };

const STALE = 'sealmetricsv2';
const DEMO = 'demo-site';
const DENIED = `Access denied to site "${STALE}". Your API key may not have access to this site.`;
const REQUIRED = 'site_id is required. Either pass it as a parameter or set the SEALMETRICS_SITE_ID environment variable.';

// What this connection can reach. The demo site answers; the other account's
// site is refused in the server's own wording; no site at all is the server's
// own error, since production connects over OAuth with no default site.
const reach = (a, data) => a.site_id === DEMO ? data()
  : a.site_id === STALE ? { __textError: DENIED }
  : { __textError: REQUIRED };

// The weekly numbers of ecommerce-healthy, already arithmetic-checked there.
const W = {
  overview: { entrances: 9850, conversions: 231, revenue: 17900, prev: { entrances: 9610, conversions: 224, revenue: 17250 }, days: 7 },
  channels: [['Organic Search', 4160, 103, 7920, 0.44], ['Paid Search', 2340, 56, 4520, 0.51],
             ['Direct', 1820, 40, 3060, 0.46], ['Paid Social', 980, 21, 1530, 0.58], ['Email', 550, 11, 870, 0.39]],
  channelsPrev: [['Organic Search', 4050, 100, 7700, 0.44], ['Paid Search', 2300, 55, 4400, 0.51],
             ['Direct', 1780, 39, 3000, 0.46], ['Paid Social', 950, 20, 1450, 0.58], ['Email', 530, 10, 700, 0.39]],
  campaigns: [['brand-es', 930, 34, 2820, 0.38], ['generic-es', 765, 15, 1030, 0.55], ['retarget-es', 645, 7, 670, 0.62]],
  campaignsPrev: [['brand-es', 910, 33, 2750, 0.38], ['generic-es', 750, 15, 1000, 0.55], ['retarget-es', 640, 7, 650, 0.62]],
};
const previous = (a) => ['last_week', 'last_month', 'last_quarter'].includes(a.period);

export const tools = {
  // Only the demo site: the account that connected cannot see sealmetricsv2.
  list_sites: f.site({ site_id: DEMO, name: 'demo-store.com', domains: ['demo-store.com'] }),
  get_site: (a) => reach(a, () => f.siteDetail({ id: DEMO })),
  get_overview: (a) => reach(a, () => f.overview(W.overview)),
  get_top_channels: (a) => reach(a, () => f.top('channel', previous(a) ? W.channelsPrev : W.channels)),
  get_campaigns: (a) => reach(a, () => f.rows('utm_campaign', W.campaigns, { prev: a.compare ? W.campaignsPrev : null })),
  get_top_campaigns: (a) => reach(a, () => f.top('utm_campaign', W.campaigns)),
  get_conversions: (a) => reach(a, () => f.conversions([['purchase', 231, 17900]], { prev: a.compare ? [['purchase', 224, 17250]] : null })),
  list_microconversion_types: (a) => reach(a, () => f.microTypes(['product_view', 'add_to_cart', 'start_checkout'])),
};
