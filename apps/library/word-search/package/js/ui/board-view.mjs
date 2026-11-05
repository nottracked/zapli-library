// The letter grid: an SVG layer of highlighter capsules under a grid of letters, and the gestures that select a
// straight line of letters.
//
// Selecting: drag from the first letter to the last, or tap the first letter and then the last. A drag snaps to the
// nearest of the eight directions, so a finger a little off the line still selects it. The arrow keys move a
// cursor over the grid, and Enter or Space works as a tap.
//
// Sizes: the grid fills the largest square that fits its box (the page calls fit() when the box changes). One SVG
// draws everything in units of 100 a square: the capsules, the hint marks, the selection and, on top, the letters.
// SVG text keeps the size it is given whatever the phone's text size, so a letter always fills its square by the
// same share (the Letter size setting), never more and never less.

import { STEP } from "../search/generator.mjs";

const SVG = "http://www.w3.org/2000/svg";
const U = 100;
// Directions in the order of their angle, from east clockwise (y grows downwards).
const RING = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

const centre = (size, i) => [((i % size) + 0.5) * U, (Math.floor(i / size) + 0.5) * U];

/** Whether two squares lie on one straight line of the grid (across, down or diagonal). */
export function inLine(size, a, b) {
  const dr = Math.floor(b / size) - Math.floor(a / size);
  const dc = (b % size) - (a % size);
  return a !== b && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc));
}

/** The squares from a to b along their line, a and b included (a alone when they are not on a line). */
export function lineCells(size, a, b) {
  if (a === b || !inLine(size, a, b)) return [a];
  const dr = Math.sign(Math.floor(b / size) - Math.floor(a / size));
  const dc = Math.sign((b % size) - (a % size));
  const out = [a];
  let i = a;
  while (i !== b) {
    i += dr * size + dc;
    out.push(i);
  }
  return out;
}

/**
 * Where a drag from square `start` ends when the finger is at (x, y), in squares from the grid's top left corner:
 * the square on the nearest of the eight directions, as far as the finger reaches, never off the grid.
 */
export function snapEnd(size, start, x, y) {
  const r0 = Math.floor(start / size);
  const c0 = start % size;
  const dx = x - (c0 + 0.5);
  const dy = y - (r0 + 0.5);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.5) return start;
  const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const [dr, dc] = STEP[RING[k]];
  let n = Math.round((dx * dc + dy * dr) / (dc * dc + dr * dr));
  n = Math.max(0, n);
  while (n > 0) {
    const r = r0 + dr * n;
    const c = c0 + dc * n;
    if (r >= 0 && r < size && c >= 0 && c < size) break;
    n--;
  }
  return (r0 + dr * n) * size + (c0 + dc * n);
}

