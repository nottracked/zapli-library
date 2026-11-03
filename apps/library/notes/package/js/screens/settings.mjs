// Settings: how notes and checklists behave, reminders, privacy, the language, and the user's data: saving every
// note as a file (the app's own JSON, or CSV for spreadsheets) and adding notes from one.

import { ctx, h, t, iconButton, button, toggle, snack, failed, sheet, confirm } from "../ui.mjs";
import { icon } from "../icons.mjs";
import { exportJson, exportCsv, fileName, labelsOf } from "../model.mjs";

/** The last file made for saving, kept so a second tap can send the same file at once (see the bridge's rules). */
let lastFile = null;

function group(title, ...rows) {
  return h(
    "section",
    { class: "settings-group" },
    h("h2", { class: "section-title", text: title }),
    h("div", { class: "card" }, rows),
  );
}

function choiceRow(label, options, value, onPick) {
  return h(
    "div",
    { class: "setting-choice" },
    h("p", { class: "setting-label", text: label }),
    h(
      "div",
      { class: "segmented", role: "radiogroup", "aria-label": label },
      options.map(([v, text]) =>
        h("button", {
          type: "button",
          role: "radio",
          "aria-checked": String(v === value),
          class: v === value ? "on" : "",
          onClick: () => v !== value && onPick(v),
          text,
        }),
      ),
    ),
  );
}

function actionRow(iconName, text, help, onClick, extra = {}) {
  return h(
    "button",
    { type: "button", class: "setting-action" + (extra.danger ? " danger" : ""), onClick },
    icon(iconName),
    h(
      "span",
      { class: "toggle-text" },
      h("span", { class: "toggle-label", text }),
      help ? h("span", { class: "help", text: help }) : null,
    ),
    icon("chevronRight"),
  );
}

// ---------------------------------------------------------------- files

