// Development only (not shipped): grades deals of the game's own rules, read from ../index.html.
//
// - Easy: following the game's own hints, with safe cards going up by themselves, wins without ever taking a move back.
// - Medium: not easy, but a short search wins (at most MEDIUM_NODES positions).
// - Hard: only a longer search wins (at most HARD_NODES positions).
// Deals no search wins within HARD_NODES are left out. Every grade assumes no limit on passes through the stock.
import { readFileSync } from "node:fs";
import vm from "node:vm";

export const MEDIUM_NODES = 1500;
export const HARD_NODES = 20000;

const HTML = new URL("../index.html", import.meta.url);

/** The text between two marker comments of index.html. */
export function block(start, end) {
  const html = readFileSync(HTML, "utf8");
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${start}`);
  return html.slice(a + start.length, b);
}

/** The game's Rules object, evaluated on its own. */
export function loadRules() {
  return vm.runInNewContext(`${block("// ---- rules: start", "// ---- rules: end")}; Rules`);
}

/** The deal lists the game ships. */
export function loadDeals() {
  return vm.runInNewContext(`${block("// ---- deals: start", "// ---- deals: end")}; DEALS`);
}

export function makeSolver(Rules) {
  // A position without its move count, with the columns sorted (they are interchangeable for winning).
  const key = (s) => {
    const cols = s.tab.map((c) => `${c.down.join(".")}/${c.up.join(".")}`).sort();
    return `${s.stock.join(".")}|${s.waste.join(".")}|${s.found.map((f) => f.length).join(".")}|${cols.join(",")}`;
  };
  const finishes = (s) => Rules.isWon(s) || (Rules.allFaceUp(s) && Rules.planFinish(s) !== null);

  function greedy(seed, draw) {
    const s = Rules.deal(seed, draw, 0);
    Rules.autoPlay(s);
    const seen = new Set();
    for (let n = 0; n < 3000; n++) {
      if (finishes(s)) return true;
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      const h = Rules.hint(s);
      if (!h) return false;
      if (h.stock) Rules.drawStock(s);
      else Rules.move(s, h.src, h.dst);
      Rules.autoPlay(s);
    }
    return false;
  }

  // The moves worth trying, most promising first.
  function moves(s) {
    const out = [];
    const tops = [];
    if (s.waste.length) tops.push({ from: "waste" });
    s.tab.forEach((c, i) => {
      if (c.up.length) tops.push({ from: "tab", i, k: c.up.length - 1 });
    });
    for (const src of tops) {
      const f = Rules.foundationFor(s, Rules.pick(s, src)[0]);
      if (f >= 0) out.push({ src, dst: { to: "found", i: f } });
    }
    for (let i = 0; i < 7; i++) {
      const c = s.tab[i];
      if (!c.up.length) continue;
      const src = { from: "tab", i, k: 0 };
      for (let j = 0; j < 7; j++) {
        const dst = { to: "tab", i: j };
        if (j === i || !Rules.canMove(s, src, dst)) continue;
        const empty = !s.tab[j].up.length;
        if (empty && !c.down.length) continue; // a king run that already starts its column
        out.push({ src, dst });
        if (empty) break; // one empty column is as good as another
      }
    }
    if (s.waste.length) {
      const src = { from: "waste" };
      let empty = false;
      for (let j = 0; j < 7; j++) {
        const dst = { to: "tab", i: j };
        if (!Rules.canMove(s, src, dst)) continue;
        if (!s.tab[j].up.length) {
          if (empty) continue;
          empty = true;
        }
        out.push({ src, dst });
      }
    }
    for (let i = 0; i < 7; i++) {
      const c = s.tab[i];
      for (let k = 1; k < c.up.length; k++) {
        if (Rules.foundationFor(s, c.up[k - 1]) < 0) continue;
        const src = { from: "tab", i, k };
        for (let j = 0; j < 7; j++)
          if (j !== i && Rules.canMove(s, src, { to: "tab", i: j })) {
            out.push({ src, dst: { to: "tab", i: j } });
            break;
          }
      }
    }
    if (s.stock.length || (s.waste.length && Rules.canRecycle(s))) out.push({ draw: true });
    for (let i = 0; i < 4; i++) {
      if (!s.found[i].length) continue;
      const src = { from: "found", i };
      for (let j = 0; j < 7; j++)
        if (s.tab[j].up.length && Rules.canMove(s, src, { to: "tab", i: j })) {
          out.push({ src, dst: { to: "tab", i: j } });
          break;
        }
    }
    return out;
  }

  // Depth-first search over positions; {won, nodes}.
  function search(seed, draw, budget) {
    const start = Rules.deal(seed, draw, 0);
    Rules.autoPlay(start);
    const seen = new Set();
    const stack = [start];
    let nodes = 0;
    while (stack.length) {
      const s = stack.pop();
      if (finishes(s)) return { won: true, nodes };
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      if (++nodes > budget) return { won: false, nodes };
      const ms = moves(s);
      for (let i = ms.length - 1; i >= 0; i--) {
        const t = Rules.clone(s);
        if (ms[i].draw) Rules.drawStock(t);
        else Rules.move(t, ms[i].src, ms[i].dst);
        Rules.autoPlay(t);
        stack.push(t);
      }
    }
    return { won: false, nodes };
  }

  /** "e", "m", "h" or null. */
  function grade(seed, draw) {
    if (greedy(seed, draw)) return "e";
    const r = search(seed, draw, HARD_NODES);
    if (!r.won) return null;
    return r.nodes <= MEDIUM_NODES ? "m" : "h";
  }

  return { greedy, search, grade };
}
