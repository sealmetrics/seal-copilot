#!/usr/bin/env node
// Tests for the watcher, against a fake API and a fake clock.
//
// Nothing here touches the network. Both are injected, which is the reason the
// families are pure functions and the client takes a `fetchImpl`: a watchdog
// whose verdicts can only be checked against a live account is a watchdog
// nobody checks.
import { evaluate } from './lib/families.mjs';
import { store } from './lib/store.mjs';
import { render, deliverer, webhookBody } from './lib/deliver.mjs';
import { client } from './lib/api.mjs';
import { activeMinutesBetween, isActive, localParts } from './lib/clock.mjs';
import { pass, reloader, configProblems, ruleSchema, deliveryReport } from './watch.mjs';
import { backtest } from './lib/backtest.mjs';
import { validate } from '../seal-copilot/hooks/scripts/lib/validate.mjs';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let fails = 0;
const ok = (name, cond, got) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) { fails++; if (got !== undefined) console.log('       got: ' + JSON.stringify(got)); }
};
const TZ = 'Europe/Madrid';
const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const at = (s) => new Date(s);

const silenceRule = (over = {}) => ({
  id: 'no-conversions-4h', family: 'silence',
  metric: { kind: 'conversion', type: 'purchase' },
  condition: { hours: 4 },
  active_hours: { from: 8, to: 24, days: ALL },
  timezone: TZ, created_at: '2026-09-17', status: 'active', ...over,
});

console.log('the webhook contract');
{
  const SCHEMA = JSON.parse(readFileSync(new URL('./schemas/webhook-payload.json', import.meta.url), 'utf8'));
  const rule = { id: 'no-purchase-4h', family: 'silence' };
  const verdict = {
    status: 'fires', headline: 'No purchase for at least 4 watched hours.',
    startedAt: '2026-09-17T08:00:00.000Z', evidence: { reading: '0 today' },
  };

  // The body the code actually builds, against the contract as written down.
  // This is the gate: add a field to webhookBody and forget the schema, and
  // additionalProperties catches it here rather than in somebody's n8n.
  for (const [name, payload] of [
    ['a firing rule', { kind: 'fires', siteId: 'acct', rule, verdict }],
    ['a recovery', { kind: 'resolved', siteId: 'acct', rule, verdict, incident: { started_at: '2026-09-17T08:00:00.000Z' } }],
    ['a delivery test', { kind: 'test', siteId: 'acct', rule: { id: 'delivery-test', family: 'silence' }, verdict: null }],
    ['a rule with no evidence', { kind: 'fires', siteId: 'acct', rule, verdict: { status: 'watch', headline: 'h' } }],
  ]) {
    const errs = validate(webhookBody(payload), SCHEMA);
    ok(`${name} matches the published contract`, errs.length === 0, errs);
  }

  ok('the version is stated, so a consumer can branch on it',
    webhookBody({ kind: 'fires', siteId: 'a', rule, verdict }).version === 1);
  ok('a test carries its own event name and never looks like an incident',
    webhookBody({ kind: 'test', siteId: 'a', rule, verdict: null }).event === 'alert.test');
  ok('a recovery is distinguishable from a trigger',
    webhookBody({ kind: 'resolved', siteId: 'a', rule, verdict }).event === 'alert.resolved');
  ok('an unknown kind degrades to a trigger rather than to nothing',
    webhookBody({ kind: 'weird', siteId: 'a', rule, verdict }).event === 'alert.triggered');

  // A field the schema does not know must fail, or the gate proves nothing.
  const drifted = { ...webhookBody({ kind: 'fires', siteId: 'a', rule, verdict }), surprise: 1 };
  ok('an undeclared field is rejected, so the gate has teeth',
    validate(drifted, SCHEMA).length > 0);

  const text = render({ kind: 'test', siteId: 'acct', rule: { id: 'delivery-test' }, verdict: null });
  ok('the human text says it is a test in its first line',
    /DELIVERY TEST, not an alert/.test(text.split('\n')[0]), text);
  ok('and says plainly that nothing is wrong',
    /Nothing is wrong/.test(text), text);
}

