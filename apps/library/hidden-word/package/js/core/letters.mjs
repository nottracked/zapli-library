// Letters of the word games: which letters each language has and how a word splits into tiles.
//
// A tile is one letter of the language's alphabet. In Slovak the letters with diacritics (á, ä, č, ď, é, í, ĺ, ľ, ň,
// ó, ô, ŕ, š, ť, ú, ý, ž) are letters of their own, and "ch" is one letter written with two characters, so it is one
// tile, as Slovak crosswords write it in one square. "dz" and "dž" stay two tiles: across a prefix they are two
// letters (pod-zemie, od-žiť), which a spelling alone cannot tell apart.
//
// The module is shared by the page and the build scripts and checks in dev/, so it has no DOM and no state.

export const LANGS = ["sk", "en"];

export const ALPHABETS = {
  en: "a b c d e f g h i j k l m n o p q r s t u v w x y z".split(" "),
  sk: "a á ä b c č d ď e é f g h ch i í j k l ĺ ľ m n ň o ó ô p q r ŕ s š t ť u ú v w x y ý z ž".split(" "),
};

// The vowels of each alphabet, used to keep a wheel pronounceable when its letters are shuffled.
export const VOWELS = {
  en: new Set("a e i o u y".split(" ")),
  sk: new Set("a á ä e é i í o ó ô u ú y ý".split(" ")),
};

const INDEX = {};
for (const lang of LANGS) INDEX[lang] = new Map(ALPHABETS[lang].map((tile, i) => [tile, i]));

/** The index of a tile in its alphabet, or -1. */
export function tileIndex(lang, tile) {
  const i = INDEX[lang].get(tile);
  return i === undefined ? -1 : i;
}

/** A word as stored: Unicode NFC, lower case, without spaces around it. */
export function normalise(word) {
  return String(word).normalize("NFC").trim().toLowerCase();
}

/**
 * The tiles of a word: ["ch", "l", "i", "e", "b"] for "chlieb". Null when the word holds a character that is no
 * letter of the language (a digit, a hyphen, a letter of another alphabet).
 */
export function tiles(word, lang) {
  const w = normalise(word);
  const out = [];
  const chars = Array.from(w);
  for (let i = 0; i < chars.length; i++) {
    let tile = chars[i];
    if (lang === "sk" && tile === "c" && chars[i + 1] === "h") {
      tile = "ch";
      i++;
    }
    if (!INDEX[lang].has(tile)) return null;
    out.push(tile);
  }
  return out;
}

/** How many tiles a word has (Slovak "chlieb" has 5). */
export function tileCount(word, lang) {
  const t = tiles(word, lang);
  return t ? t.length : 0;
}

/** A tile as the wheel and the grid show it: "CH", "Ô". */
export function display(tile) {
  return tile.toUpperCase();
}

/** A word as the game shows it, in capitals: "KÔŇ". */
export function displayWord(word) {
  return normalise(word).toUpperCase();
}

/** Sorts words in the language's alphabetical order (Slovak puts "ch" after "h" and "č" after "c"). */
export function collator(lang) {
  try {
    return new Intl.Collator(lang);
  } catch (e) {
    return { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) };
  }
}
