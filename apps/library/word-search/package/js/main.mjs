// Word Search: the page. It wires the saved state, the puzzles, the letter grid, the word list and the dialogs.
//
// Saved values (js/core/store.mjs), each per language where it says <lang>:
//   settings            the player's choices
//   progress-<lang>     the endless puzzle's number and the puzzle in play, the one left for another theme (for
//                       Undo), the daily puzzles started, the theme chosen for the next puzzle and the latest
//                       hidden messages
//   collection-<lang>   every word found, by theme, and the puzzles solved of each theme
//   stats-<lang>        puzzles solved, words found, hints used, best times by grid size
//   daily-<lang>        the daily puzzles solved, by date, with their time and hints

import { createStore } from "./core/store.mjs";
import { createI18n, pickLang } from "./core/i18n.mjs";
import { isoDay, isDay, FIRST_DAY, daysBetween, dayNumber, streaks } from "./core/dates.mjs";
import { collator, displayWord } from "./core/letters.mjs";
import { hashText } from "./core/rng.mjs";
import { STRINGS } from "./search/strings.mjs";
import { generate } from "./search/generator.mjs";
import { library, themeById, themeAt, themeFits } from "./search/themes.mjs";
import { endlessSpec, dailySpec, wordsNeeded, DIFFICULTIES } from "./search/levels.mjs";
import {
  newState,
  readState,
  cellsOf,
  selectionResult,
  markFound,
  hintTarget,
  takeHint,
  hiddenMessageCells,
  capsuleColour,
} from "./search/puzzle.mjs";
import { createBoard } from "./ui/board-view.mjs";
import { createCalendar } from "./ui/calendar-view.mjs";

const host = window.zapli;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const LANGS = ["sk", "en"];
const GLYPH = { normal: 0.56, large: 0.65, largest: 0.74 };
const OPEN_DAYS_KEPT = 10;
const RECENT_MESSAGES = 24;

const i18n = createI18n(STRINGS);
const t = (key, args) => i18n.t(key, args);
const tn = (key, n, args) => i18n.tn(key, n, args);

const store = createStore("word-search", [
  "settings",
  ...LANGS.flatMap((l) => [`progress-${l}`, `collection-${l}`, `stats-${l}`, `daily-${l}`]),
]);

let settings = null;
let game = null; // { lang, kind: "endless" | "daily", day, puzzle, state }
let pendingWord = null; // the word chosen in the list for a hint
let freshHint = null; // the word whose hint was just given: its mark pulses once
let strikeWord = null; // the word just found: its line in the list is drawn
let textScale = 1;
let canBuzz = false;
let clockTimer = 0;
let lastTick = 0;
const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const still = () => Boolean(motionQuery && motionQuery.matches);

const today = () => {
  const day = isoDay(new Date());
  return daysBetween(FIRST_DAY, day) < 0 ? FIRST_DAY : day;
};

function randomSeed() {
  try {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0];
  } catch (e) {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
}

// ---- saved values, checked as they are read

function normSettings(raw) {
  const s = raw || {};
  return {
    ui: ["auto", "sk", "en"].includes(s.ui) ? s.ui : "auto",
    words: LANGS.includes(s.words) ? s.words : null,
    difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : "grow",
    letters: s.letters in GLYPH ? s.letters : null,
    contrast: Boolean(s.contrast),
    theme: ["device", "light", "dark"].includes(s.theme) ? s.theme : "device",
    timer: Boolean(s.timer),
    message: s.message !== false,
    vibration: s.vibration !== false,
    helped: Boolean(s.helped),
  };
}

// A saved puzzle is used only when it is whole: a damaged one is dropped and a new one made.
function validPuzzle(p, lang) {
  if (!p || typeof p !== "object" || p.lang !== lang || !themeById(lang, p.theme)) return false;
  if (!Number.isInteger(p.size) || p.size < 4 || p.size > 14) return false;
  if (!Array.isArray(p.grid) || p.grid.length !== p.size * p.size || !p.grid.every((x) => typeof x === "string")) {
    return false;
  }
  if (!Array.isArray(p.words) || !p.words.length) return false;
  return p.words.every(
    (x) =>
      x &&
      typeof x.w === "string" &&
      Number.isInteger(x.r) &&
      Number.isInteger(x.c) &&
      Number.isInteger(x.n) &&
      ["e", "s", "se", "ne", "w", "n", "nw", "sw"].includes(x.d),
  );
}

function gameOf(raw, lang) {
  if (!raw || !validPuzzle(raw.puzzle, lang)) return null;
  return { puzzle: raw.puzzle, state: readState(raw.state, raw.puzzle) };
}

function progressOf(lang) {
  const p = store.get(`progress-${lang}`) || {};
  const open = {};
  if (p.open && typeof p.open === "object") {
    for (const [day, g] of Object.entries(p.open)) {
      const ok = isDay(day) && gameOf(g, lang);
      if (ok) open[day] = ok;
    }
  }
  return {
    level: Number.isInteger(p.level) && p.level >= 0 ? p.level : 0,
    endless: gameOf(p.endless, lang),
    prev: gameOf(p.prev, lang),
    open,
    active: p.active === "endless" || isDay(p.active) ? p.active : "endless",
    next: typeof p.next === "string" && themeById(lang, p.next) ? p.next : null,
    recent: Array.isArray(p.recent) ? p.recent.filter((x) => typeof x === "string").slice(-RECENT_MESSAGES) : [],
  };
}

