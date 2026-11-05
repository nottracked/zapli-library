// Checks of Back during a run in a headless Chrome, over the DevTools protocol (Node 22 or later, no packages):
//
//   CHROME=/path/to/chrome node apps/library/gridfire/dev/check-back.mjs
//
// Back is sent the way Zapli sends it: first the page's top modal <dialog> is asked to close (a cancel event, then
// close()), and only when none closed, one step back in the page's history; with no history left, Back would leave
// the app. The checks: Back during a run pauses it, Back on the pause screen plays on, End run ends the run, Save and
// exit keeps it, Back outside a run goes back through the screens to the start screen, a run that has just ended
// shows its results, a hidden page pauses, a page opened straight onto the play screen still pauses on Back, and many
// runs leave the history no longer than one run does.
//
// It copies index.html to a temporary folder with one extra line before boot() that exposes the run, the screen, the
// ship's wreck and the page's pause on leaving as window.__gf; the shipped file is never changed. Prints PASS or FAIL
// per check and exits with 1 when any fails.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "index.html"), "utf8");
const marker = "                boot();\n";
if (source.split(marker).length !== 2) throw new Error("index.html: expected exactly one boot() call");
const hook =
  "window.__gf = { get run() { return run; }, get route() { return route; }, wreck: () => wreck(), " +
  "background: () => onBackground() };\n";
const dir = mkdtempSync(join(tmpdir(), "litadlo-back-"));
const file = join(dir, "index.html");
writeFileSync(file, source.replace(marker, "                " + hook + marker));
const url = pathToFileURL(file).href;

const CHROME = process.env.CHROME;
if (!CHROME) throw new Error("Set CHROME to a Chrome or Chromium binary");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The browser and one DevTools connection.
const profile = mkdtempSync(join(tmpdir(), "litadlo-profile-"));
const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--mute-audio",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const wsUrl = await new Promise((resolve, reject) => {
  let err = "";
  proc.stderr.on("data", (d) => {
    err += d;
    const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  proc.on("exit", (code) => reject(new Error(`Chrome exited (${code}): ${err}`)));
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
  } else if (msg.method) for (const f of listeners) f(msg);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    waiting.set(++nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params, sessionId }));
  });