console.log('where alerts go');
{
  const site = (over = {}) => ({ site_id: 'acct', token_env: 'SEAL_TOKEN_ACCT', rules: [], ...over });

  const bare = deliveryReport({ sites: [site()] });
  ok('a site with no channel says stdout',
    bare.some((l) => l === 'acct: alerts go to stdout'), bare);
  ok('and warns that nothing will be received',
    bare.some((l) => l.startsWith('WARNING: 1 site(s) have no delivery channel')), bare);

  process.env.SEAL_TEST_SLACK = 'https://hooks.slack.com/services/T/B/x';
  const slack = deliveryReport({ sites: [site({ slack_webhook_env: 'SEAL_TEST_SLACK' })] });
  ok('a configured Slack webhook is named',
    slack.some((l) => l === 'acct: alerts go to slack'), slack);
  ok('and no warning is raised',
    !slack.some((l) => l.startsWith('WARNING')), slack);
  delete process.env.SEAL_TEST_SLACK;

  // The nasty one: it looks configured and delivers to stdout.
  const missing = deliveryReport({ sites: [site({ slack_webhook_env: 'SEAL_TEST_ABSENT' })] });
  ok('naming an unset variable is reported, not silently ignored',
    missing.some((l) => l.includes('names slack_webhook_env SEAL_TEST_ABSENT')), missing);
  ok('and it still admits the alert goes to stdout',
    missing.some((l) => l === 'acct: alerts go to stdout'), missing);

  const both = deliveryReport({ sites: [site({ webhook_url: 'https://example.com/hook' })] });
  ok('an inline webhook url counts as a channel',
    both.some((l) => l === 'acct: alerts go to webhook'), both);
}

console.log('the clock');
{
  ok('a watched hour is watched', isActive(at('2026-09-17T12:00:00Z'), silenceRule().active_hours, TZ));
  ok('04:00 local is not', !isActive(at('2026-09-17T02:00:00Z'), silenceRule().active_hours, TZ));
  ok('four watched hours are 240 minutes',
     activeMinutesBetween(at('2026-09-17T08:00:00Z'), at('2026-09-17T12:00:00Z'), silenceRule().active_hours, TZ) === 240);
  // The whole reason active_hours exists: overnight must not count. 20:00Z is
  // 22:00 in Madrid, so only the two hours to midnight are watched. (Written
  // as 22:00Z the first time, which is midnight local and therefore zero
  // watched minutes — the assertion was a guess and the code was right.)
  ok('overnight does not count',
     activeMinutesBetween(at('2026-09-16T20:00:00Z'), at('2026-09-17T02:00:00Z'), silenceRule().active_hours, TZ) === 120,
     activeMinutesBetween(at('2026-09-16T20:00:00Z'), at('2026-09-17T02:00:00Z'), silenceRule().active_hours, TZ));
  ok('and a span entirely at night is zero',
     activeMinutesBetween(at('2026-09-16T22:00:00Z'), at('2026-09-17T04:00:00Z'), silenceRule().active_hours, TZ) === 0);
}

console.log('\nsilence');
{
  const now = at('2026-09-17T14:00:00Z');                      // 16:00 local
  const fires = evaluate(silenceRule(), { dayTotal: 3, lastEventAt: '2026-09-17T09:20:00Z', entrancesToday: 800 }, now);
  ok('fires after four watched hours', fires.status === 'fires', fires);
  ok('and names when it started', fires.startedAt === '2026-09-17T09:20:00Z');
  ok('and states the elapsed time, not a clock time', /ago/.test(fires.headline), fires.headline);
  const healthy = evaluate(silenceRule(), { dayTotal: 6, lastEventAt: '2026-09-17T13:42:00Z', entrancesToday: 800 }, now);
  ok('does not fire 18 minutes in', healthy.status === 'ok', healthy);
  ok('the healthy line is one line', !healthy.headline.includes('\n'));
  // The distinction the customer has to act on.
  ok('no traffic reads differently from no conversion',
     /tracker or the site/.test(evaluate(silenceRule(), { dayTotal: 0, lastEventAt: null, searchedFrom: '2026-09-17T06:00:00Z', entrancesToday: 0 }, now).evidence.reading));
  ok('traffic that does not convert says so',
     /not converting/.test(fires.evidence.reading), fires.evidence.reading);
  // Night must never page.
  const night = evaluate(silenceRule(), { dayTotal: 0, lastEventAt: null, searchedFrom: '2026-09-17T00:00:00Z' }, at('2026-09-17T02:00:00Z'));
  ok('outside the window it does not evaluate', night.status === 'outside_hours', night);
}

