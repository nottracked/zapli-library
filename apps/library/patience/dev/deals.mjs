// Development only (not shipped): finds deals the solver wins, for "Winnable" games and the daily deals, and writes
// them into ../package/js/deals.js: one list per game and set of rules.
//
//   node apps/library/patience/dev/deals.mjs [--write] [--workers 3] [--count 500]
//
// Seeds are tried in a fixed order (seed n = n × 2654435761 mod 2^32) for each list, each with the budget below, and
// each list keeps the first seeds the solver wins, so the output is the same on every run (on the same rules and
// solver). The solver is exact when it finishes; a deal it cannot settle within the budget is left out. Then run
// check-deals.mjs.
import { writeFileSync } from "node:fs";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { deal } from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";

// The same budget as check-deals.mjs uses to win a sample again.
export const BUDGET = { ms: 60000, maxNodes: 3000000 };
export const LISTS = [
  ["pyramid", "p3", { passes: 3 }],
  ["pyramid", "p1", { passes: 1 }],
  ["pyramid", "p0", { passes: 0 }],
  ["golf", "none", { kings: "none" }],
  ["golf", "queen", { kings: "queen" }],
  ["golf", "wrap", { kings: "wrap" }],
  ["peaks", "wrap", { wrap: true }],
  ["peaks", "nowrap", { wrap: false }],
];
export const seedOf = (n) => Math.imul(n, 2654435761) >>> 0;

if (!isMainThread) {
  parentPort.on("message", ({ n, game, opts }) => {
    const r = solve(deal(game, seedOf(n), opts), BUDGET.ms, { maxNodes: BUDGET.maxNodes });
    parentPort.postMessage({ n, won: r.status === "win" });
  });
} else if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : dflt;
  };
  const want = arg("count", 500);
  const workers = Array.from({ length: arg("workers", 3) }, () => new Worker(new URL(import.meta.url)));
  const lists = {};
  const t0 = Date.now();
  for (const [game, variant, opts] of LISTS) {
    const results = new Map();
    let next = 1;
    // The list is complete once every seed below some n is tried and the wins among them reach the count.
    const wins = () => {
      const out = [];
      for (let n = 1; results.has(n); n++) if (results.get(n)) out.push(n);
      return out;
    };
    await new Promise((resolve) => {
      let busy = 0;
      const feed = (w) => {
        if (wins().length >= want) {
          if (!busy) resolve();
          return;
        }
        const n = next++;
        busy += 1;
        w.once("message", (msg) => {
          busy -= 1;
          results.set(msg.n, msg.won);
          feed(w);
        });
        w.postMessage({ n, game, opts });
      };
      workers.forEach(feed);
    });
    lists[game] = lists[game] || {};
    lists[game][variant] = wins().slice(0, want).map(seedOf);
    console.log(
      `${game} ${variant}: ${want} winnable of the first ${wins()[want - 1]} seeds tried (${Date.now() - t0} ms)`,
    );
  }
  workers.forEach((w) => w.terminate());
  if (process.argv.includes("--write")) {
    const wrap = (seeds) => {
      const words = seeds.map((s) => s.toString(36));
      const lines = [];
      let line = "";
      for (const w of words) {
        if (line.length + w.length + 1 > 100) {
          lines.push(line);
          line = "";
        }
        line += (line ? " " : "") + w;
      }
      if (line) lines.push(line);
      return lines.map((l) => `      "${l} "`).join(" +\n");
    };
    const text =
      '// Deals the solver won, for "Winnable" games and the daily deals: seeds of deal() in base 36, by game and set\n' +
      "// of rules. Written by dev/deals.mjs and checked by dev/check-deals.mjs; do not edit by hand.\n" +
      "export const DEALS = {\n" +
      Object.entries(lists)
        .map(
          ([game, byVariant]) =>
            `  ${game}: {\n` +
            Object.entries(byVariant)
              .map(([v, seeds]) => `    ${v}:\n${wrap(seeds)},`)
              .join("\n") +
            "\n  },",
        )
        .join("\n") +
      "\n};\n";
    writeFileSync(new URL("../package/js/deals.js", import.meta.url), text);
    console.log("wrote package/js/deals.js");
  }
}
