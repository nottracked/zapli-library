// Statistics: a month or a year at a glance, where the money went by category, spending day by day or month by
// month, and the last twelve months of spending and income.

import {
  ctx,
  h,
  t,
  money,
  date,
  bar,
  iconButton,
  button,
  segmented,
  section,
  disc,
  row,
  empty,
  failed,
  snack,
} from "../ui.mjs";
import { totals, byCategory, byDay, monthSeries, monthlyBudget } from "../ledger.mjs";
import { endOfMonth, addMonths, monthKey, daysInMonth } from "../dates.mjs";
import { hueOf } from "../icons.mjs";
import { donut, bars } from "../charts.mjs";
import { labelOf } from "../subs.mjs";
import { exportThese } from "./entries.mjs";

function periodOf(params) {
  const view = params.get("view") === "year" ? "year" : "month";
  if (view === "year") {
    const y = /^\d{4}$/.test(params.get("y") || "") ? params.get("y") : ctx.today.slice(0, 4);
    return { view, from: y + "-01-01", to: y + "-12-31", key: y, title: y };
  }
  const m = /^\d{4}-\d{2}$/.test(params.get("m") || "") ? params.get("m") : monthKey(ctx.today);
  const from = m + "-01";
  return { view, from, to: endOfMonth(from), key: m, title: date(from, "month") };
}

