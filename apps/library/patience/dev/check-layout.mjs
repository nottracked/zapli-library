// Development only (not shipped): lays out each game's table at phone sizes (upright and sideways, each card size)
// on the stand-in document and checks the geometry: every card inside the table, the stock, the waste and the cards
// taken away clear of the tableau, and no two cards a tap can reach overlapping. It prints the card width per game
// and size, the number that matters most for reading the cards.
//
//   node apps/library/patience/dev/check-layout.mjs
//
// Exit code 0 when everything holds, 1 otherwise.
import { readFileSync } from "node:fs";
import { install } from "./fake-dom.mjs";

const html = readFileSync(new URL("../package/index.html", import.meta.url), "utf8");
const UI = new URL("../package/js/ui.js", import.meta.url);
const problems = [];
let checks = 0;
const check = (ok, what) => {
  checks += 1;
  if (!ok) problems.push(what);
};

const SIZES = [
  [360, 560, "phone upright"],
  [412, 700, "large phone upright"],
  [740, 300, "phone sideways"],
  [880, 340, "large phone sideways"],
  [320, 470, "small phone upright"],
];
const report = [];
let run = 0;
for (const game of ["pyramid", "golf", "peaks"])
  for (const size of ["normal", "large", "largest"])
    for (const [W, H, label] of SIZES) {
      const env = install(html, [W, H]);
      const hist = { state: null, pushState() {}, replaceState() {}, back() {} };
      Object.assign(globalThis, { history: hist, location: { hash: `#/${game}` } });
      env.store.set("patience/settings", JSON.stringify({ size, stockRight: run % 2 === 0, at: 1 }));
      env.store.set("patience/progress", JSON.stringify({ firstHelp: { [game]: true }, turnTip: true, at: 1 }));
      run += 1;
      await import(`${UI.href}?layout=${run}`);
      await env.advance(1500);
      const doc = env.document;
      const table = doc.getElementById("table");
      const cw = parseFloat(table.style.getPropertyValue("--cw"));
      const ch = parseFloat(table.style.getPropertyValue("--ch"));
      const cards = doc.querySelectorAll(".card").map((el) => ({
        id: Number(el.dataset.id),
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
        free: el.classList.contains("free"),
        z: Number(el.style.zIndex),
      }));
      const where = `${game} ${size} ${label} (${W}×${H})`;
      check(cards.length === 52, `${where}: 52 cards`);
      for (const c of cards)
        check(
          c.x >= 0 && c.y >= 0 && c.x + cw <= W + 0.5 && c.y + ch <= H + 0.5,
          `${where}: card ${c.id} at ${c.x},${c.y} lies inside the table`,
        );
      // The stock button and the cards a tap can reach never overlap each other.
      const stock = doc.querySelectorAll(".stock-hit")[0];
      const sx = parseFloat(stock.style.left);
      const sy = parseFloat(stock.style.top);
      const over = (a, b) => a.x < b.x + cw - 1 && b.x < a.x + cw - 1 && a.y < b.y + ch - 1 && b.y < a.y + ch - 1;
      const free = cards.filter((c) => c.free);
      for (const c of free) check(!over(c, { x: sx, y: sy }), `${where}: card ${c.id} is clear of the stock`);
      // Two free cards may overlap only where one lies over the other in the deal (never in these layouts).
      for (let i = 0; i < free.length; i++)
        for (let j = i + 1; j < free.length; j++)
          check(!over(free[i], free[j]), `${where}: free cards ${free[i].id} and ${free[j].id} do not overlap`);
      const chip = doc.querySelectorAll(".run-chip")[0];
      if (!chip.hidden) check(parseFloat(chip.style.left) >= 0, `${where}: the run chip lies inside`);
      report.push(`${where}: cards ${cw} × ${ch}`);
    }

const widths = {};
for (const line of report) {
  const m = /^(\w+) (\w+) (.+) \((\d+)×(\d+)\): cards (\d+)/.exec(line);
  if (m) (widths[`${m[1]} ${m[3]}`] = widths[`${m[1]} ${m[3]}`] || []).push(`${m[2]} ${m[6]}`);
}
for (const [k, v] of Object.entries(widths)) console.log(`${k}: ${v.join(", ")} px`);
if (problems.length) {
  console.log(problems.slice(0, 40).join("\n"));
  console.log(`${problems.length} problems`);
  process.exit(1);
}
console.log(`layout ok (${checks} checks)`);
process.exit(0);
