// Continuous collision for a moving ball. A ball never jumps: each step finds the exact moment the ball first touches
// a wall, the paddle or a tile along its path, moves it there, bounces it and carries on with the time left, so no
// speed can carry it through a tile ("tunnelling").
//
// The shapes are boxes. A ball of radius r touches a box when its centre enters the box grown by r with rounded
// corners: a flat face gives a straight bounce, a corner a bounce along the line from the corner to the centre.

const TINY = 1e-9;

/** Earliest time t ≥ 0 at which a point moving from (px, py) with velocity (vx, vy) reaches a circle; or null. */
function rayCircle(px, py, vx, vy, cx, cy, r) {
  const fx = px - cx;
  const fy = py - cy;
  const a = vx * vx + vy * vy;
  if (a < TINY) return null;
  const b = 2 * (fx * vx + fy * vy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 ? t : null;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * When a ball of radius r at (px, py), moving with (vx, vy), first touches the box [x0, x1] × [y0, y1] within tmax
 * seconds: { t, nx, ny } with the surface's outward normal, or null. A ball that already overlaps the box and moves
 * into it touches it at t = 0 (`overlap`, with `push`: how far to move it out along the normal); one that overlaps but
 * moves away is left alone.
 */
export function sweepBox(px, py, vx, vy, r, x0, y0, x1, y1, tmax) {
  const qx = clamp(px, x0, x1);
  const qy = clamp(py, y0, y1);
  const dx = px - qx;
  const dy = py - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 < r * r - 1e-7) {
    let nx;
    let ny;
    let push;
    if (d2 > TINY) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      ny = dy / d;
      push = r - d;
    } else {
      // The centre is inside the box: out through the nearest side.
      const left = px - x0;
      const right = x1 - px;
      const top = py - y0;
      const bottom = y1 - py;
      const m = Math.min(left, right, top, bottom);
      if (m === top) [nx, ny] = [0, -1];
      else if (m === bottom) [nx, ny] = [0, 1];
      else if (m === left) [nx, ny] = [-1, 0];
      else [nx, ny] = [1, 0];
      push = m + r;
    }
    if (vx * nx + vy * ny < 0) return { t: 0, nx, ny, overlap: true, push };
    return null;
  }

  // Slab test against the box grown by r.
  const ex0 = x0 - r;
  const ex1 = x1 + r;
  const ey0 = y0 - r;
  const ey1 = y1 + r;
  let tIn = -Infinity;
  let tOut = Infinity;
  if (Math.abs(vx) < TINY) {
    if (px < ex0 || px > ex1) return null;
  } else {
    let a = (ex0 - px) / vx;
    let b = (ex1 - px) / vx;
    if (a > b) [a, b] = [b, a];
    tIn = Math.max(tIn, a);
    tOut = Math.min(tOut, b);
  }
  if (Math.abs(vy) < TINY) {
    if (py < ey0 || py > ey1) return null;
  } else {
    let a = (ey0 - py) / vy;
    let b = (ey1 - py) / vy;
    if (a > b) [a, b] = [b, a];
    tIn = Math.max(tIn, a);
    tOut = Math.min(tOut, b);
  }
  if (tIn > tOut || tOut < 0 || tIn > tmax) return null;
  const t0 = Math.max(0, tIn);
  const hx = px + vx * t0;
  const hy = py + vy * t0;
  // A ball that only grazes a surface it is leaving does not touch it.
  if (hx >= x0 && hx <= x1) {
    const ny = hy < (y0 + y1) / 2 ? -1 : 1;
    return vy * ny < 0 ? { t: t0, nx: 0, ny } : null;
  }
  if (hy >= y0 && hy <= y1) {
    const nx = hx < (x0 + x1) / 2 ? -1 : 1;
    return vx * nx < 0 ? { t: t0, nx, ny: 0 } : null;
  }
  // A rounded corner.
  const cx = hx < x0 ? x0 : x1;
  const cy = hy < y0 ? y0 : y1;
  const t = rayCircle(px, py, vx, vy, cx, cy, r);
  if (t === null || t > tmax) return null;
  const nx = (px + vx * t - cx) / r;
  const ny = (py + vy * t - cy) / r;
  return vx * nx + vy * ny < 0 ? { t, nx, ny } : null;
}

/** A velocity mirrored on a surface with the unit normal (nx, ny). */
export function reflect(vx, vy, nx, ny) {
  const d = vx * nx + vy * ny;
  return [vx - 2 * d * nx, vy - 2 * d * ny];
}

/** The largest angle from straight up at which the paddle sends the ball, at its very edge. */
export const MAX_BOUNCE = (62 * Math.PI) / 180;
/** The smallest angle between the ball's path and the horizontal, so a ball never skims sideways for ever. */
export const MIN_SLOPE = (16 * Math.PI) / 180;

/**
 * Where the paddle sends a ball that lands on it: the further from its middle, the wider the angle, up to MAX_BOUNCE
 * at the edge. Returns the new velocity at the given speed, always upward.
 */
export function paddleBounce(ballX, paddleX, paddleW, r, speed) {
  const off = clamp((ballX - paddleX) / (paddleW / 2 + r), -1, 1);
  const angle = off * MAX_BOUNCE;
  return [speed * Math.sin(angle), -speed * Math.cos(angle)];
}

/** Keeps a velocity at least MIN_SLOPE away from the horizontal, at the same speed. */
export function keepSlope(vx, vy) {
  const speed = Math.hypot(vx, vy);
  const minVy = speed * Math.sin(MIN_SLOPE);
  if (Math.abs(vy) >= minVy) return [vx, vy];
  const sy = vy < 0 ? -1 : vy > 0 ? 1 : -1;
  const sx = vx < 0 ? -1 : 1;
  return [sx * Math.sqrt(Math.max(0, speed * speed - minVy * minVy)), sy * minVy];
}

/** A velocity turned by an angle (radians). */
export function rotate(vx, vy, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [vx * c - vy * s, vx * s + vy * c];
}
