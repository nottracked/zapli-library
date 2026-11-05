// The note editor: a title and the text, or a checklist (tick, reorder by dragging the handle, ticked items to the
// bottom, Enter for the next item, pasted lines as items), photos, a colour, labels and a reminder. Every change is
// saved by itself a moment after the last key (and when the app goes to the background), with Undo and Redo for
// the text. A copy of what is being typed waits in the browser's storage, so a reload (rotation, dark mode) never
// loses a word. A new note is made only once something is typed; a note left empty is put away.

import {
  ctx,
  h,
  t,
  iconButton,
  button,
  snack,
  haptic,
  menu,
  sheet,
  dialog,
  failed,
  autosize,
  reducedMotion,
  shortWhen,
  longWhen,
  reminderWhen,
} from "../ui.mjs";
import { icon } from "../icons.mjs";
import {
  parseItems,
  serializeItems,
  textToItems,
  itemsToText,
  isoLocal,
  labelsOf,
  labelsText,
  photoIds,
  photosText,
  noteStats,
  trashDaysLeft,
  isEmptyNote,
  nextReminder,
  MAX_BODY,
  MAX_TITLE,
  editedMs,
  createdMs,
} from "../model.mjs";
import * as act from "../actions.mjs";
import { capture, storePhotos, photoSources, dataUrl, fileOf } from "../photos.mjs";

const DRAFT_KEY = "notes-draft-v1";
const SAVE_DELAY = 650;
const BURST = 1200;

/** The open editor's state, or null. */
let ed = null;

// ---------------------------------------------------------------- the draft copy

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

function writeDraft(s) {
  if (!s || s.readOnly) return;
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ id: s.id || "new", title: s.title, body: bodyOf(s), kind: s.kind, at: Date.now() }),
    );
  } catch {
    // Storage blocked: the store's own saves still run.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

// ---------------------------------------------------------------- state

let keySeed = 1;
function itemOf(item) {
  return { key: keySeed++, text: item.text, done: Boolean(item.done) };
}

function bodyOf(s) {
  return s.kind === "list" ? serializeItems(s.items) : s.text;
}

/** An editor's note in the store's shape (for the sheets, sharing and the empty check). */
function noteOf(s) {
  return {
    id: s.id,
    title: s.title,
    body: bodyOf(s),
    kind: s.kind,
    color: s.color,
    labels: labelsText(s.labels),
    photos: photosText(s.photos),
    _labels: s.labels,
    _photos: s.photos,
    pinned: s.pinned,
    archived: s.archived,
    remindAt: s.remindAt,
    repeat: s.repeat,
  };
}

function snapshot() {
  return {
    title: ed.title,
    kind: ed.kind,
    text: ed.text,
    items: ed.items.map((i) => ({ text: i.text, done: i.done })),
  };
}

/** Remembers the note before a change, for Undo; typing in one go counts as one change. */
function remember(force = false) {
  const now = Date.now();
  if (!force && now - ed.lastTyped < BURST) {
    ed.lastTyped = now;
    return;
  }
  ed.lastTyped = force ? 0 : now;
  ed.history.push(snapshot());
  if (ed.history.length > 100) ed.history.shift();
  ed.future = [];
  updateUndo();
}

function restoreSnapshot(s) {
  ed.title = s.title;
  ed.kind = s.kind;
  ed.text = s.text;
  ed.items = s.items.map(itemOf);
  ed.lastTyped = 0;
  drawContent();
  changed(["title", "body", "kind"]);
}

function undo() {
  if (!ed || !ed.history.length) return;
  ed.future.push(snapshot());
  restoreSnapshot(ed.history.pop());
  updateUndo();
}

function redo() {
  if (!ed || !ed.future.length) return;
  ed.history.push(snapshot());
  restoreSnapshot(ed.future.pop());
  updateUndo();
}

function updateUndo() {
  if (!ed || !ed.dom.undo) return;
  ed.dom.undo.disabled = !ed.history.length;
  ed.dom.redo.disabled = !ed.future.length;
}

// ---------------------------------------------------------------- saving

const CONTENT = new Set(["title", "body", "kind", "photos", "color", "labels"]);

/** Marks fields as changed: saved a moment later, and the typed text is copied at once. */
function changed(fields) {
  if (!ed || ed.readOnly) return;
  const s = ed;
  for (const f of fields) s.dirty.add(f);
  if (fields.some((f) => CONTENT.has(f))) s.editedAt = ctx.now();
  writeDraft(s);
  clearTimeout(s.timer);
  s.timer = setTimeout(() => save(s), SAVE_DELAY);
  updateMeta();
}

function patchOf(s, fields) {
  const patch = {};
  for (const f of fields) {
    if (f === "title") patch.title = s.title.slice(0, MAX_TITLE) || null;
    else if (f === "body") patch.body = bodyOf(s).slice(0, MAX_BODY) || null;
    else if (f === "kind") patch.kind = s.kind;
    else if (f === "color") patch.color = s.color;
    else if (f === "labels") patch.labels = labelsText(s.labels) || null;
    else if (f === "photos") patch.photos = photosText(s.photos) || null;
    else if (f === "pinned") patch.pinned = s.pinned;
    else if (f === "archived") patch.archived = s.archived;
  }
  if (fields.some((f) => CONTENT.has(f))) patch.edited = isoLocal(s.editedAt || ctx.now());
  return patch;
}

/**
 * Saves what changed in editor state `s`: a new note on its first save (only once it has something in it, unless
 * `s.force` asks for it), else only the changed fields. One save runs at a time; changes made meanwhile follow.
 */
function save(s = ed) {
  if (!s) return Promise.resolve();
  clearTimeout(s.timer);
  if (s.saving) {
    s.again = true;
    return s.saving;
  }
  if (!s.dirty.size && (s.id || !s.force)) return Promise.resolve();
  if (!s.id && !s.force && isEmptyNote(noteOf(s))) return Promise.resolve();
  const fields = [...s.dirty];
  s.dirty.clear();
  const work = async () => {
    try {
      if (!s.id) {
        const now = isoLocal(ctx.now());
        const note = await ctx.store.add({
          title: s.title.slice(0, MAX_TITLE),
          body: bodyOf(s).slice(0, MAX_BODY),
          kind: s.kind,
          color: s.color,
          labels: labelsText(s.labels),
          photos: photosText(s.photos),
          pinned: s.pinned,
          created: now,
          edited: now,
        });
        s.id = note.id;
        s.createdHere = true;
        if (s.labels.length) ctx.store.ensureLabels(s.labels);
        if (ed === s && /^#\/new/.test(location.hash)) {
          history.replaceState(history.state, "", "#/note/" + note.id);
          ctx.syncRoute();
        }
      } else {
        await ctx.store.update(s.id, patchOf(s, fields));
      }
      if (!s.dirty.size) clearDraft();
    } catch (error) {
      for (const f of fields) s.dirty.add(f);
      failed(error);
    } finally {
      s.saving = null;
      if (s.again) {
        s.again = false;
        save(s);
      }
    }
  };
  s.saving = work();
  return s.saving;
}

/** Saves at once (the app goes to the background, or a sheet needs the stored note). */
export function flush(s = ed) {
  if (!s) return Promise.resolve();
  if (s.dirty.size) return save(s);
  return s.saving || Promise.resolve();
}

/** The stored note, made now if the editor has not saved one yet (a sheet needs it). */
async function ensureSaved() {
  const s = ed;
  if (!s) return null;
  if (!s.id) {
    s.force = true;
    s.dirty.add("body");
  }
  await save(s);
  if (s.saving) await s.saving;
  return s.id ? ctx.store.get(s.id) : null;
}

// ---------------------------------------------------------------- the text

function titleInput() {
  const input = h("textarea", {
    class: "title-input",
    rows: "1",
    placeholder: t("titlePlaceholder"),
    "aria-label": t("title"),
    maxlength: String(MAX_TITLE),
    enterkeyhint: "next",
    readonly: ed.readOnly || null,
  });
  input.value = ed.title;
  input.addEventListener("input", () => {
    remember();
    const hadBreak = /[\r\n]/.test(input.value);
    const clean = input.value.replace(/[\r\n]+/g, " ").replace(/\s+$/, hadBreak ? "" : "$&");
    if (clean !== input.value) input.value = clean;
    ed.title = clean;
    autosize(input);
    changed(["title"]);
    if (hadBreak) focusBodyStart();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusBodyStart();
    }
  });
  ed.dom.title = input;
  return input;
}

