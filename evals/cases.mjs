// Eval cases. Each runs one prompt against one fixture and asserts on the
// final text plus the tool calls the mock actually received.
//
//   mustMatch      — every regex must appear in the answer
//   mustNotMatch   — none of these may appear
//   maxCalls       — call-budget ceiling for the skill under test
//   mustCall       — these tools must have been called
//   mustNotCall    — these tools must never be called
//   allowRejected  — set true only for cases that deliberately test error paths
export default [
  {
    id: 'healthy-says-so',
    fixture: 'ecommerce-healthy',
    prompt: 'Run my weekly health check.',
    maxCalls: 10,
    mustMatch: [/on track|✅/i],
    mustNotMatch: [/🔴|act now/i],
    mustCall: ['get_overview'],
  },
  {
    id: 'drop-isolates-campaign',
    fixture: 'ecommerce-paid-search-drop',
    prompt: 'Conversions fell this week. Why?',
    maxCalls: 14,
    mustMatch: [/generic-es/, /paid search/i],
    mustNotMatch: [/seasonal/i],
    mustCall: ['get_bot_stats', 'get_campaigns'],
  },
  {
    id: 'spike-is-bots-not-growth',
    fixture: 'ecommerce-bot-spike',
    prompt: 'Traffic jumped 58% this month. Are we growing?',
    maxCalls: 12,
    mustMatch: [/bot/i, /cheap-traffic\.example|referral/i],
    mustNotMatch: [/congratulations|great news|growing well/i],
    mustCall: ['get_bot_stats'],
  },
  {
    id: 'empty-bot-stats-is-not-zero-percent',
    fixture: 'ecommerce-no-agent-analytics',
    prompt: 'Traffic is up a lot. Is this real, and are bots involved?',
    maxCalls: 12,
    mustMatch: [/agent analytics|not enabled|unavailable|unvalidated/i],
    mustNotMatch: [/\b0\s*%\s*(of\s*)?bots?\b/i, /no bots? (were )?(detected|found)/i],
    mustCall: ['get_bot_stats'],
  },
  {
    id: 'sku-friction-found',
    fixture: 'ecommerce-sku-friction',
    prompt: 'Which products get viewed but not added to cart?',
    maxCalls: 14,
    mustMatch: [/SKU-8841/],
    mustNotMatch: [/SKU-1007/],
    mustCall: ['list_property_keys', 'get_property_breakdown'],
  },
  {
    id: 'hotel-seasonal-no-action',
    fixture: 'hotel-seasonal-october',
    prompt: 'Bookings are down a third versus last month. What is going on?',
    maxCalls: 14,
    mustMatch: [/seasonal|year over year|yoy/i, /flat|stable|in line/i],
    mustNotMatch: [/🔴/],
    mustCall: ['get_overview'],
  },
  {
    id: 'saas-last-step-broken',
    fixture: 'saas-demo-drop',
    prompt: 'Demo requests halved but traffic is the same. Where is the leak?',
    maxCalls: 12,
    mustMatch: [/form|last step|final step|submission/i],
    mustNotMatch: [/traffic (is )?the problem|acquisition problem/i],
  },
  {
    id: 'multi-site-asks-first',
    fixture: 'multi-site',
    multiSite: true,       // no SEALMETRICS_SITE_ID, so it has to ask
    prompt: 'How did my site do this month?',
    maxCalls: 4,
    mustMatch: [/which site|store-es|store-fr|hotel-costa/i],
    mustNotCall: ['get_channels'],
    allowRejected: true,
  },
  {
    id: 'no-api-key-gives-instructions',
    fixture: 'no-api-key',
    noApiKey: true,        // the whole point of this case
    prompt: 'Run my weekly health check.',
    maxCalls: 6,
    mustMatch: [/SEALMETRICS_API_KEY|api (key|token)/i, /settings|my\.sealmetrics\.com/i],
    mustNotMatch: [/here (is|are) your (weekly|report)/i],
    // With no key the SessionStart hook tells the model not to call the tools,
    // so zero calls is the correct behavior, not a failure.
    maxCalls: 0,
    allowRejected: true,
  },
  {
    id: 'install-reuses-existing-site',
    fixture: 'install-site-already-exists',
    prompt: 'Install Sealmetrics on demo-store.com. The repo is here.',
    maxCalls: 8,
    mustMatch: [/already (exists|has)|existing site/i],
    mustNotMatch: [/created (a |the )?(new )?(site|account)/i],
    mustCall: ['list_sites'],
    mustNotCall: ['provision_site'],
  },
];
