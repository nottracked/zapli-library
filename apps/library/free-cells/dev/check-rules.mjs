// Development only (not shipped): checks the rules of js/rules.js and the solver of js/solver.js in Node.
//
//   node apps/library/free-cells/dev/check-rules.mjs
//
// 1. The numbered deals match the classic numbering (deals 1 and 617, as the numbering's published examples list
//    them).
// 2. Moves: building down in alternating colours, the free cells, the foundations, how many cards move at once,
//    taking a step back exactly, saved steps read back.
// 3. Safe cards, the finish, the daily deal's number (the same for a date, never an unwinnable deal).
// 4. The solver: deals 1-300 are won with a path the rules accept; the eight deals of the first million known to be
//    unwinnable are proven lost; on positions from random play, every "lost" agrees with a plain search written
//    separately here, and every "win" comes with a path that wins.
// Exit code 0 when everything holds, 1 otherwise.
import * as R from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";

const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};
const N = "A23456789TJQK";
const S = "SHCD";
const name = (c) => N[R.rankOf(c) - 1] + S[R.suitOf(c)];
const card = (text) => R.cardOf(S.indexOf(text[1]), N.indexOf(text[0]) + 1);

// ---- 1. numbered deals
const rows = (n) => {
  const s = R.dealNumbered(n);
  const out = [];
  for (let r = 0; r < 7; r++)
    out.push(
      s.cols
        .map((c) => (c[r] === undefined ? "" : name(c[r])))
        .filter(Boolean)
        .join(" "),
    );
  return out.join("\n");
};
check(
  rows(1) ===
    [
      "JD 2D 9H JC 5D 7H 7C 5H",
      "KD KC 9S 5S AD QC KH 3H",
      "2S KS 9D QD JS AS AH 3C",
      "4C 5C TS QH 4H AC 4D 7S",
      "3S TD 4S TH 8H 2C JH 7D",
      "6D 8S 8D QS 6C 3D 8C TC",
      "6S 9C 2H 6H",
    ].join("\n"),
  "deal 1 is the classic deal 1",
);
check(
  rows(617) ===
    [
      "7D AD 5C 3S 5S 8C 2D AH",
      "TD 7S QD AC 6D 8H AS KH",
      "TH QC 3H 9D 6S 8D 3D TC",
      "KD 5H 9S 3C 8S 7H 4D JS",
      "4C QS 9C 9H 7C 6H 2C 2S",
      "4S TS 2H 5D JC 6C JH QH",
      "JD KS KC 4H",
    ].join("\n"),
  "deal 617 is the classic deal 617",
);
for (const n of [1, 2, 1000, 999999, 1000000]) check(R.isValid(R.dealNumbered(n)), `deal ${n} is valid`);

