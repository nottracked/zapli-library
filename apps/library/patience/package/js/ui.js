// Patience: the page. Three games on one table (Pyramid, Golf and Peaks), chosen from a picker whose tiles show each
// game's table as it stands. It draws the table, takes taps, drags and keys, keeps the three games, the settings and
// the statistics, and asks the solver's worker whether the position can still be won.
import * as Rules from "./rules.js";
import { createSearch, finishPath } from "./solver.js";
import { DEALS } from "./deals.js";
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
  dayKey,
  formatTime,
  formatRate,
  formatDay,
  formatNumber,
  openDialog,
  closeDialog,
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

const GAMES = Rules.GAMES;
const Store = createStore("patience", ["settings", "stats", "progress", "game-pyramid", "game-golf", "game-peaks"]);

// ---- settings, statistics and progress
const prefersMoreContrast = () => !!(window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches);

// Known fields are checked; fields this version does not know are kept for later versions.
function normSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const out = Object.assign({}, s);
  delete out.none;
  delete out.at;
  const rules = s.rules && typeof s.rules === "object" ? s.rules : {};
  return Object.assign(out, {
    size: SIZES.includes(s.size) ? s.size : null,
    four: s.four === true,
    contrast: typeof s.contrast === "boolean" ? s.contrast : prefersMoreContrast(),
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : "device",
    shape: SHAPE_IDS.includes(s.shape) ? s.shape : "rect",
    back: BACK_IDS.includes(s.back) ? s.back : "stripes",
    table: TABLE_IDS.includes(s.table) ? s.table : "felt",
    lang: s.lang === "sk" || s.lang === "en" ? s.lang : "auto",
    deck: s.deck === "crisp" ? "crisp" : "bold",
    // The stock is the control tapped most after the cards, so it sits where a right thumb reaches it.
    stockRight: s.stockRight !== false,
    rules: {
      pyramid: Rules.normOpts("pyramid", rules.pyramid),
      golf: Rules.normOpts("golf", rules.golf),
      peaks: Rules.normOpts("peaks", rules.peaks),
    },
    deals: s.deals === "any" ? "any" : "winnable",
    hints: s.hints !== false,
    autoFinish: s.autoFinish !== false,
    // Off by default: outlining the cards that can be played would give every move away.
    showTargets: s.showTargets === true,
    clock: s.clock === true,
    light: s.light !== false,
    vibration: s.vibration !== false,
  });
}

const blankStats = () => ({
  played: 0,
  won: 0,
  streak: 0,
  bestStreak: 0,
  bestTime: null,
  fewestMoves: null,
  bestRun: 0,
});

function normStats(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const g of GAMES) {
    const v = saved[g] || {};
    const b = blankStats();
    for (const k of Object.keys(b)) if (typeof v[k] === "number" && Number.isFinite(v[k]) && v[k] >= 0) b[k] = v[k];
    out[g] = b;
  }
  return out;
}

// The deals already handed out per list (so a winnable deal repeats only after the whole list), the daily deals won
// by game and date, the first-start lines already seen and the game played last.
function normProgress(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const out = Object.assign({}, p);
  delete out.none;
  delete out.at;
  out.cursor = p.cursor && typeof p.cursor === "object" ? Object.assign({}, p.cursor) : {};
  const daily = p.daily && typeof p.daily === "object" ? p.daily : {};
  out.daily = {};
  for (const g of GAMES) out.daily[g] = daily[g] && typeof daily[g] === "object" ? Object.assign({}, daily[g]) : {};
  out.firstHelp = p.firstHelp && typeof p.firstHelp === "object" ? Object.assign({}, p.firstHelp) : {};
  out.last = GAMES.includes(p.last) ? p.last : null;
  out.view = p.view === "game" ? "game" : "picker";
  return out;
}

// ---- page state
Store.loadLocal();
let settings = normSettings(Store.get("settings"));
let stats = normStats(Store.get("stats"));
let progress = normProgress(Store.get("progress"));
const games = { pyramid: null, golf: null, peaks: null };
let gid = progress.last || "pyramid"; // the game on the table (or the last one, while the picker shows)
let game = null; // games[gid]
let view = "picker";
let geo = null;
let textScale = 1;
let busy = false;
let finishPlan = null;
let runningSince = null;
let ticker = null;
let ticks = 0;
let appliedTheme = null;
let hostPaused = false;
let canBuzz = false;
let noticeKind = "";

const isDark = () => settings.theme === "dark" || (settings.theme === "device" && !!(darkQuery && darkQuery.matches));
const look = (over) =>
  Object.assign(
    { back: settings.back, deck: settings.deck, table: settings.table, dark: isDark(), contrast: settings.contrast },
    over || {},
  );
const state = () => game.states[game.states.length - 1];
const gameName = (g) => t("gameName")[g];

// ---- the table's cards and places
const cardEls = [];
for (let id = 0; id < 52; id++) {
  const el = buildCard(Rules.suitOf(id), Rules.rankOf(id));
  el.dataset.id = String(id);
  cardEls.push(el);
  table.appendChild(el);
}

function makeSlot(cls, mark) {
  const el = document.createElement("div");
  el.className = `slot ${cls}`;
  el.setAttribute("aria-hidden", "true");
  if (mark) el.appendChild(svgUse(mark, "ico"));
  el.hidden = true;
  table.insertBefore(el, table.firstChild);
  return el;
}

const slots = {
  stock: makeSlot("stock-slot", "i-recycle"),
  waste: makeSlot("waste-slot"),
  out: makeSlot("out-slot"),
  cols: [0, 1, 2, 3, 4, 5, 6].map(() => makeSlot("col-slot")),
};
// The stock is a button of its own over its cards, so a screen reader and the keyboard reach it too.
const stockBtn = document.createElement("div");
stockBtn.className = "stock-hit";
stockBtn.setAttribute("role", "button");
stockBtn.tabIndex = 0;
table.appendChild(stockBtn);
const badge = document.createElement("span");
badge.className = "stock-badge";
badge.setAttribute("aria-hidden", "true");
stockBtn.appendChild(badge);
const passDots = document.createElement("span");
passDots.className = "pass-dots";
passDots.setAttribute("aria-hidden", "true");
stockBtn.appendChild(passDots);
const outBadge = document.createElement("span");
outBadge.className = "stock-badge out-badge";
outBadge.setAttribute("aria-hidden", "true");
table.appendChild(outBadge);
const runChip = document.createElement("div");
runChip.className = "run-chip";
runChip.setAttribute("aria-hidden", "true");
runChip.hidden = true;
table.appendChild(runChip);

const cardName = (id) =>
  t("card", {
    r: Rules.rankOf(id),
    s: Rules.suitOf(id),
    rank: t("ranks")[Rules.rankOf(id)],
    suit: t("suits")[Rules.suitOf(id)],
  });

// ---- layout
const currentSize = () => settings.size || autoSize(textScale);

// Each game's table for an area of W × H: the card width and every place, upright (the stock row under the
// tableau) or with side rails (a wide, low area such as a phone held sideways: the stock and the waste beside it).
// `mini` draws the picker's small tables: no rails, the smallest margins.
// How much of a card's width shows in Peaks' fanned rows (upright on a phone).
const PEAKS_FAN = 0.66;

function measure(g, W, H, size, shape, deck, mini, Hs) {
  const tier = mini ? 0 : Math.max(0, SIZES.indexOf(size));
  const lk = look(deck ? { deck } : null);
  // Ten cards across (Peaks) take tighter margins and gaps than seven.
  const side = mini ? 1 : g === "peaks" ? [6, 4, 3][tier] : [8, 5, 3][tier];
  const gap = mini ? (g === "peaks" ? 1 : 2) : g === "peaks" ? [3, 2, 2][tier] : [6, 4, 3][tier];
  const rowGap = mini ? 5 : [16, 13, 10][tier];
  const right = settings.stockRight;
  const across = g === "peaks" ? 10 : 7;
  const geoAt = (cw) => cardGeo(cw, tier, mini ? "rect" : shape, gap, lk);
  // A covered card shows at least a squeezed band (its suit and most of its rank, as a fanned column does), so the
  // largest card size makes the cards bigger, never the tableau taller than the table.
  const minStep = (c) =>
    g === "pyramid"
      ? Math.max(c.fs + 2, Math.round(c.ch * 0.36))
      : g === "golf"
        ? Math.max(c.fs, Math.round(c.ch * 0.26))
        : Math.max(c.fu + 2, Math.round(c.ch * 0.5));
  const tight = (c) => (g === "golf" ? 4 : g === "pyramid" ? 6 : 3) * minStep(c) + c.ch;
  // Upright: the widest card that fits the width, with the stock row under the tableau. Peaks' ten across would
  // leave small cards on a phone held upright, so there the cards of a row overlap a little, as a hand of cards fans
  // out: each still shows its rank (in Peaks only ranks count), and the cards grow by about half.
  const upright = (stepOf, widest) => {
    let c = null;
    for (let cw = Math.min(124, widest); cw >= 10; cw--) {
      c = geoAt(cw);
      if ((across - 1) * stepOf(c) + c.cw <= W - 2 * side && tight(c) + rowGap + c.ch <= H) break;
    }
    return c;
  };
  let up = upright((c) => c.cw + gap, Math.floor((W - 2 * side - (across - 1) * gap) / across));
  let overlap = false;
  if (g === "peaks" && up.cw < 56) {
    const fanned = upright((c) => Math.round(c.cw * PEAKS_FAN), Math.floor((W - 2 * side) / (1 + 9 * PEAKS_FAN)));
    if (fanned.cw > up.cw) {
      up = fanned;
      overlap = true;
    }
  }
  // Sideways: the tableau in the middle and a rail of one card at the stock's side (Pyramid: the cards taken away
  // in a rail at the other side), so the tableau gets the whole height.
  let rail = null;
  if (!mini && W > H * 1.15) {
    const rails = g === "pyramid" ? 2 : 1;
    const railGap = [14, 10, 8][tier];
    for (
      let cw = Math.min(124, Math.floor((W - 2 * side - (across - 1) * gap - rails * railGap) / (across + rails)));
      cw >= 10;
      cw--
    ) {
      rail = geoAt(cw);
      const fanY = Math.max(rail.fu, Math.round(rail.ch * 0.22));
      if (tight(rail) <= H && rail.ch + 10 + 2 * fanY + rail.ch <= H) break;
    }
    if (rail && rail.cw <= up.cw * 1.06) rail = null;
  }
  const c = rail || up;
  const land = !!rail;
  const out = Object.assign(c, { W, H, size, game: g, land, mini: !!mini, right });
  // The step from one card of a row to the next.
  const col = overlap && !land ? Math.round(c.cw * PEAKS_FAN) : c.cw + gap;
  out.colStep = col;
  // The tableau: spread out a little where the height allows.
  const roomH = land ? H : H - rowGap - c.ch;
  const tabW = (across - 1) * col + c.cw;
  let tabH;
  if (g === "pyramid") {
    out.step = Math.min(Math.round(c.ch * 0.56), Math.max(minStep(c), Math.floor((roomH - c.ch) / 6)));
    tabH = 6 * out.step + c.ch;
  } else if (g === "golf") {
    out.fan = Math.min(Math.round(c.ch * 0.42), Math.max(minStep(c), Math.floor((roomH - c.ch) / 4)));
    tabH = 4 * out.fan + c.ch;
  } else {
    out.step = Math.min(Math.round(c.ch * 0.62), Math.max(minStep(c), Math.floor((roomH - c.ch) / 3)));
    tabH = 3 * out.step + c.ch;
  }
  out.fanX = Math.max(4, Math.round(c.cw * (mini ? 0.22 : 0.3)));
  out.fanY = Math.max(c.fu, Math.round(c.ch * 0.22));
  if (land) {
    const railGap = [14, 10, 8][tier];
    const rails = g === "pyramid" ? 2 : 1;
    const used = tabW + rails * (c.cw + railGap);
    const x0 = Math.max(0, Math.round((W - used) / 2));
    // The stock's rail at one side, the tableau, and (Pyramid) the rail of cards taken away at the other.
    const leftRail = x0;
    const tabX = rails === 2 || !right ? x0 + c.cw + railGap : x0;
    const rightRail = tabX + tabW + railGap;
    const stockX = right ? rightRail : leftRail;
    out.tabX = tabX;
    out.tabY = Math.max(0, Math.min(Math.round(((Hs || H) - tabH) / 2), H - tabH));
    out.stock = [stockX, 0];
    out.waste = [stockX, c.ch + 10 + 2 * out.fanY];
    out.wasteDir = [0, -1];
    out.out = [right ? leftRail : rightRail, 0];
    out.chip = [stockX + c.cw / 2, out.waste[1] + c.ch + 8, "below"];
  } else {
    const x0 = Math.max(0, Math.round((W - tabW) / 2));
    const total = tabH + rowGap + c.ch;
    // Centred in the height the table has without the lines in the bottom band, so a message, the bar or a tip
    // coming or going there does not move the cards (unless the space runs out).
    const y0 = Math.max(0, Math.min(Math.floor(((Hs || H) - total) / 2), H - total));
    out.tabX = x0;
    out.tabY = y0;
    const rowY = y0 + tabH + rowGap;
    const at = (k) => x0 + Math.round(k * col);
    const last = across - 1;
    out.stock = [at(right ? last : 0), rowY];
    if (g === "pyramid") {
      out.waste = [at(right ? 4 : 2.6), rowY];
      out.out = [at(right ? 0 : last), rowY];
    } else {
      out.waste = [at(right ? (across === 10 ? 5.5 : 3.6) : across === 10 ? 3.5 : 3.4), rowY];
      out.out = out.waste;
    }
    out.wasteDir = [-1, 0];
    // Peaks' run beside the waste, on the side away from the stock.
    out.chip = right
      ? [out.waste[0] - 3 * out.fanX - 10, rowY + c.ch / 2, "left"]
      : [out.waste[0] + c.cw + 10, rowY + c.ch / 2, "right"];
  }
  return out;
}

