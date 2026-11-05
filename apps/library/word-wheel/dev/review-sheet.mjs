// Writes a review sheet of the Slovak list for a native speaker, as Markdown: every word a daily wheel asks for in
// the first days (with the wheel's letters and date, as the game makes them), the extra words those wheels accept,
// and a random sample of the accepted tier, numbered, each with a box to tick.
//
//   node dev/review-sheet.mjs <output.md> [days] [sample] [seed]     (defaults: 30 days, 300 words, seed "review")

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseWordList } from "../package/js/core/wordlist.mjs";
import { addDays, FIRST_DAY } from "../package/js/core/dates.mjs";
import { tiles, display } from "../package/js/core/letters.mjs";
import { rngFor, shuffled } from "../package/js/core/rng.mjs";
import { buildIndex, dailyPuzzle } from "../package/js/wheel/generator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [out, daysArg, sampleArg, seed = "review"] = process.argv.slice(2);
if (!out) throw new Error("say where to write the sheet: node dev/review-sheet.mjs <output.md>");
const DAYS = Number(daysArg || 30);
const SAMPLE = Number(sampleArg || 300);

const text = readFileSync(join(here, "..", "package", "data", "words-sk.txt"), "utf8");
const lists = parseWordList(text);
const index = buildIndex("sk", lists);
const lines = [];
lines.push("# Word Wheel: Slovak word list review");
lines.push("");
lines.push(
  `The list has ${lists.answers.length} answer words and ${lists.accepted.length} more accepted words ` +
    `(3 to 7 letters, CH counted as one letter). Tick a box when a word is wrong, misspelled, not a base form, ` +
    `too rare for a puzzle, or not a word a Slovak player would expect, and add a note after it.`,
);
lines.push("");
lines.push(`## Part 1: the answer words of the first ${DAYS} daily wheels`);
lines.push("");
lines.push("Each wheel shows its letters as the game shows them, then the words its crossword asks for.");
lines.push("The extra words that wheel also accepts are listed after them.");
lines.push("");
let n = 0;
const askedWords = new Set();
for (let d = 0; d < DAYS; d++) {
  const day = addDays(FIRST_DAY, d);
  const p = dailyPuzzle(index, day);
  lines.push(`### ${day}: ${p.letters.map(display).join(" ")}`);
  lines.push("");
  for (const w of p.words) {
    n++;
    askedWords.add(w.w);
    lines.push(`- [ ] ${n}. ${w.w}`);
  }
  if (p.extra.length) lines.push(`- extra words: ${p.extra.join(", ")}`);
  lines.push("");
}
lines.push(`${n} answer words in ${DAYS} wheels (${askedWords.size} different).`);
lines.push("");
lines.push(`## Part 2: a random sample of ${SAMPLE} accepted words`);
lines.push("");
lines.push(`Drawn with the seed "${seed}" from the accepted tier (words the game accepts but never asks for).`);
lines.push("");
const sample = shuffled(lists.accepted, rngFor(`sample|${seed}`)).slice(0, SAMPLE);
sample.forEach((w, i) => {
  lines.push(`- [ ] ${i + 1}. ${w}${tiles(w, "sk").includes("ch") ? " (CH)" : ""}`);
});
lines.push("");
writeFileSync(out, `${lines.join("\n")}`);
console.log(`wrote ${out}: ${n} answer words of ${DAYS} daily wheels and ${sample.length} accepted words`);
