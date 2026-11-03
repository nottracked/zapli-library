// Every entry, newest first and grouped by day, with search and filters (period, type, category, account, tag,
// amount). The filters live in the address (#/entries?cat=…), so Back and a reload keep them.

import {
  ctx,
  h,
  t,
  put,
  money,
  dayName,
  bar,
  iconButton,
  button,
  chip,
  field,
  entryRow,
  empty,
  snack,
  failed,
  dialog,
  disc,
  accountDisc,
  blurActive,
  menu,
} from "../ui.mjs";
import { filterEntries, withChildren, allTags } from "../ledger.mjs";
import { startOfMonth, endOfMonth, addMonths, startOfYear, endOfYear, isIsoDate, addDays } from "../dates.mjs";
import { parseTypedAmount, fromCents } from "../money.mjs";
import { toCsv } from "../csv.mjs";
import { icon } from "../icons.mjs";
import { fab } from "./home.mjs";

const STEP = 200;
let shown = STEP;
let lastKey = "";

/** The filter of the address's parameters. */
export function filterOf(params) {
  const today = ctx.today;
  const period = params.get("period") || "";
  let from = null;
  let to = null;
  if (period === "month") [from, to] = [startOfMonth(today), endOfMonth(today)];
  else if (period === "lastMonth") [from, to] = [addMonths(startOfMonth(today), -1), addDays(startOfMonth(today), -1)];
  else if (period === "year") [from, to] = [startOfYear(today), endOfYear(today)];
  else if (period === "custom" || params.get("from") || params.get("to")) {
    from = isIsoDate(params.get("from")) ? params.get("from") : null;
    to = isIsoDate(params.get("to")) ? params.get("to") : null;
  }
  const list = (key) => new Set((params.get(key) || "").split(",").filter(Boolean));
  const model = ctx.store.model;
  const categories = new Set();
  for (const id of list("cat")) for (const c of withChildren(model, id)) categories.add(c);
  return {
    text: params.get("q") || "",
    kinds: list("kind"),
    categories,
    accounts: list("acc"),
    tag: params.get("tag") || "",
    from,
    to,
    period,
    min: params.get("min") ? Number(params.get("min")) : null,
    max: params.get("max") ? Number(params.get("max")) : null,
  };
}

function setParams(update) {
  const route = new URLSearchParams(location.hash.split("?")[1] || "");
  for (const [k, v] of Object.entries(update)) {
    if (v === null || v === "" || v === undefined) route.delete(k);
    else route.set(k, v);
  }
  const query = route.toString();
  ctx.go("#/entries" + (query ? "?" + query : ""), { replace: true });
}

export function render(route) {
  const store = ctx.store;
  const params = route.params;
  const filter = filterOf(params);
  const search = h("input", {
    type: "search",
    class: "search-input",
    placeholder: t("searchPlaceholder"),
    "aria-label": t("search"),
    value: filter.text,
    autocomplete: "off",
  });
  const results = h("div", { class: "results" });
  let timer = null;
  // Typing filters the list in place, so the keyboard stays open; the address keeps the words for Back and reloads.
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = new URLSearchParams(location.hash.split("?")[1] || "");
      if (search.value.trim()) next.set("q", search.value.trim());
      else next.delete("q");
      next.delete("search");
      const query = next.toString();
      history.replaceState(history.state, "", "#/entries" + (query ? "?" + query : ""));
      paintResults(results, next);
    }, 200);
  });
  if (params.get("search")) setTimeout(() => search.focus(), 60);
  const head = [
    bar(t("tabEntries"), {
      actions: [
        iconButton("calendar", t("calendar"), () => ctx.go("#/calendar")),
        iconButton("filter", t("filters"), () => openFilters(new URLSearchParams(location.hash.split("?")[1] || ""))),
        iconButton("more", t("moreActions"), async () => {
          const picked = await menu(t("moreActions"), [
            { id: "import", label: t("importCsv"), icon: "importFile" },
            { id: "export", label: t("exportThese"), icon: "exportFile" },
            { id: "settings", label: t("settings"), icon: "settings" },
          ]);
          const found = () =>
            filterEntries(store.model, filterOf(new URLSearchParams(location.hash.split("?")[1] || "")));
          if (picked === "import") ctx.go("#/import");
          else if (picked === "export") exportThese(found());
          else if (picked === "settings") ctx.go("#/settings");
        }),
      ],
    }),
    h("div", { class: "search" }, h("span", { class: "search-icon", "aria-hidden": "true" }, icon("search")), search),
  ];
  const chips = activeChips(filter, params);
  if (chips.length)
    head.push(
      h(
        "div",
        { class: "chips filter-chips" },
        chips,
        button(t("clearFilters"), () => ctx.go("#/entries", { replace: true }), "text"),
      ),
    );
  paintResults(results, params);
  const single =
    filter.categories.size && params.get("cat") && !params.get("cat").includes(",")
      ? "#/add?cat=" + encodeURIComponent(params.get("cat"))
      : "#/add";
  return h("div", { class: "screen" }, head, results, h("div", { class: "fab-space" }), fab(single));
}

