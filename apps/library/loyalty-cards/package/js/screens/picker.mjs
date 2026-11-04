// The store list: a search field, the popular stores of the user's country as card-shaped tiles, every store A to Z,
// and "Other card" for anything else. Picking a tile calls back within the tap, so the scanner can open at once.

import { COUNTRIES, allStores, popular, search } from "../brands.mjs";
import { fitNames, storeTile } from "../faces.mjs";
import { icon } from "../icons.mjs";
import { button, ctx, h, t } from "../ui.mjs";

const POPULAR_COUNT = 24;

/**
 * The store list. `onPick(brand)` gets the store tapped, or null with the typed text for "Other card".
 * Returns {element, focus()}.
 */
export function storePicker({ onPick, query = "" }) {
  let text = query;
  let country = ctx.country;
  let showAll = false;
  const list = h("div", { class: "picker-list" });

  const tile = (brand) =>
    h(
      "button",
      {
        type: "button",
        class: "tile",
        "data-brand": brand.id,
        "aria-label": brand.name,
        onClick: () => onPick(brand, text),
      },
      storeTile(brand),
    );
  const otherTile = () =>
    h(
      "button",
      { type: "button", class: "tile other", onClick: () => onPick(null, text) },
      h(
        "span",
        { class: "tile-face other-face" },
        icon("plus"),
        h("span", { class: "tile-name", text: t("otherCard") }),
      ),
    );
  const tiles = (brands, withOther) => h("div", { class: "tiles" }, brands.map(tile), withOther ? otherTile() : null);

  const draw = () => {
    list.textContent = "";
    const q = text.trim();
    if (q) {
      const found = search(q, country);
      if (found.length) list.appendChild(tiles(found.slice(0, 40), false));
      else list.appendChild(h("p", { class: "no-match", role: "status", text: t("noStore", { q }) }));
      list.appendChild(
        h(
          "button",
          { type: "button", class: "own-row", onClick: () => onPick(null, text) },
          h("span", { class: "own-icon" }, icon("plus")),
          h("span", { class: "own-text", text: t("addOwn", { q }) }),
          icon("chevron"),
        ),
      );
    } else {
      const chips = h(
        "div",
        { class: "chips", role: "radiogroup", "aria-label": t("storeListOf") },
        COUNTRIES.map((c) =>
          h("button", {
            type: "button",
            class: "chip" + (c === country ? " on" : ""),
            role: "radio",
            "aria-checked": c === country ? "true" : "false",
            text: t("country_" + c),
            onClick: () => {
              country = c;
              showAll = false;
              draw();
            },
          }),
        ),
      );
      list.appendChild(chips);
      list.appendChild(h("h2", { class: "section-title", text: t("popular") }));
      list.appendChild(tiles(popular(country).slice(0, POPULAR_COUNT), true));
      const { here, elsewhere } = allStores(country);
      if (!showAll) {
        list.appendChild(
          button(
            t("showAllStores", { n: here.length }),
            () => {
              showAll = true;
              draw();
            },
            "tonal",
            { iconName: "chevronDown", extraClass: "show-all" },
          ),
        );
      } else {
        list.appendChild(h("h2", { class: "section-title", text: t("allStores") }));
        list.appendChild(tiles(here, false));
        list.appendChild(h("h2", { class: "section-title", text: t("elsewhere") }));
        list.appendChild(tiles(elsewhere, false));
      }
    }
    requestAnimationFrame(() => fitNames(list));
  };

  const input = h("input", {
    type: "search",
    class: "search-input",
    placeholder: t("searchStores"),
    "aria-label": t("searchStores"),
    value: text,
    autocomplete: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    onInput: (e) => {
      text = e.target.value;
      clear.hidden = !text;
      draw();
    },
  });
  const clear = button(
    t("clearSearch"),
    () => {
      text = "";
      input.value = "";
      clear.hidden = true;
      draw();
      input.focus();
    },
    "icon",
    { iconName: "close", extraClass: "search-clear" },
  );
  clear.hidden = !text;
  draw();
  const element = h("div", { class: "picker" }, h("label", { class: "search" }, icon("search"), input, clear), list);
  return { element, focus: () => input.focus(), fit: () => fitNames(list) };
}
