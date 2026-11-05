// The Free Cells solver: whether a position can still be won, and a winning path when it can. It runs in its own
// worker (worker.js), so the game never waits for it, and the development checks run it in Node.
//
// Two searches, both over positions with safe cards already sent up (which never changes whether a game can be
// won) and with the free cells and the columns in any order counting as one position:
// - a best-first search for a short winning path, guided by how many cards are left and how deep the next cards
//   each foundation needs are buried;
// - when that runs out of room, a depth-first walk through every position that can be reached. When it finishes
//   without a win, the position cannot be won: that answer is exact, not a guess.
// Both stop at a budget of positions and time; then the answer is "not sure yet".
import { COLS, CELLS, clone, isWon, isRed, rankOf, suitOf, isSafe, move } from "./rules.js";

// A position's fingerprint: two independent 32-bit hashes of the cells (in any order), the foundations and the
// columns (in any order). Two different positions share one with a chance of about one in 2^64 per pair, far too
// rare to matter for the few million positions a search meets, and it keeps a table of them small.
function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

let H1 = 0;
let H2 = 0;
function fingerprint(s) {
  let a = 0x2545f491;
  let b = 0x6c8e9cf5;
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    let x = 0x811c9dc5;
    let y = 0x9e3779b9;
    for (let j = 0; j < col.length; j++) {
      x = Math.imul(x ^ (col[j] + 1), 16777619);
      y = Math.imul(y + col[j] + 7, 0x27d4eb2d) ^ (y >>> 15);
    }
    a = (a + mix(x ^ col.length)) | 0;
    b = (b + mix(y + col.length * 0x165667b1)) | 0;
  }
  for (let i = 0; i < CELLS; i++) {
    const c = s.cells[i];
    if (c >= 0) {
      a = (a + mix(c * 0x3c6ef372 + 0x1b873593)) | 0;
      b = (b + mix(c * 0x61c88647 + 0x7f4a7c15)) | 0;
    }
  }
  const f = s.found[0] | (s.found[1] << 4) | (s.found[2] << 8) | (s.found[3] << 12);
  H1 = mix(a ^ Math.imul(f, 0x9e3779b1)) | 1;
  H2 = mix(b + Math.imul(f, 0x85ebca77));
}

// A set of fingerprints: open addressing in two typed arrays, growing as it fills (a lane of 0 marks a free slot,
// so the first hash is never 0).
class Seen {
  constructor() {
    this.cap = 1 << 16;
    this.size = 0;
    this.a = new Int32Array(this.cap);
    this.b = new Int32Array(this.cap);
  }
  // Adds the fingerprint in H1/H2; false when it was already there.
  add() {
    if (this.size * 2 >= this.cap) this.grow();
    const mask = this.cap - 1;
    let i = (H1 ^ (H2 >>> 7)) & mask;
    for (;;) {
      const x = this.a[i];
      if (x === 0) {
        this.a[i] = H1;
        this.b[i] = H2;
        this.size += 1;
        return true;
      }
      if (x === H1 && this.b[i] === H2) return false;
      i = (i + 1) & mask;
    }
  }
  grow() {
    const { a, b } = this;
    this.cap *= 2;
    this.a = new Int32Array(this.cap);
    this.b = new Int32Array(this.cap);
    this.size = 0;
    const keep1 = H1;
    const keep2 = H2;
    for (let i = 0; i < a.length; i++)
      if (a[i] !== 0) {
        H1 = a[i];
        H2 = b[i];
        this.add();
      }
    H1 = keep1;
    H2 = keep2;
  }
}

// The same position text the rules use for the page's verdicts (cells and columns in any order).
function keyOf(s) {
  const cols = new Array(COLS);
  for (let i = 0; i < COLS; i++)
    cols[i] = String.fromCharCode.apply(
      null,
      s.cols[i].map((c) => 48 + c),
    );
  cols.sort();
  const held = s.cells.filter((c) => c >= 0).sort((a, b) => a - b);
  return `${String.fromCharCode.apply(
    null,
    held.map((c) => 48 + c),
  )}|${s.found.join(".")}|${cols.join(",")}`;
}

// Sends every safe card up (cells first, then column tops) and returns how many went.
function settle(s) {
  let n = 0;
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < CELLS; i++) {
      const c = s.cells[i];
      if (c >= 0 && s.found[suitOf(c)] === rankOf(c) - 1 && isSafe(s, c)) {
        s.found[suitOf(c)] += 1;
        s.cells[i] = -1;
        again = true;
        n += 1;
      }
    }
    for (let i = 0; i < COLS; i++) {
      const col = s.cols[i];
      const c = col[col.length - 1];
      if (col.length && s.found[suitOf(c)] === rankOf(c) - 1 && isSafe(s, c)) {
        s.found[suitOf(c)] += 1;
        col.pop();
        again = true;
        n += 1;
      }
    }
  }
  return n;
}

