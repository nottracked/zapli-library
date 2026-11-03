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
let canBuzz = false;
let nextTimer = 0;
let lastWordLength = 0;
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

// The word being made, one chip per letter (the newest pops in). With no word, the first wheel shows how to make one;
// after the player's first word the line stays quiet for good.
function showCurrent(word) {
  const out = $("current");
  const text = word.join("").toUpperCase();
  out.classList.toggle("empty", !text);
  out.textContent = "";
  if (text) {
    word.forEach((tile, i) => {
      const chip = document.createElement("span");
      chip.className = i === word.length - 1 && word.length > lastWordLength ? "cl new" : "cl";
      chip.textContent = tile.toUpperCase();
      out.appendChild(chip);
    });
  } else if (!(settings && settings.taught)) out.textContent = t("currentEmpty");
  lastWordLength = word.length;
  out.setAttribute("aria-label", text ? t("currentWord", { word: text }) : t("currentEmpty"));
  $("btn-clear").hidden = !text;
  $("btn-enter").hidden = !text;
  hideAsk();
}

function notice(text, tone, ms) {
  const el = $("notice");
  el.textContent = text;
  el.className = `notice ${tone || ""}`;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    el.textContent = "";
  }, ms || 4500);
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
  $("lang-code").textContent = game.lang.toUpperCase();
  $("btn-lang").setAttribute("aria-label", t(game.lang === "sk" ? "langToggleSk" : "langToggleEn"));
  $("btn-lang").title = $("btn-lang").getAttribute("aria-label");
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
  game = g;
  setLoading(false);
  wheel.set(g.puzzle.letters);
  grid.set(g.puzzle);
  pendingCell = null;
  refresh();
  window.requestAnimationFrame(sizeWheel);
  if (!Array.isArray(g.puzzle.hidden)) addHiddenWords(g);
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
  window.clearTimeout(nextTimer);
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
  if (fromDaily) notice(t("nextAfterDaily"), "good", 5000);
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
  // Where the word's letters show now, so they can fly from there.
  const from = Array.from($("current").querySelectorAll(".cl")).map((c) => c.getBoundingClientRect());
  const letters = tiles.map((x) => x.toUpperCase());
  const before = game.state;
  const shownBefore = visibleCells(game.puzzle, before);
  const r = tryWord(game.puzzle, before, tiles);
  const shown = r.word.toUpperCase();
  game.state = r.state;
  if (!settings.taught) {
    settings.taught = true;
    store.set("settings", settings);
  }
  if (r.result === "found") {
    const word = game.puzzle.words.find((w) => w.w === r.word);
    notice(t("found", { word: shown }), "good");
    buzz("light");
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
    notice(r.earnedHint ? `${text} ${t("earnedHint")}` : text, hidden ? "good hidden" : "good");
    buzz(hidden ? "medium" : "light");
    afterChange(before, () => flyToJar(letters, from, !hidden, r.earnedHint));
    return;
  }
  if (r.result === "again") {
    notice(t("alreadyFound", { word: shown }), "soft");
    grid.flash(
      game.puzzle.words.find((w) => w.w === r.word),
      "again",
    );
  } else if (r.result === "extraAgain") {
    notice(t("alreadyFound", { word: shown }), "soft");
    fx.flash($("jar"), "nudge");
  } else if (r.result === "short") notice(t("short"), "bad");
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
  saveGame();
  const g = game;
  const solvedNow = g.state.done && !before.done;
  const completeNow = isComplete(g.puzzle, g.state) && !isComplete(g.puzzle, before);
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
      store.set(`daily-${lang}`, { days }, true);
    }
    store.flush();
  }
  refresh();
  // The effect says how long its letters fly; the celebration waits until the last one has landed.
  const flight = (effect && effect()) || 0;
  if (solvedNow || completeNow) {
    window.setTimeout(
      () => {
        if (game !== g) return;
        grid.setSolved(true, true);
        if (completeNow) {
          buzzPattern(["heavy", "success", "success"], 150);
          finishWheel(g);
          return;
        }
        buzzPattern(["success", "medium", "success"], 140);
        const left = hiddenOf(g.puzzle).length - hiddenFound(g.puzzle, g.state);
        notice(t("solvedNote", { left: tn("hiddenLeft", left) }), "good big", 7000);
      },
      fx.still() ? 0 : flight + 120,
    );
  }
}

// Every word found: say so, light the jar, and bring the next wheel after a moment (not while a panel is open).
function finishWheel(g) {
  notice(t(g.kind === "daily" ? "completeDaily" : "completeNote"), "good big", NEXT_AFTER_MS + 800);
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
  $("opt-vibration").checked = settings.vibration;
}

function onSetting(e) {
  const input = e.target;
  if (!input.name && input.id !== "opt-contrast" && input.id !== "opt-vibration") return;
  if (input.id === "opt-contrast") settings.contrast = input.checked;
  else if (input.id === "opt-vibration") {
    settings.vibration = input.checked;
    buzz("light");
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

on("btn-lang", () => switchLang(game && game.lang === "sk" ? "en" : "sk"));
on("btn-daily", openCalendar);
on("btn-book", () => {
  renderBook();
  openDialog($("dlg-book"));
});
on("btn-jar", () => {
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
  setLoading(true, false);
  showCurrent([]);
  const lang = wordsLang();
  source.preload(lang);
  await openActive(lang);
  source.preload(lang === "sk" ? "en" : "sk");
}

start();
