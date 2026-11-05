// Development only (not shipped): starts the real page (index.html with js/ui.js) on the stand-in document of
// fake-dom.mjs and plays it with clicks, in English and Slovak, to catch mistakes in the page's code paths that the
// rules checks cannot reach. It checks behaviour, not looks: nothing is laid out or drawn.
//
//   node apps/library/free-cells/dev/check-page.mjs
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
const check = (ok, what) => {
  if (!ok) problems.push(what);
};

let run = 0;
async function boot(store) {
  const env = install(html);
  if (store) for (const [k, v] of store) env.store.set(k, v);
  run += 1;
  await import(`${UI.href}?run=${run}`);
  await env.advance(3000);
  return env;
}

const $ = (id) => document.getElementById(id);
const piles = (kind) => document.querySelectorAll(`.pile.${kind}`);
const cardsIn = (pile) => pile.children.filter((c) => c.classList.contains("card")).map((c) => Number(c.dataset.id));

// The position as the page shows it.
function shown() {
  const cols = piles("tab").map(cardsIn);
  const cells = piles("cell").map((p) => (cardsIn(p).length ? cardsIn(p)[0] : -1));
  const found = piles("found").map((p) => cardsIn(p).length);
  return { moves: 0, cells, found, cols };
}

const cardEl = (id) => document.querySelectorAll(".card").find((c) => c.dataset.id === String(id));

// One move by two clicks: the card, then the place.
function play(m) {
  const s = shown();
  const id = m.src.from === "cell" ? s.cells[m.src.i] : s.cols[m.src.i][m.src.k];
  cardEl(id).dispatch("click");
  const kind = m.dst.to === "tab" ? "tab" : m.dst.to === "cell" ? "cell" : "found";
  piles(kind)[m.dst.i].dispatch("click");
}

// ---- 1. a first start deals a game
let env = await boot();
const n0 = Number($("deal-no").textContent);
check(n0 >= 1 && n0 <= Rules.MAX_DEAL, `deal number shown: ${$("deal-no").textContent}`);
check(Rules.isValid(shown()), "the table shows a valid position");
check($("moves").textContent === "0", "no moves at the start");
check(document.documentElement.lang === "en", "English by default");
check(!$("first-help").hidden, "the very first game shows the line for new players");
check($("turn-tip").hidden, "the sideways tip waits");

// ---- 2. a numbered deal from the deal dialog, then the light says it can be won
$("btn-deal").click();
check($("dlg-deal").open, "the deal dialog opens");
$("deal-input").value = "617";
$("deal-play").click();
await env.advance(4000);
check($("deal-no").textContent === "617", "deal 617 is dealt");
const s617 = Rules.dealNumbered(617);
Rules.autoPlay(s617);
check(Rules.key(shown()) === Rules.key(s617), "the page shows deal 617");
check($("light").dataset.v === "win", `the light says winnable at the start (${$("light").dataset.v})`);

// ---- 3. play the solver's path with clicks to the win
const path = solve(shown(), 20000).path;
check(path && path.length > 10, "the solver finds a path for deal 617");
let i = 0;
for (const m of path) {
  play(m);
  await env.advance(10);
  i += 1;
  if (i === 1) check($("first-help").hidden, "the first move puts the line for new players away");
  if (i === 3) {
    check(!$("turn-tip").hidden, "three moves in, upright, the sideways tip shows");
    $("turn-tip").click();
    check($("turn-tip").hidden, "a tap puts the sideways tip away");
  }
  if (i === 5) {
    check($("moves").textContent === "5", `five moves counted (${$("moves").textContent})`);
    $("btn-undo").click();
    await env.advance(10);
    check($("moves").textContent === "4", "undo takes one back");
    play(m);
    await env.advance(10);
  }
  if ($("dlg-win").open) break;
}
await env.advance(5000);
check($("dlg-win").open, "the win dialog opens after the last move");
check(/617/.test($("win-record").textContent), `the win names the deal: ${$("win-record").textContent}`);
$("win-stats").click();
check($("st-won").textContent === "1" && $("st-played").textContent === "1", "statistics count the win");
check($("st-streak").textContent === "1", "the winning streak is 1");
$("stats-done").click();

// ---- 4. a new game, a few moves, and the game comes back after a restart
$("btn-new").click();
await env.advance(4000);
const deal2 = $("deal-no").textContent;
const p2 = solve(shown(), 20000).path;
for (const m of p2.slice(0, 6)) {
  play(m);
  await env.advance(10);
}
const before = Rules.key(shown());
const movesBefore = $("moves").textContent;
const kept = new Map(env.store);
env = await boot(kept);
check($("deal-no").textContent === deal2, "the restarted page keeps the deal");
check(Rules.key(shown()) === before, "the restarted page keeps the position");
check($("first-help").hidden && $("turn-tip").hidden, "after a restart neither line comes back");
check($("moves").textContent === movesBefore, "the restarted page keeps the move count");
$("btn-undo").click();
await env.advance(10);
check(String(Number(movesBefore) - 1) === $("moves").textContent, "undo works after a restart");

