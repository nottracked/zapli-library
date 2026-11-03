// The state of one Word Wheel puzzle as the player solves it: the grid words found, the extra words found, the
// squares a hint showed and the hints used. Plain data (it is saved as JSON), changed only through these functions,
// which return a new state and never touch the DOM.
//
// A wheel is solved when every grid word is found, and complete when its hidden words (the common words it can make
// that the grid does not use) are found too. Every extra word, hidden or bonus, fills the jar toward a free hint.

/** Free hints at the start of every puzzle. */
export const FREE_HINTS = 3;

/** Every this many extra words found in a puzzle add one hint to it. */
export const EXTRAS_PER_HINT = 5;

/** The shortest word that counts. */
export const MIN_WORD = 3;

export function newState(puzzle) {
  return { id: puzzle.id, found: [], extras: [], shown: [], hints: 0, done: false };
}

/** A square's key: "row,column". */
export const cellKey = (r, c) => `${r},${c}`;

/** The keys of a grid word's squares, in reading order. */
export function cellsOf(word) {
  return word.t.map((_, k) => cellKey(word.r + (word.d === "v" ? k : 0), word.c + (word.d === "h" ? k : 0)));
}

/** Every square of the grid with its letter: key -> tile. */
export function letters(puzzle) {
  const out = new Map();
  for (const w of puzzle.words) cellsOf(w).forEach((key, k) => out.set(key, w.t[k]));
  return out;
}

/** The squares the player can see: those of found words and those a hint showed. */
export function visibleCells(puzzle, state) {
  const out = new Set(state.shown);
  const found = new Set(state.found);
  for (const w of puzzle.words) if (found.has(w.w)) cellsOf(w).forEach((key) => out.add(key));
  return out;
}

/** The wheel's hidden words: the common words it can make that are not in the grid. */
export function hiddenOf(puzzle) {
  return Array.isArray(puzzle.hidden) ? puzzle.hidden : [];
}

/** How many of the wheel's hidden words the player has found. */
export function hiddenFound(puzzle, state) {
  const hidden = new Set(hiddenOf(puzzle));
  return state.extras.filter((w) => hidden.has(w)).length;
}

/** Solved and every hidden word found. */
export function isComplete(puzzle, state) {
  return state.done && hiddenFound(puzzle, state) >= hiddenOf(puzzle).length;
}

/** How full the jar is: extra words toward the next free hint (0 to EXTRAS_PER_HINT - 1). */
export function jarLevel(state) {
  return state.extras.length % EXTRAS_PER_HINT;
}

/** Hints the player still has in this puzzle. */
export function hintsLeft(state) {
  return Math.max(0, FREE_HINTS + Math.floor(state.extras.length / EXTRAS_PER_HINT) - state.hints);
}

/** Marks as found every word whose squares are all visible (hints and crossing words can complete one). */
function settle(puzzle, state) {
  const visible = visibleCells(puzzle, state);
  const found = state.found.slice();
  for (const w of puzzle.words) {
    if (!found.includes(w.w) && cellsOf(w).every((key) => visible.has(key))) found.push(w.w);
  }
  return { ...state, found, done: found.length === puzzle.words.length };
}

/**
 * Tries a word made on the wheel (its tiles). The result says what it was:
 * "short", "found" (a grid word), "again" (a grid word found before), "extra" (a real word not in the grid),
 * "extraAgain" (an extra word found before in this puzzle) or "unknown".
 */
export function tryWord(puzzle, state, tiles) {
  const word = tiles.join("");
  if (tiles.length < MIN_WORD) return { result: "short", word, state };
  const grid = puzzle.words.find((w) => w.w === word);
  if (grid) {
    if (state.found.includes(word)) return { result: "again", word, state };
    const next = settle(puzzle, { ...state, found: [...state.found, word] });
    return { result: "found", word, state: next, cells: cellsOf(grid) };
  }
  if (puzzle.extra.includes(word)) {
    if (state.extras.includes(word)) {
      return { result: "extraAgain", kind: hiddenOf(puzzle).includes(word) ? "hidden" : "bonus", word, state };
    }
    const before = hintsLeft(state);
    const next = { ...state, extras: [...state.extras, word] };
    const kind = hiddenOf(puzzle).includes(word) ? "hidden" : "bonus";
    return { result: "extra", kind, word, state: next, earnedHint: hintsLeft(next) > before };
  }
  return { result: "unknown", word, state };
}

/** Shows one square with a hint. Returns null when the square is visible already or no hint is left. */
export function showCell(puzzle, state, key) {
  if (hintsLeft(state) <= 0 || state.done) return null;
  if (!letters(puzzle).has(key) || visibleCells(puzzle, state).has(key)) return null;
  return settle(puzzle, { ...state, shown: [...state.shown, key], hints: state.hints + 1 });
}

/**
 * The square a plain hint shows: the first hidden square of the unfinished word that is closest to done (fewest
 * hidden squares, then the shorter word, then the grid's order), so a hint helps finish a word.
 */
export function hintCell(puzzle, state) {
  const visible = visibleCells(puzzle, state);
  let best = null;
  for (const w of puzzle.words) {
    if (state.found.includes(w.w)) continue;
    const hidden = cellsOf(w).filter((key) => !visible.has(key));
    if (!hidden.length) continue;
    if (
      !best ||
      hidden.length < best.hidden.length ||
      (hidden.length === best.hidden.length && w.t.length < best.len)
    ) {
      best = { hidden, len: w.t.length };
    }
  }
  return best ? best.hidden[0] : null;
}
