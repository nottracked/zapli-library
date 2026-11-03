// Checks the game's rules and words without a browser (Node 22): the marks (letters guessed twice included), what
// the guesses tell, hard mode, the hint's place, the guess counts, the guess being typed (CH, accents, the caret),
// the word lists, a year of daily words in both languages and every length, practice words, and Slovak base forms.
// Run: node dev/check-game.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { score, knowledge, hardProblem, hintPlace, maxGuesses, isWin, LENGTHS } from "../package/js/game/rules.mjs";
import { createWords, dailyWord, practiceWord, baseForms } from "../package/js/game/words.mjs";
import { createDraft, tileOf, baseKey, VARIANTS } from "../package/js/game/draft.mjs";
import { tiles } from "../package/js/core/letters.mjs";
import { addDays } from "../package/js/core/dates.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const problems = [];
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    problems.push(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};
const check = (ok, what) => {
  if (!ok) problems.push(what);
};
const T = (w, lang = "en") => tiles(w, lang);

// ---- marks
eq(score(T("crane"), T("crane")), ["hit", "hit", "hit", "hit", "hit"], "the word itself");
eq(score(T("about"), T("crane")), ["near", "miss", "miss", "miss", "miss"], "a letter elsewhere");
// A letter guessed twice when the word has it once: one mark for the word, a dash for the other.
eq(score(T("eerie"), T("crane")), ["miss", "miss", "near", "miss", "hit"], "a letter twice, the word has it once");
eq(score(T("geese"), T("crane")), ["miss", "miss", "miss", "miss", "hit"], "the hit takes the only E");
eq(score(T("speed"), T("abide")), ["miss", "miss", "near", "miss", "near"], "two E guessed, one in the word");
eq(score(T("llama"), T("level")), ["hit", "near", "miss", "miss", "miss"], "two L, both in the word");
// Slovak: CH is one letter, an accented letter is its own letter.
eq(score(T("chlieb", "sk"), T("chlapec", "sk").slice(0, 5)), ["hit", "hit", "miss", "near", "miss"], "CH as a letter");
eq(score(T("kôň", "sk").concat(["a"]), T("koňa", "sk")), ["hit", "miss", "hit", "hit"], "Ô is not O");
check(isWin(["hit", "hit"]) && !isWin(["hit", "near"]) && !isWin([]), "a word is found only when every place is");

// ---- what the guesses tell
{
  const k = knowledge([T("about"), T("trace")], T("crane"), null);
  eq(k.places, [null, "r", "a", null, "e"], "places known");
  eq(
    [k.keys.get("a"), k.keys.get("b"), k.keys.get("c"), k.keys.get("t")],
    ["hit", "miss", "near", "miss"],
    "best marks",
  );
  eq([k.least.get("a"), k.least.get("c"), k.least.get("t")], [1, 1, undefined], "letters the word has for sure");
  const h = knowledge([], T("crane"), { pos: 4, tile: "e" });
  eq(h.places, [null, null, null, null, "e"], "the hint is a known place");
}

// ---- hard mode
{
  const ans = T("crane");
  const past = [T("trace")]; // R, A and E in their places, C elsewhere
  eq(hardProblem(T("cream"), past, ans, null), { kind: "place", pos: 2, tile: "a" }, "a found place must stay");
  eq(hardProblem(T("drape"), past, ans, null), { kind: "use", tile: "c", n: 1 }, "a found letter must be used");
  eq(hardProblem(T("brace"), past, ans, null), null, "a guess that keeps everything");
  eq(
    hardProblem(T("crake"), past, ans, { pos: 3, tile: "n" }),
    { kind: "place", pos: 3, tile: "n" },
    "the hint counts",
  );
}

// ---- the hint's place
eq(hintPlace([T("crate")], T("crane"), null), 3, "the first place not known");
eq(hintPlace([], T("crane"), null), 0, "with no guesses, the first place");
eq(hintPlace([T("crane")], T("crane"), null), -1, "nothing left to show");

// ---- guesses for each word
eq(
  LENGTHS.map((n) => ["tight", "standard", "relaxed", "free"].map((s) => maxGuesses(n, s))),
  [
    [4, 5, 7, 0],
    [5, 6, 8, 0],
    [6, 7, 9, 0],
    [7, 8, 10, 0],
  ],
  "the guess counts",
);