// The length of the run at the top of a column (cards that move together).
function runLength(col) {
  let n = col.length ? 1 : 0;
  for (let j = col.length - 1; j > 0; j--) {
    const a = col[j - 1];
    const b = col[j];
    if (rankOf(b) !== rankOf(a) - 1 || isRed(a) === isRed(b)) break;
    n += 1;
  }
  return n;
}

// Every move worth trying, as {src, dst} in the page's terms, most useful kinds first.
export function moves(s) {
  const out = [];
  let free = 0;
  let firstCell = -1;
  for (let i = 0; i < CELLS; i++)
    if (s.cells[i] < 0) {
      free += 1;
      if (firstCell < 0) firstCell = i;
    }
  let empties = 0;
  let firstEmpty = -1;
  for (let i = 0; i < COLS; i++)
    if (!s.cols[i].length) {
      empties += 1;
      if (firstEmpty < 0) firstEmpty = i;
    }
  const capFull = (free + 1) * 2 ** empties;
  const capEmpty = (free + 1) * 2 ** Math.max(0, empties - 1);

  // to a foundation
  for (let i = 0; i < CELLS; i++) {
    const c = s.cells[i];
    if (c >= 0 && s.found[suitOf(c)] === rankOf(c) - 1)
      out.push({ src: { from: "cell", i }, dst: { to: "found", i: suitOf(c) } });
  }
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    const c = col[col.length - 1];
    if (col.length && s.found[suitOf(c)] === rankOf(c) - 1)
      out.push({ src: { from: "tab", i, k: col.length - 1 }, dst: { to: "found", i: suitOf(c) } });
  }
  // runs onto other cards
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    if (!col.length) continue;
    const run = runLength(col);
    const topRank = rankOf(col[col.length - 1]);
    for (let j = 0; j < COLS; j++) {
      if (j === i) continue;
      const dcol = s.cols[j];
      if (!dcol.length) continue;
      const t = dcol[dcol.length - 1];
      const need = rankOf(t) - 1;
      const n = need - topRank + 1; // cards from the top up to the one of rank `need`
      if (n < 1 || n > run || n > capFull) continue;
      const head = col[col.length - n];
      if (isRed(head) === isRed(t)) continue;
      out.push({ src: { from: "tab", i, k: col.length - n }, dst: { to: "tab", i: j } });
    }
  }
  // free cells onto cards or into an empty column
  for (let i = 0; i < CELLS; i++) {
    const c = s.cells[i];
    if (c < 0) continue;
    for (let j = 0; j < COLS; j++) {
      const dcol = s.cols[j];
      if (!dcol.length) continue;
      const t = dcol[dcol.length - 1];
      if (rankOf(t) === rankOf(c) + 1 && isRed(t) !== isRed(c))
        out.push({ src: { from: "cell", i }, dst: { to: "tab", i: j } });
    }
    if (firstEmpty >= 0) out.push({ src: { from: "cell", i }, dst: { to: "tab", i: firstEmpty } });
  }
  // runs (or parts of them) into an empty column; moving a whole column there changes nothing
  if (firstEmpty >= 0)
    for (let i = 0; i < COLS; i++) {
      const col = s.cols[i];
      if (!col.length) continue;
      const run = runLength(col);
      for (let n = Math.min(run, capEmpty); n >= 1; n--) {
        if (n === col.length) continue;
        out.push({ src: { from: "tab", i, k: col.length - n }, dst: { to: "tab", i: firstEmpty } });
      }
    }
  // a column's top card into a free cell
  if (firstCell >= 0)
    for (let i = 0; i < COLS; i++) {
      const col = s.cols[i];
      if (col.length) out.push({ src: { from: "tab", i, k: col.length - 1 }, dst: { to: "cell", i: firstCell } });
    }
  return out;
}

// How far a position looks from a win: cards left, how deep the next card of each suit lies, full cells, and
// columns out of order; an empty column counts in its favour.
function estimate(s) {
  let left = 52;
  for (let f = 0; f < 4; f++) left -= s.found[f];
  let depth = 0;
  let breaks = 0;
  let empties = 0;
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    if (!col.length) empties += 1;
    for (let j = 0; j < col.length; j++) {
      const c = col[j];
      if (s.found[suitOf(c)] === rankOf(c) - 1) depth += col.length - 1 - j;
      if (j > 0) {
        const a = col[j - 1];
        if (rankOf(c) !== rankOf(a) - 1 || isRed(a) === isRed(c)) breaks += 1;
      }
    }
  }
  let held = 0;
  for (let i = 0; i < CELLS; i++) if (s.cells[i] >= 0) held += 1;
  return left * 2 + depth + breaks * 2 + held * 0.5 - empties;
}

// A binary heap of nodes by `f`, lowest first.
class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= x.f) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = x;
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= a.length) break;
        const r = l + 1;
        const c = r < a.length && a[r].f < a[l].f ? r : l;
        if (a[c].f >= last.f) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return top;
  }
}

function apply(s, m) {
  const t = clone(s);
  move(t, m.src, m.dst);
  settle(t);
  return t;
}