function bodyInput() {
  const area = h("textarea", {
    class: "body-input",
    placeholder: t("bodyPlaceholder"),
    "aria-label": t("noteText"),
    readonly: ed.readOnly || null,
    maxlength: String(MAX_BODY),
  });
  area.value = ed.text;
  area.addEventListener("input", () => {
    remember();
    ed.text = area.value;
    autosize(area);
    changed(["body"]);
  });
  ed.dom.body = area;
  return area;
}

function focusBodyStart() {
  if (!ed) return;
  if (ed.kind === "list") {
    const first = visibleOrder()[0];
    if (!first || first.done) addItem(null, "", 0);
    else focusItem(first.key, 0);
  } else if (ed.dom.body) {
    ed.dom.body.focus();
    try {
      ed.dom.body.setSelectionRange(0, 0);
    } catch {
      // No caret to place.
    }
  }
}

// ---------------------------------------------------------------- the checklist

function tickedToBottom() {
  return ctx.store.ui.tickedToBottom !== false;
}

function newAtTop() {
  return ctx.store.ui.newItemsAtTop === true;
}

/** Items in the order the screen shows them: open ones, then ticked ones when those go to the bottom. */
function visibleOrder() {
  if (!tickedToBottom()) return ed.items;
  return [...ed.items.filter((i) => !i.done), ...ed.items.filter((i) => i.done)];
}

/** The items an item moves among: its own group (open or ticked) when ticked items go to the bottom. */
function groupOf(item) {
  return tickedToBottom() ? ed.items.filter((i) => i.done === item.done) : ed.items;
}

function focusItem(key, caret) {
  const wrap = ed && ed.dom.listWrap;
  const area = wrap && wrap.querySelector ? wrap.querySelector('[data-key="' + key + '"] .item-text') : null;
  if (!area) return;
  area.focus();
  const at = caret === undefined || caret === "end" ? area.value.length : caret;
  try {
    area.setSelectionRange(at, at);
  } catch {
    // Not every input takes a caret position.
  }
}

