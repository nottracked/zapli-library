// Every barcode format a card can carry, by the ids the scanner and the stored cards use, and the drawing of a code
// as an SVG picture: whole modules on a white ground with the format's quiet zone, so a till's scanner reads it.

import { AZTEC_QUIET, aztec } from "./aztec.mjs";
import { DATAMATRIX_QUIET, dataMatrix } from "./datamatrix.mjs";
import {
  EAN13_QUIET,
  EAN8_QUIET,
  INDUSTRIAL_QUIET,
  UPC_QUIET,
  codabar,
  code128,
  code39,
  code93,
  ean13,
  ean8,
  itf,
  upcA,
  upcE,
} from "./linear.mjs";
import { PDF417_QUIET, pdf417 } from "./pdf417.mjs";
import { QR_QUIET, qr } from "./qr.mjs";

/** The formats: their encoder, their quiet zone in modules, and whether they are square (2D) codes. */
export const FORMATS = {
  ean13: { encode: ean13, quiet: EAN13_QUIET, square: false },
  ean8: { encode: ean8, quiet: EAN8_QUIET, square: false },
  upcA: { encode: upcA, quiet: UPC_QUIET, square: false },
  upcE: { encode: upcE, quiet: UPC_QUIET, square: false },
  code128: { encode: code128, quiet: INDUSTRIAL_QUIET, square: false },
  code39: { encode: code39, quiet: INDUSTRIAL_QUIET, square: false },
  code93: { encode: code93, quiet: INDUSTRIAL_QUIET, square: false },
  codabar: { encode: codabar, quiet: INDUSTRIAL_QUIET, square: false },
  itf: { encode: itf, quiet: INDUSTRIAL_QUIET, square: false },
  qr: { encode: qr, quiet: QR_QUIET, square: true },
  dataMatrix: { encode: dataMatrix, quiet: DATAMATRIX_QUIET, square: true },
  aztec: { encode: aztec, quiet: AZTEC_QUIET, square: true },
  pdf417: { encode: pdf417, quiet: PDF417_QUIET, square: false },
};

/** `value` as a symbol of `format`, or why the format cannot hold it. An empty value is no code at all. */
export function encode(value, format) {
  const entry = FORMATS[format];
  if (!entry) return { ok: false, reason: "format" };
  if (!value) return { ok: false, reason: "empty" };
  try {
    return entry.encode(value);
  } catch {
    return { ok: false, reason: "tooLong" };
  }
}

/**
 * The symbol as SVG markup: the dark modules as one path, with the quiet zone around it. A linear code is drawn
 * `barHeight` modules tall (by default 0.38 of its width with the quiet zones, close to a printed EAN-13). Each module is one
 * unit; the picture scales to its box, and `shape-rendering="crispEdges"` keeps the edges sharp.
 */
export function toSvg(symbol, format, { label = "", barHeight } = {}) {
  const quiet = (FORMATS[format] && FORMATS[format].quiet) || 4;
  const height = symbol.linear
    ? barHeight || Math.max(30, Math.round((symbol.columns + quiet * 2) * 0.38))
    : symbol.height;
  const vq = symbol.linear ? 0 : quiet;
  const width = symbol.columns + quiet * 2;
  const total = height + vq * 2;
  let d = "";
  for (let row = 0; row < symbol.rows; row++) {
    let x = 0;
    while (x < symbol.columns) {
      if (!symbol.isDark(x, row)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < symbol.columns && symbol.isDark(x + run, row)) run++;
      const y = vq + (symbol.linear ? 0 : row * symbol.rowHeight);
      const h = symbol.linear ? height : symbol.rowHeight;
      d += `M${x + quiet} ${y}h${run}v${h}h-${run}z`;
      x += run;
    }
  }
  const role = label ? ` role="img" aria-label="${escapeAttribute(label)}"` : ` aria-hidden="true"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" preserveAspectRatio="xMidYMid meet"` +
    ` shape-rendering="crispEdges"${role}><rect width="${width}" height="${total}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`
  );
}

function escapeAttribute(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