// ---- 5. the honest hint: the hinted move is the solver's next move from here
$("btn-hint").click();
// The marks stay three seconds: look as soon as the hint shows.
for (let w = 0; w < 400 && !/Try the/.test($("notice-text").textContent); w++) await env.advance(20);
const hinted = document.querySelectorAll(".card.hinted");
check(hinted.length >= 1, "the hint marks a card");
check(document.querySelectorAll(".hint-target").length === 1, "the hint marks a place");
check(/Try the/.test($("notice-text").textContent), `the hint says what to try: ${$("notice-text").textContent}`);

// The hint stays until the player acts: after a long think it is still there; a tap on the notice puts it away;
// a move ends a new hint.
await env.advance(20000);
check(
  !$("notice").hidden && document.querySelectorAll(".hint-target").length === 1,
  "the hint is still shown after 20 s",
);
$("notice").dispatch("click");
check(
  $("notice").hidden && !document.querySelectorAll(".hint-target").length,
  "a tap on the notice puts the hint away",
);
$("btn-hint").click();
for (let w = 0; w < 400 && $("notice").hidden; w++) await env.advance(20);
check(!$("notice").hidden, "the hint shows again");
{
  const s5 = shown();
  const m5 = solve(s5, 20000).path[0];
  play(m5);
  await env.advance(10);
}
check($("notice").hidden || !/Try the/.test($("notice-text").textContent), "a move ends the hint's words");
check(!document.querySelectorAll(".hint-target").length, "a move ends the hint's outlines");

// ---- 6. a lost position: deal 11982 cannot be won, so the light turns amber at once and says so
$("btn-deal").click();
$("deal-input").value = "11982";
$("deal-input").dispatch("input");
check(!$("deal-error").hidden, "the deal dialog says 11982 cannot be won");
$("deal-play").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await env.advance(8000);
check($("deal-no").textContent === "11982", "deal 11982 is dealt");
check($("light").dataset.v === "lost", `the light says lost for 11982 (${$("light").dataset.v})`);
check(!$("verdict").hidden && $("btn-back").hidden, "the verdict bar shows, with no way back at the start");

// ---- 7. a mistake: fill the free cells badly until the game is lost, then go back
$("btn-deal").click();
$("deal-input").value = "1";
$("deal-play").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await env.advance(4000);
let lost = false;
for (let step = 0; step < 30 && !lost; step++) {
  const s = shown();
  // Put a column's top card into a free cell, column by column: soon nothing fits any more.
  const i = step % 8;
  const free = s.cells.indexOf(-1);
  if (free < 0 || !s.cols[i].length) break;
  play({ src: { from: "tab", i, k: s.cols[i].length - 1 }, dst: { to: "cell", i: free } });
  await env.advance(5000);
  lost = $("light").dataset.v === "lost";
}
check(lost, "filling the free cells loses deal 1, and the light says so");
await env.advance(8000);
check(!$("verdict").hidden && !$("btn-back").hidden, "the verdict bar offers the way back");
const backLabel = $("back-text").textContent;
$("btn-back").click();
await env.advance(5000);
check(
  $("light").dataset.v === "win",
  `after going back the light says winnable (${$("light").dataset.v}, ${backLabel})`,
);
check($("verdict").hidden, "the verdict bar is gone after going back");

// ---- 8. settings: Slovak, every look, the switches
$("btn-settings").click();
check($("dlg-settings").open, "the settings open");
$("lang-sk").click();
check(document.documentElement.lang === "sk", "Slovak is chosen");
check($("btn-new").textContent.includes("Nová hra"), "the toolbar speaks Slovak");
for (const id of ["opt-four", "opt-contrast", "opt-light", "opt-hints", "opt-autoplay", "opt-finish"]) {
  $(id).click();
  $(id).click();
}
$("opt-right").click();
for (const name of ["deck", "shape", "back", "table"]) {
  const tiles = document.querySelectorAll(`#${name}-tiles input`);
  check(tiles.length >= 2, `${name} tiles are drawn`);
  tiles[1].click();
}
$("size-largest").click();
$("theme-dark").click();
$("tab-game").click();
$("tap-send").click();
$("settings-done").click();
check(!$("dlg-settings").open, "the settings close");
const pv = Rules.key(shown());
check(Rules.isValid(shown()), "the table is still valid after every setting");
// "Send" mode: one tap on a card that can go somewhere moves it.
const s8 = shown();
let sent = false;
for (let c = 0; c < 8 && !sent; c++) {
  const col = s8.cols[c];
  if (!col.length) continue;
  const dst = Rules.bestTarget(s8, { from: "tab", i: c, k: col.length - 1 });
  if (!dst) continue;
  cardEl(col[col.length - 1]).dispatch("click");
  await env.advance(10);
  sent = Rules.key(shown()) !== pv;
}
check(sent, "a tap in send mode moves a card");

