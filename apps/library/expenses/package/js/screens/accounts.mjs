// Accounts: cash, bank accounts, cards and savings with their balances, the total, transfers between them, each
// account's entries with the running balance, and the account form.

import {
  ctx,
  h,
  t,
  money,
  dayName,
  bar,
  iconButton,
  button,
  section,
  accountDisc,
  row,
  empty,
  field,
  toggle,
  chip,
  snack,
  failed,
  confirm,
  askAmount,
  entryRow,
  dialog,
} from "../ui.mjs";
import { balances, netWorth, accountHistory } from "../ledger.mjs";
import { parseTypedAmount, fromCents } from "../money.mjs";
import { pickCurrency } from "./settings.mjs";

/** The account form keeps what is typed while records change in the background. */
export function keep(route) {
  return route.name === "account-edit";
}

export function render(route) {
  if (route.name === "account") return detail(route.id);
  if (route.name === "account-edit") return form(route.id);
  return overview();
}

function overview() {
  const store = ctx.store;
  const model = store.model;
  const b = balances(model);
  const worth = netWorth(model, b);
  const visible = store.accounts.filter((a) => !a.archived);
  const hidden = store.accounts.filter((a) => a.archived);
  const rowOf = (a) => {
    const cents = b.get(a.id) || 0;
    const currency = a.currency || store.main;
    return row({
      lead: accountDisc(a),
      title: a.name,
      sub: [
        t("accountType_" + (a.type || "bank")),
        a.id === model.defaultAccount ? t("usualAccount") : null,
        a.includeInTotal === false ? t("notInTotal") : null,
      ]
        .filter(Boolean)
        .join(" · "),
      end: h(
        "span",
        { class: "row-end-stack" },
        h("span", { class: "amount" + (cents < 0 ? " negative" : ""), text: money(cents, currency) }),
        currency !== store.main
          ? h("span", {
              class: "row-sub",
              text: model.rates.has(currency)
                ? "≈ " + money(Math.round((cents * model.rates.get(currency)) / 1e6))
                : t("noRateYet"),
            })
          : null,
      ),
      onClick: () => ctx.go("#/account/" + a.id),
    });
  };
  const content = [
    bar(t("tabAccounts"), { actions: [iconButton("settings", t("settings"), () => ctx.go("#/settings"))] }),
    h(
      "section",
      { class: "card hero" },
      h("p", { class: "hero-label", text: t("allAccounts") }),
      h("p", { class: "hero-amount" + (worth.total < 0 ? " negative" : ""), text: money(worth.total) }),
      worth.missingRates.length
        ? h("p", { class: "hero-hint", text: t("missingRates", { list: worth.missingRates.join(", ") }) })
        : null,
      h(
        "div",
        { class: "card-actions" },
        button(t("transfer"), () => ctx.go("#/add?kind=transfer"), "filled", { icon: "swap" }),
        button(t("addAccount"), () => ctx.go("#/account-edit/new"), "tonal", { icon: "add" }),
      ),
    ),
    visible.length
      ? h("section", { class: "card" }, h("ul", { class: "list" }, visible.map(rowOf)))
      : empty("👛", t("noAccounts"), t("noAccountsText"), [
          button(t("addAccount"), () => ctx.go("#/account-edit/new")),
        ]),
  ];
  if (hidden.length)
    content.push(
      h(
        "details",
        { class: "card" },
        h("summary", { text: t("hiddenAccounts", { n: hidden.length }) }),
        h("ul", { class: "list" }, hidden.map(rowOf)),
      ),
    );
  content.push(h("p", { class: "help pad", text: t("accountsHelp") }));
  return h("div", { class: "screen" }, content);
}

