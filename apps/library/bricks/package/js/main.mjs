// Bricks: the page. It shows the start screen, the level picker and the play screen, runs the game loop, turns the
// game's events into pictures, sound and vibration, and keeps the player's progress.
//
// Screens are hash routes, so Back works as people expect:
//   #/                     the start screen
//   #/levels/<world>       the level picker
//   #/play/level/<id>      a hand-made level ("1-7")
//   #/play/daily           today's daily level
//   #/play/endless         endless play
// Back during play pauses the game; Back again saves it and leaves (it waits on the start screen).
//
// Saved values (Zapli's own store, with a copy in localStorage; js/core/store.mjs):
//   settings, progress (stars and best scores), daily (results by date), endless (records), stats, saved (games in
//   progress, one per kind, and the last result).

import { createStore } from "./core/store.mjs";
import { createI18n, pickLang } from "./core/i18n.mjs";
import { isoDay, weekday, addDays } from "./core/dates.mjs";
import { STRINGS } from "./ui/strings.mjs";
import * as P from "./ui/progress.mjs";
import { createLogo } from "./ui/logo.mjs";
import { LEVELS, WORLDS, levelById, worldOf, nextLevel, previousLevel } from "./game/levels.mjs";
import { makeLevel, dailyDifficulty, waveDifficulty } from "./game/generate.mjs";
import * as G from "./game/game.mjs";
import * as A from "./game/arena.mjs";
import { createRenderer } from "./render/renderer.mjs";
import { paintTile, paintBead, beadIcon, GLAZES, BEAD_COLORS, shade } from "./render/sprites.mjs";
import { createSound } from "./audio/sound.mjs";

const host = window.zapli;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const store = createStore("bricks", ["settings", "progress", "daily", "endless", "stats", "saved"]);
const i18n = createI18n(STRINGS);
const t = (key, args) => i18n.t(key, args);
const tn = (key, n, args) => i18n.tn(key, n, args);
const sound = createSound();
const renderer = createRenderer($("arena"));
const logo = createLogo($("logo"));
const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
// A phone turned sideways: the play screen puts its HUD beside the board (css/app.css uses the same query).
const sidewaysQuery = window.matchMedia ? window.matchMedia("(orientation: landscape) and (max-height: 560px)") : null;
const sideways = () => Boolean(sidewaysQuery && sidewaysQuery.matches);

// Each world's glaze on the level tiles: light enough to glow, dark enough for the text on it (4.5:1 or more).
const WORLD_LOOK = {
  terracotta: { g1: "#D0581A", g2: "#A33C0C", shadow: "rgba(163,60,12,0.35)", ink: "#FFFFFF", bar: "#F4934A" },
  cobalt: { g1: "#3A62D8", g2: "#2341A6", shadow: "rgba(35,65,166,0.35)", ink: "#FFFFFF", bar: "#5D88F6" },
  copper: { g1: "#178573", g2: "#0D5A4E", shadow: "rgba(13,90,78,0.35)", ink: "#FFFFFF", bar: "#2DB89C" },
  lustre: { g1: "#F0C055", g2: "#C99327", shadow: "rgba(150,105,20,0.35)", ink: "#2A1A02", bar: "#EDBA4A" },
};

let settings = P.normSettings(null);
let progress = P.normProgress(null);
let daily = P.normDaily(null);
let endless = P.normEndless(null);
let stats = P.normStats(null);
let saved = {};
let canBuzz = false;
let textScale = 1;
let calm = false;
let route = { name: "home" };
let session = null;
let pickedWorld = 0;
let inputKind = "touch";
let statsDirty = false;
let secondsCarry = 0;
let leaving = false; // set while the page itself leaves the play screen, so Back's pause does not step in
let shownHash = ""; // the hash of the screen on show
let uiFont = "system-ui, sans-serif";
let firstRoute = true; // the first screen after the page loaded

// ---- saving

function saveSaved(now) {
  store.set("saved", saved, now);
}

function saveAll() {
  store.set("progress", progress, true);
  store.set("daily", daily, true);
  store.set("endless", endless, true);
  store.set("stats", stats, true);
  statsDirty = false;
}

function today() {
  return isoDay(new Date());
}

// ---- language and look

function uiLang() {
  let phone = "";
  try {
    if (host && host.app && typeof host.app.locale === "function") phone = String(host.app.locale() || "");
  } catch (e) {
    phone = "";
  }
  return pickLang(settings.ui === "auto" ? null : settings.ui, phone);
}

const nf = () => new Intl.NumberFormat(i18n.lang === "sk" ? "sk-SK" : "en-GB");
const num = (n) => nf().format(n);

function longDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(i18n.lang === "sk" ? "sk-SK" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(y, m - 1, d));
  } catch (e) {
    return day;
  }
}

function shortDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(i18n.lang === "sk" ? "sk-SK" : "en-GB", { weekday: "short" }).format(
      new Date(y, m - 1, d),
    );
  } catch (e) {
    return day;
  }
}

function translatePage() {
  root.lang = i18n.lang;
  document.title = t("appName");
  document.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  document.querySelectorAll("[data-t-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.tLabel));
    el.title = t(el.dataset.tLabel);
  });
  buildLegends();
}

function measureTextScale() {
  const probe = $("tz-probe");
  const h = probe ? probe.getBoundingClientRect().height : 0;
  textScale = h > 0 ? Math.min(3, Math.max(1, h / 100)) : 1;
  root.style.setProperty("--tz", textScale.toFixed(3));
  root.classList.toggle("big-text", textScale >= 1.3);
  root.classList.toggle("huge-text", textScale >= 2.4);
  root.classList.toggle("landscape", sideways());
}

function applyLook() {
  uiFont = (getComputedStyle(root).getPropertyValue("--font") || "").trim() || "system-ui, sans-serif";
  if (settings.theme === "device") delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  calm = settings.effects === "calm" || (settings.effects === "auto" && Boolean(motionQuery && motionQuery.matches));
  root.classList.toggle("calm", calm);
  renderer.setCalm(calm);
  sound.setEnabled(settings.sound);
}

// ---- vibration (Zapli's haptics; a plain browser vibrates where it can)

let lastBuzz = 0;
function buzz(kind, force) {
  if (!canBuzz || !settings.vibration) return;
  const now = performance.now();
  if (!force && now - lastBuzz < 60) return;
  lastBuzz = now;
  try {
    if (host && host.haptics) host.haptics.impact(kind).catch(() => {});
    else if (navigator.vibrate)
      navigator.vibrate(kind === "heavy" || kind === "error" ? 40 : kind === "medium" ? 20 : 10);
  } catch (e) {
    // no vibration after all
  }
}

const HAPTIC = {
  break: "light",
  tough: "light",
  paddle: "light",
  catch: "light",
  burst: "medium",
  power: "success",
  lost: "heavy",
  over: "error",
  clear: "success",
};

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

function anyDialogOpen() {
  return Boolean(document.querySelector("dialog[open]"));
}

document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("close", () => {
    const el = returnFocus.get(dlg);
    returnFocus.delete(dlg);
    if (el && el.isConnected && typeof el.focus === "function" && !anyDialogOpen()) el.focus({ preventScroll: true });
  });
  // A tap on the dimmed backdrop closes sheets (not the pause or result card, which need a choice).
  if (dlg.classList.contains("sheet")) {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) closeDialog(dlg);
    });
  }
});

