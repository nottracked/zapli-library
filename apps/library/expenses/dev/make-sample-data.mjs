// Prints the listing's sampleData: the browser preview's made-up household, dated up to 3 November 2026 and cut to
// the listing's 50 records an entity, without the store's system fields.
// Run from the repository root: node apps/library/expenses/dev/make-sample-data.mjs

import { sampleData } from "../package/js/sample.mjs";

const data = sampleData("2026-11-03", { days: 64, maxEntries: 50 });
const SYSTEM = new Set(["createdAt", "updatedAt", "_version"]);
const out = {};
for (const [entity, records] of Object.entries(data)) {
  if (!records.length) continue;
  out[entity] = records.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SYSTEM.has(k))));
}
console.log(JSON.stringify(out, null, 2));
