#!/usr/bin/env node
/**
 * Seal Watch — the loop that makes saved alert rules actually watch.
 *
 * Sealmetrics stores alert rules and can deliver notifications, but nothing in
 * the product ever evaluates one: `check_and_trigger` is called only from a
 * test, and creating a rule needs a scope that only a dashboard session has.
 * Everything a rule needs to be JUDGED, though, is under `/stats/`, which
 * `stats:read` covers and every API key carries. So the evaluation can live
 * out here, with no change to the product.
 *
 * It runs no model. The verdicts are arithmetic, which makes them cheap,
 * deterministic and reproducible — the opposite of the scheduled-model
 * approach that was tried and retired in plugin 1.13.0.
 *
 *   node watcher/watch.mjs            # loop forever (Railway)
 *   node watcher/watch.mjs --once     # one pass, then exit (cron, or a check)
 *
 * Configuration is in the environment. See watcher/README.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, ApiError } from './lib/api.mjs';
import { evaluate, STATUS } from './lib/families.mjs';
import { store } from './lib/store.mjs';
import { deliverer } from './lib/deliver.mjs';
import { validate } from '../seal-copilot/hooks/scripts/lib/validate.mjs';
import { isActive, localParts, localDay, activeWindowStart, activeMinutesBetween } from './lib/clock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ONCE = process.argv.includes('--once');
const log = (...a) => console.log(new Date().toISOString(), ...a);

// How often each family is worth re-reading. A silence rule is the only one
// that benefits from five minutes; a cumulative curve barely moves in that time.
const CADENCE_MINUTES = { silence: 5, drop: 15, spike: 15, threshold: 60 };

// ---------------------------------------------------------------- config
/** The rule contract is the plugin's, not a second one. */
export function ruleSchema() {
  const p = join(here, '..', 'seal-copilot', 'hooks', 'schemas', 'alerts.json');
  return JSON.parse(readFileSync(p, 'utf8')).properties.rules.items;
}

/** @returns {string[]} everything wrong with this config, or an empty list. */
export function configProblems(cfg, env = process.env) {
  if (!cfg || typeof cfg !== 'object') return ['configuration is not an object'];
  if (!Array.isArray(cfg.sites) || !cfg.sites.length) return ['configuration has no `sites`'];
  const schema = ruleSchema();
  const problems = [];
  const seen = new Set();
  for (const site of cfg.sites) {
    if (!site.site_id) { problems.push('a site has no `site_id`'); continue; }
    if (!site.token_env) {
      problems.push(`${site.site_id}: no \`token_env\`. Name the variable that holds this client's token; never put the token in the config`);
    } else if (!env[site.token_env]) {
      problems.push(`${site.site_id}: ${site.token_env} is not set in the environment`);
    }
    for (const rule of site.rules || []) {
      const key = `${site.site_id}:${rule.id}`;
      if (seen.has(key)) problems.push(`${key}: two rules share this id`);
      seen.add(key);
      for (const e of validate(rule, schema, rule.id || 'rule')) problems.push(`${site.site_id}: ${e}`);
      if (rule.timezone) {
        try { localParts(new Date(), rule.timezone); }
        catch { problems.push(`${site.site_id}/${rule.id}: ${rule.timezone} is not an IANA timezone`); }
      }
    }
  }
  return problems;
}

function readRaw() {
  if (process.env.SEAL_CONFIG) return process.env.SEAL_CONFIG;
  const path = process.env.SEAL_CONFIG_PATH;
  if (path && existsSync(path)) return readFileSync(path, 'utf8');
  return null;
}

export function loadConfig() {
  const raw = readRaw();
  if (!raw) {
    throw new Error('No configuration. Set SEAL_CONFIG to the JSON, or SEAL_CONFIG_PATH to a file. ' +
      'See watcher/README.md; watcher/config.example.json is a working shape.');
  }
  let cfg;
  try { cfg = JSON.parse(raw); }
  catch (e) { throw new Error(`Configuration is not valid JSON: ${e.message}`); }
  const problems = configProblems(cfg);
  if (problems.length) {
    throw new Error('Configuration is not usable:\n' + problems.map((p) => '  · ' + p).join('\n'));
  }
  return cfg;
}

/**
 * Re-read the config between passes, so adding or pausing a rule takes effect
 * without a redeploy.
 *
 * A broken edit must never stop the watch: if the new file does not parse or
 * does not validate, the problem is logged once and the last good config keeps
 * running. The alternative is that a typo in one rule silences every rule.
 */
