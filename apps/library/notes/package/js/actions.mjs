// What can be done to notes from any screen: the trash and the archive with Undo, pins, colours, labels,
// reminders, copies and sharing. Each step that needs the user's tap (sharing, the camera) is started from one.

import { ctx, h, t, snack, failed, sheet, button, confirm, haptic, chip, reminderWhen, timeOfDay } from "./ui.mjs";
import { icon } from "./icons.mjs";
import {
  COLORS,
  isoLocal,
  labelsOf,
  labelsText,
  cleanLabel,
  sameLabel,
  reminderPresets,
  repeatRule,
  repeatKind,
  REPEATS,
  nextReminder,
  shareText,
  newId,
  photosText,
} from "./model.mjs";
import { fileOf } from "./photos.mjs";

const store = () => ctx.store;

async function each(notes, patchOf) {
  for (const note of notes) {
    const patch = patchOf(note);
    if (patch) await store().update(note.id, patch);
  }
}

/** Moves notes to the trash, with Undo. */
export async function trashNotes(notes) {
  if (!notes.length) return;
  const at = isoLocal(ctx.now());
  const before = notes.map((n) => ({ id: n.id, pinned: Boolean(n.pinned) }));
  try {
    await each(notes, () => ({ trashedAt: at, pinned: false }));
    haptic("light");
    snack(t("movedToTrash", { n: notes.length }), {
      label: t("undo"),
      run: () =>
        Promise.all(before.map((b) => store().update(b.id, { trashedAt: null, pinned: b.pinned }))).catch(failed),
    });
  } catch (error) {
    failed(error);
  }
}

/** Archives notes, or brings them back from the archive, with Undo. */
export async function archiveNotes(notes, on = true) {
  if (!notes.length) return;
  const before = notes.map((n) => ({ id: n.id, archived: Boolean(n.archived), pinned: Boolean(n.pinned) }));
  try {
    await each(notes, () => (on ? { archived: true, pinned: false } : { archived: false }));
    haptic("light");
    snack(t(on ? "archivedNotes" : "unarchivedNotes", { n: notes.length }), {
      label: t("undo"),
      run: () =>
        Promise.all(before.map((b) => store().update(b.id, { archived: b.archived, pinned: b.pinned }))).catch(failed),
    });
  } catch (error) {
    failed(error);
  }
}

/** Pins notes, or unpins them when every one is pinned already. */
export async function togglePins(notes) {
  const pin = !notes.every((n) => n.pinned);
  try {
    await each(notes, () => (pin ? { pinned: true, archived: false } : { pinned: false }));
    haptic("light");
    snack(t(pin ? "pinnedNotes" : "unpinnedNotes", { n: notes.length }));
  } catch (error) {
    failed(error);
  }
  return pin;
}

/** Brings notes back from the trash. */
export async function restoreNotes(notes) {
  try {
    await each(notes, () => ({ trashedAt: null }));
    snack(t("restoredNotes", { n: notes.length }));
  } catch (error) {
    failed(error);
  }
}

/** Deletes notes for good after asking. */
export async function deleteForever(notes) {
  const ok = await confirm({
    title: t("deleteForeverTitle", { n: notes.length }),
    message: t("deleteForeverText"),
    ok: t("deleteForever"),
    danger: true,
  });
  if (!ok) return false;
  try {
    for (const note of notes) await store().remove(note.id);
    snack(t("deletedNotes", { n: notes.length }));
    return true;
  } catch (error) {
    failed(error);
    return false;
  }
}

/** The colour swatches; `onPick(color)` runs on a tap. */
export function swatches(current, onPick) {
  return h(
    "div",
    { class: "swatches", role: "radiogroup", "aria-label": t("colour") },
    COLORS.map((color) =>
      h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "swatch tint-" + color + (color === current ? " on" : ""),
          "aria-checked": String(color === current),
          "aria-label": t("color_" + color),
          title: t("color_" + color),
          onClick: () => onPick(color),
        },
        color === "none" ? icon("close") : null,
        color === current ? h("span", { class: "swatch-check" }, icon("check")) : null,
      ),
    ),
  );
}

/** The colour sheet. Resolves with the chosen colour, or null. */
export function pickColour(current) {
  return sheet(t("colour"), (close) => swatches(current, (color) => close(color)));
}

/** Gives notes a colour. */
export async function colourNotes(notes, color) {
  try {
    await each(notes, (n) => (n.color === color ? null : { color, edited: isoLocal(ctx.now()) }));
  } catch (error) {
    failed(error);
  }
}

/**
 * The labels sheet for one note or several: a field that finds or makes a label, and every label with a box.
 * Ticking applies at once. Resolves when the sheet closes.
 */
