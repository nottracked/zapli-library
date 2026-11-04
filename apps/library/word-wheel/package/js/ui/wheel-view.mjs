// The letter wheel: five to seven round letters on a disc, with the shuffle button in its middle. A word is made by
// swiping from letter to letter (lifting the finger tries it) or by tapping letters one by one, where a word that is
// an answer not found yet counts at once (js/wheel/taps.mjs has the rules). Swiping back over the previous letter
// takes the last one back. Every letter is a real button, so a screen reader, a keyboard and a mouse can make words
// too.

import { display } from "../core/letters.mjs";
import { EMPTY, tap as tapStep, back, wordOf, fromWord } from "../wheel/taps.mjs";

// Where the letters sit, by how many there are: the circle's radius and a letter's size, in % of the wheel.
const GEOMETRY = { 5: [32, 30], 6: [33, 28], 7: [34, 25] };

/** How long a word taken by taps stays lit before it clears by itself, in milliseconds (css/app.css fades it). */
export const LINGER_MS = 1100;

/**
 * `answers()` returns `{ leadsOn(tiles), isNew(tiles) }` for the wheel as it stands; `onChange(word, { lit })` gets
 * every change of the word; `onSubmit(word, { auto })` gets a word to try (`auto`: taken by taps, while it still
 * shows); `onLetter()` is called when a letter joins the word.
 */
