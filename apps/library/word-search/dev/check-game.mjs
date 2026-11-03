// Checks the game's rules without a browser (Node 22):
//  - the themes: both languages have the same themes in the same order, each with enough words, every word of 3 to
//    12 letters of its alphabet, written once; the hidden messages use only letters of the alphabet;
//  - the generator, for every theme and grid size it fits, with and without a hidden message: each word is in the
//    grid exactly once, runs in an allowed direction, is no part of another word, shares no square with a word on
//    the same line, and the squares left over spell the message in reading order;
//  - a year and more of daily puzzles in both languages: always made, always with a hidden message, the same every
//    time, and never the same theme two days running;
//  - selections (forwards and backwards), hints, the snapping of a drag to the eight directions.
// Run: node dev/check-game.mjs
import { tiles, ALPHABETS } from "../package/js/core/letters.mjs";
import { FIRST_DAY, addDays } from "../package/js/core/dates.mjs";
import { hashText } from "../package/js/core/rng.mjs";
import * as EN from "../package/js/data/themes-en.mjs";
import * as SK from "../package/js/data/themes-sk.mjs";
import { generate, cellsAt, occurrences, clashes, messageCells, STEP } from "../package/js/search/generator.mjs";
import { library, themeAt, themeFits, wordsThatFit } from "../package/js/search/themes.mjs";
import { DIRECTION_SETS, endlessSpec, dailySpec, wordsNeeded, wordTarget } from "../package/js/search/levels.mjs";
import {
  newState,
  readState,
  selectionResult,
  markFound,
  hintTarget,
  takeHint,
  cellsOf,
  capsuleColour,
} from "../package/js/search/puzzle.mjs";
import { snapEnd, lineCells, inLine } from "../package/js/ui/board-view.mjs";

const problems = [];
const fail = (text) => problems.push(text);
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};

// ---- themes
const SOURCES = { en: EN, sk: SK };
eq(
  EN.THEMES.map((x) => x.id),
  SK.THEMES.map((x) => x.id),
  "English and Slovak have the same themes in the same order",
);
let words = { en: 0, sk: 0 };
for (const lang of ["en", "sk"]) {
  const alphabet = new Set(ALPHABETS[lang]);
  if (SOURCES[lang].THEMES.length < 40) fail(`${lang}: only ${SOURCES[lang].THEMES.length} themes`);
  for (const theme of SOURCES[lang].THEMES) {
    const list = theme.words.split(/\s+/).filter(Boolean);
    words[lang] += list.length;
    const seen = new Set();
    for (const w of list) {
      if (w !== w.toLowerCase() || w !== w.normalize("NFC")) fail(`${lang}/${theme.id}: "${w}" is not lower case NFC`);
      const t = tiles(w, lang);
      if (!t) fail(`${lang}/${theme.id}: "${w}" has a character outside the alphabet`);
      else if (t.length < 3 || t.length > 12) fail(`${lang}/${theme.id}: "${w}" has ${t.length} letters`);
      if (seen.has(w)) fail(`${lang}/${theme.id}: "${w}" twice`);
      seen.add(w);
    }
    if (list.length < 30) fail(`${lang}/${theme.id}: only ${list.length} words`);
    const short = list.filter((w) => (tiles(w, lang) || []).length <= 6).length;
    if (short < wordsNeeded(6)) fail(`${lang}/${theme.id}: only ${short} words fit a 6 × 6 grid`);
    if (!theme.name || theme.name.length > 28) fail(`${lang}/${theme.id}: name "${theme.name}"`);
  }
  for (const m of SOURCES[lang].MESSAGES) {
    const letters = Array.from(m.toLowerCase()).filter((ch) => /\p{L}/u.test(ch));
    for (const ch of letters)
      if (!alphabet.has(ch) && ch !== "c" && ch !== "h") fail(`${lang}: message "${m}" has "${ch}"`);
  }
}