/** Adds an open item after `after` (an item), or where new items go, and puts the cursor in it. */
function addItem(after, text, caret = 0) {
  remember(true);
  const item = itemOf({ text, done: false });
  if (after) ed.items.splice(ed.items.indexOf(after) + 1, 0, item);
  else if (newAtTop()) ed.items.unshift(item);
  else {
    const firstTicked = tickedToBottom() ? ed.items.findIndex((i) => i.done) : -1;
    if (firstTicked >= 0) ed.items.splice(firstTicked, 0, item);
    else ed.items.push(item);
  }
  drawList();
  changed(["body"]);
  focusItem(item.key, caret);
  return item;
}

function removeItem(item, { focusPrevious = false } = {}) {
  remember(true);
  const order = visibleOrder();
  const before = order[order.indexOf(item) - 1];
  ed.items.splice(ed.items.indexOf(item), 1);
  drawList();
  changed(["body"]);
  if (focusPrevious && before) focusItem(before.key, "end");
}

function tick(item, li) {
  remember(true);
  item.done = !item.done;
  haptic("light");
  if (li) {
    li.classList.toggle("done", item.done);
    const box = li.querySelector ? li.querySelector(".check") : null;
    if (box) box.setAttribute("aria-checked", String(item.done));
  }
  const move = () => {
    if (!ed) return;
    if (tickedToBottom()) {
      // A ticked item goes to the top of the ticked ones; one ticked again goes back to the end of the open ones.
      const rest = ed.items.filter((i) => i !== item);
      const firstTicked = rest.findIndex((i) => i.done);
      rest.splice(firstTicked >= 0 ? firstTicked : rest.length, 0, item);
      ed.items = rest;
    }
    drawList();
  };
  changed(["body"]);
  if (tickedToBottom() && !reducedMotion() && li) {
    li.classList.add("leaving");
    setTimeout(move, 360);
  } else move();
}

function moveItem(item, to) {
  const group = [...groupOf(item)];
  const from = group.indexOf(item);
  const target = Math.max(0, Math.min(group.length - 1, to));
  if (from < 0 || from === target) return;
  remember(true);
  group.splice(from, 1);
  group.splice(target, 0, item);
  if (tickedToBottom()) {
    const open = item.done ? ed.items.filter((i) => !i.done) : group;
    const done = item.done ? group : ed.items.filter((i) => i.done);
    ed.items = [...open, ...done];
  } else ed.items = group;
  drawList();
  changed(["body"]);
}

/** A line break typed into an item (a soft keyboard's Enter) splits it there; pasted lines become items. */
function onBreak(item, value) {
  const lines = value.split(/\r?\n/);
  if (lines.length === 2) {
    item.text = lines[0];
    drawList();
    addItem(item, lines[1].trimStart(), 0);
    return;
  }
  splitInto(item, value);
}

function itemRow(item) {
  const li = h("li", { class: "item" + (item.done ? " done" : ""), "data-key": String(item.key) });
  const area = h("textarea", {
    class: "item-text",
    rows: "1",
    "aria-label": t("listItem"),
    placeholder: t("listItem"),
    enterkeyhint: "next",
    readonly: ed.readOnly || null,
  });
  area.value = item.text;

  const box = h(
    "button",
    {
      type: "button",
      class: "check",
      role: "checkbox",
      "aria-checked": String(item.done),
      "aria-label": item.text || t("emptyItem"),
      disabled: ed.readOnly || null,
      onClick: () => tick(item, li),
    },
    h("span", { class: "box" }, icon("check")),
  );

  area.addEventListener("input", () => {
    if (/[\r\n]/.test(area.value)) {
      remember(true);
      onBreak(item, area.value);
      return;
    }
    remember();
    item.text = area.value;
    box.setAttribute("aria-label", item.text || t("emptyItem"));
    autosize(area);
    changed(["body"]);
  });
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const at = area.selectionStart ?? area.value.length;
      const rest = area.value.slice(at);
      if (!area.value.trim()) return;
      item.text = area.value.slice(0, at);
      addItem(item, rest, 0);
    } else if (e.key === "Backspace" && area.selectionStart === 0 && area.selectionEnd === 0) {
      const order = visibleOrder();
      const prev = order[order.indexOf(item) - 1];
      if (!area.value) {
        e.preventDefault();
        removeItem(item, { focusPrevious: true });
      } else if (prev && prev.done === item.done) {
        e.preventDefault();
        remember(true);
        const join = prev.text.length;
        prev.text += area.value;
        ed.items.splice(ed.items.indexOf(item), 1);
        drawList();
        changed(["body"]);
        focusItem(prev.key, join);
      }
    }
  });
  area.addEventListener("paste", (e) => {
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (!text || !/[\r\n]/.test(text.trim())) return;
    e.preventDefault();
    const at = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? at;
    splitInto(item, area.value.slice(0, at) + text + area.value.slice(end));
  });

  const grip = h(
    "button",
    { type: "button", class: "grip", "aria-label": t("moveItem"), title: t("moveItem"), disabled: ed.readOnly || null },
    icon("grip"),
  );
  wireDrag(grip, li, item);

  const remove = iconButton("close", t("removeItem"), () => removeItem(item), {
    class: "remove",
    disabled: ed.readOnly,
  });
  li.append(grip, box, area, remove);
  return li;
}

