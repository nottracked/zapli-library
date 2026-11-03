// Labels: make one, rename one (every note that has it follows), delete one (the notes stay), or open its notes.

import { ctx, h, t, iconButton, snack, failed, confirm, askText } from "../ui.mjs";
import { icon } from "../icons.mjs";
import { illustration } from "../illus.mjs";
import { cleanLabel, sameLabel } from "../model.mjs";

function countOf(name) {
  return ctx.store.all.filter((n) => !n.trashedAt && n._labels.some((l) => sameLabel(l, name))).length;
}

function exists(name, except) {
  return ctx.store.labels.some((n) => sameLabel(n, name) && !(except && sameLabel(n, except)));
}

async function rename(name) {
  const to = await askText({
    title: t("renameLabel"),
    label: t("labelName"),
    value: name,
    check: (text) => (!cleanLabel(text) ? t("typeSomething") : null),
  });
  const clean = cleanLabel(to || "");
  if (!clean || clean === name) return;
  try {
    await ctx.store.renameLabel(name, clean);
    snack(t("labelRenamed"));
  } catch (error) {
    failed(error);
  }
}

async function remove(name) {
  const ok = await confirm({
    title: t("deleteLabelTitle", { name }),
    message: t("deleteLabelText"),
    ok: t("delete"),
    danger: true,
  });
  if (!ok) return;
  try {
    await ctx.store.deleteLabel(name);
    snack(t("labelDeleted"));
  } catch (error) {
    failed(error);
  }
}

export function render() {
  const labels = ctx.store.labels;
  const input = h("input", {
    type: "text",
    class: "new-label-input",
    placeholder: t("createLabelPlaceholder"),
    "aria-label": t("createLabelPlaceholder"),
    autocomplete: "off",
    maxlength: "50",
    enterkeyhint: "done",
  });
  const error = h("p", { class: "error", role: "alert" });
  const create = async () => {
    const name = cleanLabel(input.value);
    if (!name) {
      error.textContent = t("typeSomething");
      return;
    }
    if (exists(name)) {
      error.textContent = t("labelExists");
      return;
    }
    error.textContent = "";
    try {
      await ctx.store.ensureLabels([name]);
      input.value = "";
      snack(t("labelCreated", { name }));
    } catch (e) {
      failed(e);
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      create();
    }
  });

  const rows = labels.map((name) => {
    const n = countOf(name);
    return h(
      "li",
      { class: "label-item" },
      h(
        "button",
        { type: "button", class: "label-open", onClick: () => ctx.go("#/label/" + encodeURIComponent(name)) },
        icon("label"),
        h("span", { class: "label-name", text: name }),
        h("span", { class: "label-count", text: t("noteCount", { n }) }),
      ),
      iconButton("pen", t("renameLabelNamed", { name }), () => rename(name)),
      iconButton("trash", t("deleteLabelNamed", { name }), () => remove(name)),
    );
  });

  return h(
    "div",
    { class: "screen labels-screen" },
    h(
      "header",
      { class: "bar" },
      iconButton("back", t("back"), () => ctx.back()),
      h("h1", { class: "bar-title", text: t("editLabels") }),
    ),
    h(
      "div",
      { class: "content" },
      h(
        "div",
        { class: "new-label" },
        icon("labelAdd"),
        input,
        iconButton("check", t("createLabelButton"), create, { class: "tonal" }),
      ),
      error,
      labels.length
        ? h("ul", { class: "label-items" }, rows)
        : h(
            "div",
            { class: "empty" },
            illustration("label"),
            h("h2", { class: "empty-title", text: t("noLabelsTitle") }),
            h("p", { class: "empty-text", text: t("noLabelsText") }),
          ),
    ),
  );
}
