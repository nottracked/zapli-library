// What the numbers on the screens are made of: balances, totals, budgets and "safe to spend today". Every function
// here is pure: it reads a model and returns numbers, so the same rules can be tested without a phone.
//
// The model: { main, defaultAccount, entries, categories (Map id → category), accounts (list), rates (Map currency
// → millionths of the main currency per unit), monthlyBudget (cents or null), warnAt (percent) }. Each entry carries
// `cents` (its amount in its own currency) and `base` (the amount in the main currency) next to its stored fields.

import { unconvertCents, convertCents, scaleCents, toCents } from "./money.mjs";
import { addDays, addMonths, daysBetween, endOfMonth, monthKey, startOfMonth } from "./dates.mjs";

/** The account an entry belongs to. Spending and income without one count toward the usual account. */
export function accountOf(model, entry) {
  if (entry.account) return entry.account;
  return entry.kind === "transfer" ? null : model.defaultAccount;
}

/** The category an entry counts toward in summaries: the top category of a subcategory. */
export function topCategoryOf(model, id) {
  const category = id ? model.categories.get(id) : null;
  if (!category) return id || null;
  return category.parent && model.categories.has(category.parent) ? category.parent : category.id;
}

/** The ids of a category and its subcategories. */
export function withChildren(model, id) {
  const ids = new Set([id]);
  for (const c of model.categories.values()) if (c.parent === id) ids.add(c.id);
  return ids;
}

/** An entry's amount in an account's currency. */
export function amountIn(model, entry, account) {
  const accountCurrency = (account && account.currency) || model.main;
  const entryCurrency = entry.currency || model.main;
  if (entryCurrency === accountCurrency) return entry.cents;
  if (accountCurrency === model.main) return entry.base;
  const rate = model.rates.get(accountCurrency);
  return rate ? unconvertCents(entry.base, rate) : entry.cents;
}

/** What an entry does to one account's balance, in that account's currency (0 when it does not touch it). */
export function effectOn(model, entry, account) {
  let effect = 0;
  if (accountOf(model, entry) === account.id) {
    effect += entry.kind === "income" ? amountIn(model, entry, account) : -amountIn(model, entry, account);
  }
  if (entry.kind === "transfer" && entry.toAccount === account.id) {
    effect += entry.toCents !== null && entry.toCents !== undefined ? entry.toCents : amountIn(model, entry, account);
  }
  return effect;
}

/** Each account's balance in its own currency: its starting balance plus every entry that touches it. */
export function balances(model) {
  const byId = new Map();
  for (const account of model.accounts) byId.set(account.id, account.openingCents || 0);
  const accounts = new Map(model.accounts.map((a) => [a.id, a]));
  for (const entry of model.entries) {
    const from = accountOf(model, entry);
    if (from && accounts.has(from))
      byId.set(from, byId.get(from) + effectOn(model, { ...entry, toAccount: null }, accounts.get(from)));
    if (entry.kind === "transfer" && entry.toAccount && accounts.has(entry.toAccount)) {
      const to = accounts.get(entry.toAccount);
      const received =
        entry.toCents !== null && entry.toCents !== undefined ? entry.toCents : amountIn(model, entry, to);
      byId.set(to.id, byId.get(to.id) + received);
    }
  }
  return byId;
}

/** An amount in an account's currency, in the main currency (unchanged when there is no rate). */
export function inMain(model, cents, currency) {
  if (!currency || currency === model.main) return cents;
  const rate = model.rates.get(currency);
  return rate ? convertCents(cents, rate) : cents;
}

/** All accounts counted in the total, in the main currency; `missingRates` lists currencies without a rate. */
export function netWorth(model, balanceMap = balances(model)) {
  let total = 0;
  const missingRates = new Set();
  for (const account of model.accounts) {
    if (account.archived || account.includeInTotal === false) continue;
    const currency = account.currency || model.main;
    if (currency !== model.main && !model.rates.has(currency)) missingRates.add(currency);
    total += inMain(model, balanceMap.get(account.id) || 0, currency);
  }
  return { total, missingRates: [...missingRates] };
}

/** Spending, income and counts between two dates (both included), in the main currency. Transfers are left out. */
export function totals(entries, from, to) {
  let spent = 0;
  let income = 0;
  let count = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    count++;
    if (e.kind === "expense") spent += e.base;
    else if (e.kind === "income") income += e.base;
  }
  return { spent, income, net: income - spent, count };
}

