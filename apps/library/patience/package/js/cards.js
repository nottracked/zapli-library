// Card faces, card shapes, card sizes, card backs and tables, shared by the card games. Nothing here knows a game's
// rules: a game builds its cards with buildCard(), sizes them with cardGeo() and lays them out itself.
//
// The faces carry no text: ranks, suits and court emblems are drawn shapes (the symbols in index.html), so the
// phone's text size never pushes them out of a card. Suits are 0-3 (spades, hearts, clubs, diamonds), ranks 1-13.

export const SVG_NS = "http://www.w3.org/2000/svg";

export const SIZES = ["normal", "large", "largest"];
export const SHAPE_IDS = ["rect", "heart", "lace", "ticket", "pebble", "flower"];
export const BACK_IDS = ["stripes", "hearts", "flowers", "stars", "checks", "waves", "zigzag", "contrast"];
export const TABLE_IDS = ["felt", "seed", "blue", "wine", "grey", "black"];

export function svgUse(symbol, cls) {
  const svg = document.createElementNS(SVG_NS, "svg");
  if (cls) svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${symbol}`);
  svg.appendChild(use);
  return svg;
}

// One card: the edge (used by the card shapes), the rank and suit in the top band, then one big suit (or a court
// emblem).
export function buildCard(suit, rank) {
  const el = document.createElement("div");
  el.className = `card s${suit} r${rank}${rank === 1 ? " ace" : ""}${rank > 10 ? " court" : ""}`;
  const edge = document.createElementNS(SVG_NS, "svg");
  edge.setAttribute("class", "edge");
  edge.setAttribute("aria-hidden", "true");
  edge.setAttribute("focusable", "false");
  for (const cls of ["e1", "e2"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", cls);
    edge.appendChild(path);
  }
  el.append(
    edge,
    svgUse(`rank-${rank}`, "rk"),
    svgUse(`suit-${suit}`, "sg"),
    svgUse(rank > 10 ? `emb-${rank}` : `suit-${suit}`, "bd"),
  );
  return el;
}

// Gives an existing card element another face (a game whose suits change from one deal to the next).
export function setFace(el, suit, rank) {
  el.classList.remove("s0", "s1", "s2", "s3");
  el.classList.add(`s${suit}`);
  el.querySelector(".sg use").setAttribute("href", `#suit-${suit}`);
  if (rank <= 10) el.querySelector(".bd use").setAttribute("href", `#suit-${suit}`);
}

