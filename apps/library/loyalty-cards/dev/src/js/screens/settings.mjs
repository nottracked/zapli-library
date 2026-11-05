// Settings (#/settings): the order of the wallet, the store list's country, the language, vibration, the card file
// and the archived cards; and the archived cards themselves (#/archived).

import { COUNTRIES } from "../brands.mjs";
import { cardFace, fitNames } from "../faces.mjs";
import { button, ctx, h, t, topBar } from "../ui.mjs";
import { backupCards, importCardFile } from "./transfer.mjs";

function choice(id, label, options, value, onChange) {
  return h(
    "div",
    { class: "field" },
    h("label", { class: "field-label", for: id, text: label }),
    h(
      "select",
      { id, class: "field-input", onChange: (e) => onChange(e.target.value) },
      options.map(([v, text]) => h("option", { value: v, text, selected: v === value ? "selected" : null })),
    ),
  );
}

function settingsScreen() {
  const store = ctx.store;
  const ui = store.ui;
  const version = ctx.zapli && ctx.zapli.app ? null : "3.0.0";
  const about = h("p", { class: "field-hint", text: t("aboutBody", { v: version || "3" }) });
  if (ctx.zapli && ctx.zapli.app && ctx.zapli.app.info) {
    ctx.zapli.app
      .info()
      .then((info) => (about.textContent = t("aboutBody", { v: info.version })))
      .catch(() => {});
  }
  const archivedCount = store.cards.filter((c) => c.archived).length;
  return h(
    "div",
    { class: "screen settings" },
    topBar({ title: t("settings"), onBack: () => ctx.back() }),
    h(
      "div",
      { class: "form" },
      choice(
        "set-order",
        t("order"),
        [
          ["use", t("orderUse")],
          ["recent", t("orderRecent")],
          ["name", t("orderName")],
          ["mine", t("orderMine")],
        ],
        ui.order || "use",
        (v) => store.saveUi({ order: v }),
      ),
      choice(
        "set-country",
        t("storeList"),
        [["auto", t("storeListAuto")], ...COUNTRIES.map((c) => [c, t("country_" + c)])],
        ui.country || "auto",
        (v) => store.saveUi({ country: v }),
      ),
      choice(
        "set-language",
        t("language"),
        [
          ["auto", t("languageAuto")],
          ["en", "English"],
          ["sk", "Slovenčina"],
        ],
        ui.lang || "auto",
        (v) => store.saveUi({ lang: v }),
      ),
      h(
        "label",
        { class: "switch-row" },
        h("input", {
          type: "checkbox",
          class: "switch",
          checked: ui.vibrate !== false,
          onChange: (e) => store.saveUi({ vibrate: e.target.checked }),
        }),
        h("span", { class: "switch-text" }, h("span", { text: t("vibrate") })),
      ),
      h("h2", { class: "section-title", text: t("fileTitle") }),
      h("p", { class: "field-hint", text: t("fileBody") }),
      h(
        "div",
        { class: "button-row" },
        button(t("backupNow"), () => backupCards(), "tonal", { iconName: "download" }),
        button(t("importNow"), () => importCardFile(), "tonal", { iconName: "upload" }),
      ),
      h("h2", { class: "section-title", text: t("archivedCards") }),
      button(
        archivedCount ? `${t("archivedCards")} (${archivedCount})` : t("archivedCards"),
        () => ctx.go("#/archived"),
        "tonal",
        { iconName: "archive" },
      ),
      h("h2", { class: "section-title", text: t("about") }),
      about,
    ),
  );
}

function archivedScreen() {
  const cards = ctx.store.cards.filter((c) => c.archived).sort((a, b) => a.store.localeCompare(b.store));
  const screen = h(
    "div",
    { class: "screen archived" },
    topBar({ title: t("archivedCards"), onBack: () => ctx.back() }),
  );
  if (!cards.length) {
    screen.appendChild(
      h("div", { class: "empty" }, h("h2", { text: t("noArchived") }), h("p", { text: t("noArchivedBody") })),
    );
    return screen;
  }
  screen.appendChild(
    h(
      "div",
      { class: "faces" },
      cards.map((card) =>
        h(
          "button",
          {
            type: "button",
            class: "face-button",
            "aria-label": t("faceLabel", { store: card.store, digits: String(card.number).slice(-4) }),
            onClick: () => ctx.go("#/card/" + encodeURIComponent(card.id)),
          },
          cardFace(card),
        ),
      ),
    ),
  );
  return screen;
}

export function render(route) {
  return route.name === "archived" ? archivedScreen() : settingsScreen();
}

export function mounted() {
  fitNames(document.getElementById("main"));
}