const saveProgress = (lang, p, now) => store.set(`progress-${lang}`, p, now);

function collectionOf(lang) {
  const c = store.get(`collection-${lang}`);
  const out = {};
  if (c && c.themes && typeof c.themes === "object") {
    for (const [id, x] of Object.entries(c.themes)) {
      const theme = themeById(lang, id);
      if (!theme || !x || typeof x !== "object") continue;
      const known = new Set(theme.words.map((w) => w.w));
      const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
      out[id] = {
        w: Array.isArray(x.w) ? x.w.filter((w, i, all) => known.has(w) && all.indexOf(w) === i) : [],
        s: n(x.s),
        p: n(x.p),
      };
    }
  }
  return out;
}

const themeDone = (lang, id, coll) => {
  const theme = themeById(lang, id);
  return Boolean(theme && coll[id] && coll[id].w.length >= theme.words.length);
};

function statsOf(lang) {
  const s = store.get(`stats-${lang}`) || {};
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const best = {};
  if (s.best && typeof s.best === "object") {
    for (const [size, ms] of Object.entries(s.best)) if (/^\d+$/.test(size) && n(ms) > 0) best[size] = n(ms);
  }
  return { solved: n(s.solved), words: n(s.words), hints: n(s.hints), perfect: n(s.perfect), best };
}

function dailyOf(lang) {
  const d = store.get(`daily-${lang}`);
  const out = {};
  if (d && d.days && typeof d.days === "object")
    for (const [day, x] of Object.entries(d.days)) if (isDay(day)) out[day] = x;
  return out;
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

const wordsLang = () => settings.words || uiLang();

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
  $("btn-undo").setAttribute("aria-label", t("undoLabel"));
  board.relabel();
}

const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function applyLook() {
  if (settings.theme === "device") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  const dark = settings.theme === "dark" || (settings.theme === "device" && darkQuery && darkQuery.matches);
  root.classList.toggle("dark-now", Boolean(dark));
  root.classList.toggle("contrast", settings.contrast);
  root.style.setProperty("--glyph", String(GLYPH[lettersChoice()]));
  board.fit();
}

// The phone's text size, from a probe line of 100 px text: letters drawn into squares are divided by it, and it
// picks the letter size until the player chooses one.
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

// ---- the board

const board = createBoard($("board"), {
  onSelect,
  onCursor: (i) => {
    if (!game || i < 0) return;
    const tile = game.puzzle.grid[i];
    announce(`${tile.toUpperCase()}, ${Math.floor(i / game.puzzle.size) + 1}, ${(i % game.puzzle.size) + 1}`);
  },
  labels: { grid: (n) => t("gridLabel", { n }) },
});

$("board").addEventListener("pointerdown", () => clearFeedback());

function foundList(g) {
  return g.state.found
    .map((w, k) => {
      const word = g.puzzle.words.find((x) => x.w === w);
      return word ? { word: w, cells: cellsOf(g.puzzle, word), colour: capsuleColour(g.puzzle, k) } : null;
    })
    .filter(Boolean);
}

function hintList() {
  const out = [];
  for (const [w, level] of Object.entries(game.state.hints)) {
    const word = game.puzzle.words.find((x) => x.w === w);
    if (word) out.push({ cells: cellsOf(game.puzzle, word), level, fresh: w === freshHint && !still() });
  }
  freshHint = null;
  return out;
}

const fitSoon = () => window.requestAnimationFrame(() => board.fit());

// ---- feedback: a line that stays until the player's next action

function notice(text, tone, undoable) {
  const el = $("notice");
  el.textContent = text || "";
  el.className = `notice ${tone || ""}`;
  $("btn-undo").hidden = !undoable;
  hideAsk();
  $("first-help").hidden = true;
}

// The message slot holds two lines of a message at the phone's text size, measured, so a message never moves the
// grid.
function measureSlot() {
  const h = $("notice-probe").getBoundingClientRect().height;
  if (h > 0) root.style.setProperty("--slot", `${Math.ceil(h + 8)}px`);
}

function clearFeedback() {
  $("notice").textContent = "";
  $("btn-undo").hidden = true;
  hideAsk();
  showFirstHelp();
}

function showFirstHelp() {
  const show = !settings.helped && Boolean(game) && !game.state.found.length && !$("notice").textContent;
  $("first-help").hidden = !show || !$("ask").hidden;
}

function announce(text) {
  const sr = $("sr");
  sr.textContent = "";
  window.setTimeout(() => {
    sr.textContent = text;
  }, 30);
}

// ---- Back: every open panel (the hint bar, a dialog) has an entry in the page's history, added in the tap that
// opens it, so the phone's Back closes the panel first instead of leaving the game. An entry carries how many
// panels were open, and Back closes those above it. A panel closed another way takes its own entry back.

const layers = []; // [{ name, close }], the newest last

function pushLayer(name, close) {
  layers.push({ name, close });
  try {
    window.history.pushState({ wsDepth: layers.length }, "");
  } catch (e) {
    // no history in this page: the panel still closes with its own buttons
  }
}

