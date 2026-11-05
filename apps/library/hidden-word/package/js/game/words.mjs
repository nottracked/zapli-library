// The words of a language: which words may be hidden, which words a guess may be, the daily word of each date and
// length, the practice words, and for Slovak the base form of a word typed in another form. No DOM and no state.

import { parseWordList } from "../core/wordlist.mjs";
import { tiles, normalise } from "../core/letters.mjs";
import { rngFor, shuffled } from "../core/rng.mjs";
import { dayNumber } from "../core/dates.mjs";
import { LENGTHS } from "./rules.mjs";

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Reads a language's list file (data/words-<lang>.txt) into the game's index. */
export function createWords(lang, text) {
  const list = parseWordList(text);
  const valid = new Set();
  const hidden = new Set();
  // Every word of the file, of any length: the base forms the game may name (Slovak keeps some of 2, 3 or 8 letters).
  const known = new Set();
  const byLength = {};
  for (const n of LENGTHS) byLength[n] = [];
  for (const raw of list.answers) {
    const word = normalise(raw);
    const t = tiles(word, lang);
    if (!t || !byLength[t.length]) continue;
    known.add(word);
    valid.add(word);
    hidden.add(word);
    byLength[t.length].push(word);
  }
  for (const raw of list.accepted) {
    const word = normalise(raw);
    const t = tiles(word, lang);
    if (!t) continue;
    known.add(word);
    if (byLength[t.length]) valid.add(word);
  }
  // The orders of the daily words and the practice words, one of each per length: the same on every phone, because
  // they come from the language and the length alone.
  const orders = {};
  for (const n of LENGTHS) {
    const sorted = byLength[n].slice().sort(byCodePoint);
    orders[n] = {
      daily: shuffled(sorted, rngFor(`hidden-word/${lang}/${n}/daily`)),
      practice: shuffled(sorted, rngFor(`hidden-word/${lang}/${n}/practice`)),
    };
  }
  return {
    lang,
    count: (n) => (byLength[n] ? byLength[n].length : 0),
    isValid: (word) => valid.has(normalise(word)),
    isKnown: (word) => known.has(normalise(word)),
    isHidden: (word) => hidden.has(normalise(word)),
    orders,
  };
}

/** The daily word of a date ("YYYY-MM-DD") and length, the same for everyone who plays that language. */
export function dailyWord(words, length, day) {
  const order = words.orders[length].daily;
  if (!order.length) return null;
  const i = ((dayNumber(day) % order.length) + order.length) % order.length;
  return order[i];
}

/**
 * The practice word number `index` (0, 1, 2, …) of a length. A word that is today's daily word is passed over, so
 * practice never gives the daily word away; `next` is the index to ask for after this one.
 */
export function practiceWord(words, length, index, today) {
  const order = words.orders[length].practice;
  if (!order.length) return null;
  const daily = today ? dailyWord(words, length, today) : null;
  let i = Math.max(0, index | 0);
  for (let tries = 0; tries < 2; tries++, i++) {
    const word = order[i % order.length];
    if (word !== daily || order.length === 1) return { word, index: i, next: i + 1 };
  }
  return { word: order[i % order.length], index: i, next: i + 1 };
}

// ---- Slovak base forms
//
// The game counts only base forms, as a dictionary lists them. When a player types another form of a word the list
// has, the endings below find the base form, so the game can say which word it takes instead. Each rule is an ending
// of an inflected form and the endings of base forms it may come from; a candidate counts only when the list has it.

