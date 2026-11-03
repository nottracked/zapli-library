// Home: what is safe to spend today, this month at a glance, quick add, payments due and the latest entries.

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
  entryRow,
  disc,
  empty,
  snack,
  failed,
  askAmount,
} from "../ui.mjs";
import {
  budgetToday,
  againstLastMonth,
  totals,
  frequentCategories,
  balances,
  netWorth,
  categoryBudgets,
} from "../ledger.mjs";
import { startOfMonth, endOfMonth, addDays } from "../dates.mjs";
import { parseTypedAmount, fromCents, toCents, currencyOfLocale } from "../money.mjs";
import { icon } from "../icons.mjs";
import { findSubscriptions, keyOf } from "../subs.mjs";
import { timesPerYear } from "../rrule.mjs";
import { pickCurrency, currencyName } from "./settings.mjs";

export function render() {
  const store = ctx.store;
  const model = store.model;
  const today = ctx.today;
  const first = model.entries.length === 0;
  const content = [];

  content.push(
    bar(t("appName"), {
      actions: [
        iconButton("search", t("search"), () => ctx.go("#/entries?search=1")),
        iconButton("settings", t("settings"), () => ctx.go("#/settings")),
      ],
    }),
  );
  if (!store.live) content.push(previewBanner());
  if (first) content.push(welcome());
  content.push(safeCard(model, today));
  if (!first) content.push(monthCard(model, today));
  content.push(quickAdd(model, today));
  const due = dueCard(today);
  if (due) content.push(due);
  const budgetsGlimpse = budgetCard(model, today);
  if (budgetsGlimpse) content.push(budgetsGlimpse);
  const subs = subscriptionCard(model, today);
  if (subs) content.push(subs);
  if (!first) content.push(recentCard(model));
  content.push(h("div", { class: "fab-space" }));
  content.push(fab());
  return h("div", { class: "screen" }, content);
}

export function fab(href = "#/add") {
  return h(
    "button",
    { class: "fab", type: "button", onClick: () => ctx.go(href), "aria-label": t("addEntry") },
    icon("add"),
    h("span", { class: "fab-label", text: t("add") }),
  );
}

function previewBanner() {
  return h(
    "p",
    { class: "banner" },
    icon("info"),
    h("span", { text: t("previewBanner") }),
    h("button", {
      type: "button",
      class: "btn text",
      onClick: () => ctx.store.resetPreview(),
      text: t("previewReset"),
    }),
  );
}

function welcome() {
  const store = ctx.store;
  const prefs = store.prefs;
  // The usual currency of the phone's region, offered once while nothing is entered yet (euro stays the default).
  const suggested = currencyOfLocale(ctx.locale);
  return section(
    t("welcome"),
    h("p", { text: t("welcomeText") }),
    h(
      "ul",
      { class: "list plain" },
      h(
        "li",
        {},
        h(
          "button",
          { class: "row", type: "button", onClick: () => chooseCurrency() },
          h("span", { class: "disc hue-teal", "aria-hidden": "true" }, "💱"),
          h(
            "span",
            { class: "row-text" },
            h("span", { class: "row-title", text: t("yourCurrency") }),
            h("span", { class: "row-sub", text: currencyName(store.main) + " (" + store.main + ")" }),
          ),
          h("span", { class: "row-end", text: t("change") }),
        ),
      ),
      h(
        "li",
        {},
        h(
          "button",
          { class: "row", type: "button", onClick: () => setBudget() },
          h("span", { class: "disc hue-green", "aria-hidden": "true" }, "🎯"),
          h(
            "span",
            { class: "row-text" },
            h("span", { class: "row-title", text: t("monthlyBudget") }),
            h("span", {
              class: "row-sub",
              text: prefs && prefs.monthlyBudget ? money(toCents(prefs.monthlyBudget)) : t("optional"),
            }),
          ),
          h("span", { class: "row-end", text: prefs && prefs.monthlyBudget ? t("change") : t("set") }),
        ),
      ),
    ),
    suggested !== store.main
      ? h(
          "div",
          { class: "card-actions" },
          button(t("useCurrency", { name: currencyName(suggested) }), () => useCurrency(suggested), "tonal"),
        )
      : null,
    h(
      "div",
      { class: "card-actions" },
      button(t("addFirst"), () => ctx.go("#/add"), "filled", { icon: "add" }),
      button(t("importHistory"), () => ctx.go("#/import"), "tonal", { icon: "importFile" }),
    ),
  );
}

async function useCurrency(code) {
  try {
    await ctx.store.updatePrefs({ currency: code });
  } catch (error) {
    failed(error);
  }
}

async function chooseCurrency() {
  const code = await pickCurrency(ctx.store.main);
  if (!code || code === ctx.store.main) return;
  try {
    await ctx.store.updatePrefs({ currency: code });
  } catch (error) {
    failed(error);
  }
}

