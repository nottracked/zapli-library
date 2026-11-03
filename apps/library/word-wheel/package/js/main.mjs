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
import { STRINGS } from "./wheel/strings.mjs";
import { createSource } from "./wheel/source.mjs";
import { newState, tryWord, showCell, hintCell, hintsLeft, visibleCells } from "./wheel/puzzle.mjs";
import { SIZES } from "./wheel/generator.mjs";
import { createWheel } from "./ui/wheel-view.mjs";
import { createGrid } from "./ui/grid-view.mjs";
import { createCalendar } from "./ui/calendar-view.mjs";

const host = window.zapli;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const LANGS = ["sk", "en"];
const OPEN_DAYS_KEPT = 10;
const LETTER_SCALE = { normal: 1, large: 1.25, largest: 1.5 };

const i18n = createI18n(STRINGS);
const t = (key, args) => i18n.t(key, args);
const tn = (key, n, args) => i18n.tn(key, n, args);

const store = createStore("word-wheel", [
  "settings",
  ...LANGS.flatMap((l) => [`progress-${l}`, `book-${l}`, `stats-${l}`, `daily-${l}`]),
]);
const source = createSource();

let settings = null;
let game = null; // { lang, kind: "endless" | "daily", day, puzzle, state }
let pendingCell = null;
let noticeTimer = 0;
let textScale = 1;
let loadToken = 0;
let retry = () => {};

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
  return { solved: n(s.solved), words: n(s.words), hints: n(s.hints), perfect: n(s.perfect) };
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

// The wheel takes what the crossword leaves: the crossword first gets about 30 px a row, the wheel the rest, between
// 180 px and half the play area (more with larger letters), never wider than the screen.
function sizeWheel() {
  const play = $("play");
  const w = play.clientWidth - 24;
  const h = play.clientHeight;
  const sideways =
    window.matchMedia &&
    window.matchMedia("(orientation: landscape) and (min-width: 36rem) and (max-height: 34rem)").matches;
  const ls = LETTER_SCALE[lettersChoice()];
  let size;
  if (sideways) size = Math.min(h - 120, w * 0.45);
  else {
    const fixed = ["status", "feedback", "word-row"].reduce(
      (sum, c) => sum + play.querySelector(`.${c}`).offsetHeight,
      24,
    );
    const rows = game ? game.puzzle.rows : 7;
    const room = h - fixed - (rows * 30 + (rows - 1) * 3);
    size = Math.min(w, Math.max(room, h * 0.3), h * 0.5 * Math.min(ls, 1.2));
  }
  size = Math.max(180, Math.min(420, Math.floor(size)));
  $("wheel").style.setProperty("--size", `${size}px`);
  grid.fit();
}

// ---- the views

const wheel = createWheel($("wheel"), {
  letterLabel: (letter) => t("letterLabel", { letter }),
  onChange: showCurrent,
  onSubmit: submitWord,
});

const grid = createGrid($("grid"), { onCellTap: askCell, t });

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

function showCurrent(word) {
  const out = $("current");
  const text = word.join("").toUpperCase();
  out.classList.toggle("empty", !text);
  // The instruction shows until the player has found a word once; then the empty line stays quiet.
  out.textContent = text || (settings && settings.taught ? "" : t("currentEmpty"));
  out.setAttribute("aria-label", text ? t("currentWord", { word: text }) : t("currentEmpty"));
  $("btn-clear").hidden = !text;
  $("btn-enter").hidden = !text;
  hideAsk();
}

function notice(text, tone) {
  const el = $("notice");
  el.textContent = text;
  el.className = `notice ${tone || ""}`;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    el.textContent = "";
  }, 4500);
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
  const chip = $("btn-switch");
  chip.textContent = game.kind === "daily" ? t("toEndless") : state.done ? t("nextWheel") : t("toToday");
  const left = hintsLeft(state);
  $("hint-count").textContent = String(left);
  $("btn-hint").setAttribute("aria-label", `${t("hint")}. ${tn("hintsLeft", left)}`);
  $("extra-count").textContent = String(state.extras.length);
  $("btn-extras").setAttribute("aria-label", `${t("extraWords")}: ${state.extras.length}`);
  $("lang-code").textContent = game.lang.toUpperCase();
  $("btn-lang").setAttribute("aria-label", t(game.lang === "sk" ? "langToggleSk" : "langToggleEn"));
  $("btn-lang").title = $("btn-lang").getAttribute("aria-label");
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
  game = g;
  setLoading(false);
  wheel.set(g.puzzle.letters);
  grid.set(g.puzzle);
  pendingCell = null;
  refresh();
  window.requestAnimationFrame(sizeWheel);
}

