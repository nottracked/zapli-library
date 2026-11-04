// Aztec Code (ISO/IEC 24778) of any text, in the smallest symbol that holds it with error correction of at least a
// third of the data bits plus 11: compact with 1 to 4 layers (15×15 to 27×27 modules), else full range with 4 to 32
// layers (up to 151×151) and its reference grid. The symbol's remaining capacity is error correction too.

import { ReedSolomon } from "./reedsolomon.mjs";
import { Bits, Symbol, encoded, refused, utf8 } from "./symbol.mjs";

/** The standard needs no quiet zone; two light modules give a phone screen some slack. */
export const AZTEC_QUIET = 2;

// ------------------------------------------------------------------ the data bits (§7.3)

/** The characters of a mode from `first` on, each at the next code. */
function table(chars, first) {
  const map = new Map();
  [...chars].forEach((c, i) => map.set(c.charCodeAt(0), first + i));
  return map;
}

/** The five modes in the order a latch looks for a character's mode, with their code widths. */
const UPPER = { name: "upper", bits: 5, chars: table(" ABCDEFGHIJKLMNOPQRSTUVWXYZ", 1) };
const LOWER = { name: "lower", bits: 5, chars: table(" abcdefghijklmnopqrstuvwxyz", 1) };
const DIGIT = { name: "digit", bits: 4, chars: table(" 0123456789,.", 1) };
const MIXED = {
  name: "mixed",
  bits: 5,
  chars: table(
    " \u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\u000c\r\u001b\u001c\u001d\u001e\u001f@\\^_`|~\u007f",
    1,
  ),
};
const PUNCT = {
  name: "punct",
  bits: 5,
  chars: new Map([...table("\r", 1), ...table("!\"#$%&'()*+,-./:;<=>?[]{}", 6)]),
};
const MODES = [UPPER, LOWER, DIGIT, MIXED, PUNCT];
const has = (mode, byte) => mode.chars.has(byte);
const code = (mode, byte) => mode.chars.get(byte);

/** The direct latches (Table 4): from a mode, the code that latches to each target. */
const LATCHES = new Map([
  [
    UPPER,
    new Map([
      [LOWER, 28],
      [MIXED, 29],
      [DIGIT, 30],
    ]),
  ],
  [
    LOWER,
    new Map([
      [MIXED, 29],
      [DIGIT, 30],
    ]),
  ],
  [DIGIT, new Map([[UPPER, 14]])],
  [
    MIXED,
    new Map([
      [LOWER, 28],
      [UPPER, 29],
      [PUNCT, 30],
    ]),
  ],
  [PUNCT, new Map([[UPPER, 31]])],
]);
/** The modes each latch passes through, the fewest bits from every mode to every other. */
const ROUTES = {
  "upper>lower": [LOWER],
  "upper>digit": [DIGIT],
  "upper>mixed": [MIXED],
  "upper>punct": [MIXED, PUNCT],
  "lower>upper": [DIGIT, UPPER],
  "lower>digit": [DIGIT],
  "lower>mixed": [MIXED],
  "lower>punct": [MIXED, PUNCT],
  "digit>upper": [UPPER],
  "digit>lower": [UPPER, LOWER],
  "digit>mixed": [UPPER, MIXED],
  "digit>punct": [UPPER, MIXED, PUNCT],
  "mixed>upper": [UPPER],
  "mixed>lower": [LOWER],
  "mixed>digit": [UPPER, DIGIT],
  "mixed>punct": [PUNCT],
  "punct>upper": [UPPER],
  "punct>lower": [UPPER, LOWER],
  "punct>digit": [UPPER, DIGIT],
  "punct>mixed": [UPPER, MIXED],
};
/** The code of U/S in the modes that have one. */
const UPPER_SHIFTS = new Map([
  [LOWER, 28],
  [DIGIT, 15],
]);
const LONG_RUN = 31 + (1 << 11) - 1;

function latch(out, from, to) {
  let current = from;
  for (const step of ROUTES[from.name + ">" + to.name]) {
    out.append(LATCHES.get(current).get(step), current.bits);
    current = step;
  }
}

/** Where the run of bytes no mode has, starting at `start`, ends (at most LONG_RUN bytes later). */
function binaryEnd(bytes, start) {
  let end = start;
  while (end < bytes.length && end - start < LONG_RUN && !MODES.some((m) => has(m, bytes[end]))) end++;
  return end;
}

/** A binary shift run of the bytes no mode has; returns the mode after it. */
function binary(out, mode, bytes, start) {
  let from = mode;
  if (mode === DIGIT || mode === PUNCT) {
    latch(out, mode, UPPER);
    from = UPPER;
  }
  const length = binaryEnd(bytes, start) - start;
  out.append(31, from.bits);
  if (length <= 31) out.append(length, 5);
  else {
    out.append(0, 5);
    out.append(length - 31, 11);
  }
  for (let i = start; i < start + length; i++) out.append(bytes[i], 8);
  return from;
}

