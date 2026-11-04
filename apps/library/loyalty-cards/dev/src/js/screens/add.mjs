// Adding a card, on one screen whichever way it starts:
// - nothing scanned yet (#/add): tap the store's tile and the scanner opens at once; or type a name of your own and
//   add it (the scanner opens then); or scan first from the bar at the bottom;
// - after a scan (#/add?code=…&format=…, so a rotation keeps the code): the code that was read, one field that finds
//   the store or names the card, the store tiles, "Add ‘…’ as a new card" and "Save without a name".
// A scanner closed without a code leads to the sheet for typing the number. The phone opens the scanner only from a
// tap, so Done on the keyboard opens that sheet instead, whose own button scans. Every way ends on the new card.

import { icon } from "../icons.mjs";
import { ctx, h, t, topBar } from "../ui.mjs";
import { storeChooser } from "./chooser.mjs";
import { importFromPictures, numberSheet, saveNewCard, scanCode } from "./transfer.mjs";

let chooser = null;

export function render(route) {
  const code = route.params.get("code");
  const scanned = code ? { value: code, format: route.params.get("format") || "auto" } : null;
  const query = route.params.get("q") || "";
  const screen = h("div", { class: "screen add has-dock" });
  screen.appendChild(
    topBar({
      title: scanned ? t("newTitle") : t("addTitle"),
      onBack: () => ctx.back(),
      backIcon: "close",
      backLabel: t("close"),
    }),
  );
  if (!scanned) {
    screen.appendChild(
      h(
        "div",
        { class: "quick-row" },
        h(
          "button",
          { type: "button", class: "btn tonal", onClick: () => importFromPictures() },
          icon("images"),
          h("span", { class: "btn-label", text: t("fromShots") }),
        ),
      ),
    );
  }
  // The text typed stays in the address (without a new history entry), so a rotation keeps it.
  const remember = (q) => {
    const params = new URLSearchParams(route.params);
    if (q) params.set("q", q);
    else params.delete("q");
    const rest = params.toString();
    ctx.replace("#/add" + (rest ? "?" + rest : ""), { quiet: true });
  };
  chooser = storeChooser({
    code: scanned,
    query,
    noName: true,
    onQuery: remember,
    onStore: async (brand) => {
      if (scanned) return saveNewCard({ brand, number: scanned.value, format: scanned.format });
      const read = await scanCode();
      if (read) await saveNewCard({ brand, number: read.value, format: read.format });
      else numberSheet(brand);
    },
    onOwn: async (name) => {
      if (scanned) return saveNewCard({ store: name, number: scanned.value, format: scanned.format });
      const read = await scanCode();
      if (read) await saveNewCard({ store: name, number: read.value, format: read.format });
      else numberSheet(null, { name });
    },
    onScan: scanned
      ? null
      : async () => {
          const read = await scanCode();
          if (read) ctx.replace("#/add?" + new URLSearchParams({ code: read.value, format: read.format }));
          else numberSheet(null);
        },
    // Done on the keyboard: after a scan it saves like the bar's button; before one it needs no tap.
    onDone: scanned
      ? null
      : ({ brand, name }) => {
          if (brand) numberSheet(brand);
          else if (name) numberSheet(null, { name });
          else document.activeElement.blur();
        },
  });
  screen.appendChild(chooser.element);
  screen.appendChild(chooser.bar);
  return screen;
}

export function mounted() {
  if (chooser) chooser.fit();
}

export function resized() {
  if (chooser) chooser.fit();
}

/** The screen keeps what was typed while the cards change underneath. */
export const keep = true;

export function leave() {
  chooser = null;
}
