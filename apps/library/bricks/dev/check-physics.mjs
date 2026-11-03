// Checks the ball's physics without a browser (Node 22):
//  - no tunnelling: balls at up to 4,000 units a second (more than ten times the game's top speed) in a dense field of
//    tiles never end a step inside a tile or outside the walls, and never pass a tile without touching it;
//  - a ball meeting a single thin tile head-on bounces back from it at every speed;
//  - the paddle's angle rule: the middle sends the ball straight up, the edges at the widest angle, in proportion
//    between, at the same speed, always upward;
//  - every bounce keeps the ball at least the minimum slope from the horizontal;
//  - a ball that touches a surface while moving away from it does not bounce on it again;
//  - a fast paddle that pushes into the ball from the side never traps it.
// Run: node dev/check-physics.mjs
import * as A from "../package/js/game/arena.mjs";
import { sweepBox, paddleBounce, keepSlope, MAX_BOUNCE, MIN_SLOPE } from "../package/js/game/physics.mjs";
import { createGame, step, setPaddle, launch, STEP } from "../package/js/game/game.mjs";
import { makeRng } from "../package/js/core/rng.mjs";

const problems = [];
const fail = (msg) => problems.push(msg);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- sweepBox basics
{
  // Straight at a box's bottom face from below.
  const h = sweepBox(50, 100, 0, -1000, 5, 40, 40, 60, 50, 1);
  if (!h || !near(h.t, (100 - 55) / 1000) || h.nx !== 0 || h.ny !== 1) fail(`face hit wrong: ${JSON.stringify(h)}`);
  // Passing beside a box misses it.
  if (sweepBox(80, 100, 0, -1000, 5, 40, 40, 60, 50, 1)) fail("a ball passing beside a box hit it");
  // Toward a corner diagonally: the normal points from the corner to the centre at contact.
  const c = sweepBox(70, 60, -100, -100, 5, 40, 40, 60, 50, 1);
  if (!c || !(c.nx > 0 && c.ny > 0) || !near(Math.hypot(c.nx, c.ny), 1, 1e-9))
    fail(`corner hit wrong: ${JSON.stringify(c)}`);
  // A ball resting against a face and moving away from it does not touch it again (else it would bounce in place).
  if (sweepBox(50, 55, -30, 100, 5, 40, 40, 60, 50, 1)) fail("a ball leaving a face touched it again");
  if (sweepBox(65, 55, 50, 50, 5, 40, 40, 60, 50, 1)) fail("a ball leaving a corner touched it again");
  // Out of reach in the time given.
  if (sweepBox(50, 100, 0, -10, 5, 40, 40, 60, 50, 1)) fail("a hit beyond tmax was reported");
}

// ---- a thin tile at every speed
for (const speed of [100, 400, 900, 2000, 4000, 12000]) {
  const def = { rows: [".............", "......w......"] };
  const game = createGame({ def, speed: 300, seed: 1, power: [] });
  const b = game.bricks[0];
  const cx = (b.x0 + b.x1) / 2;
  game.phase = "play";
  game.balls = [
    { x: cx, y: 400, vx: 0, vy: -speed, r: A.BALL_R, held: false, off: 0, heldT: 0, idle: 0, sticky: false },
  ];
  game.baseSpeed = speed;
  game.pace = 1;
  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) {
    step(game);
    if (!b.alive) hit = true;
    if (game.balls[0] && game.balls[0].y < b.y0) fail(`speed ${speed}: the ball went through a thin tile`);
  }
  if (!hit) fail(`speed ${speed}: the ball never broke the tile in front of it`);
}