function dropLayer(name) {
  const i = layers.findIndex((x) => x.name === name);
  if (i < 0) return;
  layers.splice(i, 1);
  try {
    window.history.back();
  } catch (e) {
    // as above
  }
}

window.addEventListener("popstate", (e) => {
  const depth = (e.state && Number.isInteger(e.state.wsDepth) && e.state.wsDepth) || 0;
  while (layers.length > depth) layers.pop().close();
});

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

// ---- the clock: time counts while the puzzle is on screen, unsolved and no dialog is open

const formatTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

function tick() {
  const now = performance.now();
  if (game && !game.state.done && !document.hidden && !document.querySelector("dialog[open]")) {
    game.state.ms += Math.min(now - lastTick, 5000);
  }
  lastTick = now;
  showClock();
}

function showClock() {
  const el = $("clock");
  el.hidden = !(settings.timer && game);
  if (el.hidden) return;
  const text = formatTime(game.state.ms);
  el.textContent = text;
  el.setAttribute("aria-label", t("timerAria", { time: text }));
}

function startClock() {
  window.clearInterval(clockTimer);
  lastTick = performance.now();
  clockTimer = window.setInterval(tick, 1000);
  showClock();
}

// ---- making and opening puzzles

function makeEndless(lang, themeId, p) {
  const spec = endlessSpec(p.level, settings.difficulty);
  const need = wordsNeeded(spec.size);
  const fits = (id) => {
    const theme = themeById(lang, id);
    return Boolean(theme && themeFits(theme, spec.size, need));
  };
  const tries = [];
  if (themeId && fits(themeId)) tries.push(themeId);
  for (let k = 0; k < library(lang).themes.length * 2 && tries.length < 4; k++) {
    const id = themeAt(lang, "endless", p.level + k);
    if (fits(id) && !tries.includes(id)) tries.push(id);
  }
  const coll = collectionOf(lang);
  for (const id of tries) {
    const theme = themeById(lang, id);
    const have = new Set(coll[id] ? coll[id].w : []);
    const puzzle = generate({
      lang,
      themeId: id,
      size: spec.size,
      dirs: spec.dirs,
      seed: randomSeed(),
      withMessage: settings.message,
      prefer: new Set(theme.words.map((x) => x.w).filter((w) => !have.has(w))),
      avoidMessages: new Set(p.recent),
    });
    if (puzzle) return { ...puzzle, kind: "endless", level: p.level, hideList: spec.hideList };
  }
  return null;
}

function makeDaily(lang, day) {
  const spec = dailySpec(day);
  const n = dayNumber(day);
  for (let k = 0; k < library(lang).themes.length; k++) {
    const id = themeAt(lang, "daily", n + k);
    const theme = themeById(lang, id);
    if (!themeFits(theme, spec.size, wordsNeeded(spec.size))) continue;
    const puzzle = generate({
      lang,
      themeId: id,
      size: spec.size,
      dirs: spec.dirs,
      seed: hashText(`daily/${lang}/${day}`),
      withMessage: true,
    });
    if (puzzle) return { ...puzzle, kind: "daily", day, hideList: false };
  }
  return null;
}

function failed(on) {
  $("failed").hidden = !on;
}

function show(g) {
  game = g;
  failed(false);
  pendingWord = null;
  board.set(g.puzzle, foundList(g));
  board.setNextColour(capsuleColour(g.puzzle, g.state.found.length));
  board.setHints(hintList());
  board.relabel();
  renderWords();
  refresh();
  fitSoon();
  if (g.state.done) showSolved(false);
  else hideSolved();
  clearFeedback();
  startClock();
}

/** Opens what a language had on screen last: a daily puzzle, or the endless puzzle. */
function openActive(lang) {
  const p = progressOf(lang);
  if (p.active !== "endless" && p.open[p.active]) {
    const g = p.open[p.active];
    show({ lang, kind: "daily", day: p.active, puzzle: g.puzzle, state: g.state });
    return;
  }
  openEndless(lang);
}

function openEndless(lang) {
  const p = progressOf(lang);
  if (p.endless) {
    p.active = "endless";
    saveProgress(lang, p);
    show({ lang, kind: "endless", puzzle: p.endless.puzzle, state: p.endless.state });
    return;
  }
  const puzzle = makeEndless(lang, p.next, p);
  if (!puzzle) {
    game = null;
    failed(true);
    return;
  }
  p.endless = { puzzle, state: newState() };
  p.next = null;
  p.active = "endless";
  saveProgress(lang, p, true);
  show({ lang, kind: "endless", puzzle, state: p.endless.state });
}

function openDaily(day) {
  const lang = game ? game.lang : wordsLang();
  saveGame(true);
  const p = progressOf(lang);
  let g = p.open[day];
  if (!g) {
    const puzzle = makeDaily(lang, day);
    if (!puzzle) {
      notice(t("makeFailed"), "bad");
      return;
    }
    const state = newState();
    // A day solved before shows its solution again.
    const solved = dailyOf(lang)[day];
    if (solved) {
      state.found = puzzle.words.map((x) => x.w);
      state.done = true;
      state.ms = Number.isFinite(solved.ms) ? solved.ms : 0;
      state.used = Number.isInteger(solved.h) ? solved.h : 0;
    }
    g = { puzzle, state };
  }
  p.open[day] = g;
  p.active = day;
  pruneOpen(lang, p);
  saveProgress(lang, p, true);
  show({ lang, kind: "daily", day, puzzle: g.puzzle, state: g.state });
}

