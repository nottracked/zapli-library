// The notes, as a grid or a list: the main screen (pinned notes first), a label's notes, the reminders, the
// archive and the trash. A long press selects notes for the selection bar; in the main screen a sideways swipe
// archives one; the dock at the bottom starts a new note, a checklist or a photo note in one tap.

import { ctx, h, t, iconButton, button, chip, snack, haptic, menu, confirm, failed, askText } from "../ui.mjs";
import { icon } from "../icons.mjs";
import { illustration } from "../illus.mjs";
import { noteCard, watchGrid } from "../cards.mjs";
import { openDrawer } from "../drawer.mjs";
import { sortNotes, nextReminder, sameLabel, isoLocal, photosText, cleanLabel } from "../model.mjs";
import * as act from "../actions.mjs";
import { photoSources, capture, storePhotos } from "../photos.mjs";

const selected = new Set();
let lastScreen = "";
let stopGrids = [];

const MODES = {
  notes: { hash: "#/", title: "navNotes" },
  reminders: { hash: "#/reminders", title: "navReminders" },
  archive: { hash: "#/archive", title: "navArchive" },
  trash: { hash: "#/trash", title: "navTrash" },
  label: { hash: "", title: "" },
};

/** The mode of a route: notes, label, reminders, archive or trash. */
function modeOf(route) {
  if (route.name === "label") return "label";
  return MODES[route.path] ? route.path : "notes";
}

function selecting() {
  return Boolean(history.state && history.state.select) && selected.size > 0;
}

function depth() {
  return (history.state && history.state.depth) || 0;
}

/** When the last long press started a selection: the tap its finger lifts with is not a second choice. */
let selectedAt = 0;

function startSelect(note) {
  selectedAt = Date.now();
  selected.clear();
  selected.add(note.id);
  haptic("medium");
  history.pushState({ depth: depth() + 1, select: true }, "", location.hash);
  ctx.refresh();
}

function toggleSelect(note, fromTap = false) {
  if (fromTap && Date.now() - selectedAt < 600) return;
  if (selected.has(note.id)) selected.delete(note.id);
  else selected.add(note.id);
  haptic("light");
  if (!selected.size) endSelect();
  else ctx.refresh();
}

/** Leaves selection: Back takes the selection's history entry away. */
function endSelect() {
  selected.clear();
  if (history.state && history.state.select) history.back();
  else ctx.refresh();
}

function selectedNotes() {
  return [...selected].map((id) => ctx.store.get(id)).filter(Boolean);
}

/** The notes a mode shows, in their order. */
function notesFor(mode, label) {
  const store = ctx.store;
  const sort = store.ui.sort || "edited";
  const now = ctx.now();
  if (mode === "trash") return [...store.trashed].sort((a, b) => Date.parse(b.trashedAt) - Date.parse(a.trashedAt));
  if (mode === "archive") return sortNotes(store.archived, sort, ctx.locale);
  if (mode === "reminders") {
    return store.all
      .filter((n) => !n.trashedAt && n.remindAt)
      .map((n) => ({ n, next: nextReminder(n.remindAt, n.repeat, now), at: Date.parse(n.remindAt) }))
      .sort((a, b) => {
        if (Boolean(a.next) !== Boolean(b.next)) return a.next ? -1 : 1;
        return a.next ? a.next - b.next : b.at - a.at;
      })
      .map((x) => x.n);
  }
  const list = mode === "label" ? store.active.filter((n) => n._labels.some((l) => sameLabel(l, label))) : store.active;
  return sortNotes(list, sort, ctx.locale);
}

// ---------------------------------------------------------------- bars

function searchPill() {
  return h(
    "button",
    { type: "button", class: "search-pill", onClick: () => ctx.go("#/search") },
    icon("search"),
    h("span", { class: "search-pill-text", text: t("searchNotes") }),
  );
}

function viewToggle() {
  const list = ctx.store.ui.view === "list";
  return iconButton(list ? "grid" : "rows", list ? t("gridView") : t("listView"), () => {
    ctx.store.saveUi({ view: list ? "grid" : "list" });
  });
}

function normalBar(mode, label, notes) {
  const here = mode === "label" ? "#/label/" + encodeURIComponent(label) : MODES[mode].hash;
  const menuButton = iconButton("menu", t("menu"), () => openDrawer(here));
  if (mode === "notes") {
    return h("header", { class: "bar home-bar" }, menuButton, searchPill(), viewToggle());
  }
  const actions = [iconButton("search", t("search"), () => ctx.go("#/search")), viewToggle()];
  if (mode === "label") {
    actions.push(
      iconButton("more", t("moreOptions"), () =>
        menu(label, [
          { id: "rename", icon: "pen", text: t("renameLabel") },
          { id: "delete", icon: "trash", text: t("deleteLabel"), danger: true },
        ]).then((id) => labelAction(id, label)),
      ),
    );
  }
  if (mode === "trash" && notes.length) actions.push(iconButton("sweep", t("emptyTrash"), emptyTrash));
  return h(
    "header",
    { class: "bar" },
    menuButton,
    h("h1", { class: "bar-title", text: mode === "label" ? label : t(MODES[mode].title) }),
    h("div", { class: "bar-actions" }, actions),
  );
}

