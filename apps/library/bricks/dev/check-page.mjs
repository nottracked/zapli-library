// Checks the page without a browser (Node 22), on the stand-in of dev/fake-dom.mjs. Each scenario runs in a fresh
// process and fails on any exception:
//  - every element the code looks up by id exists in index.html, once;
//  - browser: the start screen, the level picker (a locked level explains itself), a level started, a drag and a lift
//    that launch, Back that pauses and Back again that plays on, Save and leave, Resume from the start screen;
//  - clear: a saved game one brick from the end, resumed and cleared: three stars, the next level opens, Next level;
//  - reload: a result on screen when the page reloads (the phone turned) is shown again, and only then;
//  - over: a saved game on its last ball, lost: Out of balls, Try again starts afresh with three balls;
//  - skip: a level lost the second time offers to skip it, which opens the next one;
//  - endless: a saved run resumed, a wave cleared and the next wave started, a new run that asks first and records
//    the old one;
//  - flows: a daily level cleared, with the start screen's card and streak after it;
//  - zapli: inside a stand-in Zapli (its store, haptics, pause event, a Slovak phone): Slovak texts, the vibration
//    switch, the store used, and the app's pause event saving the game;
//  - modes: the daily level and endless play start, pause on Back and offer to resume from the start screen;
//  - settings: switching the language and the light or dark menus.
// Run: node dev/check-page.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const scenario = process.argv[2];

if (!scenario) {
  // ---- ids, then every scenario in its own process
  const problems = [];
  const html = readFileSync(join(pkg, "index.html"), "utf8");
  const ids = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) problems.push(`id "${id}" appears ${n} times in index.html`);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".mjs")) {
        const code = readFileSync(path, "utf8");
        for (const m of code.matchAll(/(?:\$|getElementById)\(\s*"([^"]+)"\s*\)/g)) {
          if (!ids.has(m[1])) problems.push(`${entry.name} looks up "#${m[1]}", which index.html does not have`);
        }
        for (const m of code.matchAll(/\$\(`([^`$]+)\$\{/g)) void m;
      }
    }
  };
  walk(join(pkg, "js"));
  for (const s of ["browser", "clear", "reload", "over", "skip", "endless", "flows", "zapli", "modes", "settings"]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), s], { encoding: "utf8" });
    if (r.status !== 0) problems.push(`scenario ${s} failed:\n${(r.stdout + r.stderr).trim()}`);
    else console.log(`scenario ${s}: ok`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("page: ok");
  process.exit(0);
}