let confirmResolve = null;
function confirmBox(title, body, yes) {
  $("confirm-title").textContent = title;
  $("confirm-body").textContent = body;
  $("confirm-yes").textContent = yes;
  openDialog($("dlg-confirm"));
  $("confirm-no").focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}
$("confirm-yes").addEventListener("click", () => {
  const r = confirmResolve;
  confirmResolve = null;
  closeDialog($("dlg-confirm"));
  if (r) r(true);
});
$("confirm-no").addEventListener("click", () => closeDialog($("dlg-confirm")));
$("dlg-confirm").addEventListener("close", () => {
  const r = confirmResolve;
  confirmResolve = null;
  if (r) r(false);
});

// ---- notices: they stay until the player's next action

function notice(id, text) {
  $(id).textContent = text;
}
window.addEventListener(
  "pointerdown",
  () => {
    $("home-notice").textContent = "";
    $("levels-notice").textContent = "";
  },
  true,
);

// ---- navigation

function parseRoute(hash) {
  const parts = String(hash || "")
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean);
  if (parts[0] === "levels") {
    const w = Number(parts[1]);
    return { name: "levels", world: Number.isInteger(w) && w >= 1 && w <= WORLDS.length ? w - 1 : null };
  }
  if (parts[0] === "play") {
    if (parts[1] === "level" && levelById(parts[2] || "")) return { name: "play", mode: "level", id: parts[2] };
    if (parts[1] === "daily") return { name: "play", mode: "daily" };
    if (parts[1] === "endless") return { name: "play", mode: "endless" };
  }
  return { name: "home" };
}

const depth = () => (history.state && Number.isInteger(history.state.d) ? history.state.d : 0);

function navigate(hash) {
  history.pushState({ d: depth() + 1, from: location.hash || "#/" }, "", hash);
  onRoute();
}

/** Goes back a screen, or to `fallback` when there is nothing of ours to go back to. */
function goBack(fallback) {
  if (depth() > 0) history.back();
  else {
    history.replaceState({ d: 0 }, "", fallback);
    onRoute();
  }
}

/** Leaves the play screen for the level picker (where a level was picked) or the start screen. */
function leavePlay(toLevels) {
  const from = history.state && history.state.from;
  if (toLevels && !(from && from.startsWith("#/levels"))) {
    const w = session && session.mode === "level" ? Number(session.key.id.split("-")[0]) : pickedWorld + 1;
    leaving = true;
    history.replaceState(history.state, "", `#/levels/${w}`);
    onRoute();
    return;
  }
  leaving = true;
  goBack(toLevels ? `#/levels/${pickedWorld + 1}` : "#/");
}

function showScreen(name) {
  for (const s of ["home", "levels", "play"]) $(`screen-${s}`).hidden = s !== name;
}

function onRoute() {
  if (location.hash === shownHash && route.name !== "home") return;
  const next = parseRoute(location.hash);
  if (route.name === "play" && session && next.name !== "play") {
    if (!session.done && !leaving) {
      // Back during play pauses, and Back on the pause card plays on: the page stays. Leaving is the card's
      // "Save and leave".
      history.pushState({ d: depth() + 1, from: session.from }, "", session.hash);
      shownHash = location.hash;
      if (!session.paused) pauseGame(true);
      else if ($("dlg-pause").open) {
        pauseAction = "resume";
        closeDialog($("dlg-pause"));
      }
      return;
    }
    endSession(true);
  }
  leaving = false;
  shownHash = location.hash;
  for (const dlg of document.querySelectorAll("dialog[open]")) closeDialog(dlg);
  route = next;
  if (next.name === "home") {
    showScreen("home");
    renderHome();
  } else if (next.name === "levels") {
    if (next.world !== null) pickedWorld = next.world;
    showScreen("levels");
    renderLevels();
  } else {
    showScreen("play");
    openPlay(next);
  }
  firstRoute = false;
}

// ---- start screen

function renderHome() {
  const level = saved.level && levelById(saved.level.id);
  const next = P.nextToPlay(progress, settings.openAll);
  if (level) {
    $("play-title").textContent = t("resume");
    $("play-sub").textContent = t("levelLine", { id: level.id, name: level.name[i18n.lang] });
  } else if (next) {
    $("play-title").textContent = t("play");
    $("play-sub").textContent = t("levelLine", { id: next.id, name: next.name[i18n.lang] });
  } else {
    $("play-title").textContent = t("replayLevels");
    $("play-sub").textContent = t("allCleared");
  }
  const day = today();
  const d = daily.days[day];
  $("daily-date").textContent = longDate(day);
  const resumable = saved.daily && saved.daily.day === day;
  $("daily-state").textContent = resumable
    ? t("dailyResume")
    : d && d.cleared
      ? t("dailyCleared", { score: num(d.best) })
      : d
        ? t("dailyTried", { score: num(d.best) })
        : t("dailyNew");
  const week = $("daily-week");
  week.textContent = "";
  const monday = addDays(day, -weekday(day));
  const labels = [];
  for (let i = 0; i < 7; i++) {
    const dd = addDays(monday, i);
    const e = daily.days[dd];
    const dot = document.createElement("i");
    if (e && e.cleared) dot.className = "cleared";
    else if (e) dot.className = "played";
    if (dd === day) dot.classList.add("today");
    week.appendChild(dot);
    labels.push(t(e && e.cleared ? "dayCleared" : e ? "dayTried" : "dayNone", { day: shortDay(dd) }));
  }
  const st = P.dailyStreaks(daily, day);
  $("daily-streak").hidden = st.current < 1;
  $("daily-streak").textContent = tn("streak", st.current);
  $("btn-daily").setAttribute(
    "aria-label",
    [
      t("daily"),
      longDate(day),
      $("daily-state").textContent,
      st.current ? tn("streak", st.current) : "",
      `${t("week")}: ${labels.join(", ")}`,
    ]
      .filter(Boolean)
      .join(". "),
  );
  $("endless-sub").textContent = saved.endless
    ? t("endlessResume", { wave: saved.endless.wave })
    : endless.best
      ? t("endlessBest", { wave: endless.bestWave, score: num(endless.best) })
      : t("endlessNew");
  const done = P.clearedCount(progress);
  $("levels-sub").textContent =
    `${t("levelsDone", { done, total: LEVELS.length })} · ${tn("starsCount", P.starsTotal(progress))}`;
  const bars = $("world-bars");
  bars.textContent = "";
  WORLDS.forEach((w, i) => {
    const bar = document.createElement("i");
    const fill = document.createElement("b");
    fill.style.width = `${(P.worldCleared(progress, i) / 12) * 100}%`;
    fill.style.background = WORLD_LOOK[w.key].bar;
    bar.appendChild(fill);
    bars.appendChild(bar);
  });
  $("first-line").hidden = settings.seenHelp || done > 0 || Object.keys(daily.days).length > 0;
  logo.layout();
  logo.draw(0, true);
}

$("btn-play").addEventListener("click", () => {
  const level = saved.level && levelById(saved.level.id);
  const next = level || P.nextToPlay(progress, settings.openAll);
  if (next) navigate(`#/play/level/${next.id}`);
  else navigate(`#/levels/${pickedWorld + 1}`);
});
$("btn-daily").addEventListener("click", () => navigate("#/play/daily"));
$("btn-endless").addEventListener("click", () => navigate("#/play/endless"));
$("btn-levels").addEventListener("click", () => {
  const next = P.nextToPlay(progress, settings.openAll);
  pickedWorld = next ? Number(next.id.split("-")[0]) - 1 : pickedWorld;
  navigate(`#/levels/${pickedWorld + 1}`);
});
$("btn-first").addEventListener("click", openHelp);
$("btn-help").addEventListener("click", openHelp);
$("btn-stats").addEventListener("click", openStats);
$("btn-settings").addEventListener("click", openSettings);

