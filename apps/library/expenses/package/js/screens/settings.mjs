// Settings: the main currency, the budget and warnings, the cards on Home, reminders, the usual account, exchange
// rates, import and export, the app lock and the language.

import {
  ctx,
  h,
  t,
  money,
  date,
  bar,
  button,
  section,
  row,
  toggle,
  chip,
  field,
  snack,
  failed,
  dialog,
  accountDisc,
  confirm,
} from "../ui.mjs";
import {
  COMMON_CURRENCIES,
  toMicros,
  fromMicros,
  parseTypedRate,
  formatNumber,
  invertMicros,
  toCents,
} from "../money.mjs";
import { isIsoDate, startOfMonth, addMonths } from "../dates.mjs";
import { setBudget } from "./home.mjs";
import { exportThese } from "./entries.mjs";
import { shownText } from "./edithome.mjs";

export function render(route) {
  return route.name === "currencies" ? currencies() : settings();
}

/** The name of a currency in the app's language ("US dollar"), or the code. */
export function currencyName(code) {
  try {
    return new Intl.DisplayNames([ctx.locale], { type: "currency" }).of(code) || code;
  } catch {
    return code;
  }
}

/** Lets the user pick a currency; resolves with its code or null. Any three-letter code can be typed. */
export function pickCurrency(current) {
  const store = ctx.store;
  const used = new Set([
    store.main,
    ...store.rates.map((r) => r.currency),
    ...store.accounts.map((a) => a.currency).filter(Boolean),
  ]);
  const codes = [...used, ...COMMON_CURRENCIES.filter((c) => !used.has(c))];
  return dialog(
    (close) => {
      const list = h("ul", { class: "list" });
      const input = h("input", {
        type: "search",
        placeholder: t("currencySearch"),
        "aria-label": t("currencySearch"),
        autocomplete: "off",
      });
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        list.textContent = "";
        const typed = /^[a-z]{3}$/.test(q) ? q.toUpperCase() : null;
        const shown = codes.filter(
          (c) => !q || c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q),
        );
        if (typed && !shown.includes(typed)) shown.unshift(typed);
        for (const code of shown) {
          list.appendChild(
            row({
              lead: h("span", { class: "disc hue-teal code", "aria-hidden": "true", text: code }),
              title: currencyName(code),
              sub: code === store.main ? t("mainCurrency") : null,
              end: code === current ? h("span", { class: "check", text: "✓" }) : null,
              onClick: () => close(code),
            }),
          );
        }
      };
      input.addEventListener("input", draw);
      draw();
      return [
        h("h2", { class: "dialog-title", text: t("chooseCurrency") }),
        input,
        list,
        h(
          "div",
          { class: "dialog-actions" },
          button(t("cancel"), () => close(null), "text"),
        ),
      ];
    },
    { sheet: true, label: t("chooseCurrency") },
  );
}

