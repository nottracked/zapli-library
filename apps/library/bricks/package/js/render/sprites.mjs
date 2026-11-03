// The game's pictures, drawn once into small canvases and reused every frame: glazed tiles, iron, embers, lustre and
// gift tiles, the power-up beads and soft glows. Everything is drawn from shapes here; the game has no image files.

/** Glaze colours by the letter a level uses for them. */
export const GLAZES = {
  a: "#F4A62A", // amber
  b: "#3D6DF2", // cobalt
  c: "#F26A5B", // coral
  g: "#4FC497", // celadon
  k: "#4A4466", // obsidian
  l: "#A8D946", // lime
  n: "#F48BB8", // rose
  o: "#F47B2C", // orange
  p: "#9D5DE2", // plum
  r: "#E23B42", // copper red
  s: "#5BB9F6", // sky
  t: "#1DC1C4", // turquoise
  w: "#E9EDF6", // porcelain
  y: "#F7D046", // yolk yellow
  ember: "#FF8A2A",
  lustre: "#E9BC4C",
  gift: "#C9B8FF",
  iron: "#7C859C",
};

/** Each power-up's bead colour; its icon (drawn below) tells them apart without colour. */
export const BEAD_COLORS = {
  wide: "#3D6DF2",
  multi: "#4FC497",
  slow: "#5BB9F6",
  sticky: "#C8743A",
  sparks: "#F7D046",
  molten: "#E23B42",
  guard: "#1DC1C4",
  life: "#F48BB8",
};

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A colour mixed toward white (amount > 0) or black (amount < 0), as "rgb(…)" with an optional alpha. */
export function shade(hex, amount, alpha = 1) {
  const [r, g, b] = hexRgb(hex);
  const t = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (v) => Math.round(v + (t - v) * k);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
}

function canvas(w, h) {
  const c = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The crackle a tile shows once it has been hit: a few branching hairlines, the same for every tile of a size. */
function crackle(ctx, w, h, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 0.9 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.12);
  ctx.lineTo(w * 0.34, h * 0.48);
  ctx.lineTo(w * 0.3, h * 0.88);
  ctx.moveTo(w * 0.34, h * 0.48);
  ctx.lineTo(w * 0.55, h * 0.6);
  ctx.lineTo(w * 0.7, h * 0.3);
  ctx.lineTo(w * 0.86, h * 0.18);
  ctx.moveTo(w * 0.55, h * 0.6);
  ctx.lineTo(w * 0.62, h * 0.9);
  ctx.stroke();
  ctx.restore();
}

/** Small round marks for the hits a tough tile has left: three for fresh lustre, two for a tile fired twice. */
function pips(ctx, w, h, s, n, light, dark) {
  const r = Math.max(1.2, 1.55 * s);
  const gap = r * 3.1;
  const x0 = w / 2 - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gap;
    ctx.beginPath();
    ctx.arc(x, h * 0.54, r, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.25, h * 0.54 - r * 0.25, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();
  }
}

