// Install fixtures: real-shaped setup-tool responses and a test double of
// plan_install / simulate_install.
//
// The real tools live in @sealmetrics/mcp (setup-core planInstall and
// simulateInstall, sealmetrics2 PR #386, PRD-058). They run the production
// tracker in node:vm, which this harness cannot import. The double keeps the
// RESPONSE SHAPE of the real tools and implements only the rules the install
// evals exercise — taxonomy (PL-01), identifiers (PL-02), revenue (PL-04), a
// manual route pageview (PL-08), the site's domains (PL-11), the snippet
// account (PL-16); stale plan, not_in_plan (SM-00) and revenue that is not a
// number (SM-04) — and, for level 'page' (F3), the unavailable / invalid_input /
// passing-flow shapes of the browser simulation. An eval here tests the SKILL's behaviour around those tools:
// that it plans before editing, waits for approval, fixes what fails and never
// calls a simulation a verification. The rules themselves are tested in
// setup-core, against the real tracker.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(readFileSync(join(here, '..', 'taxonomy.json'), 'utf8'));
const CONV = new Set(taxonomy.conversions);
const MICRO = new Set(taxonomy.microconversions);
const LEGACY = taxonomy.legacyNames.names;

// get_tracking_code as mcp-server/src/tools/tracking.ts returns it (2026-09-14).
export const trackingCode = (siteId = 'acct_demo') => ({
  site_id: siteId,
  tracker_url: `https://t.sealmetrics.com/t.js?id=${siteId}`,
  script_tag: `<script src="https://t.sealmetrics.com/t.js?id=${siteId}" defer></script>`,
  js_api: {
    pageview: { description: 'Pageview with optional content group', signatures: [{ call: "sealmetrics({ group: 'checkout' })", description: 'Manual pageview; the tracker already sends one on load and on SPA navigation' }] },
    conversion: { description: 'Conversion with revenue', signatures: [{ call: "sealmetrics.conv('purchase', 149.99, { currency: 'EUR' })", description: 'amount must be a number' }] },
    microconversion: { description: 'Microconversion', signatures: [{ call: "sealmetrics.micro('add_to_cart', { product_id: '123', price: 29.99 })", description: 'same product_id as view_item' }] },
  },
  implementation_guide: {
    installation: ['Place the script tag in <head>, before anything that calls sealmetrics.*'],
    spa_support: 'Automatic. Works with React Router, Vue Router, Next.js, Nuxt, Angular, and any History API-based routing. No extra config.',
    debugging: 'Check the network tab for POST /event (204).',
    naming_conventions: ['snake_case event names from the closed taxonomy'],
    content_grouping: { description: 'Group pages', recommended_groups: ['product', 'checkout', 'blog'], via_js: "sealmetrics({ group: 'product' })", via_url_param: `<script src="https://t.sealmetrics.com/t.js?id=${siteId}&group=blog" defer></script>` },
  },
  examples: {
    ecommerce: { code: "sealmetrics.conv('purchase', 189.99, { currency: 'EUR' })", description: 'On the confirmation page' },
    saas: { code: "sealmetrics.conv('signup', 0, { plan: 'trial' })", description: 'After the account is created' },
    blog_media: { code: "sealmetrics.micro('newsletter_signup')", description: 'On subscribe' },
    react_nextjs: { code: "window.sealmetrics?.micro('add_to_cart', { product_id: productId, price })", description: 'In a click handler' },
  },
});

export const instrumentationGuide = (accountId = 'acct_demo') => ({
  account_id: accountId,
  guide: `# SealMetrics event instrumentation guide\n\nAccount ID: \`${accountId}\`\n\n` +
    '> PRIVACY: never pass personal data, order/transaction/invoice IDs, or user/customer IDs.\n\n' +
    `Conversions: ${taxonomy.conversions.join(', ')}.\nMicroconversions: ${taxonomy.microconversions.join(', ')}.\n` +
    "sealmetrics.conv('purchase', 149.99, { currency: 'EUR' }) — amount is a number.\n" +
    "sealmetrics.micro('view_item', { product_id: '123', price: 99.99 }) — same product_id on add_to_cart.\n",
});

const FORBIDDEN_KEY = /(^|_)(e?mail|phone|tel|address|ssn|dob|ip)($|_)|^name$|(^|_)(first|last|full|customer|user|client|member|contact|company)_?name($|_)|(^|_)(order|transaction|invoice|receipt)_?(id|no|number|num)($|_)|(^|_)(user|customer|client|member|account)_?id($|_)/i;

const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);

