// Budgets: the monthly budget for all spending and one for any category, with what is left; and the way to the
// recurring payments and the subscriptions.

import {
  ctx,
  h,
  t,
  money,
  date,
  bar,
  iconButton,
  button,
  section,
  progress,
  disc,
  row,
  failed,
  askAmount,
  dialog,
  snack,
} from "../ui.mjs";
import { budgetToday, categoryBudgets, averageMonthly } from "../ledger.mjs";
import { parseTypedAmount, fromCents, toCents } from "../money.mjs";
import { describe, timesPerYear } from "../rrule.mjs";
import { setBudget } from "./home.mjs";

export function render() {
  const store = ctx.store;
  const model = store.model;
  const today = ctx.today;
  const s = budgetToday(model, today);
  const content = [
    bar(t("tabBudgets"), { actions: [iconButton("settings", t("settings"), () => ctx.go("#/settings"))] }),
  ];

  if (s.budget !== null && s.source === "total") {
    const state = s.spent > s.budget ? "over" : s.pct >= model.warnAt ? "near" : "ok";
    content.push(
      section(
        t("monthlyBudget"),
        h("p", { class: "big", text: money(s.budget) }),
        progress(s.pct, state, t("monthBudgetUsed", { pct: s.pct })),
        h("p", {
          class: "row-sub " + state,
          text:
            s.left >= 0
              ? t("leftOf", { left: money(s.left), budget: money(s.budget) })
              : t("overBy", { amount: money(-s.left) }),
        }),
        h("p", { class: "muted", text: t("safeTodayLine", { amount: money(Math.max(0, s.safe)), days: s.daysLeft }) }),
        h(
          "div",
          { class: "card-actions" },
          button(t("change"), () => setBudget(), "tonal"),
        ),
      ),
    );
  } else {
    content.push(
      section(
        t("monthlyBudget"),
        h("p", {
          text:
            s.source === "categories" ? t("budgetFromCategoriesLong", { amount: money(s.budget) }) : t("noTotalBudget"),
        }),
        h(
          "div",
          { class: "card-actions" },
          button(t("setBudget"), () => setBudget(), "filled"),
        ),
      ),
    );
  }

  const rows = categoryBudgets(model, today);
  const list = rows.map((r) =>
    h(
      "li",
      {},
      h(
        "button",
        {
          class: "row budget-row",
          type: "button",
          onClick: () => editCategoryBudget(r.category),
          "aria-label":
            r.category.name +
            ", " +
            (r.state === "over"
              ? t("overBy", { amount: money(-r.left) })
              : t("leftOf", { left: money(r.left), budget: money(r.budget) })),
        },
        disc(r.category),
        h(
          "span",
          { class: "row-text" },
          h("span", {
            class: "row-title",
            text:
              (r.category.parent ? (store.categories.find((c) => c.id === r.category.parent) || {}).name + " › " : "") +
              r.category.name,
          }),
          progress(r.pct, r.state),
          h("span", {
            class: "row-sub " + r.state,
            text:
              (r.state === "over"
                ? t("overBy", { amount: money(-r.left) })
                : t("leftOf", { left: money(r.left), budget: money(r.budget) })) +
              (r.state === "near" ? " · " + t("almostUsed") : r.state === "over" ? " · " + t("overBudget") : ""),
          }),
        ),
        h("span", { class: "row-end amount", text: r.pct + " %" }),
      ),
    ),
  );
  content.push(
    h(
      "section",
      { class: "card" },
      h("h2", { class: "card-title", text: t("categoryBudgets") }),
      list.length ? h("ul", { class: "list" }, list) : h("p", { class: "muted", text: t("noCategoryBudgets") }),
      h(
        "div",
        { class: "card-actions" },
        button(t("addCategoryBudget"), () => addCategoryBudget(), "tonal", { icon: "add" }),
      ),
    ),
  );
  content.push(rulesCard());
  content.push(
    h(
      "section",
      { class: "card" },
      h(
        "button",
        { class: "row", type: "button", onClick: () => ctx.go("#/subscriptions") },
        h("span", { class: "disc hue-violet", "aria-hidden": "true" }, "🔁"),
        h(
          "span",
          { class: "row-text" },
          h("span", { class: "row-title", text: t("subscriptions") }),
          h("span", { class: "row-sub", text: t("subscriptionsHint") }),
        ),
      ),
    ),
  );
  return h("div", { class: "screen" }, content);
}

function rulesCard() {
  const store = ctx.store;
  const active = store.rules.filter((r) => r.active).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
  if (!active.length) {
    return h(
      "section",
      { class: "card" },
      h("h2", { class: "card-title", text: t("recurringEntries") }),
      h("p", { class: "muted", text: t("noRecurringText") }),
      h(
        "div",
        { class: "card-actions" },
        button(t("addRecurring"), () => ctx.go("#/rule/new"), "tonal", { icon: "add" }),
      ),
    );
  }
  let monthly = 0;
  for (const r of active)
    if ((r.kind || "expense") === "expense")
      monthly += Math.round(((toCents(r.amount) || 0) * timesPerYear(r.schedule)) / 12);
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h2", { class: "card-title", text: t("recurringEntries") }),
      h("button", { class: "btn text", type: "button", onClick: () => ctx.go("#/recurring"), text: t("seeAll") }),
    ),
    h("p", { class: "muted", text: t("recurringMonthly", { amount: money(monthly) }) }),
    h(
      "ul",
      { class: "list" },
      active.slice(0, 4).map((r) =>
        row({
          lead: disc(store.categories.find((c) => c.id === r.category)),
          title: r.name,
          sub: describe(r.schedule, ctx.t, ctx.locale) + " · " + t("nextOn", { date: date(r.nextDue, "short") }),
          end: h("span", {
            class: "amount" + (r.kind === "income" ? " income" : ""),
            text: money(toCents(r.amount), r.currency),
          }),
          onClick: () => ctx.go("#/rule/" + r.id),
        }),
      ),
    ),
  );
}

async function editCategoryBudget(category) {
  const store = ctx.store;
  const avg = averageMonthly(store.model, category.id, ctx.today);
  const cents = await askAmount({
    title: t("budgetFor", { name: category.name }),
    help: (avg ? t("averageSpend", { amount: money(avg) }) + " " : "") + t("emptyForNone"),
    value: category.budget ? category.budget.replace(".", ctx.mark) : "",
    parse: parseTypedAmount,
  });
  if (cents === undefined) return;
  try {
    await store.update("category", category.id, { budget: cents === null || cents === 0 ? null : fromCents(cents) });
  } catch (error) {
    failed(error);
  }
}

async function addCategoryBudget() {
  const store = ctx.store;
  const candidates = store.categories.filter((c) => (c.kind || "expense") === "expense" && !c.archived && !c.budget);
  if (!candidates.length) {
    snack(t("allHaveBudgets"));
    return;
  }
  const id = await dialog(
    (close) => [
      h("h2", { class: "dialog-title", text: t("chooseCategory") }),
      h(
        "ul",
        { class: "list" },
        candidates.map((c) =>
          row({
            lead: disc(c),
            title: (c.parent ? (store.categories.find((p) => p.id === c.parent) || {}).name + " › " : "") + c.name,
            onClick: () => close(c.id),
          }),
        ),
      ),
      h(
        "div",
        { class: "dialog-actions" },
        button(t("cancel"), () => close(null), "text"),
      ),
    ],
    { sheet: true, label: t("chooseCategory") },
  );
  if (!id) return;
  await editCategoryBudget(store.categories.find((c) => c.id === id));
}
