// Development only (not shipped): checks the picture tiles of the settings sheet in a headless Chromium.
//
//   CHROME=<chrome or chrome-headless-shell> node apps/library/solitaire/dev/check-tiles.mjs [--shots <dir>]
//     [--page <another copy of index.html>]
//
// Without CHROME it uses Playwright's cached headless shell, if there is one. Nothing but Node 22 is needed: the
// browser is driven over the DevTools protocol with Node's own WebSocket.
//
// For every screen (360 × 640 portrait, also 320 × 568, 412 × 915 and 640 × 360), text size (100, 130 and 200 %,
// emulated with text-size-adjust, as the app does on iPhone), language (English, Slovak) and card size (Normal,
// Largest), it opens Settings as a new player (4. below), unlocks everything, selects in turn every tile in the first
// column of each tile grid (card style, shape, back, table), focuses it, and checks that
//   1. the tile with its selection border and focus ring lies inside the sheet's visible area,
//   2. its picture and its name lie inside the tile's border and inside that area,
//   3. nothing in the sheet's body sticks out sideways (a swipe could move the first column out of view), and the
//      sheet itself cannot be scrolled (in 1.1.0 at 200 % the tab labels were wider than the sheet; a scroll of the
//      sheet then shifted everything left and cut the first column off), and every tab label lies inside its tab,
//   4. every other tile's name, picture and level badge lie inside that tile's border too (also for a new player,
//      before everything is unlocked).
// --shots writes a screenshot of each screen's shape tiles with the first one selected.
// Exit code 0 when everything holds, 1 otherwise.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const option = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
};
const PAGE = pathToFileURL(
  resolve(option("--page") || join(dirname(fileURLToPath(import.meta.url)), "..", "index.html")),
).href;
const CACHED = join(
  homedir(),
  "Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell",
);
const CHROME = process.env.CHROME || (existsSync(CACHED) ? CACHED : null);
const SHOTS = option("--shots");

const SCREENS = [
  [360, 640],
  [320, 568],
  [412, 915],
  [640, 360],
];
const TEXT = [100, 130, 200];
const LANGS = ["en", "sk"];
const SIZES = ["normal", "largest"];
const GRIDS = ["deck-tiles", "shape-tiles", "back-tiles", "table-tiles"];