function settings() {
  const store = ctx.store;
  const prefs = store.prefs || {};
  const model = store.model;
  const usual = store.accounts.find((a) => a.id === model.defaultAccount);
  const save = async (patch) => {
    try {
      await store.updatePrefs(patch);
    } catch (error) {
      failed(error);
    }
  };
  const warnChips = [50, 70, 80, 90, 100].map((v) =>
    chip(v + " %", (prefs.warnAt || 80) === v, () => save({ warnAt: v })),
  );
  const time = h("input", {
    type: "time",
    value: (prefs.remindAt || "20:00").slice(0, 5),
    "aria-label": t("reminderTime"),
    onChange: (e) => /^\d{2}:\d{2}$/.test(e.target.value) && save({ remindAt: e.target.value }),
  });
  const langChips = [
    ["", t("languagePhone")],
    ["en", "English"],
    ["sk", "Slovenčina"],
  ].map(([v, label]) => chip(label, (store.ui.lang || "") === v, () => store.saveUi({ lang: v })));
  const zapli = ctx.zapli;
  const lock = store.live && zapli && zapli.ui && zapli.ui.openSettings;

  return h(
    "div",
    { class: "screen" },
    bar(t("settings"), { back: true }),
    section(
      t("money"),
      h(
        "ul",
        { class: "list" },
        row({
          lead: h("span", { class: "disc hue-teal", "aria-hidden": "true" }, "💱"),
          title: t("mainCurrency"),
          sub: currencyName(store.main) + " (" + store.main + ")",
          onClick: () => changeMain(),
        }),
        row({
          lead: h("span", { class: "disc hue-green", "aria-hidden": "true" }, "🎯"),
          title: t("monthlyBudget"),
          sub: prefs.monthlyBudget ? money(toCents(prefs.monthlyBudget)) : t("notSet"),
          onClick: () => setBudget(),
        }),
        row({
          lead: accountDisc(usual),
          title: t("usualAccount"),
          sub: usual ? usual.name : t("notSet"),
          onClick: () => chooseUsual(),
        }),
        row({
          lead: h("span", { class: "disc hue-cyan", "aria-hidden": "true" }, "⚖️"),
          title: t("rates"),
          sub: store.rates.length ? store.rates.map((r) => r.currency).join(", ") : t("ratesHint"),
          onClick: () => ctx.go("#/currencies"),
        }),
        row({
          lead: h("span", { class: "disc hue-violet", "aria-hidden": "true" }, "🏷️"),
          title: t("categories"),
          sub: t("categoriesHint"),
          onClick: () => ctx.go("#/categories"),
        }),
        row({
          lead: h("span", { class: "disc hue-grey", "aria-hidden": "true" }, "🏦"),
          title: t("tabAccounts"),
          sub: t("accountsHint"),
          onClick: () => ctx.go("#/accounts"),
        }),
        row({
          lead: h("span", { class: "disc hue-violet", "aria-hidden": "true" }, "🔁"),
          title: t("recurringEntries"),
          sub: t("recurringHint"),
          onClick: () => ctx.go("#/recurring"),
        }),
      ),
    ),
    section(
      t("tabHome"),
      h(
        "ul",
        { class: "list" },
        row({
          lead: h("span", { class: "disc hue-teal", "aria-hidden": "true" }, "🏠"),
          title: t("editHome"),
          sub: shownText(store.ui.home),
          onClick: () => ctx.go("#/home-edit"),
        }),
      ),
    ),
    section(
      t("notifications"),
      toggle(
        t("budgetWarnings"),
        prefs.budgetAlerts !== false,
        (v) => save({ budgetAlerts: v }),
        t("budgetWarningsHelp"),
      ),
      h(
        "div",
        { class: "field" },
        h("span", { class: "label", text: t("warnMeAt") }),
        h("div", { class: "chips" }, warnChips),
      ),
      toggle(t("tellWhenAdded"), prefs.addedNotice !== false, (v) => save({ addedNotice: v })),
      toggle(t("dailyReminder"), Boolean(prefs.remindDaily), (v) => save({ remindDaily: v }), t("dailyReminderHelp")),
      prefs.remindDaily ? field(t("reminderTime"), time) : null,
    ),
    section(
      t("yourData"),
      h(
        "ul",
        { class: "list" },
        row({
          lead: h("span", { class: "disc hue-blue", "aria-hidden": "true" }, "📥"),
          title: t("importCsv"),
          sub: t("importHint"),
          onClick: () => ctx.go("#/import"),
        }),
        row({
          lead: h("span", { class: "disc hue-blue", "aria-hidden": "true" }, "📤"),
          title: t("exportAll"),
          sub: t("exportHint"),
          onClick: () => exportAll(),
        }),
        row({
          lead: h("span", { class: "disc hue-blue", "aria-hidden": "true" }, "🗓️"),
          title: t("exportPeriod"),
          sub: t("exportPeriodHint"),
          onClick: () => exportRange(),
        }),
      ),
      h("p", { class: "help", text: t("backupHint") }),
    ),
    section(
      t("privacy"),
      lock
        ? h(
            "ul",
            { class: "list" },
            row({
              lead: h("span", { class: "disc hue-grey", "aria-hidden": "true" }, "🔒"),
              title: t("appLock"),
              sub: t("appLockHint"),
              onClick: () => zapli.ui.openSettings().catch(failed),
            }),
          )
        : null,
      h("p", { class: "help", text: t("privacyText") }),
    ),
    section(t("language"), h("div", { class: "chips" }, langChips)),
    section(t("about"), h("p", { text: t("aboutText") }), h("p", { class: "help", text: t("formatsText") })),
  );
}