// ---- the generator
function checkPuzzle(p, label, dirs, withMessage) {
  const n = p.size;
  if (p.grid.length !== n * n || p.grid.some((x) => typeof x !== "string" || !x)) fail(`${label}: grid not full`);
  const allowed = new Set(DIRECTION_SETS[dirs]);
  const axis = new Map();
  const AX = { e: 0, w: 0, s: 1, n: 1, se: 2, nw: 2, ne: 3, sw: 3 };
  const theme = library(p.lang).byId.get(p.theme);
  const byWord = new Map(theme.words.map((x) => [x.w, x.t]));
  for (const word of p.words) {
    const t = byWord.get(word.w);
    if (!t) fail(`${label}: "${word.w}" is not a word of the theme`);
    if (!allowed.has(word.d)) fail(`${label}: "${word.w}" runs ${word.d}, not allowed in set ${dirs}`);
    const cells = cellsAt(n, word.r, word.c, word.d, word.n);
    if (cells.some((i) => i < 0 || i >= n * n)) fail(`${label}: "${word.w}" leaves the grid`);
    const got = cells.map((i) => p.grid[i]);
    if (JSON.stringify(got) !== JSON.stringify(t)) fail(`${label}: "${word.w}" reads ${got.join("")}`);
    if (occurrences(p.grid, n, t) !== 1)
      fail(`${label}: "${word.w}" is in the grid ${occurrences(p.grid, n, t)} times`);
    for (const i of cells) {
      const set = axis.get(i) || new Set();
      if (set.has(AX[word.d])) fail(`${label}: two words on one line share square ${i}`);
      set.add(AX[word.d]);
      axis.set(i, set);
    }
  }
  for (let a = 0; a < p.words.length; a++) {
    for (let b = a + 1; b < p.words.length; b++) {
      if (clashes(byWord.get(p.words[a].w), byWord.get(p.words[b].w))) {
        fail(`${label}: "${p.words[a].w}" and "${p.words[b].w}" are part of one another`);
      }
    }
  }
  if (p.message) {
    const msgTiles = tiles(
      Array.from(p.message.toLowerCase())
        .filter((ch) => /\p{L}/u.test(ch))
        .join(""),
      p.lang,
    );
    const left = messageCells(p).map((i) => p.grid[i]);
    if (JSON.stringify(left) !== JSON.stringify(msgTiles)) fail(`${label}: leftover letters do not spell the message`);
  } else if (withMessage === "always") fail(`${label}: no hidden message`);
}

const stats = { made: 0, withMessage: 0, worstMs: 0 };
for (const lang of ["en", "sk"]) {
  const { themes } = library(lang);
  for (const size of [6, 7, 8, 9, 10, 11, 12]) {
    const dirs = size === 6 ? "a" : size === 7 ? "b" : size === 8 ? "c" : size === 9 ? "d" : "e";
    for (const theme of themes) {
      if (!themeFits(theme, size, wordsNeeded(size))) {
        fail(`${lang}/${theme.id}: too few words for ${size} × ${size}`);
        continue;
      }
      for (const withMessage of [true, false]) {
        const seed = hashText(`${lang}/${theme.id}/${size}/${withMessage}`);
        const t0 = performance.now();
        const p = generate({ lang, themeId: theme.id, size, dirs, seed, withMessage });
        stats.worstMs = Math.max(stats.worstMs, performance.now() - t0);
        const label = `${lang}/${theme.id}/${size}${withMessage ? "/message" : ""}`;
        if (!p) {
          fail(`${label}: no puzzle`);
          continue;
        }
        stats.made++;
        if (p.message) stats.withMessage++;
        if (!withMessage && p.message) fail(`${label}: a message nobody asked for`);
        if (!withMessage && p.words.length < Math.ceil(wordTarget(size) * 0.85)) {
          fail(`${label}: only ${p.words.length} words`);
        }
        checkPuzzle(p, label, dirs, withMessage);
        const again = generate({ lang, themeId: theme.id, size, dirs, seed, withMessage });
        if (JSON.stringify(again) !== JSON.stringify(p)) fail(`${label}: the same seed made another puzzle`);
      }
    }
  }
}

// The first puzzles mix their directions: on average no direction holds more than 60 % of a puzzle's words.
for (const lang of ["en", "sk"]) {
  let share = 0;
  let count = 0;
  for (const theme of library(lang).themes) {
    for (let k = 1; k <= 3; k++) {
      const p = generate({ lang, themeId: theme.id, size: 7, dirs: "b", seed: k * 31, withMessage: true });
      const by = {};
      for (const x of p.words) by[x.d] = (by[x.d] || 0) + 1;
      share += Math.max(...Object.values(by)) / p.words.length;
      count++;
    }
  }
  if (share / count > 0.6)
    fail(`${lang}: first puzzles lean on one direction (${((100 * share) / count).toFixed(0)} %)`);
}

// Words not found yet come first.
{
  const theme = library("en").byId.get("fruit");
  const prefer = new Set(["quince", "kiwi", "fig", "lime", "pear", "plum", "date", "olive"]);
  const p = generate({ lang: "en", themeId: "fruit", size: 8, dirs: "c", seed: 7, withMessage: false, prefer });
  const used = p.words.filter((x) => prefer.has(x.w)).length;
  if (used < 6) fail(`preferred words: only ${used} of 8 used (theme of ${theme.words.length})`);
}

