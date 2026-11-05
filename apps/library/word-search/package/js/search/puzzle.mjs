// The state of one puzzle and the rules of play, without any drawing: which selections find a word, hints, the
// colours of the found words and when the puzzle is solved. The page keeps the state and saves it after each change;
// every function returns a new state and leaves the old one as it was.
//
// State: { found: [word, …] in the order found, hints: { word: 1 | 2 }, used: hints taken, ms: time played,
//          done: true once every word is found }

import { cellsAt, messageCells, isBackwards } from "./generator.mjs";

export function newState() {
  return { found: [], hints: {}, used: 0, ms: 0, done: false };
}

/** A saved state, checked and completed, so an old or damaged save never breaks the page. */
export function readState(raw, puzzle) {
  const s = raw && typeof raw === "object" ? raw : {};
  const names = new Set(puzzle.words.map((x) => x.w));
  const found = Array.isArray(s.found) ? s.found.filter((w, i, all) => names.has(w) && all.indexOf(w) === i) : [];
  const hints = {};
  if (s.hints && typeof s.hints === "object") {
    for (const [w, level] of Object.entries(s.hints))
      if (names.has(w) && (level === 1 || level === 2)) hints[w] = level;
  }
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return { found, hints, used: n(s.used), ms: n(s.ms), done: found.length === puzzle.words.length };
}

/** The squares of a word of the puzzle, from its first letter to its last. */
export function cellsOf(puzzle, word) {
  return cellsAt(puzzle.size, word.r, word.c, word.d, word.n);
}

const endsKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * What a selection from square `a` to square `b` finds: { result: "found", word } for a word not found yet (read in
 * either direction), { result: "again", word } for one found before, or { result: "none" }.
 */
export function selectionResult(puzzle, state, a, b) {
  if (a === b) return { result: "none" };
  const key = endsKey(a, b);
  for (const word of puzzle.words) {
    const cells = cellsOf(puzzle, word);
    if (endsKey(cells[0], cells[cells.length - 1]) !== key) continue;
    return { result: state.found.includes(word.w) ? "again" : "found", word };
  }
  return { result: "none" };
}

/** The state after finding a word. */
export function markFound(puzzle, state, word) {
  if (state.found.includes(word.w)) return state;
  const found = state.found.concat(word.w);
  const hints = { ...state.hints };
  delete hints[word.w];
  return { ...state, found, hints, done: found.length === puzzle.words.length };
}

/**
 * The word a hint helps with when the player has not chosen one: a word already given its first letter comes next
 * (the hint then shows where it is), else the hardest word left: backwards, then diagonal, then the shortest.
 */
export function hintTarget(puzzle, state) {
  const left = puzzle.words.filter((x) => !state.found.includes(x.w));
  if (!left.length) return null;
  const started = left.find((x) => state.hints[x.w] === 1);
  if (started) return started;
  const fresh = left.filter((x) => !state.hints[x.w]);
  const from = fresh.length ? fresh : left;
  const hardness = (x) => (isBackwards(x.d) ? 2 : 0) + (x.d.length === 2 ? 1 : 0);
  return from.slice().sort((a, b) => hardness(b) - hardness(a) || a.n - b.n || (a.w < b.w ? -1 : 1))[0];
}

/**
 * Takes a hint for a word: its first letter (level 1) or where it is (level 2). Without `wanted` the next level
 * after the one shown. Returns the new state and the level now shown, or null when the word is found or already
 * shows that much.
 */
export function takeHint(state, word, wanted) {
  if (state.found.includes(word.w)) return null;
  const shown = state.hints[word.w] || 0;
  const level = wanted || shown + 1;
  if (level > 2 || level <= shown) return null;
  return { state: { ...state, hints: { ...state.hints, [word.w]: level }, used: state.used + 1 }, level };
}

/** The leftover squares that spell the hidden message, in reading order (empty without a message). */
export function hiddenMessageCells(puzzle) {
  return puzzle.message ? messageCells(puzzle) : [];
}

// The highlighter colours of found words. Words found one after another get colours far apart in this list, and a
// puzzle starts at its own place in it, so neighbouring capsules rarely share a colour.
export const CAPSULE_COLOURS = 10;

/** The colour (0 to CAPSULE_COLOURS - 1) of the n-th word found in a puzzle. */
export function capsuleColour(puzzle, n) {
  const start = (puzzle.seed >>> 0) % CAPSULE_COLOURS;
  return (start + n * 3) % CAPSULE_COLOURS;
}
