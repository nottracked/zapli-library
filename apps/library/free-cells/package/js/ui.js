// Free Cells: the page. It draws the table, takes taps, drags and keys, keeps the game, the settings and the
// statistics, and asks the solver's worker whether the position can still be won.
import * as Rules from "./rules.js";
import { createSearch } from "./solver.js";
import {
  SIZES,
  SHAPE_IDS,
  BACK_IDS,
  TABLE_IDS,
  svgUse,
  buildCard,
  cardGeo,
  applyGeo,
  setPos,
  fanSteps,
  fitBand,
  paintTable,
  previewBox,
  measureTextScale,
  autoSize,
} from "./cards.js";
import { t, tn, cap, setLang } from "./i18n.js";
import { createStore } from "./store.js";
import {
  todayKey,
  formatTime,
  formatRate,
  formatDay,
  formatNumber,
  openDialog,
  closeDialog,
  focusTarget,
  wireDialogs,
  fitSegs,
  fitTiles,
  wireTabs,
  tile,
  buildCalendar,
  lastMonth,
} from "./dialogs.js";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const table = $("table");
const host = window.zapli; // undefined in a browser or a chat preview
const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const motionOK = () => !(motionQuery && motionQuery.matches);
const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

const Store = createStore("free-cells", ["settings", "stats", "game", "progress"]);

// ---- settings and statistics
const prefersMoreContrast = () => !!(window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches);

// Known fields are checked; fields this version does not know are kept for later versions.
function normSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const out = Object.assign({}, s);
  delete out.none;
  delete out.at;
  return Object.assign(out, {
    size: SIZES.includes(s.size) ? s.size : null,
    // Red and black by default: the colour carries the rule (red on black).
    four: s.four === true,
    contrast: typeof s.contrast === "boolean" ? s.contrast : prefersMoreContrast(),
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : "device",
    cellsRight: s.cellsRight === true,
    autoPlay: s.autoPlay !== false,
    tapMode: s.tapMode === "send" ? "send" : "select",
    shape: SHAPE_IDS.includes(s.shape) ? s.shape : "rect",
    back: BACK_IDS.includes(s.back) ? s.back : "stripes",
    table: TABLE_IDS.includes(s.table) ? s.table : "felt",
    lang: s.lang === "sk" || s.lang === "en" ? s.lang : "auto",
    deck: s.deck === "crisp" ? "crisp" : "bold",
    hints: s.hints !== false,
    autoFinish: s.autoFinish !== false,
    // Off by default: lighting up where a held card can go would give every move away.
    showTargets: s.showTargets === true,
    clock: s.clock === true,
    light: s.light !== false,
  });
}

// The daily deals won, by date.
function normProgress(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const out = Object.assign({}, p);
  delete out.none;
  delete out.at;
  out.daily = p.daily && typeof p.daily === "object" ? Object.assign({}, p.daily) : {};
  return out;
}

const blankStats = () => ({ played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: null, fewestMoves: null });

function normStats(raw) {
  const v = raw && typeof raw === "object" ? raw : {};
  const b = blankStats();
  for (const k of Object.keys(b)) if (typeof v[k] === "number" && Number.isFinite(v[k]) && v[k] >= 0) b[k] = v[k];
  return b;
}

// ---- page state
Store.loadLocal();
let settings = normSettings(Store.get("settings"));
let stats = normStats(Store.get("stats"));
let progress = normProgress(Store.get("progress"));
let game = null;
let geo = null;
let textScale = 1;
let where = [];
let drag = null;
let busy = false;
let finishPlan = null;
let runningSince = null;
let ticker = null;
let ticks = 0;
let lastTapMove = null;
let lastPointerUp = 0;
let noticeTimer = null;
let noticeKind = "";
let autoFinishTimer = null;
let appliedTheme = null;
let hostPaused = false;

const isDark = () => settings.theme === "dark" || (settings.theme === "device" && !!(darkQuery && darkQuery.matches));
const look = (over) =>
  Object.assign(
    { back: settings.back, deck: settings.deck, table: settings.table, dark: isDark(), contrast: settings.contrast },
    over || {},
  );

// ---- the table's piles and cards
function makePile(kind, i, mark) {
  const el = document.createElement("div");
  el.className = `pile ${kind}`;
  el.dataset.pile = kind;
  if (i !== undefined) el.dataset.i = String(i);
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.setAttribute("aria-hidden", "true");
  if (mark) slot.appendChild(svgUse(mark, "mark-suit"));
  el.appendChild(slot);
  table.appendChild(el);
  return el;
}

// Where a picked-up or dragged card may go is drawn here, under the piles.
const marksLayer = document.createElement("div");
marksLayer.className = "marks";
marksLayer.setAttribute("aria-hidden", "true");
table.appendChild(marksLayer);

const pileEls = {
  cell: [0, 1, 2, 3].map((i) => makePile("cell", i)),
  found: [0, 1, 2, 3].map((i) => makePile("found", i, `suit-${i}`)),
  tab: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => makePile("tab", i)),
};
pileEls.found.forEach((el) => {
  el.setAttribute("role", "button");
  el.tabIndex = 0;
});

const cardEls = [];
for (let id = 0; id < 52; id++) {
  const el = buildCard(Rules.suitOf(id), Rules.rankOf(id));
  el.dataset.id = String(id);
  cardEls.push(el);
}

const cardName = (card) =>
  t("card", {
    r: Rules.rankOf(card),
    s: Rules.suitOf(card),
    rank: t("ranks")[Rules.rankOf(card)],
    suit: t("suits")[Rules.suitOf(card)],
  });

// ---- layout
const currentSize = () => settings.size || autoSize(textScale);

// The classic table's margins, gaps and the card widths its width and its height allow.
function classicSizes(W, H, tier) {
  const side = [12, 6, 3][tier];
  const gap = tier === 0 ? Math.max(3, Math.min(10, Math.round(W * 0.012))) : [0, 3, 2][tier];
  const rowGap = tier === 0 ? Math.max(10, Math.round(gap * 2.5)) : 8;
  const byWidth = Math.floor((W - 2 * side - 7 * gap) / 8);
  const byHeight = Math.floor((H - rowGap - 4) / 2.8 / 1.4);
  return { side, gap, rowGap, byWidth, byHeight };
}

// Classic: the free cells and the foundations in a row above eight columns sized from the width (capped so the
// columns keep room). Larger sizes trade margins and gaps for card width. Side rails (a wide, low table, such as a
// phone held sideways): the free cells in a rail at one side and the foundations at the other, each showing its band,
// so the eight columns get the whole height.
function measure(W, H, size, shape, deck) {
  const tier = Math.max(0, SIZES.indexOf(size));
  const right = settings.cellsRight;
  const lk = look(deck ? { deck } : null);
  const classic = classicSizes(W, H, tier);
  if (W > H * 1.3 && classic.byHeight < 0.9 * Math.min(112, classic.byWidth)) {
    const side = [10, 6, 4][tier];
    const gap = [6, 4, 3][tier];
    const rail = [12, 8, 6][tier];
    let g = null;
    for (let cw = Math.min(112, Math.floor((W - 2 * side - 2 * rail - 9 * gap) / 10)); cw >= 26; cw--) {
      g = cardGeo(cw, tier, shape, gap, lk);
      const railH = 3 * g.fu + g.ch;
      const column = 4 * g.fs + 2 * g.fu + g.ch;
      if (railH <= H && column <= H) break;
    }
    const used = 10 * g.cw + 7 * gap + 2 * rail;
    const x0 = Math.max(0, Math.round((W - used) / 2));
    const tabX = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => x0 + g.cw + rail + i * (g.cw + gap));
    const rightX = tabX[7] + g.cw + rail;
    const [cellX, foundX] = right ? [rightX, x0] : [x0, rightX];
    return Object.assign(g, {
      W,
      H,
      size,
      land: true,
      pos: {
        cell: [0, 1, 2, 3].map((i) => [cellX, i * g.fu]),
        found: [0, 1, 2, 3].map((i) => [foundX, i * g.fu]),
        tab: tabX.map((x) => [x, 0]),
      },
      avail: H - 2,
    });
  }
  const { gap, rowGap, byWidth, byHeight } = classic;
  const g = cardGeo(Math.max(26, Math.min(112, byWidth, byHeight)), tier, shape, gap, lk);
  const left = Math.max(0, Math.round((W - (8 * g.cw + 7 * gap)) / 2));
  const colX = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => left + i * (g.cw + gap));
  const tabY = g.ch + rowGap;
  return Object.assign(g, {
    W,
    H,
    size,
    land: false,
    pos: {
      cell: [0, 1, 2, 3].map((i) => [colX[(right ? 4 : 0) + i], 0]),
      found: [0, 1, 2, 3].map((i) => [colX[(right ? 0 : 4) + i], 0]),
      tab: colX.map((x) => [x, tabY]),
    },
    avail: H - tabY - 2,
  });
}

