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

const SCENARIOS = {
  async wallet(p, name) {
    await p.open("#/");
    await p.shot(name);
  },
  async add(p, name) {
    await p.open("#/");
    await p.click(".fab");
    await p.shot(name);
  },
  async addSlovakia(p, name) {
    await p.open("#/");
    await p.click(".fab");
    await p.click(".chip");
    await p.shot(name);
  },
  async addSearch(p, name) {
    await p.open("#/add");
    await p.eval(
      `(() => { const i = document.querySelector(".picker .search-input"); i.value = "dr"; i.dispatchEvent(new Event("input")); })()`,
    );
    await sleep(300);
    await p.shot(name);
  },
  async scanned(p, name) {
    await p.open("#/add");
    await p.eval(`window.__scanAnswer = { value: "2994400123453", format: "ean13" }`);
    await p.click('.tile[data-brand="tesco"]');
    await sleep(600);
    await p.shot(name);
  },
  async sheet(p, name) {
    await p.open("#/add");
    await p.eval(`window.__scanAnswer = null`);
    await p.click('.tile[data-brand="billa"]');
    await p.eval(
      `(() => { const i = document.querySelector("#sheet-number"); i.value = "2900123456785"; i.dispatchEvent(new Event("input")); })()`,
    );
    await sleep(300);
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
  async photo(p, name) {
    await p.open("#/");
    await p.eval(`window.zapli.data.kv.set("photo:face:s6", ${DRAW_PHOTO})`);
    await p.open("#/");
    await p.click('.face-button[data-id="s6"]');
    await sleep(600);
    await p.eval(`window.scrollTo(0, 0)`);
    await p.shot(name);
  },
  async walletPhoto(p, name) {
    await p.open("#/");
    await p.eval(`window.zapli.data.kv.set("photo:face:s6", ${DRAW_PHOTO})`);
    await p.open("#/");
    await sleep(500);
    await p.shot(name);
  },
  async details(p, name) {
    await p.open("#/");
    await p.click('.face-button[data-id="s8"]');
    await sleep(400);
    await p.eval(`window.scrollTo(0, 420)`);
    await p.shot(name);
  },
  async edit(p, name) {
    await p.open("#/");
    await p.click('.face-button[data-id="s1"]');
    await p.click(".card-actions .btn");
    await p.shot(name);
  },
  async menu(p, name) {
    await p.open("#/");
    await p.click(".topbar .btn.icon");
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
  ["02-store-list-light", "add", {}],
  ["02b-store-list-slovakia-light", "addSlovakia", {}],
  ["03-scanned-tesco-light", "scanned", {}],
  ["04-store-sheet-light", "sheet", {}],
  ["05-till-light", "till", {}],
  ["06-photo-face-light", "photo", {}],
  ["07-wallet-dark", "wallet", { look: "dark" }],
  ["08-store-list-dark", "add", { look: "dark" }],
  ["09-till-qr-dark", "tillQr", { look: "dark" }],
  ["10-wallet-200", "wallet", { text: 200 }],
  ["11-store-list-200", "add", { text: 200 }],
  ["12-till-200", "till", { text: 200 }],
  ["13-till-landscape", "till", { width: 800, height: 360 }],
  ["14-store-list-sk", "add", { lang: "sk-SK" }],
  ["15-wallet-sk-412", "wallet", { lang: "sk-SK", width: 412, height: 915 }],
  ["16-empty-light", "empty", { seed: [] }],
  ["17-empty-dark-sk", "empty", { seed: [], look: "dark", lang: "sk-SK" }],
  ["18-details-light", "details", {}],
  ["19-edit-light", "edit", {}],
  ["20-menu-light", "menu", {}],
  ["21-settings-dark", "settings", { look: "dark" }],
  ["22-search-light", "addSearch", {}],
  ["23-wallet-photo-light", "walletPhoto", {}],
  ["24-store-list-412-200", "add", { width: 412, height: 915, text: 200 }],
  ["25-sheet-200", "sheet", { text: 200 }],
  ["26-preview-browser", "wallet", { live: false }],
];

let failed = false;
for (const [name, scenario, options] of RUNS) {
  if (ONLY && !ONLY.includes(name) && !ONLY.includes(scenario)) continue;
  console.log(name);
  const p = await browser.page(options);
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
