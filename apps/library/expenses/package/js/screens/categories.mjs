// Categories for spending and for income, with subcategories, icons, colours and budgets; deleting one moves its
// entries to another category first, so nothing is lost.

import {
  ctx,
  h,
  t,
  put,
  money,
  bar,
  iconButton,
  button,
  segmented,
  row,
  disc,
  field,
  toggle,
  empty,
  snack,
  failed,
  confirm,
  dialog,
  chip,
  blurActive,
} from "../ui.mjs";
import { ICON_CHOICES, COLOR_CHOICES, emojiOf, hueOf } from "../icons.mjs";
import { parseTypedAmount, fromCents, toCents } from "../money.mjs";

export function keep(route) {
  return route.name === "category";
}

export function render(route) {
  return route.name === "category" ? form(route) : list(route);
}

function list(route) {
  const store = ctx.store;
  const kind = route.params.get("kind") === "income" ? "income" : "expense";
  const tops = store.categories.filter((c) => (c.kind || "expense") === kind && !c.parent);
  const counts = new Map();
  for (const e of store.entries.values()) if (e.category) counts.set(e.category, (counts.get(e.category) || 0) + 1);
  const items = [];
  for (const top of tops) {
    items.push(
      row({
        lead: disc(top),
        title: top.name + (top.archived ? " · " + t("hidden") : ""),
        sub: [
          t("nEntries", { n: counts.get(top.id) || 0 }),
          top.budget ? t("budgetIs", { amount: money(toCents(top.budget)) }) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => ctx.go("#/category/" + top.id),
      }),
    );
    for (const sub of store.categories.filter((c) => c.parent === top.id)) {
      const li = row({
        lead: disc(sub, "small"),
        title: sub.name + (sub.archived ? " · " + t("hidden") : ""),
        sub: t("nEntries", { n: counts.get(sub.id) || 0 }),
        onClick: () => ctx.go("#/category/" + sub.id),
      });
      li.classList.add("sub");
      items.push(li);
    }
  }
  return h(
    "div",
    { class: "screen" },
    bar(t("categories"), {
      back: true,
      actions: [iconButton("add", t("newCategory"), () => ctx.go("#/category/new?kind=" + kind))],
    }),
    h(
      "div",
      { class: "pad" },
      segmented(
        [
          ["expense", t("spending")],
          ["income", t("income")],
        ],
        kind,
        (v) => ctx.go("#/categories" + (v === "income" ? "?kind=income" : ""), { replace: true }),
        t("kind"),
      ),
    ),
    items.length
      ? h("section", { class: "card" }, h("ul", { class: "list" }, items))
      : empty("🏷️", t("noCategoriesYet"), t("noCategoriesText"), [
          button(t("newCategory"), () => ctx.go("#/category/new?kind=" + kind), "filled", { icon: "add" }),
        ]),
    h("p", { class: "help pad", text: t("categoriesHelp") }),
  );
}

function form(route) {
  const store = ctx.store;
  const id = route.id;
  const existing = id !== "new" ? store.categories.find((c) => c.id === id) : null;
  if (id !== "new" && !existing)
    return h("div", { class: "screen" }, bar(t("category"), { back: true }), empty("🏷️", t("categoryGone"), ""));
  const parentParam = route.params.get("parent");
  const draft = {
    name: existing ? existing.name : "",
    kind: existing ? existing.kind || "expense" : route.params.get("kind") === "income" ? "income" : "expense",
    icon: existing ? existing.icon || "category" : "category",
    color: existing ? existing.color || null : null,
    parent: existing ? existing.parent || null : parentParam || null,
    budget: existing && existing.budget ? existing.budget.replace(".", ctx.mark) : "",
    archived: existing ? Boolean(existing.archived) : false,
  };
  const hasChildren = existing && store.categories.some((c) => c.parent === existing.id);
  const parts = h("div", { class: "form" });
  const error = h("p", { class: "error", role: "alert" });

  const draw = () => {
    parts.textContent = "";
    const preview = h(
      "div",
      { class: "category-preview" },
      disc({ icon: draft.icon, color: draft.color }, "large"),
      h("span", { text: draft.name || t("newCategory") }),
    );
    const icons = h(
      "div",
      { class: "icon-grid", role: "radiogroup", "aria-label": t("icon") },
      ICON_CHOICES.map((name) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            class: "icon-choice hue-" + hueOf({ icon: name, color: draft.color }) + (draft.icon === name ? " on" : ""),
            "aria-checked": String(draft.icon === name),
            "aria-label": t("icon_" + name),
            onClick: () => {
              draft.icon = name;
              draw();
            },
          },
          emojiOf(name),
        ),
      ),
    );
    const colors = h(
      "div",
      { class: "color-row", role: "radiogroup", "aria-label": t("colour") },
      h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "swatch auto" + (!draft.color ? " on" : ""),
          "aria-checked": String(!draft.color),
          "aria-label": t("colourAuto"),
          onClick: () => {
            draft.color = null;
            draw();
          },
        },
        "A",
      ),
      COLOR_CHOICES.map(([hex, hue]) =>
        h("button", {
          type: "button",
          role: "radio",
          class: "swatch hue-" + hue + (draft.color === hex ? " on" : ""),
          "aria-checked": String(draft.color === hex),
          "aria-label": t("colour_" + hue),
          onClick: () => {
            draft.color = hex;
            draw();
          },
        }),
      ),
    );
    const parents = store.categories.filter(
      (c) => (c.kind || "expense") === draft.kind && !c.parent && (!existing || c.id !== existing.id),
    );
    const parentChips = h(
      "div",
      { class: "chips" },
      chip(t("noParent"), !draft.parent, () => {
        draft.parent = null;
        draw();
      }),
      parents.map((p) =>
        h(
          "button",
          {
            type: "button",
            class: "chip" + (draft.parent === p.id ? " on" : ""),
            "aria-pressed": String(draft.parent === p.id),
            onClick: () => {
              draft.parent = p.id;
              draw();
            },
          },
          disc(p, "tiny"),
          h("span", { text: p.name }),
        ),
      ),
    );
    put(
      parts,
      preview,
      field(
        t("name"),
        h("input", {
          type: "text",
          value: draft.name,
          maxlength: "60",
          autocapitalize: "sentences",
          placeholder: t("categoryPlaceholder"),
          onInput: (e) => {
            draft.name = e.target.value;
            preview.lastChild.textContent = draft.name || t("newCategory");
          },
        }),
      ),
      existing
        ? null
        : h(
            "div",
            { class: "field" },
            h("span", { class: "label", text: t("kind") }),
            segmented(
              [
                ["expense", t("spending")],
                ["income", t("income")],
              ],
              draft.kind,
              (v) => {
                draft.kind = v;
                draft.parent = null;
                draw();
              },
              t("kind"),
            ),
          ),
      hasChildren ? null : h("div", { class: "field" }, h("span", { class: "label", text: t("partOf") }), parentChips),
      h("div", { class: "field" }, h("span", { class: "label", text: t("icon") }), icons),
      h("div", { class: "field" }, h("span", { class: "label", text: t("colour") }), colors),
      draft.kind === "expense"
        ? field(
            t("monthlyBudgetOptional"),
            h("input", {
              type: "text",
              inputmode: "decimal",
              value: draft.budget,
              onInput: (e) => (draft.budget = e.target.value),
            }),
            t("categoryBudgetHelp"),
          )
        : null,
      existing ? toggle(t("hideCategory"), draft.archived, (v) => (draft.archived = v), t("hideCategoryHelp")) : null,
      error,
      existing && !draft.parent
        ? button(
            t("addSubcategory"),
            () => ctx.go("#/category/new?kind=" + draft.kind + "&parent=" + existing.id),
            "text",
            { icon: "add" },
          )
        : null,
      existing ? button(t("deleteCategory"), remove, "text danger", { icon: "trash" }) : null,
    );
  };

  const save = async () => {
    blurActive();
    const name = draft.name.trim();
    if (!name) return (error.textContent = t("nameNeeded"));
    if (store.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase()))
      return (error.textContent = t("categoryTaken"));
    const budget = draft.kind === "expense" && draft.budget.trim() ? parseTypedAmount(draft.budget) : null;
    if (draft.budget.trim() && (budget === null || budget < 0)) return (error.textContent = t("notAnAmount"));
    const values = {
      name,
      kind: draft.kind,
      icon: draft.icon,
      color: draft.color,
      parent: draft.parent,
      budget: budget ? fromCents(budget) : null,
      archived: draft.archived,
    };
    try {
      if (existing) await store.update("category", existing.id, values);
      else await store.add("category", values);
      ctx.back();
    } catch (e) {
      failed(e);
    }
  };

  const remove = async () => {
    const used =
      [...store.entries.values()].filter((e) => e.category === existing.id).length +
      store.rules.filter((r) => r.category === existing.id).length;
    const children = store.categories.filter((c) => c.parent === existing.id);
    if (!used) {
      const message = children.length ? t("deleteCategoryChildren", { n: children.length }) : t("deleteCategoryEmpty");
      if (
        !(await confirm({
          title: t("deleteCategoryTitle", { name: existing.name }),
          message,
          ok: t("delete"),
          danger: true,
        }))
      )
        return;
      try {
        await store.remove("category", existing.id);
        ctx.back();
        snack(t("categoryDeleted"));
      } catch (e) {
        failed(e);
      }
      return;
    }
    const others = store.categories.filter(
      (c) => c.id !== existing.id && (c.kind || "expense") === (existing.kind || "expense"),
    );
    const target = await dialog(
      (close) => [
        h("h2", { class: "dialog-title", text: t("deleteCategoryTitle", { name: existing.name }) }),
        h("p", { text: t("deleteCategoryMove", { n: used }) }),
        h(
          "ul",
          { class: "list" },
          others.map((c) => row({ lead: disc(c), title: c.name, onClick: () => close(c.id) })),
        ),
        h(
          "div",
          { class: "dialog-actions" },
          button(t("cancel"), () => close(null), "text"),
        ),
      ],
      { sheet: true },
    );
    if (!target) return;
    try {
      await store.run("moveCategory", { from: existing.id, to: target });
      await store.remove("category", existing.id);
      if (store.live) await store.loadEntries();
      ctx.back();
      snack(t("categoryMerged", { name: (store.categories.find((c) => c.id === target) || {}).name || "" }));
    } catch (e) {
      failed(e);
    }
  };

  draw();
  return h(
    "div",
    { class: "screen" },
    bar(existing ? t("editCategory") : t("newCategory"), {
      back: true,
      actions: [button(t("save"), save, "filled", { class: "bar-save" })],
    }),
    parts,
  );
}
