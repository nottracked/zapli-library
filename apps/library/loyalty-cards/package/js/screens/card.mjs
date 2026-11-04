// A card at the till: its code big on white, the number under it, the screen at full brightness and kept on; a swipe
// sideways shows the next card of the wallet. Below: points, expiry, the name on the card, the note, its photos.

import { encode, toSvg, FORMATS } from "../barcode/index.mjs";
import { cardColours, fitNames, textZoom } from "../faces.mjs";
import { FORMAT_NAMES, drawnFormat, groupedNumber } from "../formats.mjs";
import { icon, kindIcon } from "../icons.mjs";
import { canPickPictures, canTakePhoto, pickPictures, shrink, takePhoto } from "../photos.mjs";
import { button, confirmDialog, ctx, dialog, formatDate, formatNumber, h, snack, t, topBar } from "../ui.mjs";
import { showProblem } from "./transfer.mjs";
import { orderedCards } from "./wallet.mjs";

const USED_AFTER_MS = 1500;

let state = null;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- brightness

/** Full brightness and the screen kept on while a code shows; the phone ends both when the app leaves the front. */
async function brighten(on) {
  try {
    await ctx.store.run("screenOn", { on });
    if (on && state && state.dim) {
      state.dim = false;
      refresh();
    }
  } catch {
    if (on && state) {
      state.dim = true;
      refresh();
    }
  }
}

// ---------------------------------------------------------------- the code

/** The code of a card as SVG markup, or null when its number does not fit its type. */
export function codeMarkup(card, label) {
  const format = drawnFormat(card);
  const result = encode(card.number, format);
  if (!result.ok) return null;
  return toSvg(result.symbol, format, { label });
}

function slide(card) {
  const colours = cardColours(card);
  const format = drawnFormat(card);
  const square = FORMATS[format] && FORMATS[format].square;
  const panel = h(
    "div",
    {
      class: "code-panel" + (square ? " square" : "") + (format === "pdf417" ? " stacked" : ""),
      style: `--face-bg:${colours.bg};--face-fg:${colours.fg}`,
    },
    h(
      "div",
      { class: "code-band" },
      h("span", { class: "band-kind" }, kindIcon(card.group)),
      h("span", { class: "band-name", text: card.store }),
    ),
    h("div", { class: "code-area", "data-code": card.id }),
    h("p", { class: "code-number", text: groupedNumber(card.number) }),
    card.holder ? h("p", { class: "code-holder", text: card.holder }) : null,
  );
  return h("div", { class: "slide", "data-id": card.id }, panel);
}

/**
 * The number under a code on one line: it shrinks (to about half at most) rather than wrap, so a cashier reads it
 * in one go; a number longer than that wraps.
 */
function fitNumber(el) {
  el.classList.remove("wraps");
  el.style.fontSize = "";
  const zoom = textZoom(el);
  let size = parseFloat(getComputedStyle(el).fontSize) / zoom || 20;
  const min = size * 0.55;
  let guard = 0;
  while (guard++ < 16 && size > min && el.scrollWidth > el.clientWidth + 1) {
    size *= 0.92;
    el.style.fontSize = size + "px";
  }
  if (el.scrollWidth > el.clientWidth + 1) el.classList.add("wraps");
}

/** Draws the codes of the slide on show and its neighbours (the others wait until they come near). */
function drawCodes() {
  if (!state) return;
  const around = [state.index - 1, state.index, state.index + 1];
  for (const i of around) {
    const card = state.cards[i];
    if (!card) continue;
    const area = state.slides.querySelector(`[data-code="${CSS.escape(card.id)}"]`);
    if (!area || area.dataset.drawn) continue;
    area.dataset.drawn = "1";
    const markup = codeMarkup(card, t("codeLabel", { store: card.store, number: card.number }));
    if (markup) area.innerHTML = markup;
    else area.appendChild(h("p", { class: "cant-draw", text: t("cantDraw") }));
    const number = area.parentElement.querySelector(".code-number");
    if (number) fitNumber(number);
  }
}

// ---------------------------------------------------------------- the details under the code

function infoRow(label, value, extra) {
  return h(
    "div",
    { class: "info-row" },
    h("span", { class: "info-label", text: label }),
    h("span", { class: "info-value", text: value }),
    extra || null,
  );
}

