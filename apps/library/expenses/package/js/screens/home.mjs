// Home: what is safe to spend today, this month at a glance, the balance, quick add, payments due, budgets,
// subscriptions and the latest entries. Which cards show, and in which order, is the user's choice (Edit Home).

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
import { homeOrder, isShown } from "../homecards.mjs";
import { pickCurrency, currencyName } from "./settings.mjs";

// Each card draws itself, or returns null when it has nothing to show (on a first start, the welcome card speaks
// for the month, the balance and the latest entries).
const CARDS = {
  safe: (model, today, first) => safeCard(model, today, first),
  month: (model, today, first) => (first ? null : monthCard(model, today)),
  balance: (model, today, first) => (first ? null : balanceCard(model)),
  quick: (model, today) => quickAdd(model, today),
  due: (model, today) => dueCard(today),
  budgets: (model, today) => budgetCard(model, today),
  subscriptions: (model, today) => subscriptionCard(model, today),
  recent: (model, today, first) => (first ? null : recentCard(model)),
};

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
  const saved = store.ui.home;
  const cards = homeOrder(saved)
    .filter((id) => isShown(saved, id))
    .map((id) => CARDS[id](model, today, first))
    .filter(Boolean);
  content.push(...cards);
  const editHome = () => ctx.go("#/home-edit");
  if (!cards.length && !first) {
    content.push(
      empty("🏠", t("homeEmpty"), t("homeEmptyText"), [button(t("editHome"), editHome, "tonal", { icon: "edit" })]),
    );
  } else {
    content.push(h("div", { class: "home-end" }, button(t("editHome"), editHome, "text", { icon: "edit" })));
  }
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
  const value = cents === null || cents === 0 ? null : fromCents(cents);
  if (value === (current || null)) return;
  try {
    await store.updatePrefs({ monthlyBudget: value });
    budgetSnack(t("monthlyBudget"), value, () => store.updatePrefs({ monthlyBudget: current || null }));
  } catch (error) {
    failed(error);
  }
}

/** Says what a budget is now ("Shopping budget: €100.00"), with Undo. */
export function budgetSnack(name, value, undo) {
  const text = value ? t("budgetNow", { name, amount: money(toCents(value)) }) : t("budgetRemoved", { name });
  snack(text, { label: t("undo"), run: () => undo().catch(failed) });
}

/**
 * Safe to spend today: the day's share of what is left of the month's budget (it changes at midnight), and below it,
 * calmly, how today is going against that share. Without a budget it is one quiet row that offers to set one (on a
 * first start the welcome card already does).
 */
function safeCard(model, today, first) {
  const s = budgetToday(model, today);
  if (s.budget === null) {
    if (first) return null;
    return h(
      "section",
      { class: "card" },
      h(
        "button",
        { class: "row", type: "button", onClick: () => setBudget() },
        h("span", { class: "disc hue-green", "aria-hidden": "true" }, "🎯"),
        h(
          "span",
          { class: "row-text" },
          h("span", { class: "row-title", text: t("safeToday") }),
          h("span", { class: "row-sub", text: t("safeNoBudget") }),
        ),
        h("span", { class: "row-chevron" }, icon("chevronRight")),
      ),
    );
  }
  const share = Math.max(0, s.daily);
  let todayLine;
  if (s.daily <= 0) todayLine = t("monthUsedUp");
  else if (!s.spentToday) todayLine = t("todayNothing");
  else if (s.spentToday <= s.daily)
    todayLine = t("todayFree", { spent: money(s.spentToday), free: money(s.daily - s.spentToday) });
  else todayLine = t("todayOver", { spent: money(s.spentToday), over: money(s.spentToday - s.daily) });
  const monthState = s.spent > s.budget ? "over" : s.pct >= (model.warnAt || 80) ? "near" : "ok";
  return h(
    "section",
    { class: "card hero", "aria-labelledby": "safe-label" },
    h("p", { class: "hero-label", id: "safe-label", text: t("safeToday") }),
    h("p", { class: "hero-amount", text: money(share) }),
    h("p", { class: "hero-hint", text: todayLine }),
    progress(s.pct, monthState, t("monthBudgetUsed", { pct: s.pct })),
    h(
      "p",
      { class: "hero-foot" },
      (s.left >= 0
        ? t("leftOfBudget", { left: money(s.left), budget: money(s.budget) })
        : t("overBudgetBy", { over: money(-s.left), budget: money(s.budget) })) +
        " · " +
        t("daysLeft", { n: s.daysLeft }),
      s.source === "categories" ? " " + t("budgetFromCategories") : "",
    ),
  );
}

function monthCard(model, today) {
  const month = totals(model.entries, startOfMonth(today), endOfMonth(today));
  const vs = againstLastMonth(model, today);
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
    ),
    change ? h("p", { class: "muted", text: change }) : null,
  );
}

/** What all accounts hold together; a tap opens the accounts. */
function balanceCard(model) {
  const worth = netWorth(model, balances(model));
  return h(
    "section",
    { class: "card" },
    h(
      "button",
      { class: "row", type: "button", onClick: () => ctx.go("#/accounts") },
      h("span", { class: "disc hue-grey", "aria-hidden": "true" }, "🏦"),
      h(
        "span",
        { class: "row-text" },
        h("span", { class: "row-title", text: t("balance") }),
        h("span", { class: "row-sub", text: t("allAccounts") }),
      ),
      h(
        "span",
        { class: "row-end" },
        h("span", { class: "amount balance-amount" + (worth.total < 0 ? " negative" : ""), text: money(worth.total) }),
      ),
    ),
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
      {
        class: "quick",
        type: "button",
        "aria-label": t("addIn", { name: c.name }),
        onClick: () => ctx.go("#/add?cat=" + encodeURIComponent(id)),
      },
      disc(c, "small"),
      h("span", { class: "quick-label", text: c.name }),
    );
  });
  chips.push(
    h(
      "button",
      { class: "quick", type: "button", "aria-label": t("addIncome"), onClick: () => ctx.go("#/add?kind=income") },
      h("span", { class: "disc small hue-green", "aria-hidden": "true" }, icon("income")),
      h("span", { class: "quick-label", text: t("incomeKind") }),
    ),
  );
  if (store.accounts.filter((a) => !a.archived).length > 1) {
    chips.push(
      h(
        "button",
        {
          class: "quick",
          type: "button",
          "aria-label": t("addTransfer"),
          onClick: () => ctx.go("#/add?kind=transfer"),
        },
        h("span", { class: "disc small hue-teal", "aria-hidden": "true" }, icon("swap")),
        h("span", { class: "quick-label", text: t("transferKind") }),
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

/**
 * Quick-add tiles never cut a category's name: when a name does not fit, the tiles go two to a row, and if it still
 * does not fit, one to a row with the picture beside the name. Runs after the screen is drawn and when it is resized.
 */
export function fit(root) {
  const row = root.querySelector(".quick-row");
  if (!row) return;
  row.classList.remove("two", "one");
  const cut = () => [...row.querySelectorAll(".quick-label")].some((l) => l.scrollWidth > l.clientWidth + 1);
  if (cut()) row.classList.add("two");
  if (cut()) {
    row.classList.remove("two");
    row.classList.add("one");
  }
}