function detail(id) {
  const store = ctx.store;
  const model = store.model;
  const account = model.accounts.find((a) => a.id === id);
  if (!account)
    return h("div", { class: "screen" }, bar(t("account"), { back: true }), empty("👛", t("accountGone"), ""));
  const currency = account.currency || store.main;
  const history = accountHistory(model, id);
  const balance = history.length ? history[0].balance : account.openingCents;
  const days = [];
  let day = null;
  let list = null;
  for (const item of history.slice(0, 300)) {
    if (item.entry.date !== day) {
      day = item.entry.date;
      list = h("ul", { class: "list" });
      days.push(
        h("section", { class: "day" }, h("h2", { class: "day-head" }, h("span", { text: dayName(day) })), list),
      );
    }
    list.appendChild(entryRow(item.entry, { balance: item.balance }));
  }
  return h(
    "div",
    { class: "screen" },
    bar(account.name, {
      back: true,
      actions: [iconButton("edit", t("editAccount"), () => ctx.go("#/account-edit/" + id))],
    }),
    h(
      "section",
      { class: "card hero" },
      h("p", { class: "hero-label", text: t("balance") }),
      h("p", { class: "hero-amount" + (balance < 0 ? " negative" : ""), text: money(balance, currency) }),
      h(
        "div",
        { class: "card-actions" },
        button(t("addHere"), () => ctx.go("#/add?acc=" + encodeURIComponent(id)), "filled", { icon: "add" }),
        button(t("transfer"), () => ctx.go("#/add?kind=transfer&acc=" + encodeURIComponent(id)), "tonal", {
          icon: "swap",
        }),
        button(t("setBalance"), () => setBalance(account, balance), "text"),
      ),
    ),
    history.length ? days : empty("🧾", t("noEntriesHere"), t("noEntriesHereText")),
    history.length > 300
      ? button(t("seeAllEntries"), () => ctx.go("#/entries?acc=" + encodeURIComponent(id)), "tonal", {
          class: "show-more",
        })
      : null,
  );
}

/** Makes the shown balance match the real one by changing the starting balance. */
async function setBalance(account, balance) {
  const store = ctx.store;
  const cents = await askAmount({
    title: t("setBalanceTitle", { name: account.name }),
    help: t("setBalanceHelp"),
    value: fromCents(balance).replace(".", ctx.mark),
    allowEmpty: false,
    allowNegative: true,
    currency: account.currency || store.main,
    parse: parseTypedAmount,
  });
  if (cents === undefined || cents === null) return;
  try {
    await store.update("account", account.id, { opening: fromCents((account.openingCents || 0) + (cents - balance)) });
    snack(t("balanceSet"));
  } catch (error) {
    failed(error);
  }
}

