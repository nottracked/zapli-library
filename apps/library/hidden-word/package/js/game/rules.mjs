// The rules of Hidden Word, with no DOM and no state, so the page and the checks in dev/ share them.
//
// A word is a list of tiles (js/core/letters.mjs): Slovak CH is one tile, and letters with accents are letters of
// their own. Each letter of a guess gets one of three marks:
//   "hit"   the letter is in the word, in this place (drawn as a filled dot)
//   "near"  the letter is in the word, in another place (a ring)
//   "miss"  the letter is not in the word, or not as many times as the guess has it (a dash)

export const HIT = "hit";
export const NEAR = "near";
export const MISS = "miss";

const RANK = { [MISS]: 1, [NEAR]: 2, [HIT]: 3 };

/** The shortest and longest words, and the default. */
export const LENGTHS = [4, 5, 6, 7];
export const DEFAULT_LENGTH = 5;

/** How many guesses a word gets: by the setting, from its length. "free" has no limit (0). */
export const GUESS_SETTINGS = ["tight", "standard", "relaxed", "free"];
export function maxGuesses(length, setting) {
  if (setting === "free") return 0;
  if (setting === "tight") return length;
  if (setting === "relaxed") return length + 3;
  return length + 1;
}

/**
 * The marks of a guess against the answer. Places that match are hits first; then, from the left, a letter that
 * is still left over in the answer is near; every other letter is a miss. So a letter guessed twice when the word has
 * it once gets one mark for the word and a dash for the rest.
 */
export function score(guess, answer) {
  const marks = guess.map(() => MISS);
  const left = new Map();
  guess.forEach((tile, i) => {
    if (tile === answer[i]) marks[i] = HIT;
    else left.set(answer[i], (left.get(answer[i]) || 0) + 1);
  });
  guess.forEach((tile, i) => {
    if (marks[i] === HIT) return;
    const n = left.get(tile) || 0;
    if (n > 0) {
      marks[i] = NEAR;
      left.set(tile, n - 1);
    }
  });
  return marks;
}

export const isWin = (marks) => marks.length > 0 && marks.every((m) => m === HIT);

/**
 * What the guesses so far tell about the word:
 *   places   the letter known in each place (from a hit, or the hint), else null
 *   keys     each guessed letter's best mark (hit over near over miss), for the keyboard
 *   least    each letter the word has for sure, with how many times at least
 * `hint` is { pos, tile } or null.
 */
export function knowledge(guesses, answer, hint) {
  const places = answer.map(() => null);
  const keys = new Map();
  const least = new Map();
  for (const guess of guesses) {
    const marks = score(guess, answer);
    const here = new Map();
    guess.forEach((tile, i) => {
      const mark = marks[i];
      if (mark === HIT) places[i] = tile;
      const was = keys.get(tile);
      if (!was || RANK[mark] > RANK[was]) keys.set(tile, mark);
      if (mark !== MISS) here.set(tile, (here.get(tile) || 0) + 1);
    });
    for (const [tile, n] of here) least.set(tile, Math.max(least.get(tile) || 0, n));
  }
  if (hint && Number.isInteger(hint.pos) && answer[hint.pos] === hint.tile) {
    places[hint.pos] = hint.tile;
    if (!keys.has(hint.tile) || keys.get(hint.tile) !== HIT) keys.set(hint.tile, HIT);
    // A hinted letter counts toward the letters the word has at least.
    const placed = places.filter((t) => t === hint.tile).length;
    least.set(hint.tile, Math.max(least.get(hint.tile) || 0, placed));
  }
  return { places, keys, least };
}

/**
 * Hard mode: every letter found so far must be used again, a letter found in its place stays there. Returns null
 * when the guess keeps to it, else what it breaks first: { kind: "place", pos, tile } or { kind: "use", tile, n }.
 */
export function hardProblem(guess, guesses, answer, hint) {
  const { places, least } = knowledge(guesses, answer, hint);
  for (let i = 0; i < places.length; i++) {
    if (places[i] && guess[i] !== places[i]) return { kind: "place", pos: i, tile: places[i] };
  }
  for (const [tile, n] of least) {
    const has = guess.filter((t) => t === tile).length;
    if (has < n) return { kind: "use", tile, n };
  }
  return null;
}

/** The place a hint shows: the first place from the left whose letter is not known yet, or -1. */
export function hintPlace(guesses, answer, hint) {
  const { places } = knowledge(guesses, answer, hint);
  return places.findIndex((t) => t === null);
}
