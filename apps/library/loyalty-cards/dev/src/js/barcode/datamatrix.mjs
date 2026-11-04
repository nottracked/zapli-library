// Data Matrix ECC 200 (ISO/IEC 16022) of any text, in the smallest square symbol (10×10 to 144×144) that holds it.
// ASCII encodation: two digits per codeword, Latin-1 characters above 127 behind an upper shift; text beyond Latin-1
// is encoded as UTF-8 bytes announced by ECI 26.

import { ReedSolomon } from "./reedsolomon.mjs";
import { Symbol, encoded, refused, utf8 } from "./symbol.mjs";

/** The standard asks for one light module; two give a phone screen some slack. */
export const DATAMATRIX_QUIET = 2;

const rs = new ReedSolomon(0x12d, 1);

/** Square sizes: side, data codewords, error codewords, interleaved blocks, data regions a side. */
const SIZES = [
  [10, 3, 5, 1, 1],
  [12, 5, 7, 1, 1],
  [14, 8, 10, 1, 1],
  [16, 12, 12, 1, 1],
  [18, 18, 14, 1, 1],
  [20, 22, 18, 1, 1],
  [22, 30, 20, 1, 1],
  [24, 36, 24, 1, 1],
  [26, 44, 28, 1, 1],
  [32, 62, 36, 1, 2],
  [36, 86, 42, 1, 2],
  [40, 114, 48, 1, 2],
  [44, 144, 56, 1, 2],
  [48, 174, 68, 1, 2],
  [52, 204, 84, 2, 2],
  [64, 280, 112, 2, 4],
  [72, 368, 144, 4, 4],
  [80, 456, 192, 4, 4],
  [88, 576, 224, 4, 4],
  [96, 696, 272, 4, 4],
  [104, 816, 336, 6, 4],
  [120, 1050, 408, 6, 6],
  [132, 1304, 496, 8, 6],
  [144, 1558, 620, 10, 6],
].map(([modules, data, ecc, blocks, regions]) => ({ modules, data, ecc, blocks, regions }));

const isDigit = (b) => b >= 48 && b <= 57;

/** ASCII encodation of `text`: Latin-1 as it is, anything else as UTF-8 after ECI 26. */
function codewords(text) {
  const latin1 = [...text].every((c) => c.codePointAt(0) <= 0xff);
  const bytes = latin1 ? [...text].map((c) => c.codePointAt(0)) : utf8(text);
  const out = [];
  if (!latin1) out.push(241, 27);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    const next = bytes[i + 1];
    if (isDigit(byte) && next !== undefined && isDigit(next)) {
      out.push(130 + (byte - 48) * 10 + (next - 48));
      i++;
    } else if (byte > 127) out.push(235, byte - 127);
    else out.push(byte + 1);
  }
  return out;
}

/** `data` filled to `capacity`: the pad codeword, then pads scrambled by position (the 253-state algorithm). */
function padded(data, capacity) {
  const out = new Array(capacity);
  for (let i = 0; i < capacity; i++) {
    if (i < data.length) out[i] = data[i];
    else if (i === data.length) out[i] = 129;
    else {
      const pad = 129 + ((149 * (i + 1)) % 253) + 1;
      out[i] = pad <= 254 ? pad : pad - 254;
    }
  }
  return out;
}

/** The data followed by the error correction of its interleaved blocks. */
function withErrorCorrection(data, size) {
  const blocks = size.blocks;
  const per = size.ecc / blocks;
  const out = data.concat(new Array(size.ecc).fill(0));
  for (let block = 0; block < blocks; block++) {
    const blockData = data.filter((_, i) => i % blocks === block);
    rs.remainder(blockData, per).forEach((word, j) => (out[data.length + block + j * blocks] = word));
  }
  return out;
}

/** The modules of a codeword's bits 1 to 8, relative to its lower right module. */
const UTAH = [
  [-2, -2],
  [-2, -1],
  [-1, -2],
  [-1, -1],
  [-1, 0],
  [0, -2],
  [0, -1],
  [0, 0],
];
/** The four corner shapes: (row, column) of bits 1 to 8, a negative value counting back from the far edge. */
const CORNERS = [
  [
    [-1, 0],
    [-1, 1],
    [-1, 2],
    [0, -2],
    [0, -1],
    [1, -1],
    [2, -1],
    [3, -1],
  ],
  [
    [-3, 0],
    [-2, 0],
    [-1, 0],
    [0, -4],
    [0, -3],
    [0, -2],
    [0, -1],
    [1, -1],
  ],
  [
    [-3, 0],
    [-2, 0],
    [-1, 0],
    [0, -2],
    [0, -1],
    [1, -1],
    [2, -1],
    [3, -1],
  ],
  [
    [-1, 0],
    [-1, -1],
    [0, -3],
    [0, -2],
    [0, -1],
    [1, -3],
    [1, -2],
    [1, -1],
  ],
];

