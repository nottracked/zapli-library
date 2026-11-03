// Hidden Word: the page. It wires the saved state, the word lists, the lock and its log of guesses, the keyboard and
// the dialogs.
//
// Saved values (js/core/store.mjs), each per language where it says <lang>:
//   settings      the player's choices
//   games-<lang>  the game on screen, the practice game and number of each length, the daily games started
//   stats-<lang>  every finished word by length (guesses it took) and the daily words by date

import { createStore } from "./core/store.mjs";
import { createI18n, pickLang } from "./core/i18n.mjs";
import { isoDay, isDay, FIRST_DAY, daysBetween, streaks } from "./core/dates.mjs";
import { tiles as tilesOf } from "./core/letters.mjs";
import { STRINGS } from "./game/strings.mjs";
import {
  LENGTHS,
  DEFAULT_LENGTH,
  GUESS_SETTINGS,
  maxGuesses,
  score,
  isWin,
  knowledge,
  hardProblem,
  hintPlace,
} from "./game/rules.mjs";
import { createWords, dailyWord, practiceWord, baseForms } from "./game/words.mjs";
import { createDraft, VARIANTS, baseKey, tileOf } from "./game/draft.mjs";
import { createBoard } from "./ui/board.mjs";
import { createKeyboard } from "./ui/keyboard.mjs";
import { createCalendar } from "./ui/calendar-view.mjs";

const host = window.zapli;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const LANGS = ["sk", "en"];
const DAILY_KEPT = 60;
// A Slovak example of a base form for the message about other forms, one the player's guess does not contain.
const BASE_EXAMPLES = [
  ["stôl", "stoly"],
  ["kniha", "knihy"],
  ["robiť", "robím"],
  ["pekný", "pekná"],
];

const i18n = createI18n(STRINGS);
const t = (key, args) => i18n.t(key, args);
const tn = (key, n, args) => i18n.tn(key, n, args);

const store = createStore("hidden-word", ["settings", ...LANGS.flatMap((l) => [`games-${l}`, `stats-${l}`])]);

let settings = null;
let lang = "sk"; // the language of the words in play
let game = null; // the word on screen (see newGame)
let draft = createDraft(DEFAULT_LENGTH, "sk");
let textScale = 1;
let canBuzz = false;
let canShare = false;
let loadToken = 0;
let countdownTimer = 0;
let keyboardLang = null;
const lists = {}; // lang -> Promise of the words index
const loaded = {}; // lang -> the words index, once read

const still = () => Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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
    length: LENGTHS.includes(s.length) ? s.length : DEFAULT_LENGTH,
    guesses: GUESS_SETTINGS.includes(s.guesses) ? s.guesses : "standard",
    hard: Boolean(s.hard),
    hint: s.hint !== false,
    vibration: s.vibration !== false,
    contrast: Boolean(s.contrast),
    theme: ["device", "light", "dark"].includes(s.theme) ? s.theme : "device",
    taught: Boolean(s.taught),
    accents: Boolean(s.accents),
  };
}

const saveSettings = () => store.set("settings", settings);

function isGame(g, code) {
  return (
    g &&
    typeof g.answer === "string" &&
    LENGTHS.includes(g.len) &&
    Array.isArray(g.guesses) &&
    g.guesses.every((x) => Array.isArray(x) && x.length === g.len) &&
    Boolean(tilesOf(g.answer, code)) &&
    tilesOf(g.answer, code).length === g.len
  );
}

function gamesOf(code) {
  const raw = store.get(`games-${code}`) || {};
  const practice = {};
  for (const n of LENGTHS) {
    const p = raw.practice && raw.practice[n];
    practice[n] = {
      next: p && Number.isInteger(p.next) && p.next >= 0 ? p.next : 0,
      game: p && isGame(p.game, code) ? p.game : null,
    };
  }
  const daily = {};
  if (raw.daily && typeof raw.daily === "object") {
    for (const [key, g] of Object.entries(raw.daily)) if (isGame(g, code) && isDay(g.day)) daily[key] = g;
  }
  return {
    active: raw.active === "practice" ? "practice" : "daily",
    day: isDay(raw.day) ? raw.day : null,
    practice,
    daily,
  };
}

const saveGames = (code, g, now) => store.set(`games-${code}`, g, now);

function statsOf(code) {
  const raw = store.get(`stats-${code}`) || {};
  const days = raw.days && typeof raw.days === "object" ? raw.days : {};
  const byLen = {};
  for (const n of LENGTHS) {
    const s = (raw.byLen && raw.byLen[n]) || {};
    const num = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    byLen[n] = {
      played: num(s.played),
      won: num(s.won),
      hinted: num(s.hinted),
      lost: num(s.lost),
      dist: s.dist && typeof s.dist === "object" ? s.dist : {},
    };
  }
  return { days, byLen, last: raw.last || null };
}

const dailyKey = (day, len) => `${day}|${len}`;

// ---- language, look and text size

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
  document.querySelectorAll("[data-letters]").forEach((el) => {
    el.textContent = tn("letters", Number(el.dataset.letters));
  });
  // The example guess in How to play, in the language of the game.
  const sample = Array.from(t("sample"));
  document.querySelectorAll("#help-sample .ch").forEach((el, i) => {
    el.textContent = sample[i] || "";
  });
  keyboard.relabel();
}