const { loadPage, install, advance, FakeEvent, doc } = await import("./fake-dom.mjs");
const problems = [];
const check = (cond, what) => {
  if (!cond) problems.push(what);
};
process.on("uncaughtException", (e) => {
  console.error(`exception: ${e && e.stack}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error(`unhandled rejection: ${e && e.stack}`);
  process.exit(1);
});

loadPage(join(pkg, "index.html"));
const $ = (id) => doc.getElementById(id);

// ---- a saved game, made with the game's own code
const G = await import("../package/js/game/game.mjs");
const A = await import("../package/js/game/arena.mjs");
const { levelById, worldOf } = await import("../package/js/game/levels.mjs");

function savedNearClear() {
  const l = levelById("1-1");
  const w = worldOf(l);
  const g = G.createGame({ def: l, speed: w.speed, power: [], drop: 0, seed: 5, lives: 3 });
  const keep = g.bricks.find((b) => b.row === 4 && b.col === 6);
  for (const b of g.bricks) if (b !== keep) b.alive = false;
  g.left = 1;
  g.phase = "play";
  g.balls = [
    {
      x: (keep.x0 + keep.x1) / 2,
      y: keep.y1 + 60,
      vx: 0,
      vy: -300,
      r: A.BALL_R,
      held: false,
      off: 0,
      heldT: 0,
      idle: 0,
      sticky: false,
    },
  ];
  return G.snapshot(g);
}

function savedLastBall() {
  const l = levelById("1-1");
  const w = worldOf(l);
  const g = G.createGame({ def: l, speed: w.speed, power: [], drop: 0, seed: 5, lives: 1 });
  g.phase = "play";
  g.paddle.x = g.paddle.tx = 320;
  g.balls = [
    { x: 30, y: A.PADDLE_Y + 20, vx: 0, vy: 300, r: A.BALL_R, held: false, off: 0, heldT: 0, idle: 0, sticky: false },
  ];
  return G.snapshot(g);
}

const { makeLevel, dailyDifficulty, waveDifficulty } = await import("../package/js/game/generate.mjs");
const { isoDay, weekday } = await import("../package/js/core/dates.mjs");

/** A saved game of any level: one brick left with the ball on its way to it, or the last ball falling past. */
function savedOf(def, lives, end) {
  const g = G.createGame({ def, speed: 300, power: [], drop: 0, seed: 5, lives });
  g.phase = "play";
  if (end === "clear") {
    const keep = g.bricks.find((b) => b.kind !== "iron" && b.move < 0 && b.max === 1);
    for (const b of g.bricks) if (b !== keep) b.alive = false;
    g.left = 1;
    const x = (keep.x0 + keep.x1) / 2;
    g.balls = [
      { x, y: keep.y1 + 40, vx: 0, vy: -300, r: A.BALL_R, held: false, off: 0, heldT: 0, idle: 0, sticky: false },
    ];
  } else {
    g.paddle.x = g.paddle.tx = 320;
    g.balls = [
      { x: 30, y: A.PADDLE_Y + 20, vx: 0, vy: 300, r: A.BALL_R, held: false, off: 0, heldT: 0, idle: 0, sticky: false },
    ];
  }
  return G.snapshot(g);
}

// ---- the host, for the zapli scenario
const kvSets = [];
const haptics = [];
const appHandlers = {};
const zapli = {
  ready: Promise.resolve(),
  supports: (m) => m === "haptics.impact",
  app: {
    locale: () => "sk-SK",
    on: (name, fn) => {
      appHandlers[name] = fn;
    },
  },
  haptics: {
    impact: (kind) => {
      haptics.push(kind);
      return Promise.resolve();
    },
  },
  data: {
    kv: (() => {
      const m = new Map();
      return {
        get: async (k) => m.get(k),
        set: async (k, v) => {
          kvSets.push(k);
          m.set(k, JSON.parse(JSON.stringify(v)));
        },
        delete: async (k) => m.delete(k),
        keys: async () => Array.from(m.keys()),
      };
    })(),
  },
};

const env = install(scenario === "zapli" ? { zapli } : {});
// Layout: a 390 × 844 phone; the play area under a 64 px bar.
$("stage").clientWidth = 390;
$("stage").clientHeight = 700;
$("stage").box = { left: 0, top: 64, width: 390, height: 700 };
$("logo").box = { left: 16, top: 70, width: 358, height: 175 };

if (scenario === "clear") {
  env.storage.set("bricks/saved", JSON.stringify({ level: { id: "1-1", seed: 7, snap: savedNearClear() }, at: 5 }));
  env.win.history.replaceState({ d: 0 }, "", "#/");
  env.win.history.pushState({ d: 1, from: "#/" }, "", "#/play/level/1-1");
}
if (scenario === "reload") {
  const info = { kind: "clear", title: "Level clear!", stars: 2, figures: [["resultScore", 1234]], next: "1-2" };
  const result = { hash: "#/play/level/1-1", at: Date.now() - 1000, info };
  env.storage.set("bricks/saved", JSON.stringify({ result, at: 5 }));
  env.storage.set(
    "bricks/progress",
    JSON.stringify({ levels: { "1-1": { stars: 2, best: 1234, cleared: true } }, at: 5 }),
  );
  env.win.history.replaceState({ d: 0 }, "", "#/");
  env.win.history.pushState({ d: 1, from: "#/" }, "", "#/play/level/1-1");
}
if (scenario === "skip") {
  env.storage.set("bricks/saved", JSON.stringify({ level: { id: "1-1", seed: 7, snap: savedLastBall() }, at: 5 }));
  env.storage.set("bricks/progress", JSON.stringify({ levels: { "1-1": { fails: 1 } }, at: 5 }));
  env.win.history.replaceState({ d: 0 }, "", "#/levels/1");
  env.win.history.pushState({ d: 1, from: "#/levels/1" }, "", "#/play/level/1-1");
}
if (scenario === "endless") {
  const w1 = makeLevel("endless:42:1", waveDifficulty(1));
  const snap = savedOf(w1, 2, "clear");
  env.storage.set(
    "bricks/saved",
    JSON.stringify({ endless: { runSeed: 42, wave: 1, lives: 2, score: 100, seed: 4, snap }, at: 5 }),
  );
  env.win.history.replaceState({ d: 0 }, "", "#/");
}
if (scenario === "flows") {
  const day = isoDay(new Date());
  const ddef = makeLevel(`daily:${day}`, dailyDifficulty(weekday(day)));
  env.storage.set("bricks/saved", JSON.stringify({ daily: { day, seed: 3, snap: savedOf(ddef, 3, "clear") }, at: 5 }));
  env.storage.set("bricks/progress", JSON.stringify({ levels: { "1-1": { fails: 1 } }, at: 5 }));
  env.win.history.replaceState({ d: 0 }, "", "#/");
}
if (scenario === "over") {
  env.storage.set("bricks/saved", JSON.stringify({ level: { id: "1-1", seed: 7, snap: savedLastBall() }, at: 5 }));
  env.win.history.replaceState({ d: 0 }, "", "#/levels/1");
  env.win.history.pushState({ d: 1, from: "#/levels/1" }, "", "#/play/level/1-1");
}

await import("../package/js/main.mjs");
await advance(300);

const shown = (name) => !$(`screen-${name}`).hidden;
const pointer = (type, x, id = 1) =>
  $("screen-play").dispatchEvent(
    new FakeEvent(type, { pointerId: id, clientX: x, clientY: 600, pointerType: "touch" }),
  );

if (scenario === "browser") {
  check(shown("home") && !shown("play") && !shown("levels"), "the start screen is not the one shown at start");
  check($("play-title").textContent === "Play", `Play button reads "${$("play-title").textContent}"`);
  check($("play-sub").textContent === "Level 1-1 · First light", `Play button's line: "${$("play-sub").textContent}"`);
  check(!$("first-line").hidden, "the first-start line is hidden on a first start");
  check($("daily-week").children.length === 7, "the daily card does not show the seven days of the week");

  $("btn-levels").click();
  await advance(100);
  check(env.win.location.hash === "#/levels/1", `levels at ${env.win.location.hash}`);
  check(shown("levels"), "the level picker is not shown");
  const tiles = $("level-grid").children.map((li) => li.children[0]);
  check(tiles.length === 12, `${tiles.length} level tiles`);
  check(
    !tiles[0].classList.contains("locked") && tiles[1].classList.contains("locked"),
    "level 1 open, level 2 locked",
  );
  check($("world-tabs").children.length === 4, "four world tabs");
  tiles[1].click();
  check(/1-1/.test($("levels-notice").textContent), `a locked level says: "${$("levels-notice").textContent}"`);

  tiles[0].click();
  await advance(200);
  check(env.win.location.hash === "#/play/level/1-1", `play at ${env.win.location.hash}`);
  check(shown("play"), "the play screen is not shown");
  check($("hud-title").textContent === "First light", `HUD title "${$("hud-title").textContent}"`);
  check($("hud-lives").children.length === 3, "three balls at the start");
  const canvas = $("arena");
  check(canvas.width > 300 && canvas.height > canvas.width, `arena canvas ${canvas.width} × ${canvas.height}`);

  pointer("pointerdown", 200);
  pointer("pointermove", 120);
  pointer("pointermove", 90);
  pointer("pointerup", 90);
  await advance(1500);
  check($("hud-score").textContent !== "", "the score is shown");

  // Back pauses and stays.
  env.win.history.back();
  await advance(100);
  check($("dlg-pause").open, "Back during play did not pause");
  check(env.win.location.hash === "#/play/level/1-1", `after the first Back the page is at ${env.win.location.hash}`);
  // Back on the pause card (in Zapli, Back closes the open card): the game plays on.
  $("dlg-pause").close();
  await advance(200);
  check(shown("play") && !$("dlg-pause").open, "Back on the pause card did not play on");
  check(env.win.location.hash === "#/play/level/1-1", `after Back on the card the page is at ${env.win.location.hash}`);
  // In a browser Back moves through the history instead: the first pauses, the second plays on too.
  env.win.history.back();
  await advance(100);
  check($("dlg-pause").open, "a second Back during play did not pause");
  env.win.history.back();
  await advance(100);
  check(shown("play") && !$("dlg-pause").open, "a browser's Back on the pause card did not play on");
  // Leaving is the card's own button: the game is saved and the page returns to the picker it came from.
  $("btn-pause").click();
  $("pause-leave").click();
  await advance(200);
  check(shown("levels"), "Save and leave did not return to the level picker it came from");
  $("btn-levels-back").click();
  await advance(200);
  check(shown("home"), "Back from the level picker did not return to the start screen");
  check(
    $("play-title").textContent === "Resume",
    `after leaving, the Play button reads "${$("play-title").textContent}"`,
  );
  const saved = JSON.parse(env.storage.get("bricks/saved") || "{}");
  check(saved.level && saved.level.id === "1-1" && saved.level.snap, "the game was not saved on leaving");

  $("btn-play").click();
  await advance(200);
  check(shown("play") && $("dlg-pause").open, "Resume did not open the saved game, paused");
  $("pause-resume").click();
  await advance(200);
  check(!$("dlg-pause").open, "Resume did not close the pause card");
  // Keys move and launch too.
  env.win.dispatchEvent(new FakeEvent("keydown", { key: "ArrowLeft" }));
  await advance(200);
  env.win.dispatchEvent(new FakeEvent("keyup", { key: "ArrowLeft" }));
  env.win.dispatchEvent(new FakeEvent("keydown", { key: "p" }));
  await advance(50);
  check($("dlg-pause").open, "P did not pause");
  $("pause-restart").click();
  await advance(100);
  check(!$("dlg-pause").open && shown("play"), "Restart did not start the level again");
}

if (scenario === "clear") {
  check(shown("play") && $("dlg-pause").open, "a saved game did not open paused");
  $("pause-resume").click();
  await advance(3500);
  check($("dlg-result").open, "clearing the level showed no result");
  check($("result-title").textContent === "Level clear!", `result title "${$("result-title").textContent}"`);
  const on = $("result-stars").children.filter((s) => /\bon\b/.test(s.attributes.class || "")).length;
  check(on === 3, `${on} stars for a level cleared without losing a ball`);
  check($("result-main").textContent === "Next level", `main button "${$("result-main").textContent}"`);
  const progress = JSON.parse(env.storage.get("bricks/progress") || "{}");
  check(progress.levels && progress.levels["1-1"] && progress.levels["1-1"].stars === 3, "the stars were not saved");
  $("result-main").click();
  await advance(300);
  check(env.win.location.hash === "#/play/level/1-2", `Next level went to ${env.win.location.hash}`);
  check($("hud-title").textContent === "Valley", `the next level is "${$("hud-title").textContent}"`);
  check(!$("dlg-result").open, "the result stayed open");
  // Back from the new level pauses; the way back leads to the start screen it came from.
  env.win.history.back();
  await advance(100);
  check($("dlg-pause").open, "Back did not pause the next level");
  $("pause-leave").click();
  await advance(200);
  check(shown("home"), "leaving the next level did not return to the start screen it came from");
  check(
    $("play-sub").textContent === "Level 1-2 · Valley",
    `the Play button now offers "${$("play-sub").textContent}"`,
  );
}

if (scenario === "reload") {
  check(
    $("dlg-result").open && $("result-title").textContent === "Level clear!",
    "a result was not shown again after a reload",
  );
  $("dlg-result").close();
  await advance(200);
  check(shown("levels"), "Back on the shown-again result did not leave for the level picker");
  $("level-grid").children[0].children[0].click();
  await advance(200);
  check(shown("play") && !$("dlg-result").open, "a later visit to the level showed the old result");
}

if (scenario === "skip") {
  $("pause-resume").click();
  await advance(3000);
  check($("result-title").textContent === "Out of balls", "no result after the second loss");
  check($("result-second").textContent === "Skip this level", `second button "${$("result-second").textContent}"`);
  $("result-second").click();
  await advance(300);
  check(env.win.location.hash === "#/play/level/1-2", `skip went to ${env.win.location.hash}`);
  const progress = JSON.parse(env.storage.get("bricks/progress") || "{}");
  check(progress.levels["1-1"].skipped === true && progress.levels["1-1"].fails === 2, "the skip was not saved");
  $("btn-pause").click();
  $("pause-leave").click();
  await advance(300);
  check(shown("levels"), "leaving the skipped-to level did not return to the picker");
  const tiles = $("level-grid").children.map((li) => li.children[0]);
  check(
    tiles[0].classList.contains("skipped") && !tiles[1].classList.contains("locked"),
    "the picker does not show the skip",
  );
}

if (scenario === "endless") {
  $("btn-endless").click();
  await advance(300);
  check($("dlg-pause").open && $("hud-sub").textContent === "Wave 1", "the saved run did not open paused at wave 1");
  $("pause-resume").click();
  await advance(4000);
  check($("hud-sub").textContent === "Wave 2", `after clearing wave 1 the HUD says "${$("hud-sub").textContent}"`);
  check(!$("dlg-result").open, "a wave clear showed a result");
  $("btn-pause").click();
  $("pause-leave").click();
  await advance(300);
  check(/wave 2/i.test($("endless-sub").textContent), `endless card: "${$("endless-sub").textContent}"`);
  // End the run from the pause card: it asks first.
  $("btn-endless").click();
  await advance(300);
  $("pause-restart").click();
  await advance(50);
  check($("dlg-confirm").open, "a new run did not ask first");
  $("confirm-yes").click();
  await advance(300);
  check(!$("dlg-pause").open && $("hud-sub").textContent === "Wave 1", "the new run did not start at wave 1");
  const endless = JSON.parse(env.storage.get("bricks/endless") || "{}");
  check(endless.runs === 1 && endless.best > 0, `the ended run was not recorded: ${JSON.stringify(endless)}`);
}

if (scenario === "flows") {
  // A daily level cleared.
  $("btn-daily").click();
  await advance(300);
  check($("dlg-pause").open, "the saved daily level did not open paused");
  $("pause-resume").click();
  await advance(3000);
  check($("result-title").textContent === "Daily level cleared!", `daily result "${$("result-title").textContent}"`);
  check($("result-main").textContent === "Home", `daily main button "${$("result-main").textContent}"`);
  $("result-main").click();
  await advance(300);
  check(
    shown("home") && /^Cleared/.test($("daily-state").textContent),
    `daily card after: "${$("daily-state").textContent}"`,
  );
  check(!$("daily-streak").hidden, "no streak after a cleared daily level");
}

if (scenario === "over") {
  $("pause-resume").click();
  await advance(3000);
  check($("dlg-result").open, "losing the last ball showed no result");
  check($("result-title").textContent === "Out of balls", `result title "${$("result-title").textContent}"`);
  check(/bricks left/.test($("result-note").textContent), `result note "${$("result-note").textContent}"`);
  check($("result-main").textContent === "Try again", `main button "${$("result-main").textContent}"`);
  $("result-main").click();
  await advance(300);
  check(!$("dlg-result").open && shown("play"), "Try again did not start the level again");
  check($("hud-lives").children.length === 3, "Try again did not start with three balls");
}

if (scenario === "zapli") {
  await advance(500);
  check($("play-title").textContent === "Hrať", `a Slovak phone shows "${$("play-title").textContent}"`);
  check(env.win.document.title === "Bricks", "the name is translated");
  $("btn-settings").click();
  check($("dlg-settings").open, "Settings did not open");
  check(!$("opt-vibration-row").hidden, "the vibration switch is hidden with haptics present");
  $("settings-done").click();
  $("btn-play").click();
  await advance(300);
  check(shown("play"), "play did not start");
  pointer("pointerdown", 200);
  pointer("pointerup", 200);
  await advance(400);
  check(haptics.length > 0, "no vibration on the launch");
  check(typeof appHandlers.pause === "function", "the page does not listen to the app's pause");
  appHandlers.pause();
  await advance(800);
  check($("dlg-pause").open, "the app's pause did not pause the game");
  check(kvSets.includes("bricks/saved"), "the game was not saved to the app's store");
}

if (scenario === "modes") {
  $("btn-daily").click();
  await advance(300);
  check(env.win.location.hash === "#/play/daily", `daily at ${env.win.location.hash}`);
  check($("hud-title").textContent === "Daily level", `daily HUD "${$("hud-title").textContent}"`);
  env.win.history.back();
  await advance(100);
  $("pause-leave").click();
  await advance(300);
  check(shown("home"), "Save and leave did not return to the start screen");
  check($("daily-state").textContent === "Resume today's level", `daily card: "${$("daily-state").textContent}"`);
  $("btn-endless").click();
  await advance(300);
  check(
    $("hud-title").textContent === "Endless" && $("hud-sub").textContent === "Wave 1",
    "endless did not start at wave 1",
  );
  $("btn-pause").click();
  $("pause-leave").click();
  await advance(300);
  check(/wave 1/i.test($("endless-sub").textContent), `endless card: "${$("endless-sub").textContent}"`);
  $("btn-stats").click();
  check($("dlg-stats").open && $("stats-list").children.length >= 20, "statistics did not open with its rows");
  $("stats-done").click();
  $("btn-help").click();
  check($("dlg-help").open, "How to play did not open");
  check(
    $("legend-bricks").children.length === 7 && $("legend-powers").children.length === 8,
    "the legends are incomplete",
  );
  check($("first-line").hidden, "the first-start line stays after How to play was opened");
}

if (scenario === "settings") {
  $("btn-settings").click();
  const sk = doc.querySelectorAll('input[name="ui"]').find((el) => el.value === "sk");
  sk.click();
  await advance(100);
  check($("settings-title").textContent === "Nastavenia", `settings title "${$("settings-title").textContent}"`);
  check(env.win.document.documentElement.lang === "sk", "the page's language did not change");
  const dark = doc.querySelectorAll('input[name="theme"]').find((el) => el.value === "dark");
  dark.click();
  await advance(50);
  check(env.win.document.documentElement.dataset.theme === "dark", "the dark menus were not applied");
  $("settings-done").click();
  check(
    $("play-title").textContent === "Hrať",
    `after switching, the Play button reads "${$("play-title").textContent}"`,
  );
  const saved = JSON.parse(env.storage.get("bricks/settings") || "{}");
  check(saved.ui === "sk" && saved.theme === "dark", "the settings were not saved");
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
process.exit(0);
