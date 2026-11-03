// The puzzle worker: reads a language's word list from the app's own files once, then makes the puzzles the page
// asks for, so the page never waits on the list or the crossword layout. Messages:
//   page -> worker  { id, type: "daily", lang, day } | { id, type: "endless", lang, size, level } | { id, type: "load", lang }
//   worker -> page  { id, ok: true, puzzle } | { id, ok: false, error }

import { parseWordList } from "../js/core/wordlist.mjs";
import { buildIndex, dailyPuzzle, endlessPuzzle } from "../js/wheel/generator.mjs";

const loading = {};

function fetchList(lang) {
  // Each list is named in full, so the package's code shows exactly which of its own files it reads.
  if (lang === "sk") return fetch("../data/words-sk.txt");
  return fetch("../data/words-en.txt");
}

function load(lang) {
  if (!loading[lang]) {
    loading[lang] = fetchList(lang)
      .then((response) => {
        if (!response.ok) throw new Error(`word list ${response.status}`);
        return response.text();
      })
      .then((text) => buildIndex(lang, parseWordList(text)))
      .catch((e) => {
        delete loading[lang];
        throw e;
      });
  }
  return loading[lang];
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  const lang = msg.lang === "en" ? "en" : "sk";
  try {
    const index = await load(lang);
    let puzzle = null;
    if (msg.type === "daily") puzzle = dailyPuzzle(index, msg.day);
    else if (msg.type === "endless") puzzle = endlessPuzzle(index, msg.size, msg.level);
    if (msg.type !== "load" && !puzzle) throw new Error("no puzzle");
    self.postMessage({ id: msg.id, ok: true, puzzle });
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: String((e && e.message) || e) });
  }
};
