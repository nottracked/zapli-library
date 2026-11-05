// Development only (not shipped): checks the rules and the solver of the three games.
//
//   node apps/library/patience/dev/check-rules.mjs
//
// 1. The layouts: which cards cover which, the shapes a pyramid can take, every deal holds each card once, and the
//    shuffle stays the same (daily deals depend on it).
// 2. The rules: what fits on what in Golf (each choice for kings) and Peaks (with and without king-ace), pairs in
//    Pyramid, turning the stock over, and moves as words.
// 3. The solver against a separate plain search (no pruning, the rules' own moves and keys): positions from random
//    play in every set of rules; every "lost" must be confirmed, every "win" path must replay to a win.
// Exit code 0 when everything holds, 1 otherwise.
import * as R from "../package/js/rules.js";
import { solve, finishPath } from "../package/js/solver.js";

const problems = [];
let checks = 0;
const check = (ok, what) => {
  checks += 1;
  if (!ok) problems.push(what);
};
const card = (suit, rank) => suit * 13 + rank - 1;

// ---- 1. layouts and deals
check(R.PYR_COVER.filter((c) => c.length === 2).length === 21, "21 pyramid cards are covered by two");
check(
  R.PYR_COVER.every((c, i) => c.every((j) => R.PYR_ROW[j] === R.PYR_ROW[i] + 1)),
  "pyramid cards are covered from the row below",
);
// The shapes of the cards gone from a pyramid: a card only after both cards over it.
const shapes = new Set();
(function walk(mask) {
  if (shapes.has(mask)) return;
  shapes.add(mask);
  for (let i = 0; i < 28; i++)
    if (!(mask & (1 << i)) && R.PYR_COVER[i].every((j) => mask & (1 << j))) walk(mask | (1 << i));
})(0);
check(shapes.size === 1430, `a pyramid has 1430 shapes (${shapes.size})`);
check(R.PEAK_ROW.filter((r) => r === 3).length === 10, "Peaks' open row has ten cards");
check(
  R.PEAK_COVER.every((c, i) => (R.PEAK_ROW[i] === 3 ? c.length === 0 : c.length === 2)),
  "every card of the peaks but the open row is covered by two",
);
check(
  JSON.stringify(R.PEAK_COVER.slice(0, 3)) === "[[3,4],[5,6],[7,8]]",
  `the tips are covered by their own two (${JSON.stringify(R.PEAK_COVER.slice(0, 3))})`,
);
check(R.shuffled(1).slice(0, 8).join(",") === "24,44,23,10,43,31,50,41", "the shuffle of seed 1 stays the same");
check(
  R.shuffled(2654435761).slice(0, 6).join(",") === "29,15,40,4,13,16",
  "the shuffle of a large seed stays the same",
);
for (const g of R.GAMES)
  for (const seed of [1, 7, 123456789]) {
    const s = R.deal(g, seed, {});
    const all =
      g === "pyramid"
        ? [...s.pyr, ...s.deck]
        : g === "golf"
          ? [...s.cols.flat(), ...s.stock, ...s.waste]
          : [...s.cards, ...s.stock, ...s.waste];
    check(all.length === 52 && new Set(all).size === 52, `${g} deal ${seed} holds every card once`);
  }
const gd = R.deal("golf", 1, {});
check(gd.cols.every((c) => c.length === 5) && gd.stock.length === 16 && gd.waste.length === 1, "Golf: 7 × 5, 16, 1");
const pd = R.deal("peaks", 1, {});
check(pd.stock.length === 23 && pd.waste.length === 1, "Peaks: 28, 23, 1");
check(R.deal("pyramid", 1, {}).deck.length === 24, "Pyramid: 28, 24");

// ---- 2. rules
function fitsGolf(kings, r, t) {
  const s = R.deal("golf", 1, { kings });
  s.waste = [card(0, t)];
  return R.fits(s, card(1, r));
}
for (const [kings, r, t, want] of [
  ["none", 6, 7, true],
  ["none", 8, 7, true],
  ["none", 9, 7, false],
  ["none", 12, 13, false],
  ["none", 1, 13, false],
  ["none", 13, 12, true],
  ["none", 2, 1, true],
  ["none", 13, 1, false],
  ["queen", 12, 13, true],
  ["queen", 1, 13, false],
  ["wrap", 12, 13, true],
  ["wrap", 1, 13, true],
  ["wrap", 13, 1, true],
  ["wrap", 3, 1, false],
])
  check(fitsGolf(kings, r, t) === want, `Golf (${kings}): ${r} on ${t} ${want ? "fits" : "does not fit"}`);
function fitsPeaks(wrap, r, t) {
  const s = R.deal("peaks", 1, { wrap });
  s.waste = [card(2, t)];
  return R.fits(s, card(3, r));
}
for (const [wrap, r, t, want] of [
  [true, 1, 13, true],
  [true, 13, 1, true],
  [false, 1, 13, false],
  [false, 13, 1, false],
  [true, 5, 4, true],
  [false, 3, 4, true],
  [true, 6, 4, false],
])
  check(fitsPeaks(wrap, r, t) === want, `Peaks (${wrap ? "wrap" : "no wrap"}): ${r} on ${t}`);