// ---- level picker

function renderLevels() {
  $("star-total").innerHTML = "";
  const star = svgIcon("i-star", "ico");
  $("star-total").append(star, document.createTextNode(`${num(P.starsTotal(progress))} / ${P.MAX_STARS}`));
  $("star-total").setAttribute("aria-label", tn("starsCount", P.starsTotal(progress)));
  const tabs = $("world-tabs");
  tabs.textContent = "";
  WORLDS.forEach((w, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "world-tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === pickedWorld));
    b.setAttribute("aria-controls", "world-head");
    b.tabIndex = i === pickedWorld ? 0 : -1;
    b.style.setProperty("--g", WORLD_LOOK[w.key].bar);
    const sw = document.createElement("span");
    sw.className = "swatch";
    const name = document.createElement("span");
    name.textContent = t(`world_${w.key}`);
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${P.worldStars(progress, i)}/36`;
    b.append(sw, name, count);
    b.setAttribute(
      "aria-label",
      t("worldTab", { world: t(`world_${w.key}`), stars: P.worldStars(progress, i), max: 36 }),
    );
    b.addEventListener("click", () => {
      pickedWorld = i;
      history.replaceState(history.state, "", `#/levels/${i + 1}`);
      shownHash = location.hash;
      renderLevels();
      tabs.children[i].focus();
    });
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const j = (i + (e.key === "ArrowRight" ? 1 : WORLDS.length - 1)) % WORLDS.length;
      tabs.children[j].click();
      e.preventDefault();
    });
    tabs.appendChild(b);
  });
  const w = WORLDS[pickedWorld];
  $("world-head").setAttribute("aria-label", t(`world_${w.key}`));
  $("world-about").textContent = t(`worldAbout_${w.key}`);
  const look = WORLD_LOOK[w.key];
  const grid = $("level-grid");
  grid.textContent = "";
  const next = P.nextToPlay(progress, settings.openAll);
  for (const l of LEVELS.filter((x) => x.id.startsWith(`${pickedWorld + 1}-`))) {
    const e = P.levelEntry(progress, l.id);
    const open = P.isOpen(progress, l.id, settings.openAll);
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "level";
    b.style.setProperty("--g1", look.g1);
    b.style.setProperty("--g2", look.g2);
    b.style.setProperty("--gs", look.shadow);
    b.style.setProperty("--gt", look.ink);
    b.style.setProperty("--gts", look.ink === "#FFFFFF" ? "0 1px 1px rgba(0, 0, 0, 0.3)" : "none");
    if (look.ink !== "#FFFFFF") {
      // On gold, stars are dark amber, so they show.
      b.style.setProperty("--star-on", "#7A3E00");
      b.style.setProperty("--star-off", "rgba(42, 26, 2, 0.22)");
    }
    const n = document.createElement("span");
    n.className = "num";
    n.textContent = l.id.split("-")[1];
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = l.name[i18n.lang];
    b.append(n, name);
    let state;
    if (!open) {
      b.classList.add("locked");
      b.appendChild(svgIcon("i-lock", "ico lock"));
      state = t("levelLocked");
      b.addEventListener("click", () => {
        const prev = previousLevel(l.id);
        notice("levels-notice", t("lockedMsg", { id: prev ? prev.id : "" }));
      });
    } else {
      const stars = document.createElement("span");
      stars.className = "lstars";
      for (let k = 0; k < 3; k++) stars.appendChild(svgIcon("i-star", k < e.stars ? "ico on" : "ico"));
      b.appendChild(stars);
      if (e.skipped && !e.cleared) b.classList.add("skipped");
      if (next && next.id === l.id) b.classList.add("next");
      state = e.cleared ? t("starsOf", { n: e.stars }) : e.skipped ? t("levelSkipped") : t("levelNew");
      b.addEventListener("click", () => navigate(`#/play/level/${l.id}`));
    }
    b.setAttribute("aria-label", t("levelAria", { id: l.id, name: l.name[i18n.lang], state }));
    li.appendChild(b);
    grid.appendChild(li);
  }
}

$("btn-levels-back").addEventListener("click", () => goBack("#/"));

function svgIcon(id, cls) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

// ---- play: sessions

function newSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

/** The options of a game: the level's picture, speed, power-ups and so on. */
function optionsFor(mode, key) {
  if (mode === "level") {
    const l = levelById(key.id);
    const w = worldOf(l);
    return { def: l, speed: w.speed, pace: settings.pace, power: w.power, drop: w.drop, seed: key.seed, lives: 3 };
  }
  if (mode === "daily") {
    const wd = weekday(key.day);
    return {
      def: makeLevel(`daily:${key.day}`, dailyDifficulty(wd)),
      speed: 290 + wd * 7,
      pace: settings.pace,
      power: G.POWERS,
      drop: 0.12,
      seed: key.seed,
      lives: 3,
    };
  }
  return {
    def: makeLevel(`endless:${key.runSeed}:${key.wave}`, waveDifficulty(key.wave)),
    speed: Math.min(400, 284 + key.wave * 6),
    pace: settings.pace,
    power: G.POWERS,
    drop: 0.11,
    seed: key.seed,
    lives: key.lives,
    score: key.score,
  };
}

function tintFor(mode, id) {
  if (mode === "daily") return "daily";
  if (mode === "endless") return "endless";
  return worldOf(levelById(id)).key;
}

function openPlay(r) {
  if (session && session.hash === location.hash && !session.done) {
    fitArena();
    return;
  }
  let key;
  let snap = null;
  if (r.mode === "level") {
    const s = saved.level;
    if (s && s.id === r.id && s.snap) {
      key = { id: r.id, seed: s.seed };
      snap = s.snap;
    } else key = { id: r.id, seed: newSeed() };
    pickedWorld = Number(r.id.split("-")[0]) - 1;
  } else if (r.mode === "daily") {
    const day = today();
    const s = saved.daily;
    if (s && s.day === day && s.snap) {
      key = { day, seed: s.seed };
      snap = s.snap;
    } else key = { day, seed: newSeed() };
  } else {
    const s = saved.endless;
    if (s && s.snap) {
      key = { runSeed: s.runSeed, wave: s.wave, lives: s.lives, score: s.score, seed: s.seed };
      snap = s.snap;
    } else key = { runSeed: newSeed(), wave: 1, lives: 3, score: 0, seed: newSeed() };
  }
  // A result on screen when the page reloaded (the phone turned, or dark mode changed) is shown again; any other
  // visit starts the game.
  const last = saved.result;
  const reshow = firstRoute && !snap && last && last.hash === location.hash && Date.now() - last.at < 15 * 60000;
  startSession(r.mode, key, snap);
  if (reshow) {
    session.done = true;
    renderer.clearEffects();
    // Behind a cleared level's result the wall is gone, as it was.
    if (/clear/i.test(last.info.kind)) for (const b of session.game.bricks) b.alive = false;
    showResult(last.info);
  } else if (last) {
    saved.result = null;
    saveSaved();
  }
}