/** Turns an item whose text has several lines into one item a line ("paste as checklist"). */
function splitInto(item, text) {
  remember(true);
  const lines = textToItems(text);
  if (!lines.length) {
    item.text = "";
    drawList();
    focusItem(item.key, 0);
    changed(["body"]);
    return;
  }
  const index = ed.items.indexOf(item);
  const made = lines.map((line, i) =>
    i === 0 ? Object.assign(item, { text: line.text, done: item.done || line.done }) : itemOf(line),
  );
  ed.items.splice(index, 1, ...made);
  drawList();
  changed(["body"]);
  focusItem(made[made.length - 1].key, "end");
  if (made.length > 1) snack(t("pastedItems", { n: made.length }));
}

/** Dragging an item by its handle; a tap on the handle opens the move menu instead, and arrow keys move it. */
function wireDrag(grip, li, item) {
  let drag = null;
  grip.addEventListener("pointerdown", (e) => {
    if (ed.readOnly) return;
    e.preventDefault();
    const rows = [...li.parentNode.children].filter((r) => r.classList.contains("item"));
    const rect = (r) => (r.getBoundingClientRect ? r.getBoundingClientRect() : { top: 0, height: 48 });
    drag = {
      y: e.clientY,
      moved: false,
      rows,
      from: rows.indexOf(li),
      to: rows.indexOf(li),
      height: rect(li).height || 48,
      centres: rows.map((r) => rect(r).top + (rect(r).height || 48) / 2),
    };
    if (grip.setPointerCapture) grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      li.classList.add("dragging");
      haptic("light");
    }
    li.style.transform = "translateY(" + dy + "px)";
    const centre = drag.centres[drag.from] + dy;
    drag.to = drag.centres.filter((c, i) => i !== drag.from && c < centre).length;
    drag.rows.forEach((r, i) => {
      if (r === li) return;
      let shift = 0;
      if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.height;
      if (drag.from > drag.to && i < drag.from && i >= drag.to) shift = drag.height;
      r.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  });
  const settle = () => {
    if (drag) drag.rows.forEach((r) => (r.style.transform = ""));
    li.classList.remove("dragging");
  };
  grip.addEventListener("pointerup", () => {
    if (!drag) return;
    const { moved, to, from } = drag;
    settle();
    drag = null;
    if (!moved) moveMenu(item);
    else if (to !== from) moveItem(item, to);
  });
  grip.addEventListener("pointercancel", () => {
    settle();
    drag = null;
  });
  grip.addEventListener("click", (e) => {
    // A keyboard's Enter or Space on the handle (a pointer tap is handled above).
    if (e.detail === 0) moveMenu(item);
  });
  grip.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    moveItem(item, groupOf(item).indexOf(item) + (e.key === "ArrowUp" ? -1 : 1));
    const again = ed.dom.listWrap.querySelector('[data-key="' + item.key + '"] .grip');
    if (again) again.focus();
  });
}

function moveMenu(item) {
  const group = groupOf(item);
  const at = group.indexOf(item);
  menu(item.text || t("emptyItem"), [
    { id: "up", icon: "arrowUp", text: t("moveUp"), hidden: at <= 0 },
    { id: "down", icon: "arrowDown", text: t("moveDown"), hidden: at >= group.length - 1 },
    { id: "top", icon: "toTop", text: t("moveTop"), hidden: at <= 1 },
    { id: "bottom", icon: "toBottom", text: t("moveBottom"), hidden: at >= group.length - 2 },
    { id: "remove", icon: "trash", text: t("removeItem"), danger: true },
  ]).then((id) => {
    if (!ed) return;
    if (id === "up") moveItem(item, at - 1);
    else if (id === "down") moveItem(item, at + 1);
    else if (id === "top") moveItem(item, 0);
    else if (id === "bottom") moveItem(item, group.length - 1);
    else if (id === "remove") removeItem(item);
  });
}

function drawList() {
  const wrap = ed && ed.dom.listWrap;
  if (!wrap) return;
  wrap.textContent = "";
  const toBottom = tickedToBottom();
  const open = toBottom ? ed.items.filter((i) => !i.done) : ed.items;
  const ticked = toBottom ? ed.items.filter((i) => i.done) : [];
  const addRow = ed.readOnly
    ? null
    : h(
        "button",
        { type: "button", class: "add-item", onClick: () => addItem(null, "", 0) },
        icon("add"),
        h("span", { text: t("addItem") }),
      );
  if (addRow && newAtTop()) wrap.appendChild(addRow);
  wrap.appendChild(h("ul", { class: "items", "aria-label": t("listItems") }, open.map(itemRow)));
  if (addRow && !newAtTop()) wrap.appendChild(addRow);
  if (ticked.length) {
    wrap.appendChild(
      h(
        "button",
        {
          type: "button",
          class: "ticked-toggle" + (ed.showTicked ? " open" : ""),
          "aria-expanded": String(ed.showTicked),
          onClick: () => {
            ed.showTicked = !ed.showTicked;
            drawList();
          },
        },
        icon("chevronDown"),
        h("span", { text: t("tickedItems", { n: ticked.length }) }),
      ),
    );
    if (ed.showTicked)
      wrap.appendChild(h("ul", { class: "items ticked", "aria-label": t("tickedItemsList") }, ticked.map(itemRow)));
  }
  if (wrap.querySelectorAll) for (const a of wrap.querySelectorAll(".item-text")) autosize(a);
  updateMeta();
}

