import * as f from './_lib.mjs';
export const meta = { name: 'api-text-error',
  summary: 'The server answers "Error: site_id is required" as plain text inside a successful response — its real behaviour. The skill must recognise a failed call, not report the error string as data.' };
const MSG = 'site_id is required. Either pass it as a parameter or set the SEALMETRICS_SITE_ID environment variable.';
export const tools = {
  list_sites: f.site(),
  get_overview: { __textError: MSG }, get_channels: { __textError: MSG }, get_campaigns: { __textError: MSG },
};
