// Checks the game's texts (Node 22): English and Slovak have the same keys, the same {placeholders} and the plural
// forms each language needs; every text the page names (data-t, data-t-label, t("…") and tn("…") in the code)
// exists, and every text exists for a reason; How to play starts with its 15-second version; the app's name stays
// Hidden Word. The manifest's own texts (install purposes) are checked the same way.
// Run: node dev/check-i18n.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STRINGS } from "../package/js/game/strings.mjs";

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
  } else {
    for (const [lang, forms] of [
      ["en", a],
      ["sk", b],
    ]) {
      for (const need of NEEDS[lang]) if (!(need in forms)) problems.push(`"${key}" (${lang}) lacks the ${need} form`);
      for (const [form, text] of Object.entries(forms)) {
        if (!text.includes("#") && !(form === "one" && /(^|\s)(one|prvý|jeden|jednou)(\s|$)/i.test(text))) {
          problems.push(`"${key}" (${lang}, ${form}) does not show the number`);
        }
      }
    }
  }
}
if (en.appName !== "Hidden Word" || sk.appName !== "Hidden Word") problems.push("the app's name must stay Hidden Word");
for (const key of ["shareHead"]) {
  if (!en[key].startsWith("Hidden Word") || !sk[key].startsWith("Hidden Word")) {
    problems.push(`"${key}" must name the game as Hidden Word in both languages`);
  }
}

// How to play starts with the short version (goal, the marks, using them, the hint, one tip), then the details.
const helpOrder = Array.from(html.matchAll(/data-t="(tldr\w*|helpDetails|helpMarks)"/g), (m) => m[1]);
if (helpOrder.join(" ") !== "tldrTitle tldr1 tldr2 tldr3 tldr4 tldr5 helpDetails helpMarks") {
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
      // Keys picked by a condition, t(x ? "a" : "b"): counted when they are texts.
      for (const m of code.matchAll(/\? "(\w+)" : "(\w+)"/g)) {
        for (const k of [m[1], m[2]]) if (k in en) used.add(k);
      }
    }
  }
}
walk(join(pkg, "js"));
for (const key of used) if (!(key in en)) problems.push(`the page uses "${key}", which has no text`);
const unused = Object.keys(en).filter((k) => !used.has(k));
if (unused.length) problems.push(`texts no code names: ${unused.join(", ")}`);

// The manifest's texts: both languages, and an install purpose of 10 to 140 characters.
const manifest = JSON.parse(readFileSync(join(pkg, "manifest.json"), "utf8"));
for (const [key, value] of Object.entries(manifest.i18n.strings)) {
  for (const lang of ["en", "sk"]) {
    const text = value[lang];
    if (!text) problems.push(`manifest text "${key}" has no ${lang}`);
    else if (text.length < 10 || text.length > 140)
      problems.push(`manifest text "${key}" (${lang}) is ${text.length} long`);
  }
}

console.log(`${Object.keys(en).length} texts in English and Slovak, ${used.size} used by the page`);
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else console.log("all checks passed");