// Where every card lies: {x, y, z, up, free, loc} by card id, and the places to show.
function layoutOf(s, gm) {
  const cards = new Array(52);
  // strip: how much of a covered card shows (its band shrinks to fit when that is less than a full band).
  const put = (id, x, y, z, up, free, loc, strip) => {
    cards[id] = { x: Math.round(x), y: Math.round(y), z, up, free, loc, strip: strip || 0 };
  };
  const g = s.game;
  const col = gm.colStep;
  // The stock: one pile, the next card on top. The waste: its top card at its place, the two before it fanned out
  // behind it so a run can be followed (Golf and Peaks show three).
  const stockIds = g === "pyramid" ? Rules.stockCards(s) : s.stock.slice(s.sp);
  stockIds.forEach((id, k) =>
    put(id, gm.stock[0], gm.stock[1], 200 + stockIds.length - k, false, false, { pile: "stock" }),
  );
  const wasteIds = g === "pyramid" ? Rules.wasteCards(s) : s.waste;
  const showFan = g === "pyramid" ? 2 : 3;
  wasteIds.forEach((id, k) => {
    const depth = Math.min(showFan, wasteIds.length - 1 - k);
    const x = gm.waste[0] + gm.wasteDir[0] * gm.fanX * depth;
    const y = gm.waste[1] + gm.wasteDir[1] * gm.fanY * depth;
    const isTop = k === wasteIds.length - 1;
    put(id, x, y, 300 + k, true, g === "pyramid" && isTop, { pile: "waste", top: isTop });
  });
  if (g === "pyramid") {
    s.out.forEach((id, k) => put(id, gm.out[0], gm.out[1], 400 + k, true, false, { pile: "out" }));
    for (let i = 0; i < 28; i++) {
      const id = s.pyr[i];
      if (id < 0) continue;
      const r = Rules.PYR_ROW[i];
      const x = gm.tabX + ((6 - r) * col) / 2 + Rules.PYR_COL[i] * col;
      const covered = Rules.PYR_COVER[i].some((j) => s.pyr[j] >= 0);
      put(id, x, gm.tabY + r * gm.step, 10 + i, true, Rules.pyrFree(s, i), { pile: "pyr", i }, covered ? gm.step : 0);
    }
  } else if (g === "golf") {
    s.cols.forEach((c, i) =>
      c.forEach((id, j) => {
        const top = j === c.length - 1;
        put(
          id,
          gm.tabX + i * col,
          gm.tabY + j * gm.fan,
          10 + i * 6 + j,
          true,
          top,
          { pile: "col", i, j },
          top ? 0 : gm.fan,
        );
      }),
    );
  } else {
    for (let i = 0; i < 28; i++) {
      if (s.gone[i]) continue;
      const x = gm.tabX + (Rules.PEAK_X[i] * col) / 2;
      const covered = Rules.PEAK_COVER[i].some((j) => !s.gone[j]);
      put(
        s.cards[i],
        x,
        gm.tabY + Rules.PEAK_ROW[i] * gm.step,
        10 + i,
        Rules.peakUp(s, i),
        Rules.peakFree(s, i),
        { pile: "peak", i },
        covered ? gm.step : 0,
      );
    }
  }
  return cards;
}

// In the landscape band, icons only when the words do not fit. A game's header too narrow for every tool (large
// text, the clock on) hides the statistics, then the daily deal: the picker keeps both.
function fitBands() {
  root.classList.remove("compact", "tight", "tighter");
  const top = document.querySelector(".top");
  const bar = document.querySelector(".toolbar");
  const over = (el) => el.scrollWidth > el.clientWidth + 1;
  if (window.matchMedia && window.matchMedia("(orientation: landscape) and (max-height: 540px)").matches)
    root.classList.toggle("compact", over(top) || over(bar));
  root.classList.remove("tighter");
  root.classList.toggle("tight", over(top));
  if (over(top)) root.classList.add("tighter");
}

function applyLayout() {
  fitBands();
  textScale = measureTextScale($("tz-probe"));
  root.style.setProperty("--tz", String(textScale));
  if (view === "picker") return;
  // The lines in the bottom band (a message, the bar, the first start's line, the sideways tip) count for the
  // height the cards are centred in, so they never move the cards.
  const band = ["notice", "verdict", "first-help", "turn-tip"].reduce(
    (n, id) => n + ($(id).hidden ? 0 : ($(id).offsetHeight || 0) + 6),
    0,
  );
  const H = table.clientHeight;
  geo = measure(gid, table.clientWidth, H, currentSize(), settings.shape, null, false, H + band);
  applyGeo(table, geo, cardEls);
  table.classList.toggle("rails", geo.land);
  table.dataset.game = gid;
  BACK_IDS.forEach((b) => table.classList.toggle(`bk-${b}`, b === settings.back));
}

// ---- drawing the position
let last = []; // where each card was drawn last: {x, y, up}
let targets = []; // what a tap can reach, topmost first: {kind, id?, x, y, w, h}

function render(opts = {}) {
  if (!game || view === "picker" || !geo) return;
  const s = state();
  const L = layoutOf(s, geo);
  const animate = opts.animate !== false && motionOK() && typeof cardEls[0].animate === "function";
  const active = document.activeElement;
  const focusId = active && active.classList && active.classList.contains("card") ? Number(active.dataset.id) : -1;
  clearDrag();
  if (!opts.keepMarks) clearHint();
  const dealFrom = opts.deal ? geo.stock : null;
  const order = [];
  cardEls.forEach((el, id) => {
    const p = L[id];
    const before = last[id];
    setPos(el, p.x, p.y);
    el.style.zIndex = String(p.z);
    el.classList.toggle("down", !p.up);
    el.classList.toggle("free", !!p.free);
    el.classList.toggle("tab", p.loc.pile === "pyr" || p.loc.pile === "col" || p.loc.pile === "peak");
    el.classList.remove("sel", "sel-one", "partner", "can");
    fitBand(el, geo, p.up ? p.strip : 0);
    if (p.free) {
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute(
        "aria-label",
        p.loc.pile === "waste" ? t("wasteLabel", { card: cap(cardName(id)) }) : cap(cardName(id)),
      );
      el.removeAttribute("aria-hidden");
    } else {
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
      el.removeAttribute("aria-label");
      el.setAttribute("aria-hidden", "true");
    }
    if (animate && (dealFrom || (before && (before.x !== p.x || before.y !== p.y || before.up !== p.up))))
      order.push({ el, id, p, before });
    last[id] = { x: p.x, y: p.y, up: p.up, pile: p.loc.pile, free: !!p.free };
  });
  placeExtras(s, L);
  buildTargets(s, L);
  if (selection) markSelection();
  if (order.length) animateCards(order, dealFrom);
  if (focusId >= 0) {
    const el = cardEls[focusId];
    if (el.getAttribute("tabindex") === "0" && document.activeElement !== el) el.focus({ preventScroll: true });
  }
  showTargets();
  updateStatus();
  updateControls();
}

