import * as f from './_lib.mjs';
export const meta = { name: 'saas-demo-drop',
  summary: 'Form views held, submissions collapsed. The leak is the last funnel step, not traffic.' };
export const tools = {
  list_sites: f.site({ site_id: 'acct_saas', name: 'saas-demo.example', domains: ['saas-demo.example'] }),
  get_overview: f.overview({ entrances: 12800, conversions: 41, revenue: 0, prev: { entrances: 12400, conversions: 96, revenue: 0 } }),
  get_channels: f.rows('channel', [['Organic Search', 6100, 22, 0, 0.47], ['Paid Search', 3400, 12, 0, 0.52], ['Direct', 2100, 7, 0, 0.44], ['Referral', 1200, 0, 0, 0.61]]),
  list_microconversion_types: f.microTypes(['pricing_view', 'cta_click', 'form_view']),
  get_microconversions: (a) => f.micro({ pricing_view: 3120, cta_click: 880, form_view: 611 },
    { prev: a.compare ? { pricing_view: 3080, cta_click: 905, form_view: 624 } : null }),
  // get_funnel answers with a JSON error when no funnel is configured — its real behaviour.
  get_funnel: { error: 'No funnel configured for this site' },
  get_microconversion_details: (a) => f.microDetails(a.conversion_type || 'form_view', 611,
    { device: [['desktop', 0.53], ['mobile', 0.47]], landing: [['/pricing', 0.8], ['/', 0.2]] }),
  get_bot_stats: f.botStats({ total: 12800, botShare: 0.09 }),
  get_conversions: (a) => f.conversions([['demo_request', 41, 0]], { prev: a.compare ? [['demo_request', 96, 0]] : null }),
  get_content_groups: [{ content_grouping: 'blog', entrances: 6900, page_views: 9100, unique_pages: 140 },
                       { content_grouping: 'product', entrances: 3400, page_views: 8800, unique_pages: 12 },
                       { content_grouping: 'pricing', entrances: 1500, page_views: 3100, unique_pages: 1 }],
  get_landing_pages_by_content_group: [
    { content_grouping: 'blog', entrances: 6900, engaged_entrances: 3100, bounce_rate: 55, conversions: 4, conversion_rate: 0.06, microconversions: 400, revenue: '0.00', unique_pages: 140 },
    { content_grouping: 'product', entrances: 3400, engaged_entrances: 2100, bounce_rate: 38, conversions: 21, conversion_rate: 0.62, microconversions: 1900, revenue: '0.00', unique_pages: 12 },
    { content_grouping: 'pricing', entrances: 1500, engaged_entrances: 1000, bounce_rate: 33, conversions: 16, conversion_rate: 1.07, microconversions: 1200, revenue: '0.00', unique_pages: 1 }],
};
