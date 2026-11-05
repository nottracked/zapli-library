// Development only (not shipped): checks the deal lists in ../package/js/deals.js.
//
//   node apps/library/patience/dev/check-deals.mjs
//
// Every list has 500 different seeds; ten seeds spread over each list are won again by the solver with the budget
// deals.mjs used, and each winning path replays to a win with the rules. Exit code 0 when everything holds.
import { DEALS } from "../package/js/deals.js";
import { deal, clone, canMove, apply, isWon } from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";
import { BUDGET, LISTS } from "./deals.mjs";

const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};
let won = 0;
for (const [game, variant, opts] of LISTS) {
  const words = ((DEALS[game] && DEALS[game][variant]) || "").trim().split(/\s+/).filter(Boolean);
  check(words.length === 500, `${game} ${variant}: 500 deals (${words.length})`);
  check(new Set(words).size === words.length, `${game} ${variant}: no deal twice`);
  for (let k = 0; k < 10; k++) {
    const seed = parseInt(words[Math.floor((k * words.length) / 10)], 36) >>> 0;
    const s = deal(game, seed, opts);
    const r = solve(s, BUDGET.ms, { maxNodes: BUDGET.maxNodes });
    check(r.status === "win", `${game} ${variant}: seed ${seed} is won again (${r.status})`);
    if (r.status !== "win") continue;
    const t = clone(s);
    let ok = true;
    for (const m of r.path) {
      if (!canMove(t, m)) {
        ok = false;
        break;
      }
      apply(t, m);
    }
    check(ok && isWon(t), `${game} ${variant}: seed ${seed}'s path replays to a win`);
    won += 1;
  }
}
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log(`deals ok: ${LISTS.length} lists of 500, ${won} sample deals won again and replayed`);
