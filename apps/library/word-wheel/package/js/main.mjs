// Word Wheel: the page. It wires the saved state, the puzzle source, the wheel, the crossword and the dialogs.
//
// Saved values (js/core/store.mjs), each per language where it says <lang>:
//   settings          the player's choices
//   progress-<lang>   the endless wheel's number, the wheel in play and the daily wheels started
//   book-<lang>       the word book: every extra word found, with the day it was first found
//   stats-<lang>      wheels solved, grid words found, hints used
//   daily-<lang>      the daily wheels solved, by date

import { createStore } from "./core/store.mjs";
import { createI18n, pickLang } from "./core/i18n.mjs";
import { isoDay, isDay, FIRST_DAY, daysBetween, streaks } from "./core/dates.mjs";
import { collator, normalise, tiles as tilesOf } from "./core/letters.mjs";
import { createMeanings } from "./core/meanings.mjs";
import { STRINGS } from "./wheel/strings.mjs";
import { createSource } from "./wheel/source.mjs";
import {
  newState,
  tryWord,
  showCell,
  hintCell,
  hintsLeft,
  visibleCells,
  cellsOf,
  hiddenOf,
  hiddenFound,
  isComplete,
  jarLevel,
  EXTRAS_PER_HINT,
  MIN_WORD,
} from "./wheel/puzzle.mjs";
import { SIZES } from "./wheel/generator.mjs";
import { createWheel } from "./ui/wheel-view.mjs";
import { createGrid } from "./ui/grid-view.mjs";
import { createCalendar } from "./ui/calendar-view.mjs";
import { createFx } from "./ui/fx.mjs";

const host = window.zapli;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const LANGS = ["sk", "en"];
const OPEN_DAYS_KEPT = 10;
// How long "Wheel complete!" shows before the next wheel comes.
const NEXT_AFTER_MS = 2600;
const LETTER_SCALE = { normal: 1, large: 1.25, largest: 1.5 };
// Turned sideways on a phone: the crossword on the left, the word and the wheel on the right (css/app.css).
const SIDEWAYS = "(orientation: landscape) and (min-width: 36rem) and (max-height: 34rem)";
// Holding the delete button this long clears the whole word.
const HOLD_MS = 450;

const i18n = createI18n(STRINGS);
const t = (key, args) => i18n.t(key, args);
const tn = (key, n, args) => i18n.tn(key, n, args);

const store = createStore("word-wheel", [
  "settings",
  ...LANGS.flatMap((l) => [`progress-${l}`, `book-${l}`, `stats-${l}`, `daily-${l}`]),
]);
const source = createSource();
// The words' short meanings, from the app's own files (relative to the page, like the word lists).
const meanings = createMeanings((lang) =>
  fetch(lang === "sk" ? "data/meanings-sk.txt" : "data/meanings-en.txt").then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`meanings: ${r.status}`)),
  ),
);

let settings = null;
// { lang, kind: "endless" | "daily", day, puzzle, state, ms }; ms is the time played on the wheel, or null for a wheel
// started before the game kept time.
let game = null;
let pendingCell = null;
let textScale = 1;
let loadToken = 0;
let retry = () => {};
let canBuzz = false;
let nextTimer = 0;
let lastWordLength = 0;
let appVersion = ""; // the version Zapli says this app has; none in a plain browser
const fx = createFx(document.getElementById("fx"));

const today = () => {
  const day = isoDay(new Date());
  return daysBetween(FIRST_DAY, day) < 0 ? FIRST_DAY : day;
};

// ---- saved values, checked as they are read

function normSettings(raw) {
  const s = raw || {};
  return {
    ui: ["auto", "sk", "en"].includes(s.ui) ? s.ui : "auto",
    words: LANGS.includes(s.words) ? s.words : null,
    size: SIZES.includes(s.size) ? s.size : "grow",
    letters: s.letters in LETTER_SCALE ? s.letters : null,
    contrast: Boolean(s.contrast),
    theme: ["device", "light", "dark"].includes(s.theme) ? s.theme : "device",
    taught: Boolean(s.taught),
    vibration: s.vibration !== false,
    meanings: s.meanings !== false,
    timer: s.timer === true,
  };
}

const isGame = (g) => g && g.puzzle && Array.isArray(g.puzzle.words) && g.state && Array.isArray(g.state.found);

function progressOf(lang) {
  const p = store.get(`progress-${lang}`) || {};
  const open = {};
  if (p.open && typeof p.open === "object") {
    for (const [day, g] of Object.entries(p.open)) if (isDay(day) && isGame(g)) open[day] = g;
  }
  return {
    level: Number.isInteger(p.level) && p.level >= 0 ? p.level : 0,
    endless: isGame(p.endless) ? p.endless : null,
    open,
    active: p.active === "endless" || isDay(p.active) ? p.active : "endless",
  };
}

const saveProgress = (lang, p, now) => store.set(`progress-${lang}`, p, now);

function bookOf(lang) {
  const b = store.get(`book-${lang}`);
  return b && b.words && typeof b.words === "object" ? b.words : {};
}

function statsOf(lang) {
  const s = store.get(`stats-${lang}`) || {};
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  // fastDaily: the fastest daily wheel in ms, 0 while there is none.
  return {
    solved: n(s.solved),
    words: n(s.words),
    hints: n(s.hints),
    perfect: n(s.perfect),
    fastDaily: n(s.fastDaily),
  };
}

function dailyOf(lang) {
  const d = store.get(`daily-${lang}`);
  return d && d.days && typeof d.days === "object" ? d.days : {};
}

// ---- language, look and letter size

function uiLang() {
  let phone = "";
  try {
    if (host && host.app && typeof host.app.locale === "function") phone = String(host.app.locale() || "");
  } catch (e) {
    phone = "";
  }
  return pickLang(settings.ui === "auto" ? null : settings.ui, phone);
}

function translatePage() {
  root.lang = i18n.lang;
  document.title = t("appName");
  document.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  document.querySelectorAll("[data-t-label]").forEach((el) => {
    const text = t(el.dataset.tLabel);
    el.setAttribute("aria-label", text);
    if (el.tagName === "BUTTON") el.title = text;
  });
  $("wheel").setAttribute("aria-label", t("wheelLabel"));
  wheel.relabel();
}

