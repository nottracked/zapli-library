// PDF417 (ISO/IEC 15438) of any text. Printable ASCII, tab and line breaks use text compaction (two characters per
// codeword); anything else byte compaction of UTF-8 (six bytes per five codewords), announced by ECI 26 when the text
// is not ASCII. Error correction at the standard's recommended level for the data's size, and the column count whose
// symbol is closest to three times as wide as tall. Rows are three modules tall.

import { MODULES, pattern } from "./pdf417-patterns.mjs";
import { Symbol, encoded, refused, utf8 } from "./symbol.mjs";

/** Two light modules around the symbol, as the standard asks. */
export const PDF417_QUIET = 2;
const PAD = 900;
const LEVEL_LIMITS = [40, 160, 320, 863];
const ROW_HEIGHT = 3;
/** Start, both row indicators and stop: 17 + 17 + 17 + 18 modules besides the data columns. */
const OVERHEAD = 69;
const START = 0x1fea8;
const STOP = 0x3fa29;

// ------------------------------------------------------------------ compaction

/** The four text sub-modes and their characters, at their values. NUL in the mixed table is a placeholder. */
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
const LOWER = "abcdefghijklmnopqrstuvwxyz ";
const MIXED = "0123456789&\r\t,:#-.$/+%*=^\u0000 ";
const PUNCT = ";<>@[\\]_`~!\r\t,:\n-.$/\"|*()?{}'";
const has = (mode, char) => char !== "\u0000" && mode.includes(char);
const LATCHABLE = [UPPER, LOWER, MIXED];

function latch(from, to) {
  if (from === UPPER) return [to === LOWER ? 27 : 28];
  if (from === LOWER) return [28];
  if (from === MIXED) return [to === LOWER ? 27 : 28];
  return [29, ...(to === UPPER ? [] : latch(UPPER, to))];
}

/** Text compaction: 30 values in four sub-modes joined in pairs, shifting for one character where it can. */
function textCodewords(text) {
  const values = [];
  let mode = UPPER;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (has(mode, char)) {
      values.push(mode.indexOf(char));
      i++;
    } else if (mode === LOWER && has(UPPER, char)) {
      values.push(27, UPPER.indexOf(char));
      i++;
    } else if (mode === MIXED && has(PUNCT, char) && next !== undefined && has(PUNCT, next)) {
      values.push(25);
      mode = PUNCT;
    } else if (mode !== PUNCT && !LATCHABLE.some((m) => has(m, char))) {
      values.push(29, PUNCT.indexOf(char));
      i++;
    } else {
      const target = LATCHABLE.find((m) => has(m, char));
      values.push(...latch(mode, target));
      mode = target;
    }
  }
  if (values.length % 2 === 1) values.push(29);
  const out = [];
  for (let k = 0; k < values.length; k += 2) out.push(values[k] * 30 + values[k + 1]);
  return out;
}

/** Byte compaction: groups of six bytes as five base-900 codewords, the rest one byte per codeword. */
function byteCodewords(text) {
  const bytes = utf8(text);
  const out = [];
  if (bytes.length !== text.length) out.push(927, 26);
  out.push(bytes.length % 6 === 0 ? 924 : 901);
  const whole = Math.floor(bytes.length / 6) * 6;
  for (let start = 0; start < whole; start += 6) {
    let value = 0n;
    for (let i = start; i < start + 6; i++) value = value * 256n + BigInt(bytes[i]);
    const group = new Array(5);
    for (let j = 4; j >= 0; j--) {
      group[j] = Number(value % 900n);
      value /= 900n;
    }
    out.push(...group);
  }
  for (let i = whole; i < bytes.length; i++) out.push(bytes[i]);
  return out;
}

function dataCodewords(text) {
  return /^[\x20-\x7e\t\n\r]*$/.test(text) ? textCodewords(text) : byteCodewords(text);
}

// ------------------------------------------------------------------ error correction over GF(929)

/** The coefficients of x⁰ … x^(n−1) of ∏ (x − 3^i), i = 1 … n (the leading x^n is 1). */
function generator(n) {
  let coefficients = [1];
  let root = 1;
  for (let k = 0; k < n; k++) {
    root = (root * 3) % 929;
    const next = new Array(coefficients.length + 1).fill(0);
    for (let i = 0; i < coefficients.length; i++) {
      next[i + 1] = (next[i + 1] + coefficients[i]) % 929;
      next[i] = (next[i] + 929 - ((coefficients[i] * root) % 929)) % 929;
    }
    coefficients = next;
  }
  return coefficients.slice(0, n);
}

/** The `count` error correction codewords of `data`, highest power first. */
function correction(data, count) {
  const g = generator(count);
  const e = new Array(count).fill(0);
  for (const codeword of data) {
    const t1 = (codeword + e[count - 1]) % 929;
    for (let j = count - 1; j >= 1; j--) e[j] = (e[j - 1] + 929 - ((t1 * g[j]) % 929)) % 929;
    e[0] = (929 - ((t1 * g[0]) % 929)) % 929;
  }
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const v = e[count - 1 - i];
    out[i] = v === 0 ? 0 : 929 - v;
  }
  return out;
}

// ------------------------------------------------------------------ the symbol

/** Columns and rows that hold `total` codewords, closest to three times as wide as tall. */
function dimensions(total) {
  let best = null;
  let bestScore = Infinity;
  for (let columns = 1; columns <= 30; columns++) {
    const rows = Math.max(3, Math.ceil(total / columns));
    if (rows > 90 || columns * rows > 928) continue;
    const ratio = (columns * MODULES + OVERHEAD) / (rows * ROW_HEIGHT);
    const score = Math.abs(ratio - 3);
    if (score < bestScore) {
      bestScore = score;
      best = [columns, rows];
    }
  }
  return best;
}

/** A PDF417 symbol of `text`. */
export function pdf417(text) {
  const data = dataCodewords(text);
  const levelIndex = LEVEL_LIMITS.findIndex((limit) => data.length + 1 <= limit);
  if (levelIndex < 0) return refused("tooLong");
  const level = levelIndex + 2;
  const ecc = 2 << level;
  const dims = dimensions(data.length + 1 + ecc);
  if (!dims) return refused("tooLong");
  const [columns, rows] = dims;
  const count = columns * rows - ecc;
  const padded = new Array(count);
  for (let i = 0; i < count; i++) padded[i] = i === 0 ? count : i - 1 < data.length ? data[i - 1] : PAD;
  const words = padded.concat(correction(padded, ecc));
  const width = columns * MODULES + OVERHEAD;
  const modules = new Uint8Array(width * rows);
  for (let row = 0; row < rows; row++) {
    const cluster = row % 3;
    const base = Math.floor(row / 3) * 30;
    const rowsPart = Math.floor((rows - 1) / 3);
    const levelPart = level * 3 + ((rows - 1) % 3);
    let left;
    let right;
    if (cluster === 0) [left, right] = [base + rowsPart, base + columns - 1];
    else if (cluster === 1) [left, right] = [base + levelPart, base + rowsPart];
    else [left, right] = [base + columns - 1, base + levelPart];
    let x = row * width;
    const put = (value, length) => {
      for (let i = length - 1; i >= 0; i--) modules[x++] = Math.floor(value / 2 ** i) % 2;
    };
    put(START, MODULES);
    put(pattern(cluster, left), MODULES);
    for (let column = 0; column < columns; column++) put(pattern(cluster, words[row * columns + column]), MODULES);
    put(pattern(cluster, right), MODULES);
    put(STOP, 18);
  }
  return encoded(new Symbol(width, rows, modules, { rowHeight: ROW_HEIGHT }));
}