// In the landscape band, icons only when the words do not fit; in a narrow header, the deal number steps aside (it
// stays in the settings and in the deal dialog).
function fitBands() {
  root.classList.remove("compact", "tight");
  const top = document.querySelector(".top");
  const bar = document.querySelector(".toolbar");
  const over = (el) => el.scrollWidth > el.clientWidth + 1;
  if (window.matchMedia && window.matchMedia("(orientation: landscape) and (max-height: 540px)").matches)
    root.classList.toggle("compact", over(top) || over(bar));
  root.classList.toggle("tight", over(top));
}

function applyLayout() {
  fitBands();
  textScale = measureTextScale($("tz-probe"));
  root.style.setProperty("--tz", String(textScale));
  geo = measure(table.clientWidth, table.clientHeight, currentSize(), settings.shape);
  applyGeo(table, geo, cardEls);
  table.classList.toggle("rails", geo.land);
  BACK_IDS.forEach((b) => table.classList.toggle(`bk-${b}`, b === settings.back));
  const P = geo.pos;
  pileEls.cell.forEach((el, i) => setPos(el, ...P.cell[i]));
  pileEls.found.forEach((el, i) => setPos(el, ...P.found[i]));
  pileEls.tab.forEach((el, i) => setPos(el, ...P.tab[i]));
}

// ---- drawing the position
function place(card, pileEl, j, y, loc, strip) {
  const el = cardEls[card];
  const want = pileEl.children[j + 1];
  if (want !== el) pileEl.insertBefore(el, want || null);
  setPos(el, 0, y);
  el.classList.remove("down", "top");
  fitBand(el, geo, strip);
  where[card] = Object.assign(loc, { y });
  const interactive = loc.pile !== "found";
  if (interactive) {
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", cap(cardName(card)));
    el.removeAttribute("aria-hidden");
  } else {
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
    el.removeAttribute("aria-label");
    el.setAttribute("aria-hidden", "true");
  }
}

function clearDragMarks() {
  cardEls.forEach((el) => {
    el.style.transform = "";
    el.classList.remove("lifted");
  });
  table.querySelectorAll(".raised").forEach((el) => el.classList.remove("raised"));
}

function render(opts = {}) {
  const s = game.state;
  const animate = opts.animate !== false && motionOK() && typeof cardEls[0].animate === "function";
  const before = animate ? cardEls.map((el) => el.getBoundingClientRect()) : null;
  const active = document.activeElement;
  const focusId = active && active.classList && active.classList.contains("card") ? Number(active.dataset.id) : -1;
  clearDragMarks();
  if (!opts.keepMarks) clearHint();
  where = new Array(52);
  s.cells.forEach((c, i) => {
    if (c >= 0) place(c, pileEls.cell[i], 0, 0, { pile: "cell", i, top: true });
  });
  s.found.forEach((r, i) => {
    for (let k = 1; k <= r; k++)
      place(Rules.cardOf(i, k), pileEls.found[i], k - 1, 0, { pile: "found", i, top: k === r });
  });
  s.cols.forEach((col, i) => {
    const steps = fanSteps(geo, 0, col.length, geo.avail);
    let y = 0;
    col.forEach((c, k) => {
      place(c, pileEls.tab[i], k, y, { pile: "tab", i, k }, steps.up[k]);
      y += steps.up[k] || 0;
    });
  });
  // Cards that left a pile are removed from its element by insertBefore elsewhere; nothing else to clear.
  describePiles();
  if (selection) showTargets(selection.src);
  if (animate) animateFrom(before, opts.deal);
  if (focusId >= 0) {
    const el = cardEls[focusId];
    if (el.getAttribute("tabindex") === "0" && document.activeElement !== el) el.focus({ preventScroll: true });
  }
  updateStatus();
  updateControls();
}

function describePiles() {
  const s = game.state;
  [...pileEls.cell, ...pileEls.found, ...pileEls.tab].forEach((el) => {
    const cards = el.querySelectorAll(".card");
    el.classList.toggle("empty", cards.length === 0);
    if (cards.length) cards[cards.length - 1].classList.add("top");
    if (el.dataset.pile === "found") return;
    el.setAttribute("role", cards.length ? "group" : "button");
    if (cards.length) el.removeAttribute("tabindex");
    else el.tabIndex = 0;
  });
  s.cells.forEach((c, i) => {
    pileEls.cell[i].setAttribute(
      "aria-label",
      c >= 0 ? t("cellLabel", { i: i + 1, card: cardName(c) }) : t("cellEmptyLabel", { i: i + 1 }),
    );
  });
  s.found.forEach((r, i) => {
    const top = Rules.cardOf(i, r);
    pileEls.found[i].setAttribute(
      "aria-label",
      r
        ? t("foundLabel", { suit: t("suits")[i], rank: t("ranks")[r], card: cardName(top) })
        : t("foundEmptyLabel", { suit: t("suits")[i] }),
    );
  });
  s.cols.forEach((col, i) => {
    pileEls.tab[i].setAttribute(
      "aria-label",
      col.length
        ? t("columnLabel", { i: i + 1, cards: col.map(cardName).join(", ") })
        : t("columnEmptyLabel", { i: i + 1 }),
    );
  });
}

function animateFrom(before, dealing) {
  const counts = new Map();
  const tr = table.getBoundingClientRect();
  const origin = { left: tr.left + tr.width / 2 - geo.cw / 2, top: tr.top + geo.ch };
  cardEls.forEach((el, id) => {
    if (typeof el.getAnimations === "function") el.getAnimations().forEach((a) => a.cancel());
    const after = el.getBoundingClientRect();
    const from = dealing ? origin : before[id];
    const dx = Math.round(from.left - after.left);
    const dy = Math.round(from.top - after.top);
    if (!dx && !dy) return;
    const pile = el.parentNode;
    const loc = where[id];
    const anim = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], {
      duration: dealing ? 260 : Math.min(340, 150 + Math.hypot(dx, dy) * 0.35),
      delay: dealing && loc && loc.pile === "tab" ? (loc.k * 8 + loc.i) * 12 : 0,
      easing: "cubic-bezier(.25,.8,.3,1)",
      fill: "backwards",
    });
    pile.classList.add("moving");
    counts.set(pile, (counts.get(pile) || 0) + 1);
    const done = () => {
      const left = (counts.get(pile) || 1) - 1;
      counts.set(pile, left);
      if (left <= 0) pile.classList.remove("moving");
    };
    anim.addEventListener("finish", done);
    anim.addEventListener("cancel", done);
  });
}

// ---- status, controls and messages
const elapsedNow = () => game.elapsed + (runningSince !== null ? Date.now() - runningSince : 0);

function updateStatus() {
  $("moves").textContent = String(game.history.length);
  $("time").textContent = formatTime(elapsedNow());
  $("stat-time").hidden = !settings.clock;
  $("deal-no").textContent = String(game.deal.n);
  $("btn-deal").setAttribute("aria-label", t("dealButton", { n: game.deal.n }));
}

function tick() {
  updateStatus();
  ticks += 1;
  if (ticks % 15 === 0) persist();
}

// The clock runs from the first move until the win, and only while the game is on screen.
function syncTimer() {
  const run = game.started && !game.won && !document.hidden && !hostPaused;
  if (run) {
    if (runningSince === null) runningSince = Date.now();
    if (!ticker) ticker = window.setInterval(tick, 1000);
  } else {
    if (runningSince !== null) {
      game.elapsed += Date.now() - runningSince;
      runningSince = null;
    }
    if (ticker) {
      window.clearInterval(ticker);
      ticker = null;
    }
  }
  updateStatus();
}