const SK_ENDINGS = [
  // adjectives: pekná, pekné, peknú, peknej, pekného, … → pekný; cudzia, cudzie, … → cudzí
  ["ého", ["ý"]],
  ["ému", ["ý"]],
  ["ými", ["ý"]],
  ["ých", ["ý"]],
  ["ým", ["ý"]],
  ["ou", ["ý", "a"]],
  ["ej", ["ý", "í", "a"]],
  ["á", ["ý", "o", "ať"]],
  ["é", ["ý"]],
  ["ú", ["ý", "ať"]],
  ["í", ["ý", "e", "iť"]],
  ["ieho", ["í"]],
  ["iemu", ["í"]],
  ["ími", ["í"]],
  ["ích", ["í"]],
  ["ím", ["í", "iť"]],
  ["ia", ["í", "e", "iť"]],
  ["iu", ["í", "ie"]],
  ["ie", ["í"]],
  // nouns: knihy, knihe, knihu, knihou, knihám, … → kniha; mestá, mestu, mestom → mesto; duby, duba, dubom → dub
  ["ami", ["a", "o", ""]],
  ["ách", ["a", "o"]],
  ["ovi", [""]],
  ["och", [""]],
  ["ov", [""]],
  ["om", ["", "o", "e", "ý"]],
  ["mi", [""]],
  ["y", ["", "a"]],
  ["e", ["a", "", "ý"]],
  ["i", ["a", ""]],
  ["u", ["a", "o", "", "e"]],
  ["a", ["", "o", "e", "ať"]],
  // verbs: robím, robíš, robíme, robia → robiť; volám, voláš, volajú → volať; kupujem → kupovať; robil, robila → robiť
  ["íme", ["iť"]],
  ["íte", ["iť"]],
  ["íš", ["iť"]],
  ["ám", ["ať", "a", "o"]],
  ["áme", ["ať"]],
  ["áte", ["ať"]],
  ["áš", ["ať"]],
  ["ajú", ["ať"]],
  ["ujem", ["ovať"]],
  ["uješ", ["ovať"]],
  ["uje", ["ovať"]],
  ["ujeme", ["ovať"]],
  ["ujete", ["ovať"]],
  ["ujú", ["ovať"]],
  ["niem", ["núť"]],
  ["nieš", ["núť"]],
  ["nie", ["núť"]],
  ["nú", ["núť"]],
  ["am", ["ať"]],
  ["aš", ["ať"]],
  ["ame", ["ať"]],
  ["ate", ["ať"]],
  ["em", ["ať", "iť"]],
  ["eš", ["ať", "iť"]],
  ["eme", ["ať", "iť"]],
  ["ete", ["ať", "iť"]],
  ["la", ["ť"]],
  ["lo", ["ť"]],
  ["li", ["ť"]],
  ["l", ["ť"]],
];

const SOFT = { n: "ň", d: "ď", t: "ť", l: "ľ" };

// Stems a base form may have besides the plain one: before e and i a soft consonant is written without its caron
// (kone, base koň), and an o of the last syllable is ô in a base form without an ending (stoly → stôl, kone → kôň).
function stems(stem, ending, base) {
  const out = [stem];
  const last = stem.slice(-1);
  if (SOFT[last] && /^[eéií]/.test(ending)) out.push(stem.slice(0, -1) + SOFT[last]);
  if (base === "") {
    for (const s of out.slice()) {
      const m = s.match(/^(.*)o([^aáäeéiíoóôuúyý]+)$/);
      if (m) out.push(`${m[1]}ô${m[2]}`);
    }
  }
  return out;
}

/**
 * Base forms the list has for a Slovak word typed in another form, in the order of the endings above, which puts the
 * likelier one first. Empty when none is found (or for English, where every form counts).
 */
export function baseForms(words, word) {
  if (words.lang !== "sk") return [];
  const w = normalise(word);
  const seen = new Set([w]);
  const found = [];
  for (const [ending, bases] of SK_ENDINGS) {
    if (!w.endsWith(ending) || w.length - ending.length < 2) continue;
    const stem = w.slice(0, w.length - ending.length);
    for (const base of bases) {
      for (const s of stems(stem, ending, base)) {
        const candidate = s + base;
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        if (words.isKnown(candidate)) found.push(candidate);
      }
    }
  }
  return found;
}
