// One level in play: the paddle, the balls, the tiles, the falling power-ups and the sparks. The simulation runs in
// fixed steps of 1/120 s whatever the screen's frame rate, so it plays the same on every phone and in the checks of
// dev/. It draws nothing and plays no sound: it reports what happened as events (a tile broke, a ball was lost, …),
// which the page turns into pictures, sound and vibration.

import * as A from "./arena.mjs";
import { buildLevel, breakable } from "./build.mjs";
import { sweepBox, reflect, paddleBounce, keepSlope, rotate } from "./physics.mjs";

export const STEP = 1 / 120;
/** All power-ups, in the order the help lists them. */
export const POWERS = ["wide", "multi", "slow", "sticky", "sparks", "molten", "guard", "life"];
/** How long each timed power-up lasts, in seconds. */
export const DURATION = { wide: 20, slow: 12, sticky: 18, sparks: 10, molten: 8, guard: 15 };
/** How often each power-up drops, relative to the others. */
const WEIGHT = { wide: 3, multi: 3, slow: 2, sticky: 2, sparks: 2, molten: 1.5, guard: 1.5, life: 0.6 };

const MAX_BALLS = 12;
const MAX_BEADS = 3;
const MAX_LIVES = 5;
/** A ball that touches neither the paddle nor a breakable tile for this long gets a small turn, so it never loops. */
const IDLE_NUDGE = 10;
/** The slow ball's share of the normal speed. */
const SLOW = 0.68;
/** How much faster the ball gets as tiles break and time passes, at most. */
const RAMP_MAX = 0.36;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A repeatable random number generator (mulberry32) whose state can be saved with the game. */
function nextRandom(game) {
  game.rs = (game.rs + 0x6d2b79f5) >>> 0;
  let t = game.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A new game of one level.
 *   def      the level's picture ({ rows, move })
 *   speed    the ball's starting speed, in units a second
 *   pace     the player's speed setting, a factor (1 normal)
 *   power    the power-ups this level may drop
 *   drop     the chance that a broken tile drops one
 *   seed     a 32-bit number for the drops (the same seed, the same drops)
 *   lives    balls to play with; score: points to start from (endless play carries both from wave to wave)
 */
export function createGame(opts) {
  const level = buildLevel(opts.def);
  const game = {
    def: opts.def,
    level,
    bricks: level.bricks,
    moves: level.moves,
    baseSpeed: opts.speed || 300,
    pace: opts.pace || 1,
    power: (opts.power || POWERS).slice(),
    drop: opts.drop === undefined ? 0.12 : opts.drop,
    rs: (opts.seed || 1) >>> 0,
    t: 0,
    acc: 0,
    playT: 0,
    phase: "ready",
    phaseT: 0,
    paddle: { x: A.W / 2, tx: A.W / 2, w: A.PADDLE_W, tw: A.PADDLE_W, vx: 0 },
    balls: [],
    beads: [],
    bolts: [],
    embers: [],
    timers: { wide: 0, slow: 0, sticky: 0, sparks: 0, molten: 0, guard: 0 },
    slowF: 1,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    score: opts.score || 0,
    lives: opts.lives || 3,
    lost: 0,
    broken: 0,
    caught: 0,
    sparkT: 0,
    events: [],
  };
  game.left = game.bricks.filter(breakable).length;
  placeMoves(game);
  newBall(game);
  return game;
}

function placeMoves(game) {
  for (const m of game.moves) m.off = m.amp * Math.sin(game.t * m.speed + m.phase);
  const cw = game.level.cellW;
  for (const b of game.bricks) {
    if (b.move >= 0) {
      b.x0 = b.bx + game.moves[b.move].off;
      b.x1 = b.x0 + cw;
    }
  }
}

function newBall(game) {
  game.balls = [
    {
      x: game.paddle.x + 8,
      y: A.PADDLE_Y - A.BALL_R - 0.01,
      vx: 0,
      vy: 0,
      r: A.BALL_R,
      held: true,
      off: 8,
      heldT: 0,
      idle: 0,
      sticky: false,
    },
  ];
  game.phase = "ready";
  game.phaseT = 0;
}

function emit(game, type, data) {
  game.events.push(Object.assign({ type, t: game.t }, data));
}

/** The ball's speed now: the level's, the player's pace, the gentle build-up and the slow power-up. */
export function speedOf(game) {
  const ramp = 1 + Math.min(RAMP_MAX, game.hits * 0.005 + game.playT * 0.0018);
  return game.baseSpeed * game.pace * ramp * game.slowF;
}

/** Moves the paddle's centre toward x (arena units); it gets there in the next step. */
export function setPaddle(game, x) {
  game.paddle.tx = x;
}

/** Launches every ball that rests on the paddle. */
export function launch(game) {
  if (game.phase !== "ready" && game.phase !== "play") return false;
  let any = false;
  for (const ball of game.balls) {
    if (!ball.held) continue;
    const [vx, vy] = paddleBounce(ball.x, game.paddle.x, game.paddle.w, ball.r, speedOf(game));
    ball.vx = vx;
    ball.vy = vy;
    ball.held = false;
    ball.sticky = false;
    any = true;
  }
  if (any) {
    if (game.phase === "ready") game.phase = "play";
    emit(game, "launch", { x: game.paddle.x });
  }
  return any;
}

/** Whether a ball rests on the paddle, waiting for a launch. */
export function holding(game) {
  return game.balls.some((b) => b.held);
}

/** Runs the simulation for dt seconds of real time, in fixed steps. */
export function update(game, dt) {
  game.acc = Math.min(game.acc + dt, STEP * 30);
  while (game.acc >= STEP) {
    game.acc -= STEP;
    step(game);
  }
}

/** Takes the events since the last call. */
export function drainEvents(game) {
  const out = game.events;
  game.events = [];
  return out;
}

/** One fixed step of the simulation. */
export function step(game) {
  const dt = STEP;
  game.t += dt;
  game.phaseT += dt;
  if (game.phase === "clear" || game.phase === "over") return;

  placeMoves(game);
  movePaddle(game, dt);

  if (game.phase === "play") {
    game.playT += dt;
    for (const k of Object.keys(game.timers)) {
      if (game.timers[k] > 0) {
        game.timers[k] = Math.max(0, game.timers[k] - dt);
        if (game.timers[k] === 0) endPower(game, k);
      }
    }
  }
  const slowTarget = game.timers.slow > 0 ? SLOW : 1;
  game.slowF += (slowTarget - game.slowF) * Math.min(1, dt * 4);

  const speed = speedOf(game);
  for (const ball of game.balls) {
    if (ball.held) {
      ball.x = clamp(game.paddle.x + ball.off, ball.r, A.W - ball.r);
      ball.y = A.PADDLE_Y - ball.r - 0.01;
      ball.heldT += dt;
      if (ball.sticky && ball.heldT > 2.5) launchOne(game, ball);
      continue;
    }
    // Keep the speed as it is now (it builds up, and the slow power-up eases it down and up again).
    const v = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = (ball.vx / v) * speed;
    ball.vy = (ball.vy / v) * speed;
    moveBall(game, ball, dt);
    ball.idle += dt;
    if (ball.idle > IDLE_NUDGE) {
      // The ball has looped without touching the paddle or a tile it can break: turn it a little.
      [ball.vx, ball.vy] = rotate(ball.vx, ball.vy, ((nextRandom(game) < 0.5 ? -1 : 1) * 7 * Math.PI) / 180);
      [ball.vx, ball.vy] = keepSlope(ball.vx, ball.vy);
      ball.idle = IDLE_NUDGE - 3;
    }
  }

  const before = game.balls.length;
  game.balls = game.balls.filter((b) => b.y - b.r <= A.H);
  if (game.balls.length < before && game.balls.length > 0) emit(game, "fall", {});

  moveBeads(game, dt);
  moveBolts(game, dt);
  fireSparks(game, dt);
  burstEmbers(game);

  if (game.left === 0) {
    game.phase = "clear";
    game.phaseT = 0;
    game.balls.forEach((b) => (b.held = true));
    emit(game, "clear", {});
    return;
  }

  if (game.balls.length === 0 && game.phase === "play") loseBall(game);
  if (game.phase === "dying" && game.phaseT > 0.9) newBall(game);
}

function movePaddle(game, dt) {
  const p = game.paddle;
  if (p.w !== p.tw) {
    const d = p.tw - p.w;
    p.w += Math.sign(d) * Math.min(Math.abs(d), 180 * dt);
  }
  const x = clamp(p.tx, p.w / 2, A.W - p.w / 2);
  p.vx = (x - p.x) / dt;
  p.x = x;
}

function launchOne(game, ball) {
  const [vx, vy] = paddleBounce(ball.x, game.paddle.x, game.paddle.w, ball.r, speedOf(game));
  ball.vx = vx;
  ball.vy = vy;
  ball.held = false;
  ball.sticky = false;
  emit(game, "launch", { x: ball.x });
}

function loseBall(game) {
  game.lives -= 1;
  game.lost += 1;
  game.combo = 0;
  for (const k of Object.keys(game.timers)) game.timers[k] = 0;
  game.paddle.tw = A.PADDLE_W;
  game.beads = [];
  game.bolts = [];
  if (game.lives > 0) {
    game.phase = "dying";
    game.phaseT = 0;
    emit(game, "lost", { lives: game.lives });
  } else {
    game.phase = "over";
    game.phaseT = 0;
    emit(game, "over", {});
  }
}

// ---- the ball's path

/** Whether a hit lies on a flat face rather than a rounded corner. */
const flat = (h) => h.nx === 0 || h.ny === 0;

function better(h, best) {
  if (!best) return true;
  if (h.t < best.t - 1e-9) return true;
  return Math.abs(h.t - best.t) <= 1e-9 && flat(h) && !flat(best);
}

/**
 * A paddle that moves fast can reach into a ball that moves away from it more slowly. The ball is pushed out of it
 * and, from above, bounced as from the paddle's face; from the side it takes on at least the paddle's speed.
 */
function clearPaddle(game, ball) {
  const p = game.paddle;
  const x0 = p.x - p.w / 2;
  const x1 = p.x + p.w / 2;
  const qx = clamp(ball.x, x0, x1);
  const qy = clamp(ball.y, A.PADDLE_Y, A.PADDLE_Y + A.PADDLE_H);
  const dx = ball.x - qx;
  const dy = ball.y - qy;
  const d = Math.hypot(dx, dy);
  if (d >= ball.r) return;
  let nx = 0;
  let ny = -1;
  if (d > 1e-9) {
    nx = dx / d;
    ny = dy / d;
  }
  if (ny < -0.35) {
    ball.y = A.PADDLE_Y - ball.r - 0.01;
    if (ball.vy > 0) resolve(game, ball, { what: "paddle", nx: 0, ny: -1 });
    return;
  }
  ball.x = qx + nx * (ball.r + 0.01);
  ball.y = qy + ny * (ball.r + 0.01);
  if (nx !== 0 && (Math.sign(ball.vx) !== Math.sign(nx) || Math.abs(ball.vx) < Math.abs(p.vx))) {
    ball.vx = Math.sign(nx) * Math.max(Math.abs(ball.vx), Math.abs(p.vx));
    [ball.vx, ball.vy] = keepSlope(ball.vx, ball.vy);
  }
}

function moveBall(game, ball, dt) {
  clearPaddle(game, ball);
  if (ball.held) return;
  const r = ball.r;
  const p = game.paddle;
  let rem = dt;
  for (let i = 0; i < 12 && rem > 1e-12; i++) {
    const { x, y, vx, vy } = ball;
    let best = null;
    // Walls: left, right and top.
    if (vx < 0) {
      const t = x <= r ? 0 : (r - x) / vx;
      if (t <= rem) best = { t, nx: 1, ny: 0, what: "wall" };
    } else if (vx > 0) {
      const t = x >= A.W - r ? 0 : (A.W - r - x) / vx;
      if (t <= rem && better({ t, nx: -1, ny: 0 }, best)) best = { t, nx: -1, ny: 0, what: "wall" };
    }
    if (vy < 0) {
      const t = y <= r ? 0 : (r - y) / vy;
      if (t <= rem && better({ t, nx: 0, ny: 1 }, best)) best = { t, nx: 0, ny: 1, what: "wall" };
    }
    // The guard's line under the paddle.
    if (game.timers.guard > 0 && vy > 0) {
      const t = y >= A.GUARD_Y - r ? 0 : (A.GUARD_Y - r - y) / vy;
      if (t <= rem && better({ t, nx: 0, ny: -1 }, best)) best = { t, nx: 0, ny: -1, what: "guard" };
    }
    // The paddle.
    const ph = sweepBox(x, y, vx, vy, r, p.x - p.w / 2, A.PADDLE_Y, p.x + p.w / 2, A.PADDLE_Y + A.PADDLE_H, rem);
    if (ph && better(ph, best)) best = Object.assign(ph, { what: "paddle" });
    // Tiles near the path.
    const minX = Math.min(x, x + vx * rem) - r;
    const maxX = Math.max(x, x + vx * rem) + r;
    const minY = Math.min(y, y + vy * rem) - r;
    const maxY = Math.max(y, y + vy * rem) + r;
    for (const b of game.bricks) {
      if (!b.alive || b.x1 < minX || b.x0 > maxX || b.y1 < minY || b.y0 > maxY) continue;
      const h = sweepBox(x, y, vx, vy, r, b.x0, b.y0, b.x1, b.y1, rem);
      if (h && better(h, best)) best = Object.assign(h, { what: "brick", brick: b });
    }

    if (!best) {
      ball.x += vx * rem;
      ball.y += vy * rem;
      return;
    }
    ball.x += vx * best.t;
    ball.y += vy * best.t;
    if (best.overlap) {
      ball.x += best.nx * (best.push + 0.01);
      ball.y += best.ny * (best.push + 0.01);
    }
    rem -= best.t;
    if (resolve(game, ball, best)) return;
  }
}

/** Bounces the ball on what it touched. Returns true when the ball stops moving for this step (caught). */
function resolve(game, ball, hit) {
  const p = game.paddle;
  if (hit.what === "wall") {
    [ball.vx, ball.vy] = reflect(ball.vx, ball.vy, hit.nx, hit.ny);
    [ball.vx, ball.vy] = keepSlope(ball.vx, ball.vy);
    emit(game, "wall", { x: ball.x, y: ball.y });
    return false;
  }
  if (hit.what === "guard") {
    ball.vy = -Math.abs(ball.vy);
    emit(game, "guard", { x: ball.x, y: A.GUARD_Y });
    return false;
  }
  if (hit.what === "paddle") {
    ball.idle = 0;
    game.combo = 0;
    if (hit.ny < -0.35 && ball.vy > 0) {
      ball.y = Math.min(ball.y, A.PADDLE_Y - ball.r - 0.01);
      const off = clamp((ball.x - p.x) / (p.w / 2 + ball.r), -1, 1);
      if (game.timers.sticky > 0) {
        ball.held = true;
        ball.sticky = true;
        ball.heldT = 0;
        ball.off = clamp(ball.x - p.x, -p.w / 2, p.w / 2);
        ball.vx = 0;
        ball.vy = 0;
        emit(game, "catch", { x: ball.x, off });
        return true;
      }
      [ball.vx, ball.vy] = paddleBounce(ball.x, p.x, p.w, ball.r, Math.hypot(ball.vx, ball.vy));
      emit(game, "paddle", { x: ball.x, off });
      return false;
    }
    [ball.vx, ball.vy] = reflect(ball.vx, ball.vy, hit.nx, hit.ny);
    // A ball struck by the paddle's side moves at least as fast as the paddle, away from it.
    if (hit.nx !== 0 && Math.sign(p.vx) === Math.sign(hit.nx) && Math.abs(ball.vx) < Math.abs(p.vx)) {
      ball.vx = p.vx;
    }
    [ball.vx, ball.vy] = keepSlope(ball.vx, ball.vy);
    emit(game, "paddle", { x: ball.x, off: 0, side: true });
    return false;
  }
  // A tile.
  const b = hit.brick;
  if (game.timers.molten > 0 && breakable(b)) {
    // A molten ball melts through: the tile breaks at once and the ball keeps its path.
    damage(game, b, b.hits, "molten");
    ball.idle = 0;
    return false;
  }
  [ball.vx, ball.vy] = reflect(ball.vx, ball.vy, hit.nx, hit.ny);
  [ball.vx, ball.vy] = keepSlope(ball.vx, ball.vy);
  if (breakable(b)) ball.idle = 0;
  damage(game, b, 1, "ball");
  return false;
}

// ---- tiles

/** Hits a tile n times. An iron tile only rings. */
export function damage(game, b, n, by) {
  if (!b.alive) return;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  if (!breakable(b)) {
    emit(game, "iron", { x: cx, y: cy, brick: b.id });
    return;
  }
  b.hits -= n;
  game.hits += 1;
  if (b.hits > 0) {
    game.score += 5;
    emit(game, "tough", { x: cx, y: cy, brick: b.id, glaze: b.glaze, hits: b.hits });
    return;
  }
  b.alive = false;
  b.hits = 0;
  game.left -= 1;
  game.broken += 1;
  game.combo += 1;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const mult = Math.min(6, 1 + Math.floor((game.combo - 1) / 5));
  const points = 10 * mult;
  game.score += points;
  emit(game, "break", { x: cx, y: cy, brick: b.id, glaze: b.glaze, kind: b.kind, points, mult, combo: game.combo, by });
  if (b.kind === "ember") game.embers.push({ at: game.t + 0.09, x: cx, y: cy });
  if (b.kind === "gift" || (game.beads.length < MAX_BEADS && nextRandom(game) < game.drop)) dropBead(game, cx, cy);
}

function burstEmbers(game) {
  if (!game.embers.length) return;
  const due = game.embers.filter((e) => e.at <= game.t);
  if (!due.length) return;
  game.embers = game.embers.filter((e) => e.at > game.t);
  const cw = game.level.cellW;
  for (const e of due) {
    emit(game, "burst", { x: e.x, y: e.y });
    for (const b of game.bricks) {
      if (!b.alive) continue;
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      if (Math.abs(cx - e.x) <= cw * 1.5 && Math.abs(cy - e.y) <= A.ROW_H * 1.5) damage(game, b, 1, "burst");
    }
  }
}

// ---- power-ups

function dropBead(game, x, y) {
  const choices = game.power.filter(
    (k) => !(k === "life" && game.lives >= MAX_LIVES) && !(k === "multi" && game.balls.length >= MAX_BALLS),
  );
  if (!choices.length) return;
  const total = choices.reduce((s, k) => s + WEIGHT[k], 0);
  let roll = nextRandom(game) * total;
  let type = choices[choices.length - 1];
  for (const k of choices) {
    roll -= WEIGHT[k];
    if (roll < 0) {
      type = k;
      break;
    }
  }
  game.beads.push({ x, y, type, t: 0 });
  emit(game, "bead", { x, y, power: type });
}

function moveBeads(game, dt) {
  const p = game.paddle;
  const keep = [];
  for (const bead of game.beads) {
    bead.y += A.BEAD_SPEED * dt;
    bead.t += dt;
    const hitX = Math.abs(bead.x - p.x) <= p.w / 2 + A.BEAD_W / 2;
    const hitY = bead.y + A.BEAD_H / 2 >= A.PADDLE_Y && bead.y - A.BEAD_H / 2 <= A.PADDLE_Y + A.PADDLE_H;
    if (hitX && hitY && game.phase === "play") {
      applyPower(game, bead.type, bead.x);
      continue;
    }
    if (bead.y - A.BEAD_H / 2 <= A.H) keep.push(bead);
  }
  game.beads = keep;
}

/** Gives a power-up, as when its bead is caught. */
export function applyPower(game, type, x) {
  const p = game.paddle;
  game.caught += 1;
  game.score += 25;
  if (type === "wide") p.tw = p.tw >= A.PADDLE_W_WIDE ? Math.min(A.PADDLE_W_MAX, p.tw + 12) : A.PADDLE_W_WIDE;
  if (type === "multi") splitBalls(game);
  if (type === "life") game.lives = Math.min(MAX_LIVES, game.lives + 1);
  if (DURATION[type]) game.timers[type] = DURATION[type];
  emit(game, "power", { power: type, x: x === undefined ? p.x : x, y: A.PADDLE_Y });
}

function endPower(game, type) {
  if (type === "wide") game.paddle.tw = A.PADDLE_W;
  if (type === "sticky") for (const b of game.balls) if (b.held && b.sticky) launchOne(game, b);
  emit(game, "powerEnd", { power: type });
}

function splitBalls(game) {
  const speed = speedOf(game);
  const add = [];
  for (const ball of game.balls) {
    if (game.balls.length + add.length >= MAX_BALLS) break;
    let vx = ball.vx;
    let vy = ball.vy;
    if (ball.held) {
      // A ball resting on the paddle splits upward.
      vx = 0;
      vy = -speed;
    }
    for (const turn of [-0.38, 0.38]) {
      if (game.balls.length + add.length >= MAX_BALLS) break;
      const [nvx, nvy] = keepSlope(...rotate(vx, vy, turn));
      add.push({
        x: ball.x,
        y: Math.min(ball.y, A.PADDLE_Y - ball.r - 1),
        vx: nvx,
        vy: nvy,
        r: ball.r,
        held: false,
        off: 0,
        heldT: 0,
        idle: 0,
        sticky: false,
      });
    }
  }
  game.balls.push(...add);
  if (game.phase === "ready" && add.length) game.phase = "play";
}

function fireSparks(game, dt) {
  if (game.timers.sparks <= 0 || game.phase !== "play") return;
  game.sparkT -= dt;
  if (game.sparkT > 0) return;
  game.sparkT = 0.32;
  const p = game.paddle;
  game.bolts.push({ x: p.x - p.w / 2 + 5, y: A.PADDLE_Y - 2 }, { x: p.x + p.w / 2 - 5, y: A.PADDLE_Y - 2 });
  emit(game, "spark", { x: p.x });
}

function moveBolts(game, dt) {
  if (!game.bolts.length) return;
  const keep = [];
  for (const bolt of game.bolts) {
    const y0 = bolt.y;
    const y1 = bolt.y - A.BOLT_SPEED * dt;
    // The lowest tile the spark's path crosses in this step.
    let hit = null;
    for (const b of game.bricks) {
      if (!b.alive || bolt.x < b.x0 || bolt.x > b.x1) continue;
      if (b.y1 >= y1 - A.BOLT_LEN && b.y0 <= y0 && (!hit || b.y1 > hit.y1)) hit = b;
    }
    if (hit) {
      damage(game, hit, 1, "spark");
      continue;
    }
    bolt.y = y1;
    if (bolt.y > -A.BOLT_LEN) keep.push(bolt);
  }
  game.bolts = keep;
}

// ---- aiming

/**
 * The path a resting ball would take if launched now, as points, until it has bounced twice or travelled `reach`
 * units: the aim line shown before a launch.
 */
export function aimPath(game, reach = 420) {
  const ball = game.balls.find((b) => b.held);
  if (!ball) return null;
  let [vx, vy] = paddleBounce(ball.x, game.paddle.x, game.paddle.w, ball.r, 1);
  let x = ball.x;
  let y = ball.y;
  const pts = [[x, y]];
  let left = reach;
  for (let bounce = 0; bounce < 3 && left > 0; bounce++) {
    let best = null;
    if (vx < 0) best = { t: (ball.r - x) / vx, nx: 1, ny: 0 };
    else if (vx > 0) best = { t: (A.W - ball.r - x) / vx, nx: -1, ny: 0 };
    if (vy < 0) {
      const t = (ball.r - y) / vy;
      if (!best || t < best.t) best = { t, nx: 0, ny: 1 };
    }
    for (const b of game.bricks) {
      if (!b.alive) continue;
      const h = sweepBox(x, y, vx, vy, ball.r, b.x0, b.y0, b.x1, b.y1, left);
      if (h && (!best || h.t < best.t)) best = h;
    }
    const t = best ? Math.min(best.t, left) : left;
    x += vx * t;
    y += vy * t;
    pts.push([x, y]);
    left -= t;
    if (!best || best.t > t) break;
    [vx, vy] = reflect(vx, vy, best.nx, best.ny);
  }
  return pts;
}

// ---- saving and restoring a game in play

/** The game's state as plain JSON, to resume it later (after a rotation, a pause or a closed app). */
export function snapshot(game) {
  return {
    v: 1,
    t: game.t,
    playT: game.playT,
    phase: game.phase === "dying" ? "dying" : game.phase,
    phaseT: game.phaseT,
    rs: game.rs,
    paddle: { x: game.paddle.x, tx: game.paddle.tx, vx: game.paddle.vx, w: game.paddle.w, tw: game.paddle.tw },
    balls: game.balls.map((b) => ({
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      held: b.held,
      off: b.off,
      sticky: b.sticky,
      heldT: b.heldT,
      idle: b.idle,
    })),
    beads: game.beads.map((b) => ({ x: b.x, y: b.y, type: b.type })),
    bolts: game.bolts.map((b) => ({ x: b.x, y: b.y })),
    embers: game.embers.map((e) => ({ at: e.at, x: e.x, y: e.y })),
    bricks: game.bricks.map((b) => (b.alive ? (breakable(b) ? b.hits : -1) : 0)),
    timers: Object.assign({}, game.timers),
    slowF: game.slowF,
    hits: game.hits,
    combo: game.combo,
    bestCombo: game.bestCombo,
    score: game.score,
    lives: game.lives,
    lost: game.lost,
    broken: game.broken,
    caught: game.caught,
    sparkT: game.sparkT,
  };
}

/** A game rebuilt from its options and a snapshot; null when the snapshot does not fit the level. */
export function restoreGame(opts, snap) {
  if (!snap || snap.v !== 1 || !Array.isArray(snap.bricks)) return null;
  const game = createGame(opts);
  if (snap.bricks.length !== game.bricks.length) return null;
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  game.t = num(snap.t, 0);
  game.playT = num(snap.playT, 0);
  game.phase = ["ready", "play", "dying"].includes(snap.phase) ? snap.phase : "ready";
  game.phaseT = num(snap.phaseT, 0);
  game.rs = num(snap.rs, 1) >>> 0;
  game.bricks.forEach((b, i) => {
    const h = snap.bricks[i];
    if (!breakable(b)) return;
    if (h <= 0) {
      b.alive = false;
      b.hits = 0;
    } else b.hits = Math.min(b.max, Math.round(h));
  });
  game.left = game.bricks.filter((b) => b.alive && breakable(b)).length;
  const p = snap.paddle || {};
  game.paddle.x = num(p.x, A.W / 2);
  game.paddle.tx = num(p.tx, game.paddle.x);
  game.paddle.vx = num(p.vx, 0);
  game.paddle.w = num(p.w, A.PADDLE_W);
  game.paddle.tw = num(p.tw, A.PADDLE_W);
  const balls = (snap.balls || []).slice(0, MAX_BALLS).map((b) => ({
    x: num(b.x, A.W / 2),
    y: num(b.y, A.PADDLE_Y - A.BALL_R),
    vx: num(b.vx, 0),
    vy: num(b.vy, 0),
    r: A.BALL_R,
    held: Boolean(b.held),
    off: num(b.off, 0),
    heldT: num(b.heldT, 0),
    idle: num(b.idle, 0),
    sticky: Boolean(b.sticky),
  }));
  if (balls.length) game.balls = balls;
  else if (game.phase === "play") game.phase = "dying";
  game.beads = (snap.beads || [])
    .slice(0, MAX_BEADS)
    .filter((b) => POWERS.includes(b.type))
    .map((b) => ({ x: num(b.x, 0), y: num(b.y, 0), type: b.type, t: 0 }));
  game.bolts = (snap.bolts || []).map((b) => ({ x: num(b.x, 0), y: num(b.y, 0) }));
  game.embers = (snap.embers || []).map((e) => ({ at: num(e.at, 0), x: num(e.x, 0), y: num(e.y, 0) }));
  for (const k of Object.keys(game.timers)) game.timers[k] = Math.max(0, num(snap.timers && snap.timers[k], 0));
  game.slowF = clamp(num(snap.slowF, 1), SLOW, 1);
  for (const k of ["hits", "combo", "bestCombo", "score", "lost", "broken", "caught", "sparkT"])
    game[k] = num(snap[k], 0);
  game.lives = clamp(Math.round(num(snap.lives, 3)), 1, MAX_LIVES);
  placeMoves(game);
  return game;
}