function updateControls() {
  $("btn-undo").disabled = busy || game.won || !game.history.length;
  $("btn-hint").disabled = busy || game.won;
  $("btn-hint").hidden = !settings.hints;
  finishPlan = !busy && !game.won ? Rules.planFinish(game.state) : null;
  $("btn-finish").hidden = !finishPlan;
  // "Finish by itself": once every column is in order, the rest plays out.
  window.clearTimeout(autoFinishTimer);
  if (finishPlan && settings.autoFinish) autoFinishTimer = window.setTimeout(runFinish, 450);
  fitBands();
}

function notice(text, kind = "info", ms = 3600, action) {
  $("notice-text").textContent = text;
  $("btn-look").hidden = action !== "look";
  $("notice").hidden = false;
  noticeKind = kind;
  window.clearTimeout(noticeTimer);
  if (ms) noticeTimer = window.setTimeout(() => hideNotice(), ms);
}

function hideNotice(kind) {
  if (kind && noticeKind !== kind) return;
  window.clearTimeout(noticeTimer);
  $("notice").hidden = true;
  noticeKind = "";
}

function announce(text) {
  const el = $("sr");
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = text;
  }, 40);
}

function nudge(el) {
  if (!motionOK() || typeof el.animate !== "function") return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 240, easing: "ease-in-out" },
  );
}

function clearHint() {
  cardEls.forEach((el) => el.classList.remove("hinted"));
  table.querySelectorAll(".hint-target").forEach((el) => el.classList.remove("hint-target"));
}

const placeName = (dst) =>
  dst.to === "found" ? t("placeFound") : dst.to === "cell" ? t("placeCell") : t("placeColumn", { i: dst.i + 1 });
const pileOf = (dst) => (dst.to === "found" ? pileEls.found : dst.to === "cell" ? pileEls.cell : pileEls.tab)[dst.i];

// ---- the solver: a worker of its own, so the game never waits; on the page itself, in short slices, only when a
// worker cannot start.
const Solver = (() => {
  let worker = null;
  let failed = false;
  let seq = 0;
  let waiting = null; // {id, resolve}

  function settle(answer) {
    const w = waiting;
    waiting = null;
    if (w) w.resolve(answer);
  }

  function start() {
    if (worker || failed) return;
    try {
      worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (e) => {
        if (waiting && e.data && e.data.id === waiting.id) settle(e.data);
      };
      worker.onerror = () => {
        failed = true;
        if (worker) worker.terminate();
        worker = null;
        settle(null);
      };
    } catch (e) {
      failed = true;
      worker = null;
    }
  }

  // The page's own slices: the same search, a few milliseconds a frame.
  async function here(id, job) {
    const pause = () => new Promise((resolve) => window.setTimeout(resolve, 16));
    const one = async (state, ms) => {
      const search = createSearch(state);
      const end = Date.now() + ms;
      for (;;) {
        const status = search.step(8);
        if (seq !== id) return null;
        if (status !== "running") return { status, path: search.path };
        if (Date.now() > end) return { status: "limit", path: null };
        await pause();
      }
    };
    if (job.type === "check") return one(job.state, job.ms);
    for (let i = 0; i < job.states.length; i++) {
      const r = await one(job.states[i], job.ms);
      if (!r) return null;
      if (r.status === "win") return { index: i, path: r.path };
    }
    return { index: -1, path: null };
  }

  // A newer question replaces an older one, whose promise resolves with null.
  function ask(job) {
    start();
    settle(null);
    const id = ++seq;
    return new Promise((resolve) => {
      if (!worker) {
        here(id, job).then(resolve);
        return;
      }
      waiting = { id, resolve };
      worker.postMessage(Object.assign({ id }, job));
    });
  }

  function stop() {
    seq += 1;
    settle(null);
    if (worker) worker.postMessage({ type: "stop" });
  }

  return { ask, stop };
})();

// ---- "Still winnable?": the light next to the moves, the verdict bar and the honest hint.
// Verdicts by position (cells and columns in any order): "win", "lost" or "unsure". A winning path the solver found
// is kept as `plan`: keys[i] is the position before moves[i], so a player who follows it needs no new search.
const verdicts = new Map();
let plan = null;
let lightTimer = null;
let backTo = -1;
let hintWanted = false;
let longLook = false;

const posKey = (s) => Rules.key(s);

// The position after each step of the history: keys[h] after h steps.
function historyKeys() {
  const s = Rules.clone(game.state);
  const keys = [posKey(s)];
  for (let h = game.history.length - 1; h >= 0; h--) {
    const step = game.history[h];
    for (let i = step.length - 1; i >= 0; i--) Rules.revert(s, step[i]);
    keys.unshift(posKey(s));
  }
  return keys;
}

// The position after h steps (h at most the history's length).
function positionAt(h) {
  const s = Rules.clone(game.state);
  for (let j = game.history.length - 1; j >= h; j--) {
    const step = game.history[j];
    for (let i = step.length - 1; i >= 0; i--) Rules.revert(s, step[i]);
  }
  return s;
}

// Keeps a winning path from position `s`: every position along it can be won.
function keepPlan(s, path) {
  const t0 = Rules.clone(s);
  const keys = [];
  const moves = [];
  for (const m of path) {
    if (!Rules.canMove(t0, m.src, m.dst)) break;
    keys.push(posKey(t0));
    moves.push(m);
    Rules.move(t0, m.src, m.dst);
    Rules.autoPlay(t0);
  }
  keys.forEach((k) => verdicts.set(k, "win"));
  verdicts.set(posKey(t0), "win");
  plan = { keys, moves };
}

// The next move of the kept path from this position, when the path goes through it.
function planMove(k) {
  if (!plan) return null;
  const i = plan.keys.indexOf(k);
  return i >= 0 ? plan.moves[i] : null;
}

function setLight(v) {
  const el = $("light");
  const shown = settings.light ? v : "off";
  el.dataset.v = shown;
  const label = {
    win: "lightWin",
    lost: "lightLost",
    unsure: "lightUnsure",
    checking: "lightChecking",
    off: "lightOff",
  }[shown];
  el.setAttribute("aria-label", t(label));
  el.title = t(label);
  el.hidden = shown === "off";
}

function showVerdictBar(show) {
  const bar = $("verdict");
  if (!show || !settings.light) {
    bar.hidden = true;
    return;
  }
  const n = game.history.length - backTo;
  const atStart = backTo < 0 && game.history.length === 0;
  $("verdict-text").textContent = atStart ? t("lostAtStart") : t("lostNotice");
  $("btn-back").hidden = backTo < 0;
  $("back-text").textContent = t("backWinnable", { moves: tn("nMoves", n) });
  bar.hidden = false;
}

// After every change: the light from what is known, else a question to the solver.
function checkPosition() {
  window.clearTimeout(lightTimer);
  if (!game || game.won) {
    setLight("off");
    showVerdictBar(false);
    return;
  }
  if (!settings.light && !hintWanted) {
    setLight("off");
    showVerdictBar(false);
    Solver.stop();
    return;
  }
  const s = game.state;
  const k = posKey(s);
  let known = planMove(k) ? "win" : verdicts.get(k);
  // A hint needs the path itself, which a verdict alone does not keep.
  if (hintWanted && known === "win" && !planMove(k)) known = null;
  if (known) {
    verdictKnown(known, k);
    return;
  }
  showVerdictBar(false);
  // "Checking" shows only when the answer takes a moment, so the light does not flicker.
  lightTimer = window.setTimeout(() => setLight("checking"), 400);
  const ms = longLook ? 15000 : hintWanted ? 5000 : 3000;
  Solver.ask({ type: "check", state: Rules.clone(s), ms }).then((r) => {
    if (!r || !game || posKey(game.state) !== k) return;
    window.clearTimeout(lightTimer);
    if (r.status === "win" && r.path) keepPlan(s, r.path);
    else if (r.status === "win") verdicts.set(k, "win");
    else if (r.status === "lost") verdicts.set(k, "lost");
    verdictKnown(r.status === "win" ? "win" : r.status === "lost" ? "lost" : "unsure", k, true);
  });
}

function verdictKnown(v, k, fresh) {
  setLight(v);
  if (v === "lost") {
    if (fresh && settings.light) announce(t("lostNotice"));
    findWayBack(k);
  } else showVerdictBar(false);
  if (hintWanted) {
    hintWanted = false;
    longLook = false;
    giveHint(v, k);
  }
}

