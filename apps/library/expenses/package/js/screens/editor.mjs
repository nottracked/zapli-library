// Adding and editing an entry: spending, income or a transfer. The amount comes from the calculator keypad, so
// "12,40 + 3,10" works; the category, account and date are one tap each, and the usual ones are already picked.
// The date and the account sit right above the keypad, so the everyday entry needs no scrolling. A half-typed entry
// is kept (Back, a rotation, closing the app) until it is saved or discarded.

import {
  ctx,
  h,
  t,
  money,
  date,
  bar,
  button,
  chip,
  segmented,
  field,
  disc,
  accountDisc,
  snack,
  failed,
  dialog,
  categoryName,
  keepFocus,
  blurActive,
} from "../ui.mjs";
import * as calc from "../calc.mjs";
import {
  toCents,
  fromCents,
  toMicros,
  fromMicros,
  convertCents,
  parseTypedRate,
  parseTypedAmount,
  formatNumber,
  invertMicros,
} from "../money.mjs";
import { addDays, isIsoDate } from "../dates.mjs";
import { frequentCategories, allTags, tagsOf } from "../ledger.mjs";
import { icon } from "../icons.mjs";
import { pickCurrency } from "./settings.mjs";

export const keep = true;
const LONG_PRESS_MS = 550;

let state = null;
let persistTimer = null;

// ---------------------------------------------------------------- drafts

/** The values of a new entry: the route's hints, else the usual account and the most used category. */
function newDraft(route) {
  const store = ctx.store;
  const model = store.model;
  const p = route.params;
  const copy = p.get("copy") ? store.entries.get(p.get("copy")) : null;
  const kind = copy ? copy.kind : ["expense", "income", "transfer"].includes(p.get("kind")) ? p.get("kind") : "expense";
  const draft = {
    id: null,
    kind,
    expr: copy ? calc.fromCentsText(copy.cents) : "",
    currency: copy ? copy.currency || null : null,
    rate: copy && copy.rate ? copy.rate : null,
    category: copy ? copy.category || null : p.get("cat") || null,
    account: copy ? copy.account || model.defaultAccount : p.get("acc") || model.defaultAccount,
    toAccount: copy ? copy.toAccount || null : null,
    toAmount: copy && copy.toAmount ? copy.toAmount : "",
    date: isIsoDate(p.get("date")) ? p.get("date") : ctx.today,
    note: copy ? copy.note || "" : "",
    payee: copy ? copy.payee || "" : "",
    tags: copy ? copy.tags || "" : "",
    dirty: false,
  };
  if (!draft.category && kind !== "transfer") draft.category = frequentCategories(model, ctx.today, kind, 1)[0] || null;
  if (kind === "transfer" && !draft.toAccount) {
    const other = store.accounts.find((a) => !a.archived && a.id !== draft.account);
    draft.toAccount = other ? other.id : null;
  }
  const account = store.accounts.find((a) => a.id === draft.account);
  if (!copy && account && account.currency && account.currency !== store.main) draft.currency = account.currency;
  return draft;
}

function editDraft(entry) {
  return {
    id: entry.id,
    kind: entry.kind || "expense",
    expr: calc.fromCentsText(entry.cents),
    currency: entry.currency || null,
    rate: entry.rate || null,
    category: entry.category || null,
    account: entry.account || (entry.kind === "transfer" ? null : ctx.store.model.defaultAccount),
    toAccount: entry.toAccount || null,
    toAmount: entry.toAmount || "",
    date: entry.date,
    note: entry.note || "",
    payee: entry.payee || "",
    tags: entry.tags || "",
    recurring: entry.recurring || null,
    dirty: false,
  };
}

/** Kept drafts by slot: "new" for a new entry, an entry's id for unsaved changes to it. */
function kept() {
  return ctx.store.ui.drafts || {};
}

const pending = new Map();

/** Writes the drafts to the app's store (in its backups), half a second after the last change. */
function persist(now = false) {
  if (state && state.draft.dirty) pending.set(state.slot, { ...state.draft });
  clearTimeout(persistTimer);
  const write = () => {
    const drafts = { ...kept() };
    for (const [slot, draft] of pending) drafts[slot] = draft;
    pending.clear();
    ctx.store.saveUi({ drafts }).catch(() => {});
  };
  if (now) write();
  else persistTimer = setTimeout(write, 500);
}

function forget(slot) {
  pending.delete(slot);
  const drafts = { ...kept() };
  delete drafts[slot];
  return ctx.store.saveUi({ drafts }).catch(() => {});
}

/** Something was typed or picked: the draft is now worth keeping. */
function changed(...regions) {
  state.draft.dirty = true;
  state.fresh = false;
  persist();
  for (const r of regions) paint(r);
}