console.log('\nsilence on a site that barely converts');
{
  // The real condition on sealmetricsv2 on 2026-09-17: one macro conversion in
  // thirty days, and a 24h rule that fired at nineteen hours because the
  // look-back window came from a neighbouring rule. A false positive in an
  // alerting system is the worst defect it can have, so these pin both paths.
  const tz = TZ;
  const now = at('2026-09-17T13:53:00Z');                 // 15:53 local
  const dayOpen = silenceRule({ active_hours: { from: 9, to: 23, days: ALL } });

  // (a) Today alone settles it: 6h53m of watched time, none today, window 4h.
  const settled = evaluate(dayOpen, { dayTotal: 0, lastEventAt: null,
    searchedFrom: '2026-09-17T07:00:00Z', bounded: false, entrancesToday: 400 }, now);
  ok('fires on today alone when today is long enough', settled.status === 'fires', settled);
  ok('and names today\'s open, not an invented earlier time',
     /none since 09:00/.test(settled.headline), settled.headline);
  ok('and the elapsed figure is the watched time', /6h 53m/.test(settled.headline), settled.headline);

  // (b) Today is shorter than the window, and the look-back found an event
  // inside it. This must NOT fire — the bug was that it did.
  const wide = silenceRule({ id: 'no-cta-24h', condition: { hours: 24 },
    active_hours: { from: 0, to: 24, days: ALL },
    metric: { kind: 'microconversion', type: 'cta_click' } });
  const yesterday = evaluate(wide, { dayTotal: 0, lastEventAt: '2026-09-16T18:32:49Z',
    bounded: false, entrancesToday: 400 }, now);
  ok('a 24h rule does not fire at 19 hours', yesterday.status === 'ok', yesterday);
  ok('and reports the real gap from the real last event', /19h/.test(yesterday.headline), yesterday.headline);

  // (c) The look-back found nothing either: the gap is at LEAST that long and
  // its start is unknown, so claiming one would be inventing it.
  const unknown = evaluate(wide, { dayTotal: 0, lastEventAt: null,
    searchedFrom: '2026-09-13T13:53:00Z', bounded: true, entrancesToday: 400 }, now);
  ok('an unbounded gap fires', unknown.status === 'fires', unknown);
  ok('and says "none in the time searched" rather than a start time',
     /none in the .* searched/.test(unknown.headline), unknown.headline);
  ok('and claims no start time it did not establish', unknown.startedAt === null, unknown.startedAt);
}