export function createBoard(root, { onSelect, onCursor, labels }) {
  const caps = root.querySelector(".caps");
  const layerFound = svgEl("g", { class: "found" });
  const layerMarks = svgEl("g", { class: "marks" });
  const layerDots = svgEl("g", { class: "dots" });
  const grid = svgEl("g", { class: "letters" });
  const sel = svgEl("line", { class: "sel", x1: 0, y1: 0, x2: 0, y2: 0 });
  const anchorMark = svgEl("circle", { class: "anchor", r: U * 0.42, cx: -U, cy: -U });
  const cursorMark = svgEl("rect", { class: "cursor", width: U - 8, height: U - 8, rx: 22, x: -U, y: -U });
  caps.append(layerFound, layerMarks, sel, anchorMark, layerDots, grid, cursorMark);

  let size = 0;
  let cells = [];
  let foundEls = new Map(); // word -> capsule element
  let start = -1; // the square a drag began on
  let end = -1;
  let dragging = false;
  let pointer = null;
  let anchor = -1; // the first tap of a tap-tap selection
  let cursor = -1;
  let locked = false;
  let selColour = 0;

  function capsuleLine(a, b, cls) {
    const [x1, y1] = centre(size, a);
    const [x2, y2] = centre(size, b);
    return svgEl("line", { class: cls, x1, y1, x2, y2 });
  }

  // An outlined capsule around a line of squares (a hint that shows where a word is).
  function outline(a, b) {
    const [x1, y1] = centre(size, a);
    const [x2, y2] = centre(size, b);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const h = U * 0.8;
    return svgEl("rect", {
      class: "outline",
      x: -h / 2,
      y: -h / 2,
      width: len + h,
      height: h,
      rx: h / 2,
      transform: `translate(${x1} ${y1}) rotate(${angle})`,
    });
  }

  /** Draws a puzzle: its letters, the capsules of words found so far and the hints shown. */
  function set(puzzle, found) {
    size = puzzle.size;
    root.style.setProperty("--n", String(size));
    caps.setAttribute("viewBox", `0 0 ${size * U} ${size * U}`);
    grid.textContent = "";
    cells = puzzle.grid.map((tile, i) => {
      const [x, y] = centre(size, i);
      const text = svgEl("text", { class: tile.length > 1 ? "l two" : "l", x, y });
      text.textContent = tile.toUpperCase();
      grid.appendChild(text);
      return text;
    });
    layerFound.textContent = "";
    layerMarks.textContent = "";
    layerDots.textContent = "";
    foundEls = new Map();
    for (const f of found) addFound(f.cells, f.word, f.colour, false);
    anchor = -1;
    cursor = -1;
    locked = false;
    root.classList.remove("is-solved", "is-revealing");
    clearSelection();
    showCursor();
  }

  /** Sizes the grid to the largest square its box holds, inside the frame around it. */
  function fit() {
    const frame = root.parentElement;
    const box = frame && frame.parentElement;
    if (!box || !size) return;
    // The frame's padding and border and the box's padding are not the grid's.
    let around = 0;
    let padX = 0;
    let padY = 0;
    try {
      const f = window.getComputedStyle(frame);
      const b = window.getComputedStyle(box);
      around = 2 * ((parseFloat(f.paddingLeft) || 0) + (parseFloat(f.borderLeftWidth) || 0));
      padX = (parseFloat(b.paddingLeft) || 0) + (parseFloat(b.paddingRight) || 0);
      padY = (parseFloat(b.paddingTop) || 0) + (parseFloat(b.paddingBottom) || 0);
    } catch (e) {
      around = 20;
    }
    const w = box.clientWidth - padX - around;
    const h = box.clientHeight - padY - around;
    const side = Math.max(0, Math.floor(Math.min(w, h)));
    root.style.width = `${side}px`;
    root.style.height = `${side}px`;
  }

  function addFound(wordCells, word, colour, animate) {
    const el = capsuleLine(wordCells[0], wordCells[wordCells.length - 1], `cap c${colour}${animate ? " land" : ""}`);
    layerFound.appendChild(el);
    foundEls.set(word, el);
    for (const i of wordCells) cells[i] && cells[i].classList.add("in");
    if (animate) for (const i of wordCells) flashLetter(i, "pop");
  }

  function flashLetter(i, cls) {
    const el = cells[i];
    if (!el) return;
    el.classList.remove(cls);
    // Reading the box applies the removal first, so the effect starts again.
    void el.getBoundingClientRect();
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), 700);
  }

  /** Nudges a found word's capsule (it was selected again). */
  function flashFound(word) {
    const el = foundEls.get(word);
    if (!el) return;
    el.classList.remove("again");
    window.requestAnimationFrame(() => el.classList.add("again"));
    window.setTimeout(() => el.classList.remove("again"), 600);
  }

  /** Shows the hints: a ring on the first letter, or an outline around the whole word. */
  function setHints(list) {
    layerMarks.textContent = "";
    for (const h of list) {
      if (h.level === 1) {
        const [cx, cy] = centre(size, h.cells[0]);
        layerMarks.appendChild(svgEl("circle", { class: `ring${h.fresh ? " fresh" : ""}`, cx, cy, r: U * 0.42 }));
      } else {
        const el = outline(h.cells[0], h.cells[h.cells.length - 1]);
        if (h.fresh) el.classList.add("fresh");
        layerMarks.appendChild(el);
      }
    }
  }

  function clearSelection() {
    sel.setAttribute("class", "sel");
    sel.setAttribute("x1", "-200");
    sel.setAttribute("x2", "-200");
    for (const el of cells) el.classList.remove("on");
    start = -1;
    end = -1;
    dragging = false;
  }

  function drawSelection(a, b) {
    const [x1, y1] = centre(size, a);
    const [x2, y2] = centre(size, b);
    sel.setAttribute("x1", x1);
    sel.setAttribute("y1", y1);
    sel.setAttribute("x2", x2);
    sel.setAttribute("y2", y2);
    sel.setAttribute("class", `sel live c${selColour}`);
    const on = new Set(lineCells(size, a, b));
    cells.forEach((el, i) => el.classList.toggle("on", on.has(i)));
  }

  function showAnchor() {
    const [cx, cy] = anchor >= 0 ? centre(size, anchor) : [-U, -U];
    anchorMark.setAttribute("cx", cx);
    anchorMark.setAttribute("cy", cy);
    anchorMark.setAttribute("class", anchor >= 0 ? `anchor on c${selColour}` : "anchor");
    cells.forEach((el, i) => el.classList.toggle("on", i === anchor));
  }

  function showCursor() {
    const [cx, cy] = cursor >= 0 ? centre(size, cursor) : [-U * 2, -U * 2];
    cursorMark.setAttribute("x", cx - (U - 8) / 2);
    cursorMark.setAttribute("y", cy - (U - 8) / 2);
  }

  // A finished selection: the page says what it found; a miss fades away.
  function commit(a, b) {
    const answer = onSelect(a, b) || { result: "none" };
    if (answer.result === "none" && a !== b) {
      sel.setAttribute("class", `sel miss c${selColour}`);
      for (const el of cells) el.classList.remove("on");
      window.setTimeout(() => {
        if (!dragging && start < 0) sel.setAttribute("class", "sel");
      }, 380);
      start = -1;
      end = -1;
      dragging = false;
      return;
    }
    clearSelection();
  }

  function tap(i) {
    if (anchor < 0) anchor = i;
    else if (anchor === i) anchor = -1;
    else if (inLine(size, anchor, i)) {
      const a = anchor;
      anchor = -1;
      showAnchor();
      commit(a, i);
      return;
    } else anchor = i;
    showAnchor();
  }

  function pointAt(e) {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size };
  }

  function cellAt(p) {
    const r = Math.floor(p.y);
    const c = Math.floor(p.x);
    if (r < 0 || r >= size || c < 0 || c >= size) return -1;
    return r * size + c;
  }

  root.addEventListener("pointerdown", (e) => {
    if (locked || !size || pointer !== null || (e.button !== undefined && e.button > 0)) return;
    const p = pointAt(e);
    const i = p ? cellAt(p) : -1;
    if (i < 0) return;
    e.preventDefault();
    pointer = e.pointerId;
    try {
      root.setPointerCapture(e.pointerId);
    } catch (err) {
      // a stand-in or an old browser: moves still arrive while the finger stays on the grid
    }
    start = i;
    end = i;
    dragging = false;
  });

  root.addEventListener("pointermove", (e) => {
    if (pointer !== e.pointerId || start < 0) return;
    const p = pointAt(e);
    if (!p) return;
    const next = snapEnd(size, start, p.x, p.y);
    if (next === end) return;
    end = next;
    if (end !== start && !dragging) {
      dragging = true;
      anchor = -1;
      showAnchor();
    }
    if (dragging) drawSelection(start, end);
  });

  function release(e, cancelled) {
    if (pointer !== e.pointerId) return;
    pointer = null;
    const a = start;
    const b = end;
    const wasDrag = dragging;
    if (cancelled || a < 0) {
      clearSelection();
      return;
    }
    if (wasDrag) {
      dragging = false;
      commit(a, b);
    } else {
      clearSelection();
      tap(a);
    }
  }
  root.addEventListener("pointerup", (e) => release(e, false));
  root.addEventListener("pointercancel", (e) => release(e, true));

  // Keyboard: arrows move the cursor, Enter or Space taps, Escape lets go of a first tap.
  root.addEventListener("keydown", (e) => {
    if (locked || !size) return;
    const moves = { ArrowUp: -size, ArrowDown: size, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in moves) {
      if (cursor < 0) cursor = 0;
      else {
        const next = cursor + moves[e.key];
        const sameRow = Math.floor(next / size) === Math.floor(cursor / size);
        if (next >= 0 && next < size * size && (Math.abs(moves[e.key]) === size || sameRow)) cursor = next;
      }
      showCursor();
      if (onCursor) onCursor(cursor, anchor);
    } else if ((e.key === "Enter" || e.key === " ") && cursor >= 0) tap(cursor);
    else if (e.key === "Escape" && anchor >= 0) {
      anchor = -1;
      showAnchor();
    } else return;
    e.preventDefault();
  });
  root.addEventListener("blur", () => {
    cursor = -1;
    showCursor();
  });

  /** The page's colour for the next capsule, so a selection shows in the colour it will keep. */
  function setNextColour(colour) {
    selColour = colour;
  }

  /**
   * The solved grid: the capsules light one after another; with a hidden message, its letters light in reading
   * order and every other letter fades. Returns how long that takes, in milliseconds.
   */
  function showSolved(messageCells, animate) {
    locked = true;
    anchor = -1;
    showAnchor();
    clearSelection();
    root.classList.add("is-solved");
    const els = Array.from(foundEls.values());
    let longest = 0;
    els.forEach((el, k) => {
      el.style.animationDelay = animate ? `${k * 55}ms` : "";
      el.classList.remove("land");
      el.classList.toggle("wave", animate);
    });
    if (animate) longest = els.length * 55 + 500;
    if (messageCells.length) {
      root.classList.add("is-revealing");
      const set = new Set(messageCells);
      cells.forEach((el, i) => el.classList.toggle("msg", set.has(i)));
      layerDots.textContent = "";
      messageCells.forEach((i, k) => {
        const delay = animate ? `${longest + k * 70}ms` : "";
        const [cx, cy] = centre(size, i);
        const dot = svgEl("circle", { class: "dot", cx, cy, r: U * 0.42 });
        dot.style.animationDelay = delay;
        layerDots.appendChild(dot);
        cells[i].style.animationDelay = delay;
      });
      if (animate) longest += messageCells.length * 70 + 300;
    }
    return longest;
  }

  function relabel() {
    root.setAttribute("aria-label", labels.grid(size));
  }

  return {
    set,
    fit,
    addFound,
    flashFound,
    setHints,
    setNextColour,
    showSolved,
    relabel,
    clearSelection,
    flashLetter,
    get anchor() {
      return anchor;
    },
    cellEl: (i) => cells[i] || null,
  };
}