const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function applyLook() {
  if (settings.theme === "device") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  const dark = settings.theme === "dark" || (settings.theme === "device" && darkQuery && darkQuery.matches);
  root.classList.toggle("dark-now", Boolean(dark));
  root.classList.toggle("contrast", settings.contrast);
}

// The phone's text size, from a probe line of 100 px text: labels grow with it only up to a cap, and letters drawn to
// fit a chip or a key do not grow with it at all (their box sets their size).
function measureTextScale() {
  const probe = $("tz-probe");
  const h = probe ? probe.getBoundingClientRect().height : 0;
  textScale = h > 0 ? Math.min(3, Math.max(1, h / 100)) : 1;
  root.style.setProperty("--tz", textScale.toFixed(3));
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

// ---- the views

const board = createBoard(
  { log: $("log"), cards: $("cards"), lock: $("lock"), slots: $("slots"), left: $("left") },
  { t, onSlot: pickSlot },
);

const keyboard = createKeyboard($("keys"), {
  onKey: (tile, fromPointer) => typeTile(tile, fromPointer),
  onHoldStart: () => buzz("light"),
  label: (letter, mark, more) => {
    const L = letter.toUpperCase();
    let text = mark === "hit" ? t("keyHit", { letter: L }) : mark === "near" ? t("keyNear", { letter: L }) : null;
    if (mark === "miss") text = t("keyMiss", { letter: L });
    if (!text) text = L;
    return more.length ? t("keyMore", { letter: text, more: more.map((m) => m.toUpperCase()).join(", ") }) : text;
  },
});

const calendar = createCalendar($("cal"), {
  onPick: (day) => {
    closeDialog($("dlg-daily"));
    openDaily(lang, day);
  },
  label: (day, status) => {
    const date = longDate(day);
    if (status === "found") return t("dayFound", { date });
    if (status === "lost") return t("dayLost", { date });
    if (status === "started") return t("dayStarted", { date });
    return date;
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

// ---- messages: they stay until the player's next action, never on a timer

function notice(text, tone) {
  const el = $("notice");
  el.textContent = text || "";
  el.className = `notice ${tone || ""}`.trim();
  $("suggest").hidden = true;
  $("suggest").textContent = "";
}

const clearNotice = () => notice("");

// ---- loading the word lists

function listFile(code) {
  // Each list is named in full, so the code shows exactly which of the app's own files it reads.
  if (code === "sk") return fetch("data/words-sk.txt");
  return fetch("data/words-en.txt");
}

function loadWords(code) {
  if (!lists[code]) {
    lists[code] = listFile(code)
      .then((r) => {
        if (!r.ok) throw new Error(`word list ${r.status}`);
        return r.text();
      })
      .then((text) => {
        loaded[code] = createWords(code, text);
        return loaded[code];
      })
      .catch((e) => {
        delete lists[code];
        throw e;
      });
  }
  return lists[code];
}

function setLoading(on, failed) {
  $("loading").hidden = !on;
  $("loading-text").textContent = failed ? t("loadFailed") : t("loading");
  $("btn-retry").hidden = !failed;
}

/** Waits for a language's list, showing the loading line only when it takes a moment. */
async function withWords(code) {
  const token = ++loadToken;
  const slow = window.setTimeout(() => {
    if (token === loadToken) setLoading(true, false);
  }, 150);
  try {
    const words = await loadWords(code);
    if (token === loadToken) setLoading(false);
    return token === loadToken ? words : null;
  } catch (e) {
    if (token === loadToken) setLoading(true, true);
    return null;
  } finally {
    window.clearTimeout(slow);
  }
}

// ---- games

function newGame(kind, len, answer, extra) {
  return Object.assign(
    {
      kind,
      len,
      answer,
      max: maxGuesses(len, settings.guesses),
      hard: settings.hard,
      guesses: [],
      hint: null,
      done: false,
      won: false,
      draft: null,
    },
    extra,
  );
}

const answerTiles = (g) => tilesOf(g.answer, lang);

/** Saves the word on screen where it belongs: the practice game of its length, or the daily game of its day. */
function saveGame(now) {
  if (!game) return;
  game.draft = game.done ? null : draft.save();
  const g = gamesOf(lang);
  if (game.kind === "practice") {
    g.practice[game.len].game = game;
    g.active = "practice";
  } else {
    g.daily[dailyKey(game.day, game.len)] = game;
    g.active = "daily";
    g.day = game.day;
    pruneDaily(g);
  }
  saveGames(lang, g, now);
}

// Keeps the latest daily games (finished ones too, so a day shows its guesses again); older ones live on in stats.
function pruneDaily(g) {
  const keys = Object.keys(g.daily).sort().reverse();
  keys.slice(DAILY_KEPT).forEach((k) => delete g.daily[k]);
}

async function openDaily(code, day, len) {
  const n = len || settings.length;
  const words = await withWords(code);
  if (!words) return;
  const g = gamesOf(code);
  let next = g.daily[dailyKey(day, n)] || null;
  if (!next) {
    const answer = dailyWord(words, n, day);
    if (!answer) return;
    next = newGame("daily", n, answer, { day });
    // A day finished on another version of the game, or pruned: its result stays, the board shows the answer.
    const rec = statsOf(code).days[day];
    if (rec && rec[n]) Object.assign(next, { done: true, won: rec[n][0] === 1, guesses: [], used: rec[n][1] });
  }
  show(code, next);
  saveGame(true);
}

async function openPractice(code, len) {
  const n = len || settings.length;
  const words = await withWords(code);
  if (!words) return;
  const g = gamesOf(code);
  let next = g.practice[n].game;
  if (!next || next.done) {
    const p = practiceWord(words, n, g.practice[n].next, today());
    if (!p) return;
    next = newGame("practice", n, p.word, { index: p.index });
    g.practice[n] = { next: p.next, game: next };
    saveGames(code, g, true);
  }
  show(code, next);
  saveGame(true);
}

/** Opens what a language had on screen last; a new day brings its daily word unless the player was practising. */
async function openActive(code) {
  const g = gamesOf(code);
  if (g.active === "practice") return openPractice(code);
  const now = today();
  const last = g.day && g.daily[dailyKey(g.day, settings.length)];
  // A past day the player opened from the calendar stays on screen until it is finished.
  if (last && g.day !== now && !last.done) return openDaily(code, g.day);
  await openDaily(code, now);
  if (g.day && g.day !== now && game && !game.guesses.length) notice(t("newDay"), "soft");
}

function show(code, g) {
  lang = code;
  game = g;
  draft = createDraft(g.len, code);
  if (g.draft) draft.load(g.draft);
  setLoading(false);
  board.setLength(g.len);
  board.setGuesses(g.guesses.map((x) => ({ tiles: x, marks: score(x, answerTiles(g)) })));
  if (!g.done) board.finish("closed");
  if (keyboardLang !== code) {
    keyboard.setLang(code);
    keyboardLang = code;
  }
  clearNotice();
  render();
  if (g.done) board.finish(g.won ? "won" : "lost", answerTiles(g), true);
  window.requestAnimationFrame(fit);
}

// ---- drawing the game on screen

function render() {
  if (!game) return;
  const ans = answerTiles(game);
  const known = knowledge(game.guesses, ans, game.hint);
  const n = game.len;
  // the status line
  $("mode-kind").textContent = game.kind === "daily" ? t("kindDaily") : t("kindPractice");
  $("mode-what").textContent =
    game.kind === "daily" ? longDate(game.day) : t("whatPractice", { n: (game.index || 0) + 1 });
  // At large text sizes the length pill shows its number alone (its label still names the length), so the status
  // line keeps to one row more often.
  $("length-text").textContent = root.classList.contains("big-text") ? String(n) : tn("letters", n);
  $("btn-length").setAttribute("aria-label", t("lengthLabel", { n }));
  const toToday = game.kind === "practice" || game.day !== today();
  $("btn-switch").textContent = toToday ? t("toToday") : t("toPractice");
  $("lang-code").textContent = lang.toUpperCase();
  $("btn-lang").setAttribute("aria-label", t(lang === "sk" ? "langToggleSk" : "langToggleEn"));
  $("btn-lang").title = $("btn-lang").getAttribute("aria-label");
  // the log's empty state, with the first-start line until the player has played or read the help
  const empty = game.guesses.length === 0 && !game.done;
  $("log-empty").hidden = !empty;
  $("empty-text").textContent = game.max
    ? t("emptyLimit", { letters: tn("letters", n), tries: tn("tries", game.max) })
    : t("emptyFree", { letters: tn("letters", n) });
  $("btn-first").hidden = settings.taught;
  $("start-legend").hidden = settings.taught;
  // the lock
  const used = game.guesses.length;
  board.setLeft(
    game.done ? "" : game.max ? tn("guessesLeft", Math.max(0, game.max - used)) : t("guessNumber", { n: used + 1 }),
  );
  const hinted = game.hint ? game.hint.pos : -1;
  board.setDraft(draft.places, draft.caret, known.places, hinted, draft.last, !game.done);
  $("lock").setAttribute(
    "aria-label",
    t("lockLabel", {
      letters: tn("letters", n),
      draft: draft.places.map((p) => (p ? p.toUpperCase() : "_")).join(" "),
    }),
  );
  keyboard.setMarks(known.keys);
  // the actions
  $("btn-hint").hidden = !settings.hint;
  $("btn-hint").disabled = Boolean(game.hint) || game.done;
  $("btn-hint").setAttribute("aria-label", game.hint ? t("hintUsedLabel") : t("hintLabel"));
  $("btn-try").classList.toggle("ready", draft.full);
  renderAccents();
  // the end of a word
  $("tray").classList.toggle("ended", game.done);
  $("result").hidden = !game.done;
  if (game.done) renderResult();
  else window.clearInterval(countdownTimer);
}

// The accents of the letter just typed, offered above the keyboard (Slovak); before the first accent, a quiet line
// says that keys hold them.
function renderAccents() {
  const box = $("accents");
  box.textContent = "";
  if (lang !== "sk" || game.done) return;
  const at = draft.last;
  const tile = at >= 0 ? draft.places[at] : null;
  if (tile) {
    const key = baseKey("sk", tile);
    const group = [key, ...(VARIANTS.sk[key] || [])].filter((x) => x !== tile);
    if (group.length && VARIANTS.sk[key]) {
      for (const other of group) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "accent";
        b.textContent = other.toUpperCase();
        b.setAttribute("aria-label", t("swapTo", { from: tile.toUpperCase(), to: other.toUpperCase() }));
        b.addEventListener("click", () => {
          draft.replace(at, other);
          learnAccents();
          buzz("light");
          clearNotice();
          afterDraft();
        });
        box.appendChild(b);
      }
      return;
    }
  }
  if (!settings.accents) {
    const p = document.createElement("span");
    p.className = "accents-hint";
    p.textContent = t("accentsHint");
    box.appendChild(p);
  }
}

function learnAccents() {
  if (settings.accents) return;
  settings.accents = true;
  saveSettings();
}

// The tray after a word: how it went, the word's line, the streak or the next word, and the buttons on.
function renderResult() {
  const g = game;
  const used = g.guesses.length || g.used || 0;
  const ans = g.answer.toUpperCase();
  $("r-head").textContent = g.won ? tn("won", used) : t("lost");
  $("r-word").textContent = g.won ? "" : t("wasWord", { word: ans });
  $("r-word").hidden = g.won;
  const letters = tn("letters", g.len);
  const where =
    g.kind === "daily"
      ? t("resultDaily", { date: longDate(g.day), letters })
      : t("resultPractice", { n: (g.index || 0) + 1, letters });
  const parts = [where];
  if (used) parts.push(g.max ? t("resultOf", { used, of: ofWord(g.max), max: g.max }) : tn("resultFree", used));
  if (g.hint) parts.push(t("withHint"));
  if (g.hard) parts.push(t("hardMode"));
  $("r-sub").textContent = parts.join(" · ");
  renderMiniChart();
  const isToday = g.kind === "daily" && g.day === today();
  $("btn-next").textContent = g.kind === "daily" ? t("toPractice") : t("nextWord");
  $("btn-share").hidden = !used;
  $("share-box").hidden = true;
  updateMeta(isToday);
  window.clearInterval(countdownTimer);
  if (isToday) countdownTimer = window.setInterval(() => updateMeta(true), 30000);
}

function updateMeta(isToday) {
  const parts = [];
  if (game.kind === "daily") {
    const streak = currentStreak(lang);
    if (streak.current) parts.push(tn("streakNow", streak.current));
  }
  if (isToday) {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.ceil((midnight - now) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    parts.push(t("nextDaily", { time: h ? t("hoursMinutes", { h, m }) : t("minutesOnly", { m }) }));
  }
  $("r-meta").textContent = parts.join(" · ");
  $("r-meta").hidden = parts.length === 0;
}

// Slovak says "z" or "zo" before a number by how the number is said: zo 4, z 5, zo 6, zo 7, z 8.
function ofWord(n) {
  if (i18n.lang !== "sk") return "of";
  const s = String(n);
  const zo = /^(4|6|7|1[467]|[467]\d|1\d\d)$/.test(s);
  return zo ? "zo" : "z";
}

// The guesses it took for this length, as a row of small columns, this word's column lit.
function renderMiniChart() {
  const box = $("r-chart");
  box.textContent = "";
  const s = statsOf(lang).byLen[game.len];
  const top = game.max || Math.max(6, ...Object.keys(s.dist).map(Number).filter(Number.isFinite));
  const cols = [];
  for (let i = 1; i <= Math.min(top, 10); i++) cols.push({ label: String(i), n: Number(s.dist[i]) || 0, at: i });
  cols.push({ label: "×", n: s.lost, at: 0 });
  const most = Math.max(1, ...cols.map((c) => c.n));
  const mine = game.won ? game.guesses.length : 0;
  for (const c of cols) {
    const col = document.createElement("span");
    col.className = "col";
    if (c.at === mine && (game.won || c.at === 0)) col.classList.add("mine");
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.setProperty("--h", String(c.n / most));
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = String(c.n);
    const lab = document.createElement("span");
    lab.className = "lab";
    lab.textContent = c.label;
    col.appendChild(num);
    col.appendChild(bar);
    col.appendChild(lab);
    col.setAttribute("role", "img");
    col.setAttribute("aria-label", t("distBar", { label: c.at ? tn("tries", c.at) : t("distLost"), n: c.n }));
    box.appendChild(col);
  }
  box.setAttribute("aria-label", t("distTitle"));
}

function currentStreak(code) {
  const days = statsOf(code).days;
  const found = new Set(
    Object.keys(days).filter(
      (d) => isDay(d) && Object.values(days[d] || {}).some((r) => Array.isArray(r) && r[0] === 1),
    ),
  );
  return streaks(found, today());
}

// ---- playing

function typeTile(tile, fromPointer) {
  if (!game || game.done || $("loading").hidden === false) return;
  if (!draft.type(tile)) {
    buzz("light");
    return;
  }
  if (VARIANTS[lang][baseKey(lang, tile)] && tile !== baseKey(lang, tile)) learnAccents();
  if (fromPointer) buzz("light");
  clearNotice();
  afterDraft();
}

function backspace() {
  if (!game || game.done) return;
  if (draft.back()) buzz("light");
  clearNotice();
  afterDraft();
}

function pickSlot(i) {
  if (!game || game.done) return;
  draft.select(i);
  clearNotice();
  afterDraft();
}

function afterDraft() {
  const ans = answerTiles(game);
  const known = knowledge(game.guesses, ans, game.hint);
  board.setDraft(draft.places, draft.caret, known.places, game.hint ? game.hint.pos : -1, draft.last, true);
  $("lock").setAttribute(
    "aria-label",
    t("lockLabel", {
      letters: tn("letters", game.len),
      draft: draft.places.map((p) => (p ? p.toUpperCase() : "_")).join(" "),
    }),
  );
  $("btn-try").classList.toggle("ready", draft.full);
  renderAccents();
  saveGame();
}

function refuse(text, tone) {
  notice(text, tone || "bad");
  board.shake();
  buzz("warning");
}

function submit() {
  if (!game || game.done) return;
  if (!draft.full) {
    const missing = draft.places.filter((p) => p === null).length;
    refuse(tn("notEnough", missing), "soft");
    return;
  }
  const guess = draft.tiles();
  const word = guess.join("");
  const words = loaded[lang];
  if (!words) return;
  const shown = word.toUpperCase();
  if (!words.isValid(word)) {
    if (lang === "sk") {
      refuse(t("notWordSk", { word: shown }));
      offerBaseForms(words, word, guess);
    } else refuse(t("notWord", { word: shown }));
    return;
  }
  if (game.guesses.some((x) => x.join("") === word)) {
    refuse(t("already", { word: shown }), "soft");
    return;
  }
  const ans = answerTiles(game);
  // Hard mode and the number of guesses are fixed by the first guess of a word.
  if (game.guesses.length === 0) {
    game.hard = settings.hard;
    game.max = maxGuesses(game.len, settings.guesses);
  }
  if (game.hard) {
    const p = hardProblem(guess, game.guesses, ans, game.hint);
    if (p) {
      const letter = p.tile.toUpperCase();
      if (p.kind === "place") refuse(t("hardPlace", { n: p.pos + 1, letter }));
      else if (p.n > 1) refuse(t("hardUseTimes", { letter, n: p.n }));
      else refuse(t("hardUse", { letter }));
      return;
    }
  }
  const before = game.guesses.length;
  game.guesses.push(guess);
  const marks = score(guess, ans);
  const won = isWin(marks);
  const lost = !won && game.max > 0 && game.guesses.length >= game.max;
  if (!settings.taught) {
    settings.taught = true;
    saveSettings();
  }
  draft.clear();
  clearNotice();
  const flight = board.addGuess(guess, marks, before + 1, still());
  $("log-empty").hidden = true;
  if (won || lost) {
    game.done = true;
    game.won = won;
    record(game);
  }
  saveGame(true);
  if (won || lost) store.flush();
  // The marks land first; then the keyboard and the lock catch up, and a found word opens the lock.
  const hits = marks.filter((m) => m === "hit").length;
  buzz(hits ? "medium" : "light");
  window.setTimeout(
    () => {
      render();
      if (won) {
        board.finish("won", ans, still());
        buzzPattern(["success", "medium", "success"], 140);
      } else if (lost) {
        board.finish("lost", ans, still());
        buzz("heavy");
      }
      fit();
    },
    still() ? 0 : flight,
  );
  // Until then, the lock is empty and not yet ready for the next guess.
  board.setDraft(draft.places, -1, [], -1, -1, false);
}

// Slovak: when the list has the base form of the word typed, say it, and offer it as the guess when it fits.
function offerBaseForms(words, word, guess) {
  const forms = baseForms(words, word).slice(0, 2);
  const box = $("suggest");
  box.textContent = "";
  if (!forms.length) {
    const pair = BASE_EXAMPLES.find(([b, f]) => !word.includes(b.slice(0, 3)) && f !== word) || BASE_EXAMPLES[0];
    $("notice").textContent += ` ${t("baseExample", { base: pair[0].toUpperCase(), form: pair[1].toUpperCase() })}`;
    return;
  }
  const label = document.createElement("span");
  label.className = "suggest-label";
  label.textContent = t("baseFound");
  box.appendChild(label);
  for (const form of forms) {
    const formTiles = tilesOf(form, "sk") || [];
    if (formTiles.length === guess.length) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn small suggest-btn";
      b.textContent = form.toUpperCase();
      b.setAttribute("aria-label", t("useWord", { word: form.toUpperCase() }));
      b.addEventListener("click", () => {
        draft.fill(formTiles);
        clearNotice();
        afterDraft();
        submit();
      });
      box.appendChild(b);
    } else {
      const s = document.createElement("span");
      s.className = "suggest-word";
      s.textContent = `${form.toUpperCase()} (${tn("letters", formTiles.length)})`;
      box.appendChild(s);
    }
  }
  box.hidden = false;
}

function useHint() {
  if (!game || game.done) return;
  if (!settings.hint) {
    notice(t("hintOff"), "soft");
    return;
  }
  if (game.hint) {
    notice(t("hintGone"), "soft");
    return;
  }
  const ans = answerTiles(game);
  const pos = hintPlace(game.guesses, ans, null);
  if (pos < 0) return;
  game.hint = { pos, tile: ans[pos] };
  // The hinted letter goes into its place in the guess being typed, when that place is free.
  if (draft.places[pos] === null) draft.put(pos, ans[pos]);
  buzz("medium");
  render();
  notice(t("hintShown", { n: pos + 1, letter: ans[pos].toUpperCase() }), "good");
  // The hinted letter drops into its place.
  const known = knowledge(game.guesses, ans, game.hint);
  board.setDraft(draft.places, draft.caret, known.places, pos, pos, true);
  saveGame(true);
}

/** Adds a finished word to the statistics: its length's counts and, for a daily word, its day. */
function record(g) {
  const s = statsOf(lang);
  const b = s.byLen[g.len];
  const used = g.guesses.length;
  b.played += 1;
  if (g.won) {
    b.won += 1;
    b.dist[used] = (Number(b.dist[used]) || 0) + 1;
    if (g.hint) b.hinted += 1;
  } else b.lost += 1;
  if (g.kind === "daily") {
    const day = s.days[g.day] || {};
    day[g.len] = [g.won ? 1 : 0, used, g.max, g.hint ? 1 : 0, g.hard ? 1 : 0];
    s.days[g.day] = day;
  }
  s.last = { len: g.len, used: g.won ? used : 0 };
  store.set(`stats-${lang}`, s, true);
}

async function nextWord() {
  if (!game) return;
  if (game.kind === "daily") {
    await openPractice(lang);
    return;
  }
  const g = gamesOf(lang);
  g.practice[game.len].game = null;
  saveGames(lang, g, true);
  await openPractice(lang);
}

async function switchLang(code) {
  if (!LANGS.includes(code) || code === lang) return;
  saveGame(true);
  settings.words = code;
  saveSettings();
  const kind = game ? game.kind : "daily";
  if (kind === "practice") await openPractice(code);
  else await openDaily(code, today());
}

async function switchLength(n) {
  if (!LENGTHS.includes(n)) return;
  saveGame(true);
  settings.length = n;
  saveSettings();
  if (!game || game.kind === "practice") await openPractice(lang, n);
  else await openDaily(lang, game.day, n);
}

// ---- sharing the result as words

function shareText() {
  const g = game;
  const used = g.guesses.length;
  const letters = tn("letters", g.len);
  const what =
    g.kind === "daily"
      ? t("shareDaily", { date: longDate(g.day), letters })
      : t("sharePractice", { n: (g.index || 0) + 1, letters });
  let line;
  if (g.won) line = g.max ? t("shareWonOf", { used, of: ofWord(g.max), max: g.max }) : tn("shareWon", used);
  else line = tn("shareLost", g.max || used);
  const extra = [g.hint ? t("shareHint") : "", g.hard ? t("shareHard") : ""].filter(Boolean).join(" ");
  return `${t("shareHead", { what })}\n${line}${extra ? ` ${extra}` : ""}`;
}

function shareResult() {
  if (!game || !game.done) return;
  const text = shareText();
  // Zapli's share sheet must be asked for inside the tap, so it comes first and without waiting for anything.
  if (canShare) {
    host.share({ text }).catch(() => showShareBox(text));
    return;
  }
  if (navigator.share) {
    navigator.share({ text }).catch((e) => {
      if (!e || e.name !== "AbortError") showShareBox(text);
    });
    return;
  }
  // Without a share sheet the result shows as text, selected, ready to copy.
  showShareBox(text);
}

function showShareBox(text) {
  const box = $("share-box");
  $("share-text").value = text;
  box.hidden = false;
  $("share-text").focus({ preventScroll: true });
  $("share-text").select();
}

// ---- fitting the board to its space

function fit() {
  if (!game) return;
  const n = game.len;
  const log = $("log");
  const w = log.clientWidth;
  const h = log.clientHeight;
  // The log: room for every guess a word gets (at most 8 rows; with no limit, 6) before it scrolls. A card is its
  // chips plus a padding of about an eighth of a chip above and below; beside them, its number and paddings.
  const rows = game.max ? Math.min(game.max, 8) : 6;
  const byW = (w - 52 - (n - 1) * 6) / n;
  const byH = (h - (rows - 1) * 6) / (rows * 1.26);
  const chip = Math.max(24, Math.min(52, Math.floor(Math.min(byW, byH))));
  log.style.setProperty("--chip", `${chip}px`);
  // The marks' key under the first word's line shows only where the log has room for it.
  $("start-legend").classList.toggle("squeezed", h < 240);
  // The lock: as large as its width allows, and smaller on a short screen, so the guesses keep their room.
  const pw = $("slots").parentElement.clientWidth - 24;
  const byWidth = (pw - (n - 1) * 8) / n;
  const tall = window.innerHeight || 700;
  const slot = Math.max(32, Math.min(64, Math.floor(Math.min(byWidth, tall * 0.07))));
  $("lock").style.setProperty("--slot", `${slot}px`);
  board.scrollEnd();
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

function dayStatus(day) {
  const n = settings.length;
  const rec = statsOf(lang).days[day];
  if (rec && rec[n]) return rec[n][0] === 1 ? "found" : "lost";
  const g = gamesOf(lang).daily[dailyKey(day, n)];
  return g && g.guesses.length ? "started" : "";
}

function renderCalendar() {
  const now = today();
  const count = calendar.render(calYear, calMonth, now, dayStatus, i18n.lang, "found");
  let title = `${calMonth}/${calYear}`;
  try {
    title = new Intl.DateTimeFormat(i18n.lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(calYear, calMonth - 1, 1)),
    );
  } catch (e) {
    // the numeric title above
  }
  $("cal-month").textContent = title;
  $("cal-count").textContent = tn("foundThisMonth", count);
  $("cal-length").textContent = t("dailyLength", { n: settings.length });
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

// statistics
let statsLang = "sk";
let statsLength = 0; // 0 for every length

function renderStats() {
  const s = statsOf(statsLang);
  const lens = statsLength ? [statsLength] : LENGTHS;
  let played = 0;
  let won = 0;
  let hinted = 0;
  let lost = 0;
  const dist = {};
  for (const n of lens) {
    const b = s.byLen[n];
    played += b.played;
    won += b.won;
    hinted += b.hinted;
    lost += b.lost;
    for (const [k, v] of Object.entries(b.dist)) dist[k] = (dist[k] || 0) + (Number(v) || 0);
  }
  const fmt = new Intl.NumberFormat(i18n.lang);
  const streak = currentStreak(statsLang);
  $("st-played").textContent = fmt.format(played);
  $("st-found").textContent = played
    ? new Intl.NumberFormat(i18n.lang, { style: "percent", maximumFractionDigits: 0 }).format(won / played)
    : "–";
  $("st-streak").textContent = fmt.format(streak.current);
  $("st-longest").textContent = fmt.format(streak.longest);
  $("st-hinted").textContent = hinted ? tn("stHinted", hinted) : "";
  $("st-hinted").hidden = !hinted;
  const box = $("st-dist");
  box.textContent = "";
  $("st-empty").hidden = played > 0;
  $("st-dist-wrap").hidden = played === 0;
  if (!played) return;
  const keys = Object.keys(dist)
    .map(Number)
    .filter((k) => Number.isInteger(k) && k > 0);
  const top = Math.max(6, ...keys);
  const rows = [];
  for (let i = 1; i <= top; i++) rows.push({ label: String(i), n: dist[i] || 0, at: i });
  rows.push({ label: t("distLost"), n: lost, at: 0 });
  const most = Math.max(1, ...rows.map((r) => r.n));
  const last = s.last;
  for (const r of rows) {
    const li = document.createElement("li");
    li.className = "dist-row";
    if (last && r.at === last.used && (!statsLength || statsLength === last.len)) li.classList.add("mine");
    const lab = document.createElement("span");
    lab.className = "dist-lab";
    lab.textContent = r.label;
    const track = document.createElement("span");
    track.className = "dist-track";
    const bar = document.createElement("span");
    bar.className = "dist-bar";
    bar.style.setProperty("--w", String(r.n / most));
    const num = document.createElement("span");
    num.className = "dist-num";
    num.textContent = fmt.format(r.n);
    bar.appendChild(num);
    track.appendChild(bar);
    li.appendChild(lab);
    li.appendChild(track);
    li.setAttribute("aria-label", t("distBar", { label: r.at ? tn("tries", r.at) : t("distLost"), n: r.n }));
    box.appendChild(li);
  }
}

function openStats() {
  statsLang = lang;
  statsLength = game ? game.len : 0;
  syncRadios("st-lang", statsLang);
  syncRadios("st-len", String(statsLength));
  renderStats();
  openDialog($("dlg-stats"));
}

// word length
function openLength() {
  document.querySelectorAll("#length-options .len").forEach((b) => {
    const on = Number(b.dataset.n) === (game ? game.len : settings.length);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  openDialog($("dlg-length"));
}

// settings
function syncRadios(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function syncSettingsForm() {
  syncRadios("words", lang);
  syncRadios("length", String(settings.length));
  syncRadios("guesses", settings.guesses);
  syncRadios("theme", settings.theme);
  syncRadios("ui", settings.ui);
  $("opt-hard").checked = settings.hard;
  $("opt-hint").checked = settings.hint;
  $("opt-contrast").checked = settings.contrast;
  $("opt-vibration").checked = settings.vibration;
  const n = settings.length;
  $("guess-note").textContent = t("guessNote", {
    n,
    tight: maxGuesses(n, "tight"),
    standard: maxGuesses(n, "standard"),
    relaxed: maxGuesses(n, "relaxed"),
  });
  document.querySelectorAll("[data-guesses]").forEach((el) => {
    const v = el.dataset.guesses;
    el.textContent = v === "free" ? "∞" : String(maxGuesses(n, v));
  });
}

function onSetting(e) {
  const input = e.target;
  if (input.id === "opt-hard") {
    settings.hard = input.checked;
    if (game && !game.done && game.guesses.length === 0) game.hard = settings.hard;
    else if (game && !game.done) notice(t("hardLater"), "soft");
  } else if (input.id === "opt-hint") settings.hint = input.checked;
  else if (input.id === "opt-contrast") settings.contrast = input.checked;
  else if (input.id === "opt-vibration") {
    settings.vibration = input.checked;
    buzz("light");
  } else if (input.name === "guesses") {
    settings.guesses = input.value;
    if (game && !game.done && game.guesses.length === 0) game.max = maxGuesses(game.len, settings.guesses);
  } else if (input.name === "theme") settings.theme = input.value;
  else if (input.name === "ui") {
    settings.ui = input.value;
    i18n.setLang(uiLang());
    translatePage();
    syncSettingsForm();
  } else if (input.name === "words") {
    switchLang(input.value);
    return;
  } else if (input.name === "length") {
    switchLength(Number(input.value)).then(syncSettingsForm);
    return;
  } else return;
  saveSettings();
  applyLook();
  render();
  saveGame();
}

// ---- wiring

const on = (id, fn) => $(id).addEventListener("click", fn);

on("btn-lang", () => switchLang(lang === "sk" ? "en" : "sk"));
on("btn-daily", openCalendar);
on("btn-stats", openStats);
on("btn-help", () => {
  if (!settings.taught) {
    settings.taught = true;
    saveSettings();
    $("btn-first").hidden = true;
  }
  openDialog($("dlg-help"));
});
on("btn-first", () => {
  settings.taught = true;
  saveSettings();
  $("btn-first").hidden = true;
  openDialog($("dlg-help"));
});
on("btn-settings", () => {
  syncSettingsForm();
  openDialog($("dlg-settings"));
});
on("btn-length", openLength);
on("btn-switch", () => {
  if (!game) return;
  saveGame(true);
  if (game.kind === "practice" || game.day !== today()) openDaily(lang, today());
  else openPractice(lang);
});
on("btn-hint", useHint);
on("btn-back", backspace);
on("btn-try", submit);
on("btn-next", nextWord);
on("btn-share", shareResult);
on("btn-retry", () => {
  setLoading(false);
  openActive(lang);
});
on("cal-prev", () => moveMonth(-1));
on("cal-next", () => moveMonth(1));
on("daily-close", () => closeDialog($("dlg-daily")));
on("daily-play", () => {
  closeDialog($("dlg-daily"));
  openDaily(lang, today());
});
on("stats-done", () => closeDialog($("dlg-stats")));
on("help-done", () => closeDialog($("dlg-help")));
on("settings-done", () => closeDialog($("dlg-settings")));
on("length-close", () => closeDialog($("dlg-length")));
$("length-options").addEventListener("click", (e) => {
  const b = e.target.closest(".len");
  if (!b) return;
  closeDialog($("dlg-length"));
  switchLength(Number(b.dataset.n));
});
$("dlg-stats").addEventListener("change", (e) => {
  if (e.target.name === "st-lang") statsLang = e.target.value;
  else if (e.target.name === "st-len") statsLength = Number(e.target.value);
  renderStats();
});
$("dlg-settings").addEventListener("change", onSetting);

// A physical keyboard: letters type, Backspace takes one back, Enter tries the word, the arrows move the caret.
document.addEventListener("keydown", (e) => {
  if (!game || document.querySelector("dialog[open]")) return;
  const target = e.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (game.done) {
    if (e.key === "Enter" && !(target && target.tagName === "BUTTON")) nextWord();
    else return;
  } else if (e.key === "Backspace") backspace();
  else if (e.key === "Enter") {
    // Enter on a focused button of the page (Hint, a pill) activates that button; on a key, a place of the lock or an
    // accent it tries the word, as it does anywhere else.
    const own = target && typeof target.closest === "function" ? target.closest("button") : null;
    if (own && !own.closest("#keys, #slots, #accents") && own.id !== "btn-try") return;
    submit();
  } else if (e.key === "ArrowLeft") pickSlot(Math.max(0, draft.caret - 1));
  else if (e.key === "ArrowRight") pickSlot(Math.min(game.len - 1, draft.caret + 1));
  else if (e.key === "Escape") {
    draft.clear();
    clearNotice();
    afterDraft();
  } else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
    const tile = tileOf(lang, e.key);
    if (!tile) return;
    keyboard.flash(baseKey(lang, tile));
    typeTile(tile, false);
  } else return;
  e.preventDefault();
});

if (darkQuery && typeof darkQuery.addEventListener === "function") darkQuery.addEventListener("change", applyLook);
// The board fits again when the window changes and when the log's share of it does (a message of two lines, a
// status line that wraps at a large text size).
if (typeof ResizeObserver === "function") {
  const watch = new ResizeObserver(() => fit());
  watch.observe(document.querySelector(".app"));
  watch.observe($("log"));
} else window.addEventListener("resize", fit);

// ---- life cycle: save when the app goes to the background; a new day brings its daily word on return

function persist() {
  saveGame(true);
  store.flush();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
  else if (game && game.kind === "daily" && game.done && game.day !== today()) openDaily(lang, today());
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

function supports(feature) {
  try {
    return Boolean(typeof host.supports === "function" && host.supports(feature));
  } catch (e) {
    return false;
  }
}

async function start() {
  store.loadLocal();
  if (host) await store.loadKv(host);
  settings = normSettings(store.get("settings"));
  if (await hostReady()) {
    canBuzz = Boolean(host.haptics) && supports("haptics.impact");
    canShare = typeof host.share === "function" && supports("share");
  }
  $("opt-vibration-row").hidden = !canBuzz;
  measureTextScale();
  root.classList.toggle("big-text", textScale >= 1.5);
  i18n.setLang(uiLang());
  translatePage();
  applyLook();
  const code = wordsLang();
  lang = code;
  await openActive(code);
  loadWords(code === "sk" ? "en" : "sk").catch(() => null);
}

start();