/** A latch pays when the next character is in `target` and not in the current `mode`; else a shift is shorter. */
const latchesBetter = (target, mode, next) => next !== undefined && has(target, next) && !has(mode, next);

function textBits(text) {
  const latin1 = [...text].every((c) => c.codePointAt(0) <= 0xff);
  const bytes = latin1 ? [...text].map((c) => c.codePointAt(0)) : utf8(text);
  const out = new Bits();
  if (!latin1) {
    out.append(0, 5); // P/S
    out.append(0, 5); // FLG(n)
    out.append(2, 3);
    for (const digit of "26") out.append(code(DIGIT, digit.charCodeAt(0)), 4);
  }
  let mode = UPPER;
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    const next = bytes[i + 1];
    if (has(mode, byte)) {
      out.append(code(mode, byte), mode.bits);
      i++;
    } else if (!MODES.some((m) => has(m, byte))) {
      mode = binary(out, mode, bytes, i);
      i = binaryEnd(bytes, i);
    } else if (has(PUNCT, byte) && mode !== PUNCT && !latchesBetter(PUNCT, mode, next)) {
      out.append(0, mode.bits);
      out.append(code(PUNCT, byte), PUNCT.bits);
      i++;
    } else if (has(UPPER, byte) && UPPER_SHIFTS.has(mode) && !latchesBetter(UPPER, mode, next)) {
      out.append(UPPER_SHIFTS.get(mode), mode.bits);
      out.append(code(UPPER, byte), UPPER.bits);
      i++;
    } else {
      const target = MODES.find((m) => has(m, byte));
      latch(out, mode, target);
      mode = target;
    }
  }
  return out;
}

// ------------------------------------------------------------------ the layout

/** The bits `layers` layers hold: 112 + 16 per layer around a full-range core, 88 + 16 around a compact one. */
const capacityBits = (layers, compact) => ((compact ? 88 : 112) + 16 * layers) * layers;
/** The codeword size of `layers` layers: 6 bits up to 2, 8 up to 8, 10 up to 22, then 12. */
const wordSizeOf = (layers) => (layers <= 2 ? 6 : layers <= 8 ? 8 : layers <= 22 ? 10 : 12);

/** `bits` cut into codewords of `wordSize` bits, none all zeros or all ones (bit stuffing). */
function stuffed(bits, wordSize) {
  const out = new Bits();
  const mask = (1 << wordSize) - 2;
  let i = 0;
  while (i < bits.size) {
    let word = 0;
    for (let j = 0; j < wordSize; j++) if (i + j >= bits.size || bits.get(i + j)) word |= 1 << (wordSize - 1 - j);
    if ((word & mask) === mask) {
      out.append(word & mask, wordSize);
      i += wordSize - 1;
    } else if ((word & mask) === 0) {
      out.append(word | 1, wordSize);
      i += wordSize - 1;
    } else {
      out.append(word, wordSize);
      i += wordSize;
    }
  }
  return out;
}

function layout(bits, correction) {
  let stuffedBits = null;
  let stuffedWordSize = 0;
  for (let index = 0; index <= 32; index++) {
    const compact = index < 4;
    const layers = compact ? index + 1 : index;
    const capacity = capacityBits(layers, compact);
    const wordSize = wordSizeOf(layers);
    if (bits.size + correction > capacity) continue;
    if (!stuffedBits || stuffedWordSize !== wordSize) {
      stuffedBits = stuffed(bits, wordSize);
      stuffedWordSize = wordSize;
    }
    const tooManyWords = compact && stuffedBits.size > wordSize * 64;
    if (!tooManyWords && stuffedBits.size + correction <= capacity - (capacity % wordSize)) {
      return { compact, layers, wordSize, data: stuffedBits };
    }
  }
  return null;
}

// ------------------------------------------------------------------ the matrix (§7)

const MODE_CORRECTION = new ReedSolomon(0x13, 1);
const DATA_CORRECTION = {
  6: new ReedSolomon(0x43, 1),
  8: new ReedSolomon(0x12d, 1),
  10: new ReedSolomon(0x409, 1),
  12: new ReedSolomon(0x1069, 1),
};