/** Opens what a language had on screen last: a daily wheel, or the endless wheel. */
async function openActive(lang) {
  const p = progressOf(lang);
  if (p.active !== "endless" && p.open[p.active]) {
    const g = p.open[p.active];
    show({ lang, kind: "daily", day: p.active, puzzle: g.puzzle, state: g.state });
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
    show({ lang, kind: "endless", puzzle: p.endless.puzzle, state: p.endless.state });
    return;
  }
  const size = settings.size === "grow" ? growingSize(p.level) : settings.size;
  const puzzle = await load(lang, () => source.endless(lang, size, p.level));
  if (!puzzle) return;
  const fresh = progressOf(lang);
  fresh.endless = { puzzle, state: newState(puzzle) };
  fresh.active = "endless";
  saveProgress(lang, fresh, true);
  show({ lang, kind: "endless", puzzle, state: fresh.endless.state });
}

async function openDaily(day) {
  const lang = game ? game.lang : wordsLang();
  const p = progressOf(lang);
  let g = p.open[day];
  if (!g) {
    const puzzle = await load(lang, () => source.daily(lang, day));
    if (!puzzle) return;
    const state = newState(puzzle);
    // A day solved before shows its solution again, and its extra words can still be found.
    if (dailyOf(lang)[day]) Object.assign(state, { found: puzzle.words.map((w) => w.w), done: true });
    g = { puzzle, state };
  }
  const fresh = progressOf(lang);
  fresh.open[day] = g;
  fresh.active = day;
  pruneOpen(lang, fresh);
  saveProgress(lang, fresh, true);
  show({ lang, kind: "daily", day, puzzle: g.puzzle, state: g.state });
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
  const lang = game.lang;
  const p = progressOf(lang);
  if (game.kind === "endless" && game.state.done) {
    p.level += 1;
    p.endless = null;
  }
  p.active = "endless";
  pruneOpen(lang, p);
  saveProgress(lang, p, true);
  await openEndless(lang);
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
  if (game.kind === "endless") p.endless = { puzzle: game.puzzle, state: game.state };
  else {
    p.open[game.day] = { puzzle: game.puzzle, state: game.state };
    p.active = game.day;
  }
  saveProgress(game.lang, p, now);
}

function bumpStats(lang, change) {
  const s = statsOf(lang);
  for (const [k, v] of Object.entries(change)) s[k] += v;
  store.set(`stats-${lang}`, s);
}