/** The glassy top: a highlight band on the upper part and a small gloss spot on the left. */
function glaze(ctx, w, h, rad) {
  ctx.save();
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad);
  ctx.clip();
  const band = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  band.addColorStop(0, "rgba(255,255,255,0.42)");
  band.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h * 0.5);
  const gx = w * 0.2;
  const gy = h * 0.3;
  const gloss = ctx.createRadialGradient(gx, gy, 0, gx, gy, h * 0.55);
  gloss.addColorStop(0, "rgba(255,255,255,0.55)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  // Stretched sideways into an oval, relative to whatever transform the caller set.
  ctx.transform(1.8, 0, 0, 1, -gx * 0.8, 0);
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Draws one tile, w × h device pixels, into ctx at 0,0. `s` is device pixels per arena unit, `kind` the tile's kind,
 * `color` its glaze, `hits` and `max` how tough it is now and was at first.
 */
export function paintTile(ctx, w, h, s, kind, color, hits, max) {
  const rad = Math.min(h * 0.32, 4.2 * s);
  ctx.save();
  if (kind === "iron") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#AEB6C8");
    g.addColorStop(0.18, "#7C859C");
    g.addColorStop(0.7, "#4A5166");
    g.addColorStop(1, "#2C3142");
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad * 0.6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let y = 3; y < h; y += Math.max(2, 1.6 * s)) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
    for (const x of [w * 0.14, w * 0.86]) {
      ctx.beginPath();
      ctx.arc(x, h * 0.52, Math.max(1.3, 1.7 * s), 0, Math.PI * 2);
      ctx.fillStyle = "#2A2F3E";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 0.4 * s, h * 0.52 - 0.4 * s, Math.max(0.8, 0.9 * s), 0, Math.PI * 2);
      ctx.fillStyle = "#C9D0DE";
      ctx.fill();
    }
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad * 0.6);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (kind === "ember") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#5A2E22");
    g.addColorStop(1, "#1D100D");
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad);
    ctx.fillStyle = g;
    ctx.fill();
    const core = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.45);
    core.addColorStop(0, "rgba(255,214,120,0.95)");
    core.addColorStop(0.35, "rgba(255,138,42,0.75)");
    core.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = core;
    ctx.fill();
    crackle(ctx, w, h, s, "rgba(255,190,90,0.9)");
    glaze(ctx, w, h, rad);
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    return;
  }
  const base = color;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (kind === "lustre") {
    g.addColorStop(0, "#FFF2C2");
    g.addColorStop(0.3, "#EDC15A");
    g.addColorStop(0.62, "#B07A1E");
    g.addColorStop(1, "#E9C66A");
  } else if (kind === "gift") {
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(0.5, "#E6DCFF");
    g.addColorStop(1, "#B9A6F2");
  } else {
    g.addColorStop(0, shade(base, 0.3));
    g.addColorStop(0.48, base);
    g.addColorStop(1, shade(base, -0.3));
  }
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad);
  ctx.fillStyle = g;
  ctx.fill();
  if (kind === "lustre") {
    // A sheen of colour across the gold, as on a lustre glaze.
    ctx.save();
    ctx.clip();
    const sheen = ctx.createLinearGradient(0, h, w, 0);
    sheen.addColorStop(0.25, "rgba(255,120,200,0)");
    sheen.addColorStop(0.45, "rgba(255,120,200,0.28)");
    sheen.addColorStop(0.6, "rgba(110,220,255,0.28)");
    sheen.addColorStop(0.8, "rgba(110,220,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // The bottom lip in the glaze's own darker tone.
  ctx.save();
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad);
  ctx.clip();
  ctx.fillStyle = kind === "lustre" ? "rgba(90,50,0,0.45)" : shade(kind === "gift" ? "#8C74E0" : base, -0.45, 0.55);
  ctx.fillRect(0, h - Math.max(1.5, 1.6 * s), w, h);
  ctx.restore();
  if (kind === "gift") {
    // A four-pointed sparkle.
    const cx = w / 2;
    const cy = h / 2;
    const a = h * 0.4;
    const b = h * 0.11;
    ctx.beginPath();
    ctx.moveTo(cx, cy - a);
    ctx.quadraticCurveTo(cx + b, cy - b, cx + a * 1.3, cy);
    ctx.quadraticCurveTo(cx + b, cy + b, cx, cy + a);
    ctx.quadraticCurveTo(cx - b, cy + b, cx - a * 1.3, cy);
    ctx.quadraticCurveTo(cx - b, cy - b, cx, cy - a);
    ctx.fillStyle = "#7A4CF0";
    ctx.fill();
  }
  if (max > 1) {
    if (hits < max) crackle(ctx, w, h, s, kind === "lustre" ? "rgba(80,40,0,0.55)" : shade(base, -0.55, 0.6));
    const light = kind === "lustre" ? "#FFF7D6" : shade(base, 0.65);
    const dark = kind === "lustre" ? "rgba(90,50,0,0.55)" : shade(base, -0.5, 0.75);
    pips(ctx, w, h, s, hits, light, dark);
  }
  glaze(ctx, w, h, rad);
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, rad);
  ctx.strokeStyle = "rgba(0,0,0,0.38)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Tile pictures, made on first use for each look and size. */
export function createTileCache() {
  const cache = new Map();
  return {
    get(kind, glazeKey, hits, max, w, h, s) {
      const key = `${kind}|${glazeKey}|${hits}|${max}|${w}|${h}`;
      let c = cache.get(key);
      if (!c) {
        c = canvas(w, h);
        paintTile(c.getContext("2d"), w, h, s, kind, GLAZES[glazeKey] || GLAZES.w, hits, max);
        cache.set(key, c);
      }
      return c;
    },
    clear() {
      cache.clear();
    },
  };
}