// ---- card shapes: outlines as SVG paths in px for a w × h card. Each keeps the index band inside;
// the band is placed (and, where a shape needs it, made a little smaller) by measuring the path.
export const Shapes = (() => {
  const f1 = (n) => Math.round(n * 10) / 10;

  // flat (0-1) makes the dip shallower and the lobes squarer.
  function heart(w, h, flat) {
    const m = w / 2;
    const d = w * (0.09 - 0.05 * flat);
    const L = w * (0.22 - 0.1 * flat);
    const lo = h - L;
    return [
      `M${f1(m)} ${f1(d)}`,
      `C${f1(m)} ${f1(d * 0.3)} ${f1(w * 0.37)} 0 ${f1(w * 0.25)} 0`,
      `C${f1(w * 0.1)} 0 0 ${f1(L * 0.4)} 0 ${f1(L)}`,
      `C0 ${f1(L + lo * 0.45)} ${f1(m - w * 0.1)} ${f1(h - lo * 0.18)} ${f1(m)} ${f1(h)}`,
      `C${f1(m + w * 0.1)} ${f1(h - lo * 0.18)} ${f1(w)} ${f1(L + lo * 0.45)} ${f1(w)} ${f1(L)}`,
      `C${f1(w)} ${f1(L * 0.4)} ${f1(w * 0.9)} 0 ${f1(w * 0.75)} 0`,
      `C${f1(w * 0.63)} 0 ${f1(m)} ${f1(d * 0.3)} ${f1(m)} ${f1(d)}Z`,
    ].join("");
  }

  // Notched corners and a notch halfway down each side.
  function ticket(w, h) {
    const n = f1(w * 0.16);
    const k = f1(w * 0.1);
    const a = f1(h / 2 - k);
    const b = f1(h / 2 + k);
    return (
      `M${n} 0H${f1(w - n)}A${n} ${n} 0 0 0 ${w} ${n}V${a}A${k} ${k} 0 0 0 ${w} ${b}` +
      `V${f1(h - n)}A${n} ${n} 0 0 0 ${f1(w - n)} ${h}H${n}A${n} ${n} 0 0 0 0 ${f1(h - n)}` +
      `V${b}A${k} ${k} 0 0 0 0 ${a}V${n}A${n} ${n} 0 0 0 ${n} 0Z`
    );
  }

  // A very round superellipse.
  function pebble(w, h) {
    const pts = [];
    const a = w / 2;
    const b = h / 2;
    const e = 2 / 3.6;
    for (let i = 0; i < 72; i++) {
      const th = (i / 72) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = a + a * Math.sign(c) * Math.abs(c) ** e;
      const y = b + b * Math.sign(s) * Math.abs(s) ** e;
      pts.push(`${f1(x)} ${f1(y)}`);
    }
    return `M${pts.join("L")}Z`;
  }

  // A rounded rectangle, inset by `amp`, whose edge bulges out in round waves: about `perShort`
  // waves along a short side, a dip at the top centre.
  function wavy(w, h, amp, radius, perShort) {
    const x0 = amp;
    const y0 = amp;
    const x1 = w - amp;
    const y1 = h - amp;
    const R = Math.min(radius, (x1 - x0) / 2);
    const sw = x1 - x0 - 2 * R;
    const sh = y1 - y0 - 2 * R;
    const arc = (Math.PI * R) / 2;
    const P = 2 * sw + 2 * sh + 4 * arc;
    const corner = (cx, cy, a0) => (t) => {
      const a = a0 + t / R;
      return [cx + R * Math.cos(a), cy + R * Math.sin(a), Math.cos(a), Math.sin(a)];
    };
    const segs = [
      { len: sw / 2, at: (t) => [x0 + R + sw / 2 + t, y0, 0, -1] },
      { len: arc, at: corner(x1 - R, y0 + R, -Math.PI / 2) },
      { len: sh, at: (t) => [x1, y0 + R + t, 1, 0] },
      { len: arc, at: corner(x1 - R, y1 - R, 0) },
      { len: sw, at: (t) => [x1 - R - t, y1, 0, 1] },
      { len: arc, at: corner(x0 + R, y1 - R, Math.PI / 2) },
      { len: sh, at: (t) => [x0, y1 - R - t, -1, 0] },
      { len: arc, at: corner(x0 + R, y0 + R, Math.PI) },
      { len: sw / 2, at: (t) => [x0 + R + t, y0, 0, -1] },
    ];
    let N = Math.max(4, Math.round((P / (x1 - x0)) * perShort));
    if (N % 2) N += 1;
    const per = P / N;
    const M = N * 10;
    const pts = [];
    for (let i = 0; i < M; i++) {
      let s = (i / M) * P;
      let seg = 0;
      while (seg < segs.length - 1 && s > segs[seg].len) {
        s -= segs[seg].len;
        seg += 1;
      }
      const [x, y, nx, ny] = segs[seg].at(s);
      const f = amp * Math.sin(Math.PI * ((((i / M) * P) / per) % 1));
      pts.push(`${f1(x + nx * f)} ${f1(y + ny * f)}`);
    }
    return `M${pts.join("L")}Z`;
  }

  const PATHS = {
    heart: (w, h, flat) => heart(w, h, flat),
    lace: (w, h) => wavy(w, h, w * 0.055, w * 0.12, 4.5),
    ticket: (w, h) => ticket(w, h),
    pebble: (w, h) => pebble(w, h),
    flower: (w, h) => wavy(w, h, w * 0.1, w * 0.3, 2),
  };

  let ctx = null;
  function inside(path, x, y) {
    if (!ctx) ctx = document.createElement("canvas").getContext("2d");
    return ctx.isPointInPath(path, x, y);
  }
  // Whether the box, grown by m on every side, lies inside the path (its edges are sampled).
  // The corners first (they fail most often), the card's centre line (a heart's sharp dip), then
  // every 1.5 px along the edges.
  let centre = 0;
  function boxIn(path, x0, y0, x1, y1, m) {
    const l = x0 - m;
    const r = x1 + m;
    const t0 = y0 - m;
    const b = y1 + m;
    if (!inside(path, l, t0) || !inside(path, r, t0) || !inside(path, l, b) || !inside(path, r, b)) return false;
    if (centre > l && centre < r && (!inside(path, centre, t0) || !inside(path, centre, b))) return false;
    for (let x = l + 1.5; x < r; x += 1.5) if (!inside(path, x, t0) || !inside(path, x, b)) return false;
    for (let y = t0 + 1.5; y < b; y += 1.5) if (!inside(path, l, y) || !inside(path, r, y)) return false;
    return true;
  }

  // The band (a rank rw × gh at the left, a suit sg × sg at the right, top-aligned) as high and
  // as far out as the outline allows, m px inside it; null when it does not fit.
  function fitBand(path, w, rw, gh, sg, pad, m) {
    for (let bt = pad; bt <= pad + gh * 0.5; bt += 1) {
      let bl = -1;
      for (let x = pad; x + rw <= w / 2 + rw * 0.6; x += 1)
        if (boxIn(path, x, bt, x + rw, bt + gh, m)) {
          bl = x;
          break;
        }
      if (bl < 0) continue;
      let br = -1;
      for (let x = pad; w - x - sg >= w / 2 - sg * 0.6; x += 1)
        if (boxIn(path, w - x - sg, bt, w - x, bt + sg, m)) {
          br = x;
          break;
        }
      if (br >= 0 && bl + rw + 2 <= w - br - sg) return { bt, bl, br };
    }
    return null;
  }

  // How far down the outline starts at x (the dip of a heart, a flower's valley).
  function topAt(path, x, h) {
    for (let y = 0; y < h / 2; y += 0.5) if (inside(path, x, y)) return y;
    return h / 2;
  }

  // The largest square, centred, between `top` and the bottom of the card.
  function fitBody(path, w, h, top, max, m) {
    for (let s = Math.floor(max); s >= 6; s -= 1)
      for (let y = top; y + s <= h - 1; y += 1) if (boxIn(path, (w - s) / 2, y, (w + s) / 2, y + s, m)) return { s, y };
    return null;
  }

  // The shape for a card of geometry g: its path and band, the band at full size if it fits,
  // else a little smaller (a heart also gets flatter); null when no band fits.
  const cache = new Map();
  function fit(id, g) {
    const key = `${id}:${g.cw}:${g.gh}:${g.sg}:${g.edge}:${g.pad}`;
    if (cache.has(key)) return cache.get(key);
    let out = null;
    const m = g.edge + 0.5;
    centre = g.cw / 2;
    for (const scale of [1, 0.92, 0.85, 0.78]) {
      const gh = Math.round(g.gh * scale);
      const sg = Math.round(g.sg * scale);
      for (const flat of id === "heart" ? [0, 0.5, 1] : [0]) {
        const d = PATHS[id](g.cw, g.ch, flat);
        const path = new Path2D(d);
        const band = fitBand(path, g.cw, Math.round(gh * 0.7), gh, sg, g.pad, m);
        if (!band) continue;
        const fu = band.bt + gh + Math.max(3, Math.round(gh * 0.12));
        let dip = 0;
        for (let x = g.cw * 0.25; x <= g.cw * 0.75; x += 1) dip = Math.max(dip, topAt(path, x, g.ch));
        const top = Math.ceil(fu + dip + 1);
        const body = fitBody(path, g.cw, g.ch, top, g.cw * 0.72, m) || { s: 0, y: top };
        // The widest rank (the 10) takes what room is left beside the suit, as far as the
        // outline allows.
        let rkmax = g.cw - band.bl - band.br - sg - 2;
        while (rkmax > Math.round(gh * 0.7) && !boxIn(path, band.bl, band.bt, band.bl + rkmax, band.bt + gh, m))
          rkmax -= 1;
        out = Object.assign({ d, gh, sg, scale, fu, body, rkmax }, band);
        break;
      }
      if (out) break;
    }
    cache.set(key, out);
    return out;
  }

  return { fit };
})();