// Keeps the daily puzzle in play and the latest unfinished ones; a solved one is dropped once it is left.
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

/** Goes on to a new endless puzzle (of `themeId` when given). */
function nextPuzzle(themeId) {
  if (!game) return;
  const lang = game.lang;
  const fromDaily = game.kind === "daily";
  saveGame(true);
  const p = progressOf(lang);
  if (p.endless && p.endless.state.done) {
    p.level += 1;
    p.endless = null;
  }
  if (themeId) {
    if (p.endless && p.endless.state.found.length) p.prev = p.endless;
    p.endless = null;
    p.next = themeId;
  }
  p.active = "endless";
  pruneOpen(lang, p);
  saveProgress(lang, p, true);
  const left = p.prev;
  openEndless(lang);
  if (fromDaily && !themeId) notice(t("afterDaily"), "good");
  else if (themeId && game) notice(t("newTheme", { theme: themeById(lang, game.puzzle.theme).name }), "good", !!left);
}

function undoTheme() {
  if (!game) return;
  const lang = game.lang;
  const p = progressOf(lang);
  if (!p.prev) return;
  p.endless = p.prev;
  p.prev = null;
  p.active = "endless";
  saveProgress(lang, p, true);
  show({ lang, kind: "endless", puzzle: p.endless.puzzle, state: p.endless.state });
}

function switchLang(lang) {
  if (!LANGS.includes(lang) || (game && game.lang === lang)) return;
  saveGame(true);
  settings.words = lang;
  store.set("settings", settings);
  syncSettingsForm();
  openActive(lang);
  if (game) notice(t(lang === "sk" ? "langNowSk" : "langNowEn"), "good");
}

// ---- playing

function saveGame(now) {
  if (!game) return;
  const p = progressOf(game.lang);
  const g = { puzzle: game.puzzle, state: game.state };
  if (game.kind === "endless") p.endless = g;
  else {
    p.open[game.day] = g;
    p.active = game.day;
  }
  saveProgress(game.lang, p, now);
}

function bumpStats(lang, change) {
  const s = statsOf(lang);
  for (const [k, v] of Object.entries(change)) s[k] += v;
  store.set(`stats-${lang}`, s);
}

function collect(lang, themeId, word) {
  const coll = collectionOf(lang);
  const entry = coll[themeId] || { w: [], s: 0, p: 0 };
  if (!entry.w.includes(word)) entry.w.push(word);
  coll[themeId] = entry;
  store.set(`collection-${lang}`, { themes: coll });
}

function onSelect(a, b) {
  if (!game || game.state.done) return { result: "none" };
  clearFeedback();
  const r = selectionResult(game.puzzle, game.state, a, b);
  if (r.result === "found") foundWord(r.word);
  else if (r.result === "again") {
    board.flashFound(r.word.w);
    notice(t("alreadyFound", { word: displayWord(r.word.w) }), "soft");
  }
  return r;
}

function foundWord(word) {
  const g = game;
  const { puzzle } = g;
  g.state = markFound(puzzle, g.state, word);
  const k = g.state.found.length - 1;
  board.addFound(cellsOf(puzzle, word), word.w, capsuleColour(puzzle, k), !still());
  board.setNextColour(capsuleColour(puzzle, k + 1));
  board.setHints(hintList());
  collect(g.lang, puzzle.theme, word.w);
  bumpStats(g.lang, { words: 1 });
  if (!settings.helped) {
    settings.helped = true;
    store.set("settings", settings);
  }
  strikeWord = word.w;
  renderWords();
  refresh();
  saveGame();
  if (g.state.done) {
    solve();
    return;
  }
  buzz("light");
  notice(t("found", { word: displayWord(word.w) }), "good");
}

function solve() {
  const g = game;
  const lang = g.lang;
  tick();
  window.clearInterval(clockTimer);
  const before = collectionOf(lang);
  const wasDone = themeDone(lang, g.puzzle.theme, before);
  const perfect = g.state.used === 0;
  const s = statsOf(lang);
  s.solved += 1;
  if (perfect) s.perfect += 1;
  const size = String(g.puzzle.size);
  if (g.state.ms > 0 && (!s.best[size] || g.state.ms < s.best[size])) s.best[size] = Math.round(g.state.ms);
  store.set(`stats-${lang}`, s);
  const entry = before[g.puzzle.theme] || { w: [], s: 0, p: 0 };
  entry.s += 1;
  if (perfect) entry.p += 1;
  before[g.puzzle.theme] = entry;
  store.set(`collection-${lang}`, { themes: before });
  if (g.kind === "daily") {
    const days = dailyOf(lang);
    days[g.day] = { ms: Math.round(g.state.ms), h: g.state.used };
    store.set(`daily-${lang}`, { days }, true);
  }
  const p = progressOf(lang);
  if (g.puzzle.message) {
    p.recent = p.recent
      .filter((x) => x !== g.puzzle.message)
      .concat(g.puzzle.message)
      .slice(-RECENT_MESSAGES);
  }
  saveProgress(lang, p);
  saveGame(true);
  store.flush();
  refresh();
  const nowDone = themeDone(lang, g.puzzle.theme, collectionOf(lang));
  showSolved(!still(), nowDone && !wasDone);
  buzzPattern(["success", "medium", "success"], 140);
}

