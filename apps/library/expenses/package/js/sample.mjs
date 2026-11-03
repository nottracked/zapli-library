// Example data for the browser preview (and, through dev/make-sample-data.mjs, for the library listing): a made-up
// household's last three months, dated relative to the day it is made so the month on screen is never empty.
// Every name in it is invented.

import { addDays, addMonths, startOfMonth, today as todayOf } from "./dates.mjs";

const CATEGORIES = [
  ["cat-groceries", "Groceries", "shopping_cart", "expense", "450.00"],
  ["cat-eating-out", "Eating out", "restaurant", "expense", "160.00"],
  ["cat-coffee", "Coffee", "local_cafe", "expense", null, "cat-eating-out"],
  ["cat-transport", "Transport", "directions_car", "expense", "120.00"],
  ["cat-home", "Home and rent", "home", "expense", null],
  ["cat-bills", "Bills", "receipt_long", "expense", "140.00"],
  ["cat-subscriptions", "Subscriptions", "autorenew", "expense", "45.00"],
  ["cat-health", "Health", "medical_services", "expense", null],
  ["cat-shopping", "Shopping", "shopping_bag", "expense", null],
  ["cat-going-out", "Going out", "movie", "expense", "80.00"],
  ["cat-other", "Other", "category", "expense", null],
  ["cat-salary", "Salary", "work", "income", null],
  ["cat-gifts-in", "Gifts and refunds", "cake", "income", null],
];

const ACCOUNTS = [
  ["acc-bank", "Bank account", "bank", "1240.00", 0],
  ["acc-cash", "Cash", "cash", "80.00", 1],
  ["acc-savings", "Savings", "savings", "3500.00", 2],
];

// [day of month or weekday rule, category, amount, note, payee, account, kind]
const MONTHLY = [
  [1, "cat-home", "850.00", "Rent", "Lindenhof Flats", "acc-bank", "expense", "rec-rent"],
  [1, "cat-subscriptions", "12.99", "Streaming", "Film Club Online", "acc-bank", "expense"],
  [3, "cat-bills", "34.90", "Phone and internet", "Northline Mobile", "acc-bank", "expense"],
  [8, "cat-health", "29.00", "Gym", "Riverside Gym", "acc-bank", "expense"],
  [15, "cat-subscriptions", "2.99", "Cloud storage", "Cloud Locker", "acc-bank", "expense"],
  [25, "cat-salary", "2450.00", "Salary", "Example Works", "acc-bank", "income", "rec-salary"],
];

const WEEKLY = [
  // [weekday offset in the week (0 = Monday), category, amounts cycled, note, payee, account]
  [5, "cat-groceries", ["64.30", "71.85", "58.40", "69.10"], "Weekly shop", "Fresh Corner", "acc-bank"],
  [2, "cat-coffee", ["3.20", "3.60", "2.90"], "Coffee", "Corner Café", "acc-cash"],
  [4, "cat-transport", ["48.00", "52.30", "45.10"], "Fuel", "Fuel Stop", "acc-bank"],
];

const ONE_OFF = [
  // [days before today, category, amount, note, account, tags]
  [1, "cat-eating-out", "21.30", "Lunch with the team", "acc-bank", "work"],
  [4, "cat-shopping", "39.99", "New shoes", "acc-bank", ""],
  [9, "cat-going-out", "24.00", "Cinema", "acc-cash", ""],
  [12, "cat-eating-out", "46.20", "Dinner with friends", "acc-bank", ""],
  [18, "cat-health", "18.90", "Pharmacy", "acc-cash", ""],
  [23, "cat-other", "28.00", "Haircut", "acc-cash", ""],
  [27, "cat-going-out", "58.00", "Concert tickets", "acc-bank", ""],
  [33, "cat-gifts-in", "40.00", "Birthday present from Gran", "acc-cash", ""],
  [41, "cat-shopping", "89.00", "Winter jacket", "acc-bank", ""],
  [47, "cat-eating-out", "32.60", "Pizza night", "acc-bank", ""],
  [55, "cat-other", "15.00", "Library fine and copies", "acc-cash", ""],
  [62, "cat-going-out", "19.50", "Bowling", "acc-cash", ""],
];

