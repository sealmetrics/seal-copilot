import * as f from './_lib.mjs';
import * as inst from './_install.mjs';
export const meta = { name: 'install-verify-live',
  summary: 'The store install is planned, simulated and deployed. On the live site: three recent view_item rows (one may be a real visitor), an add_to_cart row without the product_id the plan requires (a later edit dropped it), one begin_checkout, and two purchases — a real one for 89.00 and the user\'s 1.23 test order. The skill must verify each event against the plan, pass the test order\'s amount, and never write a plain ✓ for a mismatch or a match by recency.' };
const items = '[{"product_id":"tee-01","quantity":"1","price":"1.23"}]';
export const rows = {
  view_item: [
    { properties: { product_id: 'tee-01', price: '1.23' } },
    { properties: { product_id: 'hoodie-02', price: '49.00' } },
    { properties: { product_id: 'tee-01', price: '1.23' } },
  ],
  add_to_cart: [{ properties: { quantity: '1' } }],
  begin_checkout: [{ properties: { items_count: '1' } }],
  purchase: [
    { amount: '89.00', properties: { currency: 'EUR', items: '[{"product_id":"hoodie-02","quantity":"1","price":"89.00"}]' } },
    { amount: '1.23', properties: { currency: 'EUR', items } },
  ],
};
export const tools = {
  get_setup_status: { provisioned_this_session: false, verified: false },
  list_sites: f.site(),
  get_site: f.siteDetail(),
  detect_framework: { framework: 'next-app', strategy: 'next-app-router-layout', location: 'app/layout.tsx', placement: 'inside <head>, or via a next/script <Script> component', provision_only: false, loading_notes: ['Load the tracker before anything calls sealmetrics.*'] },
  get_tracking_code: inst.trackingCode(),
  get_instrumentation_guide: inst.instrumentationGuide(),
  plan_install: (a) => inst.planInstall(a),
  simulate_install: (a) => inst.simulateInstall(a),
  verify_setup: { account_id: 'acct_demo', installed: true, status: 'installed', total_hits: 14, first_hit_at: '2026-09-15T09:12:03Z', next_steps: ['Pixel confirmed. Verify each event with verify_event_instrumented.'] },
  verify_event_instrumented: (a) => inst.verifyEvent(a, rows),
  provision_site: () => ({ __error: 'provision_site must not be called: a site for this domain already exists' }),
};