if (!CHROME) {
  console.error("No Chromium: set CHROME to a chrome or chrome-headless-shell binary.");
  process.exit(2);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a minimal DevTools protocol client
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "solitaire-tiles-"));
  const proc = spawn(
    CHROME,
    ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const url = await new Promise((resolve, reject) => {
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    proc.on("exit", (code) => reject(new Error(`Chromium exited (${code}): ${err}`)));
  });
  const ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let next = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const w = msg.id && waiting.get(msg.id);
    if (w) {
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
      else w.resolve(msg.result);
    } else if (msg.method) events.forEach((f) => f(msg));
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      waiting.set(++next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params, sessionId }));
    });
  return {
    async page(width, height, textPercent) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const call = (method, params) => send(method, params, sessionId);
      const errors = [];
      events.push((msg) => {
        if (msg.sessionId === sessionId && msg.method === "Runtime.exceptionThrown")
          errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      });
      await call("Page.enable");
      await call("Runtime.enable");
      await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
      // The phone's text size: every font grows, lengths in px and rem do not.
      await call("Page.addScriptToEvaluateOnNewDocument", {
        source: `new MutationObserver((m, o) => { if (!document.head) return; o.disconnect(); const s = document.createElement("style"); s.textContent = ":root{-webkit-text-size-adjust:${textPercent}% !important}"; document.head.prepend(s); }).observe(document, { childList: true, subtree: true });`,
      });
      const load = () =>
        new Promise((resolve) => {
          const f = (msg) => {
            if (msg.sessionId !== sessionId || msg.method !== "Page.loadEventFired") return;
            events.splice(events.indexOf(f), 1);
            resolve();
          };
          events.push(f);
        });
      return {
        errors,
        async open() {
          const loaded = load();
          await call("Page.navigate", { url: PAGE });
          await loaded;
          await sleep(150);
        },
        async eval(expression) {
          const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
          return r.result.value;
        },
        async shot(file) {
          const r = await call("Page.captureScreenshot", { format: "png" });
          writeFileSync(file, Buffer.from(r.data, "base64"));
        },
        close: () => send("Target.closeTarget", { targetId }),
      };
    },
    async close() {
      await send("Browser.close").catch(() => {});
      proc.kill();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

// ---- in the page: where the first column's tiles are, and what of the chosen one lies outside where it must be
const MEASURE = `(grid) => {
  const box = (r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom });
  const sheet = document.getElementById("dlg-settings");
  const body = sheet.querySelector(".sheet-body");
  const sb = body.getBoundingClientRect();
  const db = sheet.getBoundingClientRect();
  const view = {
    l: Math.max(0, db.left, sb.left + body.clientLeft),
    r: Math.min(innerWidth, db.right, sb.left + body.clientLeft + body.clientWidth),
    t: Math.max(0, db.top, sb.top + body.clientTop),
    b: Math.min(innerHeight, db.bottom, sb.top + body.clientTop + body.clientHeight),
  };
  const tile = document.querySelector("#" + grid + " .tile.on");
  const cs = getComputedStyle(tile);
  const ring = cs.outlineStyle === "none" ? 0 : parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
  const tb = box(tile.getBoundingClientRect());
  const outer = { l: tb.l - ring, r: tb.r + ring, t: tb.t - ring, b: tb.b + ring };
  const inner = {
    l: tb.l + parseFloat(cs.borderLeftWidth),
    r: tb.r - parseFloat(cs.borderRightWidth),
    t: tb.t + parseFloat(cs.borderTopWidth),
    b: tb.b - parseFloat(cs.borderBottomWidth),
  };
  const name = tile.querySelector(":scope > span:not(.lock):not(.sr-only)");
  const range = document.createRange();
  range.selectNodeContents(name);
  const text = box(range.getBoundingClientRect());
  const pic = box(tile.querySelector(".pv").getBoundingClientRect());
  // A tile taller than the visible area (landscape at 200 %) is checked across only: it scrolls into view in parts.
  const across = outer.b - outer.t > view.b - view.t;
  const sides = across ? [["l"], ["r"]] : [["l", "t"], ["r", "b"]];
  const out = (a, b) => sides[0].some((k) => a[k] < b[k] - 0.5) || sides[1].some((k) => a[k] > b[k] + 0.5);
  const fmt = (a) => Math.round(a.l) + ".." + Math.round(a.r) + " x " + Math.round(a.t) + ".." + Math.round(a.b);
  const problems = [];
  if (out(outer, view)) problems.push("ring " + fmt(outer) + " outside the sheet's visible " + fmt(view));
  if (out(text, inner)) problems.push("name " + fmt(text) + " outside the tile's border " + fmt(inner));
  if (out(text, view)) problems.push("name " + fmt(text) + " outside the sheet's visible " + fmt(view));
  if (out(pic, inner)) problems.push("picture " + fmt(pic) + " outside the tile's border " + fmt(inner));
  if (body.scrollWidth > body.clientWidth) problems.push("the sheet's body scrolls sideways by " + (body.scrollWidth - body.clientWidth) + " px");
  // The sheet itself must not scroll at all: a focus or scrollIntoView that moves it sideways cuts the first column
  // off at the left, and the player cannot scroll it back.
  const moved = {};
  for (const k of ["scrollLeft", "scrollTop"]) {
    const was = sheet[k];
    sheet[k] = 1e6;
    moved[k] = sheet[k];
    sheet[k] = was;
  }
  if (moved.scrollLeft) problems.push("the sheet itself can be scrolled sideways by " + moved.scrollLeft + " px, which cuts its first column off at the left");
  if (moved.scrollTop) problems.push("the sheet itself can be scrolled down by " + moved.scrollTop + " px, which hides its head");
  // The tab labels, whose overflow made the sheet wider than the screen.
  for (const tab of sheet.querySelectorAll('[role="tab"]')) {
    const label = document.createRange();
    label.selectNodeContents(tab);
    const lb = box(label.getBoundingClientRect());
    const tb2 = box(tab.getBoundingClientRect());
    if (lb.l < Math.max(tb2.l, db.left) - 0.5 || lb.r > Math.min(tb2.r, db.right) + 0.5)
      problems.push("tab label " + tab.textContent.trim() + " " + Math.round(lb.l) + ".." + Math.round(lb.r) + " outside its tab " + Math.round(tb2.l) + ".." + Math.round(tb2.r));
  }
  return { name: name.textContent, problems };
}`;

// ---- in the page: every tile of a grid, chosen or not, keeps its name and picture inside its border
const EVERY = `(grid) => {
  const problems = [];
  for (const tile of document.querySelectorAll("#" + grid + " .tile")) {
    const cs = getComputedStyle(tile);
    const r = tile.getBoundingClientRect();
    const l = r.left + parseFloat(cs.borderLeftWidth) - 0.5;
    const rt = r.right - parseFloat(cs.borderRightWidth) + 0.5;
    const name = tile.querySelector(":scope > span:not(.lock):not(.sr-only)");
    const range = document.createRange();
    range.selectNodeContents(name);
    const parts = [["name", range.getBoundingClientRect()], ["picture", tile.querySelector(".pv").getBoundingClientRect()]];
    const badge = tile.querySelector(":scope > .lock");
    if (badge) parts.push(["level badge", badge.getBoundingClientRect()]);
    for (const [what, b] of parts)
      if (b.left < l || b.right > rt)
        problems.push('"' + name.textContent + '": ' + what + " " + Math.round(b.left) + ".." + Math.round(b.right) + " outside the tile's border " + Math.round(l) + ".." + Math.round(rt));
  }
  return problems;
}`;

const problems = [];
let checked = 0;
const browser = await launch();
try {
  for (const [w, h] of SCREENS) {
    for (const tz of TEXT) {
      for (const lang of LANGS) {
        for (const size of SIZES) {
          const where = `${w}x${h} text ${tz}% ${lang} ${size}`;
          const page = await browser.page(w, h, tz);
          await page.open();
          await page.eval("localStorage.clear()");
          await page.open();
          await page.eval(`(() => {
            document.getElementById("btn-settings").click();
            for (const id of ["lang-${lang}", "size-${size}"]) document.getElementById(id).click();
          })()`);
          // A new player's tiles, with their level badges; then everything unlocked, so every tile can be chosen.
          for (const grid of GRIDS)
            (await page.eval(`(${EVERY})("${grid}")`)).forEach((p) =>
              problems.push(`${where} new player ${grid} ${p}`),
            );
          await page.eval(`document.getElementById("opt-unlock").click()`);
          for (const grid of GRIDS) {
            // The tiles whose left edge is the grid's: the first column (a shape too big for this size cannot be chosen).
            const firsts = await page.eval(`(() => {
              const g = document.getElementById("${grid}");
              const left = g.getBoundingClientRect().left;
              return [...g.querySelectorAll(".tile")]
                .filter((t) => Math.abs(t.getBoundingClientRect().left - left) < 1 && !t.querySelector("input").disabled)
                .map((t) => t.querySelector("input").value);
            })()`);
            if (!firsts.length) problems.push(`${where} ${grid}: no tiles`);
            (await page.eval(`(${EVERY})("${grid}")`)).forEach((p) => problems.push(`${where} ${grid} ${p}`));
            for (const value of firsts) {
              const r = await page.eval(`(async () => {
                const pick = () => document.querySelector('#${grid} input[value="${value}"]');
                pick().click();
                const input = pick();
                input.focus({ preventScroll: true });
                input.closest(".tile").scrollIntoView({ block: "center" });
                await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
                return (${MEASURE})("${grid}");
              })()`);
              checked++;
              r.problems.forEach((p) => problems.push(`${where} ${grid} "${r.name}": ${p}`));
            }
          }
          if (SHOTS && size === "normal") {
            await page.eval(`(async () => {
              document.querySelector('#shape-tiles input[value="rect"]').click();
              const input = document.querySelector('#shape-tiles input[value="rect"]');
              input.focus({ preventScroll: true });
              document.getElementById("shape-tiles").closest("fieldset").scrollIntoView({ block: "start" });
              await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
            })()`);
            await page.shot(join(SHOTS, `tiles-${w}x${h}-${tz}-${lang}.png`));
          }
          page.errors.forEach((e) => problems.push(`${where}: script error ${e}`));
          await page.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`tiles: ${problems.length} problem(s) in ${checked} selected tiles`);
  process.exit(1);
}
console.log(`tiles ok: ${checked} selected first-column tiles`);
