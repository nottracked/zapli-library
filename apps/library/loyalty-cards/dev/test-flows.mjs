// Development only (not shipped): every way of adding a card, holding, dragging and moving cards, Back after the page
// was loaded again (a rotation), the code full screen, and the texts large text and screen readers need, run in a
// headless Chromium on the built index.html with a stand-in bridge (dev/harness.mjs, dev/fake-zapli.js).
//
//   node dev/test-flows.mjs
//
// Each way of adding a card must end the same: one card saved, the page on that card, no sheet left open, the add
// flow out of the history (Back goes to the wallet), and a word with Undo. Back is checked as the phone gives it: an
// open dialog closes first, then the page's history, then the app is left.
import { sleep, startBrowser } from "./harness.mjs";

let failures = 0;
let checks = 0;
const check = (ok, what) => {
  checks++;
  if (!ok) {
    failures++;
    console.log("FAIL", what);
  }
};

const browser = await startBrowser();
const state = (p) =>
  p.eval(`({
    hash: location.hash,
    stack: history.state && history.state.stack,
    cards: window.__records.card.map((c) => ({ id: c.id, store: c.store, brand: c.brand, number: c.number, format: c.format, group: c.group, pinned: c.pinned })),
    calls: window.__calls.map((c) => c[0] + (c[1] && typeof c[1] === "string" ? ":" + c[1] : "")),
    runs: window.__calls.filter((c) => c[0] === "runAction").map((c) => c[1] + JSON.stringify(c[2])),
    snack: document.getElementById("snackbar").textContent,
    undo: Boolean(document.querySelector("#snackbar .snack-action")),
    dialog: Boolean(document.querySelector("dialog[open]")),
    title: (document.querySelector(".topbar-title") || {}).textContent,
  })`);
const type = (p, selector, text) =>
  p.eval(
    `(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
const enter = (p, selector) =>
  p.eval(
    `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
  );
const scanAnswer = (p, value, format) =>
  p.eval(`window.__scanAnswer = ${value ? JSON.stringify({ value, format }) : "null"}`);

// The phone's Back as Zapli gives it: first the top modal dialog closes (the same script the host runs), else one
// step back in the page's history, else the app is left. Returns "dialog", "history" or "leaves".
const CLOSE_DIALOG =
  "(function(){var d=document.querySelectorAll('dialog[open]');" +
  "for(var i=d.length-1;i>=0;i--){var x=d[i];if(!x.matches(':modal'))continue;" +
  "if(x.dispatchEvent(new Event('cancel',{cancelable:true})))x.close();return !x.open;}" +
  "return false;})()";
async function systemBack(p) {
  if (await p.eval(CLOSE_DIALOG)) {
    await sleep(300);
    return "dialog";
  }
  if (!(await insideBehind(p))) return "leaves";
  await p.eval("history.back()");
  await sleep(400);
  return "history";
}
/** Whether the history entry before this one belongs to this same page (one load of the app), not to what was before. */
async function insideBehind(p) {
  const { currentIndex, entries } = await p.navigation();
  const doc = (url) => url.split("#")[0];
  return currentIndex > 0 && doc(entries[currentIndex - 1].url) === doc(entries[currentIndex].url);
}
/** A tap with the mouse in the middle of an element, as a finger lands on it. */
async function tap(p, selector) {
  const at = await p.center(selector);
  if (!at) throw new Error("No element " + selector);
  await p.mouse("mousePressed", at.x, at.y);
  await p.mouse("mouseReleased", at.x, at.y);
  await sleep(450);
}
/** The snackbar shows on top of everything, a modal sheet included: a tap on it reaches it. */
const snackOnTop = (p) =>
  p.eval(`(() => {
    const bar = document.getElementById("snackbar");
    if (!bar.classList.contains("on")) return false;
    const r = bar.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 12, r.top + r.height / 2);
    return Boolean(hit && bar.contains(hit));
  })()`);