// ---- the word list

function renderWords() {
  const { puzzle, state } = game;
  const ul = $("word-list");
  ul.textContent = "";
  const cmp = collator(game.lang).compare;
  const order = state.found.slice();
  const words = puzzle.words.slice().sort((a, b) => cmp(a.w, b.w));
  const frag = document.createDocumentFragment();
  for (const word of words) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pill";
    btn.dataset.w = word.w;
    const k = order.indexOf(word.w);
    const found = k >= 0;
    const hint = state.hints[word.w] || 0;
    const blank = puzzle.hideList && !found;
    const text = document.createElement("span");
    text.className = "txt";
    if (blank) {
      const first = hint ? puzzle.grid[cellsOf(puzzle, word)[0]].toUpperCase() : "";
      text.textContent = first + "•".repeat(word.n - (first ? 1 : 0));
      btn.classList.add("blank");
    } else text.textContent = displayWord(word.w);
    text.lang = game.lang;
    btn.appendChild(text);
    if (found) {
      btn.classList.add("found", `c${capsuleColour(puzzle, k)}`);
      if (word.w === strikeWord && !still()) btn.classList.add("strike");
      btn.setAttribute("aria-label", t("pillFound", { word: displayWord(word.w) }));
    } else {
      if (hint) btn.classList.add(`hint${hint}`);
      btn.setAttribute(
        "aria-label",
        blank ? t("pillHidden", { n: word.n }) : t("pillOpen", { word: displayWord(word.w) }),
      );
    }
    li.appendChild(btn);
    frag.appendChild(li);
  }
  ul.appendChild(frag);
  strikeWord = null;
  window.requestAnimationFrame(markMore);
  const msg = $("message-line");
  msg.hidden = !puzzle.message || state.done;
  if (puzzle.message) msg.textContent = tn("messageLine", hiddenMessageCells(puzzle).length);
}

$("word-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if (!btn || !game || game.state.done) return;
  const word = game.puzzle.words.find((x) => x.w === btn.dataset.w);
  if (!word) return;
  if (game.state.found.includes(word.w)) {
    clearFeedback();
    board.flashFound(word.w);
    return;
  }
  // A tap opens the bar (and its history entry); a tap on another word while it is open only changes the word.
  if ($("ask").hidden) {
    clearFeedback();
    pushLayer("ask", () => hideAsk(true));
  } else $("notice").textContent = "";
  askHint(word, e.detail === 0);
});

// The bar floats over the word list, just above the toolbar, measured each time it opens or the page changes size.
function placeAsk() {
  const bar = $("ask");
  if (bar.hidden) return;
  const tools = document.querySelector(".bottom").getBoundingClientRect();
  const side = $("status").getBoundingClientRect();
  const height = window.innerHeight || document.documentElement.clientHeight;
  const width = window.innerWidth || document.documentElement.clientWidth;
  bar.style.bottom = `${Math.max(8, height - tools.top + 8)}px`;
  bar.style.left = `${Math.max(8, side.left)}px`;
  bar.style.right = `${Math.max(8, width - side.right)}px`;
}

// A soft fade at the bottom of the word list while more of it is below.
function markMore() {
  const box = $("below");
  box.classList.toggle("more", box.scrollHeight - box.scrollTop - box.clientHeight > 4);
}
$("below").addEventListener("scroll", markMore, { passive: true });

function askHint(word, byKeyboard) {
  pendingWord = word;
  $("ask-word").textContent = game.puzzle.hideList ? t("askHidden", { n: word.n }) : displayWord(word.w);
  $("ask-word").lang = game.lang;
  const level = game.state.hints[word.w] || 0;
  $("ask-first").disabled = level >= 1;
  $("ask-where").disabled = level >= 2;
  $("first-help").hidden = true;
  $("ask").hidden = false;
  placeAsk();
  document.querySelectorAll(".pill.picked").forEach((x) => x.classList.remove("picked"));
  const pill = $("word-list").querySelector(`.pill[data-w="${CSS.escape(word.w)}"]`);
  if (pill) pill.classList.add("picked");
  // Keyboard users go straight to the choices; a finger's tap leaves the focus where it was.
  if (byKeyboard) (level >= 1 ? $("ask-where") : $("ask-first")).focus({ preventScroll: true });
}

function hideAsk(fromBack) {
  if ($("ask").hidden) return;
  pendingWord = null;
  $("ask").hidden = true;
  document.querySelectorAll(".pill.picked").forEach((x) => x.classList.remove("picked"));
  if (!fromBack) dropLayer("ask");
}

// ---- hints

function giveHint(word, wanted) {
  if (!game || game.state.done || !word) return;
  const r = takeHint(game.state, word, wanted);
  clearFeedback();
  if (!r) {
    notice(t("hintNone"), "soft");
    return;
  }
  game.state = r.state;
  freshHint = word.w;
  board.setHints(hintList());
  bumpStats(game.lang, { hints: 1 });
  renderWords();
  saveGame();
  buzz("light");
  const first = game.puzzle.grid[cellsOf(game.puzzle, word)[0]].toUpperCase();
  if (r.level === 1) notice(t("hintFirst", { letter: first }), "hint");
  else if (game.puzzle.hideList) notice(t("hintWhereHidden", { n: word.n }), "hint");
  else notice(t("hintWhere", { word: displayWord(word.w) }), "hint");
}

