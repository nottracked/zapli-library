// The one-row codes: the EAN/UPC family (ISO/IEC 15420), Code 128 (ISO/IEC 15417), Code 39 (ISO/IEC 16388),
// Code 93 (AIM USS Code 93), Codabar (EN 798) and ITF, Interleaved 2 of 5 (ISO/IEC 16390). Each returns
// encoded(symbol) or refused(reason).

import { bits, encoded, linear, refused, widths } from "./symbol.mjs";

// ------------------------------------------------------------------ EAN and UPC

/** Light modules beside the bars, the larger side of the standard's: 11 for EAN-13, 7 for EAN-8, 9 for UPC. */
export const EAN13_QUIET = 11;
export const EAN8_QUIET = 7;
export const UPC_QUIET = 9;

const GUARD = "101";
const MIDDLE = "01010";
const UPC_E_END = "010101";

/** Left-hand digits with odd parity. */
const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
/** Left-hand digits with even parity: the right-hand patterns reversed. */
const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
/** Right-hand digits: the odd-parity patterns inverted. */
const R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];
/** The parities of an EAN-13's left half, chosen by its first digit (which has no bars of its own). */
const EAN13_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];
/** The parities of a UPC-E's six digits in number system 0, chosen by the check digit (system 1 inverts them). */
const UPC_E_PARITY = [
  "GGGLLL",
  "GGLGLL",
  "GGLLGL",
  "GGLLLG",
  "GLGGLL",
  "GLLGGL",
  "GLLLGG",
  "GLGLGL",
  "GLGLLG",
  "GLLGLG",
];

const isDigits = (value) => /^[0-9]+$/.test(value);

/** The GS1 check digit of `body`: weights 3 and 1 alternate from the right. */
export function gs1CheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** `value` with its check digit: `length` − 1 digits get it, `length` digits must end in it. */
function withCheckDigit(value, length) {
  if (value.length < length - 1 || value.length > length || !isDigits(value)) return { reason: "digits" };
  const body = value.slice(0, length - 1);
  const check = gs1CheckDigit(body);
  if (value.length === length && value.charCodeAt(length - 1) - 48 !== check)
    return { reason: "checkDigit", expected: check };
  return { digits: body + check };
}

function ean13Bars(digits) {
  const parity = EAN13_PARITY[digits.charCodeAt(0) - 48];
  let left = "";
  for (let i = 1; i <= 6; i++) left += (parity[i - 1] === "G" ? G : L)[digits.charCodeAt(i) - 48];
  let right = "";
  for (let i = 7; i < 13; i++) right += R[digits.charCodeAt(i) - 48];
  return bits(GUARD + left + MIDDLE + right + GUARD);
}

/** EAN-13 from 12 or 13 digits. */
export function ean13(value) {
  const d = withCheckDigit(value, 13);
  return d.digits ? encoded(linear(ean13Bars(d.digits))) : refused(d.reason, { expected: d.expected });
}

/** UPC-A from 11 or 12 digits: an EAN-13 whose first digit is 0. */
export function upcA(value) {
  const d = withCheckDigit(value, 12);
  return d.digits ? encoded(linear(ean13Bars("0" + d.digits))) : refused(d.reason, { expected: d.expected });
}

/** EAN-8 from 7 or 8 digits. */
export function ean8(value) {
  const d = withCheckDigit(value, 8);
  if (!d.digits) return refused(d.reason, { expected: d.expected });
  let left = "";
  let right = "";
  for (let i = 0; i < 4; i++) left += L[d.digits.charCodeAt(i) - 48];
  for (let i = 4; i < 8; i++) right += R[d.digits.charCodeAt(i) - 48];
  return encoded(linear(bits(GUARD + left + MIDDLE + right + GUARD)));
}

