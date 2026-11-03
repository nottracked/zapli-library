// How big a puzzle is and which ways its words run: by level in endless play, by the chosen difficulty, and by the
// day of the week for the daily puzzle.
//
// Directions: e (left to right), s (top to bottom), se and ne (diagonally, left to right), and the backwards ones
// w, n, nw and sw. The sets grow: across and down first, then diagonals, then backwards.

import { weekday } from "../core/dates.mjs";

export const DIRECTION_SETS = {
  a: ["e", "s"],
  b: ["e", "s", "se"],
  c: ["e", "s", "se", "ne"],
  d: ["e", "s", "se", "ne", "w", "n"],
  e: ["e", "s", "se", "ne", "w", "n", "nw", "sw"],
};

export const DIFFICULTIES = ["grow", "easy", "medium", "hard"];

// Growing play: the level (0 for the first puzzle) where each step starts. The first puzzles already mix in a
// diagonal; backwards words come once the player has solved a handful.
const STEPS = [
  { from: 0, size: 7, dirs: "b" },
  { from: 3, size: 8, dirs: "c" },
  { from: 7, size: 9, dirs: "d" },
  { from: 12, size: 10, dirs: "e" },
  { from: 20, size: 11, dirs: "e" },
  { from: 30, size: 12, dirs: "e" },
];

const FIXED = {
  easy: { size: 8, dirs: "c", hideList: false },
  medium: { size: 10, dirs: "d", hideList: false },
  hard: { size: 12, dirs: "e", hideList: true },
};

/** The size, directions and word list of an endless puzzle. */
export function endlessSpec(level, difficulty) {
  if (FIXED[difficulty]) return { ...FIXED[difficulty] };
  let step = STEPS[0];
  for (const s of STEPS) if (level >= s.from) step = s;
  return { size: step.size, dirs: step.dirs, hideList: false };
}

// The daily puzzle grows through the week: a gentle Monday and a big Sunday.
const WEEK = [
  { size: 8, dirs: "c" },
  { size: 9, dirs: "d" },
  { size: 9, dirs: "d" },
  { size: 10, dirs: "e" },
  { size: 10, dirs: "e" },
  { size: 11, dirs: "e" },
  { size: 12, dirs: "e" },
];

/** The size and directions of a day's daily puzzle. */
export function dailySpec(day) {
  return { ...WEEK[weekday(day)], hideList: false };
}

/** How many words a puzzle of a size asks for when it has no hidden message. */
export function wordTarget(size) {
  return { 6: 6, 7: 7, 8: 9, 9: 10, 10: 12, 11: 14, 12: 16 }[size] || Math.round(size * 1.3);
}

/** The fewest words a theme needs (of at most `size` tiles) to make a puzzle of that size. */
export function wordsNeeded(size) {
  return wordTarget(size) + 2;
}