export function render(route) {
  const store = ctx.store;
  const slot = route.id || "new";
  const path = route.path + "?" + route.params.toString();
  if (state && state.slot !== slot && state.draft.dirty) persist(true);
  if (state && state.away) {
    state.away = false;
    // Coming back to the form from a screen opened from it: carry on. Opened anew instead: show it as kept.
    if (state.slot === slot && state.path !== path && state.draft.dirty) {
      state.restored = true;
      state.path = path;
    }
  }
  if (!state || state.slot !== slot || (state.path !== path && !state.draft.dirty)) {
    const old = kept()[slot];
    let draft;
    let restored = false;
    if (old && old.dirty) {
      draft = { ...old };
      // After a rotation or a reload (the page starts again on this form) it simply carries on; opened again
      // later, it says the draft is back.
      restored = location.hash !== ctx.startHash;
    } else if (route.id) {
      const entry = store.entries.get(route.id);
      if (!entry) {
        return h(
          "div",
          { class: "screen" },
          bar(t("entry"), { back: true }),
          h("div", { class: "empty" }, h("h2", { text: t("entryGone") }), h("p", { text: t("entryGoneText") })),
        );
      }
      draft = editDraft(entry);
    } else draft = newDraft(route);
    const replaces = Boolean(draft.id || route.params.get("copy")) && !restored;
    state = { slot, path, draft, restored, fresh: replaces, keypad: !route.id || restored, regions: {}, receipt: null };
    if (draft.id && store.receipts.has(draft.id)) {
      store.receipt(draft.id).then((picture) => {
        if (state && state.draft.id === draft.id && !state.receiptChanged) {
          state.receipt = picture;
          paint("receipt");
        }
      });
    }
  }
  return build();
}

/** Leaving the form: for a screen opened from it (a new category) it stays as it is; otherwise a draft is kept. */
export function leave({ deeper }) {
  if (!state) return;
  if (deeper) {
    // Off to a screen opened from the form (a new category): the form waits as it is.
    state.away = true;
    if (state.draft.dirty) persist(true);
    return;
  }
  const slot = state.slot;
  if (state.draft.dirty) {
    persist(true);
    snack(t("draftKept"), { label: t("discard"), run: () => forget(slot) });
  }
  state = null;
}

/** Drops the kept draft and starts the form again from the route's values. */
function discard() {
  const slot = state.slot;
  state = null;
  forget(slot).then(() => ctx.go(location.hash, { replace: true }));
}

function title(draft) {
  if (draft.id) return t("editEntry");
  return t(draft.kind === "income" ? "newIncome" : draft.kind === "transfer" ? "newTransfer" : "newExpense");
}

function build() {
  const draft = state.draft;
  const region = (name) => (state.regions[name] = h("div", { class: "region region-" + name }));
  const screen = h(
    "div",
    { class: "screen editor" },
    bar(title(draft), {
      back: true,
      actions: [button(t("save"), save, "filled", { class: "bar-save" })],
    }),
    state.restored
      ? h(
          "p",
          { class: "banner", role: "status" },
          icon("undo"),
          h("span", { text: draft.id ? t("changesBack") : t("draftBack") }),
          button(t("discard"), discard, "text"),
        )
      : null,
    region("kind"),
    region("amount"),
    region("pickers"),
    details(),
    region("inline"),
    region("receipt"),
    draft.id ? actionsForSaved(draft) : null,
    h("div", { class: "keypad-space" }),
    region("keypad"),
  );
  state.screen = screen;
  for (const name of ["kind", "amount", "pickers", "inline", "receipt", "keypad"]) paint(name);
  return screen;
}

function paint(name) {
  const box = state && state.regions[name];
  if (!box) return;
  box.textContent = "";
  const draw = {
    kind: kindRegion,
    amount: amountRegion,
    pickers: pickersRegion,
    inline: inlineRegion,
    receipt: receiptRegion,
    keypad: keypadRegion,
  }[name];
  const content = draw();
  if (content) box.append(...[].concat(content).filter(Boolean));
}

// ---------------------------------------------------------------- kind and amount

function kindRegion() {
  const draft = state.draft;
  return segmented(
    [
      ["expense", t("expenseKind")],
      ["income", t("incomeKind")],
      ["transfer", t("transferKind")],
    ],
    draft.kind,
    (kind) => {
      if (kind === draft.kind) return;
      draft.kind = kind;
      const store = ctx.store;
      const category = store.categories.find((c) => c.id === draft.category);
      if (kind !== "transfer" && (!category || (category.kind || "expense") !== kind)) {
        draft.category =
          frequentCategories(store.model, ctx.today, kind, 1)[0] ||
          (store.categories.find((c) => (c.kind || "expense") === kind && !c.archived) || {}).id ||
          null;
      }
      if (kind === "transfer" && (!draft.toAccount || draft.toAccount === draft.account)) {
        const other = store.accounts.find((a) => !a.archived && a.id !== draft.account);
        draft.toAccount = other ? other.id : null;
      }
      state.screen.querySelector(".bar-title").textContent = title(draft);
      changed("kind", "pickers", "amount", "inline", "keypad");
    },
    t("kind"),
  );
}

