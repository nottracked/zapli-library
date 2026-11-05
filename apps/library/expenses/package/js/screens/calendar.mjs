// The calendar: a month of days with what was spent on each, and the entries of the day picked under it.

import { ctx, h, t, money, date, dayName, bar, iconButton, button, entryRow } from "../ui.mjs";
import { byDay, totals } from "../ledger.mjs";
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  addDays,
  monthKey,
  startOfWeek,
  weekStartsSunday,
  isIsoDate,
} from "../dates.mjs";
import { fab } from "./home.mjs";

export function render(route) {
  const store = ctx.store;
  const model = store.model;
  const picked = isIsoDate(route.params.get("day")) ? route.params.get("day") : null;
  const month = /^\d{4}-\d{2}$/.test(route.params.get("m") || "")
    ? route.params.get("m") + "-01"
    : startOfMonth(picked || ctx.today);
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const sundayFirst = weekStartsSunday(ctx.locale);
  const gridStart = startOfWeek(first, sundayFirst ? 6 : 0);
  const spent = byDay(model.entries, first, last, "expense");
  const income = byDay(model.entries, first, last, "income");
  const max = Math.max(1, ...spent.values());
  const open = (m, day) => ctx.go("#/calendar?m=" + m + (day ? "&day=" + day : ""), { replace: true });

  const weekdays = [];
  for (let i = 0; i < 7; i++)
    weekdays.push(
      h("span", { class: "cal-weekday", "aria-hidden": "true", text: date(addDays(gridStart, i), "weekdayShort") }),
    );
  const cells = [];
  for (let d = gridStart; d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) {
    if (d < first) {
      cells.push(h("span", { class: "cal-cell blank" }));
      continue;
    }
    if (d > last) {
      cells.push(h("span", { class: "cal-cell blank" }));
      continue;
    }
    const s = spent.get(d) || 0;
    const inc = income.get(d) || 0;
    const level = s ? Math.min(4, Math.ceil((s / max) * 4)) : 0;
    const label =
      date(d, "long") +
      (s ? ", " + t("spentAmount", { amount: money(s) }) : "") +
      (inc ? ", " + t("incomeAmount", { amount: money(inc) }) : "");
    cells.push(
      h(
        "button",
        {
          type: "button",
          class: "cal-cell level-" + level + (d === ctx.today ? " today" : "") + (d === picked ? " picked" : ""),
          "aria-label": label,
          "aria-pressed": String(d === picked),
          onClick: () => open(monthKey(first), d === picked ? null : d),
        },
        h("span", { class: "cal-day", text: String(Number(d.slice(8))) }),
        s ? h("span", { class: "cal-amount", text: money(s, null, { whole: true }) }) : null,
        inc ? h("span", { class: "cal-dot", "aria-hidden": "true" }) : null,
      ),
    );
  }
  const month_totals = totals(model.entries, first, last);
  const content = [
    bar(t("calendar"), { back: true }),
    h(
      "div",
      { class: "month-nav" },
      iconButton("chevronLeft", t("previousMonth"), () => open(monthKey(addMonths(first, -1)))),
      h("h2", { class: "month-title", text: date(first, "month") }),
      iconButton("chevronRight", t("nextMonth"), () => open(monthKey(addMonths(first, 1)))),
    ),
    h(
      "p",
      { class: "summary" },
      t("spentAmount", { amount: money(month_totals.spent) }) +
        (month_totals.income ? " · " + t("incomeAmount", { amount: money(month_totals.income) }) : ""),
    ),
    h("div", { class: "calendar", role: "group", "aria-label": date(first, "month") }, weekdays, cells),
  ];
  if (picked) {
    const list = model.entries.filter((e) => e.date === picked);
    content.push(
      h(
        "section",
        { class: "card" },
        h("h2", { class: "card-title", text: dayName(picked) }),
        list.length
          ? h(
              "ul",
              { class: "list" },
              list.map((e) => entryRow(e)),
            )
          : h("p", { class: "muted", text: t("nothingThisDay") }),
        h(
          "div",
          { class: "card-actions" },
          button(t("addOnThisDay"), () => ctx.go("#/add?date=" + picked), "tonal", { icon: "add" }),
        ),
      ),
    );
  } else content.push(h("p", { class: "help center", text: t("calendarHint") }));
  content.push(h("div", { class: "fab-space" }), fab(picked ? "#/add?date=" + picked : "#/add"));
  return h("div", { class: "screen" }, content);
}