// The most recent earlier position that can still be won: from the verdicts already known, else asked of the
// solver (newest first).
function findWayBack(k) {
  const keys = historyKeys();
  const h = game.history.length;
  backTo = -1;
  const unknown = [];
  for (let j = h - 1; j >= 0; j--) {
    const v = verdicts.get(keys[j]);
    if (v === "win") {
      backTo = j;
      break;
    }
    if (v !== "lost" && unknown.length < 40) unknown.push(j);
  }
  if (!unknown.length) {
    showVerdictBar(true);
    return;
  }
  // Positions newer than the last one known to be winnable still need an answer, newest first.
  const states = unknown.map((j) => positionAt(j));
  showVerdictBar(false);
  Solver.ask({ type: "last", states, ms: 1500 }).then((r) => {
    if (!r || !game || posKey(game.state) !== k) return;
    if (r.index >= 0) {
      backTo = unknown[r.index];
      if (r.path) keepPlan(states[r.index], r.path);
      else verdicts.set(keys[backTo], "win");
    }
    showVerdictBar(true);
  });
}

function goBack() {
  if (busy || backTo < 0 || !game || game.won) return;
  dropSelection(false);
  while (game.history.length > backTo) {
    const step = game.history.pop();
    for (let i = step.length - 1; i >= 0; i--) Rules.revert(game.state, step[i]);
  }
  game.used.undo = true;
  backTo = -1;
  render();
  announce(t("backDone"));
  notice(t("backDone"));
  afterChange();
}

// ---- the honest hint: always the next move of a real winning path, never just any legal move.
function showHint() {
  if (busy || game.won) return;
  game.used.hint = true;
  clearHint();
  const k = posKey(game.state);
  const v = verdicts.get(k);
  if (planMove(k) || v === "lost") {
    giveHint(v || "win", k);
    return;
  }
  hintWanted = true;
  notice(t("hintThinking"), "hint", 0);
  checkPosition();
}

function giveHint(v, k) {
  if (!game || posKey(game.state) !== k) return;
  if (v === "lost") {
    notice(t("hintLost"), "hint", 0);
    return;
  }
  const m = planMove(k);
  if (v !== "win" || !m) {
    notice(t("hintNone"), "hint", 0, "look");
    return;
  }
  const ids = Rules.pick(game.state, m.src);
  ids.forEach((id) => cardEls[id].classList.add("hinted"));
  pileOf(m.dst).classList.add("hint-target");
  notice(t("hintMove", { card: cardName(ids[0]), place: placeName(m.dst) }), "hint", 0);
}

function lookLonger() {
  hideNotice();
  hintWanted = true;
  longLook = true;
  verdicts.delete(posKey(game.state));
  notice(t("hintThinking"), "hint", 0);
  checkPosition();
}

// ---- saving: the deal and the steps taken, so a game comes back exactly, Undo included.
function saveObject() {
  return {
    v: 1,
    deal: game.deal,
    opening: game.opening.map(Rules.opText).join(","),
    steps: game.history.map((step) => step.map(Rules.opText).join(",")).join(" "),
    elapsed: elapsedNow(),
    started: game.started,
    used: game.used,
  };
}

function persist(now) {
  if (!game) return;
  if (game.won) Store.remove("game");
  else Store.set("game", saveObject(), now);
}

const saveStats = () => Store.set("stats", stats, true);
const saveSettings = () => Store.set("settings", settings, true);
const saveProgress = () => Store.set("progress", progress, true);

// What a game is: a numbered deal, or the deal of a day.
function normDeal(d) {
  if (!d || typeof d !== "object" || !Number.isInteger(d.n) || d.n < 1 || d.n > Rules.MAX_DEAL) return null;
  if (d.kind === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) return { kind: "daily", day: d.day, n: d.n };
  return { kind: "number", n: d.n };
}

function restore(obj) {
  if (!obj || obj.v !== 1) return false;
  const deal = normDeal(obj.deal);
  if (!deal) return false;
  const state = Rules.dealNumbered(deal.n);
  // Plays saved steps again, each checked against the rules; a save that does not fit is dropped.
  const replay = (word) => {
    const step = [];
    for (const part of word.split(",")) {
      const op = Rules.opParse(part);
      const mv = op && Rules.opMove(state, op);
      if (!mv) return null;
      step.push(Rules.move(state, mv.src, mv.dst));
    }
    return step;
  };
  const openingText = typeof obj.opening === "string" ? obj.opening.trim() : "";
  const opening = openingText ? replay(openingText) : [];
  if (!opening) return false;
  const history = [];
  const text = typeof obj.steps === "string" ? obj.steps.trim() : "";
  for (const word of text ? text.split(" ") : []) {
    const step = replay(word);
    if (!step) return false;
    history.push(step);
  }
  if (Rules.isWon(state)) return false;
  game = {
    deal,
    state,
    opening,
    history,
    elapsed: typeof obj.elapsed === "number" && Number.isFinite(obj.elapsed) && obj.elapsed >= 0 ? obj.elapsed : 0,
    started: obj.started === true || history.length > 0,
    won: false,
    used: { hint: !!(obj.used && obj.used.hint), undo: !!(obj.used && obj.used.undo) },
  };
  return true;
}

function freshSeed() {
  try {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0];
  } catch (e) {
    return Math.floor(Math.random() * 4294967296);
  }
}

// A random deal number that can be won.
function randomNumber() {
  for (;;) {
    const n = (freshSeed() % Rules.MAX_DEAL) + 1;
    if (!Rules.UNWINNABLE.includes(n)) return n;
  }
}

// ---- playing
function markStarted() {
  if (!$("first-help").hidden) dismissFirstHelp();
  if (game.started) return;
  game.started = true;
  stats.played += 1;
  saveStats();
  syncTimer();
}

function afterChange() {
  if (Rules.isWon(game.state)) {
    win();
    return;
  }
  updateControls();
  // A hint belongs to the position it was asked for: a move, Undo or a new game ends it.
  hideNotice("hint");
  hintWanted = false;
  longLook = false;
  if (!Rules.anyMove(game.state)) notice(t("noMovesLeft"), "stuck", 0);
  else hideNotice("stuck");
  persist();
  checkPosition();
  updateTurnTip();
}

function autoText(autos) {
  if (!autos.length) return "";
  const cards = autos.map((a) => cardName(a.cards[0])).join(", ");
  return ` ${t("wentUp", { cards, Cards: cap(cards) })}`;
}

// Why a move does not fit: too many cards at once, or the cards are not in order, or the place is wrong.
function whyNot(src, dst) {
  const s = game.state;
  const cards = Rules.pick(s, src);
  if (!Rules.isRun(cards)) return t("notRun");
  if (dst && dst.to === "tab") {
    const col = s.cols[dst.i];
    const capacity = Rules.capacity(s, !col.length);
    const fits = !col.length || Rules.fitsColumn(col[col.length - 1], cards[0]);
    if (fits && cards.length > capacity) return t("tooMany", { n: tn("nCards", cards.length), cap: capacity });
  }
  return null;
}

function commitMove(src, dst) {
  const s = game.state;
  if (busy || game.won || !Rules.canMove(s, src, dst)) return false;
  dropSelection(false);
  const step = [Rules.move(s, src, dst)];
  const autos = settings.autoPlay ? Rules.autoPlay(s) : [];
  game.history.push(step.concat(autos));
  markStarted();
  render();
  const r = step[0];
  announce(
    t("moved", {
      card: cap(cardName(r.cards[0])),
      more: r.cards.length > 1 ? tn("nCards", r.cards.length - 1) : "",
      place: placeName(dst),
    }) + autoText(autos),
  );
  afterChange();
  return true;
}

function undo() {
  if (busy || game.won || !game.history.length) return;
  dropSelection(false);
  const step = game.history.pop();
  for (let i = step.length - 1; i >= 0; i--) Rules.revert(game.state, step[i]);
  game.used.undo = true;
  render();
  announce(t("undone"));
  afterChange();
}

function srcOf(id) {
  const loc = where[id];
  if (!loc) return null;
  if (loc.pile === "cell") return { from: "cell", i: loc.i };
  if (loc.pile === "tab") return { from: "tab", i: loc.i, k: loc.k };
  return null;
}

// "Send" mode: one tap moves a card to its best place.
function tapCard(id, at) {
  const src = srcOf(id);
  if (!src) return;
  const dst = Rules.bestTarget(game.state, src);
  if (!dst) {
    cannot(id, null, whyNot(src, null));
    return;
  }
  if (commitMove(src, dst) && at) lastTapMove = { t: Date.now(), x: at.x, y: at.y };
}