console.log('\ndrop and spike');
{
  const curve = Object.fromEntries(ALL.map((d) => [d, Array.from({ length: 24 }, (_, h) => h * 10)]));
  const dropRule = { id: 'atc-half', family: 'drop', metric: { kind: 'microconversion', type: 'add_to_cart' },
    condition: { ratio: 0.5 }, active_hours: { from: 0, to: 24, days: ALL }, timezone: TZ,
    expected: { basis: 'watchdog-baseline', cumulative_by_hour: curve },
    created_at: '2026-09-17', status: 'active' };
  const now = at('2026-09-17T10:00:00Z');                      // 12:00 local → expected 120
  ok('fires at 40% of normal', evaluate(dropRule, { dayToDate: 48, entrancesToday: 900 }, now).status === 'fires');
  ok('watches at 60%', evaluate(dropRule, { dayToDate: 72, entrancesToday: 900 }, now).status === 'watch');
  ok('is fine at 95%', evaluate(dropRule, { dayToDate: 114, entrancesToday: 900 }, now).status === 'ok');
  ok('reports the ratio it used', evaluate(dropRule, { dayToDate: 48 }, now).evidence.ratio === 0.4);
  // A quiet cell is not an incident.
  const early = at('2026-09-17T05:00:00Z');                    // 07:00 local → expected 70
  const quietCurve = Object.fromEntries(ALL.map((d) => [d, Array(24).fill(2)]));
  ok('too quiet to judge is not an incident',
     evaluate({ ...dropRule, expected: { cumulative_by_hour: quietCurve } }, { dayToDate: 0 }, early).status === 'too_quiet');
  ok('a missing expectation refuses rather than guesses',
     evaluate({ ...dropRule, expected: { cumulative_by_hour: {} } }, { dayToDate: 0 }, now).status === 'no_expectation');
  const spikeRule = { ...dropRule, id: 'atc-triple', family: 'spike', condition: { ratio: 3 } };
  ok('a spike fires at 3x', evaluate(spikeRule, { dayToDate: 400 }, now).status === 'fires');
}

console.log('\nthreshold');
{
  const rule = { id: 'revenue-under-2000', family: 'threshold', metric: { kind: 'revenue' },
    condition: { below: 2000 }, timezone: TZ, created_at: '2026-09-17', status: 'active' };
  const now = at('2026-09-17T20:00:00Z');
  ok('fires under the floor', evaluate(rule, { value: 1400 }, now).status === 'fires');
  ok('does not fire above it', evaluate(rule, { value: 2400 }, now).status === 'ok');
  const ceiling = { ...rule, condition: { above: 100 } };
  ok('a ceiling fires above', evaluate(ceiling, { value: 140 }, now).status === 'fires');
}

console.log('\nincidents');
{
  const s = store(null);
  const t0 = at('2026-09-17T10:00:00Z');
  ok('the first firing opens an incident', s.start('k', { at: t0.toISOString(), headline: 'x' }) !== null);
  ok('the second does not', s.start('k', { at: at('2026-09-17T10:05:00Z').toISOString(), headline: 'x' }) === null);
  ok('and it is open', s.open('k') !== null);
  ok('resolving returns it', s.resolve('k', at('2026-09-17T11:00:00Z').toISOString()) !== null);
  ok('resolving twice does not', s.resolve('k', at('2026-09-17T11:05:00Z').toISOString()) === null);
  ok('cooldown blocks an immediate reopen', s.inCooldown('k', at('2026-09-17T11:10:00Z'), 60));
  ok('and lets it reopen later', !s.inCooldown('k', at('2026-09-17T12:30:00Z'), 60));
  ok('memory mode is honest about itself', s.persistent === false);
}

console.log('\nthe message');
{
  const verdict = { status: 'fires', headline: '3 today, last one 4h 40m ago',
    startedAt: '2026-09-17T09:20:00Z',
    evidence: { reading: 'traffic is arriving and not converting', entrances_today: 800 } };
  const text = render({ rule: silenceRule(), siteId: 'demo', verdict, kind: 'fires' });
  ok('leads with a symbol', text.startsWith('🔴'), text.split('\n')[0]);
  ok('names when it began', /Started 2026-09-17T09:20/.test(text));
  ok('carries the reading', /not converting/.test(text));
  ok('points at the next step', /Seal Copilot/.test(text));
  const done = render({ rule: silenceRule(), siteId: 'demo', kind: 'resolved',
    incident: { started_at: '2026-09-17T09:20:00Z', last_seen_at: '2026-09-17T10:20:00Z' } });
  ok('a recovery is one line', done.split('\n').length === 1 && done.startsWith('🟢'), done);
  ok('and states how long it was observed broken', /after 1h 0m/.test(done), done);
  // Under a minute reads as noise, not as information.
  const quick = render({ rule: silenceRule(), siteId: 'demo', kind: 'resolved',
    incident: { started_at: '2026-09-17T09:20:00Z', last_seen_at: '2026-09-17T09:20:20Z' } });
  ok('a sub-minute incident states no duration', !/after/.test(quick), quick);
}

