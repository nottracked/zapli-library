// The puzzle generator. It places a theme's words in a square grid, crossing where their letters agree, then fills
// the squares no word uses: with a hidden message read row by row when one fits them exactly, else with filler
// letters in the language's proportions.
//
// Every puzzle keeps three promises, checked before it is returned: each word of the list is in the grid exactly
// once (in any direction, so no copy hides elsewhere), no chosen word is part of another chosen word, and two words
// never run along the same line over the same squares. The same seed always gives the same puzzle, so a day's
// daily puzzle is the same on every phone.

import { makeRng } from "../core/rng.mjs";
import { fillerTile } from "./filler.mjs";
import { DIRECTION_SETS, wordTarget } from "./levels.mjs";
import { library, themeById, wordsThatFit } from "./themes.mjs";

/** The step of each direction as [rows, columns]. */
export const STEP = {
  e: [0, 1],
  s: [1, 0],
  se: [1, 1],
  ne: [-1, 1],
  w: [0, -1],
  n: [-1, 0],
  nw: [-1, -1],
  sw: [1, -1],
};
const DIRS = Object.keys(STEP);
// Words on the same line (e and w, s and n, …) may not share squares.
const AXIS = { e: 0, w: 0, s: 1, n: 1, se: 2, nw: 2, ne: 3, sw: 3 };
const MAX_WORDS = 30;
const ATTEMPTS = 30;

/** The squares (row-major indices) a word covers, from its first tile to its last. */
export function cellsAt(size, r, c, d, len) {
  const [dr, dc] = STEP[d];
  const out = [];
  for (let k = 0; k < len; k++) out.push((r + dr * k) * size + (c + dc * k));
  return out;
}

const sameTiles = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function containsRun(big, small) {
  for (let i = 0; i + small.length <= big.length; i++) {
    let ok = true;
    for (let k = 0; k < small.length && ok; k++) ok = big[i + k] === small[k];
    if (ok) return true;
  }
  return false;
}

/** Whether one word is part of the other, either way round (CAT and CATERPILLAR, TAC and CATERPILLAR). */
export function clashes(a, b) {
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  return containsRun(big, small) || containsRun(big, small.slice().reverse());
}

function emptyBoard(size) {
  return { size, tiles: new Array(size * size).fill(null), axes: new Array(size * size).fill(0), free: size * size };
}

// The new squares a placement would fill, or -1 when it does not fit: off the grid, a square with another letter,
// a square of a word on the same line, or no new square at all.
function fresh(board, t, r, c, d) {
  const n = board.size;
  const [dr, dc] = STEP[d];
  const er = r + dr * (t.length - 1);
  const ec = c + dc * (t.length - 1);
  if (er < 0 || er >= n || ec < 0 || ec >= n) return -1;
  const bit = 1 << AXIS[d];
  let count = 0;
  for (let k = 0; k < t.length; k++) {
    const i = (r + dr * k) * n + (c + dc * k);
    const x = board.tiles[i];
    if (x === null) count++;
    else if (x !== t[k] || board.axes[i] & bit) return -1;
  }
  return count === 0 ? -1 : count;
}

function placeWord(board, word, r, c, d) {
  const cells = cellsAt(board.size, r, c, d, word.t.length);
  const bit = 1 << AXIS[d];
  cells.forEach((i, k) => {
    if (board.tiles[i] === null) board.free--;
    board.tiles[i] = word.t[k];
    board.axes[i] |= bit;
  });
  return { w: word.w, t: word.t, r, c, d };
}

// Every way a word fits, with the new squares each fills.
function placements(board, word, dirs) {
  const out = [];
  const n = board.size;
  for (const d of dirs) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const f = fresh(board, word.t, r, c, d);
        if (f > 0) out.push({ word, r, c, d, fresh: f });
      }
    }
  }
  return out;
}

// The best of some placements: first the direction used least so far that has any (so a grid mixes across, down,
// diagonal and backwards words), then within it the most crossings (a word that shares letters ties the grid
// together), with a little chance so grids differ.
function best(cands, rng, usage) {
  const byDir = new Map();
  for (const cand of cands) {
    if (!byDir.has(cand.d)) byDir.set(cand.d, []);
    byDir.get(cand.d).push(cand);
  }
  const dirs = Array.from(byDir.keys())
    .map((d) => ({ d, key: (usage[d] || 0) + rng() * 0.5 }))
    .sort((a, b) => a.key - b.key);
  let top = null;
  let topScore = -Infinity;
  for (const cand of byDir.get(dirs[0].d)) {
    const score = (cand.word.t.length - cand.fresh) * 2.5 + rng() * 2;
    if (score > topScore) {
      top = cand;
      topScore = score;
    }
  }
  return top;
}

// The words in the order they are tried: the preferred ones (words a player has not found yet) first, longer words
// before shorter ones within the first picks so the grid fills well.
function orderPool(words, prefer, rng, take) {
  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const first = shuffle(words.filter((x) => prefer && prefer.has(x.w)));
  const rest = shuffle(words.filter((x) => !(prefer && prefer.has(x.w))));
  const all = first.concat(rest);
  const head = all.slice(0, take).sort((a, b) => b.t.length - a.t.length);
  return head.concat(all.slice(take));
}