function rateOf(currency) {
  const rate = ctx.store.rates.find((r) => r.currency === currency);
  return rate ? toMicros(rate.perMain) : null;
}

/** A button that deletes the last digit, and clears the whole amount when held. */
function backspace(cls, label) {
  const el = h(
    "button",
    { type: "button", class: cls, "aria-label": label, onPointerdown: keepFocus },
    icon("backspace"),
  );
  let timer = null;
  let cleared = false;
  const stop = () => clearTimeout(timer);
  el.addEventListener("pointerdown", () => {
    cleared = false;
    stop();
    timer = setTimeout(() => {
      cleared = true;
      state.draft.expr = "";
      changed("amount");
    }, LONG_PRESS_MS);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(type, stop);
  el.addEventListener("click", () => {
    if (cleared) {
      cleared = false;
      return;
    }
    press("back");
  });
  return el;
}

function amountRegion() {
  const draft = state.draft;
  const store = ctx.store;
  const currency = draft.currency || store.main;
  const result = calc.evaluate(draft.expr);
  const shown = draft.expr ? calc.display(draft.expr, ctx.mark) : "0";
  const amount = h(
    "button",
    {
      type: "button",
      class: "amount-display",
      "aria-label": t("amountLabel", { amount: result.cents ? money(result.cents, currency) : "0" }),
      onClick: () => showKeypad(true),
    },
    h("span", { class: "amount-expr" + (draft.kind === "income" ? " income" : ""), text: shown }),
    calc.hasOperator(draft.expr) && result.cents !== null
      ? h("span", { class: "amount-result", text: "= " + money(result.cents, currency) })
      : null,
  );
  const currencyButton = h(
    "button",
    {
      type: "button",
      class: "currency-button",
      "aria-label": t("currencyIs", { currency }),
      onClick: async () => {
        const code = await pickCurrency(currency);
        if (!code) return;
        draft.currency = code === store.main ? null : code;
        draft.rate = draft.currency ? (rateOf(code) ? fromMicros(rateOf(code)) : null) : null;
        changed("amount", "pickers");
      },
    },
    h("span", { text: currency }),
    icon("chevronDown"),
  );
  const box = h(
    "div",
    { class: "amount-box" + (state.keypad ? " active" : "") },
    amount,
    draft.expr ? backspace("amount-back", t("deleteDigit")) : null,
  );
  const parts = [h("div", { class: "amount-line" }, box, currencyButton)];
  if (result.error === "divideByZero") parts.push(h("p", { class: "error", role: "alert", text: t("divideByZero") }));
  if (draft.currency) parts.push(rateLine(draft, result.cents));
  return parts;
}

function rateLine(draft, cents) {
  const store = ctx.store;
  const micros = draft.rate ? toMicros(draft.rate) : null;
  const input = h("input", {
    type: "text",
    inputmode: "decimal",
    class: "rate-input",
    value: micros ? formatNumber(micros / 1e6, ctx.locale, 2, 6) : "",
    placeholder: "0" + ctx.mark + "00",
    "aria-label": t("rateFor", { from: draft.currency, to: store.main }),
    onFocus: () => showKeypad(false),
    onChange: (e) => {
      const m = parseTypedRate(e.target.value);
      draft.rate = m ? fromMicros(m) : null;
      changed("amount");
    },
  });
  const converted = micros && cents ? money(convertCents(cents, micros)) : null;
  return h(
    "div",
    { class: "rate-line" },
    h("span", { text: "1 " + draft.currency + " =" }),
    input,
    h("span", { text: store.main }),
    h("span", { class: "muted", text: converted ? "≈ " + converted : micros ? "" : t("noRateYet") }),
    micros
      ? h("span", {
          class: "muted small",
          text:
            "1 " +
            store.main +
            " = " +
            formatNumber(invertMicros(micros) / 1e6, ctx.locale, 2, 4) +
            " " +
            draft.currency,
        })
      : null,
  );
}

// ---------------------------------------------------------------- category, accounts and date

function pickersRegion() {
  const draft = state.draft;
  return draft.kind === "transfer" ? transferPickers(draft) : categoryPicker(draft);
}

function categoryPicker(draft) {
  const store = ctx.store;
  const kind = draft.kind;
  let ids = frequentCategories(store.model, ctx.today, kind, 7);
  const rest = store.categories
    .filter((c) => (c.kind || "expense") === kind && !c.archived && !c.parent && !ids.includes(c.id))
    .map((c) => c.id);
  ids = ids.concat(rest).slice(0, 7);
  if (draft.category && !ids.includes(draft.category)) ids = [draft.category, ...ids.slice(0, 6)];
  const chips = ids
    .map((id) => store.categories.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) =>
      chip(
        c.parent ? categoryName(c.id) : c.name,
        c.id === draft.category,
        () => {
          draft.category = c.id;
          changed("pickers");
        },
        disc(c, "tiny"),
      ),
    );
  chips.push(
    h(
      "button",
      { type: "button", class: "chip more", onClick: () => chooseCategory(draft), onPointerdown: keepFocus },
      icon("more"),
      h("span", { text: t("allCategories") }),
    ),
  );
  return h(
    "div",
    { class: "picker" },
    h("h2", { class: "picker-label", text: t("category") }),
    h("div", { class: "chips" }, chips),
  );
}

async function chooseCategory(draft) {
  const store = ctx.store;
  const kind = draft.kind;
  const id = await dialog(
    (close) => {
      const tops = store.categories.filter((c) => (c.kind || "expense") === kind && !c.parent && !c.archived);
      const items = [];
      for (const top of tops) {
        items.push(
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                class: "row" + (top.id === draft.category ? " selected" : ""),
                onClick: () => close(top.id),
              },
              disc(top),
              h("span", { class: "row-text" }, h("span", { class: "row-title", text: top.name })),
            ),
          ),
        );
        for (const sub of store.categories.filter((c) => c.parent === top.id && !c.archived)) {
          items.push(
            h(
              "li",
              { class: "sub" },
              h(
                "button",
                {
                  type: "button",
                  class: "row" + (sub.id === draft.category ? " selected" : ""),
                  onClick: () => close(sub.id),
                },
                disc(sub, "small"),
                h("span", { class: "row-text" }, h("span", { class: "row-title", text: sub.name })),
              ),
            ),
          );
        }
      }
      return [
        h("h2", { class: "dialog-title", text: t("chooseCategory") }),
        items.length ? h("ul", { class: "list" }, items) : h("p", { text: t("noCategoriesYet") }),
        h(
          "div",
          { class: "dialog-actions" },
          button(t("editCategories"), () => close("__edit"), "text"),
          button(t("newCategory"), () => close("__new"), "tonal"),
        ),
      ];
    },
    { sheet: true, label: t("chooseCategory") },
  );
  if (id === "__edit") return ctx.go("#/categories");
  if (id === "__new") return ctx.go("#/category/new?kind=" + kind);
  if (id) {
    draft.category = id;
    changed("pickers");
  }
}