export function reloader(initial) {
  let current = initial;
  let lastRaw = readRaw();
  let lastComplaint = '';
  return () => {
    const raw = readRaw();
    // Compare the CONTENT, not the modification time. mtime granularity is one
    // second on some filesystems — including the container's — so two edits in
    // the same second share a timestamp and the second one is never seen. A
    // config file is a few kilobytes read every few minutes; reading it is
    // cheaper than the class of bug that assumption creates.
    if (!raw || raw === lastRaw) return current;
    lastRaw = raw;
    let next;
    try { next = JSON.parse(raw); }
    catch (e) {
      const msg = `config changed but is not valid JSON (${e.message}); keeping the previous one`;
      if (msg !== lastComplaint) { log(msg); lastComplaint = msg; }
      return current;
    }
    const problems = configProblems(next);
    if (problems.length) {
      const msg = `config changed but is not usable, keeping the previous one:\n` +
        problems.map((p) => '  · ' + p).join('\n');
      if (msg !== lastComplaint) { log(msg); lastComplaint = msg; }
      return current;
    }
    const before = current.sites.reduce((a, s) => a + (s.rules || []).length, 0);
    const after = next.sites.reduce((a, s) => a + (s.rules || []).length, 0);
    log(`config reloaded: ${next.sites.length} site(s), ${after} rule(s) (was ${before})`);
    lastComplaint = '';
    current = next;
    return current;
  };
}

// ---------------------------------------------------------------- one rule
/** Fetch exactly what this family needs. `shared` holds the per-site overview. */
async function gather(api, rule, shared) {
  const kind = rule.metric.kind;
  const type = rule.metric.type;
  const base = { entrancesToday: shared.overview.entrances };

  if (rule.family === 'threshold') {
    const value = kind === 'revenue' ? shared.overview.revenue
      : kind === 'entrances' ? shared.overview.entrances
      : kind === 'microconversion' ? await api.microconversionsToday(type)
      : await api.conversionsToday(type);
    return { ...base, value };
  }

  const dayTotal = kind === 'microconversion'
    ? await api.microconversionsToday(type)
    : kind === 'revenue' ? shared.overview.revenue
    : kind === 'entrances' ? shared.overview.entrances
    : await api.conversionsToday(type);

  if (rule.family === 'silence') {
    const tz = rule.timezone;
    const needMinutes = (rule.condition.hours ?? 0) * 60;
    // Today's own watch window, per rule. Sharing one look-back across every
    // rule on the site made a four-hour rule report a twenty-eight-hour gap,
    // because the window came from a twenty-four-hour rule sitting beside it.
    const windowStart = activeWindowStart(api.now(), rule.active_hours, tz);
    const watchedToday = activeMinutesBetween(windowStart, api.now(), rule.active_hours, tz);
    const raw = (kind === 'conversion' || kind === 'microconversion');

    let lastEventAt = raw ? await api.lastEventAt(kind, type, dayTotal) : null;
    let searchedFrom = windowStart.toISOString();
    let bounded = false;

    if (raw && !lastEventAt && watchedToday < needMinutes) {
      // Today cannot settle it: the gap began earlier. Look back far enough to
      // cover the window twice, and say so when even that found nothing.
      const back = new Date(api.now().getTime() - Math.max(2, rule.condition.hours / 6) * 86400000);
      const day = (d) => localDay(d, tz);
      const found = await api.lastEventInRange(kind, type, day(back), day(api.now()));
      if (found) lastEventAt = found;
      else { searchedFrom = back.toISOString(); bounded = true; }
    }
    return { ...base, dayTotal, lastEventAt, searchedFrom, bounded };
  }
  return { ...base, dayToDate: dayTotal };
}

async function checkRule({ api, site, rule, shared, incidents, deliver, now }) {
  const key = `${site.site_id}:${rule.id}`;

  if (rule.expires_at && localParts(now, rule.timezone).date > rule.expires_at) {
    return { rule: rule.id, status: 'expired' };
  }

  let data;
  try { data = await gather(api, rule, shared); }
  catch (e) {
    // A refusal is not a verdict. Never notify on it, and never treat a failed
    // read as silence — that would page every customer during an outage of ours.
    return { rule: rule.id, status: 'error', error: e.message, retryable: e instanceof ApiError ? e.retryable : false };
  }

  const verdict = evaluate(rule, data, now);

  if (verdict.status === STATUS.FIRES) {
    if (verdict.startedAt === undefined && rule.family === 'spike') {
      try { verdict.evidence.top_referrer = await api.topReferrer(); } catch { /* evidence, not a blocker */ }
    }
    if (incidents.inCooldown(key, now, rule.cooldown_minutes ?? 60)) {
      return { rule: rule.id, status: 'cooldown', headline: verdict.headline };
    }
    const incident = incidents.start(key, { at: now.toISOString(), headline: verdict.headline, evidence: verdict.evidence });
    if (incident) {
      await deliver.send({ rule, siteId: site.site_id, verdict, kind: 'fires', incident });
      const seen = incidents.recentCount(key, now);
      if (seen > 2) log(`NOISE: ${key} has opened ${seen} incidents in 7 days. Propose a longer window.`);
      return { rule: rule.id, status: 'fired', headline: verdict.headline };
    }
    return { rule: rule.id, status: 'still_open', headline: verdict.headline };
  }

  if (verdict.status === STATUS.OK || verdict.status === STATUS.QUIET) {
    const was = incidents.resolve(key, now.toISOString());
    if (was) {
      incidents.archive(key, was.started_at);
      await deliver.send({ rule, siteId: site.site_id, verdict, kind: 'resolved', incident: was });
      return { rule: rule.id, status: 'recovered', headline: verdict.headline };
    }
  }
  return { rule: rule.id, status: verdict.status, headline: verdict.headline };
}

