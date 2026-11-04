// QR Code (ISO/IEC 18004) of any text, in one segment: numeric mode for digits only, alphanumeric for the
// 45-character set, otherwise bytes of UTF-8, announced by ECI 26 when the text is not ASCII. The smallest version
// (1–40) that holds the text at error correction level M, or L when M cannot hold it; then the highest level that
// still fits that version, and the mask with the lowest penalty.

import { BLOCKS, ECC_PER_BLOCK } from "./qr-tables.mjs";
import { ReedSolomon } from "./reedsolomon.mjs";
import { Bits, Symbol, encoded, refused, utf8 } from "./symbol.mjs";

export const QR_QUIET = 4;
const MAX_VERSION = 40;
const L = 0;
const M = 1;
const Q = 2;
const H = 3;
/** The two format bits of each level: L 01, M 00, Q 11, H 10. */
const LEVEL_BITS = [0b01, 0b00, 0b11, 0b10];
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const NUMERIC = 0;
const ALPHANUMERIC = 1;
const BYTE = 2;
const INDICATORS = [0b0001, 0b0010, 0b0100];
const COUNT_BITS = [
  [10, 12, 14],
  [9, 11, 13],
  [8, 16, 16],
];

const rs = new ReedSolomon(0x11d, 0);

function countBits(mode, version) {
  return COUNT_BITS[mode][version < 10 ? 0 : version < 27 ? 1 : 2];
}

/** The one segment a text is encoded as: its mode, its bytes and whether it needs the UTF-8 ECI header. */
function segment(text) {
  let mode = BYTE;
  if (/^[0-9]*$/.test(text)) mode = NUMERIC;
  else if ([...text].every((c) => ALNUM.includes(c))) mode = ALPHANUMERIC;
  const bytes = utf8(text);
  return { mode, text, bytes, eci: mode === BYTE && bytes.length !== text.length };
}

/** The bits of the segment (ECI, mode, count, data) in `version`, without terminator or padding. */
function segmentBits(seg, version) {
  const header = (seg.eci ? 12 : 0) + 4 + countBits(seg.mode, version);
  const n = seg.text.length;
  let data;
  if (seg.mode === NUMERIC) data = Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
  else if (seg.mode === ALPHANUMERIC) data = Math.floor(n / 2) * 11 + (n % 2) * 6;
  else data = seg.bytes.length * 8;
  return header + data;
}

/** Modules of `version` available for data and error correction codewords (remainder bits included). */
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version, level) {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[level][version] * BLOCKS[level][version];
}

/** The data codewords of `version`: the segment, its terminator and padding, `capacity` bytes in all. */
function codewords(seg, version, capacity) {
  const out = new Bits();
  if (seg.eci) {
    out.append(0b0111, 4);
    out.append(26, 8);
  }
  out.append(INDICATORS[seg.mode], 4);
  out.append(seg.mode === BYTE ? seg.bytes.length : seg.text.length, countBits(seg.mode, version));
  if (seg.mode === NUMERIC) {
    for (let i = 0; i < seg.text.length; i += 3) {
      const group = seg.text.slice(i, i + 3);
      out.append(parseInt(group, 10), [0, 4, 7, 10][group.length]);
    }
  } else if (seg.mode === ALPHANUMERIC) {
    for (let i = 0; i < seg.text.length; i += 2) {
      const first = ALNUM.indexOf(seg.text[i]);
      if (i + 1 < seg.text.length) out.append(first * 45 + ALNUM.indexOf(seg.text[i + 1]), 11);
      else out.append(first, 6);
    }
  } else seg.bytes.forEach((b) => out.append(b, 8));
  const capacityBits = capacity * 8;
  out.append(0, Math.min(4, capacityBits - out.size));
  out.append(0, (8 - (out.size % 8)) % 8);
  let pad = 0xec;
  while (out.size < capacityBits) {
    out.append(pad, 8);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return out.bytes();
}

/** `data` split into the blocks of `version` at `level`, each with its error correction, and interleaved. */
function interleaved(data, version, level) {
  const blocks = BLOCKS[level][version];
  const ecc = ECC_PER_BLOCK[level][version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortData = Math.floor(raw / blocks) - ecc;
  let offset = 0;
  const dataBlocks = [];
  for (let i = 0; i < blocks; i++) {
    const length = shortData + (i < shortBlocks ? 0 : 1);
    dataBlocks.push(data.slice(offset, offset + length));
    offset += length;
  }
  const eccBlocks = dataBlocks.map((block) => rs.remainder(block, ecc));
  const out = [];
  for (let i = 0; i <= shortData; i++) for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  for (let i = 0; i < ecc; i++) for (const block of eccBlocks) out.push(block[i]);
  return out;
}

/** The eight mask conditions (ISO/IEC 18004 Table 10): a data module at (x, y) is inverted where true. */
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The module grid of one version: function patterns, the codewords, the best mask, format and version bits. */
class QrMatrix {
  constructor(version, level) {
    this.version = version;
    this.level = level;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Uint8Array(this.size));
    this.function = Array.from({ length: this.size }, () => new Uint8Array(this.size));
  }

  draw(words) {
    this.functionPatterns();
    this.placeCodewords(words);
    let best = 0;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const penalty = this.penaltyWith(mask);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = mask;
      }
    }
    this.applyMask(best);
    this.formatBits(best);
  }

  symbol() {
    const dark = new Uint8Array(this.size * this.size);
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) dark[y * this.size + x] = this.modules[y][x];
    return new Symbol(this.size, this.size, dark);
  }

  penaltyWith(mask) {
    this.applyMask(mask);
    this.formatBits(mask);
    const penalty = qrPenalty(this.modules);
    this.applyMask(mask);
    return penalty;
  }

  set(x, y, dark) {
    this.modules[y][x] = dark ? 1 : 0;
    this.function[y][x] = 1;
  }

  functionPatterns() {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    const finderLight = [2, 4];
    this.square(3, 3, 4, finderLight);
    this.square(size - 4, 3, 4, finderLight);
    this.square(3, size - 4, 4, finderLight);
    const positions = alignmentPositions(this.version, size);
    const last = positions.length - 1;
    positions.forEach((x, i) =>
      positions.forEach((y, j) => {
        const underFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
        if (!underFinder) this.square(x, y, 2, [1]);
      }),
    );
    this.formatBits(0);
    this.versionBits();
  }

  /** A square pattern centred on (cx, cy) out to `reach` rings, each ring dark unless `light` names it. */
  square(cx, cy, reach, light) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.set(x, y, !light.includes(Math.max(Math.abs(dx), Math.abs(dy))));
        }
      }
    }
  }

  /** The 15 format bits (level, mask, BCH code), twice: around the top-left finder and split between the others. */
  formatBits(mask) {
    const size = this.size;
    const data = (LEVEL_BITS[this.level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsValue = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bitsValue >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true);
  }

  /** From version 7: the 18 version bits (version, BCH code), next to the top-right and bottom-left finders. */
  versionBits() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const value = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((value >>> i) & 1) === 1;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  /** The codewords in the zigzag of two-module columns, right to left, skipping function modules. */
  placeCodewords(words) {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.function[y][x] && i < words.length * 8) {
            this.modules[y][x] = (words[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask) {
    const condition = MASKS[mask];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) if (!this.function[y][x] && condition(x, y)) this.modules[y][x] ^= 1;
    }
  }
}