function accountChips(selected, onPick, exclude) {
  const store = ctx.store;
  return store.accounts
    .filter((a) => (!a.archived || a.id === selected) && a.id !== exclude)
    .map((a) => chip(a.name, a.id === selected, () => onPick(a.id), accountDisc(a, "tiny")));
}

function pickAccount(id) {
  const draft = state.draft;
  const store = ctx.store;
  draft.account = id;
  const account = store.accounts.find((a) => a.id === id);
  if (!draft.id && account && account.currency && account.currency !== (draft.currency || store.main)) {
    draft.currency = account.currency === store.main ? null : account.currency;
    draft.rate = draft.currency && rateOf(draft.currency) ? fromMicros(rateOf(draft.currency)) : null;
  }
  changed("amount", "inline", "keypad");
}

function pickDate(iso) {
  state.draft.date = iso;
  changed("inline", "keypad");
}

function transferPickers(draft) {
  const store = ctx.store;
  const from = store.accounts.find((a) => a.id === draft.account);
  const to = store.accounts.find((a) => a.id === draft.toAccount);
  const fromCurrency = (from && from.currency) || store.main;
  const toCurrency = (to && to.currency) || store.main;
  const parts = [
    h(
      "div",
      { class: "picker" },
      h("h2", { class: "picker-label", text: t("fromAccount") }),
      h(
        "div",
        { class: "chips" },
        accountChips(draft.account, (id) => {
          draft.account = id;
          if (draft.toAccount === id) draft.toAccount = null;
          changed("pickers");
        }),
      ),
    ),
    h(
      "div",
      { class: "picker" },
      h("h2", { class: "picker-label", text: t("toAccount") }),
      h(
        "div",
        { class: "chips" },
        accountChips(
          draft.toAccount,
          (id) => {
            draft.toAccount = id;
            changed("pickers");
          },
          draft.account,
        ),
      ),
    ),
  ];
  if (store.accounts.filter((a) => !a.archived).length < 2) {
    parts.push(
      h("p", { class: "help", text: t("transferNeedsTwo") }),
      button(t("addAccount"), () => ctx.go("#/account-edit/new"), "tonal"),
    );
  }
  if (from && to && fromCurrency !== toCurrency) {
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: draft.toAmount ? draft.toAmount.replace(".", ctx.mark) : "",
      onFocus: () => showKeypad(false),
      onInput: (e) => {
        const cents = parseTypedAmount(e.target.value);
        draft.toAmount = cents && cents > 0 ? fromCents(cents) : "";
        draft.dirty = true;
        persist();
      },
    });
    parts.push(field(t("amountReceived", { currency: toCurrency }), input, t("amountReceivedHelp")));
  }
  return parts;
}

