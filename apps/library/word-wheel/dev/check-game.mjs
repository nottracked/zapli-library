// Checks the game's logic without a browser (Node 22): the letters, the word lists, the puzzle generator and the
// state of a puzzle. Run from anywhere: node dev/check-game.mjs [days]   (default: a year of daily wheels)
// Exits with 1 and a list of problems when anything fails.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tiles, normalise, ALPHABETS } from "../package/js/core/letters.mjs";
import { parseWordList } from "../package/js/core/wordlist.mjs";
import { addDays, FIRST_DAY, streaks, daysBetween } from "../package/js/core/dates.mjs";
import {
  buildIndex,
  dailyPuzzle,
  endlessPuzzle,
  seedsOf,
  SIZES,
  RULES,
  DAILY_SIZE,
} from "../package/js/wheel/generator.mjs";
import { gridIsSound } from "../package/js/wheel/layout.mjs";
import {
  newState,
  tryWord,
  hintCell,
  showCell,
  hintsLeft,
  hiddenOf,
  hiddenFound,
  isComplete,
  jarLevel,
  FREE_HINTS,
  EXTRAS_PER_HINT,
} from "../package/js/wheel/puzzle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DAYS = Number(process.argv[2] || 365);
const LEVELS = 150;
const problems = [];
const fail = (text) => problems.push(text);
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};

// ---- letters
eq(tiles("chlieb", "sk"), ["ch", "l", "i", "e", "b"], "chlieb splits with CH as one tile");
eq(tiles("medzi", "sk"), ["m", "e", "d", "z", "i"], "dz stays two tiles");
eq(tiles("džem", "sk"), ["d", "ž", "e", "m"], "dž stays two tiles");
eq(tiles("kôň", "sk"), ["k", "ô", "ň"], "kôň keeps its diacritics");
eq(tiles("kôň", "sk"), ["k", "ô", "ň"], "decomposed letters are composed first (NFC)");
eq(tiles("KÔŇ", "sk"), ["k", "ô", "ň"], "capitals are lowered");
eq(tiles("café", "en"), null, "é is no English letter");
eq(tiles("Ťava", "sk"), ["ť", "a", "v", "a"], "Ť is lowered to ť");
eq(normalise(" Ľad "), "ľad", "normalise trims and lowers");
eq(ALPHABETS.sk.length, 44, "the Slovak alphabet has 44 tiles here (ch one, dz and dž two)");

// ---- dates
eq(addDays("2026-12-31", 1), "2027-01-01", "addDays crosses the year");
eq(daysBetween("2027-03-27", "2027-03-29"), 2, "daysBetween ignores summer time");
eq(
  streaks(new Set(["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06"]), "2026-11-07"),
  { current: 3, longest: 3 },
  "a streak stays alive until a whole day is missed",
);
eq(streaks(new Set(["2026-11-01"]), "2026-11-03"), { current: 0, longest: 1 }, "a missed day ends a streak");

// ---- lists and puzzles
function readList(lang) {
  return parseWordList(readFileSync(join(here, "..", "package", "data", `words-${lang}.txt`), "utf8"));
}