function startSession(mode, key, snap) {
  const opts = optionsFor(mode, key);
  let game = snap ? G.restoreGame(opts, snap) : null;
  const resumed = Boolean(game);
  if (!game) game = G.createGame(opts);
  session = {
    mode,
    key,
    opts,
    game,
    hash: location.hash,
    from: history.state && history.state.from,
    paused: false,
    done: false,
    needsDraw: true,
    lastScore: -1,
    lastLives: -1,
    powersKey: "",
    afterT: 0,
    after: null,
  };
  renderer.clearEffects();
  renderer.setTint(tintFor(mode, key.id));
  setHudTitle();
  fitArena();
  if (resumed) pauseGame(false);
  else showStartBanner();
}

function showStartBanner() {
  const s = session;
  if (s.mode === "level") {
    const l = levelById(s.key.id);
    renderer.showBanner(l.name[i18n.lang], t("bannerLevel", { id: l.id }));
  } else if (s.mode === "daily") renderer.showBanner(t("daily"), longDate(s.key.day));
  else renderer.showBanner(t("bannerWave", { n: s.key.wave }), t("endless"));
}

function setHudTitle() {
  const s = session;
  if (s.mode === "level") {
    const l = levelById(s.key.id);
    $("hud-title").textContent = l.name[i18n.lang];
    $("hud-sub").textContent = t("hudLevel", { id: l.id });
  } else if (s.mode === "daily") {
    $("hud-title").textContent = t("daily");
    $("hud-sub").textContent = longDate(s.key.day);
  } else {
    $("hud-title").textContent = t("endless");
    $("hud-sub").textContent = t("hudWave", { n: s.key.wave });
  }
  // Room for the score: six digits in a level or the daily level, seven in endless play (a run carries its score
  // from wave to wave), and a digit more than the score has when a run gets that far.
  const digits = Math.max(s.mode === "endless" ? 7 : 6, String(Math.floor(s.game.score)).length + 1);
  const room = num(Number("8".repeat(digits)));
  if ($("hud-score-room").textContent !== room) {
    $("hud-score-room").textContent = room;
    // More room at a wave's start (or in another language): the HUD is laid out again then, between two walls.
    if (route.name === "play") fitArena();
  }
  s.lastScore = -1;
  s.lastLives = -1;
  s.powersKey = "?";
}

/** Saves the game in play, to resume it later. */
function saveSession() {
  const s = session;
  if (!s || s.done) return;
  const snap = G.snapshot(s.game);
  if (s.mode === "level") saved.level = { id: s.key.id, seed: s.key.seed, snap };
  else if (s.mode === "daily") saved.daily = { day: s.key.day, seed: s.key.seed, snap };
  else
    saved.endless = {
      runSeed: s.key.runSeed,
      wave: s.key.wave,
      lives: s.game.lives,
      score: s.game.score,
      seed: s.key.seed,
      snap,
    };
  saveSaved(true);
}

function endSession(save) {
  if (!session) return;
  if (save) saveSession();
  flushStats();
  session = null;
  activePointer = null;
  keys.clear();
}

function pauseGame(showDialog) {
  if (!session || session.done) return;
  session.paused = true;
  session.needsDraw = true;
  saveSession();
  flushStats();
  if (showDialog !== false || !$("dlg-pause").open) {
    $("pause-sub").textContent = `${$("hud-title").textContent} · ${$("hud-sub").textContent}`;
    $("pause-sound").checked = settings.sound;
    $("pause-vibration").checked = settings.vibration;
    $("pause-vibration-row").hidden = !canBuzz;
    pauseAction = null;
    openDialog($("dlg-pause"));
    $("pause-resume").focus();
  }
}

let pauseAction = null;

function resumeGame() {
  if (!session) return;
  session.paused = false;
  lastFrame = 0;
  sound.unlock();
}

$("btn-pause").addEventListener("click", () => pauseGame(true));
$("pause-resume").addEventListener("click", () => {
  pauseAction = "resume";
  closeDialog($("dlg-pause"));
});
$("pause-restart").addEventListener("click", async () => {
  if (session && session.mode === "endless") {
    const ok = await confirmBox(t("newRunTitle"), t("newRunBody"), t("newRun"));
    if (!ok) return;
    finishRun();
  }
  pauseAction = "restart";
  closeDialog($("dlg-pause"));
});
$("pause-leave").addEventListener("click", () => {
  pauseAction = "leave";
  closeDialog($("dlg-pause"));
});
$("pause-sound").addEventListener("change", (e) => {
  settings.sound = e.target.checked;
  saveSettings();
});
$("pause-vibration").addEventListener("change", (e) => {
  settings.vibration = e.target.checked;
  saveSettings();
});
$("dlg-pause").addEventListener("close", () => {
  if ($("dlg-confirm").open) return;
  const action = pauseAction;
  pauseAction = null;
  if (!session || route.name !== "play") return;
  // Back (or Escape) closes the card without a choice: that plays on, as Resume does.
  if (action === "leave") leavePlay(false);
  else if (action === "restart") restartSession();
  else resumeGame();
});

function restartSession() {
  if (!session) return;
  const s = session;
  if (s.mode === "level") saved.level = null;
  else if (s.mode === "daily") saved.daily = null;
  else saved.endless = null;
  saveSaved(true);
  let key;
  if (s.mode === "level") key = { id: s.key.id, seed: newSeed() };
  else if (s.mode === "daily") key = { day: today(), seed: newSeed() };
  else key = { runSeed: newSeed(), wave: 1, lives: 3, score: 0, seed: newSeed() };
  session = null;
  startSession(s.mode, key, null);
  sound.unlock();
}

// ---- play: the arena's size

let arenaRect = { left: 0, top: 0, width: 360, height: 600 };

/**
 * Fits the board to the stage: at the start of a game and when the window really changes (the phone turned, split
 * screen, the text size). The HUD has the same size all game long, so nothing the game shows calls this; a call that
 * finds the same size changes nothing on the canvas.
 */