/** The UPC-A digits (without check digit) a UPC-E code of `system` and `six` digits stands for. */
export function upcEExpanded(system, six) {
  const last = six[5];
  let body;
  if (last === "0" || last === "1" || last === "2") body = six.slice(0, 2) + last + "0000" + six.slice(2, 5);
  else if (last === "3") body = six.slice(0, 3) + "00000" + six.slice(3, 5);
  else if (last === "4") body = six.slice(0, 4) + "00000" + six[4];
  else body = six.slice(0, 5) + "0000" + last;
  return system + body;
}

/**
 * UPC-E from 7 or 8 digits (the number system 0 or 1, the six digits and the check digit of the UPC-A it stands
 * for), or from the six digits alone, as most codes are printed, in number system 0.
 */
export function upcE(value) {
  if (value.length < 6 || value.length > 8 || !isDigits(value)) return refused("digits");
  const code = value.length === 6 ? "0" + value : value;
  const system = code.charCodeAt(0) - 48;
  if (system > 1) return refused("system");
  const check = gs1CheckDigit(upcEExpanded(code[0], code.slice(1, 7)));
  if (code.length === 8 && code.charCodeAt(7) - 48 !== check) return refused("checkDigit", { expected: check });
  let parities = UPC_E_PARITY[check];
  if (system === 1) parities = [...parities].map((p) => (p === "G" ? "L" : "G")).join("");
  let bars = "";
  for (let i = 0; i < 6; i++) bars += (parities[i] === "G" ? G : L)[code.charCodeAt(1 + i) - 48];
  return encoded(linear(bits(GUARD + bars + UPC_E_END)));
}

// ------------------------------------------------------------------ Code 128

/** Ten light modules beside the bars, as the standards of Code 128, 39, 93, Codabar and ITF ask. */
export const INDUSTRIAL_QUIET = 10;

/** The element widths (bar, space, …) of Code 128's symbol values 0 to 106 (106 without its final bar). */
const CODE128 = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
];
/** The stop symbol, with its final bar. */
const CODE128_STOP = "2331112";
const SET_A = 0;
const SET_B = 1;
const SET_C = 2;
const UNREACHABLE = 1e9;

const isDigitCode = (code) => code >= 48 && code <= 57;

/** How many characters one symbol of `set` takes at `i`: two digits in C, one character in A or B, or 0. */
function taken128(value, i, set) {
  const code = value.charCodeAt(i);
  if (set === SET_A) return code < 96 ? 1 : 0;
  if (set === SET_B) return code >= 32 ? 1 : 0;
  return i + 1 < value.length && isDigitCode(code) && isDigitCode(value.charCodeAt(i + 1)) ? 2 : 0;
}

function symbol128(value, set, i) {
  const code = value.charCodeAt(i);
  if (set === SET_A) return code < 32 ? code + 64 : code - 32;
  if (set === SET_B) return code - 32;
  return (code - 48) * 10 + (value.charCodeAt(i + 1) - 48);
}

/**
 * The shortest symbol sequence for `value`: dynamic programming over the position and the code set in use, where
 * switching sets costs one symbol. Code set C takes runs of digits two at a time, A control characters, B the rest.
 */
function plan128(value) {
  const n = value.length;
  const cost = Array.from({ length: n + 1 }, () => [0, 0, 0]);
  const step = (i, set, next) => {
    const taken = taken128(value, i, next);
    if (!taken) return null;
    const rest = cost[i + taken][next];
    if (rest >= UNREACHABLE) return null;
    return [taken, rest + 1 + (next === set ? 0 : 1)];
  };
  for (let i = n - 1; i >= 0; i--) {
    for (let set = 0; set < 3; set++) {
      let best = UNREACHABLE;
      for (let next = 0; next < 3; next++) {
        const s = step(i, set, next);
        if (s && s[1] < best) best = s[1];
      }
      cost[i][set] = best;
    }
  }
  let set = 0;
  for (let s = 1; s < 3; s++) if ((n === 0 ? 0 : cost[0][s]) < (n === 0 ? 0 : cost[0][set])) set = s;
  const out = [103 + set];
  let i = 0;
  while (i < n) {
    let next = 0;
    let best = UNREACHABLE;
    for (let s = 0; s < 3; s++) {
      const st = step(i, set, s);
      const c = st ? st[1] : UNREACHABLE;
      if (c < best) {
        best = c;
        next = s;
      }
    }
    if (next !== set) out.push(next === SET_C ? 99 : next === SET_B ? 100 : 101);
    const [taken] = step(i, set, next);
    out.push(symbol128(value, next, i));
    i += taken;
    set = next;
  }
  return out;
}

