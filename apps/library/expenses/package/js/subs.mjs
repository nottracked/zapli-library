// The subscription finder: payments that repeat at a steady interval with the same amount, found by their payee or
// note, in entries typed by hand and in imported history alike. Pure functions: entries in, candidates out.

import { addDays, addMonths, daysBetween } from "./dates.mjs";
import { fold } from "./ledger.mjs";
import { build } from "./rrule.mjs";

/** The intervals a subscription can have, with the gaps (in days) that count as one. */
export const INTERVALS = [
  { id: "week", min: 6, max: 8, perYear: 52, unit: "week", every: 1 },
  { id: "twoWeeks", min: 13, max: 16, perYear: 26, unit: "week", every: 2 },
  { id: "month", min: 26, max: 35, perYear: 12, unit: "month", every: 1 },
  { id: "twoMonths", min: 56, max: 66, perYear: 6, unit: "month", every: 2 },
  { id: "quarter", min: 84, max: 98, perYear: 4, unit: "month", every: 3 },
  { id: "halfYear", min: 170, max: 195, perYear: 2, unit: "month", every: 6 },
  { id: "year", min: 350, max: 380, perYear: 1, unit: "year", every: 1 },
];

// Month names in English and Slovak, so "Rent October" and "Rent November" are one payee.
const MONTH_WORDS = new Set(
  (
    "january february march april may june july august september october november december " +
    "jan feb mar apr jun jul aug sep sept oct nov dec " +
    "januar februar marec april maj jun jul august september oktober november december " +
    "januara februara marca aprila maja juna jula augusta septembra oktobra novembra decembra"
  ).split(" "),
);

/** The key that groups payments: the payee or note in lower case, without accents, digits, punctuation or months. */
export function keyOf(text) {
  const words = fold(text)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !MONTH_WORDS.has(w));
  const key = words.join(" ");
  return key.length >= 3 ? key : "";
}

/** The text a payment is recognised by: its payee, else its note. */
export function labelOf(entry) {
  return (entry.payee && entry.payee.trim()) || (entry.note && entry.note.trim()) || "";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

/** The next date of an interval after a date. */
export function stepFrom(date, interval) {
  if (interval.unit === "week") return addDays(date, 7 * interval.every);
  if (interval.unit === "month") return addMonths(date, interval.every);
  return addMonths(date, 12 * interval.every);
}

/**
 * Repeating payments in the entries: {key, name, cents, currency, interval, count, first, last, next, yearly, monthly,
 * category, account, entryIds}, the most expensive per year first. A candidate needs payments of one key and currency
 * whose latest amounts agree (within 3 %), at a steady interval (two thirds of the gaps fit it), at least three of them
 * (two for intervals of a quarter or more), and a latest payment no older than one and a half intervals.
 * `skip` holds keys the user dismissed or already keeps as recurring entries.
 */
export function findSubscriptions(entries, { today, skip = new Set() } = {}) {
  const groups = new Map();
  for (const e of entries) {
    if (e.kind !== "expense" || e.recurring || !(e.cents > 0)) continue;
    const key = keyOf(labelOf(e));
    if (!key || skip.has(key)) continue;
    const group = key + "|" + (e.currency || "");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(e);
  }
  const found = [];
  for (const [group, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const latest = list[list.length - 1];
    const tolerance = Math.max(Math.round(latest.cents * 0.03), 5);
    // Payments of the latest price, one per day.
    const same = [];
    for (const e of list) {
      if (Math.abs(e.cents - latest.cents) > tolerance) continue;
      if (same.length && same[same.length - 1].date === e.date) continue;
      same.push(e);
    }
    if (same.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < same.length; i++) gaps.push(daysBetween(same[i - 1].date, same[i].date));
    const typical = median(gaps);
    const interval = INTERVALS.find((iv) => typical >= iv.min && typical <= iv.max);
    if (!interval) continue;
    const needed = interval.perYear >= 6 ? 3 : 2;
    if (same.length < needed) continue;
    const fitting = gaps.filter((g) => g >= interval.min && g <= interval.max).length;
    if (fitting * 3 < gaps.length * 2) continue;
    const last = same[same.length - 1].date;
    const maxAge = Math.round(interval.max * 1.5);
    if (today && daysBetween(last, today) > maxAge) continue;
    let next = stepFrom(last, interval);
    while (today && next < today) next = stepFrom(next, interval);
    const yearly = latest.cents * interval.perYear;
    found.push({
      key: group.split("|")[0],
      name: labelOf(latest),
      cents: latest.cents,
      currency: latest.currency || null,
      interval,
      count: same.length,
      first: same[0].date,
      last,
      next,
      yearly,
      yearlyBase: Math.round((latest.base / latest.cents) * yearly) || yearly,
      monthly: Math.round(yearly / 12),
      category: mostCommon(same.map((e) => e.category)),
      account: mostCommon(same.map((e) => e.account)),
      entryIds: same.map((e) => e.id),
    });
  }
  return found.sort((a, b) => b.yearlyBase - a.yearlyBase);
}

/** The repeat rule of a found subscription, anchored on its last payment. */
export function ruleOf(candidate) {
  return build(candidate.interval.unit, candidate.interval.every, candidate.last);
}