const errors = [];
async function openPage(hash, seed) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  listeners.push((msg) => {
    if (msg.sessionId === sessionId && msg.method === "Runtime.exceptionThrown")
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
  if (seed)
    await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `if (!sessionStorage.getItem("seeded")) { localStorage.setItem("gridfire.save", ${JSON.stringify(
        JSON.stringify(seed),
      )}); sessionStorage.setItem("seeded", "1"); }`,
    });
  await call("Page.navigate", { url: url + hash });
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Until the page has loaded, the browser turns each new address into a replacement of the current entry.
  for (let i = 0; i < 100 && (await evaluate("document.readyState")) !== "complete"; i++) await sleep(100);
  await sleep(500);
  const history = () => call("Page.getNavigationHistory");
  // Waits for the page to take what is queued: a dialog's close event, a step in its history and what follows. A
  // slow frame (software graphics) can hold them up for a while.
  const settle = async (ms) => {
    await sleep(ms);
    for (let i = 0; i < 2; i++)
      await evaluate("new Promise((r) => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 30)), 30))");
  };
  return {
    evaluate,
    history,
    async click(selector) {
      const ok = await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`,
      );
      if (!ok) check("there is a " + selector + " to tap", false, await this.state());
      await settle(150);
    },
    // Zapli's Back: the top modal dialog first, then the page's history, else the app is left.
    async back() {
      const closed = await evaluate(
        "(function(){var d=document.querySelectorAll('dialog[open]');" +
          "for(var i=d.length-1;i>=0;i--){var x=d[i];if(!x.matches(':modal'))continue;" +
          "if(x.dispatchEvent(new Event('cancel',{cancelable:true})))x.close();return !x.open;}" +
          "return false;})()",
      );
      if (closed === true) {
        await settle(150);
        return "dialog";
      }
      // The tab opened on about:blank first; that entry is outside the app.
      const h = await history();
      if (h.currentIndex > 0 && h.entries[h.currentIndex - 1].url.startsWith(url)) {
        await call("Page.navigateToHistoryEntry", { entryId: h.entries[h.currentIndex - 1].id });
        await settle(200);
        return "history";
      }
      return "leave";
    },
    state: () =>
      evaluate(`(() => {
        const g = window.__gf, r = g.run;
        const names = ["home", "levels", "play", "settings", "help", "hangar", "talents"];
        return {
          screen: names.find((n) => !document.getElementById("screen-" + n).hidden) || null,
          pause: document.getElementById("dlg-pause").open,
          result: document.getElementById("dlg-result").open,
          resultTitle: document.getElementById("res-h").textContent,
          continueShown: !document.getElementById("btn-continue").hidden,
          run: r ? { paused: r.paused, done: r.done, state: r.state, time: r.time, quit: Boolean(r.quit) } : null,
        };
      })()`),
    close: () => send("Target.closeTarget", { targetId }),
  };
}

const results = [];
const check = (name, ok, info) => results.push({ name, ok: Boolean(ok), info });
const running = (s) => s.screen === "play" && s.run && !s.run.paused && !s.run.done && !s.pause;
const pausedOnPlay = (s) => s.screen === "play" && s.run && s.run.paused && !s.run.done && s.pause;

const seed = {
  v: 1,
  settings: { sfx: false, music: false },
  progress: { unlocked: 8, seenHint: true },
};

// A run from the sectors list: Back pauses, Back plays on, and the run keeps time only while it runs.
const p = await openPage("#/", seed);
await p.click("#btn-play");
await p.click("#sector-list button.sector");
await sleep(600);
let s = await p.state();
check("a sector's run starts and runs", running(s), s);
const len0 = (await p.history()).entries.length;
let how = await p.back();
s = await p.state();
check("Back during a run pauses it on the play screen", how === "history" && pausedOnPlay(s), { how, s });
const t0 = s.run.time;
await sleep(500);
s = await p.state();
check("a paused run waits", s.run.time === t0, { before: t0, after: s.run.time });
how = await p.back();
s = await p.state();
check("Back on the pause screen plays on", how === "dialog" && running(s), { how, s });
await sleep(400);
s = await p.state();
check("the run goes on after Back", s.run.time > t0, { before: t0, after: s.run.time });
how = await p.back();
s = await p.state();
check("Back pauses the run again", how === "history" && pausedOnPlay(s), { how, s });
await p.click('#dlg-pause [data-close="resume"]');
s = await p.state();
check("Resume plays on", running(s), s);
await p.click("#btn-pause");
how = await p.back();
s = await p.state();
check("Back closes the pause screen the pause button opened", how === "dialog" && running(s), { how, s });
how = await p.back();
s = await p.state();
check("and Back pauses once more", how === "history" && pausedOnPlay(s), { how, s });

// End run: the run is over, its results show, and Back from them goes back to the sectors and the start screen.
await p.click('#dlg-pause [data-close="end"]');
s = await p.state();
check("End run ends the run and shows its results", s.result && s.run && s.run.done && s.run.quit, s);
how = await p.back();
s = await p.state();
check("Back on the results goes to the sectors", how === "dialog" && s.screen === "levels" && !s.run, { how, s });
check("an ended run leaves nothing to continue", !s.continueShown, s);
how = await p.back();
s = await p.state();
check("Back on the sectors goes to the start screen", how === "history" && s.screen === "home", { how, s });
how = await p.back();
check("Back on the start screen has nowhere to go in the page", how === "leave", { how });
const len1 = (await p.history()).entries.length;

// Save and exit keeps the run; Continue brings it back paused, and Back still pauses it.
await p.click("#btn-play");
await p.click("#sector-list button.sector");
await sleep(300);
await p.back();
await p.click('#dlg-pause [data-close="exit"]');
s = await p.state();
check("Save and exit goes to the sectors and keeps the run", s.screen === "levels" && s.run && !s.run.done, s);
await p.back();
s = await p.state();
check("the start screen offers to continue it", s.screen === "home" && s.continueShown, s);
await p.click("#btn-continue");
s = await p.state();
check("Continue shows the run paused", pausedOnPlay(s), s);
how = await p.back();
s = await p.state();
check("Back plays it on", how === "dialog" && running(s), { how, s });
how = await p.back();
s = await p.state();
check("Back pauses it again", how === "history" && pausedOnPlay(s), { how, s });

// Settings from the pause screen: Back comes back to the paused run.
await p.click('#dlg-pause [data-close="settings"]');
s = await p.state();
check("Settings opens from the pause screen", s.screen === "settings", s);
how = await p.back();
s = await p.state();
check("Back from the settings returns to the paused run", how === "history" && pausedOnPlay(s), { how, s });
how = await p.back();
s = await p.state();
check("and Back plays on", how === "dialog" && running(s), { how, s });

// A hidden page pauses the run.
await p.evaluate("window.__gf.background()");
s = await p.state();
check("a hidden page pauses the run", pausedOnPlay(s), s);
await p.back();

// Back while the run's last moments play out shows the results at once.
await p.evaluate("window.__gf.wreck()");
await sleep(100);
s = await p.state();
const ending = s.run && s.run.state === "over" && !s.run.done && !s.result;
how = await p.back();
s = await p.state();
check("Back after the hull breaks shows the results at once", ending && s.result && s.run.done, { how, s });
await p.click('#dlg-result [data-close="sectors"]');
s = await p.state();
check("Sectors on the results goes to the sectors", s.screen === "levels", s);
await p.back();
s = await p.state();
check("and Back goes to the start screen", s.screen === "home", s);

// Many runs, each paused and resumed several times and ended in a different way: the history does not grow.
const lengths = [];
for (let i = 0; i < 12; i++) {
  await p.click("#btn-play");
  await p.click("#sector-list button.sector");
  await sleep(150);
  for (let k = 0; k < 3; k++) {
    await p.back();
    await p.back();
  }
  await p.click("#btn-pause");
  await p.click('#dlg-pause [data-close="resume"]');
  await p.back();
  if (i % 3 === 0) {
    await p.click('#dlg-pause [data-close="end"]');
    await p.click('#dlg-result [data-close="retry"]');
    await p.back();
    await p.click('#dlg-pause [data-close="end"]');
    await p.click('#dlg-result [data-close="sectors"]');
  } else if (i % 3 === 1) {
    await p.click('#dlg-pause [data-close="restart"]');
    await p.back();
    await p.click('#dlg-pause [data-close="exit"]');
  } else {
    await p.click('#dlg-pause [data-close="end"]');
    await p.back();
  }
  s = await p.state();
  if (s.screen !== "levels") check(`run ${i + 1} ends on the sectors`, false, s);
  await p.back();
  lengths.push((await p.history()).entries.length);
}
s = await p.state();
check("after many runs Back still reaches the start screen", s.screen === "home", s);
check(
  "the history does not grow over many runs",
  Math.max(...lengths) <= Math.max(len0, len1) && lengths.every((n) => n === lengths[0]),
  { oneRun: len0, afterFirst: len1, perRun: lengths },
);
// A run left saved for the next page.
await p.click("#btn-play");
await p.click("#sector-list button.sector");
await sleep(300);
await p.click("#btn-pause");
await p.click('#dlg-pause [data-close="exit"]');
await p.close();

// A page opened straight onto the play screen (as after the phone turns): the saved run waits, Back plays it on,
// Back pauses it, and Save and exit leaves no way back into the play screen.
const q = await openPage("#/play", null);
s = await q.state();
check("a page opened on the play screen shows the saved run paused", pausedOnPlay(s), s);
how = await q.back();
s = await q.state();
check("Back plays it on", how === "dialog" && running(s), { how, s });
how = await q.back();
s = await q.state();
check("Back pauses it, with no screen before it in the page", how === "history" && pausedOnPlay(s), { how, s });
await q.click('#dlg-pause [data-close="exit"]');
s = await q.state();
check("Save and exit goes to the sectors", s.screen === "levels", s);
how = await q.back();
s = await q.state();
check("Back there has nowhere to go in the page", how === "leave" && s.screen === "levels", { how, s });
await q.close();

check("no page errors", errors.length === 0, errors);
ws.close();
proc.kill();
await sleep(200);
rmSync(dir, { recursive: true, force: true });
rmSync(profile, { recursive: true, force: true });

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : " " + JSON.stringify(r.info)}`);
}
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
