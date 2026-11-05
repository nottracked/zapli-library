// The letters that fill a grid's empty squares, drawn in proportion to how often each letter turns up in written
// text, so a grid reads like the language and the hidden words do not stand out by their letters.
//
// English: the usual shares of letters in English text, in percent. Slovak: shares of letters in Slovak text,
// rounded, with "ch" as one letter; the letters of foreign words (q, w, x) are left out.

const WEIGHTS = {
  en: {
    e: 12.7,
    t: 9.1,
    a: 8.2,
    o: 7.5,
    i: 7.0,
    n: 6.7,
    s: 6.3,
    h: 6.1,
    r: 6.0,
    d: 4.3,
    l: 4.0,
    c: 2.8,
    u: 2.8,
    m: 2.4,
    w: 2.4,
    f: 2.2,
    g: 2.0,
    y: 2.0,
    p: 1.9,
    b: 1.5,
    v: 1.0,
    k: 0.8,
    j: 0.15,
    x: 0.15,
    q: 0.1,
    z: 0.07,
  },
  sk: {
    a: 9.0,
    o: 8.6,
    e: 7.5,
    i: 5.6,
    n: 5.5,
    s: 4.7,
    r: 4.5,
    t: 4.4,
    v: 4.4,
    l: 3.9,
    k: 3.8,
    d: 3.4,
    m: 3.2,
    p: 2.8,
    u: 2.6,
    á: 2.1,
    j: 2.1,
    z: 2.0,
    y: 1.8,
    b: 1.6,
    h: 1.5,
    í: 1.5,
    c: 1.3,
    ý: 1.3,
    č: 1.1,
    š: 1.0,
    ch: 1.0,
    ž: 0.9,
    é: 0.8,
    ú: 0.7,
    ť: 0.7,
    ľ: 0.6,
    ň: 0.4,
    g: 0.3,
    f: 0.2,
    ď: 0.2,
    ô: 0.2,
    ä: 0.1,
    ó: 0.1,
    ĺ: 0.02,
    ŕ: 0.02,
  },
};

const TABLES = {};
for (const [lang, weights] of Object.entries(WEIGHTS)) {
  const letters = Object.keys(weights);
  let sum = 0;
  const upTo = letters.map((x) => (sum += weights[x]));
  TABLES[lang] = { letters, upTo, sum };
}

/** A filler letter (tile) for a language, from a random number in [0, 1). */
export function fillerTile(lang, r) {
  const table = TABLES[lang] || TABLES.en;
  const x = r * table.sum;
  let lo = 0;
  let hi = table.upTo.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table.upTo[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return table.letters[lo];
}

/** The letters a language's filler draws from. */
export function fillerLetters(lang) {
  return (TABLES[lang] || TABLES.en).letters.slice();
}
