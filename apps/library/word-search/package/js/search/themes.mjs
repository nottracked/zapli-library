// The themes of both languages, read once into words with their tiles, and the order themes come in.
//
// A theme's words are the common nouns of js/data/themes-<lang>.mjs. A word is kept as written (lower case) and as
// tiles (js/core/letters.mjs), so Slovak "chlieb" has 5 tiles. Words shorter than 3 tiles are never used.

import { tiles as tilesOf, normalise } from "../core/letters.mjs";
import { rngFor, shuffled } from "../core/rng.mjs";
import * as EN from "../data/themes-en.mjs";
import * as SK from "../data/themes-sk.mjs";

const SOURCES = { en: EN, sk: SK };
const cache = {};

function read(lang) {
  const src = SOURCES[lang] || SOURCES.en;
  const themes = src.THEMES.map((theme) => {
    const seen = new Set();
    const words = [];
    for (const raw of theme.words.split(/\s+/)) {
      const w = normalise(raw);
      if (!w || seen.has(w)) continue;
      const t = tilesOf(w, lang);
      if (!t || t.length < 3) continue;
      seen.add(w);
      words.push({ w, t });
    }
    return { id: theme.id, name: theme.name, words };
  });
  const messages = src.MESSAGES.map((text) => {
    const letters = Array.from(normalise(text))
      .filter((ch) => /\p{L}/u.test(ch))
      .join("");
    return { text, t: tilesOf(letters, lang) || [] };
  }).filter((m) => m.t.length > 0);
  return { themes, byId: new Map(themes.map((x) => [x.id, x])), messages };
}

/** The themes and hidden messages of a language. */
export function library(lang) {
  if (!cache[lang]) cache[lang] = read(lang === "sk" ? "sk" : "en");
  return cache[lang];
}

/** A theme by its id, or null. */
export function themeById(lang, id) {
  return library(lang).byId.get(id) || null;
}

/** The words of a theme that fit a square grid of `size` (at most `size` tiles). */
export function wordsThatFit(theme, size) {
  return theme.words.filter((x) => x.t.length <= size);
}

/** Whether a theme has enough words for a puzzle of this size. */
export function themeFits(theme, size, need) {
  return wordsThatFit(theme, size).length >= need;
}

/**
 * The order themes take for a run of puzzles: every theme once in a shuffled order that depends on `salt` (the
 * language, "daily" or "endless", and the round), then a new shuffle for the next round, which never starts with the
 * theme the last round ended with.
 */
export function themeAt(lang, salt, n) {
  const { themes } = library(lang);
  const count = themes.length;
  const order = (round) => {
    const list = shuffled(
      themes.map((x) => x.id),
      rngFor(`${lang}/${salt}/${round}`),
    );
    if (round > 0 && count > 1) {
      const before = shuffled(
        themes.map((x) => x.id),
        rngFor(`${lang}/${salt}/${round - 1}`),
      );
      if (list[0] === before[count - 1]) [list[0], list[1]] = [list[1], list[0]];
    }
    return list;
  };
  const round = Math.floor(n / count);
  return order(round)[((n % count) + count) % count];
}
