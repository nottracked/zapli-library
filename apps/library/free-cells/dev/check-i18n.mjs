// Development only (not shipped): checks that every text the game shows has English and Slovak words.
//
//   node apps/library/free-cells/dev/check-i18n.mjs
//
// 1. English and Slovak have the same keys, of the same kind (text, list, plural forms or a function).
// 2. Plural forms: English has one and other, Slovak one, few and other; each has its "#".
// 3. Every key the page names (data-t, data-t-label, data-t-keys in index.html) and every key the scripts ask for
//    (t("…") and tn("…") in js/) exists; tn() keys are plural forms.
// 4. Every function gives a text for the arguments the scripts pass, in both languages.
// 5. The app's name is the same in both languages.
// Exit code 0 when everything holds, 1 otherwise.
import { readFileSync, readdirSync } from "node:fs";

globalThis.window = {};
globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
const { STRINGS } = await import("../package/js/i18n.js");

const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};
// An object with "other" holds plural forms; any other object is a small table (by number of suits, say).
const kind = (v) => {
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return "list";
  if (typeof v === "object") return "other" in v ? "plural" : "table";
  return "text";
};

const en = STRINGS.en;
const sk = STRINGS.sk;
for (const k of new Set([...Object.keys(en), ...Object.keys(sk)])) {
  check(k in en, `"${k}" has no English words`);
  check(k in sk, `"${k}" has no Slovak words`);
  if (k in en && k in sk) {
    check(kind(en[k]) === kind(sk[k]), `"${k}" is a ${kind(en[k])} in English, ${kind(sk[k])} in Slovak`);
    if (kind(en[k]) === "table")
      check(Object.keys(en[k]).join() === Object.keys(sk[k]).join(), `"${k}" has the same entries in both`);
  }
}
for (const [k, v] of Object.entries(en))
  if (kind(v) === "plural")
    check(v.one && v.other && v.one.includes("#") && v.other.includes("#"), `English plural "${k}"`);
for (const [k, v] of Object.entries(sk))
  if (kind(v) === "plural")
    check(v.one && v.few && v.other && [v.one, v.few, v.other].every((f) => f.includes("#")), `Slovak plural "${k}"`);
check(en.appName === sk.appName, "the app's name is the same in both languages");

const pkg = new URL("../package/", import.meta.url);
const html = readFileSync(new URL("index.html", pkg), "utf8");
for (const m of html.matchAll(/data-t(?:-label|-keys|-rich)?="([^"]+)"/g))
  check(m[1] in en, `index.html names "${m[1]}"`);

// The guide's short start: the goal, each rule the page shows and the tip, short, with balanced *key words*; the
// first start's line names the game.
const rules = [...html.matchAll(/data-t-rich="(tldr\d)"/g)].map((m) => m[1]);
check(rules.length >= 3 && rules.length <= 5, `the short start has ${rules.length} rules`);
for (const lang of [en, sk])
  for (const k of [
    "tldrTitle",
    "goalLabel",
    "tipLabel",
    "moreRules",
    "tldrGoal",
    "tldrTip",
    "tldrTip2",
    "turnTip",
    "sidewaysNote",
    ...rules,
  ]) {
    const v = lang[k];
    check(typeof v === "string" && v.length > 0 && v.length <= 110, `"${k}" is one short line (${v && v.length})`);
    check(typeof v === "string" && (v.match(/\*/g) || []).length % 2 === 0, `"${k}" has balanced key words`);
  }
for (const lang of [en, sk])
  check(String(lang.firstHelp).includes(en.appName), "the first start's line names the game");

const js = readdirSync(new URL("js/", pkg)).filter((f) => f.endsWith(".js"));
const uses = new Map();
for (const f of js) {
  const text = readFileSync(new URL(`js/${f}`, pkg), "utf8");
  for (const m of text.matchAll(/\bt\("([^"]+)"(?:,\s*(\{[^)]*\}))?\)/g)) uses.set(m[1], m[2] || "");
  for (const m of text.matchAll(/\btn\("([^"]+)"/g)) check(kind(en[m[1]]) === "plural", `tn("${m[1]}") is no plural`);
  for (const m of text.matchAll(/t\(`([a-z]+)_\$\{/g)) uses.set(`${m[1]}_*`, "");
}
for (const k of uses.keys()) {
  if (k.endsWith("_*")) {
    const prefix = k.slice(0, -1);
    check(
      Object.keys(en).some((x) => x.startsWith(prefix)),
      `keys "${prefix}…"`,
    );
    continue;
  }
  check(k in en, `the scripts ask for "${k}"`);
}

// Functions get every argument name the scripts could pass, with sample values.
const sample = new Proxy(
  {},
  {
    get: (_, p) =>
      p === "s"
        ? 1
        : p === "r"
          ? 12
          : p === "won" || p === "today"
            ? true
            : p === "i" || p === "n"
              ? 3
              : `«${String(p)}»`,
  },
);
for (const lang of [en, sk])
  for (const [k, v] of Object.entries(lang))
    if (typeof v === "function") {
      let out = "";
      try {
        out = v(sample);
      } catch (e) {
        out = "";
      }
      check(typeof out === "string" && out.length > 0 && !out.includes("undefined"), `"${k}" gives a text`);
    }

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n ok: ${Object.keys(en).length} keys in English and Slovak, a short start of ${rules.length} rules`);