function keyMove(cardEl, dst) {
  const id = Number(cardEl.dataset.id);
  const src = srcOf(id);
  if (!src) return;
  if (!dst || !commitMove(src, dst)) cannot(id, dst ? placeName(dst) : t("placeFound"), whyNot(src, dst));
}

function runFinish() {
  if (busy || !finishPlan) return;
  dropSelection(false);
  const steps = finishPlan;
  busy = true;
  hideNotice();
  if (!motionOK()) {
    steps.forEach((st) => Rules.move(game.state, st.src, st.dst));
    busy = false;
    render({ animate: false });
    afterChange();
    return;
  }
  let n = 0;
  const next = () => {
    if (n >= steps.length) {
      busy = false;
      afterChange();
      return;
    }
    Rules.move(game.state, steps[n].src, steps[n].dst);
    n += 1;
    render();
    window.setTimeout(next, 85);
  };
  next();
}

function newGame(opts = {}) {
  if (game && game.started && !game.won) {
    stats.streak = 0;
    saveStats();
  }
  dropSelection(false);
  const deal = normDeal(opts.deal) || { kind: "number", n: randomNumber() };
  runningSince = null;
  if (game) {
    game.started = false;
    syncTimer();
  }
  game = {
    deal,
    state: Rules.dealNumbered(deal.n),
    opening: [],
    history: [],
    elapsed: 0,
    started: false,
    won: false,
    used: { hint: false, undo: false },
  };
  plan = null;
  backTo = -1;
  lastTapMove = null;
  hideNotice();
  // Safe cards already free at the start go up before the first move; they are no move of the player's.
  if (settings.autoPlay) game.opening = Rules.autoPlay(game.state);
  render({ deal: opts.quiet !== true, animate: opts.quiet !== true });
  syncTimer();
  if (!opts.quiet)
    announce(deal.kind === "daily" ? t("dailyOf", { date: formatDay(deal.day) }) : t("newGameSr", { n: deal.n }));
  afterChange();
}

let pendingNew = {};
function askNewGame(opts) {
  if (busy) return;
  pendingNew = opts || {};
  if (game.started && !game.won && game.history.length > 0) openDialog($("dlg-new"));
  else newGame(pendingNew);
}

// ---- the daily deal: the same number for everyone on a date
function playDaily(day) {
  closeDialog($("dlg-daily"));
  askNewGame({ deal: { kind: "daily", day, n: Rules.dailyNumber(day) } });
}

let calMonth = null;
function showCalendar() {
  buildCalendar(calMonth, (day) => !!(progress.daily[day] && progress.daily[day].won), playDaily);
}

// ---- winning
function win() {
  game.won = true;
  syncTimer();
  const time = game.elapsed;
  const moves = game.history.length;
  const firstWin = stats.won === 0;
  const bestTime = stats.bestTime === null || time < stats.bestTime;
  const bestMoves = stats.fewestMoves === null || moves < stats.fewestMoves;
  stats.won += 1;
  stats.played = Math.max(stats.played, stats.won);
  stats.streak += 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  if (bestTime) stats.bestTime = time;
  if (bestMoves) stats.fewestMoves = moves;
  saveStats();
  if (game.deal.kind === "daily") {
    progress.daily[game.deal.day] = { won: true };
    saveProgress();
  }
  persist(true);
  updateControls();
  hideNotice();
  setLight("off");
  showVerdictBar(false);
  announce(t("solvedSr", { time: formatTime(time), moves: tn("nMoves", moves), n: moves }));
  $("win-time").textContent = formatTime(time);
  $("win-moves").textContent = String(moves);
  $("win-best-moves").hidden = !(bestMoves && !firstWin);
  $("win-time-box").hidden = !settings.clock;
  $("win-best-time").hidden = !(bestTime && !firstWin && settings.clock);
  const record = t("winRecord", {
    mode: "",
    wins: tn("nWins", stats.won),
    games: tn("nGames", stats.played),
    gamesOf: tn("nGamesOf", stats.played),
    streak: stats.streak,
  });
  const kind =
    game.deal.kind === "daily"
      ? t("dailyWon", { date: formatDay(game.deal.day) })
      : `${t("dealN", { n: game.deal.n })}.`;
  $("win-record").textContent = `${kind} ${record}`;
  celebrate(() => openDialog($("dlg-win"), $("btn-new")));
}

function celebrate(done) {
  if (!motionOK()) {
    done();
    return;
  }
  const layer = document.createElement("div");
  layer.className = "celebrate";
  layer.setAttribute("aria-hidden", "true");
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let n = 0; n < 32; n++) {
    const suit = n % 4;
    const from = pileEls.found[suit].getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "toss";
    el.style.setProperty("--suit", `var(--c-${["spade", "heart", "club", "diamond"][suit]})`);
    el.style.left = `${from.left + from.width / 2 - 15}px`;
    el.style.top = `${from.top + from.height / 2 - 21}px`;
    el.style.setProperty("--dx", `${Math.round((Math.random() * 2 - 1) * w * 0.5)}px`);
    el.style.setProperty("--up", `${-Math.round(60 + Math.random() * 160)}px`);
    el.style.setProperty("--dy", `${Math.round(h * (0.6 + Math.random() * 0.4))}px`);
    el.style.setProperty("--rot", `${Math.round((Math.random() * 2 - 1) * 540)}deg`);
    el.style.animationDelay = `${n * 30}ms`;
    el.appendChild(svgUse(`suit-${suit}`, ""));
    layer.appendChild(el);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => {
    layer.remove();
    done();
  }, 1900);
}

// ---- picking cards up and putting them down: tap a card to pick it up, then tap where it goes (the whole column
// counts, any free cell and any foundation); or drag it. Pointer Events cover touch, pen and mouse. Taps are found
// from the cards' rectangles, so a tap outside a card's shape still counts.
let selection = null; // {src, ids}
const SLOP = 12; // px a finger may wander before a tap becomes a drag

const pileBox = (el) => ({ x: el.offsetLeft, y: el.offsetTop });

// What lies under a point (client coordinates): {kind: "card", id} for a card that can be picked up or built on,
// {kind: "pile", pile, i} for the rest of a pile, or null.
function hitAt(cx, cy) {
  if (!game || !geo) return null;
  const r = table.getBoundingClientRect();
  const x = cx - r.left;
  const y = cy - r.top;
  const g = geo;
  const slack = Math.max(3, Math.ceil(g.gap / 2) + 1);
  const s = game.state;
  for (let i = 0; i < Rules.COLS; i++) {
    const p = pileBox(pileEls.tab[i]);
    if (x < p.x - slack || x >= p.x + g.cw + slack || y < p.y - slack) continue;
    const col = s.cols[i];
    for (let j = col.length - 1; j >= 0; j--) {
      const loc = where[col[j]];
      if (loc && y >= p.y + loc.y && y < p.y + loc.y + g.ch) return { kind: "card", id: col[j] };
    }
    return { kind: "pile", pile: "tab", i };
  }
  const inBox = (p) => x >= p.x - slack && x < p.x + g.cw + slack && y >= p.y - slack && y < p.y + g.ch + slack;
  for (let i = 3; i >= 0; i--) {
    if (!inBox(pileBox(pileEls.cell[i]))) continue;
    const c = s.cells[i];
    return c >= 0 ? { kind: "card", id: c } : { kind: "pile", pile: "cell", i };
  }
  for (let i = 3; i >= 0; i--) if (inBox(pileBox(pileEls.found[i]))) return { kind: "pile", pile: "found", i };
  return null;
}

// The same from an element (a screen reader's or the keyboard's activation).
function hitOf(el) {
  if (!el || !el.closest) return null;
  const cardEl = el.closest(".card");
  if (cardEl && cardEl.getAttribute("role") === "button") return { kind: "card", id: Number(cardEl.dataset.id) };
  const pileEl = el.closest(".pile");
  if (!pileEl) return null;
  return { kind: "pile", pile: pileEl.dataset.pile, i: Number(pileEl.dataset.i) };
}