// ---- the guess being typed
{
  const d = createDraft(5, "sk");
  d.type("c");
  d.type("h");
  eq(d.places, ["ch", null, null, null, null], "C and H make CH");
  d.type("l");
  d.type("i");
  d.type("e");
  d.type("b");
  eq(d.tiles(), ["ch", "l", "i", "e", "b"], "chlieb is 5 letters");
  check(d.full && d.caret === 5, "a full word puts the caret past the end");
  check(!d.type("x"), "a full word takes no more letters");
  d.select(1);
  d.type("r");
  eq(d.places[1], "r", "a tapped place takes the next letter");
  d.select(2);
  d.back();
  eq(d.places[2], null, "Delete on a tapped letter takes that letter");
  eq(d.caret, 2, "and the caret stays there");
  d.back();
  eq(d.places, ["ch", null, null, "e", "b"], "the next Delete takes the letter before");
  d.type("o");
  d.replace(d.last, "ô");
  eq(d.places[1], "ô", "an accent replaces the letter just typed");
  eq(d.caret, 2, "the caret moves on to the next empty place");
  const saved = d.save();
  const e = createDraft(5, "sk");
  e.load(saved);
  eq(e.places, d.places, "a saved guess comes back");
  e.clear();
  e.put(2, "a");
  eq([e.places[2], e.caret], ["a", 0], "the hint's letter fills its place, the caret stays");
  const en = createDraft(4, "en");
  en.type("c");
  en.type("h");
  eq(en.tiles(), ["c", "h"], "English C and H stay two letters");
  eq([tileOf("sk", "Á"), tileOf("en", "á"), tileOf("sk", "ˇ")], ["á", null, null], "typed characters");
  eq([baseKey("sk", "ch"), baseKey("sk", "č"), baseKey("sk", "ľ"), baseKey("sk", "b")], ["c", "c", "l", "b"], "keys");
  // Every Slovak letter can be typed from the keyboard: a key, or a key's accent.
  const typeable = new Set(["qwertzuiopasdfghjklyxcvbnm"].flatMap((r) => Array.from(r)));
  for (const list of Object.values(VARIANTS.sk)) list.forEach((v) => typeable.add(v));
  const skLetters = "a á ä b c č d ď e é f g h ch i í j k l ĺ ľ m n ň o ó ô p q r ŕ s š t ť u ú v w x y ý z ž".split(
    " ",
  );
  eq(
    skLetters.filter((l) => !typeable.has(l)),
    [],
    "every Slovak letter can be typed",
  );
}

// ---- the word lists
const words = {};
for (const lang of ["en", "sk"]) {
  words[lang] = createWords(lang, readFileSync(join(pkg, `data/words-${lang}.txt`), "utf8"));
  for (const n of LENGTHS) {
    const order = words[lang].orders[n];
    check(order.daily.length > 300, `${lang} ${n}: enough hidden words (${order.daily.length})`);
    eq(new Set(order.daily).size, order.daily.length, `${lang} ${n}: no word twice`);
    for (const w of order.daily) {
      const t = tiles(w, lang);
      if (!t || t.length !== n) problems.push(`${lang} ${n}: "${w}" has ${t ? t.length : "no"} letters`);
      if (!words[lang].isValid(w)) problems.push(`${lang} ${n}: hidden word "${w}" is no valid guess`);
    }
  }
}
check(words.en.isValid("zebra") && words.en.isValid("cats") && !words.en.isValid("qqqq"), "English guesses");
check(words.sk.isValid("kniha") && !words.sk.isValid("knihy"), "Slovak guesses are base forms");
check(!words.sk.isValid("dom") && words.sk.isKnown("dom"), "Slovak words of other lengths name base forms only");

// ---- a year of daily words: the same for everyone, no word again within a year at any length
for (const lang of ["en", "sk"]) {
  for (const n of LENGTHS) {
    const seen = new Map();
    let day = "2026-11-01";
    for (let i = 0; i < 366; i++) {
      const w = dailyWord(words[lang], n, day);
      if (seen.has(w)) problems.push(`${lang} ${n}: "${w}" on ${seen.get(w)} and again on ${day}`);
      seen.set(w, day);
      day = addDays(day, 1);
    }
    eq(dailyWord(words[lang], n, "2026-11-03"), dailyWord(words[lang], n, "2026-11-03"), "a date's word is fixed");
  }
}
check(dailyWord(words.en, 5, "2026-11-03") !== dailyWord(words.en, 5, "2026-11-04"), "each day its own word");

// ---- practice words skip today's daily word
for (const lang of ["en", "sk"]) {
  const order = words[lang].orders[5].practice;
  const day = "2026-11-03";
  const daily = dailyWord(words[lang], 5, day);
  const i = order.indexOf(daily);
  const p = practiceWord(words[lang], 5, i, day);
  check(p.word !== daily && p.index === i + 1 && p.next === i + 2, `${lang}: practice passes over the daily word`);
  const q = practiceWord(words[lang], 5, order.length + 3, day);
  check(q.word === order[3] || q.word === order[4], `${lang}: practice starts over after the last word`);
}

// ---- Slovak base forms
const forms = {
  knihy: "kniha",
  stoly: "stôl",
  robím: "robiť",
  pekná: "pekný",
  ženy: "žena",
  modrého: "modrý",
  volajú: "volať",
  kone: "kôň",
  chlapi: "chlap",
};
for (const [form, base] of Object.entries(forms)) {
  const got = baseForms(words.sk, form);
  if (got[0] !== base) problems.push(`the base form of ${form}: got ${JSON.stringify(got)}, expected ${base} first`);
}
eq(baseForms(words.en, "cats"), [], "English has no base-form rule");
eq(baseForms(words.sk, "xyzw"), [], "no base form for nonsense");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("game: marks, hard mode, hints, typing, word lists, a year of daily words and base forms all check out");