const planOf = (args) => {
  const p = args?.plan && typeof args.plan === 'object' ? args.plan : args || {};
  const events = (p.events || []).map(e => ({ ...e, name: e.kind === 'pageview' ? 'pageview' : String(e.name || '').toLowerCase() }));
  return {
    account_id: p.account_id || 'acct_demo', vertical: p.vertical || null,
    site: { domain: String(p.site?.domain || '').toLowerCase() },
    loader: { file: p.loader?.file, snippet_url: String(p.loader?.snippet_url || ''), stub: p.loader?.stub === true },
    events: [...events].sort((a, b) => canonical(a) < canonical(b) ? -1 : 1),
    product_identifier: p.product_identifier || null,
  };
};

export const planId = (args) => createHash('sha256').update(canonical(planOf(args))).digest('hex').slice(0, 12);

function findings(plan, domains) {
  const out = [];
  const tracked = plan.events.filter(e => e.kind !== 'pageview');
  for (const e of tracked) {
    const known = e.kind === 'conv' ? CONV : MICRO;
    if (!known.has(e.name)) out.push({ code: 'PL-01', severity: 'block', event: e.name,
      message: `'${e.name}' is not in the closed ${e.kind} taxonomy; verify_event_instrumented rejects it as out_of_taxonomy.`,
      fix: LEGACY[e.name] ? `Write ${LEGACY[e.name]}.` : 'Pick a name from get_instrumentation_guide and put the distinction in a property.' });
    const keys = Object.entries(e.properties || {}).flatMap(([k, s]) => [k, ...Object.keys(s?.item || {}).map(ik => `${k}[0].${ik}`)]);
    for (const k of keys) if (FORBIDDEN_KEY.test(k.split('.').pop())) out.push({ code: 'PL-02', severity: 'block', event: e.name,
      message: `Property '${k}' identifies a person or an order. Sealmetrics is consentless because no event carries identifiers.`,
      fix: `Remove '${k}'. To avoid counting a purchase twice, key a sessionStorage flag on the order id in the browser without sending it.` });
    if (e.kind === 'conv' && ['purchase', 'subscription'].includes(e.name) && !e.value) out.push({ code: 'PL-04', severity: 'block', event: e.name,
      message: `'${e.name}' has no revenue. It would be stored with amount 0.`, fix: `Declare value: sealmetrics.conv('${e.name}', <number>, {...}).` });
    if (e.kind === 'conv' && e.value && (typeof e.value.example === 'string' || (e.value.type && e.value.type !== 'number'))) out.push({ code: 'PL-04', severity: 'warn', event: e.name,
      message: `The revenue for '${e.name}' is not a number in the plan. The tracker only sends an amount whose typeof is 'number'.`, fix: `sealmetrics.conv('${e.name}', Number(${e.value.source || 'total'}), …)` });
  }
  const spaOn = !/[?&]spa=0(&|$)/.test(plan.loader.snippet_url);
  if (spaOn && plan.events.some(e => e.kind === 'pageview' && e.trigger?.type === 'route')) out.push({ code: 'PL-08', severity: 'block', event: 'pageview',
    message: 'Manual pageviews on route changes while the tracker also records History API navigations (spa=1): every navigation counts twice (PRD-034).',
    fix: 'Remove the manual route pageview, or load the tracker with &spa=0 and keep it.' });
  const host = plan.site.domain.replace(/^www\./, '');
  if (!domains.includes(host) && !domains.some(d => host.endsWith(`.${d}`))) out.push({ code: 'PL-11', severity: 'block', event: 'site',
    message: `'${plan.site.domain}' is not among the site's domains (${domains.join(', ')}). pixel-service rejects every hit from it as invalid_domain.` });
  const id = plan.loader.snippet_url.match(/[?&]id=([^&]+)/)?.[1];
  if (id !== plan.account_id) out.push({ code: 'PL-16', severity: 'block', event: 'loader',
    message: `The snippet loads account '${id ?? '(none)'}', but the plan is for '${plan.account_id}'.`, fix: 'Use the script_tag src from get_tracking_code for this site.' });
  return out.sort((a, b) => (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1));
}