// The places under the cards, the stock's count and its passes, the cards taken away and Peaks' run.
function placeExtras(s, L) {
  const g = s.game;
  const show = (el, x, y, on) => {
    el.hidden = !on;
    if (on) setPos(el, x, y);
  };
  const left = Rules.stockLeft(s);
  show(slots.stock, geo.stock[0], geo.stock[1], true);
  slots.stock.classList.toggle("can-recycle", g === "pyramid" && Rules.canRedeal(s));
  show(slots.waste, geo.waste[0], geo.waste[1], true);
  show(slots.out, geo.out[0], geo.out[1], g === "pyramid");
  slots.cols.forEach((el, i) => show(el, geo.tabX + i * (geo.cw + geo.gap), geo.tabY, g === "golf"));
  setPos(stockBtn, geo.stock[0], geo.stock[1]);
  stockBtn.style.zIndex = "290";
  badge.textContent = String(left);
  badge.hidden = left === 0;
  stockBtn.setAttribute(
    "aria-label",
    left
      ? t("stockLabel", { cards: tn("nCards", left) })
      : g === "pyramid" && Rules.canRedeal(s)
        ? t("stockRedealLabel")
        : t("stockEmptyLabel"),
  );
  // Pyramid's passes: one dot for each time through the stock, the ones still to come hollow.
  passDots.textContent = "";
  const passes = g === "pyramid" ? s.opts.passes : 0;
  passDots.hidden = !passes || passes < 2;
  if (passes > 1)
    for (let k = 1; k <= passes; k++) {
      const dot = document.createElement("i");
      if (k <= s.pass) dot.className = "on";
      passDots.appendChild(dot);
    }
  if (g === "pyramid") {
    stockBtn.title = passes ? t("passesLabel", { n: s.pass, of: passes }) : t("passesFreeLabel", { n: s.pass });
    outBadge.hidden = !s.out.length;
    outBadge.textContent = String(s.out.length);
    setPos(outBadge, geo.out[0], geo.out[1]);
    outBadge.style.zIndex = "460";
    slots.out.setAttribute("aria-label", t("outLabel", { cards: tn("nCards", s.out.length) }));
  } else {
    outBadge.hidden = true;
    stockBtn.removeAttribute("title");
  }
  // Peaks: the run of cards played from the peaks since the last card turned.
  if (g === "peaks" && s.run >= 2) {
    const was = runChip.hidden ? 0 : Number(runChip.dataset.n || 0);
    runChip.hidden = false;
    runChip.dataset.n = String(s.run);
    runChip.textContent = "";
    const lbl = document.createElement("span");
    lbl.textContent = t("run");
    const n = document.createElement("b");
    n.textContent = String(s.run);
    runChip.append(lbl, n);
    runChip.classList.toggle("hot", s.run >= 5);
    runChip.dataset.side = geo.chip[2];
    setPos(runChip, geo.chip[0], geo.chip[1]);
    const base = { left: "translate(-100%, -50%)", right: "translate(0, -50%)", below: "translate(-50%, 0)" }[
      geo.chip[2]
    ];
    if (s.run > was && motionOK() && typeof runChip.animate === "function")
      runChip.animate([{ transform: `${base} scale(1.3)` }, { transform: `${base} scale(1)` }], {
        duration: 280,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
  } else {
    runChip.hidden = true;
    runChip.dataset.n = "0";
  }
}

function buildTargets(s, L) {
  targets = [];
  L.forEach((p, id) => {
    if (p.free) targets.push({ kind: "card", id, x: p.x, y: p.y, w: geo.cw, h: geo.ch, z: p.z });
  });
  targets.push({ kind: "stock", x: geo.stock[0], y: geo.stock[1], w: geo.cw, h: geo.ch, z: 250 });
  targets.sort((a, b) => b.z - a.z);
}

function animateCards(order, dealFrom) {
  // The deal: every card flies from the stock in the order it is dealt, the whole deal within about 0.6 s.
  if (dealFrom) order.sort((a, b) => a.p.z - b.p.z);
  const stagger = dealFrom ? Math.min(16, 560 / Math.max(1, order.length)) : 0;
  order.forEach(({ el, p, before }, k) => {
    if (typeof el.getAnimations === "function") el.getAnimations().forEach((a) => a.cancel());
    const from = dealFrom ? { x: dealFrom[0], y: dealFrom[1], up: false } : before;
    const dx = from.x - p.x;
    const dy = from.y - p.y;
    const flipped = from.up !== p.up;
    const dist = Math.hypot(dx, dy);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)${flipped ? " scaleX(0.12)" : ""}` },
        { transform: "translate(0px, 0px)" },
      ],
      {
        duration: dealFrom ? 300 : Math.min(360, 170 + dist * 0.35),
        delay: dealFrom ? k * stagger : 0,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      },
    );
  });
}

// ---- status, controls and messages
const elapsedNow = () => game.elapsed + (runningSince !== null ? Date.now() - runningSince : 0);

function updateStatus() {
  if (!game) return;
  $("moves").textContent = String(game.moves.length);
  labelLight();
  $("time").textContent = formatTime(elapsedNow());
  $("stat-time").hidden = !settings.clock;
}

function tick() {
  updateStatus();
  ticks += 1;
  if (ticks % 15 === 0) persist();
}

// The clock runs from the first move until the win, and only while the game is on screen.
function syncTimer() {
  const run = !!game && view !== "picker" && game.started && !game.won && !document.hidden && !hostPaused;
  if (run) {
    if (runningSince === null) runningSince = Date.now();
    if (!ticker) ticker = window.setInterval(tick, 1000);
  } else {
    if (runningSince !== null && game) {
      game.elapsed += Date.now() - runningSince;
    }
    runningSince = null;
    if (ticker) {
      window.clearInterval(ticker);
      ticker = null;
    }
  }
  updateStatus();
}

// Once the rest of the tableau can be cleared without the stock, Finish plays it (only near the end, where the
// search is tiny).
let finishCache = { key: "", path: null };
function planFinish() {
  if (busy || !game || game.won || view === "picker") return null;
  const s = state();
  if (Rules.tableauLeft(s) > 14) return null;
  const k = posKey(s);
  if (finishCache.key !== k) finishCache = { key: k, path: finishPath(s, 20000) };
  return finishCache.path;
}

let autoFinishTimer = null;
function updateControls() {
  if (!game) return;
  $("btn-undo").disabled = busy || game.won || !game.moves.length;
  $("btn-hint").disabled = busy || game.won;
  $("btn-hint").hidden = !settings.hints;
  finishPlan = planFinish();
  $("btn-finish").hidden = !finishPlan;
  window.clearTimeout(autoFinishTimer);
  if (finishPlan && settings.autoFinish) autoFinishTimer = window.setTimeout(runFinish, 500);
  fitBands();
}

// A message stays until the player's next action (a move, Undo, a new game or a tap on it), never only a few
// seconds; an empty one never shows.
function notice(text, kind = "info", action) {
  if (!text) {
    hideNotice();
    return;
  }
  $("notice-text").textContent = text;
  $("btn-look").hidden = action !== "look";
  $("notice").hidden = false;
  noticeKind = kind;
}

function hideNotice(kind) {
  if (kind && noticeKind !== kind) return;
  $("notice").hidden = true;
  $("notice-text").textContent = "";
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
  if (!el || !motionOK() || typeof el.animate !== "function") return;
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

// Vibration through Zapli's haptics, when the phone has them and the player has not turned it off.
function buzz(kind) {
  if (!canBuzz || !settings.vibration) return;
  try {
    host.haptics.impact(kind).catch(() => {});
  } catch (e) {
    // no haptics after all: the game goes on without them
  }
}

function clearHint() {
  cardEls.forEach((el) => el.classList.remove("hinted"));
  stockBtn.classList.remove("hint-target");
  slots.stock.classList.remove("hint-target");
}

// ---- the solver: a worker of its own, so the game never waits; on the page itself, in short slices, only when a
// worker cannot start. Budgets: [ms, positions].
const BUDGET = { check: [4000, 1500000], hint: [6000, 2500000], long: [20000, 6000000], last: [1500, 600000] };

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
    const one = async (st, ms, nodes) => {
      const search = createSearch(st, { maxNodes: nodes });
      const end = Date.now() + ms;
      for (;;) {
        const status = search.step(8);
        if (seq !== id) return null;
        if (status !== "running") return { status, path: search.path };
        if (Date.now() > end) return { status: "limit", path: null };
        await pause();
      }
    };
    if (job.type === "check") return one(job.state, job.ms, job.nodes);
    for (let i = 0; i < job.states.length; i++) {
      const r = await one(job.states[i], job.ms, job.nodes);
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
// Verdicts by position key: "win" or "lost"; "not sure" is never kept. A winning path the solver found is kept as
// `plan`: keys[i] is the position before moves[i], so a player who follows it needs no new search.
const verdicts = new Map();
let plan = null;
let lightTimer = null;
let backTo = -1;
let hintWanted = false;
let longLook = false;
let shownVerdict = "off";

const posKey = (s) => Rules.key(s);

function keepPlan(s, path) {
  const t0 = Rules.clone(s);
  const keys = [];
  const moves = [];
  for (const m of path) {
    if (!Rules.canMove(t0, m)) break;
    keys.push(posKey(t0));
    moves.push(m);
    Rules.apply(t0, m);
  }
  keys.forEach((k) => verdicts.set(k, "win"));
  verdicts.set(posKey(t0), "win");
  plan = { keys, moves };
}

// A listed deal (winnable or daily) was won offline, so its start can be won, whatever the budget here finds.
function trustListedStart() {
  if (game.deal.kind !== "any") verdicts.set(posKey(game.states[0]), "win");
}

function planMove(k) {
  if (!plan) return null;
  const i = plan.keys.indexOf(k);
  return i >= 0 ? plan.moves[i] : null;
}

function lightWords(v) {
  return t(
    { win: "lightWin", lost: "lightLost", unsure: "lightUnsure", checking: "lightChecking", off: "lightOff" }[v],
  );
}

// The moves and the light are one button: its words say both, and a tap explains the light.
function labelLight() {
  if (!game) return;
  $("btn-light").setAttribute(
    "aria-label",
    `${t("moves")}: ${game.moves.length}. ${lightWords(shownVerdict)}. ${t("lightTap")}`,
  );
}

function explainLight() {
  const v = settings.light ? shownVerdict : "off";
  const key = { win: "lightTipWin", lost: "lightTipLost", unsure: "lightTipUnsure", checking: "lightTipUnsure" }[v];
  notice(t(key || "lightTipOff"), "light");
  if (!progress.lightSeen) {
    progress.lightSeen = true;
    saveProgress();
  }
}

// The first time the green light shows after a move, one line says what it means (it stays until the next move).
function introduceLight() {
  if (progress.lightSeen || !settings.light || shownVerdict !== "win" || !game || !game.moves.length) return;
  if (!$("notice").hidden) return;
  progress.lightSeen = true;
  saveProgress();
  notice(t("lightIntro"), "light");
}

function setLight(v) {
  const el = $("light");
  const shown = settings.light ? v : "off";
  shownVerdict = shown;
  el.dataset.v = shown;
  el.title = lightWords(shown);
  el.hidden = shown === "off";
  labelLight();
  if (shown === "win") introduceLight();
  if (game && v !== "off" && v !== "checking") game.verdict = v === "win" || v === "lost" ? v : null;
}

// The bar above the buttons: "no moves left" with Undo (or the way back), Restart and New deal; or, with the light
// on, "can no longer be won" with the way back.
function showVerdictBar() {
  const bar = $("verdict");
  if (!game || game.won || view === "picker" || busy) {
    bar.hidden = true;
    return;
  }
  const s = state();
  const stuck = !Rules.anyMove(s);
  const lost = settings.light && shownVerdict === "lost";
  if (!stuck && !lost) {
    bar.hidden = true;
    return;
  }
  const n = game.moves.length - backTo;
  const canBack = settings.light && backTo >= 0 && n > 0;
  $("verdict-text").textContent = stuck ? t("stuck") : backTo < 0 ? t("lostAtStart") : t("lostNotice");
  $("btn-back").hidden = !canBack;
  $("back-text").textContent = t("backWinnable", { moves: tn("nMoves", n) });
  $("stuck-undo").hidden = !stuck || canBack || !game.moves.length;
  $("stuck-restart").hidden = !stuck || !game.moves.length;
  $("stuck-new").hidden = !stuck;
  bar.classList.toggle("stuck", stuck);
  bar.hidden = false;
}

// After every change: the light from what is known, else a question to the solver.
function checkPosition() {
  window.clearTimeout(lightTimer);
  if (!game || game.won || view === "picker") {
    setLight("off");
    showVerdictBar();
    return;
  }
  if (!settings.light && !hintWanted) {
    setLight("off");
    showVerdictBar();
    Solver.stop();
    return;
  }
  const s = state();
  const k = posKey(s);
  let known = planMove(k) ? "win" : verdicts.get(k);
  // A hint needs the path itself, which a verdict alone does not keep.
  if (hintWanted && known === "win" && !planMove(k)) known = null;
  if (known) {
    verdictKnown(known, k);
    return;
  }
  showVerdictBar();
  // "Checking" shows only when the answer takes a moment, so the light does not flicker.
  lightTimer = window.setTimeout(() => setLight("checking"), 400);
  const [ms, nodes] = longLook ? BUDGET.long : hintWanted ? BUDGET.hint : BUDGET.check;
  const asked = game;
  Solver.ask({ type: "check", state: Rules.clone(s), ms, nodes }).then((r) => {
    if (!r || game !== asked || posKey(state()) !== k) return;
    window.clearTimeout(lightTimer);
    if (r.status === "win" && r.path) keepPlan(s, r.path);
    else if (r.status === "win") verdicts.set(k, "win");
    else if (r.status === "lost") verdicts.set(k, "lost");
    verdictKnown(r.status === "win" ? "win" : r.status === "lost" ? "lost" : "unsure", k, true);
    updateControls();
  });
}

function verdictKnown(v, k, fresh) {
  setLight(v);
  if (v === "lost") {
    if (fresh && settings.light) announce(t("lostNotice"));
    findWayBack(k);
  } else showVerdictBar();
  if (hintWanted) {
    hintWanted = false;
    longLook = false;
    giveHint(v, k);
  }
}

// The most recent earlier position that can still be won: from the verdicts already known, else asked of the
// solver (newest first).
function findWayBack(k) {
  const keys = game.states.map(posKey);
  const h = game.moves.length;
  backTo = -1;
  const unknown = [];
  for (let j = h - 1; j >= 0; j--) {
    const v = verdicts.get(keys[j]);
    if (v === "win") {
      backTo = j;
      break;
    }
    if (v !== "lost" && unknown.length < 30) unknown.push(j);
  }
  if (!unknown.length) {
    showVerdictBar();
    return;
  }
  const states = unknown.map((j) => Rules.clone(game.states[j]));
  showVerdictBar();
  const [ms, nodes] = BUDGET.last;
  const asked = game;
  Solver.ask({ type: "last", states, ms, nodes }).then((r) => {
    if (!r || game !== asked || posKey(state()) !== k) return;
    if (r.index >= 0) {
      backTo = unknown[r.index];
      if (r.path) keepPlan(states[r.index], r.path);
      else verdicts.set(keys[backTo], "win");
    }
    showVerdictBar();
  });
}

function goBack() {
  if (busy || backTo < 0 || !game || game.won) return;
  dropSelection();
  game.states.length = backTo + 1;
  game.moves.length = backTo;
  game.used.undo = true;
  backTo = -1;
  render();
  announce(t("backDone"));
  afterChange();
  notice(t("backDone"));
}

// ---- the honest hint: always the next move of a real winning path, never just any legal move.
function showHint() {
  if (busy || !game || game.won) return;
  game.used.hint = true;
  dropSelection();
  clearHint();
  const k = posKey(state());
  const v = verdicts.get(k);
  if (planMove(k) || v === "lost") {
    giveHint(v || "win", k);
    return;
  }
  hintWanted = true;
  notice(t("hintThinking"), "hint");
  checkPosition();
}

function giveHint(v, k) {
  if (!game || posKey(state()) !== k) return;
  if (v === "lost") {
    notice(t("hintLost"), "hint");
    return;
  }
  const m = planMove(k);
  if (v !== "win" || !m) {
    notice(t("hintNone"), "hint", "look");
    return;
  }
  const s = state();
  const mark = (id) => cardEls[id].classList.add("hinted");
  if (m.t === "d" || m.t === "r") {
    stockBtn.classList.add("hint-target");
    notice(t(m.t === "d" ? "hintDraw" : "hintRedeal"), "hint");
  } else if (m.t === "c") {
    const id = s.game === "golf" ? s.cols[m.i][s.cols[m.i].length - 1] : s.cards[m.i];
    mark(id);
    notice(t("hintPlay", { card: cardName(id) }), "hint");
  } else if (m.t === "k" || m.t === "K") {
    const id = m.t === "k" ? s.pyr[m.i] : s.deck[Rules.wasteTop(s)];
    mark(id);
    notice(t("hintKing", { card: cardName(id) }), "hint");
  } else {
    const a = m.t === "p" ? s.pyr[m.i] : s.deck[Rules.wasteTop(s)];
    const b = m.t === "p" ? s.pyr[m.j] : s.pyr[m.i];
    mark(a);
    mark(b);
    notice(t("hintPair", { card: cardName(a), other: cardName(b) }), "hint");
  }
}

function lookLonger() {
  hideNotice();
  hintWanted = true;
  longLook = true;
  verdicts.delete(posKey(state()));
  notice(t("hintThinking"), "hint");
  checkPosition();
}

// ---- saving: the deal and the player's moves, so a game comes back exactly, Undo included.
function saveObject(g) {
  return {
    v: 1,
    deal: g.deal,
    steps: g.moves.map(Rules.moveText).join(" "),
    elapsed: g === game ? elapsedNow() : g.elapsed,
    started: g.started,
    used: g.used,
    verdict: g.verdict || null,
  };
}

function persist(now) {
  if (!game) return;
  Store.set(`game-${game.id}`, saveObject(game), now);
}

const saveStats = () => Store.set("stats", stats, true);
const saveSettings = () => Store.set("settings", settings, true);
const saveProgress = () => Store.set("progress", progress, true);

// What a game is: any deal, a winnable one, or a day's daily deal; with its seed and the rules it was dealt with.
function normDeal(g, d) {
  if (!d || typeof d !== "object" || !Number.isInteger(d.seed) || d.seed < 0 || d.seed > 4294967295) return null;
  const opts = Rules.normOpts(g, d.opts);
  if (d.kind === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) return { kind: "daily", day: d.day, seed: d.seed, opts };
  return { kind: d.kind === "winnable" ? "winnable" : "any", seed: d.seed, opts };
}

function freshGame(g, deal) {
  return {
    id: g,
    deal,
    states: [Rules.deal(g, deal.seed, deal.opts)],
    moves: [],
    elapsed: 0,
    started: false,
    won: false,
    used: { hint: false, undo: false },
    verdict: null,
  };
}

function restore(g, obj) {
  if (!obj || obj.v !== 1) return null;
  const deal = normDeal(g, obj.deal);
  if (!deal) return null;
  const out = freshGame(g, deal);
  const text = typeof obj.steps === "string" ? obj.steps.trim() : "";
  for (const word of text ? text.split(" ") : []) {
    const m = Rules.parseMove(word);
    const s = Rules.clone(out.states[out.states.length - 1]);
    if (!m || !Rules.canMove(s, m)) return null;
    Rules.apply(s, m);
    out.states.push(s);
    out.moves.push(m);
  }
  out.won = Rules.isWon(out.states[out.states.length - 1]);
  out.elapsed = typeof obj.elapsed === "number" && Number.isFinite(obj.elapsed) && obj.elapsed >= 0 ? obj.elapsed : 0;
  out.started = obj.started === true || out.moves.length > 0;
  out.used = { hint: !!(obj.used && obj.used.hint), undo: !!(obj.used && obj.used.undo) };
  out.verdict = obj.verdict === "win" || obj.verdict === "lost" ? obj.verdict : null;
  return out;
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

// ---- deals: the winnable lists and the daily deals
const dealList = (g, variant) => ((DEALS[g] && DEALS[g][variant]) || "").trim().split(/\s+/).filter(Boolean);

// The next deal of a list; each list is gone through once before a deal comes again.
function pickWinnable(g, variant) {
  const list = dealList(g, variant);
  if (!list.length) return null;
  const at = `${g}:${variant}`;
  let i = progress.cursor[at];
  if (!Number.isInteger(i) || i < 0) i = Math.floor((freshSeed() / 4294967296) * list.length);
  i %= list.length;
  progress.cursor[at] = (i + 1) % list.length;
  saveProgress();
  return parseInt(list[i], 36) >>> 0;
}

// The same deal for a date, every time: the date's place in the list for the game and its rules.
function dailySeed(g, day, opts) {
  const list = dealList(g, Rules.variantOf(g, opts));
  if (!list.length) return null;
  const [y, m, d] = day.split("-").map(Number);
  const index = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
  return parseInt(list[((index % list.length) + list.length) % list.length], 36) >>> 0;
}

function newDeal(g) {
  const opts = Rules.normOpts(g, settings.rules[g]);
  const seed = settings.deals === "winnable" ? pickWinnable(g, Rules.variantOf(g, opts)) : null;
  return seed === null ? { kind: "any", seed: freshSeed(), opts } : { kind: "winnable", seed, opts };
}

// ---- playing
function markStarted() {
  if (!$("first-help").hidden) dismissFirstHelp();
  if (game.started) return;
  game.started = true;
  stats[game.id].played += 1;
  saveStats();
  syncTimer();
}

function afterChange() {
  const s = state();
  if (Rules.isWon(s)) {
    win();
    return;
  }
  updateControls();
  // A hint belongs to the position it was asked for: a move, Undo or a new game ends it.
  hideNotice("hint");
  hintWanted = false;
  longLook = false;
  persist();
  checkPosition();
  showVerdictBar();
  updateTurnTip();
}

// Plays one move: the words for it, the new position and the checks.
function commit(m, quiet) {
  const prev = state();
  if (busy || game.won || !Rules.canMove(prev, m)) return false;
  hideNotice();
  dropSelection();
  const s = Rules.clone(prev);
  const cards = Rules.apply(s, m);
  game.states.push(s);
  game.moves.push(m);
  markStarted();
  render();
  if (!quiet) announce(moveWords(prev, s, m, cards));
  if (m.t !== "d" && m.t !== "r") buzz("light");
  afterChange();
  return true;
}

function moveWords(prev, s, m, cards) {
  const name = (id) => cardName(id);
  if (m.t === "d") return t("turnedUp", { card: name(cards[0]) });
  if (m.t === "r") {
    const n = s.pass;
    return s.opts.passes ? t("redealt", { n, of: s.opts.passes }) : t("redealtFree", { n });
  }
  if (m.t === "k" || m.t === "K") return t("kingAway", { card: name(cards[0]), Card: cap(name(cards[0])) });
  if (m.t === "p" || m.t === "w")
    return t("paired", { card: name(cards[0]), Card: cap(name(cards[0])), other: name(cards[1]) });
  let text = t("toWaste", { card: name(cards[0]), Card: cap(name(cards[0])) });
  // Peaks: the cards this move turned face up, and the run.
  if (s.game === "peaks") {
    for (let i = 0; i < 28; i++)
      if (!s.gone[i] && !Rules.peakUp(prev, i) && Rules.peakUp(s, i))
        text += ` ${t("turnedUp", { card: name(s.cards[i]) })}`;
    if (s.run >= 3) text += ` ${t("runLabel", { n: s.run })}.`;
  }
  return text;
}

function undo() {
  if (busy || !game || game.won || !game.moves.length) return;
  hideNotice();
  dropSelection();
  game.states.pop();
  game.moves.pop();
  game.used.undo = true;
  render();
  announce(t("undone"));
  afterChange();
}

function runFinish() {
  if (busy || !finishPlan || !game || game.won) return;
  dropSelection();
  hideNotice();
  const steps = finishPlan;
  busy = true;
  showVerdictBar();
  const playOne = (m) => {
    const s = Rules.clone(state());
    Rules.apply(s, m);
    game.states.push(s);
    game.moves.push(m);
  };
  if (!motionOK()) {
    steps.forEach(playOne);
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
    playOne(steps[n]);
    n += 1;
    render();
    buzz("light");
    window.setTimeout(next, 150);
  };
  next();
}

function dealGame(g, deal, opts = {}) {
  games[g] = freshGame(g, deal);
  if (g === gid) {
    game = games[g];
    plan = null;
    backTo = -1;
    trustListedStart();
  }
  if (!opts.noSave) Store.set(`game-${g}`, saveObject(games[g]));
}

function newGame(opts = {}) {
  if (game && game.started && !game.won) {
    stats[game.id].streak = 0;
    saveStats();
  }
  dropSelection();
  syncTimerStop();
  const deal = normDeal(gid, opts.deal) || newDeal(gid);
  dealGame(gid, deal, { noSave: true });
  hideNotice();
  render({ deal: opts.quiet !== true, animate: opts.quiet !== true });
  syncTimer();
  if (!opts.quiet)
    announce(
      deal.kind === "daily" ? t("dailyOf", { date: formatDay(deal.day) }) : t("newGameSr", { game: gameName(gid) }),
    );
  updateNextNote();
  afterChange();
  updateFirstHelp();
}

function syncTimerStop() {
  if (runningSince !== null && game) game.elapsed += Date.now() - runningSince;
  runningSince = null;
  if (ticker) {
    window.clearInterval(ticker);
    ticker = null;
  }
}

let pendingNew = {};
function askNewGame(opts) {
  if (busy) return;
  pendingNew = opts || {};
  // A game with no move left is over: a new deal needs no question.
  const over = !Rules.anyMove(state());
  if (game.started && !game.won && game.moves.length > 0 && !over) openDialog($("dlg-new"));
  else newGame(pendingNew);
}

function restartDeal() {
  if (busy || !game) return;
  newGame({ deal: game.deal });
}

// ---- the daily deal
function playDaily(day, g) {
  const target = g || gid;
  const opts = Rules.normOpts(target, settings.rules[target]);
  const seed = dailySeed(target, day, opts);
  if (seed === null) return;
  closeDialog($("dlg-daily"));
  if (target !== gid || view === "picker") openGame(target, { push: true });
  askNewGame({ deal: { kind: "daily", day, seed, opts } });
}

// Days in a row, up to today (or yesterday, while today's deal is still to play), whose daily deal was solved.
function dailyStreak(g) {
  const won = (key) => !!(progress.daily[g][key] && progress.daily[g][key].won);
  const d = new Date();
  if (!won(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (won(dayKey(d)) && n < 3660) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

let calMonth = null;
function showCalendar() {
  buildCalendar(
    calMonth,
    (day) => !!(progress.daily[gid][day] && progress.daily[gid][day].won),
    (day) => playDaily(day),
  );
  $("daily-game").textContent = gameName(gid);
  const streak = dailyStreak(gid);
  $("daily-streak").hidden = streak < 1;
  $("daily-streak").textContent = streak ? tn("dailyStreak", streak) : "";
}

// ---- winning
function win() {
  game.won = true;
  syncTimer();
  const g = game.id;
  const s = state();
  const st = stats[g];
  const time = game.elapsed;
  const moves = game.moves.length;
  const firstWin = st.won === 0;
  const bestTime = st.bestTime === null || time < st.bestTime;
  const bestMoves = st.fewestMoves === null || moves < st.fewestMoves;
  const run = g === "peaks" ? s.best : 0;
  const bestRun = g === "peaks" && run > st.bestRun;
  st.won += 1;
  st.played = Math.max(st.played, st.won);
  st.streak += 1;
  st.bestStreak = Math.max(st.bestStreak, st.streak);
  if (bestTime) st.bestTime = time;
  if (bestMoves) st.fewestMoves = moves;
  if (bestRun) st.bestRun = run;
  saveStats();
  if (game.deal.kind === "daily") {
    progress.daily[g][game.deal.day] = { won: true };
    saveProgress();
  }
  persist(true);
  updateControls();
  hideNotice();
  setLight("off");
  showVerdictBar();
  buzz("success");
  announce(t("solvedSr", { time: formatTime(time), moves: tn("nMoves", moves), n: moves }));
  $("win-game").textContent = gameName(g);
  $("win-time").textContent = formatTime(time);
  $("win-moves").textContent = String(moves);
  $("win-run").textContent = String(run);
  $("win-run-box").hidden = g !== "peaks";
  $("win-best-moves").hidden = !(bestMoves && !firstWin);
  $("win-time-box").hidden = !settings.clock;
  $("win-best-time").hidden = !(bestTime && !firstWin && settings.clock);
  $("win-best-run").hidden = !(bestRun && !firstWin);
  $("win-best-run").textContent = t("winRun", { n: run });
  const record = t("winRecord", {
    mode: `${gameName(g)}: `,
    wins: tn("nWins", st.won),
    games: tn("nGames", st.played),
    gamesOf: tn("nGamesOf", st.played),
    streak: st.streak,
  });
  const kind =
    game.deal.kind === "daily"
      ? `${t("dailyWon", { date: formatDay(game.deal.day) })} `
      : `${t(game.deal.kind === "winnable" ? "dealEasy" : "dealAny")}. `;
  $("win-record").textContent = `${kind}${record}`;
  celebrate(() => openDialog($("dlg-win"), $("btn-new")));
}

// The win: the cards spring from the waste (Pyramid: from the cards taken away) and fall across the screen.
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
  const r = table.getBoundingClientRect();
  const from = gid === "pyramid" ? geo.out : geo.waste;
  const x0 = r.left + from[0] + geo.cw / 2 - 15;
  const y0 = r.top + from[1] + geo.ch / 2 - 21;
  for (let n = 0; n < 36; n++) {
    const suit = n % 4;
    const el = document.createElement("div");
    el.className = "toss";
    el.style.setProperty("--suit", `var(--c-${["spade", "heart", "club", "diamond"][suit]})`);
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    el.style.setProperty("--dx", `${Math.round((Math.random() * 2 - 1) * w * 0.55)}px`);
    el.style.setProperty("--up", `${-Math.round(80 + Math.random() * 200)}px`);
    el.style.setProperty("--dy", `${Math.round(h * (0.55 + Math.random() * 0.45))}px`);
    el.style.setProperty("--rot", `${Math.round((Math.random() * 2 - 1) * 540)}deg`);
    el.style.animationDelay = `${n * 28}ms`;
    el.appendChild(svgUse(`suit-${suit}`, ""));
    layer.appendChild(el);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => {
    layer.remove();
    done();
  }, 1900);
}

// ---- taps, drags and keys. Tap a card to play it (Pyramid: tap two cards that make 13), or drag it where it goes.
// Pointer Events cover touch, pen and mouse. Taps are found from the cards' rectangles, so a tap outside a card's
// shape still counts.
let selection = null; // Pyramid: {id, place}
let drag = null;
let lastPointerUp = 0;
const SLOP = 12;

function localPoint(cx, cy) {
  const r = table.getBoundingClientRect();
  return [cx - r.left, cy - r.top];
}

function hitAt(cx, cy, except) {
  if (!game || !geo) return null;
  const [x, y] = localPoint(cx, cy);
  const slack = 3;
  for (const tg of targets) {
    if (except !== undefined && tg.kind === "card" && tg.id === except) continue;
    if (x >= tg.x - slack && x < tg.x + tg.w + slack && y >= tg.y - slack && y < tg.y + tg.h + slack)
      return { kind: tg.kind, id: tg.id };
  }
  // A covered card says why it cannot move.
  let best = null;
  last.forEach((p, id) => {
    if (!p || p.free || !["pyr", "col", "peak"].includes(p.pile)) return;
    if (x >= p.x && x < p.x + geo.cw && y >= p.y && y < p.y + geo.ch) {
      const z = Number(cardEls[id].style.zIndex || 0);
      if (!best || z > best.z) best = { id, z };
    }
  });
  return best ? { kind: "covered", id: best.id } : null;
}

// The same from an element (a screen reader's or the keyboard's activation).
function hitOf(el) {
  if (!el || !el.closest) return null;
  if (el.closest(".stock-hit")) return { kind: "stock" };
  const c = el.closest(".card");
  if (c && c.classList.contains("free")) return { kind: "card", id: Number(c.dataset.id) };
  return null;
}

// Pyramid: where a card lies, as a place the rules know.
function placeOf(id) {
  const s = state();
  const i = s.pyr.indexOf(id);
  if (i >= 0) return { at: "pyr", i };
  const w = Rules.wasteTop(s);
  return w >= 0 && s.deck[w] === id ? { at: "waste" } : null;
}

// Golf and Peaks: the move that plays card `id`.
function playMoveOf(id) {
  const s = state();
  if (s.game === "golf") {
    const i = s.cols.findIndex((c) => c.length && c[c.length - 1] === id);
    return i >= 0 ? { t: "c", i } : null;
  }
  const i = s.cards.indexOf(id);
  return i >= 0 ? { t: "c", i } : null;
}

// Pyramid: the move that takes away card `a` alone (a king) or with card `b`.
function pairMove(a, b) {
  const pa = placeOf(a);
  if (!pa) return null;
  if (b === undefined) return pa.at === "pyr" ? { t: "k", i: pa.i } : { t: "K" };
  const pb = placeOf(b);
  if (!pb) return null;
  if (pa.at === "pyr" && pb.at === "pyr") return { t: "p", i: Math.min(pa.i, pb.i), j: Math.max(pa.i, pb.i) };
  return { t: "w", i: pa.at === "pyr" ? pa.i : pb.i };
}

function whyNotPlay(id) {
  const s = state();
  const top = Rules.top(s);
  if (s.game === "golf" && Rules.rankOf(top) === 13)
    return s.opts.kings === "queen" ? t("onlyQueenOnKing") : t("nothingOnKing");
  return t("notOneApart", { card: cardName(id), Card: cap(cardName(id)), top: cardName(top) });
}

function cannot(id, why) {
  nudge(cardEls[id]);
  if (why) {
    notice(why, "why");
    announce(why);
  }
}

function drawOrRedeal() {
  const s = state();
  dropSelection();
  if (Rules.canMove(s, { t: "d" })) commit({ t: "d" });
  else if (s.game === "pyramid" && Rules.canRedeal(s)) commit({ t: "r" });
  else {
    nudge(stockBtn);
    notice(s.game === "pyramid" && Rules.wasteTop(s) >= 0 ? t("noMoreRounds") : t("stockEmpty"), "why");
  }
}

function onTap(hit) {
  if (busy || !game || game.won || view === "picker") return;
  if (!hit) {
    if (selection) {
      dropSelection();
      announce(t("putBack"));
    }
    return;
  }
  if (hit.kind === "stock") {
    drawOrRedeal();
    return;
  }
  if (hit.kind === "covered") {
    dropSelection();
    cannot(hit.id, t("covered"));
    return;
  }
  const id = hit.id;
  const s = state();
  if (s.game !== "pyramid") {
    const m = playMoveOf(id);
    if (m && Rules.canMove(s, m)) commit(m);
    else cannot(id, whyNotPlay(id));
    return;
  }
  // Pyramid: a king goes at once; any other card waits for its partner.
  if (Rules.rankOf(id) === 13) {
    commit(pairMove(id));
    return;
  }
  if (selection) {
    const first = selection.id;
    if (first === id) {
      dropSelection();
      announce(t("putBack"));
      return;
    }
    if (Rules.pairs(first, id)) {
      commit(pairMove(first, id));
      return;
    }
    const why = t("notThirteen", {
      card: cardName(first),
      Card: cap(cardName(first)),
      other: cardName(id),
      sum: Rules.rankOf(first) + Rules.rankOf(id),
    });
    nudge(cardEls[id]);
    pickUp(id);
    notice(why, "why");
    announce(why);
    return;
  }
  pickUp(id);
}

function pickUp(id) {
  dropSelection();
  hideNotice("why");
  selection = { id };
  markSelection();
  announce(t("pickedPair", { card: cardName(id), Card: cap(cardName(id)) }));
  if (settings.showTargets && !partnersOf(id).length) notice(t("noPartner"), "why");
}

function partnersOf(id) {
  return targets.filter((tg) => tg.kind === "card" && tg.id !== id && Rules.pairs(tg.id, id)).map((tg) => tg.id);
}

function markSelection() {
  if (!selection) return;
  const el = cardEls[selection.id];
  if (!el.classList.contains("free")) {
    selection = null;
    return;
  }
  el.classList.add("sel", "sel-one");
  showTargets();
}

function dropSelection() {
  if (!selection) return;
  cardEls[selection.id].classList.remove("sel", "sel-one");
  selection = null;
  showTargets();
}

// "Show where a card can go": the partners of a picked-up card (Pyramid), or every card that can be played now.
function showTargets() {
  cardEls.forEach((el) => el.classList.remove("partner", "can"));
  if (!settings.showTargets || !game || game.won || view === "picker") return;
  const s = state();
  if (s.game === "pyramid") {
    if (selection) partnersOf(selection.id).forEach((id) => cardEls[id].classList.add("partner"));
    return;
  }
  for (const tg of targets) {
    if (tg.kind !== "card") continue;
    const m = playMoveOf(tg.id);
    if (m && Rules.canMove(s, m)) cardEls[tg.id].classList.add("can");
  }
}

function clearDrag() {
  if (!drag || !drag.active) return;
  drag.el.style.transform = "";
  drag.el.classList.remove("lifted");
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
    if (!drag.hit || drag.hit.kind !== "card") {
      drag.dead = true;
      return;
    }
    drag.active = true;
    drag.el = cardEls[drag.hit.id];
    if (typeof drag.el.getAnimations === "function") drag.el.getAnimations().forEach((a) => a.cancel());
    drag.el.classList.add("lifted");
    drag.el.style.zIndex = "600";
  }
  e.preventDefault();
  drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
});

// Where a dragged card lands: on the waste (Golf and Peaks) or on a partner (Pyramid).
function dropMove(d, cx, cy) {
  const s = state();
  const id = d.hit.id;
  if (s.game === "pyramid") {
    const under = hitAt(cx, cy, id);
    if (under && under.kind === "card" && Rules.pairs(id, under.id)) return pairMove(id, under.id);
    return null;
  }
  const [x, y] = localPoint(cx, cy);
  const wx = geo.waste[0] - geo.fanX * 3;
  const near =
    x >= wx - 12 && x < geo.waste[0] + geo.cw + 12 && y >= geo.waste[1] - 12 && y < geo.waste[1] + geo.ch + 12;
  return near ? playMoveOf(id) : null;
}

table.addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  lastPointerUp = Date.now();
  const d = drag;
  drag = null;
  if (d.active) {
    d.el.classList.remove("lifted");
    const m = dropMove(d, e.clientX, e.clientY);
    d.el.style.transform = "";
    if (m && Rules.canMove(state(), m) && commit(m)) return;
    render({ keepMarks: true, animate: false });
    // The card glides back to where it came from.
    if (motionOK() && typeof d.el.animate === "function")
      d.el.animate([{ transform: `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)` }, { transform: "none" }], {
        duration: 220,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    return;
  }
  if (d.dead) return;
  onTap(d.hit);
});

table.addEventListener("pointercancel", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  if (d.active) {
    d.el.classList.remove("lifted");
    d.el.style.transform = "";
    render({ keepMarks: true, animate: false });
  }
});

// A screen reader's double tap (and other assistive tools) activates a card or the stock with a click and no
// pointer events; clicks that follow our own pointer handling are ignored.
table.addEventListener("click", (e) => {
  if (Date.now() - lastPointerUp < 700) return;
  onTap(hitOf(e.target));
});

table.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const hit = hitOf(e.target);
  if (!hit) return;
  e.preventDefault();
  onTap(hit);
});

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || document.querySelector("dialog[open]") || view === "picker") return;
  const tgt = e.target;
  if (tgt && /^(INPUT|SELECT|TEXTAREA)$/.test(tgt.tagName)) return;
  if (e.key === "Escape") {
    if (selection) {
      dropSelection();
      announce(t("putBack"));
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "d") drawOrRedeal();
  else if (k === "u") undo();
  else if (k === "h") showHint();
  else if (k === "n") askNewGame();
  else if (k === "g") showPicker();
  else return;
  e.preventDefault();
});

// ---- the picker and the views: #/ for the picker, #/pyramid, #/golf and #/peaks for the games. Opening a game
// adds a step to the history, so the phone's Back returns to the picker.
const viewOfHash = () => {
  const m = /^#\/(\w+)$/.exec(location.hash || "");
  return m && GAMES.includes(m[1]) ? m[1] : "picker";
};

function showView(v, opts = {}) {
  const was = view;
  view = v;
  $("app").dataset.view = v === "picker" ? "picker" : "game";
  const inGame = v !== "picker";
  $("picker").hidden = inGame;
  table.hidden = !inGame;
  $("bottom").hidden = !inGame;
  $("status").hidden = !inGame;
  $("btn-games").hidden = !inGame;
  $("btn-daily").hidden = !inGame;
  closeDialog($("dlg-new"));
  closeDialog($("dlg-win"));
  dropSelection();
  hideNotice();
  if (inGame) {
    if (gid !== v || !game) switchGame(v);
    $("brand-name").textContent = gameName(gid);
    progress.last = gid;
    progress.view = "game";
    saveProgress();
    updateFirstHelp();
    applyLayout();
    render({ animate: false });
    syncTimer();
    checkPosition();
    showVerdictBar();
    updateTurnTip();
    if (opts.from && motionOK()) zoomFrom(opts.from);
  } else {
    syncTimer();
    Solver.stop();
    if (game) persist(true);
    $("brand-name").textContent = t("appName");
    $("first-help").hidden = true;
    $("turn-tip").hidden = true;
    progress.view = "picker";
    saveProgress();
    // A game won since the picker last showed waits as its next deal, so its tile shows that deal.
    for (const g of GAMES) if (games[g] && games[g].won) dealGame(g, newDeal(g));
    applyLayout();
    renderPicker();
    if (was !== "picker" && motionOK() && typeof $("picker").animate === "function")
      $("picker").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    const back = was !== "picker" ? $(`open-${was}`) : null;
    if (back) back.focus({ preventScroll: true });
  }
  fitBands();
}

// The picked tile's small table grows into the game's table.
function zoomFrom(rect) {
  const r = table.getBoundingClientRect();
  if (!rect || !r.width || typeof table.animate !== "function") return;
  const sc = Math.min(rect.width / r.width, rect.height / r.height);
  const dx = rect.left + rect.width / 2 - (r.left + r.width / 2);
  const dy = rect.top + rect.height / 2 - (r.top + r.height / 2);
  table.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.5 },
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
    ],
    { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}

function switchGame(g) {
  if (game && game !== games[g]) {
    syncTimerStop();
    persist(true);
  }
  Solver.stop();
  gid = g;
  game = games[g];
  plan = null;
  backTo = -1;
  verdicts.clear();
  trustListedStart();
  last = [];
  updateNextNote();
}

function openGame(g, opts = {}) {
  const box = opts.from ? $(`mini-${g}`) : null;
  const from = box ? box.getBoundingClientRect() : null;
  if (opts.push !== false) history.pushState({ pat: g }, "", `#/${g}`);
  showView(g, { from });
}

function showPicker() {
  if (view === "picker") return;
  if (history.state && GAMES.includes(history.state.pat)) history.back();
  else {
    history.replaceState({ pat: "picker" }, "", "#/");
    showView("picker");
  }
}

window.addEventListener("popstate", () => showView(viewOfHash()));
window.addEventListener("hashchange", () => {
  if (viewOfHash() !== view) showView(viewOfHash());
});

// Each tile: the game's table as it stands, drawn small, its name and rule, how it stands, and today's deal.
function renderPicker() {
  for (const g of GAMES) {
    const gm = games[g];
    if (!gm) continue;
    const s = gm.states[gm.states.length - 1];
    const st = stats[g];
    $(`name-${g}`).textContent = gameName(g);
    $(`tag-${g}`).textContent = t("gameTag")[g];
    const inPlay = gm.started && !gm.won && gm.moves.length > 0;
    $(`state-${g}`).textContent = inPlay ? t("inPlay", { moves: tn("nMoves", gm.moves.length) }) : t("fresh");
    const lightEl = $(`light-${g}`);
    lightEl.dataset.v = inPlay && settings.light && gm.verdict ? gm.verdict : "off";
    lightEl.hidden = lightEl.dataset.v === "off";
    $(`open-${g}`).setAttribute(
      "aria-label",
      `${t("openGame", { game: gameName(g) })}. ${t("gameTag")[g]}. ${$(`state-${g}`).textContent}.`,
    );
    $(`wins-${g}`).textContent = st.played
      ? t("winsLine", { won: formatNumber(st.won), played: formatNumber(st.played) })
      : "";
    const done = !!(progress.daily[g][todayKey()] && progress.daily[g][todayKey()].won);
    $(`daily-text-${g}`).textContent = t(done ? "dailyChipDone" : "dailyChip");
    $(`daily-${g}`).classList.toggle("done", done);
    $(`daily-${g}`).setAttribute(
      "aria-label",
      `${t("openDaily", { game: gameName(g) })}${done ? `, ${t("solved")}` : ""}`,
    );
    drawMini(g, s);
  }
  fitPicker();
}

function drawMini(g, s) {
  const box = $(`mini-${g}`);
  box.textContent = "";
  const W = box.clientWidth;
  const H = box.clientHeight;
  if (W < 40 || H < 30) return;
  const pad = 6;
  const mg = measure(g, W - 2 * pad, H - 2 * pad, "normal", "rect", null, true);
  const L = layoutOf(s, mg);
  // Only what shows: the stock's top card and the waste's fanned top.
  const seen = { stock: 0 };
  const cards = [];
  L.map((p, id) => Object.assign({ id }, p))
    .sort((a, b) => a.z - b.z)
    .forEach((p) => {
      if (p.loc.pile === "stock" && seen.stock++) return;
      cards.push([Rules.suitOf(p.id), Rules.rankOf(p.id), !p.up, p.x, p.y]);
    });
  const pv = previewBox(mg, cards, look({ table: settings.table }));
  box.appendChild(pv);
}

// Tiles whose words do not fit beside the small table (large text) put the table above them.
function fitPicker() {
  const list = $("games");
  list.classList.remove("stack");
  const over = [...list.querySelectorAll(".tile-text > span")].some((el) => el.scrollWidth > el.clientWidth + 1);
  list.classList.toggle("stack", over);
}

for (const g of GAMES) {
  $(`open-${g}`).addEventListener("click", () => openGame(g, { from: true }));
  $(`daily-${g}`).addEventListener("click", () => playDaily(todayKey(), g));
}

// ---- dialogs
wireDialogs();
const on = (id, handler) => $(id).addEventListener("click", handler);

on("btn-games", showPicker);
on("btn-light", explainLight);
on("btn-new", () => askNewGame());
on("btn-undo", undo);
on("btn-hint", showHint);
on("btn-finish", runFinish);
on("btn-back", goBack);
on("stuck-undo", undo);
on("stuck-restart", restartDeal);
on("stuck-new", () => newGame());
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
  dropSelection();
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

// Statistics: one column per game.
const STAT_ROWS = [
  ["gamesPlayed", (st) => formatNumber(st.played)],
  ["gamesWon", (st) => formatNumber(st.won)],
  ["winRate", (st) => formatRate(st.won, st.played)],
  ["bestTime", (st) => (st.bestTime === null ? "–" : formatTime(st.bestTime))],
  ["fewestMoves", (st) => (st.fewestMoves === null ? "–" : String(st.fewestMoves))],
  ["winStreak", (st) => String(st.streak)],
  ["longestStreak", (st) => String(st.bestStreak)],
  ["longestRun", (st, g) => (g === "peaks" ? String(st.bestRun) : "–")],
  ["dailySolved", (st, g) => formatNumber(Object.values(progress.daily[g]).filter((d) => d && d.won).length)],
];

function fillStats() {
  const body = $("st-body");
  body.textContent = "";
  for (const g of GAMES) $(`st-head-${g}`).textContent = gameName(g);
  for (const [key, value] of STAT_ROWS) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.setAttribute("scope", "row");
    th.textContent = t(key);
    tr.appendChild(th);
    for (const g of GAMES) {
      const td = document.createElement("td");
      td.textContent = value(stats[g], g);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  $("reset-confirm").hidden = true;
}

on("btn-stats", () => {
  dropSelection();
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
  stats = normStats(null);
  for (const g of GAMES) if (games[g] && games[g].started && !games[g].won) stats[g].played = 1;
  saveStats();
  fillStats();
  $("stats-done").focus();
  announce(t("statsCleared"));
  if (view === "picker") renderPicker();
});

// The guide's pictures, one per rule of each game's short start: [cards, extra] in previewBox's terms, for a card
// of width cw with bands of fu and height ch.
function examples(g, cw, fu, ch) {
  const gap = cw + 30;
  const arrowIn = [[gap - 6, ch / 2, cw + 6, ch / 2]];
  if (g === "pyr")
    return [
      // A 6 and a 7 make 13.
      [
        [
          [1, 6, false, 0, 0],
          [0, 7, false, gap, 0],
        ],
        { arrows: arrowIn },
      ],
      // A king goes alone.
      [[[3, 13, false, 0, 0]], { arrows: [[cw + 4, ch / 2, cw + 30, ch / 2]], slots: [[gap, 0, 0]] }],
      // A card is free when nothing lies over it: two free cards over a covered one.
      [
        [
          [2, 9, false, Math.round((cw + 4) / 2), 0],
          [1, 4, false, 0, Math.round(ch * 0.48)],
          [0, 12, false, cw + 4, Math.round(ch * 0.48)],
        ],
        {},
      ],
      // The stock turns a card onto the waste.
      [
        [
          [0, 1, true, 0, 0],
          [3, 8, false, gap, 0],
        ],
        { arrows: [[cw + 4, ch / 2, gap - 6, ch / 2]] },
      ],
    ];
  if (g === "golf")
    return [
      // An 8 on a 7.
      [
        [
          [2, 7, false, 0, 0],
          [1, 8, false, gap, 0],
        ],
        { arrows: arrowIn },
      ],
      // Suits do not matter: a red 6 on a black 5.
      [
        [
          [0, 5, false, 0, 0],
          [3, 6, false, gap, 0],
        ],
        { arrows: arrowIn },
      ],
      // The stock turns a card onto the waste.
      [
        [
          [0, 1, true, 0, 0],
          [1, 4, false, gap, 0],
        ],
        { arrows: [[cw + 4, ch / 2, gap - 6, ch / 2]] },
      ],
    ];
  const wrap = settings.rules.peaks.wrap;
  return [
    // A jack on a 10.
    [
      [
        [1, 10, false, 0, 0],
        [0, 11, false, gap, 0],
      ],
      { arrows: arrowIn },
    ],
    // A king and an ace (or, without that, a queen on a king).
    [
      [
        [2, 13, false, 0, 0],
        [3, wrap ? 1 : 12, false, gap, 0],
      ],
      { arrows: arrowIn },
    ],
    // A card turns over once nothing lies over it.
    [
      [
        [0, 1, true, Math.round((cw + 4) / 2), 0],
        [1, 9, false, 0, Math.round(ch * 0.5)],
        [2, 3, false, cw + 4, Math.round(ch * 0.5)],
      ],
      {},
    ],
    // The stock turns a card and ends the run.
    [
      [
        [0, 1, true, 0, 0],
        [2, 5, false, gap, 0],
      ],
      { arrows: [[cw + 4, ch / 2, gap - 6, ch / 2]] },
    ],
  ];
}

const selectHelpTab = wireTabs($("dlg-help"));

// How to play opens at the short start of the game on the table (on the picker, the last game played), with each
// rule's picture drawn in the cards and table chosen now and the rules set now.
function showHelp(back) {
  dismissFirstHelp();
  const gm = cardGeo(40, 2, "rect", 4, look());
  for (const [g, prefix] of [
    ["pyramid", "pyr"],
    ["golf", "golf"],
    ["peaks", "peaks"],
  ]) {
    $(`tab-help-${g}`).textContent = gameName(g);
    examples(prefix, gm.cw, gm.fu, gm.ch).forEach(([cards, extra], i) => {
      const box = $(`ex-${prefix}-${i + 1}`);
      if (!box) return;
      box.textContent = "";
      box.appendChild(previewBox(gm, cards, look(), extra));
    });
  }
  richInto($("rule-golfRule2"), t("golfRule2")[settings.rules.golf.kings]);
  richInto($("rule-peaksRule2"), t("peaksRule2")[settings.rules.peaks.wrap ? "wrap" : "nowrap"]);
  $("pyr-help-stock").textContent = t("pyrHelpStock")[String(settings.rules.pyramid.passes)];
  selectHelpTab($(`tab-help-${gid}`), false);
  $("dlg-help").querySelector(".dlg-body").scrollTop = 0;
  openDialog($("dlg-help"), back);
}

// A line with key words: "a *free cell* holds" shows "free cell" in bold.
function richInto(el, text) {
  el.textContent = "";
  String(text)
    .split(/(\*[^*]+\*)/)
    .forEach((part) => {
      if (/^\*.+\*$/.test(part)) {
        const b = document.createElement("b");
        b.textContent = part.slice(1, -1);
        el.appendChild(b);
      } else if (part) el.appendChild(document.createTextNode(part));
    });
}

// The first start's line on the table, once per game: it opens the guide, and goes for good after a tap or the
// first move.
function updateFirstHelp() {
  $("first-help-text").textContent = t("firstHelp", { game: gameName(gid) });
  setPill($("first-help"), view !== "picker" && !!game && !progress.firstHelp[gid] && game.moves.length === 0);
}

// The first start's line and the sideways tip sit in the bottom band; the table's size follows by itself.
function setPill(el, show) {
  el.hidden = !show;
}

function dismissFirstHelp() {
  setPill($("first-help"), false);
  if (view === "picker" || progress.firstHelp[gid]) return;
  progress.firstHelp[gid] = true;
  saveProgress();
}

// The sideways tip: on a phone held upright, once the first start's line has gone (a few moves into a game, or
// from the second game on), and only while the cards are narrow (Peaks' ten across). It goes when the phone turns
// or on a tap, for good.
function updateTurnTip() {
  const el = $("turn-tip");
  if (progress.turnTip || !game || !geo || view === "picker") {
    setPill(el, false);
    return;
  }
  const upright = table.clientHeight > table.clientWidth;
  if (!upright) {
    if (!el.hidden) dismissTurnTip();
    return;
  }
  const played = GAMES.reduce((n, g) => n + stats[g].played, 0);
  const ready = $("first-help").hidden && (game.moves.length >= 3 || (!game.started && played >= 1));
  setPill(el, ready && geo.cw < 44);
}

function dismissTurnTip() {
  setPill($("turn-tip"), false);
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
on("win-games", () => {
  closeDialog($("dlg-win"));
  showPicker();
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

// Whether the game under way was dealt with other rules than the ones chosen now.
function updateNextNote() {
  if (!game) return;
  const d = game.deal;
  const differs =
    Rules.variantOf(gid, d.opts) !== Rules.variantOf(gid, settings.rules[gid]) ||
    (gid === "peaks" && d.opts.open !== settings.rules.peaks.open) ||
    (d.kind !== "daily" && d.kind !== settings.deals);
  $("next-note").hidden = !(game.started && !game.won && differs);
}

// Two cards of a fanned column: the covered one shows its band.
const fanned = (g) => [
  [1, 10, false, 0, 0],
  [2, 8, false, 0, g.fu],
];

// The geometry the table would use now, also while the picker shows (a phone's usual table area then).
function tableArea() {
  const W = table.clientWidth || $("picker").clientWidth || 360;
  const H = table.clientHeight || Math.max(300, ($("picker").clientHeight || 560) - 80);
  return [W, H];
}

// Each size's preview: two cards of a fanned column, drawn at the size that setting gives here.
function buildPreviews() {
  const box = $("size-previews");
  box.textContent = "";
  const [W, H] = tableArea();
  SIZES.forEach((size) => {
    const g = measure(gid, W, H, size, settings.shape);
    const cell = document.createElement("div");
    cell.appendChild(previewBox(g, fanned(g), look()));
    cell.addEventListener("click", () => chooseSize(size));
    box.appendChild(cell);
  });
}

// The shapes, backs and tables, each drawn as it would look on the table now.
function buildLookTiles() {
  const [W, H] = tableArea();
  const size = currentSize();
  const decks = $("deck-tiles");
  decks.textContent = "";
  ["bold", "crisp"].forEach((id) => {
    const g = measure(gid, W, H, size, settings.shape, id);
    const pic = previewBox(g, fanned(g), look({ deck: id }));
    decks.appendChild(tile("deck", id, settings.deck === id, t(`deck_${id}`), pic));
  });
  const smaller = [];
  const none = [];
  const shapes = $("shape-tiles");
  shapes.textContent = "";
  SHAPE_IDS.forEach((id) => {
    const g = measure(gid, W, H, size, id);
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

  const g = measure(gid, W, H, size, settings.shape);
  const backs = $("back-tiles");
  backs.textContent = "";
  BACK_IDS.forEach((id) => {
    const pic = previewBox(g, [[0, 1, true, 0, 0]], look({ back: id }));
    backs.appendChild(tile("back", id, settings.back === id, t(`back_${id}`), pic));
  });

  const mini = measure("golf", 240, 400, "normal", settings.shape);
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
  for (const g of GAMES) $(`rules-${g}`).textContent = gameName(g);
  $("opt-four").checked = settings.four;
  $("opt-contrast").checked = settings.contrast;
  $(`theme-${settings.theme}`).checked = true;
  $(`lang-${settings.lang}`).checked = true;
  $(`passes-${settings.rules.pyramid.passes}`).checked = true;
  $(`kings-${settings.rules.golf.kings}`).checked = true;
  $("opt-wrap").checked = settings.rules.peaks.wrap;
  $("opt-open").checked = settings.rules.peaks.open;
  $(`deals-${settings.deals}`).checked = true;
  $("opt-right").checked = settings.stockRight;
  $("opt-hints").checked = settings.hints;
  $("opt-finish").checked = settings.autoFinish;
  $("opt-targets").checked = settings.showTargets;
  $("opt-clock").checked = settings.clock;
  $("opt-light").checked = settings.light;
  $("opt-vibration").checked = settings.vibration;
  $("opt-vibration-row").hidden = !canBuzz;
  updateNextNote();
}

function relayout() {
  if (view === "picker") {
    applyLayout();
    renderPicker();
    return;
  }
  if (!game) return;
  applyLayout();
  render({ animate: false, keepMarks: true });
  updateTurnTip();
}

// After a change of look: the table (or the picker), and the sheet's pictures when it is open.
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

// A game of the changed kind that has not started yet is dealt again at once with the new rules.
function rulesChanged(g) {
  saveSettings();
  const gm = games[g];
  if (gm && (!gm.started || gm.won)) {
    if (g === gid && view !== "picker") newGame({ quiet: true });
    else dealGame(g, newDeal(g));
  }
  updateNextNote();
  if (view === "picker") renderPicker();
}

wireTabs($("dlg-settings"));

on("btn-settings", () => {
  dropSelection();
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
    retranslate();
    fillSettings();
    fitSegs($("dlg-settings"));
  } else if (input.name === "deck") {
    settings.deck = v === "crisp" ? "crisp" : "bold";
    saveSettings();
    lookChanged();
  } else if (input.name === "passes") {
    settings.rules.pyramid = Rules.normOpts("pyramid", { passes: Number(v) });
    rulesChanged("pyramid");
    fitSegs($("dlg-settings"));
  } else if (input.name === "kings") {
    settings.rules.golf = Rules.normOpts("golf", { kings: v });
    rulesChanged("golf");
    fitSegs($("dlg-settings"));
  } else if (input.name === "deals") {
    settings.deals = v === "any" ? "any" : "winnable";
    saveSettings();
    for (const g of GAMES) {
      const gm = games[g];
      if (gm && (!gm.started || gm.won) && gm.deal.kind !== "daily") {
        if (g === gid && view !== "picker") newGame({ quiet: true });
        else dealGame(g, newDeal(g));
      }
    }
    updateNextNote();
    fitSegs($("dlg-settings"));
  }
});

function onSwitch(id, apply) {
  $(id).addEventListener("change", (e) => {
    apply(e.target.checked);
    saveSettings();
  });
}
onSwitch("opt-hints", (v) => {
  settings.hints = v;
  updateControls();
});
onSwitch("opt-finish", (v) => {
  settings.autoFinish = v;
  updateControls();
});
onSwitch("opt-targets", (v) => {
  settings.showTargets = v;
  showTargets();
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
  settings.stockRight = v;
  relayout();
});
onSwitch("opt-vibration", (v) => {
  settings.vibration = v;
  if (v) buzz("light");
});
onSwitch("opt-four", (v) => {
  settings.four = v;
  lookChanged();
});
onSwitch("opt-contrast", (v) => {
  settings.contrast = v;
  lookChanged();
});
$("opt-wrap").addEventListener("change", (e) => {
  settings.rules.peaks = Rules.normOpts("peaks", Object.assign({}, settings.rules.peaks, { wrap: e.target.checked }));
  rulesChanged("peaks");
});
$("opt-open").addEventListener("change", (e) => {
  settings.rules.peaks = Rules.normOpts("peaks", Object.assign({}, settings.rules.peaks, { open: e.target.checked }));
  rulesChanged("peaks");
});

// Every text that depends on the language, after a change of language.
function retranslate() {
  $("brand-name").textContent = view === "picker" ? t("appName") : gameName(gid);
  if (view === "picker") renderPicker();
  else {
    render({ animate: false, keepMarks: true });
    setLight($("light").dataset.v);
    showVerdictBar();
    updateFirstHelp();
  }
}

// The phone switching between light and dark repaints the table.
if (darkQuery && typeof darkQuery.addEventListener === "function")
  darkQuery.addEventListener("change", () => {
    lookChanged();
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
  // Every game's table, as saved or freshly dealt, so the picker can show all three.
  for (const g of GAMES) {
    games[g] = restore(g, Store.get(`game-${g}`));
    if (!games[g] || games[g].won) dealGame(g, newDeal(g));
  }
  game = games[gid];
  trustListedStart();
  // Where to start: the hash (a reload keeps it), else the game played last, else the picker. A game opened at
  // start gets the picker under it in the history, so Back still leads there.
  let v = viewOfHash();
  if (v === "picker" && !location.hash && progress.view === "game" && progress.last) v = progress.last;
  if (v !== "picker" && !(history.state && history.state.pat)) {
    history.replaceState({ pat: "picker" }, "", "#/");
    history.pushState({ pat: v }, "", `#/${v}`);
  } else if (v === "picker" && !(history.state && history.state.pat)) history.replaceState({ pat: "picker" }, "", "#/");
  showView(v);
  if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe($("app").querySelector(".felt-area"));
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
      gid = progress.last || gid;
    }
    // supports() answers only after the handshake.
    try {
      await Promise.race([host.ready, new Promise((resolve) => window.setTimeout(resolve, 2500))]);
      canBuzz = Boolean(host.haptics && typeof host.supports === "function" && host.supports("haptics.impact"));
    } catch (e) {
      canBuzz = false;
    }
  }
  boot();
}

start();