function form(id) {
  const store = ctx.store;
  const existing = id !== "new" ? store.accounts.find((a) => a.id === id) : null;
  if (id !== "new" && !existing)
    return h("div", { class: "screen" }, bar(t("account"), { back: true }), empty("👛", t("accountGone"), ""));
  const draft = {
    name: existing ? existing.name : "",
    type: existing ? existing.type || "bank" : "bank",
    currency: existing ? existing.currency || null : null,
    opening: existing && existing.opening ? existing.opening.replace(".", ctx.mark) : "",
    includeInTotal: existing ? existing.includeInTotal !== false : true,
    archived: existing ? Boolean(existing.archived) : false,
  };
  const isDefault = existing && store.model.defaultAccount === existing.id;
  const types = h("div", { class: "chips" });
  const drawTypes = () => {
    types.textContent = "";
    for (const type of ["bank", "cash", "card", "savings", "other"]) {
      types.appendChild(
        chip(t("accountType_" + type), draft.type === type, () => {
          draft.type = type;
          drawTypes();
        }),
      );
    }
  };
  drawTypes();
  const currencyButton = h(
    "button",
    {
      type: "button",
      class: "btn tonal",
      onClick: async () => {
        const code = await pickCurrency(draft.currency || store.main);
        if (!code) return;
        draft.currency = code === store.main ? null : code;
        currencyButton.querySelector("span").textContent = draft.currency || store.main;
      },
    },
    h("span", { text: draft.currency || store.main }),
  );
  const name = h("input", {
    type: "text",
    value: draft.name,
    maxlength: "60",
    autocapitalize: "words",
    onInput: (e) => (draft.name = e.target.value),
  });
  const opening = h("input", {
    type: "text",
    inputmode: "decimal",
    value: draft.opening,
    onInput: (e) => (draft.opening = e.target.value),
  });
  const error = h("p", { class: "error", role: "alert" });

  const save = async () => {
    const cleanName = draft.name.trim();
    if (!cleanName) return (error.textContent = t("nameNeeded"));
    if (store.accounts.some((a) => a.id !== id && a.name.toLowerCase() === cleanName.toLowerCase()))
      return (error.textContent = t("nameTaken"));
    const openingCents = draft.opening.trim() ? parseTypedAmount(draft.opening) : 0;
    if (openingCents === null) return (error.textContent = t("notAnAmount"));
    const values = {
      name: cleanName,
      type: draft.type,
      currency: draft.currency,
      opening: fromCents(openingCents),
      includeInTotal: draft.includeInTotal,
      archived: draft.archived,
    };
    try {
      if (existing) await store.update("account", existing.id, values);
      else await store.add("account", { ...values, position: store.accounts.length });
      ctx.back();
    } catch (e) {
      failed(e);
    }
  };

  const remove = async () => {
    const used =
      [...store.entries.values()].filter((e) => e.account === existing.id || e.toAccount === existing.id).length +
      store.rules.filter((r) => r.account === existing.id || r.toAccount === existing.id).length;
    if (!used) {
      if (
        !(await confirm({
          title: t("deleteAccountTitle", { name: existing.name }),
          message: t("deleteAccountEmpty"),
          ok: t("delete"),
          danger: true,
        }))
      )
        return;
      try {
        await store.remove("account", existing.id);
        ctx.go("#/accounts", { replace: true });
      } catch (e) {
        failed(e);
      }
      return;
    }
    const others = store.accounts.filter((a) => a.id !== existing.id);
    const target = await dialog(
      (close) => [
        h("h2", { class: "dialog-title", text: t("deleteAccountTitle", { name: existing.name }) }),
        h("p", { text: t("deleteAccountMove", { n: used }) }),
        others.length
          ? h(
              "ul",
              { class: "list" },
              others.map((a) => row({ lead: accountDisc(a), title: a.name, onClick: () => close(a.id) })),
            )
          : h("p", { class: "muted", text: t("hideInstead") }),
        h(
          "div",
          { class: "dialog-actions" },
          button(t("cancel"), () => close(null), "text"),
        ),
      ],
      { sheet: true },
    );
    if (!target) return;
    try {
      await store.run("moveAccount", { from: existing.id, to: target });
      await store.remove("account", existing.id);
      snack(t("accountDeleted"));
      ctx.go("#/accounts", { replace: true });
    } catch (e) {
      failed(e);
    }
  };

  return h(
    "div",
    { class: "screen" },
    bar(existing ? t("editAccount") : t("newAccount"), {
      back: true,
      actions: [button(t("save"), save, "filled", { class: "bar-save" })],
    }),
    h(
      "div",
      { class: "form" },
      field(t("name"), name),
      h("div", { class: "field" }, h("span", { class: "label", text: t("accountType") }), types),
      h(
        "div",
        { class: "field" },
        h("span", { class: "label", text: t("currency") }),
        currencyButton,
        h("p", { class: "help", text: t("accountCurrencyHelp") }),
      ),
      field(t("openingBalance"), opening, t("openingHelp")),
      toggle(t("inTotal"), draft.includeInTotal, (v) => (draft.includeInTotal = v)),
      existing ? toggle(t("hideAccount"), draft.archived, (v) => (draft.archived = v), t("hideAccountHelp")) : null,
      existing && !isDefault
        ? button(
            t("makeUsual"),
            async () => {
              try {
                await store.updatePrefs({ defaultAccount: existing.id });
                snack(t("usualSet", { name: existing.name }));
              } catch (e) {
                failed(e);
              }
            },
            "text",
          )
        : null,
      error,
      existing ? button(t("deleteAccount"), remove, "text danger", { icon: "trash" }) : null,
    ),
  );
}
