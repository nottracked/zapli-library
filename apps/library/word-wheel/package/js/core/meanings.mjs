// The short meanings of the words, from the app's own files (data/meanings-<lang>.txt), read the first time a
// language's meaning is needed and kept for as long as the page runs.
//
// File format: lines starting with "#" are comments; every other line is one word, a TAB and its meaning, and for
// English a second TAB and the Slovak translation.

/** Reads a meanings file into a map: word -> { meaning, sk } (sk only where the file has a translation). */
export function parseMeanings(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [word, meaning, sk] = line.replace(/\r$/, "").split("\t");
    if (!word || !meaning) continue;
    out.set(word, sk ? { meaning, sk } : { meaning });
  }
  return out;
}

export function createMeanings(read) {
  const loaded = {};
  const loading = {};

  /** Starts reading a language's meanings; resolves when they are there (an empty map when the file fails). */
  function load(lang) {
    if (loaded[lang]) return Promise.resolve(loaded[lang]);
    if (!loading[lang]) {
      loading[lang] = read(lang)
        .then((text) => {
          loaded[lang] = parseMeanings(text);
          return loaded[lang];
        })
        .catch(() => new Map())
        .finally(() => {
          delete loading[lang];
        });
    }
    return loading[lang];
  }

  return {
    load,
    /** The meaning of a word when its language is read already, else undefined (and the reading starts). */
    peek(lang, word) {
      if (!loaded[lang]) {
        load(lang);
        return undefined;
      }
      return loaded[lang].get(word) || null;
    },
    async get(lang, word) {
      return (await load(lang)).get(word) || null;
    },
  };
}