function photoSlot(card, side) {
  const store = ctx.store;
  const slot = h("div", { class: "photo-slot" });
  const title = side === "face" ? t("front") : t("backSide");
  if (store.hasPhoto(side, card.id)) {
    const thumb = h("button", {
      type: "button",
      class: "photo-thumb",
      "aria-label": `${t("photoOf", { store: card.store })}: ${title}`,
    });
    store.photo(side, card.id).then((photo) => {
      if (!photo) return;
      thumb.appendChild(h("img", { src: `data:${photo.type};base64,${photo.b64}`, alt: "" }));
      thumb.onclick = () => showPhoto(card, side, photo, title);
    });
    slot.append(h("span", { class: "photo-title", text: title }), thumb);
    return slot;
  }
  const add = async (how) => {
    try {
      let file;
      if (how === "camera") file = await takePhoto();
      else file = ((await pickPictures({ multiple: false })) || [])[0];
      if (!file) return;
      const picture = await shrink(file, { side: 1100, crop: true });
      await store.setPhoto(side, card.id, picture);
    } catch (error) {
      showProblem(error);
    }
  };
  const camera = canTakePhoto();
  const picker = canPickPictures() || !store.live;
  const lower = side === "face" ? t("frontSide") : t("backSideLower");
  const choose = () => {
    // Both ways open from a tap: straight away when there is one, from a short choice when there are two.
    if (camera && !picker) return add("camera");
    if (picker && !camera) return add("pick");
    if (!camera && !picker) return snack(t("picturesUnavailable"));
    dialog(
      (close) =>
        h(
          "div",
          { class: "menu", role: "menu" },
          h(
            "button",
            { type: "button", class: "menu-item", onClick: () => (close(), add("camera")) },
            icon("camera"),
            h("span", { text: t("takePhoto") }),
          ),
          h(
            "button",
            { type: "button", class: "menu-item", onClick: () => (close(), add("pick")) },
            icon("image"),
            h("span", { text: t("pickPhoto") }),
          ),
        ),
      { sheet: true, label: t("addPhotoOf", { side: lower }) },
    );
  };
  slot.append(
    h("span", { class: "photo-title", text: title }),
    h(
      "button",
      { type: "button", class: "photo-add", onClick: choose, "aria-label": t("addPhotoOf", { side: lower }) },
      icon(camera ? "camera" : "image"),
      h("span", { text: t("addPhoto") }),
    ),
  );
  return slot;
}

function showPhoto(card, side, photo, title) {
  dialog(
    (close) =>
      h(
        "div",
        { class: "photo-view" },
        h(
          "div",
          { class: "sheet-head" },
          h("h2", { class: "sheet-title", text: `${card.store}: ${title}` }),
          button(t("close"), () => close(), "icon", { iconName: "close" }),
        ),
        h("img", { src: `data:${photo.type};base64,${photo.b64}`, alt: t("photoOf", { store: card.store }) }),
        h(
          "div",
          { class: "ask-buttons" },
          button(
            t("removePhoto"),
            async () => {
              close();
              await ctx.store.deletePhoto(side, card.id);
            },
            "text",
            { iconName: "trash" },
          ),
        ),
      ),
    { full: true, label: title },
  );
}

function details(card) {
  const day = today();
  const expired = card.expires && card.expires < day;
  const box = h("div", { class: "card-details" });
  if (state && state.dim && ctx.store.live) {
    box.appendChild(
      button(
        t("brighter"),
        () => ctx.store.run("showCode", { card: card.id, format: drawnFormat(card) }).catch(showProblem),
        "tonal",
        { iconName: "sun", extraClass: "wide" },
      ),
    );
  }
  const rows = h("div", { class: "info" });
  if (card.points !== undefined && card.points !== null)
    rows.appendChild(infoRow(t("pointsBalance"), formatNumber(card.points)));
  if (card.expires) {
    rows.appendChild(
      infoRow(
        expired ? t("expiredBadge") : t("validUntil"),
        expired ? t("expiredOn", { date: formatDate(card.expires) }) : formatDate(card.expires),
      ),
    );
  }
  if (card.holder) rows.appendChild(infoRow(t("nameCard"), card.holder));
  if (card.note)
    rows.appendChild(
      h(
        "div",
        { class: "info-note" },
        h("span", { class: "info-label", text: t("note") }),
        h("p", { class: "note-text", text: card.note }),
      ),
    );
  if (rows.childNodes.length) box.appendChild(rows);

  box.appendChild(h("h2", { class: "section-title", text: t("photos") }));
  box.appendChild(h("div", { class: "photos" }, photoSlot(card, "face"), photoSlot(card, "back")));

  const format = drawnFormat(card);
  const formatName = format === "qr" ? t("qrCode") : FORMAT_NAMES[format];
  const more = h(
    "details",
    { class: "more-details" },
    h("summary", { text: t("details") }),
    infoRow(
      t("barcodeType"),
      card.format && card.format !== "auto" ? formatName : t("workedOut", { format: formatName }),
    ),
    infoRow(t("kindShop"), t("kind_" + (card.group || "storefront"))),
    h("p", { class: "info-line", text: card.uses ? t("shown", { n: card.uses }) : t("notShownYet") }),
    card.lastUsed ? h("p", { class: "info-line", text: t("lastShown", { date: formatDate(card.lastUsed) }) }) : null,
  );
  box.appendChild(more);
  box.appendChild(
    h(
      "div",
      { class: "card-actions" },
      button(t("edit"), () => ctx.go("#/edit/" + encodeURIComponent(card.id)), "tonal", { iconName: "edit" }),
      button(t("shareCard"), () => shareCard(card), "tonal", { iconName: "share" }),
    ),
  );
  return box;
}

