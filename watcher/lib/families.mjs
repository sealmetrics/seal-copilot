// The four rule families, as pure functions.
//
// No I/O here: the caller fetches, this decides. That split is what makes the
// verdicts testable without a server, and it is the same grammar the
// `create-alert` skill writes and `check-alerts` evaluates on request. One
// grammar, three readers.
//
// Every verdict carries the evidence the notification needs, in this order:
// the headline number, WHEN it started, and entrances in the same window. The
// last one separates the two diagnoses a customer actually has to act on:
// nothing is arriving (the tracker or the site is down) versus traffic arrives
// and does not convert (the checkout is broken).

import { activeMinutesBetween, localParts, isActive } from './clock.mjs';

const OK = 'ok', FIRES = 'fires', WATCH = 'watch', QUIET = 'too_quiet', PAUSED = 'outside_hours';

const minutesToText = (m) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};

/**
 * `silence`: no event for N watched hours.
 *
 * `lastEventAt` is null when the metric has no event at all inside the window
 * the caller looked at, and the caller says how far back that was.
 */
export function silence(rule, data, now) {
  const tz = rule.timezone;
  const needMinutes = (rule.condition.hours ?? 0) * 60;
  if (!isActive(now, rule.active_hours, tz)) {
    return { status: PAUSED, headline: 'outside watch hours' };
  }
  const since = data.lastEventAt ? new Date(data.lastEventAt) : new Date(data.searchedFrom);
  const elapsed = activeMinutesBetween(since, now, rule.active_hours, tz);
  const fires = elapsed >= needMinutes;
  // `bounded` means no event was found in the range that was actually searched,
  // so the gap is at LEAST this long and its start is unknown. Saying "since
  // 15:00" there would be asserting a time nothing established.
  const atLeast = !data.lastEventAt && data.bounded;
  return {
    status: fires ? FIRES : OK,
    headline: data.lastEventAt
      ? `${data.dayTotal} today, last one ${minutesToText(elapsed)} ago`
      : atLeast
        ? `none in the ${minutesToText(elapsed)} of watched time searched, and none before it in range`
        : `none since ${String(localParts(since, tz).hour).padStart(2, '0')}:00, ${minutesToText(elapsed)} of watched time`,
    startedAt: data.lastEventAt || (atLeast ? null : data.searchedFrom),
    evidence: {
      elapsed_watched_minutes: elapsed,
      required_minutes: needMinutes,
      day_total: data.dayTotal,
      entrances_today: data.entrancesToday ?? null,
      // The distinction the customer needs, stated rather than implied.
      reading: data.entrancesToday === 0
        ? 'no traffic either — look at the tracker or the site before the funnel'
        : 'traffic is arriving and not converting',
    },
  };
}

/** `drop`: day-to-date against what this weekday and hour normally reach. */
export function drop(rule, data, now) {
  const tz = rule.timezone;
  if (!isActive(now, rule.active_hours, tz)) return { status: PAUSED, headline: 'outside watch hours' };
  const { weekday, hour } = localParts(now, tz);
  const curve = rule.expected?.cumulative_by_hour?.[weekday];
  if (!curve) return { status: 'no_expectation', headline: `no expectation stored for ${weekday}` };
  const expected = Number(curve[hour] ?? 0);
  // Too quiet to judge is not an incident. Five is the floor the methodology
  // uses everywhere for an hour-of-week cell.
  if (expected < 5) {
    return { status: QUIET, headline: `expected only ${expected} by ${hour}:00, too quiet to call`,
             evidence: { expected, actual: data.dayToDate } };
  }
  const ratio = expected ? data.dayToDate / expected : 1;
  const fires = ratio <= rule.condition.ratio;
  return {
    status: fires ? FIRES : (ratio <= rule.condition.ratio * 1.25 ? WATCH : OK),
    headline: `${data.dayToDate} by ${hour}:00 against ${expected} normal (${Math.round(ratio * 100)}%)`,
    startedAt: data.firstShortfallAt ?? null,
    evidence: {
      actual: data.dayToDate, expected, ratio: Math.round(ratio * 1000) / 1000,
      threshold: rule.condition.ratio, basis: rule.expected.basis ?? 'unknown',
      entrances_today: data.entrancesToday ?? null,
    },
  };
}

/** `spike`: the mirror. A rise is not demand until it converts. */
export function spike(rule, data, now) {
  const tz = rule.timezone;
  const { weekday, hour } = localParts(now, tz);
  const curve = rule.expected?.cumulative_by_hour?.[weekday];
  if (!curve) return { status: 'no_expectation', headline: `no expectation stored for ${weekday}` };
  const expected = Number(curve[hour] ?? 0);
  if (expected < 5) {
    return { status: QUIET, headline: `expected only ${expected} by ${hour}:00, too quiet to call`,
             evidence: { expected, actual: data.dayToDate } };
  }
  const ratio = data.dayToDate / expected;
  const fires = ratio >= rule.condition.ratio;
  return {
    status: fires ? FIRES : (ratio >= rule.condition.ratio * 0.75 ? WATCH : OK),
    headline: `${data.dayToDate} by ${hour}:00 against ${expected} normal (${Math.round(ratio * 100)}%)`,
    evidence: {
      actual: data.dayToDate, expected, ratio: Math.round(ratio * 1000) / 1000,
      threshold: rule.condition.ratio,
      // Named, never speculated about: what the referrer did, not who it is.
      top_referrer: data.topReferrer ?? null,
      entrances_today: data.entrancesToday ?? null,
    },
  };
}

/** `threshold`: one reading against a flat number. */
export function threshold(rule, data, now) {
  const tz = rule.timezone;
  const { hour } = localParts(now, tz);
  const value = data.value;
  const { below, above } = rule.condition;
  const fires = below !== undefined ? value <= below : value >= above;
  return {
    status: fires ? FIRES : OK,
    headline: below !== undefined
      ? `${value} against a floor of ${below} by ${hour}:00`
      : `${value} against a ceiling of ${above} by ${hour}:00`,
    evidence: { value, below: below ?? null, above: above ?? null, entrances_today: data.entrancesToday ?? null },
  };
}

export const FAMILIES = { silence, drop, spike, threshold };
export const STATUS = { OK, FIRES, WATCH, QUIET, PAUSED };

/** Dispatch, with the family validated rather than assumed. */
export function evaluate(rule, data, now) {
  const f = FAMILIES[rule.family];
  if (!f) throw new Error(`rule ${rule.id}: unknown family ${JSON.stringify(rule.family)}`);
  return f(rule, data, now);
}
