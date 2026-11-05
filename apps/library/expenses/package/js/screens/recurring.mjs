// Recurring entries (rent, salary, bills, subscriptions): the list with what is due, and the form. A rule is added
// for you when due, asks first with a notification, or is only tracked (for payments you import or log yourself).

import {
  ctx,
  h,
  t,
  put,
  money,
  date,
  bar,
  iconButton,
  button,
  section,
  chip,
  segmented,
  field,
  toggle,
  disc,
  accountDisc,
  row,
  empty,
  snack,
  failed,
  confirm,
  categoryName,
  blurActive,
} from "../ui.mjs";
import { toCents, fromCents, parseTypedAmount } from "../money.mjs";
import { addDays, addMonths, isIsoDate } from "../dates.mjs";
import { build, describe, nextOn, pickerOf, timesPerYear } from "../rrule.mjs";
import { keyOf } from "../subs.mjs";
import { pickCurrency } from "./settings.mjs";

export function keep(route) {
  return route.name === "rule";
}

let prefill = null;

/** Opens the form for a new rule with these values (from a found subscription). */
export function openNewRule(values) {
  prefill = values;
  ctx.go("#/rule/new?prefill=1");
}

export function render(route) {
  return route.name === "rule" ? form(route) : list();
}

function amountOf(rule) {
  return toCents(rule.amount) || 0;
}

function list() {
  const store = ctx.store;
  const rules = [...store.rules].sort(
    (a, b) => Number(b.active) - Number(a.active) || (a.nextDue < b.nextDue ? -1 : 1),
  );
  const content = [
    bar(t("recurringEntries"), {
      back: true,
      actions: [iconButton("add", t("addRecurring"), () => ctx.go("#/rule/new"))],
    }),
  ];
  if (!rules.length) {
    content.push(
      empty("🔁", t("noRecurring"), t("noRecurringText"), [
        button(t("addRecurring"), () => ctx.go("#/rule/new"), "filled", { icon: "add" }),
        button(t("findSubscriptions"), () => ctx.go("#/subscriptions"), "tonal"),
      ]),
    );
    return h("div", { class: "screen" }, content);
  }
  let spend = 0;
  let earn = 0;
  for (const r of rules) {
    if (!r.active) continue;
    const yearly = Math.round(amountOf(r) * timesPerYear(r.schedule));
    if ((r.kind || "expense") === "expense") spend += yearly;
    else if (r.kind === "income") earn += yearly;
  }
  content.push(
    section(
      null,
      h(
        "div",
        { class: "stats" },
        h(
          "div",
          { class: "stat" },
          h("span", { class: "stat-label", text: t("perMonthOut") }),
          h("span", { class: "stat-value", text: money(Math.round(spend / 12)) }),
        ),
        h(
          "div",
          { class: "stat" },
          h("span", { class: "stat-label", text: t("perMonthIn") }),
          h("span", { class: "stat-value income", text: money(Math.round(earn / 12)) }),
        ),
      ),
    ),
  );
  const run = async (action, rule, done) => {
    try {
      await store.run(action, { rule: rule.id, due: rule.nextDue });
      snack(done);
    } catch (error) {
      failed(error);
    }
  };
  const items = rules.map((r) => {
    const due = r.active && r.nextDue <= ctx.today && r.mode !== "track";
    const mode = t("mode_" + (r.mode || "auto"));
    const sub = r.active
      ? describe(r.schedule, ctx.t, ctx.locale) +
        " · " +
        (due ? t("dueSince", { date: date(r.nextDue, "short") }) : t("nextOn", { date: date(r.nextDue, "short") })) +
        " · " +
        mode
      : t("paused");
    return h(
      "li",
      { class: due ? "due" : "" },
      h(
        "button",
        { class: "row", type: "button", onClick: () => ctx.go("#/rule/" + r.id) },
        r.kind === "transfer"
          ? h("span", { class: "disc hue-teal", "aria-hidden": "true" }, "⇄")
          : disc(store.categories.find((c) => c.id === r.category)),
        h(
          "span",
          { class: "row-text" },
          h("span", { class: "row-title", text: r.name + (r.isSubscription ? " · " + t("subscriptionShort") : "") }),
          h("span", { class: "row-sub" + (due ? " warn" : ""), text: sub }),
        ),
        h("span", {
          class: "row-end amount" + (r.kind === "income" ? " income" : ""),
          text: money(amountOf(r), r.currency),
        }),
      ),
      due
        ? h(
            "div",
            { class: "row-buttons" },
            button(t("skip"), () => run("skipRecurring", r, t("skipped")), "text"),
            button(t("addNow"), () => run("postRecurring", r, t("addedRule", { name: r.name })), "tonal"),
          )
        : null,
    );
  });
  content.push(h("section", { class: "card" }, h("ul", { class: "list" }, items)));
  content.push(h("p", { class: "help pad", text: t("recurringHelp") }));
  return h("div", { class: "screen" }, content);
}

