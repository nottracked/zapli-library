// Checks the page's pure logic with Node 22: money, the calculator, dates, repeat rules, balances, budgets and
// "safe to spend today", the subscription finder, the page-made CSV and the translations.
// Run from the repository root: node apps/library/expenses/dev/test-logic.mjs

import assert from "node:assert/strict";
import * as money from "../package/js/money.mjs";
import * as calc from "../package/js/calc.mjs";
import * as dates from "../package/js/dates.mjs";
import * as rrule from "../package/js/rrule.mjs";
import * as ledger from "../package/js/ledger.mjs";
import * as subs from "../package/js/subs.mjs";
import * as csv from "../package/js/csv.mjs";
import { STRINGS, translator } from "../package/js/i18n.mjs";
import { sampleData } from "../package/js/sample.mjs";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error("FAIL " + name);
    throw error;
  }
}

// ---------------------------------------------------------------- money
test("cents from stored decimals", () => {
  assert.equal(money.toCents("12.50"), 1250);
  assert.equal(money.toCents("12.5"), 1250);
  assert.equal(money.toCents("-3"), -300);
  assert.equal(money.toCents("0.005"), 1);
  assert.equal(money.toCents("1.004"), 100);
  assert.equal(money.toCents(""), null);
  assert.equal(money.toCents("abc"), null);
  assert.equal(money.fromCents(1250), "12.50");
  assert.equal(money.fromCents(-5), "-0.05");
  assert.equal(money.fromCents(0), "0.00");
});
test("rates and conversion are exact", () => {
  assert.equal(money.toMicros("0.92"), 920000);
  assert.equal(money.fromMicros(920000), "0.920000");
  assert.equal(money.convertCents(4500, 920000), 4140); // 45.00 USD at 0.92 → 41.40 EUR
  assert.equal(money.convertCents(1, 500000), 1); // 0.005 rounds half away from zero
  assert.equal(money.convertCents(-1, 500000), -1);
  assert.equal(money.unconvertCents(4140, 920000), 4500);
  assert.equal(money.invertMicros(920000), 1086957); // 1 EUR = 1.086957 USD
  assert.equal(money.scaleCents(100, 1, 3), 33);
  assert.equal(money.scaleCents(200, 1, 3), 67);
});
test("amounts in English and Slovak", () => {
  assert.equal(money.formatMoney(123450, "EUR", "en-GB"), "€1,234.50");
  assert.equal(money.formatMoney(123450, "EUR", "sk-SK").replace(/\s/g, " "), "1 234,50 €");
  assert.equal(money.formatMoney(-1250, "EUR", "en-GB"), "−€12.50");
  assert.equal(money.formatMoney(1250, "USD", "en-US", { sign: "always" }), "+$12.50");
  assert.equal(money.formatMoney(1250, "CZK", "sk-SK").replace(/\s/g, " "), "12,50 Kč");
  assert.equal(money.decimalMark("sk-SK"), ",");
  assert.equal(money.decimalMark("en-US"), ".");
});
test("typed amounts with either decimal mark", () => {
  assert.equal(money.parseTypedAmount("1 234,56"), 123456);
  assert.equal(money.parseTypedAmount("1,234.56"), 123456);
  assert.equal(money.parseTypedAmount("12,5"), 1250);
  assert.equal(money.parseTypedAmount("€ 40"), 4000);
  assert.equal(money.parseTypedAmount("1.234"), 123400); // three digits after a mark: thousands
  assert.equal(money.parseTypedAmount("-7,20"), -720);
  assert.equal(money.parseTypedAmount(""), null);
  assert.equal(money.parseTypedRate("0,92"), 920000);
  assert.equal(money.parseTypedRate("x"), null);
  assert.equal(money.currencyOfLocale("en-US"), "USD");
  assert.equal(money.currencyOfLocale("sk-SK"), "EUR");
});

