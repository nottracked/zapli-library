// The on-screen keyboard: three rows of letter keys on the dark tray. A key carries the mark its letter has earned
// (filled for a letter in its place, an outline for one elsewhere in the word, faded for one not in it). A Slovak key
// with accented letters shows a small corner tab; holding it opens its letters above the key, and sliding to one and
// letting go types it. A short tap types the plain letter. Screen readers and switch access activate keys with a
// click, which types the plain letter; their accents come from the strip above the keyboard (main.mjs).

import { VARIANTS } from "../game/draft.mjs";

const ROWS = {
  en: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
  // Slovak keyboards have Z and Y swapped.
  sk: ["qwertzuiop", "asdfghjkl", "yxcvbnm"],
};

const HOLD_MS = 340;

export function createKeyboard(root, { onKey, label, onHoldStart }) {
  let lang = "en";
  let marks = new Map();
  let press = null; // { key, base, timer, popup, options, chosen, pointerId }
  let swallowClick = null;

  function build(code) {
    lang = code === "sk" ? "sk" : "en";
    root.textContent = "";
    ROWS[lang].forEach((row, r) => {
      const line = document.createElement("div");
      line.className = `row row${r + 1}`;
      for (const letter of row) {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "key";
        key.dataset.key = letter;
        const ch = document.createElement("span");
        ch.className = "ch";
        ch.textContent = letter.toUpperCase();
        const mk = document.createElement("span");
        mk.className = "mk";
        mk.setAttribute("aria-hidden", "true");
        key.appendChild(ch);
        key.appendChild(mk);
        if (VARIANTS[lang][letter]) {
          key.classList.add("more");
          const tab = document.createElement("span");
          tab.className = "tab";
          tab.setAttribute("aria-hidden", "true");
          key.appendChild(tab);
        }
        line.appendChild(key);
      }
      root.appendChild(line);
    });
    paint();
  }

  function variantsOf(letter) {
    return VARIANTS[lang][letter] || [];
  }

  /** Draws each key's mark and its spoken label. A key's tab is lit when one of its accented letters was found. */
  function paint() {
    for (const key of root.querySelectorAll(".key")) {
      const letter = key.dataset.key;
      const mark = marks.get(letter) || "";
      key.classList.remove("hit", "near", "miss", "lit");
      if (mark) key.classList.add(mark);
      const more = variantsOf(letter);
      if (more.some((v) => marks.get(v) === "hit" || marks.get(v) === "near")) key.classList.add("lit");
      key.setAttribute("aria-label", label(letter, mark, more));
    }
  }

  function closePopup() {
    if (press && press.popup) press.popup.remove();
    if (press) window.clearTimeout(press.timer);
    press = null;
  }

  // The popup of a held key: its plain letter and its accented letters in a row above the key, kept on screen.
  function openPopup() {
    if (!press) return;
    const options = [press.base, ...variantsOf(press.base)];
    const popup = document.createElement("div");
    popup.className = "popup";
    popup.setAttribute("role", "presentation");
    options.forEach((tile, i) => {
      const b = document.createElement("span");
      b.className = "opt";
      b.dataset.tile = tile;
      const mark = marks.get(tile);
      if (mark) b.classList.add(mark);
      b.textContent = tile.toUpperCase();
      if (i === 1) b.classList.add("on");
      popup.appendChild(b);
    });
    document.body.appendChild(popup);
    const r = press.key.getBoundingClientRect();
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const left = Math.max(6, Math.min(vw - pw - 6, r.left + r.width / 2 - pw / 4));
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(6, r.top - ph - 8)}px`;
    press.popup = popup;
    press.options = options;
    press.chosen = 1;
    if (onHoldStart) onHoldStart();
  }

  function choose(x) {
    if (!press || !press.popup) return;
    const opts = Array.from(press.popup.children);
    let best = press.chosen;
    let bestDist = Infinity;
    opts.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    press.chosen = best;
    opts.forEach((el, i) => el.classList.toggle("on", i === best));
  }

  root.addEventListener("pointerdown", (e) => {
    const key = e.target.closest(".key");
    if (!key || !key.classList.contains("more") || e.button > 0) return;
    closePopup();
    press = { key, base: key.dataset.key, pointerId: e.pointerId, popup: null, timer: 0 };
    press.timer = window.setTimeout(openPopup, HOLD_MS);
    try {
      key.setPointerCapture(e.pointerId);
    } catch (err) {
      // Capture is a convenience: without it the popup still works while the finger stays on the key.
    }
  });

  root.addEventListener("pointermove", (e) => {
    if (press && press.popup && e.pointerId === press.pointerId) choose(e.clientX);
  });

  root.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const tile = press.popup ? press.options[press.chosen] : press.base;
    swallowClick = press.key;
    closePopup();
    onKey(tile, true);
  });

  root.addEventListener("pointercancel", () => {
    swallowClick = null;
    closePopup();
  });

  root.addEventListener("click", (e) => {
    const key = e.target.closest(".key");
    if (!key) return;
    if (swallowClick === key) {
      swallowClick = null;
      return;
    }
    swallowClick = null;
    // A finger's or a mouse's click has a count (detail); a screen reader's or a keyboard's has none.
    onKey(key.dataset.key, e.detail > 0);
  });

  // The page may suppress the long-press menu of the WebView itself.
  root.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    setLang: build,
    /** Sets the marks (a Map of letter to "hit", "near" or "miss") and redraws the keys. */
    setMarks(next) {
      marks = next || new Map();
      paint();
    },
    relabel: paint,
    /** Flashes a key as if pressed (for typing on a physical keyboard). */
    flash(letter) {
      const key = root.querySelector(`.key[data-key="${letter}"]`);
      if (!key) return;
      key.classList.remove("pressed");
      void key.offsetWidth;
      key.classList.add("pressed");
      window.setTimeout(() => key.classList.remove("pressed"), 140);
    },
  };
}
