// Checks of Glowmere's game rules in a headless browser.
//
//   npm install --no-save playwright-core
//   CHROME=/path/to/chrome node apps/library/gridfire/dev/check-rules.mjs
//
// It copies index.html to a temporary folder with one extra line before boot() that exposes the game's internals as
// window.__gf, then drives the rules directly: the start, each enemy's behaviour, the nova, charges, the multiplier
// meter, the hull, a save from the version before (ships and bombs) and a soak of every sector. The shipped file is
// never changed. Prints PASS or FAIL per check and exits with 1 when any check fails.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "index.html"), "utf8");
const marker = "                boot();\n";
if (source.split(marker).length !== 2) throw new Error("index.html: expected exactly one boot() call");
const hook =
  "window.__gf = { get run() { return run; }, world, makeEnemy, addGuard, guardsOf, killEnemy, useBomb, hurtHull, " +
  "mkBullet, updateGame, startRun, choosePick, POOL, Beat, volley, beamTick, syn, dropCapsule, bankRun, tapTalent, " +
  "currentLoadout, pointsFree, pointsSpent, levelFor, xpForLevel, get M() { return M; } };\n";
const dir = mkdtempSync(join(tmpdir(), "glowmere-"));
const file = join(dir, "index.html");
writeFileSync(file, source.replace(marker, "                " + hook + marker));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
const errors = [];
const check = (name, ok, info) => results.push({ name, ok, info });
async function page(save) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.addInitScript((s) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("gridfire.save", s);
      sessionStorage.setItem("seeded", "1");
    }
  }, JSON.stringify(save));
  return { ctx, p };
}
const quiet = { sfx: false, music: false };

