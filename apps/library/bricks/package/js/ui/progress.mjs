// The player's progress, as saved: stars and best scores of the levels, which levels are open, the daily results,
// the endless records, statistics and settings. Every reader here accepts anything (an old or damaged value) and
// returns a clean one, so a bad saved value never stops the game.

import { LEVELS, WORLDS, nextLevel, previousLevel } from "../game/levels.mjs";
import { isDay, streaks } from "../core/dates.mjs";

export const MAX_STARS = LEVELS.length * 3;

const int = (v, min = 0) => (Number.isFinite(v) ? Math.max(min, Math.round(v)) : min);

export const DEFAULT_SETTINGS = {
  sound: true,
  vibration: true,
  sense: 1.5,
  pace: 1,
  aim: true,
  effects: "auto",
  openAll: false,
  theme: "device",
  ui: "auto",
  seenHelp: false,
};

export function normSettings(s) {
  const v = Object.assign({}, DEFAULT_SETTINGS, s && typeof s === "object" ? s : {});
  return {
    sound: v.sound !== false,
    vibration: v.vibration !== false,
    sense: [1, 1.5, 2].includes(Number(v.sense)) ? Number(v.sense) : 1.5,
    pace: [0.85, 1, 1.15].includes(Number(v.pace)) ? Number(v.pace) : 1,
    aim: v.aim !== false,
    effects: ["auto", "full", "calm"].includes(v.effects) ? v.effects : "auto",
    openAll: v.openAll === true,
    theme: ["device", "light", "dark"].includes(v.theme) ? v.theme : "device",
    ui: ["auto", "en", "sk"].includes(v.ui) ? v.ui : "auto",
    seenHelp: v.seenHelp === true,
  };
}

/** Progress of the hand-made levels: { levels: { "1-1": { stars, best, cleared, skipped, fails } } }. */
export function normProgress(p) {
  const src = p && p.levels && typeof p.levels === "object" ? p.levels : {};
  const levels = {};
  for (const l of LEVELS) {
    const e = src[l.id];
    if (!e || typeof e !== "object") continue;
    levels[l.id] = {
      stars: Math.min(3, int(e.stars)),
      best: int(e.best),
      cleared: e.cleared === true,
      skipped: e.skipped === true,
      fails: int(e.fails),
    };
  }
  return { levels };
}

const entry = (progress, id) => progress.levels[id] || { stars: 0, best: 0, cleared: false, skipped: false, fails: 0 };

/** Whether a level may be played: the first always; any other once the one before is cleared or skipped. */
export function isOpen(progress, id, openAll) {
  if (openAll) return true;
  const prev = previousLevel(id);
  if (!prev) return true;
  const e = entry(progress, prev.id);
  return e.cleared || e.skipped;
}

/** The level the Play button starts: the first open level not cleared yet; null when every level is cleared. */
export function nextToPlay(progress, openAll) {
  for (const l of LEVELS) {
    if (!entry(progress, l.id).cleared && isOpen(progress, l.id, openAll)) return l;
  }
  return null;
}

export function starsTotal(progress) {
  return LEVELS.reduce((s, l) => s + entry(progress, l.id).stars, 0);
}

export function clearedCount(progress) {
  return LEVELS.filter((l) => entry(progress, l.id).cleared).length;
}

export function worldStars(progress, worldIndex) {
  return LEVELS.filter((l) => l.id.startsWith(`${worldIndex + 1}-`)).reduce(
    (s, l) => s + entry(progress, l.id).stars,
    0,
  );
}

export function worldCleared(progress, worldIndex) {
  return LEVELS.filter((l) => l.id.startsWith(`${worldIndex + 1}-`) && entry(progress, l.id).cleared).length;
}

/** Stars for a cleared level: three with no ball lost, one fewer for each ball lost, at least one. */
export function starsFor(lost) {
  return Math.max(1, 3 - int(lost));
}

export function levelEntry(progress, id) {
  return entry(progress, id);
}

/**
 * Records a cleared level. Returns what changed: a new best score, more stars, and whether this clear opened the
 * next world (the first level of the next world was closed and is open now).
 */
export function recordClear(progress, id, stars, score, openAll) {
  const before = entry(progress, id);
  const next = nextLevel(id);
  const wasOpen = next ? isOpen(progress, next.id, openAll) : true;
  progress.levels[id] = {
    stars: Math.max(before.stars, stars),
    best: Math.max(before.best, score),
    cleared: true,
    skipped: false,
    fails: before.fails,
  };
  const opened = next && !wasOpen && isOpen(progress, next.id, openAll);
  const worldOpened = Boolean(opened && next.id.endsWith("-1"));
  return {
    newBest: score > before.best && before.cleared,
    firstClear: !before.cleared,
    moreStars: stars > before.stars,
    worldOpened,
  };
}

export function recordFail(progress, id, score) {
  const e = entry(progress, id);
  progress.levels[id] = Object.assign({}, e, { fails: e.fails + 1, best: Math.max(e.best, int(score)) });
  return progress.levels[id].fails;
}

/** A level skipped after two tries: it opens the next one and keeps no stars. */
export function recordSkip(progress, id) {
  const e = entry(progress, id);
  if (!e.cleared) progress.levels[id] = Object.assign({}, e, { skipped: true });
}

/** Daily results: { days: { "2026-11-03": { best, stars, cleared } } }. */
export function normDaily(d) {
  const src = d && d.days && typeof d.days === "object" ? d.days : {};
  const days = {};
  for (const [day, e] of Object.entries(src)) {
    if (!isDay(day) || !e || typeof e !== "object") continue;
    days[day] = { best: int(e.best), stars: Math.min(3, int(e.stars)), cleared: e.cleared === true };
  }
  return { days };
}

export function recordDaily(daily, day, score, cleared, stars) {
  const e = daily.days[day] || { best: 0, stars: 0, cleared: false };
  const newBest = score > e.best && e.best > 0;
  daily.days[day] = {
    best: Math.max(e.best, int(score)),
    stars: cleared ? Math.max(e.stars, stars) : e.stars,
    cleared: e.cleared || cleared,
  };
  return { newBest };
}

export function dailyStreaks(daily, today) {
  const cleared = new Set(Object.keys(daily.days).filter((d) => daily.days[d].cleared));
  return Object.assign(streaks(cleared, today), { total: cleared.size });
}

/** Endless records: { best, bestWave, runs }. */
export function normEndless(e) {
  const v = e && typeof e === "object" ? e : {};
  return { best: int(v.best), bestWave: int(v.bestWave), runs: int(v.runs) };
}

export function recordRun(endless, score, wave) {
  const newBest = score > endless.best;
  endless.best = Math.max(endless.best, int(score));
  endless.bestWave = Math.max(endless.bestWave, int(wave));
  endless.runs += 1;
  return { newBest };
}

/** Statistics counted as the player plays. */
export function normStats(s) {
  const v = s && typeof s === "object" ? s : {};
  return {
    bricks: int(v.bricks),
    lost: int(v.lost),
    beads: int(v.beads),
    combo: int(v.combo),
    seconds: int(v.seconds),
    games: int(v.games),
  };
}

export const WORLD_COUNT = WORLDS.length;
