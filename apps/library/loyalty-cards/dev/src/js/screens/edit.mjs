// Editing a card: its store, number and barcode type, the name on it, points, expiry with its reminder, a note, its
// colour and kind of shop.

import { brandColours } from "../brands.mjs";
import { SWATCHES, brandOf, cardColours, fitNames, storeTile } from "../faces.mjs";
import { FORMAT_IDS, FORMAT_NAMES, cleanNumber, detectFormat, numberProblem } from "../formats.mjs";
import { icon } from "../icons.mjs";
import { button, confirmDialog, ctx, dialog, dock, enterMovesOn, h, snack, t, topBar } from "../ui.mjs";
import { storeChooser } from "./chooser.mjs";
import { scanCode, showProblem } from "./transfer.mjs";

const KINDS = [
  "shopping_cart",
  "storefront",
  "shopping_bag",
  "medication",
  "spa",
  "directions_car",
  "handyman",
  "keyboard",
  "menu_book",
  "restaurant",
  "local_cafe",
  "flight",
  "fitness_center",
  "pets",
  "child_care",
  "book",
  "badge",
  "sell",
];

let form = null;

function field(id, label, input, hint) {
  return h(
    "div",
    { class: "field" },
    h("label", { class: "field-label", for: id, text: label }),
    input,
    hint ? h("p", { class: "field-hint", text: hint }) : null,
  );
}

function formatLabel(id) {
  if (id === "auto") return t("automatic");
  return id === "qr" ? t("qrCode") : FORMAT_NAMES[id];
}