// ---- daily puzzles: 400 days in both languages
let days = 0;
for (const lang of ["en", "sk"]) {
  let prevTheme = null;
  for (let k = 0; k < 400; k++) {
    const day = addDays(FIRST_DAY, k);
    const spec = dailySpec(day);
    const id = themeAt(lang, "daily", k);
    const p = generate({
      lang,
      themeId: id,
      size: spec.size,
      dirs: spec.dirs,
      seed: hashText(`daily/${lang}/${day}`),
      withMessage: true,
    });
    if (!p) {
      fail(`daily ${lang} ${day}: no puzzle`);
      continue;
    }
    days++;
    checkPuzzle(p, `daily ${lang} ${day}`, spec.dirs, "always");
    if (id === prevTheme) fail(`daily ${lang} ${day}: the same theme as the day before`);
    prevTheme = id;
  }
}
eq(dailySpec("2026-11-02").size, 8, "Monday's daily puzzle is 8 × 8");
eq(dailySpec("2026-11-08").size, 12, "Sunday's daily puzzle is 12 × 12");
eq(endlessSpec(0, "grow"), { size: 7, dirs: "b", hideList: false }, "the first endless puzzle mixes in a diagonal");
eq(endlessSpec(45, "grow").size, 12, "endless puzzles grow to 12 × 12");
eq(endlessSpec(12, "grow").dirs, "e", "all eight directions by the 13th puzzle");
eq(endlessSpec(0, "hard"), { size: 12, dirs: "e", hideList: true }, "hard puzzles hide the list");

// ---- play: selections and hints
{
  const p = generate({ lang: "sk", themeId: "food", size: 10, dirs: "e", seed: 99, withMessage: true });
  let s = readState(newState(), p);
  const word = p.words[0];
  const cells = cellsOf(p, word);
  eq(selectionResult(p, s, cells[0], cells[cells.length - 1]).result, "found", "a word selected forwards");
  eq(selectionResult(p, s, cells[cells.length - 1], cells[0]).result, "found", "a word selected backwards");
  eq(selectionResult(p, s, cells[0], cells[0]).result, "none", "one square is no word");
  s = markFound(p, s, word);
  eq(selectionResult(p, s, cells[0], cells[cells.length - 1]).result, "again", "a word found before");
  const target = hintTarget(p, s);
  if (!target || s.found.includes(target.w)) fail("a hint targets a word not found yet");
  const h1 = takeHint(s, target);
  eq(h1 && h1.level, 1, "the first hint shows the first letter");
  eq(hintTarget(p, h1.state).w, target.w, "the next hint goes on with the same word");
  const h2 = takeHint(h1.state, target);
  eq(h2 && h2.level, 2, "the second hint shows where the word is");
  eq(takeHint(h2.state, target), null, "no third hint for one word");
  eq(h2.state.used, 2, "two hints counted");
  eq(takeHint(s, p.words[1], 2).level, 2, "Show where can come first");
  for (const x of p.words) s = markFound(p, s, x);
  eq(s.done, true, "solved when every word is found");
  const colours = p.words.map((_, k) => capsuleColour(p, k));
  for (let k = 1; k < colours.length; k++) if (colours[k] === colours[k - 1]) fail("two words in a row share a colour");
  eq(
    readState({ found: ["nonsense", p.words[0].w, p.words[0].w], hints: { x: 1 }, ms: -5 }, p).found,
    [p.words[0].w],
    "a damaged state is cleaned",
  );
}

// ---- dragging
{
  const n = 8;
  // From square 0 (top left) towards (3.5, 0.6): east, 3 squares on.
  eq(snapEnd(n, 0, 3.5, 0.6), 3, "a drag a little off the line snaps across");
  eq(snapEnd(n, 0, 3.4, 3.7), 27, "a diagonal drag snaps to the diagonal");
  eq(snapEnd(n, 0, -2, 0.5), 0, "a drag off the grid stops at the edge");
  eq(snapEnd(n, 9, 1.4, 1.6), 9, "a small move stays on the first square");
  eq(snapEnd(n, 63, 20, 20), 63, "the last square cannot go further");
  eq(lineCells(n, 0, 27), [0, 9, 18, 27], "the squares of a diagonal");
  eq(inLine(n, 0, 10), false, "a knight's move is no line");
  eq(Object.keys(STEP).length, 8, "eight directions");
}

console.log(
  `themes: ${EN.THEMES.length} (${words.en} English words, ${words.sk} Slovak words); ` +
    `${stats.made} puzzles checked (${stats.withMessage} with a hidden message), slowest ${stats.worstMs.toFixed(0)} ms; ` +
    `${days} daily puzzles`,
);
if (problems.length) {
  for (const p of problems.slice(0, 60)) console.error(`  ${p}`);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exitCode = 1;
} else console.log("all checks passed");