function form(route) {
  const store = ctx.store;
  const id = route.id;
  const existing = id !== "new" ? store.rules.find((r) => r.id === id) : null;
  if (id !== "new" && !existing)
    return h("div", { class: "screen" }, bar(t("recurringEntry"), { back: true }), empty("🔁", t("ruleGone"), ""));
  const from = route.params.get("from") ? store.entries.get(route.params.get("from")) : null;
  const base = existing || (route.params.get("prefill") && prefill) || null;
  const firstDate = from
    ? nextOn(build("month", 1, from.date), addDays(ctx.today, 1)) || addMonths(from.date, 1)
    : ctx.today;
  const draft = {
    name: base ? base.name || "" : from ? from.note || from.payee || categoryName(from.category, false) : "",
    amount: base ? (base.amount || "").replace(".", ctx.mark) : from ? from.amount.replace(".", ctx.mark) : "",
    kind: base ? base.kind || "expense" : from ? from.kind : "expense",
    category: base ? base.category || null : from ? from.category || null : null,
    account: base
      ? base.account || store.model.defaultAccount
      : from
        ? from.account || store.model.defaultAccount
        : store.model.defaultAccount,
    toAccount: base ? base.toAccount || null : from ? from.toAccount || null : null,
    currency: base ? base.currency || null : from ? from.currency || null : null,
    payee: base ? base.payee || "" : from ? from.payee || "" : "",
    note: base ? base.note || "" : "",
    nextDue: base ? base.nextDue || ctx.today : firstDate,
    schedule: base ? base.schedule : null,
    picker: base && base.schedule ? pickerOf(base.schedule) : { unit: "month", interval: 1 },
    mode: base ? base.mode || "auto" : "auto",
    active: base ? base.active !== false : true,
    isSubscription: base ? Boolean(base.isSubscription) : false,
    matchKey: base ? base.matchKey || null : null,
  };
  const keepSchedule = Boolean(existing && !draft.picker);
  if (!draft.picker) draft.picker = { unit: "month", interval: 1 };
  if (from && !draft.category && from.category) draft.category = from.category;

  const error = h("p", { class: "error", role: "alert" });
  const parts = h("div", { class: "form" });
  let scheduleTouched = false;

  const draw = () => {
    parts.textContent = "";
    const unitChips = ["day", "week", "month", "year"].map((u) =>
      chip(t("every_" + u, { n: draft.picker.interval }), draft.picker.unit === u, () => {
        draft.picker.unit = u;
        scheduleTouched = true;
        draw();
      }),
    );
    const interval = h("input", {
      type: "number",
      min: "1",
      max: "99",
      inputmode: "numeric",
      value: String(draft.picker.interval),
      class: "short",
      onChange: (e) => {
        draft.picker.interval = Math.max(1, Math.min(99, Number(e.target.value) || 1));
        scheduleTouched = true;
        draw();
      },
    });
    const next = h("input", {
      type: "date",
      value: draft.nextDue,
      onChange: (e) => {
        if (isIsoDate(e.target.value)) {
          draft.nextDue = e.target.value;
          scheduleTouched = true;
          draw();
        }
      },
    });
    const sentence =
      keepSchedule && !scheduleTouched
        ? describe(draft.schedule, ctx.t, ctx.locale)
        : describe(build(draft.picker.unit, draft.picker.interval, draft.nextDue), ctx.t, ctx.locale);
    const categories = store.categories.filter(
      (c) => (c.kind || "expense") === (draft.kind === "income" ? "income" : "expense") && !c.archived,
    );
    put(
      parts,
      segmented(
        [
          ["expense", t("expenseKind")],
          ["income", t("incomeKind")],
          ["transfer", t("transferKind")],
        ],
        draft.kind,
        (k) => {
          draft.kind = k;
          draw();
        },
        t("kind"),
      ),
      field(
        t("name"),
        h("input", {
          type: "text",
          value: draft.name,
          maxlength: "60",
          placeholder: t("rulePlaceholder"),
          onInput: (e) => (draft.name = e.target.value),
        }),
      ),
      h(
        "div",
        { class: "two" },
        field(
          t("amount"),
          h("input", {
            type: "text",
            inputmode: "decimal",
            value: draft.amount,
            onInput: (e) => (draft.amount = e.target.value),
          }),
        ),
        h(
          "div",
          { class: "field" },
          h("span", { class: "label", text: t("currency") }),
          button(
            draft.currency || store.main,
            async () => {
              const code = await pickCurrency(draft.currency || store.main);
              if (code) {
                draft.currency = code === store.main ? null : code;
                draw();
              }
            },
            "tonal",
          ),
        ),
      ),
      draft.kind !== "transfer"
        ? h(
            "div",
            { class: "field" },
            h("span", { class: "label", text: t("category") }),
            h(
              "div",
              { class: "chips" },
              categories.map((c) =>
                chip(
                  c.parent ? categoryName(c.id) : c.name,
                  c.id === draft.category,
                  () => {
                    draft.category = c.id;
                    draw();
                  },
                  disc(c, "tiny"),
                ),
              ),
            ),
          )
        : null,
      store.accounts.length > 1 || draft.kind === "transfer"
        ? h(
            "div",
            { class: "field" },
            h("span", { class: "label", text: draft.kind === "transfer" ? t("fromAccount") : t("account") }),
            h(
              "div",
              { class: "chips" },
              store.accounts
                .filter((a) => !a.archived)
                .map((a) =>
                  chip(
                    a.name,
                    a.id === draft.account,
                    () => {
                      draft.account = a.id;
                      draw();
                    },
                    accountDisc(a, "tiny"),
                  ),
                ),
            ),
          )
        : null,
      draft.kind === "transfer"
        ? h(
            "div",
            { class: "field" },
            h("span", { class: "label", text: t("toAccount") }),
            h(
              "div",
              { class: "chips" },
              store.accounts
                .filter((a) => !a.archived && a.id !== draft.account)
                .map((a) =>
                  chip(
                    a.name,
                    a.id === draft.toAccount,
                    () => {
                      draft.toAccount = a.id;
                      draw();
                    },
                    accountDisc(a, "tiny"),
                  ),
                ),
            ),
          )
        : null,
      h("h3", { text: t("repeats") }),
      field(t("interval"), interval),
      h("div", { class: "chips" }, unitChips),
      field(t("nextDate"), next, t("nextDateHelp")),
      h("p", { class: "muted", text: sentence }),
      h("h3", { text: t("whenDue") }),
      h(
        "div",
        { class: "chips column" },
        ["auto", "ask", "track"].map((m) =>
          chip(t("mode_" + m) + " — " + t("modeHelp_" + m), draft.mode === m, () => {
            draft.mode = m;
            draw();
          }),
        ),
      ),
      draft.kind !== "transfer"
        ? field(
            t("payee"),
            h("input", {
              type: "text",
              value: draft.payee,
              maxlength: "100",
              onInput: (e) => (draft.payee = e.target.value),
            }),
          )
        : null,
      field(
        t("note"),
        h("input", {
          type: "text",
          value: draft.note,
          maxlength: "120",
          onInput: (e) => (draft.note = e.target.value),
        }),
      ),
      draft.kind === "expense"
        ? toggle(t("isSubscription"), draft.isSubscription, (v) => (draft.isSubscription = v), t("isSubscriptionHelp"))
        : null,
      existing ? toggle(t("ruleActive"), draft.active, (v) => (draft.active = v)) : null,
      error,
      existing ? button(t("deleteRule"), remove, "text danger", { icon: "trash" }) : null,
    );
  };

  const save = async () => {
    blurActive();
    const cents = parseTypedAmount(draft.amount);
    if (!draft.name.trim()) return (error.textContent = t("nameNeeded"));
    if (cents === null || cents <= 0) return (error.textContent = t("amountNeeded"));
    if (draft.kind === "transfer" && (!draft.account || !draft.toAccount || draft.account === draft.toAccount))
      return (error.textContent = t("transferNeedsTwo"));
    const schedule =
      keepSchedule && !scheduleTouched
        ? draft.schedule
        : build(draft.picker.unit, draft.picker.interval, draft.nextDue);
    const nextDue = nextOn(schedule, draft.nextDue, draft.nextDue) || draft.nextDue;
    const values = {
      name: draft.name.trim(),
      amount: fromCents(cents),
      kind: draft.kind,
      category: draft.kind === "transfer" ? null : draft.category,
      account: draft.account || null,
      toAccount: draft.kind === "transfer" ? draft.toAccount : null,
      currency: draft.currency,
      payee: draft.payee.trim() || null,
      note: draft.note.trim() || null,
      schedule,
      nextDue,
      mode: draft.mode,
      active: draft.active,
      isSubscription: draft.kind === "expense" && draft.isSubscription,
      matchKey: draft.matchKey || keyOf(draft.payee || draft.name) || null,
    };
    try {
      const before = existing ? { ...existing } : null;
      const saved = existing
        ? await store.update("recurring", existing.id, values)
        : await store.add("recurring", values);
      prefill = null;
      ctx.back();
      const undo = before
        ? () =>
            store.update(
              "recurring",
              before.id,
              Object.fromEntries(Object.keys(values).map((k) => [k, before[k] ?? null])),
            )
        : () => store.remove("recurring", saved.id);
      snack(
        before
          ? t("ruleSaved", { name: values.name })
          : t("ruleAdded", { name: values.name, date: date(nextDue, "short") }),
        {
          label: t("undo"),
          run: () => undo().catch(failed),
        },
      );
    } catch (e) {
      failed(e);
    }
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: t("deleteRuleTitle", { name: existing.name }),
        message: t("deleteRuleText"),
        ok: t("delete"),
        danger: true,
      }))
    )
      return;
    try {
      await store.remove("recurring", existing.id);
      ctx.back();
      snack(t("ruleDeleted"));
    } catch (e) {
      failed(e);
    }
  };

  draw();
  return h(
    "div",
    { class: "screen" },
    bar(existing ? t("editRecurring") : t("newRecurring"), {
      back: true,
      actions: [button(t("save"), save, "filled", { class: "bar-save" })],
    }),
    parts,
  );
}
