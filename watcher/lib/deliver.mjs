// Where a notification goes.
//
// Three destinations, chosen by what the site configures: a Slack incoming
// webhook, a generic signed webhook, and stdout. Stdout is not a fallback for a
// failed delivery — it is the destination you choose while setting the thing
// up, and on Railway it lands in the logs.
//
// Email is deliberately absent. Sealmetrics already has email delivery for
// alerts, with templates and an unsubscribe path, and reimplementing it here
// would mean owning deliverability for someone else's domain. When the native
// engine ships, email is what it brings.

import { createHmac } from 'node:crypto';

const ICON = { fires: '🔴', watch: '⚠️', resolved: '🟢', test: '🧪' };

/** The message a human reads, in the shape check-alerts uses. */
export function render({ rule, siteId, verdict, kind, incident }) {
  const icon = ICON[kind] || '•';
  const lines = [];
  if (kind === 'test') {
    // Wording first, because this is the one message whose whole job is to be
    // recognised as not an incident by whoever it wakes up.
    lines.push(`${icon} DELIVERY TEST, not an alert · ${siteId}`);
    lines.push('Seal Watch sent this on request to prove this channel works.');
    lines.push('Nothing is wrong. No rule fired. Nothing needs doing.');
    return lines.join('\n');
  }
  if (kind === 'resolved') {
    // How long it was OBSERVED broken: from the first firing to the last
    // evaluation that still found it broken. Not to now — the recovery
    // happened somewhere in between and claiming otherwise overstates it.
    const mins = incident?.started_at
      ? Math.round((new Date(incident.last_seen_at || incident.started_at) - new Date(incident.started_at)) / 60000)
      : null;
    const h = mins === null ? '' : mins >= 60 ? ` after ${Math.floor(mins / 60)}h ${mins % 60}m` : mins >= 1 ? ` after ${mins}m` : '';
    lines.push(`${icon} ${rule.id} recovered${h} · ${siteId}`);
    return lines.join('\n');
  }
  lines.push(`${icon} ${rule.id} · ${siteId}`);
  lines.push(verdict.headline);
  if (verdict.startedAt) lines.push(`Started ${verdict.startedAt}. Match that against your deploy log.`);
  const e = verdict.evidence || {};
  if (e.reading) lines.push(e.reading);
  if (e.top_referrer) {
    const r = e.top_referrer;
    lines.push(`Top referrer today: ${r.referrer} — ${r.entrances} entrances, ${r.bounce_rate}% bounce, ${r.conversions} conversions.`);
  }
  lines.push('Ask Seal Copilot to diagnose it: "why did conversions drop today?"');
  return lines.join('\n');
}

const EVENT = { resolved: 'alert.resolved', test: 'alert.test' };

/**
 * The body a webhook receives. Its shape is a contract with somebody else's
 * automation, written down in `watcher/schemas/webhook-payload.json` and held
 * to it by a test, so this is the only place allowed to decide it.
 */
export function webhookBody(payload) {
  return {
    version: 1,
    event: EVENT[payload.kind] || 'alert.triggered',
    site_id: payload.siteId,
    rule_id: payload.rule.id,
    family: payload.rule.family,
    status: payload.verdict?.status ?? null,
    headline: payload.verdict?.headline ?? null,
    started_at: payload.verdict?.startedAt ?? payload.incident?.started_at ?? null,
    evidence: payload.verdict?.evidence ?? null,
    sent_at: new Date().toISOString(),
  };
}

async function post(url, body, headers, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`delivery to ${new URL(url).host} failed: HTTP ${res.status}`);
}

export function deliverer({ slackWebhook, webhookUrl, webhookSecret, fetchImpl = globalThis.fetch, log = console.log }) {
  const targets = [];
  if (slackWebhook) targets.push('slack');
  if (webhookUrl) targets.push('webhook');
  if (!targets.length) targets.push('stdout');

  return {
    targets,
    async send(payload) {
      const text = render(payload);
      const errors = [];
      if (slackWebhook) {
        try { await post(slackWebhook, { text }, {}, fetchImpl); }
        catch (e) { errors.push(e.message); }
      }
      if (webhookUrl) {
        const body = webhookBody(payload);
        const headers = {};
        if (webhookSecret) {
          headers['x-seal-signature'] = 'sha256=' +
            createHmac('sha256', webhookSecret).update(JSON.stringify(body)).digest('hex');
        }
        try { await post(webhookUrl, body, headers, fetchImpl); }
        catch (e) { errors.push(e.message); }
      }
      if (!slackWebhook && !webhookUrl) log(text);
      // A failed delivery is logged and never swallowed: an alert nobody
      // received is the one failure this whole service exists to prevent.
      if (errors.length) log(`DELIVERY FAILED for ${payload.rule.id}: ${errors.join('; ')}\n${text}`);
      return { delivered: targets, errors };
    },
  };
}