console.log('\nthe api client');
{
  const calls = [];
  const fake = async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.pathname.endsWith('/stats/overview')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { traffic: { entrances: 800, conversions: 3 }, conversions: { revenue: '1400.50' } } }) };
    }
    if (u.pathname.endsWith('/stats/conversions')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { data: [{ conversion_type: 'purchase', count: 3 }] } }) };
    }
    if (u.pathname.endsWith('/stats/conversions/raw')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { data: [
        { timestamp_utc: '2026-09-17T08:10:00Z' }, { timestamp_utc: '2026-09-17T09:20:00Z' }] } }) };
    }
    return { ok: false, status: 404, text: async () => 'nope' };
  };
  const api = client({ token: 't', siteId: 'demo', fetchImpl: fake });
  const ov = await api.overviewToday();
  ok('reads entrances and revenue', ov.entrances === 800 && ov.revenue === 1400.5, ov);
  ok('finds the day total by type', (await api.conversionsToday('purchase')) === 3);
  ok('takes the LATEST timestamp', (await api.lastEventAt('conversion', 'purchase', 3)) === '2026-09-17T09:20:00.000Z');
  ok('asks for the last page', calls.some((c) => /conversions\/raw/.test(c) && /page=1/.test(c)), calls);
  ok('sends the token as a header, never in the query', !calls.some((c) => /token|api_key=/i.test(c)));
  ok('no event means null', (await api.lastEventAt('conversion', 'purchase', 0)) === null);
  let threw = false;
  try { await client({ token: 't', siteId: 'demo', fetchImpl: fake }).topReferrer(); } catch { threw = true; }
  ok('a 404 throws rather than returning zero', threw);
  ok('no token is refused at construction', (() => { try { client({ siteId: 'x' }); return false; } catch { return true; } })());
}

console.log('\na full pass');
{
  // A site with one silence rule, and a purchase four hours and forty minutes ago.
  const sent = [];
  const fake = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'hooks.example') { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => 'ok' }; }
    if (u.pathname.endsWith('/stats/overview')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { traffic: { entrances: 800, conversions: 3 } } }) };
    if (u.pathname.endsWith('/stats/conversions')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { data: [{ conversion_type: 'purchase', count: 3 }] } }) };
    if (u.pathname.endsWith('/stats/conversions/raw')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { data: [{ timestamp_utc: '2026-09-17T09:20:00Z' }] } }) };
    return { ok: false, status: 500, text: async () => 'boom' };
  };
  process.env.SEAL_TOKEN_TEST = 'sm_test';
  process.env.SEAL_SLACK_TEST = 'https://hooks.example/x';
  const cfg = { sites: [{ site_id: 'demo', token_env: 'SEAL_TOKEN_TEST', slack_webhook_env: 'SEAL_SLACK_TEST', rules: [silenceRule()] }] };
  const incidents = store(null);
  const now = at('2026-09-17T14:00:00Z');
  const r1 = await pass(cfg, incidents, now, fake);
  ok('the rule fires', r1[0]?.status === 'fired', r1);
  ok('and a notification went out', sent.length === 1 && /no-conversions-4h/.test(sent[0].text), sent);
  // Immediately again: the cadence must hold it back, not re-notify.
  const r2 = await pass(cfg, incidents, at('2026-09-17T14:01:00Z'), fake);
  ok('a second pass one minute later checks nothing', r2.length === 0, r2);
  // Past the cadence, still failing: still open, no second notification.
  const r3 = await pass(cfg, incidents, at('2026-09-17T14:10:00Z'), fake);
  ok('still failing does not notify twice', sent.length === 1 && r3[0]?.status === 'still_open', { r3, sent: sent.length });
}