/** The list for the current filter, a page of days at a time. */
function paintResults(box, params) {
  const store = ctx.store;
  const filter = filterOf(params);
  const key = params.toString();
  if (key !== lastKey) {
    shown = STEP;
    lastKey = key;
  }
  box.textContent = "";
  if (!store.model.entries.length) {
    box.appendChild(
      empty("🧾", t("noEntriesYet"), t("noEntriesText"), [
        button(t("addEntry"), () => ctx.go("#/add"), "filled", { icon: "add" }),
        button(t("importHistory"), () => ctx.go("#/import"), "tonal", { icon: "importFile" }),
      ]),
    );
    return;
  }
  const all = filterEntries(store.model, filter).sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1,
  );
  if (!all.length) {
    box.appendChild(
      empty("🔍", t("nothingMatches"), t("nothingMatchesText"), [
        button(t("clearFilters"), () => ctx.go("#/entries", { replace: true }), "tonal"),
      ]),
    );
    return;
  }
  let spent = 0;
  let income = 0;
  for (const e of all) {
    if (e.kind === "expense") spent += e.base;
    else if (e.kind === "income") income += e.base;
  }
  box.appendChild(
    h(
      "p",
      { class: "summary", role: "status" },
      t("nEntries", { n: all.length }) +
        " · " +
        t("spentAmount", { amount: money(spent) }) +
        (income ? " · " + t("incomeAmount", { amount: money(income) }) : ""),
    ),
  );
  const dayTotals = new Map();
  for (const e of all) if (e.kind === "expense") dayTotals.set(e.date, (dayTotals.get(e.date) || 0) + e.base);
  let day = null;
  let list = null;
  for (const e of all.slice(0, shown)) {
    if (e.date !== day) {
      day = e.date;
      list = h("ul", { class: "list" });
      const total = dayTotals.get(day);
      box.appendChild(
        h(
          "section",
          { class: "day" },
          h(
            "h2",
            { class: "day-head" },
            h("span", { text: dayName(day) }),
            total ? h("span", { class: "day-total", text: money(-total) }) : null,
          ),
          list,
        ),
      );
    }
    list.appendChild(entryRow(e));
  }
  if (all.length > shown) {
    box.appendChild(
      button(
        t("showMore", { n: Math.min(STEP * 2, all.length - shown) }),
        () => {
          shown += STEP * 2;
          paintResults(box, new URLSearchParams(location.hash.split("?")[1] || ""));
        },
        "tonal",
        { class: "show-more" },
      ),
    );
  }
}

