// Calendar dates as ISO text ("2026-11-03"), the form the store keeps. Arithmetic runs on UTC dates so time zones
// and daylight saving never shift a day.

function utc(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

/** Today in the phone's own time zone. */
export function today(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function isIsoDate(text) {
  return typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) && iso(utc(text)) === text;
}

export function addDays(date, n) {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds months and keeps the day where the month has it (31 January + 1 month → 28 or 29 February). */
export function addMonths(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

export function startOfMonth(date) {
  return date.slice(0, 8) + "01";
}

export function endOfMonth(date) {
  const [y, m] = date.split("-").map(Number);
  return date.slice(0, 8) + String(daysInMonth(y, m)).padStart(2, "0");
}

export function startOfYear(date) {
  return date.slice(0, 4) + "-01-01";
}

export function endOfYear(date) {
  return date.slice(0, 4) + "-12-31";
}

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** 0 for Monday … 6 for Sunday. */
export function weekday(date) {
  return (utc(date).getUTCDay() + 6) % 7;
}

/** The first day of the week holding the date; weekStart 0 is Monday, 6 is Sunday. */
export function startOfWeek(date, weekStart = 0) {
  return addDays(date, -((weekday(date) - weekStart + 7) % 7));
}

/** "2026-11" for a date. */
export function monthKey(date) {
  return date.slice(0, 7);
}

/** The first day of the month a key names ("2026-11" → "2026-11-01"). */
export function monthStart(key) {
  return key + "-01";
}

/** A Date at noon UTC of the day, for Intl formatting with timeZone UTC. */
export function asDate(date) {
  const d = utc(date);
  d.setUTCHours(12);
  return d;
}

const dateFormats = new Map();

/**
 * A date for people in the locale's own style. style: "day" (Mon 3 Nov), "long" (Monday 3 November 2026),
 * "short" (3 Nov), "medium" (3 Nov 2026), "month" (November 2026), "monthShort" (Nov), "weekdayShort" (Mon),
 * "numeric" (3. 11. 2026 in Slovak).
 */
export function formatDate(date, locale, style = "medium") {
  const options = {
    day: { weekday: "short", day: "numeric", month: "short" },
    long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    short: { day: "numeric", month: "short" },
    medium: { day: "numeric", month: "short", year: "numeric" },
    month: { month: "long", year: "numeric" },
    monthOnly: { month: "long" },
    monthShort: { month: "short" },
    weekdayShort: { weekday: "short" },
    numeric: { day: "numeric", month: "numeric", year: "numeric" },
  }[style];
  const key = locale + "|" + style;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    dateFormats.set(key, f);
  }
  return f.format(asDate(date));
}

/** Whether a locale's weeks start on Sunday (US-style calendars); others start on Monday. */
export function weekStartsSunday(locale) {
  return /^(en-(US|CA|PH)|ja|ko|zh-TW|pt-BR|he|ar-SA)/.test(locale);
}
