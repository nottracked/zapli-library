// Money as integer cents. The store keeps amounts as decimal text with two places ("12.50") and rates with six
// ("0.920000"); the page turns them into whole numbers so sums never pick up floating-point errors.

/** Cents from decimal text or a number ("12.5" → 1250, "-3" → -300); null when there is no readable amount. */
export function toCents(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[2]);
  const fraction = (match[3] || "").padEnd(3, "0");
  // Round half away from zero on the third place.
  let cents = whole * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  if (match[1] === "-") cents = -cents;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Decimal text with two places for the store (1250 → "12.50", -5 → "-0.05"). */
export function fromCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return sign + Math.floor(abs / 100) + "." + String(abs % 100).padStart(2, "0");
}

/** A rate as millionths ("0.92" → 920000); null when it is not a positive number. */
export function toMicros(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) return null;
  const fraction = (match[2] || "").padEnd(7, "0");
  const micros = Number(match[1]) * 1e6 + Number(fraction.slice(0, 6)) + (Number(fraction[6]) >= 5 ? 1 : 0);
  return micros > 0 && Number.isSafeInteger(micros) ? micros : null;
}

/** Decimal text with six places for the store (920000 → "0.920000"). */
export function fromMicros(micros) {
  return Math.floor(micros / 1e6) + "." + String(micros % 1e6).padStart(6, "0");
}

/** Divides two whole numbers and rounds half away from zero, exactly (BigInt). */
function divRound(numerator, denominator) {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return negative ? -q : q;
}

/** cents × rate: an amount in another currency turned into the main currency (rate = main units per unit). */
export function convertCents(cents, micros) {
  return Number(divRound(BigInt(cents) * BigInt(micros), 1000000n));
}

/** cents ÷ rate: an amount in the main currency turned into the other currency. */
export function unconvertCents(cents, micros) {
  return Number(divRound(BigInt(cents) * 1000000n, BigInt(micros)));
}

/** The rate in the other direction (1 EUR = x USD from 1 USD = y EUR). */
export function invertMicros(micros) {
  return Number(divRound(1000000000000n, BigInt(micros)));
}

/** cents × part ÷ whole, rounded half away from zero (shares, averages, daily amounts). */
export function scaleCents(cents, part, whole) {
  if (!whole) return 0;
  return Number(divRound(BigInt(cents) * BigInt(part), BigInt(whole)));
}

const formatters = new Map();

function formatter(locale, currency, digits) {
  const key = locale + "|" + currency + "|" + digits;
  let f = formatters.get(key);
  if (!f) {
    const options = { style: "currency", currency, currencyDisplay: "narrowSymbol" };
    if (digits !== undefined) {
      options.minimumFractionDigits = digits;
      options.maximumFractionDigits = digits;
    }
    try {
      f = new Intl.NumberFormat(locale, options);
    } catch {
      // An unknown code or an engine without narrowSymbol: the plain number and the code.
      const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      f = { format: (n) => plain.format(n) + " " + currency };
    }
    formatters.set(key, f);
  }
  return f;
}

/**
 * An amount for people: "€1,234.50" in English, "1 234,50 €" in Slovak. `sign: "always"` writes + and −,
 * `whole: true` leaves out the cents (chart labels).
 */
export function formatMoney(cents, currency, locale, { sign = "auto", whole = false } = {}) {
  const f = formatter(locale, currency || "EUR", whole ? 0 : undefined);
  const text = f.format(Math.abs(cents) / 100);
  if (cents < 0) return "−" + text;
  if (sign === "always" && cents > 0) return "+" + text;
  return text;
}

/** A plain number with the locale's separators (rates, percentages). */
export function formatNumber(value, locale, digits = 0, maxDigits = digits) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: maxDigits }).format(
    value,
  );
}

/** The decimal mark of a locale ("," for Slovak). */
export function decimalMark(locale) {
  const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
  return part ? part.value : ".";
}

/**
 * Cents from what a person typed into a text field: "1 234,56", "1,234.56", "12,5", "€ 40". The last "." or ","
 * followed by one or two digits is the decimal mark; other separators are thousands. Null when no amount is there.
 */
export function parseTypedAmount(text) {
  if (text === null || text === undefined) return null;
  let t = String(text)
    .replace(/[\s  ]/g, "")
    .replace(/[^\d.,+-]/g, "");
  const negative = /^-/.test(t);
  t = t.replace(/[+-]/g, "");
  if (!t) return null;
  const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  let whole = t;
  let fraction = "";
  if (last >= 0 && t.length - last - 1 <= 2 && t.length - last - 1 > 0) {
    whole = t.slice(0, last);
    fraction = t.slice(last + 1);
  } else if (last === t.length - 1) {
    whole = t.slice(0, last);
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || (whole === "" && fraction === "")) return null;
  const cents = toCents((whole || "0") + "." + (fraction || "0"));
  return cents === null ? null : negative ? -cents : cents;
}

/** A rate a person typed ("0,92" or "1.0875"): millionths, or null. */
export function parseTypedRate(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).replace(/[\s ]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? toMicros(t) : null;
}

/** Currencies offered first in pickers; any three-letter code can be used. */
export const COMMON_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CZK",
  "PLN",
  "HUF",
  "RON",
  "BGN",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "UAH",
  "TRY",
  "RSD",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "CNY",
  "KRW",
  "INR",
  "SGD",
  "HKD",
  "THB",
  "AED",
  "ILS",
  "BRL",
  "MXN",
  "ZAR",
];

/** The usual currency of a region, to suggest one at the first start ("en-US" → USD); EUR otherwise. */
export function currencyOfLocale(tag) {
  const region = (String(tag || "").split(/[-_]/)[1] || "").toUpperCase();
  const map = {
    US: "USD",
    GB: "GBP",
    CH: "CHF",
    CZ: "CZK",
    PL: "PLN",
    HU: "HUF",
    RO: "RON",
    BG: "BGN",
    SE: "SEK",
    NO: "NOK",
    DK: "DKK",
    IS: "ISK",
    UA: "UAH",
    TR: "TRY",
    RS: "RSD",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    JP: "JPY",
    CN: "CNY",
    KR: "KRW",
    IN: "INR",
    SG: "SGD",
    HK: "HKD",
    TH: "THB",
    AE: "AED",
    IL: "ILS",
    BR: "BRL",
    MX: "MXN",
    ZA: "ZAR",
  };
  return map[region] || "EUR";
}
