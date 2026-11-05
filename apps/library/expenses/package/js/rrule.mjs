// Repeat rules of recurring entries: the RFC 5545 RRULE subset the app's store uses ("FREQ=MONTHLY;BYMONTHDAY=15",
// "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;DTSTART=20261013"). The background job that adds due entries reads the same
// text; the page uses these functions to show the next dates, the yearly cost and a sentence for each rule.

import { addDays, daysInMonth, weekday, daysBetween } from "./dates.mjs";

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** The parts of a rule, or null when the text is no rule this page can read. */
export function parse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const rule = { freq: null, interval: 1, byDay: [], byMonthDay: [], byMonth: [], start: null, until: null };
  for (const part of text.trim().toUpperCase().split(";")) {
    const [name, value] = part.split("=");
    if (!value) return null;
    if (name === "FREQ") {
      if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(value)) return null;
      rule.freq = value;
    } else if (name === "INTERVAL") {
      rule.interval = Math.max(1, Number(value) || 1);
    } else if (name === "BYDAY") {
      for (const d of value.split(",")) {
        const m = /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(d);
        if (!m) return null;
        rule.byDay.push({ n: m[1] ? Number(m[1]) : 0, day: DAYS.indexOf(m[2]) });
      }
    } else if (name === "BYMONTHDAY") {
      rule.byMonthDay = value.split(",").map(Number);
    } else if (name === "BYMONTH") {
      rule.byMonth = value.split(",").map(Number);
    } else if (name === "DTSTART" || name === "UNTIL") {
      const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
      if (!m) return null;
      rule[name === "DTSTART" ? "start" : "until"] = m[1] + "-" + m[2] + "-" + m[3];
    } else if (name === "WKST" || name === "COUNT") {
      // Accepted; the page treats COUNT as open-ended (the stored next date ends the rule when it runs out).
    } else {
      return null;
    }
  }
  return rule.freq ? rule : null;
}

function monthIndex(date) {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + m - 1;
}

/** Whether the rule falls on the date. A missing day comes from DTSTART, else from the anchor given. */
export function occursOn(rule, date, anchor) {
  const start = rule.start || anchor;
  if (rule.start && date < rule.start) return false;
  if (rule.until && date > rule.until) return false;
  const [y, m, d] = date.split("-").map(Number);
  const wd = weekday(date);
  if (rule.byMonth.length && !rule.byMonth.includes(m)) return false;
  if (rule.byMonthDay.length) {
    const last = daysInMonth(y, m);
    if (!rule.byMonthDay.some((v) => (v > 0 ? v === d : last + v + 1 === d))) return false;
  }
  if (rule.byDay.length) {
    const ok = rule.byDay.some(({ n, day }) => {
      if (day !== wd) return false;
      if (!n) return true;
      if (n > 0) return Math.ceil(d / 7) === n;
      return Math.ceil((daysInMonth(y, m) - d + 1) / 7) === -n;
    });
    if (!ok) return false;
  }
  // Days the rule does not name come from its start.
  if (start) {
    const [, sm, sd] = start.split("-").map(Number);
    if (rule.freq === "WEEKLY" && !rule.byDay.length && wd !== weekday(start)) return false;
    if ((rule.freq === "MONTHLY" || rule.freq === "YEARLY") && !rule.byDay.length && !rule.byMonthDay.length) {
      if (d !== sd) return false;
    }
    if (rule.freq === "YEARLY" && !rule.byMonth.length && m !== sm) return false;
  }
  if (rule.interval > 1 && start) {
    if (rule.freq === "DAILY" && daysBetween(start, date) % rule.interval !== 0) return false;
    if (rule.freq === "WEEKLY") {
      const weeks = Math.floor(daysBetween(addDays(start, -weekday(start)), addDays(date, -wd)) / 7);
      if (weeks % rule.interval !== 0) return false;
    }
    if (rule.freq === "MONTHLY" && (monthIndex(date) - monthIndex(start)) % rule.interval !== 0) return false;
    if (rule.freq === "YEARLY" && (y - Number(start.slice(0, 4))) % rule.interval !== 0) return false;
  }
  return true;
}

/** The first date on or after `from` the rule falls on (within about 5 years), or null. */
export function nextOn(text, from, anchor = from) {
  const rule = typeof text === "string" ? parse(text) : text;
  if (!rule) return null;
  let date = from;
  for (let i = 0; i < 1900; i++) {
    if (occursOn(rule, date, anchor)) return date;
    if (rule.until && date > rule.until) return null;
    date = addDays(date, 1);
  }
  return null;
}