/** The date's name on its chip: Today, Yesterday or the date. */
function dateName(iso) {
  if (iso === ctx.today) return t("today");
  if (iso === addDays(ctx.today, -1)) return t("yesterday");
  return date(iso, "day");
}

function dateInput() {
  return h("input", {
    type: "date",
    class: "date-input",
    value: state.draft.date,
    max: addDays(ctx.today, 3650),
    "aria-label": t("pickDate"),
    onChange: (e) => {
      if (isIsoDate(e.target.value)) pickDate(e.target.value);
    },
  });
}

/** Date and account in the form, shown while the keypad is put away (with the keypad they sit on top of it). */
function inlineRegion() {
  if (state.keypad) return null;
  const draft = state.draft;
  const store = ctx.store;
  const yesterday = addDays(ctx.today, -1);
  const parts = [
    h(
      "div",
      { class: "picker" },
      h("h2", { class: "picker-label", text: t("date") }),
      h(
        "div",
        { class: "chips" },
        chip(t("today"), draft.date === ctx.today, () => pickDate(ctx.today)),
        chip(t("yesterday"), draft.date === yesterday, () => pickDate(yesterday)),
        h(
          "label",
          { class: "chip date-chip" + (draft.date !== ctx.today && draft.date !== yesterday ? " on" : "") },
          icon("calendar"),
          dateInput(),
        ),
      ),
    ),
  ];
  if (draft.kind !== "transfer" && store.accounts.filter((a) => !a.archived).length > 1) {
    parts.push(
      h(
        "div",
        { class: "picker" },
        h("h2", { class: "picker-label", text: t("account") }),
        h("div", { class: "chips" }, accountChips(draft.account, pickAccount)),
      ),
    );
  }
  return parts;
}

async function chooseDate() {
  const draft = state.draft;
  const yesterday = addDays(ctx.today, -1);
  const picked = await dialog(
    (close) => {
      const input = dateInput();
      input.addEventListener("change", () => isIsoDate(input.value) && close(input.value));
      return [
        h("h2", { class: "dialog-title", text: t("date") }),
        h(
          "div",
          { class: "chips" },
          chip(t("today"), draft.date === ctx.today, () => close(ctx.today)),
          chip(t("yesterday"), draft.date === yesterday, () => close(yesterday)),
        ),
        field(t("pickDate"), input),
        h(
          "div",
          { class: "dialog-actions" },
          button(t("cancel"), () => close(null), "text"),
        ),
      ];
    },
    { sheet: true, label: t("date") },
  );
  if (picked) pickDate(picked);
}

async function chooseAccount() {
  const store = ctx.store;
  const id = await dialog(
    (close) => [
      h("h2", { class: "dialog-title", text: t("account") }),
      h(
        "ul",
        { class: "list" },
        store.accounts
          .filter((a) => !a.archived || a.id === state.draft.account)
          .map((a) =>
            h(
              "li",
              {},
              h(
                "button",
                {
                  type: "button",
                  class: "row" + (a.id === state.draft.account ? " selected" : ""),
                  onClick: () => close(a.id),
                },
                accountDisc(a),
                h("span", { class: "row-text" }, h("span", { class: "row-title", text: a.name })),
              ),
            ),
          ),
      ),
      h(
        "div",
        { class: "dialog-actions" },
        button(t("cancel"), () => close(null), "text"),
      ),
    ],
    { sheet: true, label: t("account") },
  );
  if (id) pickAccount(id);
}

// ---------------------------------------------------------------- details and receipt

