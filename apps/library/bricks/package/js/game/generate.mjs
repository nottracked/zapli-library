// Levels made on the phone: the daily level (the same for everyone on the same date) and the waves of endless play.
// A made level is a picture in the same form as a hand-made one (levels.mjs), mirrored left to right like most of
// them, from a pattern, a few glazes and a difficulty between 0 (gentle) and 1 (hard).

import { rngFor, pick } from "../core/rng.mjs";

const GLAZES = "abcgklnoprstwy".split("").filter((g) => g !== "k");
const PALETTES = [
  ["o", "a", "y"],
  ["c", "n", "w"],
  ["b", "s", "w"],
  ["t", "g", "l"],
  ["p", "n", "y"],
  ["r", "o", "a"],
  ["g", "t", "s"],
  ["b", "p", "n"],
  ["y", "l", "g"],
  ["w", "s", "t"],
];

/**
 * The cells of a level's picture that a ball can never reach: tiles walled in by iron. A ball fits through any gap of
 * one tile, so a cell is reachable when a path of empty or breakable cells, side to side or up and down, leads to it
 * from the open space below the tiles (or above them, which that space reaches through any gap). Rows that slide
 * count as open, since they move away.
 */
export function unreachable(rows, move) {
  const h = rows.length;
  const w = rows[0].length;
  const sliding = new Set((move || []).map((m) => m.row));
  const open = (c, r) => r < 0 || r >= h || sliding.has(r) || rows[r][c] !== "#";
  const seen = new Set();
  const key = (c, r) => `${c},${r}`;
  const queue = [];
  for (let c = 0; c < w; c++) {
    queue.push([c, h]);
    seen.add(key(c, h));
  }
  while (queue.length) {
    const [c, r] = queue.pop();
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= w || nr < -1 || nr > h || seen.has(key(nc, nr)) || !open(nc, nr)) continue;
      seen.add(key(nc, nr));
      queue.push([nc, nr]);
    }
  }
  const out = [];
  rows.forEach((line, r) => {
    for (let c = 0; c < w; c++) if (line[c] !== "." && line[c] !== "#" && !seen.has(key(c, r))) out.push([c, r]);
  });
  return out;
}

/** A value for each cell of the left half that picks its glaze band, or -1 for no tile. */
const PATTERNS = [
  // Rings around a centre.
  (c, r, cx, cy, k) => Math.floor(Math.abs(c - cx) + Math.abs(r - cy)) % k,
  // Horizontal bands.
  (c, r, cx, cy, k) => Math.floor(r / 1) % k,
  // Round ripples.
  (c, r, cx, cy, k) => Math.floor(Math.hypot((c - cx) * 0.9, (r - cy) * 1.5)) % k,
  // Blocks.
  (c, r, cx, cy, k) => (Math.floor(c / 2) + Math.floor(r / 2)) % k,
  // Diagonal stripes.
  (c, r, cx, cy, k) => (c + r) % k,
];

/**
 * A made level. `seedText` decides it entirely; `difficulty` from 0 to about 1.2 adds tougher tiles, iron, lustre and
 * moving rows.
 */
export function makeLevel(seedText, difficulty) {
  const rng = rngFor(seedText);
  const d = Math.max(0, Math.min(1.2, difficulty));
  const cols = 13;
  const half = 7;
  const height = 6 + pick(rng, 3) + Math.round(d * 3);
  const palette = PALETTES[pick(rng, PALETTES.length)].slice();
  if (rng() < 0.5) palette.push(GLAZES[pick(rng, GLAZES.length)]);
  const pattern = PATTERNS[pick(rng, PATTERNS.length)];
  const k = palette.length + 1 + pick(rng, 2);
  const cx = pick(rng, half);
  const cy = pick(rng, height);
  const gapBand = pick(rng, k);
  const fill = 0.12 + rng() * 0.2;

  const grid = [];
  for (let r = 0; r < height; r++) {
    const row = [];
    for (let c = 0; c < half; c++) {
      const band = pattern(c, r, cx, cy, k);
      let ch = band === gapBand || rng() < fill * 0.35 ? "." : palette[band % palette.length];
      if (ch !== "." && rng() < 0.1 + d * 0.3) ch = ch.toUpperCase();
      row.push(ch);
    }
    grid.push(row);
  }
  // Specials, mirrored with everything else.
  const place = (ch, count, rowMin) => {
    for (let i = 0; i < count; i++) {
      const r = rowMin + pick(rng, Math.max(1, height - rowMin));
      const c = pick(rng, half);
      grid[r][c] = ch;
    }
  };
  place("?", 1 + pick(rng, 2), 0);
  if (d > 0.2 || rng() < 0.4) place("*", 1 + pick(rng, 2 + Math.round(d * 2)), 1);
  if (d > 0.35) place("$", 1 + pick(rng, 2 + Math.round(d * 3)), 0);
  if (d > 0.3) place("#", pick(rng, 1 + Math.round(d * 4)), 1);

  let rows = grid.map((row) => {
    const left = row.join("");
    return (
      left +
      row
        .slice(0, half - 1)
        .reverse()
        .join("")
    );
  });
  // A row that slides, below the rest, on harder levels.
  const move = [];
  if (d > 0.45 && rng() < 0.4 + d * 0.4) {
    rows.push(".".repeat(cols));
    const span = 5 + 2 * pick(rng, 2);
    const glaze = palette[pick(rng, palette.length)];
    const pad = (cols - span) / 2;
    rows.push(".".repeat(pad) + glaze.repeat(span) + ".".repeat(pad));
    move.push({ row: rows.length - 1, cells: pad, speed: 0.7 + rng() * 0.5, phase: rng() * Math.PI * 2 });
  }
  // Iron that walls tiles in comes out again, and a level always keeps enough to break.
  for (const [c, r] of unreachable(rows, move)) {
    for (const [dc, dr] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rows[rr] && rows[rr][cc] === "#") rows[rr] = rows[rr].slice(0, cc) + "." + rows[rr].slice(cc + 1);
    }
  }
  if (unreachable(rows, move).length) rows = rows.map((line) => line.replace(/#/g, "."));
  const tiles = rows.join("").replace(/[.#]/g, "").length;
  if (tiles < 24) {
    // Too sparse: fill the empty top rows with the first glaze.
    rows = rows.map((line, r) => (r < 2 ? line.replace(/\./g, palette[0]) : line));
  }
  // An empty row on top leaves room for the ball to run along above the tiles.
  if (rows[0].replace(/\./g, "").length > 0 && rows.length < 14) rows.unshift(".".repeat(cols));
  if (move.length) move[0].row = rows.length - 1;
  return { rows, move };
}

/** The difficulty of the daily level: gentle on Monday, harder toward Sunday. `weekdayIndex` 0 is Monday. */
export function dailyDifficulty(weekdayIndex) {
  return 0.15 + weekdayIndex * 0.13;
}

/** The difficulty of an endless wave (the first is 1). */
export function waveDifficulty(wave) {
  return Math.min(1.2, 0.1 + (wave - 1) * 0.09);
}
