// Development only (not shipped): finds deals the solver wins, for "Winnable" games and the daily deal, and writes
// them into ../package/js/deals.js.
//
//   node apps/library/spider/dev/deals.mjs [--write] [--workers 3] [--one 300] [--two 250] [--four 150]
//
// Seeds are tried in a fixed order (seed n = n × 2654435761 mod 2^32) for each number of suits, each with the
// budget below, and each list keeps the first seeds the solver wins, so the output is the same on every run (on
// the same rules and solver). A deal the solver cannot win in its budget may still be winnable; it is just not
// listed. Then run check-deals.mjs.
import { writeFileSync } from "node:fs";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { deal } from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";

// The same budget as check-deals.mjs uses to win a sample again.
const BUDGET = {
  1: { ms: 20000, maxNodes: 200000 },
  2: { ms: 40000, maxNodes: 400000 },
  4: { ms: 60000, maxNodes: 600000 },
};
const seedOf = (n) => Math.imul(n, 2654435761) >>> 0;

if (!isMainThread) {
  parentPort.on("message", ({ n, suits }) => {
    const r = solve(deal(seedOf(n), suits), BUDGET[suits].ms, { maxNodes: BUDGET[suits].maxNodes });
    parentPort.postMessage({ n, won: r.status === "win" });
  });
} else {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : dflt;
  };
  const want = { 1: arg("one", 300), 2: arg("two", 250), 4: arg("four", 150) };
  const workers = Array.from({ length: arg("workers", 3) }, () => new Worker(new URL(import.meta.url)));
  const lists = {};
  const t0 = Date.now();
  for (const suits of [1, 2, 4]) {
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
        if (wins().length >= want[suits]) {
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
        w.postMessage({ n, suits });
      };
      workers.forEach(feed);
    });
    const tried = [...results.keys()].length;
    lists[suits] = wins().slice(0, want[suits]).map(seedOf);
    console.log(
      `${suits} suit(s): ${lists[suits].length} winnable of the first ${tried} tried (${Date.now() - t0} ms)`,
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
      return lines.map((l) => `    "${l} "`).join(" +\n");
    };
    const text =
      '// Deals the solver won, for "Winnable" games and the daily deal: seeds of deal() in base 36, by the number of\n' +
      "// suits. Written by dev/deals.mjs and checked by dev/check-deals.mjs; do not edit by hand.\n" +
      "export const DEALS = {\n" +
      [1, 2, 4].map((n) => `  ${n}:\n${wrap(lists[n])},`).join("\n") +
      "\n};\n";
    writeFileSync(new URL("../package/js/deals.js", import.meta.url), text);
    console.log("wrote package/js/deals.js");
  }
}