function letterCounts(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

function canMake(wordTiles, wheel) {
  const have = letterCounts(wheel);
  for (const x of wordTiles) {
    if (!have.get(x)) return false;
    have.set(x, have.get(x) - 1);
  }
  return true;
}

function checkPuzzle(index, lists, p, what) {
  if (!p) {
    fail(`${what}: no puzzle`);
    return;
  }
  const rule = RULES[p.size];
  const answers = new Set(lists.answers);
  const all = new Set([...lists.answers, ...lists.accepted]);
  if (p.words.length < rule.minGrid) fail(`${what}: only ${p.words.length} grid words`);
  if (p.letters.length !== p.size) fail(`${what}: ${p.letters.length} letters on a wheel of ${p.size}`);
  if (!p.words.some((w) => w.t.length === p.size)) fail(`${what}: no word uses every letter`);
  if (p.rows > rule.maxSide || p.cols > rule.maxSide) fail(`${what}: grid ${p.rows}x${p.cols} is too big`);
  for (const w of p.words) {
    if (!answers.has(w.w)) fail(`${what}: grid word ${w.w} is not an answer word`);
    if (!canMake(w.t, p.letters)) fail(`${what}: grid word ${w.w} cannot be made from ${p.letters.join("")}`);
    eq(w.t, tiles(w.w, index.lang), `${what}: tiles of ${w.w}`);
  }
  // Hidden words: common answer words the wheel makes and the grid does not use; bonus words are the rest.
  const common = lists.common && lists.common.length ? new Set(lists.common) : answers;
  const extra = new Set(p.extra);
  if (!Array.isArray(p.hidden)) fail(`${what}: no hidden words list`);
  for (const h of hiddenOf(p)) {
    if (!common.has(h) || !answers.has(h)) fail(`${what}: hidden word ${h} is not a common answer word`);
    if (!extra.has(h)) fail(`${what}: hidden word ${h} is not among the extra words`);
  }
  const hiddenSet = new Set(hiddenOf(p));
  for (const x of p.extra) {
    if (!hiddenSet.has(x) && common.has(x)) fail(`${what}: ${x} is common but counted as a bonus word`);
  }
  for (const x of p.extra) {
    if (!all.has(x)) fail(`${what}: extra word ${x} is not in the list`);
    if (!canMake(tiles(x, index.lang), p.letters)) fail(`${what}: extra word ${x} cannot be made`);
    if (p.words.some((w) => w.w === x)) fail(`${what}: ${x} is both a grid word and an extra word`);
  }
  const grid = {
    rows: p.rows,
    cols: p.cols,
    words: p.words.map((w) => ({ entry: { tiles: w.t }, r: w.r, c: w.c, d: w.d })),
  };
  if (!gridIsSound(grid)) fail(`${what}: the grid makes words that are not in it, or falls apart`);
  // Every word the wheel can make is either a grid word or an extra word: the game accepts exactly these.
  for (const w of [...lists.answers, ...lists.accepted]) {
    const t = tiles(w, index.lang);
    if (t && t.length >= 3 && t.length <= p.size && canMake(t, p.letters)) {
      if (!p.words.some((g) => g.w === w) && !p.extra.includes(w)) fail(`${what}: ${w} can be made but does not count`);
    }
  }
}

function solve(p, what) {
  let s = newState(p);
  // A word that differs only in its diacritics never counts as the word.
  for (const w of p.words) {
    const plain = w.w.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (plain !== w.w && !p.extra.includes(plain) && !p.words.some((g) => g.w === plain)) {
      const r = tryWord(p, s, Array.from(plain));
      if (r.result !== "unknown") fail(`${what}: ${plain} (without diacritics) counted as ${r.result}`);
    }
  }
  eq(tryWord(p, s, p.letters.slice(0, 2)).result, "short", `${what}: two letters are too short`);
  // Hints: three free ones, then none.
  let h = s;
  for (let i = 0; i < FREE_HINTS; i++) {
    const key = hintCell(p, h);
    const next = key && showCell(p, h, key);
    if (!next) fail(`${what}: hint ${i + 1} showed nothing`);
    else h = next;
  }
  if (!h.done) {
    eq(hintsLeft(h), 0, `${what}: hints left after three`);
    const key = hintCell(p, h);
    if (key && showCell(p, h, key) !== null) fail(`${what}: a fourth hint worked without extra words`);
  }
  // Solving by typing every grid word.
  for (const w of p.words) {
    const r = tryWord(p, s, w.t);
    if (r.result !== "found" && !(r.result === "again" && s.found.includes(w.w)))
      fail(`${what}: ${w.w} -> ${r.result}`);
    s = r.state;
  }
  if (!s.done) fail(`${what}: not done after every word`);
  // Solved, then complete once every hidden word is found; the jar fills by every extra word.
  if (isComplete(p, s) !== (hiddenOf(p).length === 0)) fail(`${what}: complete before its hidden words`);
  for (const h of hiddenOf(p)) {
    const r = tryWord(p, s, tiles(h, p.lang));
    if (r.result !== "extra" || r.kind !== "hidden") fail(`${what}: hidden word ${h} -> ${r.result}/${r.kind}`);
    s = r.state;
    if (tryWord(p, s, tiles(h, p.lang)).result !== "extraAgain") fail(`${what}: hidden word twice`);
  }
  if (!isComplete(p, s)) fail(`${what}: not complete after every hidden word`);
  eq(hiddenFound(p, s), hiddenOf(p).length, `${what}: hidden words counted`);
  const bonus = p.extra.find((x) => !hiddenOf(p).includes(x));
  if (bonus) {
    const r = tryWord(p, s, tiles(bonus, p.lang));
    if (r.result !== "extra" || r.kind !== "bonus") fail(`${what}: bonus word ${bonus} -> ${r.result}/${r.kind}`);
    s = r.state;
  }
  eq(jarLevel(s), s.extras.length % EXTRAS_PER_HINT, `${what}: the jar's level`);
}

const report = [];
for (const lang of ["sk", "en"]) {
  const lists = readList(lang);
  const t0 = Date.now();
  const index = buildIndex(lang, lists);
  const seeds = Object.fromEntries(SIZES.map((s) => [s, seedsOf(index, s).length]));
  const t1 = Date.now();
  const grids = [];
  const extras = [];
  const hiddens = [];
  const bonuses = [];
  let worst = 0;
  for (let d = 0; d < DAYS; d++) {
    const day = addDays(FIRST_DAY, d);
    const s = Date.now();
    const p = dailyPuzzle(index, day);
    worst = Math.max(worst, Date.now() - s);
    const what = `${lang} daily ${day}`;
    checkPuzzle(index, lists, p, what);
    if (!p) continue;
    if (p.size !== DAILY_SIZE) fail(`${what}: size ${p.size}`);
    if (d < 40) solve(p, what);
    grids.push(p.words.length);
    extras.push(p.extra.length);
    hiddens.push(hiddenOf(p).length);
    bonuses.push(p.extra.length - hiddenOf(p).length);
    if (d < 10) eq(dailyPuzzle(index, day), p, `${what} is the same when made again`);
  }
  const fresh = buildIndex(lang, readList(lang));
  eq(dailyPuzzle(fresh, "2026-11-15"), dailyPuzzle(index, "2026-11-15"), `${lang}: the same day from a new index`);
  for (const size of SIZES) {
    for (let level = 0; level < LEVELS; level++) {
      const p = endlessPuzzle(index, size, level);
      checkPuzzle(index, lists, p, `${lang} endless ${size}/${level}`);
      if (p && level < 15) solve(p, `${lang} endless ${size}/${level}`);
    }
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
  report.push(
    `${lang}: ${lists.answers.length} answer + ${lists.accepted.length} accepted words; good wheels by size ` +
      `${JSON.stringify(seeds)} (index ${t1 - t0} ms); ${DAYS} daily wheels: ${avg(grids)} grid words ` +
      `(min ${Math.min(...grids)}), ${avg(extras)} extra words (min ${Math.min(...extras)}): ${avg(hiddens)} hidden ` +
      `(min ${Math.min(...hiddens)}, max ${Math.max(...hiddens)}, none in ${hiddens.filter((n) => n === 0).length}) ` +
      `and ${avg(bonuses)} bonus; slowest ${worst} ms`,
  );
}

console.log(report.join("\n"));
if (problems.length) {
  console.error(`${problems.length} problems:`);
  for (const p of problems.slice(0, 60)) console.error(`  ${p}`);
  process.exitCode = 1;
} else console.log("all checks passed");