/** The name field's example, written into the field in the example's weight: whether it fits without scrolling. */
const PLACEHOLDER_FITS = `(() => {
  const input = document.querySelector("#chooser-name");
  input.style.fontWeight = "400";
  input.value = input.placeholder;
  const fits = { need: input.scrollWidth, room: input.clientWidth };
  input.value = "";
  input.style.fontWeight = "";
  return fits;
})()`;
/** The accessibility tree's view of an element: its role, name and pressed state. */
async function axNode(p, selector) {
  const { root } = await p.cdp("DOM.getDocument", { depth: 0 });
  const { nodeId } = await p.cdp("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { nodes } = await p.cdp("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
  const node = nodes[0] || {};
  const pressed = (node.properties || []).find((x) => x.name === "pressed");
  return {
    role: node.role && node.role.value,
    name: node.name && node.name.value,
    pressed: pressed && pressed.value.value,
  };
}

/** One card added, the page on it, nothing open, the add flow gone from Back, and Undo on offer. */
async function landed(p, expect, what) {
  await sleep(500);
  const s = await state(p);
  const card = s.cards.find((c) => c.number === expect.number);
  check(s.cards.length === (expect.count || 1), `${what}: ${expect.count || 1} card(s) saved, got ${s.cards.length}`);
  check(card && card.store === expect.store, `${what}: saved as ${expect.store}: ${JSON.stringify(card)}`);
  if (expect.brand !== undefined) check(card && card.brand === expect.brand, `${what}: list id ${expect.brand}`);
  if (expect.format) check(card && card.format === expect.format, `${what}: type ${expect.format}`);
  check(card && s.hash === "#/card/" + card.id, `${what}: lands on the card: ${s.hash}`);
  check(
    card && JSON.stringify(s.stack) === JSON.stringify(["#/", "#/card/" + card.id]),
    `${what}: Back goes to the wallet: ${JSON.stringify(s.stack)}`,
  );
  check(!s.dialog, `${what}: no sheet left open`);
  check(s.undo, `${what}: a word with Undo: ${s.snack}`);
  return { s, card };
}

async function flow(name, run, options = {}) {
  const p = await browser.page({ seed: [], ...options });
  try {
    await run(p);
  } catch (error) {
    failures++;
    console.log("FAIL", name, error.message);
  }
  if (p.errors.length) {
    failures++;
    console.log("FAIL", name, "page errors:", p.errors.join(" | "));
  }
  await p.close();
  console.log("done:", name);
}

const startAdd = async (p) => {
  await p.open("#/");
  await p.click(".empty-actions .btn.filled");
};

// 1. Store first: + → the store's tile → the scanner reads → saved and shown. 2 taps.
await flow("store first", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "2994400123453", "ean13");
  await p.click('.tile[data-brand="tesco"]');
  const { s } = await landed(
    p,
    { store: "Tesco", brand: "tesco", number: "2994400123453", format: "ean13" },
    "store first",
  );
  check(s.calls.filter((c) => c === "scan").length === 1, "the scanner opened once");
  check(s.calls.includes("haptic:success"), "a short buzz");
  check(s.runs.includes('screenOn{"on":true}'), "the code shows at full brightness");
  await p.eval("history.back()");
  await sleep(300);
  const back = await state(p);
  check(back.hash === "#/" || back.hash === "", "Back: the wallet");
  check(back.runs.includes('screenOn{"on":false}'), "leaving the code ends the brightness");
});

// 2. Scan first, then the store's tile. 3 taps.
await flow("scan first, store tile", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "DM-QR-55120", "qr");
  await p.click(".dock .btn");
  const s = await state(p);
  check(s.hash.startsWith("#/add?code=DM-QR-55120"), "the code waits in the address: " + s.hash);
  check(s.title === "New card", "the screen names the new card: " + s.title);
  check(await p.eval(`Boolean(document.querySelector(".scan-ok"))`), "the scan is shown as done");
  await p.click('.tile[data-brand="boots"]');
  const after = await landed(
    p,
    { store: "Boots", brand: "boots", number: "DM-QR-55120", format: "qr" },
    "scan first, tile",
  );
  check(after.s.calls.filter((c) => c === "scan").length === 1, "one scan only");
});

// 3. Scan first, then a name of your own and Done on the keyboard.
await flow("scan first, own name", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "SWIM-000731", "code128");
  await p.click(".dock .btn");
  await type(p, "#chooser-name", "City pool");
  const band = await p.eval(`document.querySelector(".scan-name").textContent`);
  check(band === "City pool", "the card shows the name as it is typed: " + band);
  const tiles = await p.eval(`[...document.querySelectorAll(".tile")].map((t) => t.className)`);
  check(tiles.length === 1 && tiles[0].includes("own"), "nothing in the list: only the own card: " + tiles);
  await enter(p, "#chooser-name");
  const { card } = await landed(
    p,
    { store: "City pool", number: "SWIM-000731", format: "code128" },
    "scan first, own name",
  );
  check(card && !card.brand, "an own card has no list id");
});

