// Development only (not shipped): the headless browser the checks in dev/ drive. It serves the built index.html from a small local
// web server (modules load only from a web address), starts Chromium (CHROME, or Playwright's cached headless shell,
// or Google Chrome) and drives it over the DevTools protocol with Node's own WebSocket. dev/fake-zapli.js stands in
// for Zapli's bridge, seeded with cards, so the page runs its phone path.
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { sampleCards } from "./src/js/sample.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts the server and the browser; returns {page(options), close()}. Screenshots go to `out`. */
export async function startBrowser({ out = tmpdir() } = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  // The app as it ships: the built index.html in the app's folder, checked against dev/src first.
  try {
    execFileSync(process.execPath, [join(here, "build.mjs"), "--check"], { stdio: "pipe" });
  } catch {
    throw new Error("index.html is not what dev/src builds: run node dev/build.mjs first.");
  }
  const PKG = resolve(here, "..");
  const CANDIDATES = [
    process.env.CHROME,
    join(
      homedir(),
      "Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const CHROME = CANDIDATES.find((p) => existsSync(p));
  if (!CHROME) throw new Error("No Chromium: set CHROME to a chrome or chrome-headless-shell binary.");

  const TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".json": "application/json",
  };
  const FAKE = readFileSync(join(here, "fake-zapli.js"), "utf8");
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = normalize(join(PKG, path === "/" ? "index.html" : path));
    if (!file.startsWith(PKG) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ORIGIN = `http://127.0.0.1:${server.address().port}`;

  // ---- a minimal DevTools protocol client
  const profile = mkdtempSync(join(tmpdir(), "loyalty-shots-"));
  const proc = spawn(
    CHROME,
    [
      "--headless",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--hide-scrollbars",
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const wsUrl = await new Promise((resolveUrl, reject) => {
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolveUrl(m[1]);
    });
    proc.on("exit", (code) => reject(new Error(`Chromium exited (${code}): ${err}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let nextId = 0;
  const waiting = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const w = msg.id && waiting.get(msg.id);
    if (w) {
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
      else w.resolve(msg.result);
    } else if (msg.method) listeners.forEach((f) => f(msg));
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      waiting.set(++nextId, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id: nextId, method, params, sessionId }));
    });

  async function page({
    width = 360,
    height = 800,
    look = "light",
    text = 100,
    lang = "en-GB",
    live = true,
    seed = sampleCards(),
    // The app's settings as a user set them (null: never touched, so their defaults).
    settings = null,
  }) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    const errors = [];
    listeners.push((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Runtime.exceptionThrown")
        errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
        errors.push(msg.params.args.map((a) => a.value || a.description).join(" "));
    });
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2.75, mobile: true });
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: look }] });
    await call("Emulation.setLocaleOverride", { locale: lang }).catch(() => {});
    const boot = [
      `try { localStorage.clear(); sessionStorage.removeItem("__fakeZapli"); } catch (e) {}`,
      `window.__locale = ${JSON.stringify(lang)};`,
      `window.__seedCards = ${JSON.stringify(seed)};`,
      `window.__settings = ${JSON.stringify(settings)};`,
      live ? FAKE : "",
      `new MutationObserver((m, o) => { if (!document.head) return; o.disconnect(); const s = document.createElement("style"); s.textContent = ":root{-webkit-text-size-adjust:${text}% !important}"; document.head.prepend(s); }).observe(document, { childList: true, subtree: true });`,
    ].join("\n");
    let { identifier } = await call("Page.addScriptToEvaluateOnNewDocument", { source: boot });
    // A load waits for its event, or 8 s at most, so one stuck page never stops the run.
    const loaded = () =>
      new Promise((r) => {
        const f = (msg) => {
          if (msg.sessionId !== sessionId || msg.method !== "Page.loadEventFired") return;
          listeners.splice(listeners.indexOf(f), 1);
          r();
        };
        listeners.push(f);
        setTimeout(r, 8000);
      });
    let loads = 0;
    const evaluate = async (expression) => {
      const r = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    return {
      errors,
      async open(hash = "") {
        const l = loaded();
        // A new query each time, so every open is a new document (a reload), never a jump within the page.
        await call("Page.navigate", { url: `${ORIGIN}/index.html?load=${++loads}${hash}` });
        await l;
        // Only the first load starts from nothing: a reload keeps the records, as a phone does.
        await call("Page.removeScriptToEvaluateOnNewDocument", { identifier });
        ({ identifier } = await call("Page.addScriptToEvaluateOnNewDocument", {
          source: boot.replace(`sessionStorage.removeItem("__fakeZapli");`, ""),
        }));
        await sleep(500);
      },
      eval: evaluate,
      /** A real mouse event at (x, y) in CSS pixels: "mousePressed", "mouseMoved" or "mouseReleased". */
      mouse: (type, x, y) =>
        call("Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button: type === "mouseMoved" ? "none" : "left",
          buttons: type === "mouseReleased" ? 0 : 1,
          clickCount: 1,
        }),
      /** The centre of the first element `selector` finds, after scrolling it into view. */
      center: (selector) =>
        evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
        ),
      async click(selector) {
        const ok = await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`,
        );
        if (!ok) throw new Error("No element " + selector);
        await sleep(450);
      },
      async shot(name) {
        await sleep(250);
        const r = await call("Page.captureScreenshot", { format: "png" });
        const file = join(out, name + ".png");
        writeFileSync(file, Buffer.from(r.data, "base64"));
        console.log("  wrote", file);
      },
      /** Any DevTools call on this page (touch input, the accessibility tree, the navigation history). */
      cdp: call,
      /** The page's history as the browser keeps it: {currentIndex, entries: [{url}]}. */
      navigation: () => call("Page.getNavigationHistory"),
      close: () => send("Target.closeTarget", { targetId }),
    };
  }

  return {
    page,
    async close() {
      await send("Browser.close").catch(() => {});
      proc.kill();
      server.close();
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