// Where a hit puts the cards of `src`: the column, a free cell (an empty one when the one tapped is full) or the
// foundation of the card's suit.
function destFor(hit, src) {
  if (!hit) return null;
  const loc = hit.kind === "card" ? where[hit.id] : hit;
  if (!loc) return null;
  if (loc.pile === "tab") return { to: "tab", i: loc.i };
  if (loc.pile === "cell") {
    const s = game.state;
    const i = s.cells[loc.i] < 0 ? loc.i : s.cells.indexOf(-1);
    return { to: "cell", i: i >= 0 ? i : loc.i };
  }
  if (loc.pile === "found") {
    const cards = Rules.pick(game.state, src);
    return { to: "found", i: cards.length === 1 ? Rules.suitOf(cards[0]) : loc.i };
  }
  return null;
}

function showTargets(src, hover) {
  marksLayer.textContent = "";
  if (!src || settings.showTargets === false) return;
  for (const dst of Rules.legalTargets(game.state, src)) {
    const pileEl = pileOf(dst);
    const p = pileBox(pileEl);
    let h = geo.ch;
    if (dst.to === "tab") {
      const last = pileEl.lastElementChild;
      if (last && last.classList.contains("card")) h = last.offsetTop + geo.ch;
      h += Math.round(geo.ch * 0.35);
    }
    const m = document.createElement("div");
    m.className = "target";
    if (hover && hover.to === dst.to && hover.i === dst.i) m.classList.add("hover");
    m.style.left = `${p.x - 5}px`;
    m.style.top = `${p.y - 5}px`;
    m.style.width = `${geo.cw + 10}px`;
    m.style.height = `${h + 10}px`;
    marksLayer.appendChild(m);
  }
}

function dropSelection(say) {
  if (!selection) return;
  selection.ids.forEach((id) => cardEls[id].classList.remove("sel", "sel-first", "sel-last", "sel-one"));
  selection = null;
  marksLayer.textContent = "";
  if (say) announce(t("putBack"));
}

function cannot(id, place, why) {
  nudge(cardEls[id]);
  const card = cardName(id);
  if (why) {
    notice(why, "why", 5000);
    announce(why);
    return;
  }
  announce(place ? t("noFit", { card, Card: cap(card), place }) : t("noMove", { card, Card: cap(card) }));
}

function pickUp(id) {
  const src = srcOf(id);
  dropSelection(false);
  if (!src) return;
  const ids = Rules.pick(game.state, src);
  // Cards out of order never move together; saying so at once saves a wasted tap.
  if (!Rules.isRun(ids)) {
    cannot(id, null, t("notRun"));
    return;
  }
  // With "Show where a card can go" off, picking up never tells whether the card has a move.
  if (settings.showTargets !== false && !Rules.legalTargets(game.state, src).length) {
    cannot(id, null, whyNot(src, null));
    return;
  }
  selection = { src, ids };
  ids.forEach((c) => cardEls[c].classList.add("sel"));
  cardEls[ids[0]].classList.add("sel-first");
  cardEls[ids[ids.length - 1]].classList.add("sel-last");
  if (ids.length === 1) cardEls[ids[0]].classList.add("sel-one");
  showTargets(src);
  const card = cap(cardName(ids[0]));
  announce(ids.length > 1 ? t("pickedRun", { card, more: tn("nCards", ids.length - 1) }) : t("picked", { card }));
}

function onTap(hit, at) {
  if (busy || !game || game.won) return;
  if (selection) {
    const src = selection.src;
    if (hit && hit.kind === "card" && selection.ids.includes(hit.id)) {
      // The second tap finds the best place only while the player wants to be shown places.
      if (settings.showTargets === false) {
        dropSelection(false);
        announce(t("putBack"));
        return;
      }
      const dst = Rules.bestTarget(game.state, src);
      const first = selection.ids[0];
      dropSelection(false);
      if (!dst || !commitMove(src, dst)) cannot(first, null, whyNot(src, null));
      return;
    }
    const dst = destFor(hit, src);
    if (dst && Rules.canMove(game.state, src, dst)) {
      dropSelection(false);
      commitMove(src, dst);
      return;
    }
    // Another card was tapped: it is picked up instead, unless the tap meant this place and the run is too long
    // for it (then the reason shows).
    if (hit && hit.kind === "card" && srcOf(hit.id) && !(dst && whyNot(src, dst))) {
      pickUp(hit.id);
      return;
    }
    const first = selection.ids[0];
    dropSelection(false);
    if (dst) cannot(first, placeName(dst), whyNot(src, dst));
    else announce(t("putBack"));
    return;
  }
  if (!hit || hit.kind !== "card") return;
  if (settings.tapMode === "send") tapCard(hit.id, at);
  else pickUp(hit.id);
}

function beginDrag() {
  const hit = drag.hit;
  const src = hit && hit.kind === "card" ? srcOf(hit.id) : null;
  if (!src) return false;
  const ids = Rules.pick(game.state, src);
  if (!ids.length || !Rules.isRun(ids)) return false;
  dropSelection(false);
  drag.active = true;
  drag.src = src;
  drag.els = ids.map((id) => cardEls[id]);
  drag.els.forEach((el) => {
    if (typeof el.getAnimations === "function") el.getAnimations().forEach((a) => a.cancel());
    el.classList.add("lifted");
  });
  drag.els[0].parentNode.classList.add("raised");
  drag.dst = null;
  showTargets(src);
  return true;
}

// While dragging, the place under the finger is the drop target when the cards fit there.
function updateHover(cx, cy) {
  const dst = destFor(hitAt(cx, cy), drag.src);
  const ok = dst && Rules.canMove(game.state, drag.src, dst) ? dst : null;
  if (JSON.stringify(ok) === JSON.stringify(drag.dst)) return;
  drag.dst = ok;
  showTargets(drag.src, ok);
}

table.addEventListener("pointerdown", (e) => {
  if (busy || drag || !game || game.won) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  drag = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, hit: hitAt(e.clientX, e.clientY), active: false };
  try {
    table.setPointerCapture(e.pointerId);
  } catch (err) {
    // Without capture the drag still works while the pointer stays over the table.
  }
});

table.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointerId || drag.dead) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.active) {
    if (Math.hypot(dx, dy) < SLOP) return;
    if (!beginDrag()) {
      drag.dead = true;
      return;
    }
  }
  e.preventDefault();
  drag.els.forEach((el) => {
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  updateHover(e.clientX, e.clientY);
});

table.addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  lastPointerUp = Date.now();
  const d = drag;
  drag = null;
  if (d.active) {
    marksLayer.textContent = "";
    if (!(d.dst && commitMove(d.src, d.dst))) {
      const dst = destFor(hitAt(e.clientX, e.clientY), d.src);
      const why = dst ? whyNot(d.src, dst) : null;
      render({ keepMarks: true });
      if (why) notice(why, "why", 5000);
    }
    return;
  }
  if (d.dead) return;
  // In "send" mode a quick second tap on the same spot is ignored, so one double tap moves one card.
  const recent =
    settings.tapMode === "send" &&
    lastTapMove &&
    Date.now() - lastTapMove.t < 380 &&
    Math.hypot(e.clientX - lastTapMove.x, e.clientY - lastTapMove.y) < 30;
  if (recent) return;
  onTap(d.hit, { x: e.clientX, y: e.clientY });
});

table.addEventListener("pointercancel", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  cancelDrag();
});

// A screen reader's double tap (and other assistive tools) activates a card or a pile with a click and no pointer
// events; clicks that follow our own pointer handling are ignored.
table.addEventListener("click", (e) => {
  if (Date.now() - lastPointerUp < 700) return;
  onTap(hitOf(e.target));
});

function cancelDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.active) {
    marksLayer.textContent = "";
    render({ keepMarks: true });
  }
}

// ---- keyboard
table.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const hit = hitOf(e.target);
  if (!hit) return;
  e.preventDefault();
  onTap(hit);
});

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
  const tgt = e.target;
  if (tgt && /^(INPUT|SELECT|TEXTAREA)$/.test(tgt.tagName)) return;
  if (e.key === "Escape") {
    cancelDrag();
    dropSelection(true);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const cardEl = tgt && tgt.classList && tgt.classList.contains("card") ? tgt : null;
  const k = e.key.toLowerCase();
  if (k === "u") undo();
  else if (k === "h") showHint();
  else if (k === "n") askNewGame();
  else if (k === "f" && cardEl) {
    const id = Number(cardEl.dataset.id);
    keyMove(cardEl, { to: "found", i: Rules.suitOf(id) });
  } else if (k === "c" && cardEl) {
    const i = game.state.cells.indexOf(-1);
    keyMove(cardEl, i >= 0 ? { to: "cell", i } : null);
  } else if (/^[1-8]$/.test(k) && cardEl) keyMove(cardEl, { to: "tab", i: Number(k) - 1 });
  else return;
  e.preventDefault();
});