// The rules, with the ship's own aiming off so only the test's shots fly.
{
  const { ctx, p } = await page({
    v: 1,
    settings: { ...quiet, autoAim: false },
    progress: { unlocked: 8, seenHint: true },
  });
  await p.goto("file://" + file + "#/");
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const g = window.__gf,
      w = g.world,
      out = {};
    const steps = (n) => {
      for (let i = 0; i < n; i++) g.updateGame(1 / 60);
    };
    const reset = () => {
      g.startRun(0);
      g.run.queue.length = 0;
      w.enemies.length = 0;
      w.bullets.length = 0;
      w.p.x = 0;
      w.p.y = 0;
      w.p.inv = 99;
    };
    reset();
    out.start = { hull: g.run.hull, charges: g.run.charges, mult: g.run.mult };
    // A pouncer closes in by leaps on the beat.
    let e = g.makeEnemy("pouncer", 0, -320, { spawn: 0 });
    w.enemies.push(e);
    let leaps = 0,
      prev = 0;
    for (let i = 0; i < 150; i++) {
      g.updateGame(1 / 60);
      if (e.leap > prev + 0.5) leaps++;
      prev = e.leap;
    }
    out.pouncer = { leaps, d: Math.round(Math.hypot(e.x, e.y)) };
    // A shieldback turns a shot from the front aside and is hurt by one from behind.
    reset();
    e = g.makeEnemy("shieldback", 0, -200, { spawn: 0, ang: Math.PI / 2 });
    w.enemies.push(e);
    g.run.speed = 0.0001;
    w.bullets.push(g.mkBullet(0, -120, 0, -980, 1, null));
    steps(12);
    out.shieldFront = { hp: e.hp, vy: w.bullets.length ? Math.sign(w.bullets[0].vy) : 0 };
    e.ang = Math.PI / 2;
    w.bullets.length = 0;
    w.bullets.push(g.mkBullet(0, -300, 0, 980, 1, null));
    steps(12);
    out.shieldBack = e.hp;
    // A warden takes no damage while a guard is left, opens when they are gone, and grows a guard back.
    reset();
    e = g.makeEnemy("warden", 0, -250, { spawn: 0 });
    w.enemies.push(e);
    for (let k = 0; k < 3; k++) g.addGuard(e, (k * Math.PI * 2) / 3 + 0.5).spawn = 0;
    g.run.speed = 0.0001;
    steps(5);
    w.bullets.push(g.mkBullet(0, -150, 0, -980, 1, null));
    steps(8);
    const guardedHp = e.hp;
    for (const x of w.enemies.slice()) if (x.type === "guard") g.killEnemy(x);
    steps(3);
    const open = e.open;
    w.bullets.length = 0;
    w.bullets.push(g.mkBullet(0, -150, 0, -980, 1, null));
    steps(8);
    const openHp = e.hp;
    steps(60 * 6);
    out.warden = { guardedHp, open, openHp, regrown: g.guardsOf(e), closed: !e.open };
    // A sower flings petals that become fragments, a petal fewer each time.
    reset();
    e = g.makeEnemy("sower", 0, -300, { spawn: 0 });
    w.enemies.push(e);
    steps(60 * 5);
    out.sower = { hp: e.hp, fragments: w.enemies.filter((x) => x.type === "fragment").length };
    // A nova uses a charge and clears the pool.
    reset();
    for (let k = 0; k < 6; k++)
      w.enemies.push(g.makeEnemy("pouncer", Math.cos(k) * 450, Math.sin(k) * 450, { spawn: 0 }));
    g.useBomb();
    steps(60);
    out.nova = { charges: g.run.charges, left: w.enemies.length };
    // Charges fill from kills: 24 pouncers make one.
    reset();
    g.run.charges = 0;
    for (let k = 0; k < 30; k++) {
      const x = g.makeEnemy("pouncer", 100, 100, { spawn: 0 });
      w.enemies.push(x);
      g.killEnemy(x);
    }
    out.charges = { charges: g.run.charges, fill: Math.round(g.run.chargeFill * 100) / 100 };
    // Six sparks lift ×1 to ×2; with enemies about and the meter dry, it drops back.
    reset();
    for (let k = 0; k < 7; k++) w.shards.push({ x: 0, y: 0, vx: 0, vy: 0, life: 7, ang: 0 });
    g.updateGame(1 / 60);
    const up = g.run.mult;
    w.enemies.push(g.makeEnemy("pouncer", 400, 0, { spawn: 0 }));
    g.run.speed = 0.0001;
    g.run.heat = 0.05;
    steps(120);
    out.heat = { up, down: g.run.mult };
    // A hit costs a segment and two steps of multiplier; the fourth ends the run.
    reset();
    g.run.mult = 5;
    g.hurtHull();
    const after = { hull: g.run.hull, mult: g.run.mult };
    g.hurtHull();
    g.hurtHull();
    g.hurtHull();
    out.hull = { after, state: g.run.state };
    return out;
  });
  check("start: hull 4, one charge, ×1", r.start.hull === 4 && r.start.charges === 1 && r.start.mult === 1, r.start);
  check("pouncer leaps on the beat and closes in", r.pouncer.leaps >= 1 && r.pouncer.d < 240, r.pouncer);
  check("shieldback turns a front shot aside", r.shieldFront.hp === 2 && r.shieldFront.vy > 0, r.shieldFront);
  check("shieldback is hurt from behind", r.shieldBack === 1, r.shieldBack);
  check(
    "warden: guarded, opens, grows a guard back",
    r.warden.guardedHp === 10 && r.warden.open && r.warden.openHp === 9 && r.warden.regrown === 1 && r.warden.closed,
    r.warden,
  );
  check("sower flings fragments", r.sower.fragments >= 1 && r.sower.hp === 5 - r.sower.fragments, r.sower);
  check("nova clears the pool", r.nova.charges === 0 && r.nova.left === 0, r.nova);
  check("charges fill from kills", r.charges.charges === 1 && r.charges.fill > 0.2 && r.charges.fill < 0.3, r.charges);
  check("multiplier meter warms and cools", r.heat.up === 2 && r.heat.down === 1, r.heat);
  check("hull hits", r.hull.after.hull === 3 && r.hull.after.mult === 3 && r.hull.state === "over", r.hull);
  await ctx.close();
}

// A save from the version before: progress and settings stay, the run in progress goes on.
{
  const old = {
    v: 1,
    settings: { ...quiet, theme: "light", quality: "low" },
    progress: { unlocked: 4, cleared: [0, 1, 2], best: { 2: 52010 }, endlessBest: 120400, seenHint: true, last: 2 },
    snapshot: { si: 2, wave: 3, score: 23450, mult: 7, prog: 4, lives: 2, bombs: 3, kills: 120, maxMult: 9, time: 210 },
  };
  const { ctx, p } = await page(old);
  await p.goto("file://" + file + "#/");
  await p.waitForTimeout(700);
  await p.locator("#btn-continue").click();
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const run = window.__gf.run;
    const s = JSON.parse(localStorage.getItem("gridfire.save"));
    return {
      si: run.si,
      wave: run.wave,
      score: run.score,
      mult: run.mult,
      hull: run.hull,
      charges: run.charges,
      best: s.progress.best["2"],
      theme: s.settings.theme,
    };
  });
  check(
    "a save from the version before carries over",
    r.si === 2 &&
      r.wave === 3 &&
      r.score === 23450 &&
      r.mult === 7 &&
      r.hull === 4 &&
      r.charges === 3 &&
      r.best === 52010 &&
      r.theme === "light",
    r,
  );
  await ctx.close();
}