function fitArena() {
  const stage = $("stage");
  const hud = $("hud");
  const pad = 6;
  if (sideways()) {
    // Sideways the board is as tall as the screen allows, and the stage only as wide as the board, so the HUD and
    // the board sit together in the middle. The HUD's column keeps the width its texts need now (the score has its
    // room from the start, the chips wrap inside), so the pair never slides while the game runs.
    const play = $("screen-play");
    hud.style.width = "";
    const hw = Math.ceil(hud.getBoundingClientRect().width || 0);
    if (hw) hud.style.width = `${hw}px`;
    const h = stage.clientHeight || play.clientHeight;
    const room = Math.max(120, play.clientWidth - hw - 16);
    stage.style.width = `${Math.min(room, Math.floor(((h - pad * 2) * A.W) / A.H) + pad * 2)}px`;
  } else {
    hud.style.width = "";
    stage.style.width = "";
  }
  fitChips();
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (!sw || !sh) return;
  const scale = Math.min((sw - pad * 2) / A.W, (sh - pad * 2) / A.H);
  const w = Math.floor(A.W * scale);
  const h = Math.floor(A.H * scale);
  const left = Math.floor((sw - w) / 2);
  // The arena sits at the top of the space; what is left below is room for the finger.
  const top = Math.max(pad, Math.min(Math.floor((sh - h) / 2), pad + 4));
  const canvas = $("arena");
  canvas.style.left = `${left}px`;
  canvas.style.top = `${top}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sized = renderer.resize(w, h, dpr);
  const r = stage.getBoundingClientRect();
  arenaRect = { left: r.left + left, top: r.top + top, width: w, height: h };
  if (!session) return;
  // A canvas sized anew is blank: draw it at once, before the screen shows it, rather than on the next frame.
  if (sized) drawArena(0);
  else session.needsDraw = true;
}

// ---- play: input

// The whole play screen takes the drag, beside the board too (when the phone is turned), but not the HUD's buttons.
const playArea = $("screen-play");
const onHud = (e) => Boolean(e.target && typeof e.target.closest === "function" && e.target.closest(".hud"));
let activePointer = null;
let lastX = 0;
const keys = new Set();

function playing() {
  return session && !session.paused && !session.done && !anyDialogOpen();
}

function unitsPerPx() {
  return A.W / Math.max(1, arenaRect.width);
}

function paddleTo(x) {
  const g = session.game;
  const half = g.paddle.w / 2;
  G.setPaddle(g, Math.max(half, Math.min(A.W - half, x)));
}

playArea.addEventListener("pointerdown", (e) => {
  if (!playing() || onHud(e)) return;
  if (activePointer !== null && e.pointerId !== activePointer) {
    // A second finger launches.
    sound.unlock();
    if (G.launch(session.game)) buzz("light");
    return;
  }
  activePointer = e.pointerId;
  lastX = e.clientX;
  inputKind = e.pointerType === "mouse" ? "mouse" : "touch";
  try {
    playArea.setPointerCapture(e.pointerId);
  } catch (err) {
    // the pointer is gone already
  }
  if (inputKind === "mouse") paddleTo((e.clientX - arenaRect.left) * unitsPerPx());
  e.preventDefault();
});

playArea.addEventListener("pointermove", (e) => {
  if (!playing()) return;
  if (e.pointerType === "mouse") {
    inputKind = "mouse";
    paddleTo((e.clientX - arenaRect.left) * unitsPerPx());
    return;
  }
  if (e.pointerId !== activePointer) return;
  const dx = (e.clientX - lastX) * unitsPerPx() * settings.sense;
  lastX = e.clientX;
  paddleTo(session.game.paddle.tx + dx);
});

function endPointer(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (e.type === "pointerup" && playing()) {
    sound.unlock();
    if (G.launch(session.game)) buzz("light");
  }
}
playArea.addEventListener("pointerup", endPointer);
playArea.addEventListener("pointercancel", endPointer);
playArea.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (route.name !== "play" || !session || e.ctrlKey || e.metaKey || e.altKey) return;
  if (anyDialogOpen()) return;
  const k = e.key;
  if (k === "ArrowLeft" || k === "ArrowRight" || k === "a" || k === "d" || k === "A" || k === "D") {
    keys.add(k.toLowerCase() === "a" ? "ArrowLeft" : k.toLowerCase() === "d" ? "ArrowRight" : k);
    inputKind = "keys";
    e.preventDefault();
  } else if (k === " " || k === "Enter" || k === "ArrowUp") {
    inputKind = "keys";
    sound.unlock();
    if (playing() && G.launch(session.game)) buzz("light");
    e.preventDefault();
  } else if (k === "p" || k === "P" || k === "Escape") {
    pauseGame(true);
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key);
  if (e.key.toLowerCase() === "a") keys.delete("ArrowLeft");
  if (e.key.toLowerCase() === "d") keys.delete("ArrowRight");
});

function moveByKeys(dt) {
  if (!keys.size) return;
  const dir = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  if (dir) paddleTo(session.game.paddle.tx + dir * 470 * dt);
}

// Sound may start only from a completed tap.
for (const type of ["pointerup", "touchend", "click", "keydown"]) {
  window.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}

// ---- play: the loop

let lastFrame = 0;
let logoT = 0;
let logoDrawn = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 60;
  lastFrame = now;
  if (dt > 0.1 || dt <= 0) dt = 1 / 60;

  if (route.name === "home" && !document.hidden && !calm) {
    logoT += dt;
    if (now - logoDrawn > 33) {
      logo.draw(logoT, false);
      logoDrawn = now;
    }
  }
  if (route.name !== "play" || !session) return;
  const s = session;
  const g = s.game;
  const running = playing();
  if (running) {
    moveByKeys(dt);
    G.update(g, dt);
    if (g.phase === "play") {
      secondsCarry += dt;
      if (secondsCarry >= 1) {
        stats.seconds += Math.floor(secondsCarry);
        secondsCarry -= Math.floor(secondsCarry);
        statsDirty = true;
      }
    }
  }
  handleEvents(G.drainEvents(g));
  if (!s.done) checkEnd();
  if (s.after) {
    s.afterT -= dt;
    if (s.afterT <= 0) {
      const fn = s.after;
      s.after = null;
      fn();
    }
  }
  if (session !== s) return;
  // A finished game keeps drawing for a moment, while its last effects play out; then the picture holds still.
  if (s.done) s.doneT = (s.doneT || 0) + dt;
  if (running || (s.done && s.doneT < 3) || s.needsDraw) drawArena(running || s.done ? dt : 0);
  updateHud();
  if (statsDirty && now - lastStatsSave > 4000) flushStats();
}

/** Draws the board of the game in play, `dt` seconds on from the last frame. */
function drawArena(dt) {
  const s = session;
  const g = s.game;
  renderer.draw(g, dt, {
    aim: settings.aim,
    hint:
      playing() && g.phase === "ready" && G.holding(g)
        ? t(inputKind === "mouse" ? "hintMouse" : inputKind === "keys" ? "hintKeys" : "hintTouch")
        : "",
    textScale,
    font: uiFont,
  });
  s.needsDraw = false;
}

let lastStatsSave = 0;
function flushStats() {
  if (!statsDirty) return;
  store.set("stats", stats);
  statsDirty = false;
  lastStatsSave = performance.now();
}

const labels = {
  combo: (points, mult) => t("comboPop", { points, mult }),
  power: (type) => t(`power_${type}`),
};

function say(text) {
  const el = $("play-sr");
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = text;
  }, 30);
}

function handleEvents(events) {
  if (!events.length) return;
  const g = session.game;
  for (const ev of events) {
    renderer.event(ev, g, labels);
    if (settings.sound) sound.play(ev.type, ev);
    if (HAPTIC[ev.type]) buzz(HAPTIC[ev.type], ev.type === "lost" || ev.type === "over" || ev.type === "clear");
    switch (ev.type) {
      case "break":
        stats.bricks += 1;
        if (ev.combo > stats.combo) stats.combo = ev.combo;
        statsDirty = true;
        break;
      case "power":
        stats.beads += 1;
        statsDirty = true;
        say(labels.power(ev.power));
        break;
      case "lost":
        stats.lost += 1;
        statsDirty = true;
        say(tn("lives", ev.lives));
        break;
      case "over":
        stats.lost += 1;
        statsDirty = true;
        break;
      default:
        break;
    }
  }
}

function updateHud() {
  const s = session;
  if (!s) return;
  const g = s.game;
  if (g.score !== s.lastScore) {
    $("hud-score").textContent = num(g.score);
    $("hud-score").setAttribute("aria-label", `${t("score")} ${num(g.score)}`);
    s.lastScore = g.score;
  }
  if (g.lives !== s.lastLives) {
    const box = $("hud-lives");
    box.textContent = "";
    for (let i = 0; i < Math.max(0, g.lives); i++) box.appendChild(document.createElement("i"));
    box.setAttribute("aria-label", tn("lives", Math.max(0, g.lives)));
    s.lastLives = g.lives;
  }
  updatePowers(s, g);
}

/**
 * The chips of the running power-ups, in the HUD's title box (upright) or below the score (sideways). A chip keeps
 * its place while others start or end; a new one joins at the end. When the last one ends, the chips fade out as
 * they are (their rings empty) and the title fades back in. Nothing here changes the HUD's size.
 */
function updatePowers(s, g) {
  const box = $("hud-powers");
  const active = Object.keys(g.timers).filter((k) => g.timers[k] > 0);
  const key = active.join(",");
  if (key !== s.powersKey) {
    const fresh = s.powersKey === "?";
    for (const chip of Array.from(box.children)) {
      if (fresh || (active.length && !active.includes(chip.dataset.type))) chip.remove();
    }
    for (const type of active) {
      if (!Array.from(box.children).some((c) => c.dataset.type === type)) box.appendChild(powerChip(type));
    }
    if (active.length) fitChips();
    $("hud").classList.toggle("powered", active.length > 0);
    s.powersKey = key;
  }
  for (const chip of box.children) {
    const type = chip.dataset.type;
    const left = g.timers[type] || 0;
    const p = (left / G.DURATION[type]).toFixed(3);
    const ring = chip.firstChild;
    if (ring.style.getPropertyValue("--p") !== p) ring.style.setProperty("--p", p);
    // Its last three seconds, while the game runs (paused, the picture holds still).
    chip.classList.toggle("ending", left > 0 && left < 3 && playing());
  }
}

function powerChip(type) {
  const chip = document.createElement("span");
  chip.className = "pchip";
  chip.dataset.type = type;
  const ring = document.createElement("span");
  ring.className = "ring";
  ring.style.setProperty("--c", BEAD_COLORS[type]);
  ring.appendChild(powerCanvas(type, 24));
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = t(`power_${type}`);
  chip.append(ring, name);
  return chip;
}

/** The chips with their names while those fit in their box; else the rings only; else rings that overlap a little. */
function fitChips() {
  const box = $("hud-powers");
  box.classList.remove("rings", "tight");
  const over = () => box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1;
  if (!box.children.length || !over()) return;
  box.classList.add("rings");
  if (!over()) return;
  box.classList.add("tight");
  // The rings overlap just enough for all of them to show (upright; sideways they wrap instead).
  const n = box.children.length;
  const ring = box.children[0].getBoundingClientRect().width;
  if (n > 1 && ring) {
    const lap = Math.min(ring * 0.55, Math.max(0, ring - (box.clientWidth - ring) / (n - 1)));
    box.style.setProperty("--lap", `${lap.toFixed(1)}px`);
  }
}

/** A small round picture of a power-up's icon on its colour. */
function powerCanvas(type, size) {
  const c = document.createElement("canvas");
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext("2d");
  const r = c.width / 2;
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, shade(BEAD_COLORS[type], 0.35));
  grad.addColorStop(1, shade(BEAD_COLORS[type], -0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(c.width / 15, 0, 0, c.width / 15, r, r);
  ctx.strokeStyle = "#FFFFFF";
  ctx.fillStyle = "#FFFFFF";
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  beadIcon(ctx, type);
  return c;
}

// ---- play: the end of a level, a daily level or a wave

function checkEnd() {
  const s = session;
  const g = s.game;
  if (g.phase === "clear") {
    if (s.mode === "endless") waveCleared();
    else {
      s.done = true;
      levelCleared();
    }
  } else if (g.phase === "over") {
    s.done = true;
    gameOver();
  }
}

function later(seconds, fn) {
  session.after = fn;
  session.afterT = calm ? Math.min(seconds, 0.5) : seconds;
}

function levelCleared() {
  const s = session;
  const g = s.game;
  const bonus = 500 + 250 * g.lives;
  g.score += bonus;
  const stars = P.starsFor(g.lost);
  stats.games += 1;
  statsDirty = true;
  let info;
  if (s.mode === "level") {
    const change = P.recordClear(progress, s.key.id, stars, g.score, settings.openAll);
    saved.level = null;
    const e = P.levelEntry(progress, s.key.id);
    const next = nextLevel(s.key.id);
    let note = "";
    if (change.worldOpened && next) note = t("worldNext", { world: t(`world_${worldOf(next).key}`) });
    else if (!next || P.clearedCount(progress) === LEVELS.length)
      note = P.clearedCount(progress) === LEVELS.length ? t("allDone") : "";
    info = {
      kind: "clear",
      title: t("clearTitle"),
      stars,
      figures: [
        ["resultScore", g.score],
        ["resultBest", e.best],
      ],
      best: change.newBest,
      note: note || t("starRule"),
      next: next && P.isOpen(progress, next.id, settings.openAll) ? next.id : null,
    };
  } else {
    const day = s.key.day;
    const change = P.recordDaily(daily, day, g.score, true, stars);
    saved.daily = null;
    const st = P.dailyStreaks(daily, today());
    info = {
      kind: "dailyClear",
      title: t("dailyClearTitle"),
      stars,
      figures: [
        ["resultScore", g.score],
        ["resultBest", daily.days[day].best],
      ],
      best: change.newBest,
      note: st.current ? tn("streak", st.current) : "",
    };
  }
  saveAll();
  saved.result = { hash: s.hash, at: Date.now(), info };
  saveSaved(true);
  say(info.title);
  later(1.25, () => showResult(info));
}

function gameOver() {
  const s = session;
  const g = s.game;
  stats.games += 1;
  statsDirty = true;
  let info;
  if (s.mode === "level") {
    const fails = P.recordFail(progress, s.key.id, g.score);
    saved.level = null;
    const next = nextLevel(s.key.id);
    info = {
      kind: "over",
      title: t("overTitle"),
      stars: null,
      figures: [["resultScore", g.score]],
      left: g.left,
      canSkip: fails >= 2 && next && !P.isOpen(progress, next.id, settings.openAll) ? next.id : null,
    };
  } else if (s.mode === "daily") {
    P.recordDaily(daily, s.key.day, g.score, false, 0);
    saved.daily = null;
    info = { kind: "dailyOver", title: t("overTitle"), stars: null, figures: [["resultScore", g.score]], left: g.left };
  } else {
    const change = finishRun();
    info = {
      kind: "runOver",
      title: t("runOverTitle"),
      stars: null,
      figures: [
        ["resultScore", g.score],
        ["waveReached", s.key.wave],
        ["resultBest", endless.best],
      ],
      best: change.newBest,
    };
  }
  saveAll();
  saved.result = { hash: s.hash, at: Date.now(), info };
  saveSaved(true);
  say(info.title);
  later(1.0, () => showResult(info));
}

/** Ends the endless run in play and records it. */
function finishRun() {
  const s = session;
  if (!s || s.mode !== "endless") return { newBest: false };
  const change = P.recordRun(endless, s.game.score, s.key.wave);
  saved.endless = null;
  saveAll();
  saveSaved(true);
  return change;
}

function waveCleared() {
  const s = session;
  const g = s.game;
  if (s.waveDone) return;
  s.waveDone = true;
  g.score += 300 * s.key.wave;
  renderer.showBanner(t("waveCleared", { n: s.key.wave }), t("endless"));
  say(t("waveCleared", { n: s.key.wave }));
  later(1.6, () => {
    const wave = s.key.wave + 1;
    const lives = Math.min(5, g.lives + (s.key.wave % 3 === 0 ? 1 : 0));
    const key = { runSeed: s.key.runSeed, wave, lives, score: g.score, seed: newSeed() };
    const opts = optionsFor("endless", key);
    s.key = key;
    s.opts = opts;
    s.game = G.createGame(opts);
    s.waveDone = false;
    renderer.clearEffects();
    setHudTitle();
    showStartBanner();
    saveSession();
  });
}

function showResult(info) {
  const s = session;
  if (!s) return;
  $("result-title").textContent = info.title;
  const stars = $("result-stars");
  stars.textContent = "";
  if (info.stars) {
    for (let k = 0; k < 3; k++) stars.appendChild(svgIcon("i-star", k < info.stars ? "ico on" : "ico"));
    stars.setAttribute("aria-label", t("starsEarned", { n: info.stars }));
    if (settings.sound) {
      for (let k = 0; k < info.stars; k++)
        window.setTimeout(() => sound.play("star", { n: k }), calm ? 0 : 180 * k + 60);
    }
  }
  const figs = $("result-figures");
  figs.textContent = "";
  for (const [label, value] of info.figures) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = t(label);
    const dd = document.createElement("dd");
    dd.textContent = num(value);
    div.append(dt, dd);
    figs.appendChild(div);
  }
  $("result-best").hidden = !info.best;
  $("result-best").textContent = t("newBest");
  $("result-note").textContent = info.note || (info.left ? tn("bricksLeft", info.left) : "");
  const main = $("result-main");
  const second = $("result-second");
  const third = $("result-third");
  const set = (btn, label, action) => {
    btn.hidden = !label;
    btn.textContent = label || "";
    btn.onclick = action || null;
  };
  resultCancel = () => leavePlay(s.mode === "level");
  if (info.kind === "clear") {
    if (info.next) set(main, t("nextLevel"), () => startOther(`#/play/level/${info.next}`));
    else set(main, t("toLevels"), () => closeResultThen(() => leavePlay(true)));
    set(second, t("playAgain"), () => closeResultThen(restartSession));
    set(third, info.next ? t("toLevels") : "", () => closeResultThen(() => leavePlay(true)));
  } else if (info.kind === "over") {
    set(main, t("tryAgain"), () => closeResultThen(restartSession));
    if (info.canSkip) {
      set(second, t("skipLevel"), () => {
        P.recordSkip(progress, s.key.id);
        saveAll();
        startOther(`#/play/level/${info.canSkip}`);
      });
      set(third, t("toLevels"), () => closeResultThen(() => leavePlay(true)));
    } else {
      set(second, t("toLevels"), () => closeResultThen(() => leavePlay(true)));
      set(third, "", null);
    }
  } else if (info.kind === "dailyClear") {
    set(main, t("home"), () => closeResultThen(() => leavePlay(false)));
    set(second, t("playAgain"), () => closeResultThen(restartSession));
    set(third, "", null);
  } else if (info.kind === "dailyOver") {
    set(main, t("tryAgain"), () => closeResultThen(restartSession));
    set(second, t("home"), () => closeResultThen(() => leavePlay(false)));
    set(third, "", null);
  } else {
    set(main, t("newRun"), () => closeResultThen(restartSession));
    set(second, t("home"), () => closeResultThen(() => leavePlay(false)));
    set(third, "", null);
  }
  resultChosen = false;
  openDialog($("dlg-result"));
  main.focus();
}

