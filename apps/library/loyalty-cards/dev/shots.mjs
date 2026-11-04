// Development only (not shipped): drives the app in a headless Chromium and writes screenshots, for the listing and
// for checking the look at phone sizes, in light and dark, at 100 % and 200 % text, upright and turned.
//
//   CHROME=<chrome or chrome-headless-shell> node dev/shots.mjs --out <dir> [--only <name,…>]
//
// The browser and the stand-in bridge are dev/harness.mjs's. Each scenario prints the page's errors; the exit code
// is 1 when there were any.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sleep, startBrowser } from "./harness.mjs";

const option = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
};
const OUT = resolve(option("--out") || join(tmpdir(), "loyalty-shots"));
const ONLY = option("--only") ? option("--only").split(",") : null;
mkdirSync(OUT, { recursive: true });
const browser = await startBrowser({ out: OUT });

// A photo of a made-up card, drawn in the page: the stand-in for a user's own photo of their card.
const DRAW_PHOTO = `(() => {
  const c = document.createElement("canvas"); c.width = 1100; c.height = 694;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 1100, 694); grad.addColorStop(0, "#23305e"); grad.addColorStop(1, "#6a35c9");
  g.fillStyle = grad; g.fillRect(0, 0, 1100, 694);
  g.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(880 + i * 18, 120 + i * 26, 230 - i * 24, 0, 7); g.fill(); }
  g.fillStyle = "#fff"; g.font = "800 104px system-ui"; g.fillText("Riverside", 70, 300); g.font = "500 58px system-ui"; g.fillText("GYM · MEMBER", 74, 380);
  g.font = "600 46px monospace"; g.fillText("RG 2026 00071", 74, 600);
  const shade = g.createLinearGradient(0, 0, 0, 694); shade.addColorStop(0, "rgba(255,255,255,.08)"); shade.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = shade; g.fillRect(0, 0, 1100, 694);
  return { type: "image/jpeg", b64: c.toDataURL("image/jpeg", 0.82).split(",")[1], w: 1100, h: 694 };
})()`;

// The stores of Slovakia in the store list, whatever the browser's language (as a user who picked them in Settings).
const SLOVAK_STORES = `window.zapli && window.zapli.data.kv.set("ui", { country: "sk", held: false })`;
const scanned = (value = "2994400123453", format = "ean13") => `#/add?code=${value}&format=${format}`;
const typeInto = (p, selector, text, focus = false) =>
  p.eval(
    `(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event("input", { bubbles: true })); ${focus ? "i.focus();" : ""} })()`,
  );
const withSlovakStores = async (p, hash) => {
  await p.open("#/");
  await p.eval(SLOVAK_STORES);
  await p.open(hash);
};