function submitWord(tiles) {
  if (!game) return;
  const before = game.state;
  const r = tryWord(game.puzzle, before, tiles);
  const shown = r.word.toUpperCase();
  game.state = r.state;
  if (r.result === "found" && !settings.taught) {
    settings.taught = true;
    store.set("settings", settings);
  }
  if (r.result === "found") {
    grid.flash(
      game.puzzle.words.find((w) => w.w === r.word),
      "found",
    );
    notice(t("found", { word: shown }), "good");
  } else if (r.result === "again") {
    grid.flash(
      game.puzzle.words.find((w) => w.w === r.word),
      "again",
    );
    notice(t("again", { word: shown }), "bad");
  } else if (r.result === "extra") {
    const book = bookOf(game.lang);
    let text;
    if (book[r.word]) text = t("extraInBook", { word: shown });
    else {
      book[r.word] = isoDay(new Date());
      store.set(`book-${game.lang}`, { words: book });
      text = t("extraNew", { word: shown });
    }
    notice(r.earnedHint ? `${text} ${t("earnedHint")}` : text, "good");
  } else if (r.result === "extraAgain") notice(t("extraAgain", { word: shown }), "bad");
  else if (r.result === "short") notice(t("short"), "bad");
  else {
    notice(
      game.lang === "sk" ? `${t("unknown", { word: shown })} ${baseFormsHint()}`.trim() : t("unknown", { word: shown }),
      "bad",
    );
    const out = $("current");
    out.classList.remove("shake");
    window.requestAnimationFrame(() => out.classList.add("shake"));
  }
  afterChange(before);
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

/** Saves the game and, when this change solved the wheel, counts it and says so. */
function afterChange(before) {
  saveGame();
  if (game.state.done && !before.done) {
    const lang = game.lang;
    bumpStats(lang, {
      solved: 1,
      words: game.puzzle.words.length,
      perfect: game.state.hints === 0 ? 1 : 0,
    });
    if (game.kind === "daily") {
      const days = dailyOf(lang);
      days[game.day] = { w: game.puzzle.words.length, x: game.state.extras.length, h: game.state.hints };
      store.set(`daily-${lang}`, { days }, true);
    }
    store.flush();
    refresh();
    window.setTimeout(showSolved, 650);
    return;
  }
  refresh();
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
  afterChange(before);
  if (word && next.found.includes(word.w) && !before.found.includes(word.w)) grid.flash(word, "found");
}

function askCell(key, el) {
  if (!game || game.state.done) return;
  if (hintsLeft(game.state) <= 0) {
    notice(t("noHints"), "bad");
    return;
  }
  hideAsk();
  pendingCell = key;
  el.classList.add("pick");
  $("notice").textContent = "";
  $("ask").hidden = false;
  $("ask-yes").focus({ preventScroll: true });
}

function hideAsk() {
  pendingCell = null;
  $("ask").hidden = true;
  document.querySelectorAll(".cell.pick").forEach((c) => c.classList.remove("pick"));
}

// ---- dialogs

const returnFocus = new WeakMap();

function openDialog(dlg) {
  if (dlg.open) return;
  returnFocus.set(dlg, document.activeElement);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
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

function showSolved() {
  if (!game || !game.state.done) return;
  const { puzzle, state } = game;
  $("solved-title").textContent = game.kind === "daily" ? t("solvedDailyTitle") : t("solvedTitle");
  const lines = [
    tn("solvedWords", puzzle.words.length),
    tn("solvedExtras", state.extras.length),
    state.hints ? tn("solvedHints", state.hints) : t("solvedNoHints"),
  ];
  const ul = $("solved-lines");
  ul.textContent = "";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
  const left = puzzle.extra.length - state.extras.length;
  $("solved-left").textContent = left > 0 ? tn("solvedLeft", left) : "";
  $("solved-calendar").hidden = game.kind !== "daily";
  $("solved-next").textContent = game.kind === "daily" ? t("toEndless") : t("nextWheel");
  openDialog($("dlg-solved"));
}

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
  const here = game ? game.state.extras : [];
  $("book-wheel-section").hidden = here.length === 0;
  fillWords($("book-wheel"), here.slice().sort(collator(lang).compare));
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

function fillWords(ul, words) {
  ul.textContent = "";
  const frag = document.createDocumentFragment();
  for (const w of words) {
    const li = document.createElement("li");
    li.textContent = w.toUpperCase();
    li.lang = game ? game.lang : wordsLang();
    frag.appendChild(li);
  }
  ul.appendChild(frag);
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
      td.textContent = fmt.format(value(lang));
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
}

function onSetting(e) {
  const input = e.target;
  if (!input.name && input.id !== "opt-contrast") return;
  if (input.id === "opt-contrast") settings.contrast = input.checked;
  else if (input.name === "size") settings.size = input.value === "grow" ? "grow" : Number(input.value);
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

on("btn-lang", () => switchLang(game && game.lang === "sk" ? "en" : "sk"));
on("btn-daily", openCalendar);
on("btn-book", () => {
  renderBook();
  openDialog($("dlg-book"));
});
on("btn-extras", () => {
  renderBook();
  openDialog($("dlg-book"));
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
on("btn-shuffle", () => wheel.shuffle());
on("btn-hint", () => useHint(null));
on("btn-clear", () => wheel.clear());
on("btn-enter", () => wheel.submit());
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
on("solved-stay", () => closeDialog($("dlg-solved")));
on("solved-calendar", () => {
  closeDialog($("dlg-solved"));
  openCalendar();
});
on("solved-next", () => {
  closeDialog($("dlg-solved"));
  nextWheel();
});
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

async function start() {
  store.loadLocal();
  if (host) await store.loadKv(host);
  settings = normSettings(store.get("settings"));
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