let resultCancel = null;
let resultChosen = false;

function closeResultThen(fn) {
  resultChosen = true;
  saved.result = null;
  saveSaved();
  closeDialog($("dlg-result"));
  fn();
}

/** Plays another level from the result: it takes the place of this one, so Back still leads to the picker. */
function startOther(hash) {
  resultChosen = true;
  saved.result = null;
  closeDialog($("dlg-result"));
  session = null;
  history.replaceState(history.state, "", hash);
  shownHash = location.hash;
  route = parseRoute(hash);
  openPlay(route);
  sound.unlock();
}

$("dlg-result").addEventListener("close", () => {
  if (resultChosen) return;
  // Back (or Escape) on a result: leave as its last button would.
  saved.result = null;
  saveSaved();
  if (session && route.name === "play" && resultCancel) resultCancel();
});

// ---- statistics

function minutesText(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? t("hoursMinutes", { h, m }) : t("minutes", { m });
}

function openStats() {
  flushStats();
  const list = $("stats-list");
  list.textContent = "";
  const st = P.dailyStreaks(daily, today());
  const rows = [
    ["stLevels", `${P.clearedCount(progress)} / ${LEVELS.length}`],
    ["stStars", `${num(P.starsTotal(progress))} / ${P.MAX_STARS}`],
    ["stBricks", num(stats.bricks)],
    ["stCombo", num(stats.combo)],
    ["stPowers", num(stats.beads)],
    ["stBalls", num(stats.lost)],
    ["stGames", num(stats.games)],
    ["stTime", minutesText(stats.seconds)],
    ["stDaily", num(st.total)],
    ["stStreak", t("stStreakValue", { current: st.current, longest: st.longest })],
    ["stEndless", t("stEndlessValue", { score: num(endless.best), wave: endless.bestWave })],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = t(k);
    const dd = document.createElement("dd");
    dd.textContent = v;
    list.append(dt, dd);
  }
  const ws = $("world-stats");
  ws.textContent = "";
  WORLDS.forEach((w, i) => {
    const row = document.createElement("div");
    row.className = "wstat";
    row.style.setProperty("--g", WORLD_LOOK[w.key].bar);
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = t(`world_${w.key}`);
    const sw = document.createElement("span");
    sw.className = "swatch";
    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("b");
    const n = P.worldStars(progress, i);
    fill.style.width = `${(n / 36) * 100}%`;
    bar.appendChild(fill);
    const count = document.createElement("span");
    count.className = "num";
    count.textContent = `${n}/36`;
    row.append(label, sw, bar, count);
    ws.appendChild(row);
  });
  openDialog($("dlg-stats"));
}
$("stats-done").addEventListener("click", () => closeDialog($("dlg-stats")));

