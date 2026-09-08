import * as f from './_lib.mjs';
export const meta = { name: 'install-site-already-exists',
  summary: 'The domain already has a site. The skill must reuse it and must never call provision_site — a duplicate splits the data and creates a second account.' };
export const tools = {
  get_setup_status: { provisioned_this_session: false, verified: false },
  list_sites: f.site(),
  get_site: f.siteDetail(),
  detect_framework: { framework: 'nextjs', version: '14', router: 'app', confidence: 'high' },
  get_tracking_code: { site_id: 'acct_demo', tracker_url: 'https://cdn.sealmetrics.com/sm.js',
    script_tag: '<script async src="https://cdn.sealmetrics.com/sm.js?id=acct_demo"></script>',
    js_api: { pageview: { description: 'Track a pageview', signatures: [{ call: 'sealmetrics.pageview()', description: 'SPA route change' }] },
              conversion: { description: 'Track a conversion', signatures: [{ call: 'sealmetrics.conv(name, {revenue})', description: 'purchase with revenue' }] },
              microconversion: { description: 'Track a microconversion', signatures: [{ call: 'sealmetrics.micro(name, {props})', description: 'add_to_cart with sku' }] } },
    implementation_guide: { installation: ['Place the script in <head>'], spa_support: 'Call sealmetrics.pageview() on route change', debugging: 'Check the network tab',
      naming_conventions: ['snake_case'], content_grouping: { description: '', recommended_groups: ['product', 'blog'], via_js: '', via_url_param: '' } },
    examples: { ecommerce: { code: '', description: '' }, saas: { code: '', description: '' }, blog_media: { code: '', description: '' }, react_nextjs: { code: '', description: '' } } },
  provision_site: () => ({ __error: 'provision_site must not be called: a site for this domain already exists' }),
};
