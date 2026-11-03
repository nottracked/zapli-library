// The rules of the three games as plain functions over small state objects, kept free of the page so the solver's
// worker and the development checks use exactly the same code.
//
// One deck: cards are numbers 0-51. suit = floor(card / 13) (spades, hearts, clubs, diamonds = 0-3), rank =
// card % 13 + 1 (ace = 1, king = 13). A position is one of:
//
// Pyramid {game, opts: {passes}, pyr, deck, gone, p, pass, out}
// - pyr: the 28 cards of the pyramid, row by row from the top (row r holds r + 1 cards); -1 where a card is gone;
// - deck: the other 24 cards in the order they are turned; gone[i] is 1 once deck[i] is paired away;
// - p: the cards of deck before p lie on the waste (the top is the last one not gone), the rest wait in the stock;
// - pass: the time through the stock (from 1); opts.passes is how many are allowed (0: no limit);
// - out: every card paired away, in order (the discard pile).
//
// Golf {game, opts: {kings}, cols, stock, sp, waste}
// - cols: seven columns of five, the last card of each on top; stock: the 16 cards to turn, the next at stock[sp];
// - waste: the pile cards go to, its top last; opts.kings: "none" (nothing goes on a king), "queen" (a queen may)
//   or "wrap" (a queen or an ace, and a king on an ace).
//
// Peaks {game, opts: {wrap, open}, cards, gone, stock, sp, waste, run, best}
// - cards: the 28 cards of the three peaks (see PEAK_ROWS); gone[i] is 1 once a card is played;
// - stock and waste as in Golf; run: cards played from the peaks since the last card turned; best: the longest run;
// - opts.wrap lets a king and an ace follow each other; opts.open shows every card face up.

export const GAMES = ["pyramid", "golf", "peaks"];
export const rankOf = (card) => (card % 13) + 1;
export const suitOf = (card) => Math.floor(card / 13);

// The same small generator Solitaire deals with: a 32-bit seed gives the same deal on every phone.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(seed) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const next = random(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ---- the rule options of each game, with the defaults, and the short key that names a set of them (each set has
// its own list of winnable deals).
export const PASSES = [1, 3, 0];
export const KINGS = ["none", "queen", "wrap"];

export function normOpts(game, o) {
  const v = o && typeof o === "object" ? o : {};
  if (game === "pyramid") return { passes: PASSES.includes(v.passes) ? v.passes : 3 };
  if (game === "golf") return { kings: KINGS.includes(v.kings) ? v.kings : "none" };
  return { wrap: v.wrap !== false, open: v.open === true };
}

export function variantOf(game, opts) {
  const o = normOpts(game, opts);
  if (game === "pyramid") return `p${o.passes}`;
  if (game === "golf") return o.kings;
  return o.wrap ? "wrap" : "nowrap";
}

// ---- the layouts
// Pyramid: index i is row r, place c, with i = r(r+1)/2 + c. A card is free when both cards below it are gone.
export const PYR_ROW = [];
export const PYR_COL = [];
for (let r = 0; r < 7; r++)
  for (let c = 0; c <= r; c++) {
    PYR_ROW.push(r);
    PYR_COL.push(c);
  }
const pyrIndex = (r, c) => (r * (r + 1)) / 2 + c;
// The two cards that cover each card of the pyramid (none in the bottom row).
export const PYR_COVER = PYR_ROW.map((r, i) =>
  r === 6 ? [] : [pyrIndex(r + 1, PYR_COL[i]), pyrIndex(r + 1, PYR_COL[i] + 1)],
);

// Peaks: the three tips (0-2), six cards under them (3-8, two per peak), nine (9-17) and the open row of ten (18-27).
// x is in half steps across the row of ten, so the table's width is 18 half steps plus a card.
export const PEAK_ROWS = [3, 6, 9, 10];
export const PEAK_ROW = [];
export const PEAK_X = [];
for (let p = 0; p < 3; p++) {
  PEAK_ROW.push(0);
  PEAK_X.push(3 + 6 * p);
}
for (let p = 0; p < 3; p++)
  for (let q = 0; q < 2; q++) {
    PEAK_ROW.push(1);
    PEAK_X.push(2 + 6 * p + 2 * q);
  }
