// Building blocks of the screens: an element helper, the shared context (language, formats, navigation) and the
// pieces every screen uses (top bar, rows, empty states, dialogs, the snackbar with Undo).

import { icon, emojiOf, hueOf, ACCOUNT_ICONS } from "./icons.mjs";
import { formatMoney } from "./money.mjs";
import { formatDate, addDays } from "./dates.mjs";

/** What every screen needs; filled in by app.mjs at start and when the language changes. */
export const ctx = {
  store: null,
  t: (key) => key,
  lang: "en",
  locale: "en-GB",
  mark: ".",
  today: "",
  go: () => {},
  back: () => {},
  zapli: null,
};

/**
 * Makes an element. props: class, text, html is never used; attributes by name (aria-label, role, type, …);
 * on<Event> handlers; `style` as an object. Children: nodes, text, or arrays of them; null and false are skipped.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "style") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value") el.value = value;
    else if (key === "checked") el.checked = value;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

/** Adds children to an element, skipping null and false (the DOM's own append would write them as text). */
export function put(el, ...children) {
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function t(key, params) {
  return ctx.t(key, params);
}

/** An amount in a currency (the main one by default), for people. */
export function money(cents, currency, options) {
  return formatMoney(cents, currency || ctx.store.main, ctx.locale, options);
}

export function date(iso, style) {
  return formatDate(iso, ctx.locale, style);
}

/** "Today", "Yesterday" or the date with its weekday. */
export function dayName(iso) {
  if (iso === ctx.today) return t("today");
  if (iso === addDays(ctx.today, -1)) return t("yesterday");
  return date(iso, "day");
}

/** A button that shows only an icon, with its name for screen readers. */
export function iconButton(name, label, onClick, extra = {}) {
  return h(
    "button",
    {
      class: "icon-button " + (extra.class || ""),
      type: "button",
      "aria-label": label,
      title: label,
      onClick,
      ...extra.attrs,
    },
    icon(name),
  );
}

/** The top bar of a screen: a back arrow on pushed screens, the title, and actions on the right. */
export function bar(title, { back = false, actions = [] } = {}) {
  return h(
    "header",
    { class: "bar" },
    back ? iconButton("back", t("back"), () => ctx.back()) : null,
    h("h1", { class: "bar-title", text: title }),
    h("div", { class: "bar-actions" }, actions),
  );
}

/** A category's coloured disc with its picture. */
export function disc(category, size = "") {
  const hue = hueOf(category);
  return h(
    "span",
    { class: "disc hue-" + hue + " " + size, "aria-hidden": "true" },
    emojiOf(category ? category.icon : "category"),
  );
}

/** An account's disc. */
export function accountDisc(account, size = "") {
  return h(
    "span",
    { class: "disc hue-grey " + size, "aria-hidden": "true" },
    ACCOUNT_ICONS[(account && account.type) || "bank"] || "🏦",
  );
}

/** The disc of an entry: its category's, or the transfer arrows. */
export function entryDisc(entry, size = "") {
  const store = ctx.store;
  if (entry.kind === "transfer")
    return h("span", { class: "disc hue-teal " + size, "aria-hidden": "true" }, icon("swap"));
  const category = entry.category ? store.categories.find((c) => c.id === entry.category) : null;
  return disc(category, size);
}

/** A category's name with its parent ("Eating out › Coffee"). */
export function categoryName(id, withParent = true) {
  const list = ctx.store.categories;
  const category = id ? list.find((c) => c.id === id) : null;
  if (!category) return t("noCategory");
  const parent = withParent && category.parent ? list.find((c) => c.id === category.parent) : null;
  return parent ? parent.name + " › " + category.name : category.name;
}

export function accountName(id) {
  const account = id ? ctx.store.accounts.find((a) => a.id === id) : null;
  return account ? account.name : t("outside");
}

/** The amount of an entry as a list shows it: income with +, transfers plain, spending with −. */
export function entryAmount(entry) {
  const cents = entry.cents;
  const currency = entry.currency || ctx.store.main;
  if (entry.kind === "income")
    return h("span", { class: "amount income", text: money(cents, currency, { sign: "always" }) });
  if (entry.kind === "transfer") return h("span", { class: "amount transfer", text: money(cents, currency) });
  return h("span", { class: "amount expense", text: money(-cents, currency) });
}

/** One entry as a row that opens it. */
export function entryRow(entry, { showDate = false, balance = null } = {}) {
  const store = ctx.store;
  const title =
    entry.note || entry.payee || (entry.kind === "transfer" ? t("transferKind") : categoryName(entry.category, false));
  let subtitle;
  if (entry.kind === "transfer") subtitle = accountName(entry.account) + " → " + accountName(entry.toAccount);
  else {
    const parts = [];
    if (entry.note || entry.payee) parts.push(categoryName(entry.category));
    if (entry.note && entry.payee) parts.push(entry.payee);
    if (store.accounts.length > 1) parts.push(accountName(entry.account || store.model.defaultAccount));
    subtitle = parts.join(" · ");
  }
  if (showDate) subtitle = date(entry.date, "short") + (subtitle ? " · " + subtitle : "");
  const foreign = entry.currency && entry.currency !== store.main;
  return h(
    "li",
    {},
    h(
      "button",
      { class: "row", type: "button", onClick: () => ctx.go("#/edit/" + entry.id) },
      entryDisc(entry),
      h(
        "span",
        { class: "row-text" },
        h("span", { class: "row-title", text: title }),
        subtitle ? h("span", { class: "row-sub", text: subtitle }) : null,
      ),
      h(
        "span",
        { class: "row-end" },
        entryAmount(entry),
        foreign
          ? h("span", { class: "row-sub", text: "≈ " + money(entry.kind === "expense" ? -entry.base : entry.base) })
          : null,
        balance !== null ? h("span", { class: "row-sub", text: t("balanceAfter", { amount: money(balance) }) }) : null,
        store.receipts.has(entry.id) ? h("span", { class: "row-flag" }, icon("receipt", t("hasReceipt"))) : null,
        entry.recurring ? h("span", { class: "row-flag" }, icon("repeat", t("fromRecurring"))) : null,
      ),
    ),
  );
}

/** A row with a disc, text and something at the end; `onClick` makes it a button. */
export function row({ lead, title, sub, end, onClick, label }) {
  const inner = [
    lead || null,
    h(
      "span",
      { class: "row-text" },
      h("span", { class: "row-title", text: title }),
      sub ? h("span", { class: "row-sub", text: sub }) : null,
    ),
    end !== undefined && end !== null ? h("span", { class: "row-end" }, end) : null,
    onClick ? h("span", { class: "row-chevron" }, icon("chevronRight")) : null,
  ];
  return h(
    "li",
    {},
    onClick
      ? h("button", { class: "row", type: "button", onClick, "aria-label": label || null }, inner)
      : h("div", { class: "row" }, inner),
  );
}

/** A friendly empty state: a picture, a heading, a sentence and the buttons that get the user going. */
export function empty(picture, title, text, actions = []) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "empty-picture", "aria-hidden": "true" }, picture),
    h("h2", { text: title }),
    text ? h("p", { text }) : null,
    h("div", { class: "empty-actions" }, actions),
  );
}

