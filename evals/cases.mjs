// Eval cases. Each runs one prompt against one fixture and asserts on the
// final text plus the tool calls the mock actually received.
//
//   mustMatch      — every regex must appear in the answer
//   mustNotMatch   — none of these may appear
//   maxCalls       — call-budget ceiling for the skill under test
//   mustCall       — these tools must have been called
//   mustNotCall    — these tools must never be called
//   allowRejected  — set true only for cases that deliberately test error paths
//
// Writing assertions: models vary their typography. Match "paid search" with
// SEP, not a literal space — a model that writes "paid\u2011search" with a
// non-breaking hyphen is not wrong. And never forbid a bare phrase that could
// legitimately appear inside a disclaimer: forbid the affirmative *claim*.
// eslint-disable-next-line no-unused-vars -- kept for future prose assertions
const SEP = '[\\s\\u2010-\\u2015\\u2212-]?';   // space, any dash, or nothing
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
    mustMatch: [
      // Naming the campaign is the strong claim; requiring the channel name too
      // is redundant with it and only adds a way to flake on wording.
      /generic-es/,
      /230/,                          // operating rule 1: always quantify
      /verify|re-?run|re-?check|check again|in 7 days|next week/i,  // the skill owes a verification plan
      /year over year|year-over-year|yoy|last year/i,                // step 6 must be performed, not skipped
    ],
    // Forbid the affirmative conclusion, not the word. Step 6 of the cause
    // hierarchy requires the model to check and rule out seasonality, so
    // "not seasonal — yoy is also down" must be allowed to say "seasonal".
    mustNotMatch: [
      /\b(is|was|it'?s|appears|looks)\s+(likely\s+|probably\s+)?seasonal/i,
      /seasonal(ity)?\s+(drop|decline|effect|pattern)\b/i,
      /this is seasonal/i,
    ],
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
    // The concept, not one phrasing: the model must convey that the bot data is
    // missing or untrustworthy. It wrote "agent analytics is off" on one run and
    // "the bot report can't be trusted" on the next; both are right. The strict
    // safety property is mustNotMatch below.
    mustMatch: [
      new RegExp([
        'agent analytics', 'not enabled', 'unavailable', 'unvalidated',
        'no bot data', 'returned empty', 'empty result',
        "can'?t be trusted", 'cannot be trusted', 'not reliable', 'unreliable',
        "can'?t confirm", 'cannot confirm', 'unconfirmed', 'not measured',
      ].join('|'), 'i'),
    ],
    // Forbid the affirmative claim only. "which is not the same as 0% bots" is
    // the disclaimer we want, and a naive /0% bots/ ban punishes it.
    mustNotMatch: [
      /bot share (is|was|:)\s*0/i,
      /0\s*%\s*(of\s*)?(sessions|traffic|visits)\s*(are|were|was)?\s*bots?/i,
      /(no|zero)\s+bots?\s+(were\s+)?(detected|found)/i,
    ],
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