// ---------------------------------------------------------------- photos

function drawPhotos() {
  const wrap = ed.dom.photos;
  if (!wrap) return;
  wrap.textContent = "";
  wrap.className = "photos n" + Math.min(ed.photos.length, 3);
  ed.photos.forEach((id, i) => {
    const img = h("img", { alt: "", decoding: "async" });
    ctx.store.thumbUrl(id).then((url) => {
      if (url) img.src = url;
    });
    wrap.appendChild(
      h(
        "button",
        { type: "button", class: "photo", "aria-label": t("openPhoto", { n: i + 1 }), onClick: () => viewPhoto(i) },
        img,
      ),
    );
  });
}

async function addPhotos(source) {
  const s = ed;
  let files;
  try {
    files = await capture(source);
  } catch (error) {
    failed(error);
    return;
  }
  if (!files || !files.length || ed !== s) return;
  try {
    const ids = await storePhotos(files);
    if (ed !== s) return;
    s.photos = [...s.photos, ...ids];
    drawPhotos();
    changed(["photos"]);
    save(s);
  } catch (error) {
    failed(error);
  }
}

/** The photo viewer: the photo at full size, with Share, Save and Remove. */
function viewPhoto(index) {
  const s = ed;
  let at = index;
  dialog(
    (close) => {
      const img = h("img", { class: "viewer-img", alt: "" });
      const count = h("p", { class: "viewer-count", "aria-live": "polite" });
      const show = async () => {
        const total = s.photos.length;
        count.textContent = total > 1 ? t("photoOf", { n: at + 1, total }) : "";
        img.alt = t("photoOf", { n: at + 1, total });
        const thumb = await ctx.store.thumbUrl(s.photos[at]);
        if (thumb) img.src = thumb;
        const full = await ctx.store.photo(s.photos[at]);
        if (full) img.src = dataUrl(full);
      };
      show();
      const file = async () => {
        const value = await ctx.store.photo(s.photos[at]);
        return value ? fileOf(value, "photo-" + (at + 1) + ".jpg") : null;
      };
      const zapli = ctx.zapli;
      const live = ctx.store.live && zapli;
      const step = (d) => {
        at = (at + d + s.photos.length) % s.photos.length;
        show();
      };
      const removePhoto = () => {
        const id = s.photos[at];
        const before = [...s.photos];
        s.photos = s.photos.filter((p) => p !== id);
        if (ed === s) {
          drawPhotos();
          changed(["photos"]);
          save(s);
        }
        close();
        snack(t("photoRemoved"), {
          label: t("undo"),
          run: () => {
            s.photos = before;
            if (ed === s) {
              drawPhotos();
              changed(["photos"]);
            } else s.dirty.add("photos");
            save(s);
          },
        });
        // The picture itself goes once Undo is no longer offered; the next start tidies up if the app closes first.
        setTimeout(() => {
          if (!s.photos.includes(id) && !ctx.store.all.some((n) => n._photos.includes(id))) ctx.store.deletePhoto(id);
        }, 7000);
      };
      const tools = [
        iconButton("close", t("close"), () => close()),
        h("span", { class: "spacer" }),
        s.photos.length > 1 ? iconButton("chevronLeft", t("previousPhoto"), () => step(-1)) : null,
        s.photos.length > 1 ? iconButton("chevronRight", t("nextPhoto"), () => step(1)) : null,
        live && zapli.supports("share")
          ? iconButton("share", t("share"), async () => {
              try {
                const f = await file();
                if (f) await zapli.share({ files: [f] });
              } catch (error) {
                failed(error);
              }
            })
          : null,
        live && zapli.supports("files.save")
          ? iconButton("exportFile", t("savePhoto"), async () => {
              try {
                const f = await file();
                if (f && (await zapli.files.save({ name: f.name, type: f.type, data: f }))) snack(t("photoSaved"));
              } catch (error) {
                failed(error);
              }
            })
          : null,
        s.readOnly ? null : iconButton("trash", t("removePhoto"), removePhoto),
      ];
      return [h("div", { class: "viewer-bar" }, tools), h("div", { class: "viewer-stage" }, img), count];
    },
    { className: "viewer", label: t("photo") },
  );
}

// ---------------------------------------------------------------- meta: labels, reminder, footer

function drawChips() {
  const wrap = ed.dom.chips;
  if (!wrap) return;
  wrap.textContent = "";
  if (ed.remindAt) {
    const next = nextReminder(ed.remindAt, ed.repeat, ctx.now());
    const at = next || new Date(ed.remindAt);
    wrap.appendChild(
      h(
        "button",
        {
          type: "button",
          class: "meta-chip" + (next ? "" : " past"),
          onClick: openReminder,
          "aria-label": t("reminderState", { when: reminderWhen(at) }),
        },
        icon(ed.repeat ? "repeat" : "bell"),
        h("span", { text: reminderWhen(at) }),
      ),
    );
  }
  for (const name of ed.labels) {
    wrap.appendChild(
      h(
        "button",
        { type: "button", class: "meta-chip", onClick: openLabels, "aria-label": t("labelNamed", { name }) },
        icon("label"),
        h("span", { text: name }),
      ),
    );
  }
}

