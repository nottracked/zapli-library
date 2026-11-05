// Development only (not shipped): starts the real page (index.html with js/ui.js) on the stand-in document of
// fake-dom.mjs and plays it with clicks, in English and Slovak, to catch mistakes in the page's code paths that the
// rules checks cannot reach. It checks behaviour, not looks: nothing is laid out or drawn.
//
//   node apps/library/patience/dev/check-page.mjs
//
// Exit code 0 when everything holds, 1 otherwise.
import { readFileSync } from "node:fs";
import { install } from "./fake-dom.mjs";
import * as Rules from "../package/js/rules.js";
import { solve } from "../package/js/solver.js";

const PAGE = new URL("../package/index.html", import.meta.url);
const UI = new URL("../package/js/ui.js", import.meta.url);
const html = readFileSync(PAGE, "utf8");
const problems = [];
let checks = 0;
const check = (ok, what) => {
  checks += 1;
  if (!ok) problems.push(what);
};

// The page's history and address: enough for #/ routes and Back.
function installHistory(win) {
  const entries = [{ state: null, hash: "" }];
  let at = 0;
  const location = {
    get hash() {
      return entries[at].hash;
    },
    set hash(v) {
      history.pushState(null, "", v);
      (win.listeners.hashchange || []).forEach((fn) => fn());
    },
  };
  const history = {
    get state() {
      return entries[at].state;
    },
    pushState(state, _, url) {
      entries.length = at + 1;
      entries.push({ state, hash: url });
      at += 1;
    },
    replaceState(state, _, url) {
      entries[at] = { state, hash: url };
    },
    back() {
      if (at === 0) return;
      at -= 1;
      (win.listeners.popstate || []).forEach((fn) => fn());
    },
    get length() {
      return entries.length;
    },
  };
  Object.assign(globalThis, { history, location });
  Object.assign(win, { history, location });
  return history;
}

let run = 0;
let env = null;
let hist = null;
async function boot(store) {
  env = install(html);
  hist = installHistory(globalThis.window);
  if (store) for (const [k, v] of store) env.store.set(k, v);
  run += 1;
  await import(`${UI.href}?run=${run}`);
  await env.advance(3000);
}

const $ = (id) => document.getElementById(id);
const cardEl = (id) => document.querySelectorAll(".card").find((c) => c.dataset.id === String(id));
const stockEl = () => document.querySelectorAll(".stock-hit")[0];
const saved = (g) => JSON.parse(env.store.get(`patience/game-${g}`) || "null");
const click = (el) => el.dispatch("click");

// The position the save describes, played again from its deal.
function fromSave(g) {
  const sv = saved(g);
  const s = Rules.deal(g, sv.deal.seed, sv.deal.opts);
  for (const w of sv.steps ? sv.steps.split(" ") : []) Rules.apply(s, Rules.parseMove(w));
  return s;
}

// One move by clicks: the stock, a card, or (Pyramid) two cards.
function play(s, m) {
  if (m.t === "d" || m.t === "r") click(stockEl());
  else if (m.t === "c") click(cardEl(s.game === "golf" ? s.cols[m.i][s.cols[m.i].length - 1] : s.cards[m.i]));
  else if (m.t === "k") click(cardEl(s.pyr[m.i]));
  else if (m.t === "K") click(cardEl(s.deck[Rules.wasteTop(s)]));
  else if (m.t === "p") {
    click(cardEl(s.pyr[m.i]));
    click(cardEl(s.pyr[m.j]));
  } else if (m.t === "w") {
    click(cardEl(s.deck[Rules.wasteTop(s)]));
    click(cardEl(s.pyr[m.i]));
  }
}

async function settle(ms = 8000) {
  for (let w = 0; w < ms / 50 && $("light").dataset.v === "checking"; w++) await env.advance(50);
  await env.advance(700);
}

