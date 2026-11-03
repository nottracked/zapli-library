// Writes a review sheet of the Slovak themes and hidden messages for a native speaker (Node 22), in Markdown: every
// theme with its words, numbered to tick, then every message. Words the library's Slovak word list
// (apps/library/word-wheel/dev/sk/, written for Word Wheel) does not have are marked with an asterisk: they are not
// wrong for that, but they are the first to check for spelling.
// Run: node dev/review-sheet.mjs <file.md>
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEMES, MESSAGES } from "../package/js/data/themes-sk.mjs";
import { THEMES as EN } from "../package/js/data/themes-en.mjs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node dev/review-sheet.mjs <file.md>");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const listDir = join(here, "..", "..", "word-wheel", "dev", "sk");
const known = new Set();
if (existsSync(listDir)) {
  for (const name of readdirSync(listDir)) {
    if (!name.endsWith(".txt")) continue;
    for (const line of readFileSync(join(listDir, name), "utf8").split(/\r?\n/)) {
      if (line.startsWith("#")) continue;
      for (const w of line.split(/\s+/)) if (w) known.add(w.normalize("NFC"));
    }
  }
}

const lines = [
  "# Word Search: the Slovak themes and hidden messages",
  "",
  "Tick each word that is a common Slovak noun in its base form, spelled right, and fits its theme.",
  known.size ? "An asterisk marks a word the library's Slovak word list does not have: check those first." : "",
  "",
];
let n = 0;
let marked = 0;
THEMES.forEach((theme, i) => {
  lines.push(`## ${theme.name} (${EN[i].name})`, "");
  for (const w of theme.words.split(/\s+/).filter(Boolean)) {
    const star = known.size && !known.has(w) ? " \\*" : "";
    if (star) marked++;
    lines.push(`${++n}. [ ] ${w}${star}`);
  }
  lines.push("");
});
lines.push("## Tajničky", "");
for (const m of MESSAGES) lines.push(`${++n}. [ ] ${m}`);
lines.push("");
writeFileSync(out, lines.join("\n"));
console.log(`wrote ${out}: ${n} lines to tick, ${marked} words marked to check first`);