check(
  R.pairs(card(0, 6), card(1, 7)) && !R.pairs(card(0, 6), card(1, 6)) && R.pairs(card(2, 1), card(3, 12)),
  "pairs make 13",
);
// Turning Pyramid's stock over: never with cards still in the stock, and only as often as the rules allow.
for (const passes of [1, 3, 0]) {
  const s = R.deal("pyramid", 5, { passes });
  check(!R.canRedeal(s), `Pyramid (${passes}): no turning over at the start`);
  let turned = 0;
  for (let k = 0; k < 200 && turned < 5; k++) {
    if (R.canMove(s, { t: "d" })) R.apply(s, { t: "d" });
    else if (R.canRedeal(s)) {
      R.apply(s, { t: "r" });
      turned += 1;
    } else break;
  }
  const want = passes === 0 ? 5 : passes - 1;
  check(turned === want, `Pyramid (${passes}): the stock turns over ${want} times (${turned})`);
}
for (const m of [
  { t: "d" },
  { t: "r" },
  { t: "K" },
  { t: "k", i: 27 },
  { t: "p", i: 3, j: 17 },
  { t: "w", i: 5 },
  { t: "c", i: 6 },
])
  check(JSON.stringify(R.parseMove(R.moveText(m))) === JSON.stringify(m), `the move ${R.moveText(m)} reads back`);
check(R.parseMove("x9") === null && R.parseMove("p3") === null, "unknown words are no moves");

// ---- 3. the solver against a plain search
// The plain search: every legal move of the rules, positions told apart by the rules' key, no pruning at all.
function plain(s0, cap) {
  const seen = new Set([R.key(s0)]);
  const stack = [s0];
  while (stack.length) {
    const s = stack.pop();
    if (R.isWon(s)) return "win";
    for (const m of R.legalMoves(s)) {
      const n = R.clone(s);
      R.apply(n, m);
      const k = R.key(n);
      if (seen.has(k)) continue;
      if (seen.size >= cap) return "limit";
      seen.add(k);
      stack.push(n);
    }
  }
  return "lost";
}

// A small generator for the random play, so the check is the same every run.
let r0 = 12345;
const rand = () => {
  r0 = (Math.imul(r0, 1103515245) + 12345) >>> 0;
  return r0 / 4294967296;
};

const SETS = [
  ["pyramid", { passes: 3 }],
  ["pyramid", { passes: 1 }],
  ["pyramid", { passes: 0 }],
  ["golf", { kings: "none" }],
  ["golf", { kings: "queen" }],
  ["golf", { kings: "wrap" }],
  ["peaks", { wrap: true }],
  ["peaks", { wrap: false }],
];
const tally = { win: 0, lost: 0, confirmedLost: 0, unsettled: 0 };
for (const [g, opts] of SETS)
  for (let n = 0; n < 14; n++) {
    const s = R.deal(g, 1000 + n * 7919, opts);
    const steps = 6 + Math.floor(rand() * 26);
    for (let k = 0; k < steps; k++) {
      const moves = R.legalMoves(s);
      if (!moves.length || R.isWon(s)) break;
      R.apply(s, moves[Math.floor(rand() * moves.length)]);
    }
    const a = solve(s, 30000, { maxNodes: 3000000 });
    if (a.status === "win") {
      tally.win += 1;
      const t = R.clone(s);
      let ok = true;
      for (const m of a.path) {
        if (!R.canMove(t, m)) {
          ok = false;
          break;
        }
        R.apply(t, m);
      }
      check(ok && R.isWon(t), `${g} ${JSON.stringify(opts)} #${n}: the winning path replays to a win`);
      const b = plain(s, 400000);
      check(b !== "lost", `${g} ${JSON.stringify(opts)} #${n}: the plain search does not call a won position lost`);
    } else if (a.status === "lost") {
      tally.lost += 1;
      const b = plain(s, 2500000);
      if (b === "lost") tally.confirmedLost += 1;
      else tally.unsettled += 1;
      check(b !== "win", `${g} ${JSON.stringify(opts)} #${n}: "lost" is confirmed (the plain search says ${b})`);
    } else tally.unsettled += 1;
  }
check(tally.confirmedLost >= 20, `enough "lost" verdicts are confirmed (${tally.confirmedLost})`);

// Finishing: a path without the stock exists only when the rest can be cleared as it lies.
for (const g of R.GAMES) {
  const s = R.deal(g, 99, {});
  const path = solve(s, 30000, { maxNodes: 3000000 }).path;
  if (!path) continue;
  const t = R.clone(s);
  let found = null;
  for (const m of path) {
    if (R.tableauLeft(t) <= 14 && !found) found = finishPath(t);
    R.apply(t, m);
  }
  if (found) {
    let ok = true;
    for (const m of found) ok = ok && m.t !== "d" && m.t !== "r";
    check(ok, `${g}: Finish never turns the stock`);
  }
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log(
  `rules ok (${checks} checks): ${tally.win} won and ${tally.lost} lost positions from random play; ` +
    `${tally.confirmedLost} "lost" confirmed by a plain search, ${tally.unsettled} beyond its budget`,
);