/** The centre coordinates of the alignment patterns, ascending. */
function alignmentPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const out = [6];
  for (let k = count - 2; k >= 0; k--) out.push(size - 7 - k * step);
  return out;
}

/** The mask penalty of ISO/IEC 18004 §7.8.3: runs, 2×2 blocks, finder-like patterns and the dark share. */
function qrPenalty(modules) {
  const size = modules.length;
  let penalty = 0;
  const line = (dark) => {
    let p = 0;
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && dark(i) === dark(i - 1)) run++;
      else {
        if (run >= 5) p += 3 + run - 5;
        run = 1;
      }
    }
    return p;
  };
  for (let a = 0; a < size; a++) {
    penalty += line((i) => modules[a][i]);
    penalty += line((i) => modules[i][a]);
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (modules[y][x + 1] === c && modules[y + 1][x] === c && modules[y + 1][x + 1] === c) penalty += 3;
    }
  }
  const FINDER = [1, 0, 1, 1, 1, 0, 1];
  const lightBeside = (start, dark) => {
    const light = (from, to) => {
      for (let i = from; i < to; i++) if (i >= 0 && i < size && dark(i)) return false;
      return true;
    };
    return light(start - 4, start) || light(start + 7, start + 11);
  };
  for (let a = 0; a < size; a++) {
    for (let b = 0; b <= size - 7; b++) {
      let row = true;
      let column = true;
      for (let k = 0; k < 7; k++) {
        if (modules[a][b + k] !== FINDER[k]) row = false;
        if (modules[b + k][a] !== FINDER[k]) column = false;
      }
      if (row && lightBeside(b, (i) => modules[a][i])) penalty += 40;
      if (column && lightBeside(b, (i) => modules[i][a])) penalty += 40;
    }
  }
  let dark = 0;
  for (const row of modules) for (const m of row) dark += m;
  const total = size * size;
  const k = Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total) - 1;
  return penalty + k * 10;
}

/** A QR Code of `text`. */
export function qr(text) {
  const seg = segment(text);
  let version = 0;
  let level = -1;
  for (const lv of [M, L]) {
    for (let v = 1; v <= MAX_VERSION; v++) {
      if (segmentBits(seg, v) <= dataCodewords(v, lv) * 8) {
        version = v;
        level = lv;
        break;
      }
    }
    if (version) break;
  }
  if (!version) return refused("tooLong");
  let boosted = level;
  for (const lv of [L, M, Q, H]) {
    if (lv >= level && segmentBits(seg, version) <= dataCodewords(version, lv) * 8) boosted = lv;
  }
  const data = codewords(seg, version, dataCodewords(version, boosted));
  const matrix = new QrMatrix(version, boosted);
  matrix.draw(interleaved(data, version, boosted));
  return encoded(matrix.symbol());
}