function matrix({ compact, layers, wordSize, data }) {
  const baseSize = (compact ? 11 : 14) + 4 * layers;
  const size = compact ? baseSize : baseSize + 1 + 2 * Math.floor((Math.floor(baseSize / 2) - 1) / 15);
  const alignment = new Int32Array(baseSize);
  if (compact) for (let i = 0; i < baseSize; i++) alignment[i] = i;
  else {
    const baseCenter = Math.floor(baseSize / 2);
    const center = Math.floor(size / 2);
    for (let i = 0; i < baseCenter; i++) {
      const offset = i + Math.floor(i / 15);
      alignment[baseCenter - i - 1] = center - offset - 1;
      alignment[baseCenter + i] = center + offset + 1;
    }
  }
  const dark = new Uint8Array(size * size);
  const set = (x, y) => (dark[y * size + x] = 1);

  // The layers' bits: zeros that do not fill a codeword, the data codewords, then check codewords.
  const capacity = capacityBits(layers, compact);
  const totalWords = Math.floor(capacity / wordSize);
  const dataWords = data.size / wordSize;
  const words = [];
  for (let w = 0; w < dataWords; w++) {
    let value = 0;
    for (let b = 0; b < wordSize; b++) value = (value << 1) | (data.get(w * wordSize + b) ? 1 : 0);
    words.push(value);
  }
  const all = words.concat(DATA_CORRECTION[wordSize].remainder(words, totalWords - words.length));
  const message = new Uint8Array(capacity);
  const start = capacity % wordSize;
  all.forEach((word, w) => {
    for (let b = 0; b < wordSize; b++) message[start + w * wordSize + b] = (word >> (wordSize - 1 - b)) & 1;
  });

  // Each layer's four sides, two modules deep, from the outermost layer in.
  let offset = 0;
  for (let i = 0; i < layers; i++) {
    const side = (layers - i) * 4 + (compact ? 9 : 12);
    const near = i * 2;
    const far = baseSize - 1 - i * 2;
    for (let j = 0; j < side; j++) {
      for (let k = 0; k < 2; k++) {
        const modules = [
          [alignment[near + k], alignment[near + j]],
          [alignment[near + j], alignment[far - k]],
          [alignment[far - k], alignment[far - j]],
          [alignment[far - j], alignment[near + k]],
        ];
        modules.forEach(([x, y], s) => {
          if (message[offset + side * 2 * s + j * 2 + k]) set(x, y);
        });
      }
    }
    offset += side * 8;
  }

  // The mode message: layers − 1 and data codewords − 1, then its check words, clockwise around the bullseye.
  const modeBits = new Bits();
  modeBits.append(layers - 1, compact ? 2 : 5);
  modeBits.append(dataWords - 1, compact ? 6 : 11);
  const nibbles = [];
  for (let n = 0; n < modeBits.size / 4; n++) {
    let value = 0;
    for (let b = 0; b < 4; b++) value = (value << 1) | (modeBits.get(n * 4 + b) ? 1 : 0);
    nibbles.push(value);
  }
  const mode = new Bits();
  nibbles.concat(MODE_CORRECTION.remainder(nibbles, compact ? 5 : 6)).forEach((n) => mode.append(n, 4));
  const center = Math.floor(size / 2);
  const length = compact ? 7 : 10;
  const ring = compact ? 5 : 7;
  for (let i = 0; i < length; i++) {
    const at = center - Math.floor(length / 2) + i + (compact ? 0 : Math.floor(i / Math.floor(length / 2)));
    if (mode.get(i)) set(at, center - ring);
    if (mode.get(length + i)) set(center + ring, at);
    if (mode.get(length * 3 - 1 - i)) set(at, center + ring);
    if (mode.get(length * 4 - 1 - i)) set(center - ring, at);
  }

  // The bullseye: dark rings at even distances from the centre, and the orientation marks.
  for (let i = 0; i < ring; i += 2) {
    for (let j = center - i; j <= center + i; j++) {
      set(j, center - i);
      set(j, center + i);
      set(center - i, j);
      set(center + i, j);
    }
  }
  set(center - ring, center - ring);
  set(center - ring + 1, center - ring);
  set(center - ring, center - ring + 1);
  set(center + ring, center - ring);
  set(center + ring, center - ring + 1);
  set(center + ring, center + ring - 1);

  // Full range: alternating modules on the lines through the centre and every 16 modules from it.
  if (!compact) {
    for (let line = 0, distance = 0; line < Math.floor(baseSize / 2) - 1; line += 15, distance += 16) {
      for (let k = center & 1; k < size; k += 2) {
        set(center - distance, k);
        set(center + distance, k);
        set(k, center - distance);
        set(k, center + distance);
      }
    }
  }
  return new Symbol(size, size, dark);
}

/** An Aztec symbol of `text`. */
export function aztec(text) {
  const bits = textBits(text);
  const correction = Math.floor((bits.size * 33) / 100) + 11;
  const chosen = layout(bits, correction);
  return chosen ? encoded(matrix(chosen)) : refused("tooLong");
}
