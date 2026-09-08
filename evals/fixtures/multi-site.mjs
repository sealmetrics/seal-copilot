import * as f from './_lib.mjs';
export const meta = { name: 'multi-site',
  summary: 'Three sites and no SEALMETRICS_SITE_ID. Must ask which one before analyzing anything.' };
export const tools = {
  list_sites: [
    { site_id: 'acct_a', name: 'store-es.example', domains: ['store-es.example'], timezone: 'Europe/Madrid' },
    { site_id: 'acct_b', name: 'store-fr.example', domains: ['store-fr.example'], timezone: 'Europe/Paris' },
    { site_id: 'acct_c', name: 'hotel-costa.example', domains: ['hotel-costa.example'], timezone: 'Europe/Madrid' }],
  // The real server's wording, as text in a successful response.
  get_overview: { __textError: 'site_id is required. Either pass it as a parameter or set the SEALMETRICS_SITE_ID environment variable.' },
  get_channels: { __textError: 'Access denied to site "acct_demo". Your API key may not have access to this site.' },   // modern api_key: read scope absent, 403 by design
};
