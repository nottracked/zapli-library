// The wallet: the cards as faces, favourites first, then in the order the user chose (most used by default, or their
// own); search; Add. Holding a card lifts it: let go for its menu (favourite, move up or down, edit), or drag it to
// another place, which switches the wallet to the user's own order.

import { fold } from "../brands.mjs";
import { cardFace, fitNames } from "../faces.mjs";
import { icon } from "../icons.mjs";
import { ORDERS, moved, orderedCards } from "../order.mjs";
import { button, buzz, ctx, dialog, h, snack, t, topBar } from "../ui.mjs";
import { backupCards, importCardFile, importFromPictures } from "./transfer.mjs";

/** How long a finger rests on a card before it lifts: the phone's own long press, so a tap or a scroll never lifts one. */
export const HOLD_MS = 400;
const SLOP = 10;

let query = "";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whether a card matches what was typed in the search: its store, number, name on it or note, without accents. */
export function matches(card, text) {
  const q = fold(text);
  if (!q) return true;
  return [card.store, card.number, card.holder, card.note].some((v) => fold(v).includes(q));
}

function openCard(card) {
  ctx.go("#/card/" + encodeURIComponent(card.id));
}

/** The user's own order saved, switching to it; when the wallet had another order, a word with Undo. */
async function saveOwnOrder(manual, message) {
  const store = ctx.store;
  const before = { order: store.ui.order || "use", manual: store.ui.manual || [] };
  await store.saveUi({ order: "mine", manual, held: true });
  if (before.order !== "mine") {
    snack(t("orderNowMine"), { label: t("undo"), run: () => store.saveUi(before) });
  } else if (message) snack(message);
}

/** Moves a card one place up (-1) or down (1) among its group, in the user's own order. */
export async function moveCard(id, delta) {
  const store = ctx.store;
  const manual = moved(store.cards, store.ui.order, store.ui.manual, id, delta);
  if (!manual) return false;
  await saveOwnOrder(manual, delta < 0 ? t("movedUp") : t("movedDown"));
  return true;
}

export async function toggleFavourite(card) {
  await ctx.store.update(card.id, { pinned: !card.pinned });
  snack(card.pinned ? t("unstarred", { store: card.store }) : t("starred", { store: card.store }));
}

/** A card's menu from the wallet: favourite, move up or down, edit, show the code. */
function cardMenu(card) {
  const store = ctx.store;
  if (!store.ui.held) store.saveUi({ held: true });
  const canUp = Boolean(moved(store.cards, store.ui.order, store.ui.manual, card.id, -1));
  const canDown = Boolean(moved(store.cards, store.ui.order, store.ui.manual, card.id, 1));
  dialog(
    (close) => {
      const item = (label, iconName, run, { disabled = false, filled = false } = {}) =>
        h(
          "button",
          {
            type: "button",
            class: "menu-item",
            disabled,
            onClick: () => {
              close();
              run();
            },
          },
          icon(iconName, { filled }),
          h("span", { text: label }),
        );
      return h(
        "div",
        { class: "menu", role: "menu" },
        h("h2", { class: "menu-title", text: card.store }),
        item(card.pinned ? t("removeFavourite") : t("addFavourite"), "star", () => toggleFavourite(card), {
          filled: !card.pinned,
        }),
        item(t("moveUp"), "chevronUp", () => moveCard(card.id, -1), { disabled: !canUp }),
        item(t("moveDown"), "chevronDown", () => moveCard(card.id, 1), { disabled: !canDown }),
        item(t("edit"), "edit", () => ctx.go("#/edit/" + encodeURIComponent(card.id))),
        item(t("showCode"), "scan", () => openCard(card)),
      );
    },
    { sheet: true, label: card.store },
  );
}

// ---------------------------------------------------------------- holding and dragging a card

let press = null;
let quietUntil = 0;

/** Holding a face: after a moment it lifts; moved, it drags; let go without moving, its menu opens. */
function holdable(btn, card, canDrag) {
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || press) return;
    press = { btn, card, x0: e.clientX, y0: e.clientY, lifted: false, dragging: false, pointerId: e.pointerId };
    press.timer = setTimeout(() => {
      if (!press || press.btn !== btn) return;
      press.lifted = true;
      quietUntil = Date.now() + 600;
      btn.classList.add("lifted");
      buzz("light");
    }, HOLD_MS);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!press || press.btn !== btn) return;
    const dx = e.clientX - press.x0;
    const dy = e.clientY - press.y0;
    const far = Math.hypot(dx, dy) > SLOP;
    if (!press.lifted) {
      if (far) endPress();
      return;
    }
    if (!press.dragging && far && canDrag) startDrag(e);
    if (press.dragging) dragTo(e);
  });
  btn.addEventListener("pointerup", () => {
    if (!press || press.btn !== btn) return;
    const { lifted, dragging } = press;
    if (dragging) drop();
    else endPress();
    if (lifted && !dragging) cardMenu(card);
  });
  btn.addEventListener("pointercancel", () => {
    if (press && press.btn === btn && !press.dragging) endPress();
  });
}

function endPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.btn.classList.remove("lifted", "dragged");
  press.btn.style.transform = "";
  const grid = press.btn.parentElement;
  if (grid) grid.classList.remove("dragging");
  press = null;
}

function startDrag(e) {
  press.dragging = true;
  try {
    press.btn.setPointerCapture(e.pointerId);
  } catch {
    // Without the capture the face still follows while the finger stays over the wallet.
  }
  press.btn.classList.add("dragged");
  press.btn.parentElement.classList.add("dragging");
  const r = press.btn.getBoundingClientRect();
  press.offX = press.x0 - r.left;
  press.offY = press.y0 - r.top;
}

/** The face follows the finger; passing over another face of its group takes that face's place. */
function dragTo(e) {
  const btn = press.btn;
  const grid = btn.parentElement;
  for (const other of grid.children) {
    if (other === btn) continue;
    const r = other.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
    const before = [...grid.children].indexOf(btn) > [...grid.children].indexOf(other);
    grid.insertBefore(btn, before ? other : other.nextSibling);
    break;
  }
  btn.style.transform = "";
  const r = btn.getBoundingClientRect();
  btn.style.transform = `translate(${e.clientX - press.offX - r.left}px, ${e.clientY - press.offY - r.top}px) scale(1.04)`;
  // Near the top or bottom of the screen, the wallet scrolls along.
  if (e.clientY < 90) window.scrollBy(0, -14);
  else if (e.clientY > window.innerHeight - 110) window.scrollBy(0, 14);
}

async function drop() {
  const results = press.btn.closest(".results");
  endPress();
  const manual = [...results.querySelectorAll(".face-button")].map((b) => b.dataset.id);
  buzz("light");
  await saveOwnOrder(manual, "");
}

function faceButton(card, day, canDrag) {
  const store = ctx.store;
  const face = cardFace(card, { today: day });
  const btn = h(
    "button",
    {
      type: "button",
      class: "face-button",
      "data-id": card.id,
      "aria-label": t("faceLabel", { store: card.store, digits: String(card.number).slice(-4) }),
      onClick: () => {
        if (Date.now() < quietUntil) return;
        openCard(card);
      },
    },
    face,
  );
  holdable(btn, card, canDrag);
  if (store.hasPhoto("face", card.id)) {
    store.photo("face", card.id).then((photo) => {
      if (!photo || !btn.isConnected) return;
      btn.replaceChildren(cardFace(card, { today: day, photo }));
      fitNames(btn);
    });
  }
  return btn;
}

function grid(cards, day, canDrag) {
  const el = h(
    "div",
    { class: "faces" },
    cards.map((c) => faceButton(c, day, canDrag)),
  );
  // While a face is lifted, the finger moves the face, not the page.
  el.addEventListener(
    "touchmove",
    (e) => {
      if (press && press.lifted) e.preventDefault();
    },
    { passive: false },
  );
  return el;
}

/** The orders to choose from, as a short sheet. */
function orderMenu() {
  const store = ctx.store;
  const current = store.ui.order || "use";
  const label = { use: t("orderUse"), recent: t("orderRecent"), name: t("orderName"), mine: t("orderMine") };
  dialog(
    (close) =>
      h(
        "div",
        { class: "menu", role: "radiogroup", "aria-label": t("order") },
        h("h2", { class: "menu-title", text: t("order") }),
        ORDERS.map((o) =>
          h(
            "button",
            {
              type: "button",
              class: "menu-item" + (o === current ? " on" : ""),
              role: "radio",
              "aria-checked": o === current ? "true" : "false",
              onClick: () => {
                close();
                store.saveUi({ order: o });
              },
            },
            icon(o === current ? "check" : "blank"),
            h("span", { text: label[o] }),
          ),
        ),
        h("p", { class: "field-hint menu-hint", text: t("orderHint") }),
      ),
    { sheet: true, label: t("order") },
  );
}

