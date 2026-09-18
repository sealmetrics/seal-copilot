import * as f from './_lib.mjs';
import * as inst from './_install.mjs';
export const meta = { name: 'install-site-already-exists',
  summary: 'The domain already has a site. The skill must reuse it and must never call provision_site — a duplicate splits the data and creates a second account.' };
export const tools = {
  get_setup_status: { provisioned_this_session: false, verified: false },
  list_sites: f.site(),
  get_site: f.siteDetail(),
  detect_framework: { framework: 'nextjs', version: '14', router: 'app', confidence: 'high' },
  get_tracking_code: inst.trackingCode(),
  get_instrumentation_guide: inst.instrumentationGuide(),
  plan_install: (a) => inst.planInstall(a),
  simulate_install: (a) => inst.simulateInstall(a),
  provision_site: () => ({ __error: 'provision_site must not be called: a site for this domain already exists' }),
};
