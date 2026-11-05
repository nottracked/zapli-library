// Choosing what a card is: one field, "Shop or card name", that searches the store list and names a card of the
// user's own, the store tiles under it (popular ones first), and the user's own card as a tile of its own. The main
// button sits in a bar that stays above the keyboard. Used to add a card (before or after a scan), for each picture of
// a screenshot import, and to change a card's store.

import { allStores, brandColours, fold, popular, search } from "../brands.mjs";
import { cardColours, fitLine, fitNames, storeTile } from "../faces.mjs";
import { FORMAT_NAMES, groupedNumber } from "../formats.mjs";
import { encode, toSvg } from "../barcode/index.mjs";
import { icon, kindIcon } from "../icons.mjs";
import { ctx, dock, h, t } from "../ui.mjs";

const POPULAR_COUNT = 12;
const FOUND_COUNT = 23;

/** The store whose name (or another name) is exactly what was typed. */
function exactStore(found, typed) {
  const key = fold(typed).replace(/ /g, "");
  return found.find((b) => [b.name, ...b.aliases].some((n) => fold(n).replace(/ /g, "") === key)) || null;
}

/** The code that was read, so the scan visibly worked: the bars, the number, a check, and the name as it is typed. */
function scannedCard(code, name, brand) {
  const colours = brand
    ? brandColours(brand)
    : name
      ? cardColours({ group: "storefront" })
      : { bg: "#46525F", fg: "#FFFFFF" };
  const card = h(
    "section",
    { class: "scan-card", style: `--face-bg:${colours.bg};--face-fg:${colours.fg}`, "aria-label": t("scannedMark") },
    h(
      "div",
      { class: "scan-band" },
      h("span", { class: "band-kind" }, kindIcon(brand ? brand.kind : "storefront")),
      h("span", {
        class: "scan-name" + (name ? "" : " placeholder"),
        text: brand ? brand.name : name || t("newTitle"),
      }),
      h("span", { class: "scan-ok" }, icon("check"), h("span", { text: t("scannedMark") })),
    ),
    h(
      "div",
      { class: "scan-code" },
      h("div", { class: "scan-bars" }),
      h("p", { class: "scan-number", text: groupedNumber(code.value) }),
    ),
  );
  const drawn = encode(code.value, code.format);
  const bars = card.querySelector(".scan-bars");
  if (drawn.ok && !drawn.symbol.linear) bars.classList.add("square");
  if (drawn.ok)
    bars.innerHTML = toSvg(drawn.symbol, code.format, { label: `${FORMAT_NAMES[code.format] || ""} ${code.value}` });
  return card;
}

/**
 * The chooser. `code` is the scanned code ({value, format}) or null; `picture` a picture to show above (a screenshot
 * being imported). Callbacks: `onStore(brand)`, `onOwn(name)` (the typed name; "" for a card without a name, offered
 * only with `noName`), `onScan()` (the bar's button before a scan; leave it out where there is nothing to scan),
 * `onQuery(text)` as the text changes. Done on the keyboard does what the bar's button does, or, with `onDone`,
 * calls `onDone({brand, name})` with the store typed in full or the name typed: a key press is no tap, so where the
 * button would open the scanner, `onDone` must do something that needs none. Returns {element, bar, focus(), fit()}:
 * put `bar` on the screen as well.
 */