// ---------------------------------------------------------------- actions

/** The code as a PNG picture with the store and number under it, for sharing. */
function codePicture(card) {
  const format = drawnFormat(card);
  const result = encode(card.number, format);
  if (!result.ok) return null;
  const s = result.symbol;
  const quiet = FORMATS[format].quiet;
  const unit = Math.max(2, Math.floor(900 / (s.columns + quiet * 2)));
  const codeH = s.linear ? Math.round((s.columns + quiet * 2) * unit * 0.35) : s.height * unit;
  const width = (s.columns + quiet * 2) * unit;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = codeH + quiet * unit * (s.linear ? 0 : 2) + 140;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000";
  const top = s.linear ? 40 : quiet * unit;
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.columns; c++) {
      if (!s.isDark(c, r)) continue;
      const y = s.linear ? top : top + r * s.rowHeight * unit;
      g.fillRect((c + quiet) * unit, y, unit, s.linear ? codeH : s.rowHeight * unit);
    }
  }
  g.font = "600 40px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(card.number, width / 2, top + codeH + (s.linear ? 50 : quiet * unit + 10));
  g.font = "400 30px system-ui, sans-serif";
  g.fillText(card.store, width / 2, top + codeH + (s.linear ? 92 : quiet * unit + 52));
  return canvas;
}

let shared = null;

async function shareCard(card) {
  const zapli = ctx.zapli;
  const text = t("shareText", { store: card.store, number: card.number });
  if (!zapli || !zapli.share) {
    if (navigator.share) navigator.share({ title: card.store, text }).catch(() => {});
    else snack(t("onPhoneOnly"));
    return;
  }
  try {
    // The same File object on a second tap: its upload is kept, so the share goes out at once.
    if (!shared || shared.id !== card.id || shared.number !== card.number) {
      const canvas = codePicture(card);
      const blob = canvas ? await new Promise((resolve) => canvas.toBlob(resolve, "image/png")) : null;
      shared = {
        id: card.id,
        number: card.number,
        file: blob ? new File([blob], "card.png", { type: "image/png" }) : null,
      };
    }
    await zapli.share({ title: card.store, text, files: shared.file ? [shared.file] : undefined });
  } catch (error) {
    showProblem(error);
  }
}

async function toggleFavourite(card) {
  try {
    await ctx.store.update(card.id, { pinned: !card.pinned });
  } catch (error) {
    showProblem(error);
  }
}

function openMenu(card) {
  dialog(
    (close) => {
      const item = (label, iconName, run, danger) =>
        h(
          "button",
          {
            type: "button",
            class: "menu-item" + (danger ? " danger" : ""),
            onClick: () => {
              close();
              run();
            },
          },
          icon(iconName),
          h("span", { text: label }),
        );
      return h(
        "div",
        { class: "menu", role: "menu" },
        item(t("edit"), "edit", () => ctx.go("#/edit/" + encodeURIComponent(card.id))),
        item(t("shareCard"), "share", () => shareCard(card)),
        card.archived
          ? item(t("unarchive"), "unarchive", async () => {
              await ctx.store.update(card.id, { archived: false });
              snack(t("cardRestored"));
            })
          : item(t("archive"), "archive", async () => {
              await ctx.store.update(card.id, { archived: true });
              snack(t("cardArchived"), { label: t("undo"), run: () => ctx.store.update(card.id, { archived: false }) });
              ctx.back();
            }),
        item(t("delete"), "trash", () => deleteCard(card), true),
      );
    },
    { sheet: true, label: card.store },
  );
}

async function deleteCard(card) {
  const yes = await confirmDialog({
    title: t("deleteTitle", { store: card.store }),
    body: t("deleteBody"),
    yes: t("delete"),
    danger: true,
  });
  if (!yes) return;
  const store = ctx.store;
  const photos = {};
  for (const side of ["face", "back"])
    if (store.hasPhoto(side, card.id)) photos[side] = await store.photo(side, card.id);
  try {
    await store.remove(card.id);
  } catch (error) {
    showProblem(error);
    return;
  }
  ctx.back();
  snack(t("cardDeleted"), {
    label: t("undo"),
    run: async () => {
      const again = await store.add(card);
      for (const [side, picture] of Object.entries(photos)) if (picture) await store.setPhoto(side, again.id, picture);
    },
  });
}

