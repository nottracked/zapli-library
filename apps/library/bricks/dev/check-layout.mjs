// Development only (not shipped): checks in a headless Chromium that the board holds still during play.
//
//   CHROME=<chrome or chrome-headless-shell> node dev/check-layout.mjs [--shots <dir>] [--package <dir>]
//     [--screens 360x800,412x915,800x360] [--text 100,200] [--level 1-1] [--lang en|sk]
//
// Without CHROME it uses Playwright's cached headless shell, if there is one. Nothing but Node 22 is needed: the
// page is served from a small local web server (modules load only from a web address) and the browser is driven over
// the DevTools protocol with Node's own WebSocket.
//
// For each screen (360 × 800 and 412 × 915 upright, 800 × 360 turned), text size (100 and 200 %, emulated with
// text-size-adjust) and look (light, dark), it starts level 1-1 (or --level), launches the ball and then, through the game's own
// code (game.mjs's applyPower and its timers):
//   1. lets the score grow to six digits and the balls to five,
//   2. gives one power-up, then a second, then the four other timed ones,
//   3. lets all of them run out,
//   4. sends a resize event and fits the board again, as a harmless resize from the host would,
// and checks on every frame that the stage, the board and the HUD keep their place and size, that the board's canvas
// is never allocated again (that clears the picture for a frame), and that the power-ups' chips are shown inside the
// HUD and inside the screen while they run.
// --shots writes four screenshots of each screen: before the power-ups, with two, with six, and after they ended.
// --package checks another copy of package/ (an older version, to compare); --screens, --text, --level and --lang
// choose other screens, text sizes, a level (one with a long name, say) and the language.
// Exit code 0 when everything holds, 1 otherwise.
//
// The only change to the app is made by this script's web server: it adds one line to js/main.mjs that hands the
// script the game in play, so it can give power-ups. The app itself has no such way in.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const option = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
};
const PKG = resolve(option("--package") || join(dirname(fileURLToPath(import.meta.url)), "..", "package"));
const CACHED = join(
  homedir(),
  "Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell",
);
const CHROME = process.env.CHROME || (existsSync(CACHED) ? CACHED : null);
const SHOTS = option("--shots");

const SCREENS = (option("--screens") || "360x800,412x915,800x360").split(",").map((s) => s.split("x").map(Number));
const TEXT = (option("--text") || "100,200").split(",").map(Number);
const LEVEL = option("--level") || "1-1";
const LANG = option("--lang") || "en";
const LOOKS = ["light", "dark"];

