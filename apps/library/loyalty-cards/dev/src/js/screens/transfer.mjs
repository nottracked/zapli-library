// Getting cards in and out: the scanner, saving a new card and landing on it, the sheet for a number typed by hand,
// cards read from screenshots and photos, importing and backing up CSV files. Every call that needs a tap is made
// straight from one.

import { fitNames, storeTile } from "../faces.mjs";
import { FORMAT_NAMES, checkDigitSlip, cleanNumber, detectFormat, lastDigits, numberProblem } from "../formats.mjs";
import { canPickPictures, canReadPictures, canScan, pickPictures, readCodes, shrink } from "../photos.mjs";
import { button, buzz, closeDialogs, ctx, dialog, h, snack, t } from "../ui.mjs";
import { storeChooser } from "./chooser.mjs";

/** The words for a refusal from the phone, for the snackbar. */
export function problemText(error) {
  const code = error && error.code;
  if (code === "PERMISSION_DENIED" || code === "OS_DENIED") return t("permissionDenied");
  if (code === "QUOTA_EXCEEDED") return t("storageFull");
  if (code === "UNSUPPORTED") return ctx.store.live ? t("picturesUnavailable") : t("onPhoneOnly");
  // The camera, the scanner, the picker, sharing and files open only from a tap on a button.
  if (code === "NEEDS_GESTURE") return t("needsTap");
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

/** The name a card without one gets: "Card 6785", the last digits telling it apart. */
export function defaultName(number) {
  return t("defaultName", { digits: lastDigits(cleanNumber(number)) });
}

/**
 * Shows a card just added: every sheet of the way there closed, the card's code at the till, and a word with Undo.
 * The card takes the place of the add screen, so Back goes to the wallet, never into the add flow again; added from
 * the wallet itself (screenshots, a file), it opens on top of it. Undo goes back down to the wallet's own entry, so
 * the next Back leaves the app.
 */
function land(card, message, undoIds) {
  closeDialogs();
  const hash = "#/card/" + encodeURIComponent(card.id);
  const here = location.hash.replace(/^#\/?/, "");
  if (here === "" || here === "/") ctx.go(hash);
  else ctx.replace(hash);
  snack(message, {
    label: t("undo"),
    run: async () => {
      for (const id of undoIds) await ctx.store.remove(id).catch(() => {});
      ctx.go("#/");
    },
  });
}

let saving = false;

/**
 * Saves a new card and lands on it. A card the wallet already has opens instead, with a word. While one save runs,
 * another tap saves nothing (no card twice).
 */
export async function saveNewCard({ brand, store: storeName, number, format, group }) {
  if (saving) return null;
  const value = cleanNumber(number);
  const name = (brand ? brand.name : storeName || "").trim() || defaultName(value);
  const known = ctx.store.cards.find((c) => c.store === name && c.number === value);
  if (known) {
    land(known, t("already", { store: name }), []);
    return known;
  }
  saving = true;
  try {
    const record = await ctx.store.add({
      store: name,
      number: value,
      format: format || "auto",
      group: group || (brand ? brand.kind : "storefront"),
      brand: brand ? brand.id : undefined,
    });
    buzz("success");
    land(record, brand || storeName ? t("cardAdded", { store: name }) : t("addedPlain"), [record.id]);
    return record;
  } catch (error) {
    const issue = error && error.issues && error.issues[0] && error.issues[0].message;
    snack(t("notSaved", { reason: issue || error.message || t("somethingWrong") }));
    return null;
  } finally {
    saving = false;
  }
}

/**
 * What the typed number will be drawn as: the type, and whether the last digit checks out. A number with the length
 * of an EAN or UPC whose last digit does not check out gets no line here: Add says what is wrong with it.
 */
function detectionLine(number) {
  const n = cleanNumber(number);
  if (!n || checkDigitSlip(n)) return "";
  const format = detectFormat(n);
  const name = format === "qr" ? t("qrCode") : FORMAT_NAMES[format];
  return ["ean13", "ean8", "upcA"].includes(format) ? t("digitOk", { format: name }) : t("drawnAs", { format: name });
}

/**
 * The sheet for a number typed by hand, when the scanner closed without a code or was not opened yet: for a store of
 * the list (`brand`), a card of the user's own (`name`), or neither (a name may be typed here, or left empty). The
 * number can be scanned or read from a picture from here too. Its Add button stays above the keyboard; Done on the
 * keyboard adds the card. A number with the length of an EAN-13, EAN-8 or UPC-A whose last digit does not check out
 * is not saved by Add: the sheet says so, and "Save the number as typed" keeps it as a plain Code 128.
 */
export function numberSheet(brand, { name = "" } = {}) {
  let digitsOnly = true;
  const state = { number: "", format: "auto", name };
  return dialog(
    (close) => {
      const error = h("p", { class: "field-error", role: "alert" });
      const detected = h("p", { class: "field-hint detected", "aria-live": "polite" });
      const asTyped = button(t("saveAsTyped"), () => save(null, { asTyped: true }), "tonal", {
        extraClass: "save-as-typed",
      });
      asTyped.hidden = true;
      const nameInput =
        brand || name
          ? null
          : h("input", {
              id: "sheet-name",
              class: "field-input",
              autocomplete: "off",
              autocapitalize: "words",
              spellcheck: "false",
              enterkeyhint: "next",
              placeholder: t("ownNameHint"),
              "aria-describedby": "sheet-name-hint",
              onInput: (e) => (state.name = e.target.value),
              onKeydown: (e) => {
                if (e.key === "Enter" && !e.isComposing) {
                  e.preventDefault();
                  numberInput.focus();
                }
              },
            });
      const numberInput = h("input", {
        id: "sheet-number",
        class: "field-input number-input",
        inputmode: "numeric",
        autocomplete: "off",
        autocapitalize: "characters",
        spellcheck: "false",
        enterkeyhint: "done",
        "aria-describedby": "sheet-number-hint",
        onInput: (e) => {
          state.number = e.target.value;
          state.format = "auto";
          error.textContent = "";
          asTyped.hidden = true;
          detected.textContent = detectionLine(state.number);
        },
        onKeydown: (e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            save();
          }
        },
      });
      // The phone's keyboard: digits for most cards, letters for the few whose number has them.
      const keyboardToggle = h("button", {
        type: "button",
        class: "btn text keyboard-toggle",
        text: "ABC",
        "aria-label": t("typeLetters"),
        onClick: () => {
          digitsOnly = !digitsOnly;
          numberInput.setAttribute("inputmode", digitsOnly ? "numeric" : "text");
          keyboardToggle.textContent = digitsOnly ? "ABC" : "123";
          keyboardToggle.setAttribute("aria-label", digitsOnly ? t("typeLetters") : t("typeDigits"));
          numberInput.blur();
          numberInput.focus();
        },
      });
      const save = async (code, { asTyped: keep = false } = {}) => {
        const value = cleanNumber(code ? code.value : state.number);
        let format = code ? code.format : state.format;
        const problem = numberProblem(value, format);
        if (problem) {
          error.textContent = t(problem);
          numberInput.focus();
          return;
        }
        // A scanner checks the digits itself; a typed number is checked here.
        const slip = !code && format === "auto" ? checkDigitSlip(value) : null;
        if (slip && !keep) {
          error.textContent = t(slip);
          asTyped.hidden = false;
          numberInput.focus();
          return;
        }
        if (slip) format = "code128";
        const own = (state.name || "").trim();
        await saveNewCard({ brand, store: brand ? brand.name : own, number: value, format });
      };
      const fromCode = (code) => {
        if (!code) return;
        numberInput.value = code.value;
        save(code);
      };
      const title = brand ? brand.name : name || t("otherCard");
      const content = h(
        "div",
        { class: "store-sheet" },
        h(
          "div",
          { class: "sheet-head" },
          h("div", { class: "sheet-face" }, storeTile(brand || { name: title, tone: "slate" })),
          h("h2", { class: "sheet-title", text: title }),
          button(t("close"), () => close(false), "icon", { iconName: "close" }),
        ),
        nameInput ? h("label", { class: "field-label", for: "sheet-name", text: t("ownName") }) : null,
        nameInput,
        nameInput ? h("p", { class: "field-hint", id: "sheet-name-hint", text: t("nameLater") }) : null,
        h("label", { class: "field-label", for: "sheet-number", text: t("numberLabel") }),
        h("div", { class: "input-row" }, numberInput, keyboardToggle),
        h("p", { class: "field-hint", id: "sheet-number-hint", text: t("numberHint") }),
        detected,
        error,
        asTyped,
        h(
          "div",
          { class: "sheet-actions" },
          canScan()
            ? button(t("scanAgain"), async () => fromCode(await scanCode()), "tonal", { iconName: "scan" })
            : null,
          canPickPictures() || !ctx.store.live
            ? button(t("fromPicture"), async () => fromCode(await codeFromOnePicture()), "tonal", { iconName: "image" })
            : null,
        ),
        h(
          "div",
          { class: "sheet-dock" },
          button(t("addCard"), () => save(), "filled", { extraClass: "dock-btn", iconName: "plus" }),
        ),
      );
      requestAnimationFrame(() => {
        fitNames(content);
        (nameInput || numberInput).focus();
      });
      return content;
    },
    { sheet: true, label: brand ? brand.name : name || t("otherCard") },
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
 * the barcode of each, then name each one under its picture, as after a scan. Lands on the first card added, with
 * Undo for all of them. Call it straight from a tap.
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
  const fresh = queue.filter((item) => !ctx.store.cards.some((c) => c.number === cleanNumber(item.value)));
  if (!fresh.length) {
    snack(queue.length ? t("allThere") : t("noCodesInPictures"));
    return;
  }
  const added = [];
  for (let i = 0; i < fresh.length; i++) {
    const item = fresh[i];
    const choice = await nameDialog(item, i + 1, fresh.length);
    if (choice === undefined) break;
    if (!choice) continue;
    const value = cleanNumber(item.value);
    const name = choice.brand ? choice.brand.name : choice.name || defaultName(value);
    try {
      added.push(
        await ctx.store.add({
          store: name,
          number: value,
          format: item.format,
          group: choice.brand ? choice.brand.kind : "storefront",
          brand: choice.brand ? choice.brand.id : undefined,
        }),
      );
      buzz("light");
    } catch (error) {
      showProblem(error);
    }
  }
  if (added.length)
    land(
      added[0],
      t("queueDone", { n: added.length }),
      added.map((c) => c.id),
    );
  else snack(t("queueNone"));
}

/** One picture of the queue: the picture and its code above the chooser. Resolves {brand} or {name}, null to skip. */
function nameDialog(item, i, n) {
  return dialog(
    (close) => {
      const chooser = storeChooser({
        code: { value: item.value, format: item.format },
        picture: item.thumb,
        noName: true,
        onStore: (brand) => close({ brand }),
        onOwn: (name) => close({ name: name.trim() }),
      });
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
        chooser.element,
        chooser.bar,
      );
      requestAnimationFrame(() => chooser.fit());
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
