// The Spider solver: whether a position can still be won, and a winning path when it finds one. It runs in its own
// worker (worker.js), so the game never waits for it, and the development checks run it in Node.
//
// It knows the face-down cards and the stock, as the deal does, and looks for a way to win with them:
// - a greedy best-first search over the moves a good player would consider, guided by the face-down cards left,
//   the runs put away and how broken the columns are;
// - when that search runs out of moves, a walk through every move that can be made: when it ends without a win,
//   the position cannot be won, and that answer is exact.
// Spider has far too many positions to try them all, so within its budget of time and positions it often answers
// "limit": not sure. It never guesses.
import { COLS, rankOf, suitTable } from "./rules.js";

// The solver's own position: every column as one list of cards with the number of face-down cards at its bottom,
// the deals already made and the runs put away. The stock is the start's, in its order.
function fromGame(g) {
  return {
    cols: g.cols.map((c) => c.down.concat(c.up)),
    downs: g.cols.map((c) => c.down.length),
    dealt: 0,
    done: g.done.length,
  };
}

function copy(p) {
  return { cols: p.cols.slice(), downs: p.downs.slice(), dealt: p.dealt, done: p.done };
}

function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

// A set of 64-bit fingerprints: open addressing in two typed arrays, growing as it fills (a first lane of 0 marks a
// free slot, so it is never 0). Two different positions share a fingerprint with a chance of about one in 2^64 per
// pair, far too rare to matter for the positions a search meets.
class Seen {
  constructor() {
    this.cap = 1 << 16;
    this.size = 0;
    this.a = new Int32Array(this.cap);
    this.b = new Int32Array(this.cap);
  }
  add(h1, h2) {
    if (this.size * 2 >= this.cap) this.grow();
    const mask = this.cap - 1;
    let i = (h1 ^ (h2 >>> 7)) & mask;
    for (;;) {
      const x = this.a[i];
      if (x === 0) {
        this.a[i] = h1;
        this.b[i] = h2;
        this.size += 1;
        return true;
      }
      if (x === h1 && this.b[i] === h2) return false;
      i = (i + 1) & mask;
    }
  }
  grow() {
    const { a, b } = this;
    this.cap *= 2;
    this.a = new Int32Array(this.cap);
    this.b = new Int32Array(this.cap);
    this.size = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== 0) this.add(a[i], b[i]);
  }
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

/**
 * A search that runs in slices: `step(ms)` works for about that long and returns "win", "lost", "running" or
 * "limit". For "win", `path` holds the moves from the start: {src, dst} or {deal: true}.
 * Options: maxNodes (positions it may meet before "limit").
 */
