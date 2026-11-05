// The word a player makes by tapping letters one by one, and when it counts by itself. Plain data and pure
// functions (no DOM, no timers), so the rules can be checked without a browser; the wheel keeps the state and the
// page says which words are answers.
//
// The rules:
//  - A tap adds a letter. When the letters tapped so far make an answer not found yet (a crossword word or a word for
//    the jar), the word is taken at once: no tick needed. It stays lit for a moment (the wheel clears it by itself).
//  - While a taken word is lit, a tap on a letter that is not in it carries the word on, so a longer word through it
//    is never lost; a tap on one of its letters starts a new word with that letter.
//  - As long as the word still holds letters of the word just taken, every tap picks the longest run of the latest
//    taps that can still become an answer not found yet; when none can, the taps after the taken word are the new
//    word. So a player who goes straight on to the next word never needs an extra tap to clear the last one.
//  - Once the word is all new letters, taps build it as usual: a tap on its last letter takes that letter back, a
//    tap on another of its letters does nothing, and words that are no answer wait for the tick.
//  - Nothing here says "already found" or "not in the list": only the tick and a swipe try a word that way.
//
// The state: `stream` holds the wheel positions of every letter tapped since the word was last empty, `start` is
// where the current word begins in it, `lit` says the current word was just taken, and `after` is where the taps
// after the last taken word begin (0 when no word was taken since the word was last empty).

/** No word. */
export const EMPTY = Object.freeze({ stream: Object.freeze([]), start: 0, lit: false, after: 0 });

/** The current word: the wheel positions of its letters, in order. */
export const wordOf = (s) => s.stream.slice(s.start);

/** A plain word being built from these wheel positions (a swipe the system interrupted). */
export const fromWord = (positions) =>
  positions.length ? { stream: positions.slice(), start: 0, lit: false, after: 0 } : EMPTY;

const distinct = (list) => new Set(list).size === list.length;

/**
 * One tapped letter (`i`, its position on the wheel). `ctx.letters` holds the wheel's letters by position;
 * `ctx.leadsOn(tiles)` says whether an answer not found yet starts with these letters (or is them), and
 * `ctx.isNew(tiles)` whether they make an answer not found yet. Returns the new state (the same object when the tap
 * changes nothing) and `taken`, the letters of a word taken by this tap, or null.
 */
export function tap(s, i, ctx) {
  const letter = (k) => ctx.letters[k];
  const word = wordOf(s);
  // Building: a tap on the last letter takes it back.
  if (!s.lit && word.length && word[word.length - 1] === i) {
    const stream = s.stream.slice(0, -1);
    if (stream.length <= s.start) return { state: EMPTY, taken: null };
    return { state: { stream, start: s.start, lit: false, after: Math.min(s.after, stream.length) }, taken: null };
  }
  const near = s.lit || s.after > s.start; // the word still holds letters of the word just taken
  if (!near && word.includes(i)) return { state: s, taken: null };
  const stream = [...s.stream, i];
  let start = s.start;
  if (near) {
    start = -1;
    for (let k = s.start; k < stream.length; k++) {
      const run = stream.slice(k);
      if (distinct(run) && ctx.leadsOn(run.map(letter))) {
        start = k;
        break;
      }
    }
    if (start < 0) {
      start = s.after;
      if (!distinct(stream.slice(start))) return { state: s, taken: null };
    }
  }
  const tiles = stream.slice(start).map(letter);
  if (ctx.isNew(tiles)) return { state: { stream, start, lit: true, after: stream.length }, taken: tiles };
  return { state: { stream, start, lit: false, after: s.after }, taken: null };
}

/** The delete key: the current word without its last letter, built on by hand from here (nothing is reread). */
export function back(s) {
  const word = wordOf(s);
  return word.length > 1 ? fromWord(word.slice(0, -1)) : EMPTY;
}