// ---- dialogs
wireDialogs();
const on = (id, handler) => $(id).addEventListener("click", handler);

on("btn-new", () => askNewGame());
on("btn-undo", undo);
on("btn-hint", showHint);
on("btn-finish", runFinish);
on("btn-back", goBack);
on("btn-look", (e) => {
  e.stopPropagation();
  lookLonger();
});
$("notice").addEventListener("click", () => {
  if (noticeKind === "hint") clearHint();
  hideNotice();
});
on("new-keep", () => closeDialog($("dlg-new")));
on("new-deal", () => {
  closeDialog($("dlg-new"));
  newGame(pendingNew);
});
on("new-replay", () => {
  closeDialog($("dlg-new"));
  newGame({ deal: game.deal });
});
on("btn-daily", () => {
  dropSelection(false);
  calMonth = null;
  showCalendar();
  openDialog($("dlg-daily"));
});
on("daily-close", () => closeDialog($("dlg-daily")));
on("daily-play", () => playDaily(todayKey()));
on("cal-prev", () => {
  calMonth = lastMonth();
  showCalendar();
  $("cal-next").focus();
});
on("cal-next", () => {
  calMonth = null;
  showCalendar();
  $("cal-prev").focus();
});

// The deal number: type one, or ask for a random one.
function openDeal(back) {
  dropSelection(false);
  $("deal-input").value = String(game.deal.n);
  $("deal-error").hidden = true;
  openDialog($("dlg-deal"), back);
  $("deal-input").select();
}
function dealFromInput() {
  const text = $("deal-input")
    .value.trim()
    .replace(/[\s.,]/g, "");
  const n = /^\d{1,7}$/.test(text) ? Number(text) : 0;
  if (n < 1 || n > Rules.MAX_DEAL) {
    $("deal-error").textContent = t("dealRange");
    $("deal-error").hidden = false;
    $("deal-input").focus();
    return;
  }
  closeDialog($("dlg-deal"));
  askNewGame({ deal: { kind: "number", n } });
}
on("btn-deal", () => openDeal($("btn-deal")));
on("choose-deal", () => {
  closeDialog($("dlg-settings"));
  openDeal($("btn-settings"));
});
on("deal-close", () => closeDialog($("dlg-deal")));
on("deal-play", dealFromInput);
on("deal-random", () => {
  closeDialog($("dlg-deal"));
  askNewGame({ deal: { kind: "number", n: randomNumber() } });
});
$("deal-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    dealFromInput();
  }
});
$("deal-input").addEventListener("input", () => {
  const n = Number($("deal-input").value.trim());
  const unwinnable = Rules.UNWINNABLE.includes(n);
  $("deal-error").textContent = unwinnable ? t("dealCannot") : "";
  $("deal-error").hidden = !unwinnable;
});

function fillStats() {
  $("st-played").textContent = formatNumber(stats.played);
  $("st-won").textContent = formatNumber(stats.won);
  $("st-rate").textContent = formatRate(stats.won, stats.played);
  $("st-time").textContent = stats.bestTime === null ? "–" : formatTime(stats.bestTime);
  $("st-moves").textContent = stats.fewestMoves === null ? "–" : String(stats.fewestMoves);
  $("st-streak").textContent = String(stats.streak);
  $("st-best").textContent = String(stats.bestStreak);
  $("reset-confirm").hidden = true;
}

on("btn-stats", () => {
  fillStats();
  openDialog($("dlg-stats"));
});
on("stats-done", () => closeDialog($("dlg-stats")));
on("stats-reset", () => {
  $("reset-confirm").hidden = false;
  $("reset-no").focus();
});
on("reset-no", () => {
  $("reset-confirm").hidden = true;
  $("stats-reset").focus();
});
on("reset-yes", () => {
  stats = blankStats();
  if (game.started && !game.won) stats.played = 1;
  saveStats();
  fillStats();
  $("stats-done").focus();
  announce(t("statsCleared"));
});

// The guide's pictures, one per rule of the short start: [cards, extra] in previewBox's terms, for a card of width
// cw with bands of fu.
const examples = (cw, fu, ch) => [
  // A red 7 goes on a black 8.
  [
    [
      [0, 8, false, 0, 0],
      [1, 7, false, cw + 30, fu],
    ],
    { arrows: [[cw + 24, fu + 14, cw - 6, fu + 6]] },
  ],
  // A free cell takes one card.
  [[[3, 13, false, cw + 30, 0]], { slots: [[0, 0, 0]], arrows: [[cw + 24, ch / 2, cw - 8, ch / 2]] }],
  // An empty column takes anything, a run too.
  [
    [
      [2, 12, false, cw + 30, 0],
      [1, 11, false, cw + 30, fu],
    ],
    { slots: [[0, 0, 0]], arrows: [[cw + 24, ch / 2, cw - 8, ch / 2]] },
  ],
];

// How to play opens at its short start, with each rule's picture drawn in the cards and table chosen now.
function showHelp(back) {
  dismissFirstHelp();
  const g = cardGeo(40, 2, "rect", 4, look());
  examples(g.cw, g.fu, g.ch).forEach(([cards, extra], i) => {
    const box = $(`ex-${i + 1}`);
    box.textContent = "";
    box.appendChild(previewBox(g, cards, look(), extra));
  });
  $("dlg-help").querySelector(".dlg-body").scrollTop = 0;
  openDialog($("dlg-help"), back);
}

// The first start's line on the table: it opens the guide, and goes for good after a tap or the first move.
function dismissFirstHelp() {
  $("first-help").hidden = true;
  if (progress.firstHelp) return;
  progress.firstHelp = true;
  saveProgress();
}

// The sideways tip: on a phone held upright, once the first start's line has gone (a few moves into the first
// game, or from the second game on), and only while the cards are narrow (Free Cells' eight columns leave narrow cards only on narrow phones).
// It goes when the phone turns or on a tap, for good.
function updateTurnTip() {
  const el = $("turn-tip");
  if (progress.turnTip || !game || !geo) {
    el.hidden = true;
    return;
  }
  const upright = table.clientHeight > table.clientWidth;
  if (!upright) {
    if (!el.hidden) dismissTurnTip();
    return;
  }
  const ready = $("first-help").hidden && (game.history.length >= 3 || (!game.started && stats.played >= 1));
  el.hidden = !(ready && geo.cw < 44);
}

function dismissTurnTip() {
  $("turn-tip").hidden = true;
  progress.turnTip = true;
  saveProgress();
}

on("btn-help", () => showHelp());
on("turn-tip", dismissTurnTip);
on("first-help", () => showHelp($("btn-help")));
on("help-done", () => closeDialog($("dlg-help")));

on("win-close", () => closeDialog($("dlg-win")));
on("win-new", () => {
  closeDialog($("dlg-win"));
  newGame();
});
on("win-stats", () => {
  const back = focusTarget($("dlg-win"));
  closeDialog($("dlg-win"));
  fillStats();
  openDialog($("dlg-stats"), back);
});

// ---- settings
function applyTheme() {
  if (settings.theme === "device") {
    if (appliedTheme) root.removeAttribute("data-theme");
    appliedTheme = null;
  } else {
    root.setAttribute("data-theme", settings.theme);
    appliedTheme = settings.theme;
  }
}

function applyLook() {
  applyTheme();
  root.classList.toggle("deck-bold", settings.deck !== "crisp");
  root.classList.toggle("deck-crisp", settings.deck === "crisp");
  root.classList.toggle("four", settings.four);
  root.classList.toggle("hc", settings.contrast);
  paintTable(root, settings.table, isDark());
}

// Two cards of a fanned column: the covered one shows its band.
const fanned = (g) => [
  [1, 10, false, 0, 0],
  [2, 8, false, 0, g.fu],
];

// Each size's preview: two cards of a fanned column, drawn at the size that setting gives here.
function buildPreviews() {
  const box = $("size-previews");
  box.textContent = "";
  const W = table.clientWidth;
  const H = table.clientHeight;
  SIZES.forEach((size) => {
    const g = measure(W, H, size, settings.shape);
    const cell = document.createElement("div");
    cell.appendChild(previewBox(g, fanned(g), look()));
    cell.addEventListener("click", () => chooseSize(size));
    box.appendChild(cell);
  });
}