/** A soft round glow of one colour, white at its heart; drawn with "lighter" it adds light. */
export function glowSprite(color, size = 64) {
  const c = canvas(size, size);
  const ctx = c.getContext("2d");
  const [r, g, b] = hexRgb(color);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(255,255,255,1)`);
  grad.addColorStop(0.18, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.28)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * A power-up's icon, drawn centred at 0,0 at unit size (about 10 units across); the caller sets the transform and the
 * colour.
 */
export function beadIcon(ctx, type) {
  ctx.beginPath();
  switch (type) {
    case "wide": // a bar with arrows at both ends
      ctx.moveTo(-5.5, 0);
      ctx.lineTo(5.5, 0);
      ctx.moveTo(-3, -2.6);
      ctx.lineTo(-5.6, 0);
      ctx.lineTo(-3, 2.6);
      ctx.moveTo(3, -2.6);
      ctx.lineTo(5.6, 0);
      ctx.lineTo(3, 2.6);
      ctx.stroke();
      return;
    case "multi": // three balls
      for (const [x, y] of [
        [-3.6, 1.6],
        [3.6, 1.6],
        [0, -2.2],
      ]) {
        ctx.moveTo(x + 1.9, y);
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      }
      ctx.fill();
      return;
    case "slow": // a six-armed frost star
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 2;
        ctx.moveTo(Math.cos(a) * 4.6, Math.sin(a) * 4.6);
        ctx.lineTo(-Math.cos(a) * 4.6, -Math.sin(a) * 4.6);
      }
      ctx.stroke();
      return;
    case "sticky": // a drop of wet clay
      ctx.moveTo(0, -4.8);
      ctx.bezierCurveTo(2.2, -1.6, 3.6, 0.4, 3.6, 1.9);
      ctx.arc(0, 1.9, 3.6, 0, Math.PI);
      ctx.bezierCurveTo(-3.6, 0.4, -2.2, -1.6, 0, -4.8);
      ctx.fill();
      return;
    case "sparks": // two upward bolts
      for (const x of [-2.6, 2.6]) {
        ctx.moveTo(x, 4.6);
        ctx.lineTo(x, -4.2);
        ctx.moveTo(x - 1.8, -2.2);
        ctx.lineTo(x, -4.6);
        ctx.lineTo(x + 1.8, -2.2);
      }
      ctx.stroke();
      return;
    case "molten": // a flame
      ctx.moveTo(0, -5.2);
      ctx.bezierCurveTo(3.4, -1.6, 4.2, 1.4, 3, 3.4);
      ctx.bezierCurveTo(2, 5.2, -2, 5.2, -3, 3.4);
      ctx.bezierCurveTo(-4.2, 1.4, -2.4, -0.6, -1.2, -1.6);
      ctx.bezierCurveTo(-1, 0, 0.4, 0.2, 0, -5.2);
      ctx.fill();
      return;
    case "guard": // a line with an arc over it
      ctx.moveTo(-5.4, 3.4);
      ctx.lineTo(5.4, 3.4);
      ctx.moveTo(-4, 0.6);
      ctx.quadraticCurveTo(0, -5.4, 4, 0.6);
      ctx.stroke();
      return;
    case "life": // a heart
      ctx.moveTo(0, 4.4);
      ctx.bezierCurveTo(-5.6, 0.6, -4.4, -4.8, 0, -2);
      ctx.bezierCurveTo(4.4, -4.8, 5.6, 0.6, 0, 4.4);
      ctx.fill();
      return;
    default:
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
  }
}

/** Draws a bead (the falling capsule of a power-up), w × h arena units, centred at 0,0 under the current transform. */
export function paintBead(ctx, type, w, h) {
  const color = BEAD_COLORS[type] || "#FFFFFF";
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.35));
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.stroke();
  ctx.save();
  ctx.scale(0.95, 0.95);
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#FFFFFF";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowOffsetY = 0.6;
  beadIcon(ctx, type);
  ctx.restore();
  // Gloss.
  const gl = ctx.createLinearGradient(0, -h / 2, 0, 0);
  gl.addColorStop(0, "rgba(255,255,255,0.5)");
  gl.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, -w / 2 + 2, -h / 2 + 1, w - 4, h / 2 - 1, h / 4);
  ctx.fillStyle = gl;
  ctx.fill();
}

export { roundRect };
