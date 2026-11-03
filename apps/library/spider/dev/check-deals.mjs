// Development only (not shipped): checks that the deals of ../package/js/deals.js still are what deals.mjs found.
//
//   node apps/library/spider/dev/check-deals.mjs
//
// 1. Three lists (one, two and four suits), each of distinct 32-bit seeds in base 36.
// 2. A sample of every list (the first five and five spread over the rest) is solved again within deals.mjs's
//    budget, and the solver's path wins when the rules play it (check-rules.mjs pins the shuffle itself).
// Exit code 0 when everything holds, 1 otherwise.
import * as R from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";
import { DEALS } from "../package/js/deals.js";

const BUDGET = {
  1: { ms: 20000, maxNodes: 200000 },
  2: { ms: 40000, maxNodes: 400000 },
  4: { ms: 60000, maxNodes: 600000 },
};
const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};

for (const suits of R.SUITS) {
  const text = DEALS[suits];
  check(typeof text === "string" && text.trim(), `DEALS[${suits}] is empty`);
  const seeds = (text || "")
    .trim()
    .split(/\s+/)
    .map((w) => parseInt(w, 36));
  check(new Set(seeds).size === seeds.length, `DEALS[${suits}] has a seed twice`);
  for (const sd of seeds) check(Number.isInteger(sd) && sd >= 0 && sd <= 4294967295, `DEALS[${suits}]: bad seed ${sd}`);
  const sample = [...seeds.slice(0, 5), ...[1, 2, 3, 4, 5].map((i) => seeds[Math.floor((i * seeds.length) / 6)])];
  for (const sd of sample) {
    const start = R.deal(sd, suits);
    const r = solve(start, BUDGET[suits].ms, { maxNodes: BUDGET[suits].maxNodes });
    let ok = r.status === "win";
    if (ok) {
      const t = R.clone(start);
      for (const m of r.path) {
        if (m.deal ? !R.canDeal(t) : !R.canMove(t, m.src, m.dst)) {
          ok = false;
          break;
        }
        if (m.deal) R.dealRow(t);
        else R.move(t, m.src, m.dst);
      }
      ok = ok && R.isWon(t);
    }
    check(ok, `${suits} suit(s): deal ${sd.toString(36)} is not won again (${r.status})`);
  }
  console.log(`${suits} suit(s): ${seeds.length} deals, a sample of ${sample.length} won again`);
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("deals ok");
