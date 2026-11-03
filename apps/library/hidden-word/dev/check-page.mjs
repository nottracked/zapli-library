// Checks the page without a browser (Node 22), on the stand-in DOM of dev/stand-in-dom.mjs:
//  - every element the code looks up by id exists in index.html, once;
//  - a whole game in English: the first-start line, a short guess and a word not in the list refused without costing
//    a guess, a guess with its marks on the chips and the keyboard, the hint, the word found, the result tray, the
//    statistics, the calendar, sharing as words, the next word, another length, a word not found, hard mode;
//  - Slovak: the Slovak keyboard, C and H typed as CH, the accent strip, a held key's accent, another form of a word
//    refused with its base form offered, and the game's texts in Slovak.
// Run: node dev/check-page.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseDocument, StandInEvent } from "./stand-in-dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const problems = [];
const check = (ok, what) => {
  if (!ok) problems.push(what);
};
const eq = (a, b, what) =>
  check(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

// ---- ids
const html = readFileSync(join(pkg, "index.html"), "utf8");
const ids = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
for (const [id, n] of ids) if (n > 1) problems.push(`id "${id}" appears ${n} times in index.html`);
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".mjs")) {
      const code = readFileSync(path, "utf8");
      for (const m of code.matchAll(/(?:\$|getElementById)\(\s*"([^"]+)"\s*\)/g)) {
        if (!ids.has(m[1])) problems.push(`${entry.name} looks up "#${m[1]}", which index.html does not have`);
      }
    }
  }
}
walk(join(pkg, "js"));

// ---- the page on the stand-in DOM
const doc = parseDocument(html);
const storage = new Map();
globalThis.document = doc;
globalThis.Event = StandInEvent;
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  // The checks run with reduced motion, so nothing waits for an animation.
  matchMedia: (q) => ({ matches: /reduce/.test(q), addEventListener() {} }),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  addEventListener() {},
  innerHeight: 760,
  innerWidth: 360,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  },
};
Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true });
globalThis.fetch = async (url) => {
  const text = readFileSync(join(pkg, url), "utf8");
  return { ok: true, status: 200, text: async () => text };
};

const { createWords, dailyWord, practiceWord } = await import("../package/js/game/words.mjs");
const { score } = await import("../package/js/game/rules.mjs");
const { isoDay } = await import("../package/js/core/dates.mjs");
const words = {
  en: createWords("en", readFileSync(join(pkg, "data/words-en.txt"), "utf8")),
  sk: createWords("sk", readFileSync(join(pkg, "data/words-sk.txt"), "utf8")),
};

await import("../package/js/main.mjs");
const $ = (id) => doc.getElementById(id);
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await tick();
  }
  problems.push(`timed out waiting for ${what}`);
}
const key = (letter) => doc.querySelector(`.key[data-key="${letter}"]`);
const slots = () => doc.querySelectorAll(".slot").map((s) => s.querySelector(".ch").textContent);
const cards = () => $("cards").children;
async function type(word) {
  for (const ch of Array.from(word)) {
    key(ch).click();
  }
  await tick();
}
async function clearDraft() {
  for (let i = 0; i < 8; i++) $("btn-back").click();
  await tick();
}
async function guess(word) {
  await clearDraft();
  await type(word);
  $("btn-try").click();
  await tick(20);
}
const today = isoDay(new Date());

const mode = () => `${$("mode-kind").textContent} · ${$("mode-what").textContent}`;
await until(() => $("mode-what").textContent, "the first word");

// ---- English, first start
eq($("lang-code").textContent, "EN", "a browser in English plays English words");
check(mode().startsWith("Daily word · "), `the first word is today's: ${mode()}`);
eq($("btn-length").textContent, "5 letters", "the default length");
eq(doc.querySelectorAll(".key").length, 26, "the English keyboard has 26 keys");
eq(
  doc
    .querySelectorAll(".row")[2]
    .children.map((k) => k.dataset.key)
    .join(""),
  "zxcvbnm",
  "English third row",
);
check(!$("btn-first").hidden, "the first-start line shows before the first guess");
eq($("empty-text").textContent, "The hidden word has 5 letters. You have 6 guesses.", "the empty log");
eq($("left").textContent, "6 guesses left", "the lock's count");

