// Import: brings the history from a CSV file another money app or a spreadsheet exported. Zapli opens the file and
// reads it with the app's declared column mapping; this screen starts it, then shows what was added, what could
// not be read, and an Undo.

import { ctx, h, t, money, date, bar, button, section, segmented, snack, failed, confirm } from "../ui.mjs";

let picked = "dmy";
let lastRun = null;

export function render() {
  const store = ctx.store;
  // The record the last import wrote: this one's, or, after a reload, one from the last hour.
  const newest = store.importLogs[0];
  const recent = newest && Date.now() - Date.parse(newest.at) < 3600000 ? newest : null;
  const log = lastRun ? store.importLogs.find((l) => Date.parse(l.at) >= Date.parse(lastRun.since)) : recent;
  const content = [
    bar(t("importTitle"), { back: true }),
    section(
      null,
      h("p", { text: t("importIntro") }),
      h(
        "ul",
        { class: "bullets" },
        ["importWhat1", "importWhat2", "importWhat3", "importWhat4", "importWhat5"].map((k) => h("li", { text: t(k) })),
      ),
    ),
    section(
      t("datesLike"),
      segmented(
        [
          ["dmy", t("dayFirst")],
          ["mdy", t("monthFirst")],
        ],
        picked,
        (v) => {
          picked = v;
          ctx.go(location.hash, { replace: true });
        },
        t("datesLike"),
      ),
      h("p", { class: "help", text: t("datesHelp") }),
      h(
        "div",
        { class: "card-actions" },
        button(t("chooseCsv"), start, "filled", { icon: "importFile", disabled: !store.live }),
      ),
      store.live ? null : h("p", { class: "help", text: t("onlyInApp") }),
    ),
  ];
  if (log && !(lastRun && lastRun.running)) content.push(result(log));
  else if (lastRun && lastRun.running) content.push(h("p", { class: "loading", role: "status", text: t("importing") }));
  content.push(h("p", { class: "help pad", text: t("importPrivacy") }));
  return h("div", { class: "screen" }, content);
}

async function start() {
  const store = ctx.store;
  // A little earlier than now, so every record the import makes counts as made by it.
  const since = new Date(Date.now() - 2000).toISOString();
  lastRun = { since, running: true };
  try {
    await store.run("importCsv", { order: picked, since });
    lastRun.running = false;
    await store.loadEntries();
    ctx.go(location.hash, { replace: true });
  } catch (error) {
    lastRun = null;
    if (error && error.code === "CANCELLED") return;
    failed(error);
    ctx.go(location.hash, { replace: true });
  }
}

function result(log) {
  const store = ctx.store;
  const problems = (log.problems || "").split("\n").filter(Boolean);
  const unconverted = new Set();
  for (const e of store.entries.values())
    if (e.currency && e.currency !== store.main && !e.rate && e.createdAt >= log.since) unconverted.add(e.currency);
  const undo = async () => {
    if (
      !(await confirm({
        title: t("undoImportTitle"),
        message: t("undoImportText", { n: log.added || 0 }),
        ok: t("undoImport"),
        danger: true,
      }))
    )
      return;
    try {
      await store.run("undoImport", { since: log.since, until: log.at });
      await store.loadEntries();
      lastRun = null;
      snack(t("importUndone"));
      ctx.go(location.hash, { replace: true });
    } catch (error) {
      failed(error);
    }
  };
  return section(
    t("importDone"),
    h("p", { class: "big", text: t("importAdded", { n: log.added || 0 }) }),
    log.created ? h("p", { text: t("importCategories", { n: log.created }) }) : null,
    log.skipped ? h("p", { class: "warn", text: t("importSkipped", { n: log.skipped }) }) : null,
    problems.length
      ? h(
          "ul",
          { class: "problems" },
          problems.map((p) => h("li", { text: p })),
        )
      : null,
    unconverted.size
      ? h(
          "p",
          { class: "help" },
          t("importForeign", { list: [...unconverted].join(", ") }),
          " ",
          button(t("setRates"), () => ctx.go("#/currencies"), "text"),
        )
      : null,
    h(
      "div",
      { class: "card-actions" },
      button(t("seeEntries"), () => ctx.go("#/entries"), "filled"),
      button(t("findSubscriptions"), () => ctx.go("#/subscriptions"), "tonal"),
      log.added ? button(t("undoImport"), undo, "text danger", { icon: "undo" }) : null,
    ),
    h("p", { class: "help", text: t("importWhen", { when: date(log.at.slice(0, 10), "medium") }) }),
  );
}
