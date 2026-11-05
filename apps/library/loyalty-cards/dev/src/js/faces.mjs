// Card faces and store tiles: the store's name in the app's own type on a colour of the app's palette (or the user's
// own photo of their card), never a store's logo or artwork.

import { TONES, brandById, brandColours, brandForName } from "./brands.mjs";
import { lastDigits } from "./formats.mjs";
import { kindIcon, icon } from "./icons.mjs";
import { formatNumber, h, t } from "./ui.mjs";

/** The tone each kind of shop takes when a card has neither a store from the list nor a colour of its own. */
const KIND_TONES = {
  shopping_cart: "green",
  storefront: "royal",
  shopping_bag: "purple",
  medication: "teal",
  spa: "magenta",
  directions_car: "blue",
  handyman: "orange",
  keyboard: "slate",
  menu_book: "crimson",
  restaurant: "tomato",
  local_cafe: "brown",
  flight: "cyan",
  fitness_center: "violet",
  pets: "amber",
  child_care: "pink",
  book: "navy",
  badge: "navy",
  sell: "violet",
};

/** The palette's colours as the swatches of the colour picker. */
export const SWATCHES = Object.values(TONES).map((tone) => tone.bg);

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The relative luminance of a colour (WCAG 2). */
export function luminance(hex) {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A colour the user picked (any of the palette, or one a card brought from an older version or a file). */
function toneOfColour(hex) {
  const exact = Object.values(TONES).find((tone) => tone.bg.toLowerCase() === String(hex).toLowerCase());
  if (exact) return exact;
  const c = rgb(hex);
  if (!c) return null;
  // The palette's nearest colour, so every face keeps the palette's readable text.
  let best = null;
  let distance = Infinity;
  for (const tone of Object.values(TONES)) {
    const d = rgb(tone.bg).reduce((sum, v, i) => sum + (v - c[i]) ** 2, 0);
    if (d < distance) {
      distance = d;
      best = tone;
    }
  }
  return best;
}

/** The store from the list a card belongs to: by its id, else by its name (cards from before the list). */
export function brandOf(card) {
  return brandById(card.brand) || brandForName(card.store);
}

/** A card's face colours: its own colour, else its store's, else its kind of shop's. */
export function cardColours(card) {
  if (card.color) {
    const tone = toneOfColour(card.color);
    if (tone) return { bg: tone.bg, fg: tone.fg };
  }
  const brand = brandOf(card);
  if (brand) return brandColours(brand);
  return TONES[KIND_TONES[card.group] || "slate"];
}

/** A name whose lines break only between words (never inside "Sainsbury’s" or "Dr.Max"). */
function nameSpans(text) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  words.forEach((word, i) => {
    if (i) out.push(" ");
    out.push(h("span", { class: "word", text: word }));
  });
  return out;
}

function styleFor({ bg, fg }) {
  const light = luminance(bg) > 0.6;
  return `--face-bg:${bg};--face-fg:${fg};--face-line:${light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.18)"}`;
}

/**
 * A card's face for the wallet: the store's name, its kind of shop, the last digits, the points and whether it is a
 * favourite or expired. With `photo` ({type, b64}) the user's own picture of the card fills the face.
 */