const answer = dailyWord(words.en, 5, today);
const others = ["about", "dream", "plant", "stone", "might", "lucky", "brick", "chair"].filter(
  (w) => w !== answer && words.en.isValid(w),
);

await type("ab");
$("btn-try").click();
await tick();
eq($("notice").textContent, "Fill in 3 more letters first.", "a short guess");
eq(cards().length, 0, "a short guess costs nothing");
await clearDraft();
await type("qqqqq");
$("btn-try").click();
await tick();
eq($("notice").textContent, "QQQQQ is not in the word list. It costs no guess.", "a word not in the list");
eq(cards().length, 0, "a word not in the list costs nothing");

await guess(others[0]);
eq(cards().length, 1, "a guess adds a card");
const marks = score(Array.from(others[0]), Array.from(answer));
eq(
  cards()[0]
    .querySelectorAll(".chip")
    .map((c) => c.className.replace("chip", "").replace("stamp", "").trim()),
  marks,
  "the card's marks",
);
check(cards()[0].getAttribute("aria-label").startsWith(`Guess 1, ${others[0].toUpperCase()}: `), "the card's label");
check($("log-empty").hidden, "the empty log line goes with the first guess");
check($("btn-first").hidden, "the first-start line goes with the first guess");
eq($("left").textContent, "5 guesses left", "a guess used");
const firstMark = { hit: "hit", near: "near", miss: "miss" }[marks[0]];
check(key(others[0][0]).classList.contains(firstMark), `the keyboard shows ${others[0][0]} as ${firstMark}`);
check($("notice").textContent === "", "no message stays after a good guess");

await guess(others[0]);
eq($("notice").textContent, `You tried ${others[0].toUpperCase()} already. It costs no guess.`, "a guess twice");
eq(cards().length, 1, "a guess twice costs nothing");

await clearDraft();
$("btn-hint").click();
await tick();
check(/^Place \d is [A-Z]\.$/.test($("notice").textContent), `the hint says its letter: ${$("notice").textContent}`);
check($("btn-hint").disabled, "one hint per word");
const hintAt = Number($("notice").textContent.match(/Place (\d)/)[1]) - 1;
eq(slots()[hintAt], answer[hintAt].toUpperCase(), "the hint's letter goes into its place");
check(doc.querySelectorAll(".slot")[hintAt].classList.contains("hinted"), "the hinted place is marked");

await guess(answer);
check($("tray").classList.contains("ended"), "a found word ends the game");
check(!$("result").hidden, "the result shows");
eq($("r-head").textContent, "Found in 2 guesses!", "the result's line");
check($("lock").classList.contains("open"), "the lock opens");
check(
  $("r-sub").textContent.includes("2 of 6 guesses") && $("r-sub").textContent.includes("with the hint"),
  `the result's details: ${$("r-sub").textContent}`,
);
check($("r-meta").textContent.includes("Daily streak: 1 day"), `the streak: ${$("r-meta").textContent}`);
check($("r-meta").textContent.includes("Next daily word in"), "the time to the next daily word");
eq($("r-chart").children.length, 7, "the mini chart: 6 guesses and not found");
check($("r-chart").children[1].classList.contains("mine"), "the mini chart lights this word's column");

$("btn-share").click();
await tick();
check(!$("share-box").hidden, "without a share sheet the result shows as text");
const shared = $("share-text").value;
check(shared.startsWith("Hidden Word · daily word, "), `the shared text: ${shared}`);
check(shared.includes("Found in 2 of 6 guesses. With the hint."), `the shared result in words: ${shared}`);
check(!shared.toLowerCase().includes(answer), "the shared text never gives the word away");

