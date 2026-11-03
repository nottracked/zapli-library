// Turns a level's picture (levels.mjs) into tiles with their places in the arena.

import { GRID_LEFT, GRID_TOP, ROW_H, cellWidth } from "./arena.mjs";

/** What a character of a level's picture is. */
export function tileOf(ch) {
  if (ch === "#") return { kind: "iron", glaze: "iron", hits: Infinity };
  if (ch === "*") return { kind: "ember", glaze: "ember", hits: 1 };
  if (ch === "$") return { kind: "lustre", glaze: "lustre", hits: 3 };
  if (ch === "?") return { kind: "gift", glaze: "gift", hits: 1 };
  if (ch >= "a" && ch <= "z") return { kind: "glaze", glaze: ch, hits: 1 };
  if (ch >= "A" && ch <= "Z") return { kind: "glaze", glaze: ch.toLowerCase(), hits: 2 };
  return null;
}

/**
 * The tiles of a level. Each tile's box is its whole cell, so neighbours meet without a gap and a ball meets a row of
 * tiles as one flat face; the renderer draws each tile a little inside its cell.
 */
export function buildLevel(def) {
  const rows = def.rows;
  const cols = rows[0].length;
  const cellW = cellWidth(cols);
  const moves = (def.move || []).map((m) => ({
    row: m.row,
    amp: m.cells * cellW,
    speed: m.speed,
    phase: m.phase || 0,
  }));
  const bricks = [];
  rows.forEach((line, row) => {
    for (let col = 0; col < cols; col++) {
      const tile = tileOf(line[col]);
      if (!tile) continue;
      const x0 = GRID_LEFT + col * cellW;
      const y0 = GRID_TOP + row * ROW_H;
      bricks.push({
        id: bricks.length,
        col,
        row,
        kind: tile.kind,
        glaze: tile.glaze,
        hits: tile.hits,
        max: tile.hits,
        bx: x0,
        x0,
        y0,
        x1: x0 + cellW,
        y1: y0 + ROW_H,
        move: moves.findIndex((m) => m.row === row),
        alive: true,
      });
    }
  });
  return { cols, cellW, rows: rows.length, bricks, moves };
}

/** Whether a tile counts toward clearing the level (every tile but iron). */
export function breakable(brick) {
  return brick.kind !== "iron";
}
