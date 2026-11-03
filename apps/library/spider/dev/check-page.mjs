// Development only (not shipped): starts the real page (index.html with js/ui.js) on the stand-in document of
// fake-dom.mjs and plays it with clicks, in English and Slovak, to catch mistakes in the page's code paths that the
// rules checks cannot reach. It checks behaviour, not looks: nothing is laid out or drawn.
//
//   node apps/library/spider/dev/check-page.mjs
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
let env = null;
async function boot(store) {
  env = install(html);
  if (store) for (const [k, v] of store) env.store.set(k, v);
  run += 1;
  await import(`${UI.href}?run=${run}`);
  await env.advance(3000);
}

const $ = (id) => document.getElementById(id);
const piles = (kind) => document.querySelectorAll(`.pile.${kind}`);
const cardsOf = (pile) => pile.children.filter((c) => c.classList.contains("card"));
const ids = (els) => els.map((c) => Number(c.dataset.id));
const saved = () => JSON.parse(env.store.get("spider/game") || "null");

// The position as the page shows it (the number of suits from the save).
function shown() {
  const g = saved();
  return {
    suits: g ? g.deal.suits : 1,
    moves: 0,
    stock: ids(cardsOf(piles("stock")[0])),
    done: piles("done")
      .map((p) => ids(cardsOf(p)).reverse())
      .filter((r) => r.length),
    cols: piles("tab").map((p) => {
      const cs = cardsOf(p);
      return {
        down: ids(cs.filter((c) => c.classList.contains("down"))),
        up: ids(cs.filter((c) => !c.classList.contains("down"))),
      };
    }),
  };
}

// The position the save describes, played again from its deal.
function fromSave() {
  const g = saved();
  const s = Rules.deal(g.deal.seed, g.deal.suits);
  for (const w of g.steps ? g.steps.split(" ") : []) Rules.replay(s, Rules.opParse(w));
  return s;
}

const cardEl = (id) => document.querySelectorAll(".card").find((c) => c.dataset.id === String(id));

// One move by two clicks (the card, then the column), or a tap on the stock.
function play(m) {
  if (m.deal) {
    piles("stock")[0].dispatch("click");
    return;
  }
  const s = shown();
  cardEl(s.cols[m.src.i].up[m.src.k]).dispatch("click");
  piles("tab")[m.dst.i].dispatch("click");
}

async function settle(ms = 6000) {
  for (let w = 0; w < ms / 50 && $("light").dataset.v === "checking"; w++) await env.advance(50);
  await env.advance(600);
}

// ---- 1. a first start deals a winnable one-suit game, and the light says so
await boot();
await settle();
let s = shown();
check(s.cols.every((c) => c.up.length === 1) && s.stock.length === 50, "54 cards dealt, 50 in the stock");
check(Rules.key(s) === Rules.key(fromSave()), "the page shows the saved deal");
check(saved().deal.kind === "winnable" && saved().deal.suits === 1, "a winnable one-suit deal by default");
check($("light").dataset.v === "win", `the light says winnable (${$("light").dataset.v})`);
check(!$("first-help").hidden, "the very first game shows the line for new players");
check($("turn-tip").hidden, "the sideways tip waits");

// ---- 2. play the solver's path with clicks to the win
const path = solve(shown(), 30000, { maxNodes: 200000 }).path;
check(path && path.length > 20, "the solver finds a path");
let n = 0;
for (const m of path) {
  play(m);
  await env.advance(5);
  n += 1;
  if (n === 1) check($("first-help").hidden, "the first move puts the line for new players away");
  if (n === 3) {
    check(!$("turn-tip").hidden, "three moves in, upright, the sideways tip shows");
    $("turn-tip").click();
    check($("turn-tip").hidden, "a tap puts the sideways tip away");
  }
  if (n === 6) {
    check($("moves").textContent === "6", `six moves counted (${$("moves").textContent})`);
    $("btn-undo").click();
    await env.advance(5);
    check($("moves").textContent === "5", "undo takes one back");
    play(m);
    await env.advance(5);
  }
  if ($("dlg-win").open) break;
}
await env.advance(5000);
check($("dlg-win").open, "the win dialog opens after the last move");
check(/One suit/.test($("win-record").textContent), `the win names the suits: ${$("win-record").textContent}`);
$("win-stats").click();
check($("st-1-won").textContent === "1" && $("st-1-played").textContent === "1", "statistics count the win");
$("stats-done").click();

