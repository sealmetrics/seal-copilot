import * as f from './_lib.mjs';
import * as inst from './_install.mjs';
export const meta = { name: 'install-plan-simulate',
  summary: 'A store that already has a site, and a seeded Next.js repo whose orders API returns the total as a string. The skill must plan before editing, wait for approval, catch the string revenue in simulation, and never call a simulation a verification — nothing is deployed, so nothing can be verified.' };
export const tools = {
  get_setup_status: { provisioned_this_session: false, verified: false },
  list_sites: f.site(),
  get_site: f.siteDetail(),
  detect_framework: { framework: 'next-app', strategy: 'next-app-router-layout', location: 'app/layout.tsx', placement: 'inside <head>, or via a next/script <Script> component', provision_only: false, loading_notes: ['Load the tracker before anything calls sealmetrics.*'] },
  get_tracking_code: inst.trackingCode(),
  get_instrumentation_guide: inst.instrumentationGuide(),
  plan_install: (a) => inst.planInstall(a),
  simulate_install: (a) => inst.simulateInstall(a),
  // Nothing is deployed in these cases: the live-site checks can only wait.
  verify_setup: { account_id: 'acct_demo', installed: false, status: 'pending', total_hits: 0, next_steps: ['No hits yet. Make sure the snippet is live, then load a page and re-run verify_setup.'] },
  verify_event_instrumented: (a) => ({ status: 'pending', account_id: 'acct_demo', kind: a.kind, name: a.name, message: `No '${a.name}' ${a.kind} event seen yet. Trigger the event on the live site, then re-run.` }),
  provision_site: () => ({ __error: 'provision_site must not be called: a site for this domain already exists' }),
};