function updateMeta() {
  if (!ed || !ed.dom.meta) return;
  const parts = [];
  if (ed.editedAt) parts.push(t("editedAt", { when: shortWhen(ed.editedAt) }));
  if (ed.kind === "list") {
    const filled = ed.items.filter((i) => i.text.trim());
    if (filled.length) parts.push(t("itemsDone", { done: filled.filter((i) => i.done).length, total: filled.length }));
  } else parts.push(t("wordCount", { n: noteStats(noteOf(ed)).words }));
  ed.dom.meta.textContent = parts.join(" · ");
}

async function openReminder() {
  if (!ed || ed.readOnly) return;
  const s = ed;
  const note = await ensureSaved();
  if (!note) return;
  await act.reminderSheet(note);
  const fresh = s.id && ctx.store.get(s.id);
  if (fresh && ed === s) {
    s.remindAt = fresh.remindAt || null;
    s.repeat = fresh.repeat || null;
    drawChips();
    drawBar();
  }
}

async function openLabels() {
  if (!ed || ed.readOnly) return;
  const s = ed;
  const note = await ensureSaved();
  if (!note) return;
  await act.labelSheet([note], {
    onChange: () => {
      const fresh = ctx.store.get(s.id);
      if (fresh) s.labels = labelsOf(fresh.labels);
      if (ed === s) drawChips();
    },
  });
}

async function openColour() {
  const s = ed;
  const color = await act.pickColour(s.color);
  if (!color || color === s.color || ed !== s) return;
  s.color = color;
  applyTint();
  changed(["color"]);
}

function applyTint() {
  const root = ed.dom.root;
  root.className = root.className.replace(/\btint-\S+/g, "").trim() + " tint-" + ed.color;
  tintPage(ed.color);
}

/** The whole page takes the note's colour while it is open, the bars and the edges behind them too. */
function tintPage(color) {
  const body = document.body;
  body.className = body.className
    .replace(/\btint-\S+/g, "")
    .replace(/\btinted\b/g, "")
    .trim();
  if (color) body.classList.add("tinted", "tint-" + color);
}

// ---------------------------------------------------------------- bars and menus

function drawBar() {
  const bar = ed.dom.bar;
  if (!bar) return;
  bar.textContent = "";
  bar.appendChild(iconButton("back", t("back"), () => ctx.back()));
  bar.appendChild(h("span", { class: "spacer" }));
  if (ed.readOnly) {
    bar.appendChild(iconButton("restore", t("restore"), restoreFromTrash));
    bar.appendChild(iconButton("trash", t("deleteForever"), deleteFromTrash));
    return;
  }
  bar.appendChild(
    iconButton(ed.pinned ? "pinOn" : "pin", ed.pinned ? t("unpin") : t("pin"), togglePin, {
      pressed: ed.pinned,
      class: ed.pinned ? "on" : "",
    }),
  );
  bar.appendChild(
    iconButton(ed.remindAt ? "bell" : "bellPlus", t("remindMe"), openReminder, { class: ed.remindAt ? "on" : "" }),
  );
  bar.appendChild(
    iconButton(ed.archived ? "unarchive" : "archive", ed.archived ? t("unarchive") : t("archive"), toggleArchive),
  );
  bar.appendChild(iconButton("more", t("moreOptions"), moreMenu));
}

function togglePin() {
  ed.pinned = !ed.pinned;
  if (ed.pinned) ed.archived = false;
  haptic("light");
  drawBar();
  changed(["pinned", "archived"]);
  snack(t(ed.pinned ? "pinnedNotes" : "unpinnedNotes", { n: 1 }));
}

async function toggleArchive() {
  const s = ed;
  const archiving = !s.archived;
  if (archiving && !s.id && isEmptyNote(noteOf(s))) {
    ctx.back();
    return;
  }
  s.archived = archiving;
  if (archiving) s.pinned = false;
  changed(["archived", "pinned"]);
  await ensureSaved();
  const id = s.id;
  if (archiving) {
    if (ed === s) ctx.back();
    snack(t("archivedNotes", { n: 1 }), {
      label: t("undo"),
      run: () => id && ctx.store.update(id, { archived: false }).catch(failed),
    });
  } else {
    if (ed === s) drawBar();
    snack(t("unarchivedNotes", { n: 1 }));
  }
}

async function trashThis() {
  const s = ed;
  if (!s.id) {
    s.dirty.clear();
    s.discarded = true;
    clearDraft();
    ctx.back();
    return;
  }
  await flush(s);
  const id = s.id;
  s.discarded = true;
  try {
    await ctx.store.update(id, { trashedAt: isoLocal(ctx.now()), pinned: false });
    if (ed === s) ctx.back();
    snack(t("movedToTrash", { n: 1 }), {
      label: t("undo"),
      run: () => ctx.store.update(id, { trashedAt: null }).catch(failed),
    });
  } catch (error) {
    s.discarded = false;
    failed(error);
  }
}

async function restoreFromTrash() {
  try {
    await ctx.store.update(ed.id, { trashedAt: null });
    snack(t("restoredNotes", { n: 1 }));
    ctx.refresh(true);
  } catch (error) {
    failed(error);
  }
}

async function deleteFromTrash() {
  const s = ed;
  const note = ctx.store.get(s.id);
  if (note && (await act.deleteForever([note]))) {
    s.discarded = true;
    if (ed === s) ctx.back();
  }
}

