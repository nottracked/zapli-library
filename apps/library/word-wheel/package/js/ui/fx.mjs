// Small effects for the word games: letters that fly from where they were made to where they belong, and a short
// highlight. Nothing here blocks input or waits for the player. When the phone asks for reduced motion (or the
// browser cannot animate elements), nothing flies: each target is only lit for a moment.

export function createFx(layer) {
  const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const canAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

  /** Whether effects should stay still. */
  const still = () => !canAnimate || Boolean(motionQuery && motionQuery.matches);

  /** Lights an element for a moment (a class the style sheet draws without motion). */
  function flash(el, cls = "lit", ms = 650) {
    if (!el) return;
    el.classList.remove(cls);
    // Reading the size makes the browser apply the removal before the class comes back, so the effect restarts.
    void el.offsetWidth;
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), ms);
  }

  /**
   * Flies letters (their texts) from their boxes (`from`, one per letter) to a box each (`to` as a list) or all to
   * one box (`to` as one), one after another, and calls `land(i)` as letter i arrives (at once when still).
   * `light` makes a smaller, fading flight for lesser finds. Returns when the last one lands, in milliseconds.
   */
  function fly(letters, from, to, { land, light } = {}) {
    const arrive = (i) => {
      if (land) land(i);
    };
    if (!letters.length) return 0;
    if (still()) {
      letters.forEach((_, i) => arrive(i));
      return 0;
    }
    let last = 0;
    letters.forEach((text, i) => {
      const a = from[i] || from[from.length - 1];
      const b = Array.isArray(to) ? to[i] || to[to.length - 1] : to;
      if (!a || !b || !a.width || !b.width) {
        arrive(i);
        return;
      }
      const el = document.createElement("span");
      el.className = light ? "flyer light" : "flyer";
      el.textContent = text;
      el.style.left = `${a.left}px`;
      el.style.top = `${a.top}px`;
      el.style.width = `${a.width}px`;
      el.style.height = `${a.height}px`;
      // The phone's text size (--tz) would enlarge the letter beyond its box; the box sets the size.
      el.style.fontSize = `calc(${Math.round(a.height * 0.62)}px / var(--tz, 1))`;
      layer.appendChild(el);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const end = light ? 0.35 : Math.max(0.4, Math.min(1.6, b.height / a.height));
      const delay = i * (light ? 40 : 60);
      const duration = light ? 380 : 480;
      const anim = el.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 40}px) scale(${(1 + end) / 2 + 0.15})`,
            opacity: 1,
            offset: 0.5,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: light ? 0 : 1 },
        ],
        { duration, delay, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)", fill: "both" },
      );
      last = Math.max(last, delay + duration);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        arrive(i);
      };
      anim.onfinish = finish;
      anim.oncancel = finish;
      // A page in the background may never finish its animations: land anyway.
      window.setTimeout(finish, delay + duration + 400);
    });
    return last;
  }

  return { fly, flash, still };
}