/** The dates from `from` to `to` (both included) the rule falls on. */
export function datesBetween(text, from, to, anchor = from) {
  const rule = typeof text === "string" ? parse(text) : text;
  const dates = [];
  if (!rule) return dates;
  for (let date = from; date <= to && dates.length < 400; date = addDays(date, 1)) {
    if (occursOn(rule, date, anchor)) dates.push(date);
  }
  return dates;
}

/** About how many times a year the rule falls (weekly on two days → 104). */
export function timesPerYear(text) {
  const rule = parse(text);
  if (!rule) return 0;
  const days = Math.max(1, rule.byDay.length);
  const per = { DAILY: 365, WEEKLY: 52 * days, MONTHLY: 12 * Math.max(1, rule.byMonthDay.length), YEARLY: 1 };
  const months = rule.freq === "YEARLY" ? Math.max(1, rule.byMonth.length) * Math.max(1, rule.byMonthDay.length) : 1;
  return (per[rule.freq] * months) / rule.interval;
}

/**
 * A rule from the repeat picker: every `interval` days, weeks, months or years, on the weekday or day of `date`.
 * Days 29 to 31 repeat on the last day of the month, so short months are never skipped.
 */
export function build(unit, interval, date) {
  const n = Math.max(1, Math.min(99, Math.round(interval) || 1));
  const [, m, d] = date.split("-").map(Number);
  const day = d >= 29 ? -1 : d;
  let rule;
  if (unit === "day") rule = "FREQ=DAILY";
  else if (unit === "week") rule = "FREQ=WEEKLY;BYDAY=" + DAYS[weekday(date)];
  else if (unit === "month") rule = "FREQ=MONTHLY;BYMONTHDAY=" + day;
  else rule = "FREQ=YEARLY;BYMONTH=" + m + ";BYMONTHDAY=" + (m === 2 && d === 29 ? -1 : d);
  if (n > 1) rule += ";INTERVAL=" + n + ";DTSTART=" + date.replace(/-/g, "");
  return rule;
}

/** The picker's unit and interval for a rule (null for a rule the picker cannot show). */
export function pickerOf(text) {
  const rule = parse(text);
  if (!rule) return null;
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[rule.freq];
  const simple = rule.byDay.length <= 1 && rule.byMonthDay.length <= 1 && rule.byDay.every((b) => !b.n);
  return simple ? { unit, interval: rule.interval } : null;
}

/**
 * A sentence for the rule, through the page's translations: "Every month on day 15", "Every 2 weeks on Tuesday",
 * "Every year on 3 March", "Every month on the last day".
 */
export function describe(text, t, locale) {
  const rule = parse(text);
  if (!rule) return t("ruleUnreadable");
  // Weekday names come from the translations, in the form a sentence needs ("v stredu" in Slovak).
  const weekdayName = (i) => t("dayName_" + i);
  const n = rule.interval;
  if (rule.freq === "DAILY") return t("ruleDaily", { n });
  if (rule.freq === "WEEKLY") {
    const days = rule.byDay.length
      ? rule.byDay.map((b) => weekdayName(b.day)).join(", ")
      : rule.start
        ? weekdayName(weekday(rule.start))
        : "";
    return t("ruleWeekly", { n, days });
  }
  if (rule.freq === "MONTHLY") {
    if (rule.byMonthDay.length === 1 && rule.byMonthDay[0] === -1) return t("ruleMonthlyLast", { n });
    if (rule.byMonthDay.length) return t("ruleMonthly", { n, day: rule.byMonthDay.join(", ") });
    if (rule.byDay.length)
      return t("ruleMonthlyWeekday", { n, days: rule.byDay.map((b) => weekdayName(b.day)).join(", ") });
    return rule.start ? t("ruleMonthly", { n, day: Number(rule.start.slice(8)) }) : t("ruleMonthlyPlain", { n });
  }
  const month = rule.byMonth[0] || (rule.start ? Number(rule.start.slice(5, 7)) : 1);
  const day = rule.byMonthDay[0] || (rule.start ? Number(rule.start.slice(8)) : 1);
  const realDay = day === -1 ? daysInMonth(2025, month) : day;
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2025, month - 1, realDay)),
  );
  return t("ruleYearly", { n, date: when });
}