/**
 * The module placement of ECC 200 (ISO/IEC 16022 Annex F): each codeword's eight bits fill an L-shaped "utah" along
 * diagonal sweeps of the data area, with a corner shape where a sweep starts at the edge, and a fixed pattern in a
 * corner left free. Returns the dark modules of the `columns` × `rows` data area.
 */
function placement(words, columns, rows) {
  const placed = new Uint8Array(columns * rows);
  const dark = new Uint8Array(columns * rows);
  const set = (col, row, value) => {
    placed[row * columns + col] = 1;
    dark[row * columns + col] = value ? 1 : 0;
  };
  const isPlaced = (col, row) => placed[row * columns + col] === 1;
  const module = (row, col, pos, bit) => {
    let r = row;
    let c = col;
    if (r < 0) {
      r += rows;
      c += 4 - ((rows + 4) % 8);
    }
    if (c < 0) {
      c += columns;
      r += 4 - ((columns + 4) % 8);
    }
    set(c, r, (words[pos] >> (8 - bit)) & 1);
  };
  const utah = (row, col, pos) => UTAH.forEach(([dr, dc], i) => module(row + dr, col + dc, pos, i + 1));
  const corner = (shape, pos) =>
    shape.forEach(([r, c], i) => module(r < 0 ? rows + r : r, c < 0 ? columns + c : c, pos, i + 1));
  const cornerAt = (row, col) => {
    if (row === rows && col === 0) return CORNERS[0];
    if (row === rows - 2 && col === 0 && columns % 4 !== 0) return CORNERS[1];
    if (row === rows - 2 && col === 0 && columns % 8 === 4) return CORNERS[2];
    if (row === rows + 4 && col === 2 && columns % 8 === 0) return CORNERS[3];
    return null;
  };
  let pos = 0;
  let row = 4;
  let col = 0;
  do {
    const shape = cornerAt(row, col);
    if (shape) corner(shape, pos++);
    do {
      if (row < rows && col >= 0 && !isPlaced(col, row)) utah(row, col, pos++);
      row -= 2;
      col += 2;
    } while (row >= 0 && col < columns);
    row += 1;
    col += 3;
    do {
      if (row >= 0 && col < columns && !isPlaced(col, row)) utah(row, col, pos++);
      row += 2;
      col -= 2;
    } while (row < rows && col >= 0);
    row += 3;
    col += 1;
  } while (row < rows || col < columns);
  if (!isPlaced(columns - 1, rows - 1)) {
    set(columns - 1, rows - 1, true);
    set(columns - 2, rows - 2, true);
    set(columns - 1, rows - 2, false);
    set(columns - 2, rows - 1, false);
  }
  return (c, r) => dark[r * columns + c] === 1;
}

/** A Data Matrix symbol of `text`. */
export function dataMatrix(text) {
  const data = codewords(text);
  const size = SIZES.find((s) => s.data >= data.length);
  if (!size) return refused("tooLong");
  const words = withErrorCorrection(padded(data, size.data), size);
  const regions = size.regions;
  const region = (size.modules - 2 * regions) / regions;
  const isDarkData = placement(words, region * regions, region * regions);
  const n = size.modules;
  const modules = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const rx = x % (region + 2);
      const ry = y % (region + 2);
      let dark;
      if (ry === region + 1) dark = true;
      else if (rx === 0) dark = true;
      else if (ry === 0) dark = rx % 2 === 0;
      else if (rx === region + 1) dark = ry % 2 === 1;
      else
        dark = isDarkData(
          Math.floor(x / (region + 2)) * region + rx - 1,
          Math.floor(y / (region + 2)) * region + ry - 1,
        );
      modules[y * n + x] = dark ? 1 : 0;
    }
  }
  return encoded(new Symbol(n, n, modules));
}
