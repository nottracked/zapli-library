// The arena's fixed geometry, in arena units. The page scales the whole arena to fit the screen, so the game plays
// the same on every phone: a level is the same width in tiles, and a ball takes the same time to cross it.

/** Width and height of the arena. */
export const W = 360;
export const H = 600;

/** The tile grid: its left and right edges and the top of its first row. */
export const GRID_LEFT = 10;
export const GRID_RIGHT = 350;
export const GRID_TOP = 56;
/** Height of one row of tiles (the tile itself is drawn a little smaller, so rows show a seam). */
export const ROW_H = 16;
/** The most rows a level may have. */
export const MAX_ROWS = 15;

/** The paddle: the top of its face, its thickness and its widths. */
export const PADDLE_Y = 548;
export const PADDLE_H = 12;
export const PADDLE_W = 64;
export const PADDLE_W_WIDE = 96;
export const PADDLE_W_MAX = 120;

/** The ball's radius. */
export const BALL_R = 6;

/** A falling power-up bead. */
export const BEAD_W = 28;
export const BEAD_H = 13;
export const BEAD_SPEED = 115;

/** The sparks the paddle fires, in units a second, and their length. */
export const BOLT_SPEED = 640;
export const BOLT_LEN = 10;

/** The guard's line under the paddle. */
export const GUARD_Y = 586;

/** Cell width for a level with `cols` columns. */
export function cellWidth(cols) {
  return (GRID_RIGHT - GRID_LEFT) / cols;
}
