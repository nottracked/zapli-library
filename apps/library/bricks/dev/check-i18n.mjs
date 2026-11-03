// Checks the English and Slovak texts without a browser (Node 22):
//  - both languages have exactly the same keys, none empty;
//  - plurals have the forms each language needs (English one and other; Slovak one, few, many and other), each with
//    its "#";
//  - every {placeholder} of an English text is in the Slovak one, and the other way round;
//  - every key the page and the code use exists: data-t and data-t-label in index.html, t("…") and tn("…") in the
//    modules, and the keys made from names (power_…, powerAbout_…, world_…, worldAbout_…, brick_…);
//  - every level has a name in both languages;
//  - the game's name is never translated.
// Run: node dev/check-i18n.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STRINGS } from "../package/js/ui/strings.mjs";
import { POWERS } from "../package/js/game/game.mjs";
import { WORLDS, LEVELS } from "../package/js/game/levels.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const problems = [];
const { en, sk } = STRINGS;

const FORMS = { en: ["one", "other"], sk: ["one", "few", "many", "other"] };
const holes = (text) =>
  Array.from(String(text).matchAll(/\{(\w+)\}/g), (m) => m[1])
    .sort()
    .join(",");

for (const [lang, table] of Object.entries({ en, sk })) {
  const other = lang === "en" ? sk : en;
  for (const [key, value] of Object.entries(table)) {
    if (!(key in other)) problems.push(`${lang} has "${key}", the other language does not`);
    if (typeof value === "object") {
      const forms = Object.keys(value).sort().join(",");
      if (forms !== FORMS[lang].slice().sort().join(",")) problems.push(`${lang}.${key}: plural forms ${forms}`);
      for (const [form, text] of Object.entries(value)) {
        if (!text.includes("#")) problems.push(`${lang}.${key}.${form} has no "#"`);
      }
    } else if (!String(value).trim()) problems.push(`${lang}.${key} is empty`);
  }
}
for (const key of Object.keys(en)) {
  if (!(key in sk)) continue;
  const a = typeof en[key] === "object" ? en[key].other : en[key];
  const b = typeof sk[key] === "object" ? sk[key].other : sk[key];
  if (holes(a) !== holes(b)) problems.push(`"${key}": placeholders {${holes(a)}} in English, {${holes(b)}} in Slovak`);
}
if (en.appName !== "Bricks" || sk.appName !== "Bricks") problems.push("the game's name is translated");

// Keys the page and the code use.
const used = new Set();
const html = readFileSync(join(pkg, "index.html"), "utf8");
for (const m of html.matchAll(/data-t(?:-label)?="([^"]+)"/g)) used.add(m[1]);
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".mjs")) {
      const code = readFileSync(path, "utf8");
      for (const m of code.matchAll(/\btn?\(\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
      // Keys picked in a condition: t(cleared ? "dayCleared" : "dayNone").
      for (const m of code.matchAll(/[?:]\s*"([A-Za-z0-9_]+)"/g)) if (m[1] in en) used.add(m[1]);
      for (const m of code.matchAll(/\[\s*"(st[A-Z]\w+|resultScore|resultBest|waveReached|brick_\w+)"/g))
        used.add(m[1]);
    }
  }
};
walk(join(pkg, "js"));
for (const p of POWERS) used.add(`power_${p}`).add(`powerAbout_${p}`);
for (const w of WORLDS) used.add(`world_${w.key}`).add(`worldAbout_${w.key}`);
for (const k of used) if (!(k in en)) problems.push(`the code uses "${k}", which the texts do not have`);
for (const k of Object.keys(en)) if (!used.has(k)) problems.push(`"${k}" is in the texts, but nothing uses it`);

for (const l of LEVELS) {
  if (!l.name || !String(l.name.en || "").trim() || !String(l.name.sk || "").trim())
    problems.push(`level ${l.id}: a name is missing`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`texts: ok (${Object.keys(en).length} keys in each language, ${used.size} used by the page and code)`);
