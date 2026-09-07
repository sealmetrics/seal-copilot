import * as f from './_lib.mjs';
export const meta = {
  name: 'saas-demo-drop',
  summary: 'Form views held, submissions collapsed. The leak is the last funnel step, not traffic.',
};
export const tools = {
  list_sites: f.site({ site_id: 'acct_saas', name: 'saas-demo.example' }),
  get_overview: f.overview({ entrances: 12800, conversions: 41, revenue: 0,
    prev: { entrances: 12400, conversions: 96, revenue: 0 } }),
  get_channels: f.rows('channel', [
    ['Organic Search', 6100, 22, 0, 0.47], ['Paid Search', 3400, 12, 0, 0.52],
    ['Direct', 2100, 7, 0, 0.44], ['Referral', 1200, 0, 0, 0.61]]),
  list_microconversion_types: f.microTypes(['pricing_view', 'cta_click', 'form_view']),
  get_microconversions: (a) => a.compare === 'previous'
    ? { data: [{ conversion_type: 'pricing_view', count: 3120, previous: 3080 },
               { conversion_type: 'cta_click', count: 880, previous: 905 },
               { conversion_type: 'form_view', count: 611, previous: 624 }] }
    : f.micro({ pricing_view: 3120, cta_click: 880, form_view: 611 }),
  get_funnel: { steps: [
    { step: 'entrance', visitors: 12800, conversion_rate: 1.0, dropoff: 0 },
    { step: 'pricing_view', visitors: 3120, conversion_rate: 0.244, dropoff: 0.756 },
    { step: 'form_view', visitors: 611, conversion_rate: 0.196, dropoff: 0.804 },
    { step: 'demo_request', visitors: 41, conversion_rate: 0.067, dropoff: 0.933 }] },
  get_microconversion_details: (a) => ({ conversion_type: a.conversion_type,
    data: [{ segment: a.device_type || a.utm_source || 'all', count: a.device_type === 'mobile' ? 288 : 323 }] }),
  get_bot_stats: f.botStats({ total: 12800, botShare: 0.09 }),
  get_conversions: { data: [{ conversion_type: 'demo_request', count: 41, revenue: 0, avg_value: 0 }] },
};