$("btn-stats").click();
await tick();
check($("dlg-stats").open, "statistics open");
eq($("st-played").textContent, "1", "played");
eq($("st-found").textContent, "100%", "found");
eq($("st-streak").textContent, "1", "streak");
eq($("st-dist").children.length, 7, "the distribution has rows 1 to 6 and not found");
check($("st-dist").children[1].classList.contains("mine"), "the distribution lights the last word");
$("stats-done").click();

$("btn-daily").click();
await tick();
check($("dlg-daily").open, "the calendar opens");
const todayBtn = doc.querySelector(`.d[data-day="${today}"]`);
check(todayBtn && todayBtn.classList.contains("found"), "today is marked found");
eq($("cal-count").textContent, "1 daily word found this month.", "the month's count");
$("daily-close").click();

$("btn-next").click();
await until(() => mode().startsWith("Practice"), "practice");
eq(mode(), "Practice · Word 1", "practice starts at word 1");
check($("result").hidden && !$("tray").classList.contains("ended"), "a new word brings the keyboard back");
eq(cards().length, 0, "a new word has an empty log");
check(!$("btn-hint").disabled, "a new word has its hint");
eq($("btn-switch").textContent, "Today's word", "practice offers today's word");

// another length
$("btn-length").click();
await tick();
check($("dlg-length").open, "the length dialog opens");
doc.querySelector('#length-options .len[data-n="7"]').click();
await until(() => $("btn-length").textContent === "7 letters", "seven letters");
eq(doc.querySelectorAll(".slot").length, 7, "the lock has 7 places");
eq($("empty-text").textContent, "The hidden word has 7 letters. You have 8 guesses.", "the empty log at 7");

// a word not found: 4 letters, as few guesses as letters
$("btn-settings").click();
doc.querySelector('input[name="length"][value="4"]').click();
await until(() => $("btn-length").textContent === "4 letters", "four letters");
doc.querySelector('input[name="guesses"][value="tight"]').click();
await tick();
eq($("guess-note").textContent.startsWith("For 4-letter words: 4, 5 or 7 guesses"), true, "the guess note");
$("settings-done").click();
const answer4 = practiceWord(words.en, 4, 0, today).word;
const wrong4 = ["able", "baby", "cake", "dark", "earn", "fame", "gate"].filter(
  (w) => w !== answer4 && words.en.isValid(w),
);
for (const w of wrong4.slice(0, 4)) await guess(w);
eq($("r-head").textContent, "Not this time", "a word not found");
eq($("r-word").textContent, `The word was ${answer4.toUpperCase()}.`, "the word is shown");
check($("lock").classList.contains("failed"), "the lock shows the word in outline");
eq($("btn-next").textContent, "Next word", "practice goes on with the next word");

// hard mode
$("btn-next").click();
await until(() => mode() === "Practice · Word 2", "the next practice word");
$("btn-settings").click();
doc.getElementById("opt-hard").click();
$("settings-done").click();
const answer4b = practiceWord(words.en, 4, 1, today).word;
const pool = words.en.orders[4].practice.filter((w) => w !== answer4b);
const first = pool.find((w) => score(Array.from(w), Array.from(answer4b)).includes("hit"));
await guess(first);
const at = score(Array.from(first), Array.from(answer4b)).indexOf("hit");
const breaker = pool.find((w) => w !== first && w[at] !== first[at]);
await guess(breaker);
eq(
  $("notice").textContent,
  `Hard mode: place ${at + 1} must be ${first[at].toUpperCase()}.`,
  "hard mode keeps a found letter in its place",
);
eq(cards().length, 1, "a guess against hard mode costs nothing");