/** Code 128 of ASCII text, in the fewest symbols. */
export function code128(value) {
  if (/[^\x00-\x7f]/.test(value)) return refused("chars");
  const symbols = plan128(value);
  let sum = 0;
  symbols.forEach((s, i) => (sum += s * Math.max(i, 1)));
  const all = [...symbols, sum % 103];
  return encoded(linear(widths(all.map((s) => CODE128[s]).join("") + CODE128_STOP)));
}

// ------------------------------------------------------------------ Code 39

/** Code 39's characters; `*` is only the start and stop character. */
const CODE39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*";
/** Which of each character's nine elements (bar, space, bar, …) are wide, most significant first. */
const CODE39 = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d,
  0x10c, 0x04c, 0x01c, 0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016, 0x181, 0x0c1, 0x1c0, 0x091,
  0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8, 0x0a2, 0x08a, 0x02a, 0x094,
];

/** Code 39 of digits, capital letters, space and `- . $ / + %`, between `*` start and stop, no check character. */
export function code39(value) {
  for (const char of value) if (char === "*" || !CODE39_CHARS.includes(char)) return refused("chars");
  const parts = [];
  for (const char of "*" + value + "*") {
    const wide = CODE39[CODE39_CHARS.indexOf(char)];
    let modules = "";
    for (let element = 0; element < 9; element++) {
      const bar = element % 2 === 0 ? "1" : "0";
      const isWide = (wide >> (8 - element)) & 1;
      modules += bar.repeat(isWide ? 3 : 1);
    }
    parts.push(modules);
  }
  return encoded(linear(bits(parts.join("0"))));
}

// ------------------------------------------------------------------ Code 93

/** The 43 characters, at their symbol values 0 to 42; the shift characters are 43 to 46, start and stop 47. */
const CODE93_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
/** The nine modules of symbol values 0 to 47, dark first. */
const CODE93 = [
  0x114, 0x148, 0x144, 0x142, 0x128, 0x124, 0x122, 0x150, 0x112, 0x10a, 0x1a8, 0x1a4, 0x1a2, 0x194, 0x192, 0x18a, 0x168,
  0x164, 0x162, 0x134, 0x11a, 0x158, 0x14c, 0x146, 0x12c, 0x116, 0x1b4, 0x1b2, 0x1ac, 0x1a6, 0x196, 0x19a, 0x16c, 0x166,
  0x136, 0x13a, 0x12e, 0x1d4, 0x1d2, 0x1ca, 0x16e, 0x176, 0x1ae, 0x126, 0x1da, 0x1d6, 0x132, 0x15e,
];
const DOLLAR = 43;
const PERCENT = 44;
const SLASH = 45;
const PLUS = 46;

/** ASCII characters that are not among the 43: the shift character and the letter that stand for each. */
function fullAscii(code) {
  const letter = (base, from) => String.fromCharCode(base + code - from);
  if (code === 0) return [PERCENT, "U"];
  if (code <= 26) return [DOLLAR, letter(65, 1)];
  if (code <= 31) return [PERCENT, letter(65, 27)];
  if (code >= 33 && code <= 44) return [SLASH, letter(65, 33)];
  if (code === 58) return [SLASH, "Z"];
  if (code >= 59 && code <= 63) return [PERCENT, letter(70, 59)];
  if (code === 64) return [PERCENT, "V"];
  if (code >= 91 && code <= 95) return [PERCENT, letter(75, 91)];
  if (code === 96) return [PERCENT, "W"];
  if (code >= 97 && code <= 122) return [PLUS, letter(65, 97)];
  return [PERCENT, letter(80, 123)];
}