// ---- 2. moves
// A small position: columns given as text, bottom card first.
function position(cols, cells = [], found = [0, 0, 0, 0]) {
  const s = { moves: 0, cells: [-1, -1, -1, -1], found: found.slice(), cols: [[], [], [], [], [], [], [], []] };
  cols.forEach((c, i) => (s.cols[i] = c ? c.split(" ").map(card) : []));
  cells.forEach((c, i) => (s.cells[i] = c ? card(c) : -1));
  return s;
}
let s = position(["KS QH JC", "QD", "9H", "8C 7D", "", "", "", ""], ["2S", "3S", "", ""], [1, 0, 0, 0]);
check(R.isRun(["KS", "QH", "JC"].map(card)), "K Q J in alternating colours is a run");
check(!R.isRun(["KS", "QS"].map(card)), "two black cards are no run");
check(R.canMove(s, { from: "tab", i: 2, k: 0 }, { to: "tab", i: 3 }) === false, "9H does not go on 7D");
check(R.canMove(s, { from: "tab", i: 3, k: 1 }, { to: "tab", i: 4 }), "7D goes into an empty column");
check(R.canMove(s, { from: "cell", i: 0 }, { to: "found", i: 0 }), "2S goes up on AS");
check(!R.canMove(s, { from: "cell", i: 1 }, { to: "found", i: 0 }), "3S does not go up on AS");
check(!R.canMove(s, { from: "cell", i: 0 }, { to: "found", i: 1 }), "2S does not go to the hearts");
check(!R.canMove(s, { from: "cell", i: 0 }, { to: "cell", i: 2 }), "no move from one free cell to another");
check(R.canMove(s, { from: "tab", i: 1, k: 0 }, { to: "cell", i: 2 }), "QD goes into a free cell");
check(!R.canMove(s, { from: "tab", i: 1, k: 0 }, { to: "cell", i: 0 }), "not into a full free cell");
// Capacity: (free cells + 1) × 2^(empty columns), one empty column less when the run goes into one.
check(R.capacity(s, false) === 3 * 16, "2 free cells and 4 empty columns: 48 cards");
check(R.capacity(s, true) === 3 * 8, "into an empty column: 24 cards");
// No free cell and one empty column (only the counts matter here).
const full = position(["KS QH JC TD 9S", "", "QC", "KD", "KC", "KH", "QS", "JH"], ["2H", "3H", "4H", "5H"]);
// 0 free cells, 1 empty column: 2 cards onto a card, 1 into the empty column.
check(R.capacity(full, false) === 2 && R.capacity(full, true) === 1, "no free cell, one empty column: 2 and 1");
check(!R.canMove(full, { from: "tab", i: 0, k: 2 }, { to: "tab", i: 1 }), "3 cards cannot go into the empty column");
check(R.canMove(full, { from: "tab", i: 0, k: 4 }, { to: "tab", i: 1 }), "1 card can go into the empty column");
// Take steps back exactly, and read saved steps back.
const s1 = R.dealNumbered(5);
const start = JSON.stringify(s1);
const ops = [];
let seed = 42;
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
for (let n = 0; n < 40; n++) {
  const choices = [];
  for (let i = 0; i < 8; i++)
    for (let k = 0; k < s1.cols[i].length; k++)
      for (const d of R.legalTargets(s1, { from: "tab", i, k })) choices.push({ src: { from: "tab", i, k }, dst: d });
  for (let i = 0; i < 4; i++)
    if (s1.cells[i] >= 0)
      for (const d of R.legalTargets(s1, { from: "cell", i })) choices.push({ src: { from: "cell", i }, dst: d });
  if (!choices.length) break;
  const m = choices[Math.floor(rnd() * choices.length)];
  const op = R.move(s1, m.src, m.dst);
  check(R.isValid(s1), `move ${n} keeps a valid position`);
  const back = R.opParse(R.opText(op));
  check(back && back.s === op.s && back.d === op.d && back.n === op.n, `step ${R.opText(op)} reads back`);
  ops.push(op);
}
for (let n = ops.length - 1; n >= 0; n--) R.revert(s1, ops[n]);
check(JSON.stringify(s1) === start, "every step taken back gives the deal again");

// ---- 3. safe cards, the finish, the daily deal
s = position(["AH", "3C 2H", "", "", "", "", "", ""], [], [3, 0, 2, 1]);
check(R.isSafe(s, card("AH")) && R.isSafe(s, card("2H")), "aces and twos are safe");
check(!R.isSafe(s, card("4S")), "4S is not safe while the 3 of hearts and the 3 of diamonds are not up");
const ups = R.autoPlay(s);
check(ups.length === 2 && s.found[1] === 2, "the AH and then the 2H go up by themselves");
const done = position(
  ["KH QH JH TH 9H 8H 7H 6H 5H 4H 3H 2H AH", "KS QS JS TS 9S 8S", "KC QC", "KD"],
  ["7S", "", "", ""],
);
done.cols[1].push(...["6S", "5S", "4S", "3S", "2S", "AS"].map(card));
done.cols[2].push(...["JC", "TC", "9C", "8C", "7C", "6C", "5C", "4C", "3C", "2C", "AC"].map(card));
done.cols[3].push(...["QD", "JD", "TD", "9D", "8D", "7D", "6D", "5D", "4D", "3D", "2D", "AD"].map(card));
check(R.sorted(done), "columns in descending order count as sorted");
const plan = R.planFinish(done);
check(plan && plan.length === 52, `the finish plays all 52 cards (${plan && plan.length})`);
check(!R.planFinish(R.dealNumbered(1)), "a fresh deal has no finish");
const days = ["2026-01-01", "2026-11-03", "2027-02-28", "2030-12-31"];
for (const d of days) {
  const a = R.dailyNumber(d);
  check(a === R.dailyNumber(d), `the daily deal of ${d} is the same every time`);
  check(a >= 1 && a <= R.MAX_DEAL && !R.UNWINNABLE.includes(a), `the daily deal of ${d} is a winnable number`);
}
check(new Set(days.map(R.dailyNumber)).size === days.length, "different dates give different deals");