// 4. Scan first, no name.
await flow("scan first, no name", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "2994400123453", "ean13");
  await p.click(".dock .btn");
  const label = await p.eval(`document.querySelector(".dock .btn").textContent`);
  check(label === "Save without a name", "the bar offers a card without a name: " + label);
  await p.click(".dock .btn");
  const { s } = await landed(p, { store: "Card 3453", number: "2994400123453" }, "no name");
  check(s.snack.startsWith("Card added."), "the word for a card without a name: " + s.snack);
});

// 5. Scan first, a store's whole name typed: the bar adds that store's card.
await flow("scan first, store typed", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "2900123456785", "ean13");
  await p.click(".dock .btn");
  await type(p, "#chooser-name", "billa");
  const label = await p.eval(`document.querySelector(".dock .btn").textContent`);
  check(label === "Add a Billa card", "the bar names the store: " + label);
  await enter(p, "#chooser-name");
  await landed(p, { store: "Billa", brand: "billa", number: "2900123456785" }, "store typed");
});

// 6. A name of your own first, then the scanner.
await flow("own name, then scan", async (p) => {
  await startAdd(p);
  await type(p, "#chooser-name", "City pool");
  await scanAnswer(p, "SWIM-000731", "code128");
  await p.click(".dock .btn");
  await landed(p, { store: "City pool", number: "SWIM-000731" }, "own name, then scan");
});

// 7. A store's tile with the scanner closed: the number typed in the sheet, Done on the keyboard.
await flow("store, number typed", async (p) => {
  await startAdd(p);
  await scanAnswer(p, null);
  await p.click('.tile[data-brand="sainsburys"]');
  check((await state(p)).dialog, "the sheet for the number opens");
  await type(p, "#sheet-number", "2900 1234 5678 5");
  const line = await p.eval(`document.querySelector(".detected").textContent`);
  check(line.includes("EAN-13"), "the type is worked out while typing: " + line);
  await enter(p, "#sheet-number");
  await landed(p, { store: "Sainsbury’s", number: "2900123456785", format: "auto" }, "number typed");
});

// 8. A name of your own with the scanner closed: the number typed in the sheet, its Add button.
await flow("own name, number typed", async (p) => {
  await startAdd(p);
  await type(p, "#chooser-name", "Book club");
  await scanAnswer(p, null);
  await p.click(".dock .btn");
  check((await state(p)).dialog, "the sheet for the number opens");
  await type(p, "#sheet-number", "BC-77");
  await p.click(".sheet-dock .btn");
  await landed(p, { store: "Book club", number: "BC-77" }, "own name, number typed");
});

// 9. A number left empty: the sheet says why and saves nothing.
await flow("empty number", async (p) => {
  await startAdd(p);
  await scanAnswer(p, null);
  await p.click('.tile[data-brand="lidl"]');
  await p.click(".sheet-dock .btn");
  const s = await state(p);
  const error = await p.eval(`document.querySelector(".store-sheet .field-error").textContent`);
  check(s.cards.length === 0 && s.dialog && error.length > 0, "nothing saved, a reason: " + error);
});

// 10. Two quick taps on the bar's button: one card.
await flow("double tap", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "2994400123453", "ean13");
  await p.click(".dock .btn");
  await p.eval(`(() => { const b = document.querySelector(".dock .btn"); b.click(); b.click(); })()`);
  await landed(p, { store: "Card 3453", number: "2994400123453" }, "double tap");
});