export function createWheel(root, { onChange, onSubmit, onLetter, letterLabel, answers }) {
  const svg = root.querySelector("svg.lines");
  // Two lines on the same points: a wide soft one under a narrow bright one.
  const lines = Array.from(svg.querySelectorAll("polyline"));
  let tiles = [];
  let slots = []; // slots[i]: where letter i sits on the circle
  let buttons = [];
  let taps = EMPTY; // the word made by taps
  let path = []; // positions of the chosen letters, in order: a swipe's, or the taps' word
  let drag = null; // { pointerId, rects, start, moved }
  let pointerTap = false;
  let lingerTimer = 0;

  const later = (fn, ms) => window.setTimeout(fn, ms);
  const cancel = (id) => window.clearTimeout(id);

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
    const text = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    for (const line of lines) line.setAttribute("points", text);
  }

  // The letter just added grows for a moment under the finger.
  function lift(i) {
    const b = buttons[i];
    if (!b) return;
    b.classList.remove("hot");
    void b.offsetWidth;
    b.classList.add("hot");
  }

  function changed(extra) {
    const lit = taps.lit && !drag;
    buttons.forEach((b, i) => {
      const on = path.includes(i);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (!lit) root.classList.remove("linger");
    drawLine(extra);
    onChange(
      path.map((i) => tiles[i]),
      { lit },
    );
  }

  function setTaps(next) {
    taps = next;
    path = wordOf(taps);
  }

  function stopLinger() {
    cancel(lingerTimer);
    lingerTimer = 0;
  }

  // A word taken by taps stays lit and fades; then it clears, unless a tap carried it on meanwhile.
  function startLinger() {
    stopLinger();
    root.classList.remove("linger");
    void root.offsetWidth;
    root.classList.add("linger");
    lingerTimer = later(() => {
      lingerTimer = 0;
      if (!taps.lit || drag) return;
      setTaps(EMPTY);
      changed();
    }, LINGER_MS);
  }

  function context() {
    return { letters: tiles, ...answers() };
  }

  /** One letter picked by a tap, a click or a key. `felt`: the finger already felt it join (at pointerdown). */
  function pick(i, felt) {
    stopLinger();
    const before = taps;
    const { state, taken } = tapStep(taps, i, context());
    if (state === before) {
      setTaps(taps);
      changed();
      return false;
    }
    const grew = state.stream.length > before.stream.length;
    setTaps(state);
    if (grew) lift(i);
    changed();
    if (taken) {
      onSubmit(taken, { auto: true });
      startLinger();
    } else if (grew && !felt && onLetter) onLetter();
    return true;
  }

  function set(newTiles) {
    stopLinger();
    tiles = newTiles.slice();
    slots = tiles.map((_, i) => i);
    taps = EMPTY;
    path = [];
    drag = null;
    root.classList.remove("linger");
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
    root.classList.remove("spin");
    void root.offsetWidth;
    root.classList.add("spin");
    place();
    drawLine();
  }

  function clear() {
    stopLinger();
    setTaps(EMPTY);
    changed();
  }

  /** The delete key: takes the last letter back. */
  function pop() {
    stopLinger();
    setTaps(back(taps));
    changed();
  }

  // The tick: tries the word (the page says what it was). A word the taps took already only clears.
  function submit() {
    if (taps.lit) {
      clear();
      return;
    }
    if (!path.length) return;
    const word = path.map((i) => tiles[i]);
    onSubmit(word, { auto: false });
    stopLinger();
    setTaps(EMPTY);
    changed();
  }

  /** Picks a letter typed on a keyboard ("c" picks a CH tile when the wheel has no C). */
  function type(key) {
    const k = key.toLowerCase();
    const used = new Set(path);
    const hits = tiles.map((t, n) => (t === k ? n : -1)).filter((n) => n >= 0);
    if (!hits.length && k === "c") tiles.forEach((t, n) => t === "ch" && hits.push(n));
    if (!hits.length) return false;
    const free = hits.find((n) => !used.has(n));
    // A letter of a word just taken starts a new word with it; in a word being built a used letter does nothing.
    const i = free !== undefined ? free : taps.lit ? hits[0] : -1;
    if (i < 0) return false;
    return pick(i, false);
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

  // Only letters start a word: a touch on the disc or on the shuffle button in the middle is left to them.
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    drag = { pointerId: e.pointerId, rects: buttons.map((b) => b.getBoundingClientRect()), start: -1, moved: false };
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
    stopLinger();
    drag.start = i;
    // The letter under the finger shows at once; whether this is a tap or a swipe's start is known later. The last
    // letter of a word being built stays as it is (lifting takes it back, moving swipes on from it).
    const word = wordOf(taps);
    const isLast = !taps.lit && word[word.length - 1] === i;
    if (!isLast) {
      const preview = tapStep(taps, i, { ...context(), isNew: () => false }).state;
      path = wordOf(preview);
      if (preview.stream.length > taps.stream.length) {
        lift(i);
        drag.felt = true;
        if (onLetter) onLetter();
      }
    }
    changed();
  });

  root.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const i = hit(e.clientX, e.clientY, 0.8);
    if (i >= 0 && i !== drag.start && !drag.moved) {
      // A swipe makes its own word: after a word was taken it starts afresh, a word being tapped is carried on.
      drag.moved = true;
      const base = taps.lit ? [] : wordOf(taps);
      path = base.includes(drag.start) ? base : [...base, drag.start];
      taps = EMPTY;
    }
    if (i >= 0 && drag.moved) {
      if (path.length >= 2 && i === path[path.length - 2]) path.pop();
      else if (!path.includes(i)) {
        path.push(i);
        lift(i);
        if (onLetter) onLetter();
      }
    }
    changed(toPercent(e.clientX, e.clientY));
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    // The click that follows this pointer's tap must not count twice.
    later(() => {
      pointerTap = false;
    }, 400);
    if (d.moved) {
      if (!cancelled && path.length) submit();
      else {
        // An interrupted swipe keeps its letters as a word being built.
        setTaps(fromWord(path));
        changed();
      }
      return;
    }
    if (cancelled) {
      setTaps(taps);
      changed();
      return;
    }
    pick(d.start, Boolean(d.felt));
  }

  root.addEventListener("pointerup", (e) => endDrag(e, false));
  root.addEventListener("pointercancel", (e) => endDrag(e, true));

  // A screen reader's double tap or a keyboard's Enter on a letter arrives as a click without pointer events.
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".tile");
    if (!b) return;
    if (pointerTap) return;
    pick(Number(b.dataset.i), false);
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
    get lit() {
      return taps.lit;
    },
  };
}
