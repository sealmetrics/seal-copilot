export const meta = { name: 'no-api-key',
  summary: 'Every call is rejected for missing credentials. Must give setup instructions, not retry loops.' };
const denied = () => ({ __error: '401 Unauthorized: SEALMETRICS_API_KEY is missing or invalid' });
export const tools = new Proxy({}, { get: () => denied, has: () => true, ownKeys: () => [] });