/** Spending (or income) per category between two dates, subcategories rolled into their top category. */
export function byCategory(model, from, to, kind = "expense", rollup = true) {
  const sums = new Map();
  for (const e of model.entries) {
    if (e.kind !== kind || e.date < from || e.date > to) continue;
    const id = (rollup ? topCategoryOf(model, e.category) : e.category) || "";
    const row = sums.get(id) || { id, cents: 0, count: 0 };
    row.cents += e.base;
    row.count++;
    sums.set(id, row);
  }
  return [...sums.values()].sort((a, b) => b.cents - a.cents);
}

/** Spending (or income) per day between two dates. */
export function byDay(entries, from, to, kind = "expense") {
  const days = new Map();
  for (const e of entries) {
    if (e.kind !== kind || e.date < from || e.date > to) continue;
    days.set(e.date, (days.get(e.date) || 0) + e.base);
  }
  return days;
}

/** Spending and income for each of the `count` months up to the month of `date`, oldest first. */
export function monthSeries(entries, date, count = 12) {
  const first = addMonths(startOfMonth(date), -(count - 1));
  const rows = [];
  const index = new Map();
  for (let i = 0; i < count; i++) {
    const key = monthKey(addMonths(first, i));
    index.set(key, rows.length);
    rows.push({ month: key, spent: 0, income: 0 });
  }
  for (const e of entries) {
    const i = index.get(monthKey(e.date));
    if (i === undefined) continue;
    if (e.kind === "expense") rows[i].spent += e.base;
    else if (e.kind === "income") rows[i].income += e.base;
  }
  return rows;
}

/** The monthly budget in force: the one the user set, else the sum of the top categories' budgets. */
export function monthlyBudget(model) {
  if (model.monthlyBudget && model.monthlyBudget > 0) return { cents: model.monthlyBudget, source: "total" };
  let sum = 0;
  for (const c of model.categories.values()) {
    if (c.kind !== "income" && !c.parent && c.budgetCents > 0) sum += c.budgetCents;
  }
  return sum > 0 ? { cents: sum, source: "categories" } : { cents: null, source: null };
}

/**
 * This month against its budget, and what is safe to spend today: what is left of the budget after the other days'
 * spending of the month (later days included), shared out over the days left with today, minus today's spending.
 * It changes at midnight, when today becomes one of the other days. The home-screen widget works it out the same way.
 */
export function budgetToday(model, today) {
  const from = startOfMonth(today);
  const to = endOfMonth(today);
  const budget = monthlyBudget(model);
  let spent = 0;
  let spentToday = 0;
  for (const e of model.entries) {
    if (e.kind !== "expense" || e.date < from || e.date > to) continue;
    spent += e.base;
    if (e.date === today) spentToday += e.base;
  }
  const daysLeft = daysBetween(today, to) + 1;
  const result = {
    budget: budget.cents,
    source: budget.source,
    spent,
    spentToday,
    daysLeft,
    left: null,
    daily: null,
    safe: null,
  };
  if (budget.cents === null) return result;
  result.left = budget.cents - spent;
  result.daily = scaleCents(budget.cents - (spent - spentToday), 1, daysLeft);
  result.safe = result.daily - spentToday;
  result.pct = Math.round((spent * 100) / budget.cents);
  return result;
}

/** Spending of a category and its subcategories between two dates. */
export function categorySpent(model, id, from, to) {
  const ids = withChildren(model, id);
  let cents = 0;
  for (const e of model.entries) {
    if (e.kind === "expense" && ids.has(e.category) && e.date >= from && e.date <= to) cents += e.base;
  }
  return cents;
}

/** Every category with a budget, with this month's spending (subcategories included) and its state. */
export function categoryBudgets(model, today) {
  const from = startOfMonth(today);
  const to = endOfMonth(today);
  const warnAt = model.warnAt || 80;
  const rows = [];
  for (const c of model.categories.values()) {
    if (!(c.budgetCents > 0)) continue;
    const spent = categorySpent(model, c.id, from, to);
    const pct = Math.round((spent * 100) / c.budgetCents);
    const state = spent > c.budgetCents ? "over" : pct >= warnAt ? "near" : "ok";
    rows.push({ category: c, budget: c.budgetCents, spent, left: c.budgetCents - spent, pct, state });
  }
  return rows.sort((a, b) => b.pct - a.pct);
}