// Places words until the target is met; with a message of `len` tiles, goes on until exactly `len` squares are left
// for it. Returns the board and the placed words, or null.
function build(size, pool, dirs, rng, len) {
  const board = emptyBoard(size);
  const placed = [];
  const usage = Object.fromEntries(dirs.map((d) => [d, 0]));
  const target = wordTarget(size);
  const free = (word) => !placed.some((p) => clashes(p.t, word.t));
  const fits = (cand) => {
    if (len < 0) return true;
    const left = board.free - cand.fresh - len;
    return left === 0 || left >= 3;
  };
  const add = (cand) => {
    placed.push(placeWord(board, cand.word, cand.r, cand.c, cand.d));
    usage[cand.d]++;
  };

  for (const word of pool) {
    if (placed.length >= target) break;
    if (len >= 0 && board.free - len <= size) break;
    if (!free(word)) continue;
    const cands = placements(board, word, dirs).filter(fits);
    if (cands.length) add(best(cands, rng, usage));
  }
  if (len < 0) return placed.length >= Math.ceil(target * 0.85) ? { board, placed } : null;
  if (board.free < len) return null;

  while (board.free > len) {
    if (placed.length >= MAX_WORDS) return null;
    const need = board.free - len;
    let exact = [];
    let closer = [];
    for (const word of pool) {
      if (placed.some((p) => p.w === word.w) || !free(word)) continue;
      for (const cand of placements(board, word, dirs)) {
        if (cand.fresh === need) exact.push(cand);
        else if (cand.fresh <= need - 3) closer.push(cand);
      }
    }
    if (exact.length) {
      add(best(exact, rng, usage));
      break;
    }
    if (!closer.length) return null;
    const most = Math.max(...closer.map((x) => x.fresh));
    add(
      best(
        closer.filter((x) => x.fresh === most),
        rng,
        usage,
      ),
    );
  }
  return board.free === len ? { board, placed } : null;
}

/** How many times a word is in a grid, in any direction (a word that reads the same backwards counts once). */
export function occurrences(tiles, size, t) {
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (tiles[r * size + c] !== t[0]) continue;
      for (const d of DIRS) {
        const [dr, dc] = STEP[d];
        const er = r + dr * (t.length - 1);
        const ec = c + dc * (t.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let ok = true;
        for (let k = 1; k < t.length && ok; k++) ok = tiles[(r + dr * k) * size + (c + dc * k)] === t[k];
        if (ok) count++;
      }
    }
  }
  return sameTiles(t, t.slice().reverse()) ? count / 2 : count;
}

// The hidden message's length should suit the grid: about a sixth to a third of its squares.
function messageWindow(size) {
  const n = size * size;
  return [Math.max(5, Math.round(n * 0.15)), Math.round(n * 0.34)];
}

function pickMessage(messages, size, rng, avoid) {
  const [lo, hi] = messageWindow(size);
  const fit = messages.filter((m) => m.t.length >= lo && m.t.length <= hi);
  const fresh = fit.filter((m) => !(avoid && avoid.has(m.text)));
  const from = fresh.length ? fresh : fit;
  return from.length ? from[Math.floor(rng() * from.length)] : null;
}

/**
 * Makes a puzzle, or null when the theme cannot fill this grid.
 *  lang, themeId   the language and theme
 *  size, dirs      the grid's side (6 to 12) and a key of DIRECTION_SETS
 *  seed            a 32-bit number; the same arguments and seed give the same puzzle
 *  withMessage     try to leave the free squares for a hidden message
 *  prefer          a Set of words to use first (words the player has not found yet)
 *  avoidMessages   a Set of message texts to skip when another fits (the latest ones shown)
 */
export function generate({ lang, themeId, size, dirs, seed, withMessage, prefer, avoidMessages }) {
  const theme = themeById(lang, themeId);
  if (!theme) return null;
  const allowed = DIRECTION_SETS[dirs] || DIRECTION_SETS.a;
  // On a small grid a word as long as a whole row leaves no room for words across it, so those grids take words one
  // letter shorter and keep their directions mixed.
  const words = wordsThatFit(theme, size <= 8 ? size - 1 : size);
  const { messages } = library(lang);
  const rng = makeRng(seed);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // The last attempts give up the hidden message rather than the puzzle.
    const message = withMessage && attempt < ATTEMPTS - 6 ? pickMessage(messages, size, rng, avoidMessages) : null;
    const pool = orderPool(words, prefer, rng, wordTarget(size) + 2);
    const built = build(size, pool, allowed, rng, message ? message.t.length : -1);
    if (!built) continue;
    const { board, placed } = built;
    const free = [];
    board.tiles.forEach((x, i) => {
      if (x === null) free.push(i);
    });
    let ok = false;
    for (let fill = 0; fill < (message ? 1 : 8) && !ok; fill++) {
      free.forEach((i, k) => {
        board.tiles[i] = message ? message.t[k] : fillerTile(lang, rng());
      });
      ok = placed.every((p) => occurrences(board.tiles, size, p.t) === 1);
    }
    if (!ok) continue;
    return {
      v: 1,
      lang,
      theme: theme.id,
      size,
      dirs,
      seed: seed >>> 0,
      grid: board.tiles.slice(),
      words: placed.map((p) => ({ w: p.w, r: p.r, c: p.c, d: p.d, n: p.t.length })),
      message: message ? message.text : null,
    };
  }
  return null;
}

/** The squares of the hidden message in reading order: every square no word uses. */
export function messageCells(puzzle) {
  const used = new Set();
  for (const x of puzzle.words) for (const i of cellsAt(puzzle.size, x.r, x.c, x.d, x.n)) used.add(i);
  const out = [];
  for (let i = 0; i < puzzle.size * puzzle.size; i++) if (!used.has(i)) out.push(i);
  return out;
}

/** Whether a direction runs backwards (right to left or upwards). */
export function isBackwards(d) {
  return d === "w" || d === "n" || d === "nw" || d === "sw";
}