/** A check character: the values weighted 1, 2, … up to `max` from the right (then 1 again), modulo 47. */
function check93(values, max) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[values.length - 1 - i] * ((i % max) + 1);
  return sum % 47;
}

/** Code 93 of ASCII text (full ASCII through the shift characters), with its check characters C and K. */
export function code93(value) {
  if (/[^\x00-\x7f]/.test(value)) return refused("chars");
  const values = [];
  for (const char of value) {
    const native = CODE93_CHARS.indexOf(char);
    if (native >= 0) values.push(native);
    else {
      const [shift, letter] = fullAscii(char.charCodeAt(0));
      values.push(shift, CODE93_CHARS.indexOf(letter));
    }
  }
  const c = check93(values, 20);
  const k = check93([...values, c], 15);
  const pattern = [47, ...values, c, k, 47].map((s) => CODE93[s].toString(2).padStart(9, "0")).join("") + "1";
  return encoded(linear(bits(pattern)));
}

// ------------------------------------------------------------------ Codabar

const CODABAR_ALPHABET = "0123456789-$:/.+ABCD";
const CODABAR_DATA = "0123456789-$:/.+";
const CODABAR_FRAME = "ABCD";
/** Which of each character's seven elements are wide, first element most significant. */
const CODABAR = [
  0x03, 0x06, 0x09, 0x60, 0x12, 0x42, 0x21, 0x24, 0x30, 0x48, 0x0c, 0x18, 0x45, 0x51, 0x54, 0x15, 0x1a, 0x29, 0x0b,
  0x0e,
];

/**
 * Codabar of digits and `- $ : / . +` between a start and a stop character A, B, C or D. Scanners return the code
 * with both, so a value has them at both ends, as scanned, or neither and gets A and A.
 */
export function codabar(value) {
  const starts = CODABAR_FRAME.includes(value[0]);
  const ends = value.length > 1 && CODABAR_FRAME.includes(value[value.length - 1]);
  if (starts !== ends) return refused("frame");
  const framed = starts ? value : "A" + value + "A";
  const body = framed.slice(1, -1);
  for (const char of body) if (!CODABAR_DATA.includes(char)) return refused("chars");
  if (body.length < 2) return refused("short");
  const parts = [];
  for (const char of framed) {
    const wide = CODABAR[CODABAR_ALPHABET.indexOf(char)];
    let modules = "";
    for (let element = 0; element < 7; element++) {
      const module = element % 2 === 0 ? "1" : "0";
      modules += module.repeat((wide >> (6 - element)) & 1 ? 3 : 1);
    }
    parts.push(modules);
  }
  return encoded(linear(bits(parts.join("0"))));
}

// ------------------------------------------------------------------ ITF

/** Which of a digit's five elements are wide, the first most significant. */
const ITF = [0b00110, 0b10001, 0b01001, 0b11000, 0b00101, 0b10100, 0b01100, 0b00011, 0b10010, 0b01010];

/** ITF of an even number of digits, at least six (shorter codes are skipped by scanners); no check digit added. */
export function itf(value) {
  if (!isDigits(value)) return refused("chars");
  if (value.length % 2 === 1) return refused("even");
  if (value.length < 6) return refused("short");
  const width = (pattern, i) => ((pattern >> (4 - i)) & 1 ? 3 : 1);
  let pairs = "";
  for (let p = 0; p < value.length; p += 2) {
    const bars = ITF[value.charCodeAt(p) - 48];
    const spaces = ITF[value.charCodeAt(p + 1) - 48];
    for (let i = 0; i < 5; i++) pairs += "1".repeat(width(bars, i)) + "0".repeat(width(spaces, i));
  }
  return encoded(linear(bits("1010" + pairs + "11101")));
}