/** The number from a points field written the phone's way ("1 240,5" or "1,240.5"). */
export function readPoints(text) {
  const s = String(text || "").replace(/[\s\u00a0]/g, "");
  if (!s) return null;
  const normal = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function render(route) {
  const store = ctx.store;
  const card = store.card(route.id);
  const screen = h("div", { class: "screen edit has-dock" });
  if (!card) {
    form = null;
    screen.appendChild(topBar({ title: t("editTitle"), onBack: () => ctx.back() }));
    return screen;
  }
  const draft = {
    store: card.store,
    brand: card.brand || null,
    number: card.number,
    format: card.format || "auto",
    holder: card.holder || "",
    points: card.points ?? "",
    expires: card.expires || "",
    remind: card.remind !== false,
    note: card.note || "",
    color: card.color || null,
    group: card.group || "storefront",
    pinned: Boolean(card.pinned),
  };
  const original = JSON.stringify(draft);
  form = { dirty: () => JSON.stringify(draft) !== original };

  const errors = h("p", { class: "field-error", role: "alert" });
  const preview = h("div", { class: "edit-face" });
  const paintPreview = () => {
    const shown = { ...card, ...draft, color: draft.color || undefined };
    const colours = cardColours(shown);
    const tile = storeTile({ name: draft.store || "…", tone: "slate" });
    tile.style.setProperty("--face-bg", colours.bg);
    tile.style.setProperty("--face-fg", colours.fg);
    preview.replaceChildren(tile);
    fitNames(preview);
  };

  const storeInput = h("input", {
    id: "edit-store",
    class: "field-input",
    value: draft.store,
    maxlength: "60",
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    onInput: (e) => {
      draft.store = e.target.value;
      const chosen = draft.brand && brandOf({ brand: draft.brand });
      if (chosen && chosen.name !== draft.store.trim()) draft.brand = null;
      paintPreview();
    },
  });
  const pickStore = () =>
    dialog(
      (close) => {
        const picker = storeChooser({
          query: draft.brand ? "" : draft.store,
          onStore: (brand) => close(brand),
          onOwn: (name) => close(name ? { name } : null),
        });
        requestAnimationFrame(() => picker.fit());
        return h(
          "div",
          { class: "queue" },
          h(
            "div",
            { class: "sheet-head" },
            h("h2", { class: "sheet-title", text: t("pickFromList") }),
            button(t("close"), () => close(), "icon", { iconName: "close" }),
          ),
          picker.element,
          picker.bar,
        );
      },
      { full: true, label: t("pickFromList") },
    ).then((picked) => {
      if (!picked) return;
      if (picked.id) {
        draft.store = picked.name;
        draft.brand = picked.id;
        draft.group = picked.kind;
        draft.color = null;
        kindSelect.value = draft.group;
        paintSwatches();
      } else draft.store = picked.name.trim();
      storeInput.value = draft.store;
      paintPreview();
    });

  const detected = h("p", { class: "field-hint detected", "aria-live": "polite" });
  const paintDetected = () => {
    const n = cleanNumber(draft.number);
    detected.textContent = draft.format === "auto" && n ? t("workedOut", { format: formatLabel(detectFormat(n)) }) : "";
  };
  const numberInput = h("input", {
    id: "edit-number",
    class: "field-input number-input",
    value: draft.number,
    inputmode: /^[0-9 ]*$/.test(draft.number) ? "numeric" : "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    onInput: (e) => {
      draft.number = e.target.value;
      paintDetected();
    },
  });
  const formatSelect = h(
    "select",
    {
      id: "edit-format",
      class: "field-input",
      onChange: (e) => {
        draft.format = e.target.value;
        paintDetected();
      },
    },
    FORMAT_IDS.map((id) =>
      h("option", { value: id, text: formatLabel(id), selected: id === draft.format ? "selected" : null }),
    ),
  );
  const scan = async () => {
    const code = await scanCode();
    if (!code) return;
    draft.number = code.value;
    draft.format = code.format;
    numberInput.value = code.value;
    formatSelect.value = code.format;
    paintDetected();
  };

  const holderInput = h("input", {
    id: "edit-holder",
    class: "field-input",
    value: draft.holder,
    maxlength: "60",
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    onInput: (e) => (draft.holder = e.target.value),
  });
  const pointsInput = h("input", {
    id: "edit-points",
    class: "field-input",
    value: draft.points === "" ? "" : String(draft.points),
    inputmode: "decimal",
    autocomplete: "off",
    onInput: (e) => (draft.points = e.target.value),
  });
  const remindRow = h(
    "label",
    { class: "switch-row" },
    h("input", {
      type: "checkbox",
      class: "switch",
      checked: draft.remind,
      onChange: (e) => (draft.remind = e.target.checked),
    }),
    h(
      "span",
      { class: "switch-text" },
      h("span", { text: t("remind") }),
      h("span", { class: "field-hint", text: t("remindHelp") }),
    ),
  );
  remindRow.hidden = !draft.expires;
  const dateInput = h("input", {
    id: "edit-expires",
    type: "date",
    class: "field-input",
    value: draft.expires,
    onInput: (e) => {
      draft.expires = e.target.value;
      remindRow.hidden = !draft.expires;
    },
  });
  const clearDate = button(
    t("clearDate"),
    () => {
      draft.expires = "";
      dateInput.value = "";
      remindRow.hidden = true;
    },
    "text",
  );
  const noteInput = h("textarea", {
    id: "edit-note",
    class: "field-input",
    rows: "3",
    maxlength: "500",
    placeholder: t("notePlaceholder"),
    onInput: (e) => (draft.note = e.target.value),
  });
  noteInput.value = draft.note;

  const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": t("colour") });
  const paintSwatches = () => {
    swatches.textContent = "";
    const brand = brandOf({ brand: draft.brand, store: draft.store });
    const auto = h(
      "button",
      {
        type: "button",
        class: "swatch auto",
        role: "radio",
        "aria-checked": draft.color ? "false" : "true",
        "aria-label": t("storeColour"),
        title: t("storeColour"),
        style: { background: brand ? brandColours(brand).bg : "transparent" },
        onClick: () => {
          draft.color = null;
          paintSwatches();
          paintPreview();
        },
      },
      icon("check"),
    );
    swatches.appendChild(auto);
    for (const hex of SWATCHES) {
      swatches.appendChild(
        h(
          "button",
          {
            type: "button",
            class: "swatch",
            role: "radio",
            "aria-checked": draft.color && draft.color.toLowerCase() === hex.toLowerCase() ? "true" : "false",
            "aria-label": `${t("colour")} ${hex}`,
            style: { background: hex },
            onClick: () => {
              draft.color = hex;
              paintSwatches();
              paintPreview();
            },
          },
          icon("check"),
        ),
      );
    }
  };
  const kindSelect = h(
    "select",
    {
      id: "edit-kind",
      class: "field-input",
      onChange: (e) => {
        draft.group = e.target.value;
        paintPreview();
      },
    },
    KINDS.map((k) => h("option", { value: k, text: t("kind_" + k), selected: k === draft.group ? "selected" : null })),
  );
  const favouriteRow = h(
    "label",
    { class: "switch-row" },
    h("input", {
      type: "checkbox",
      class: "switch",
      checked: draft.pinned,
      onChange: (e) => (draft.pinned = e.target.checked),
    }),
    h("span", { class: "switch-text" }, h("span", { text: t("favourites") })),
  );

  const save = async () => {
    errors.textContent = "";
    const name = draft.store.trim();
    if (!name) {
      errors.textContent = t("nameMissing");
      storeInput.focus();
      return;
    }
    const number = cleanNumber(draft.number);
    const problem = numberProblem(number, draft.format);
    if (problem) {
      errors.textContent = t(problem);
      numberInput.focus();
      return;
    }
    if (store.cards.some((c) => c.id !== card.id && c.store === name && c.number === number)) {
      errors.textContent = t("already", { store: name });
      return;
    }
    const points = readPoints(draft.points);
    if (Number.isNaN(points)) {
      errors.textContent = t("pointsInvalid");
      pointsInput.focus();
      return;
    }
    const patch = {
      store: name,
      number,
      format: draft.format,
      holder: draft.holder.trim() || null,
      points,
      expires: draft.expires || null,
      remind: draft.remind,
      note: draft.note.trim() || null,
      color: draft.color || null,
      group: draft.group,
      pinned: draft.pinned,
      brand: draft.brand || null,
    };
    try {
      await store.update(card.id, patch);
      form = null;
      snack(t("savedChanges"));
      ctx.back();
    } catch (error) {
      const issue = error && error.issues && error.issues[0] && error.issues[0].message;
      if (issue) errors.textContent = t("notSaved", { reason: issue });
      else showProblem(error);
    }
  };
  const leaveForm = async () => {
    if (form && form.dirty()) {
      const yes = await confirmDialog({ title: t("discardTitle"), yes: t("discard"), no: t("keepEditing") });
      if (!yes) return;
    }
    form = null;
    ctx.back();
  };

  screen.appendChild(
    topBar({
      title: t("editTitle"),
      onBack: leaveForm,
      backIcon: "close",
      backLabel: t("close"),
      actions: [button(t("save"), save, "text")],
    }),
  );
  const fields = h(
    "div",
    { class: "form" },
    preview,
    field(
      "edit-store",
      t("store"),
      h(
        "div",
        { class: "input-row" },
        storeInput,
        button(t("pickFromList"), pickStore, "icon", { iconName: "search" }),
      ),
    ),
    h(
      "div",
      { class: "field" },
      h("label", { class: "field-label", for: "edit-number", text: t("numberLabel") }),
      h("div", { class: "input-row" }, numberInput, button(t("scanAgain"), scan, "icon", { iconName: "scan" })),
      detected,
    ),
    field("edit-format", t("barcodeType"), formatSelect, t("formatHelp")),
    field("edit-holder", t("nameCard"), holderInput),
    field("edit-points", t("pointsBalance"), pointsInput),
    h(
      "div",
      { class: "field" },
      h("label", { class: "field-label", for: "edit-expires", text: t("validUntil") }),
      h("div", { class: "input-row" }, dateInput, clearDate),
      remindRow,
    ),
    field("edit-note", t("note"), noteInput),
    h("div", { class: "field" }, h("span", { class: "field-label", text: t("colour") }), swatches),
    field("edit-kind", t("kindShop"), kindSelect),
    favouriteRow,
    errors,
  );
  // Save stays above the keyboard; Enter on a field goes to the next one, and on the last one saves.
  enterMovesOn(fields, save);
  screen.append(fields, dock(button(t("save"), save, "filled", { extraClass: "dock-btn", iconName: "check" })));
  paintSwatches();
  paintPreview();
  paintDetected();
  return screen;
}

export function mounted() {
  fitNames(document.getElementById("main"));
}

/** The form keeps what is typed while the cards change underneath. */
export const keep = true;

export function leave() {
  form = null;
}
