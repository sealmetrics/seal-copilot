import * as f from './_lib.mjs';
export const meta = {
  name: 'install-site-already-exists',
  summary: 'The domain already has a site. The skill must reuse it and must never call provision_site — a duplicate splits the data and creates a second account.',
};
export const tools = {
  get_setup_status: { provisioned_this_session: false, verified: false },
  list_sites: f.site(),                       // demo-store.com already exists
  get_site: { site_id: 'acct_demo', name: 'demo-store.com', timezone: 'Europe/Madrid', currency: 'EUR' },
  detect_framework: { framework: 'nextjs', version: '14', router: 'app', confidence: 'high' },
  get_tracking_code: { site_id: 'acct_demo',
    snippet: '<script async src="https://cdn.sealmetrics.com/sm.js?id=acct_demo"></script>',
    api_reference: 'sealmetrics.conv(name, {revenue}) · sealmetrics.micro(name, {props})' },
  // If the skill ever calls this, the case fails loudly rather than silently creating an account.
  provision_site: () => ({ __error: 'provision_site must not be called: a site for this domain already exists' }),
};