/** Saves every note as a file the user places. Called straight from a tap. */
async function exportNotes(kind) {
  const store = ctx.store;
  const notes = store.all.filter((n) => !n.trashedAt);
  if (!notes.length) {
    snack(t("nothingToExport"));
    return;
  }
  const now = ctx.now();
  const text = kind === "json" ? exportJson(notes, now) : exportCsv(notes);
  const type = kind === "json" ? "application/json" : "text/csv";
  const name = fileName(kind, now);
  if (!lastFile || lastFile.text !== text || lastFile.name !== name)
    lastFile = { text, name, blob: new Blob([text], { type }) };
  const zapli = ctx.zapli;
  try {
    if (store.live && zapli && zapli.supports("files.save")) {
      const saved = await zapli.files.save({ name, type, data: lastFile.blob });
      if (saved) snack(t("exported", { n: notes.length }));
      return;
    }
    const url = URL.createObjectURL(lastFile.blob);
    const a = h("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (error) {
    failed(error);
  }
}

/** Adds notes from a file the user picks. Called straight from a tap: the import runs as the app's own action. */
async function importNotes(format) {
  const store = ctx.store;
  if (!store.live) {
    snack(t("onlyInApp"));
    return;
  }
  const stamp = "imp-" + Date.now().toString(36);
  try {
    await store.run("importNotes", { format, stamp });
  } catch (error) {
    failed(error);
    return;
  }
  // More than three thousand rows take another round of tidying.
  for (let round = 0; round < 4 && store.all.some((n) => n.fresh); round++) {
    try {
      await store.run("settleImport", { stamp });
    } catch {
      break;
    }
  }
  const added = store.all.filter((n) => n.importId === stamp);
  const names = new Set();
  added.forEach((n) => labelsOf(n.labels).forEach((l) => names.add(l)));
  await store.ensureLabels([...names]);
  let log = null;
  try {
    const page = await store.zapli.data.query("importLog", { where: { stamp }, limit: 1 });
    log = page.items[0] || null;
  } catch {
    log = null;
  }
  const skipped = log ? log.skipped || 0 : 0;
  lastImport = { stamp, added: added.length, skipped, problems: log ? log.problems || "" : "" };
  if (!added.length && !skipped) {
    // The picker was closed, or the file had no notes in it.
    lastImport = null;
    return;
  }
  ctx.refresh();
  if (added.length) {
    snack(t("importedNotes", { n: added.length }), {
      label: t("undo"),
      run: () => undoImport(stamp),
    });
  } else snack(t("importedNone"));
}

let lastImport = null;

async function undoImport(stamp) {
  try {
    await ctx.store.run("undoImport", { stamp });
    await ctx.store.sweepPhotos();
    if (lastImport && lastImport.stamp === stamp) lastImport = null;
    snack(t("importUndone"));
    ctx.refresh();
  } catch (error) {
    failed(error);
  }
}

function importSheet() {
  return sheet(t("importNotes"), (close) => [
    h("p", { class: "help", text: t("importIntro") }),
    h(
      "div",
      { class: "import-choices" },
      h(
        "button",
        {
          type: "button",
          class: "import-choice",
          onClick: () => {
            // The file picker opens from this tap.
            importNotes("json");
            close();
          },
        },
        icon("noteOutline"),
        h(
          "span",
          { class: "toggle-text" },
          h("span", { class: "toggle-label", text: t("importJson") }),
          h("span", { class: "help", text: t("importJsonHelp") }),
        ),
      ),
      h(
        "button",
        {
          type: "button",
          class: "import-choice",
          onClick: () => {
            importNotes("csv");
            close();
          },
        },
        icon("rows"),
        h(
          "span",
          { class: "toggle-text" },
          h("span", { class: "toggle-label", text: t("importCsv") }),
          h("span", { class: "help", text: t("importCsvHelp") }),
        ),
      ),
    ),
    h("p", { class: "help", text: t("importLimits") }),
  ]);
}

function importResult() {
  if (!lastImport) return null;
  const r = lastImport;
  return h(
    "div",
    { class: "info-card" + (r.skipped ? " warn" : "") },
    icon(r.skipped ? "info" : "check"),
    h(
      "div",
      { class: "info-body" },
      h("p", { class: "info-title", text: t("importResult", { n: r.added }) }),
      r.skipped ? h("p", { class: "help", text: t("importSkipped", { n: r.skipped }) }) : null,
      r.problems ? h("pre", { class: "problems", text: r.problems }) : null,
      r.added ? button(t("undoImport"), () => undoImport(r.stamp), "text") : null,
    ),
  );
}

// ---------------------------------------------------------------- the screen

export function render() {
  const store = ctx.store;
  const ui = store.ui;
  const zapli = ctx.zapli;
  const live = store.live;
  const set = (patch) => store.saveUi(patch);
  const canOpenSettings = live && zapli && zapli.ui && typeof zapli.ui.openSettings === "function";

  const screen = h(
    "div",
    { class: "screen settings" },
    h(
      "header",
      { class: "bar" },
      iconButton("back", t("back"), () => ctx.back()),
      h("h1", { class: "bar-title", text: t("navSettings") }),
    ),
  );
  const content = h("div", { class: "content" });

  content.appendChild(
    group(
      t("settingsNotes"),
      choiceRow(
        t("sortBy"),
        [
          ["edited", t("sortEdited")],
          ["created", t("sortCreated")],
          ["title", t("sortTitle")],
        ],
        ui.sort || "edited",
        (v) => set({ sort: v }),
      ),
      choiceRow(
        t("layout"),
        [
          ["grid", t("gridView")],
          ["list", t("listView")],
        ],
        ui.view === "list" ? "list" : "grid",
        (v) => set({ view: v }),
      ),
      choiceRow(
        t("textSize"),
        [
          ["small", t("textSmall")],
          ["normal", t("textNormal")],
          ["large", t("textLarge")],
        ],
        ui.textSize || "normal",
        (v) => set({ textSize: v }),
      ),
      toggle(t("startWithNew"), ui.startNew === true, (on) => set({ startNew: on }), t("startWithNewHelp")),
    ),
  );

  content.appendChild(
    group(
      t("settingsLists"),
      toggle(
        t("tickedToBottom"),
        ui.tickedToBottom !== false,
        (on) => set({ tickedToBottom: on }),
        t("tickedToBottomHelp"),
      ),
      toggle(t("newItemsAtTop"), ui.newItemsAtTop === true, (on) => set({ newItemsAtTop: on })),
    ),
  );

  content.appendChild(
    group(
      t("settingsReminders"),
      toggle(
        t("privateReminders"),
        Boolean(store.prefs && store.prefs.privateReminders),
        (on) => store.setPrivateReminders(on).catch(failed),
        t("privateRemindersHelp"),
      ),
      canOpenSettings
        ? actionRow("bell", t("notificationSettings"), t("notificationSettingsHelp"), () =>
            zapli.ui.openSettings().catch(failed),
          )
        : null,
    ),
  );

  content.appendChild(
    group(
      t("settingsPrivacy"),
      canOpenSettings
        ? actionRow("lock", t("appLock"), t("appLockHelp"), () => zapli.ui.openSettings().catch(failed))
        : h("p", { class: "help pad", text: t("appLockHelp") }),
      toggle(t("vibration"), ui.haptics !== false, (on) => set({ haptics: on }), t("vibrationHelp")),
    ),
  );

  content.appendChild(
    group(
      t("language"),
      choiceRow(
        t("language"),
        [
          ["", t("languageAuto")],
          ["en", "English"],
          ["sk", "Slovenčina"],
        ],
        ui.lang || "",
        (v) => set({ lang: v }),
      ),
    ),
  );

  const trashCount = store.trashed.length;
  content.appendChild(
    group(
      t("settingsData"),
      importResult(),
      actionRow("exportFile", t("exportJson"), t("exportJsonHelp"), () => exportNotes("json")),
      actionRow("exportFile", t("exportCsv"), t("exportCsvHelp"), () => exportNotes("csv")),
      actionRow("importFile", t("importNotes"), t("importNotesHelp"), importSheet),
      trashCount
        ? actionRow(
            "sweep",
            t("emptyTrash"),
            t("emptyTrashText", { n: trashCount }),
            async () => {
              const ok = await confirm({
                title: t("emptyTrashTitle"),
                message: t("emptyTrashText", { n: trashCount }),
                ok: t("emptyTrash"),
                danger: true,
              });
              if (!ok) return;
              try {
                await store.run("emptyTrash");
                await store.sweepPhotos();
                snack(t("trashEmptied"));
              } catch (error) {
                failed(error);
              }
            },
            { danger: true },
          )
        : null,
      h("p", { class: "help pad", text: t("dataHelp") }),
    ),
  );

  content.appendChild(
    group(
      t("about"),
      h(
        "div",
        { class: "about" },
        h("span", { class: "brand-mark", "aria-hidden": "true" }, icon("pen")),
        h(
          "div",
          {},
          h("p", { class: "about-name", text: t("appName") + " " + version() }),
          h("p", { class: "help", text: t("aboutText") }),
        ),
      ),
      live ? null : button(t("previewReset"), () => store.resetPreview(ctx.lang), "text"),
    ),
  );

  screen.appendChild(content);
  return screen;
}

function version() {
  try {
    const info = ctx.appInfo;
    return info && info.version ? info.version : "";
  } catch {
    return "";
  }
}