/** The average monthly spending of a category over the `months` full months before today's month. */
export function averageMonthly(model, id, today, months = 3) {
  const end = addDays(startOfMonth(today), -1);
  const start = startOfMonth(addMonths(startOfMonth(today), -months));
  return Math.round(categorySpent(model, id, start, end) / months);
}

/** This month's spending up to today against the same days of last month: {now, then, pct} (pct null without data). */
export function againstLastMonth(model, today) {
  const nowFrom = startOfMonth(today);
  const thenFrom = addMonths(nowFrom, -1);
  const thenTo = addMonths(today, -1);
  const now = totals(model.entries, nowFrom, today).spent;
  const then = totals(model.entries, thenFrom, thenTo).spent;
  return { now, then, pct: then > 0 ? Math.round(((now - then) * 100) / then) : null };
}

/** An account's entries, newest first, each with the balance after it. */
export function accountHistory(model, accountId) {
  const account = model.accounts.find((a) => a.id === accountId);
  if (!account) return [];
  const touching = model.entries.filter((e) => accountOf(model, e) === accountId || e.toAccount === accountId);
  const ordered = [...touching].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  let balance = account.openingCents || 0;
  const rows = ordered.map((entry) => {
    const effect = effectOn(model, entry, account);
    balance += effect;
    return { entry, effect, balance };
  });
  return rows.reverse();
}

/** The words of a text for searching: lower case, without accents. */
export function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The tags of an entry ("trip, Coffee" → ["trip", "coffee"]). */
export function tagsOf(entry) {
  return String(entry.tags || "")
    .split(/[,;#]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Entries matching a filter: {text, kinds (Set), categories (Set, subcategories included by the caller), accounts
 * (Set), tag, from, to, min, max (cents)}. The text matches notes, payees, tags, category and account names, and
 * amounts typed with either decimal mark.
 */
export function filterEntries(model, filter) {
  const text = fold(filter.text || "").trim();
  const words = text ? text.split(/\s+/) : [];
  const typedCents = /^\d+([.,]\d{1,2})?$/.test(text) ? toCents(text.replace(",", ".")) : null;
  const accountNames = new Map(model.accounts.map((a) => [a.id, fold(a.name)]));
  return model.entries.filter((e) => {
    if (filter.kinds && filter.kinds.size && !filter.kinds.has(e.kind)) return false;
    if (filter.from && e.date < filter.from) return false;
    if (filter.to && e.date > filter.to) return false;
    if (filter.categories && filter.categories.size && !filter.categories.has(e.category)) return false;
    if (filter.accounts && filter.accounts.size) {
      const from = accountOf(model, e);
      if (!filter.accounts.has(from) && !filter.accounts.has(e.toAccount)) return false;
    }
    if (filter.tag && !tagsOf(e).includes(filter.tag)) return false;
    if (filter.min !== null && filter.min !== undefined && e.cents < filter.min) return false;
    if (filter.max !== null && filter.max !== undefined && e.cents > filter.max) return false;
    if (!words.length) return true;
    if (typedCents !== null && e.cents === typedCents) return true;
    const category = e.category ? model.categories.get(e.category) : null;
    const parent = category && category.parent ? model.categories.get(category.parent) : null;
    const hay = [
      e.note,
      e.payee,
      e.tags,
      category && category.name,
      parent && parent.name,
      accountNames.get(e.account),
      accountNames.get(e.toAccount),
    ]
      .map(fold)
      .join(" ");
    return words.every((w) => hay.includes(w));
  });
}

/** Every tag used, most used first. */
export function allTags(entries) {
  const counts = new Map();
  for (const e of entries) for (const tag of tagsOf(e)) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

/** The categories used most in the last 90 days, for the quick-add row and the top of the picker. */
export function frequentCategories(model, today, kind = "expense", limit = 8) {
  const since = addDays(today, -90);
  const counts = new Map();
  for (const e of model.entries) {
    if (e.kind !== kind || !e.category || e.date < since) continue;
    counts.set(e.category, (counts.get(e.category) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([id]) => {
      const c = model.categories.get(id);
      return c && !c.archived;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