function link(update) {
  const next = new URLSearchParams(location.hash.split("?")[1] || "");
  for (const [k, v] of Object.entries(update)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  ctx.go("#/stats?" + next.toString(), { replace: true });
}

export function render(route) {
  const store = ctx.store;
  const model = store.model;
  const params = route.params;
  const period = periodOf(params);
  const kind = params.get("kind") === "income" ? "income" : "expense";
  const sum = totals(model.entries, period.from, period.to);
  const step = (n) =>
    period.view === "year"
      ? link({ y: String(Number(period.key) + n) })
      : link({ m: monthKey(addMonths(period.from, n)) });

  const content = [
    bar(t("tabStats"), { actions: [iconButton("exportFile", t("exportPeriod"), () => exportPeriod(period))] }),
    h(
      "div",
      { class: "pad" },
      segmented(
        [
          ["month", t("month")],
          ["year", t("year")],
        ],
        period.view,
        (v) => link({ view: v === "year" ? "year" : null }),
        t("period"),
      ),
    ),
    h(
      "div",
      { class: "month-nav" },
      iconButton("chevronLeft", t("previousPeriod"), () => step(-1)),
      h("h2", { class: "month-title", text: period.title }),
      iconButton("chevronRight", t("nextPeriod"), () => step(1)),
    ),
  ];
  if (!sum.count) {
    content.push(empty("📊", t("nothingInPeriod", { period: period.title }), t("nothingInPeriodText")));
    content.push(trendCard(model, period));
    return h("div", { class: "screen" }, content);
  }
  content.push(summaryCard(model, period, sum));
  content.push(categoryCard(model, period, kind, sum));
  content.push(period.view === "month" ? dailyCard(model, period) : yearCard(model, period));
  content.push(trendCard(model, period));
  const payees = payeeCard(model, period);
  if (payees) content.push(payees);
  return h("div", { class: "screen" }, content);
}

function summaryCard(model, period, sum) {
  const days =
    period.view === "month"
      ? period.to < ctx.today
        ? daysInMonth(...period.from.split("-").map(Number))
        : Math.max(1, Number(ctx.today.slice(8)))
      : 12;
  const current = period.from <= ctx.today && ctx.today <= period.to;
  const average = Math.round(
    sum.spent /
      (period.view === "month"
        ? current
          ? days
          : daysInMonth(Number(period.from.slice(0, 4)), Number(period.from.slice(5, 7)))
        : 12),
  );
  const stat = (label, value, cls) =>
    h(
      "div",
      { class: "stat" },
      h("span", { class: "stat-label", text: label }),
      h("span", { class: "stat-value " + (cls || ""), text: value }),
    );
  return section(
    null,
    h(
      "div",
      { class: "stats" },
      stat(t("spent"), money(sum.spent)),
      stat(t("income"), money(sum.income), "income"),
      stat(t("net"), money(sum.net, null, { sign: "always" }), sum.net < 0 ? "negative" : "income"),
    ),
    h("p", {
      class: "muted",
      text:
        period.view === "month"
          ? t("perDayAverage", { amount: money(average) })
          : t("perMonthAverage", { amount: money(average) }),
    }),
  );
}

function categoryCard(model, period, kind, sum) {
  const store = ctx.store;
  const rows = byCategory(model, period.from, period.to, kind);
  const total = kind === "income" ? sum.income : sum.spent;
  const toggle = segmented(
    [
      ["expense", t("spending")],
      ["income", t("income")],
    ],
    kind,
    (v) => link({ kind: v === "income" ? "income" : null }),
    t("kind"),
  );
  if (!rows.length) return section(t("whereItWent"), toggle, h("p", { class: "muted", text: t("nothingOfKind") }));
  const slices = rows.map((r) => ({ value: r.cents, hue: hueOf(store.categories.find((c) => c.id === r.id)) }));
  const legend = rows.map((r) => {
    const category = store.categories.find((c) => c.id === r.id);
    const pct = total ? Math.round((r.cents * 100) / total) : 0;
    return row({
      lead: disc(category),
      title: category ? category.name : t("noCategory"),
      sub: t("nEntries", { n: r.count }) + " · " + pct + " %",
      end: h("span", { class: "amount", text: money(r.cents) }),
      onClick: r.id
        ? () =>
            ctx.go(
              "#/entries?cat=" +
                encodeURIComponent(r.id) +
                "&from=" +
                period.from +
                "&to=" +
                period.to +
                "&kind=" +
                kind,
            )
        : null,
    });
  });
  const chartLabel =
    t("chartCategories", { period: period.title }) +
    ": " +
    rows
      .slice(0, 5)
      .map((r) => {
        const c = store.categories.find((x) => x.id === r.id);
        return (c ? c.name : t("noCategory")) + " " + money(r.cents);
      })
      .join(", ");
  return section(
    t(kind === "income" ? "whereFrom" : "whereItWent"),
    toggle,
    h(
      "div",
      { class: "chart-box" },
      donut(slices, {
        label: chartLabel,
        center: money(total, null, { whole: total >= 100000 }),
        sub: t(kind === "income" ? "income" : "spent"),
      }),
    ),
    h("ul", { class: "list" }, legend),
  );
}

function dailyCard(model, period) {
  const days = byDay(model.entries, period.from, period.to, "expense");
  const rows = [];
  const last = Number(period.to.slice(8));
  for (let d = 1; d <= last; d++) {
    const iso = period.from.slice(0, 8) + String(d).padStart(2, "0");
    rows.push({ label: d === 1 || d % 5 === 0 ? String(d) : "", values: [days.get(iso) || 0] });
  }
  const budget = monthlyBudget(model).cents;
  const perDay = budget ? Math.round(budget / last) : null;
  const top = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
  const label =
    t("chartDaily", { period: date(period.from, "month") }) +
    (top ? ": " + t("biggestDay", { day: date(top[0], "short"), amount: money(top[1]) }) : "");
  return section(
    t("dayByDay"),
    h(
      "div",
      { class: "chart-box" },
      bars(rows, {
        label,
        line: perDay,
        format: perDay ? (v) => t("dailyShare", { amount: money(v, null, { whole: true }) }) : null,
        onPick: (i) =>
          ctx.go(
            "#/calendar?m=" +
              monthKey(period.from) +
              "&day=" +
              period.from.slice(0, 8) +
              String(i + 1).padStart(2, "0"),
          ),
      }),
    ),
    top ? h("p", { class: "muted", text: t("biggestDay", { day: date(top[0], "day"), amount: money(top[1]) }) }) : null,
    button(t("openCalendar"), () => ctx.go("#/calendar?m=" + monthKey(period.from)), "text", { icon: "calendar" }),
  );
}

function yearCard(model, period) {
  const series = monthSeries(model.entries, period.to, 12);
  const rows = series.map((r) => ({
    label: date(r.month + "-01", "monthShort").slice(0, 3),
    values: [r.spent, r.income],
  }));
  const label = t("chartYear", { year: period.key });
  return section(
    t("monthByMonth"),
    h(
      "div",
      { class: "chart-box" },
      bars(rows, { label, series: ["spend", "earn"], onPick: (i) => link({ view: null, m: series[i].month }) }),
    ),
    legendKey(),
    h(
      "ul",
      { class: "list" },
      series
        .filter((r) => r.spent || r.income)
        .reverse()
        .map((r) =>
          row({
            title: date(r.month + "-01", "month"),
            sub: t("incomeAmount", { amount: money(r.income) }),
            end: h("span", { class: "amount", text: money(r.spent) }),
            onClick: () => link({ view: null, m: r.month }),
          }),
        ),
    ),
  );
}

function legendKey() {
  return h(
    "p",
    { class: "legend-key" },
    h("span", { class: "key spend", "aria-hidden": "true" }),
    h("span", { text: t("spending") }),
    h("span", { class: "key earn", "aria-hidden": "true" }),
    h("span", { text: t("income") }),
  );
}

function trendCard(model, period) {
  const end = period.view === "year" ? (period.to < ctx.today ? period.to : ctx.today) : period.to;
  const series = monthSeries(model.entries, end, 12);
  const highlight = period.view === "month" ? series.findIndex((r) => r.month === period.key) : -1;
  const budget = monthlyBudget(model).cents;
  const rows = series.map((r) => ({
    label: date(r.month + "-01", "monthShort")
      .slice(0, 1)
      .toUpperCase(),
    values: [r.spent, r.income],
  }));
  const avg = Math.round(series.reduce((s, r) => s + r.spent, 0) / 12);
  return section(
    t("last12Months"),
    h(
      "div",
      { class: "chart-box" },
      bars(rows, {
        label: t("chart12", { avg: money(avg) }),
        series: ["spend", "earn"],
        line: budget,
        highlight,
        format: budget ? (v) => t("budgetLine", { amount: money(v, null, { whole: true }) }) : null,
        onPick: (i) => link({ view: null, m: series[i].month }),
      }),
    ),
    legendKey(),
    h("p", { class: "muted", text: t("averageMonth", { amount: money(avg) }) }),
  );
}

function payeeCard(model, period) {
  const sums = new Map();
  for (const e of model.entries) {
    if (e.kind !== "expense" || e.date < period.from || e.date > period.to) continue;
    const name = labelOf(e);
    if (!name) continue;
    const key = name.toLowerCase();
    const row0 = sums.get(key) || { name, cents: 0, count: 0 };
    row0.cents += e.base;
    row0.count++;
    sums.set(key, row0);
  }
  const top = [...sums.values()].sort((a, b) => b.cents - a.cents).slice(0, 5);
  if (top.length < 2) return null;
  return section(
    t("topPlaces"),
    h(
      "ul",
      { class: "list" },
      top.map((p) =>
        row({
          title: p.name,
          sub: t("nEntries", { n: p.count }),
          end: h("span", { class: "amount", text: money(p.cents) }),
          onClick: () =>
            ctx.go("#/entries?q=" + encodeURIComponent(p.name) + "&from=" + period.from + "&to=" + period.to),
        }),
      ),
    ),
  );
}

async function exportPeriod(period) {
  const store = ctx.store;
  if (!store.live) {
    exportThese(
      store.model.entries.filter((e) => e.date >= period.from && e.date <= period.to),
      "expenses-" + period.from + "-to-" + period.to + ".csv",
    );
    return;
  }
  try {
    await ctx.store.run("exportRange", { from: period.from, to: period.to });
  } catch (error) {
    if (error && error.code === "UNSUPPORTED") snack(t("onlyInApp"));
    else failed(error);
  }
}
