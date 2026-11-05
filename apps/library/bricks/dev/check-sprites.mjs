// Checks that nothing the game draws can throw, whatever size it is asked for (Node 22). A canvas being resized (a
// rotation, a text-size change) can be 0 or 1 pixels for a moment, and a real canvas throws on a negative radius,
// a gradient with a number that is not finite, a colour stop outside 0 to 1, or an image of 0 pixels. The stand-in
// context below throws in exactly those cases, and the check draws every picture of the game with it:
//  - every kind of brick, at sizes from negative to normal and scales from negative to normal;
//  - every power-up bead, and glows of any size;
//  - the tile cache, the start screen's picture and the arena renderer (a full frame of a level in play) on canvases
//    of 0 × 0, 1 × 1, 360 × 0 and normal sizes.
// Run: node dev/check-sprites.mjs
const problems = [];

class DOMError extends Error {
  constructor(name, msg) {
    super(`${name}: ${msg}`);
    this.name = name;
  }
}
const finite = (...v) => v.every((x) => Number.isFinite(x));

class StrictContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.font = "10px sans-serif";
    this.globalAlpha = 1;
  }
  arc(x, y, r) {
    if (r < 0) throw new DOMError("IndexSizeError", `arc radius ${r}`);
  }
  arcTo(x1, y1, x2, y2, r) {
    if (r < 0) throw new DOMError("IndexSizeError", `arcTo radius ${r}`);
  }
  ellipse(x, y, rx, ry) {
    if (rx < 0 || ry < 0) throw new DOMError("IndexSizeError", `ellipse radius ${rx}, ${ry}`);
  }
  createLinearGradient(...v) {
    if (!finite(...v)) throw new TypeError(`createLinearGradient(${v.join(", ")})`);
    return gradient();
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    if (!finite(x0, y0, r0, x1, y1, r1)) throw new TypeError(`createRadialGradient with ${[x0, y0, r0, x1, y1, r1]}`);
    if (r0 < 0 || r1 < 0) throw new DOMError("IndexSizeError", `createRadialGradient radius ${r0}, ${r1}`);
    return gradient();
  }
  drawImage(img) {
    if (!img || !(img.width > 0) || !(img.height > 0)) {
      throw new DOMError("InvalidStateError", `drawImage of an image ${img && img.width} × ${img && img.height}`);
    }
  }
  measureText(text) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return { width: String(text).length * (m ? Number(m[1]) : 10) * 0.56 };
  }
}
for (const name of [
  "save",
  "restore",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "quadraticCurveTo",
  "bezierCurveTo",
  "rect",
  "fill",
  "stroke",
  "clip",
  "fillRect",
  "clearRect",
  "strokeRect",
  "fillText",
  "strokeText",
  "translate",
  "scale",
  "rotate",
  "transform",
  "setTransform",
  "setLineDash",
]) {
  StrictContext.prototype[name] = function () {};
}
function gradient() {
  return {
    addColorStop(offset) {
      if (!(offset >= 0 && offset <= 1)) throw new DOMError("IndexSizeError", `addColorStop(${offset})`);
    },
  };
}

class StrictCanvas {
  constructor(w = 300, h = 150) {
    this._w = w;
    this._h = h;
    this.style = {};
    this.box = { left: 0, top: 0, width: w, height: h };
    this.ctx = new StrictContext(this);
  }
  set width(v) {
    if (!(v >= 0) || !Number.isInteger(v)) problems.push(`a canvas width was set to ${v}`);
    this._w = v;
  }
  get width() {
    return this._w;
  }
  set height(v) {
    if (!(v >= 0) || !Number.isInteger(v)) problems.push(`a canvas height was set to ${v}`);
    this._h = v;
  }
  get height() {
    return this._h;
  }
  getContext() {
    return this.ctx;
  }
  getBoundingClientRect() {
    return this.box;
  }
}

globalThis.OffscreenCanvas = undefined;
globalThis.document = { createElement: () => new StrictCanvas() };
globalThis.window = { devicePixelRatio: 2 };

const { paintTile, paintBead, glowSprite, createTileCache, GLAZES, BEAD_COLORS } =
  await import("../package/js/render/sprites.mjs");