function emptyArt() {
  // Three cards fanned out: the app's own drawing for an empty wallet.
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 220 150");
  svg.setAttribute("class", "empty-art");
  svg.setAttribute("aria-hidden", "true");
  const cardShape = (x, y, rotate, fill, opacity) => {
    const r = document.createElementNS(ns, "rect");
    for (const [k, v] of Object.entries({
      x,
      y,
      width: 120,
      height: 76,
      rx: 12,
      fill,
      opacity,
      transform: `rotate(${rotate} ${x + 60} ${y + 38})`,
    }))
      r.setAttribute(k, v);
    svg.appendChild(r);
  };
  cardShape(22, 44, -14, "var(--art-a)", 1);
  cardShape(78, 40, 12, "var(--art-b)", 1);
  cardShape(50, 30, -2, "var(--art-c)", 1);
  const bars = document.createElementNS(ns, "path");
  let d = "";
  [0, 3, 5, 9, 11, 14, 18, 20, 23, 27, 29, 32].forEach((x, i) => (d += `M${78 + x} 70v${i % 3 ? 18 : 22}`));
  bars.setAttribute("d", d);
  bars.setAttribute("stroke", "#fff");
  bars.setAttribute("stroke-width", "1.6");
  svg.appendChild(bars);
  return svg;
}

function empty() {
  return h(
    "div",
    { class: "empty first-run" },
    emptyArt(),
    h("h2", { text: t("emptyTitle") }),
    h("p", { text: t("emptyBody") }),
    h(
      "div",
      { class: "empty-actions" },
      button(t("addFirst"), () => ctx.go("#/add"), "filled", { iconName: "plus" }),
      button(t("bringOver"), () => importFromPictures(), "tonal", { iconName: "images" }),
      button(t("importFile"), () => importCardFile(), "text", { iconName: "upload" }),
    ),
  );
}

function openMenu() {
  dialog(
    (close) => {
      const item = (label, iconName, run) =>
        h(
          "button",
          {
            type: "button",
            class: "menu-item",
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
        item(t("order"), "sort", () => orderMenu()),
        item(t("menuShots"), "images", () => importFromPictures()),
        item(t("menuImport"), "upload", () => importCardFile()),
        item(t("menuBackup"), "download", () => backupCards()),
        item(t("menuArchived"), "archive", () => ctx.go("#/archived")),
        item(t("menuSettings"), "settings", () => ctx.go("#/settings")),
      );
    },
    { sheet: true, label: t("menu") },
  );
}

export function render() {
  const store = ctx.store;
  const day = today();
  const cards = orderedCards(store.cards, store.ui.order, store.ui.manual);
  const screen = h("div", { class: "screen wallet" });
  screen.appendChild(
    topBar({ title: t("appName"), large: true, actions: [button(t("menu"), openMenu, "icon", { iconName: "more" })] }),
  );
  if (!cards.length) {
    screen.appendChild(empty());
    return screen;
  }
  const results = h("div", { class: "results" });
  const draw = () => {
    results.textContent = "";
    const shown = cards.filter((c) => matches(c, query));
    if (!shown.length) {
      results.appendChild(h("p", { class: "no-match", role: "status", text: t("noMatch", { q: query.trim() }) }));
      return;
    }
    const favourites = shown.filter((c) => c.pinned);
    const rest = shown.filter((c) => !c.pinned);
    // A card moves only among all the cards, not among search results.
    const canDrag = !query.trim();
    if (favourites.length && !query) {
      results.appendChild(h("h2", { class: "section-title", text: t("favourites") }));
      results.appendChild(grid(favourites, day, canDrag));
      if (rest.length) results.appendChild(h("h2", { class: "section-title", text: t("otherCards") }));
      if (rest.length) results.appendChild(grid(rest, day, canDrag));
    } else results.appendChild(grid(shown, day, canDrag));
    requestAnimationFrame(() => fitNames(results));
  };
  const input = h("input", {
    type: "search",
    class: "search-input",
    placeholder: t("searchCards"),
    value: query,
    autocomplete: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    onInput: (e) => {
      query = e.target.value;
      clear.hidden = !query;
      draw();
    },
  });
  const clear = button(
    t("clearSearch"),
    () => {
      query = "";
      input.value = "";
      clear.hidden = true;
      draw();
      input.focus();
    },
    "icon",
    { iconName: "close", extraClass: "search-clear" },
  );
  clear.hidden = !query;
  // The field's name is the label's text, which screen readers read on the phone as in a browser.
  if (cards.length > 3)
    screen.appendChild(
      h(
        "label",
        { class: "search" },
        h("span", { class: "unseen", text: t("searchCards") }),
        icon("search"),
        input,
        clear,
      ),
    );
  // Until the user has held a card once, one line says what holding does.
  if (cards.length > 1 && !store.ui.held) screen.appendChild(h("p", { class: "hold-hint", text: t("holdHint") }));
  draw();
  screen.appendChild(results);
  screen.appendChild(
    h(
      "button",
      { type: "button", class: "fab", onClick: () => ctx.go("#/add") },
      icon("plus"),
      h("span", { class: "fab-label", text: t("addCard") }),
    ),
  );
  return screen;
}

export function mounted() {
  fitNames(document.getElementById("main"));
}

export function resized() {
  fitNames(document.getElementById("main"));
}
