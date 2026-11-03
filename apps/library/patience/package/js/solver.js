// The solver: does a position still lead to a win, and how? A depth-first search over every move, which remembers
// each position it has met, so it never looks at one twice. When the search runs out of positions the answer "lost"
// is exact; when it finds a win, the path is a real way to win. Only a search that hits its budget answers "limit"
// (not sure). It sees the whole deal, the order of the stock and the face-down cards included, so its answers are
// about this deal, not a guess.
//
// Each game has a small adapter over a compact copy of the position (numbers and bit masks): its moves in a good
// order, playing and taking back a move, a key for the position, and whether it is won.
import { rankOf, PYR_COVER, PEAK_COVER } from "./rules.js";

// The positions met: whole numbers below 2^53 in an open-addressing table of doubles, a third of what a Set of such
// numbers takes, since most keys are too large for the engine's small integers.
class KeySet {
  constructor() {
    this.cap = 1 << 16;
    this.size = 0;
    this.keys = new Float64Array(this.cap).fill(-1);
  }
  slot(k) {
    const lo = k >>> 0;
    const hi = Math.floor(k / 4294967296) >>> 0;
    let h = Math.imul(lo ^ Math.imul(hi, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 15;
    return h & (this.cap - 1);
  }
  has(k) {
    for (let i = this.slot(k); ; i = (i + 1) & (this.cap - 1)) {
      const v = this.keys[i];
      if (v === k) return true;
      if (v < 0) return false;
    }
  }
  add(k) {
    if ((this.size + 1) * 10 > this.cap * 7) this.grow();
    for (let i = this.slot(k); ; i = (i + 1) & (this.cap - 1)) {
      const v = this.keys[i];
      if (v === k) return;
      if (v < 0) {
        this.keys[i] = k;
        this.size += 1;
        return;
      }
    }
  }
  grow() {
    const old = this.keys;
    this.cap *= 2;
    this.keys = new Float64Array(this.cap).fill(-1);
    this.size = 0;
    for (const k of old) if (k >= 0) this.add(k);
  }
}

// ---- Pyramid
// The cards gone from the pyramid always form one of 1430 shapes (a card goes only after the two below it), so a
// shape's number fits in the key with the rest.
const SHAPES = (() => {
  const out = new Map();
  const walk = (mask) => {
    if (out.has(mask)) return;
    out.set(mask, out.size);
    for (let i = 27; i >= 0; i--) {
      const bit = 1 << i;
      if (!(mask & bit) && PYR_COVER[i].every((j) => mask & (1 << j))) walk(mask | bit);
    }
  };
  walk(0);
  return out;
})();
const PYR_COVER_MASK = PYR_COVER.map((list) => list.reduce((m, j) => m | (1 << j), 0));
// Every card that lies over a card of the pyramid, however far down: none of them can ever pair with it.
const PYR_BELOW = PYR_COVER.map(() => 0);
for (let i = 27; i >= 0; i--) for (const j of PYR_COVER[i]) PYR_BELOW[i] |= (1 << j) | PYR_BELOW[j];
const PEAK_COVER_MASK = PEAK_COVER.map((list) => list.reduce((m, j) => m | (1 << j), 0));
const ALL28 = 2 ** 28 - 1;

function pyramidAdapter(s, noDraw) {
  const R = s.pyr.map((c) => (c >= 0 ? rankOf(c) : 0));
  const D = s.deck.map(rankOf);
  let gonePyr = 0;
  s.pyr.forEach((c, i) => {
    if (c < 0) gonePyr |= 1 << i;
  });
  let goneDeck = 0;
  s.gone.forEach((g, i) => {
    if (g) goneDeck |= 1 << i;
  });
  let p = s.p;
  let pass = s.pass;
  const limit = s.opts.passes;
  // For each card of the pyramid, the cards that could still pair with it: in the pyramid (never one lying over it)
  // and in the stock.
  const mates = R.map((r, i) => {
    let inPyr = 0;
    let inDeck = 0;
    R.forEach((r2, j) => {
      if (j !== i && r2 && r + r2 === 13 && !(PYR_BELOW[i] & (1 << j))) inPyr |= 1 << j;
    });
    D.forEach((r2, j) => {
      if (r + r2 === 13) inDeck |= 1 << j;
    });
    return [inPyr, inDeck];
  });
  const free = (i) => !(gonePyr & (1 << i)) && (gonePyr & PYR_COVER_MASK[i]) === PYR_COVER_MASK[i];
  const wasteTop = () => {
    for (let i = p - 1; i >= 0; i--) if (!(goneDeck & (1 << i))) return i;
    return -1;
  };
  const stockNext = () => {
    for (let i = p; i < 24; i++) if (!(goneDeck & (1 << i))) return i;
    return -1;
  };
  // Moves as numbers: i (a king of the pyramid), 28 (the waste's king), 100 + 28i + j (a pair in the pyramid),
  // 1000 + i (the waste with i), 2000 (turn a card), 2001 (turn the waste over).
  return {
    won: () => gonePyr === ALL28,
    // A card left in the pyramid whose every partner is gone (or lies over it) can never go: the deal is lost.
    dead() {
      for (let i = 0; i < 28; i++) {
        if (gonePyr & (1 << i) || R[i] === 13) continue;
        if (!(mates[i][0] & ~gonePyr) && !(mates[i][1] & ~goneDeck)) return true;
      }
      return false;
    },
    key: () => ((SHAPES.get(gonePyr) * 16777216 + goneDeck) * 25 + p) * 4 + (limit ? pass - 1 : 0),
    // The same cards with fewer times through the stock used is at least as good, so it counts as met already.
    met(seen) {
      const base = ((SHAPES.get(gonePyr) * 16777216 + goneDeck) * 25 + p) * 4;
      if (!limit) return seen.has(base);
      for (let q = 0; q < pass; q++) if (seen.has(base + q)) return true;
      return false;
    },
    moves() {
      const f = [];
      for (let i = 27; i >= 0; i--) if (free(i)) f.push(i);
      // A free king always goes at once: it pairs with nothing, so taking it away can never hurt.
      for (const i of f) if (R[i] === 13) return [i];
      const w = wasteTop();
      if (w >= 0 && D[w] === 13) return [28];
      const out = [];
      for (let a = 0; a < f.length; a++)
        for (let b = a + 1; b < f.length; b++) if (R[f[a]] + R[f[b]] === 13) out.push(100 + 28 * f[b] + f[a]);
      if (w >= 0) for (const i of f) if (D[w] + R[i] === 13) out.push(1000 + i);
      if (noDraw) return out;
      if (stockNext() >= 0) out.push(2000);
      else if (wasteTop() >= 0 && (limit === 0 || pass < limit)) out.push(2001);
      return out;
    },
    play(m) {
      if (m === 2000) {
        const old = p;
        p = stockNext() + 1;
        return old;
      }
      if (m === 2001) {
        const old = p;
        p = 0;
        pass += 1;
        return old;
      }
      if (m === 28) {
        const w = wasteTop();
        goneDeck |= 1 << w;
        return w;
      }
      if (m >= 1000) {
        const w = wasteTop();
        goneDeck |= 1 << w;
        gonePyr |= 1 << (m - 1000);
        return w;
      }
      if (m >= 100) {
        const a = (m - 100) % 28;
        const b = Math.floor((m - 100) / 28);
        gonePyr |= (1 << a) | (1 << b);
        return 0;
      }
      gonePyr |= 1 << m;
      return 0;
    },
    undo(m, tok) {
      if (m === 2000) p = tok;
      else if (m === 2001) {
        p = tok;
        pass -= 1;
      } else if (m === 28) goneDeck &= ~(1 << tok);
      else if (m >= 1000) {
        goneDeck &= ~(1 << tok);
        gonePyr &= ~(1 << (m - 1000));
      } else if (m >= 100) {
        const a = (m - 100) % 28;
        const b = Math.floor((m - 100) / 28);
        gonePyr &= ~((1 << a) | (1 << b));
      } else gonePyr &= ~(1 << m);
    },
    toMove(m) {
      if (m === 2000) return { t: "d" };
      if (m === 2001) return { t: "r" };
      if (m === 28) return { t: "K" };
      if (m >= 1000) return { t: "w", i: m - 1000 };
      if (m >= 100) return { t: "p", i: (m - 100) % 28, j: Math.floor((m - 100) / 28) };
      return { t: "k", i: m };
    },
  };
}

// ---- Golf and Peaks share the waste and the stock: a move plays a card one higher or lower than the waste's top.
function fitsRank(r, t, game, opts) {
  if (game === "golf") {
    if (t === 13) return opts.kings === "queen" ? r === 12 : opts.kings === "wrap" ? r === 12 || r === 1 : false;
    if (t === 1) return r === 2 || (opts.kings === "wrap" && r === 13);
    return r === t + 1 || r === t - 1;
  }
  if (r === t + 1 || r === t - 1) return true;
  return !!opts.wrap && ((r === 1 && t === 13) || (r === 13 && t === 1));
}

function golfAdapter(s, noDraw) {
  const C = s.cols.map((c) => c.map(rankOf));
  const h = s.cols.map((c) => c.length);
  const S = s.stock.map(rankOf);
  let sp = s.sp;
  let tr = rankOf(s.waste[s.waste.length - 1]);
  // Fits once per pair of ranks, looked up rather than worked out at every position.
  const FIT = [];
  for (let r = 0; r <= 13; r++)
    FIT.push([...Array(14).keys()].map((t) => r > 0 && t > 0 && fitsRank(r, t, "golf", s.opts)));
  // The ranks a card of each rank may follow.
  const AFTER = FIT.map((row) => row.map((ok, t) => (ok ? t : 0)).filter(Boolean));
  const left = new Array(14).fill(0);
  return {
    won: () => h[0] + h[1] + h[2] + h[3] + h[4] + h[5] + h[6] === 0,
    // A card still in a column that no card left anywhere could ever come before (the waste's top changes before a
    // covered card is reached) can never be played: the deal is lost.
    dead() {
      left.fill(0);
      for (let i = sp; i < S.length; i++) left[S[i]] += 1;
      for (let i = 0; i < 7; i++) for (let j = 0; j < h[i]; j++) left[C[i][j]] += 1;
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < h[i]; j++) {
          const r = C[i][j];
          if (j === h[i] - 1 && FIT[r][tr]) continue;
          if (!AFTER[r].some((t) => left[t] > 0)) return true;
        }
      return false;
    },
    key: () => {
      let k = 0;
      for (let i = 0; i < 7; i++) k = k * 6 + h[i];
      return (k * 17 + sp) * 14 + tr;
    },
    moves() {
      const out = [];
      // The tallest columns first: they hold the most cards still to free.
      const order = [0, 1, 2, 3, 4, 5, 6].filter((i) => h[i] && FIT[C[i][h[i] - 1]][tr]).sort((a, b) => h[b] - h[a]);
      out.push(...order);
      if (!noDraw && sp < S.length) out.push(7);
      return out;
    },
    play(m) {
      const old = tr;
      if (m === 7) {
        tr = S[sp];
        sp += 1;
      } else {
        h[m] -= 1;
        tr = C[m][h[m]];
      }
      return old;
    },
    undo(m, tok) {
      if (m === 7) sp -= 1;
      else h[m] += 1;
      tr = tok;
    },
    toMove: (m) => (m === 7 ? { t: "d" } : { t: "c", i: m }),
  };
}

function peaksAdapter(s, noDraw) {
  const R = s.cards.map(rankOf);
  const S = s.stock.map(rankOf);
  let gone = 0;
  s.gone.forEach((g, i) => {
    if (g) gone |= 1 << i;
  });
  let sp = s.sp;
  let tr = rankOf(s.waste[s.waste.length - 1]);
  const FIT = [];
  for (let r = 0; r <= 13; r++)
    FIT.push([...Array(14).keys()].map((t) => r > 0 && t > 0 && fitsRank(r, t, "peaks", s.opts)));
  // How many cards each card covers: freeing those first opens the most choices.
  const weight = PEAK_COVER.map((_, i) => PEAK_COVER.filter((list) => list.includes(i)).length);
  return {
    won: () => gone === ALL28,
    key: () => (gone * 24 + sp) * 14 + tr,
    moves() {
      const out = [];
      for (let i = 0; i < 28; i++) {
        const bit = 1 << i;
        if (gone & bit || (gone & PEAK_COVER_MASK[i]) !== PEAK_COVER_MASK[i]) continue;
        if (FIT[R[i]][tr]) out.push(i);
      }
      out.sort((a, b) => weight[b] - weight[a]);
      if (!noDraw && sp < S.length) out.push(28);
      return out;
    },
    play(m) {
      const old = tr;
      if (m === 28) {
        tr = S[sp];
        sp += 1;
      } else {
        gone |= 1 << m;
        tr = R[m];
      }
      return old;
    },
    undo(m, tok) {
      if (m === 28) sp -= 1;
      else gone &= ~(1 << m);
      tr = tok;
    },
    toMove: (m) => (m === 28 ? { t: "d" } : { t: "c", i: m }),
  };
}

function adapterFor(s, noDraw) {
  if (s.game === "pyramid") return pyramidAdapter(s, noDraw);
  if (s.game === "golf") return golfAdapter(s, noDraw);
  return peaksAdapter(s, noDraw);
}

/**
 * A search that runs in slices: `step(ms)` works for about that long and returns "win", "lost", "running" or
 * "limit". For "win", `path` holds the moves from the position on (in the rules' form). Options: maxNodes
 * (positions it may meet before "limit"), noDraw (leave the stock alone: can the rest be cleared as it lies?).
 */
export function createSearch(state, opts = {}) {
  const maxNodes = opts.maxNodes || 400000;
  const ad = adapterFor(state, !!opts.noDraw);
  const seen = new KeySet();
  const met = ad.met ? () => ad.met(seen) : () => seen.has(ad.key());
  // Each frame: the moves of its position, the next one to try, and the move being tried with its undo token.
  const stack = [];
  const search = { status: "running", path: null, nodes: 0, step };

  if (ad.won()) {
    search.status = "win";
    search.path = [];
  } else if (ad.dead && ad.dead()) search.status = "lost";
  else {
    seen.add(ad.key());
    stack.push({ ms: ad.moves(), i: 0, m: -1, tok: 0 });
  }

  function step(ms) {
    if (search.status !== "running") return search.status;
    const end = Date.now() + ms;
    let count = 0;
    while (stack.length) {
      if (++count % 512 === 0 && Date.now() > end) return search.status;
      const f = stack[stack.length - 1];
      if (f.i >= f.ms.length) {
        stack.pop();
        const parent = stack[stack.length - 1];
        if (parent) ad.undo(parent.m, parent.tok);
        continue;
      }
      const m = f.ms[f.i++];
      const tok = ad.play(m);
      if (ad.won()) {
        f.m = m;
        search.path = stack.map((fr) => ad.toMove(fr.m));
        search.status = "win";
        return search.status;
      }
      if (met() || (ad.dead && ad.dead())) {
        ad.undo(m, tok);
        continue;
      }
      seen.add(ad.key());
      search.nodes += 1;
      if (search.nodes >= maxNodes) {
        search.status = "limit";
        return search.status;
      }
      f.m = m;
      f.tok = tok;
      stack.push({ ms: ad.moves(), i: 0, m: -1, tok: 0 });
    }
    search.status = "lost";
    return search.status;
  }

  return search;
}

// The whole search at once, for the development checks and for the deal lists.
export function solve(state, ms, opts = {}) {
  const search = createSearch(state, opts);
  const end = Date.now() + ms;
  while (search.step(50) === "running" && Date.now() < end);
  return { status: search.status === "running" ? "limit" : search.status, path: search.path, nodes: search.nodes };
}

// A way to clear the rest without turning another card, when one is found within a small budget: the page then
// offers to finish the game by itself.
export function finishPath(state, maxNodes = 20000) {
  const search = createSearch(state, { noDraw: true, maxNodes });
  while (search.step(200) === "running");
  return search.status === "win" ? search.path : null;
}