/** Asks for the monthly budget and saves it. */
export async function setBudget() {
  const store = ctx.store;
  const current = store.prefs && store.prefs.monthlyBudget;
  const cents = await askAmount({
    title: t("monthlyBudget"),
    help: t("monthlyBudgetHelp"),
    value: current ? current.replace(".", ctx.mark) : "",
    parse: parseTypedAmount,
  });
  if (cents === undefined) return;
  try {
    await store.updatePrefs({ monthlyBudget: cents === null ? null : fromCents(cents) });
  } catch (error) {
    failed(error);
  }
}

function safeCard(model, today) {
  const s = budgetToday(model, today);
  if (s.budget === null) {
    return h(
      "section",
      { class: "card hero" },
      h("p", { class: "hero-label", text: t("safeToday") }),
      h("p", { class: "hero-hint", text: t("safeNoBudget") }),
      h(
        "div",
        { class: "card-actions" },
        button(t("setBudget"), () => setBudget(), "filled"),
      ),
    );
  }
  const over = s.safe < 0;
  const monthState = s.spent > s.budget ? "over" : s.pct >= (model.warnAt || 80) ? "near" : "ok";
  return h(
    "section",
    { class: "card hero", "aria-labelledby": "safe-label" },
    h("p", { class: "hero-label", id: "safe-label", text: t("safeToday") }),
    h("p", { class: "hero-amount" + (over ? " negative" : ""), text: money(Math.max(0, s.safe)) }),
    h("p", {
      class: "hero-hint",
      text: over
        ? t("overToday", { amount: money(-s.safe) })
        : t("safeHint", { daily: money(s.daily), days: s.daysLeft }),
    }),
    progress(s.pct, monthState, t("monthBudgetUsed", { pct: s.pct })),
    h(
      "p",
      { class: "hero-foot" },
      s.left >= 0
        ? t("leftOfBudget", { left: money(s.left), budget: money(s.budget) })
        : t("overBudgetBy", { over: money(-s.left), budget: money(s.budget) }),
      s.source === "categories" ? " " + t("budgetFromCategories") : "",
    ),
  );
}

function monthCard(model, today) {
  const month = totals(model.entries, startOfMonth(today), endOfMonth(today));
  const vs = againstLastMonth(model, today);
  const worth = netWorth(model, balances(model));
  let change = null;
  if (vs.pct !== null) {
    change =
      vs.pct <= -1
        ? t("lessThanLastMonth", { pct: -vs.pct })
        : vs.pct >= 1
          ? t("moreThanLastMonth", { pct: vs.pct })
          : t("sameAsLastMonth");
  }
  const stat = (label, value, cls, onClick) =>
    h(
      "button",
      { class: "stat", type: "button", onClick },
      h("span", { class: "stat-label", text: label }),
      h("span", { class: "stat-value " + (cls || ""), text: value }),
    );
  return section(
    date(today, "month"),
    h(
      "div",
      { class: "stats" },
      stat(t("spent"), money(month.spent), "", () => ctx.go("#/stats")),
      stat(t("income"), money(month.income), "income", () => ctx.go("#/stats")),
      stat(t("balance"), money(worth.total), worth.total < 0 ? "negative" : "", () => ctx.go("#/accounts")),
    ),
    change ? h("p", { class: "muted", text: change }) : null,
  );
}

function quickAdd(model, today) {
  const store = ctx.store;
  let ids = frequentCategories(model, today, "expense", 6);
  if (ids.length < 6) {
    const more = store.categories
      .filter((c) => c.kind !== "income" && !c.archived && !c.parent && !ids.includes(c.id))
      .map((c) => c.id);
    ids = ids.concat(more).slice(0, 6);
  }
  const chips = ids.map((id) => {
    const c = store.categories.find((x) => x.id === id);
    return h(
      "button",
      { class: "quick", type: "button", onClick: () => ctx.go("#/add?cat=" + encodeURIComponent(id)) },
      disc(c, "small"),
      h("span", { text: c.name }),
    );
  });
  chips.push(
    h(
      "button",
      { class: "quick", type: "button", onClick: () => ctx.go("#/add?kind=income") },
      h("span", { class: "disc small hue-green", "aria-hidden": "true" }, icon("income")),
      h("span", { text: t("incomeKind") }),
    ),
  );
  if (store.accounts.filter((a) => !a.archived).length > 1) {
    chips.push(
      h(
        "button",
        { class: "quick", type: "button", onClick: () => ctx.go("#/add?kind=transfer") },
        h("span", { class: "disc small hue-teal", "aria-hidden": "true" }, icon("swap")),
        h("span", { text: t("transferKind") }),
      ),
    );
  }
  return h(
    "section",
    { class: "card" },
    h("h2", { class: "card-title", text: t("quickAdd") }),
    h("div", { class: "quick-row" }, chips),
  );
}

