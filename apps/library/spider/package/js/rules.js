// Spider rules as plain functions over a small state object, kept free of the page so the solver's worker and the
// development checks use exactly the same code.
//
// Two decks: cards are numbers 0-103 in eight sets of thirteen. set = floor(card / 13), rank = card % 13 + 1 (ace =
// 1, king = 13). How many suits a game has decides each set's suit (spades, hearts, clubs, diamonds = 0-3): one suit
// is all spades, two are spades and hearts, four are every suit twice. A position is {suits, moves, stock, done,
// cols}:
// - stock: the cards still to deal, the next one last;
// - done: the runs from king to ace already put away, each as its thirteen cards;
// - cols: the ten columns, each {down, up}: face-down cards, then face-up cards, bottom first.

export const COLS = 10;
export const SUITS = [1, 2, 4];

const SET_SUITS = { 1: [0, 0, 0, 0, 0, 0, 0, 0], 2: [0, 1, 0, 1, 0, 1, 0, 1], 4: [0, 1, 2, 3, 0, 1, 2, 3] };
const SUIT_OF = {};
for (const n of SUITS) SUIT_OF[n] = Array.from({ length: 104 }, (_, c) => SET_SUITS[n][Math.floor(c / 13)]);

export const suitTable = (suits) => SUIT_OF[suits] || SUIT_OF[1];
export const suitOf = (s, card) => suitTable(s.suits)[card];
export const rankOf = (card) => (card % 13) + 1;

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