export function planInstall(args, { domains = ['demo-store.com'] } = {}) {
  const plan = planOf(args);
  const id = planId(args);
  const f = findings(plan, domains);
  const blocked = f.some(x => x.severity === 'block');
  const rows = plan.events.map(e => `| ${e.kind === 'pageview' ? 'pageview' : `\`${e.name}\``} | ${e.kind} | ${e.trigger?.type ?? '—'} | ${e.trigger?.where ?? '—'} | ${Object.keys(e.properties || {}).join(', ') || '—'} | ${e.value ? (e.value.source ?? 'yes') : '—'} |`);
  return {
    plan_id: id,
    status: blocked ? 'blocked' : 'ok',
    findings: f,
    plan,
    summary_markdown: [`**Install plan \`${id}\`** — ${plan.site.domain}`, '', `Loader: \`${plan.loader.snippet_url}\``, '',
      '| Event | Kind | Trigger | Where | Properties | Revenue |', '|---|---|---|---|---|---|', ...rows].join('\n'),
    files_to_edit: [...new Set([plan.loader.file, ...plan.events.map(e => e.trigger?.where)].filter(w => w && /\//.test(w)))],
    estimate: { events: plan.events.length, max_payload_bytes: 1400, payload_limit_bytes: 15360 },
    checked: { site_domains: true, repo: Boolean(args?.repo_path) },
    next_step: blocked
      ? 'Fix every block finding and call plan_install again. Do not show a blocked plan to the user as a proposal.'
      : 'Show summary_markdown and the warn findings to the user and wait for explicit approval in their own words. Do not edit files until then; after approval, pass this plan and plan_id to simulate_install.',
  };
}

const lookup = (vars, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/;

// level 'page' (PRD-058 F3): the real tool drives a local Chromium. The double
// answers with the same shape — unavailable when the fixture has no browser,
// invalid_input for a non-local base_url without allow_remote_url, otherwise
// one passing flow per event with its expectations counted as met.
export function simulatePage(args, { browser = true } = {}) {
  const WORDING = 'Simulated in a local browser, not verified: every Sealmetrics request was answered locally and nothing reached Sealmetrics. Only verify_event_instrumented, after the user deploys, confirms an event.';
  const planArgs = args?.plan || {};
  const current = planId(planArgs);
  const base = { level: 'page', simulation_id: null, plan_id: current, verdict: 'fail', flows: [],
    tracker: { source: args?.tracker_source || 'vendored', sha256: 'mock', delay_ms: args?.tracker_delay_ms || 0 },
    not_simulated: ["invalid_domain (hits come from the dev server's host)", 'invalid_token', 'blocklist_ip', 'blocklist_ua', 'bot_detected', 'rate_limit', 'duplicate_entrance'], wording: WORDING };
  if (!args?.base_url) return { __textError: "base_url is required for level 'page': the local dev server, e.g. http://localhost:3000." };
  if (args.plan_id !== current) return { ...base, status: 'stale_plan', findings: [{ code: 'PL-00', severity: 'block', message: `This plan now hashes to ${current}, not the approved ${args.plan_id}.` }] };
  let host = '';
  try { host = new URL(args.base_url).hostname; } catch { return { ...base, status: 'invalid_input', message: `base_url '${args.base_url}' is not a URL.` }; }
  if (!LOOPBACK.test(host) && args.allow_remote_url !== true) {
    return { ...base, status: 'invalid_input', message: `base_url ${args.base_url} is not a local dev server. Driving a remote site needs allow_remote_url: true, which is the user's decision.` };
  }
  if (!Array.isArray(args.flows) || !args.flows.length) return { ...base, status: 'invalid_input', message: 'flows is empty: give one flow per planned event, with the steps that trigger it.' };
  if (!browser) {
    return { ...base, status: 'unavailable', message: 'No Chromium-based browser was found: no Chrome or Edge installed, and nothing in the Playwright cache.',
      install: ['npm install playwright-core   # in the directory the MCP server runs from, if it is missing', 'npx playwright install chromium   # ~150 MB; only if no Chrome or Edge is installed'] };
  }
  const flows = args.flows.map((f) => {
    const checks = [];
    for (const [i, st] of (f.steps || []).entries()) {
      if (st.expect_hit) checks.push({ code: 'SP-05', result: 'pass', message: `Step ${i + 1}: one '${st.expect_hit.e ?? 'pageview'}' hit.` });
      if (st.expect_pageviews !== undefined) checks.push({ code: 'SP-06', result: 'pass', message: `Step ${i + 1}: ${st.expect_pageviews} pageviews so far, as expected.` });
    }
    if (!checks.length) checks.push({ code: 'SP-00', result: 'warn', message: `Flow '${f.event}' has no expect_hit or expect_pageviews step, so it only checks the tag, the load and the console.` });
    return { event: f.event, verdict: 'pass', steps_run: (f.steps || []).length, hits: [], checks, console_errors: [] };
  });
  return { ...base, status: 'ok', verdict: 'pass', simulation_id: 'simp_' + createHash('sha256').update(current + canonical(args.flows)).digest('hex').slice(0, 12),
    browser: { source: 'installed Chrome', version: '152.0.7977.83' }, flows };
}

export function simulateInstall(args, { domains = ['demo-store.com'], browser = true } = {}) {
  if (args?.level === 'page') return simulatePage(args, { browser });
  const WORDING = 'Simulated, not verified: nothing has reached Sealmetrics. Only verify_event_instrumented, after the user deploys, confirms an event.';
  const base = { level: 'call', tracker: { sha256: 'mock', source: 'pixel-service tracker.go' }, not_simulated: ['invalid_token', 'blocklist_ip', 'blocklist_ua', 'bot_detected', 'rate_limit', 'duplicate_entrance'], wording: WORDING };
  const planArgs = args?.plan || {};
  const current = planId(planArgs);
  if (args?.plan_id !== current) {
    return { ...base, status: 'stale_plan', simulation_id: null, plan_id: current, verdict: 'fail', cases: [], scenarios: [],
      findings: [{ code: 'PL-00', severity: 'block', message: `This plan now hashes to ${current}, not the approved ${args?.plan_id}: it changed after approval. Run plan_install on the new plan and get the user's approval again.` }] };
  }
  const plan = planOf(planArgs);
  const blocking = findings(plan, domains).filter(f => f.severity === 'block');
  if (blocking.length) return { ...base, status: 'blocked_plan', simulation_id: null, plan_id: current, verdict: 'fail', cases: [], scenarios: [], findings: blocking };

  const cases = [];
  for (const c of args?.cases || []) {
    const name = String(c.event || '').toLowerCase();
    const planned = plan.events.find(e => e.name === name);
    if (!planned) {
      cases.push({ event: c.event, kind: c.kind || 'unknown', synthetic: false, verdict: 'fail', hits: [],
        checks: [{ code: 'SM-00', result: 'fail', message: `'${c.event}' is not in the approved plan (not_in_plan). Add it with plan_install and get approval before writing it.` }] });
      continue;
    }
    const checks = [{ code: 'SM-01', result: 'pass', message: 'Exactly one hit.' }, { code: 'SM-03', result: 'pass', message: `${planned.kind} '${planned.name}' as planned.` }];
    let amount = null;
    if (planned.kind === 'conv' && planned.value) {
      const expr = (c.code || '').match(/\.conv\(\s*['"`][^'"`]+['"`]\s*,\s*([^,)]+(?:\([^)]*\))?)/)?.[1]?.trim() ?? '';
      const wrapped = /^(Number|parseFloat|parseInt)\(/.test(expr) || /^\+/.test(expr);
      const inner = expr.replace(/^(Number|parseFloat|parseInt)\(|\)$/g, '').replace(/^\+/, '').replace(/^window\./, '');
      const literal = /^-?\d+(\.\d+)?$/.test(inner) ? Number(inner) : undefined;
      const resolved = literal !== undefined ? literal : lookup(c.vars || {}, inner);
      if (!wrapped && typeof resolved === 'string') {
        checks.push({ code: 'SM-04', result: 'fail', message: `amount must be a number: got string '${resolved}'. The conversion would be stored with revenue 0.`, fix: `sealmetrics.conv('${planned.name}', Number(${expr}), …)` });
        amount = 0;
      } else {
        amount = Number(resolved ?? 0) || 0;
        checks.push({ code: 'SM-04', result: 'pass', message: `Amount ${amount} stored.` });
      }
    }
    const verdict = checks.some(k => k.result === 'fail') ? 'fail' : 'pass';
    cases.push({ event: planned.name, kind: planned.kind, synthetic: false, verdict,
      hits: [{ body_bytes: 612, transport: 'beacon', rejection: null, payload: { e: planned.name, u: `https://${plan.site.domain}/` },
        stored_as: { event_type: planned.kind === 'conv' ? 'conversion' : planned.kind === 'micro' ? 'microconversion' : 'pageview', conversion_type: planned.kind === 'pageview' ? '' : planned.name, amount: amount ?? 0, is_micro: planned.kind === 'micro', content_grouping: '', properties: {} } }],
      checks });
  }
  for (const e of plan.events) {
    if (cases.some(c => c.event === e.name)) continue;
    cases.push({ event: e.name, kind: e.kind, synthetic: true, verdict: 'pass', hits: [], checks: [{ code: 'SM-01', result: 'pass', message: 'Exactly one hit.' }] });
  }
  const verdict = cases.some(c => c.verdict === 'fail') ? 'fail' : 'pass';
  const simulation_id = 'sim_' + createHash('sha256').update(current + canonical(args?.cases || [])).digest('hex').slice(0, 12);
  return { ...base, status: 'ok', simulation_id, plan_id: current, verdict, cases,
    scenarios: [{ name: 'load', verdict: 'pass', pageviews: 1, checks: [] }, { name: 'spa_navigation', verdict: 'pass', pageviews: 3, checks: [] }] };
}