function convert() {
  remember(true);
  if (ed.kind === "list") {
    ed.text = itemsToText(ed.items);
    ed.kind = "text";
  } else {
    ed.items = textToItems(ed.text).map(itemOf);
    ed.kind = "list";
  }
  drawContent();
  changed(["kind", "body"]);
  focusBodyStart();
}

function moreMenu() {
  const s = ed;
  const list = s.kind === "list";
  const ticked = list && s.items.some((i) => i.done);
  menu(
    null,
    [
      { id: "labels", icon: "label", text: t("labels") },
      { id: "convert", icon: list ? "textLines" : "checklist", text: list ? t("hideCheckboxes") : t("showCheckboxes") },
      { id: "untick", icon: "checkbox", text: t("untickAll"), hidden: !ticked },
      { id: "clearTicked", icon: "sweep", text: t("deleteTicked"), hidden: !ticked },
      { id: "copy", icon: "copy", text: t("makeCopy") },
      { id: "share", icon: "share", text: t("share") },
      { id: "info", icon: "info", text: t("details") },
      { id: "trash", icon: "trash", text: t("delete"), danger: true },
    ],
    (id) => {
      // Sharing needs this tap: Zapli opens the share sheet only from one.
      if (id === "share") {
        flush(s);
        act.shareNote(noteOf(s));
      }
    },
  ).then(async (id) => {
    if (!id || ed !== s) return;
    if (id === "labels") openLabels();
    else if (id === "convert") convert();
    else if (id === "untick") {
      remember(true);
      s.items.forEach((i) => (i.done = false));
      drawList();
      changed(["body"]);
      snack(t("untickedAll"), { label: t("undo"), run: undo });
    } else if (id === "clearTicked") {
      remember(true);
      const n = s.items.filter((i) => i.done).length;
      s.items = s.items.filter((i) => !i.done);
      drawList();
      changed(["body"]);
      snack(t("deletedTicked", { n }), { label: t("undo"), run: undo });
    } else if (id === "copy") {
      const note = await ensureSaved();
      if (note) act.copyNote({ ...note, ...noteOf(s) }).catch(failed);
    } else if (id === "info") details();
    else if (id === "trash") trashThis();
  });
}

function details() {
  const note = noteOf(ed);
  const stored = ed.id ? ctx.store.get(ed.id) : null;
  const stats = noteStats(note);
  const rows = [
    [t("words"), String(stats.words)],
    [t("characters"), String(stats.chars)],
  ];
  if (ed.kind === "list") {
    const filled = ed.items.filter((i) => i.text.trim());
    rows.push([t("items"), t("itemsDone", { done: filled.filter((i) => i.done).length, total: filled.length })]);
  }
  if (ed.photos.length) rows.push([t("photos"), String(ed.photos.length)]);
  if (stored) {
    rows.push([t("createdLabel"), longWhen(new Date(createdMs(stored)))]);
    rows.push([t("editedLabel"), longWhen(new Date(editedMs(stored)))]);
  }
  sheet(t("details"), () =>
    h(
      "dl",
      { class: "details" },
      rows.map(([k, v]) => h("div", { class: "detail-row" }, h("dt", { text: k }), h("dd", { text: v }))),
    ),
  );
}

function toolsBar() {
  const sources = photoSources();
  const addMenu = () =>
    menu(
      null,
      [
        { id: "camera", icon: "camera", text: t("takePhoto"), hidden: !sources.camera },
        { id: "pick", icon: "image", text: t("choosePhotos"), hidden: !sources.pick },
        {
          id: "convert",
          icon: ed.kind === "list" ? "textLines" : "checklist",
          text: ed.kind === "list" ? t("hideCheckboxes") : t("showCheckboxes"),
        },
        { id: "labels", icon: "label", text: t("labels") },
      ],
      (id) => {
        // The camera and the photo picker open only from this tap.
        if (id === "camera" || id === "pick") addPhotos(id);
      },
    ).then((id) => {
      if (id === "convert") convert();
      else if (id === "labels") openLabels();
    });
  ed.dom.undo = iconButton("undo", t("undoEdit"), undo, { disabled: true });
  ed.dom.redo = iconButton("redo", t("redoEdit"), redo, { disabled: true });
  ed.dom.meta = h("p", { class: "tools-meta" });
  return h(
    "footer",
    { class: "tools", role: "toolbar", "aria-label": t("noteTools") },
    iconButton("add", t("addToNote"), addMenu),
    iconButton("palette", t("colour"), openColour),
    ed.dom.undo,
    ed.dom.redo,
    ed.dom.meta,
  );
}

// ---------------------------------------------------------------- the screen

function drawContent() {
  const wrap = ed.dom.content;
  wrap.textContent = "";
  wrap.appendChild(titleInput());
  if (ed.kind === "list") {
    ed.dom.body = null;
    ed.dom.listWrap = h("div", { class: "checklist" });
    wrap.appendChild(ed.dom.listWrap);
    drawList();
  } else {
    ed.dom.listWrap = null;
    wrap.appendChild(bodyInput());
  }
  updateMeta();
  const s = ed;
  requestAnimationFrame(() => {
    if (ed !== s) return;
    if (s.dom.title) autosize(s.dom.title);
    if (s.dom.body) autosize(s.dom.body);
  });
}