const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function applyLook() {
  if (settings.theme === "device") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  const dark = settings.theme === "dark" || (settings.theme === "device" && darkQuery && darkQuery.matches);
  root.classList.toggle("dark-now", Boolean(dark));
  root.classList.toggle("contrast", settings.contrast);
  root.style.setProperty("--ls", String(LETTER_SCALE[lettersChoice()]));
  $("letters-note").hidden = Boolean(settings.letters);
  sizeWheel();
}

// The phone's text size, from a probe line of 100 px text, picks the letter size until the player chooses one.
function measureTextScale() {
  const probe = $("tz-probe");
  const h = probe ? probe.getBoundingClientRect().height : 0;
  textScale = h > 0 ? Math.min(3, Math.max(1, h / 100)) : 1;
  root.style.setProperty("--tz", textScale.toFixed(3));
}

function lettersChoice() {
  if (settings.letters) return settings.letters;
  if (textScale >= 1.6) return "largest";
  if (textScale >= 1.25) return "large";
  return "normal";
}

// The crossword gets the room it can use, the wheel a comfortable size. The crossword's need is the height of its
// squares at the largest size the width allows; what is left beyond that goes to the wheel, up to a little more than
// its comfortable size (letters of about 60 to 75 px, more with larger letters). When room is short, the crossword's
// squares shrink first (down to 28 px), then the wheel (down to 200 px, where seven letters are still 50 px wide).
const CELL_MAX = 64;
const CELL_MIN = 28;
const CELL_GAP = 3;
const WHEEL_MIN = 200;
// On a short screen the wheel may be smaller still, so the crossword keeps squares that can be read.
const WHEEL_MIN_SHORT = 180;

function sizeWheel() {
  const play = $("play");
  const style = window.getComputedStyle(play);
  const w = play.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const h = play.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const row = $("word-row").offsetHeight;
  const ls = Math.min(LETTER_SCALE[lettersChoice()], 1.15);
  let size;
  if (window.matchMedia && window.matchMedia(SIDEWAYS).matches) {
    size = Math.min(h - row - 12, w * 0.46, 360);
  } else {
    const status = play.querySelector(".status").offsetHeight;
    const both = h - status - row - 14;
    const want = Math.min(w, Math.min(300, Math.max(236, 0.38 * both)) * ls);
    const rows = game ? game.puzzle.rows : 7;
    const cols = game ? game.puzzle.cols : 7;
    const across = Math.min(CELL_MAX, (w - (cols - 1) * CELL_GAP) / cols);
    const gaps = (rows - 1) * CELL_GAP + 8;
    const need = rows * across + gaps;
    const least = rows * Math.min(across, CELL_MIN) + gaps;
    if (both - need >= want) size = Math.min(both - need, w, want * 1.12);
    else if (both - least >= want) size = want;
    else size = both - least;
  }
  size = Math.max(h < 560 ? WHEEL_MIN_SHORT : WHEEL_MIN, Math.min(420, Math.floor(size)));
  // On the play area, so the sideways layout can size the wheel's column from it too (css/app.css).
  play.style.setProperty("--size", `${size}px`);
  grid.fit();
  fitHeader();
}

// The top bar holds the word-language pill and five buttons. Where they do not fit (a narrow screen, a large text
// size), the pill drops its chevron, then its globe; the code and its label for screen readers stay.
function fitHeader() {
  const top = document.querySelector(".top");
  const pill = $("btn-lang");
  const over = () => pill.scrollWidth > pill.clientWidth + 1 || top.scrollWidth > top.clientWidth + 1;
  top.classList.remove("tight", "tighter");
  if (over()) top.classList.add("tight");
  if (over()) top.classList.add("tighter");
}

// ---- the views

const wheel = createWheel($("wheel"), {
  letterLabel: (letter) => t("letterLabel", { letter }),
  onChange: showCurrent,
  onSubmit: submitWord,
  onLetter: () => buzz("light"),
  answers: openAnswers,
});

// What the wheel needs to take a tapped word by itself: the answers not found yet (crossword and jar words).
function openAnswers() {
  if (!game || !Array.isArray(game.puzzle.extra)) return { leadsOn: () => false, isNew: () => false };
  const { puzzle, state } = game;
  const done = new Set([...state.found, ...state.extras]);
  const open = [...puzzle.words.map((w) => w.w), ...puzzle.extra].filter((w) => !done.has(w));
  return {
    isNew: (tiles) => tiles.length >= MIN_WORD && open.includes(tiles.join("")),
    leadsOn: (tiles) => {
      const start = tiles.join("");
      return open.some((w) => w.startsWith(start));
    },
  };
}

const grid = createGrid($("grid"), { onCellTap: askCell, onWordTap: explainCell, t });

const calendar = createCalendar($("cal"), {
  onPick: (day) => {
    closeDialog($("dlg-daily"));
    openDaily(day);
  },
  label: (day, status) => {
    const date = longDate(day);
    return status === "solved" ? t("daySolved", { date }) : status === "started" ? t("dayStarted", { date }) : date;
  },
});

function longDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(i18n.lang, { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  } catch (e) {
    return day;
  }
}

// The word row: the delete button, the word being made (one chip per letter, the newest pops in) and the tick. Where
// no word is being made, the field shows the last message until the next letter; on a fresh field, until the player
// has found a word, a line says how to make one. The buttons keep their place and dim while there is no word.
let wordLit = false;
let lastLit = false;

function showCurrent(word, how) {
  const out = $("current");
  const text = word.join("").toUpperCase();
  wordLit = Boolean(how && how.lit);
  out.textContent = "";
  if (text) {
    word.forEach((tile, i) => {
      const chip = document.createElement("span");
      chip.className = i === word.length - 1 && word.length > lastWordLength ? "cl new" : "cl";
      chip.textContent = tile.toUpperCase();
      out.appendChild(chip);
    });
    // A new word makes the last message old news.
    if (!wordLit && (lastWordLength === 0 || lastLit)) setNotice("", "");
  } else if (!(settings && settings.taught)) out.textContent = t("currentEmpty");
  lastWordLength = word.length;
  lastLit = wordLit;
  out.setAttribute("aria-label", text ? t("currentWord", { word: text }) : t("currentEmpty"));
  $("btn-clear").disabled = !text;
  $("btn-enter").disabled = !text;
  showField();
}

// The field shows the word while one is being made, else the message, else the first-start line (or nothing).
function showField() {
  const field = $("word-field");
  const hasWord = $("current").querySelector(".cl") !== null && !wordLit;
  const hasNotice = $("notice").textContent !== "";
  field.dataset.show = hasWord ? "word" : hasNotice ? "notice" : "empty";
  $("current").classList.toggle("empty", !$("current").querySelector(".cl"));
  $("word-row").classList.toggle("lit", wordLit);
  fitField();
}