function toolbarHint() {
  if (!game || game.state.done) return;
  const word = hintTarget(game.puzzle, game.state);
  if (!word || (game.state.hints[word.w] || 0) >= 2) {
    clearFeedback();
    notice(t("hintNone"), "soft");
    return;
  }
  giveHint(word);
}

// ---- status line

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

function refresh() {
  if (!game) return;
  const { puzzle, state } = game;
  const theme = themeById(game.lang, puzzle.theme);
  $("theme-name").textContent = theme ? theme.name : "";
  $("theme-name").lang = game.lang;
  const size = t("sizeLabel", { n: puzzle.size });
  $("mode-label").textContent =
    game.kind === "daily"
      ? t("dailyLabel", { date: longDate(game.day), size })
      : t("endlessLabel", { n: (puzzle.level || 0) + 1, size });
  $("progress").textContent = `${state.found.length}/${puzzle.words.length}`;
  $("progress").setAttribute(
    "aria-label",
    t("progressAria", { found: state.found.length, total: puzzle.words.length }),
  );
  const chip = $("btn-switch");
  const todayDone = Boolean(dailyOf(game.lang)[today()]);
  chip.hidden = state.done || (game.kind === "endless" && todayDone);
  chip.textContent = game.kind === "daily" ? t("toEndless") : t("toToday");
  $("btn-hint").disabled = state.done;
  $("lang-code").textContent = game.lang.toUpperCase();
  $("lang-name").textContent = t(game.lang === "sk" ? "wordsSk" : "wordsEn");
  $("btn-lang").setAttribute("aria-label", t(game.lang === "sk" ? "langToggleSk" : "langToggleEn"));
  $("btn-lang").title = $("btn-lang").getAttribute("aria-label");
  $("daily-dot").hidden = todayDone;
  $("btn-daily").setAttribute("aria-label", todayDone ? t("daily") : t("dailyTodo"));
  showClock();
}

// ---- the solved panel

function hideSolved() {
  $("solved").hidden = true;
  $("words").hidden = false;
  $("app").classList.remove("is-solved");
}

// The hidden message letter by letter: each letter appears as its square lights in the grid (the same delays as
// the board's), a Slovak CH as one letter.
function revealText(text, lang, base, step, animate) {
  const out = $("reveal-text");
  out.textContent = "";
  out.lang = lang;
  const chars = Array.from(text.toUpperCase());
  let k = -1;
  chars.forEach((ch, i) => {
    const span = document.createElement("span");
    span.textContent = ch;
    if (/\p{L}/u.test(ch)) {
      // A Slovak CH is one square of the grid: its H appears with its C.
      if (!(lang === "sk" && ch === "H" && chars[i - 1] === "C")) k++;
      span.className = "rl";
      if (animate) span.style.animationDelay = `${base + k * step}ms`;
    }
    out.appendChild(span);
  });
  out.setAttribute("aria-label", text);
}

function showSolved(animate, themeCompleted) {
  const { puzzle, state } = game;
  const lang = game.lang;
  const cells = hiddenMessageCells(puzzle);
  const wave = board.showSolved(cells, animate);
  $("app").classList.add("is-solved");
  $("words").hidden = true;
  const panel = $("solved");
  panel.hidden = false;
  panel.classList.toggle("enter", animate);
  $("solved-title").textContent = game.kind === "daily" ? t("solvedDaily") : t("solvedTitle");
  const reveal = $("reveal");
  reveal.hidden = !puzzle.message;
  if (puzzle.message) {
    const waveEnd = animate ? foundList(game).length * 55 + 500 : 0;
    revealText(puzzle.message, lang, waveEnd, 70, animate);
  }
  const facts = [tn("factsWords", puzzle.words.length), formatTime(state.ms)];
  facts.push(state.used ? tn("factsHints", state.used) : t("factsNoHints"));
  if (game.kind === "daily") {
    const run = streaks(new Set(Object.keys(dailyOf(lang))), today()).current;
    if (run) facts.push(tn("streakLine", run));
  }
  $("solved-facts").textContent = facts.join(" · ");
  const theme = themeById(lang, puzzle.theme);
  const coll = collectionOf(lang)[puzzle.theme] || { w: [] };
  const total = theme.words.length;
  const have = Math.min(coll.w.length, total);
  $("solved-collect-text").textContent =
    have >= total
      ? t("collectDone", { theme: theme.name })
      : t("collectLine", { theme: theme.name, found: have, total });
  $("solved-collect").classList.toggle("complete", have >= total);
  $("solved-collect").classList.toggle("now", Boolean(themeCompleted));
  $("solved-bar").style.setProperty("--f", (have / total).toFixed(3));
  if (game.kind === "daily") {
    $("btn-again").textContent = t("toCalendar");
    $("btn-next").textContent = t("toEndlessBtn");
  } else {
    $("btn-again").textContent = t("sameTheme");
    $("btn-next").textContent = t("nextPuzzle");
  }
  $("below").scrollTop = 0;
  if (animate) {
    announce(t("srSolved", { facts: facts.join(", ") }));
    window.setTimeout(() => panel.classList.remove("enter"), Math.max(wave, 600));
  }
}

