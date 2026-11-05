// Free Cells rules as plain functions over a small state object, kept free of the page so the solver's worker and
// the development checks use exactly the same code.
//
// Cards are numbers 0-51: suit = floor(card / 13) (spades, hearts, clubs, diamonds), rank = card % 13 + 1 (ace = 1,
// king = 13). A position is {moves, cells, found, cols}:
// - cells: the four free cells, each a card or -1;
// - found: the four foundations, one per suit (index = suit), each the rank on top (0 = empty);
// - cols: the eight columns, each a list of cards from the bottom (dealt first) to the top (free to move).

export const COLS = 8;
export const CELLS = 4;
export const MAX_DEAL = 1000000;

// The deals among 1 to 1,000,000 that cannot be won with four free cells, as published by the people who solved
// all of them. Random deals skip them; typing one of these numbers still deals it.
export const UNWINNABLE = [11982, 146692, 186216, 455889, 495505, 512118, 517776, 781948];

export const suitOf = (card) => Math.floor(card / 13);
export const rankOf = (card) => (card % 13) + 1;
export const isRed = (card) => suitOf(card) % 2 === 1;
export const cardOf = (suit, rank) => suit * 13 + rank - 1;

// The classic numbered deals: a deal number seeds a small linear congruential generator, which shuffles a deck
// ordered ace to king with the suits clubs, diamonds, hearts, spades; the cards are dealt row by row across the
// eight columns. The same number gives the same deal as the numbering most free cell games share.
const CLASSIC_SUITS = [2, 3, 1, 0];

export function dealNumbered(n) {
  let seed = n >>> 0;
  const next = () => {
    seed = (Math.imul(seed, 214013) + 2531011) & 0x7fffffff;
    return seed >>> 16;
  };
  const deck = Array.from({ length: 52 }, (_, i) => cardOf(CLASSIC_SUITS[i % 4], Math.floor(i / 4) + 1));
  const dealt = [];
  let left = 52;
  while (left > 0) {
    const j = next() % left;
    const card = deck[j];
    deck[j] = deck[left - 1];
    left -= 1;
    dealt.push(card);
  }
  const cols = Array.from({ length: COLS }, () => []);
  dealt.forEach((card, i) => cols[i % COLS].push(card));
  return { moves: 0, cells: [-1, -1, -1, -1], found: [0, 0, 0, 0], cols };
}

export function clone(s) {
  return { moves: s.moves, cells: s.cells.slice(), found: s.found.slice(), cols: s.cols.map((c) => c.slice()) };
}

// ---- positions
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const str = (cards) => cards.map((c) => (c < 0 ? "-" : ALPHABET[c])).join("");

// Whether a position holds every card once, and only where it may be.
export function isValid(s) {
  if (!Number.isInteger(s.moves) || s.moves < 0) return false;
  if (s.cells.length !== CELLS || s.found.length !== 4 || s.cols.length !== COLS) return false;
  if (!s.found.every((f) => Number.isInteger(f) && f >= 0 && f <= 13)) return false;
  const all = [];
  s.found.forEach((f, suit) => {
    for (let r = 1; r <= f; r++) all.push(cardOf(suit, r));
  });
  s.cells.forEach((c) => c >= 0 && all.push(c));
  s.cols.forEach((col) => {
    if (col.some((c) => c < 0)) all.push(-1);
    all.push(...col);
  });
  return all.length === 52 && new Set(all).size === 52 && all.every((c) => c >= 0 && c < 52);
}

// The same position whatever the order of the free cells and of the columns (both are interchangeable for winning)
// and whatever the move count: the key of the solver's table and of the page's verdicts.
export function key(s) {
  const cols = s.cols.map(str).sort();
  const cells = s.cells
    .filter((c) => c >= 0)
    .sort((a, b) => a - b)
    .map((c) => ALPHABET[c])
    .join("");
  return `${cells}|${s.found.join("")}|${cols.join(",")}`;
}

// ---- moving cards
// A source is {from: "tab", i, k} (the card at index k of column i and every card on it), {from: "cell", i}. A
// destination is {to: "tab", i}, {to: "cell", i} or {to: "found", i}. Cards on a foundation stay there.
export function pick(s, src) {
  if (!src) return [];
  if (src.from === "cell") {
    const c = s.cells[src.i];
    return c === undefined || c < 0 ? [] : [c];
  }
  if (src.from === "tab") {
    const col = s.cols[src.i];
    if (!col || !Number.isInteger(src.k) || src.k < 0 || src.k >= col.length) return [];
    return col.slice(src.k);
  }
  return [];
}