// The pilot's progress, talents, weapons, power-ups and synergies.
{
  const fresh = { v: 1, settings: { ...quiet, autoAim: false }, progress: { unlocked: 8, seenHint: true } };
  const { ctx, p } = await page(fresh);
  await p.goto("file://" + file + "#/");
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const g = window.__gf,
      w = g.world,
      M = g.M,
      out = {};
    const steps = (n) => {
      for (let i = 0; i < n; i++) g.updateGame(1 / 60);
    };
    const setTalents = (o) => {
      M.talents = Object.assign({ offence: [-1, -1, -1], defence: [-1, -1, -1], utility: [-1, -1, -1] }, o);
    };
    const reset = (si = 0) => {
      g.startRun(si);
      g.run.queue.length = 0;
      w.enemies.length = 0;
      w.bullets.length = 0;
      w.shards.length = 0;
      w.p.x = 0;
      w.p.y = 0;
      w.p.inv = 99;
    };
    // A first run: level 1, nothing open but the Skiff and the Twin stream, no talent points.
    out.first = { level: g.levelFor(M.xp), free: g.pointsFree(), ld: g.currentLoadout() };
    // A short failed run still earns experience, enough for level 2 and a talent point.
    reset();
    g.run.score = 4200;
    g.run.wave = 2;
    const xp1 = g.bankRun(false);
    out.afterRun1 = { total: xp1.total, level: g.levelFor(M.xp), free: g.pointsFree() };
    // A cleared sector earns much more; levels 3 and 4 open the Scatter and the opening pick.
    reset();
    g.run.score = 11000;
    const xp2 = g.bankRun(true);
    out.afterRun2 = { total: xp2.total, level: g.levelFor(M.xp), before: xp2.before, after: xp2.after };
    // Locked gear falls back to the defaults; open gear is used.
    M.ship = "barge";
    M.weapon = "scatter";
    out.loadout = g.currentLoadout();
    // Talent rules: a row needs the one above, points are limited, a swap is free, giving one back refunds.
    M.xp = g.xpForLevel(4);
    setTalents({});
    g.tapTalent("offence", 1, 0);
    const lockedRow = g.pointsSpent(M.talents);
    g.tapTalent("offence", 0, 0);
    g.tapTalent("offence", 1, 0);
    const two = g.pointsSpent(M.talents);
    g.tapTalent("offence", 1, 1);
    const swapped = M.talents.offence.slice();
    g.tapTalent("defence", 0, 0);
    g.tapTalent("offence", 2, 0);
    const tooDear = M.talents.offence[2];
    g.tapTalent("offence", 0, 0);
    out.talents = { lockedRow, two, swapped, tooDear, afterGiveBack: M.talents.offence.slice(), free: g.pointsFree() };
    // Defence talents and starting options take effect at the start of a run.
    M.xp = g.xpForLevel(19);
    setTalents({ defence: [0, 0, 1], utility: [-1, -1, -1] });
    M.opts = { opening: false, tide: false, headstart: true };
    M.ship = "skiff";
    M.weapon = "twin";
    reset();
    const start = { hull: g.run.hull, shield: g.run.shield, mult: g.run.mult, charges: g.run.charges };
    g.run.mult = 5;
    g.hurtHull();
    const steady = g.run.mult;
    g.run.hull = 1;
    g.hurtHull();
    out.defence = { start, steady, spared: { hull: g.run.hull, state: g.run.state, reprieve: g.run.reprieve } };
    setTalents({ defence: [1, 1, 0], utility: [0, 0, -1] });
    M.opts = { opening: false, tide: false, headstart: false };
    reset();
    w.enemies.push(g.makeEnemy("firefly", 60, 0, { spawn: 0 }), g.makeEnemy("pouncer", -80, 0, { spawn: 0 }));
    g.run.hull = 2;
    g.run.mult = 5;
    g.hurtHull();
    out.shock = {
      steady: g.run.mult,
      fireflies: w.enemies.filter((e) => e.type === "firefly" && !e.dead).length,
      pouncerSpeed: Math.round(Math.hypot(w.enemies[1].vx, w.enemies[1].vy)),
      warp: Math.round(g.run.pw.warp),
      charges: g.run.charges,
    };
    // Weapons. Scatter sprays many short pellets.
    setTalents({});
    M.weapon = "scatter";
    reset();
    g.volley(w.p, 0, -1, false);
    out.scatter = { pellets: w.bullets.length, life: Math.round(w.bullets[0].life * 100) / 100 };
    // The beam hurts every enemy along its line and stops at a shield turned toward it.
    M.weapon = "beam";
    reset();
    g.run.speed = 0.0001;
    const a = g.makeEnemy("pouncer", 0, -100, { spawn: 0, hp: 9 }),
      b = g.makeEnemy("pouncer", 0, -200, { spawn: 0, hp: 9 }),
      s = g.makeEnemy("shieldback", 0, -280, { spawn: 0, ang: Math.PI / 2, hp: 9 }),
      c = g.makeEnemy("pouncer", 0, -360, { spawn: 0, hp: 9 });
    w.enemies.push(a, b, s, c);
    g.beamTick(w.p, 0, -1);
    out.beam = { a: a.hp < 9, b: b.hp < 9, shield: s.hp, behind: c.hp, len: Math.round(g.run.beamRays[0][1]) };
    // The pulse sends a ring on each half beat that passes through a whole swarm.
    M.weapon = "pulse";
    reset();
    g.run.speed = 0.0001;
    for (let k = 0; k < 5; k++) w.enemies.push(g.makeEnemy("firefly", (k - 2) * 40, -150, { spawn: 0, hp: 9 }));
    g.volley(w.p, 0, -1, false);
    steps(30);
    out.pulse = { hit: w.enemies.filter((e) => e.hp < 9).length };
    // Echo repeats a volley half a beat later; Prism splits a shot on its first hit.
    M.weapon = "twin";
    reset();
    g.run.pw.echo = 9;
    g.volley(w.p, 0, -1, false);
    const first = w.bullets.length;
    steps(40);
    out.echo = { first, later: w.bullets.length > 0 && g.run.echoes.length === 0 };
    reset();
    g.run.speed = 0.0001;
    g.run.pw.prism = 9;
    w.enemies.push(g.makeEnemy("lancer", 0, -120, { spawn: 0, hp: 9, vx: 0, vy: 0 }));
    g.volley(w.p, 0, -1, false);
    steps(12);
    out.prism = { children: w.bullets.filter((x) => x.child).length };
    // Bounty: twice the sparks, and the meter holds while enemies are about.
    reset();
    g.run.pw.bounty = 9;
    const k1 = g.makeEnemy("pouncer", 300, 0, { spawn: 0 });
    w.enemies.push(k1, g.makeEnemy("pouncer", -300, 0, { spawn: 0 }));
    g.killEnemy(k1);
    g.run.heat = 0.5;
    g.run.speed = 0.0001;
    steps(60);
    out.bounty = { sparks: w.shards.length, heat: Math.round(g.run.heat * 100) / 100 };
    // Synergy: Pierce and Ricochet together make Needle storm; capsules lean toward a partner.
    reset();
    g.run.pw.pierce = 9;
    g.run.pw.ricochet = 9;
    steps(1);
    g.volley(w.p, 0, -1, false);
    out.needle = { on: g.run.synOn.has("needle"), pierce: w.bullets[0].pierce, bounces: w.bullets[0].bounces };
    reset();
    g.run.pw.pierce = 9;
    M.talents = { offence: [-1, -1, -1], defence: [-1, -1, -1], utility: [0, 0, 0] };
    g.startRun(0);
    g.run.pw.pierce = 9;
    const kinds = {};
    for (let i = 0; i < 400; i++) {
      w.pickups.length = 0;
      g.dropCapsule(0, 0);
      const k = w.pickups[0].type;
      kinds[k] = (kinds[k] || 0) + 1;
    }
    out.matchmaker = { partners: (kinds.ricochet || 0) + (kinds.prism || 0), of: 400 };
    return out;
  });
  check(
    "first run: level 1, default loadout",
    r.first.level === 1 && r.first.free === 0 && r.first.ld.ship === "skiff" && r.first.ld.weapon === "twin",
    r.first,
  );
  check("a failed run reaches level 2", r.afterRun1.level === 2 && r.afterRun1.free === 1, r.afterRun1);
  check("a cleared sector opens the Scatter", r.afterRun2.level >= 3, r.afterRun2);
  check("locked gear falls back", r.loadout.ship === "skiff" && r.loadout.weapon === "scatter", r.loadout);
  check(
    "talent rows, costs, free swaps and refunds",
    r.talents.lockedRow === 0 &&
      r.talents.two === 3 &&
      r.talents.swapped[1] === 1 &&
      r.talents.tooDear === -1 &&
      r.talents.afterGiveBack.join() === "-1,-1,-1" &&
      r.talents.free === 3,
    r.talents,
  );
  check(
    "plating, second skin, head start and reprieve",
    r.defence.start.hull === 5 &&
      r.defence.start.shield === 1 &&
      r.defence.start.mult === 3 &&
      r.defence.steady === 3 &&
      r.defence.spared.hull === 1 &&
      r.defence.spared.state === "play" &&
      r.defence.spared.reprieve === 0,
    r.defence,
  );
  check(
    "shockwave, steady, last stand and spare charge",
    r.shock.fireflies === 0 &&
      r.shock.pouncerSpeed > 700 &&
      r.shock.steady === 4 &&
      r.shock.warp === 6 &&
      r.shock.charges === 2,
    r.shock,
  );
  check("scatter sprays short pellets", r.scatter.pellets >= 6 && r.scatter.life < 0.5, r.scatter);
  check(
    "beam cuts a line and stops at a shield",
    r.beam.a && r.beam.b && r.beam.shield === 9 && r.beam.behind === 9 && r.beam.len < 280,
    r.beam,
  );
  check("pulse ring passes through a swarm", r.pulse.hit >= 4, r.pulse);
  check("echo repeats the volley", r.echo.first > 0 && r.echo.later, r.echo);
  check("prism splits a shot", r.prism.children >= 2, r.prism);
  check("bounty doubles sparks and holds the meter", r.bounty.sparks === 2 && r.bounty.heat === 0.5, r.bounty);
  check("needle storm", r.needle.on && r.needle.pierce === 99 && r.needle.bounces === -1, r.needle);
  check("matchmaker brings partners", r.matchmaker.partners > 240, r.matchmaker);
  await ctx.close();
}