export function labelSheet(notes, { onChange } = {}) {
  return sheet(t("labels"), () => {
    const input = h("input", {
      type: "text",
      class: "find-label",
      placeholder: t("findOrCreateLabel"),
      "aria-label": t("findOrCreateLabel"),
      autocomplete: "off",
      maxlength: "50",
      enterkeyhint: "done",
    });
    const list = h("ul", { class: "label-list" });

    const state = (name) => {
      const count = notes.filter((n) => labelsOf(n.labels).some((l) => sameLabel(l, name))).length;
      return count === 0 ? "off" : count === notes.length ? "on" : "some";
    };

    const apply = async (name, on) => {
      const fresh = notes.map((n) => store().get(n.id) || n);
      try {
        for (const note of fresh) {
          const now = labelsOf(note.labels);
          const has = now.some((l) => sameLabel(l, name));
          if (on && !has) await store().update(note.id, { labels: labelsText([...now, name]) });
          if (!on && has)
            await store().update(note.id, { labels: labelsText(now.filter((l) => !sameLabel(l, name))) || null });
        }
        if (on) await store().ensureLabels([name]);
        notes = notes.map((n) => store().get(n.id) || n);
        if (onChange) onChange();
      } catch (error) {
        failed(error);
      }
      draw();
    };

    const draw = () => {
      const query = cleanLabel(input.value);
      const names = store().labels;
      const shown = query ? names.filter((n) => n.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : names;
      list.textContent = "";
      if (query && !names.some((n) => sameLabel(n, query))) {
        list.appendChild(
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                class: "label-row create",
                onClick: () => apply(query, true).then(() => (input.value = "")),
              },
              icon("add"),
              h("span", { text: t("createLabel", { name: query }) }),
            ),
          ),
        );
      }
      for (const name of shown) {
        const s = state(name);
        list.appendChild(
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                role: "checkbox",
                "aria-checked": s === "some" ? "mixed" : String(s === "on"),
                class: "label-row " + s,
                onClick: () => apply(name, s !== "on"),
              },
              icon("label"),
              h("span", { class: "label-name", text: name }),
              h(
                "span",
                { class: "tick" },
                s === "on" ? icon("check") : s === "some" ? h("span", { class: "dash" }) : null,
              ),
            ),
          ),
        );
      }
      if (!names.length && !query) list.appendChild(h("li", { class: "help pad", text: t("noLabelsYet") }));
    };

    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const name = cleanLabel(input.value);
      if (!name) return;
      const existing = store().labels.find((n) => sameLabel(n, name)) || name;
      apply(existing, state(existing) !== "on").then(() => {
        input.value = "";
        draw();
      });
    });
    draw();
    return [h("div", { class: "find-label-wrap" }, icon("search"), input), list];
  });
}

const REPEAT_KEYS = {
  none: "repeatNone",
  daily: "repeatDaily",
  weekdays: "repeatWeekdays",
  weekly: "repeatWeekly",
  monthly: "repeatMonthly",
  yearly: "repeatYearly",
  custom: "repeatCustom",
};

