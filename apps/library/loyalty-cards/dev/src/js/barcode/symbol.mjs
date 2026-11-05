// A code as a grid of modules, dark or light: `columns` × `rows`, each row `rowHeight` modules tall (3 for the rows
// of a PDF417 symbol, 1 for the square modules of QR, Data Matrix and Aztec). A linear code is one row of bars that
// is stretched to whatever height it is drawn at.

export class Symbol {
  constructor(columns, rows, dark, { rowHeight = 1, linear = false } = {}) {
    if (columns <= 0 || rows <= 0 || dark.length !== columns * rows)
      throw new Error("A symbol has columns × rows modules");
    this.columns = columns;
    this.rows = rows;
    this.dark = dark;
    this.rowHeight = rowHeight;
    this.linear = linear;
  }

  /** Whether the module in `column` (from the left) of `row` (from the top) is dark. */
  isDark(column, row) {
    return this.dark[row * this.columns + column] === 1;
  }

  /** The symbol's height in modules. */
  get height() {
    return this.rows * this.rowHeight;
  }
}

/** One row of bars and spaces from an array of 0 and 1. */
export function linear(bars) {
  return new Symbol(bars.length, 1, Uint8Array.from(bars), { linear: true });
}

/** Bars from element widths, starting with a bar: "211" is two dark modules, one light, one dark. */
export function widths(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const width = text.charCodeAt(i) - 48;
    for (let k = 0; k < width; k++) out.push(i % 2 === 0 ? 1 : 0);
  }
  return out;
}

/** Bars from a pattern of "1" (dark) and "0" (light). */
export function bits(pattern) {
  const out = new Array(pattern.length);
  for (let i = 0; i < pattern.length; i++) out[i] = pattern[i] === "1" ? 1 : 0;
  return out;
}

/** What an encoder made of a value: its symbol, or a reason the format cannot hold it. */
export const encoded = (symbol) => ({ ok: true, symbol });

/**
 * A refusal. `reason` is a short key the app turns into words (`digits`, `checkDigit`, `chars`, `tooLong`, `even`,
 * `short`, `frame`, `system`); `expected` carries the check digit the number should end in, where there is one.
 */
export const refused = (reason, extra = {}) => ({ ok: false, reason, ...extra });

/** A sequence of bits, most significant first (QR and Aztec data). */
export class Bits {
  constructor() {
    this.list = [];
  }

  get size() {
    return this.list.length;
  }

  get(index) {
    return this.list[index];
  }

  append(value, length) {
    for (let i = length - 1; i >= 0; i--) this.list.push(Math.floor(value / 2 ** i) % 2 === 1);
  }

  bytes() {
    const out = new Array(Math.floor(this.list.length / 8));
    for (let i = 0; i < out.length; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | (this.list[i * 8 + b] ? 1 : 0);
      out[i] = byte;
    }
    return out;
  }
}

/** The UTF-8 bytes of `text`. */
export function utf8(text) {
  return Array.from(new TextEncoder().encode(text));
}