if (!CHROME) {
  console.error("No Chromium: set CHROME to a chrome or chrome-headless-shell binary.");
  process.exit(2);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the package, served with the one line that hands the game to this script
const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const HOOK = "\nglobalThis.__bricksCheck = { session: () => session, fitArena: () => fitArena() };\n";
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = normalize(join(PKG, path === "/" ? "index.html" : path));
  if (!file.startsWith(PKG) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  let body = readFileSync(file);
  if (file === join(PKG, "js", "main.mjs")) body = Buffer.concat([body, Buffer.from(HOOK)]);
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---- a minimal DevTools protocol client
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "bricks-layout-"));
  const proc = spawn(
    CHROME,
    ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
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
    async page(width, height, textPercent, look) {
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
      // A Pixel 4a's density; the page caps its canvas at two device pixels per CSS pixel.
      await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2.75, mobile: true });
      await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: look }] });
      // Every scenario starts as a new player; the phone's text size: every font grows, lengths in px and rem do not.
      await call("Page.addScriptToEvaluateOnNewDocument", {
        source: `try { localStorage.clear(); localStorage.setItem("bricks/settings", JSON.stringify({ ui: "${LANG}", at: 1 })); } catch (e) {}
new MutationObserver((m, o) => { if (!document.head) return; o.disconnect(); const s = document.createElement("style"); s.textContent = ":root{-webkit-text-size-adjust:${textPercent}% !important}"; document.head.prepend(s); }).observe(document, { childList: true, subtree: true });`,
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
        async open(url) {
          const loaded = load();
          await call("Page.navigate", { url });
          await loaded;
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
      const gone = new Promise((r) => proc.once("exit", r));
      await send("Browser.close").catch(() => {});
      proc.kill();
      await gone;
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

// ---- in the page: a watch on every frame of where the stage, the board and the HUD are, and of the canvas's
// allocations (setting its width or height clears its picture)
const WATCH = `(() => {
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("arena");
  const hud = document.getElementById("hud");
  const proto = HTMLCanvasElement.prototype;
  const w = { allocs: 0, frames: 0, changes: [], step: "start", last: "" };
  for (const k of ["width", "height"]) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    Object.defineProperty(canvas, k, {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { w.allocs += 1; d.set.call(this, v); },
    });
  }
  const box = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
  w.now = () => ({ stage: box(stage), board: box(canvas), hud: box(hud), px: [canvas.width, canvas.height] });
  w.first = w.now();
  w.last = JSON.stringify(w.first);
  const tick = () => {
    w.frames += 1;
    const s = w.now();
    const key = JSON.stringify(s);
    if (key !== w.last) w.changes.push(Object.assign({ step: w.step, frame: w.frames }, s));
    w.last = key;
    // Keep the paddle under the ball, so the ball stays in play while the check runs.
    const g = globalThis.__bricksCheck.session().game;
    const ball = g.balls.find((b) => !b.held) || g.balls[0];
    if (ball) g.paddle.tx = Math.max(g.paddle.w / 2, Math.min(360 - g.paddle.w / 2, ball.x));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  globalThis.__watch = w;
  return true;
})()`;

// The chips of the power-ups on show: how many, and whether each lies inside the HUD and inside the screen.
const CHIPS = `(() => {
  const hud = document.getElementById("hud").getBoundingClientRect();
  const tray = document.getElementById("hud-powers");
  const chips = Array.from(tray.querySelectorAll(".pchip"));
  const shown = chips.filter((c) => {
    let el = c;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.5) return false;
      el = el.parentElement;
    }
    return true;
  });
  const outside = shown.filter((c) => {
    const b = c.getBoundingClientRect();
    return b.left < hud.left - 0.5 || b.right > hud.right + 0.5 || b.top < hud.top - 0.5 || b.bottom > hud.bottom + 0.5 ||
      b.left < 0 || b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5;
  });
  return { count: chips.length, shown: shown.length, outside: outside.length };
})()`;

const powerUp = (types) =>
  `import("./js/game/game.mjs").then((G) => { const g = globalThis.__bricksCheck.session().game; for (const t of ${JSON.stringify(types)}) G.applyPower(g, t); return Object.keys(g.timers).filter((k) => g.timers[k] > 0).length; })`;

const browser = await launch();
const failures = [];
let runs = 0;
try {
  for (const [width, height] of SCREENS) {
    for (const text of TEXT) {
      for (const look of LOOKS) {
        runs += 1;
        const name = `${width}x${height} ${text}% ${look}`;
        const file = `${width}x${height}-${text}-${look}`;
        const problems = [];
        const page = await browser.page(width, height, text, look);
        await page.open(`${ORIGIN}/index.html#/play/level/${LEVEL}`);
        await sleep(700);
        const tz = await page.eval(`getComputedStyle(document.documentElement).getPropertyValue("--tz").trim()`);
        if (text === 200 && Number(tz) < 1.8) problems.push(`the page measured a text size of ${tz}, not 2`);
        // Launch the ball, with no power-ups dropping (only the ones this script gives run), then wait for the
        // level's name to fade from the board.
        await page.eval(
          `import("./js/game/game.mjs").then((G) => { const g = globalThis.__bricksCheck.session().game; g.lives = 3; g.power = []; g.beads = []; return G.launch(g); })`,
        );
        await sleep(2400);
        await page.eval(WATCH);
        if (SHOTS) await page.shot(join(SHOTS, `${file}-1-before.png`));

        await page.eval(`(globalThis.__watch.step = "score and balls", 1)`);
        await page.eval(
          `(() => { const g = globalThis.__bricksCheck.session().game; g.score = 123456; g.lives = 5; return 1; })()`,
        );
        await sleep(400);

        await page.eval(`(globalThis.__watch.step = "one power-up", 1)`);
        await page.eval(powerUp(["wide"]));
        await sleep(500);
        const one = await page.eval(CHIPS);
        if (one.shown !== 1) problems.push(`one power-up running: ${one.shown} chips shown`);

        await page.eval(`(globalThis.__watch.step = "two power-ups", 1)`);
        await page.eval(powerUp(["sparks"]));
        await sleep(500);
        const two = await page.eval(CHIPS);
        if (two.shown !== 2) problems.push(`two power-ups running: ${two.shown} chips shown`);
        if (two.outside) problems.push(`${two.outside} of two chips lie outside the HUD or the screen`);
        if (SHOTS) await page.shot(join(SHOTS, `${file}-2-two.png`));

        await page.eval(`(globalThis.__watch.step = "six power-ups", 1)`);
        const running = await page.eval(powerUp(["sticky", "slow", "molten", "guard"]));
        await sleep(700);
        const six = await page.eval(CHIPS);
        if (running !== 6 || six.shown !== 6)
          problems.push(`six power-ups running (${running}): ${six.shown} chips shown`);
        if (six.outside) problems.push(`${six.outside} chips lie outside the HUD or the screen`);
        if (SHOTS) await page.shot(join(SHOTS, `${file}-3-six.png`));

        // The game's own timers run out, one after the other.
        await page.eval(`(globalThis.__watch.step = "power-ups ending", 1)`);
        await page.eval(
          `(() => { const g = globalThis.__bricksCheck.session().game; Object.assign(g.timers, { wide: 0.3, slow: 0.6, sticky: 0.9, sparks: 1.2, molten: 1.5, guard: 1.8 }); return 1; })()`,
        );
        await sleep(2600);
        const after = await page.eval(CHIPS);
        if (after.shown) problems.push(`${after.shown} chips still shown after the power-ups ended`);
        if (SHOTS) await page.shot(join(SHOTS, `${file}-4-after.png`));

        await page.eval(`(globalThis.__watch.step = "harmless resize", 1)`);
        await page.eval(`(window.dispatchEvent(new Event("resize")), globalThis.__bricksCheck.fitArena(), 1)`);
        await sleep(300);

        const w = await page.eval(
          `(() => { const w = globalThis.__watch; return { allocs: w.allocs, frames: w.frames, changes: w.changes, first: w.first }; })()`,
        );
        if (w.frames < 60) problems.push(`only ${w.frames} frames were drawn`);
        if (w.allocs)
          problems.push(`the board's canvas was allocated ${w.allocs / 2} times again (its picture cleared)`);
        for (const c of w.changes.slice(0, 6)) {
          problems.push(
            `during "${c.step}" (frame ${c.frame}): stage ${c.stage}, board ${c.board}, HUD ${c.hud}, canvas ${c.px} (at first: stage ${w.first.stage}, board ${w.first.board}, HUD ${w.first.hud}, canvas ${w.first.px})`,
          );
        }
        if (w.changes.length > 6) problems.push(`… and ${w.changes.length - 6} more changes`);
        for (const e of page.errors) problems.push(`exception: ${e}`);
        console.log(
          `${name}: ${problems.length ? "FAILED" : "ok"} (board ${w.first.board.join(" ")}; ${w.frames} frames)`,
        );
        for (const p of problems) {
          console.log(`  ${p}`);
          failures.push(`${name}: ${p}`);
        }
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `layout: ${failures.length} problems in ${runs} runs` : `layout: ok (${runs} runs)`);
process.exit(failures.length ? 1 : 0);