/** "Repeats every week" and the like, for a stored rule. */
export function repeatText(rule) {
  return t(REPEAT_KEYS[repeatKind(rule)] || "repeatCustom");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateValue(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function timeValue(d) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/** Asks Zapli (once) whether reminders may show notifications; from the tap that saves a reminder. */
async function askForNotifications() {
  try {
    if (typeof Notification === "function" && Notification.permission === "default")
      await Notification.requestPermission();
    if (typeof Notification === "function" && Notification.permission === "denied" && ctx.store.live) {
      snack(t("notificationsOff"), {
        label: t("permissions"),
        run: () => ctx.zapli && ctx.zapli.ui && ctx.zapli.ui.openSettings().catch(() => {}),
      });
    }
  } catch {
    // The reminder is saved either way.
  }
}

/** The reminder sheet for a note: quick times, a date and time of your own, and how it repeats. */
export function reminderSheet(note) {
  const now = ctx.now();
  const current = note.remindAt ? new Date(note.remindAt) : null;
  const next = current ? nextReminder(note.remindAt, note.repeat, now) : null;
  let repeat = note.repeat ? repeatKind(note.repeat) : "none";
  if (repeat === "custom") repeat = "none";
  const start = next || (current && current > now ? current : reminderPresets(now)[0].at);

  return sheet(t("remindMe"), (close) => {
    const error = h("p", { class: "error", role: "alert" });
    const date = h("input", { type: "date", value: dateValue(start), required: true });
    const time = h("input", { type: "time", value: timeValue(start), required: true });
    date.id = "remind-date";
    time.id = "remind-time";

    const save = async (at) => {
      if (!at || Number.isNaN(at.getTime())) {
        error.textContent = t("pickDateAndTime");
        return;
      }
      if (repeat === "none" && at.getTime() <= ctx.now().getTime()) {
        error.textContent = t("pickFutureTime");
        return;
      }
      const ask = askForNotifications();
      try {
        await store().update(note.id, {
          remindAt: isoLocal(at),
          repeat: repeatRule(repeat, at) || null,
          reminded: null,
        });
        haptic("light");
        snack(
          t("reminderSet", { when: reminderWhen(nextReminder(isoLocal(at), repeatRule(repeat, at), ctx.now()) || at) }),
        );
        close({ at });
      } catch (e) {
        failed(e);
      }
      await ask;
    };

    const presets = reminderPresets(now).map((p) =>
      h(
        "button",
        { type: "button", class: "preset", onClick: () => save(p.at) },
        icon("clock"),
        h("span", { class: "preset-text", text: t("preset_" + p.id) }),
        h("span", { class: "preset-hint", text: p.id === "nextWeek" ? reminderWhen(p.at, now) : timeOfDay(p.at) }),
      ),
    );

    const repeatRow = h("div", { class: "chip-row wrap", role: "radiogroup", "aria-label": t("repeat") });
    const drawRepeat = () => {
      repeatRow.textContent = "";
      for (const kind of REPEATS) {
        const c = chip(t(REPEAT_KEYS[kind]), kind === repeat, () => {
          repeat = kind;
          drawRepeat();
        });
        c.setAttribute("role", "radio");
        c.setAttribute("aria-checked", String(kind === repeat));
        c.removeAttribute("aria-pressed");
        repeatRow.appendChild(c);
      }
    };
    drawRepeat();

    const parts = [];
    if (current) {
      parts.push(
        h(
          "p",
          { class: "current-reminder" },
          icon(note.repeat ? "repeat" : "bell"),
          h("span", {
            text: next
              ? t("currentReminder", { when: reminderWhen(next) }) +
                (note.repeat ? " · " + repeatText(note.repeat) : "")
              : t("pastReminder", { when: reminderWhen(current) }),
          }),
        ),
      );
    }
    parts.push(h("div", { class: "presets" }, presets));
    parts.push(
      h(
        "div",
        { class: "when-row" },
        h("div", { class: "field" }, h("label", { for: date.id, text: t("date") }), date),
        h("div", { class: "field" }, h("label", { for: time.id, text: t("time") }), time),
      ),
    );
    parts.push(h("p", { class: "field-label", text: t("repeat") }), repeatRow, error);
    parts.push(
      h(
        "div",
        { class: "dialog-actions" },
        current
          ? button(
              t("removeReminder"),
              async () => {
                try {
                  await store().update(note.id, { remindAt: null, repeat: null, reminded: null });
                  snack(t("reminderRemoved"));
                  close({ removed: true });
                } catch (e) {
                  failed(e);
                }
              },
              "text danger-text",
            )
          : null,
        h("span", { class: "spacer" }),
        button(t("save"), () => {
          const [y, m, d] = date.value.split("-").map(Number);
          const [hh, mm] = time.value.split(":").map(Number);
          save(y && m && d && Number.isFinite(hh) && Number.isFinite(mm) ? new Date(y, m - 1, d, hh, mm) : null);
        }),
      ),
    );
    return parts;
  });
}

/** A copy of a note, its photos copied too. Resolves with the new note. */
export async function copyNote(note) {
  const ids = [];
  for (const id of note._photos) {
    const full = await store().photo(id);
    const thumb = await store().kvGet("thumb:" + id);
    if (!full) continue;
    const copy = newId();
    await store().putPhoto(copy, full, thumb || full);
    ids.push(copy);
  }
  const now = isoLocal(ctx.now());
  const added = await store().add({
    title: note.title,
    body: note.body,
    kind: note.kind,
    color: note.color,
    labels: note.labels,
    photos: ids.length ? photosText(ids) : null,
    created: now,
    edited: now,
  });
  snack(t("copied"));
  return added;
}

/** Sends a note's text (and its photos) to another app. Call it straight from a tap. */
export async function shareNote(note) {
  const text = shareText(note);
  const zapli = ctx.zapli;
  try {
    if (zapli && store().live && zapli.supports("share")) {
      const files = [];
      for (const [i, id] of note._photos.slice(0, 10).entries()) {
        const value = await store().photo(id);
        if (value) files.push(fileOf(value, "photo-" + (i + 1) + ".jpg"));
      }
      await zapli.share({ title: note.title || undefined, text, files: files.length ? files : undefined });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: note.title || undefined, text });
      return;
    }
    // A browser that cannot share: the text in a box to select and copy by hand.
    sheet(t("share"), () => {
      const box = h("textarea", { class: "share-text", readonly: true, rows: "8", "aria-label": t("noteText") });
      box.value = text;
      setTimeout(() => box.select(), 60);
      return [h("p", { class: "help", text: t("copyByHand") }), box];
    });
    return;
  } catch (error) {
    if (error && error.name === "AbortError") return;
    failed(error);
  }
}