// 11. Cards from screenshots: three pictures, two with codes: a store for one, no name for the other.
await flow("screenshots", async (p) => {
  await p.open("#/");
  await p.eval(`window.__pickAnswer = ["2900123456785.ean_13.png", "none.png", "MEMBER-42.qr_code.png"]`);
  await p.click(".empty-actions .btn.tonal");
  await sleep(800);
  const title = await p.eval(`document.querySelector("dialog[open] .sheet-title").textContent`);
  check(title === "Card 1 of 2", "two pictures had a code: " + title);
  await p.click('dialog[open] .tile[data-brand="lidl"]');
  await sleep(400);
  await p.click("dialog[open] .dock .btn");
  const { s } = await landed(p, { store: "Lidl", number: "2900123456785", count: 2 }, "screenshots");
  check(s.snack.startsWith("Added 2 cards."), "a word for both: " + s.snack);
  check(
    s.cards.some((c) => c.store === "Card 0-42" || c.store.startsWith("Card ")),
    "the second without a name",
  );
  await p.click("#snackbar .snack-action");
  await sleep(500);
  const undone = await state(p);
  check(
    undone.cards.length === 0 && (undone.hash === "#/" || undone.hash === ""),
    "Undo takes both back, to the wallet",
  );
});

// 12. A card already in the wallet: no second card, the first opens.
await flow("already there", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "2994400123453", "ean13");
  await p.click('.tile[data-brand="tesco"]');
  await p.eval("history.back()");
  await sleep(300);
  await p.click(".fab");
  await p.click('.tile[data-brand="tesco"]');
  await sleep(400);
  const s = await state(p);
  check(s.cards.length === 1, "still one card");
  check(s.snack.includes("already"), "with a word: " + s.snack);
  check(s.hash === "#/card/" + s.cards[0].id, "the card opens");
});

// 13. Holding a card: let go for its menu; make it a favourite.
await flow(
  "hold for the menu",
  async (p) => {
    await p.open("#/");
    const at = await p.center('.face-button[data-id="s4"]');
    await p.mouse("mousePressed", at.x, at.y);
    await sleep(650);
    await p.mouse("mouseReleased", at.x, at.y);
    await sleep(300);
    const menu = await p.eval(
      `document.querySelector("dialog[open] .menu-title") && document.querySelector("dialog[open] .menu-title").textContent`,
    );
    check(menu === "Fuel Stop", "the card's menu opens: " + menu);
    check((await state(p)).hash === "#/", "and the card does not open");
    await p.click("dialog[open] .menu-item");
    await sleep(400);
    const s = await state(p);
    check(s.cards.find((c) => c.id === "s4").pinned === true, "now a favourite");
    check(s.snack.includes("favourite"), "with a word: " + s.snack);
  },
  { seed: undefined },
);

