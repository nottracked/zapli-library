// The wallet: the cards as faces, favourites first, then by use (or as the user orders them); search; Add.

import { fold } from "../brands.mjs";
import { cardFace, fitNames } from "../faces.mjs";
import { icon } from "../icons.mjs";
import { button, ctx, dialog, h, t, topBar } from "../ui.mjs";
import { backupCards, importCardFile, importFromPictures } from "./transfer.mjs";

let query = "";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The active cards in the wallet's order: favourites first, then by the user's order (most used by default). */
export function orderedCards(cards, order = "use") {
  const time = (c) => (c.lastUsed ? Date.parse(c.lastUsed) || 0 : 0);
  const byName = (a, b) => fold(a.store).localeCompare(fold(b.store));
  const compare =
    {
      use: (a, b) => (b.uses || 0) - (a.uses || 0) || time(b) - time(a) || byName(a, b),
      recent: (a, b) => time(b) - time(a) || (b.uses || 0) - (a.uses || 0) || byName(a, b),
      name: byName,
    }[order] || ((a, b) => (b.uses || 0) - (a.uses || 0) || byName(a, b));
  return cards.filter((c) => !c.archived).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || compare(a, b));
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

function faceButton(card, day) {
  const store = ctx.store;
  const face = cardFace(card, { today: day });
  const btn = h(
    "button",
    {
      type: "button",
      class: "face-button",
      "data-id": card.id,
      "aria-label": t("faceLabel", { store: card.store, digits: String(card.number).slice(-4) }),
      onClick: () => openCard(card),
    },
    face,
  );
  if (store.hasPhoto("face", card.id)) {
    store.photo("face", card.id).then((photo) => {
      if (!photo || !btn.isConnected) return;
      btn.replaceChildren(cardFace(card, { today: day, photo }));
      fitNames(btn);
    });
  }
  return btn;
}

function grid(cards, day) {
  return h(
    "div",
    { class: "faces" },
    cards.map((c) => faceButton(c, day)),
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
  const cards = orderedCards(store.cards, store.ui.order);
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
    if (favourites.length && !query) {
      results.appendChild(h("h2", { class: "section-title", text: t("favourites") }));
      results.appendChild(grid(favourites, day));
      if (rest.length) results.appendChild(h("h2", { class: "section-title", text: t("otherCards") }));
      results.appendChild(grid(rest, day));
    } else results.appendChild(grid(shown, day));
    requestAnimationFrame(() => fitNames(results));
  };
  const input = h("input", {
    type: "search",
    class: "search-input",
    placeholder: t("searchCards"),
    "aria-label": t("searchCards"),
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
  if (cards.length > 3) screen.appendChild(h("label", { class: "search" }, icon("search"), input, clear));
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