// A run that moves together: each card one lower than the card under it and of the other colour.
export function isRun(cards) {
  for (let i = 1; i < cards.length; i++) {
    const a = cards[i - 1];
    const b = cards[i];
    if (rankOf(b) !== rankOf(a) - 1 || isRed(a) === isRed(b)) return false;
  }
  return true;
}

export const freeCells = (s) => s.cells.filter((c) => c < 0).length;
export const emptyCols = (s) => s.cols.filter((c) => c.length === 0).length;

// How many cards may move at once: one at a time through the free cells and the empty columns, which is the
// same as (free cells + 1) doubled for every empty column the run does not go into.
export function capacity(s, toEmpty) {
  const e = emptyCols(s) - (toEmpty ? 1 : 0);
  return (freeCells(s) + 1) * 2 ** Math.max(0, e);
}

export const fitsColumn = (top, card) => rankOf(top) === rankOf(card) + 1 && isRed(top) !== isRed(card);

export function canMove(s, src, dst) {
  const cards = pick(s, src);
  if (!cards.length || !dst) return false;
  if (dst.to === "found") {
    if (cards.length !== 1) return false;
    const c = cards[0];
    return dst.i === suitOf(c) && s.found[dst.i] === rankOf(c) - 1;
  }
  if (dst.to === "cell") {
    return cards.length === 1 && src.from !== "cell" && s.cells[dst.i] === -1;
  }
  if (dst.to === "tab") {
    if (src.from === "tab" && src.i === dst.i) return false;
    const col = s.cols[dst.i];
    if (!col || !isRun(cards)) return false;
    if (!col.length) return cards.length <= capacity(s, true);
    return fitsColumn(col[col.length - 1], cards[0]) && cards.length <= capacity(s, false);
  }
  return false;
}

// Moves without checking (call canMove first). Returns the step as it is kept in the game's history: {s, si, d,
// di, n} with the kinds "t" (column), "c" (free cell) and "f" (foundation).
export function move(s, src, dst) {
  const cards = pick(s, src);
  if (src.from === "cell") s.cells[src.i] = -1;
  else s.cols[src.i].length = src.k;
  if (dst.to === "found") s.found[dst.i] = rankOf(cards[0]);
  else if (dst.to === "cell") s.cells[dst.i] = cards[0];
  else s.cols[dst.i].push(...cards);
  return {
    s: src.from === "cell" ? "c" : "t",
    si: src.i,
    d: dst.to === "found" ? "f" : dst.to === "cell" ? "c" : "t",
    di: dst.i,
    n: cards.length,
    cards,
  };
}

// Takes a step back exactly.
export function revert(s, op) {
  let cards;
  if (op.d === "f") {
    cards = [cardOf(op.di, s.found[op.di])];
    s.found[op.di] -= 1;
  } else if (op.d === "c") {
    cards = [s.cells[op.di]];
    s.cells[op.di] = -1;
  } else {
    const col = s.cols[op.di];
    cards = col.splice(col.length - op.n, op.n);
  }
  if (op.s === "c") s.cells[op.si] = cards[0];
  else s.cols[op.si].push(...cards);
}

// The step as a short word for saving: "t2t5x3" is three cards from column 3 to column 6.
export const opText = (op) => `${op.s}${op.si}${op.d}${op.di}${op.n > 1 ? `x${op.n}` : ""}`;