function dueCard(today) {
  const store = ctx.store;
  const soon = addDays(today, 7);
  const due = store.rules.filter((r) => r.active && r.mode === "ask" && r.nextDue <= today);
  const upcoming = store.rules
    .filter((r) => r.active && r.mode !== "track" && r.nextDue > today && r.nextDue <= soon)
    .slice(0, 3);
  if (!due.length && !upcoming.length) return null;
  const run = async (action, rule, done) => {
    try {
      await store.run(action, { rule: rule.id, due: rule.nextDue });
      snack(done);
    } catch (error) {
      failed(error);
    }
  };
  const items = [
    ...due.map((r) =>
      h(
        "li",
        { class: "due" },
        h(
          "div",
          { class: "row" },
          disc(store.categories.find((c) => c.id === r.category)),
          h(
            "span",
            { class: "row-text" },
            h("span", { class: "row-title", text: r.name }),
            h("span", { class: "row-sub warn", text: t("dueSince", { date: date(r.nextDue, "short") }) }),
          ),
          h("span", { class: "row-end amount", text: money(toCents(r.amount) || 0, r.currency) }),
        ),
        h(
          "div",
          { class: "row-buttons" },
          button(t("skip"), () => run("skipRecurring", r, t("skipped")), "text"),
          button(t("add"), () => run("postRecurring", r, t("addedRule", { name: r.name })), "tonal"),
        ),
      ),
    ),
    ...upcoming.map((r) =>
      h(
        "li",
        {},
        h(
          "button",
          { class: "row", type: "button", onClick: () => ctx.go("#/rule/" + r.id) },
          disc(store.categories.find((c) => c.id === r.category)),
          h(
            "span",
            { class: "row-text" },
            h("span", { class: "row-title", text: r.name }),
            h("span", { class: "row-sub", text: t("comingOn", { date: date(r.nextDue, "day") }) }),
          ),
          h("span", { class: "row-end amount", text: money(toCents(r.amount) || 0, r.currency) }),
        ),
      ),
    ),
  ];
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h2", { class: "card-title", text: t("comingUp") }),
      h("button", { class: "btn text", type: "button", onClick: () => ctx.go("#/recurring"), text: t("seeAll") }),
    ),
    h("ul", { class: "list" }, items),
  );
}

function budgetCard(model, today) {
  const rows = categoryBudgets(model, today)
    .filter((r) => !r.category.parent)
    .slice(0, 3);
  if (!rows.length) return null;
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h2", { class: "card-title", text: t("budgets") }),
      h("button", { class: "btn text", type: "button", onClick: () => ctx.go("#/budgets"), text: t("seeAll") }),
    ),
    h(
      "ul",
      { class: "list" },
      rows.map((r) =>
        h(
          "li",
          {},
          h(
            "button",
            {
              class: "row budget-row",
              type: "button",
              onClick: () => ctx.go("#/entries?cat=" + encodeURIComponent(r.category.id) + "&period=month"),
            },
            disc(r.category),
            h(
              "span",
              { class: "row-text" },
              h("span", { class: "row-title", text: r.category.name }),
              progress(r.pct, r.state, r.category.name),
              h("span", {
                class: "row-sub" + (r.state !== "ok" ? " " + r.state : ""),
                text:
                  r.state === "over"
                    ? t("overBy", { amount: money(-r.left) })
                    : t("leftOf", { left: money(r.left), budget: money(r.budget) }),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}

function subscriptionCard(model, today) {
  const store = ctx.store;
  const confirmed = store.rules.filter((r) => r.isSubscription && r.active);
  const skip = new Set([
    ...(store.ui.dismissed || []),
    ...store.rules.map((r) => r.matchKey || keyOf(r.payee || r.name)).filter(Boolean),
  ]);
  const found = findSubscriptions(model.entries, { today, skip });
  if (!confirmed.length && !found.length) return null;
  const yearly = confirmed.reduce((sum, r) => sum + Math.round((toCents(r.amount) || 0) * timesPerYear(r.schedule)), 0);
  const text = confirmed.length
    ? t("youPayYearly", { amount: money(yearly), n: confirmed.length })
    : t("foundSubscriptions", { n: found.length });
  return h(
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
        h("span", { class: "row-sub", text }),
      ),
      found.length && confirmed.length ? h("span", { class: "badge", text: String(found.length) }) : null,
      h("span", { class: "row-chevron" }, icon("chevronRight")),
    ),
  );
}

function recentCard(model) {
  const recent = [...model.entries]
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    .filter((e) => e.date <= ctx.today)
    .slice(0, 6);
  if (!recent.length) return empty("🧾", t("noEntriesYet"), t("noEntriesText"));
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h2", { class: "card-title", text: t("recent") }),
      h("button", { class: "btn text", type: "button", onClick: () => ctx.go("#/entries"), text: t("seeAll") }),
    ),
    h(
      "ul",
      { class: "list" },
      recent.map((e) => entryRow(e, { showDate: true })),
    ),
  );
}