// ---- 3. a new game, a few moves, and the game comes back after a restart
$("btn-new").click();
await settle();
const p2 = solve(shown(), 30000, { maxNodes: 200000 }).path;
for (const m of p2.slice(0, 8)) {
  play(m);
  await env.advance(5);
}
const before = Rules.key(shown());
const movesBefore = $("moves").textContent;
await boot(new Map(env.store));
await settle();
check(Rules.key(shown()) === before, "the restarted page keeps the position");
check($("first-help").hidden && $("turn-tip").hidden, "after a restart neither line comes back");
check($("moves").textContent === movesBefore, "the restarted page keeps the move count");
$("btn-undo").click();
await env.advance(10);
check(String(Number(movesBefore) - 1) === $("moves").textContent, "undo works after a restart");

// ---- 4. the honest hint
$("btn-hint").click();
for (let w = 0; w < 400 && !/Try the|Deal a row/.test($("notice-text").textContent); w++) await env.advance(20);
check(
  /Try the|Deal a row/.test($("notice-text").textContent),
  `the hint says what to do: ${$("notice-text").textContent}`,
);
check(document.querySelectorAll(".hint-target").length === 1, "the hint marks a place");

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
  const m5 = solve(shown(), 30000, { maxNodes: 200000 }).path[0];
  play(m5);
  await env.advance(10);
}
check($("notice").hidden || !/Try the|Deal a row/.test($("notice-text").textContent), "a move ends the hint's words");
check(!document.querySelectorAll(".hint-target").length, "a move ends the hint's outlines");

// ---- 5. dealing needs every column filled
$("btn-new").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await settle();
s = shown();
let emptied = false;
for (let step = 0; step < 200 && !emptied; step++) {
  s = shown();
  emptied = s.cols.some((c) => !c.up.length && !c.down.length);
  if (emptied) break;
  // Move the shortest column's run anywhere it fits.
  let done = false;
  for (const i of [...Array(10).keys()].sort(
    (a, b) => s.cols[a].down.length + s.cols[a].up.length - (s.cols[b].down.length + s.cols[b].up.length),
  )) {
    const col = s.cols[i];
    const k = col.up.length - Rules.runLength(s, col);
    const dst = Rules.legalTargets(s, { from: "tab", i, k }).find((d) => s.cols[d.i].up.length);
    if (dst && col.up.length) {
      play({ src: { from: "tab", i, k }, dst });
      await env.advance(5);
      done = true;
      break;
    }
  }
  if (!done) {
    if (!Rules.canDeal(s)) break;
    play({ deal: true });
    await env.advance(5);
  }
}
if (emptied) {
  const stockBefore = shown().stock.length;
  play({ deal: true });
  await env.advance(5);
  check(shown().stock.length === stockBefore, "no deal while a column is empty");
  check(/empty column/.test($("notice-text").textContent), `it says why: ${$("notice-text").textContent}`);
} else console.log("note: no column emptied in this game; the deal rule was not tried");