// Ten columns: the first four get six cards, the others five, dealt row by row; the last card of each is face up.
// The other fifty wait in the stock for five deals of ten.
export function deal(seed, suits) {
  const deck = Array.from({ length: 104 }, (_, i) => i);
  const next = random(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cols = Array.from({ length: COLS }, () => ({ down: [], up: [] }));
  let p = 0;
  for (let row = 0; row < 6; row++)
    for (let i = 0; i < COLS; i++) if (row < (i < 4 ? 6 : 5)) cols[i].down.push(deck[p++]);
  cols.forEach((c) => c.up.push(c.down.pop()));
  return { suits: SUITS.includes(suits) ? suits : 1, moves: 0, stock: deck.slice(p), done: [], cols };
}

export function clone(s) {
  return {
    suits: s.suits,
    moves: s.moves,
    stock: s.stock.slice(),
    done: s.done.map((r) => r.slice()),
    cols: s.cols.map((c) => ({ down: c.down.slice(), up: c.up.slice() })),
  };
}

// The same position whatever the order of the columns and the move count, with equal cards (the same suit and rank
// from either deck) counted as one: the key of the page's verdicts.
export function key(s) {
  const t = suitTable(s.suits);
  const ch = (c) => String.fromCharCode(48 + t[c] * 13 + rankOf(c));
  const cols = s.cols.map((c) => `${c.down.map(ch).join("")}/${c.up.map(ch).join("")}`).sort();
  return `${s.stock.map(ch).join("")}|${s.done.length}|${cols.join(",")}`;
}

// ---- moving cards
// A source is {from: "tab", i, k}: the face-up card at index k of column i and every card on it. A destination is
// {to: "tab", i}.
export function pick(s, src) {
  if (!src || src.from !== "tab") return [];
  const col = s.cols[src.i];
  if (!col || !Number.isInteger(src.k) || src.k < 0 || src.k >= col.up.length) return [];
  return col.up.slice(src.k);
}

// A run that moves together: one suit, each card one lower than the card under it.
export function isRun(s, cards) {
  const t = suitTable(s.suits);
  for (let i = 1; i < cards.length; i++)
    if (t[cards[i]] !== t[cards[0]] || rankOf(cards[i]) !== rankOf(cards[i - 1]) - 1) return false;
  return true;
}

// How many cards at the top of a column move together.
export function runLength(s, col) {
  const t = suitTable(s.suits);
  const up = col.up;
  let n = up.length ? 1 : 0;
  for (let j = up.length - 1; j > 0; j--) {
    if (t[up[j]] !== t[up[j - 1]] || rankOf(up[j]) !== rankOf(up[j - 1]) - 1) break;
    n += 1;
  }
  return n;
}

export function canMove(s, src, dst) {
  const cards = pick(s, src);
  if (!cards.length || !dst || dst.to !== "tab" || src.i === dst.i) return false;
  const col = s.cols[dst.i];
  if (!col || !isRun(s, cards)) return false;
  if (!col.up.length) return col.down.length === 0;
  return rankOf(col.up[col.up.length - 1]) === rankOf(cards[0]) + 1;
}

// A column whose last thirteen cards run from king to ace in one suit.
function complete(s, col) {
  const up = col.up;
  if (up.length < 13 || rankOf(up[up.length - 13]) !== 13) return false;
  return isRun(s, up.slice(-13));
}

// Turns over the card a column uncovered; true when it did.
function flip(col) {
  if (col.up.length || !col.down.length) return false;
  col.up.push(col.down.pop());
  return true;
}

// Puts away every complete run (a run from king to ace goes up by itself) and returns the steps.
function putAway(s, cols) {
  const steps = [];
  for (const i of cols) {
    const col = s.cols[i];
    if (!complete(s, col)) continue;
    s.done.push(col.up.splice(col.up.length - 13, 13));
    steps.push({ t: "r", c: i, f: flip(col) });
  }
  return steps;
}

// Moves without checking (call canMove first). Returns the steps as they are kept in the game's history: the move
// ({t: "m", a, b, n, f}: n cards from column a to b, f when a card turned over), then any run put away.
export function move(s, src, dst) {
  const from = s.cols[src.i];
  const cards = from.up.splice(src.k);
  s.cols[dst.i].up.push(...cards);
  const steps = [{ t: "m", a: src.i, b: dst.i, n: cards.length, f: flip(from) }];
  return steps.concat(putAway(s, [dst.i]));
}

// A deal needs ten cards in the stock and no empty column.
export const canDeal = (s) => s.stock.length >= COLS && s.cols.every((c) => c.up.length > 0);

export function dealRow(s) {
  for (let i = 0; i < COLS; i++) s.cols[i].up.push(s.stock.pop());
  return [{ t: "d" }].concat(putAway(s, [...Array(COLS).keys()]));
}

// Takes a step back exactly.
export function revert(s, op) {
  if (op.t === "d") {
    for (let i = COLS - 1; i >= 0; i--) s.stock.push(s.cols[i].up.pop());
    return;
  }
  if (op.t === "r") {
    const col = s.cols[op.c];
    if (op.f) col.down.push(col.up.pop());
    col.up.push(...s.done.pop());
    return;
  }
  const from = s.cols[op.a];
  if (op.f) from.down.push(from.up.pop());
  const to = s.cols[op.b].up;
  from.up.push(...to.splice(to.length - op.n, op.n));
}

// The step as a short word for saving: "m27c" is twelve cards from column 3 to column 8, "m27cf" also turned a card
// over; "r4" put away a run from column 5; "d" dealt a row.
export function opText(op) {
  if (op.t === "d") return "d";
  if (op.t === "r") return `r${op.c}${op.f ? "f" : ""}`;
  return `m${op.a}${op.b}${op.n.toString(36)}${op.f ? "f" : ""}`;
}

export function opParse(text) {
  if (text === "d") return { t: "d" };
  let m = /^r(\d)(f?)$/.exec(text);
  if (m) return { t: "r", c: Number(m[1]), f: m[2] === "f" };
  m = /^m(\d)(\d)([1-9a-d])(f?)$/.exec(text);
  if (m) return { t: "m", a: Number(m[1]), b: Number(m[2]), n: parseInt(m[3], 36), f: m[4] === "f" };
  return null;
}

// Plays a player's step again from a save: a move or a deal (the runs put away follow by themselves). Returns the
// steps, or null when the step does not fit the position.
export function replay(s, op) {
  if (op.t === "d") return canDeal(s) ? dealRow(s) : null;
  if (op.t !== "m") return null;
  const col = s.cols[op.a];
  if (!col || col.up.length < op.n) return null;
  const src = { from: "tab", i: op.a, k: col.up.length - op.n };
  const dst = { to: "tab", i: op.b };
  return canMove(s, src, dst) ? move(s, src, dst) : null;
}

export function legalTargets(s, src) {
  const out = [];
  for (let i = 0; i < COLS; i++) if (canMove(s, src, { to: "tab", i })) out.push({ to: "tab", i });
  return out;
}

// Where a tap sends a run: onto a card of its own suit first (that keeps the run growing), then onto any card one
// higher, then into an empty column (not when the run already is a whole column).
export function bestTarget(s, src) {
  const cards = pick(s, src);
  if (!cards.length) return null;
  const t = suitTable(s.suits);
  let other = null;
  let empty = null;
  for (let i = 0; i < COLS; i++) {
    if (!canMove(s, src, { to: "tab", i })) continue;
    const up = s.cols[i].up;
    if (!up.length) {
      if (!empty) empty = { to: "tab", i };
    } else if (t[up[up.length - 1]] === t[cards[0]]) return { to: "tab", i };
    else if (!other) other = { to: "tab", i };
  }
  const whole = src.k === 0 && !s.cols[src.i].down.length;
  return other || (whole ? null : empty);
}

export const isWon = (s) => s.done.length === 8;
export const allFaceUp = (s) => s.cols.every((c) => c.down.length === 0);

// Whether any move or deal is left at all.
export function anyMove(s) {
  if (canDeal(s)) return true;
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    const n = runLength(s, col);
    for (let k = col.up.length - n; k < col.up.length; k++)
      if (legalTargets(s, { from: "tab", i, k }).length) return true;
  }
  return false;
}
