// Development only (not shipped): checks that the game's deals still are what deals.mjs graded.
//
//   node apps/library/solitaire/dev/check-deals.mjs
//
// 1. Rules.deal() is pinned: these seeds must still deal exactly these layouts. If the shuffle or the deal changes,
//    every seed in DEALS means another game, so the lists must be generated again (deals.mjs --write).
// 2. DEALS has six non-empty lists of distinct 32-bit seeds, no seed in two lists of the same draw.
// 3. A sample of every list is graded again: easy deals are won by the game's own hints, medium and hard deals by the
//    search within their budgets.
// Exit code 0 when everything holds, 1 otherwise.
import { loadDeals, loadRules, makeSolver, MEDIUM_NODES, HARD_NODES } from "./solver.mjs";

const Rules = loadRules();
const DEALS = loadDeals();
const solver = makeSolver(Rules);
const problems = [];

// The first six parts of Rules.encode(Rules.deal(seed, draw)): draw, moves, stock, waste, foundations, columns.
const PINNED = {
  "1:1": "1;0;MBklZvCRnJPFUTqSzcNuwaAg;;,,,;/Y,s/p,XG/i,KdL/I,rjDO/t,fWxEm/H,yohbeV/Q",
  "3:20261020": "3;0;iJUgYHARmFywohnCLQaVZrMN;;,,,;/z,s/I,kd/e,TKE/S,xBqj/u,DbpOX/f,PtclvW/G",
  "1:4294967295": "1;0;YXmdMEDgbScNHkqFVfZozjJu;;,,,;/h,B/L,tw/a,OWy/I,QPls/A,xTerv/n,URpKGC/i",
  "3:2654435761": "3;0;SAHwWluRgjvtsCUeVThqZMXc;;,,,;/d,P/r,oz/x,EID/B,NYpa/J,QfObk/i,nyKLGF/m",
};
for (const [k, want] of Object.entries(PINNED)) {
  const [draw, seed] = k.split(":").map(Number);
  const got = Rules.encode(Rules.deal(seed, draw, 0))
    .split(";")
    .slice(0, 6)
    .join(";");
  if (!want) console.log(`pin ${k}: ${got}`);
  else if (got !== want) problems.push(`Rules.deal(${seed}, ${draw}) changed: ${got}`);
}

const LISTS = ["e1", "m1", "h1", "e3", "m3", "h3"];
const seen = { 1: new Map(), 3: new Map() };
for (const name of LISTS) {
  const text = DEALS[name];
  if (typeof text !== "string" || !text.trim()) {
    problems.push(`DEALS.${name} is empty`);
    continue;
  }
  const seeds = text
    .trim()
    .split(/\s+/)
    .map((s) => parseInt(s, 36));
  const draw = Number(name[1]);
  for (const seed of seeds) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) problems.push(`DEALS.${name}: bad seed ${seed}`);
    if (seen[draw].has(seed)) problems.push(`seed ${seed} is in ${seen[draw].get(seed)} and ${name}`);
    seen[draw].set(seed, name);
  }
  // the first five and five spread over the rest
  const sample = [...seeds.slice(0, 5), ...[1, 2, 3, 4, 5].map((i) => seeds[Math.floor((i * seeds.length) / 6)])];
  for (const seed of sample) {
    const grade = name[0];
    if (grade === "e") {
      if (!solver.greedy(seed, draw)) problems.push(`${name}: ${seed} is not won by the hints`);
    } else {
      const r = solver.search(seed, draw, HARD_NODES);
      const ok = r.won && (grade === "m" ? r.nodes <= MEDIUM_NODES : r.nodes > MEDIUM_NODES);
      if (!ok) problems.push(`${name}: ${seed} graded ${r.won ? `${r.nodes} positions` : "not won"}`);
    }
  }
  console.log(`${name}: ${seeds.length} deals, sample of ${sample.length} checked`);
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("deals ok");
