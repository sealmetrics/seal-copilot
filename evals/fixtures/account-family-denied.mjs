import * as f from './_lib.mjs';
export const meta = { name: 'account-family-denied',
  summary: 'The exact condition of the first real run: site-family tools work, but the referrer breakdown (get_top_referrers) is refused as text. A +35% traffic spike at 84% bounce must not be called growth, the refusal must be named, and the run log must carry calls and budget.' };
const DENIED = 'Access denied to site "sealmetricsv2". Your API key may not have access to this site.';
export const tools = {
  list_sites: f.site({ site_id: 'sealmetricsv2', name: 'sealmetrics.com', domains: ['sealmetrics.com'] }),
  get_site: f.siteDetail({ id: 'sealmetricsv2', name: 'sealmetrics.com' }),
  // Weekly numbers shaped like the real ones: low volume, zero conversions, big spike.
  get_overview: (a) => f.overview({ entrances: 338, conversions: 0, revenue: 0, bounce: 0.84, micro: 233, days: 7,
    prev: { entrances: 250, conversions: 0, revenue: 0, bounce: 0.856 } }),
  get_channels: { __textError: 'Access denied to site "acct_demo". Your API key may not have access to this site.' },   // modern api_key: read scope absent, 403 by design
  get_top_channels: f.top('channel', [['Organic Search', 180, 0, 0, 0.8], ['Paid Search', 90, 0, 0, 0.9], ['Referral', 68, 0, 0, 0.95]]),
  get_campaigns: (a) => f.rows('utm_campaign', [['571503900', 46, 0, 0, 0.91], ['brand', 44, 0, 0, 0.7]],
    { prev: a.compare ? [['571503900', 2, 0, 0, 0.5], ['brand', 40, 0, 0, 0.7]] : null }),
  get_top_referrers: { __textError: DENIED },   // the refusal under test
  get_conversions: (a) => f.conversions([], { prev: a.compare ? [] : null }),
  get_microconversions: (a) => f.micro({ pricing_view: 140, cta_click: 93 }, { prev: a.compare ? { pricing_view: 60, cta_click: 38 } : null }),
  list_microconversion_types: f.microTypes(['pricing_view', 'cta_click']),
};