for (let k = 0; k < 9; k++) {
  PEAK_ROW.push(2);
  PEAK_X.push(1 + 2 * k);
}
for (let j = 0; j < 10; j++) {
  PEAK_ROW.push(3);
  PEAK_X.push(2 * j);
}
// A card of the peaks is covered by the cards of the next row that overlap it: one half step to each side.
export const PEAK_COVER = PEAK_ROW.map((r, i) => {
  const out = [];
  if (r === 3) return out;
  PEAK_ROW.forEach((r2, j) => {
    if (r2 === r + 1 && Math.abs(PEAK_X[j] - PEAK_X[i]) === 1) out.push(j);
  });
  return out;
});

// ---- dealing
export function deal(game, seed, opts) {
  const d = shuffled(seed);
  const o = normOpts(game, opts);
  if (game === "pyramid")
    return {
      game,
      opts: o,
      pyr: d.slice(0, 28),
      deck: d.slice(28),
      gone: new Array(24).fill(0),
      p: 0,
      pass: 1,
      out: [],
    };
  if (game === "golf")
    return {
      game,
      opts: o,
      cols: [0, 1, 2, 3, 4, 5, 6].map((i) => d.slice(i * 5, i * 5 + 5)),
      stock: d.slice(36),
      sp: 0,
      waste: [d[35]],
    };
  return {
    game: "peaks",
    opts: o,
    cards: d.slice(0, 28),
    gone: new Array(28).fill(0),
    stock: d.slice(29),
    sp: 0,
    waste: [d[28]],
    run: 0,
    best: 0,
  };
}

export function clone(s) {
  const o = Object.assign({}, s, { opts: Object.assign({}, s.opts) });
  if (s.game === "pyramid")
    return Object.assign(o, { pyr: s.pyr.slice(), deck: s.deck, gone: s.gone.slice(), out: s.out.slice() });
  if (s.game === "golf") return Object.assign(o, { cols: s.cols.map((c) => c.slice()), waste: s.waste.slice() });
  return Object.assign(o, { gone: s.gone.slice(), waste: s.waste.slice() });
}

// ---- what can be seen and reached
export const pyrFree = (s, i) => s.pyr[i] >= 0 && PYR_COVER[i].every((j) => s.pyr[j] < 0);
export const peakFree = (s, i) => !s.gone[i] && PEAK_COVER[i].every((j) => s.gone[j]);
// A card of the peaks shows its face once nothing covers it (or always, with every card face up).
export const peakUp = (s, i) => s.opts.open || PEAK_COVER[i].every((j) => s.gone[j]);

// Pyramid's waste: the top card's place in deck, or -1; the next card of the stock, or -1.
export function wasteTop(s) {
  for (let i = s.p - 1; i >= 0; i--) if (!s.gone[i]) return i;
  return -1;
}
export function stockNext(s) {
  for (let i = s.p; i < 24; i++) if (!s.gone[i]) return i;
  return -1;
}
// The cards on Pyramid's waste and in its stock, bottom first.
export const wasteCards = (s) => s.deck.filter((c, i) => i < s.p && !s.gone[i]);
export const stockCards = (s) => s.deck.filter((c, i) => i >= s.p && !s.gone[i]);

export const top = (s) => s.waste[s.waste.length - 1];
export const stockLeft = (s) => (s.game === "pyramid" ? stockCards(s).length : s.stock.length - s.sp);

