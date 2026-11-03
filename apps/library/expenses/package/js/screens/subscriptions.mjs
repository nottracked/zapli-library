// The subscription finder: payments that repeat, found in everything you logged or imported, with what they cost a
// month and a year. Each one can be confirmed (kept as a tracked recurring entry), edited first, or dismissed.

import { ctx, h, t, money, date, bar, button, section, disc, empty, snack, failed } from "../ui.mjs";
import { findSubscriptions, keyOf, ruleOf } from "../subs.mjs";
import { describe, timesPerYear } from "../rrule.mjs";
import { toCents, fromCents } from "../money.mjs";
import { openNewRule } from "./recurring.mjs";

function skipKeys(store) {
  return new Set([
    ...(store.ui.dismissed || []),
    ...store.rules.map((r) => r.matchKey || keyOf(r.payee || r.name)).filter(Boolean),
  ]);
}

/** The recurring-entry values of a found subscription. */
function ruleValues(candidate) {
  return {
    name: candidate.name,
    amount: fromCents(candidate.cents),
    kind: "expense",
    category: candidate.category || null,
    account: candidate.account || null,
    currency: candidate.currency || null,
    payee: candidate.name,
    schedule: ruleOf(candidate),
    nextDue: candidate.next,
    mode: "track",
    active: true,
    isSubscription: true,
    matchKey: candidate.key,
  };
}

export function render() {
  const store = ctx.store;
  const model = store.model;
  const confirmed = store.rules
    .filter((r) => r.isSubscription)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const found = findSubscriptions(model.entries, { today: ctx.today, skip: skipKeys(store) });
  const active = confirmed.filter((r) => r.active);
  const yearly = active.reduce((sum, r) => sum + Math.round((toCents(r.amount) || 0) * timesPerYear(r.schedule)), 0);
  const content = [bar(t("subscriptions"), { back: true })];

  content.push(
    h(
      "section",
      { class: "card hero" },
      h("p", { class: "hero-label", text: t("subscriptionsYear") }),
      h("p", { class: "hero-amount", text: money(yearly) }),
      h("p", {
        class: "hero-hint",
        text: active.length
          ? t("youPayYearly", { amount: money(yearly), n: active.length }) +
            " " +
            t("perMonthIs", { amount: money(Math.round(yearly / 12)) })
          : t("noConfirmedYet"),
      }),
    ),
  );

  if (found.length) {
    const total = found.reduce((s, f) => s + f.yearlyBase, 0);
    content.push(
      h(
        "section",
        { class: "card" },
        h("h2", { class: "card-title", text: t("foundInHistory") }),
        h("p", { class: "muted", text: t("foundSummary", { n: found.length, amount: money(total) }) }),
        h(
          "ul",
          { class: "list" },
          found.map((f) => candidateRow(f)),
        ),
      ),
    );
  } else if (!confirmed.length) {
    content.push(
      empty("🔍", t("nothingRepeats"), t("nothingRepeatsText"), [
        button(t("importHistory"), () => ctx.go("#/import"), "tonal", { icon: "importFile" }),
      ]),
    );
  }

  if (confirmed.length) {
    content.push(
      section(
        t("yourSubscriptions"),
        h(
          "ul",
          { class: "list" },
          confirmed.map((r) => {
            const cents = toCents(r.amount) || 0;
            const perYear = Math.round(cents * timesPerYear(r.schedule));
            return h(
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
                  h("span", {
                    class: "row-sub",
                    text: r.active
                      ? describe(r.schedule, ctx.t, ctx.locale) +
                        " · " +
                        t("nextOn", { date: date(r.nextDue, "short") })
                      : t("cancelledSub"),
                  }),
                ),
                h(
                  "span",
                  { class: "row-end-stack" },
                  h("span", { class: "amount", text: money(cents, r.currency) }),
                  h("span", { class: "row-sub", text: t("aYear", { amount: money(perYear, r.currency) }) }),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  const dismissed = store.ui.dismissed || [];
  if (dismissed.length) {
    content.push(
      h(
        "details",
        { class: "card" },
        h("summary", { text: t("dismissedN", { n: dismissed.length }) }),
        h(
          "ul",
          { class: "list" },
          dismissed.map((key) =>
            h(
              "li",
              {},
              h(
                "div",
                { class: "row" },
                h(
                  "span",
                  { class: "row-text" },
                  h("span", { class: "row-title", text: (store.ui.dismissedNames || {})[key] || key }),
                ),
                button(t("restore"), () => store.saveUi({ dismissed: dismissed.filter((k) => k !== key) }), "text"),
              ),
            ),
          ),
        ),
      ),
    );
  }
  content.push(h("p", { class: "help pad", text: t("finderHelp") }));
  return h("div", { class: "screen" }, content);
}

function candidateRow(f) {
  const store = ctx.store;
  const category = store.categories.find((c) => c.id === f.category);
  const confirm = async () => {
    try {
      await store.add("recurring", ruleValues(f));
      snack(t("subscriptionKept", { name: f.name }));
    } catch (error) {
      failed(error);
    }
  };
  const dismiss = async () => {
    const before = store.ui.dismissed || [];
    await store.saveUi({
      dismissed: [...before, f.key],
      dismissedNames: { ...(store.ui.dismissedNames || {}), [f.key]: f.name },
    });
    snack(t("dismissedOne", { name: f.name }), { label: t("undo"), run: () => store.saveUi({ dismissed: before }) });
  };
  return h(
    "li",
    { class: "candidate" },
    h(
      "div",
      { class: "row" },
      disc(category),
      h(
        "span",
        { class: "row-text" },
        h("span", { class: "row-title", text: f.name }),
        h("span", {
          class: "row-sub",
          text:
            t("interval_" + f.interval.id) +
            " · " +
            t("paidTimes", { n: f.count }) +
            " · " +
            t("lastPaid", { date: date(f.last, "short") }),
        }),
      ),
      h(
        "span",
        { class: "row-end-stack" },
        h("span", { class: "amount", text: money(f.cents, f.currency) }),
        h("span", { class: "row-sub", text: t("aYear", { amount: money(f.yearly, f.currency) }) }),
      ),
    ),
    h("p", {
      class: "row-sub pad-row",
      text: t("costLine", {
        month: money(f.monthly, f.currency),
        year: money(f.yearly, f.currency),
        next: date(f.next, "short"),
      }),
    }),
    h(
      "div",
      { class: "row-buttons" },
      button(t("dismiss"), dismiss, "text"),
      button(t("edit"), () => openNewRule(ruleValues(f)), "text"),
      button(t("confirmSub"), confirm, "tonal", { icon: "check" }),
    ),
  );
}