let noticeCount = 0;

function setNotice(text, tone, meaning) {
  noticeCount++;
  const el = $("notice");
  el.textContent = text;
  if (meaning) {
    const line = document.createElement("span");
    line.className = "meaning";
    line.textContent = meaning;
    el.append(" ", line);
  }
  el.className = `notice ${tone || ""}`;
}

/**
 * Shows a message in the field. With a `word`, the word's short meaning follows on a smaller line when it has one;
 * a language's meanings are read the first time, and when the message has changed by then, nothing is added.
 */
function notice(text, tone, word) {
  setNotice(text, tone);
  showField();
  if (!word || !game) return;
  const lang = game.lang;
  const now = meanings.peek(lang, word);
  if (now !== undefined) {
    if (now) {
      setNotice(text, tone, meaningText(now));
      showField();
    }
    return;
  }
  const count = noticeCount;
  meanings.get(lang, word).then((entry) => {
    if (!entry || count !== noticeCount) return;
    setNotice(text, tone, meaningText(entry));
    showField();
  });
}

// An English word's Slovak translation shows where the game speaks Slovak.
function meaningText(entry) {
  return entry.sk && i18n.lang === "sk" ? `${entry.meaning} · ${entry.sk}` : entry.meaning;
}

// The word a find's message explains: the found word while meanings are on.
const explain = (word) => (settings.meanings ? word : null);

// A tap on a square of a found word shows the word's meaning; where two found words cross, the next tap on the same
// square shows the other.
let lastExplained = { key: null, i: 0 };

function explainCell(key) {
  if (!game) return;
  const found = new Set(game.state.found);
  const words = game.puzzle.words.filter((w) => found.has(w.w) && cellsOf(w).includes(key));
  if (!words.length) return;
  const i = lastExplained.key === key ? (lastExplained.i + 1) % words.length : 0;
  lastExplained = { key, i };
  const word = words[i];
  grid.flash(word, "again");
  notice(word.w.toUpperCase(), "soft", word.w);
}

// A long message (or the first-start line) at a large text size gets a little smaller rather than spill out of the
// field. The size is set in em: a size in px would be enlarged by the phone's text size once more.
function fitField() {
  const field = $("word-field");
  const show = field.dataset.show;
  for (const el of [$("notice"), $("current")]) el.style.fontSize = "";
  const el = show === "notice" ? $("notice") : show === "empty" ? $("current") : null;
  if (!el || !el.textContent) return;
  const room = field.clientHeight;
  for (let scale = 0.9; scale >= 0.6 && el.getBoundingClientRect().height > room + 1; scale -= 0.06) {
    el.style.fontSize = `${scale.toFixed(2)}em`;
  }
}

function refresh() {
  if (!game) return;
  const { puzzle, state } = game;
  const visible = visibleCells(puzzle, state);
  grid.update(state, visible);
  $("progress").textContent = t("progress", { found: state.found.length, total: puzzle.words.length });
  $("mode-label").textContent =
    game.kind === "daily"
      ? t("dailyLabel", { date: longDate(game.day) })
      : t("endlessLabel", { n: (puzzle.level || 0) + 1 });
  // Solved: the badge stays in sight and the chip becomes the way on, "Next wheel".
  const chip = $("btn-switch");
  chip.textContent = state.done ? t("nextWheel") : game.kind === "daily" ? t("toEndless") : t("toToday");
  chip.classList.toggle("go", state.done);
  $("solved-badge").hidden = !state.done;
  $("progress").hidden = state.done;
  grid.setSolved(state.done, false);
  const left = hintsLeft(state);
  $("hint-count").textContent = String(left);
  $("btn-hint").disabled = state.done;
  $("btn-hint").setAttribute("aria-label", `${t("hint")}. ${tn("hintsLeft", left)}`);
  showJar();
  showLang();
}

function showLang() {
  const lang = game ? game.lang : wordsLang();
  $("lang-code").textContent = lang.toUpperCase();
  $("btn-lang").setAttribute("aria-label", t(lang === "sk" ? "langPillSk" : "langPillEn"));
  $("btn-lang").title = $("btn-lang").getAttribute("aria-label");
  document.querySelectorAll(".lang-row").forEach((row) => {
    if (row.dataset.lang === lang) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  });
}

// The jar: how many of the wheel's hidden words are found, and how full it is toward the next free hint.
function showJar() {
  const { puzzle, state } = game;
  const total = hiddenOf(puzzle).length;
  const found = hiddenFound(puzzle, state);
  const level = jarLevel(state);
  $("jar-fill").setAttribute("y", String(46 - (level / EXTRAS_PER_HINT) * 32));
  $("jar-fill").setAttribute("height", String((level / EXTRAS_PER_HINT) * 32));
  $("jar").classList.toggle("all", total > 0 && found >= total);
  $("jar-label").textContent = total ? t("jarHidden", { found, total }) : t("jarNone");
  const stateText = total ? t("jarHiddenLong", { found, total }) : t("jarNoneLong");
  const bonus = state.extras.length - found;
  $("btn-jar").setAttribute(
    "aria-label",
    t("jarAria", { state: stateText, bonus, toHint: tn("jarToHint", EXTRAS_PER_HINT - level) }),
  );
}

// ---- vibration (Zapli's haptics; a plain browser has none and skips it)

function buzz(kind) {
  if (!canBuzz || !settings.vibration) return;
  try {
    host.haptics.impact(kind).catch(() => {});
  } catch (e) {
    // no haptics on this phone after all
  }
}

function buzzPattern(kinds, gap) {
  kinds.forEach((kind, i) => window.setTimeout(() => buzz(kind), i * gap));
}

// ---- loading puzzles

function setLoading(on, failed) {
  const box = $("loading");
  box.hidden = !on;
  $("loading-text").textContent = failed ? t("loadFailed") : t("loading");
  $("btn-retry").hidden = !failed;
}

async function load(lang, request) {
  const token = ++loadToken;
  const slow = window.setTimeout(() => {
    if (token === loadToken) setLoading(true, false);
  }, 150);
  try {
    const puzzle = await request();
    if (token !== loadToken) return null;
    setLoading(false);
    return puzzle;
  } catch (e) {
    if (token === loadToken) {
      setLoading(true, true);
      retry = () => openActive(lang);
    }
    return null;
  } finally {
    window.clearTimeout(slow);
  }
}

