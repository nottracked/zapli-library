// Draws the arena on a canvas: the dark kiln wall, the tiles, the paddle, the balls with their trails, the falling
// power-ups and the sparks, and the effects that make each hit felt (shards, sparks, flashes, rings, a light shake and
// the points). In calm mode (the phone's reduced motion, or the player's choice) there are fewer shards, no shake and
// no flying text, and nothing moves that does not have to.
//
// It only reads the game's state; the game's events (game.mjs) start the effects.

import * as A from "../game/arena.mjs";
import { breakable } from "../game/build.mjs";
import { holding, aimPath } from "../game/game.mjs";
import { GLAZES, BEAD_COLORS, createTileCache, glowSprite, paintBead, roundRect, shade } from "./sprites.mjs";

/** The warm or cool light rising from the floor in each world (and in the daily level and endless play). */
export const TINTS = {
  terracotta: { haze: "#FF7A2E", wall: "#24152A" },
  cobalt: { haze: "#3F7BFF", wall: "#141B33" },
  copper: { haze: "#1FC9A8", wall: "#10222A" },
  lustre: { haze: "#F0B43C", wall: "#24182E" },
  daily: { haze: "#E85BC6", wall: "#22142E" },
  endless: { haze: "#8F6BFF", wall: "#17142F" },
};

const MAX_PARTICLES = 520;

