// The start screen's picture: the word BRICKS built from glazed bricks, each letter in its own glaze, with a glowing
// ball resting under it, on the dark kiln of the arena. A soft gleam passes over the letters now and then (not in calm
// mode).

import { paintTile, glowSprite, roundRect } from "../render/sprites.mjs";

// Five rows per letter; "#" is a brick.
const LETTERS = {
  B: ["####.", "#...#", "####.", "#...#", "####."],
  R: ["####.", "#...#", "####.", "#..#.", "#...#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  C: [".####", "#....", "#....", "#....", ".####"],
  K: ["#...#", "#..#.", "###..", "#..#.", "#...#"],
  S: [".####", "#....", ".###.", "....#", "####."],
};
const WORD = ["B", "R", "I", "C", "K", "S"];
const COLORS = ["#F47B2C", "#F26A5B", "#F4A62A", "#9D5DE2", "#3D6DF2", "#1DC1C4"];

export function createLogo(canvasEl) {
  const ctx = canvasEl.getContext("2d");
  let cells = [];
  let tiles = new Map();
  let ball = null;
  let aim = null;
  let w = 0;
  let h = 0;
  let cw = 0;
  let ch = 0;
  let dpr = 1;

  function layout() {
    const rect = canvasEl.getBoundingClientRect();
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    canvasEl.width = w;
    canvasEl.height = h;
    const cols = WORD.reduce((n, l) => n + LETTERS[l][0].length, 0) + WORD.length - 1;
    cw = Math.floor((w * 0.88) / cols);
    ch = Math.floor(cw * 0.9);
    const x0 = Math.round((w - cols * cw) / 2);
    const y0 = Math.round(h * 0.14);
    cells = [];
    let col = 0;
    WORD.forEach((letter, li) => {
      const rows = LETTERS[letter];
      rows.forEach((line, r) => {
        for (let c = 0; c < line.length; c++) {
          if (line[c] === "#") cells.push({ x: x0 + (col + c) * cw, y: y0 + r * ch, color: COLORS[li], li });
        }
      });
      col += rows[0].length + 1;
    });
    tiles = new Map();
    const tw = cw - Math.max(1, Math.round(cw * 0.08));
    const th = ch - Math.max(1, Math.round(ch * 0.1));
    for (const color of COLORS) {
      const c = document.createElement("canvas");
      c.width = tw;
      c.height = th;
      paintTile(c.getContext("2d"), tw, th, cw / 26, "glaze", color, 1, 1);
      tiles.set(color, c);
    }
    const r = Math.max(4, cw * 0.4);
    // Left of the paddle's middle, so (as in the game) it would fly up and to the left, toward the I.
    ball = { x: w / 2 - cw * 0.9, y: h * 0.8 - r, r, glow: glowSprite("#FF8A2A", 96) };
    // The aim line runs from the resting ball up to the foot of the letter I, as before a launch in the game.
    const iCol = LETTERS.B[0].length + 1 + LETTERS.R[0].length + 1 + 1;
    aim = { x: x0 + iCol * cw + cw / 2, y: y0 + 5 * ch + ch * 0.2 };
  }

  /** Draws the picture; `t` is the time in seconds, for the gleam. */
  function draw(t, calm) {
    if (!w || canvasEl.width !== w) layout();
    ctx.clearRect(0, 0, w, h);
    // The paddle and the ball under the word.
    const pw = cw * 7;
    const py = ball.y + ball.r + 2;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(ball.glow, ball.x - ball.r * 5, ball.y - ball.r * 5, ball.r * 10, ball.r * 10);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ball.glow, w / 2 - pw * 0.7, py - ch * 1.2, pw * 1.4, ch * 3);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const pg = ctx.createLinearGradient(0, py, 0, py + ch * 0.8);
    pg.addColorStop(0, "#FBF7FF");
    pg.addColorStop(1, "#6B6590");
    ctx.fillStyle = pg;
    const ph = ch * 0.8;
    roundRect(ctx, w / 2 - pw / 2, py, pw, ph, ph / 2);
    ctx.fill();
    const core = ctx.createRadialGradient(ball.x - ball.r * 0.35, ball.y - ball.r * 0.35, 1, ball.x, ball.y, ball.r);
    core.addColorStop(0, "#FFFFFF");
    core.addColorStop(0.55, "#FFF0CC");
    core.addColorStop(1, "#FFAA44");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    // The dotted aim line.
    ctx.save();
    ctx.strokeStyle = "rgba(255,230,190,0.7)";
    ctx.lineWidth = Math.max(1.5, cw * 0.16);
    ctx.lineCap = "round";
    ctx.setLineDash([0.1, cw * 0.75]);
    ctx.lineDashOffset = calm ? 0 : -t * cw * 3;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y - ball.r * 1.4);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
    ctx.restore();
    // The letters, with a shadow under each brick and a gleam that sweeps across.
    const sweep = calm ? -1 : ((t % 6) / 1.4) * w * 1.4 - w * 0.2;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (const cell of cells) {
      roundRect(ctx, cell.x + 1, cell.y + ch * 0.18, cw - 2, ch - 2, ch * 0.3);
      ctx.fill();
    }
    for (const cell of cells) {
      const tile = tiles.get(cell.color);
      ctx.drawImage(tile, cell.x, cell.y);
      if (sweep > 0) {
        // The gleam brightens each brick in its own shape.
        const d = Math.abs(cell.x + cell.y * 0.5 - sweep);
        if (d < cw * 3) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (1 - d / (cw * 3)) * 0.6;
          ctx.drawImage(tile, cell.x, cell.y);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
  }

  return { draw, layout };
}