function show(g) {
  window.clearTimeout(nextTimer);
  clockFrom = 0;
  game = g;
  setLoading(false);
  setNotice("", "");
  wheel.set(g.puzzle.letters);
  grid.set(g.puzzle);
  pendingCell = null;
  refresh();
  syncClock();
  window.requestAnimationFrame(sizeWheel);
  if (!Array.isArray(g.puzzle.hidden)) addHiddenWords(g);
  if (settings.meanings) meanings.load(g.lang);
}

// A wheel saved by an earlier version has no list of hidden words: make the same wheel again and take its list
// (and its extra words) when its grid is the same; otherwise the wheel counts no hidden words.
async function addHiddenWords(g) {
  let again = null;
  try {
    if (g.kind === "daily") again = await source.daily(g.lang, g.day);
    else if (Number.isInteger(g.puzzle.level)) again = await source.endless(g.lang, g.puzzle.size, g.puzzle.level);
  } catch (e) {
    again = null;
  }
  const same = again && JSON.stringify(again.words) === JSON.stringify(g.puzzle.words);
  g.puzzle.hidden = same ? again.hidden : [];
  if (same) g.puzzle.extra = again.extra;
  if (game !== g) return;
  saveGame();
  refresh();
}

/** Opens what a language had on screen last: a daily wheel, or the endless wheel. */
async function openActive(lang) {
  const p = progressOf(lang);
  if (p.active !== "endless" && p.open[p.active]) {
    const g = p.open[p.active];
    show({ lang, kind: "daily", day: p.active, puzzle: g.puzzle, state: g.state, ms: msOf(g) });
    return;
  }
  await openEndless(lang);
}

// "Growing" wheels: 5 letters for the first 10 endless wheels, 6 up to the 30th, then 7.
function growingSize(level) {
  return level < 10 ? 5 : level < 30 ? 6 : 7;
}

async function openEndless(lang) {
  const p = progressOf(lang);
  if (p.endless) {
    p.active = "endless";
    saveProgress(lang, p);
    show({ lang, kind: "endless", puzzle: p.endless.puzzle, state: p.endless.state, ms: msOf(p.endless) });
    return;
  }
  const size = settings.size === "grow" ? growingSize(p.level) : settings.size;
  const puzzle = await load(lang, () => source.endless(lang, size, p.level));
  if (!puzzle) return;
  const fresh = progressOf(lang);
  fresh.endless = { puzzle, state: newState(puzzle), ms: 0 };
  fresh.active = "endless";
  saveProgress(lang, fresh, true);
  show({ lang, kind: "endless", puzzle, state: fresh.endless.state, ms: 0 });
}

async function openDaily(day) {
  // The wheel on the screen keeps the time played on it.
  saveGame(true);
  const lang = game ? game.lang : wordsLang();
  const p = progressOf(lang);
  let g = p.open[day];
  if (!g) {
    const puzzle = await load(lang, () => source.daily(lang, day));
    if (!puzzle) return;
    const state = newState(puzzle);
    // A day solved before shows its solution again, and its extra words can still be found.
    const solved = dailyOf(lang)[day];
    if (solved) Object.assign(state, { found: puzzle.words.map((w) => w.w), done: true });
    g = { puzzle, state, ms: solved ? (Number.isFinite(solved.t) ? solved.t : null) : 0 };
  }
  const fresh = progressOf(lang);
  fresh.open[day] = g;
  fresh.active = day;
  pruneOpen(lang, fresh);
  saveProgress(lang, fresh, true);
  show({ lang, kind: "daily", day, puzzle: g.puzzle, state: g.state, ms: msOf(g) });
}

// Keeps the daily wheels in play and the latest unfinished ones; a solved one is dropped once it is left.
function pruneOpen(lang, p) {
  const solved = dailyOf(lang);
  const days = Object.keys(p.open).sort().reverse();
  let kept = 0;
  for (const day of days) {
    const keep = day === p.active || (!solved[day] && kept < OPEN_DAYS_KEPT);
    if (!keep) delete p.open[day];
    else if (day !== p.active) kept++;
  }
}

async function nextWheel() {
  if (!game) return;
  window.clearTimeout(nextTimer);
  saveGame(true);
  const lang = game.lang;
  const fromDaily = game.kind === "daily";
  const p = progressOf(lang);
  if (game.kind === "endless" && game.state.done) {
    p.level += 1;
    p.endless = null;
  }
  p.active = "endless";
  pruneOpen(lang, p);
  saveProgress(lang, p, true);
  await openEndless(lang);
  if (fromDaily) notice(t("nextAfterDaily"), "good");
}

function wordsLang() {
  return settings.words || uiLang();
}

async function switchLang(lang) {
  if (!LANGS.includes(lang) || (game && game.lang === lang)) return;
  saveGame(true);
  settings.words = lang;
  store.set("settings", settings);
  syncSettingsForm();
  wheel.clear();
  await openActive(lang);
}

// ---- playing

function saveGame(now) {
  if (!game) return;
  const p = progressOf(game.lang);
  const ms = played();
  const saved = { puzzle: game.puzzle, state: game.state, ms: ms === null ? null : Math.round(ms) };
  if (game.kind === "endless") p.endless = saved;
  else {
    p.open[game.day] = saved;
    p.active = game.day;
  }
  saveProgress(game.lang, p, now);
}

// ---- the timer: the time played on a wheel, counted while it is on the screen, unsolved, with no panel open. It
// counts whether the timer shows or not, so turning it on shows the real time.

let clockFrom = 0; // performance.now() when the count last started, 0 while it stands
let clockTick = 0;

function played() {
  if (!game || game.ms === null) return null;
  return game.ms + (clockFrom ? performance.now() - clockFrom : 0);
}

/** Starts or stops the count to match what is on the screen, and shows the time. */
function syncClock() {
  const run = Boolean(
    game && game.ms !== null && !game.state.done && !document.hidden && !document.querySelector("dialog[open]"),
  );
  if (clockFrom && !run) {
    game.ms = played();
    clockFrom = 0;
  } else if (!clockFrom && run) clockFrom = performance.now();
  window.clearInterval(clockTick);
  clockTick = run && settings.timer ? window.setInterval(showClock, 1000) : 0;
  showClock();
}