// ---- settings

function saveSettings() {
  store.set("settings", settings, true);
  applyLook();
}

function openSettings() {
  $("opt-sound").checked = settings.sound;
  $("opt-vibration").checked = settings.vibration;
  $("opt-vibration-row").hidden = !canBuzz;
  $("opt-aim").checked = settings.aim;
  $("opt-open").checked = settings.openAll;
  $("sound-note").textContent = sound.supported() ? t("soundNote") : t("soundNone");
  const pick = (name, value) => {
    for (const el of document.querySelectorAll(`input[name="${name}"]`)) el.checked = el.value === String(value);
  };
  pick("sense", settings.sense);
  pick("pace", settings.pace);
  pick("effects", settings.effects);
  pick("theme", settings.theme);
  pick("ui", settings.ui);
  openDialog($("dlg-settings"));
}

$("settings-done").addEventListener("click", () => closeDialog($("dlg-settings")));
$("opt-sound").addEventListener("change", (e) => {
  settings.sound = e.target.checked;
  saveSettings();
  if (settings.sound) {
    sound.unlock();
    sound.play("power");
  }
});
$("opt-vibration").addEventListener("change", (e) => {
  settings.vibration = e.target.checked;
  saveSettings();
  if (settings.vibration) buzz("medium", true);
});
$("opt-aim").addEventListener("change", (e) => {
  settings.aim = e.target.checked;
  saveSettings();
});
$("opt-open").addEventListener("change", (e) => {
  settings.openAll = e.target.checked;
  saveSettings();
  rerender();
});
for (const name of ["sense", "pace", "effects", "theme", "ui"]) {
  for (const el of document.querySelectorAll(`input[name="${name}"]`)) {
    el.addEventListener("change", () => {
      if (!el.checked) return;
      settings[name] = name === "sense" || name === "pace" ? Number(el.value) : el.value;
      saveSettings();
      if (name === "pace" && session) session.game.pace = settings.pace;
      if (name === "ui") {
        i18n.setLang(uiLang());
        translatePage();
        rerender();
      }
    });
  }
}

