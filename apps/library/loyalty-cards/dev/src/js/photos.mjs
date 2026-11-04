// Pictures: photos of a card's front and back (kept in the app's store, made small enough for it), and the barcodes
// read from screenshots and photos the user picks (on the phone, by the host's reader; nothing leaves the phone).

import { ctx } from "./ui.mjs";

/** The Barcode Detection API's format names and the app's. */
const WEB_FORMATS = {
  aztec: "aztec",
  code_128: "code128",
  code_39: "code39",
  code_93: "code93",
  codabar: "codabar",
  data_matrix: "dataMatrix",
  ean_13: "ean13",
  ean_8: "ean8",
  itf: "itf",
  pdf417: "pdf417",
  qr_code: "qr",
  upc_a: "upcA",
  upc_e: "upcE",
};

export function canTakePhoto() {
  return Boolean(ctx.zapli && ctx.zapli.supports && ctx.zapli.supports("camera.photo"));
}

export function canPickPictures() {
  return Boolean(ctx.zapli && ctx.zapli.supports && ctx.zapli.supports("media.pick"));
}

export function canScan() {
  return Boolean(ctx.zapli && ctx.zapli.supports && ctx.zapli.supports("scan.barcode"));
}

/** Whether pictures can be read for barcodes here. */
export function canReadPictures() {
  return typeof globalThis.BarcodeDetector === "function";
}

/** Pictures the user picks: the phone's picker inside Zapli, the browser's file chooser in a preview. Call from a tap. */
export async function pickPictures({ multiple = false } = {}) {
  if (canPickPictures()) return ctx.zapli.media.pick({ multiple, max: multiple ? 20 : 1 });
  if (ctx.zapli) {
    const error = new Error("unsupported");
    error.code = "UNSUPPORTED";
    throw error;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files || [])]));
    input.click();
  });
}

/** A photo with the camera. Call from a tap. */
export function takePhoto() {
  return ctx.zapli.camera.photo({ maxWidth: 1600, quality: 0.85 });
}

async function imageOf(file) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  } finally {
    // The decoded image keeps its pixels; the address is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * A picture made small enough to keep with a card: at most `side` pixels on its long side, as JPEG, cut to the shape
 * of a card when `crop` is set (the middle of the picture, as a card held in front of the camera fills it).
 */
export async function shrink(file, { side = 1100, crop = false } = {}) {
  const img = await imageOf(file);
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (crop) {
    const ratio = 1.586;
    const portrait = sh > sw;
    // A card photographed upright is turned on its side, so its face reads as a card.
    const target = portrait ? 1 / ratio : ratio;
    if (sw / sh > target) {
      sw = Math.round(sh * target);
      sx = Math.round((img.naturalWidth - sw) / 2);
    } else {
      sh = Math.round(sw / target);
      sy = Math.round((img.naturalHeight - sh) / 2);
    }
  }
  for (const [limit, quality] of [
    [side, 0.8],
    [Math.round(side * 0.75), 0.7],
    [Math.round(side * 0.5), 0.6],
  ]) {
    const scale = Math.min(1, limit / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    const turn = crop && sh > sw;
    const w = Math.round(sw * scale);
    const hgt = Math.round(sh * scale);
    canvas.width = turn ? hgt : w;
    canvas.height = turn ? w : hgt;
    const g = canvas.getContext("2d");
    if (turn) {
      g.translate(canvas.width / 2, canvas.height / 2);
      g.rotate(-Math.PI / 2);
      g.drawImage(img, sx, sy, sw, sh, -w / 2, -hgt / 2, w, hgt);
    } else g.drawImage(img, sx, sy, sw, sh, 0, 0, w, hgt);
    const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    if (b64.length < 600000) return { type: "image/jpeg", b64, w: canvas.width, h: canvas.height };
  }
  const error = new Error("too large");
  error.code = "QUOTA_EXCEEDED";
  throw error;
}

/** The barcodes in a picture, as {value, format} with the app's format ids; an empty list when there is none. */
export async function readCodes(file) {
  if (!canReadPictures()) return [];
  const detector = new globalThis.BarcodeDetector();
  const codes = await detector.detect(file);
  return codes.map((c) => ({ value: c.rawValue, format: WEB_FORMATS[c.format] || "auto" })).filter((c) => c.value);
}