// ---------------------------------------------------------------- the screen

function current() {
  return state ? state.cards[state.index] : null;
}

function paintTop() {
  const card = current();
  if (!card || !state.top) return;
  state.top.querySelector(".topbar-title").textContent = card.store;
  const star = state.top.querySelector(".star-toggle");
  star.replaceChildren(icon("star", { filled: Boolean(card.pinned) }));
  star.setAttribute("aria-label", card.pinned ? t("removeFavourite") : t("addFavourite"));
  star.setAttribute("aria-pressed", card.pinned ? "true" : "false");
  star.classList.toggle("on", Boolean(card.pinned));
  state.position.textContent = state.cards.length > 1 ? t("cardOf", { i: state.index + 1, n: state.cards.length }) : "";
}

function paintDetails() {
  const card = current();
  if (!card) return;
  state.details.replaceChildren(details(card));
  fitNames(state.details);
}

/** The card on show changed by a swipe: its title, details and address follow; it counts as shown after a moment. */
function settle(index) {
  if (!state || index === state.index || index < 0 || index >= state.cards.length) return;
  state.index = index;
  const card = current();
  ctx.replace("#/card/" + encodeURIComponent(card.id), { quiet: true });
  drawCodes();
  paintTop();
  paintDetails();
  countLater(card);
  if (!ctx.store.ui.swiped) ctx.store.saveUi({ swiped: true });
  if (state.hint) state.hint.remove();
}

function countLater(card) {
  clearTimeout(state.usedTimer);
  if (state.counted.has(card.id)) return;
  state.usedTimer = setTimeout(() => {
    if (!state || current() !== card) return;
    state.counted.add(card.id);
    ctx.store.markUsed(card.id);
  }, USED_AFTER_MS);
}

export function render(route) {
  const store = ctx.store;
  const card = store.card(route.id);
  const screen = h("div", { class: "screen card-screen" });
  if (!card) {
    screen.appendChild(topBar({ title: t("appName"), onBack: () => ctx.back() }));
    screen.appendChild(h("div", { class: "empty" }, h("p", { text: t("somethingWrong") })));
    state = null;
    return screen;
  }
  const cards = card.archived ? [card] : orderedCards(store.cards, store.ui.order);
  const index = Math.max(
    0,
    cards.findIndex((c) => c.id === card.id),
  );
  const previous = state;
  state = {
    cards,
    index,
    counted: previous && previous.counted ? previous.counted : new Set(),
    usedTimer: 0,
    dim: previous ? previous.dim : false,
  };
  const star = h("button", {
    type: "button",
    class: "btn icon star-toggle",
    onClick: () => toggleFavourite(current()),
  });
  state.top = topBar({
    title: card.store,
    onBack: () => ctx.back(),
    actions: [star, button(t("menu"), () => openMenu(current()), "icon", { iconName: "more" })],
  });
  state.slides = h("div", { class: "slides", tabindex: "-1" }, cards.map(slide));
  state.position = h("p", { class: "position", "aria-live": "polite" });
  state.details = h("div", { class: "details-host" });
  state.hint = !store.ui.swiped && cards.length > 1 ? h("p", { class: "swipe-hint", text: t("swipeHint") }) : null;
  let scrollTimer = 0;
  state.slides.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const width = state.slides.clientWidth || 1;
      settle(Math.round(state.slides.scrollLeft / width));
    }, 90);
  });
  screen.append(
    state.top,
    h("div", { class: "till" }, state.slides, h("div", { class: "under-code" }, state.position, state.hint)),
    state.details,
  );
  paintTop();
  paintDetails();
  return screen;
}

export function mounted() {
  if (!state) return;
  const width = state.slides.clientWidth;
  state.slides.scrollLeft = state.index * width;
  drawCodes();
  fitNames(document.getElementById("main"));
  brighten(true);
  countLater(current());
}

/** A change of data (a favourite, a use counted, a photo): the slides stay, the details and the title follow. */
export function refresh() {
  if (!state) return;
  const store = ctx.store;
  const card = current() && store.card(current().id);
  if (!card) return;
  state.cards[state.index] = card;
  paintTop();
  paintDetails();
}

export function resized() {
  if (!state) return;
  state.slides.scrollLeft = state.index * state.slides.clientWidth;
  for (const number of state.slides.querySelectorAll(".code-number")) fitNumber(number);
}

export function leave() {
  if (state) clearTimeout(state.usedTimer);
  brighten(false);
  state = null;
}

export function paused() {
  if (state) clearTimeout(state.usedTimer);
}

/** Back in front: the phone ended the brightness when the app left it, so the code asks for it again. */
export function resumed() {
  if (state) brighten(true);
}