// A save from before the talents: the play already done becomes experience.
{
  const before = {
    v: 1,
    settings: { ...quiet },
    progress: { unlocked: 5, cleared: [0, 1, 2, 3], best: { 3: 60000 }, kills: 1500, games: 14, seenHint: true },
  };
  const { ctx, p } = await page(before);
  await p.goto("file://" + file + "#/");
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const g = window.__gf,
      s = JSON.parse(localStorage.getItem("gridfire.save"));
    return { xp: g.M.xp, level: g.levelFor(g.M.xp), stored: s.meta && s.meta.v, best: s.progress.best["3"] };
  });
  check(
    "play before the talents becomes experience",
    r.xp === 1180 && r.level === 5 && r.stored === 1 && r.best === 60000,
    r,
  );
  await ctx.close();
}

// A soak: 90 seconds of every sector and Endless, upgrades taken as offered, the hull held up.
{
  const { ctx, p } = await page({
    v: 1,
    settings: { ...quiet, autoAim: true },
    progress: { unlocked: 8, seenHint: true },
  });
  await p.goto("file://" + file + "#/");
  await p.waitForTimeout(500);
  for (let si = 0; si <= 8; si++) {
    const r = await p.evaluate((si) => {
      const g = window.__gf;
      g.startRun(si);
      for (let i = 0; i < 60 * 90; i++) {
        const run = g.run;
        run.hull = Math.max(run.hull, 3);
        if (run.state === "pick") {
          g.choosePick(0);
          continue;
        }
        if (run.state !== "play") break;
        const a = i / 120;
        g.world.p.vx = Math.cos(a) * 200;
        g.world.p.vy = Math.sin(a) * 200;
        if (i % 1800 === 900) g.useBomb();
        g.updateGame(1 / 60);
        for (const e of g.world.enemies) {
          if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return { error: "not a number: " + e.type };
          if (e.type !== "guard" && Math.hypot(e.x, e.y) > g.POOL + 1) return { error: "outside: " + e.type };
        }
      }
      return { wave: g.run.wave + 1, kills: g.run.kills, score: g.run.score };
    }, si);
    check(`soak ${si === 8 ? "Endless" : "sector " + (si + 1)}`, !r.error && r.kills > 0, r);
  }
  await ctx.close();
}
await browser.close();

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${JSON.stringify(r.info)}`);
if (errors.length) console.log("page errors:\n" + [...new Set(errors)].join("\n"));
process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);