// 14. Dragging a card onto another's place: the wallet switches to my order and keeps it.
await flow(
  "drag to reorder",
  async (p) => {
    await p.open("#/");
    const from = await p.center('.face-button[data-id="s5"]');
    const to = await p.eval(
      `(() => { const r = document.querySelector('.face-button[data-id="s4"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await p.mouse("mousePressed", from.x, from.y);
    await sleep(650);
    for (let i = 1; i <= 8; i++) {
      await p.mouse("mouseMoved", from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
      await sleep(30);
    }
    await p.mouse("mouseReleased", to.x, to.y);
    await sleep(500);
    const ui = await p.eval(`window.zapli.data.kv.get("ui")`);
    check(ui && ui.order === "mine", "the wallet is in my order now: " + JSON.stringify(ui && ui.order));
    const manual = (ui && ui.manual) || [];
    check(
      manual.indexOf("s5") >= 0 && manual.indexOf("s5") < manual.indexOf("s4"),
      "the dragged card is before the other one: " + manual.join(","),
    );
    const shown = await p.eval(`[...document.querySelectorAll(".face-button")].map((b) => b.dataset.id)`);
    check(shown.indexOf("s5") < shown.indexOf("s4"), "and shows there: " + shown.join(","));
    check((await state(p)).hash === "#/", "the card did not open");
    check((await state(p)).undo, "with Undo back to the order before");
  },
  { seed: undefined },
);

// 15. Moving a card from its menu on the card's page (no dragging needed).
await flow(
  "move from the card's menu",
  async (p) => {
    await p.open("#/");
    await p.click('.face-button[data-id="s2"]');
    await p.click('.topbar-actions .btn[aria-label="Menu"]');
    await p.eval(
      `[...document.querySelectorAll("dialog[open] .menu-item")].find((b) => b.textContent === "Move down").click()`,
    );
    await sleep(400);
    const ui = await p.eval(`window.zapli.data.kv.get("ui")`);
    const manual = (ui && ui.manual) || [];
    check(
      ui && ui.order === "mine" && manual.indexOf("s2") === manual.indexOf("s4") + 1,
      "moved down past the next card: " + manual.join(","),
    );
    check((await state(p)).hash === "#/card/s2", "still on the card");
  },
  { seed: undefined },
);

// 16. Swiping to the next card: the address follows without a new entry, and that card counts once shown a moment.
await flow(
  "swipe between cards",
  async (p) => {
    await p.open("#/");
    await p.click('.face-button[data-id="s1"]');
    await sleep(300);
    await p.eval(
      `(() => { const s = document.querySelector(".slides"); s.scrollLeft = s.clientWidth; s.dispatchEvent(new Event("scroll")); })()`,
    );
    await sleep(400);
    let s = await state(p);
    check(s.hash === "#/card/s3", "the next card in the wallet's order: " + s.hash);
    check(s.stack.length === 2, "no new entry: Back still goes to the wallet");
    await sleep(1700);
    s = await state(p);
    check(s.runs.includes('markUsed{"card":"s3"}'), "the card swiped to counts as used");
  },
  { seed: undefined },
);

// 17. Editing: Enter goes to the next field and saves on the last; the bar's Save does the same.
await flow(
  "edit a card",
  async (p) => {
    await p.open("#/");
    await p.click('.face-button[data-id="s2"]');
    await p.click(".card-actions .btn");
    check(await p.eval(`Boolean(document.querySelector(".dock .btn"))`), "Save stays in the bar");
    await type(p, "#edit-holder", "Sam");
    await enter(p, "#edit-holder");
    check((await p.eval("document.activeElement.id")) === "edit-points", "Enter moves to the next field");
    await type(p, "#edit-points", "1 250,5");
    await p.eval(
      `(() => { const d = document.querySelector("#edit-expires"); d.value = "2027-03-31"; d.dispatchEvent(new Event("input")); })()`,
    );
    await enter(p, "#edit-points");
    await sleep(400);
    const update = await p.eval(`JSON.stringify(window.__calls.filter((c) => c[0] === "update").map((c) => c[3]))`);
    check(
      update.includes('"points":1250.5') &&
        update.includes('"expires":"2027-03-31"') &&
        update.includes('"holder":"Sam"'),
      "saved: " + update,
    );
    check((await state(p)).hash === "#/card/s2", "back on the card");
  },
  { seed: undefined },
);

// 18. The phone re-creates the page on a rotation, a dark-mode switch or a font-size change and reloads it at its
// address, with nothing behind it: the way back to the wallet is laid down again, so Back goes there.
await flow(
  "reloaded on a card",
  async (p) => {
    await p.open("#/card/s2");
    const s = await state(p);
    check(s.hash === "#/card/s2" && s.title === "Green Basket Market", "the card is shown again: " + s.title);
    check(JSON.stringify(s.stack) === JSON.stringify(["#/", "#/card/s2"]), "the way back: " + JSON.stringify(s.stack));
    check((await p.eval("history.state.depth")) === 1, "one step above the wallet");
    check((await systemBack(p)) === "history", "Back stays in the app");
    const back = await state(p);
    check(back.hash === "#/", "Back: the wallet: " + back.hash);
    check(await p.eval(`Boolean(document.querySelector(".screen.wallet"))`), "the wallet is drawn");
    check((await systemBack(p)) === "leaves", "a second Back leaves the app");
  },
  { seed: undefined },
);

await flow(
  "reloaded on editing",
  async (p) => {
    await p.open("#/edit/s2");
    check((await p.eval("history.state.depth")) === 2, "two steps above the wallet");
    check((await systemBack(p)) === "history", "Back: one step");
    check((await state(p)).hash === "#/card/s2", "Back: the card");
    check((await systemBack(p)) === "history", "Back: another step");
    check((await state(p)).hash === "#/", "Back: the wallet");
    check((await systemBack(p)) === "leaves", "then out");
  },
  { seed: undefined },
);

// 19. Add → Scan a card → the scanner closed without a code: the sheet for typing the number, where a card can be
// saved without a name.
await flow("scan first, cancelled", async (p) => {
  await startAdd(p);
  await scanAnswer(p, null);
  await p.click(".dock .btn");
  const s = await state(p);
  check(s.dialog, "the sheet for the number opens");
  check(await p.eval(`Boolean(document.querySelector("dialog[open] #sheet-name"))`), "with a field for a name");
  await type(p, "#sheet-number", "2994400123453");
  await p.click(".sheet-dock .btn");
  await landed(p, { store: "Card 3453", number: "2994400123453" }, "scan first, cancelled");
});

// 20. Done on the keyboard in "Shop or card name" never opens the scanner (it needs a tap): it opens the sheet, whose
// own button scans.
await flow("Done in the name field", async (p) => {
  await startAdd(p);
  await type(p, "#chooser-name", "City pool");
  await enter(p, "#chooser-name");
  await sleep(300);
  let s = await state(p);
  check(!s.calls.includes("scan"), "no scanner from a key: " + s.calls.join(","));
  check(s.dialog, "the sheet opens");
  check(
    (await p.eval(`document.querySelector("dialog[open] .sheet-title").textContent`)) === "City pool",
    "for the name typed",
  );
  check(!s.snack, "and no word of a problem: " + s.snack);
  await p.click("dialog[open] .sheet-head .btn");
  await type(p, "#chooser-name", "billa");
  await enter(p, "#chooser-name");
  await sleep(300);
  s = await state(p);
  check(!s.calls.includes("scan"), "a store typed in full: still no scanner");
  check(
    (await p.eval(`document.querySelector("dialog[open] .sheet-title").textContent`)) === "Billa",
    "the sheet for the store",
  );
  await p.click("dialog[open] .sheet-head .btn");
  await type(p, "#chooser-name", "");
  await enter(p, "#chooser-name");
  await sleep(300);
  s = await state(p);
  check(!s.calls.includes("scan") && !s.dialog, "nothing typed: nothing opens");
});

// 21. A scanner the phone refuses without a tap says so, on top of the sheet that opens.
await flow("scanner refused", async (p) => {
  await startAdd(p);
  await p.eval(`window.__scanFail = "NEEDS_GESTURE"`);
  await p.click('.tile[data-brand="tesco"]');
  const s = await state(p);
  check(s.dialog, "the sheet for the number opens");
  check(/tap/i.test(s.snack) && !/went wrong/.test(s.snack), "a word that asks for a tap: " + s.snack);
  check(await snackOnTop(p), "the word shows above the sheet");
});

// 22. A typed number with the length of an EAN-13, EAN-8 or UPC-A whose last digit does not check out is not saved
// silently: the sheet says so, and saving it as it is takes a second, deliberate tap.
await flow("mistyped last digit", async (p) => {
  await startAdd(p);
  await scanAnswer(p, null);
  await p.click('.tile[data-brand="sainsburys"]');
  for (const wrong of ["4006381333932", "7700123456781", "12345678", "036000291453"]) {
    await type(p, "#sheet-number", wrong);
    await p.click(".sheet-dock .btn");
    const s = await state(p);
    const error = await p.eval(`document.querySelector(".store-sheet .field-error").textContent`);
    check(s.cards.length === 0, `${wrong}: not saved`);
    check(error === "The last digit doesn’t match. Check the number on the card.", `${wrong}: says why: ${error}`);
  }
  await type(p, "#sheet-number", "4006381333932");
  await enter(p, "#sheet-number");
  check((await state(p)).cards.length === 0, "Done on the keyboard does not save it either");
  check(await p.eval(`Boolean(document.querySelector(".save-as-typed:not([hidden])"))`), "a way to save it anyway");
  await p.click(".save-as-typed");
  await landed(p, { store: "Sainsbury’s", number: "4006381333932", format: "code128" }, "saved as typed");
});

// 23. Undo after adding a card leaves the wallet alone in the history: one Back leaves the app.
await flow("undo after adding", async (p) => {
  await startAdd(p);
  await scanAnswer(p, "2994400123453", "ean13");
  await p.click('.tile[data-brand="tesco"]');
  await landed(p, { store: "Tesco", number: "2994400123453" }, "before undo");
  await p.click("#snackbar .snack-action");
  await sleep(400);
  const s = await state(p);
  check(s.cards.length === 0, "the card is gone");
  check(s.hash === "#/", "on the wallet: " + s.hash);
  check(JSON.stringify(s.stack) === JSON.stringify(["#/"]), "the wallet alone: " + JSON.stringify(s.stack));
  check((await systemBack(p)) === "leaves", "one Back leaves the app");
});

// 24. Starring the card on show puts it among the favourites at once: the count and the swiping follow.
await flow(
  "star on the card",
  async (p) => {
    await p.open("#/");
    await p.click('.face-button[data-id="s4"]');
    await sleep(300);
    const before = await p.eval(`document.querySelector(".position").textContent`);
    check(before === "Card 4 of 11", "before: " + before);
    await p.click(".star-toggle");
    await sleep(400);
    const after = await p.eval(`document.querySelector(".position").textContent`);
    check(after === "Card 3 of 11", "a favourite now, third: " + after);
    const order = await p.eval(`[...document.querySelectorAll(".slide")].map((s) => s.dataset.id).slice(0, 4).join()`);
    check(order === "s1,s3,s4,s2", "the swiping order follows: " + order);
    const shown = await p.eval(
      `(() => { const s = document.querySelector(".slides"); return Math.round(s.scrollLeft / s.clientWidth); })()`,
    );
    check(shown === 2, "the card stays on show: slide " + shown);
    await p.eval(
      `(() => { const s = document.querySelector(".slides"); s.scrollLeft = 3 * s.clientWidth; s.dispatchEvent(new Event("scroll")); })()`,
    );
    await sleep(400);
    check((await state(p)).hash === "#/card/s2", "the next card is the next in the new order");
  },
  { seed: undefined },
);

// 25. Tapping the code fills the screen with it; a tap or Back closes it, and the history stays as it was.
await flow(
  "the code full screen",
  async (p) => {
    await p.open("#/");
    await p.click('.face-button[data-id="s1"]');
    await sleep(300);
    const entries = (await p.navigation()).entries.length;
    await tap(p, ".code-area");
    let s = await state(p);
    check(await p.eval(`Boolean(document.querySelector("dialog.till-full[open] svg"))`), "the code fills the screen");
    const texts = await p.eval(
      `[...document.querySelectorAll("dialog.till-full[open] .full-number, dialog.till-full[open] .full-name")].map((e) => e.textContent)`,
    );
    check(
      texts.length === 2 && texts[0] === "Corner Grocer" && texts[1] === "2900\u20091234\u20095678\u20095",
      "with the name and the number: " + texts,
    );
    check(s.hash === "#/card/s1?full=1", "a rotation keeps it: " + s.hash);
    check((await p.navigation()).entries.length === entries, "no new history entry");
    const box = await p.eval(
      `(() => { const r = document.querySelector("dialog.till-full svg").getBoundingClientRect(); return { w: r.width, h: r.height }; })()`,
    );
    check(box.w >= 320, "as wide as the screen: " + JSON.stringify(box));
    await p.click("dialog.till-full .full-code");
    s = await state(p);
    check(!s.dialog && s.hash === "#/card/s1", "a tap closes it: " + s.hash);
    await tap(p, ".code-area");
    check((await systemBack(p)) === "dialog", "Back closes it first");
    s = await state(p);
    check(!s.dialog && s.hash === "#/card/s1", "back on the card: " + s.hash);
    check(!s.runs.includes('screenOn{"on":false}'), "the screen stays bright meanwhile");
    check((await systemBack(p)) === "history" && (await state(p)).hash === "#/", "the next Back: the wallet");
  },
  { seed: undefined },
);

await flow(
  "the code full screen, turned",
  async (p) => {
    await p.open("#/card/s1?full=1");
    check(await p.eval(`Boolean(document.querySelector("dialog.till-full[open] svg"))`), "open again after a reload");
    const box = await p.eval(
      `(() => { const r = document.querySelector("dialog.till-full svg").getBoundingClientRect(); return { w: r.width, h: r.height }; })()`,
    );
    check(box.w >= 700 && box.h >= 150, "a barcode along the long side: " + JSON.stringify(box));
    check((await systemBack(p)) === "dialog", "Back closes it");
    check((await state(p)).hash === "#/card/s1", "on the card");
    check((await systemBack(p)) === "history" && (await state(p)).hash === "#/", "then the wallet");
  },
  { seed: undefined, width: 800, height: 360 },
);

// 26. Holding lifts a card after 400 ms, as long as the phone's own long press; a short tap opens it, a scroll never lifts it.
await flow(
  "hold, tap and scroll",
  async (p) => {
    await p.open("#/");
    let at = await p.center('.face-button[data-id="s4"]');
    await p.mouse("mousePressed", at.x, at.y);
    await sleep(425);
    check(await p.eval(`Boolean(document.querySelector(".face-button.lifted"))`), "lifted after 425 ms");
    await p.mouse("mouseReleased", at.x, at.y);
    await sleep(300);
    check((await state(p)).dialog, "its menu");
    await p.eval(CLOSE_DIALOG);
    await sleep(300);
    at = await p.center('.face-button[data-id="s4"]');
    await p.mouse("mousePressed", at.x, at.y);
    await sleep(120);
    check(!(await p.eval(`Boolean(document.querySelector(".face-button.lifted"))`)), "a short tap does not lift");
    await p.mouse("mouseReleased", at.x, at.y);
    await sleep(400);
    check((await state(p)).hash === "#/card/s4", "a short tap opens the card");
    await p.eval("history.back()");
    await sleep(400);
    await p.eval("window.scrollTo(0, 0)");
    at = await p.center('.face-button[data-id="s6"]');
    await p.eval(
      `window.__lifted = 0; new MutationObserver(() => { if (document.querySelector(".face-button.lifted")) window.__lifted++; }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] })`,
    );
    await p.cdp("Input.synthesizeScrollGesture", {
      x: Math.round(at.x),
      y: Math.round(at.y),
      yDistance: -300,
      speed: 600,
      gestureSourceType: "touch",
    });
    await sleep(600);
    const s = await state(p);
    check((await p.eval("window.__lifted")) === 0, "a scroll never lifts a card");
    check(!s.dialog && s.hash === "#/", "nor opens one or its menu");
    check((await p.eval("window.scrollY")) > 0, "the wallet scrolled");
  },
  { seed: undefined },
);

// 27. At 200 % text the name field's example fits, and the sheet's small store tile fits a long name.
await flow(
  "large text",
  async (p) => {
    await p.open("#/add");
    const fits = await p.eval(PLACEHOLDER_FITS);
    check(fits.need <= fits.room, "the example fits its field: " + JSON.stringify(fits));
    await type(p, "#chooser-name", "Riverside Garden Centre");
    await scanAnswer(p, null);
    await p.click(".dock .btn");
    await sleep(300);
    const tile = await p.eval(`(() => {
      const face = document.querySelector("dialog[open] .sheet-face .tile-face");
      const name = face.querySelector(".tile-name");
      const f = face.getBoundingClientRect();
      const words = [...name.querySelectorAll(".word")].map((w) => w.getBoundingClientRect());
      return { inside: words.every((w) => w.left >= f.left - 0.5 && w.right <= f.right + 0.5 && w.top >= f.top - 0.5 && w.bottom <= f.bottom + 0.5), words: words.length };
    })()`);
    check(tile.inside && tile.words === 3, "the store tile in the sheet shows the whole name: " + JSON.stringify(tile));
  },
  { text: 200 },
);

await flow(
  "large text, Slovak",
  async (p) => {
    await p.open("#/add");
    const fits = await p.eval(PLACEHOLDER_FITS);
    check(fits.need <= fits.room, "the Slovak example fits its field: " + JSON.stringify(fits));
  },
  { text: 200, lang: "sk-SK" },
);

// 28. The wallet's search field and the card's star have names a screen reader reads; the star says whether it is on.
await flow(
  "names for screen readers",
  async (p) => {
    await p.open("#/");
    const search = await axNode(p, ".search-input");
    check(search && search.name === "Search your cards", "the search field's name: " + JSON.stringify(search));
    const label = await p.eval(`(document.querySelector(".search-input").labels[0] || {}).textContent`);
    check(label === "Search your cards", "a label of its own, as the phone reads fields: " + label);
    await p.click('.face-button[data-id="s2"]');
    await sleep(300);
    let star = await axNode(p, ".star-toggle");
    check(star && star.name === "Favourite" && star.pressed === "false", "the star, off: " + JSON.stringify(star));
    check(
      (await p.eval(`document.querySelector(".star-toggle").textContent`)) === "Favourite",
      "its name is its text, as the phone reads a toggle",
    );
    await p.click(".star-toggle");
    await sleep(400);
    star = await axNode(p, ".star-toggle");
    check(star && star.name === "Favourite" && star.pressed === "true", "the star, on: " + JSON.stringify(star));
  },
  { seed: undefined },
);

await browser.close();
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} flow checks passed.`);
process.exit(failures ? 1 : 0);
