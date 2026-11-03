// Development only (not shipped): checks the rules of js/rules.js and the solver of js/solver.js in Node.
//
//   node apps/library/spider/dev/check-rules.mjs
//
// 1. The deal: 54 cards in ten columns (six in the first four, five in the others, the last face up), 50 in the
//    stock; the shuffle is pinned on four seeds (a change would make every listed deal another game); one, two and
//    four suits.
// 2. Moves: runs of one suit move together, any card one higher takes them, an empty column takes anything, the
//    uncovered card turns over, a run from king to ace goes away, a deal needs every column filled; every step taken
//    back gives the position again; saved steps read back and play again the same.
// 3. The solver on positions from random play: every "win" comes with a path that wins, and every "lost" agrees
//    with a plain search written separately here, where that search can finish.
// Exit code 0 when everything holds, 1 otherwise.
import { createHash } from "node:crypto";
import * as R from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";

const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};
let seed = 99;
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};

// ---- 1. the deal
const PINS = {
  "1:1": "7291bb07183ecbd4",
  "20261103:2": "c932e33cabeb87f1",
  "4294967295:4": "68ec24b150c69341",
  "2654435761:4": "24df05a452d90c1c",
};
const pinOf = (s) => {
  const ch = (c) => c.toString(36).padStart(2, "0");
  const text = `${s.stock.map(ch).join("")}|${s.cols.map((c) => `${c.down.map(ch).join("")}/${c.up.map(ch).join("")}`).join(",")}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
};
for (const [k, want] of Object.entries(PINS)) {
  const [sd, suits] = k.split(":").map(Number);
  check(pinOf(R.deal(sd, suits)) === want, `deal(${sd}, ${suits}) changed`);
}
for (const suits of R.SUITS) {
  const s = R.deal(12345, suits);
  check(s.stock.length === 50, `${suits}: 50 cards in the stock`);
  s.cols.forEach((c, i) => {
    check(c.down.length + c.up.length === (i < 4 ? 6 : 5) && c.up.length === 1, `${suits}: column ${i + 1} dealt`);
  });
  const counts = [0, 0, 0, 0];
  for (let c = 0; c < 104; c++) counts[R.suitOf(s, c)] += 1;
  const want = { 1: [104, 0, 0, 0], 2: [52, 52, 0, 0], 4: [26, 26, 26, 26] }[suits];
  check(counts.join() === want.join(), `${suits} suit(s): ${counts.join()}`);
}

// ---- 2. moves on a small position (columns as text, bottom first; "_" before face-down cards)
const RANKS = "A23456789TJQK";
const SUITS = "SHCD";
// A card of a suit and rank, a different copy each time it is asked for.
const used = new Set();
function card(text) {
  const rank = RANKS.indexOf(text[0]) + 1;
  const suit = SUITS.indexOf(text[1]);
  // 4 suits: sets 0-7 have suits 0,1,2,3,0,1,2,3.
  for (const set of [suit, suit + 4]) {
    const c = set * 13 + rank - 1;
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
  throw new Error(`no more ${text}`);
}
function position(cols, stock = []) {
  used.clear();
  const s = { suits: 4, moves: 0, stock: [], done: [], cols: [] };
  for (let i = 0; i < 10; i++) {
    const words = (cols[i] || "").split(" ").filter(Boolean);
    s.cols.push({
      down: words.filter((w) => w.startsWith("_")).map((w) => card(w.slice(1))),
      up: words.filter((w) => !w.startsWith("_")).map(card),
    });
  }
  s.stock = stock.map(card);
  return s;
}
let s = position([
  "_4D 9S 8S 7S",
  "TH",
  "",
  "9H 8C",
  "KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S",
  "AS",
  "5D",
  "6C",
  "7C",
  "8D",
]);
check(R.isRun(s, s.cols[0].up), "9 8 7 of spades is a run");
check(!R.isRun(s, s.cols[3].up), "9 of hearts and 8 of clubs is no run");
check(R.canMove(s, { from: "tab", i: 0, k: 0 }, { to: "tab", i: 1 }), "a spade run goes on the 10 of hearts");
check(R.canMove(s, { from: "tab", i: 0, k: 1 }, { to: "tab", i: 2 }), "part of a run goes into an empty column");
check(!R.canMove(s, { from: "tab", i: 3, k: 0 }, { to: "tab", i: 1 }), "a mixed run does not move");
check(
  R.canMove(s, { from: "tab", i: 3, k: 1 }, { to: "tab", i: 9 }) === false,
  "8 of clubs does not go on 8 of diamonds",
);
let ops = R.move(s, { from: "tab", i: 0, k: 0 }, { to: "tab", i: 1 });
check(ops[0].f && s.cols[0].up.length === 1 && s.cols[0].down.length === 0, "the uncovered card turns over");
ops = R.move(s, { from: "tab", i: 5, k: 0 }, { to: "tab", i: 4 });
check(ops.length === 2 && ops[1].t === "r" && s.done.length === 1 && !s.cols[4].up.length, "king to ace goes away");
check(!R.canDeal(s), "no deal while a column is empty (and too few cards in the stock)");
const full = R.deal(7, 1);
check(R.canDeal(full), "a fresh deal can deal");
// Take steps back exactly, and read saved steps back.
for (const suits of R.SUITS) {
  const t = R.deal(4242 + suits, suits);
  const start = R.key(t);
  const startPin = pinOf(t);
  const steps = [];
  for (let n = 0; n < 120; n++) {
    const choices = [];
    for (let i = 0; i < 10; i++) {
      const col = t.cols[i];
      for (let k = col.up.length - R.runLength(t, col); k < col.up.length; k++)
        for (const d of R.legalTargets(t, { from: "tab", i, k })) choices.push({ src: { from: "tab", i, k }, dst: d });
    }
    if (R.canDeal(t) && (rnd() < 0.1 || !choices.length)) steps.push(R.dealRow(t));
    else if (choices.length) {
      const m = choices[Math.floor(rnd() * choices.length)];
      steps.push(R.move(t, m.src, m.dst));
    } else break;
    const op = steps[steps.length - 1][0];
    const back = R.opParse(R.opText(op));
    check(back && R.opText(back) === R.opText(op), `step ${R.opText(op)} reads back`);
  }
  // Played again from the deal, the saved steps give the same position.
  const again = R.deal(4242 + suits, suits);
  for (const st of steps) check(!!R.replay(again, R.opParse(R.opText(st[0]))), "a saved step plays again");
  check(R.key(again) === R.key(t), `${suits}: the steps played again give the same position`);
  for (let n = steps.length - 1; n >= 0; n--) for (let j = steps[n].length - 1; j >= 0; j--) R.revert(t, steps[n][j]);
  check(R.key(t) === start && pinOf(t) === startPin, `${suits}: every step taken back gives the deal again`);
}

// ---- 3. the solver on positions from random play
const wins = (start0, path) => {
  const t = R.clone(start0);
  for (const m of path) {
    if (m.deal ? !R.canDeal(t) : !R.canMove(t, m.src, m.dst)) return false;
    if (m.deal) R.dealRow(t);
    else R.move(t, m.src, m.dst);
  }
  return R.isWon(t);
};
// A plain search, written separately: every position reached by legal moves and deals, up to a limit. True, false,
// or null when the limit was reached.
function plainWinnable(start0, limit) {
  const seen = new Set();
  const stack = [R.clone(start0)];
  while (stack.length) {
    const t = stack.pop();
    if (R.isWon(t)) return true;
    const k = R.key(t);
    if (seen.has(k)) continue;
    seen.add(k);
    if (seen.size > limit) return null;
    if (R.canDeal(t)) {
      const u = R.clone(t);
      R.dealRow(u);
      stack.push(u);
    }
    for (let i = 0; i < 10; i++) {
      const col = t.cols[i];
      for (let k2 = col.up.length - R.runLength(t, col); k2 < col.up.length; k2++)
        for (const d of R.legalTargets(t, { from: "tab", i, k: k2 })) {
          const u = R.clone(t);
          R.move(u, { from: "tab", i, k: k2 }, d);
          stack.push(u);
        }
    }
  }
  return false;
}
const verdicts = { win: 0, lost: 0, limit: 0 };
let confirmed = 0;
for (const suits of R.SUITS)
  for (let g = 0; g < 12; g++) {
    const t = R.deal(900 + g, suits);
    for (let step = 0; step < 150; step++) {
      const choices = [];
      for (let i = 0; i < 10; i++) {
        const col = t.cols[i];
        for (let k = col.up.length - R.runLength(t, col); k < col.up.length; k++)
          for (const d of R.legalTargets(t, { from: "tab", i, k }))
            choices.push({ src: { from: "tab", i, k }, dst: d });
      }
      if (R.canDeal(t) && (rnd() < 0.15 || !choices.length)) R.dealRow(t);
      else if (choices.length) {
        const m = choices[Math.floor(rnd() * choices.length)];
        R.move(t, m.src, m.dst);
      } else break;
      if (step % 30 !== 29) continue;
      const r = solve(t, 3000, { maxNodes: 40000 });
      verdicts[r.status] += 1;
      if (r.status === "win") check(wins(t, r.path), `a "win" (${suits} suits) comes with a winning path`);
      if (r.status === "lost") {
        const plain = plainWinnable(t, 40000);
        if (plain !== null) {
          confirmed += 1;
          check(plain === false, `a "lost" (${suits} suits, game ${900 + g}) is lost for the plain search too`);
        }
      }
    }
  }
console.log(`random play: ${JSON.stringify(verdicts)}; ${confirmed} "lost" answers confirmed by the plain search`);

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("rules ok");