// ---------------------------------------------------------------- calculator
test("calculator keys", () => {
  let e = "";
  for (const k of ["1", "2", ".", "5", "0", "0"]) e = calc.press(e, k);
  assert.equal(e, "12.50"); // a third decimal is refused
  e = calc.press(e, "+");
  e = calc.press(e, "×"); // replaces the operator
  assert.equal(e, "12.50×");
  e = calc.press(e, "2");
  assert.equal(calc.evaluate(e).cents, 2500);
  assert.equal(calc.press("", "−"), "");
  assert.equal(calc.press("", "."), "0.");
  assert.equal(calc.press("0", "7"), "7");
  assert.equal(calc.press("5.", "+"), "5+");
  assert.equal(calc.press("12", "back"), "1");
  assert.equal(calc.press("12+3", "."), "12+3.");
  assert.equal(calc.press("12+3.", "."), "12+3.");
});
test("calculator results", () => {
  assert.equal(calc.evaluate("12.50÷3").cents, 417);
  assert.equal(calc.evaluate("3×2.50").cents, 750);
  assert.equal(calc.evaluate("10+5×2").cents, 2000);
  assert.equal(calc.evaluate("10−2.5−0.5").cents, 700);
  assert.equal(calc.evaluate("9.99+").cents, 999); // a trailing operator is ignored
  assert.equal(calc.evaluate("5÷0").error, "divideByZero");
  assert.equal(calc.evaluate("").error, "empty");
  assert.equal(calc.evaluate("2−5").cents, -300);
  assert.equal(calc.display("12.5+3", ","), "12,5 + 3");
  assert.equal(calc.fromCentsText(1250), "12.5");
  assert.equal(calc.fromCentsText(1205), "12.05");
  assert.equal(calc.fromCentsText(1200), "12");
  assert.equal(calc.hasOperator("12+"), false);
  assert.equal(calc.hasOperator("12+3"), true);
});