async function labelAction(id, label) {
  const store = ctx.store;
  if (id === "rename") {
    const name = await askText({
      title: t("renameLabel"),
      label: t("labelName"),
      value: label,
      check: (text) => (!cleanLabel(text) ? t("typeSomething") : null),
    });
    const clean = cleanLabel(name || "");
    if (!clean || clean === label) return;
    try {
      await store.renameLabel(label, clean);
      ctx.replace("#/label/" + encodeURIComponent(clean));
      snack(t("labelRenamed"));
    } catch (error) {
      failed(error);
    }
  } else if (id === "delete") {
    const ok = await confirm({
      title: t("deleteLabelTitle", { name: label }),
      message: t("deleteLabelText"),
      ok: t("delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await store.deleteLabel(label);
      ctx.go("#/");
      snack(t("labelDeleted"));
    } catch (error) {
      failed(error);
    }
  }
}

async function emptyTrash() {
  const n = ctx.store.trashed.length;
  const ok = await confirm({
    title: t("emptyTrashTitle"),
    message: t("emptyTrashText", { n }),
    ok: t("emptyTrash"),
    danger: true,
  });
  if (!ok) return;
  try {
    await ctx.store.run("emptyTrash");
    await ctx.store.sweepPhotos();
    snack(t("trashEmptied"));
  } catch (error) {
    failed(error);
  }
}

function selectionBar(mode) {
  const notes = selectedNotes();
  const actions = [];
  const done = (promise) => Promise.resolve(promise).finally(() => endSelect());
  if (mode === "trash") {
    actions.push(iconButton("restore", t("restore"), () => done(act.restoreNotes(notes))));
    actions.push(
      iconButton("trash", t("deleteForever"), async () => {
        if (await act.deleteForever(notes)) endSelect();
      }),
    );
  } else {
    const allPinned = notes.every((n) => n.pinned);
    if (mode !== "archive") {
      actions.push(
        iconButton(allPinned ? "pinOn" : "pin", allPinned ? t("unpin") : t("pin"), () => done(act.togglePins(notes)), {
          pressed: allPinned,
        }),
      );
    }
    actions.push(iconButton("label", t("labels"), () => act.labelSheet(notes).then(() => ctx.refresh())));
    actions.push(
      mode === "archive"
        ? iconButton("unarchive", t("unarchive"), () => done(act.archiveNotes(notes, false)))
        : iconButton("archive", t("archive"), () => done(act.archiveNotes(notes, true))),
    );
    actions.push(iconButton("trash", t("delete"), () => done(act.trashNotes(notes))));
  }
  const single = notes.length === 1 && mode !== "trash";
  actions.push(
    iconButton("more", t("moreOptions"), () =>
      menu(
        t("selectedCount", { n: notes.length }),
        [
          { id: "colour", icon: "palette", text: t("colour"), hidden: mode === "trash" },
          { id: "all", icon: "checklist", text: t("selectAll") },
          { id: "copy", icon: "copy", text: t("makeCopy"), hidden: !single },
          { id: "share", icon: "share", text: t("share"), hidden: !single },
        ],
        (id) => {
          // Sharing runs inside this tap, so Zapli can open the share sheet.
          if (id === "share") done(act.shareNote(notes[0]));
        },
      ).then(async (id) => {
        if (id === "all") {
          const route = ctx.route();
          for (const n of notesFor(modeOf(route), route.id)) selected.add(n.id);
          ctx.refresh();
        } else if (id === "copy") done(act.copyNote(notes[0]).catch(failed));
        else if (id === "colour") {
          const color = await act.pickColour(notes.length === 1 ? notes[0].color : null);
          if (color) done(act.colourNotes(notes, color));
        }
      }),
    ),
  );
  return h(
    "header",
    { class: "bar selection-bar" },
    iconButton("close", t("endSelection"), endSelect),
    h(
      "p",
      { class: "bar-title selection-count", "aria-live": "polite" },
      h("span", { "aria-hidden": "true", text: String(notes.length) }),
      h("span", { class: "visually-hidden", text: t("selectedCount", { n: notes.length }) }),
    ),
    h("div", { class: "bar-actions" }, actions),
  );
}

// ---------------------------------------------------------------- body

function labelChips(mode, label) {
  const labels = ctx.store.labels;
  if (!labels.length) return null;
  const row = h(
    "div",
    { class: "chip-row scroll", role: "list", "aria-label": t("labels") },
    h(
      "span",
      { role: "listitem" },
      chip(t("allNotes"), mode === "notes", () => mode !== "notes" && ctx.go("#/")),
    ),
    labels.map((name) =>
      h(
        "span",
        { role: "listitem" },
        chip(
          name,
          mode === "label" && sameLabel(name, label),
          () => !(mode === "label" && sameLabel(name, label)) && ctx.go("#/label/" + encodeURIComponent(name)),
          "label",
        ),
      ),
    ),
  );
  return row;
}

const SORTS = [
  ["edited", "sortEdited"],
  ["created", "sortCreated"],
  ["title", "sortTitle"],
];

function countRow(mode, notes) {
  const store = ctx.store;
  const sort = store.ui.sort || "edited";
  const canSort = mode === "notes" || mode === "label" || mode === "archive";
  return h(
    "div",
    { class: "count-row" },
    h("p", { class: "count-text", text: t("noteCount", { n: notes.length }) }),
    canSort
      ? h(
          "button",
          {
            type: "button",
            class: "sort-button",
            onClick: () =>
              menu(
                t("sortBy"),
                SORTS.map(([id, key]) => ({ id, icon: id === sort ? "check" : "sort", text: t(key) })),
              ).then((id) => id && store.saveUi({ sort: id })),
          },
          icon("sort"),
          h("span", { text: t(SORTS.find(([id]) => id === sort)[1]) }),
        )
      : null,
  );
}

function emptyState(mode, label) {
  const spec = {
    notes: ["notes", "emptyNotesTitle", "emptyNotesText"],
    label: ["label", "emptyLabelTitle", "emptyLabelText"],
    reminders: ["reminders", "emptyRemindersTitle", "emptyRemindersText"],
    archive: ["archive", "emptyArchiveTitle", "emptyArchiveText"],
    trash: ["trash", "emptyTrashTitle2", "emptyTrashText2"],
  }[mode];
  return h(
    "div",
    { class: "empty" },
    illustration(spec[0]),
    h("h2", { class: "empty-title", text: t(spec[1], { name: label }) }),
    h("p", { class: "empty-text", text: t(spec[2], { name: label }) }),
    mode === "notes" ? button(t("importNotes"), () => ctx.go("#/settings"), "text", { icon: "importFile" }) : null,
  );
}

function grid(notes, mode, view, enter) {
  const sel = selecting();
  return h(
    "div",
    { class: "masonry " + view },
    notes.map((note, i) => {
      const card = noteCard(note, {
        mode,
        view,
        selecting: sel,
        selected: selected.has(note.id),
        fresh: enter,
        onOpen: (n) => ctx.go("#/note/" + n.id),
        onToggle: (n) => toggleSelect(n, true),
        onLongPress: (n) => (selecting() ? toggleSelect(n) : startSelect(n)),
        onSwipe: mode === "notes" || mode === "label" ? (n) => act.archiveNotes([n], true) : null,
      });
      if (enter) card.style.setProperty("--i", String(Math.min(i, 10)));
      return card;
    }),
  );
}

function section(title, notes, mode, view, enter) {
  return h(
    "section",
    { class: "section" },
    title ? h("h2", { class: "section-title", text: title }) : null,
    grid(notes, mode, view, enter),
  );
}

function hintLine(mode, count) {
  const ui = ctx.store.ui;
  if (mode !== "notes" || !count || (ui.starts || 0) > 3) return null;
  return h("p", { class: "hint-line" }, icon("sparkle"), h("span", { text: t("firstHint") }));
}

// ---------------------------------------------------------------- the dock

function dock(label) {
  const query = label ? "?label=" + encodeURIComponent(label) : "";
  const sources = photoSources();
  const photoNote = async (source) => {
    let files;
    try {
      files = await capture(source);
    } catch (error) {
      failed(error);
      return;
    }
    if (!files || !files.length) return;
    try {
      const ids = await storePhotos(files);
      const now = isoLocal(ctx.now());
      const note = await ctx.store.add({ photos: photosText(ids), labels: label || null, created: now, edited: now });
      ctx.go("#/note/" + note.id);
    } catch (error) {
      failed(error);
    }
  };
  return h(
    "div",
    { class: "dock", role: "toolbar", "aria-label": t("newSomething") },
    h(
      "button",
      { type: "button", class: "dock-main", onClick: () => ctx.go("#/new" + query), "aria-label": t("newNote") },
      icon("pen"),
      h("span", { class: "dock-label", text: t("newNote") }),
    ),
    h(
      "button",
      {
        type: "button",
        class: "dock-side",
        onClick: () => ctx.go("#/new/list" + query),
        "aria-label": t("newList"),
        title: t("newList"),
      },
      icon("checklist"),
    ),
    sources.camera || sources.pick
      ? h(
          "button",
          {
            type: "button",
            class: "dock-side",
            "aria-label": t("newPhotoNote"),
            title: t("newPhotoNote"),
            onClick: () => {
              if (sources.camera && !sources.pick) return photoNote("camera");
              if (sources.pick && !sources.camera) return photoNote("pick");
              menu(
                t("newPhotoNote"),
                [
                  { id: "camera", icon: "camera", text: t("takePhoto") },
                  { id: "pick", icon: "image", text: t("choosePhotos") },
                ],
                (id) => photoNote(id),
              );
            },
          },
          icon("camera"),
        )
      : null,
  );
}

/** Shows the dock's words only while they fit, and tells the page how tall it is (the snackbar sits above it). */
function fitDock(node) {
  const d = node.querySelector ? node.querySelector(".dock") : null;
  const root = document.documentElement;
  if (!d) {
    root.style.setProperty("--dock-h", "0px");
    return;
  }
  d.classList.remove("compact");
  if (typeof d.scrollWidth === "number" && d.scrollWidth > (window.innerWidth || 360) - 24) d.classList.add("compact");
  if (typeof d.offsetHeight === "number") root.style.setProperty("--dock-h", d.offsetHeight + "px");
}

// ---------------------------------------------------------------- the screen

export function render(route) {
  const mode = modeOf(route);
  const label = mode === "label" ? route.id : "";
  if (!(history.state && history.state.select)) selected.clear();
  // Notes that left the screen (deleted, restored) leave the selection too.
  for (const id of [...selected]) if (!ctx.store.get(id)) selected.delete(id);
  const notes = notesFor(mode, label);
  const view = ctx.store.ui.view === "list" ? "list" : "grid";
  const screenKey = mode + ":" + label;
  const enter = screenKey !== lastScreen;
  lastScreen = screenKey;

  const screen = h("div", { class: "screen home mode-" + mode + (selecting() ? " selecting" : "") });
  screen.appendChild(selecting() ? selectionBar(mode) : normalBar(mode, label, notes));
  if (mode === "notes" || mode === "label") screen.appendChild(labelChips(mode, label) || h("span"));

  const content = h("div", { class: "content" });
  if (!notes.length) content.appendChild(emptyState(mode, label));
  else {
    if (!ctx.store.live && mode === "notes") {
      content.appendChild(h("p", { class: "preview-banner" }, icon("info"), h("span", { text: t("previewBanner") })));
    }
    const hint = ctx.store.live ? hintLine(mode, notes.length) : null;
    if (hint) content.appendChild(hint);
    if (mode === "trash") {
      content.appendChild(
        h(
          "div",
          { class: "info-card" },
          icon("info"),
          h("p", { text: t("trashRule") }),
          button(t("emptyTrash"), emptyTrash, "text"),
        ),
      );
    }
    if (mode !== "reminders" && mode !== "trash") content.appendChild(countRow(mode, notes));
    if (mode === "notes" || mode === "label") {
      const pinned = notes.filter((n) => n.pinned);
      const others = notes.filter((n) => !n.pinned);
      if (pinned.length) content.appendChild(section(t("pinnedSection"), pinned, mode, view, enter));
      if (others.length)
        content.appendChild(section(pinned.length ? t("othersSection") : "", others, mode, view, enter));
    } else if (mode === "reminders") {
      const now = ctx.now();
      const upcoming = notes.filter((n) => nextReminder(n.remindAt, n.repeat, now));
      const earlier = notes.filter((n) => !nextReminder(n.remindAt, n.repeat, now));
      if (upcoming.length) content.appendChild(section(t("upcoming"), upcoming, mode, view, enter));
      if (earlier.length) content.appendChild(section(t("earlier"), earlier, mode, view, enter));
    } else content.appendChild(section("", notes, mode, view, enter));
  }
  screen.appendChild(content);
  if ((mode === "notes" || mode === "label") && !selecting()) screen.appendChild(dock(label));
  return screen;
}

/** After the screen is on the page: the masonry, the dock's size. */
export function after(node) {
  for (const stop of stopGrids) stop();
  stopGrids = [];
  if (node.querySelectorAll) for (const g of node.querySelectorAll(".masonry")) stopGrids.push(watchGrid(g));
  fitDock(node);
}

export function leave() {
  for (const stop of stopGrids) stop();
  stopGrids = [];
  document.documentElement.style.setProperty("--dock-h", "0px");
}

export function resize(node) {
  fitDock(node);
}
