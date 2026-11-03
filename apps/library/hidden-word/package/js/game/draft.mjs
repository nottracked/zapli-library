// The guess being typed: one place per letter of the word, some of them empty, and the place the next letter goes
// to (the caret). Tapping a place moves the caret there, so a letter in the middle can be changed without deleting
// the ones after it. No DOM: the page and the checks in dev/ share it.
//
// Slovak CH is one letter: a C followed by an H typed next to it becomes CH, as the spelling always means.

import { ALPHABETS, normalise } from "../core/letters.mjs";

/** The accented letters each key holds (Slovak), in the order they are offered. */
export const VARIANTS = {
  sk: {
    a: ["á", "ä"],
    c: ["č", "ch"],
    d: ["ď"],
    e: ["é"],
    h: ["ch"],
    i: ["í"],
    l: ["ľ", "ĺ"],
    n: ["ň"],
    o: ["ô", "ó"],
    r: ["ŕ"],
    s: ["š"],
    t: ["ť"],
    u: ["ú"],
    y: ["ý"],
    z: ["ž"],
  },
  en: {},
};

/** The key a letter sits on: "a" for "á", "c" for "č" and "ch". */
export function baseKey(lang, tile) {
  if (tile.length === 1 && !/[^a-z]/.test(tile)) return tile;
  for (const [key, list] of Object.entries(VARIANTS[lang] || {})) if (list.includes(tile)) return key;
  return tile;
}

/** The letters a typed character stands for in a language, or null: "Á" is "á", a dead key's "ˇ" is nothing. */
export function tileOf(lang, char) {
  const c = normalise(char);
  return ALPHABETS[lang].includes(c) ? c : null;
}

export function createDraft(length, lang) {
  let places = new Array(length).fill(null);
  let caret = 0;
  // The place of the letter typed last, while it is the latest change (the accent strip offers its accents).
  let last = -1;

  const firstEmpty = (from) => {
    for (let k = 0; k < length; k++) {
      const i = (from + k) % length;
      if (places[i] === null) return i;
    }
    return length;
  };

  return {
    get length() {
      return length;
    },
    get caret() {
      return caret;
    },
    get places() {
      return places.slice();
    },
    get full() {
      return places.every((p) => p !== null);
    },
    get empty() {
      return places.every((p) => p === null);
    },
    /** The letters typed so far, in order, with no gaps (for a word that is full). */
    tiles() {
      return places.filter((p) => p !== null);
    },
    /** The place of the letter typed last, or -1 once something else changed the draft. */
    get last() {
      return last;
    },
    /** Puts a letter at the caret; returns false when every place is full and the caret is past the end. */
    type(tile) {
      if (lang === "sk" && tile === "h" && last >= 0 && places[last] === "c") {
        places[last] = "ch";
        return true;
      }
      if (caret >= length) return false;
      places[caret] = tile;
      last = caret;
      caret = firstEmpty(caret + 1);
      return true;
    },
    /** Replaces the letter at a place (an accent picked for the letter just typed). */
    replace(i, tile) {
      if (i < 0 || i >= length || places[i] === null) return false;
      places[i] = tile;
      return true;
    },
    /** Puts a letter into an empty place (the hint's letter); a caret on that place moves to the next empty one. */
    put(i, tile) {
      if (i < 0 || i >= length || places[i] !== null) return false;
      places[i] = tile;
      last = -1;
      if (caret === i) caret = firstEmpty(i + 1);
      return true;
    },
    /**
     * Takes a letter back: the one at the caret when the caret sits on a letter (a place the player tapped), else
     * the last letter before the caret; the caret moves to the place it emptied.
     */
    back() {
      last = -1;
      if (caret < length && places[caret] !== null) {
        places[caret] = null;
        return true;
      }
      for (let i = Math.min(caret, length) - 1; i >= 0; i--) {
        if (places[i] !== null) {
          places[i] = null;
          caret = i;
          return true;
        }
      }
      return false;
    },
    /** Moves the caret to a place. */
    select(i) {
      if (i >= 0 && i < length) {
        caret = i;
        last = -1;
      }
    },
    clear() {
      places = new Array(length).fill(null);
      caret = 0;
      last = -1;
    },
    /** Fills the draft with a whole word (a suggested base form). */
    fill(tiles) {
      places = new Array(length).fill(null);
      tiles.slice(0, length).forEach((t, i) => {
        places[i] = t;
      });
      caret = firstEmpty(0);
      last = -1;
    },
    /** What the page saves: the places, with "" for an empty one. */
    save() {
      return { p: places.map((p) => p || ""), c: caret };
    },
    load(saved) {
      if (!saved || !Array.isArray(saved.p) || saved.p.length !== length) return;
      places = saved.p.map((p) => (typeof p === "string" && ALPHABETS[lang].includes(p) ? p : null));
      caret = Number.isInteger(saved.c) && saved.c >= 0 && saved.c <= length ? saved.c : firstEmpty(0);
    },
  };
}