// ---- geometry
// Each deck style's proportions per card size (Normal, Large, Largest): the rank's height and the suit's size as
// parts of the card width, the stroke of the drawn ranks, the corner radius and the big suit's size. Crisp is
// lighter: thinner ranks, smaller indices, rounder corners.
export const DECKS = {
  bold: { gh: [0.42, 0.52, 0.62], sg: [0.3, 0.32, 0.31], stroke: 18, radius: 0.08, body: 0.56 },
  crisp: { gh: [0.36, 0.45, 0.54], sg: [0.28, 0.3, 0.3], stroke: 13, radius: 0.1, body: 0.5 },
};

// The phone's text size, from a 100 px line (#tz-probe) that text zoom makes taller.
export function measureTextScale(probe) {
  const h = probe.getBoundingClientRect().height;
  return h > 20 ? Math.round((h / 100) * 100) / 100 : 1;
}

// Until the player picks a size, the phone's text size picks it.
export const autoSize = (textScale) => (textScale >= 1.6 ? "largest" : textScale >= 1.25 ? "large" : "normal");

// Everything inside a card of width cw: the band, the steps of a fanned column, the big suit. A card shape moves
// the band inward (see Shapes). `look` is {deck, contrast}.
export function cardGeo(cw, tier, shape, gap, look) {
  const id = look.deck === "crisp" ? "crisp" : "bold";
  const D = DECKS[id];
  const ch = Math.round(cw * 1.4);
  const pad = Math.max(2, Math.round(cw * 0.06));
  const sg = Math.round(cw * D.sg[tier]);
  // At the largest size the corner's rank and suit take all the width a card has: the rank grows until a common
  // rank (most are about 0.62 of their height wide) and the suit fill the band, at most three quarters of the card's
  // width high. The 10, the widest, is narrowed to fit (it is drawn to stretch). Narrow cards (ten columns on a phone
  // held upright) gain the most.
  const fill = Math.floor((cw - 2 * pad - sg - 2) / 0.62);
  const gh = Math.max(Math.round(cw * D.gh[tier]), tier === 2 ? Math.min(fill, Math.round(cw * 0.75)) : 0);
  const g = {
    tier,
    gap,
    cw,
    ch,
    pad,
    gh,
    sg,
    stroke: D.stroke,
    r: Math.max(3, Math.round(cw * D.radius)),
    edge: (cw >= 46 ? 2.5 : 2) + (look.contrast ? 1 : 0) - (id === "crisp" ? 0.5 : 0),
    fd: Math.max(4, Math.round(ch * 0.09)),
    fdMin: 3,
    shape: "rect",
    shapeScale: 1,
    clip: "",
  };
  const fit = shape && shape !== "rect" ? Shapes.fit(shape, g) : null;
  if (fit) {
    Object.assign(g, { shape, shapeScale: fit.scale, clip: fit.d, gh: fit.gh, sg: fit.sg });
    Object.assign(g, { bt: fit.bt, bl: fit.bl, br: fit.br, fu: fit.fu });
    g.rkmax = fit.rkmax;
    g.bodyT = fit.body.y;
    g.bodyH = fit.body.s;
    g.bsA = fit.body.s;
    g.bs = Math.round(Math.min(cw * D.body, fit.body.s));
    g.bsE = Math.round(Math.min(cw * 0.66, fit.body.s));
  } else {
    if (shape && shape !== "rect") g.shapeOff = shape;
    Object.assign(g, { bt: pad, bl: pad, br: pad });
    g.rkmax = cw - 2 * pad - sg - 2;
    g.fu = pad + gh + Math.max(3, Math.round(gh * 0.12));
    g.bodyT = g.fu + 1;
    g.bodyH = ch - g.bodyT - pad - 1;
    g.bs = Math.round(Math.min(cw * D.body, g.bodyH * 0.9));
    g.bsA = Math.round(Math.min(cw * 0.72, g.bodyH));
    g.bsE = Math.round(Math.min(cw * 0.66, g.bodyH * 0.95));
  }
  // Steps in a fanned column: a full band, a squeezed band (the suit and most of the rank), the least it may shrink
  // to.
  g.fs = g.bt + Math.ceil(g.gh * 0.62) + 1;
  g.fsMin = Math.min(g.fs, g.bt + Math.max(Math.ceil(g.gh * 0.45), 10) + 1);
  return g;
}

