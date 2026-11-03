// A note as a card in the grid or the list: its first photo, title, text or open items, labels and reminder. The
// grid is a masonry: every card spans as many small rows as it is tall, so the cards keep their order for screen
// readers and the keyboard while the columns fill evenly. Cards open with a tap, select with a long press, and in
// the notes view a sideways swipe archives one.

import { h, t, ctx, reminderWhen, shortWhen, dialogOpen } from "./ui.mjs";
import { icon } from "./icons.mjs";
import { parseItems, highlight, nextReminder, trashDaysLeft, firstLine, editedMs } from "./model.mjs";

const ROW = 4;
const LONG_PRESS = 450;

/** Text with the search words marked. */
export function marked(text, terms) {
  if (!terms || !terms.length) return [document.createTextNode(text)];
  return highlight(text, terms).map((part) =>
    part.hit ? h("mark", { text: part.text }) : document.createTextNode(part.text),
  );
}

/** What a reminder chip shows, and whether its time has passed. */
export function reminderInfo(note, now = ctx.now()) {
  if (!note.remindAt) return null;
  const next = nextReminder(note.remindAt, note.repeat, now);
  const at = next || new Date(note.remindAt);
  if (Number.isNaN(at.getTime())) return null;
  return { at, past: !next, repeating: Boolean(note.repeat) };
}

/** The words a screen reader says for a card: title or first line, its state, then the start of its text. */
function cardLabel(note, items, reminder, mode) {
  const parts = [];
  const title = String(note.title || "").trim() || firstLine(note) || t("untitled");
  parts.push(title);
  if (note.kind === "list") {
    const open = items.filter((i) => !i.done).length;
    parts.push(t("itemsDone", { done: items.length - open, total: items.length }));
  } else {
    const text = String(note.body || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text && text !== title) parts.push(text.slice(0, 140));
  }
  if (note.pinned && mode !== "trash") parts.push(t("pinnedState"));
  if (reminder) parts.push(t("reminderState", { when: reminderWhen(reminder.at) }));
  if (note._labels.length) parts.push(t("labelsState", { names: note._labels.join(", ") }));
  if (note._photos.length) parts.push(t("photoCount", { n: note._photos.length }));
  return parts.join(". ");
}

/**
 * One card. opts: terms (search words), mode ("notes", "archive", "trash", "reminders", "search", "label"), view
 * ("grid" or "list"), selecting, selected, and the handlers onOpen, onToggle (in selection), onLongPress, onSwipe.
 */
export function noteCard(note, opts = {}) {
  const terms = opts.terms || [];
  const items = note.kind === "list" ? parseItems(note.body) : [];
  const reminder = reminderInfo(note);
  const listView = opts.view === "list";

  const inner = h("div", { class: "card-inner", "aria-hidden": "true" });

  if (note._photos.length) {
    const img = h("img", { class: "card-photo", alt: "", decoding: "async" });
    const wrap = h("div", { class: "card-photo-wrap" }, img);
    if (note._photos.length > 1)
      wrap.appendChild(h("span", { class: "card-photo-more", text: "+" + (note._photos.length - 1) }));
    inner.appendChild(wrap);
    ctx.store.thumbUrl(note._photos[0]).then((url) => {
      if (url) {
        img.src = url;
        img.addEventListener("load", () => relayout(inner), { once: true });
      } else wrap.remove();
    });
  }

  const body = h("div", { class: "card-body" });
  if (String(note.title || "").trim())
    body.appendChild(h("h3", { class: "card-title" }, marked(note.title.trim(), terms)));

  if (note.kind === "list") {
    const open = items.filter((i) => !i.done);
    const done = items.length - open.length;
    const shown = (open.length ? open : items).slice(0, listView ? 4 : 7);
    if (shown.length) {
      body.appendChild(
        h(
          "ul",
          { class: "card-items" },
          shown.map((item) =>
            h(
              "li",
              { class: item.done ? "done" : "" },
              h("span", { class: "box" }),
              h("span", { class: "item-text" }, marked(item.text, terms)),
            ),
          ),
        ),
      );
    }
    const more = open.length - shown.length;
    const extra = [];
    if (open.length && more > 0) extra.push(t("moreItems", { n: more }));
    if (open.length && done) extra.push(t("tickedCount", { n: done }));
    if (extra.length) body.appendChild(h("p", { class: "card-more", text: extra.join(" · ") }));
  } else if (String(note.body || "").trim()) {
    const text = String(note.body)
      .trim()
      .slice(0, listView ? 400 : 900);
    body.appendChild(h("p", { class: "card-text" + (listView ? " short" : "") }, marked(text, terms)));
  }

  const chips = [];
  if (reminder && opts.mode !== "trash") {
    chips.push(
      h(
        "span",
        { class: "mini-chip" + (reminder.past ? " past" : "") },
        icon(reminder.repeating ? "repeat" : "bell"),
        h("span", { text: reminderWhen(reminder.at) }),
      ),
    );
  }
  if (opts.mode === "search" && note.archived)
    chips.push(h("span", { class: "mini-chip" }, icon("archive"), h("span", { text: t("archivedState") })));
  const shownLabels = note._labels.slice(0, 3);
  for (const name of shownLabels) chips.push(h("span", { class: "mini-chip label-chip" }, h("span", { text: name })));
  if (note._labels.length > shownLabels.length)
    chips.push(h("span", { class: "mini-chip", text: "+" + (note._labels.length - shownLabels.length) }));
  if (opts.mode === "trash") {
    const days = trashDaysLeft(note.trashedAt, ctx.now());
    chips.push(
      h(
        "span",
        { class: "mini-chip warn" },
        icon("trash"),
        h("span", { text: days > 0 ? t("goneInDays", { n: days }) : t("goneToday") }),
      ),
    );
  }
  if (opts.showEdited) chips.push(h("span", { class: "mini-chip quiet", text: shortWhen(new Date(editedMs(note))) }));
  if (chips.length) body.appendChild(h("div", { class: "card-chips" }, chips));

  if (!body.childNodes.length) body.appendChild(h("p", { class: "card-text empty-note", text: t("emptyNote") }));
  inner.appendChild(body);

  const card = h("article", {
    class: "card tint-" + (note.color || "none") + (opts.selected ? " selected" : "") + (opts.fresh ? " enter" : ""),
    "data-id": note.id,
  });
  card.appendChild(inner);
  if (opts.selecting || opts.selected)
    card.appendChild(h("span", { class: "card-check", "aria-hidden": "true" }, icon("check")));

  const hit = h("button", {
    type: "button",
    class: "card-hit",
    "aria-label": cardLabel(note, items, reminder, opts.mode),
    "aria-pressed": opts.selecting ? String(Boolean(opts.selected)) : null,
  });
  card.appendChild(hit);
  wireGestures(card, hit, note, opts);
  return card;
}

