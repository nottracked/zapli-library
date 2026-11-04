// Adding a card: tap the store's tile and the scanner opens at once; the card is saved as soon as it reads the code.
// Closed without a code, the store's sheet offers the number to type or a picture to read. "Scan a card" works the
// other way round: scan first, then tap the store (#/add?code=…&format=…, so a rotation keeps the scanned code).

import { FORMAT_NAMES } from "../formats.mjs";
import { icon } from "../icons.mjs";
import { button, ctx, h, t, topBar } from "../ui.mjs";
import { storePicker } from "./picker.mjs";
import { importFromPictures, saveNewCard, scanCode, storeSheet } from "./transfer.mjs";

let picker = null;

/** A tile tapped: with a scanned code the card is saved; otherwise the scanner opens within this tap. */
async function picked(brand, text, scanned) {
  if (scanned) {
    if (brand) await saveNewCard({ brand, number: scanned.value, format: scanned.format });
    else storeSheet(null, { number: scanned.value, format: scanned.format, name: text });
    return;
  }
  if (!brand) {
    // An own card: the scanner first, then its name.
    const code = await scanCode();
    storeSheet(null, { number: code ? code.value : "", format: code ? code.format : "auto", name: text });
    return;
  }
  const code = await scanCode();
  if (code) await saveNewCard({ brand, number: code.value, format: code.format });
  else storeSheet(brand);
}

export function render(route) {
  const code = route.params.get("code");
  const scanned = code ? { value: code, format: route.params.get("format") || "auto" } : null;
  const screen = h("div", { class: "screen add" });
  screen.appendChild(
    topBar({
      title: scanned ? t("whichStore") : t("addTitle"),
      onBack: () => ctx.back(),
      backIcon: "close",
      backLabel: t("close"),
    }),
  );
  if (scanned) {
    const name = scanned.format === "qr" ? t("qrCode") : FORMAT_NAMES[scanned.format] || "";
    screen.appendChild(
      h(
        "p",
        { class: "scanned-banner", role: "status" },
        icon("check"),
        h("span", { text: t("scanned", { format: name, code: scanned.value }) }),
      ),
    );
  } else {
    screen.appendChild(
      h(
        "div",
        { class: "quick" },
        button(
          t("scanCard"),
          async () => {
            const result = await scanCode();
            if (result) {
              const query = new URLSearchParams({ code: result.value, format: result.format });
              ctx.replace("#/add?" + query.toString());
            }
          },
          "tonal",
          { iconName: "scan" },
        ),
        button(t("fromShots"), () => importFromPictures(), "tonal", { iconName: "images" }),
      ),
    );
  }
  picker = storePicker({ onPick: (brand, text) => picked(brand, text, scanned) });
  screen.appendChild(picker.element);
  return screen;
}

export function mounted() {
  if (picker) picker.fit();
}

export function resized() {
  if (picker) picker.fit();
}

/** The list keeps what was typed while the cards change underneath (a card saved from a picture). */
export const keep = true;
