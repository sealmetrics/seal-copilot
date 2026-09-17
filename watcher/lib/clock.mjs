// Local time, and what "four hours" means when a rule only watches some of them.
//
// Every verdict here hangs on the clock. A watchdog that cannot tell the time
// and reports all-clear is worse than one that admits it, because the user
// stops checking — so this module has no fallbacks and no guesses: a bad
// timezone throws.
//
// No dependencies. `Intl.DateTimeFormat` with a `timeZone` is the only correct
// way to get a wall-clock hour in an IANA zone, and Node has carried the full
// tz database since 14.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const fmtCache = new Map();
const formatter = (tz) => {
  let f = fmtCache.get(tz);
  if (!f) {
    // Throws RangeError on an invalid zone, which is what we want: a rule with
    // a bad timezone must fail loudly at load, not evaluate in UTC in silence.
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
};

/** Wall-clock parts of `date` in `tz`. */
export function localParts(date, tz) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,          // some locales render midnight as 24
    minute: Number(parts.minute),
    weekday: parts.weekday.toLowerCase().slice(0, 3),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export const localDay = (date, tz) => localParts(date, tz).date;
export const localHour = (date, tz) => localParts(date, tz).hour;

/**
 * Is `date` inside the rule's watch window?
 *
 * `to` is exclusive and `to: 24` means midnight, so a window of 8 to 24 covers
 * 08:00 through 23:59. A window that wraps past midnight (22 to 6) is written
 * as from > to and is treated as two pieces.
 */
export function isActive(date, activeHours, tz) {
  if (!activeHours) return true;                  // threshold and spike may omit it
  const { hour, weekday } = localParts(date, tz);
  const days = activeHours.days || DAYS;
  if (!days.includes(weekday)) return false;
  const { from, to } = activeHours;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * Minutes of WATCHED time between two instants.
 *
 * This is the whole point of `active_hours`: "four hours without a sale" on a
 * shop that closes at midnight must not fire at 04:00 because four wall-clock
 * hours passed while nobody was shopping. Walking hour by hour is exact enough
 * (a rule's window is capped at a week, so 168 steps) and handles a DST shift
 * because every boundary is re-read in the zone.
 */
export function activeMinutesBetween(from, to, activeHours, tz) {
  if (to <= from) return 0;
  let minutes = 0;
  let cursor = new Date(from.getTime());
  while (cursor < to) {
    // The end of the wall-clock hour `cursor` sits in.
    const { minute } = localParts(cursor, tz);
    const stepMs = (60 - minute) * 60000;
    // Guarantee forward motion before anything else: a zero-length step would
    // spin forever. (Comparing `next` to `cursor` *after* assigning it always
    // reads equal, which silently dropped a minute per hour — 237 minutes for
    // a four-hour window.)
    const stepped = cursor.getTime() + Math.max(stepMs, 60000);
    const next = new Date(Math.min(stepped, to.getTime()));
    if (isActive(cursor, activeHours, tz)) minutes += (next - cursor) / 60000;
    cursor = next;
  }
  return Math.round(minutes);
}

/** Start of the rule's active window on the local day of `date`, as an instant. */
export function activeWindowStart(date, activeHours, tz) {
  const { year, month, day } = localParts(date, tz);
  const from = activeHours?.from ?? 0;
  // Search the hour whose local reading is `from` on this local day. Cheaper
  // than offset arithmetic and correct across DST.
  for (let h = 0; h < 36; h++) {
    const guess = new Date(Date.UTC(year, month - 1, day, h, 0, 0));
    const p = localParts(guess, tz);
    if (p.day === day && p.hour === from) return guess;
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export { DAYS };