// ---- 4. the solver
const replays = (start0, path) => {
  const t = R.clone(start0);
  for (const m of path) {
    if (!R.canMove(t, m.src, m.dst)) return false;
    R.move(t, m.src, m.dst);
    R.autoPlay(t);
  }
  return R.isWon(t);
};
let total = 0;
let worst = 0;
for (let n = 1; n <= 300; n++) {
  const t0 = Date.now();
  const r = solve(R.dealNumbered(n), 20000);
  const ms = Date.now() - t0;
  total += ms;
  worst = Math.max(worst, ms);
  check(r.status === "win" && r.path && replays(R.dealNumbered(n), r.path), `deal ${n} is won by the solver's path`);
}
console.log(`deals 1-300 solved: ${Math.round(total / 300)} ms on average, ${worst} ms at most`);
for (const n of R.UNWINNABLE) {
  const t0 = Date.now();
  const r = solve(R.dealNumbered(n), 60000);
  check(r.status === "lost", `deal ${n} is proven unwinnable (${r.status})`);
  console.log(`deal ${n}: ${r.status} in ${Date.now() - t0} ms`);
}

// A plain search, written separately: every position reached by single legal moves (no safe cards sent up by
// themselves), up to a limit. True, false, or null when the limit was reached.
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
    const srcs = [];
    for (let i = 0; i < 4; i++) if (t.cells[i] >= 0) srcs.push({ from: "cell", i });
    for (let i = 0; i < 8; i++) if (t.cols[i].length) srcs.push({ from: "tab", i, k: t.cols[i].length - 1 });
    for (const src of srcs)
      for (const dst of R.legalTargets(t, src)) {
        const u = R.clone(t);
        R.move(u, src, dst);
        stack.push(u);
      }
  }
  return false;
}
let compared = 0;
const verdicts = { win: 0, lost: 0, limit: 0 };
seed = 7;
for (let g = 0; g < 40; g++) {
  const t = R.dealNumbered(2000 + g * 31);
  R.autoPlay(t);
  for (let step = 0; step < 40; step++) {
    const choices = [];
    for (let i = 0; i < 8; i++)
      if (t.cols[i].length) {
        const src = { from: "tab", i, k: t.cols[i].length - 1 };
        for (const d of R.legalTargets(t, src)) if (d.to !== "found") choices.push({ src, dst: d });
      }
    if (!choices.length) break;
    const m = choices[Math.floor(rnd() * choices.length)];
    R.move(t, m.src, m.dst);
    R.autoPlay(t);
    if (step % 4 !== 3) continue;
    const r = solve(t, 10000);
    verdicts[r.status] += 1;
    if (r.status === "win") check(replays(t, r.path), `a "win" on deal ${2000 + g * 31} comes with a winning path`);
    if (r.status === "lost") {
      const plain = plainWinnable(t, 60000);
      if (plain !== null) {
        compared += 1;
        check(plain === false, `a "lost" on deal ${2000 + g * 31} is lost for the plain search too`);
      }
    }
  }
}
console.log(`random play: ${JSON.stringify(verdicts)}; ${compared} "lost" answers confirmed by the plain search`);

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("rules ok");