$("btn-reset").addEventListener("click", async () => {
  const ok = await confirmBox(t("resetTitle"), t("resetBody"), t("erase"));
  if (!ok) return;
  progress = P.normProgress(null);
  daily = P.normDaily(null);
  endless = P.normEndless(null);
  stats = P.normStats(null);
  saved = {};
  saveAll();
  saveSaved(true);
  closeDialog($("dlg-settings"));
  rerender();
  notice(route.name === "levels" ? "levels-notice" : "home-notice", t("erased"));
});

function rerender() {
  if (route.name === "home") renderHome();
  else if (route.name === "levels") renderLevels();
  else if (session) setHudTitle();
}

// ---- how to play

function openHelp() {
  if (!settings.seenHelp) {
    settings.seenHelp = true;
    saveSettings();
    $("first-line").hidden = true;
  }
  openDialog($("dlg-help"));
}
$("help-done").addEventListener("click", () => closeDialog($("dlg-help")));

/** The pictures of every kind of brick and power-up in How to play, drawn by the game's own code. */
function buildLegends() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const tileCanvas = (kind, glaze, hits, max) => {
    const c = document.createElement("canvas");
    c.width = Math.round(64 * dpr);
    c.height = Math.round(34 * dpr);
    const ctx = c.getContext("2d");
    const w = Math.round(44 * dpr);
    const h = Math.round(20 * dpr);
    ctx.translate(Math.round(10 * dpr), Math.round(7 * dpr));
    paintTile(ctx, w, h, (44 * dpr) / 26, kind, GLAZES[glaze] || GLAZES.w, hits, max);
    return c;
  };
  const bricks = [
    ["brick_glaze", tileCanvas("glaze", "b", 1, 1)],
    ["brick_tough", tileCanvas("glaze", "o", 1, 2)],
    ["brick_lustre", tileCanvas("lustre", "lustre", 3, 3)],
    ["brick_ember", tileCanvas("ember", "ember", 1, 1)],
    ["brick_gift", tileCanvas("gift", "gift", 1, 1)],
    ["brick_iron", tileCanvas("iron", "iron", 0, 0)],
  ];
  const lb = $("legend-bricks");
  lb.textContent = "";
  for (const [key, canvas] of bricks) {
    const li = document.createElement("li");
    canvas.setAttribute("aria-hidden", "true");
    const p = document.createElement("span");
    p.textContent = t(key);
    li.append(canvas, p);
    lb.appendChild(li);
  }
  const moveLi = document.createElement("li");
  const mc = tileCanvas("glaze", "t", 1, 1);
  const mctx = mc.getContext("2d");
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.strokeStyle = "rgba(255,255,255,0.75)";
  mctx.lineWidth = 2 * dpr;
  mctx.lineCap = "round";
  mctx.beginPath();
  mctx.moveTo(4 * dpr, 30 * dpr);
  mctx.lineTo(60 * dpr, 30 * dpr);
  mctx.moveTo(8 * dpr, 27 * dpr);
  mctx.lineTo(4 * dpr, 30 * dpr);
  mctx.lineTo(8 * dpr, 33 * dpr);
  mctx.moveTo(56 * dpr, 27 * dpr);
  mctx.lineTo(60 * dpr, 30 * dpr);
  mctx.lineTo(56 * dpr, 33 * dpr);
  mctx.stroke();
  mc.setAttribute("aria-hidden", "true");
  const mp = document.createElement("span");
  mp.textContent = t("brick_move");
  moveLi.append(mc, mp);
  lb.appendChild(moveLi);

  const lp = $("legend-powers");
  lp.textContent = "";
  for (const type of G.POWERS) {
    const li = document.createElement("li");
    const c = document.createElement("canvas");
    c.width = Math.round(64 * dpr);
    c.height = Math.round(34 * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(2 * dpr, 0, 0, 2 * dpr, 32 * dpr, 17 * dpr);
    paintBead(ctx, type, A.BEAD_W, A.BEAD_H);
    c.setAttribute("aria-hidden", "true");
    const p = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = `${t(`power_${type}`)}: `;
    p.append(b, document.createTextNode(t(`powerAbout_${type}`)));
    li.append(c, p);
    lp.appendChild(li);
  }
}

// ---- life cycle: the phone's pause, a hidden page, rotation

function onBackground() {
  if (session && !session.done && !session.paused) pauseGame(true);
  else saveSession();
  flushStats();
  store.flush();
  sound.suspend();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) onBackground();
  else {
    sound.resume();
    lastFrame = 0;
    if (route.name === "home") renderHome();
    if (session) session.needsDraw = true;
  }
});
window.addEventListener("pagehide", () => {
  saveSession();
  flushStats();
  store.flush();
});
// Going back fires both popstate and hashchange; the screen changes once.
window.addEventListener("popstate", () => {
  if (location.hash !== shownHash) onRoute();
});
window.addEventListener("hashchange", () => {
  if (location.hash !== shownHash) onRoute();
});

function onResize() {
  measureTextScale();
  if (route.name === "home") renderHome();
  if (route.name === "play") fitArena();
  if (route.name === "home") {
    logo.layout();
    logo.draw(logoT, true);
  }
}
if (typeof ResizeObserver === "function") {
  new ResizeObserver(() => {
    if (route.name === "play") fitArena();
  }).observe($("stage"));
  new ResizeObserver(() => {
    if (route.name === "home") {
      logo.layout();
      logo.draw(logoT, true);
    }
  }).observe($("logo"));
}
window.addEventListener("resize", onResize);
const onLookChange = () => applyLook();
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", onLookChange);
if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener("change", onLookChange);
if (sidewaysQuery && sidewaysQuery.addEventListener) sidewaysQuery.addEventListener("change", onResize);

async function hostReady() {
  if (!host) return false;
  try {
    await Promise.race([host.ready, new Promise((resolve, reject) => window.setTimeout(reject, 2500))]);
    return true;
  } catch (e) {
    return false;
  }
}

function loadValues() {
  settings = P.normSettings(store.get("settings"));
  progress = P.normProgress(store.get("progress"));
  daily = P.normDaily(store.get("daily"));
  endless = P.normEndless(store.get("endless"));
  stats = P.normStats(store.get("stats"));
  const s = store.get("saved");
  saved =
    s && typeof s === "object"
      ? { level: s.level || null, daily: s.daily || null, endless: s.endless || null, result: s.result || null }
      : {};
}

async function start() {
  store.loadLocal();
  loadValues();
  if (host) {
    if (await store.loadKv(host)) loadValues();
  }
  if (await hostReady()) {
    try {
      canBuzz = Boolean(host.haptics && typeof host.supports === "function" && host.supports("haptics.impact"));
    } catch (e) {
      canBuzz = false;
    }
    try {
      if (host.app && typeof host.app.on === "function") {
        host.app.on("pause", onBackground);
        host.app.on("resume", () => {
          sound.resume();
          if (session) session.needsDraw = true;
        });
      }
    } catch (e) {
      // An older host without these events: the page's own events above still save.
    }
  } else {
    canBuzz = !host && typeof navigator.vibrate === "function";
  }
  measureTextScale();
  i18n.setLang(uiLang());
  translatePage();
  applyLook();
  if (!history.state) history.replaceState({ d: 0 }, "", location.hash || "#/");
  onRoute();
  requestAnimationFrame(frame);
}

start();