console.log('\nan API that refuses');
{
  const fake = async () => ({ ok: false, status: 403, text: async () => 'Access denied' });
  process.env.SEAL_TOKEN_BAD = 'sm_bad';
  const cfg = { sites: [{ site_id: 'demo', token_env: 'SEAL_TOKEN_BAD', rules: [silenceRule()] }] };
  // Its own store, so the schedule the previous block wrote cannot suppress it.
  const report = await pass(cfg, store(null), at('2026-09-17T14:00:00Z'), fake);
  ok('a refusal is reported as an error', report[0]?.status === 'error', report);
  // The one thing this must never do.
  ok('and never as silence', !report.some((r) => r.status === 'fired'), report);
}

console.log('\nthe backtest');
{
  // Two weeks of a shop that sells through the day, with one dead afternoon.
  const events = [];
  for (let d = 1; d <= 14; d++) {
    const day = `2026-09-${String(d).padStart(2, '0')}`;
    // One sale every hour from 09:00 to 22:00 local (07:00–20:00Z), except
    // on the 5th after 12:00 local.
    for (let h = 7; h <= 20; h++) {
      if (d === 5 && h > 10) continue;
      events.push(`${day}T${String(h).padStart(2, '0')}:05:00Z`);
    }
  }
  const window = { from: '2026-09-01T00:00:00Z', to: '2026-09-15T00:00:00Z' };
  const r = backtest(silenceRule(), events, window);
  ok('replays a silence rule', r.replayable && r.family === 'silence', r.replayable);
  ok('finds the one dead afternoon', r.incidents === 1, { incidents: r.incidents, first: r.first_five });
  ok('and dates it to the 5th', /2026-09-05/.test(r.first_five[0]?.local_day || ''), r.first_five[0]);
  ok('reports a rate per month', typeof r.incidents_per_month === 'number');
  // No verdict on noise: a backtest counts real incidents as well as false
  // ones, and `create-alert`'s "one false alarm a month" threshold does not
  // apply to a quantity that includes true positives. The first version of
  // this asserted 'sound' and got 'too noisy' for one genuine outage.
  ok('it reports a rate without judging it', r.verdict === undefined && typeof r.reading === 'string', r.reading);
  ok('and points at the dates', /Look at the dates/.test(r.reading), r.reading);
  ok('one day out of fourteen is not "most days"', r.share_of_days < 0.3, r.share_of_days);
  ok('counts the events it examined', r.events_examined === events.length, r.events_examined);

  // The same history with a one-hour rule is noise, and must say so.
  const noisy = backtest(silenceRule({ id: 'no-purchases-1h', condition: { hours: 1 } }), events, window);
  // Density IS assertable: a rule firing on most days describes the site, not
  // an incident.
  ok('a one-hour rule on hourly sales fires on most days',
     noisy.share_of_days >= 0.3 && /normal behaviour/.test(noisy.reading),
     { share: noisy.share_of_days, reading: noisy.reading });

  // A threshold rule, replayed per day.
  const thr = backtest({ id: 'under-10', family: 'threshold', metric: { kind: 'conversion', type: 'purchase' },
    condition: { below: 10 }, timezone: TZ, created_at: '2026-09-17', status: 'active' }, events, window);
  ok('a threshold rule is replayed per day', thr.replayable && thr.days_examined >= 14, thr.days_examined);
  ok('and the dead day is the one that fires', thr.incidents >= 1 && thr.first_five.some((i) => i.local_day === '2026-09-05'),
     thr.first_five);

  // A drop rule with no expectation cannot be replayed, and says so instead of
  // guessing one.
  const noExp = backtest({ id: 'd', family: 'drop', metric: { kind: 'microconversion', type: 'add_to_cart' },
    condition: { ratio: 0.5 }, active_hours: { from: 0, to: 24, days: ALL }, timezone: TZ,
    created_at: '2026-09-17', status: 'active' }, events, window);
  ok('a drop with no expectation refuses to replay', noExp.replayable === false, noExp);

  // Night events must not rescue a rule that only watches the day.
  const nightOnly = ['2026-09-01T01:00:00Z', '2026-09-02T01:00:00Z'];
  const allNight = backtest(silenceRule(), nightOnly, { from: '2026-09-01T00:00:00Z', to: '2026-09-03T00:00:00Z' });
  ok('sales only at night still leave the day silent', allNight.incidents >= 1, allNight);
}

