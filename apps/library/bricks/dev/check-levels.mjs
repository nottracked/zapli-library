// Checks every level without a browser (Node 22):
//  - the hand-made levels: 48 of them in four worlds of twelve, ids in order, names in English and Slovak, rows of one
//    length (11 to 15 columns), at most 15 rows, only known characters, sliding rows that stay inside the walls and
//    never run into iron, and no tile walled in by iron;
//  - every hand-made level loads and a simple bot clears it, with as many balls as it needs (the time and the balls it
//    lost are printed, a rough measure of difficulty);
//  - a year of daily levels and 40 endless waves: each is made, has enough tiles, has nothing walled in, and the bot
//    clears a sample of them;
//  - a saved game restores to the same state and plays on the same way.
// Run: node dev/check-levels.mjs [--quick]
import * as A from "../package/js/game/arena.mjs";
import { LEVELS, WORLDS, worldOf } from "../package/js/game/levels.mjs";
import { buildLevel, tileOf } from "../package/js/game/build.mjs";
import { makeLevel, unreachable, dailyDifficulty, waveDifficulty } from "../package/js/game/generate.mjs";
import { createGame, snapshot, restoreGame, step, launch, setPaddle } from "../package/js/game/game.mjs";
import { addDays, weekday } from "../package/js/core/dates.mjs";
import { hashText } from "../package/js/core/rng.mjs";
import { play } from "./bot.mjs";

const quick = process.argv.includes("--quick");
const problems = [];
const fail = (msg) => problems.push(msg);

function checkPicture(where, def) {
  const rows = def.rows;
  if (!Array.isArray(rows) || rows.length === 0) return fail(`${where}: no rows`);
  const cols = rows[0].length;
  if (cols < 11 || cols > 15) fail(`${where}: ${cols} columns`);
  if (rows.length > A.MAX_ROWS) fail(`${where}: ${rows.length} rows`);
  rows.forEach((line, r) => {
    if (line.length !== cols) fail(`${where}: row ${r} has ${line.length} characters, not ${cols}`);
    for (const ch of line) if (ch !== "." && !tileOf(ch)) fail(`${where}: unknown character "${ch}" in row ${r}`);
  });
  const level = buildLevel(def);
  for (const m of def.move || []) {
    if (m.row < 0 || m.row >= rows.length) fail(`${where}: a sliding row ${m.row} outside the level`);
    const tiles = level.bricks.filter((b) => b.row === m.row);
    if (!tiles.length) fail(`${where}: sliding row ${m.row} is empty`);
    const amp = m.cells * level.cellW;
    for (const b of tiles) {
      if (b.bx - amp < -0.01 || b.bx + level.cellW + amp > A.W + 0.01)
        fail(`${where}: row ${m.row} slides past a wall`);
      if (b.kind === "iron") fail(`${where}: iron in a sliding row`);
    }
  }
  const walled = unreachable(rows, def.move);
  if (walled.length) fail(`${where}: tiles walled in by iron at ${walled.map(([c, r]) => `${c},${r}`).join(" ")}`);
  if (!level.bricks.some((b) => b.kind !== "iron")) fail(`${where}: nothing to break`);
  return level;
}

// ---- the hand-made levels
if (LEVELS.length !== 48) fail(`${LEVELS.length} levels, expected 48`);
WORLDS.forEach((w, i) => {
  const mine = LEVELS.filter((l) => l.id.startsWith(`${i + 1}-`));
  if (mine.length !== 12) fail(`world ${i + 1} has ${mine.length} levels`);
  mine.forEach((l, j) => l.id !== `${i + 1}-${j + 1}` && fail(`level ${l.id} out of order`));
});
const names = new Set();
for (const l of LEVELS) {
  if (!l.name || !l.name.en || !l.name.sk) fail(`${l.id}: a name is missing`);
  if (names.has(l.name.en)) fail(`${l.id}: the name "${l.name.en}" is used twice`);
  names.add(l.name.en);
  checkPicture(`level ${l.id}`, l);
}

const report = [];
for (const l of LEVELS) {
  const world = worldOf(l);
  let cleared = 0;
  let worst = 0;
  let lostAll = 0;
  const seeds = quick ? [1] : [1, 2, 3];
  for (const seed of seeds) {
    const game = createGame({ def: l, speed: world.speed, power: world.power, drop: world.drop, seed, lives: 99 });
    const r = play(game, 900);
    if (r.phase === "clear") cleared++;
    worst = Math.max(worst, r.time);
    lostAll += r.lost;
  }
  if (cleared < seeds.length) fail(`level ${l.id}: the bot cleared it ${cleared} of ${seeds.length} times`);
  report.push(
    `${l.id.padEnd(5)} ${l.name.en.padEnd(13)} ${Math.round(worst).toString().padStart(4)} s  balls lost ${(lostAll / seeds.length).toFixed(1)}`,
  );
}
console.log(report.join("\n"));

// ---- made levels
const start = "2026-11-03";
const days = quick ? 60 : 366;
for (let i = 0; i < days; i++) {
  const day = addDays(start, i);
  const def = makeLevel(`daily:${day}`, dailyDifficulty(weekday(day)));
  checkPicture(`daily ${day}`, def);
  const tiles = def.rows.join("").replace(/[.#]/g, "").length;
  if (tiles < 24) fail(`daily ${day}: only ${tiles} tiles`);
  if (i % (quick ? 15 : 30) === 0) {
    const game = createGame({ def, speed: 300, seed: hashText(day), lives: 99 });
    const r = play(game, 900);
    if (r.phase !== "clear") fail(`daily ${day}: the bot did not clear it`);
  }
}
for (let wave = 1; wave <= 40; wave++) {
  const def = makeLevel(`endless:7:${wave}`, waveDifficulty(wave));
  checkPicture(`endless wave ${wave}`, def);
  if (wave % 8 === 1) {
    const game = createGame({ def, speed: 300, seed: wave, lives: 99 });
    const r = play(game, 900);
    if (r.phase !== "clear") fail(`endless wave ${wave}: the bot did not clear it`);
  }
}

// ---- saving and restoring
{
  const l = LEVELS.find((x) => x.id === "3-12");
  const opts = { def: l, speed: 315, power: worldOf(l).power, drop: 0.3, seed: 9, lives: 3 };
  const a = createGame(opts);
  launch(a);
  for (let i = 0; i < 1500; i++) {
    setPaddle(a, a.balls[0] ? a.balls[0].x : 180);
    step(a);
    if (a.phase === "ready") launch(a);
  }
  const snap = JSON.parse(JSON.stringify(snapshot(a)));
  const b = restoreGame(opts, snap);
  if (!b) fail("restore: refused its own snapshot");
  else {
    for (let i = 0; i < 600; i++) {
      for (const g of [a, b]) {
        setPaddle(g, g.balls[0] ? g.balls[0].x - 4 : 180);
        step(g);
        if (g.phase === "ready") launch(g);
      }
    }
    const sa = JSON.stringify(snapshot(a));
    const sb = JSON.stringify(snapshot(b));
    if (sa !== sb) fail("restore: a restored game plays on differently from the original");
  }
  if (restoreGame(opts, { v: 1, bricks: [1, 2] })) fail("restore: took a snapshot of another level");
  if (restoreGame(opts, null)) fail("restore: took nothing as a snapshot");
}

if (problems.length) {
  console.error(problems.slice(0, 40).join("\n"));
  console.error(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log("levels: ok");