export function button(text, onClick, kind = "filled", extra = {}) {
  return h(
    "button",
    {
      class: "btn " + kind + " " + (extra.class || ""),
      type: extra.type || "button",
      onClick,
      disabled: extra.disabled || null,
      ...(extra.attrs || {}),
    },
    extra.icon ? icon(extra.icon) : null,
    h("span", { text }),
  );
}

/** A progress bar with its state colour; the numbers it stands for are in the text beside it. */
export function progress(pct, state = "ok", label) {
  return h(
    "div",
    {
      class: "progress " + state,
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(Math.min(100, Math.max(0, pct))),
      "aria-label": label || null,
    },
    h("div", { class: "progress-fill", style: { width: Math.min(100, Math.max(0, pct)) + "%" } }),
  );
}

/** A segmented choice; `onChange(value)` runs on a tap. */
export function segmented(options, value, onChange, label) {
  return h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": label || null },
    options.map(([v, text]) =>
      h("button", {
        type: "button",
        role: "radio",
        "aria-checked": String(v === value),
        class: v === value ? "on" : "",
        onClick: () => onChange(v),
        text,
      }),
    ),
  );
}

/** A chip that can be selected. */
export function chip(text, selected, onClick, lead = null) {
  return h(
    "button",
    { type: "button", class: "chip" + (selected ? " on" : ""), "aria-pressed": String(Boolean(selected)), onClick },
    lead,
    h("span", { text }),
  );
}