// Golf and Peaks: whether a card may go onto the waste's top card.
export function fits(s, card) {
  const r = rankOf(card);
  const t = rankOf(top(s));
  if (s.game === "golf") {
    const k = s.opts.kings;
    if (t === 13) return k === "queen" ? r === 12 : k === "wrap" ? r === 12 || r === 1 : false;
    if (t === 1) return r === 2 || (k === "wrap" && r === 13);
    return r === t + 1 || r === t - 1;
  }
  if (r === t + 1 || r === t - 1) return true;
  return !!s.opts.wrap && ((r === 1 && t === 13) || (r === 13 && t === 1));
}

// Pyramid: a place is {at: "pyr", i} or {at: "waste"}; its card, and whether it is free.
export function cardAt(s, place) {
  if (place.at === "pyr") return s.pyr[place.i];
  const w = wasteTop(s);
  return w < 0 ? -1 : s.deck[w];
}
export const placeFree = (s, place) => (place.at === "pyr" ? pyrFree(s, place.i) : wasteTop(s) >= 0);
export const pairs = (a, b) => rankOf(a) + rankOf(b) === 13;

// Can the stock be turned through again (Pyramid)?
export function canRedeal(s) {
  if (stockNext(s) >= 0 || wasteTop(s) < 0) return false;
  return s.opts.passes === 0 || s.pass < s.opts.passes;
}

// ---- moves
// Pyramid: {t: "k", i} a king of the pyramid; {t: "K"} the king on the waste; {t: "p", i, j} two cards of the
// pyramid; {t: "w", i} the waste's top card with a card of the pyramid; {t: "d"} turn a card; {t: "r"} turn the
// waste over to start the stock again.
// Golf: {t: "c", i} the top card of column i to the waste; {t: "d"} turn a card.
// Peaks: {t: "c", i} card i of the peaks to the waste; {t: "d"} turn a card.
export function canMove(s, m) {
  if (!m || typeof m !== "object") return false;
  if (s.game === "pyramid") {
    if (m.t === "d") return stockNext(s) >= 0;
    if (m.t === "r") return canRedeal(s);
    if (m.t === "K") {
      const w = wasteTop(s);
      return w >= 0 && rankOf(s.deck[w]) === 13;
    }
    if (m.t === "k") return validPyr(m.i) && pyrFree(s, m.i) && rankOf(s.pyr[m.i]) === 13;
    if (m.t === "p")
      return (
        validPyr(m.i) &&
        validPyr(m.j) &&
        m.i !== m.j &&
        pyrFree(s, m.i) &&
        pyrFree(s, m.j) &&
        pairs(s.pyr[m.i], s.pyr[m.j])
      );
    if (m.t === "w") {
      const w = wasteTop(s);
      return w >= 0 && validPyr(m.i) && pyrFree(s, m.i) && pairs(s.deck[w], s.pyr[m.i]);
    }
    return false;
  }
  if (m.t === "d") return s.sp < s.stock.length;
  if (m.t !== "c" || !Number.isInteger(m.i)) return false;
  if (s.game === "golf")
    return m.i >= 0 && m.i < 7 && s.cols[m.i].length > 0 && fits(s, s.cols[m.i][s.cols[m.i].length - 1]);
  return m.i >= 0 && m.i < 28 && peakFree(s, m.i) && fits(s, s.cards[m.i]);
}
const validPyr = (i) => Number.isInteger(i) && i >= 0 && i < 28;

