// Prints the listing's sampleData: the made-up English notes and labels of the browser preview, with times counted
// back from 3 November 2026 at noon, in the shape the store keeps (no system fields, no photos).
// Run from the repository root: node apps/library/notes/dev/make-sample-data.mjs

import { sampleData } from "../package/js/sample.mjs";

const data = sampleData(new Date(2026, 10, 3, 12, 0), "en");
const note = data.note.map((n) => {
  const out = { ...n };
  delete out.createdAt;
  delete out.updatedAt;
  for (const [k, v] of Object.entries(out)) if (v === "" || v === undefined) delete out[k];
  return out;
});
console.log(JSON.stringify({ note, label: data.label }, null, 2));