/** A labelled field around an input. */
export function field(label, input, help) {
  const id = input.id || "f" + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h(
    "div",
    { class: "field" },
    h("label", { for: id, text: label }),
    input,
    help ? h("p", { class: "help", text: help }) : null,
  );
}

/** A switch row. */
export function toggle(label, checked, onChange, help) {
  const input = h("input", { type: "checkbox", role: "switch", checked, onChange: (e) => onChange(e.target.checked) });
  return h(
    "label",
    { class: "toggle" },
    h(
      "span",
      { class: "toggle-text" },
      h("span", { text: label }),
      help ? h("span", { class: "help", text: help }) : null,
    ),
    input,
  );
}

export function section(title, ...children) {
  return h("section", { class: "card" }, title ? h("h2", { class: "card-title", text: title }) : null, children);
}

// ---------------------------------------------------------------- snackbar

let snackTimer = null;

/** A short message at the bottom; with `action` it offers a button such as Undo for about seven seconds. */
export function snack(text, action) {
  const box = document.getElementById("snackbar");
  if (!box) return;
  clearTimeout(snackTimer);
  box.textContent = "";
  box.appendChild(h("span", { text }));
  if (action) {
    box.appendChild(
      h("button", {
        type: "button",
        class: "snack-action",
        text: action.label,
        onClick: () => {
          box.classList.remove("show");
          action.run();
        },
      }),
    );
  }
  box.classList.add("show");
  snackTimer = setTimeout(() => box.classList.remove("show"), action ? 7000 : 3500);
}

/** A message for a failed write, in words. */
export function failed(error) {
  const code = error && error.code;
  if (code === "INVALID_DATA" && error.issues && error.issues.length)
    snack(error.issues[0].message || t("couldNotSave"));
  else if (code === "QUOTA_EXCEEDED") snack(t("storageFull"));
  else if (code === "NEEDS_GESTURE") snack(t("tapAgain"));
  else if (code === "UNSUPPORTED") snack(t("onlyInApp"));
  else if (code !== "CANCELLED") snack(t("couldNotSave"));
}

// ---------------------------------------------------------------- dialogs

/**
 * A modal dialog (Back closes it). build(close) returns its content; it resolves with what close() was given, or
 * null when it was dismissed. `sheet` slides it up from the bottom.
 */
export function dialog(build, { sheet = false, label } = {}) {
  return new Promise((resolve) => {
    const d = h("dialog", { class: sheet ? "sheet" : "dialog", "aria-label": label || null });
    let result = null;
    const close = (value) => {
      result = value === undefined ? null : value;
      d.close();
    };
    d.addEventListener("close", () => {
      d.remove();
      resolve(result);
    });
    d.addEventListener("click", (e) => {
      if (e.target === d) close(null);
    });
    d.appendChild(h("div", { class: "dialog-body" }, build(close)));
    document.body.appendChild(d);
    d.showModal();
  });
}

/** Asks before something that cannot be taken back. Resolves true for yes. */
export function confirm({ title, message, ok, danger = false }) {
  return dialog((close) => [
    h("h2", { class: "dialog-title", text: title }),
    message ? h("p", { text: message }) : null,
    h(
      "div",
      { class: "dialog-actions" },
      button(t("cancel"), () => close(false), "text"),
      button(ok || t("ok"), () => close(true), danger ? "danger" : "filled"),
    ),
  ]).then(Boolean);
}

/** Asks for an amount (a budget, a balance); resolves with cents, null for none, or undefined when cancelled. */
export function askAmount({ title, help, value, allowEmpty = true, allowNegative = false, currency, parse }) {
  return dialog((close) => {
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: value === null || value === undefined ? "" : value,
      autocomplete: "off",
    });
    const error = h("p", { class: "error", role: "alert" });
    const save = () => {
      const text = input.value.trim();
      if (!text && allowEmpty) return close({ cents: null });
      const cents = parse(text);
      if (cents === null || (!allowNegative && cents < 0)) {
        error.textContent = t("notAnAmount");
        return;
      }
      close({ cents });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });
    setTimeout(() => input.focus(), 50);
    return [
      h("h2", { class: "dialog-title", text: title }),
      field(t("amountIn", { currency: currency || ctx.store.main }), input, help),
      error,
      h(
        "div",
        { class: "dialog-actions" },
        button(t("cancel"), () => close(undefined), "text"),
        button(t("save"), save),
      ),
    ];
  }).then((r) => (r === null ? undefined : r && r.cents !== undefined ? r.cents : undefined));
}