// ---- 6. a lost game, then back to where it could be won. A losing line for a fixed deal is found here first
// (random moves until the solver proves the position lost), then played on the page from a saved game.
let seed = 5;
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
let line = null;
for (let g = 0; g < 20 && !line; g++) {
  const t = Rules.deal(777 + g, 1);
  const moves = [];
  for (let step = 0; step < 120; step++) {
    const choices = [];
    for (let i = 0; i < 10; i++) {
      const col = t.cols[i];
      for (let k = col.up.length - Rules.runLength(t, col); k < col.up.length; k++)
        for (const d of Rules.legalTargets(t, { from: "tab", i, k }))
          choices.push({ src: { from: "tab", i, k }, dst: d });
    }
    let m;
    if (Rules.canDeal(t) && (rnd() < 0.2 || !choices.length)) m = { deal: true };
    else if (choices.length) m = choices[Math.floor(rnd() * choices.length)];
    else break;
    if (m.deal) Rules.dealRow(t);
    else Rules.move(t, m.src, m.dst);
    moves.push(m);
    if (step % 10 === 9 && solve(t, 3000, { maxNodes: 40000 }).status === "lost") {
      line = { seed: 777 + g, moves };
      break;
    }
  }
}
check(!!line, "a losing line is found for the check");
if (line) {
  const store = new Map(env.store);
  store.set(
    "spider/game",
    JSON.stringify({ v: 1, deal: { kind: "any", seed: line.seed, suits: 1 }, steps: "", at: 1 }),
  );
  await boot(store);
  await settle();
  for (const m of line.moves) {
    play(m);
    await env.advance(5);
  }
  await settle();
  check($("light").dataset.v === "lost", `the light says lost after the losing line (${$("light").dataset.v})`);
  for (let w = 0; w < 400 && $("verdict").hidden; w++) await env.advance(50);
  check(!$("verdict").hidden, "the verdict bar shows");
  if (!$("btn-back").hidden) {
    $("btn-back").click();
    await settle();
    check(
      $("light").dataset.v === "win" || $("light").dataset.v === "unsure",
      `after going back the light is no longer amber (${$("light").dataset.v})`,
    );
  } else console.log("note: no way back was found in time for this line");
}

// ---- 7. settings: two suits, Slovak, every look
$("btn-new").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await settle();
$("btn-settings").click();
$("tab-game").click();
$("suits-2").click();
await settle();
check(saved().deal.suits === 2, "two suits deal a two-suit game at once");
check($("table").querySelectorAll(".card.s1").length === 52, "half the cards are hearts");
$("lang-sk").click();
check(document.documentElement.lang === "sk", "Slovak is chosen");
check($("btn-new").textContent.includes("Nová hra"), "the toolbar speaks Slovak");
for (const id of ["opt-four", "opt-contrast", "opt-light", "opt-hints", "opt-finish", "opt-right"]) {
  $(id).click();
  $(id).click();
}
for (const name of ["deck", "shape", "back", "table"]) {
  const tiles = document.querySelectorAll(`#${name}-tiles input`);
  check(tiles.length >= 2, `${name} tiles are drawn`);
  tiles[1].click();
}
$("size-large").click();
$("settings-done").click();
check(Rules.key(shown()) === Rules.key(fromSave()), "the table is unchanged after every setting");
check(/Stĺpec 1/.test(piles("tab")[0].getAttribute("aria-label")), "columns are named in Slovak");

// ---- 8. the daily deal and statistics in Slovak
$("btn-daily").click();
check($("dlg-daily").open && document.querySelectorAll("#cal button").length >= 28, "the calendar shows");
$("daily-play").click();
await env.advance(10);
if ($("dlg-new").open) $("new-deal").click();
await settle();
check(saved().deal.kind === "daily" && saved().deal.suits === 2, "today's two-suit deal is dealt");
$("btn-stats").click();
check($("st-1-won").textContent === "1", "the one-suit win is still counted");
$("stats-done").click();
const keysLeft = document.documentElement
  .all()
  .filter((e) => e.dataset && e.dataset.t)
  .filter((e) => e.textContent === e.dataset.t);
check(!keysLeft.length, `every text has words: ${keysLeft.map((e) => e.dataset.t).join(", ")}`);

// ---- the guide and the first start's lines: How to play opens at its short start with a picture per rule; the
// line inviting a new player shows on the very first game only and goes for good after a tap; the sideways tip
// shows on a phone held upright a few moves in, goes when the phone turns, and never comes back.
await boot();
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
  const p4 = solve(shown(), 30000, { maxNodes: 200000 }).path.filter((m) => !m.deal);
  for (const m of p4.slice(0, 3)) {
    play(m);
    await env.advance(5);
  }
}
await env.advance(10);
check(!$("turn-tip").hidden, "three moves in, upright, the sideways tip shows");
env.resize(740, 300);
check($("turn-tip").hidden, "the tip goes when the phone turns");
env.resize(360, 560);
check($("turn-tip").hidden, "and does not come back upright");
await boot(new Map(env.store));
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