export function createSearch(game, opts = {}) {
  const maxNodes = opts.maxNodes || 150000;
  const now = opts.now || (() => Date.now());
  const suit = suitTable(game.suits);
  const stock = game.stock.slice();
  const type = (c) => suit[c] * 13 + rankOf(c);
  const search = { status: "running", path: null, nodes: 0 };

  // Same suit, one lower: the link of a run.
  const linked = (a, b) => suit[a] === suit[b] && rankOf(b) === rankOf(a) - 1;

  function fingerprint(p) {
    let a = 0x2545f491 + p.dealt * 0x3c6ef372;
    let b = 0x6c8e9cf5 + p.dealt * 0x61c88647;
    for (let i = 0; i < COLS; i++) {
      const col = p.cols[i];
      let x = 0x811c9dc5 ^ p.downs[i];
      let y = 0x9e3779b9 + p.downs[i] * 0x165667b1;
      for (let j = 0; j < col.length; j++) {
        const t = type(col[j]);
        x = Math.imul(x ^ t, 16777619);
        y = Math.imul(y + t + 7, 0x27d4eb2d) ^ (y >>> 15);
      }
      a = (a + mix(x ^ col.length)) | 0;
      b = (b + mix(y + col.length * 0x165667b1)) | 0;
    }
    return [mix(a) | 1, mix(b)];
  }

  // How far a position looks from a win.
  function estimate(p) {
    let down = 0;
    let breaks = 0;
    let empties = 0;
    for (let i = 0; i < COLS; i++) {
      const col = p.cols[i];
      down += p.downs[i];
      if (!col.length) empties += 1;
      for (let j = Math.max(1, p.downs[i] + 1); j < col.length; j++) {
        const a = col[j - 1];
        const b = col[j];
        if (linked(a, b)) continue;
        breaks += rankOf(b) === rankOf(a) - 1 ? 1 : 4;
      }
    }
    return down * 5 + breaks + (8 - p.done) * 40 - empties * 4;
  }

  function runLength(p, i) {
    const col = p.cols[i];
    let n = col.length > p.downs[i] ? 1 : 0;
    for (let j = col.length - 1; j > p.downs[i] && linked(col[j - 1], col[j]); j--) n += 1;
    return n;
  }

  // Turns over an uncovered card and puts away a run from king to ace at the top of column i.
  function settle(p, i) {
    const col = p.cols[i];
    if (col.length >= 13 && col.length - 13 >= p.downs[i] && rankOf(col[col.length - 13]) === 13) {
      let ok = true;
      for (let j = col.length - 12; j < col.length && ok; j++) ok = linked(col[j - 1], col[j]);
      if (ok) {
        p.cols[i] = col.slice(0, col.length - 13);
        p.done += 1;
      }
    }
    if (p.cols[i].length === p.downs[i] && p.downs[i] > 0) p.downs[i] -= 1;
  }

  // Every move that can be made (for the exact walk).
  function moves(p) {
    const out = [];
    let empty = -1;
    for (let i = 0; i < COLS; i++) if (!p.cols[i].length) empty = empty < 0 ? i : empty;
    for (let i = 0; i < COLS; i++) {
      const col = p.cols[i];
      if (!col.length) continue;
      const run = runLength(p, i);
      const topRank = rankOf(col[col.length - 1]);
      const up = col.length - p.downs[i];
      for (let j = 0; j < COLS; j++) {
        if (j === i || !p.cols[j].length) continue;
        const dcol = p.cols[j];
        const n = rankOf(dcol[dcol.length - 1]) - topRank;
        if (n < 1 || n > run) continue;
        out.push({ src: { from: "tab", i, k: up - n }, dst: { to: "tab", i: j } });
      }
      if (empty >= 0)
        for (let n = run; n >= 1; n--) {
          if (n === col.length) continue;
          out.push({ src: { from: "tab", i, k: up - n }, dst: { to: "tab", i: empty } });
        }
    }
    if (p.dealt < 5 && empty < 0 && stock.length - p.dealt * COLS >= COLS) out.push({ deal: true });
    return out;
  }

  // The moves a good player would consider: a run onto a card of its own suit (without splitting a run of that
  // suit), a move that turns a card over or empties a column, a move that frees a card a run of its suit can join
  // next, a whole run into an empty column, and a deal.
  function useful(p) {
    const out = [];
    let empty = -1;
    for (let i = 0; i < COLS; i++) if (!p.cols[i].length) empty = empty < 0 ? i : empty;
    // What each column offers to be joined: its top card, and the cards of its top run (any of them can lead a move).
    const tops = [];
    for (let j = 0; j < COLS; j++) tops.push(p.cols[j].length ? p.cols[j][p.cols[j].length - 1] : -1);
    const joinable = (card, from) => {
      // Some other column's run holds the card of this suit one lower, or some other top is one higher in this suit.
      for (let j = 0; j < COLS; j++) {
        if (j === from || !p.cols[j].length) continue;
        const t = tops[j];
        if (suit[t] === suit[card] && rankOf(t) === rankOf(card) + 1) return true;
        const col = p.cols[j];
        const n = runLength(p, j);
        for (let q = col.length - n; q < col.length; q++)
          if (suit[col[q]] === suit[card] && rankOf(col[q]) === rankOf(card) - 1) return true;
      }
      return false;
    };
    for (let i = 0; i < COLS; i++) {
      const col = p.cols[i];
      if (!col.length) continue;
      const run = runLength(p, i);
      const topRank = rankOf(col[col.length - 1]);
      const up = col.length - p.downs[i];
      for (let j = 0; j < COLS; j++) {
        if (j === i || !p.cols[j].length) continue;
        const t = tops[j];
        const n = rankOf(t) - topRank;
        if (n < 1 || n > run) continue;
        const head = col[col.length - n];
        const rest = col.length - n;
        const reveals = rest === p.downs[i];
        const under = reveals ? -1 : col[rest - 1];
        const splits = under >= 0 && linked(under, head);
        const joins = suit[head] === suit[t];
        let ok = reveals;
        if (!ok && joins && !splits) ok = true;
        if (!ok && !splits && !joins && joinable(under, i)) ok = true;
        if (ok) out.push({ src: { from: "tab", i, k: up - n }, dst: { to: "tab", i: j } });
      }
      if (empty >= 0 && run < col.length)
        out.push({ src: { from: "tab", i, k: up - run }, dst: { to: "tab", i: empty } });
    }
    if (p.dealt < 5 && empty < 0 && stock.length - p.dealt * COLS >= COLS) out.push({ deal: true });
    return out;
  }

  function apply(p, m) {
    const t = copy(p);
    if (m.deal) {
      const base = stock.length - t.dealt * COLS;
      for (let i = 0; i < COLS; i++) t.cols[i] = t.cols[i].concat([stock[base - 1 - i]]);
      t.dealt += 1;
      for (let i = 0; i < COLS; i++) settle(t, i);
      return t;
    }
    const a = m.src.i;
    const b = m.dst.i;
    const from = t.cols[a];
    const k = t.downs[a] + m.src.k;
    t.cols[b] = t.cols[b].concat(from.slice(k));
    t.cols[a] = from.slice(0, k);
    settle(t, a);
    settle(t, b);
    return t;
  }

  const root = fromGame(game);
  let seen = new Seen();
  const heap = new Heap();
  const first = { p: root, parent: null, move: null, f: 0 };
  heap.push(first);
  seen.add(...fingerprint(root));
  let walk = null;

  function pathTo(node) {
    const out = [];
    for (let n = node; n.parent; n = n.parent) out.push(n.move);
    return out.reverse();
  }

  function bestSlice(deadline) {
    while (heap.size) {
      if ((search.nodes & 31) === 0 && now() > deadline) return "running";
      const node = heap.pop();
      search.nodes += 1;
      if (node.p.done === 8) {
        search.path = pathTo(node);
        return "win";
      }
      for (const m of useful(node.p)) {
        const t = apply(node.p, m);
        if (!seen.add(...fingerprint(t))) continue;
        heap.push({ p: t, parent: node, move: m, f: estimate(t) });
      }
      // A node that has been looked at keeps only its way back (its parent and move), so the search's memory is
      // its frontier.
      if (node !== first) node.p = null;
      if (seen.size > maxNodes) return "limit";
    }
    // The good moves ran out without a win: only a walk through every move can tell.
    seen = new Seen();
    seen.add(...fingerprint(root));
    walk = [{ p: root, list: moves(root), i: 0, move: null }];
    return "running";
  }

  function walkSlice(deadline) {
    let n = 0;
    while (walk.length) {
      if ((++n & 31) === 0 && now() > deadline) return "running";
      const top = walk[walk.length - 1];
      if (top.i >= top.list.length) {
        walk.pop();
        continue;
      }
      const m = top.list[top.i++];
      const t = apply(top.p, m);
      if (!seen.add(...fingerprint(t))) continue;
      search.nodes += 1;
      if (t.done === 8) {
        search.path = walk
          .slice(1)
          .map((f) => f.move)
          .concat([m]);
        return "win";
      }
      if (seen.size > maxNodes) return "limit";
      walk.push({ p: t, list: moves(t), i: 0, move: m });
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
    }
    return search.status;
  };
  search.positions = () => seen.size;
  return search;
}

/** Runs a search to its end within `ms` milliseconds (for the development checks). */
export function solve(game, ms, opts = {}) {
  const search = createSearch(game, opts);
  const end = Date.now() + ms;
  while (search.step(50) === "running" && Date.now() < end);
  return { status: search.status === "running" ? "limit" : search.status, path: search.path, nodes: search.nodes };
}