const SCENARIOS = {
  async wallet(p, name) {
    await p.open("#/");
    await p.shot(name);
  },
  async add(p, name) {
    await withSlovakStores(p, "#/");
    await p.click(".fab");
    await p.shot(name);
  },
  async addTyped(p, name) {
    await withSlovakStores(p, "#/add");
    await typeInto(p, "#chooser-name", "City pool");
    await p.shot(name);
  },
  async scanned(p, name) {
    await withSlovakStores(p, scanned());
    await p.shot(name);
  },
  async scannedMatch(p, name) {
    await withSlovakStores(p, scanned());
    await typeInto(p, "#chooser-name", "bil");
    await p.shot(name);
  },
  async scannedNew(p, name) {
    await withSlovakStores(p, scanned());
    await typeInto(p, "#chooser-name", p.lang === "sk" ? "Plaváreň" : "City pool");
    await p.shot(name);
  },
  async keyboardScanned(p, name) {
    await withSlovakStores(p, scanned());
    await typeInto(p, "#chooser-name", "City pool", true);
    await sleep(500);
    await p.shot(name);
  },
  async numberSheet(p, name) {
    await withSlovakStores(p, "#/add");
    await p.eval(`window.__scanAnswer = null`);
    await p.click('.tile[data-brand="billa"]');
    await typeInto(p, "#sheet-number", "2900123456785", true);
    await sleep(500);
    await p.shot(name);
  },
  async landed(p, name) {
    await withSlovakStores(p, scanned());
    await typeInto(p, "#chooser-name", "billa");
    await p.click(".dock .btn");
    await sleep(500);
    await p.shot(name);
  },
  async till(p, name) {
    await p.open("#/");
    await p.click('.face-button[data-id="s1"]');
    await sleep(500);
    await p.shot(name);
  },
  async tillQr(p, name) {
    await p.open("#/");
    await p.click('.face-button[data-id="s3"]');
    await sleep(500);
    await p.shot(name);
  },
  async fullCode(p, name) {
    await p.open("#/card/s1?full=1");
    await sleep(500);
    await p.shot(name);
  },
  async fullQr(p, name) {
    await p.open("#/card/s3?full=1");
    await sleep(500);
    await p.shot(name);
  },
  async scanCancelled(p, name) {
    await withSlovakStores(p, "#/add");
    await p.eval(`window.__scanAnswer = null`);
    await p.click(".dock .btn");
    await sleep(500);
    await p.shot(name);
  },
  async mistyped(p, name) {
    await withSlovakStores(p, "#/add");
    await p.eval(`window.__scanAnswer = null`);
    await p.click('.tile[data-brand="billa"]');
    await typeInto(p, "#sheet-number", "4006381333932");
    await p.click(".sheet-dock .btn");
    await sleep(500);
    await p.shot(name);
  },
  async longNameSheet(p, name) {
    await withSlovakStores(p, "#/add");
    await typeInto(p, "#chooser-name", "Riverside Garden Centre");
    await p.eval(`window.__scanAnswer = null`);
    await p.click(".dock .btn");
    await sleep(500);
    await p.shot(name);
  },
  async refused(p, name) {
    await withSlovakStores(p, "#/add");
    await p.eval(`window.__scanFail = "NEEDS_GESTURE"`);
    await p.click('.tile[data-brand="billa"]');
    await sleep(500);
    await p.shot(name);
  },
  async holdMenu(p, name) {
    await p.open("#/");
    const at = await p.center('.face-button[data-id="s4"]');
    await p.mouse("mousePressed", at.x, at.y);
    await sleep(650);
    await p.mouse("mouseReleased", at.x, at.y);
    await sleep(400);
    await p.shot(name);
  },
  async dragging(p, name) {
    await p.open("#/");
    const from = await p.center('.face-button[data-id="s7"]');
    const to = await p.eval(
      `(() => { const r = document.querySelector('.face-button[data-id="s4"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await p.mouse("mousePressed", from.x, from.y);
    await sleep(650);
    for (let i = 1; i <= 6; i++) {
      await p.mouse("mouseMoved", from.x + ((to.x - from.x) * i) / 7, from.y + ((to.y - from.y) * i) / 7);
      await sleep(40);
    }
    await sleep(200);
    await p.shot(name);
    await p.mouse("mouseReleased", to.x, to.y);
  },
  async orderSheet(p, name) {
    await p.open("#/");
    await p.click(".topbar .btn.icon");
    await p.click("dialog[open] .menu-item");
    await sleep(300);
    await p.shot(name);
  },
  async edit(p, name) {
    await p.open("#/");
    await p.click('.face-button[data-id="s1"]');
    await p.click(".card-actions .btn");
    await p.eval(`document.querySelector("#edit-points").focus()`);
    await sleep(500);
    await p.shot(name);
  },
  async photo(p, name) {
    await p.open("#/");
    await p.eval(`window.zapli.data.kv.set("photo:face:s6", ${DRAW_PHOTO})`);
    await p.open("#/");
    await sleep(500);
    await p.shot(name);
  },
  async settings(p, name) {
    await p.open("#/settings");
    await p.shot(name);
  },
  async empty(p, name) {
    await p.open("#/");
    await p.shot(name);
  },
};

const RUNS = [
  ["01-wallet-light", "wallet", {}],
  ["02-add-light", "add", {}],
  ["03-add-typed-light", "addTyped", {}],
  ["04-scanned-light", "scanned", {}],
  ["05-scanned-match-light", "scannedMatch", {}],
  ["06-scanned-new-light", "scannedNew", {}],
  ["07-keyboard-scanned-light", "keyboardScanned", { width: 412, height: 600 }],
  ["08-keyboard-number-light", "numberSheet", { width: 412, height: 600 }],
  ["09-landed-light", "landed", {}],
  ["10-till-light", "till", {}],
  ["11-hold-menu-light", "holdMenu", {}],
  ["12-dragging-light", "dragging", {}],
  ["13-order-sheet-light", "orderSheet", {}],
  ["14-keyboard-edit-light", "edit", { width: 412, height: 600 }],
  ["15-photo-face-light", "photo", {}],
  ["16-wallet-dark", "wallet", { look: "dark" }],
  ["17-scanned-new-dark", "scannedNew", { look: "dark" }],
  ["18-dragging-dark", "dragging", { look: "dark" }],
  ["19-till-qr-dark", "tillQr", { look: "dark" }],
  ["20-wallet-200", "wallet", { text: 200 }],
  ["21-scanned-match-200", "scannedMatch", { text: 200 }],
  ["22-number-sheet-200", "numberSheet", { text: 200 }],
  ["23-edit-200", "edit", { text: 200 }],
  ["24-till-landscape", "till", { width: 800, height: 360 }],
  ["25-add-landscape", "scanned", { width: 800, height: 360 }],
  ["26-scanned-new-sk", "scannedNew", { lang: "sk-SK" }],
  ["27-wallet-sk-412", "wallet", { lang: "sk-SK", width: 412, height: 915 }],
  ["28-add-412", "add", { width: 412, height: 915 }],
  ["29-empty-dark-sk", "empty", { seed: [], look: "dark", lang: "sk-SK" }],
  ["30-settings-dark", "settings", { look: "dark" }],
  ["31-preview-browser", "wallet", { live: false }],
  ["32-full-code-light", "fullCode", {}],
  ["33-full-qr-dark", "fullQr", { look: "dark" }],
  ["34-full-code-landscape", "fullCode", { width: 800, height: 360 }],
  ["35-scan-cancelled-light", "scanCancelled", {}],
  ["36-mistyped-light", "mistyped", {}],
  ["37-long-name-sheet-200", "longNameSheet", { text: 200 }],
  ["38-refused-light", "refused", {}],
  ["39-add-200", "add", { text: 200 }],
  ["40-add-200-sk", "add", { text: 200, lang: "sk-SK" }],
];

let failed = false;
for (const [name, scenario, options] of RUNS) {
  if (ONLY && !ONLY.includes(name) && !ONLY.includes(scenario)) continue;
  console.log(name);
  const p = await browser.page(options);
  p.lang = (options.lang || "en").slice(0, 2);
  try {
    await SCENARIOS[scenario](p, name);
  } catch (error) {
    failed = true;
    console.log("  FAILED", error.message);
  }
  if (p.errors.length) {
    failed = true;
    console.log("  page errors:", p.errors.join(" | "));
  }
  await p.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
