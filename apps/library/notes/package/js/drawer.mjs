// The side menu: the notes, reminders, every label, the archive, the trash and the settings. It is a modal panel,
// so Back closes it.

import { ctx, h, t, dialog } from "./ui.mjs";
import { icon } from "./icons.mjs";
import { nextReminder } from "./model.mjs";

/** Opens the menu; `current` is the hash of the screen it was opened from. */
export function openDrawer(current) {
  const store = ctx.store;
  const now = ctx.now();
  const counts = {
    notes: store.active.length,
    reminders: store.all.filter((n) => !n.trashedAt && n.remindAt && nextReminder(n.remindAt, n.repeat, now)).length,
    archive: store.archived.length,
    trash: store.trashed.length,
  };
  return dialog(
    (close) => {
      const go = (hash) => {
        close();
        if (hash !== current) ctx.go(hash);
      };
      const row = (hash, iconName, text, count) =>
        h(
          "li",
          {},
          h(
            "button",
            {
              type: "button",
              class: "drawer-item" + (hash === current ? " on" : ""),
              "aria-current": hash === current ? "page" : null,
              onClick: () => go(hash),
            },
            icon(iconName),
            h("span", { class: "drawer-text", text }),
            count ? h("span", { class: "drawer-count", text: String(count) }) : null,
          ),
        );
      const labels = store.labels;
      return [
        h(
          "div",
          { class: "drawer-head" },
          h("span", { class: "brand-mark", "aria-hidden": "true" }, icon("pen")),
          h("h2", { class: "drawer-title", text: t("appName") }),
        ),
        h(
          "nav",
          { "aria-label": t("menu") },
          h(
            "ul",
            { class: "drawer-list" },
            row("#/", "noteOutline", t("navNotes"), counts.notes),
            row("#/reminders", "bell", t("navReminders"), counts.reminders),
          ),
          h(
            "div",
            { class: "drawer-section" },
            h("h3", { class: "drawer-heading", text: t("labels") }),
            h("button", { type: "button", class: "text-link", text: t("editLabels"), onClick: () => go("#/labels") }),
          ),
          h(
            "ul",
            { class: "drawer-list" },
            labels.length
              ? labels.map((name) => row("#/label/" + encodeURIComponent(name), "label", name, 0))
              : h(
                  "li",
                  {},
                  h(
                    "button",
                    { type: "button", class: "drawer-item quiet", onClick: () => go("#/labels") },
                    icon("labelAdd"),
                    h("span", { class: "drawer-text", text: t("createFirstLabel") }),
                  ),
                ),
          ),
          h("hr", { class: "drawer-rule" }),
          h(
            "ul",
            { class: "drawer-list" },
            row("#/archive", "archive", t("navArchive"), counts.archive),
            row("#/trash", "trash", t("navTrash"), counts.trash),
            row("#/settings", "settings", t("navSettings"), 0),
          ),
        ),
      ];
    },
    { className: "drawer", label: t("menu") },
  );
}
