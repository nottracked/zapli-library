// Checks the words' short meanings (package/data/meanings-<lang>.txt) against the word lists, without a browser
// (Node 22):
//  - every word a wheel may ask for has a meaning, in both languages, and so does every accepted Slovak word;
//  - every word with a meaning is in its word list, once;
//  - each line has its fields (English: meaning and Slovak translation; Slovak: meaning), none empty, within their
//    lengths, with no straight double quote, and no Czech letter in Slovak text;
//  - the page's reader reads every line.
// Run: node dev/check-meanings.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseWordList } from "../package/js/core/wordlist.mjs";
import { parseMeanings } from "../package/js/core/meanings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, "..", "package", "data");
const problems = [];
const MAX_MEANING = 80;
const MAX_TRANSLATION = 40;

for (const lang of ["en", "sk"]) {
  const lists = parseWordList(readFileSync(join(data, `words-${lang}.txt`), "utf8"));
  const text = readFileSync(join(data, `meanings-${lang}.txt`), "utf8");
  const inList = new Set([...lists.answers, ...lists.accepted]);
  const seen = new Set();
  let lines = 0;
  text.split("\n").forEach((line, i) => {
    if (!line || line.startsWith("#")) return;
    lines++;
    const at = `meanings-${lang}.txt line ${i + 1}`;
    const parts = line.split("\t");
    const want = lang === "en" ? 3 : 2;
    if (parts.length !== want) {
      problems.push(`${at}: ${parts.length} fields, expected ${want}`);
      return;
    }
    const [word, meaning, sk] = parts;
    if (seen.has(word)) problems.push(`${at}: ${word} has a meaning twice`);
    seen.add(word);
    if (!inList.has(word)) problems.push(`${at}: ${word} is not in words-${lang}.txt`);
    const texts = lang === "en" ? [meaning, sk] : [meaning];
    texts.forEach((x, k) => {
      const max = k === 0 ? MAX_MEANING : MAX_TRANSLATION;
      if (!x || x !== x.trim()) problems.push(`${at}: empty field or spaces at an end`);
      else if (x.length > max) problems.push(`${at}: ${x.length} characters (at most ${max})`);
      if (x.includes('"')) problems.push(`${at}: straight double quote`);
    });
    const slovak = lang === "en" ? sk : meaning;
    if (/[řůěŘŮĚ]/.test(slovak)) problems.push(`${at}: Czech letter in Slovak text`);
  });
  const needed = lang === "sk" ? [...lists.answers, ...lists.accepted] : lists.answers;
  const missing = needed.filter((w) => !seen.has(w));
  if (missing.length)
    problems.push(`${lang}: ${missing.length} words have no meaning: ${missing.slice(0, 20).join(", ")}`);
  const read = parseMeanings(text);
  if (read.size !== lines) problems.push(`${lang}: the page reads ${read.size} of ${lines} lines`);
  console.log(`${lang}: ${lines} meanings for ${needed.length} words that need one (${text.length} characters)`);
}

if (problems.length) {
  console.error(`${problems.length} problems:`);
  for (const p of problems.slice(0, 60)) console.error(`  ${p}`);
  process.exitCode = 1;
} else console.log("all checks passed");