async function changeMain() {
  const store = ctx.store;
  const code = await pickCurrency(store.main);
  if (!code || code === store.main) return;
  const entries = store.model.entries.length;
  if (
    entries &&
    !(await confirm({ title: t("changeMainTitle", { code }), message: t("changeMainText", { code }), ok: t("change") }))
  )
    return;
  try {
    await store.updatePrefs({ currency: code });
    const rate = store.rates.find((r) => r.currency === code);
    if (rate) await store.remove("rate", rate.id);
    snack(t("mainChanged", { code }));
  } catch (error) {
    failed(error);
  }
}

async function chooseUsual() {
  const store = ctx.store;
  const id = await dialog(
    (close) => [
      h("h2", { class: "dialog-title", text: t("usualAccount") }),
      h("p", { class: "help", text: t("usualAccountHelp") }),
      h(
        "ul",
        { class: "list" },
        store.accounts
          .filter((a) => !a.archived)
          .map((a) => row({ lead: accountDisc(a), title: a.name, onClick: () => close(a.id) })),
      ),
      h(
        "div",
        { class: "dialog-actions" },
        button(t("cancel"), () => close(null), "text"),
      ),
    ],
    { sheet: true },
  );
  if (!id) return;
  try {
    await store.updatePrefs({ defaultAccount: id });
  } catch (error) {
    failed(error);
  }
}

async function exportAll() {
  const store = ctx.store;
  if (!store.live) return exportThese(store.model.entries, "expenses-" + ctx.today + ".csv");
  try {
    await store.run("exportAll");
  } catch (error) {
    failed(error);
  }
}

async function exportRange() {
  const store = ctx.store;
  const range = await dialog((close) => {
    const from = h("input", { type: "date", value: addMonths(startOfMonth(ctx.today), -1) });
    const to = h("input", { type: "date", value: ctx.today });
    const error = h("p", { class: "error", role: "alert" });
    return [
      h("h2", { class: "dialog-title", text: t("exportPeriod") }),
      h("div", { class: "two" }, field(t("from"), from), field(t("to"), to)),
      error,
      h(
        "div",
        { class: "dialog-actions" },
        button(t("cancel"), () => close(null), "text"),
        button(t("export"), () => {
          if (!isIsoDate(from.value) || !isIsoDate(to.value) || from.value > to.value) {
            error.textContent = t("periodWrong");
            return;
          }
          close({ from: from.value, to: to.value });
        }),
      ),
    ];
  });
  if (!range) return;
  // The save dialog needs a fresh tap: the button in this dialog was one, so the export starts at once.
  if (!store.live)
    return exportThese(
      store.model.entries.filter((e) => e.date >= range.from && e.date <= range.to),
      "expenses-" + range.from + "-to-" + range.to + ".csv",
    );
  try {
    await store.run("exportRange", range);
  } catch (error) {
    if (error && error.code === "NEEDS_GESTURE") snack(t("tapAgain"));
    else failed(error);
  }
}

// ---------------------------------------------------------------- exchange rates