// a physical keyboard: letters, Backspace, Enter
await clearDraft();
for (const k of ["x", "y", "Backspace", "Escape"]) {
  doc.dispatchEvent(Object.assign(new StandInEvent("keydown"), { key: k, target: doc.body }));
}
await tick();
eq(doc.querySelectorAll(".slot.filled").length, 0, "Escape clears the guess");
check(doc.querySelectorAll(".slot.ghost").length >= 1, "a letter found in its place shows faintly in an empty place");

// ---- Slovak
$("btn-lang").click();
await until(() => $("lang-code").textContent === "SK", "Slovak words");
eq(
  doc
    .querySelectorAll(".row")[0]
    .children.map((k) => k.dataset.key)
    .join(""),
  "qwertzuiop",
  "Slovak first row",
);
check(key("a").classList.contains("more") && key("a").querySelector(".tab"), "a Slovak key with accents shows its tab");
check(
  key("a").getAttribute("aria-label").includes("Á, Ä"),
  `a key names its accents: ${key("a").getAttribute("aria-label")}`,
);
check(doc.querySelector(".accents-hint"), "before the first accent, a line says keys hold them");
// CH
$("btn-length").click();
doc.querySelector('#length-options .len[data-n="5"]').click();
await until(() => $("btn-length").textContent === "5 písmen" || $("btn-length").textContent === "5 letters", "five");
await clearDraft();
await type("ch");
eq(slots()[0], "CH", "C and H typed one after the other make CH");
eq(slots()[1], "", "CH takes one place");
// the accent strip
await type("a");
eq(
  doc.querySelectorAll(".accent").map((b) => b.textContent),
  ["Á", "Ä"],
  "the strip offers the accents of A",
);
doc.querySelectorAll(".accent")[0].click();
await tick();
eq(slots()[1], "Á", "the strip changes the letter just typed");
check(!doc.querySelector(".accents-hint"), "the hint line goes once accents were used");
// a held key
const s = key("s");
s.dispatchEvent(Object.assign(new StandInEvent("pointerdown"), { pointerId: 7, button: 0, target: s }));
await tick(420);
check(doc.querySelector(".popup"), "holding a key opens its accents");
s.dispatchEvent(Object.assign(new StandInEvent("pointerup"), { pointerId: 7, target: s }));
s.click(); // the click that follows a pointer's lift types nothing more
await tick();
eq(slots()[2], "Š", "letting go types the accent");
eq(slots()[3], "", "the click after a hold types nothing");
// another form of a word
await clearDraft();
const skAnswer = dailyWord(words.sk, 5, today);
if (skAnswer !== "kniha") {
  await type("knihy");
  $("btn-try").click();
  await tick();
  check(
    $("notice").textContent.startsWith("KNIHY is not in the word list, so it costs no guess."),
    `another form: ${$("notice").textContent}`,
  );
  const offer = doc.querySelector(".suggest-btn");
  check(offer && offer.textContent === "KNIHA", "the base form is offered");
  if (offer) offer.click();
  await tick(20);
  eq(cards().length, 1, "the offered base form is tried");
}
// the game in Slovak
$("btn-settings").click();
doc.querySelector('input[name="ui"][value="sk"]').click();
await tick();
$("settings-done").click();
eq(doc.querySelector("#btn-try span").textContent, "Skúsiť", "the game's texts in Slovak");
check(mode().startsWith("Slovo dňa · ") || mode().startsWith("Voľná hra"), `the mode in Slovak: ${mode()}`);
eq($("btn-length").textContent, "5 písmen", "Slovak plural of letters");

// saved values
const saved = JSON.parse(storage.get("hidden-word/settings"));
eq(
  [saved.words, saved.length, saved.guesses, saved.hard, saved.taught],
  ["sk", 5, "tight", true, true],
  "settings are saved",
);
check(storage.has("hidden-word/stats-en") && storage.has("hidden-word/games-sk"), "games and statistics are saved");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("page: ids, an English game from first start to statistics, and the Slovak keyboard all check out");
process.exit(0);
