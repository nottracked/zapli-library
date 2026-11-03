// Photos in notes: taken with the camera or picked from the phone's pictures through Zapli (from a tap), made
// smaller on a canvas, and kept in the app's store (zapli.data.kv) as JPEG: the photo at most 1,600 pixels on its
// long side and a small copy for the note cards. A value there may hold 1 MiB, so a photo that would not fit is
// saved again at a lower quality. In a plain browser the page's own file picker stands in.

import { ctx } from "./ui.mjs";
import { newId } from "./model.mjs";

const FULL = 1600;
const THUMB = 480;
/** Base64 characters one photo may take: a little under the store's 1 MiB a value. */
const LIMIT = 950000;

/** What this phone can do: take a photo, pick pictures, or (in a browser) open a file picker. */
export function photoSources() {
  const zapli = ctx.zapli;
  if (zapli && ctx.store && ctx.store.live) {
    let camera = false;
    let pick = false;
    try {
      camera = zapli.supports("camera.photo");
      pick = zapli.supports("media.pick");
    } catch {
      // Neither.
    }
    return { camera, pick };
  }
  return { camera: true, pick: true };
}

/**
 * Takes a photo ("camera") or picks pictures ("pick"). Call it straight from a tap: Zapli opens the camera or the
 * photo picker only for one. Resolves with the files, empty when the user picked nothing.
 */
export async function capture(source) {
  const zapli = ctx.zapli;
  if (zapli && ctx.store && ctx.store.live) {
    if (source === "camera") return [await zapli.camera.photo({ maxWidth: FULL })];
    return await zapli.media.pick({ multiple: true, max: 10 });
  }
  return fileInput(source === "camera");
}

function fileInput(camera) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (camera) input.setAttribute("capture", "environment");
    else input.multiple = true;
    input.addEventListener("change", () => resolve([...(input.files || [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Object.assign(new Error("Not a picture"), { code: "UNSUPPORTED" }));
    };
    img.src = url;
  });
}

function encode(img, max, quality) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const url = canvas.toDataURL("image/jpeg", quality);
  return { type: "image/jpeg", b64: url.slice(url.indexOf(",") + 1), w, h };
}

/** The photo and its small copy, ready for the store. */
export async function prepare(file) {
  const img = await loadImage(file);
  let quality = 0.86;
  let size = FULL;
  let full = encode(img, size, quality);
  while (full.b64.length > LIMIT && size > 640) {
    quality = Math.max(0.6, quality - 0.1);
    if (quality <= 0.6) size = Math.round(size * 0.8);
    full = encode(img, size, quality);
  }
  const thumb = encode(img, THUMB, 0.78);
  return { full, thumb };
}

/** Keeps the files as photos; resolves with their new ids (the ones that could be read and stored). */
export async function storePhotos(files) {
  const ids = [];
  let problem = null;
  for (const file of files) {
    try {
      const { full, thumb } = await prepare(file);
      const id = newId();
      await ctx.store.putPhoto(id, full, thumb);
      ids.push(id);
    } catch (error) {
      problem = error;
    }
  }
  if (problem && !ids.length) throw problem;
  return ids;
}

export function dataUrl(value) {
  return value && value.b64 ? "data:" + (value.type || "image/jpeg") + ";base64," + value.b64 : "";
}

/** A stored photo as a File, for sharing or saving. */
export function fileOf(value, name) {
  const bytes = Uint8Array.from(atob(value.b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: value.type || "image/jpeg" });
}