export function storeChooser({
  code = null,
  picture = null,
  query = "",
  noName = false,
  onStore,
  onOwn,
  onScan,
  onQuery,
  onDone,
  ownHint,
}) {
  let text = query;
  let showAll = false;
  let exact = null;
  const results = h("div", { class: "results" });
  const bar = dock();
  const codeHost = h("div");
  const top = h("div", { class: "chooser-top" }, codeHost);

  const tile = (brand) =>
    h(
      "button",
      {
        type: "button",
        class: "tile",
        "data-brand": brand.id,
        "aria-label": brand.name,
        onClick: () => onStore(brand),
      },
      storeTile(brand),
    );
  const ownTile = (name, alone) =>
    h(
      "button",
      { type: "button", class: "tile own", "aria-label": t("addNew", { q: name }), onClick: () => onOwn(name) },
      h(
        "span",
        { class: "tile-face own-face" + (alone ? " alone" : "") },
        h("span", { class: "tile-name", text: name }),
        h("span", { class: "own-badge" }, icon("plus"), h("span", { text: t("newTitle") })),
      ),
    );
  const grid = (brands, own) =>
    h("div", { class: "tiles" + (own && !brands.length ? " only-own" : "") }, brands.map(tile), own);
  const mainButton = (label, run, kind, iconName) =>
    h(
      "button",
      { type: "button", class: `btn ${kind} dock-btn`, onClick: run },
      icon(iconName),
      h("span", { class: "btn-label", text: label }),
    );

  const draw = () => {
    const typed = text.trim();
    const found = typed ? search(typed, ctx.country) : popular(ctx.country);
    exact = typed ? exactStore(found, typed) : null;
    results.textContent = "";
    if (typed) {
      if (!found.length) results.appendChild(h("p", { class: "not-found", text: t("notInList", { q: typed }) }));
      else results.appendChild(h("h2", { class: "section-title", text: t("storesTitle") }));
      results.appendChild(grid(found.slice(0, FOUND_COUNT), exact ? null : ownTile(typed, !found.length)));
    } else {
      results.appendChild(h("h2", { class: "section-title", text: code || picture ? t("popular") : t("orPick") }));
      results.appendChild(grid(found.slice(0, POPULAR_COUNT), null));
      if (!code && !picture && onScan)
        results.appendChild(h("p", { class: "field-hint tile-hint", text: t("tileHint") }));
      const { here, elsewhere } = allStores(ctx.country);
      if (!showAll) {
        results.appendChild(
          h(
            "button",
            {
              type: "button",
              class: "btn tonal show-all",
              onClick: () => {
                showAll = true;
                draw();
              },
            },
            icon("chevronDown"),
            h("span", { class: "btn-label", text: t("showAllStores", { n: here.length }) }),
          ),
        );
      } else {
        results.appendChild(h("h2", { class: "section-title", text: t("allStores") }));
        results.appendChild(grid(here, null));
        results.appendChild(h("h2", { class: "section-title", text: t("elsewhere") }));
        results.appendChild(grid(elsewhere, null));
      }
    }
    // The bar: the store typed in full; the user's own card when a name is typed; a card without a name after a
    // scan; else the scanner.
    let main = null;
    if (exact) main = mainButton(t("addStoreCard", { store: exact.name }), () => onStore(exact), "filled", "plus");
    else if (typed)
      main = mainButton(
        found.length ? t("addNewShort", { q: typed }) : t("addNew", { q: typed }),
        () => onOwn(typed),
        found.length ? "tonal" : "filled",
        "plus",
      );
    else if (code && noName) main = mainButton(t("noName"), () => onOwn(""), "tonal", "check");
    else if (onScan) main = mainButton(t("scanCard"), onScan, "filled", "scan");
    bar.replaceChildren(...(main ? [main] : []));
    bar.hidden = !main;
    if (code) codeHost.replaceChildren(scannedCard(code, typed, exact));
    requestAnimationFrame(() => {
      fitNames(results);
      const number = codeHost.querySelector(".scan-number");
      if (number) fitLine(number);
    });
  };

  const input = h("input", {
    id: "chooser-name",
    class: "big-input",
    value: text,
    placeholder: t("namePlaceholder"),
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    enterkeyhint: "done",
    "aria-describedby": ownHint ? "chooser-hint" : null,
    onInput: (e) => setText(e.target.value),
    onKeydown: (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      if (onDone) return onDone({ brand: exact, name: exact ? "" : text.trim() });
      const main = bar.querySelector("button");
      if (main) main.click();
    },
  });
  const clear = h(
    "button",
    {
      type: "button",
      class: "btn icon field-clear",
      "aria-label": t("clearSearch"),
      hidden: !text,
      onClick: () => (setText(""), input.focus()),
    },
    icon("close"),
  );
  const setText = (value) => {
    text = value;
    if (input.value !== value) input.value = value;
    clear.hidden = !value;
    if (onQuery) onQuery(value);
    draw();
  };
  if (picture)
    top.appendChild(h("img", { class: "queue-picture", src: `data:${picture.type};base64,${picture.b64}`, alt: "" }));
  const element = h(
    "div",
    { class: "chooser" },
    top,
    h(
      "div",
      { class: "name-block" },
      h("label", { class: "name-label", for: "chooser-name", text: t("nameField") }),
      h("div", { class: "big-field" }, icon("search"), input, clear),
      ownHint ? h("p", { class: "field-hint", id: "chooser-hint", text: ownHint }) : null,
    ),
    results,
  );
  draw();
  return { element, bar, focus: () => input.focus(), fit: () => fitNames(element) };
}