// ---- 9. the daily deal and its calendar
$("btn-daily").click();
check($("dlg-daily").open, "the daily deal's calendar opens");
check(document.querySelectorAll("#cal button").length >= 28, "the calendar has the month's days");
$("cal-prev").click();
$("cal-next").click();
$("daily-play").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await env.advance(3000);
const today = new Date();
const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
check($("deal-no").textContent === String(Rules.dailyNumber(key)), "today's deal is dealt");

// ---- 10. help and statistics in Slovak, every text found
$("btn-help").click();
check($("dlg-help").textContent.includes("Osem stĺpcov"), "the help speaks Slovak");
$("help-done").click();
$("btn-stats").click();
$("stats-reset").click();
$("reset-yes").click();
check($("st-won").textContent === "0", "statistics can be cleared");
$("stats-done").click();
const keysLeft = document.documentElement
  .all()
  .filter((e) => e.dataset && e.dataset.t)
  .filter((e) => e.textContent === e.dataset.t);
check(!keysLeft.length, `every text has words: ${keysLeft.map((e) => e.dataset.t).join(", ")}`);

// ---- the guide and the first start's lines: How to play opens at its short start with a picture per rule; the
// line inviting a new player shows on the very first game only and goes for good after a tap; the sideways tip
// shows on a phone held upright a few moves in, goes when the phone turns, and never comes back.
env = await boot();
check(!$("first-help").hidden && $("turn-tip").hidden, "a fresh start shows the line for new players only");
$("first-help").click();
check($("dlg-help").open, "the line opens How to play");
check($("first-help").hidden, "the line goes after a tap");
const rulesShown = document.querySelectorAll(".ex").length;
for (let k = 1; k <= rulesShown; k++)
  check($(`ex-${k}`).querySelectorAll(".card").length >= 1, `rule ${k} of the short start has its picture`);
check($("ex-1").querySelectorAll(".o").length >= 1, "the pictures have arrows");
check(
  document.querySelectorAll("[data-t-rich]").every((el) => el.children.some((c) => c.tagName === "B")),
  "every line of the short start has its key words in bold",
);
$("help-done").click();
$("dlg-help").querySelector(".dlg-body").scrollTop = 400;
$("btn-help").click();
check($("dlg-help").querySelector(".dlg-body").scrollTop === 0, "? opens How to play at its short start");
$("help-done").click();
{
  const p4 = solve(shown(), 20000).path;
  for (const m of p4.slice(0, 3)) {
    play(m);
    await env.advance(10);
  }
}
await env.advance(10);
check(!$("turn-tip").hidden, "three moves in, upright, the sideways tip shows");
env.resize(740, 300);
check($("turn-tip").hidden, "the tip goes when the phone turns");
env.resize(360, 560);
check($("turn-tip").hidden, "and does not come back upright");
env = await boot(new Map(env.store));
check($("first-help").hidden && $("turn-tip").hidden, "after a restart neither line comes back");

// ---- the corner index at the largest size fills the card's width: a common rank (0.62 of its height wide), the
// suit, the margins and the gap take the width, unless the rank would pass three quarters of the card's width.
{
  const { cardGeo, DECKS } = await import("../package/js/cards.js");
  for (const deck of ["bold", "crisp"])
    for (const cw of [30, 32, 34, 38, 42, 54]) {
      const g = cardGeo(cw, 2, "rect", 2, { deck, contrast: false });
      const used = Math.ceil(g.gh * 0.62) + g.sg + 2 * g.pad + 2;
      check(g.gh <= Math.round(cw * 0.75), `${deck} ${cw}px: the rank stays within three quarters of the width`);
      check(used >= cw - 2 || g.gh === Math.round(cw * 0.75), `${deck} ${cw}px: the corner fills the width (${used})`);
      check(g.rkmax >= Math.round(g.gh * 0.6), `${deck} ${cw}px: a 10 keeps most of its width`);
      const normal = cardGeo(cw, 0, "rect", 2, { deck, contrast: false });
      check(normal.gh === Math.round(cw * DECKS[deck].gh[0]), `${deck} ${cw}px: Normal keeps its proportions`);
    }
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("page ok");
process.exit(0);