// ---------------------------------------------------------------- dates
test("dates", () => {
  assert.equal(dates.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(dates.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(dates.addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(dates.addMonths("2026-11-15", -12), "2025-11-15");
  assert.equal(dates.endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(dates.daysBetween("2026-11-03", "2026-11-30"), 27);
  assert.equal(dates.weekday("2026-11-02"), 0); // a Monday
  assert.equal(dates.startOfWeek("2026-11-05", 0), "2026-11-02");
  assert.equal(dates.startOfWeek("2026-11-05", 6), "2026-11-01");
  assert.equal(dates.today(new Date(2026, 10, 3, 23, 30)), "2026-11-03");
  assert.equal(dates.isIsoDate("2026-02-30"), false);
  assert.equal(dates.formatDate("2026-11-03", "sk-SK", "numeric").replace(/\s/g, " "), "3. 11. 2026");
  assert.equal(dates.formatDate("2026-11-03", "en-GB", "medium"), "3 Nov 2026");
  assert.equal(dates.formatDate("2026-11-03", "en-US", "medium"), "Nov 3, 2026");
  assert.equal(dates.weekStartsSunday("en-US"), true);
  assert.equal(dates.weekStartsSunday("sk-SK"), false);
});

// ---------------------------------------------------------------- repeat rules
test("repeat rules", () => {
  assert.equal(rrule.nextOn("FREQ=MONTHLY;BYMONTHDAY=15", "2026-11-03"), "2026-11-15");
  assert.equal(rrule.nextOn("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-02-03"), "2026-02-28");
  assert.equal(rrule.nextOn("FREQ=WEEKLY;BYDAY=MO", "2026-11-03"), "2026-11-09");
  assert.equal(rrule.nextOn("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15", "2026-11-03"), "2027-03-15");
  const biweekly = "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;DTSTART=20261013";
  assert.deepEqual(rrule.datesBetween(biweekly, "2026-10-01", "2026-11-30"), [
    "2026-10-13",
    "2026-10-27",
    "2026-11-10",
    "2026-11-24",
  ]);
  assert.deepEqual(
    rrule.datesBetween("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5;DTSTART=20260105", "2026-01-01", "2026-12-31"),
    ["2026-01-05", "2026-04-05", "2026-07-05", "2026-10-05"],
  );
  assert.equal(rrule.build("month", 1, "2026-11-30"), "FREQ=MONTHLY;BYMONTHDAY=-1");
  assert.equal(rrule.build("week", 2, "2026-11-03"), "FREQ=WEEKLY;BYDAY=TU;INTERVAL=2;DTSTART=20261103");
  assert.equal(rrule.build("year", 1, "2026-03-15"), "FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15");
  assert.equal(rrule.build("day", 1, "2026-03-15"), "FREQ=DAILY");
  assert.equal(rrule.timesPerYear("FREQ=MONTHLY;BYMONTHDAY=1"), 12);
  assert.equal(rrule.timesPerYear("FREQ=WEEKLY;BYDAY=MO,TH"), 104);
  assert.equal(rrule.timesPerYear(biweekly), 26);
  assert.deepEqual(rrule.pickerOf("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5;DTSTART=20260105"), {
    unit: "month",
    interval: 3,
  });
  assert.equal(rrule.parse("RRULE:FREQ=DAILY"), null);
  const t = translator("en");
  assert.equal(rrule.describe("FREQ=MONTHLY;BYMONTHDAY=15", t, "en-GB"), "Every month on day 15");
  assert.equal(rrule.describe(biweekly, t, "en-GB"), "Every 2 weeks on Tuesday");
  assert.equal(rrule.describe("FREQ=MONTHLY;BYMONTHDAY=-1", t, "en-GB"), "Every month on the last day");
  assert.equal(rrule.describe("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15", t, "en-GB"), "Every year on 15 March");
  const sk = translator("sk");
  assert.equal(rrule.describe("FREQ=MONTHLY;BYMONTHDAY=15", sk, "sk-SK"), "Každý mesiac, 15. deň");
  assert.equal(rrule.describe("FREQ=WEEKLY;BYDAY=MO", sk, "sk-SK"), "Každý týždeň v pondelok");
});

// ---------------------------------------------------------------- ledger
function entry(id, date, kind, amount, extra = {}) {
  const e = { id, date, kind, amount, createdAt: date + "T10:00:00Z", ...extra };
  e.cents = money.toCents(amount);
  e.base = money.toCents(extra.baseAmount ?? amount);
  e.toCents = extra.toAmount ? money.toCents(extra.toAmount) : null;
  return e;
}
function model(entries, extra = {}) {
  return {
    main: "EUR",
    defaultAccount: "bank",
    entries,
    categories: new Map([
      ["food", { id: "food", name: "Food", kind: "expense", budgetCents: 30000 }],
      ["coffee", { id: "coffee", name: "Coffee", kind: "expense", parent: "food", budgetCents: 5000 }],
      ["rent", { id: "rent", name: "Rent", kind: "expense", budgetCents: null }],
      ["pay", { id: "pay", name: "Pay", kind: "income" }],
    ]),
    accounts: [
      { id: "bank", name: "Bank", openingCents: 100000 },
      { id: "cash", name: "Cash", openingCents: 5000 },
      { id: "usd", name: "Dollars", currency: "USD", openingCents: 10000 },
    ],
    rates: new Map([["USD", 920000]]),
    monthlyBudget: null,
    warnAt: 80,
    ...extra,
  };
}
test("balances with transfers, currencies and entries without an account", () => {
  const m = model([
    entry("a", "2026-11-01", "expense", "50.00", { account: "cash" }),
    entry("b", "2026-11-02", "expense", "20.00"), // no account: the usual one
    entry("c", "2026-11-02", "income", "1000.00", { account: "bank", category: "pay" }),
    entry("d", "2026-11-03", "transfer", "100.00", { account: "bank", toAccount: "cash" }),
    entry("e", "2026-11-03", "transfer", "92.00", { account: "bank", toAccount: "usd", toAmount: "100.00" }),
    entry("f", "2026-11-03", "expense", "10.00", {
      account: "usd",
      currency: "USD",
      rate: "0.920000",
      baseAmount: "9.20",
    }),
    entry("g", "2026-11-03", "expense", "5.00", { account: "bank", currency: "USD", baseAmount: "4.60" }), // paid abroad by card
    entry("h", "2026-11-03", "transfer", "30.00", { account: "cash" }), // money that left for an account not kept here
  ]);
  const b = ledger.balances(m);
  assert.equal(b.get("bank"), 100000 - 2000 + 100000 - 10000 - 9200 - 460);
  assert.equal(b.get("cash"), 5000 - 5000 + 10000 - 3000);
  assert.equal(b.get("usd"), 10000 + 10000 - 1000);
  const worth = ledger.netWorth(m, b);
  assert.equal(worth.total, b.get("bank") + b.get("cash") + money.convertCents(b.get("usd"), 920000));
  assert.deepEqual(worth.missingRates, []);
  const history = ledger.accountHistory(m, "cash");
  assert.equal(history[0].balance, b.get("cash"));
  assert.equal(history[history.length - 1].balance, 5000 - 5000);
});
test("totals, categories and the month series", () => {
  const m = model([
    entry("a", "2026-11-01", "expense", "50.00", { category: "food" }),
    entry("b", "2026-11-02", "expense", "4.00", { category: "coffee" }),
    entry("c", "2026-11-02", "income", "1000.00", { category: "pay" }),
    entry("d", "2026-11-03", "transfer", "100.00", { account: "bank", toAccount: "cash" }),
    entry("e", "2026-10-15", "expense", "800.00", { category: "rent" }),
  ]);
  const t = ledger.totals(m.entries, "2026-11-01", "2026-11-30");
  assert.deepEqual(t, { spent: 5400, income: 100000, net: 94600, count: 4 });
  const cats = ledger.byCategory(m, "2026-11-01", "2026-11-30");
  assert.deepEqual(
    cats.map((c) => [c.id, c.cents]),
    [["food", 5400]],
  );
  const own = ledger.byCategory(m, "2026-11-01", "2026-11-30", "expense", false);
  assert.deepEqual(own.map((c) => c.id).sort(), ["coffee", "food"]);
  const series = ledger.monthSeries(m.entries, "2026-11-03", 3);
  assert.deepEqual(
    series.map((r) => [r.month, r.spent, r.income]),
    [
      ["2026-09", 0, 0],
      ["2026-10", 80000, 0],
      ["2026-11", 5400, 100000],
    ],
  );
  assert.equal(ledger.categorySpent(m, "food", "2026-11-01", "2026-11-30"), 5400);
});
test("safe to spend today", () => {
  const entries = [
    entry("a", "2026-11-01", "expense", "300.00", { category: "rent" }),
    entry("b", "2026-11-02", "expense", "60.00", { category: "food" }),
    entry("c", "2026-11-10", "expense", "40.00", { category: "food" }), // already planned for later this month
    entry("d", "2026-11-10", "expense", "12.00", { category: "food" }), // today
    entry("e", "2026-11-10", "income", "999.00", { category: "pay" }),
  ];
  const m = model(entries, { monthlyBudget: 120000 });
  const s = ledger.budgetToday(m, "2026-11-10");
  assert.equal(s.budget, 120000);
  assert.equal(s.spent, 41200);
  assert.equal(s.spentToday, 5200);
  assert.equal(s.daysLeft, 21);
  // (1,200 − (412 − 52)) / 21 = 40.00 a day; minus 52 spent today.
  assert.equal(s.daily, 4000);
  assert.equal(s.safe, -1200);
  assert.equal(s.left, 78800);
  // Without a total budget the top categories' budgets count (Food 300; Coffee is part of Food).
  const c = ledger.budgetToday(model(entries), "2026-11-30");
  assert.equal(c.budget, 30000);
  assert.equal(c.source, "categories");
  assert.equal(c.daysLeft, 1);
  assert.equal(ledger.budgetToday(model([]), "2026-11-30").safe, 30000);
  const none = ledger.budgetToday(model([], { categories: new Map() }), "2026-11-30");
  assert.equal(none.budget, null);
  assert.equal(none.safe, null);
});
test("category budgets include subcategories", () => {
  const m = model([
    entry("a", "2026-11-01", "expense", "250.00", { category: "food" }),
    entry("b", "2026-11-02", "expense", "45.00", { category: "coffee" }),
  ]);
  const rows = ledger.categoryBudgets(m, "2026-11-10");
  const food = rows.find((r) => r.category.id === "food");
  const coffee = rows.find((r) => r.category.id === "coffee");
  assert.equal(food.spent, 29500);
  assert.equal(food.state, "near");
  assert.equal(coffee.state, "near");
  assert.equal(coffee.pct, 90);
});
test("search and filters", () => {
  const m = model([
    entry("a", "2026-11-01", "expense", "12.50", { category: "coffee", note: "Flat white", tags: "work, café" }),
    entry("b", "2026-11-02", "expense", "60.00", { category: "food", payee: "Fresh Corner", account: "cash" }),
    entry("c", "2026-11-02", "income", "1000.00", { category: "pay" }),
  ]);
  const ids = (f) =>
    ledger
      .filterEntries(m, f)
      .map((e) => e.id)
      .join(",");
  assert.equal(ids({ text: "flat" }), "a");
  assert.equal(ids({ text: "food" }), "a,b"); // the parent's name finds the subcategory
  assert.equal(ids({ text: "12,50" }), "a");
  assert.equal(ids({ text: "cafe" }), "a"); // accents do not matter
  assert.equal(ids({ kinds: new Set(["income"]) }), "c");
  assert.equal(ids({ accounts: new Set(["cash"]) }), "b");
  assert.equal(ids({ accounts: new Set(["bank"]) }), "a,c");
  assert.equal(ids({ tag: "work" }), "a");
  assert.equal(ids({ min: 5000 }), "b,c");
  assert.deepEqual(ledger.allTags(m.entries), ["work", "café"]);
});

// ---------------------------------------------------------------- subscriptions
test("the subscription finder", () => {
  const list = [];
  let n = 0;
  const pay = (date, amount, extra) => list.push(entry("s" + n++, date, "expense", amount, extra));
  for (const d of ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"])
    pay(d, "12.99", { payee: "Film Club Online" });
  for (const d of ["2026-08-15", "2026-09-15", "2026-10-15"]) pay(d, "2.99", { note: "Cloud storage October" });
  for (const d of ["2025-11-20", "2026-11-19"]) pay(d, "49.00", { note: "Domain renewal" });
  // A weekly shop with changing amounts is no subscription.
  for (const [d, a] of [
    ["2026-10-03", "64.30"],
    ["2026-10-10", "71.85"],
    ["2026-10-17", "58.40"],
    ["2026-10-24", "69.10"],
  ])
    pay(d, a, { payee: "Fresh Corner" });
  // A gym that stopped in the summer is not listed any more.
  for (const d of ["2026-03-08", "2026-04-08", "2026-05-08"]) pay(d, "29.00", { note: "Gym" });
  // A payment already kept as a recurring entry.
  for (const d of ["2026-09-01", "2026-10-01", "2026-11-01"]) pay(d, "850.00", { note: "Rent", recurring: "r1" });
  // A price rise: the latest price needs its own repeats.
  for (const d of ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"])
    pay(d, d < "2026-09" ? "9.99" : "12.99", { payee: "Music Box" });
  const found = subs.findSubscriptions(list, { today: "2026-11-20" });
  const names = found.map((f) => f.name);
  assert.deepEqual(names, ["Film Club Online", "Domain renewal", "Cloud storage October"]);
  const film = found[0];
  assert.equal(film.interval.id, "month");
  assert.equal(film.yearly, 15588);
  assert.equal(film.monthly, 1299);
  assert.equal(film.next, "2026-12-01");
  assert.equal(found[1].interval.id, "year");
  assert.equal(found[1].next, "2027-11-19");
  assert.equal(subs.ruleOf(film), "FREQ=MONTHLY;BYMONTHDAY=1");
  assert.equal(subs.keyOf("Cloud storage October"), subs.keyOf("cloud storage - november 2026"));
  const skipped = subs.findSubscriptions(list, {
    today: "2026-11-20",
    skip: new Set([subs.keyOf("Film Club Online")]),
  });
  assert.equal(skipped.length, 2);
  // Two more payments at the new price make Music Box a subscription again.
  pay("2026-11-05", "12.99", { payee: "Music Box" });
  assert.ok(subs.findSubscriptions(list, { today: "2026-11-20" }).some((f) => f.name === "Music Box"));
});

// ---------------------------------------------------------------- CSV made by the page
test("CSV for spreadsheets", () => {
  const text = csv.toCsv([
    ["Date", "Note", "Amount"],
    ["2026-11-03", 'He said "hi", twice', "12.50"],
    ["2026-11-04", "=SUM(A1)", "-3.00"],
  ]);
  assert.equal(
    text,
    '\ufeff"Date","Note","Amount"\r\n"2026-11-03","He said ""hi"", twice","12.50"\r\n"2026-11-04","\'=SUM(A1)","-3.00"\r\n',
  );
});

// ---------------------------------------------------------------- translations
test("translations are complete and plurals work", () => {
  const en = Object.keys(STRINGS.en).sort();
  const sk = Object.keys(STRINGS.sk).sort();
  assert.deepEqual(
    sk.filter((k) => !en.includes(k)),
    [],
    "keys only in Slovak",
  );
  assert.deepEqual(
    en.filter((k) => !sk.includes(k)),
    [],
    "keys only in English",
  );
  const t = translator("sk");
  assert.equal(t("nEntries", { n: 1 }), "1 záznam");
  assert.equal(t("nEntries", { n: 3 }), "3 záznamy");
  assert.equal(t("nEntries", { n: 5 }), "5 záznamov");
  const e = translator("en");
  assert.equal(e("nEntries", { n: 1 }), "1 entry");
  assert.equal(e("nEntries", { n: 0 }), "No entries");
  assert.equal(e("missingKeyForTest"), "missingKeyForTest");
});

// ---------------------------------------------------------------- the example data
test("example data fits the rules", () => {
  const data = sampleData("2026-11-03");
  assert.ok(sampleData("2026-11-03", { days: 64, maxEntries: 50 }).expense.length <= 50);
  const ids = new Set(data.category.map((c) => c.id));
  for (const e of data.expense) {
    assert.ok(!e.category || ids.has(e.category), "category of " + e.id);
    assert.ok(e.date <= "2026-11-03");
    assert.ok(money.toCents(e.amount) > 0);
  }
  const found = subs.findSubscriptions(
    data.expense.map((e) => ({ ...e, cents: money.toCents(e.amount), base: money.toCents(e.baseAmount) })),
    { today: "2026-11-03" },
  );
  assert.ok(found.length >= 3, "the example data shows the subscription finder: " + found.map((f) => f.name));
});

console.log("ok: " + passed + " groups of checks passed");