function activeChips(filter, params) {
  const store = ctx.store;
  const chips = [];
  const remove = (update) => () => setParams(update);
  const x = (label, update) =>
    h(
      "button",
      { type: "button", class: "chip on", onClick: remove(update), "aria-label": t("removeFilter", { name: label }) },
      h("span", { text: label }),
      h("span", { class: "chip-x", "aria-hidden": "true" }, "×"),
    );
  if (filter.period && filter.period !== "custom") chips.push(x(t("period_" + filter.period), { period: null }));
  else if (filter.from || filter.to)
    chips.push(
      x((filter.from ? ctx.locale && filter.from : "…") + " – " + (filter.to || "…"), {
        period: null,
        from: null,
        to: null,
      }),
    );
  for (const kind of filter.kinds)
    chips.push(x(t(kind + "Plural"), { kind: [...filter.kinds].filter((k) => k !== kind).join(",") }));
  for (const id of (params.get("cat") || "").split(",").filter(Boolean)) {
    const c = store.categories.find((x2) => x2.id === id);
    chips.push(
      x(c ? c.name : t("noCategory"), {
        cat: (params.get("cat") || "")
          .split(",")
          .filter((v) => v !== id)
          .join(","),
      }),
    );
  }
  for (const id of filter.accounts) {
    const a = store.accounts.find((x2) => x2.id === id);
    chips.push(x(a ? a.name : "?", { acc: [...filter.accounts].filter((v) => v !== id).join(",") }));
  }
  if (filter.tag) chips.push(x("#" + filter.tag, { tag: null }));
  if (filter.min !== null) chips.push(x(t("atLeast", { amount: money(filter.min) }), { min: null }));
  if (filter.max !== null) chips.push(x(t("atMost", { amount: money(filter.max) }), { max: null }));
  return chips;
}

