// Getting cards in and out: the scanner, the "add this store" sheet with its typed number, reading cards from
// screenshots and photos, importing and backing up CSV files. Every call that needs a tap is made straight from one.

import { SWATCHES, cardColours, fitNames, storeTile } from "../faces.mjs";
import { FORMAT_NAMES, cleanNumber, detectFormat, numberProblem } from "../formats.mjs";
import { canPickPictures, canReadPictures, canScan, pickPictures, readCodes, shrink } from "../photos.mjs";
import { button, buzz, ctx, dialog, h, snack, t } from "../ui.mjs";
import { storePicker } from "./picker.mjs";

/** The words for a refusal from the phone, for the snackbar. */
export function problemText(error) {
  const code = error && error.code;
  if (code === "PERMISSION_DENIED" || code === "OS_DENIED") return t("permissionDenied");
  if (code === "QUOTA_EXCEEDED") return t("storageFull");
  if (code === "UNSUPPORTED") return ctx.store.live ? t("picturesUnavailable") : t("onPhoneOnly");
  return t("somethingWrong");
}

function permissionsAction(error) {
  const code = error && error.code;
  if ((code === "PERMISSION_DENIED" || code === "OS_DENIED") && ctx.zapli && ctx.zapli.ui) {
    return { label: t("openPermissions"), run: () => ctx.zapli.ui.openSettings().catch(() => {}) };
  }
  return undefined;
}

export function showProblem(error) {
  if (error && error.code === "CANCELLED") return;
  snack(problemText(error), permissionsAction(error));
}

/** The scanner sheet; resolves {value, format} or null when the user closed it. Call it straight from a tap. */
export async function scanCode() {
  if (!canScan()) {
    snack(t("scanUnavailable"));
    return null;
  }
  try {
    const code = await ctx.zapli.scan.barcode();
    return code && code.value ? { value: code.value, format: code.format || "auto" } : null;
  } catch (error) {
    if (!error || error.code !== "CANCELLED") showProblem(error);
    return null;
  }
}

/** The card with this store and number, when the wallet has it already. */
function existing(storeName, number) {
  return ctx.store.cards.find((c) => c.store === storeName && c.number === number) || null;
}

/**
 * Saves a new card and opens it. A card the wallet already has opens instead, with a word. `replace` shows the card
 * in the place of the screen that asked (after the scanner or a picker no tap is left to open a new screen).
 */
export async function saveNewCard({ brand, store: storeName, number, format, color, group }, { replace = true } = {}) {
  const name = (brand ? brand.name : storeName || "").trim();
  const value = cleanNumber(number);
  const known = existing(name, value);
  if (known) {
    snack(t("already", { store: name }));
    openSaved(known, replace);
    return known;
  }
  const kind = group || (brand ? brand.kind : "storefront");
  const values = {
    store: name,
    number: value,
    format: format || "auto",
    group: kind,
    brand: brand ? brand.id : undefined,
    color,
  };
  try {
    const record = await ctx.store.add(values);
    buzz("success");
    openSaved(record, replace);
    snack(t("cardAdded", { store: name }), {
      label: t("undo"),
      run: async () => {
        await ctx.store.remove(record.id);
        ctx.replace("#/");
      },
    });
    return record;
  } catch (error) {
    const issue = error && error.issues && error.issues[0] && error.issues[0].message;
    snack(t("notSaved", { reason: issue || error.message || t("somethingWrong") }));
    return null;
  }
}

function openSaved(card, replace) {
  const hash = "#/card/" + encodeURIComponent(card.id);
  if (replace) ctx.replace(hash);
  else ctx.go(hash);
}

/** What the typed number will be drawn as: the type, and whether the last digit checks out. */
function detectionLine(number) {
  const n = cleanNumber(number);
  if (!n) return "";
  const format = detectFormat(n);
  const name = format === "qr" ? t("qrCode") : FORMAT_NAMES[format];
  return ["ean13", "ean8", "upcA"].includes(format) ? t("digitOk", { format: name }) : t("drawnAs", { format: name });
}

/**
 * The sheet that finishes adding a card of `brand` (or an own card when it is null): the number typed, or scanned
 * again, or read from a picture. Opened when the scanner was closed without a code, or for an own card.
 */
