// Development only (not shipped): finds deals for "Winnable" games and writes them into ../index.html.
//
//   node apps/library/solitaire/dev/deals.mjs [--write] [--workers 4] [--easy 300] [--medium 250] [--hard 150]
//
// Seeds are tried in a fixed order (seed n = n × 2654435761 mod 2^32), graded by solver.mjs with the game's own rules,
// and each list keeps the first seeds of its grade, so the output is the same on every run. Without --write it prints
// the counts only. Then run check-deals.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { loadRules, makeSolver } from "./solver.mjs";

const seedOf = (n) => Math.imul(n, 2654435761) >>> 0;

if (!isMainThread) {
  const solver = makeSolver(loadRules());
  parentPort.on("message", ({ n, draw, search }) => {
    const seed = seedOf(n);
    let grade = solver.greedy(seed, draw) ? "e" : null;
    if (!grade && search) grade = solver.grade(seed, draw);
    parentPort.postMessage({ n, grade, searched: search });
  });
} else {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : dflt;
  };
  const want = { e: arg("easy", 300), m: arg("medium", 250), h: arg("hard", 150) };
  const workers = Array.from({ length: arg("workers", 4) }, () => new Worker(new URL(import.meta.url), {}));
  const out = {};
  const t0 = Date.now();
  for (const draw of [1, 3]) {
    const grades = new Map(); // n -> grade (or "skip" when it was not searched)
    const firstN = (g, below) => {
      let c = 0;
      for (let n = 1; n < below; n++) if (grades.get(n) === g) c += 1;
      return c;
    };
    // Lists are complete once every seed below some n is graded and each list has its count among them.
    const done = () => {
      let complete = 0;
      while (grades.has(complete + 1)) complete += 1;
      const have = { e: 0, m: 0, h: 0 };
      for (let n = 1; n <= complete; n++) {
        const g = grades.get(n);
        if (g in have) have[g] += 1;
      }
      return { complete, have, ok: have.e >= want.e && have.m >= want.m && have.h >= want.h };
    };
    let next = 1;
    await new Promise((resolve) => {
      let busy = 0;
      const feed = (w) => {
        const st = done();
        if (st.ok) {
          if (!busy) resolve();
          return;
        }
        const n = next++;
        // Searching is slow; it is skipped once the medium and hard lists are full below this seed.
        const search = firstN("m", n) < want.m || firstN("h", n) < want.h;
        busy += 1;
        w.postMessage({ n, draw, search });
      };
      for (const w of workers) {
        w.removeAllListeners("message");
        w.on("message", ({ n, grade, searched }) => {
          busy -= 1;
          grades.set(n, grade || (searched ? "x" : "skip"));
          if (n % 200 === 0) {
            const st = done();
            console.error(
              `draw ${draw}: ${n} tried, ${JSON.stringify(st.have)}, ${Math.round((Date.now() - t0) / 1000)} s`,
            );
          }
          feed(w);
        });
        feed(w);
      }
    });
    const lists = { e: [], m: [], h: [] };
    const ns = [...grades.keys()].sort((a, b) => a - b);
    for (const n of ns) {
      const g = grades.get(n);
      if (g in lists && lists[g].length < want[g]) lists[g].push(seedOf(n).toString(36));
    }
    for (const g of ["e", "m", "h"]) out[`${g}${draw}`] = lists[g];
    console.error(`draw ${draw}: done after ${ns.length} seeds, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  for (const w of workers) await w.terminate();
  for (const [k, v] of Object.entries(out)) console.log(`${k}: ${v.length} deals`);

  const outFile = process.argv.indexOf("--out");
  if (process.argv.includes("--write") || outFile > 0) {
    const file = new URL("../index.html", import.meta.url);
    const html = readFileSync(file, "utf8");
    const start = "// ---- deals: start";
    const end = "// ---- deals: end";
    const a = html.indexOf(start);
    const b = html.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error("deals markers not found in index.html");
    const indent = " ".repeat(16);
    const body = [
      "",
      `${indent}// Deals for "Winnable" games, graded offline by dev/deals.mjs with these rules (seeds of Rules.deal in`,
      `${indent}// base 36): e easy (the game's own hints win), m medium, h hard; 1 and 3 cards turned from the stock.`,
      `${indent}// Every one can be won with no limit on passes. dev/check-deals.mjs checks them.`,
      `${indent}const DEALS = {`,
      ...Object.entries(out).map(([k, v]) => `${indent}    ${k}: "${v.join(" ")}",`),
      `${indent}};`,
      indent,
    ].join("\n");
    // --out <file> writes only the block (to paste between the markers); --write updates index.html.
    if (outFile > 0) writeFileSync(process.argv[outFile + 1], body);
    else writeFileSync(file, html.slice(0, a + start.length) + body + html.slice(b));
    console.log(outFile > 0 ? `written to ${process.argv[outFile + 1]}` : "written to index.html");
  }
}