/** The example records by entity, made on `now` and covering about `days` days before it. */
export function sampleData(now, { days = 92, maxEntries = 400 } = {}) {
  const today = typeof now === "string" ? now : todayOf(now);
  const since = addDays(today, -days);
  const stamp = today + "T08:00:00.000Z";
  const meta = (id) => ({ id, createdAt: stamp, updatedAt: stamp, _version: 1 });
  const category = CATEGORIES.map(([id, name, icon, kind, budget, parent]) => {
    const c = { ...meta(id), name, icon, kind, archived: false };
    if (budget) c.budget = budget;
    if (parent) c.parent = parent;
    return c;
  });
  const account = ACCOUNTS.map(([id, name, type, opening, position]) => ({
    ...meta(id),
    name,
    type,
    opening,
    position,
    includeInTotal: true,
    archived: false,
  }));
  const entries = [];
  let n = 0;
  const add = (values) => {
    n++;
    entries.push({ ...meta("ent-" + String(n).padStart(3, "0")), baseAmount: values.amount, ...values });
  };
  // Monthly payments of the last three months and this one, up to today.
  for (let m = -3; m <= 0; m++) {
    const month = addMonths(startOfMonth(today), m);
    for (const [day, cat, amount, note, payee, acc, kind, rule] of MONTHLY) {
      const date = month.slice(0, 8) + String(day).padStart(2, "0");
      if (date > today || date < since) continue;
      const entry = { date, kind, amount, category: cat, note, payee, account: acc };
      if (rule) entry.recurring = rule;
      add(entry);
    }
    // A monthly move to savings on the 26th.
    const saveDate = month.slice(0, 8) + "26";
    if (saveDate <= today && saveDate >= since) {
      add({
        date: saveDate,
        kind: "transfer",
        amount: "200.00",
        account: "acc-bank",
        toAccount: "acc-savings",
        note: "To savings",
      });
    }
  }
  // Weekly spending.
  for (let week = 0; week * 7 <= days; week++) {
    const monday = addDays(today, -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7) - week * 7);
    for (const [offset, cat, amounts, note, payee, acc] of WEEKLY) {
      const date = addDays(monday, offset);
      if (date > today || date < since) continue;
      add({ date, kind: "expense", amount: amounts[week % amounts.length], category: cat, note, payee, account: acc });
    }
  }
  for (const [before, cat, amount, note, acc, tags] of ONE_OFF) {
    if (before > days) continue;
    const entry = { date: addDays(today, -before), kind: "expense", amount, category: cat, note, account: acc };
    if (cat === "cat-gifts-in") entry.kind = "income";
    if (tags) entry.tags = tags;
    add(entry);
  }
  // A purchase abroad in another currency, with the rate typed for it.
  add({
    date: addDays(today, -20),
    kind: "expense",
    amount: "45.00",
    currency: "USD",
    rate: "0.920000",
    baseAmount: "41.40",
    category: "cat-shopping",
    note: "Souvenirs",
    account: "acc-bank",
    tags: "trip",
  });
  entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  const expense = entries.slice(0, maxEntries);
  const nextOf = (day) => {
    const thisMonth = today.slice(0, 8) + String(day).padStart(2, "0");
    return thisMonth > today ? thisMonth : addMonths(startOfMonth(today), 1).slice(0, 8) + String(day).padStart(2, "0");
  };
  const recurring = [
    {
      ...meta("rec-rent"),
      name: "Rent",
      amount: "850.00",
      kind: "expense",
      category: "cat-home",
      account: "acc-bank",
      payee: "Lindenhof Flats",
      schedule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDue: nextOf(1),
      mode: "auto",
      active: true,
      isSubscription: false,
    },
    {
      ...meta("rec-gym"),
      name: "Gym",
      amount: "29.00",
      kind: "expense",
      category: "cat-health",
      account: "acc-bank",
      payee: "Riverside Gym",
      schedule: "FREQ=MONTHLY;BYMONTHDAY=8",
      nextDue: today,
      mode: "ask",
      active: true,
      isSubscription: true,
      matchKey: "riverside gym",
    },
    {
      ...meta("rec-salary"),
      name: "Salary",
      amount: "2450.00",
      kind: "income",
      category: "cat-salary",
      account: "acc-bank",
      payee: "Example Works",
      schedule: "FREQ=MONTHLY;BYMONTHDAY=25",
      nextDue: nextOf(25),
      mode: "auto",
      active: true,
      isSubscription: false,
    },
  ];
  return {
    prefs: [
      {
        ...meta("prefs"),
        currency: "EUR",
        monthlyBudget: "1600.00",
        budgetAlerts: true,
        warnAt: 80,
        addedNotice: true,
        remindDaily: false,
        remindAt: "20:00",
        defaultAccount: "acc-bank",
      },
    ],
    account,
    category,
    expense,
    recurring,
    rate: [{ ...meta("rate-usd"), currency: "USD", perMain: "0.920000", updated: addDays(today, -20) }],
    importLog: [],
  };
}
