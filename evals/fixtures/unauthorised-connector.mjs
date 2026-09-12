export const meta = { name: 'unauthorised-connector',
  summary: 'The connector is installed but not yet authorised, so every call comes back 401. The skill must attempt once, stop, and send the user to the /mcp panel — not to an API token page, which is no longer how anyone authenticates.' };
// Since 1.11.0 the plugin declares the remote OAuth server, so there is no
// SEALMETRICS_API_KEY to be missing: the failure a real user hits is an
// unauthorised connector, and the remedy is a browser login from /mcp.
const denied = () => ({ __error: '401 Unauthorized: this connection is not authorised for any Sealmetrics account' });
export const tools = new Proxy({}, { get: () => denied, has: () => true, ownKeys: () => [] });