export function cardFace(card, { photo = null, today = "" } = {}) {
  const colours = cardColours(card);
  const expired = Boolean(card.expires && today && card.expires < today);
  const kind = card.group || (brandOf(card) || {}).kind || "storefront";
  const star = card.pinned
    ? h("span", { class: "face-star", title: t("favouriteMark") }, icon("star", { filled: true }))
    : null;
  const warn = expired ? h("span", { class: "face-chip warn", text: t("expiredBadge") }) : null;
  if (photo) {
    // The user's own photo is the face: only the store's name in a strip at the bottom, never over the card's print.
    return h(
      "div",
      { class: "face has-photo", style: styleFor(colours) },
      h("img", { class: "face-photo", src: `data:${photo.type};base64,${photo.b64}`, alt: "" }),
      h("div", { class: "face-top" }, h("span"), star),
      h("div", { class: "face-label" }, h("span", { class: "face-label-name", text: card.store }), warn),
    );
  }
  const points =
    !expired && card.points !== undefined && card.points !== null
      ? h(
          "span",
          {
            class: "face-chip",
            title:
              card.group === "sell" ? t("balance", { n: formatNumber(card.points) }) : t("points", { n: card.points }),
          },
          icon(card.group === "sell" ? "sell" : "coin"),
          h("span", { text: formatNumber(card.points) }),
        )
      : null;
  return h(
    "div",
    { class: "face", style: styleFor(colours) },
    h(
      "div",
      { class: "face-top" },
      h("span", { class: "face-kind" }, kindIcon(kind)),
      h("span", { class: "face-marks" }, points, star),
    ),
    h("div", { class: "face-name-box" }, h("span", { class: "face-name" }, nameSpans(card.store))),
    h(
      "div",
      { class: "face-bottom" },
      h("span", { class: "face-digits", text: t("endsIn", { digits: lastDigits(card.number) }) }),
      warn,
    ),
  );
}

/** A store's tile in the store list: its name on its colour, shaped like a card. */
export function storeTile(brand) {
  return h(
    "span",
    { class: "tile-face", style: styleFor(brandColours(brand)) },
    h("span", { class: "tile-name" }, nameSpans(brand.name)),
  );
}

/**
 * How much the phone enlarges the text of `el` (its large-text setting): a size set in pixels is drawn that much
 * larger, so the fitting below works in set sizes and measures in drawn ones.
 */
export function textZoom(el) {
  const before = el.style.fontSize;
  el.style.fontSize = "100px";
  const zoom = parseFloat(getComputedStyle(el).fontSize) / 100 || 1;
  el.style.fontSize = before;
  return zoom;
}

/**
 * Fits every name on the faces and tiles under `root` into its box: a name keeps its size when it fits; it shrinks
 * until each word fits the width (to 40 % at most) and until its lines fit the height (to about two thirds); past
 * that the face grows taller, so a name is never cut and its words are never broken.
 */
export function fitNames(root) {
  for (const name of root.querySelectorAll(".face-name, .tile-name")) {
    const box = name.parentElement;
    const face = name.closest(".face, .tile-face");
    if (face) face.style.minHeight = "";
    name.style.fontSize = "";
    const zoom = textZoom(name);
    const start = parseFloat(getComputedStyle(name).fontSize) / zoom || 16;
    let size = start;
    const set = () => (name.style.fontSize = size + "px");
    const style = getComputedStyle(box);
    const room = () => ({
      w: box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      h: box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    });
    const wide = () => name.scrollWidth > room().w + 0.5;
    const tall = () => name.offsetHeight > room().h + 0.5;
    for (let i = 0; i < 20 && size > start * 0.4 && wide(); i++) {
      size *= 0.93;
      set();
    }
    for (let i = 0; i < 12 && size > start * 0.64 && tall(); i++) {
      size *= 0.93;
      set();
    }
    if (face && tall()) face.style.minHeight = face.offsetHeight + (name.offsetHeight - room().h) + 4 + "px";
  }
}

/**
 * A line of text (a card's number) kept on one line: it shrinks (to about half at most) rather than wrap, so it reads
 * in one go; a text longer than that wraps.
 */
export function fitLine(el) {
  el.classList.remove("wraps");
  el.style.fontSize = "";
  const zoom = textZoom(el);
  let size = parseFloat(getComputedStyle(el).fontSize) / zoom || 20;
  const min = size * 0.55;
  for (let i = 0; i < 16 && size > min && el.scrollWidth > el.clientWidth + 1; i++) {
    size *= 0.92;
    el.style.fontSize = size + "px";
  }
  if (el.scrollWidth > el.clientWidth + 1) el.classList.add("wraps");
}

/** The ink of a store's name for screen readers and tests: whether the face keeps readable contrast. */
export function readable(colours, ratio = 4.5) {
  return contrast(colours.bg, colours.fg) >= ratio;
}
