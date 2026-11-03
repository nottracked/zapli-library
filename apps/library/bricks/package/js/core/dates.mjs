// Calendar days as the daily level counts them: "2026-11-03" in the phone's own time zone, and whole days between two
// such dates (counted in UTC, so a change to or from summer time never makes a day of 23 or 25 hours).

const pad = (n) => String(n).padStart(2, "0");

/** The local date of a moment as "YYYY-MM-DD". */
export function isoDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whether a text is a real calendar date "YYYY-MM-DD". */
export function isDay(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function utc(day) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from one date to another (negative when `to` comes first). */
export function daysBetween(from, to) {
  return Math.round((utc(to) - utc(from)) / 86400000);
}

/** The date `n` days after `day` (before it for a negative `n`). */
export function addDays(day, n) {
  const t = new Date(utc(day) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The weekday of a date, 0 for Monday to 6 for Sunday. */
export function weekday(day) {
  return (new Date(utc(day)).getUTCDay() + 6) % 7;
}

/**
 * The run of cleared days that reaches `today` or yesterday (a streak stays alive until a whole day is missed), and
 * the longest run ever. `cleared` is a set of dates.
 */
export function streaks(cleared, today) {
  const days = Array.from(cleared).filter(isDay).sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const day of days) {
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  let current = 0;
  let cursor = cleared.has(today) ? today : addDays(today, -1);
  while (cleared.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}