console.log('\nconfig validation');
{
  const good = { sites: [{ site_id: 'demo', token_env: 'T', rules: [silenceRule()] }] };
  const env = { T: 'sm_x' };
  ok('a good config has no problems', configProblems(good, env).length === 0, configProblems(good, env));
  ok('a missing token_env is named',
     configProblems({ sites: [{ site_id: 'demo', rules: [] }] }, env).some((p) => /token_env/.test(p)));
  ok('an unset token is named',
     configProblems(good, {}).some((p) => /T is not set/.test(p)));
  ok('no sites is a problem', configProblems({ sites: [] }, env).length === 1);
  ok('a bad timezone is caught',
     configProblems({ sites: [{ site_id: 'd', token_env: 'T', rules: [silenceRule({ timezone: 'Mars/Olympus' })] }] }, env)
       .some((p) => /not an IANA timezone/.test(p)));
  ok('two rules with one id are caught',
     configProblems({ sites: [{ site_id: 'd', token_env: 'T', rules: [silenceRule(), silenceRule()] }] }, env)
       .some((p) => /share this id/.test(p)));
  ok('the rule schema is the plugin\'s', typeof ruleSchema().properties.family === 'object');
}

console.log('\nreloading the config');
{
  const dir = mkdtempSync(join(tmpdir(), 'seal-reload-'));
  const file = join(dir, 'config.json');
  const base = { sites: [{ site_id: 'demo', token_env: 'SEAL_TOKEN_RELOAD', rules: [silenceRule()] }] };
  process.env.SEAL_TOKEN_RELOAD = 'sm_x';
  const prevInline = process.env.SEAL_CONFIG;
  delete process.env.SEAL_CONFIG;
  process.env.SEAL_CONFIG_PATH = file;

  writeFileSync(file, JSON.stringify(base));
  const reload = reloader(base);
  ok('no change returns the same config', reload() === base);

  // Add a rule and bump the mtime past the cached one.
  const two = { sites: [{ ...base.sites[0], rules: [silenceRule(), silenceRule({ id: 'second' })] }] };
  writeFileSync(file, JSON.stringify(two));
  const after = reload();
  ok('a valid change is picked up', after.sites[0].rules.length === 2, after.sites[0].rules.length);

  // A broken edit must NOT stop the watch: one typo in one rule would
  // otherwise silence every rule on every site.
  writeFileSync(file, '{ not json');
  const kept = reload();
  ok('invalid JSON keeps the last good config', kept.sites[0].rules.length === 2);
  writeFileSync(file, JSON.stringify({ sites: [{ site_id: 'demo', token_env: 'SEAL_TOKEN_RELOAD', rules: [{ id: 'x', family: 'nonsense' }] }] }));
  const kept2 = reload();
  ok('an unusable rule keeps the last good config', kept2.sites[0].rules.length === 2);
  // And recovery works.
  writeFileSync(file, JSON.stringify(base));
  ok('a fixed config is adopted again', reload().sites[0].rules.length === 1);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.SEAL_CONFIG_PATH;
  if (prevInline !== undefined) process.env.SEAL_CONFIG = prevInline;
}