// The moves from the start to a node, as the player would make them (the safe cards that go up by themselves are
// not moves of their own).
function pathTo(node) {
  const out = [];
  for (let n = node; n.parent; n = n.parent) out.push(n.move);
  return out.reverse();
}

/**
 * A search that runs in slices: `step(ms)` works for about that long and returns "win", "lost", "running" or
 * "limit". For "win", `path` holds the winning moves from the start.
 * Options: bestNodes (positions the best-first search may meet before it hands over to the walk), proofNodes
 * (positions the walk may meet before it gives up with "limit").
 */
export function createSearch(start, opts = {}) {
  const bestNodes = opts.bestNodes || 40000;
  const proofNodes = opts.proofNodes || 2500000;
  const now = opts.now || (() => Date.now());
  const root = clone(start);
  root.moves = 0;
  const search = { status: "running", path: null, nodes: 0, phase: "best" };

  // Phase 1: best-first, for a short and natural path.
  let seen = new Seen();
  const heap = new Heap();
  const first = { s: root, parent: null, move: null, g: 0, f: 0 };
  heap.push(first);
  fingerprint(root);
  seen.add();

  // Phase 2: the full walk, depth first; its stack is the path to the position it looks at.
  let walk = null;

  function startWalk() {
    search.phase = "proof";
    heap.a = [];
    seen = new Seen();
    fingerprint(root);
    seen.add();
    walk = [{ s: root, list: firstMoves(root), i: 0, move: null }];
  }

  function bestSlice(deadline) {
    while (heap.size) {
      if ((search.nodes & 63) === 0 && now() > deadline) return "running";
      const node = heap.pop();
      search.nodes += 1;
      if (isWon(node.s)) {
        search.path = pathTo(node);
        return "win";
      }
      for (const m of node === first ? firstMoves(node.s) : moves(node.s)) {
        const t = apply(node.s, m);
        fingerprint(t);
        if (!seen.add()) continue;
        const g = node.g + 1;
        heap.push({ s: t, parent: node, move: m, g, f: estimate(t) + g * 0.5 });
      }
      // A node that has been looked at keeps only its way back (its parent and move), so the search's memory is
      // its frontier.
      if (node !== first) node.s = null;
      if (seen.size > bestNodes) {
        startWalk();
        return "running";
      }
    }
    // Every position was met: the best-first search alone settled it.
    return "lost";
  }

  function walkSlice(deadline) {
    let n = 0;
    while (walk.length) {
      if ((++n & 63) === 0 && now() > deadline) return "running";
      const top = walk[walk.length - 1];
      if (top.i >= top.list.length) {
        walk.pop();
        continue;
      }
      const m = top.list[top.i++];
      const t = apply(top.s, m);
      fingerprint(t);
      if (!seen.add()) continue;
      search.nodes += 1;
      if (isWon(t)) {
        search.path = walk
          .slice(1)
          .map((f) => f.move)
          .concat([m]);
        return "win";
      }
      if (seen.size >= proofNodes) return "limit";
      walk.push({ s: t, list: ordered(t), i: 0, move: m });
    }
    return "lost";
  }

  search.step = (ms) => {
    if (search.status !== "running") return search.status;
    const deadline = now() + ms;
    search.status = walk ? walkSlice(deadline) : bestSlice(deadline);
    if (search.status !== "running") {
      heap.a = [];
      walk = null;
      seen = null;
    }
    return search.status;
  };
  search.positions = () => (seen ? seen.size : 0);
  return search;
}

// The walk tries the moves whose positions look closest to a win first.
function ordered(s) {
  const list = moves(s);
  if (list.length < 2) return list;
  const scored = list.map((m) => ({ m, f: estimate(apply(s, m)) }));
  scored.sort((x, y) => x.f - y.f);
  return scored.map((x) => x.m);
}

// At the start, a safe card still waiting (the page sends them up only when the player wants it) is the first move;
// otherwise every move.
function firstMoves(s) {
  for (let i = 0; i < CELLS; i++) {
    const c = s.cells[i];
    if (c >= 0 && s.found[suitOf(c)] === rankOf(c) - 1 && isSafe(s, c))
      return [{ src: { from: "cell", i }, dst: { to: "found", i: suitOf(c) } }];
  }
  for (let i = 0; i < COLS; i++) {
    const col = s.cols[i];
    const c = col[col.length - 1];
    if (col.length && s.found[suitOf(c)] === rankOf(c) - 1 && isSafe(s, c))
      return [{ src: { from: "tab", i, k: col.length - 1 }, dst: { to: "found", i: suitOf(c) } }];
  }
  return moves(s);
}

/** Runs a search to its end within `ms` milliseconds (for the development checks). */
export function solve(start, ms, opts = {}) {
  const search = createSearch(start, opts);
  const end = Date.now() + ms;
  while (search.step(50) === "running" && Date.now() < end);
  return {
    status: search.status === "running" ? "limit" : search.status,
    path: search.path,
    nodes: search.nodes,
    positions: search.positions(),
  };
}

export const positionKey = keyOf;
