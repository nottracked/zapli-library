// Barcode types: which one a typed number is drawn in, what each one may hold, and the cleaning of a typed number.
// The same rules as the card's checks in the manifest, so a number the page accepts is one the store accepts.

import { encode } from "./barcode/index.mjs";
import { gs1CheckDigit } from "./barcode/linear.mjs";

/** The types a card can have, in the order the type picker lists them; "auto" works the type out from the number. */
export const FORMAT_IDS = [
  "auto",
  "ean13",
  "code128",
  "qr",
  "ean8",
  "upcA",
  "upcE",
  "code39",
  "code93",
  "codabar",
  "itf",
  "dataMatrix",
  "pdf417",
  "aztec",
];

/** The names of the types, the same in every language except the QR code's (see i18n). */
export const FORMAT_NAMES = {
  ean13: "EAN-13",
  ean8: "EAN-8",
  upcA: "UPC-A",
  upcE: "UPC-E",
  code128: "Code 128",
  code39: "Code 39",
  code93: "Code 93",
  codabar: "Codabar",
  itf: "ITF",
  qr: "QR",
  dataMatrix: "Data Matrix",
  pdf417: "PDF417",
  aztec: "Aztec",
};

const MAX_LENGTH = 300;

/**
 * A typed number as the card keeps it: spaces at the ends dropped, and the spaces inside a number of digits only
 * (people copy "4006 3813 3393 1" as it is printed), since they are no part of the code.
 */
export function cleanNumber(text) {
  const trimmed = String(text || "").trim();
  const flat = trimmed.replace(/[\s ]+/g, "");
  return /^[0-9]+$/.test(flat) ? flat : trimmed;
}

const checks = (n, kind) =>
  n.length === { ean13: 13, ean8: 8, upcA: 12 }[kind] &&
  /^[0-9]+$/.test(n) &&
  gs1CheckDigit(n.slice(0, -1)) === Number(n[n.length - 1]);

/**
 * The type a number is drawn in when the card's type is "auto": EAN-13, EAN-8 or UPC-A when the number is one with
 * a matching last digit, Code 128 for other plain text, and a QR code for text Code 128 cannot hold.
 */
export function detectFormat(number) {
  const n = String(number || "");
  if (checks(n, "ean13")) return "ean13";
  if (checks(n, "ean8")) return "ean8";
  if (checks(n, "upcA")) return "upcA";
  if (/^[\x20-\x7e]+$/.test(n)) return "code128";
  return "qr";
}

/** The type a card is drawn in: its own, or the one worked out from its number. */
export function drawnFormat(card) {
  const f = card && card.format;
  return f && f !== "auto" ? f : detectFormat(card ? card.number : "");
}

/**
 * Why `number` cannot be saved as `format`, as the key of a message (see i18n), or null when it can. The rules are
 * the manifest's checks on the card's number.
 */
export function numberProblem(number, format) {
  const n = String(number || "");
  if (!n) return "numberMissing";
  if (n.length > MAX_LENGTH) return "thatIsTooLong";
  switch (format) {
    case "ean13":
      if (!/^[0-9]{12,13}$/.test(n)) return "ean13Needs12";
      if (n.length === 13 && !checks(n, "ean13")) return "lastDigitThisEan";
      return null;
    case "ean8":
      if (!/^[0-9]{7,8}$/.test(n)) return "ean8Needs7";
      if (n.length === 8 && !checks(n, "ean8")) return "lastDigitThisEan2";
      return null;
    case "upcA":
      if (!/^[0-9]{11,12}$/.test(n)) return "upcNeeds1112";
      if (n.length === 12 && !checks(n, "upcA")) return "lastDigitThisUpc";
      return null;
    case "upcE": {
      if (!/^([0-9]{6}|[01][0-9]{6,7})$/.test(n)) return "upcENeeds6";
      if (n.length === 8 && !encode(n, "upcE").ok) return "lastDigitThisUpc2";
      return null;
    }
    case "code39":
      return /^[0-9A-Z .$/+%-]+$/.test(n) ? null : "code39TakesCapital";
    case "code128":
      return /^[ -~]+$/.test(n) ? null : "code128TakesPlain";
    case "code93":
      return /^[ -~]+$/.test(n) ? null : "code93TakesPlain";
    case "codabar":
      return /^([A-D][0-9$:/.+-]{2,}[A-D]|[0-9$:/.+-]{2,})$/.test(n) ? null : "codabarTakesDigitsWith";
    case "itf":
      return /^([0-9][0-9]){3,}$/.test(n) ? null : "itfNeedsEvenNumber";
    default:
      return null;
  }
}

/** The number in groups for reading aloud to a cashier: 2900 1234 5678 5. Text that is not digits stays as it is. */
export function groupedNumber(number) {
  const n = String(number || "");
  if (!/^[0-9]{8,}$/.test(n)) return n;
  return n.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** The last four characters, for "•••• 6785" on a card's face. */
export function lastDigits(number) {
  const n = String(number || "");
  return n.slice(Math.max(0, n.length - 4));
}
