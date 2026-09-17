// How often would this rule have fired, on this site's own history?
//
// `create-alert` answers a version of this before saving, with a Poisson
// estimate: given the event's rate, how likely is a quiet window. That is a
// model of the site. This is the site itself — replay the rule over real events
// and count the incidents it would have opened.
//
// It is the difference between "about three false alarms a month" and "it fired
// on the 4th, the 9th and the 11th, for 4h 20m, 5h and 4h 05m". The second is
// what makes a customer trust the rule, or change it.
//
// Pure: the caller fetches the events, this replays them.

import { activeMinutesBetween, isActive, localParts, activeWindowStart } from './clock.mjs';

/**
 * @param rule    the rule to replay
 * @param events  ascending instants (ISO strings) of the watched event
 * @param window  { from, to } instants bounding the history fetched
 */
export function backtest(rule, events, window) {
  const tz = rule.timezone;
  const times = events.map((e) => new Date(e)).filter((d) => !Number.isNaN(+d)).sort((a, b) => a - b);

  if (rule.family === 'silence') return silence(rule, times, window, tz);
  if (rule.family === 'threshold') return threshold(rule, times, window, tz);
  if (rule.family === 'drop' || rule.family === 'spike') return curve(rule, times, window, tz);
  throw new Error(`cannot replay family ${JSON.stringify(rule.family)}`);
}

function silence(rule, times, window, tz) {
  const need = (rule.condition.hours ?? 0) * 60;
  const incidents = [];
  // Walk the gaps between consecutive events, plus the gap from the window's
  // start to the first event and from the last event to the window's end.
  const points = [new Date(window.from), ...times, new Date(window.to)];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const watched = activeMinutesBetween(a, b, rule.active_hours, tz);
    if (watched < need) continue;
    // The incident opens `need` watched minutes after `a`, not at `b`: that is
    // when a live watcher would have noticed.
    const openedAt = advanceWatched(a, need, rule.active_hours, tz);
    incidents.push({
      started_at: a.toISOString(),
      would_have_fired_at: openedAt.toISOString(),
      watched_minutes: watched,
      local_day: localParts(openedAt, tz).date,
    });
  }
  return summarise(rule, incidents, window, times.length, { threshold_minutes: need });
}

function threshold(rule, times, window, tz) {
  // Bucket by local day, then compare each complete day against the number.
  const perDay = new Map();
  for (const t of times) {
    if (!isActive(t, rule.active_hours, tz)) continue;
    const d = localParts(t, tz).date;
    perDay.set(d, (perDay.get(d) || 0) + 1);
  }
  const days = localDaysBetween(window.from, window.to, tz);
  const incidents = [];
  for (const day of days) {
    const value = perDay.get(day) || 0;
    const { below, above } = rule.condition;
    const fires = below !== undefined ? value <= below : value >= above;
    if (fires) incidents.push({ local_day: day, value, would_have_fired_at: `${day} end of day` });
  }
  return summarise(rule, incidents, window, times.length, { days_examined: days.length });
}

function curve(rule, times, window, tz) {
  const expected = rule.expected?.cumulative_by_hour;
  if (!expected) {
    return { replayable: false, reason: 'the rule carries no expectation, so there is nothing to compare against' };
  }
  const isSpike = rule.family === 'spike';
  // Cumulative count per local day and hour.
  const perDayHour = new Map();
  for (const t of times) {
    const { date, hour } = localParts(t, tz);
    const key = `${date}|${hour}`;
    perDayHour.set(key, (perDayHour.get(key) || 0) + 1);
  }
  const incidents = [];
  for (const day of localDaysBetween(window.from, window.to, tz)) {
    const weekday = weekdayOf(day, tz);
    const line = expected[weekday];
    if (!line) continue;
    let running = 0, openHour = null;
    for (let h = 0; h < 24; h++) {
      running += perDayHour.get(`${day}|${h}`) || 0;
      const exp = Number(line[h] ?? 0);
      if (exp < 5) continue;                       // too quiet to judge, as live
      const ratio = running / exp;
      const fires = isSpike ? ratio >= rule.condition.ratio : ratio <= rule.condition.ratio;
      if (fires && openHour === null) {
        openHour = h;
        incidents.push({ local_day: day, would_have_fired_at: `${day} ${String(h).padStart(2, '0')}:00`,
                         actual: running, expected: exp, ratio: Math.round(ratio * 100) / 100 });
      }
      if (!fires) openHour = null;                 // recovered; a later break is a new incident
    }
  }
  return summarise(rule, incidents, window, times.length, { basis: rule.expected.basis ?? 'unknown' });
}

/** Move forward by `minutes` of WATCHED time, hour by hour. */
function advanceWatched(from, minutes, activeHours, tz) {
  let cursor = new Date(from.getTime());
  let left = minutes;
  for (let guard = 0; guard < 24 * 60 && left > 0; guard++) {
    const step = new Date(cursor.getTime() + 60000);
    if (isActive(cursor, activeHours, tz)) left -= 1;
    cursor = step;
  }
  return cursor;
}

function localDaysBetween(from, to, tz) {
  const days = [];
  let cursor = new Date(from);
  const end = new Date(to);
  let last = null;
  while (cursor <= end) {
    const d = localParts(cursor, tz).date;
    if (d !== last) { days.push(d); last = d; }
    cursor = new Date(cursor.getTime() + 3600000);
  }
  return days;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekdayOf = (localDay, tz) => {
  const [y, m, d] = localDay.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
};

function summarise(rule, incidents, window, eventCount, extra) {
  const days = Math.max(1, (new Date(window.to) - new Date(window.from)) / 86400000);
  const perMonth = (incidents.length / days) * 30;
  const daysWith = new Set(incidents.map((i) => i.local_day)).size;
  const share = daysWith / days;

  /*
   * No "too noisy" verdict here, and that is deliberate.
   *
   * `create-alert` refuses a rule above one FALSE alarm a month, estimated from
   * the event's rate on a healthy site. A backtest counts every incident the
   * rule would have opened, and some of those are real problems. Calling a rule
   * noisy because it caught a genuine outage would be applying a measure of
   * false alarms to a quantity that includes true ones.
   *
   * So this reports what it saw and hands the judgement to whoever knows
   * whether the 5th was a real outage. The one thing it will assert is density:
   * a rule that fires on most days is not describing incidents, it is
   * describing the site's normal behaviour.
   */
  const reading = share >= 0.3
    ? `fired on ${daysWith} of ${Math.round(days)} days: at that density it is describing normal ` +
      'behaviour rather than an incident. Widen the window.'
    : incidents.length === 0
      ? 'never fired over this history. Either the rule is safe, or the window is so wide it would miss a real problem.'
      : `fired ${incidents.length} time(s). Look at the dates: if those were real problems the rule is working, ` +
        'and if they were quiet afternoons it needs a longer window.';

  return {
    replayable: true,
    rule_id: rule.id,
    family: rule.family,
    window: { from: window.from, to: window.to, days: Math.round(days * 10) / 10 },
    events_examined: eventCount,
    incidents: incidents.length,
    incidents_per_month: Math.round(perMonth * 10) / 10,
    days_with_incidents: daysWith,
    share_of_days: Math.round(share * 100) / 100,
    reading,
    first_five: incidents.slice(0, 5),
    ...extra,
  };
}