console.log('\nthe rules CLI');
{
  const dir = mkdtempSync(join(tmpdir(), 'seal-cli-'));
  const cfgPath = join(dir, 'config.json');
  const here = fileURLToPath(new URL('.', import.meta.url));
  const run = (args, input) => {
    try {
      return { out: execFileSync(process.execPath, [join(here, 'rules.mjs'), ...args],
        { env: { ...process.env, SEAL_CONFIG_PATH: cfgPath }, input: input ?? '', encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'] }), code: 0 };
    } catch (e) { return { out: (e.stdout || '') + (e.stderr || ''), code: e.status ?? 1 }; }
  };
  const cfg = () => JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ sites: [{ site_id: 'demo', token_env: 'T', rules: [] }] }));

  // Bootstrap, from no file at all.
  rmSync(cfgPath, { force: true });
  ok('site creates the config', run(['site', 'demo', 'T']).code === 0 && cfg().sites[0].token_env === 'T');
  ok('and sets a default interval', cfg().interval_seconds === 300);
  ok('site is idempotent', run(['site', 'demo', 'T2']).code === 0 && cfg().sites.length === 1 && cfg().sites[0].token_env === 'T2');
  // The mistake worth guarding: pasting the credential where the name goes.
  ok('a pasted token is refused', run(['site', 'demo', 'sm_live_abc']).code === 1);
  ok('and the refusal explains what to pass', /variable that holds it/.test(run(['site', 'demo', 'sm_live_abc']).out));
  run(['site', 'demo', 'T']);

  const good = silenceRule();
  ok('add puts a rule in', run(['add', 'demo'], JSON.stringify(good)).code === 0 && cfg().sites[0].rules.length === 1);
  ok('add is idempotent on the same id',
     run(['add', 'demo'], JSON.stringify(good)).code === 0 && cfg().sites[0].rules.length === 1);
  ok('a malformed rule is refused', run(['add', 'demo'], '{"id":"x","family":"nope"}').code === 1);
  ok('and the config is untouched', cfg().sites[0].rules.length === 1);
  ok('an unknown site is refused with the known ones', /Known: demo/.test(run(['add', 'nope'], JSON.stringify(good)).out));
  ok('pause flips the status', run(['pause', 'demo', good.id]).code === 0 && cfg().sites[0].rules[0].status === 'paused');
  ok('resume flips it back', run(['resume', 'demo', good.id]).code === 0 && cfg().sites[0].rules[0].status === 'active');
  ok('remove keeps the entry with a date',
     run(['remove', 'demo', good.id]).code === 0 && cfg().sites[0].rules[0].status === 'deleted' && !!cfg().sites[0].rules[0].deleted_at);
  ok('list works on an empty file', run(['list']).code === 0);

  // import: the realistic handover from a plugin-written alerts.json.
  writeFileSync(cfgPath, JSON.stringify({ sites: [{ site_id: 'demo', token_env: 'T', rules: [] }] }));
  const from = join(dir, 'alerts.json');
  writeFileSync(from, JSON.stringify({ site_id: 'demo', rules: [
    good,
    { ...silenceRule({ id: 'switched-off' }), status: 'paused' },
    // The exact bug the schema now catches: a curve under the wrong key.
    { id: 'atc-half', family: 'drop', metric: { kind: 'microconversion', type: 'add_to_cart' },
      condition: { ratio: 0.5 }, active_hours: { from: 9, to: 23, days: ALL }, timezone: TZ,
      created_at: '2026-09-17', status: 'active', expected: { cumulative: { mon: Array(24).fill(10) } } },
  ] }));
  const imported = run(['import', 'demo', from]);
  ok('import takes the active valid rule', imported.code === 0 && cfg().sites[0].rules.length === 1);
  ok('and leaves a paused rule switched off', /switched-off \(paused\)/.test(imported.out), imported.out);
  ok('and refuses a bad expectation curve, naming it',
     /atc-half — atc-half\.expected\.cumulative_by_hour is required/.test(imported.out), imported.out);
  ok('and is never silent about what it skipped', /Skipped:/.test(imported.out));
  ok('importing nothing usable fails rather than reporting success',
     run(['import', 'demo', join(dir, 'missing.json')]).code === 1);

  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${fails === 0 ? 'watcher tests passed' : fails + ' watcher test(s) FAILED'}`);
process.exit(fails ? 1 : 0);