const { createLogo } = await import("../package/js/ui/logo.mjs");
const { createRenderer } = await import("../package/js/render/renderer.mjs");
const G = await import("../package/js/game/game.mjs");
const { LEVELS } = await import("../package/js/game/levels.mjs");

const attempt = (what, fn) => {
  try {
    fn();
  } catch (e) {
    problems.push(`${what}: ${e.message}`);
  }
};

const SIZES = [0, 1, 2, 3, -5, NaN, 40];
const SCALES = [0, 0.01, -1, NaN, 1, 2.5];
const KINDS = [
  ["glaze", "b", 1, 1],
  ["glaze", "o", 2, 2],
  ["glaze", "o", 1, 2],
  ["lustre", "lustre", 3, 3],
  ["ember", "ember", 1, 1],
  ["gift", "gift", 1, 1],
  ["iron", "iron", 0, 0],
];
for (const [kind, glaze, hits, max] of KINDS) {
  for (const w of SIZES) {
    for (const h of SIZES) {
      for (const s of SCALES) {
        attempt(`paintTile ${kind} ${w} × ${h} at ${s}`, () =>
          paintTile(new StrictContext(), w, h, s, kind, GLAZES[glaze] || GLAZES.w, hits, max),
        );
      }
    }
  }
}
for (const type of Object.keys(BEAD_COLORS)) {
  for (const w of SIZES) attempt(`paintBead ${type} ${w}`, () => paintBead(new StrictContext(), type, w, w / 2));
}
for (const size of [0, -1, 1, NaN, 64]) attempt(`glowSprite ${size}`, () => glowSprite("#FF8A2A", size));
const cache = createTileCache();
for (const w of SIZES) {
  attempt(`tile cache ${w}`, () => {
    const img = cache.get("glaze", "a", 1, 1, w, w, 1);
    new StrictContext().drawImage(img);
  });
}

// The start screen's picture on panels of any size, laid out and drawn twice (as after a resize).
for (const [w, h] of [
  [0, 0],
  [1, 1],
  [10, 5],
  [360, 0],
  [0, 175],
  [358, 120],
  [358, 175],
  [700, 110],
]) {
  attempt(`logo ${w} × ${h}`, () => {
    const c = new StrictCanvas(w, h);
    const logo = createLogo(c);
    logo.layout();
    logo.draw(1.5, false);
    logo.draw(3, true);
  });
}

// The arena: a frame of a level in play (with every effect started) on canvases of any size.
const level = LEVELS.find((l) => l.id === "3-12");
const game = G.createGame({ def: level, speed: 300, seed: 3, power: G.POWERS, drop: 1, lives: 3 });
G.launch(game);
for (let i = 0; i < 600; i++) {
  G.setPaddle(game, game.balls[0] ? game.balls[0].x : 180);
  G.step(game);
  if (game.phase === "ready") G.launch(game);
}
for (const k of Object.keys(game.timers)) game.timers[k] = 5;
const events = G.drainEvents(game);
// Every kind of effect, whatever happened in those five seconds.
for (const type of ["break", "tough", "iron", "burst", "paddle", "catch", "guard", "power", "lost", "over", "clear"]) {
  events.push({
    type,
    x: 120,
    y: 140,
    brick: 3,
    glaze: "a",
    kind: "glaze",
    points: 40,
    mult: 4,
    combo: 16,
    power: "multi",
  });
}
const labels = { combo: (p, m) => `+${p} ×${m}`, power: (t) => t };
for (const [w, h] of [
  [0, 0],
  [1, 1],
  [360, 0],
  [5, 9],
  [216, 360],
  [378, 630],
]) {
  attempt(`arena ${w} × ${h}`, () => {
    const c = new StrictCanvas(1, 1);
    const r = createRenderer(c);
    r.resize(w, h, 2);
    for (const ev of events.slice(0, 200)) r.event(ev, game, labels);
    r.showBanner("Crucible", "Level 3-12");
    r.draw(game, 1 / 60, { aim: true, hint: "Lift your finger to launch", textScale: 2, font: "system-ui" });
    r.draw(game, 1 / 60, { aim: false, hint: "", textScale: 1, font: "system-ui" });
  });
}

if (problems.length) {
  console.error(problems.slice(0, 30).join("\n"));
  console.error(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`sprites: ok (${events.length} events drawn on canvases from 0 × 0 up)`);
