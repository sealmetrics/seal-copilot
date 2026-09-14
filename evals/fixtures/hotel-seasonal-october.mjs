import * as f from './_lib.mjs';
export const meta = { name: 'hotel-seasonal-october',
  summary: 'Bookings down 31% vs previous month but flat year over year. Correct answer is "seasonal", with no action.' };
const ch = [['Organic Search', 6900, 78, 35200, 0.46], ['Direct', 4800, 71, 33900, 0.41], ['Referral', 3900, 42, 18600, 0.52], ['Paid Search', 2800, 23, 8600, 0.55]];
export const tools = {
  list_sites: f.site({ site_id: 'acct_hotel', name: 'hotel-costa.example', domains: ['hotel-costa.example'] }),
  get_site: f.siteDetail({ id: 'acct_hotel', name: 'hotel-costa.example' }),
  get_overview: (a) => a.compare === 'yoy'
    ? f.overview({ entrances: 18400, conversions: 214, revenue: 96300, prev: { entrances: 18100, conversions: 209, revenue: 94800 } })
    : f.overview({ entrances: 18400, conversions: 214, revenue: 96300, prev: { entrances: 26900, conversions: 311, revenue: 141500 } }),
  get_channels: { __textError: 'Access denied to site "acct_demo". Your API key may not have access to this site.' },   // modern api_key: read scope absent, 403 by design
  get_top_channels: f.top('channel', ch),
  get_top_referrers: f.top('domain', [['booking.com', 2600, 31, 13800, 0.49], ['expedia.com', 1100, 9, 4100, 0.55]]),
  list_microconversion_types: f.microTypes(['room_view', 'booking_start', 'booking']),
  get_countries: (a) => f.rows('country', [['GB', 5200, 71, 34100, 0.44], ['DE', 3900, 48, 23800, 0.47], ['ES', 4100, 52, 19900, 0.45]],
    { stringRevenue: true, prev: a.compare ? [['GB', 5100, 70, 33500, 0.44], ['DE', 3800, 47, 23100, 0.47], ['ES', 4000, 50, 19200, 0.45]] : null }),
  get_conversions: f.conversions([['booking', 214, 96300]]),
  get_campaigns: f.rows('utm_campaign', [['brand-uk', 1400, 14, 5600, 0.4], ['summer-de', 900, 6, 2400, 0.58]]),
};
