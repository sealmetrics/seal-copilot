import * as f from './_lib.mjs';
export const meta = {
  name: 'multi-site',
  summary: 'Three sites and no SEALMETRICS_SITE_ID. Must ask which one before analyzing anything.',
};
export const tools = {
  list_sites: { sites: [
    { site_id: 'acct_a', name: 'store-es.example', url: 'https://store-es.example', timezone: 'Europe/Madrid', currency: 'EUR' },
    { site_id: 'acct_b', name: 'store-fr.example', url: 'https://store-fr.example', timezone: 'Europe/Paris', currency: 'EUR' },
    { site_id: 'acct_c', name: 'hotel-costa.example', url: 'https://hotel-costa.example', timezone: 'Europe/Madrid', currency: 'EUR' }] },
  get_overview: () => ({ __error: 'site_id is required when the account has multiple sites' }),
  get_channels: () => ({ __error: 'site_id is required when the account has multiple sites' }),
};
