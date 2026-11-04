// Development only (not shipped): the ways of adding a card and of showing one, run in a headless Chromium on the
// stand-in bridge (dev/harness.mjs, dev/fake-zapli.js), with the taps each takes.
//
//   CHROME=<chrome or chrome-headless-shell> node dev/test-flows.mjs
//
// Each flow checks what was saved (store, list id, number, type, kind), where the page is and what Back does next
// (the history the page keeps), and the calls to the phone (scanner, brightness, counting a use).
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
    cards: window.__records.card.map((c) => ({ id: c.id, store: c.store, brand: c.brand, number: c.number, format: c.format, group: c.group })),
    calls: window.__calls.map((c) => c[0] + (c[1] && typeof c[1] === "string" ? ":" + c[1] : "")),
    runs: window.__calls.filter((c) => c[0] === "runAction").map((c) => c[1] + JSON.stringify(c[2])),
    snack: document.getElementById("snackbar").textContent,
    dialog: Boolean(document.querySelector("dialog[open]")),
    title: (document.querySelector(".topbar-title") || {}).textContent,
  })`);

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

// 1. The store first: + → the store's tile → the scanner reads the code → saved and shown. 2 taps.
await flow("store first, then scan", async (p) => {
  await p.open("#/");
  await p.click(".empty-actions .btn.filled");
  await p.eval(`window.__scanAnswer = { value: "2994400123453", format: "ean13" }`);
  await p.click('.tile[data-brand="tesco"]');
  await sleep(500);
  const s = await state(p);
  const card = s.cards[0];
  check(s.cards.length === 1, "one card saved");
  check(
    card &&
      card.store === "Tesco" &&
      card.brand === "tesco" &&
      card.format === "ean13" &&
      card.group === "shopping_cart",
    "with the store, its list id, the scanned type and kind: " + JSON.stringify(card),
  );
  check(card && card.number === "2994400123453", "and the scanned number");
  check(s.hash === "#/card/" + card.id, "the card opens: " + s.hash);
  check(
    JSON.stringify(s.stack) === JSON.stringify(["#/", "#/card/" + card.id]),
    "Back goes to the wallet (the store list made way): " + JSON.stringify(s.stack),
  );
  check(s.calls.filter((c) => c === "scan").length === 1, "the scanner opened once");
  check(s.calls.includes("haptic:success"), "a short buzz");
  check(
    s.runs.some((r) => r === 'screenOn{"on":true}'),
    "the code shows at full brightness",
  );
  check(s.snack.includes("Tesco"), "and says so, with Undo: " + s.snack);
  await sleep(1700);
  const later = await state(p);
  check(
    later.runs.some((r) => r.startsWith("markUsed")),
    "a shown card counts as used",
  );
  await p.eval(`history.back()`);
  await sleep(400);
  const back = await state(p);
  check(back.hash === "#/" || back.hash === "", "Back: the wallet " + back.hash);
  check(
    back.runs.some((r) => r === 'screenOn{"on":false}'),
    "leaving the code ends the brightness",
  );
});

// 2. The scanner closed without a code: the store's sheet; type the number; Add. 3 taps and typing.
await flow("scanner closed, number typed", async (p) => {
  await p.open("#/add");
  await p.eval(`window.__scanAnswer = null`);
  await p.click('.tile[data-brand="billa"]');
  let s = await state(p);
  check(s.dialog, "the store's sheet opens");
  await p.eval(
    `(() => { const i = document.querySelector("#sheet-number"); i.value = "2900 1234 5678 5"; i.dispatchEvent(new Event("input")); })()`,
  );
  const line = await p.eval(`document.querySelector(".detected").textContent`);
  check(line.includes("EAN-13"), "the type is worked out while typing: " + line);
  await p.click(".store-sheet .btn.filled.wide");
  await sleep(400);
  s = await state(p);
  const card = s.cards[0];
  check(
    card && card.store === "Billa" && card.number === "2900123456785" && card.format === "auto",
    "saved with the number's spaces gone: " + JSON.stringify(card),
  );
  check(s.hash.startsWith("#/card/"), "and shown");
});

// 3. A mistyped number: the sheet says why and saves nothing.
await flow("mistyped number", async (p) => {
  await p.open("#/add");
  await p.eval(`window.__scanAnswer = null`);
  await p.click('.tile[data-brand="lidl"]');
  await p.eval(
    `(() => { const i = document.querySelector("#sheet-number"); i.value = ""; i.dispatchEvent(new Event("input")); })()`,
  );
  await p.click(".store-sheet .btn.filled.wide");
  const s = await state(p);
  const error = await p.eval(`document.querySelector(".store-sheet .field-error").textContent`);
  check(s.cards.length === 0 && s.dialog && error.length > 0, "nothing saved, the sheet stays with a reason: " + error);
});

// 4. Scan first, then the store: + → Scan a card → the store's tile. 3 taps.
await flow("scan first, then the store", async (p) => {
  await p.open("#/add");
  await p.eval(`window.__scanAnswer = { value: "DM-QR-55120", format: "qr" }`);
  await p.click(".quick .btn");
  let s = await state(p);
  check(
    s.hash.startsWith("#/add?code=DM-QR-55120"),
    "the code waits in the address, so a rotation keeps it: " + s.hash,
  );
  check(s.title === "Which store is this card from?", "and the list asks for the store: " + s.title);
  await p.click('.tile[data-brand="dm"]');
  await sleep(300);
  s = await state(p);
  const card = s.cards[0];
  check(
    card && card.store === "dm" && card.format === "qr" && card.number === "DM-QR-55120",
    "saved: " + JSON.stringify(card),
  );
  check(s.calls.filter((c) => c === "scan").length === 1, "the scanner opened once, not again for the store");
});

// 5. A card the wallet has already: no second card, the first one opens.
await flow("a card already in the wallet", async (p) => {
  await p.open("#/");
  await p.click(".empty-actions .btn.filled");
  await p.eval(`window.__scanAnswer = { value: "2994400123453", format: "ean13" }`);
  await p.click('.tile[data-brand="tesco"]');
  await p.eval(`history.back()`);
  await sleep(300);
  await p.click(".fab");
  await p.click('.tile[data-brand="tesco"]');
  await sleep(300);
  const s = await state(p);
  check(s.cards.length === 1, "still one card");
  check(s.snack.includes("already"), "with a word: " + s.snack);
  check(s.hash === "#/card/" + s.cards[0].id, "the card opens");
});

// 6. Another card: the scanner, then its name in the sheet.
await flow("own card", async (p) => {
  await p.open("#/add");
  await p.eval(`window.__scanAnswer = { value: "SWIM-000731", format: "code128" }`);
  await p.click(".tile.other");
  let s = await state(p);
  check(s.dialog, "the sheet asks for the name");
  await p.eval(
    `(() => { const i = document.querySelector("#sheet-name"); i.value = "City pool"; i.dispatchEvent(new Event("input")); })()`,
  );
  await p.click(".swatch");
  await p.click(".store-sheet .btn.filled.wide");
  await sleep(300);
  s = await state(p);
  const card = s.cards[0];
  check(
    card && card.store === "City pool" && !card.brand && card.number === "SWIM-000731" && card.format === "code128",
    "saved: " + JSON.stringify(card),
  );
});

// 7. A store found by search, in Slovak.
await flow(
  "search a store",
  async (p) => {
    await p.open("#/add");
    await p.eval(
      `(() => { const i = document.querySelector(".picker .search-input"); i.value = "dr max"; i.dispatchEvent(new Event("input")); })()`,
    );
    const first = await p.eval(`document.querySelector(".tile").dataset.brand`);
    check(first === "dr-max", "the first tile: " + first);
    const chips = await p.eval(`document.querySelectorAll(".chip").length`);
    check(chips === 0, "the country chips step aside while searching");
  },
  { lang: "sk-SK" },
);

// 8. Cards from screenshots: pick three, two with a code; tap the store of the first, skip the second.
await flow("cards from screenshots", async (p) => {
  await p.open("#/");
  await p.eval(`window.__pickAnswer = ["2900123456785.ean_13.png", "none.png", "MEMBER-42.qr_code.png"]`);
  await p.click(".empty-actions .btn.tonal");
  await sleep(800);
  let s = await state(p);
  check(s.dialog, "the first picture asks for its store");
  const title = await p.eval(`document.querySelector("dialog[open] .sheet-title").textContent`);
  check(title === "Card 1 of 2", "two pictures had a code: " + title);
  await p.click('dialog[open] .tile[data-brand="kaufland"]');
  await sleep(400);
  await p.click("dialog[open] .sheet-head .btn.text");
  await sleep(400);
  s = await state(p);
  check(
    s.cards.length === 1 && s.cards[0].store === "Kaufland" && s.cards[0].format === "ean13",
    "one card saved: " + JSON.stringify(s.cards),
  );
  check(!s.dialog && s.snack === "Added 1 card.", "and a word: " + s.snack);
});

// 9. Swiping to the next card: the address follows without a new entry, and that card counts once shown a moment.
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
    check(
      s.runs.some((r) => r === 'markUsed{"card":"s3"}'),
      "the card swiped to counts as used",
    );
    check(s.title === "Bean There Café", "its name in the bar: " + s.title);
  },
  { seed: undefined },
);

// 10. Editing: a new balance and an expiry date with its reminder.
await flow(
  "edit a card",
  async (p) => {
    await p.open("#/");
    await p.click('.face-button[data-id="s2"]');
    await p.click(".card-actions .btn");
    await p.eval(`(() => {
    const points = document.querySelector("#edit-points"); points.value = "1 250,5"; points.dispatchEvent(new Event("input"));
    const date = document.querySelector("#edit-expires"); date.value = "2027-03-31"; date.dispatchEvent(new Event("input"));
  })()`);
    await p.click(".form .btn.filled.wide");
    await sleep(300);
    const update = await p.eval(`JSON.stringify(window.__calls.filter((c) => c[0] === "update").map((c) => c[3]))`);
    check(
      update.includes('"points":1250.5') &&
        update.includes('"expires":"2027-03-31"') &&
        update.includes('"remind":true'),
      "saved: " + update,
    );
    const s = await state(p);
    check(s.hash === "#/card/s2", "back on the card: " + s.hash);
  },
  { seed: undefined },
);

await browser.close();
console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} flow checks passed.`);
process.exit(failures ? 1 : 0);
