// The crossword of a wheel: one square per letter of the grid words. A hidden square is a button (a tap asks to show
// it with a hint); a shown square holds its letter. The squares grow to fill the space the grid has, up to a limit.

import { display } from "../core/letters.mjs";
import { cellsOf } from "../wheel/puzzle.mjs";

const MAX_CELL = 64;
const GAP = 3; // px between squares, as .board's gap in css/app.css

export function createGrid(root, { onCellTap, t }) {
  const board = root.querySelector(".board");
  const list = root.querySelector(".grid-words");
  let puzzle = null;
  const cells = new Map(); // key -> element

  // The squares take the largest size at which the whole grid, gaps included, fits the space the crossword has.
  function fit() {
    if (!puzzle) return;
    const w = root.clientWidth - 4;
    const h = root.clientHeight - 4;
    const across = (w - (puzzle.cols - 1) * GAP) / puzzle.cols;
    const down = (h - (puzzle.rows - 1) * GAP) / puzzle.rows;
    const size = Math.max(8, Math.min(MAX_CELL, Math.floor(Math.min(across, down))));
    board.style.setProperty("--cell", `${size}px`);
  }

  // The space changes with the wheel, the message line and the text size, so the grid fits itself again each time.
  if (typeof ResizeObserver === "function") new ResizeObserver(fit).observe(root);

  function set(p) {
    puzzle = p;
    board.textContent = "";
    cells.clear();
    board.style.gridTemplateColumns = `repeat(${p.cols}, var(--cell))`;
    board.style.gridTemplateRows = `repeat(${p.rows}, var(--cell))`;
    const seen = new Set();
    for (const w of p.words) {
      cellsOf(w).forEach((key, k) => {
        if (seen.has(key)) return;
        seen.add(key);
        const [r, c] = key.split(",").map(Number);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "cell";
        el.dataset.key = key;
        el.dataset.letter = display(w.t[k]);
        el.style.gridRow = String(r + 1);
        el.style.gridColumn = String(c + 1);
        board.appendChild(el);
        cells.set(key, el);
      });
    }
    fit();
  }

  /** Shows the squares in `visible` and lists the words for screen readers. */
  function update(state, visible) {
    if (!puzzle) return;
    for (const [key, el] of cells) {
      const shown = visible.has(key);
      const was = el.classList.contains("shown");
      el.classList.toggle("shown", shown);
      el.textContent = shown ? el.dataset.letter : "";
      el.disabled = shown || state.done;
      el.setAttribute("aria-label", shown ? t("shownCell", { letter: el.dataset.letter }) : t("hiddenCell"));
      if (shown && !was) el.classList.remove("hinted");
    }
    for (const key of state.shown) {
      const el = cells.get(key);
      if (el) el.classList.add("hinted");
    }
    const found = new Set(state.found);
    list.textContent = "";
    for (const w of puzzle.words) {
      const li = document.createElement("li");
      li.textContent = found.has(w.w) ? w.w.toUpperCase() : t("hiddenWord", { n: w.t.length });
      list.appendChild(li);
    }
    root.setAttribute("aria-label", t("gridLabel", { found: state.found.length, total: puzzle.words.length }));
  }

  /** The element of a square, to fly a letter to it. */
  function cellEl(key) {
    return cells.get(key) || null;
  }

  /** Keeps a square's letter out of sight until its flying letter lands, then pops it in. */
  function hold(key) {
    const el = cells.get(key);
    if (el) el.classList.add("incoming");
  }

  function land(key) {
    const el = cells.get(key);
    if (!el) return;
    el.classList.remove("incoming", "pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  /** Marks the grid solved and runs a wave across its squares (the wave only when motion is welcome). */
  function setSolved(solved, wave) {
    root.classList.toggle("solved", solved);
    if (!solved || !wave) return;
    for (const [key, el] of cells) {
      const [r, c] = key.split(",").map(Number);
      el.classList.remove("wave");
      void el.offsetWidth;
      el.style.animationDelay = `${(r + c) * 45}ms`;
      el.classList.add("wave");
    }
  }

  /** A short highlight of a word's squares: "found" as it fills in, "again" when it was found before. */
  function flash(word, kind) {
    const keys = cellsOf(word);
    keys.forEach((key, i) => {
      const el = cells.get(key);
      if (!el) return;
      el.classList.remove("pop", "again");
      // Restart the animation on the next frame, one square after another.
      window.requestAnimationFrame(() => {
        el.style.animationDelay = kind === "found" ? `${i * 45}ms` : "0ms";
        el.classList.add(kind === "found" ? "pop" : "again");
      });
    });
  }

  board.addEventListener("click", (e) => {
    const el = e.target.closest(".cell");
    if (!el || el.disabled || el.classList.contains("shown")) return;
    onCellTap(el.dataset.key, el);
  });

  board.addEventListener("animationend", (e) => {
    e.target.classList.remove("pop", "again", "wave");
    e.target.style.animationDelay = "";
  });

  return {
    set,
    update,
    flash,
    fit,
    cellEl,
    hold,
    land,
    setSolved,
    wordAt: (key) => puzzle && puzzle.words.find((w) => cellsOf(w).includes(key)),
  };
}
