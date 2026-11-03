// The guess being typed: one place per letter of the word, some of them empty, and the place the next letter goes
// to (the caret). Tapping a place moves the caret there, so a letter in the middle can be changed without deleting
// the ones after it. A given letter (the hint's) stays in its place, and neither Delete nor clearing takes it away.
// The caret stops on it like on an empty place: typing that same letter there moves on (for a player who types the
// whole word), and typing another letter writes it into the next empty place (for one who types around it). No DOM:
// the page and the checks in dev/ share it.
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
  // Places whose letter was given (the hint's), with that letter: they stay as they are.
  const given = new Map();

  const firstEmpty = (from) => {
    for (let k = 0; k < length; k++) {
      const i = (from + k) % length;
      if (places[i] === null) return i;
    }
    return length;
  };
  // The place the caret goes to after `from`: the next one that is empty or given, else the first empty one.
  const nextSpot = (from) => {
    for (let i = from; i < length; i++) if (places[i] === null || given.has(i)) return i;
    return firstEmpty(0);
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
    /** Whether a place holds a given letter. */
    isGiven(i) {
      return given.has(i);
    },
    /** Puts a letter at the caret; returns false when every place is full and the caret is past the end. */
    type(tile) {
      if (lang === "sk" && tile === "h" && last >= 0 && places[last] === "c") {
        places[last] = "ch";
        return true;
      }
      if (caret < length && given.has(caret)) {
        if (tile === given.get(caret)) {
          last = -1;
          caret = nextSpot(caret + 1);
          return true;
        }
        caret = firstEmpty(caret);
      }
      if (caret >= length) return false;
      places[caret] = tile;
      last = caret;
      caret = nextSpot(caret + 1);
      return true;
    },
    /** Replaces the letter at a place (an accent picked for the letter just typed). */
    replace(i, tile) {
      if (i < 0 || i >= length || places[i] === null || given.has(i)) return false;
      places[i] = tile;
      return true;
    },
    /**
     * Gives a letter (the hint's): it goes into its place at once, over any letter typed there, and stays.
     */
    give(i, tile) {
      if (i < 0 || i >= length) return false;
      places[i] = tile;
      given.set(i, tile);
      last = -1;
      return true;
    },
    /**
     * Takes a letter back: the one at the caret when the caret sits on a letter (a place the player tapped), else
     * the last letter before the caret; the caret moves to the place it emptied.
     */
    back() {
      last = -1;
      if (caret < length && places[caret] !== null && !given.has(caret)) {
        places[caret] = null;
        return true;
      }
      for (let i = Math.min(caret, length) - 1; i >= 0; i--) {
        if (places[i] !== null && !given.has(i)) {
          places[i] = null;
          caret = i;
          // Given letters just before stay ahead of the caret, so the word can be typed again from them.
          while (caret > 0 && given.has(caret - 1)) caret--;
          return true;
        }
      }
      return false;
    },
    /** Moves the caret to a place (not to a given letter, which stays). */
    select(i) {
      if (i >= 0 && i < length && !given.has(i)) {
        caret = i;
        last = -1;
      }
    },
    /** Takes back every typed letter; given letters stay. */
    clear() {
      places = places.map((p, i) => (given.has(i) ? p : null));
      caret = nextSpot(0);
      last = -1;
    },
    /** Fills the draft with a whole word (a suggested base form); a given letter the word does not keep is let go. */
    fill(tiles) {
      places = new Array(length).fill(null);
      tiles.slice(0, length).forEach((t, i) => {
        places[i] = t;
      });
      for (const [i, tile] of Array.from(given)) if (places[i] !== tile) given.delete(i);
      caret = nextSpot(0);
      last = -1;
    },
    /** What the page saves: the places, with "" for an empty one. */
    save() {
      return { p: places.map((p) => p || ""), c: caret };
    },
    load(saved) {
      if (!saved || !Array.isArray(saved.p) || saved.p.length !== length) return;
      places = saved.p.map((p, i) => {
        if (given.has(i)) return places[i];
        return typeof p === "string" && ALPHABETS[lang].includes(p) ? p : null;
      });
      caret = Number.isInteger(saved.c) && saved.c >= 0 && saved.c <= length ? saved.c : nextSpot(0);
    },
  };
}