// ---- dialogs

const returnFocus = new WeakMap();

function openDialog(dlg) {
  if (dlg.open) return;
  hideAsk();
  returnFocus.set(dlg, document.activeElement);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
  pushLayer(dlg.id, () => closeDialog(dlg));
}

function closeDialog(dlg) {
  if (!dlg.open) return;
  if (typeof dlg.close === "function") dlg.close();
  else {
    dlg.removeAttribute("open");
    dlg.dispatchEvent(new Event("close"));
  }
}

document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("close", () => {
    // Closed by a button, the backdrop or the phone itself: take the dialog's history entry back.
    dropLayer(dlg.id);
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
  const run = streaks(new Set(Object.keys(solved)), now);
  const box = $("streak");
  box.textContent = "";
  for (const [label, n] of [
    ["streakCurrent", run.current],
    ["streakLongest", run.longest],
  ]) {
    const div = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = tn("daysCount", n);
    const span = document.createElement("span");
    span.textContent = t(label);
    div.append(b, span);
    box.appendChild(div);
  }
  box.classList.toggle("lit", run.current > 0);
  $("daily-play").textContent = solved[now] ? t("close") : t("playToday");
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

// themes and the collection
function renderThemes() {
  const lang = game ? game.lang : wordsLang();
  const coll = collectionOf(lang);
  const { themes } = library(lang);
  const ul = $("theme-cards");
  ul.textContent = "";
  let complete = 0;
  themes.forEach((theme, i) => {
    const entry = coll[theme.id] || { w: [], s: 0, p: 0 };
    const total = theme.words.length;
    const have = Math.min(entry.w.length, total);
    const isDone = have >= total;
    if (isDone) complete++;
    const current = game && game.kind === "endless" && game.puzzle.theme === theme.id;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `theme-card c${i % 10}${isDone ? " complete" : ""}${current ? " current" : ""}`;
    btn.dataset.theme = theme.id;
    const name = document.createElement("span");
    name.className = "tc-name";
    name.textContent = theme.name;
    name.lang = lang;
    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.setProperty("--f", (have / total).toFixed(3));
    bar.appendChild(fill);
    const words = t("themeWords", { found: have, total });
    const status = current
      ? t("themeCurrent")
      : isDone
        ? t("themeComplete")
        : entry.s
          ? tn("themeSolved", entry.s)
          : have
            ? words
            : t("themeNew");
    const meta = document.createElement("span");
    meta.className = "tc-meta";
    meta.textContent = status === words ? words : `${words} · ${status}`;
    btn.append(name, bar, meta);
    if (isDone) {
      const seal = document.createElement("span");
      seal.className = "tc-seal";
      seal.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "ico");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-check");
      svg.appendChild(use);
      seal.appendChild(svg);
      btn.appendChild(seal);
    }
    btn.setAttribute("aria-label", t("themeCardLabel", { name: theme.name, words, status }));
    li.appendChild(btn);
    ul.appendChild(li);
  });
  $("themes-sum").textContent = t("themesSum", { done: complete, total: themes.length });
}

$("theme-cards").addEventListener("click", (e) => {
  const btn = e.target.closest(".theme-card");
  if (!btn || !game) return;
  closeDialog($("dlg-themes"));
  nextPuzzle(btn.dataset.theme);
});

// statistics
function renderStats() {
  const now = today();
  const rows = [
    ["stPuzzles", (l) => statsOf(l).solved],
    ["stLevel", (l) => progressOf(l).level + 1],
    ["stDaily", (l) => Object.keys(dailyOf(l)).length],
    ["stStreak", (l) => streaks(new Set(Object.keys(dailyOf(l))), now).current],
    ["stLongest", (l) => streaks(new Set(Object.keys(dailyOf(l))), now).longest],
    ["stWords", (l) => statsOf(l).words],
    [
      "stThemes",
      (l) => {
        const coll = collectionOf(l);
        return library(l).themes.filter((x) => themeDone(l, x.id, coll)).length;
      },
    ],
    ["stPerfect", (l) => statsOf(l).perfect],
    ["stHints", (l) => statsOf(l).hints],
  ];
  const body = $("stats-body");
  body.textContent = "";
  const fmt = new Intl.NumberFormat(i18n.lang);
  const addRow = (label, cells) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    tr.appendChild(th);
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  };
  for (const [key, value] of rows)
    addRow(
      t(key),
      LANGS.map((l) => fmt.format(value(l))),
    );
  for (let size = 6; size <= 12; size++) {
    const times = LANGS.map((l) => statsOf(l).best[String(size)]);
    if (times.every((x) => !x)) continue;
    addRow(
      t("stBest", { size: t("sizeLabel", { n: size }) }),
      times.map((x) => (x ? formatTime(x) : "–")),
    );
  }
}