// ---- a dense field at extreme speeds
{
  const rows = [];
  for (let r = 0; r < 15; r++) rows.push(r % 3 === 2 ? ".#...#...#..." : "$$$$$$$$$$$$$");
  const rng = makeRng(42);
  let steps = 0;
  for (const speed of [600, 1500, 4000]) {
    for (let trial = 0; trial < 40; trial++) {
      const game = createGame({ def: { rows }, speed, seed: trial + 1, power: [] });
      // Lustre takes three hits; keep the tiles whole so the field stays dense.
      for (const b of game.bricks) if (b.kind !== "iron") b.hits = b.max = 1e9;
      game.phase = "play";
      const a = rng() * Math.PI * 2;
      game.balls = [
        {
          x: 180,
          y: 320,
          vx: Math.cos(a) * speed,
          vy: -Math.abs(Math.sin(a)) * speed - 50,
          r: A.BALL_R,
          held: false,
          off: 0,
          heldT: 0,
          idle: 0,
          sticky: false,
        },
      ];
      game.timers.guard = 1e9;
      for (let i = 0; i < 240; i++) {
        const ball = game.balls[0];
        if (!ball) break;
        const px = ball.x;
        const py = ball.y;
        step(game);
        steps++;
        const q = game.balls[0];
        if (!q) break;
        if (q.x < A.BALL_R - 1e-6 || q.x > A.W - A.BALL_R + 1e-6 || q.y < A.BALL_R - 1e-6) {
          fail(`speed ${speed}: the ball left the arena at ${q.x.toFixed(2)},${q.y.toFixed(2)}`);
          break;
        }
        for (const b of game.bricks) {
          // Inside a tile (deeper than rounding)?
          if (q.x > b.x0 + 0.05 && q.x < b.x1 - 0.05 && q.y > b.y0 + 0.05 && q.y < b.y1 - 0.05) {
            fail(`speed ${speed}: the ball ended a step inside a tile`);
            i = 1e9;
            break;
          }
          // Crossed a tile's middle line without touching it: the segment from the old to the new centre passes
          // through the tile's core.
          const steps2 = 40;
          for (let s = 1; s < steps2; s++) {
            const x = px + ((q.x - px) * s) / steps2;
            const y = py + ((q.y - py) * s) / steps2;
            if (Math.hypot(q.x - px, q.y - py) > speed * STEP * 1.01) break; // bounced: the straight segment is not the path
            if (x > b.x0 + 1 && x < b.x1 - 1 && y > b.y0 + 1 && y < b.y1 - 1) {
              fail(`speed ${speed}: the ball passed through a tile`);
              i = 1e9;
              break;
            }
          }
        }
      }
    }
  }
  if (problems.length === 0) console.log(`dense field: ${steps} steps without tunnelling`);
}

// ---- the paddle's angle rule
{
  const w = A.PADDLE_W;
  const r = A.BALL_R;
  for (let k = -10; k <= 10; k++) {
    const off = k / 10;
    const x = 180 + off * (w / 2 + r);
    const [vx, vy] = paddleBounce(x, 180, w, r, 400);
    const angle = Math.atan2(vx, -vy);
    if (!near(angle, off * MAX_BOUNCE, 1e-9)) fail(`paddle: offset ${off} gave ${angle} rad`);
    if (!near(Math.hypot(vx, vy), 400, 1e-9)) fail("paddle: speed changed");
    if (vy >= 0) fail("paddle: the ball went down");
  }
  const [vx, vy] = paddleBounce(1000, 180, w, r, 400);
  if (!near(Math.atan2(vx, -vy), MAX_BOUNCE, 1e-9)) fail("paddle: beyond the edge should give the widest angle");
}

// ---- the minimum slope
for (let a = 0; a < 360; a += 3) {
  const rad = (a * Math.PI) / 180;
  const [vx, vy] = keepSlope(Math.cos(rad) * 300, Math.sin(rad) * 300);
  if (Math.abs(vy) < 300 * Math.sin(MIN_SLOPE) - 1e-9) fail(`slope: ${a}° kept too flat`);
  if (!near(Math.hypot(vx, vy), 300, 1e-6)) fail(`slope: ${a}° changed the speed`);
}

// ---- a full game: balls bounce on the paddle and never sink into it, even when the paddle sweeps fast
{
  const game = createGame({ def: { rows: [".............", "aaaaaaaaaaaaa"] }, speed: 380, seed: 3, power: [] });
  launch(game);
  let lastX = 180;
  for (let i = 0; i < 120 * 60; i++) {
    const ball = game.balls[0];
    if (ball && !ball.held) {
      // Follow the ball, then jerk sideways now and then as a finger might.
      lastX = i % 97 < 4 ? ball.x + (i % 2 ? 60 : -60) : ball.x - 6;
      setPaddle(game, lastX);
    }
    step(game);
    const p = game.paddle;
    for (const b of game.balls) {
      const insideX = b.x > p.x - p.w / 2 + 0.5 && b.x < p.x + p.w / 2 - 0.5;
      const insideY = b.y > A.PADDLE_Y + 0.5 && b.y < A.PADDLE_Y + A.PADDLE_H - 0.5;
      if (insideX && insideY) {
        fail("paddle: a ball ended a step inside the paddle");
        i = 1e9;
      }
    }
    if (game.phase === "clear" || game.phase === "over") break;
    if (game.phase === "ready") launch(game);
  }
}

if (problems.length) {
  console.error(problems.slice(0, 30).join("\n"));
  console.error(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log("physics: ok");