function startState(route) {
  const isNew = route.name === "new";
  const note = isNew ? null : ctx.store.get(route.id);
  if (!isNew && !note) return null;
  const s = {
    id: note ? note.id : null,
    title: note ? note.title || "" : "",
    kind: isNew ? (route.id === "list" ? "list" : "text") : note.kind,
    text: "",
    items: [],
    color: note ? note.color || "none" : "none",
    labels: note ? labelsOf(note.labels) : labelsOf(route.params.get("label") || ""),
    photos: note ? photoIds(note.photos) : [],
    pinned: note ? Boolean(note.pinned) : false,
    archived: note ? Boolean(note.archived) : false,
    remindAt: note ? note.remindAt || null : null,
    repeat: note ? note.repeat || null : null,
    readOnly: Boolean(note && note.trashedAt),
    trashedAt: note ? note.trashedAt : null,
    editedAt: note ? new Date(editedMs(note)) : null,
    dirty: new Set(),
    history: [],
    future: [],
    lastTyped: 0,
    showTicked: false,
    timer: null,
    saving: null,
    again: false,
    force: false,
    dom: {},
    isNew,
  };
  const body = note ? note.body || "" : "";
  if (s.kind === "list") s.items = parseItems(body).map(itemOf);
  else s.text = body;

  // A copy typed before a reload that the store had not saved yet.
  const draft = readDraft();
  if (draft && !s.readOnly) {
    const mine = note
      ? draft.id === note.id && draft.at > editedMs(note)
      : draft.id === "new" && Date.now() - draft.at < 86400000;
    if (mine) {
      s.title = draft.title || "";
      s.kind = draft.kind === "list" ? "list" : "text";
      if (s.kind === "list") s.items = parseItems(draft.body).map(itemOf);
      else s.text = draft.body || "";
      s.dirty = new Set(["title", "body", "kind"]);
    }
  }
  if (s.kind === "list" && !s.items.length && !s.readOnly) s.items.push(itemOf({ text: "", done: false }));
  return s;
}

export function render(route) {
  const s = startState(route);
  if (!s) {
    ed = null;
    return h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "bar" },
        iconButton("back", t("back"), () => ctx.back()),
      ),
      h(
        "div",
        { class: "empty" },
        h("h2", { class: "empty-title", text: t("noteGone") }),
        h("p", { class: "empty-text", text: t("noteGoneText") }),
      ),
    );
  }
  ed = s;
  tintPage(s.color);
  const root = h("div", { class: "screen editor tint-" + s.color + (s.readOnly ? " read-only" : "") });
  s.dom.root = root;
  s.dom.bar = h("header", { class: "bar editor-bar" });
  drawBar();
  root.appendChild(s.dom.bar);

  const page = h("div", { class: "editor-page" });
  if (s.readOnly) {
    page.appendChild(
      h(
        "div",
        { class: "info-card warn" },
        icon("trash"),
        h("p", { text: t("inTrashBanner", { n: trashDaysLeft(s.trashedAt, ctx.now()) }) }),
        button(t("restore"), restoreFromTrash, "text"),
      ),
    );
  }
  s.dom.photos = h("div", { class: "photos" });
  page.appendChild(s.dom.photos);
  drawPhotos();
  s.dom.content = h("div", { class: "editor-content" });
  page.appendChild(s.dom.content);
  drawContent();
  s.dom.chips = h("div", { class: "meta-chips" });
  page.appendChild(s.dom.chips);
  drawChips();
  root.appendChild(page);
  if (!s.readOnly) root.appendChild(toolsBar());
  updateUndo();
  updateMeta();
  if (s.dirty.size) changed([...s.dirty]);
  return root;
}

/** After the editor is on the page: a new note gets the keyboard at once. */
export function after() {
  if (!ed || ed.readOnly) return;
  if (ed.dom.title) autosize(ed.dom.title);
  if (ed.dom.body) autosize(ed.dom.body);
  if (ed.isNew && !ed.id) focusBodyStart();
}

/** The editor keeps itself while the data changes underneath: what is typed wins. */
export function keep() {
  return true;
}

/** Leaving the editor: save what is left, and put away a note that ended up empty. */
export function leave() {
  const s = ed;
  ed = null;
  tintPage(null);
  if (!s) return;
  clearTimeout(s.timer);
  if (s.discarded || s.readOnly) {
    clearDraft();
    return;
  }
  if (isEmptyNote(noteOf(s)) && !s.remindAt) {
    clearDraft();
    if (!s.id) return;
    const id = s.id;
    const settle = s.saving || Promise.resolve();
    settle.then(() => {
      // A note made only so a sheet could open goes quietly; one that had words in it goes to the trash, with Undo.
      if (s.createdHere && s.force) return ctx.store.remove(id).catch(() => {});
      return ctx.store
        .update(id, { trashedAt: isoLocal(ctx.now()), pinned: false })
        .then(() =>
          snack(t("emptyDiscarded"), {
            label: t("undo"),
            run: () => ctx.store.update(id, { trashedAt: null }).catch(failed),
          }),
        )
        .catch(() => {});
    });
    return;
  }
  save(s);
}

/** The app goes to the background: save now. */
export function pause() {
  return flush(ed);
}
