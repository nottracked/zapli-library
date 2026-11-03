// The letter wheel: five to seven round letters on a disc. A word is made by swiping from letter to letter (lifting
// the finger tries it) or by tapping letters one by one. Swiping back over the previous letter takes the last one
// back. Every letter is a real button, so a screen reader, a keyboard and a mouse can make words too.

import { display } from "../core/letters.mjs";

// Where the letters sit, by how many there are: the circle's radius and a letter's size, in % of the wheel.
const GEOMETRY = { 5: [32, 30], 6: [33, 28], 7: [34, 25] };

export function createWheel(root, { onChange, onSubmit, letterLabel }) {
  const svg = root.querySelector("svg");
  const line = svg.querySelector("polyline");
  let tiles = [];
  let slots = []; // slots[i]: where letter i sits on the circle
  let buttons = [];
  let path = []; // indices of the chosen letters, in order
  let drag = null; // { pointerId, added, rects, start }
  let pointerTap = false;

  function centre(i) {
    const n = tiles.length;
    const [radius] = GEOMETRY[n] || GEOMETRY[7];
    const angle = -Math.PI / 2 + (2 * Math.PI * slots[i]) / n;
    return [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)];
  }

  function place() {
    const n = tiles.length;
    const [, size] = GEOMETRY[n] || GEOMETRY[7];
    root.style.setProperty("--tile", `${size}%`);
    buttons.forEach((b, i) => {
      const [x, y] = centre(i);
      b.style.left = `${x}%`;
      b.style.top = `${y}%`;
    });
  }

  function drawLine(extra) {
    const points = path.map((i) => centre(i));
    if (extra && points.length) points.push(extra);
    line.setAttribute("points", points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "));
  }

  function changed(extra) {
    buttons.forEach((b, i) => {
      const on = path.includes(i);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    drawLine(extra);
    onChange(path.map((i) => tiles[i]));
  }

  function set(newTiles) {
    tiles = newTiles.slice();
    slots = tiles.map((_, i) => i);
    path = [];
    root.querySelectorAll(".tile").forEach((b) => b.remove());
    buttons = tiles.map((tile, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.textContent = display(tile);
      b.dataset.i = String(i);
      b.setAttribute("aria-label", letterLabel(display(tile)));
      b.setAttribute("aria-pressed", "false");
      root.appendChild(b);
      return b;
    });
    place();
    changed();
  }

  function relabel() {
    buttons.forEach((b, i) => b.setAttribute("aria-label", letterLabel(display(tiles[i]))));
  }

  function shuffle() {
    if (tiles.length < 2) return;
    let next = slots.slice();
    for (let tries = 0; tries < 10 && next.every((s, i) => s === slots[i]); tries++) {
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    slots = next;
    place();
    drawLine();
  }

  function clear() {
    path = [];
    changed();
  }

  function pop() {
    path.pop();
    changed();
  }

  function submit() {
    if (!path.length) return;
    const word = path.map((i) => tiles[i]);
    path = [];
    changed();
    onSubmit(word);
  }

  function add(i) {
    if (path.includes(i)) return false;
    path.push(i);
    return true;
  }

  /** Picks the first unused letter typed on a keyboard ("c" picks a CH tile when the wheel has no C). */
  function type(key) {
    const k = key.toLowerCase();
    let i = tiles.findIndex((t, n) => t === k && !path.includes(n));
    if (i < 0 && k === "c") i = tiles.findIndex((t, n) => t === "ch" && !path.includes(n));
    if (i < 0) return false;
    add(i);
    changed();
    return true;
  }

  // ---- pointer: swipe and tap

  function hit(x, y, reach) {
    if (!drag) return -1;
    for (let i = 0; i < drag.rects.length; i++) {
      const r = drag.rects[i];
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) <= (r.width / 2) * reach) return i;
    }
    return -1;
  }

  function toPercent(x, y) {
    const box = root.getBoundingClientRect();
    return [((x - box.left) / box.width) * 100, ((y - box.top) / box.height) * 100];
  }

  root.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    drag = { pointerId: e.pointerId, added: 0, rects: buttons.map((b) => b.getBoundingClientRect()), start: -1 };
    const i = hit(e.clientX, e.clientY, 1);
    if (i < 0) {
      drag = null;
      return;
    }
    e.preventDefault();
    pointerTap = true;
    try {
      root.setPointerCapture(e.pointerId);
    } catch (err) {
      // capture is a convenience: moves still arrive while the finger stays on the wheel
    }
    drag.start = i;
    drag.wasOn = path.includes(i);
    if (add(i)) drag.added = 1;
    changed();
  });

  root.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const i = hit(e.clientX, e.clientY, 0.8);
    if (i >= 0) {
      if (path.length >= 2 && i === path[path.length - 2]) {
        path.pop();
        drag.added = Math.max(0, drag.added - 1);
        drag.moved = true;
      } else if (add(i)) {
        drag.added++;
        drag.moved = true;
      }
    }
    changed(toPercent(e.clientX, e.clientY));
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    // The click that follows this pointer's tap must not count twice.
    window.setTimeout(() => {
      pointerTap = false;
    }, 400);
    if (!cancelled && d.moved && path.length) {
      submit();
      return;
    }
    // A tap: a new letter stays chosen; a tap on the last chosen letter takes it back.
    if (!d.moved && d.wasOn && path[path.length - 1] === d.start) path.pop();
    changed();
  }

  root.addEventListener("pointerup", (e) => endDrag(e, false));
  root.addEventListener("pointercancel", (e) => endDrag(e, true));

  // A screen reader's double tap or a keyboard's Enter on a letter arrives as a click without pointer events.
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".tile");
    if (!b) return;
    if (pointerTap) return;
    const i = Number(b.dataset.i);
    if (path[path.length - 1] === i) path.pop();
    else add(i);
    changed();
  });

  return {
    set,
    shuffle,
    clear,
    pop,
    submit,
    type,
    relabel,
    get length() {
      return path.length;
    },
  };
}
