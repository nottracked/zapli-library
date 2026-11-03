// Makes Word Wheel puzzles from a word list: a wheel of five to seven letters that spell at least one long word, the
// words a puzzle asks for (from the list's answer tier) laid out as a small crossword, and every other real word the
// wheel can make (both tiers), which the game counts as extra words. Of those, the common ones (answer tier) are the
// wheel's hidden words, which the game counts ("hidden 2 of 6"); the rarer ones (accepted tier) are bonus words.
//
// Everything here is repeatable: a daily puzzle depends only on the language, the date and the word list, and an
// endless puzzle only on the language, the wheel size, its number and the word list. The page's worker and the checks
// in dev/ run this same module.

import { ALPHABETS, VOWELS, tiles as tilesOf, tileIndex } from "../core/letters.mjs";
import { rngFor, pick, shuffled } from "../core/rng.mjs";
import { dayNumber } from "../core/dates.mjs";
import { layoutWords, gridIsSound } from "./layout.mjs";

/** Wheel sizes the game offers (letters on the wheel). */
export const SIZES = [5, 6, 7];

/** The shortest word that counts. */
export const MIN_LENGTH = 3;

/** The size of the daily wheel. */
export const DAILY_SIZE = 7;

/**
 * What makes a wheel good enough, by its size: at least `candidates` answer words the wheel can make (the long word
 * included), and a grid of at least `minGrid` and at most `maxGrid` words, of which at most `maxShort` have three
 * letters. A grid is at most `maxSide` cells wide and tall.
 */
export const RULES = {
  5: { candidates: 5, minGrid: 4, maxGrid: 6, maxShort: 3, maxSide: 8 },
  6: { candidates: 6, minGrid: 5, maxGrid: 7, maxShort: 3, maxSide: 9 },
  7: { candidates: 7, minGrid: 5, maxGrid: 9, maxShort: 4, maxSide: 10 },
};

const LAYOUT_TRIES = 10;
const PICK_TRIES = 6;
const SEED_TRIES = 24;

function entryOf(lang, word, answer) {
  const t = tilesOf(word, lang);
  if (!t || t.length < MIN_LENGTH || t.length > 7) return null;
  const idx = t.map((x) => tileIndex(lang, x));
  let lo = 0;
  let hi = 0;
  for (const i of idx) {
    if (i < 30) lo |= 1 << i;
    else hi |= 1 << (i - 30);
  }
  return { word, tiles: t, idx, len: t.length, lo, hi, answer };
}

/**
 * Prepares a language's word list for the generator: `answers` and `accepted` as read from the list file. Words that
 * are too short or too long for a wheel, or hold a letter outside the alphabet, are left out.
 */
export function buildIndex(lang, lists) {
  const seen = new Set();
  const answers = [];
  const all = [];
  for (const [list, answer] of [
    [lists.answers, true],
    [lists.accepted, false],
  ]) {
    for (const word of list) {
      if (seen.has(word)) continue;
      const e = entryOf(lang, word, answer);
      if (!e) continue;
      seen.add(word);
      all.push(e);
      if (answer) answers.push(e);
    }
  }
  // Hidden words are the answer words the list marks as common, or every answer word when it marks none.
  const common = lists.common && lists.common.length ? new Set(lists.common) : null;
  return { lang, answers, all, common, words: seen, alphabet: ALPHABETS[lang].length, seeds: {}, orders: {} };
}

function countsOf(index, entry) {
  const counts = new Int8Array(index.alphabet);
  for (const i of entry.idx) counts[i]++;
  return counts;
}