// The shapes, backs and tables, each drawn as it would look on the table now.
function buildLookTiles() {
  const W = table.clientWidth;
  const H = table.clientHeight;
  const size = currentSize();
  const decks = $("deck-tiles");
  decks.textContent = "";
  ["bold", "crisp"].forEach((id) => {
    const g = measure(W, H, size, settings.shape, id);
    const pic = previewBox(g, fanned(g), look({ deck: id }));
    decks.appendChild(tile("deck", id, settings.deck === id, t(`deck_${id}`), pic));
  });
  const smaller = [];
  const none = [];
  const shapes = $("shape-tiles");
  shapes.textContent = "";
  SHAPE_IDS.forEach((id) => {
    const g = measure(W, H, size, id);
    const off = !!g.shapeOff;
    if (off) none.push(t(`shape_${id}`));
    else if (g.shapeScale < 1) smaller.push(t(`shape_${id}`));
    shapes.appendChild(
      tile("shape", id, settings.shape === id, t(`shape_${id}`), previewBox(g, fanned(g), look()), off),
    );
  });
  const notes = [];
  if (smaller.length) notes.push(t("shapeSmaller", { names: smaller.join(", ") }));
  if (none.length) notes.push(t("shapeNone", { names: none.join(", ") }));
  $("shape-note").textContent = notes.join(" ");
  $("shape-note").hidden = !notes.length;

  const g = measure(W, H, size, settings.shape);
  const backs = $("back-tiles");
  backs.textContent = "";
  BACK_IDS.forEach((id) => {
    const pic = previewBox(g, [[0, 1, true, 0, 0]], look({ back: id }));
    backs.appendChild(tile("back", id, settings.back === id, t(`back_${id}`), pic));
  });

  const mini = measure(240, 400, "normal", settings.shape);
  const tables = $("table-tiles");
  tables.textContent = "";
  TABLE_IDS.forEach((id) => {
    const pic = previewBox(
      mini,
      [
        [1, 1, false, 0, 0],
        [0, 1, true, mini.cw + 4, 0],
      ],
      look({ table: id }),
    );
    tables.appendChild(tile("table", id, settings.table === id, t(`table_${id}`), pic));
  });
  fitTiles($("panel-look"));
}

function fillSizes() {
  const size = currentSize();
  $(`size-${size}`).checked = true;
  $("size-note").textContent = settings.size ? t("sizeKept") : t("sizeAuto");
}

function fillSettings() {
  fillSizes();
  buildPreviews();
  buildLookTiles();
  $("opt-four").checked = settings.four;
  $("opt-contrast").checked = settings.contrast;
  $(`theme-${settings.theme}`).checked = true;
  $(`lang-${settings.lang}`).checked = true;
  $(`tap-${settings.tapMode}`).checked = true;
  $("opt-autoplay").checked = settings.autoPlay;
  $("opt-right").checked = settings.cellsRight;
  $("opt-hints").checked = settings.hints;
  $("opt-finish").checked = settings.autoFinish;
  $("opt-targets").checked = settings.showTargets;
  $("opt-clock").checked = settings.clock;
  $("opt-light").checked = settings.light;
}

function relayout() {
  if (!game) return;
  cancelDrag();
  applyLayout();
  render({ animate: false, keepMarks: true });
  updateTurnTip();
}

// After a change of look: the table, and the sheet's pictures when it is open.
function lookChanged() {
  applyLook();
  relayout();
  if ($("dlg-settings").open) {
    fillSizes();
    buildPreviews();
    buildLookTiles();
  }
}

function chooseSize(size) {
  settings.size = size;
  saveSettings();
  lookChanged();
}

wireTabs($("dlg-settings"));

on("btn-settings", () => {
  dropSelection(false);
  fillSettings();
  openDialog($("dlg-settings"));
  fitSegs($("dlg-settings"));
  fitTiles($("dlg-settings"));
});
on("settings-done", () => closeDialog($("dlg-settings")));

// One listener for every radio choice in the sheet, the generated tiles included.
$("dlg-settings").addEventListener("change", (e) => {
  const input = e.target;
  if (!input || input.type !== "radio" || !input.checked) return;
  const v = input.value;
  if (input.name === "size") chooseSize(v);
  else if (input.name === "shape" && SHAPE_IDS.includes(v)) {
    settings.shape = v;
    saveSettings();
    lookChanged();
  } else if (input.name === "back" && BACK_IDS.includes(v)) {
    settings.back = v;
    saveSettings();
    lookChanged();
  } else if (input.name === "table" && TABLE_IDS.includes(v)) {
    settings.table = v;
    saveSettings();
    lookChanged();
  } else if (input.name === "theme") {
    settings.theme = v === "light" || v === "dark" ? v : "device";
    saveSettings();
    lookChanged();
  } else if (input.name === "lang") {
    settings.lang = v === "sk" || v === "en" ? v : "auto";
    saveSettings();
    setLang(settings.lang);
    describePiles();
    updateStatus();
    setLight($("light").dataset.v);
    fillSettings();
    fitSegs($("dlg-settings"));
  } else if (input.name === "tap") {
    settings.tapMode = v === "send" ? "send" : "select";
    saveSettings();
  } else if (input.name === "deck") {
    settings.deck = v === "crisp" ? "crisp" : "bold";
    saveSettings();
    lookChanged();
  }
});

function onSwitch(id, apply) {
  $(id).addEventListener("change", (e) => {
    apply(e.target.checked);
    saveSettings();
  });
}
onSwitch("opt-autoplay", (v) => {
  settings.autoPlay = v;
});
onSwitch("opt-hints", (v) => {
  settings.hints = v;
  updateControls();
});
onSwitch("opt-finish", (v) => {
  settings.autoFinish = v;
});
onSwitch("opt-targets", (v) => {
  settings.showTargets = v;
});
onSwitch("opt-clock", (v) => {
  settings.clock = v;
  updateStatus();
  fitBands();
});
onSwitch("opt-light", (v) => {
  settings.light = v;
  checkPosition();
});
onSwitch("opt-right", (v) => {
  settings.cellsRight = v;
  relayout();
});
onSwitch("opt-four", (v) => {
  settings.four = v;
  lookChanged();
});
onSwitch("opt-contrast", (v) => {
  settings.contrast = v;
  lookChanged();
});

// The phone switching between light and dark repaints the table.
if (darkQuery && typeof darkQuery.addEventListener === "function")
  darkQuery.addEventListener("change", () => {
    if (game) lookChanged();
  });

// ---- life cycle
document.addEventListener("visibilitychange", () => {
  if (!game) return;
  syncTimer();
  if (document.hidden) {
    persist(true);
    Store.flush();
  }
});
window.addEventListener("pagehide", () => {
  persist(true);
  Store.flush();
});
// Inside Zapli the host also says when the app goes to the background (no permission needed); the solver stops
// then, so a game in the background costs no battery.
if (host && host.app && typeof host.app.on === "function") {
  try {
    host.app.on("pause", () => {
      hostPaused = true;
      Solver.stop();
      if (!game) return;
      syncTimer();
      persist(true);
      Store.flush();
    });
    host.app.on("resume", () => {
      hostPaused = false;
      if (!game) return;
      syncTimer();
      checkPosition();
    });
  } catch (e) {
    // An older host without these events: the page events above still save.
  }
}

function boot() {
  applyLook();
  setLang(settings.lang);
  applyLayout();
  if (restore(Store.get("game"))) {
    render({ animate: false });
    syncTimer();
    afterChange();
  } else {
    newGame({ quiet: true });
  }
  // Only on the very first game, before its first move.
  $("first-help").hidden = !!progress.firstHelp || game.history.length > 0;
  updateTurnTip();
  if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe(table);
  else window.addEventListener("resize", relayout);
}

// The page draws at once from this device's copies; inside Zapli it first waits briefly for the app's own store,
// whose copies win when they are newer.
async function start() {
  applyLook();
  if (host) {
    const changed = await Store.loadKv(host);
    if (changed) {
      settings = normSettings(Store.get("settings"));
      stats = normStats(Store.get("stats"));
      progress = normProgress(Store.get("progress"));
    }
  }
  boot();
}

start();