/** Tap, long press and the sideways swipe on a card. */
function wireGestures(card, hit, note, opts) {
  let timer = null;
  let start = null;
  let swiping = false;
  let longPressed = false;
  let moved = false;

  const reset = () => {
    clearTimeout(timer);
    timer = null;
    start = null;
  };

  hit.addEventListener("pointerdown", (e) => {
    if (dialogOpen() || (e.button !== undefined && e.button !== 0)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    longPressed = false;
    moved = false;
    swiping = false;
    card.classList.add("pressing");
    if (opts.onLongPress) {
      timer = setTimeout(() => {
        longPressed = true;
        card.classList.remove("pressing");
        opts.onLongPress(note);
      }, LONG_PRESS);
    }
  });

  hit.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) > 8) {
      moved = true;
      clearTimeout(timer);
      card.classList.remove("pressing");
    }
    if (!opts.onSwipe || opts.selecting) return;
    if (!swiping && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      swiping = true;
      card.classList.add("swiping");
      if (hit.setPointerCapture) hit.setPointerCapture(e.pointerId);
    }
    if (swiping) {
      const width = card.offsetWidth || 300;
      card.style.transform = "translateX(" + dx + "px) rotate(" + (dx / width) * 3 + "deg)";
      card.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / (width * 1.1)));
    }
  });

  const finish = (e) => {
    card.classList.remove("pressing");
    if (!start) return;
    const dx = e ? e.clientX - start.x : 0;
    if (swiping) {
      const width = card.offsetWidth || 300;
      card.classList.remove("swiping");
      if (Math.abs(dx) > width * 0.38) {
        card.classList.add("swiped");
        card.style.transform = "translateX(" + Math.sign(dx) * width * 1.2 + "px)";
        card.style.opacity = "0";
        setTimeout(() => opts.onSwipe(note), 160);
      } else {
        card.style.transform = "";
        card.style.opacity = "";
      }
    }
    reset();
  };
  hit.addEventListener("pointerup", finish);
  hit.addEventListener("pointercancel", () => {
    card.classList.remove("pressing", "swiping");
    card.style.transform = "";
    card.style.opacity = "";
    reset();
  });

  hit.addEventListener("click", (e) => {
    if (longPressed || swiping) {
      e.preventDefault();
      longPressed = false;
      return;
    }
    if (opts.selecting) opts.onToggle(note);
    else opts.onOpen(note);
  });

  // The keyboard and screen readers: the context-menu key (or Shift+F10) selects, as a long press does.
  hit.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (opts.onLongPress && !longPressed && !moved) opts.onLongPress(note);
  });
}

/** Makes each card of a masonry grid span as many rows as it is tall. Run after the cards are on the page. */
export function layoutGrid(grid) {
  if (!grid || !grid.children) return;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(grid) : null;
  const gap = style ? parseFloat(style.columnGap || "0") || 0 : 0;
  for (const card of grid.children) relayoutCard(card, gap);
}

function relayoutCard(card, gap) {
  const inner = card.firstElementChild || card.firstChild;
  // The layout height, which the entrance animation's scaling does not change.
  const height = inner ? inner.offsetHeight : 0;
  if (!height) return;
  card.style.gridRowEnd = "span " + Math.max(1, Math.ceil((height + gap) / ROW));
}

function relayout(inner) {
  const card = inner.parentNode;
  const grid = card && card.parentNode;
  if (!grid || !grid.classList || !grid.classList.contains("masonry")) return;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(grid) : null;
  relayoutCard(card, style ? parseFloat(style.columnGap || "0") || 0 : 0);
}

/** Keeps a grid's cards sized as they grow (a photo loads) or the text size changes. */
export function watchGrid(grid) {
  layoutGrid(grid);
  if (typeof ResizeObserver !== "function") return () => {};
  const observer = new ResizeObserver(() => layoutGrid(grid));
  for (const card of grid.children) if (card.firstElementChild) observer.observe(card.firstElementChild);
  return () => observer.disconnect();
}