export function storeSheet(brand, { number = "", format = "auto", name = "" } = {}) {
  let colour = null;
  let digitsOnly = !number || /^[0-9 ]*$/.test(number);
  const state = { number, format, name };
  return dialog(
    (close) => {
      const error = h("p", { class: "field-error", role: "alert" });
      const detected = h("p", { class: "field-hint detected", "aria-live": "polite" });
      const numberInput = h("input", {
        id: "sheet-number",
        class: "field-input number-input",
        value: number,
        inputmode: digitsOnly ? "numeric" : "text",
        autocomplete: "off",
        autocapitalize: "characters",
        spellcheck: "false",
        enterkeyhint: "done",
        "aria-describedby": "sheet-number-hint",
        onInput: (e) => {
          state.number = e.target.value;
          state.format = "auto";
          error.textContent = "";
          detected.textContent = detectionLine(state.number);
        },
        onKeydown: (e) => {
          if (e.key === "Enter") save();
        },
      });
      detected.textContent = detectionLine(number);
      // The phone's keyboard: digits for most cards, letters for the few whose number has them.
      const keyboardToggle = h("button", {
        type: "button",
        class: "btn text keyboard-toggle",
        text: digitsOnly ? "ABC" : "123",
        "aria-label": digitsOnly ? t("typeLetters") : t("typeDigits"),
        onClick: () => {
          digitsOnly = !digitsOnly;
          numberInput.setAttribute("inputmode", digitsOnly ? "numeric" : "text");
          keyboardToggle.textContent = digitsOnly ? "ABC" : "123";
          keyboardToggle.setAttribute("aria-label", digitsOnly ? t("typeLetters") : t("typeDigits"));
          numberInput.blur();
          numberInput.focus();
        },
      });
      const nameInput = brand
        ? null
        : h("input", {
            id: "sheet-name",
            class: "field-input",
            value: name,
            autocomplete: "off",
            autocapitalize: "words",
            spellcheck: "false",
            placeholder: t("ownNameHint"),
            onInput: (e) => {
              state.name = e.target.value;
              error.textContent = "";
              preview.replaceChildren(previewFace());
            },
          });
      const previewFace = () => {
        if (brand) return storeTile(brand);
        const tile = storeTile({ name: state.name.trim() || t("otherCard"), tone: "slate" });
        const colours = cardColours({ color: colour || undefined, group: "storefront" });
        tile.style.setProperty("--face-bg", colours.bg);
        tile.style.setProperty("--face-fg", colours.fg);
        return tile;
      };
      const preview = h("div", { class: "sheet-face" }, previewFace());
      const save = async () => {
        const value = cleanNumber(state.number);
        const storeName = brand ? brand.name : state.name.trim();
        if (!storeName) {
          error.textContent = t("nameMissing");
          if (nameInput) nameInput.focus();
          return;
        }
        const problem = numberProblem(value, state.format);
        if (problem) {
          error.textContent = t(problem);
          numberInput.focus();
          return;
        }
        close(true);
        await saveNewCard(
          { brand, store: storeName, number: value, format: state.format, color: colour || undefined },
          { replace: true },
        );
      };
      const fill = (code) => {
        if (!code) return;
        state.number = code.value;
        state.format = code.format;
        numberInput.value = code.value;
        detected.textContent = detectionLine(code.value);
        if (brand || state.name.trim()) save();
        else if (nameInput) nameInput.focus();
      };
      const swatches = brand
        ? null
        : h(
            "div",
            { class: "swatches", role: "radiogroup", "aria-label": t("colour") },
            SWATCHES.slice(0, 18).map((hex) =>
              h("button", {
                type: "button",
                class: "swatch",
                role: "radio",
                "aria-checked": "false",
                "aria-label": `${t("colour")} ${hex}`,
                style: { background: hex },
                onClick: (e) => {
                  colour = hex;
                  for (const s of e.currentTarget.parentElement.children)
                    s.setAttribute("aria-checked", s === e.currentTarget ? "true" : "false");
                  preview.replaceChildren(previewFace());
                },
              }),
            ),
          );
      const content = h(
        "div",
        { class: "store-sheet" },
        h(
          "div",
          { class: "sheet-head" },
          preview,
          h("h2", { class: "sheet-title", text: brand ? brand.name : t("otherCard") }),
          button(t("close"), () => close(false), "icon", { iconName: "close" }),
        ),
        nameInput ? h("label", { class: "field-label", for: "sheet-name", text: t("ownName") }) : null,
        nameInput,
        swatches,
        h("label", { class: "field-label", for: "sheet-number", text: t("numberLabel") }),
        h("div", { class: "input-row" }, numberInput, keyboardToggle),
        h("p", { class: "field-hint", id: "sheet-number-hint", text: t("numberHint") }),
        detected,
        error,
        h(
          "div",
          { class: "sheet-actions" },
          canScan() ? button(t("scanAgain"), async () => fill(await scanCode()), "tonal", { iconName: "scan" }) : null,
          canPickPictures() || !ctx.store.live
            ? button(t("fromPicture"), async () => fill(await codeFromOnePicture()), "tonal", { iconName: "image" })
            : null,
        ),
        button(t("addCard"), save, "filled", { extraClass: "wide" }),
      );
      requestAnimationFrame(() => {
        fitNames(content);
        (nameInput && !name ? nameInput : numberInput).focus();
      });
      return content;
    },
    { sheet: true, label: brand ? brand.name : t("otherCard") },
  );
}

/** The first barcode of one picture the user picks, or null (with a word when there is none). */
async function codeFromOnePicture() {
  let files;
  try {
    files = await pickPictures({ multiple: false });
  } catch (error) {
    showProblem(error);
    return null;
  }
  if (!files || !files.length) return null;
  try {
    const codes = await readCodes(files[0]);
    if (!codes.length) snack(t("noCodeInPicture"));
    return codes[0] || null;
  } catch (error) {
    showProblem(error);
    return null;
  }
}

