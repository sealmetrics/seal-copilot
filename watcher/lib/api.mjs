// The Sealmetrics read API, and nothing else.
//
// Every path here is under `/stats/`, which the backend guards with
// `require_scope("stats:read")` — a scope every API key carries. That is the
// whole reason this watcher can exist without a change to the product: the data
// a rule needs is already readable, it is only the saving and the evaluating of
// rules that the product does not open up.
//
// It never writes. It never touches `/alerts`, which needs the `write` scope
// that only a dashboard session has.

const BASE = process.env.SEALMETRICS_BASE_URL || 'https://my.sealmetrics.com/api/v1';

export class ApiError extends Error {
  constructor(status, body, path) {
    super(`${path} → HTTP ${status}: ${String(body).slice(0, 200)}`);
    this.status = status;
    this.path = path;
    this.retryable = status === 429 || status >= 500;
  }
}

export function client({ token, siteId, baseUrl = BASE, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  if (!token) throw new Error('no API token for this site');
  if (!siteId) throw new Error('no site id');

  async function get(path, params = {}) {
    const url = new URL(baseUrl.replace(/\/$/, '') + path);
    url.searchParams.set('account_id', siteId);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetchImpl(url, {
      headers: { 'X-API-Key': token, accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text, path);
    let json;
    try { json = JSON.parse(text); } catch { throw new ApiError(res.status, `not JSON: ${text.slice(0, 120)}`, path); }
    // The API wraps payloads in { data: … }; the raw endpoints wrap twice.
    return json?.data !== undefined ? json.data : json;
  }

  return {
    now,
    siteId,

    /** Day total for a conversion type. */
    async conversionsToday(type) {
      const r = await get('/stats/conversions', { period: 'today' });
      const rows = r?.data ?? r ?? [];
      const row = Array.isArray(rows) ? rows.find((x) => !type || x.conversion_type === type) : null;
      return Number(row?.count ?? 0);
    },

    async microconversionsToday(type) {
      const r = await get('/stats/microconversions', { period: 'today', conversion_type: type });
      const rows = r?.data ?? r ?? [];
      const row = Array.isArray(rows) ? rows.find((x) => !type || x.conversion_type === type) : null;
      return Number(row?.count ?? 0);
    },

    /**
     * The most recent event of a type today, as an instant.
     *
     * Asks for the LAST page, not the first: the endpoint is capped at 100 rows
     * and the newest rows sit at the end. Returns null when nothing happened.
     */
    async lastEventAt(kind, type, dayTotal) {
      const path = kind === 'microconversion' ? '/stats/microconversions/raw' : '/stats/conversions/raw';
      if (!dayTotal) return null;
      const page = Math.max(1, Math.ceil(dayTotal / 100));
      const r = await get(path, { period: 'today', limit: 100, page, conversion_type: type });
      const rows = r?.data ?? r ?? [];
      if (!Array.isArray(rows) || !rows.length) return null;
      let latest = null;
      for (const row of rows) {
        const ts = row.timestamp_utc || row.timestamp_local;
        if (!ts) continue;
        const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + 'Z');
        if (!latest || d > latest) latest = d;
      }
      return latest ? latest.toISOString() : null;
    },

    /** Entrances and revenue today. One call serves both, and every rule. */
    async overviewToday() {
      const r = await get('/stats/overview', { period: 'today' });
      return {
        entrances: Number(r?.traffic?.entrances ?? 0),
        conversions: Number(r?.traffic?.conversions ?? 0),
        revenue: Number(r?.conversions?.revenue ?? r?.traffic?.revenue ?? 0),
      };
    },

    /** Only fetched when a spike fires: what the traffic did, never who sent it. */
    async topReferrer() {
      const r = await get('/stats/referrers/top', { period: 'today', limit: 1 });
      const rows = Array.isArray(r) ? r : (r?.data ?? []);
      const top = rows[0];
      if (!top) return null;
      return {
        referrer: top.referrer ?? top.name ?? null,
        entrances: Number(top.entrances ?? 0),
        bounce_rate: Number(top.bounce_rate ?? 0),
        conversions: Number(top.conversions ?? 0),
      };
    },
  };
}