function currencies() {
  const store = ctx.store;
  const model = store.model;
  const unconverted = new Map();
  for (const e of model.entries) {
    if (e.currency && e.currency !== store.main && !e.rate)
      unconverted.set(e.currency, (unconverted.get(e.currency) || 0) + 1);
  }
  const rows = store.rates.map((r) => {
    const micros = toMicros(r.perMain);
    return row({
      lead: h("span", { class: "disc hue-cyan code", "aria-hidden": "true", text: r.currency }),
      title: "1 " + r.currency + " = " + formatNumber(micros / 1e6, ctx.locale, 2, 6) + " " + store.main,
      sub:
        "1 " +
        store.main +
        " = " +
        formatNumber(invertMicros(micros) / 1e6, ctx.locale, 2, 4) +
        " " +
        r.currency +
        (r.updated ? " · " + t("updatedOn", { date: date(r.updated, "short") }) : ""),
      onClick: () => editRate(r.currency),
    });
  });
  const pending = [...unconverted.entries()].map(([code, n]) =>
    h(
      "li",
      { class: "due" },
      h(
        "div",
        { class: "row" },
        h("span", { class: "disc hue-amber code", "aria-hidden": "true", text: code }),
        h(
          "span",
          { class: "row-text" },
          h("span", { class: "row-title", text: t("unconvertedTitle", { n, code }) }),
          h("span", { class: "row-sub", text: t("unconvertedHelp", { main: store.main }) }),
        ),
      ),
      h(
        "div",
        { class: "row-buttons" },
        button(t("convert"), () => convert(code), "tonal"),
      ),
    ),
  );
  return h(
    "div",
    { class: "screen" },
    bar(t("rates"), { back: true }),
    section(null, h("p", { text: t("ratesIntro", { main: store.main }) })),
    pending.length
      ? h(
          "section",
          { class: "card" },
          h("h2", { class: "card-title", text: t("needRates") }),
          h("ul", { class: "list" }, pending),
        )
      : null,
    h(
      "section",
      { class: "card" },
      rows.length ? h("ul", { class: "list" }, rows) : h("p", { class: "muted", text: t("noRates") }),
      h(
        "div",
        { class: "card-actions" },
        button(t("addRate"), () => addRate(), "tonal", { icon: "add" }),
      ),
    ),
  );
}

async function addRate() {
  const code = await pickCurrency(null);
  if (!code || code === ctx.store.main) return;
  await editRate(code);
}

/** Asks for a rate as "1 USD = … EUR"; resolves with millionths, or null. */
async function askRate(code, current) {
  const store = ctx.store;
  return dialog((close) => {
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: current ? formatNumber(current / 1e6, ctx.locale, 2, 6) : "",
      autocomplete: "off",
    });
    const error = h("p", { class: "error", role: "alert" });
    const save = () => {
      const micros = parseTypedRate(input.value);
      if (!micros) {
        error.textContent = t("notARate");
        return;
      }
      close(micros);
    };
    setTimeout(() => input.focus(), 50);
    return [
      h("h2", { class: "dialog-title", text: t("rateTitle", { code }) }),
      h("div", { class: "rate-line" }, h("span", { text: "1 " + code + " =" }), input, h("span", { text: store.main })),
      h("p", { class: "help", text: t("rateHelp") }),
      error,
      h(
        "div",
        { class: "dialog-actions" },
        current ? button(t("delete"), () => close(-1), "text danger") : null,
        button(t("cancel"), () => close(null), "text"),
        button(t("save"), save),
      ),
    ];
  });
}

async function editRate(code) {
  const store = ctx.store;
  const known = store.rates.find((r) => r.currency === code);
  const micros = await askRate(code, known ? toMicros(known.perMain) : null);
  if (micros === null) return;
  try {
    if (micros === -1) await store.remove("rate", known.id);
    else if (known) await store.update("rate", known.id, { perMain: fromMicros(micros), updated: ctx.today });
    else await store.add("rate", { currency: code, perMain: fromMicros(micros), updated: ctx.today });
  } catch (error) {
    failed(error);
  }
}

async function convert(code) {
  const store = ctx.store;
  let known = store.rates.find((r) => r.currency === code);
  let micros = known ? toMicros(known.perMain) : null;
  if (!micros) {
    micros = await askRate(code, null);
    if (!micros || micros === -1) return;
    try {
      await store.add("rate", { currency: code, perMain: fromMicros(micros), updated: ctx.today });
    } catch (error) {
      return failed(error);
    }
  }
  try {
    await store.run("applyRate", { currency: code, rate: fromMicros(micros) });
    await store.loadEntries();
    snack(t("converted", { code }));
  } catch (error) {
    failed(error);
  }
}