/**
 * Cards from screenshots or photos (how people bring cards over from another wallet): pick up to 20 pictures, read
 * the barcode of each, then tap the store of each one under its picture. Call it straight from a tap.
 */
export async function importFromPictures() {
  if (ctx.store.live && !canPickPictures()) {
    snack(t("picturesUnavailable"));
    return;
  }
  let files;
  try {
    files = await pickPictures({ multiple: true });
  } catch (error) {
    showProblem(error);
    return;
  }
  if (!files || !files.length) return;
  if (!canReadPictures()) {
    snack(t("onPhoneOnly"));
    return;
  }
  snack(t("reading"));
  const queue = [];
  for (const file of files) {
    try {
      const codes = await readCodes(file);
      if (!codes.length) continue;
      const thumb = await shrink(file, { side: 900 }).catch(() => null);
      for (const code of codes.slice(0, 3)) queue.push({ ...code, thumb });
    } catch {
      // A picture that cannot be read is left out.
    }
  }
  if (!queue.length) {
    snack(t("noCodesInPictures"));
    return;
  }
  snack(t("foundIn", { n: queue.length }));
  let added = 0;
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (ctx.store.cards.some((c) => c.number === item.value)) continue;
    const choice = await assignDialog(item, i + 1, queue.length);
    if (choice === undefined) break;
    if (!choice) continue;
    const name = choice.brand ? choice.brand.name : choice.name;
    if (!name) continue;
    try {
      await ctx.store.add({
        store: name,
        number: cleanNumber(item.value),
        format: item.format,
        group: choice.brand ? choice.brand.kind : "storefront",
        brand: choice.brand ? choice.brand.id : undefined,
      });
      added++;
      buzz("light");
    } catch (error) {
      showProblem(error);
    }
  }
  snack(added ? t("queueDone", { n: added }) : t("queueNone"));
}

/** One picture of the queue: the picture and its code above the store list. Resolves {brand} or {name}, null to skip. */
function assignDialog(item, i, n) {
  return dialog(
    (close) => {
      const picker = storePicker({
        onPick: (brand, text) => {
          if (brand) close({ brand });
          else {
            const name = (text || "").trim();
            if (name) close({ name });
            else picker.focus();
          }
        },
      });
      const picture = item.thumb
        ? h("img", { class: "queue-picture", src: `data:${item.thumb.type};base64,${item.thumb.b64}`, alt: "" })
        : null;
      const formatName = item.format === "qr" ? t("qrCode") : FORMAT_NAMES[item.format] || "";
      const content = h(
        "div",
        { class: "queue" },
        h(
          "div",
          { class: "sheet-head" },
          h("h2", { class: "sheet-title", text: t("queueTitle", { i, n }) }),
          button(t("skip"), () => close(null), "text"),
          button(t("close"), () => close(undefined), "icon", { iconName: "close" }),
        ),
        picture,
        h("p", { class: "queue-code", text: t("scanned", { format: formatName, code: item.value }) }),
        h("p", { class: "field-hint", text: t("queueHint") }),
        picker.element,
      );
      requestAnimationFrame(() => picker.fit());
      return content;
    },
    { full: true, label: t("queueTitle", { i, n }) },
  );
}

/** Imports a CSV of cards (this app's backup, or a card list from another app). Call it straight from a tap. */
export async function importCardFile() {
  const store = ctx.store;
  if (!store.live) {
    snack(t("onPhoneOnly"));
    return;
  }
  try {
    await store.run("importCards");
  } catch (error) {
    showProblem(error);
    return;
  }
  let log = null;
  try {
    const page = await store.zapli.data.query("importLog", { sort: ["-at"], limit: 1 });
    log = page.items[0] || null;
  } catch {
    log = store.importLog;
  }
  if (!log || Date.now() - Date.parse(log.at) > 120000) return;
  dialog(
    (close) =>
      h(
        "div",
        { class: "ask" },
        h("h2", { class: "ask-title", text: t("importFinished") }),
        h("p", {
          class: "ask-body",
          text: t("importSummary", { added: log.added || 0, dup: log.duplicates || 0, skipped: log.skipped || 0 }),
        }),
        log.skipped && log.problems ? h("p", { class: "ask-body", text: t("rowsLeftOut") }) : null,
        log.skipped && log.problems ? h("pre", { class: "problems", text: log.problems }) : null,
        h(
          "div",
          { class: "ask-buttons" },
          button(t("done"), () => close(), "filled"),
        ),
      ),
    { label: t("importFinished") },
  );
}

/** Saves every card to a CSV file the user places. Call it straight from a tap. */
export async function backupCards() {
  if (!ctx.store.live) {
    snack(t("onPhoneOnly"));
    return;
  }
  try {
    await ctx.store.run("exportCards");
  } catch (error) {
    showProblem(error);
  }
}