function details() {
  const draft = state.draft;
  const store = ctx.store;
  const notes = [...new Set([...store.entries.values()].map((e) => e.note).filter(Boolean))].slice(0, 200);
  const payees = [...new Set([...store.entries.values()].map((e) => e.payee).filter(Boolean))].slice(0, 200);
  const list = (id, values) =>
    h(
      "datalist",
      { id },
      values.map((v) => h("option", { value: v })),
    );
  const text = (key, max, listId, extra = {}) =>
    h("input", {
      type: "text",
      value: draft[key],
      maxlength: String(max),
      list: listId || null,
      autocomplete: "off",
      onInput: (e) => {
        draft[key] = e.target.value;
        draft.dirty = true;
        persist();
      },
      onFocus: () => showKeypad(false),
      ...extra,
    });
  const tagsInput = text("tags", 200, null, { placeholder: t("tagsPlaceholder") });
  const known = allTags(store.entries.values()).slice(0, 12);
  const tagChips = h(
    "div",
    { class: "chips" },
    known.map((tag) =>
      chip("#" + tag, tagsOf(draft).includes(tag), () => {
        const now = tagsOf(draft);
        const next = now.includes(tag) ? now.filter((x) => x !== tag) : [...now, tag];
        draft.tags = next.join(", ");
        tagsInput.value = draft.tags;
        draft.dirty = true;
        persist();
        tagChips.querySelectorAll(".chip").forEach((c) => {
          const on = tagsOf(draft).includes(c.textContent.slice(1));
          c.classList.toggle("on", on);
          c.setAttribute("aria-pressed", String(on));
        });
      }),
    ),
  );
  return h(
    "div",
    { class: "details" },
    list("note-list", notes),
    list("payee-list", payees),
    field(t("note"), text("note", 500, "note-list", { placeholder: t("notePlaceholder") })),
    draft.kind === "transfer"
      ? null
      : field(t("payee"), text("payee", 100, "payee-list", { placeholder: t("payeePlaceholder") })),
    field(t("tags"), tagsInput),
    known.length ? tagChips : null,
  );
}

function receiptRegion() {
  const draft = state.draft;
  const zapli = ctx.zapli;
  const canPhoto = Boolean(zapli && zapli.supports && zapli.supports("camera.photo"));
  const canPick = Boolean(zapli && zapli.supports && zapli.supports("media.pick"));
  const browser = !ctx.store.live;
  if (!canPhoto && !canPick && !browser) return null;
  if (draft.kind === "transfer" && !state.receipt) return null;
  if (state.receipt) {
    const src = "data:" + state.receipt.type + ";base64," + state.receipt.b64;
    return h(
      "div",
      { class: "picker" },
      h("h2", { class: "picker-label", text: t("receipt") }),
      h(
        "div",
        { class: "receipt" },
        h(
          "button",
          { type: "button", class: "receipt-thumb", onClick: () => showPicture(src), "aria-label": t("openReceipt") },
          h("img", { src, alt: t("receiptPhoto") }),
        ),
        button(
          t("remove"),
          () => {
            state.receipt = null;
            state.receiptChanged = true;
            paint("receipt");
          },
          "text",
          { icon: "trash" },
        ),
      ),
    );
  }
  const take = async (how) => {
    try {
      let file;
      if (how === "photo") file = await zapli.camera.photo({ maxWidth: 1600, quality: 0.85 });
      else if (how === "pick") file = (await zapli.media.pick({ multiple: false }))[0];
      else file = await pickInBrowser();
      if (!file) return;
      state.receipt = await shrink(file);
      state.receiptChanged = true;
      state.draft.dirty = true;
      paint("receipt");
    } catch (error) {
      if (error && error.code === "PERMISSION_DENIED") snack(t("cameraDenied"));
      else if (error && error.code === "QUOTA_EXCEEDED") snack(t("storageFull"));
      else if (!error || error.code !== "CANCELLED") snack(t("pictureFailed"));
    }
  };
  return h(
    "div",
    { class: "picker" },
    h("h2", { class: "picker-label", text: t("receipt") }),
    h(
      "div",
      { class: "chips" },
      canPhoto ? button(t("takePhoto"), () => take("photo"), "tonal", { icon: "camera" }) : null,
      canPick ? button(t("pickPicture"), () => take("pick"), "tonal", { icon: "image" }) : null,
      browser ? button(t("pickPicture"), () => take("browser"), "tonal", { icon: "image" }) : null,
    ),
  );
}

function pickInBrowser() {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: "image/*", onChange: (e) => resolve(e.target.files[0] || null) });
    input.click();
  });
}

