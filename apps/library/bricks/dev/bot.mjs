// A player for the checks. It keeps the paddle under the lowest falling ball and, before each hit, looks along the
// paths the paddle could send the ball (the same ray test the game uses) for one whose first tile is one it can break,
// so it also finds its way through gaps in iron. It plays through the game's own API, as the page does.
import * as A from "../package/js/game/arena.mjs";
import { sweepBox, reflect, paddleBounce } from "../package/js/game/physics.mjs";
import { step, setPaddle, launch, holding, STEP } from "../package/js/game/game.mjs";

/** Where a ball will cross the paddle's line, folding its path at the side walls. */
function landingX(ball) {
  if (ball.vy <= 0) return ball.x;
  const t = (A.PADDLE_Y - ball.r - ball.y) / ball.vy;
  let x = ball.x + ball.vx * t - ball.r;
  const span = A.W - 2 * ball.r;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  if (x > span) x = 2 * span - x;
  return x + ball.r;
}

/** The first tile a ball sent from (x, y) with this velocity meets within three bounces, or null. */
function firstTile(game, x, y, vx, vy) {
  for (let bounce = 0; bounce < 4; bounce++) {
    let best = null;
    let tile = null;
    if (vx < 0) best = { t: (A.BALL_R - x) / vx, nx: 1, ny: 0 };
    else if (vx > 0) best = { t: (A.W - A.BALL_R - x) / vx, nx: -1, ny: 0 };
    if (vy < 0) {
      const t = (A.BALL_R - y) / vy;
      if (!best || t < best.t) best = { t, nx: 0, ny: 1 };
    }
    for (const b of game.bricks) {
      if (!b.alive) continue;
      const h = sweepBox(x, y, vx, vy, A.BALL_R, b.x0, b.y0, b.x1, b.y1, 10);
      if (h && (!best || h.t < best.t)) {
        best = h;
        tile = b;
      }
    }
    if (!best) return null;
    if (tile) return tile;
    x += vx * best.t;
    y += vy * best.t;
    [vx, vy] = reflect(vx, vy, best.nx, best.ny);
    if (vy > 0) return null;
  }
  return null;
}

/** Plays until the level is clear or lost, or `limit` seconds pass. Returns what happened. */
export function play(game, limit = 900) {
  const steps = Math.round(limit / STEP);
  let plan = null; // { ball, off }: the offset chosen for the coming hit
  let turn = 0;
  for (let i = 0; i < steps; i++) {
    if (game.phase === "clear" || game.phase === "over") break;
    if (
      holding(game) &&
      (game.phase === "ready" || game.phase === "play") &&
      (game.phaseT > 0.2 || game.phase === "play")
    ) {
      launch(game);
    }
    const falling = game.balls.filter((b) => !b.held && b.vy > 0);
    const ball = falling.sort((a, b) => b.y - a.y)[0];
    if (ball) {
      const x = landingX(ball);
      if (!plan || plan.ball !== ball || ball.y < A.PADDLE_Y - 200) {
        // Choose where on the paddle to take the ball: an offset whose path meets a breakable tile first.
        const good = [];
        const w = game.paddle.w;
        for (let k = -18; k <= 18; k++) {
          const off = k / 20;
          // Only offsets the paddle can reach: it stops at the walls.
          const px = x - off * (w / 2 + A.BALL_R);
          if (px < w / 2 || px > A.W - w / 2) continue;
          const [vx, vy] = paddleBounce(x + off * 0, x - off * (w / 2 + A.BALL_R), w, A.BALL_R, 1);
          const tile = firstTile(game, x, A.PADDLE_Y - A.BALL_R, vx, vy);
          if (tile && tile.kind !== "iron") good.push(off);
        }
        turn++;
        const fallback = Math.max(
          -0.9,
          Math.min(0.9, (x - Math.max(w / 2, Math.min(A.W - w / 2, x))) / (w / 2 + A.BALL_R)),
        );
        // With no direct path, vary the angle along a sequence that never repeats, so the bot never loops.
        const spread = ((turn * 0.6180339887) % 1) * 1.6 - 0.8;
        const off = good.length ? good[(turn * 7) % good.length] : Math.max(-0.95, Math.min(0.95, fallback + spread));
        plan = { ball, off };
      }
      const close = A.PADDLE_Y - ball.y < 160;
      setPaddle(game, close ? x - plan.off * (game.paddle.w / 2 + A.BALL_R) : x);
    } else plan = null;
    step(game);
  }
  return { phase: game.phase, time: game.t, lost: game.lost, left: game.left, score: game.score, beads: game.caught };
}