export function opParse(text) {
  const m = /^([tc])(\d)([tcf])(\d)(?:x(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  return { s: m[1], si: Number(m[2]), d: m[3], di: Number(m[4]), n: m[5] ? Number(m[5]) : 1 };
}

// The source and destination of a saved step, in the current position (null when it no longer fits).
export function opMove(s, op) {
  let src;
  if (op.s === "c") src = { from: "cell", i: op.si };
  else {
    const col = s.cols[op.si];
    if (!col || col.length < op.n) return null;
    src = { from: "tab", i: op.si, k: col.length - op.n };
  }
  const dst = { to: op.d === "f" ? "found" : op.d === "c" ? "cell" : "tab", i: op.di };
  return canMove(s, src, dst) ? { src, dst } : null;
}

// The foundation a card can go to now, or -1.
export const foundationFor = (s, card) => (s.found[suitOf(card)] === rankOf(card) - 1 ? suitOf(card) : -1);

export function legalTargets(s, src) {
  const out = [];
  for (let i = 0; i < 4; i++) if (canMove(s, src, { to: "found", i })) out.push({ to: "found", i });
  for (let i = 0; i < COLS; i++) if (canMove(s, src, { to: "tab", i })) out.push({ to: "tab", i });
  for (let i = 0; i < CELLS; i++)
    if (canMove(s, src, { to: "cell", i })) {
      out.push({ to: "cell", i });
      break;
    }
  return out;
}

// The first column a run fits on, preferring a column with cards over an empty one.
function firstColumn(s, src) {
  let empty = null;
  for (let i = 0; i < COLS; i++) {
    if (!canMove(s, src, { to: "tab", i })) continue;
    if (s.cols[i].length) return { to: "tab", i };
    if (!empty) empty = { to: "tab", i };
  }
  return empty;
}

// Where a tap sends a card: a single card up to its foundation first, then onto a column with cards, then into an
// empty column, then into a free cell. A run that already starts its column is not moved to another empty column.
export function bestTarget(s, src) {
  const cards = pick(s, src);
  if (!cards.length) return null;
  if (cards.length === 1) {
    const f = foundationFor(s, cards[0]);
    if (f >= 0) return { to: "found", i: f };
  }
  const dst = firstColumn(s, src);
  const wholeColumn = src.from === "tab" && src.k === 0;
  if (dst && !(wholeColumn && !s.cols[dst.i].length)) return dst;
  if (cards.length === 1 && src.from === "tab") {
    const i = s.cells.indexOf(-1);
    if (i >= 0) return { to: "cell", i };
  }
  return null;
}

export const isWon = (s) => s.found.every((f) => f === 13);

// Safe: no card still in play could need this one to build on (both cards of the other colour one rank lower are
// already up), so sending it up never costs a move. Aces and twos are always safe.
export function isSafe(s, card) {
  const r = rankOf(card);
  if (r <= 2) return true;
  const other = isRed(card) ? [0, 2] : [1, 3];
  return s.found[other[0]] >= r - 1 && s.found[other[1]] >= r - 1;
}

// Sends safe cards up from the free cells and the column tops, one at a time, until none is left.
export function autoPlay(s) {
  const steps = [];
  for (let guard = 0; guard < 52; guard++) {
    let done = null;
    for (let i = 0; i < CELLS && !done; i++) {
      const c = s.cells[i];
      if (c >= 0 && foundationFor(s, c) >= 0 && isSafe(s, c))
        done = move(s, { from: "cell", i }, { to: "found", i: suitOf(c) });
    }
    for (let i = 0; i < COLS && !done; i++) {
      const col = s.cols[i];
      const c = col[col.length - 1];
      if (col.length && foundationFor(s, c) >= 0 && isSafe(s, c))
        done = move(s, { from: "tab", i, k: col.length - 1 }, { to: "found", i: suitOf(c) });
    }
    if (!done) break;
    steps.push(done);
  }
  return steps;
}

// Every column in descending order from its bottom card to its top: then the lowest card left is always free, and
// the game finishes by sending the cards up lowest first.
export const sorted = (s) => s.cols.every((col) => col.every((c, j) => j === 0 || rankOf(c) <= rankOf(col[j - 1])));

// The steps that finish the game from here, or null when the columns are not in order yet.
export function planFinish(start) {
  if (isWon(start) || !sorted(start)) return null;
  const s = clone(start);
  const steps = [];
  while (!isWon(s)) {
    let best = null;
    for (let i = 0; i < CELLS; i++) {
      const c = s.cells[i];
      if (c >= 0 && foundationFor(s, c) >= 0 && (!best || rankOf(c) < best.rank))
        best = { src: { from: "cell", i }, rank: rankOf(c), card: c };
    }
    for (let i = 0; i < COLS; i++) {
      const col = s.cols[i];
      const c = col[col.length - 1];
      if (col.length && foundationFor(s, c) >= 0 && (!best || rankOf(c) < best.rank))
        best = { src: { from: "tab", i, k: col.length - 1 }, rank: rankOf(c), card: c };
    }
    if (!best) return null;
    const dst = { to: "found", i: suitOf(best.card) };
    move(s, best.src, dst);
    steps.push({ src: best.src, dst });
  }
  return steps;
}

// Whether any move is left at all (a card to a foundation, a free cell, an empty column or onto another card).
export function anyMove(s) {
  for (let i = 0; i < CELLS; i++) if (s.cells[i] >= 0 && legalTargets(s, { from: "cell", i }).length) return true;
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    if (col.length && legalTargets(s, { from: "tab", i, k: col.length - 1 }).length) return true;
  }
  return false;
}

// The deal of a date: the same number for everyone on that date, from the date's place counted from 1 January
// 2026, mixed so that days next to each other get unrelated deals; unwinnable numbers are skipped.
export function dailyNumber(day) {
  const [y, m, d] = day.split("-").map(Number);
  let x = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000) >>> 0;
  for (;;) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    const n = (x % MAX_DEAL) + 1;
    if (!UNWINNABLE.includes(n)) return n;
    x += 1;
  }
}
