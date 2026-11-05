// Repeatable randomness: the same text always gives the same numbers, on every phone and in the checks of dev/.
// The daily wheel of a date is the same for everyone because its numbers come from the date's text.

/** A 32-bit hash of a text (FNV-1a over its UTF-16 code units, then mixed). */
export function hashText(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A generator of numbers in [0, 1) from a 32-bit seed (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator seeded from a text. */
export function rngFor(text) {
  return makeRng(hashText(text));
}

/** A whole number in [0, n). */
export function pick(rng, n) {
  return Math.floor(rng() * n);
}

/** A shuffled copy of a list (Fisher–Yates). */
export function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