export function createRenderer(canvasEl) {
  const ctx = canvasEl.getContext("2d", { alpha: false });
  const tiles = createTileCache();
  const glow = {
    ember: glowSprite("#FF8A2A"),
    white: glowSprite("#FFF3D6"),
    cool: glowSprite("#8FD3FF"),
    red: glowSprite("#FF4A2A"),
    teal: glowSprite("#2CE6D6"),
    gold: glowSprite("#FFD45A"),
  };
  const glazeGlow = new Map();
  const glowOf = (hex) => {
    let g = glazeGlow.get(hex);
    if (!g) {
      g = glowSprite(hex, 48);
      glazeGlow.set(hex, g);
    }
    return g;
  };

  let cssW = 360;
  let cssH = 600;
  let dpr = 1;
  let s = 1; // device pixels per arena unit
  let bg = null;
  let tint = TINTS.terracotta;
  let calm = false;

  const parts = []; // shards and sparks
  const rings = [];
  const pops = [];
  const flashes = new Map(); // tile id → seconds left
  const trails = new Map(); // ball object → recent points
  let shake = 0;
  let paddleFlash = 0;
  let clock = 0;
  let guardFlash = 0;
  let banner = null; // { title, sub, t }
  let shakeX = 0;
  let shakeY = 0;

  function resize(w, h, ratio) {
    cssW = w;
    cssH = h;
    dpr = ratio;
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${h}px`;
    canvasEl.width = Math.max(1, Math.round(w * dpr));
    canvasEl.height = Math.max(1, Math.round(h * dpr));
    s = canvasEl.width / A.W;
    tiles.clear();
    bg = null;
  }

  function setTint(key) {
    const next = TINTS[key] || TINTS.terracotta;
    if (next !== tint) {
      tint = next;
      bg = null;
    }
  }

  function setCalm(on) {
    calm = Boolean(on);
  }

  /** The kiln's back wall: a dark gradient, faint firebrick courses, light rising from the floor, glowing sides. */
  function paintBackground() {
    const c = document.createElement("canvas");
    c.width = canvasEl.width;
    c.height = canvasEl.height;
    const g = c.getContext("2d");
    g.scale(s, s);
    const base = g.createLinearGradient(0, 0, 0, A.H);
    base.addColorStop(0, "#0B0A17");
    base.addColorStop(0.55, tint.wall);
    base.addColorStop(1, "#120C1C");
    g.fillStyle = base;
    g.fillRect(0, 0, A.W, A.H);
    // Firebrick courses, barely there.
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.lineWidth = 1;
    const bw = 60;
    const bh = 30;
    for (let y = 0, row = 0; y < A.H; y += bh, row++) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(A.W, y + 0.5);
      for (let x = (row % 2) * (bw / 2); x < A.W; x += bw) {
        g.moveTo(x + 0.5, y);
        g.lineTo(x + 0.5, y + bh);
      }
      g.stroke();
    }
    // Light from the floor.
    const haze = g.createRadialGradient(A.W / 2, A.H + 40, 10, A.W / 2, A.H + 40, A.H * 0.75);
    haze.addColorStop(0, shade(tint.haze, 0, 0.34));
    haze.addColorStop(0.45, shade(tint.haze, 0, 0.1));
    haze.addColorStop(1, shade(tint.haze, 0, 0));
    g.fillStyle = haze;
    g.fillRect(0, 0, A.W, A.H);
    // A cooler glow behind the tiles.
    const top = g.createRadialGradient(A.W / 2, 120, 10, A.W / 2, 120, 260);
    top.addColorStop(0, "rgba(140,150,255,0.07)");
    top.addColorStop(1, "rgba(140,150,255,0)");
    g.fillStyle = top;
    g.fillRect(0, 0, A.W, A.H);
    // Glowing rails along the walls and the ceiling.
    const rail = (x0, y0, x1, y1) => {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, shade(tint.haze, 0.3, 0.05));
      lg.addColorStop(1, shade(tint.haze, 0.3, 0.55));
      g.strokeStyle = lg;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    rail(0.8, 0, 0.8, A.H);
    rail(A.W - 0.8, 0, A.W - 0.8, A.H);
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 0.6);
    g.lineTo(A.W, 0.6);
    g.stroke();
    bg = c;
  }

  // ---- effects started by the game's events

  function addPart(p) {
    if (parts.length >= MAX_PARTICLES) parts.shift();
    parts.push(p);
  }

  function shardsAt(x, y, color, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (50 + Math.random() * 150) * power;
      addPart({
        kind: "shard",
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        rot: Math.random() * 6.28,
        spin: (Math.random() - 0.5) * 18,
        size: 2 + Math.random() * 3.2,
        life: 0.55 + Math.random() * 0.4,
        age: 0,
        color,
      });
    }
  }

  function sparksAt(x, y, sprite, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      addPart({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        size: 3 + Math.random() * 4,
        life: 0.22 + Math.random() * 0.28,
        age: 0,
        sprite,
      });
    }
  }

  function pop(x, y, text, size, color) {
    if (pops.length > 12) pops.shift();
    pops.push({ x, y, text, size, color, age: 0, life: calm ? 0.7 : 0.9 });
  }

  function event(ev, game, labels) {
    const sc = calm ? 0 : 1;
    switch (ev.type) {
      case "break": {
        const color =
          ev.kind === "glaze"
            ? GLAZES[ev.glaze]
            : ev.kind === "ember"
              ? "#FF8A2A"
              : ev.kind === "lustre"
                ? "#EDC15A"
                : "#D9CCFF";
        shardsAt(ev.x, ev.y, color, calm ? 4 : 10, 1);
        if (!calm) sparksAt(ev.x, ev.y, glowOf(color), 5, 140);
        flashes.delete(ev.brick);
        shake = Math.max(shake, 1.4 * sc);
        if (ev.mult > 1 || ev.combo >= 5) {
          pop(
            ev.x,
            ev.y,
            labels.combo(ev.points, ev.mult),
            9 + Math.min(10, ev.mult * 2),
            ev.mult >= 4 ? "#FFD45A" : "#FFFFFF",
          );
        }
        break;
      }
      case "tough":
        flashes.set(ev.brick, 0.12);
        shardsAt(ev.x, ev.y, GLAZES[ev.glaze] || "#EDC15A", calm ? 1 : 3, 0.6);
        break;
      case "iron":
        flashes.set(ev.brick, 0.1);
        if (!calm) sparksAt(ev.x, ev.y, glow.white, 4, 120);
        break;
      case "burst":
        rings.push({ x: ev.x, y: ev.y, age: 0, life: 0.42, max: 46, sprite: glow.ember });
        if (!calm) sparksAt(ev.x, ev.y, glow.ember, 14, 220);
        shake = Math.max(shake, 4.2 * sc);
        break;
      case "paddle":
      case "catch":
        paddleFlash = 1;
        if (!calm) sparksAt(ev.x, A.PADDLE_Y, glow.ember, 3, 90);
        break;
      case "guard":
        guardFlash = 1;
        break;
      case "power": {
        const color = BEAD_COLORS[ev.power] || "#FFFFFF";
        rings.push({ x: ev.x, y: A.PADDLE_Y, age: 0, life: 0.5, max: 60, sprite: glowOf(color) });
        pop(game.paddle.x, A.PADDLE_Y - 26, labels.power(ev.power), 11, shade(color, 0.45));
        break;
      }
      case "lost":
      case "over":
        shake = Math.max(shake, 5 * sc);
        break;
      case "clear":
        if (!calm) {
          for (let i = 0; i < 5; i++) sparksAt(40 + Math.random() * 280, 120 + Math.random() * 200, glow.gold, 10, 200);
        }
        break;
      default:
        break;
    }
  }

  /** A title in the middle of the arena for a moment (the level's name as it starts). */
  function showBanner(title, sub) {
    banner = { title, sub, t: 0 };
  }

  function clearEffects() {
    parts.length = 0;
    rings.length = 0;
    pops.length = 0;
    flashes.clear();
    trails.clear();
    shake = 0;
    banner = null;
  }

  // ---- drawing

  function drawTiles(game) {
    const cw = game.level.cellW;
    const inset = 1.1;
    const w = Math.max(2, Math.round((cw - inset * 2) * s));
    const h = Math.max(2, Math.round((A.ROW_H - inset * 2 - 1) * s));
    for (const m of game.moves) {
      // The track a sliding row runs along.
      const y = A.GRID_TOP + m.row * A.ROW_H + A.ROW_H / 2;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(4 * s, (y - 0.5) * s, (A.W - 8) * s, Math.max(1, s));
    }
    for (const b of game.bricks) {
      if (!b.alive) continue;
      const img = tiles.get(b.kind, b.glaze, b.hits === Infinity ? 0 : b.hits, b.max === Infinity ? 0 : b.max, w, h, s);
      const x = Math.round((b.x0 + inset) * s);
      const y = Math.round((b.y0 + inset) * s);
      if (b.kind === "ember") {
        // Embers breathe.
        const pulse = calm ? 0.5 : 0.45 + 0.35 * Math.sin(clock * 4 + b.id);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = pulse * 0.55;
        const gs = cw * 1.5 * s;
        ctx.drawImage(glow.ember, x + w / 2 - gs / 2, y + h / 2 - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(img, x, y);
      const f = flashes.get(b.id);
      if (f) {
        ctx.globalAlpha = Math.min(1, f / 0.12) * 0.7;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        roundRect(ctx, x, y, w, h, Math.min(h * 0.32, 4.2 * s));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPaddle(game) {
    const p = game.paddle;
    const x = (p.x - p.w / 2) * s;
    const y = A.PADDLE_Y * s;
    const w = p.w * s;
    const h = A.PADDLE_H * s;
    const timers = game.timers;
    // Light under the paddle.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.26 + paddleFlash * 0.3;
    ctx.drawImage(timers.slow > 0 ? glow.cool : glow.ember, x - w * 0.15, y - h * 1.6, w * 1.3, h * 4.4);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // Body.
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, "#FBF7FF");
    body.addColorStop(0.45, "#C9C2E4");
    body.addColorStop(1, "#6B6590");
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = body;
    ctx.fill();
    // Caps in the colour of what the paddle can do now.
    const capColor =
      timers.sticky > 0 ? "#C8743A" : timers.sparks > 0 ? "#F7D046" : timers.wide > 0 ? "#3D6DF2" : "#FF7A2E";
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.clip();
    const cap = Math.min(w * 0.18, 9 * s);
    const cg = ctx.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, shade(capColor, 0.35));
    cg.addColorStop(1, shade(capColor, -0.3));
    ctx.fillStyle = cg;
    ctx.fillRect(x, y, cap, h);
    ctx.fillRect(x + w - cap, y, cap, h);
    if (timers.sticky > 0) {
      // Wet clay across the top.
      ctx.fillStyle = "rgba(200,116,58,0.85)";
      ctx.fillRect(x, y, w, h * 0.32);
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(x + (w * i) / 6, y + h * 0.32, h * 0.12, 0, Math.PI);
        ctx.fill();
      }
    }
    ctx.restore();
    // The hot line along the top.
    const hot = ctx.createLinearGradient(x, 0, x + w, 0);
    hot.addColorStop(0, "rgba(255,138,61,0)");
    hot.addColorStop(0.5, `rgba(255,214,140,${0.75 + paddleFlash * 0.25})`);
    hot.addColorStop(1, "rgba(255,138,61,0)");
    ctx.fillStyle = hot;
    ctx.fillRect(x + h * 0.4, y + 1.2 * s, w - h * 0.8, Math.max(1, 1.4 * s));
    if (timers.guard > 0) {
      // The guard's line; it flickers over its last three seconds (or fades, in calm mode).
      const gy = A.GUARD_Y * s;
      let pulse = calm ? 0.8 : 0.65 + 0.2 * Math.sin(clock * 6) + guardFlash * 0.3;
      if (timers.guard < 3) pulse *= calm ? timers.guard / 3 : 0.45 + 0.55 * Math.abs(Math.sin(clock * 9));
      const lg = ctx.createLinearGradient(0, 0, canvasEl.width, 0);
      lg.addColorStop(0, "rgba(29,193,196,0)");
      lg.addColorStop(0.15, `rgba(120,240,235,${pulse})`);
      lg.addColorStop(0.85, `rgba(120,240,235,${pulse})`);
      lg.addColorStop(1, "rgba(29,193,196,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, gy - 1.2 * s, canvasEl.width, 2.4 * s);
    }
  }

  function drawBalls(game) {
    const molten = game.timers.molten > 0;
    const slow = game.timers.slow > 0;
    const trailSprite = molten ? glow.red : slow ? glow.cool : glow.ember;
    const keep = calm ? 5 : 14;
    const seen = new Set();
    ctx.globalCompositeOperation = "lighter";
    for (const ball of game.balls) {
      seen.add(ball);
      let tr = trails.get(ball);
      if (!tr) {
        tr = [];
        trails.set(ball, tr);
      }
      if (ball.held) tr.length = 0;
      else {
        tr.push(ball.x, ball.y);
        while (tr.length > keep * 2) tr.splice(0, 2);
      }
      const n = tr.length / 2;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / n;
        const r = (ball.r * (0.6 + 1.6 * k) + (molten ? 3 : 0)) * s;
        ctx.globalAlpha = k * k * (molten ? 0.75 : 0.5);
        ctx.drawImage(trailSprite, tr[i * 2] * s - r, tr[i * 2 + 1] * s - r, r * 2, r * 2);
      }
      ctx.globalAlpha = molten ? 0.95 : 0.7;
      const gr = ball.r * (molten ? 5 : 3.8) * s;
      ctx.drawImage(trailSprite, ball.x * s - gr, ball.y * s - gr, gr * 2, gr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const ball of game.balls) {
      const x = ball.x * s;
      const y = ball.y * s;
      const r = ball.r * s;
      const core = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      core.addColorStop(0, "#FFFFFF");
      core.addColorStop(0.55, molten ? "#FFD2A0" : slow ? "#E4F5FF" : "#FFF0CC");
      core.addColorStop(1, molten ? "#FF5A2A" : slow ? "#7CC8F5" : "#FFAA44");
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    }
    for (const k of trails.keys()) if (!seen.has(k)) trails.delete(k);
  }

  function drawBeads(game) {
    for (const bead of game.beads) {
      ctx.save();
      ctx.setTransform(s, 0, 0, s, bead.x * s + shakeX, bead.y * s + shakeY);
      const wob = calm ? 0 : Math.sin(clock * 5 + bead.x) * 0.06;
      ctx.rotate(wob);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowOf(BEAD_COLORS[bead.type] || "#FFFFFF"), -26, -18, 52, 36);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      paintBead(ctx, bead.type, A.BEAD_W, A.BEAD_H);
      ctx.restore();
    }
  }

  function drawBolts(game) {
    if (!game.bolts.length) return;
    ctx.globalCompositeOperation = "lighter";
    for (const b of game.bolts) {
      const gs = 14 * s;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(glow.gold, b.x * s - gs / 2, (b.y - 3) * s - gs / 2, gs, gs);
      ctx.fillStyle = "#FFF6D0";
      ctx.fillRect((b.x - 0.9) * s, b.y * s - A.BOLT_LEN * s, 1.8 * s, A.BOLT_LEN * s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawEffects(dt) {
    // Shards fall and spin; sparks fly and fade.
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "shard") {
        p.vy += 520 * dt;
        p.rot += p.spin * dt;
      } else {
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
      }
    }
    for (const p of parts) {
      if (p.kind !== "shard") continue;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.setTransform(
        s * Math.cos(p.rot),
        s * Math.sin(p.rot),
        -s * Math.sin(p.rot),
        s * Math.cos(p.rot),
        p.x * s,
        p.y * s,
      );
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (const p of parts) {
      if (p.kind !== "spark") continue;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k;
      const r = p.size * s * (0.5 + k * 0.5);
      ctx.drawImage(p.sprite, p.x * s - r, p.y * s - r, r * 2, r * 2);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.age += dt;
      if (ring.age >= ring.life) {
        rings.splice(i, 1);
        continue;
      }
      const k = ring.age / ring.life;
      const r = ring.max * (calm ? 0.8 : 0.3 + 0.7 * (1 - Math.pow(1 - k, 3))) * s;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.drawImage(ring.sprite, ring.x * s - r, ring.y * s - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const [id, f] of flashes) {
      if (f - dt <= 0) flashes.delete(id);
      else flashes.set(id, f - dt);
    }
  }

  function drawPops(dt, font) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.age += dt;
      if (p.age >= p.life) pops.splice(i, 1);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of pops) {
      const k = p.age / p.life;
      const rise = calm ? 0 : 26 * (1 - Math.pow(1 - k, 2));
      const grow = calm ? 1 : 0.8 + 0.2 * Math.min(1, k * 5);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `800 ${Math.round(p.size * grow * s)}px ${font}`;
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = "rgba(10,8,24,0.75)";
      ctx.strokeText(p.text, p.x * s, (p.y - rise) * s);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x * s, (p.y - rise) * s);
    }
    ctx.globalAlpha = 1;
  }

  /** Text that wraps at spaces (never inside a word) to fit `maxW` arena units; returns the lines. */
  function wrap(text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW * s) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Fits text into a box: wraps it and shrinks it until no line (and so no word) is wider than the box. */
  function fitText(text, px, weight, font, maxW, maxLines) {
    let size = px;
    for (let k = 0; k < 12; k++) {
      ctx.font = `${weight} ${Math.round(size * s)}px ${font}`;
      const lines = wrap(text, maxW);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (widest <= maxW * s && lines.length <= maxLines) return { lines, size };
      size *= 0.9;
    }
    ctx.font = `${weight} ${Math.round(size * s)}px ${font}`;
    return { lines: wrap(text, maxW), size };
  }

  function drawCentreText(lines, size, y, color, weight, font) {
    ctx.font = `${weight} ${Math.round(size * s)}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      const ly = (y + i * size * 1.25) * s;
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = "rgba(10,8,24,0.8)";
      ctx.strokeText(line, (A.W / 2) * s, ly);
      ctx.fillStyle = color;
      ctx.fillText(line, (A.W / 2) * s, ly);
    });
  }

  function drawAim(game) {
    const pts = aimPath(game);
    if (!pts) return;
    ctx.save();
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = "round";
    ctx.setLineDash([0.1, 7 * s]);
    ctx.lineDashOffset = calm ? 0 : -clock * 30 * s;
    ctx.strokeStyle = "rgba(255,230,190,0.7)";
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * One frame. `ui`: { aim (show the aim line), hint (text while a ball waits for its launch), textScale (the
   * phone's text size as a factor), font, labels }.
   */
  function draw(game, dt, ui) {
    clock += dt;
    if (!bg) paintBackground();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(bg, 0, 0);

    shake *= Math.pow(0.0009, dt);
    if (shake < 0.05) shake = 0;
    paddleFlash = Math.max(0, paddleFlash - dt * 4);
    guardFlash = Math.max(0, guardFlash - dt * 3);
    const ox = shake ? (Math.random() - 0.5) * 2 * shake * s : 0;
    const oy = shake ? (Math.random() - 0.5) * 2 * shake * s : 0;
    shakeX = ox;
    shakeY = oy;
    ctx.translate(ox, oy);

    if (game) {
      drawTiles(game);
      drawBeads(game);
      drawBolts(game);
      drawPaddle(game);
      if (ui.aim && holding(game) && game.phase !== "clear") drawAim(game);
      drawBalls(game);
    }
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    drawEffects(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawPops(dt, ui.font);

    const textScale = Math.max(1, Math.min(2.2, ui.textScale || 1));
    if (banner) {
      banner.t += dt;
      const hold = calm ? 2.2 : 1.6;
      const fade = 0.5;
      const k = banner.t < hold ? 1 : Math.max(0, 1 - (banner.t - hold) / fade);
      if (k <= 0) banner = null;
      else {
        ctx.globalAlpha = k;
        const title = fitText(banner.title, 26 * Math.min(1.5, textScale), 800, ui.font, A.W - 40, 2);
        drawCentreText(title.lines, title.size, 360, "#FFFFFF", 800, ui.font);
        if (banner.sub) {
          const sub = fitText(banner.sub, 13 * textScale, 600, ui.font, A.W - 40, 2);
          drawCentreText(sub.lines, sub.size, 360 - title.size * 1.1, shade(tint.haze, 0.45), 600, ui.font);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (ui.hint) {
      // The hint for a waiting ball stays until the launch: under the paddle when it fits on one line there, else
      // above the paddle (and below the aim line's start), never over the bricks.
      let box = fitText(ui.hint, 13 * textScale, 650, ui.font, A.W - 40, 1);
      let y = (A.PADDLE_Y + A.PADDLE_H + A.H) / 2 + 2;
      if (box.size < 11) {
        box = fitText(ui.hint, 14 * textScale, 650, ui.font, A.W - 48, 3);
        y = A.PADDLE_Y - 70 - (box.lines.length - 1) * box.size * 1.25;
      }
      ctx.globalAlpha = calm ? 0.95 : 0.78 + 0.17 * Math.sin(clock * 3);
      drawCentreText(box.lines, box.size, y, "#FFF3DE", 650, ui.font);
      ctx.globalAlpha = 1;
    }
  }

  return {
    resize,
    setTint,
    setCalm,
    event,
    draw,
    showBanner,
    clearEffects,
    get scale() {
      return s;
    },
  };
}