// Plays a move that canMove() allowed; returns the cards it moved (for the page's words).
export function apply(s, m) {
  if (s.game === "pyramid") {
    if (m.t === "d") {
      s.p = stockNext(s) + 1;
      return [s.deck[s.p - 1]];
    }
    if (m.t === "r") {
      s.p = 0;
      s.pass += 1;
      return [];
    }
    const cards = [];
    const takePyr = (i) => {
      cards.push(s.pyr[i]);
      s.pyr[i] = -1;
    };
    const takeWaste = () => {
      const w = wasteTop(s);
      cards.push(s.deck[w]);
      s.gone[w] = 1;
    };
    if (m.t === "K") takeWaste();
    else if (m.t === "k") takePyr(m.i);
    else if (m.t === "p") {
      takePyr(m.i);
      takePyr(m.j);
    } else if (m.t === "w") {
      takeWaste();
      takePyr(m.i);
    }
    s.out.push(...cards);
    return cards;
  }
  if (m.t === "d") {
    const c = s.stock[s.sp];
    s.sp += 1;
    s.waste.push(c);
    if (s.game === "peaks") s.run = 0;
    return [c];
  }
  if (s.game === "golf") {
    const c = s.cols[m.i].pop();
    s.waste.push(c);
    return [c];
  }
  const c = s.cards[m.i];
  s.gone[m.i] = 1;
  s.waste.push(c);
  s.run += 1;
  s.best = Math.max(s.best, s.run);
  return [c];
}

// Every move that can be played now, the stock last.
export function legalMoves(s) {
  const out = [];
  if (s.game === "pyramid") {
    const free = [];
    for (let i = 0; i < 28; i++) if (pyrFree(s, i)) free.push(i);
    for (const i of free) if (rankOf(s.pyr[i]) === 13) out.push({ t: "k", i });
    const w = wasteTop(s);
    if (w >= 0 && rankOf(s.deck[w]) === 13) out.push({ t: "K" });
    for (let a = 0; a < free.length; a++)
      for (let b = a + 1; b < free.length; b++)
        if (pairs(s.pyr[free[a]], s.pyr[free[b]])) out.push({ t: "p", i: free[a], j: free[b] });
    if (w >= 0) for (const i of free) if (pairs(s.deck[w], s.pyr[i])) out.push({ t: "w", i });
    if (stockNext(s) >= 0) out.push({ t: "d" });
    else if (canRedeal(s)) out.push({ t: "r" });
    return out;
  }
  if (s.game === "golf") {
    for (let i = 0; i < 7; i++) if (canMove(s, { t: "c", i })) out.push({ t: "c", i });
  } else for (let i = 0; i < 28; i++) if (canMove(s, { t: "c", i })) out.push({ t: "c", i });
  if (s.sp < s.stock.length) out.push({ t: "d" });
  return out;
}

export const anyMove = (s) => legalMoves(s).length > 0;

// Cards still to clear: the pyramid, Golf's columns or the peaks.
export function tableauLeft(s) {
  if (s.game === "pyramid") return s.pyr.filter((c) => c >= 0).length;
  if (s.game === "golf") return s.cols.reduce((n, c) => n + c.length, 0);
  return s.gone.filter((g) => !g).length;
}
export const isWon = (s) => tableauLeft(s) === 0;

// A position's key: equal keys mean the same cards in the same places, so a verdict or a winning path found for
// one holds for the other.
export function key(s) {
  if (s.game === "pyramid")
    return `${s.game}:${s.pyr.map((c) => (c >= 0 ? 1 : 0)).join("")}:${s.gone.join("")}:${s.p}:${s.opts.passes ? s.pass : 0}`;
  if (s.game === "golf") return `golf:${s.cols.map((c) => c.length).join("")}:${s.sp}:${rankOf(top(s))}`;
  return `peaks:${s.gone.join("")}:${s.sp}:${rankOf(top(s))}`;
}

// ---- moves as short words, for saving a game: k5, K, p3-17, w5, d, r, c3.
export function moveText(m) {
  if (m.t === "p") return `p${m.i}-${m.j}`;
  if (m.t === "k" || m.t === "w" || m.t === "c") return `${m.t}${m.i}`;
  return m.t;
}

export function parseMove(word) {
  const w = String(word || "");
  if (w === "d" || w === "r" || w === "K") return { t: w };
  let m = /^([kwc])(\d{1,2})$/.exec(w);
  if (m) return { t: m[1], i: Number(m[2]) };
  m = /^p(\d{1,2})-(\d{1,2})$/.exec(w);
  if (m) return { t: "p", i: Number(m[1]), j: Number(m[2]) };
  return null;
}