// Plays a game to its win by clicks, following the solver; returns the number of moves.
async function playToWin(g, onMove) {
  let s = fromSave(g);
  const path = solve(s, 60000, { maxNodes: 4000000 }).path;
  check(path && path.length > 3, `the solver finds a path for ${g}`);
  let n = 0;
  for (const m of path || []) {
    if ($("dlg-win").open) break;
    play(s, m);
    await env.advance(5);
    n += 1;
    if (onMove) await onMove(n);
    s = fromSave(g);
  }
  await env.advance(5000);
  return n;
}

// ---- 1. a first start shows the picker with the three games, each with its table drawn small
await boot();
check($("app").dataset.view === "picker", "a first start shows the picker");
check(!$("picker").hidden && $("table").hidden && $("bottom").hidden, "only the picker shows");
for (const g of Rules.GAMES) {
  check($(`name-${g}`).textContent.length > 2, `the ${g} tile has a name`);
  check($(`mini-${g}`).children.length === 1, `the ${g} tile draws its table`);
  const cards = $(`mini-${g}`).querySelectorAll(".card").length;
  check(cards >= 28, `the ${g} tile shows its cards (${cards})`);
  check(/Today's deal/.test($(`daily-text-${g}`).textContent), `the ${g} tile offers today's deal`);
  check(saved(g) && saved(g).deal.kind === "winnable", `${g} has a winnable deal waiting`);
}
check($("name-peaks").textContent === "Peaks", "the third game is called Peaks");

// ---- 2. Pyramid: open it, the light, the line for new players, and a game won by clicks
click($("open-pyramid"));
await settle();
check(location.hash === "#/pyramid" && $("app").dataset.view === "game", "the tile opens Pyramid at #/pyramid");
check(!$("table").hidden && !$("bottom").hidden, "the table and the buttons show");
check($("light").dataset.v === "win", `Pyramid's light says winnable (${$("light").dataset.v})`);
check(!$("first-help").hidden && /Pyramid/.test($("first-help-text").textContent), "the line for new players shows");
check($("first-help").parentNode.id === "bottom", "the line for new players sits in the bottom band, off the cards");
$("btn-light").click();
check(/^Green/.test($("notice-text").textContent), `a tap on the light explains it: ${$("notice-text").textContent}`);
check(/still be won/.test($("btn-light").getAttribute("aria-label")), "the moves button says what the light says");
$("notice-close").click();
check(document.querySelectorAll(".card.free").length >= 7, "the bottom row and the stock's card can be played");
// A covered card says why it cannot go.
const s0 = fromSave("pyramid");
click(cardEl(s0.pyr[0]));
check($("notice").hidden, "a covered card cannot be clicked (it is no button)");
// A tap on a free card picks it up; a tap again puts it back.
const free0 = s0.pyr[21];
click(cardEl(free0));
check(cardEl(free0).classList.contains("sel"), "a tap picks a Pyramid card up");
click(cardEl(free0));
check(!cardEl(free0).classList.contains("sel"), "a second tap puts it back");
let pyrMoves = 0;
await playToWin("pyramid", async (n) => {
  pyrMoves = n;
  if (n === 1) check($("first-help").hidden, "the first move puts the line away");
  if (n === 3) {
    const before = $("moves").textContent;
    $("btn-undo").click();
    await env.advance(5);
    check(Number($("moves").textContent) === Number(before) - 1, "Undo takes a move back");
    const s = fromSave("pyramid");
    const again = solve(s, 20000, { maxNodes: 2000000 }).path;
    play(s, again[0]);
    await env.advance(5);
  }
});
check($("dlg-win").open, `Pyramid's win dialog opens (${pyrMoves} moves)`);
check(/Pyramid/.test($("win-game").textContent), "the win names the game");
check(JSON.parse(env.store.get("patience/stats")).pyramid.won === 1, "statistics count the win");
$("win-games").click();
await env.advance(10);
check($("app").dataset.view === "picker" && location.hash === "#/", "All games goes back to the picker");
check(/Won 1 of 1/.test($("wins-pyramid").textContent), `the tile counts the win (${$("wins-pyramid").textContent})`);
check(
  saved("pyramid").steps === "" && /fresh deal/.test($("state-pyramid").textContent),
  "after a win the tile shows the next deal",
);

// ---- 3. Golf: a tap on a card that does not fit says why, and the message stays
click($("open-golf"));
await settle();
check(location.hash === "#/golf", "the Golf tile opens Golf");
let g0 = fromSave("golf");
const misfit = g0.cols.map((c) => c[c.length - 1]).find((id) => !Rules.fits(g0, id));
if (misfit !== undefined) {
  click(cardEl(misfit));
  await env.advance(20000);
  check(!$("notice").hidden && $("notice-text").textContent.length > 10, "a card that does not fit says why");
  check(!$("notice").hidden, "the message is still there 20 s later");
}
// The honest hint, which stays until the next move.
$("btn-hint").click();
for (let w = 0; w < 400 && !/Try the|Turn a card/.test($("notice-text").textContent); w++) await env.advance(20);
check(
  /Try the|Turn a card/.test($("notice-text").textContent),
  `the hint says what to do: ${$("notice-text").textContent}`,
);
await env.advance(20000);
check(/Try the|Turn a card/.test($("notice-text").textContent), "the hint is still there 20 s later");
await playToWin("golf");
check($("dlg-win").open, "Golf is won by clicks");
check($("notice").hidden, "no message is left over after the win");
$("win-new").click();
await settle();
check(saved("golf").steps === "" && !$("dlg-win").open, "New game after a win deals again");

// ---- 4. Golf lost by drawing the whole stock: the light, the way back and "no moves left"
g0 = fromSave("golf");
for (let k = 0; k < 16; k++) {
  click(stockEl());
  await env.advance(5);
}
await settle(15000);
g0 = fromSave("golf");
check(g0.sp === 16, "the whole stock is turned");
check($("light").dataset.v === "lost", `the light says lost (${$("light").dataset.v})`);
for (let w = 0; w < 200 && $("btn-back").hidden; w++) await env.advance(50);
check(!$("verdict").hidden, "the verdict bar shows");
check(!Rules.anyMove(g0) || Rules.legalMoves(g0).length > 0, "the position after the stock is known");
if (!Rules.anyMove(g0)) {
  check($("verdict").classList.contains("stuck"), "no moves left: the bar says so");
  check(!$("stuck-restart").hidden && !$("stuck-new").hidden, "the bar offers Restart and New deal");
}
check(!$("btn-back").hidden, "the bar offers the way back");
$("btn-back").click();
await settle();
check($("light").dataset.v === "win", `back where Golf can be won (${$("light").dataset.v})`);
check(!$("notice").hidden && /can still be won/.test($("notice-text").textContent), "the way back says so");

// ---- 4b. played to the end with no move left: the gentle bar with Undo, Restart and New deal
for (let k = 0; k < 80; k++) {
  const s = fromSave("golf");
  const moves = Rules.legalMoves(s);
  if (!moves.length) break;
  play(s, moves[0]);
  await env.advance(5);
}
await settle(15000);
check(!Rules.anyMove(fromSave("golf")), "the game is played to its end");
check(!$("verdict").hidden && $("verdict").classList.contains("stuck"), "no moves left: the bar says so");
check(/No moves left/.test($("verdict-text").textContent), `the bar's words: ${$("verdict-text").textContent}`);
check(!$("stuck-restart").hidden && !$("stuck-new").hidden, "the bar offers Restart and New deal");
check(!$("btn-back").hidden || !$("stuck-undo").hidden, "the bar offers Undo or the way back");
const dealBefore = saved("golf").deal.seed;
$("stuck-restart").click();
await settle();
check(saved("golf").steps === "" && saved("golf").deal.seed === dealBefore, "Restart deals the same cards again");
check($("verdict").hidden, "the bar goes with the restart");

// ---- 5. Peaks: a game won by clicks, with the run
click($("btn-games"));
await env.advance(10);
check($("app").dataset.view === "picker", "the header's button goes to the picker");
click($("open-peaks"));
await settle();
let bestChip = 0;
await playToWin("peaks", async () => {
  const chip = document.querySelectorAll(".run-chip")[0];
  if (!chip.hidden) bestChip = Math.max(bestChip, Number(chip.dataset.n));
});
check(bestChip >= 2, `the run chip counts a run (${bestChip})`);
check($("dlg-win").open && !$("win-run-box").hidden, "Peaks' win shows the longest run");
$("win-close").click();

// ---- 6. the game comes back after a restart, and the history leads Back to the picker
hist.back();
await env.advance(10);
click($("open-golf"));
await settle();
const golfBefore = saved("golf").steps;
const movesBefore = $("moves").textContent;
await boot(new Map(env.store));
await settle();
check($("app").dataset.view === "game" && location.hash === "#/golf", "a restart opens the game played last");
check(
  saved("golf").steps === golfBefore && $("moves").textContent === movesBefore,
  "the restarted game keeps its moves",
);
hist.back();
await env.advance(10);
check($("app").dataset.view === "picker", "Back from a game opened at start leads to the picker");

// ---- 7. the daily deal from the picker's tile, and a win of it
click($("daily-peaks"));
await settle();
check(saved("peaks").deal.kind === "daily", "the tile's chip starts today's Peaks deal");
check($("light").dataset.v === "win", "the daily deal starts winnable");
await playToWin("peaks");
check($("dlg-win").open && /daily deal/i.test($("win-record").textContent), "the daily deal is won");
$("win-games").click();
await env.advance(10);
check(
  /solved/.test($("daily-text-peaks").textContent),
  `the tile marks today's deal solved: ${$("daily-text-peaks").textContent}`,
);

// ---- 8. rules: a game not started yet is dealt again with the new rules
click($("open-golf"));
await settle();
$("btn-new").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await settle();
$("btn-settings").click();
$("kings-wrap").click();
await env.advance(20);
check(saved("golf").deal.opts.kings === "wrap", "a new rule deals the waiting game again");
$("tab-game").click();
check(!$("panel-game").hidden, "the Game tab shows the rules");
$("settings-done").click();

// ---- 9. statistics and the guide
$("btn-stats").click();
check($("st-body").children.length === 9, "statistics have nine rows");
check($("st-head-golf").textContent === "Golf", "statistics have a column per game");
$("stats-done").click();
$("btn-help").click();
check($("dlg-help").open && !$("help-golf").hidden && $("help-pyramid").hidden, "How to play opens at Golf");
check($("ex-golf-1").children.length === 1, "the guide draws its pictures");
check($("rule-golfRule2").textContent.includes("king"), "the guide's king rule follows the rules chosen");
$("help-done").click();

// ---- 9b. every setting, the calendar, a reset, the keys and a drag: nothing throws, and each takes effect
$("btn-settings").click();
for (const id of [
  "size-large",
  "size-largest",
  "size-normal",
  "theme-dark",
  "theme-light",
  "theme-device",
  "passes-1",
  "passes-0",
  "passes-3",
  "kings-queen",
  "kings-none",
  "deals-any",
  "deals-winnable",
  "lang-sk",
  "lang-en",
])
  $(id).click();
for (const name of ["deck", "shape", "back", "table"]) {
  const radios = document.querySelectorAll("input").filter((el) => el.name === name);
  check(radios.length >= 2, `the ${name} choices are drawn (${radios.length})`);
  radios[radios.length - 1].click();
  radios[0].click();
}
for (const id of [
  "opt-four",
  "opt-contrast",
  "opt-wrap",
  "opt-open",
  "opt-right",
  "opt-targets",
  "opt-clock",
  "opt-light",
  "opt-hints",
  "opt-finish",
  "opt-vibration",
]) {
  $(id).click();
  $(id).click();
}
const sv = JSON.parse(env.store.get("patience/settings"));
check(
  sv.rules.golf.kings === "none" && sv.rules.pyramid.passes === 3 && sv.deals === "winnable",
  "the rules are saved",
);
check($("opt-vibration-row").hidden, "without haptics the vibration switch stays out of the way");
$("opt-targets").click();
$("settings-done").click();
await settle();
const sg = fromSave("golf");
const playable = Rules.legalMoves(sg).filter((m) => m.t === "c").length;
check(
  document.querySelectorAll(".card.can").length === playable,
  `"show where a card can go" outlines the ${playable} playable cards`,
);
$("btn-daily").click();
check($("dlg-daily").open && $("cal").children.length > 28, "the calendar opens with this month");
$("cal-prev").click();
$("cal-next").click();
$("daily-close").click();
$("btn-stats").click();
$("stats-reset").click();
$("reset-yes").click();
check(JSON.parse(env.store.get("patience/stats")).pyramid.won === 0, "a reset clears the statistics");
$("stats-done").click();
for (const key of ["h", "u", "d", "Escape"]) document.body.dispatch("keydown", { key });
await settle();
check($("dlg-new").open === false, "the keys work without opening a dialog");
// A drag of a card that does not fit glides back; a drag onto the waste plays it.
{
  const s = fromSave("golf");
  const id = s.cols.map((c) => c[c.length - 1]).find((c) => Rules.fits(s, c));
  if (id !== undefined) {
    const el = cardEl(id);
    const x0 = parseFloat(el.style.left) + 5;
    const y0 = parseFloat(el.style.top) + 5;
    const waste = s.waste[s.waste.length - 1];
    const wx = parseFloat(cardEl(waste).style.left) + 10;
    const wy = parseFloat(cardEl(waste).style.top) + 10;
    const before = saved("golf").steps;
    $("table").dispatch("pointerdown", { pointerId: 1, clientX: x0, clientY: y0, button: 0, pointerType: "touch" });
    $("table").dispatch("pointermove", { pointerId: 1, clientX: x0 + 30, clientY: y0 + 30, pointerType: "touch" });
    $("table").dispatch("pointermove", { pointerId: 1, clientX: wx, clientY: wy, pointerType: "touch" });
    $("table").dispatch("pointerup", { pointerId: 1, clientX: wx, clientY: wy, pointerType: "touch" });
    await env.advance(10);
    check(saved("golf").steps.length > before.length, "a card dragged onto the waste is played");
  }
}
$("btn-help").click();
for (const g of Rules.GAMES) {
  $(`tab-help-${g}`).click();
  check(!$(`help-${g}`).hidden, `the guide shows ${g}`);
}
$("help-done").click();

// ---- 10. Slovak
const store = new Map(env.store);
const st = JSON.parse(store.get("patience/settings"));
st.lang = "sk";
store.set("patience/settings", JSON.stringify(st));
await boot(store);
await settle();
hist.back();
await env.advance(10);
check($("name-pyramid").textContent === "Pyramída", `Slovak names the games (${$("name-pyramid").textContent})`);
check(document.title === "Patience", "the app's name stays");
click($("open-pyramid"));
await settle();
check($("btn-undo").textContent.includes("Späť"), "the buttons speak Slovak");

// ---- 11. a first start, the first move: one line says what the green light means, until the next move
await boot();
await settle();
click($("open-golf"));
await settle();
{
  const s = fromSave("golf");
  const path = solve(s, 60000, { maxNodes: 4000000 }).path;
  play(s, path[0]);
  await settle();
  check(
    /green dot/.test($("notice-text").textContent),
    `the light is introduced once: ${$("notice-text").textContent}`,
  );
  play(fromSave("golf"), path[1]);
  await settle();
  check(!/green dot/.test($("notice-text").textContent), "the introduction goes with the next move");
  check(JSON.parse(env.store.get("patience/progress")).lightSeen === true, "and it never comes back");
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log(
  `page ok (${checks} checks): picker, three games won by clicks, hints, the light and the way back, daily deals, Slovak`,
);
process.exit(0);
