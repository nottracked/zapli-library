// Checks the game's texts (Node 22): English and Slovak have the same keys, the same {placeholders} and the plural
// forms each language needs, and every text the page names (data-t, data-t-label, t("…") and tn("…") in the code)
// exists. Run: node dev/check-i18n.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STRINGS } from "../package/js/wheel/strings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const problems = [];
const holes = (text) =>
  Array.from(String(text).matchAll(/\{(\w+)\}/g), (m) => m[1])
    .sort()
    .join(",");
const NEEDS = { en: ["one", "other"], sk: ["one", "few", "other"] };

const html = readFileSync(join(pkg, "index.html"), "utf8");
const en = STRINGS.en;
const sk = STRINGS.sk;
for (const key of new Set([...Object.keys(en), ...Object.keys(sk)])) {
  if (!(key in en)) problems.push(`"${key}" is only in Slovak`);
  if (!(key in sk)) problems.push(`"${key}" has no Slovak text`);
  if (!(key in en) || !(key in sk)) continue;
  const a = en[key];
  const b = sk[key];
  if (typeof a !== typeof b) problems.push(`"${key}" is a ${typeof a} in English and a ${typeof b} in Slovak`);
  else if (typeof a === "string") {
    if (holes(a) !== holes(b)) problems.push(`"${key}" has placeholders {${holes(a)}} and {${holes(b)}}`);
    if (!b.trim()) problems.push(`"${key}" is empty in Slovak`);
  } else if (key !== "langNames") {
    for (const [lang, forms] of [
      ["en", a],
      ["sk", b],
    ]) {
      for (const need of NEEDS[lang]) if (!(need in forms)) problems.push(`"${key}" (${lang}) lacks the ${need} form`);
      for (const [form, text] of Object.entries(forms)) {
        if (!text.includes("#")) problems.push(`"${key}" (${lang}, ${form}) does not show the number`);
      }
    }
  }
}
if (en.appName !== "Word Wheel" || sk.appName !== "Word Wheel") problems.push("the app's name must stay Word Wheel");

// How to play starts with the short version (goal, swipe, crossword, jar, one tip), then the details; the first
// wheel shows a one-line instruction until the first word.
const tldr = ["tldrTitle", "tldr1", "tldr2", "tldr3", "tldr4", "tldr5", "helpDetails", "currentEmpty"];
for (const key of tldr) if (!en[key] || !sk[key]) problems.push(`the short help needs "${key}" in both languages`);
const helpOrder = Array.from(html.matchAll(/data-t="(tldr\w*|helpDetails|helpGoal)"/g), (m) => m[1]);
if (helpOrder.join(" ") !== "tldrTitle tldr1 tldr2 tldr3 tldr4 tldr5 helpDetails helpGoal") {
  problems.push(`How to play must start with the short version, then the details: ${helpOrder.join(" ")}`);
}

// Keys the page and the code use.
const used = new Set();
for (const m of html.matchAll(/data-t(?:-label)?="(\w+)"/g)) used.add(m[1]);
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".mjs")) {
      const code = readFileSync(path, "utf8");
      for (const m of code.matchAll(/\btn?\(\s*"(\w+)"/g)) used.add(m[1]);
    }
  }
}
walk(join(pkg, "js"));
for (const key of used) if (!(key in en)) problems.push(`the page uses "${key}", which has no text`);
const unused = Object.keys(en).filter((k) => !used.has(k) && k !== "langNames");
if (unused.length) console.log(`texts no code names directly (check they are meant): ${unused.join(", ")}`);

console.log(`${Object.keys(en).length} texts in English and Slovak, ${used.size} used by the page`);
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else console.log("all checks passed");