/** The filter sheet: every choice at once, applied with one tap. */
async function openFilters(params) {
  blurActive();
  const store = ctx.store;
  const pick = {
    period: params.get("period") || (params.get("from") || params.get("to") ? "custom" : ""),
    from: params.get("from") || "",
    to: params.get("to") || "",
    kind: new Set((params.get("kind") || "").split(",").filter(Boolean)),
    cat: new Set((params.get("cat") || "").split(",").filter(Boolean)),
    acc: new Set((params.get("acc") || "").split(",").filter(Boolean)),
    tag: params.get("tag") || "",
    min: params.get("min") ? fromCents(Number(params.get("min"))).replace(".", ctx.mark) : "",
    max: params.get("max") ? fromCents(Number(params.get("max"))).replace(".", ctx.mark) : "",
  };
  const result = await dialog(
    (close) => {
      const body = h("div", { class: "filter-body" });
      const toggleIn = (set, value) => (set.has(value) ? set.delete(value) : set.add(value));
      const draw = () => {
        body.textContent = "";
        const periodChips = ["", "month", "lastMonth", "year", "custom"].map((p) =>
          chip(t(p ? "period_" + p : "period_all"), pick.period === p, () => {
            pick.period = p;
            draw();
          }),
        );
        put(
          body,
          h("h3", { text: t("period") }),
          h("div", { class: "chips" }, periodChips),
          pick.period === "custom"
            ? h(
                "div",
                { class: "two" },
                field(
                  t("from"),
                  h("input", { type: "date", value: pick.from, onChange: (e) => (pick.from = e.target.value) }),
                ),
                field(
                  t("to"),
                  h("input", { type: "date", value: pick.to, onChange: (e) => (pick.to = e.target.value) }),
                ),
              )
            : null,
          h("h3", { text: t("kind") }),
          h(
            "div",
            { class: "chips" },
            ["expense", "income", "transfer"].map((k) =>
              chip(t(k + "Plural"), pick.kind.has(k), () => {
                toggleIn(pick.kind, k);
                draw();
              }),
            ),
          ),
          h("h3", { text: t("categories") }),
          h(
            "div",
            { class: "chips" },
            store.categories
              .filter((c) => !c.archived)
              .map((c) =>
                chip(
                  c.name,
                  pick.cat.has(c.id),
                  () => {
                    toggleIn(pick.cat, c.id);
                    draw();
                  },
                  disc(c, "tiny"),
                ),
              ),
          ),
          store.accounts.length > 1 ? h("h3", { text: t("accounts") }) : null,
          store.accounts.length > 1
            ? h(
                "div",
                { class: "chips" },
                store.accounts.map((a) =>
                  chip(
                    a.name,
                    pick.acc.has(a.id),
                    () => {
                      toggleIn(pick.acc, a.id);
                      draw();
                    },
                    accountDisc(a, "tiny"),
                  ),
                ),
              )
            : null,
          allTags(store.entries.values()).length ? h("h3", { text: t("tags") }) : null,
          h(
            "div",
            { class: "chips" },
            allTags(store.entries.values())
              .slice(0, 30)
              .map((tag) =>
                chip("#" + tag, pick.tag === tag, () => {
                  pick.tag = pick.tag === tag ? "" : tag;
                  draw();
                }),
              ),
          ),
          h("h3", { text: t("amount") }),
          h(
            "div",
            { class: "two" },
            field(
              t("min"),
              h("input", {
                type: "text",
                inputmode: "decimal",
                value: pick.min,
                onInput: (e) => (pick.min = e.target.value),
              }),
            ),
            field(
              t("max"),
              h("input", {
                type: "text",
                inputmode: "decimal",
                value: pick.max,
                onInput: (e) => (pick.max = e.target.value),
              }),
            ),
          ),
        );
      };
      draw();
      return [
        h("h2", { class: "dialog-title", text: t("filters") }),
        body,
        h(
          "div",
          { class: "dialog-actions" },
          button(t("clearFilters"), () => close("clear"), "text"),
          button(t("showResults"), () => close("apply")),
        ),
      ];
    },
    { sheet: true, label: t("filters") },
  );
  if (result === "clear") return ctx.go("#/entries", { replace: true });
  if (result !== "apply") return;
  const min = parseTypedAmount(pick.min);
  const max = parseTypedAmount(pick.max);
  setParams({
    period: pick.period && pick.period !== "custom" ? pick.period : null,
    from: pick.period === "custom" && isIsoDate(pick.from) ? pick.from : null,
    to: pick.period === "custom" && isIsoDate(pick.to) ? pick.to : null,
    kind: [...pick.kind].join(","),
    cat: [...pick.cat].join(","),
    acc: [...pick.acc].join(","),
    tag: pick.tag,
    min: min !== null && min >= 0 ? String(min) : null,
    max: max !== null && max >= 0 ? String(max) : null,
  });
}

/** Saves the entries on screen as a CSV file, from this tap. */
export async function exportThese(list, name = "expenses-found-" + ctx.today + ".csv") {
  const store = ctx.store;
  const category = (id) => {
    const c = id ? store.categories.find((x) => x.id === id) : null;
    return c ? c.name : "";
  };
  const account = (id) => {
    const a = id ? store.accounts.find((x) => x.id === id) : null;
    return a ? a.name : "";
  };
  const rows = [
    [
      t("date"),
      t("kind"),
      t("amount"),
      t("currency"),
      t("category"),
      t("account"),
      t("toAccount"),
      t("inMainCurrency"),
      t("payee"),
      t("note"),
      t("tags"),
    ],
  ];
  for (const e of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    rows.push([
      e.date,
      t(e.kind + "Kind"),
      e.amount,
      e.currency || store.main,
      category(e.category),
      account(e.account),
      account(e.toAccount),
      fromCents(e.base),
      e.payee || "",
      e.note || "",
      e.tags || "",
    ]);
  }
  const text = toCsv(rows);
  const zapli = ctx.zapli;
  try {
    if (store.live && zapli.supports("files.save")) {
      const ok = await zapli.files.save({ name, type: "text/csv", data: text });
      if (ok) snack(t("exportedN", { n: list.length }));
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = h("a", { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch (error) {
    failed(error);
  }
}
