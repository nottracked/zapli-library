// Adding and editing an entry: spending, income or a transfer. The amount comes from the calculator keypad, so
// "12,40 + 3,10" works; the category, account and date are one tap each, and the usual ones are already picked.

import {
  ctx,
  h,
  t,
  money,
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
const DRAFT_KEY = "expenses-draft";

let state = null;

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
    receipt: null,
    receiptChanged: false,
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
    receipt: null,
    receiptChanged: false,
  };
}

function saveDraft() {
  try {
    const { receipt, ...rest } = state.draft;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ path: state.path, draft: rest }));
  } catch {
    // Without session storage a reload starts the form again.
  }
}

function dropDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing kept.
  }
}

function restoredDraft(path) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    return saved && saved.path === path ? saved.draft : null;
  } catch {
    return null;
  }
}

export function render(route) {
  const store = ctx.store;
  const path = route.path + "?" + route.params.toString();
  if (!state || state.path !== path) {
    let draft = restoredDraft(path);
    if (!draft) {
      if (route.id) {
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
    }
    state = { path, draft, keypad: !route.id, regions: {} };
    if (draft.id && store.receipts.has(draft.id)) {
      store.receipt(draft.id).then((picture) => {
        if (state && state.draft.id === draft.id && !state.draft.receiptChanged) {
          state.draft.receipt = picture;
          paint("receipt");
        }
      });
    }
  }
  return build();
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
    region("kind"),
    region("amount"),
    region("pickers"),
    region("date"),
    details(),
    region("receipt"),
    draft.id ? actionsForSaved(draft) : null,
    h("div", { class: "keypad-space" }),
    region("keypad"),
  );
  state.screen = screen;
  for (const name of ["kind", "amount", "pickers", "date", "receipt", "keypad"]) paint(name);
  return screen;
}

function paint(name) {
  const box = state.regions[name];
  if (!box) return;
  box.textContent = "";
  const draw = {
    kind: kindRegion,
    amount: amountRegion,
    pickers: pickersRegion,
    date: dateRegion,
    receipt: receiptRegion,
    keypad: keypadRegion,
  }[name];
  const content = draw();
  if (content) box.append(...[].concat(content).filter(Boolean));
}

function changed(...regions) {
  saveDraft();
  for (const r of regions) paint(r);
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
      document.querySelector(".editor .bar-title").textContent = title(draft);
      changed("kind", "pickers", "amount");
    },
    t("kind"),
  );
}

function rateOf(currency) {
  const rate = ctx.store.rates.find((r) => r.currency === currency);
  return rate ? toMicros(rate.perMain) : null;
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
      class: "amount-display" + (state.keypad ? " active" : ""),
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
  const parts = [h("div", { class: "amount-line" }, amount, currencyButton)];
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

// ---------------------------------------------------------------- category and accounts

function pickersRegion() {
  const draft = state.draft;
  return draft.kind === "transfer" ? transferPickers(draft) : [categoryPicker(draft), accountPicker(draft)];
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
      { type: "button", class: "chip more", onClick: () => chooseCategory(draft) },
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

function accountPicker(draft) {
  const store = ctx.store;
  if (store.accounts.filter((a) => !a.archived).length < 2) return null;
  return h(
    "div",
    { class: "picker" },
    h("h2", { class: "picker-label", text: t("account") }),
    h(
      "div",
      { class: "chips" },
      accountChips(draft.account, (id) => {
        draft.account = id;
        const account = store.accounts.find((a) => a.id === id);
        if (!draft.id && account && account.currency && account.currency !== (draft.currency || store.main)) {
          draft.currency = account.currency === store.main ? null : account.currency;
          draft.rate = draft.currency && rateOf(draft.currency) ? fromMicros(rateOf(draft.currency)) : null;
          paint("amount");
        }
        changed("pickers");
      }),
    ),
  );
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
      onChange: (e) => {
        const cents = parseTypedAmount(e.target.value);
        draft.toAmount = cents && cents > 0 ? fromCents(cents) : "";
        saveDraft();
      },
    });
    parts.push(field(t("amountReceived", { currency: toCurrency }), input, t("amountReceivedHelp")));
  }
  return parts;
}

// ---------------------------------------------------------------- date, details, receipt