/** Makes a receipt picture small enough for the store: at most 1,280 pixels on its long side, as JPEG. */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    for (const [side, quality] of [
      [1280, 0.72],
      [1024, 0.6],
      [800, 0.5],
    ]) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (b64.length < 700000)
        return { type: "image/jpeg", b64, w: canvas.width, h: canvas.height, at: new Date().toISOString() };
    }
    throw Object.assign(new Error("too large"), { code: "QUOTA_EXCEEDED" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A receipt picture over the whole screen; Back or a tap closes it. */
export function showPicture(src) {
  dialog(
    (close) => [
      h(
        "button",
        { type: "button", class: "picture-close", onClick: () => close(), "aria-label": t("close") },
        h("img", { src, alt: t("receiptPhoto"), class: "picture-full" }),
      ),
    ],
    { label: t("receipt") },
  );
}

// ---------------------------------------------------------------- keypad

function showKeypad(on) {
  if (state.keypad === on) return;
  state.keypad = on;
  if (on && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  paint("keypad");
  paint("amount");
  paint("inline");
}

/** The keypad, docked at the bottom with the date and the account right above it. */
function keypadRegion() {
  if (state.screen) state.screen.classList.toggle("keypad-on", state.keypad);
  const spacer = state.screen && state.screen.querySelector(".keypad-space");
  if (spacer) spacer.style.height = "";
  if (!state.keypad) return null;
  const draft = state.draft;
  const store = ctx.store;
  // The space under the form matches the dock's real height, which grows with the phone's text size.
  requestAnimationFrame(() => {
    const dock = state && state.screen && state.screen.querySelector(".dock");
    const space = state && state.screen && state.screen.querySelector(".keypad-space");
    if (dock && space && dock.offsetHeight > 0) space.style.height = dock.offsetHeight + 16 + "px";
  });
  const key = (value, label, aria, cls = "") =>
    h(
      "button",
      {
        type: "button",
        class: "key " + cls,
        "aria-label": aria || null,
        onClick: () => press(value),
        onPointerdown: keepFocus,
      },
      label,
    );
  const account = store.accounts.find((a) => a.id === draft.account);
  const showAccount = draft.kind !== "transfer" && store.accounts.filter((a) => !a.archived).length > 1;
  return h(
    "div",
    { class: "dock" },
    h(
      "div",
      { class: "dock-row" },
      h(
        "button",
        {
          type: "button",
          class: "chip dock-chip",
          onClick: chooseDate,
          onPointerdown: keepFocus,
          "aria-label": t("dateIs", { date: dateName(draft.date) }),
        },
        icon("calendar"),
        h("span", { text: dateName(draft.date) }),
      ),
      showAccount
        ? h(
            "button",
            {
              type: "button",
              class: "chip dock-chip",
              onClick: chooseAccount,
              onPointerdown: keepFocus,
              "aria-label": t("accountIs", { name: account ? account.name : "" }),
            },
            accountDisc(account, "tiny"),
            h("span", { text: account ? account.name : t("account") }),
          )
        : null,
    ),
    h(
      "div",
      { class: "keypad", role: "group", "aria-label": t("keypad") },
      key("7", "7"),
      key("8", "8"),
      key("9", "9"),
      backspace("key op back", t("deleteDigitHold")),
      key("4", "4"),
      key("5", "5"),
      key("6", "6"),
      key("÷", "÷", t("divide"), "op"),
      key("1", "1"),
      key("2", "2"),
      key("3", "3"),
      key("×", "×", t("multiply"), "op"),
      key(".", ctx.mark, t("decimalMark")),
      key("0", "0"),
      key("−", "−", t("minus"), "op"),
      key("+", "+", t("plus"), "op"),
    ),
  );
}

/** A key: the first digit typed into a saved amount replaces it; an operator goes on from it. */
function press(value) {
  const draft = state.draft;
  if (state.fresh && (/^\d$/.test(value) || value === ".")) draft.expr = "";
  draft.expr = calc.press(draft.expr, value);
  changed("amount");
}

// ---------------------------------------------------------------- saving

function actionsForSaved(draft) {
  return h(
    "div",
    { class: "editor-actions" },
    button(t("addAgainToday"), () => ctx.go("#/add?copy=" + encodeURIComponent(draft.id)), "text", { icon: "add" }),
    draft.recurring
      ? button(t("openRecurring"), () => ctx.go("#/rule/" + draft.recurring), "text", { icon: "repeat" })
      : button(t("makeRecurring"), () => ctx.go("#/rule/new?from=" + encodeURIComponent(draft.id)), "text", {
          icon: "repeat",
        }),
    button(t("delete"), remove, "text danger", { icon: "trash" }),
  );
}

/** The record values of the form, or an error message. */
function valuesOf(draft) {
  const store = ctx.store;
  const { cents, error } = calc.evaluate(draft.expr);
  if (error === "divideByZero") return { error: t("divideByZero") };
  if (cents === null || cents <= 0) return { error: t("amountNeeded") };
  if (draft.kind === "transfer") {
    if (!draft.account || !draft.toAccount) return { error: t("transferNeedsTwo") };
    if (draft.account === draft.toAccount) return { error: t("transferSameAccount") };
  }
  const foreign = draft.currency && draft.currency !== store.main;
  const micros = foreign && draft.rate ? toMicros(draft.rate) : null;
  const tags = tagsOf(draft).join(", ");
  return {
    values: {
      kind: draft.kind,
      amount: fromCents(cents),
      date: draft.date,
      category: draft.kind === "transfer" ? null : draft.category || null,
      account: draft.account || null,
      toAccount: draft.kind === "transfer" ? draft.toAccount : null,
      toAmount: draft.kind === "transfer" && draft.toAmount ? draft.toAmount : null,
      currency: foreign ? draft.currency : null,
      rate: micros ? fromMicros(micros) : null,
      baseAmount: fromCents(micros ? convertCents(cents, micros) : cents),
      note: draft.note.trim() || null,
      payee: draft.kind === "transfer" ? null : draft.payee.trim() || null,
      tags: tags || null,
    },
  };
}

/** How a saved entry is named in messages: "Groceries €21.50". */
export function entryLabel(values) {
  const store = ctx.store;
  const what =
    values.kind === "transfer"
      ? t("transferKind")
      : values.category
        ? (store.categories.find((c) => c.id === values.category) || {}).name || t("noCategory")
        : values.note || t("noCategory");
  return t("entryLabel", { what, amount: money(toCents(values.amount), values.currency || store.main) });
}

async function save() {
  blurActive();
  const store = ctx.store;
  const draft = state.draft;
  const { values, error } = valuesOf(draft);
  if (error) {
    snack(error);
    showKeypad(true);
    return;
  }
  try {
    let saved;
    const before = draft.id ? store.entries.get(draft.id) : null;
    if (draft.id) saved = await store.update("expense", draft.id, values);
    else saved = await store.add("expense", values);
    if (state.receiptChanged) {
      if (state.receipt) await store.setReceipt(saved.id, state.receipt);
      else if (store.receipts.has(saved.id)) await store.deleteReceipt(saved.id);
    }
    await rememberRate(values);
    const slot = state.slot;
    state = null;
    await forget(slot);
    ctx.back();
    if (before) {
      const old = restorable(before);
      snack(t("updatedWhat", { what: entryLabel(values) }), {
        label: t("undo"),
        run: () => store.update("expense", before.id, old).catch(failed),
      });
    } else {
      snack(t("savedWhat", { what: entryLabel(values) }), { label: t("undo"), run: () => undoAdd(saved.id) });
    }
  } catch (error2) {
    failed(error2);
  }
}

/** A typed rate becomes the one the app suggests next time for that currency. */
async function rememberRate(values) {
  const store = ctx.store;
  if (!values.currency || !values.rate) return;
  const known = store.rates.find((r) => r.currency === values.currency);
  try {
    if (!known) await store.add("rate", { currency: values.currency, perMain: values.rate, updated: ctx.today });
    else if (known.perMain !== values.rate)
      await store.update("rate", known.id, { perMain: values.rate, updated: ctx.today });
  } catch {
    // The entry keeps its own rate either way.
  }
}

/** The stored values of an entry, to put back with Undo. */
export function restorable(entry) {
  const keys = [
    "kind",
    "amount",
    "date",
    "category",
    "account",
    "toAccount",
    "toAmount",
    "currency",
    "rate",
    "baseAmount",
    "note",
    "payee",
    "tags",
  ];
  const values = {};
  for (const k of keys) values[k] = entry[k] === undefined ? null : entry[k];
  if (entry.recurring) values.recurring = entry.recurring;
  return values;
}

async function undoAdd(id) {
  const store = ctx.store;
  try {
    if (store.receipts.has(id)) await store.deleteReceipt(id);
    await store.remove("expense", id);
  } catch (error) {
    failed(error);
  }
}

async function remove() {
  const store = ctx.store;
  const entry = store.entries.get(state.draft.id);
  if (!entry) return;
  const picture = store.receipts.has(entry.id) ? await store.receipt(entry.id) : null;
  try {
    await store.remove("expense", entry.id);
    if (picture) await store.deleteReceipt(entry.id);
    const slot = state.slot;
    state = null;
    await forget(slot);
    ctx.back();
    snack(t("deletedWhat", { what: entryLabel(entry) }), {
      label: t("undo"),
      run: async () => {
        try {
          const values = restorable(entry);
          delete values.recurring;
          const again = await store.add("expense", values);
          if (picture) await store.setReceipt(again.id, picture);
        } catch (error) {
          failed(error);
        }
      },
    });
  } catch (error) {
    failed(error);
  }
}