function showClock() {
  if (!settings) return;
  const el = $("clock");
  const ms = played();
  el.hidden = !settings.timer || ms === null;
  if (el.hidden) return;
  const text = clockText(ms);
  if (el.textContent !== text) {
    el.textContent = text;
    el.setAttribute("aria-label", t("clockLabel", { time: text }));
  }
}

function clockText(ms) {
  const all = Math.floor(ms / 1000);
  const h = Math.floor(all / 3600);
  const m = Math.floor((all % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(all % 60)}` : `${m}:${pad(all % 60)}`;
}

// The time played on a saved wheel. A wheel saved before the game kept time has none, unless nothing was played yet.
function msOf(saved) {
  if (Number.isFinite(saved.ms) && saved.ms >= 0) return saved.ms;
  if (saved.ms === null) return null;
  const s = saved.state;
  const touched = s.found.length > 0 || (s.extras && s.extras.length > 0) || (s.shown && s.shown.length > 0);
  return touched ? null : 0;
}

function bumpStats(lang, change) {
  const s = statsOf(lang);
  for (const [k, v] of Object.entries(change)) s[k] += v;
  store.set(`stats-${lang}`, s);
}

// A word to try: from a swipe or the tick (`how.auto` false), or taken by taps (`how.auto`), which only ever hands
// over answers not found yet, so it never says "already found" or "not in the list" while the player taps.
function submitWord(tiles, how) {
  if (!game) return;
  const auto = Boolean(how && how.auto);
  // Where the word's letters show now, so they can fly from there.
  const from = Array.from($("current").querySelectorAll(".cl")).map((c) => c.getBoundingClientRect());
  const letters = tiles.map((x) => x.toUpperCase());
  const before = game.state;
  const shownBefore = visibleCells(game.puzzle, before);
  const r = tryWord(game.puzzle, before, tiles);
  if (auto && r.result !== "found" && r.result !== "extra") return;
  const shown = r.word.toUpperCase();
  game.state = r.state;
  // The first-start line stays until the player has found a word.
  if (!settings.taught && (r.result === "found" || r.result === "extra")) {
    settings.taught = true;
    store.set("settings", settings);
  }
  if (auto) fx.flash($("btn-enter"), "took", 700);
  if (r.result === "found") {
    const word = game.puzzle.words.find((w) => w.w === r.word);
    notice(t("found", { word: shown }), "good", explain(r.word));
    buzz("success");
    afterChange(before, () => flyToGrid(word, letters, from, shownBefore));
    return;
  }
  if (r.result === "extra") {
    const book = bookOf(game.lang);
    if (!book[r.word]) {
      book[r.word] = isoDay(new Date());
      store.set(`book-${game.lang}`, { words: book });
    }
    const hidden = r.kind === "hidden";
    const text = t(hidden ? "foundHidden" : "foundBonus", { word: shown });
    notice(r.earnedHint ? `${text} ${t("earnedHint")}` : text, hidden ? "good hidden" : "good", explain(r.word));
    buzz("heavy");
    afterChange(before, () => flyToJar(letters, from, !hidden, r.earnedHint));
    return;
  }
  if (r.result === "again") {
    notice(t("alreadyFound", { word: shown }), "soft", explain(r.word));
    grid.flash(
      game.puzzle.words.find((w) => w.w === r.word),
      "again",
    );
  } else if (r.result === "extraAgain") {
    notice(t("alreadyFound", { word: shown }), "soft", explain(r.word));
    fx.flash($("jar"), "nudge");
  } else if (r.result === "short") notice(t("short"), "bad");
  else {
    notice(
      game.lang === "sk" ? `${t("unknown", { word: shown })} ${baseFormsHint()}`.trim() : t("unknown", { word: shown }),
      "bad",
    );
    // The field shakes once, like a head saying no.
    fx.flash($("word-field"), "shake", 320);
  }
  afterChange(before);
}

// A grid word's letters fly from the word into their squares; each square pops as its letter lands. Squares that
// showed already only pop.
function flyToGrid(word, letters, from, shownBefore) {
  if (!word) return;
  const keys = cellsOf(word);
  if (fx.still()) {
    keys.forEach((key) => fx.flash(grid.cellEl(key)));
    return;
  }
  keys.filter((key) => !shownBefore.has(key)).forEach((key) => grid.hold(key));
  const to = keys.map((key) => {
    const el = grid.cellEl(key);
    return el ? el.getBoundingClientRect() : null;
  });
  return fx.fly(letters, from, to, { land: (i) => grid.land(keys[i]) });
}

// A hidden word's letters fly into the jar, which pops; a bonus word's do the same, smaller and fainter.
function flyToJar(letters, from, light, earnedHint) {
  const jar = $("jar");
  const pop = () => {
    fx.flash(jar, light ? "pop-light" : "pop");
    if (earnedHint) {
      const plus = $("jar-plus");
      plus.hidden = false;
      fx.flash(plus, "rise", 1300);
      window.setTimeout(() => {
        plus.hidden = true;
      }, 1300);
    }
  };
  if (fx.still()) {
    pop();
    return;
  }
  let landed = 0;
  return fx.fly(letters, from, jar.getBoundingClientRect(), {
    light,
    land: () => {
      landed++;
      if (landed === letters.length) pop();
    },
  });
}

// Slovak counts only base forms. The example is one the wheel's letters cannot make, so it never gives a word away.
const BASE_FORMS = [
  ["stôl", "stoly"],
  ["ryba", "ryby"],
  ["robiť", "robím"],
  ["pekný", "pekná"],
  ["kniha", "knihy"],
];

function baseFormsHint() {
  const have = game.puzzle.letters;
  const canMake = (word) => {
    const left = have.slice();
    return (tilesOf(word, "sk") || []).every((x) => {
      const i = left.indexOf(x);
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    });
  };
  const pair = BASE_FORMS.find(([b]) => !canMake(b));
  return pair ? t("baseForms", { base: pair[0], form: pair[1] }) : "";
}

/**
 * Saves the game, draws it, runs the find's effect, and celebrates when this change solved the wheel (every grid
 * word) or completed it (every hidden word too, which then brings the next wheel).
 */
function afterChange(before, effect) {
  syncClock();
  saveGame();
  const g = game;
  const solvedNow = g.state.done && !before.done;
  const completeNow = isComplete(g.puzzle, g.state) && !isComplete(g.puzzle, before);
  const ms = g.ms === null ? null : Math.round(g.ms);
  if (solvedNow) {
    const lang = g.lang;
    bumpStats(lang, {
      solved: 1,
      words: g.puzzle.words.length,
      perfect: g.state.hints === 0 ? 1 : 0,
    });
    if (g.kind === "daily") {
      const days = dailyOf(lang);
      days[g.day] = { w: g.puzzle.words.length, x: g.state.extras.length, h: g.state.hints };
      if (ms !== null) days[g.day].t = ms;
      store.set(`daily-${lang}`, { days }, true);
      const s = statsOf(lang);
      if (ms !== null && (!s.fastDaily || ms < s.fastDaily)) store.set(`stats-${lang}`, { ...s, fastDaily: ms });
    }
    store.flush();
  }
  // The time it took, after the message that says the crossword is solved.
  const took = solvedNow && settings.timer && ms !== null ? ` ${t("solvedIn", { time: clockText(ms) })}` : "";
  refresh();
  // The effect says how long its letters fly; the celebration waits until the last one has landed.
  const flight = (effect && effect()) || 0;
  if (solvedNow || completeNow) {
    window.setTimeout(
      () => {
        if (game !== g) return;
        grid.setSolved(true, true);
        if (completeNow) {
          buzzPattern(["heavy", "success", "heavy"], 130);
          finishWheel(g, took);
          return;
        }
        buzzPattern(["heavy", "success"], 120);
        const left = hiddenOf(g.puzzle).length - hiddenFound(g.puzzle, g.state);
        notice(`${t("solvedNote", { left: tn("hiddenLeft", left) })}${took}`, "good big");
      },
      fx.still() ? 0 : flight + 120,
    );
  }
}

// Every word found: say so, light the jar, and bring the next wheel after a moment (not while a panel is open).
function finishWheel(g, took) {
  notice(`${t(g.kind === "daily" ? "completeDaily" : "completeNote")}${took}`, "good big");
  fx.flash($("jar"), "glow", 1800);
  window.clearTimeout(nextTimer);
  const go = () => {
    if (game !== g) return;
    if (document.querySelector("dialog[open]")) {
      nextTimer = window.setTimeout(go, 600);
      return;
    }
    nextWheel();
  };
  nextTimer = window.setTimeout(go, NEXT_AFTER_MS);
}

function useHint(key) {
  if (!game || game.state.done) return;
  if (hintsLeft(game.state) <= 0) {
    notice(t("noHints"), "bad");
    return;
  }
  const cell = key || hintCell(game.puzzle, game.state);
  if (!cell) return;
  const before = game.state;
  const next = showCell(game.puzzle, before, cell);
  if (!next) return;
  game.state = next;
  bumpStats(game.lang, { hints: 1 });
  const word = grid.wordAt(cell);
  notice(tn("hintsLeft", hintsLeft(next)), "good");
  afterChange(before, () => {
    grid.land(cell);
    if (word && next.found.includes(word.w) && !before.found.includes(word.w)) grid.flash(word, "found");
  });
}

// A tap on a hidden square asks, in a small card beside it, whether to show its letter with a hint.
function askCell(key, el) {
  if (!game || game.state.done) return;
  if (hintsLeft(game.state) <= 0) {
    notice(t("noHints"), "bad");
    return;
  }
  hideAsk();
  pendingCell = key;
  el.classList.add("pick");
  $("ask-left").textContent = tn("hintsLeft", hintsLeft(game.state));
  openPop($("dlg-ask"), el, "cell");
  $("ask-yes").focus({ preventScroll: true });
}

function hideAsk() {
  pendingCell = null;
  closeDialog($("dlg-ask"));
  document.querySelectorAll(".cell.pick").forEach((c) => c.classList.remove("pick"));
}

// ---- dialogs

const returnFocus = new WeakMap();

function openDialog(dlg) {
  if (dlg.open) return;
  returnFocus.set(dlg, document.activeElement);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
  syncClock();
}

function closeDialog(dlg) {
  if (!dlg.open) return;
  if (typeof dlg.close === "function") dlg.close();
  else {
    dlg.removeAttribute("open");
    dlg.dispatchEvent(new Event("close"));
  }
}

// Small cards (the word-language picker, the hint question) open beside what opened them: under it when there is
// room, else above it, and always inside the screen (on a short screen they move up).
const popAnchors = new Map();

function openPop(dlg, anchor, where) {
  openDialog(dlg);
  returnFocus.set(dlg, anchor);
  popAnchors.set(dlg, { anchor, where });
  placePop(dlg);
}

function placePop(dlg) {
  const at = popAnchors.get(dlg);
  if (!at || !dlg.open) return;
  const a = at.anchor.getBoundingClientRect();
  const margin = 8;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  // The layout size: the opening animation scales the card for a moment.
  const width = dlg.offsetWidth;
  const height = dlg.offsetHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const left = clamp(at.where === "cell" ? a.left + a.width / 2 - width / 2 : a.left, margin, vw - width - margin);
  let top = a.bottom + 6;
  if (top + height > vh - margin && a.top - 6 - height >= margin) top = a.top - 6 - height;
  top = clamp(top, margin, Math.max(margin, vh - height - margin));
  dlg.style.left = `${Math.round(left)}px`;
  dlg.style.top = `${Math.round(top)}px`;
  dlg.style.transformOrigin = top < a.top ? "50% 100%" : at.where === "cell" ? "50% 0" : "0 0";
}

window.addEventListener("resize", () => popAnchors.forEach((_, dlg) => placePop(dlg)));

document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("close", () => {
    syncClock();
    popAnchors.delete(dlg);
    const el = returnFocus.get(dlg);
    returnFocus.delete(dlg);
    if (el && el.isConnected && typeof el.focus === "function" && !document.querySelector("dialog[open]")) {
      el.focus({ preventScroll: true });
    }
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) closeDialog(dlg);
  });
});

// daily calendar
let calYear = 0;
let calMonth = 0;

function renderCalendar() {
  const lang = game ? game.lang : wordsLang();
  const solved = dailyOf(lang);
  const open = progressOf(lang).open;
  const now = today();
  const count = calendar.render(
    calYear,
    calMonth,
    now,
    (day) => (solved[day] ? "solved" : open[day] ? "started" : ""),
    i18n.lang,
  );
  let title = `${calMonth}/${calYear}`;
  try {
    title = new Intl.DateTimeFormat(i18n.lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(calYear, calMonth - 1, 1)),
    );
  } catch (e) {
    // the numeric title above
  }
  $("cal-month").textContent = title;
  $("cal-count").textContent = tn("solvedThisMonth", count);
  const [fy, fm] = FIRST_DAY.split("-").map(Number);
  const [ty, tm] = now.split("-").map(Number);
  $("cal-prev").disabled = calYear * 12 + calMonth <= fy * 12 + fm;
  $("cal-next").disabled = calYear * 12 + calMonth >= ty * 12 + tm;
}

function openCalendar() {
  const day = game && game.kind === "daily" ? game.day : today();
  [calYear, calMonth] = day.split("-").map(Number);
  renderCalendar();
  openDialog($("dlg-daily"));
}

function moveMonth(step) {
  calMonth += step;
  if (calMonth < 1) {
    calMonth = 12;
    calYear--;
  } else if (calMonth > 12) {
    calMonth = 1;
    calYear++;
  }
  renderCalendar();
}

// word book
function renderBook() {
  const lang = game ? game.lang : wordsLang();
  const book = bookOf(lang);
  const entries = Object.entries(book);
  $("book-count").textContent = entries.length ? `· ${tn("bookCount", entries.length)}` : "";
  // This wheel's finds: its hidden words (with the count) and its bonus words.
  $("book-wheel-section").hidden = !game;
  if (game) {
    const hidden = new Set(hiddenOf(game.puzzle));
    const byName = collator(lang).compare;
    const found = game.state.extras.filter((w) => hidden.has(w)).sort(byName);
    const bonus = game.state.extras.filter((w) => !hidden.has(w)).sort(byName);
    $("book-hidden-title").textContent = hidden.size
      ? t("bookHidden", { found: found.length, total: hidden.size })
      : t("jarNoneLong");
    fillWords($("book-hidden"), found);
    $("book-bonus-title").hidden = bonus.length === 0;
    fillWords($("book-bonus"), bonus);
  }
  const query = normalise($("book-search").value);
  const sortNew = document.querySelector('input[name="book-sort"]:checked').value === "new";
  const cmp = collator(lang).compare;
  const list = entries
    .filter(([w]) => !query || w.includes(query))
    .sort((a, b) => (sortNew ? (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : cmp(a[0], b[0])) : cmp(a[0], b[0])))
    .map(([w]) => w);
  fillWords($("book-list"), list);
  const empty = $("book-empty");
  empty.hidden = list.length > 0;
  empty.textContent = entries.length ? t("bookNoMatch") : t("bookEmpty");
  document.querySelector(".book-tools").hidden = entries.length === 0;
}

// A word with a meaning is a button that opens its meaning under it.
function fillWords(ul, words) {
  ul.textContent = "";
  const lang = game ? game.lang : wordsLang();
  const frag = document.createDocumentFragment();
  for (const w of words) {
    const li = document.createElement("li");
    li.lang = lang;
    if (meanings.peek(lang, w)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "word";
      b.dataset.word = w;
      b.setAttribute("aria-expanded", "false");
      b.textContent = w.toUpperCase();
      li.appendChild(b);
    } else li.textContent = w.toUpperCase();
    frag.appendChild(li);
  }
  ul.appendChild(frag);
}

function openBook() {
  renderBook();
  openDialog($("dlg-book"));
  // The first time, the language's meanings are read first; the book then shows again which words have one.
  meanings.load(game ? game.lang : wordsLang()).then((read) => {
    if (read.size && $("dlg-book").open && !$("dlg-book").querySelector(".word")) renderBook();
  });
}

function toggleMeaning(b) {
  const li = b.parentElement;
  const open = b.getAttribute("aria-expanded") !== "true";
  const old = li.querySelector(".m");
  if (old) old.remove();
  b.setAttribute("aria-expanded", String(open));
  li.classList.toggle("open", open);
  if (!open) return;
  const entry = meanings.peek(li.lang, b.dataset.word);
  if (!entry) return;
  const line = document.createElement("span");
  line.className = "m";
  line.textContent = meaningText(entry);
  li.appendChild(line);
}

// statistics
function renderStats() {
  const now = today();
  const rows = [
    ["stWheels", (l) => statsOf(l).solved],
    ["stLevel", (l) => progressOf(l).level + 1],
    ["stDaily", (l) => Object.keys(dailyOf(l)).length],
    ["stStreak", (l) => streaks(new Set(Object.keys(dailyOf(l))), now).current],
    ["stLongest", (l) => streaks(new Set(Object.keys(dailyOf(l))), now).longest],
    ["stWords", (l) => statsOf(l).words],
    ["stBook", (l) => Object.keys(bookOf(l)).length],
    ["stPerfect", (l) => statsOf(l).perfect],
    ["stHints", (l) => statsOf(l).hints],
    ["stFastDaily", (l) => (statsOf(l).fastDaily ? clockText(statsOf(l).fastDaily) : "–")],
  ];
  const body = $("stats-body");
  body.textContent = "";
  const fmt = new Intl.NumberFormat(i18n.lang);
  for (const [key, value] of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = t(key);
    tr.appendChild(th);
    for (const lang of LANGS) {
      const td = document.createElement("td");
      const v = value(lang);
      td.textContent = typeof v === "number" ? fmt.format(v) : v;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}

// settings
function syncSettingsForm() {
  const check = (name, value) => {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  check("words", game ? game.lang : wordsLang());
  check("size", String(settings.size));
  check("letters", lettersChoice());
  check("theme", settings.theme);
  check("ui", settings.ui);
  $("opt-contrast").checked = settings.contrast;
  $("opt-vibration").checked = settings.vibration;
  $("opt-meanings").checked = settings.meanings;
  $("opt-timer").checked = settings.timer;
  $("app-version").hidden = !appVersion;
  $("app-version").textContent = appVersion ? t("versionLine", { version: appVersion }) : "";
}

function onSetting(e) {
  const input = e.target;
  const switches = ["opt-contrast", "opt-vibration", "opt-meanings", "opt-timer"];
  if (!input.name && !switches.includes(input.id)) return;
  if (input.id === "opt-contrast") settings.contrast = input.checked;
  else if (input.id === "opt-meanings") {
    settings.meanings = input.checked;
    if (game && settings.meanings) meanings.load(game.lang);
  } else if (input.id === "opt-timer") {
    settings.timer = input.checked;
    syncClock();
  }
  else if (input.id === "opt-vibration") {
    settings.vibration = input.checked;
    buzz("success");
  } else if (input.name === "size") settings.size = input.value === "grow" ? "grow" : Number(input.value);
  else if (input.name === "letters") settings.letters = input.value;
  else if (input.name === "theme") settings.theme = input.value;
  else if (input.name === "ui") {
    settings.ui = input.value;
    i18n.setLang(uiLang());
    translatePage();
    refresh();
    showCurrent([]);
    wheel.clear();
  } else if (input.name === "words") {
    switchLang(input.value);
    return;
  }
  store.set("settings", settings);
  applyLook();
}

// ---- wiring

const on = (id, fn) => $(id).addEventListener("click", fn);

// The word-language pill opens the picker; a row switches and closes it, the ticked row only closes it.
on("btn-lang", () => {
  showLang();
  openPop($("dlg-lang"), $("btn-lang"), "pill");
  $("btn-lang").setAttribute("aria-expanded", "true");
  const current = document.querySelector('.lang-row[aria-current="true"]');
  if (current) current.focus({ preventScroll: true });
});
$("dlg-lang").addEventListener("close", () => $("btn-lang").setAttribute("aria-expanded", "false"));
document.querySelectorAll(".lang-row").forEach((row) =>
  row.addEventListener("click", () => {
    closeDialog($("dlg-lang"));
    switchLang(row.dataset.lang);
  }),
);
$("dlg-ask").addEventListener("close", () => {
  pendingCell = null;
  document.querySelectorAll(".cell.pick").forEach((c) => c.classList.remove("pick"));
});
on("btn-daily", openCalendar);
on("btn-book", openBook);
on("btn-jar", openBook);
$("dlg-book").addEventListener("click", (e) => {
  const b = e.target.closest("button.word");
  if (b) toggleMeaning(b);
});
on("btn-stats", () => {
  renderStats();
  openDialog($("dlg-stats"));
});
on("btn-help", () => openDialog($("dlg-help")));
on("btn-settings", () => {
  syncSettingsForm();
  openDialog($("dlg-settings"));
});
on("btn-switch", () => {
  if (!game) return;
  if (game.kind === "daily" || game.state.done) nextWheel();
  else openDaily(today());
});
on("btn-shuffle", () => {
  wheel.shuffle();
  fx.flash($("btn-shuffle"), "turn", 520);
});
on("btn-hint", () => useHint(null));
on("btn-enter", () => wheel.submit());

// The delete button: a tap takes the last letter back; holding it clears the whole word.
let holdTimer = 0;
let held = false;
const clearBtn = $("btn-clear");
clearBtn.addEventListener("pointerdown", (e) => {
  if (e.button !== undefined && e.button > 0) return;
  held = false;
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    held = true;
    wheel.clear();
    buzz("medium");
  }, HOLD_MS);
});
for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
  clearBtn.addEventListener(type, () => {
    window.clearTimeout(holdTimer);
    // The click after a hold must not take a letter of nothing; a later click (a key) counts again.
    if (held) window.setTimeout(() => (held = false), 0);
  });
}
clearBtn.addEventListener("contextmenu", (e) => e.preventDefault());
on("btn-clear", () => {
  if (held) {
    held = false;
    return;
  }
  wheel.pop();
});
on("ask-yes", () => {
  const key = pendingCell;
  hideAsk();
  if (key) useHint(key);
});
on("ask-no", hideAsk);
on("btn-retry", () => retry());
on("cal-prev", () => moveMonth(-1));
on("cal-next", () => moveMonth(1));
on("daily-close", () => closeDialog($("dlg-daily")));
on("daily-play", () => {
  closeDialog($("dlg-daily"));
  openDaily(today());
});
on("book-done", () => closeDialog($("dlg-book")));
on("stats-done", () => closeDialog($("dlg-stats")));
on("help-done", () => closeDialog($("dlg-help")));
on("settings-done", () => closeDialog($("dlg-settings")));
$("book-search").addEventListener("input", renderBook);
$("book-sort").addEventListener("change", renderBook);
$("dlg-settings").addEventListener("change", onSetting);

document.addEventListener("keydown", (e) => {
  if (!game || document.querySelector("dialog[open]")) return;
  const target = e.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Backspace") wheel.pop();
  else if (e.key === "Enter" && target && target.classList && target.classList.contains("tile")) return;
  else if (e.key === "Enter" && wheel.length) wheel.submit();
  else if (e.key === "Escape") wheel.clear();
  else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
    if (!wheel.type(e.key)) return;
  } else return;
  e.preventDefault();
});

if (darkQuery && typeof darkQuery.addEventListener === "function") darkQuery.addEventListener("change", applyLook);
if (typeof ResizeObserver === "function") new ResizeObserver(sizeWheel).observe($("play"));
else window.addEventListener("resize", sizeWheel);

// ---- life cycle: save when the app goes to the background

function persist() {
  saveGame(true);
  store.flush();
}
document.addEventListener("visibilitychange", () => {
  syncClock();
  if (document.hidden) persist();
});
window.addEventListener("pagehide", persist);
if (host && host.app && typeof host.app.on === "function") {
  try {
    host.app.on("pause", persist);
  } catch (e) {
    // An older host without this event: the page events above still save.
  }
}

// Waits for Zapli's bridge at most a moment; a page outside Zapli has none.
async function hostReady() {
  if (!host) return false;
  try {
    await Promise.race([host.ready, new Promise((resolve, reject) => window.setTimeout(reject, 2500))]);
    return true;
  } catch (e) {
    return false;
  }
}

async function start() {
  store.loadLocal();
  if (host) await store.loadKv(host);
  settings = normSettings(store.get("settings"));
  if (await hostReady()) {
    try {
      canBuzz = Boolean(host.haptics && typeof host.supports === "function" && host.supports("haptics.impact"));
    } catch (e) {
      canBuzz = false;
    }
    // The version for Settings, asked for in the background so the game never waits for it.
    try {
      host.app
        .info()
        .then((info) => {
          appVersion = info && typeof info.version === "string" ? info.version : "";
        })
        .catch(() => {});
    } catch (e) {
      appVersion = "";
    }
  }
  $("opt-vibration-row").hidden = !canBuzz;
  measureTextScale();
  i18n.setLang(uiLang());
  translatePage();
  applyLook();
  setLoading(true, false);
  showCurrent([]);
  const lang = wordsLang();
  source.preload(lang);
  await openActive(lang);
  source.preload(lang === "sk" ? "en" : "sk");
}

start();