// ---------------------------------------------------------------- one pass
export async function pass(cfg, incidents, now = new Date(), fetchImpl = globalThis.fetch) {
  const report = [];
  for (const site of cfg.sites) {
    const api = client({ token: process.env[site.token_env], siteId: site.site_id, fetchImpl });
    const deliver = deliverer({
      slackWebhook: site.slack_webhook_env ? process.env[site.slack_webhook_env] : undefined,
      webhookUrl: site.webhook_url,
      webhookSecret: site.webhook_secret_env ? process.env[site.webhook_secret_env] : undefined,
      fetchImpl, log,
    });

    const due = (site.rules || []).filter((rule) => {
      const key = `${site.site_id}:${rule.id}`;
      if (rule.status !== 'active') return false;
      const at = incidents.due(key);
      if (at && now < at) return false;
      // A rule outside its window costs no call at all.
      if (rule.active_hours && !isActive(now, rule.active_hours, rule.timezone)) {
        incidents.setDue(key, new Date(now.getTime() + 15 * 60000));
        return false;
      }
      return true;
    });
    if (!due.length) continue;

    // One overview per site per pass, shared by every rule on it. This is what
    // keeps the whole service under a request a minute: the 240/min limit on a
    // Growth plan is never the constraint.
    let shared;
    try {
      shared = { overview: await api.overviewToday() };
    } catch (e) {
      report.push({ site: site.site_id, status: 'error', error: e.message });
      continue;
    }

    for (const rule of due) {
      const r = await checkRule({ api, site, rule, shared, incidents, deliver, now });
      incidents.setDue(`${site.site_id}:${rule.id}`,
        new Date(now.getTime() + (CADENCE_MINUTES[rule.family] ?? 15) * 60000));
      report.push({ site: site.site_id, ...r });
    }
  }
  return report;
}

// ---------------------------------------------------------------- the loop
async function heartbeat(url, summary) {
  if (!url) return;
  try { await fetch(url, { method: 'POST', body: JSON.stringify(summary) }); }
  catch (e) { log(`heartbeat failed: ${e.message}`); }
}

async function main() {
  let cfg = loadConfig();
  // --check validates and exits: what to run in CI, or after editing a rule,
  // before trusting that the service will still come up.
  if (process.argv.includes('--check')) {
    const rules = cfg.sites.reduce((a, s) => a + (s.rules || []).length, 0);
    log(`configuration is usable: ${cfg.sites.length} site(s), ${rules} rule(s)`);
    return process.exit(0);
  }
  const reload = reloader(cfg);
  const incidents = store(process.env.SEAL_STATE_PATH);
  const interval = Number(cfg.interval_seconds ?? process.env.SEAL_INTERVAL_SECONDS ?? 300) * 1000;

  const rules = cfg.sites.reduce((a, s) => a + (s.rules || []).filter((r) => r.status === 'active').length, 0);
  log(`watching ${rules} active rule(s) across ${cfg.sites.length} site(s), every ${interval / 1000}s`);
  if (!incidents.persistent) {
    log('WARNING: SEAL_STATE_PATH is unset, so incidents live in memory. A restart re-notifies an open incident.');
  }

  let cycle = 0;
  for (;;) {
    const started = Date.now();
    cfg = reload();
    let report = [];
    try { report = await pass(cfg, incidents); }
    catch (e) { log(`pass failed: ${e.message}`); }

    // A heartbeat every cycle, because the way this service fails is silently:
    // if it stops, nothing fires and nobody notices. Point SEAL_HEARTBEAT_URL
    // at a dead-man's-switch (healthchecks.io and Better Stack both do this).
    const acted = report.filter((r) => ['fired', 'recovered', 'error'].includes(r.status));
    const summary = { cycle: ++cycle, checked: report.length, ...incidents.summary(),
                      acted: acted.length, ms: Date.now() - started };
    log(`cycle ${summary.cycle}: ${summary.checked} checked, ${summary.open} open, ${summary.acted} acted, ${summary.ms}ms`);
    for (const r of acted) {
      // A site-level failure carries no rule: the read that every rule on that
      // site shares is what failed, so name the site alone.
      const what = r.rule ? `${r.site}/${r.rule}` : `${r.site} (every rule)`;
      log(`  ${r.status} ${what}${r.headline ? ' — ' + r.headline : ''}${r.error ? ' — ' + r.error : ''}`);
    }
    await heartbeat(process.env.SEAL_HEARTBEAT_URL, summary);

    if (ONCE) return acted.some((r) => r.status === 'error') ? process.exit(1) : process.exit(0);
    await new Promise((r) => setTimeout(r, Math.max(1000, interval - (Date.now() - started))));
  }
}

// Importable for the tests; only the CLI starts the loop.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(2); });
}
export { checkRule, gather, CADENCE_MINUTES };