/** The entries of `list` that the letters of `wheel` (an entry) can make, each letter used at most once. */
function madeFrom(list, wheel, counts) {
  const scratch = new Int8Array(counts.length);
  const out = [];
  for (const e of list) {
    if ((e.lo & ~wheel.lo) !== 0 || (e.hi & ~wheel.hi) !== 0 || e.len > wheel.len) continue;
    scratch.set(counts);
    let ok = true;
    for (const i of e.idx) {
      if (--scratch[i] < 0) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(e);
  }
  return out;
}

const letterKey = (e) =>
  e.idx
    .slice()
    .sort((a, b) => a - b)
    .join(".");

/**
 * The answer words of a size that make good wheels, one per set of letters (anagrams share a wheel), in list order.
 * Computed once per size and kept in the index.
 */
export function seedsOf(index, size) {
  if (index.seeds[size]) return index.seeds[size];
  const rule = RULES[size];
  const keys = new Set();
  const seeds = [];
  for (const e of index.answers) {
    if (e.len !== size) continue;
    const k = letterKey(e);
    if (keys.has(k)) continue;
    keys.add(k);
    const made = madeFrom(index.answers, e, countsOf(index, e));
    if (made.length >= rule.candidates) seeds.push(e);
  }
  index.seeds[size] = seeds;
  return seeds;
}

/** Picks the words a grid asks for: one long word first, then a mix that leans to longer words. */
function chooseWords(candidates, size, rule, rng) {
  const full = candidates.filter((e) => e.len === size);
  const first = full[pick(rng, full.length)];
  const pool = candidates.filter((e) => e !== first);
  const chosen = [first];
  let short = 0;
  while (chosen.length < rule.maxGrid && pool.length) {
    const weights = pool.map((e) => (e.len === MIN_LENGTH && short >= rule.maxShort ? 0 : e.len * e.len));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let x = rng() * total;
    let i = 0;
    while (x >= weights[i]) {
      x -= weights[i];
      i++;
    }
    const [e] = pool.splice(i, 1);
    if (e.len === MIN_LENGTH) short++;
    chosen.push(e);
  }
  const [head, ...rest] = chosen;
  rest.sort((a, b) => b.len - a.len);
  return [head, ...rest];
}

/** Puts the wheel's letters in an order that never spells the long word, and keeps vowels apart where it can. */
function wheelOrder(lang, word, rng) {
  const target = word.tiles.join("|");
  const vowels = VOWELS[lang];
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < 12; i++) {
    const order = shuffled(word.tiles, rng);
    const text = order.join("|");
    const doubled = `${text}|${text}`;
    const reversed = order.slice().reverse().join("|");
    if (doubled.includes(target) || `${reversed}|${reversed}`.includes(target)) continue;
    let apart = 0;
    for (let k = 0; k < order.length; k++) {
      if (vowels.has(order[k]) !== vowels.has(order[(k + 1) % order.length])) apart++;
    }
    if (apart > bestScore) {
      best = order;
      bestScore = apart;
    }
  }
  return best || shuffled(word.tiles, rng);
}

/** One puzzle from one wheel (an answer entry), or null when its words do not make a good enough grid. */
export function makePuzzle(index, wheel, rng, meta) {
  const size = wheel.len;
  const rule = RULES[size];
  const counts = countsOf(index, wheel);
  const candidates = madeFrom(index.answers, wheel, counts);
  if (candidates.length < rule.candidates) return null;
  let best = null;
  for (let p = 0; p < PICK_TRIES && !(best && best.words.length >= rule.maxGrid); p++) {
    const chosen = chooseWords(candidates, size, rule, rng);
    for (let t = 0; t < LAYOUT_TRIES; t++) {
      const order = [chosen[0], ...shuffled(chosen.slice(1), rng).sort((a, b) => b.len - a.len)];
      const grid = layoutWords(order, rng, rule.maxSide);
      if (grid.words.length < rule.minGrid || !gridIsSound(grid)) continue;
      const area = grid.rows * grid.cols;
      if (
        !best ||
        grid.words.length > best.words.length ||
        (grid.words.length === best.words.length && area < best.rows * best.cols)
      ) {
        best = grid;
      }
    }
  }
  if (!best) return null;
  const inGrid = new Set(best.words.map((w) => w.entry.word));
  const extra = madeFrom(index.all, wheel, counts)
    .map((e) => e.word)
    .filter((w) => !inGrid.has(w))
    .sort();
  const hidden = candidates
    .map((e) => e.word)
    .filter((w) => !inGrid.has(w) && (!index.common || index.common.has(w)))
    .sort();
  const words = best.words
    .map((w) => ({ w: w.entry.word, t: w.entry.tiles, r: w.r, c: w.c, d: w.d }))
    .sort((a, b) => a.t.length - b.t.length || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
  return {
    v: 1,
    id: meta.id,
    kind: meta.kind,
    lang: index.lang,
    size,
    day: meta.day || null,
    level: meta.level === undefined ? null : meta.level,
    letters: wheelOrder(index.lang, wheel, rng),
    rows: best.rows,
    cols: best.cols,
    words,
    extra,
    hidden,
  };
}

function orderOf(index, name, size) {
  const k = `${name}:${size}`;
  if (!index.orders[k]) index.orders[k] = shuffled(seedsOf(index, size), rngFor(`${name}-order|${index.lang}|${size}`));
  return index.orders[k];
}

function fromOrder(index, order, base, salt, meta) {
  const n = order.length;
  if (!n) return null;
  for (let k = 0; k < SEED_TRIES; k++) {
    const wheel = order[(((base + k * 37) % n) + n) % n];
    const puzzle = makePuzzle(index, wheel, rngFor(`${salt}|${k}`), meta);
    if (puzzle) return puzzle;
  }
  return null;
}

/** The daily puzzle of a date ("2026-11-03"): the same for every player of that language and word list. */
export function dailyPuzzle(index, day) {
  const order = orderOf(index, "daily", DAILY_SIZE);
  return fromOrder(index, order, dayNumber(day), `daily|${index.lang}|${day}`, {
    id: `d:${index.lang}:${day}`,
    kind: "daily",
    day,
  });
}

/** Endless puzzle number `level` (from 0) with a wheel of `size` letters. */
export function endlessPuzzle(index, size, level) {
  const order = orderOf(index, "endless", size);
  return fromOrder(index, order, level, `endless|${index.lang}|${size}|${level}`, {
    id: `e:${index.lang}:${size}:${level}`,
    kind: "endless",
    level,
  });
}
