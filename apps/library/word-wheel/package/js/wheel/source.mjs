// Where the page gets its puzzles: the puzzle worker (workers/puzzles.mjs), or, where a worker cannot start or does
// not answer, the same generator on the page itself. Both read the word lists from the app's own files.

import { parseWordList } from "../core/wordlist.mjs";
import { buildIndex, dailyPuzzle, endlessPuzzle } from "./generator.mjs";

const ANSWER_MS = 20000;

function pageList(lang) {
  // Relative to the page (index.html), named in full like the worker's.
  if (lang === "sk") return fetch("data/words-sk.txt");
  return fetch("data/words-en.txt");
}

export function createSource() {
  let worker = null;
  let failed = false;
  let nextId = 1;
  const waiting = new Map();
  const local = {};

  try {
    worker = new Worker(new URL("../../workers/puzzles.mjs", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const msg = event.data || {};
      const w = waiting.get(msg.id);
      if (!w) return;
      waiting.delete(msg.id);
      window.clearTimeout(w.timer);
      if (msg.ok) w.resolve(msg.puzzle);
      else w.reject(new Error(msg.error));
    };
    worker.onerror = (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      giveUp();
    };
  } catch (e) {
    failed = true;
  }

  // The worker failed: every request still waiting is answered on the page instead.
  function giveUp() {
    if (failed) return;
    failed = true;
    if (worker) worker.terminate();
    worker = null;
    for (const [id, w] of waiting) {
      waiting.delete(id);
      window.clearTimeout(w.timer);
      onPage(w.request).then(w.resolve, w.reject);
    }
  }

  async function onPage(request) {
    const lang = request.lang === "en" ? "en" : "sk";
    if (!local[lang]) {
      local[lang] = pageList(lang)
        .then((r) => {
          if (!r.ok) throw new Error(`word list ${r.status}`);
          return r.text();
        })
        .then((text) => buildIndex(lang, parseWordList(text)))
        .catch((e) => {
          delete local[lang];
          throw e;
        });
    }
    const index = await local[lang];
    if (request.type === "load") return null;
    const puzzle =
      request.type === "daily" ? dailyPuzzle(index, request.day) : endlessPuzzle(index, request.size, request.level);
    if (!puzzle) throw new Error("no puzzle");
    return puzzle;
  }

  function ask(request) {
    if (failed || !worker) return onPage(request);
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = window.setTimeout(() => {
        if (waiting.delete(id)) onPage(request).then(resolve, reject);
      }, ANSWER_MS);
      waiting.set(id, { resolve, reject, timer, request });
      worker.postMessage({ ...request, id });
    });
  }

  return {
    /** Starts reading a language's list in the background. */
    preload: (lang) => ask({ type: "load", lang }).catch(() => null),
    daily: (lang, day) => ask({ type: "daily", lang, day }),
    endless: (lang, size, level) => ask({ type: "endless", lang, size, level }),
  };
}