// The card variables on a table or a preview box, and the outline of every card in it.
export function applyGeo(el, g, cards) {
  const px = (n) => `${n}px`;
  const vars = {
    "--cw": px(g.cw),
    "--ch": px(g.ch),
    "--r": px(g.r),
    "--gh": px(g.gh),
    "--fu": px(g.fu),
    "--sg": px(g.sg),
    "--bt": px(g.bt),
    "--bl": px(g.bl),
    "--br": px(g.br),
    "--rkmax": px(g.rkmax),
    "--bodyT": px(g.bodyT),
    "--bodyH": px(g.bodyH),
    "--bs": px(g.bs),
    "--bsA": px(g.bsA),
    "--bsE": px(g.bsE),
    "--edge-w": px(g.edge),
    "--stroke": String(g.stroke),
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  const shaped = g.shape !== "rect";
  el.classList.toggle("shaped", shaped);
  if (shaped) el.style.setProperty("--clip", `path("${g.clip}")`);
  else el.style.removeProperty("--clip");
  (cards || el.querySelectorAll(".card")).forEach((c) => {
    c.querySelectorAll(".edge path").forEach((p) => {
      if (shaped) p.setAttribute("d", g.clip);
      else p.removeAttribute("d");
    });
  });
}

export function setPos(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// The steps of one column so it fits `avail` px: first the face-down cards closer together, then the older face-up
// cards squeezed (the last three keep their full band), then squeezed further, and only as a last resort every band
// evenly. The bottom card always shows whole.
export function fanSteps(g, nDown, nUp, avail) {
  const up = new Array(Math.max(0, nUp - 1)).fill(g.fu);
  let fd = g.fd;
  const total = () => nDown * fd + up.reduce((a, b) => a + b, 0) + g.ch;
  if (total() <= avail) return { fd, up };
  if (nDown) fd = Math.max(g.fdMin, Math.min(fd, Math.floor((avail - total() + nDown * fd) / nDown)));
  const squeezable = Math.max(0, nUp - 3);
  for (let k = 0; k < squeezable && total() > avail; k++) up[k] = g.fs;
  if (total() > avail && squeezable) {
    const rest = avail - g.ch - nDown * fd - (up.length - squeezable) * g.fu;
    const s = Math.max(g.fsMin, Math.floor(rest / squeezable));
    for (let k = 0; k < squeezable; k++) up[k] = Math.min(up[k], s);
  }
  if (total() > avail && up.length) {
    const s = Math.max(2, Math.floor((avail - g.ch - nDown * fd) / up.length));
    for (let k = 0; k < up.length; k++) up[k] = Math.min(up[k], s);
  }
  return { fd, up };
}

// A covered card whose strip is shorter than the full band shows a smaller but complete band, never a rank cut in
// half.
export function fitBand(el, g, strip) {
  if (!strip || strip >= g.fu) {
    if (el.classList.contains("sq")) {
      el.classList.remove("sq");
      el.style.removeProperty("--gh");
      el.style.removeProperty("--sg");
    }
    return;
  }
  const gh = Math.max(8, Math.min(g.gh, strip - g.bt - 2));
  el.classList.add("sq");
  el.style.setProperty("--gh", `${gh}px`);
  el.style.setProperty("--sg", `${Math.min(g.sg, gh)}px`);
}

// ---- tables: colours set on the page (and on each preview), light and dark.
export const TABLES = {
  felt: { light: "#2c6b57", dark: "#163a2f", shade: true },
  seed: { light: "#22493e", dark: "#132d26", mix: [84, 30] },
  blue: { light: "#1f3f6b", dark: "#142a48", shade: true },
  wine: { light: "#5a1f2b", dark: "#3b141c", shade: true },
  grey: { light: "#d9d9d3", dark: "#9a9c96", slot: "rgba(0, 0, 0, 0.6)" },
  black: { light: "#050605", dark: "#000000", slot: "#ffffff" },
};

let colorMix = false;
try {
  colorMix = !!(window.CSS && CSS.supports("color", "color-mix(in srgb, red 50%, blue)"));
} catch (e) {
  colorMix = false;
}

export function paintTable(el, id, dark) {
  const tb = TABLES[id] || TABLES.felt;
  let felt = dark ? tb.dark : tb.light;
  // The app colour follows Zapli's colour for this app, where the browser can mix colours.
  if (tb.mix && colorMix)
    felt = `color-mix(in srgb, var(--zapli-color-primary, ${tb.light}) ${tb.mix[dark ? 1 : 0]}%, #000)`;
  el.style.setProperty("--felt", felt);
  el.style.setProperty("--felt-shade", tb.shade ? `rgba(0, 0, 0, ${dark ? 0.45 : 0.3})` : "transparent");
  if (tb.slot) el.style.setProperty("--slot", tb.slot);
  else el.style.removeProperty("--slot");
}

// A small table with cards on it, drawn with geometry g: `cards` is a list of [suit, rank, faceDown, x, y]; `look`
// is {back, deck, table, dark}. `extra` may add empty places ([x, y, mark rank or 0]) and arrows ([x1, y1, x2, y2]),
// as the guide's pictures of the rules use them.
export function previewBox(g, cards, look, extra = {}) {
  const pad = 6;
  const pv = document.createElement("div");
  pv.className = `pv bk-${look.back} deck-${look.deck}`;
  let w = 0;
  let h = 0;
  const grow = (x, y, ww, hh) => {
    w = Math.max(w, x + ww);
    h = Math.max(h, y + hh);
  };
  (extra.slots || []).forEach(([x, y, mark]) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (mark) slot.appendChild(svgUse(`rank-${mark}`, `r${mark}`));
    setPos(slot, pad + x, pad + y);
    grow(x, y, g.cw, g.ch);
    pv.appendChild(slot);
  });
  const els = cards.map(([suit, rank, down, x, y]) => {
    const c = buildCard(suit, rank);
    c.classList.toggle("down", !!down);
    setPos(c, pad + x, pad + y);
    grow(x, y, g.cw, g.ch);
    pv.appendChild(c);
    return c;
  });
  applyGeo(pv, g, els);
  paintTable(pv, look.table, look.dark);
  pv.style.width = `${w + 2 * pad}px`;
  pv.style.height = `${h + 2 * pad}px`;
  if (extra.arrows && extra.arrows.length) {
    // Each arrow twice: a dark outline under a bright line, so it reads on every table.
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "arrows");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", String(w + 2 * pad));
    svg.setAttribute("height", String(h + 2 * pad));
    for (const [x1, y1, x2, y2] of extra.arrows) {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const head = (turn) => `${pad + x2 + 9 * Math.cos(a + turn)} ${pad + y2 + 9 * Math.sin(a + turn)}`;
      const d = `M${pad + x1} ${pad + y1}L${pad + x2} ${pad + y2}M${head(2.5)}L${pad + x2} ${pad + y2}L${head(-2.5)}`;
      for (const cls of ["o", "a"]) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", cls);
        path.setAttribute("d", d);
        svg.appendChild(path);
      }
    }
    pv.appendChild(svg);
  }
  return pv;
}