function dateRegion() {
  const draft = state.draft;
  const yesterday = addDays(ctx.today, -1);
  const input = h("input", {
    type: "date",
    value: draft.date,
    max: addDays(ctx.today, 3650),
    "aria-label": t("pickDate"),
    onChange: (e) => {
      if (isIsoDate(e.target.value)) {
        draft.date = e.target.value;
        changed("date");
      }
    },
  });
  return h(
    "div",
    { class: "picker" },
    h("h2", { class: "picker-label", text: t("date") }),
    h(
      "div",
      { class: "chips" },
      chip(t("today"), draft.date === ctx.today, () => {
        draft.date = ctx.today;
        changed("date");
      }),
      chip(t("yesterday"), draft.date === yesterday, () => {
        draft.date = yesterday;
        changed("date");
      }),
      h(
        "label",
        { class: "chip date-chip" + (draft.date !== ctx.today && draft.date !== yesterday ? " on" : "") },
        icon("calendar"),
        input,
      ),
    ),
  );
}

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
        saveDraft();
      },
      onFocus: () => showKeypad(false),
      ...extra,
    });
  const tagsInput = text("tags", 200, null, { placeholder: t("tagsPlaceholder") });
  const known = allTags(store.entries.values()).slice(0, 12);
  const tagChips = h(
    "div",
    { class: "chips small" },
    known.map((tag) =>
      chip("#" + tag, tagsOf(draft).includes(tag), () => {
        const now = tagsOf(draft);
        const next = now.includes(tag) ? now.filter((x) => x !== tag) : [...now, tag];
        draft.tags = next.join(", ");
        tagsInput.value = draft.tags;
        saveDraft();
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
  if (draft.kind === "transfer" && !draft.receipt) return null;
  if (draft.receipt) {
    const src = "data:" + draft.receipt.type + ";base64," + draft.receipt.b64;
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
            draft.receipt = null;
            draft.receiptChanged = true;
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
      draft.receipt = await shrink(file);
      draft.receiptChanged = true;
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
}

function keypadRegion() {
  if (state.screen) state.screen.classList.toggle("keypad-on", state.keypad);
  const spacer = state.screen && state.screen.querySelector(".keypad-space");
  if (spacer) spacer.style.height = "";
  if (!state.keypad) return null;
  // The space under the form matches the keypad's real height, which grows with the phone's text size.
  requestAnimationFrame(() => {
    const keypad = state && state.screen && state.screen.querySelector(".keypad");
    const space = state && state.screen && state.screen.querySelector(".keypad-space");
    if (keypad && space && keypad.offsetHeight > 0) space.style.height = keypad.offsetHeight + 16 + "px";
  });
  const key = (value, label, aria, cls = "") =>
    h(
      "button",
      { type: "button", class: "key " + cls, "aria-label": aria || null, onClick: () => press(value) },
      label,
    );
  return h(
    "div",
    { class: "keypad", role: "group", "aria-label": t("keypad") },
    key("7", "7"),
    key("8", "8"),
    key("9", "9"),
    key("÷", "÷", t("divide"), "op"),
    key("4", "4"),
    key("5", "5"),
    key("6", "6"),
    key("×", "×", t("multiply"), "op"),
    key("1", "1"),
    key("2", "2"),
    key("3", "3"),
    key("−", "−", t("minus"), "op"),
    key(".", ctx.mark, t("decimalMark")),
    key("0", "0"),
    key("back", icon("backspace"), t("deleteDigit")),
    key("+", "+", t("plus"), "op"),
  );
}

function press(value) {
  const draft = state.draft;
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

async function save() {
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
    if (draft.receiptChanged) {
      if (draft.receipt) await store.setReceipt(saved.id, draft.receipt);
      else if (store.receipts.has(saved.id)) await store.deleteReceipt(saved.id);
    }
    await rememberRate(values);
    dropDraft();
    state = null;
    ctx.back();
    if (before) {
      const old = restorable(before);
      snack(t("savedChanges"), { label: t("undo"), run: () => store.update("expense", before.id, old).catch(failed) });
    } else {
      snack(t("savedEntry", { amount: money(toCents(values.amount), values.currency || store.main) }), {
        label: t("undo"),
        run: () => undoAdd(saved.id),
      });
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
  const draft = state.draft;
  const entry = store.entries.get(draft.id);
  if (!entry) return;
  const picture = store.receipts.has(entry.id) ? await store.receipt(entry.id) : null;
  try {
    await store.remove("expense", entry.id);
    if (picture) await store.deleteReceipt(entry.id);
    dropDraft();
    state = null;
    ctx.back();
    snack(t("deletedEntry"), {
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

/** Leaving the form for a screen opened from it keeps the typed values; any other way drops them. */
export function leave({ deeper }) {
  if (deeper) return;
  dropDraft();
  state = null;
}