// settings
function syncSettingsForm() {
  const check = (name, value) => {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  check("words", game ? game.lang : wordsLang());
  check("difficulty", settings.difficulty);
  check("letters", lettersChoice());
  check("theme", settings.theme);
  check("ui", settings.ui);
  $("opt-contrast").checked = settings.contrast;
  $("opt-vibration").checked = settings.vibration;
  $("opt-timer").checked = settings.timer;
  $("opt-message").checked = settings.message;
  showDifficultyNote(false);
}

function showDifficultyNote(changed) {
  const key = { grow: "diffNoteGrow", easy: "diffNoteEasy", medium: "diffNoteMedium", hard: "diffNoteHard" };
  $("difficulty-note").textContent = changed
    ? `${t(key[settings.difficulty])} ${t("nextChange")}`
    : t(key[settings.difficulty]);
}

function onSetting(e) {
  const input = e.target;
  if (input.id === "opt-contrast") settings.contrast = input.checked;
  else if (input.id === "opt-vibration") {
    settings.vibration = input.checked;
    buzz("light");
  } else if (input.id === "opt-timer") {
    settings.timer = input.checked;
    showClock();
  } else if (input.id === "opt-message") settings.message = input.checked;
  else if (input.name === "difficulty") {
    settings.difficulty = input.value;
    showDifficultyNote(true);
  } else if (input.name === "letters") settings.letters = input.value;
  else if (input.name === "theme") settings.theme = input.value;
  else if (input.name === "ui") {
    settings.ui = input.value;
    i18n.setLang(uiLang());
    translatePage();
    if (game) {
      renderWords();
      refresh();
      if (game.state.done) showSolved(false);
    }
    syncSettingsForm();
  } else if (input.name === "words") {
    switchLang(input.value);
    return;
  } else return;
  store.set("settings", settings);
  applyLook();
  measureSlot();
}

// ---- wiring

const on = (id, fn) => $(id).addEventListener("click", fn);

on("btn-lang", () => switchLang(game && game.lang === "sk" ? "en" : "sk"));
on("btn-daily", openCalendar);
on("btn-themes", () => {
  renderThemes();
  openDialog($("dlg-themes"));
});
on("btn-stats", () => {
  renderStats();
  openDialog($("dlg-stats"));
});
on("btn-help", () => openDialog($("dlg-help")));
on("first-help", () => {
  settings.helped = true;
  store.set("settings", settings);
  $("first-help").hidden = true;
  openDialog($("dlg-help"));
});
on("btn-settings", () => {
  syncSettingsForm();
  openDialog($("dlg-settings"));
});
on("btn-switch", () => {
  if (!game) return;
  if (game.kind === "daily") nextPuzzle(null);
  else openDaily(today());
});
on("btn-hint", toolbarHint);
on("ask-first", () => giveHint(pendingWord, 1));
on("ask-where", () => giveHint(pendingWord, 2));
on("ask-cancel", clearFeedback);
on("btn-undo", undoTheme);
on("btn-next", () => {
  if (!game) return;
  nextPuzzle(null);
});
on("btn-again", () => {
  if (!game) return;
  if (game.kind === "daily") openCalendar();
  else nextPuzzle(game.puzzle.theme);
});
on("btn-retry", () => {
  const lang = game ? game.lang : wordsLang();
  const p = progressOf(lang);
  p.level += 1;
  p.next = null;
  saveProgress(lang, p, true);
  openEndless(lang);
});
on("cal-prev", () => moveMonth(-1));
on("cal-next", () => moveMonth(1));
on("daily-close", () => closeDialog($("dlg-daily")));
on("daily-play", () => {
  closeDialog($("dlg-daily"));
  if (!dailyOf(game ? game.lang : wordsLang())[today()]) openDaily(today());
});
on("themes-done", () => closeDialog($("dlg-themes")));
on("stats-done", () => closeDialog($("dlg-stats")));
on("help-done", () => closeDialog($("dlg-help")));
on("settings-done", () => closeDialog($("dlg-settings")));
$("dlg-settings").addEventListener("change", onSetting);

if (darkQuery && typeof darkQuery.addEventListener === "function") darkQuery.addEventListener("change", applyLook);
function relayout() {
  board.fit();
  placeAsk();
  markMore();
}
if (typeof ResizeObserver === "function") {
  const watch = new ResizeObserver(relayout);
  watch.observe($("board-wrap"));
  watch.observe($("below"));
} else window.addEventListener("resize", relayout);

// ---- life cycle: save when the app goes to the background

function persist() {
  if (game && !game.state.done) tick();
  saveGame(true);
  store.flush();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
  else lastTick = performance.now();
});
window.addEventListener("pagehide", persist);
if (host && host.app && typeof host.app.on === "function") {
  try {
    host.app.on("pause", persist);
    host.app.on("resume", () => {
      lastTick = performance.now();
    });
  } catch (e) {
    // An older host without these events: the page events above still save.
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
  }
  $("opt-vibration-row").hidden = !canBuzz;
  measureTextScale();
  i18n.setLang(uiLang());
  translatePage();
  applyLook();
  measureSlot();
  // A reload (rotation, a dark-mode switch) keeps the history entries of panels that were open: step back over them.
  const stale = window.history && window.history.state && window.history.state.wsDepth;
  if (Number.isInteger(stale) && stale > 0) {
    try {
      window.history.go(-stale);
    } catch (e) {
      // nothing to step over
    }
  }
  openActive(wordsLang());
}

start();
