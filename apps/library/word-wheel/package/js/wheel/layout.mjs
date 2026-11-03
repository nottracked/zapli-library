// Fits a set of words into a small crossword: every word crosses at least one other, words never run into each other
// side by side, and the grid stays within a square of `maxSide` cells. Pure and repeatable: the same words and the same
// random numbers always give the same grid.

const STEP = { h: [0, 1], v: [1, 0] };

function key(r, c) {
  return `${r},${c}`;
}

class Board {
  constructor(maxSide) {
    this.maxSide = maxSide;
    this.cells = new Map(); // "r,c" -> { t: tile, h: word index or -1, v: word index or -1 }
    this.placed = [];
    this.minR = 0;
    this.maxR = 0;
    this.minC = 0;
    this.maxC = 0;
  }

  get(r, c) {
    return this.cells.get(key(r, c));
  }

  /** How many cells the word crosses when placed at (r, c) in direction d; 0 when it does not fit there. */
  crossings(tiles, r, c, d) {
    const [dr, dc] = STEP[d];
    const n = tiles.length;
    if (this.get(r - dr, c - dc) || this.get(r + dr * n, c + dc * n)) return 0;
    const endR = r + dr * (n - 1);
    const endC = c + dc * (n - 1);
    const height = Math.max(this.maxR, endR) - Math.min(this.minR, r) + 1;
    const width = Math.max(this.maxC, endC) - Math.min(this.minC, c) + 1;
    if (height > this.maxSide || width > this.maxSide) return 0;
    let crossings = 0;
    for (let k = 0; k < n; k++) {
      const rr = r + dr * k;
      const cc = c + dc * k;
      const cell = this.get(rr, cc);
      if (cell) {
        if (cell.t !== tiles[k] || cell[d] >= 0) return 0;
        crossings++;
      } else if (
        d === "h" ? this.get(rr - 1, cc) || this.get(rr + 1, cc) : this.get(rr, cc - 1) || this.get(rr, cc + 1)
      ) {
        return 0;
      }
    }
    return crossings;
  }

  /** The area of the grid's bounding box after placing a word at (r, c) in direction d. */
  areaWith(n, r, c, d) {
    const [dr, dc] = STEP[d];
    const height = Math.max(this.maxR, r + dr * (n - 1)) - Math.min(this.minR, r) + 1;
    const width = Math.max(this.maxC, c + dc * (n - 1)) - Math.min(this.minC, c) + 1;
    return height * width;
  }

  put(entry, r, c, d) {
    const [dr, dc] = STEP[d];
    const index = this.placed.length;
    entry.tiles.forEach((t, k) => {
      const rr = r + dr * k;
      const cc = c + dc * k;
      const id = key(rr, cc);
      const cell = this.cells.get(id) || { t, h: -1, v: -1 };
      cell[d] = index;
      this.cells.set(id, cell);
    });
    const n = entry.tiles.length;
    if (this.placed.length === 0) {
      this.minR = r;
      this.minC = c;
      this.maxR = r + dr * (n - 1);
      this.maxC = c + dc * (n - 1);
    } else {
      this.minR = Math.min(this.minR, r);
      this.minC = Math.min(this.minC, c);
      this.maxR = Math.max(this.maxR, r + dr * (n - 1));
      this.maxC = Math.max(this.maxC, c + dc * (n - 1));
    }
    this.placed.push({ entry, r, c, d });
  }

  /** Every place where a word crosses the grid, best first: most crossings, then the smallest grid. */
  spots(entry, rng) {
    const found = [];
    for (const p of this.placed) {
      const d = p.d === "h" ? "v" : "h";
      const [pr, pc] = STEP[p.d];
      p.entry.tiles.forEach((pt, i) => {
        const cr = p.r + pr * i;
        const cc = p.c + pc * i;
        entry.tiles.forEach((t, j) => {
          if (t !== pt) return;
          const r = d === "v" ? cr - j : cr;
          const c = d === "h" ? cc - j : cc;
          const crossings = this.crossings(entry.tiles, r, c, d);
          if (crossings > 0) {
            found.push({ r, c, d, crossings, area: this.areaWith(entry.tiles.length, r, c, d), tie: rng() });
          }
        });
      });
    }
    found.sort((a, b) => b.crossings - a.crossings || a.area - b.area || a.tie - b.tie);
    return found;
  }
}

/**
 * Places the words (entries with `tiles`), the first one across. Words that fit nowhere are left out. Returns the
 * placed words with their row, column and direction ("h" across, "v" down), counted from the top left cell, and the
 * grid's size.
 */
export function layoutWords(entries, rng, maxSide) {
  const board = new Board(maxSide);
  const [first, ...rest] = entries;
  board.put(first, 0, 0, "h");
  for (const entry of rest) {
    const spots = board.spots(entry, rng);
    if (spots.length) {
      // Mostly the best spot, sometimes the second, so grids of the same words vary.
      const s = spots.length > 1 && rng() < 0.25 ? spots[1] : spots[0];
      board.put(entry, s.r, s.c, s.d);
    }
  }
  const words = board.placed.map((p) => ({ entry: p.entry, r: p.r - board.minR, c: p.c - board.minC, d: p.d }));
  return { words, rows: board.maxR - board.minR + 1, cols: board.maxC - board.minC + 1 };
}

/**
 * Checks a finished grid the way a player sees it: every run of two or more filled cells, across or down, must be one
 * of the placed words, and every word must be connected to the others. Used by the checks in dev/ and by the
 * generator before it accepts a grid.
 */
export function gridIsSound(grid) {
  const cells = new Map();
  for (const w of grid.words) {
    const [dr, dc] = STEP[w.d];
    w.entry.tiles.forEach((t, k) => {
      const id = key(w.r + dr * k, w.c + dc * k);
      if (cells.has(id) && cells.get(id) !== t) throw new Error(`clash at ${id}`);
      cells.set(id, t);
    });
  }
  const words = new Set(grid.words.map((w) => `${w.d}:${w.r},${w.c}:${w.entry.tiles.join("")}`));
  for (const d of ["h", "v"]) {
    const [dr, dc] = STEP[d];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (!cells.has(key(r, c)) || cells.has(key(r - dr, c - dc))) continue;
        let n = 0;
        let text = "";
        while (cells.has(key(r + dr * n, c + dc * n))) {
          text += cells.get(key(r + dr * n, c + dc * n));
          n++;
        }
        if (n >= 2 && !words.has(`${d}:${r},${c}:${text}`)) return false;
      }
    }
  }
  // Connected: walk from the first word through shared cells.
  const seen = new Set([0]);
  const queue = [0];
  const cellsOf = grid.words.map((w) => {
    const [dr, dc] = STEP[w.d];
    return new Set(w.entry.tiles.map((_, k) => key(w.r + dr * k, w.c + dc * k)));
  });
  while (queue.length) {
    const i = queue.shift();
    cellsOf.forEach((set, j) => {
      if (seen.has(j)) return;
      for (const id of set) {
        if (cellsOf[i].has(id)) {
          seen.add(j);
          queue.push(j);
          return;
        }
      }
    });
  }
  return seen.size === grid.words.length;
}
