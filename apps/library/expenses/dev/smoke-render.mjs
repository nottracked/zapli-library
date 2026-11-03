// Draws every screen of the page in Node 22 on a small stand-in for the browser's DOM, once with the browser
// preview's example data and once on a stand-in for Zapli's data bridge, and taps through the main flows (add an
// entry with the keypad, edit it, delete it with Undo, a transfer, a category, an account, a recurring entry, a
// subscription, the filters). It fails on a thrown error, on a screen that shows "something went wrong", and on
// a text that is still a translation key. It checks the page's code, not how it looks: that needs a phone.
// Run from the repository root: node apps/library/expenses/dev/smoke-render.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MODE = process.argv[2] || "live";
const FONT = Number(process.env.SMOKE_FONT || 1);

// ---------------------------------------------------------------- a small DOM
class ClassList {
  constructor(el) {
    this.el = el;
  }
  get set() {
    return new Set((this.el.attributes.class || "").split(/\s+/).filter(Boolean));
  }
  write(set) {
    this.el.attributes.class = [...set].join(" ");
  }
  add(...names) {
    const s = this.set;
    names.forEach((n) => s.add(n));
    this.write(s);
  }
  remove(...names) {
    const s = this.set;
    names.forEach((n) => s.delete(n));
    this.write(s);
  }
  toggle(name, on) {
    const s = this.set;
    const want = on === undefined ? !s.has(name) : on;
    if (want) s.add(name);
    else s.delete(name);
    this.write(s);
    return want;
  }
  contains(name) {
    return this.set.has(name);
  }
}

class Node {
  constructor(tag, text) {
    this.tagName = tag;
    this.nodeType = tag === "#text" ? 3 : 1;
    this.text = text || "";
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.listeners = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.classList = new ClassList(this);
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this.open = false;
  }
  get className() {
    return this.attributes.class || "";
  }
  set className(v) {
    this.attributes.class = v;
  }
  get id() {
    return this.attributes.id || "";
  }
  set id(v) {
    this.attributes.id = v;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return this.attributes[k] ?? null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  appendChild(child) {
    if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child);
    child.parent = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const n of nodes) this.appendChild(typeof n === "string" ? new Node("#text", n) : n);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  // Sizes for the tab bar check: a label's text is about 0.55 em a letter of a 12 px font, times the text size.
  get scrollWidth() {
    if (!this.classList.contains("tab-label")) return 0;
    const scale = this.style.fontSize ? parseFloat(this.style.fontSize) : 1;
    return Math.ceil(this.textContent.length * 6.6 * FONT * scale);
  }
  get clientWidth() {
    return this.classList.contains("tab-label") ? 68 : 0;
  }
  get offsetHeight() {
    return this.id === "tabs" ? Math.round(64 + 14 * FONT) : this.classList.contains("fab") ? Math.round(56 * FONT) : 0;
  }
  get lastChild() {
    return this.children[this.children.length - 1] || null;
  }
  get firstChild() {
    return this.children[0] || null;
  }
  get textContent() {
    return this.nodeType === 3 ? this.text : this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    if (this.nodeType === 3) this.text = v;
    else {
      this.children = [];
      if (v) this.appendChild(new Node("#text", String(v)));
    }
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) {
    const e = { type, target: this, preventDefault() {}, stopPropagation() {}, key: event.key, ...event };
    for (const fn of this.listeners[type] || []) fn(e);
    return e;
  }
  click() {
    this.dispatch("click");
  }
  focus() {
    document.activeElement = this;
  }
  blur() {
    if (document.activeElement === this) document.activeElement = document.body;
  }
  setSelectionRange() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatch("close");
  }
  getContext() {
    return { drawImage() {} };
  }
  *walk() {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
  matches(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    const last = parts.pop();
    return [...this.walk()].filter((n) => {
      if (n === this || n.nodeType !== 1 || !n.matches(last)) return false;
      let p = n.parent;
      for (let i = parts.length - 1; i >= 0; i--) {
        while (p && !p.matches(parts[i])) p = p.parent;
        if (!p) return false;
        p = p.parent;
      }
      return true;
    });
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

const body = new Node("body");
const documentElement = new Node("html");
documentElement.appendChild(body);
const byId = (id) => [...documentElement.walk()].find((n) => n.id === id) || null;
for (const [tag, id] of [
  ["main", "main"],
  ["nav", "tabs"],
  ["div", "snackbar"],
]) {
  const n = new Node(tag);
  n.id = id;
  body.appendChild(n);
}
globalThis.document = {
  body,
  documentElement,
  activeElement: body,
  title: "",
  createElement: (tag) => new Node(tag),
  createElementNS: (ns, tag) => new Node(tag),
  createTextNode: (text) => new Node("#text", text),
  getElementById: byId,
  querySelector: (s) => documentElement.querySelector(s),
  querySelectorAll: (s) => documentElement.querySelectorAll(s),
};

const windowListeners = {};
let hash = "#/";
const states = [{ state: null, hash: "#/" }];
let index = 0;
globalThis.location = {
  get hash() {
    return hash;
  },
  set hash(v) {
    globalThis.history.pushState(null, "", v);
    fire("hashchange");
  },
  reload() {},
};
function fire(type) {
  for (const fn of windowListeners[type] || []) fn({ type });
}
globalThis.history = {
  get state() {
    return states[index].state;
  },
  pushState(state, title, url) {
    states.splice(index + 1);
    states.push({ state, hash: url });
    index++;
    hash = url;
  },
  replaceState(state, title, url) {
    states[index] = { state, hash: url };
    hash = url;
  },
  back() {
    if (index > 0) {
      index--;
      hash = states[index].hash;
      fire("popstate");
    }
  },
};
const memory = new Map();
const storage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => (windowListeners[type] ||= []).push(fn);
globalThis.scrollTo = () => {};
globalThis.scrollY = 0;
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
Object.defineProperty(globalThis, "navigator", {
  value: { language: process.env.SMOKE_LANG || "en-GB" },
  configurable: true,
});
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.URL.createObjectURL = () => "blob:x";
globalThis.URL.revokeObjectURL = () => {};
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => {
  const id = realSetInterval(fn, ms);
  id.unref?.();
  return id;
};

// ---------------------------------------------------------------- a stand-in for Zapli's data bridge
function fakeZapli(seed) {
  const tables = {};
  const kv = new Map();
  for (const [entity, list] of Object.entries(seed)) tables[entity] = list.map((r) => ({ ...r }));
  for (const e of ["prefs", "account", "category", "expense", "recurring", "rate", "importLog"]) tables[e] ||= [];
  const watchers = [];
  let clock = Date.parse("2026-11-03T09:00:00Z");
  const stamp = () => new Date((clock += 1000)).toISOString();
  const sort = (list, keys = []) =>
    [...list].sort((a, b) => {
      for (const k of keys) {
        const desc = k.startsWith("-");
        const f = desc ? k.slice(1) : k;
        const x = a[f] ?? "";
        const y = b[f] ?? "";
        if (x < y) return desc ? 1 : -1;
        if (x > y) return desc ? -1 : 1;
      }
      return 0;
    });
  const where = (list, w = {}) =>
    list.filter((r) =>
      Object.entries(w).every(([f, cond]) => {
        if (cond && typeof cond === "object") {
          if ("gte" in cond && !(r[f] >= cond.gte)) return false;
          if ("gt" in cond && !(r[f] > cond.gt)) return false;
          return true;
        }
        return r[f] === cond;
      }),
    );
  const notify = () => {
    for (const w of watchers)
      setTimeout(() => w.cb(sort(where(tables[w.entity], w.q.where), w.q.sort).slice(0, w.q.limit || 200)), 0);
  };
  const runs = [];
  const zapli = {
    ready: Promise.resolve({}),
    supports: (name) => ["data.entities", "data.watch", "camera.photo", "media.pick", "files.save"].includes(name),
    app: { locale: () => process.env.SMOKE_LANG || "en-GB", on: () => () => {} },
    data: {
      async query(entity, q = {}) {
        const all = sort(where(tables[entity], q.where), q.sort);
        const start = q.cursor ? Number(q.cursor) : 0;
        const limit = q.limit || 200;
        const items = all.slice(start, start + limit).map((r) => ({ ...r }));
        return start + limit < all.length ? { items, cursor: String(start + limit) } : { items };
      },
      watch(entity, q, cb) {
        watchers.push({ entity, q, cb });
        setTimeout(() => cb(sort(where(tables[entity], q.where), q.sort).slice(0, q.limit || 200)), 0);
        return () => {};
      },
      async add(entity, values) {
        const t = stamp();
        const record = { id: entity + "-" + clock, createdAt: t, updatedAt: t, _version: 1 };
        for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) record[k] = v;
        tables[entity].push(record);
        notify();
        return { ...record };
      },
      async update(entity, id, patch) {
        const record = tables[entity].find((r) => r.id === id);
        if (!record) throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete record[k];
          else record[k] = v;
        }
        record.updatedAt = stamp();
        record._version++;
        notify();
        return { ...record };
      },
      async remove(entity, id) {
        tables[entity] = tables[entity].filter((r) => r.id !== id);
        notify();
      },
      async runAction(action, args) {
        runs.push([action, args]);
        if (action === "setUp" && !tables.prefs.length) {
          await zapli.data.add("account", { name: "Bank account", type: "bank", position: 0 });
          await zapli.data.add("prefs", { currency: "EUR", warnAt: 80, budgetAlerts: true });
          await zapli.data.add("category", { name: "Groceries", icon: "shopping_cart", kind: "expense" });
          await zapli.data.add("category", { name: "Salary", icon: "work", kind: "income" });
        }
        if (action === "importCsv") {
          await zapli.data.add("expense", { amount: "4.50", kind: "expense", date: "2026-11-02", note: "Imported" });
          await zapli.data.add("importLog", {
            at: stamp(),
            since: args.since,
            added: 1,
            skipped: 1,
            created: 0,
            problems: "Line 4: The date can't be read.",
          });
        }
        return {};
      },
      kv: {
        async get(k) {
          return kv.has(k) ? structuredClone(kv.get(k)) : undefined;
        },
        async set(k, v) {
          kv.set(k, structuredClone(v));
        },
        async delete(k) {
          kv.delete(k);
        },
        async keys(prefix = "") {
          return [...kv.keys()].filter((k) => k.startsWith(prefix));
        },
      },
    },
    camera: { photo: async () => ({ type: "image/jpeg" }) },
    media: { pick: async () => [] },
    files: { save: async () => true },
    ui: { openSettings: async () => {} },
  };
  return { zapli, tables, runs };
}

// ---------------------------------------------------------------- the checks
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const sleep = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const main = () => byId("main");
const textOf = (node) => node.textContent;
// A text node that is a bare camelCase word is most likely a translation key that has no text.
const KEYLIKE = /^[a-z]+[A-Z][A-Za-z]*(_[A-Za-z]+)?$/;

function checkScreen(label) {
  const text = textOf(main());
  assert.ok(text.length > 0, label + ": the screen is empty");
  assert.ok(!/Something went wrong|niečo pokazilo/.test(text), label + ": " + text.slice(0, 300));
  for (const n of documentElement.walk()) {
    if (n.nodeType === 3 && KEYLIKE.test(n.text.trim()))
      throw new Error(label + ": untranslated text '" + n.text + "'");
    for (const a of ["aria-label", "placeholder", "title"]) {
      const v = n.attributes && n.attributes[a];
      if (v && KEYLIKE.test(v)) throw new Error(label + ": untranslated " + a + " '" + v + "'");
    }
  }
}

/** The floating parts: tab labels on one line within their tab, the bar's height known, the snackbar hidden. */
function checkLayout(label) {
  const labels = byId("tabs").querySelectorAll(".tab-label");
  assert.equal(labels.length, 5, label + ": five tabs");
  for (const l of labels) {
    assert.ok(
      l.scrollWidth <= l.clientWidth + 1,
      label + ": tab label '" + l.textContent + "' fits at text size " + FONT,
    );
  }
  assert.ok(String(documentElement.style["--tabs-h"]).endsWith("px"), label + ": the tab bar's height is measured");
  const snack = byId("snackbar");
  assert.ok(!snack.classList.contains("show") && snack.textContent === "", label + ": the snackbar is idle and empty");
  const css = readFileSync(resolve(here, "../package/css/app.css"), "utf8");
  const rule = (selector) => {
    const start = css.indexOf("\n" + selector + " {\n");
    assert.ok(start >= 0, "css rule " + selector);
    return css.slice(start, css.indexOf("\n}", start));
  };
  assert.match(rule(".snackbar"), /display: none/, "an idle snackbar draws nothing");
  assert.match(rule(".snackbar.show:not(:empty)"), /display: flex/);
  assert.match(rule(".tab-label"), /white-space: nowrap/, "tab labels never wrap");
  assert.doesNotMatch(rule(".tab-label"), /anywhere|break-all/, "tab labels never break inside a word");
  assert.match(rule("body.with-tabs .fab"), /var\(--tabs-h/, "the Add button sits above the measured tab bar");
  assert.match(
    rule("body.with-tabs .snackbar"),
    /var\(--tabs-h.*var\(--fab-h/,
    "the snackbar is above the bar and the button",
  );
  assert.doesNotMatch(rule(".search-icon"), /position: absolute/, "the search icon has its own space");
}

function buttons() {
  return [...main().walk()].filter((n) => n.tagName === "button" || n.tagName === "a");
}

function tapText(text, root = documentElement) {
  const target = [...root.walk()].find(
    (n) => (n.tagName === "button" || n.tagName === "a") && n.textContent.trim() === text,
  );
  assert.ok(target, "no button '" + text + "' on " + location.hash);
  target.click();
}

function tapLabel(label) {
  const target = [...documentElement.walk()].find((n) => n.attributes && n.attributes["aria-label"] === label);
  assert.ok(target, "no control labelled '" + label + "' on " + location.hash);
  target.click();
}

async function go(route) {
  globalThis.history.pushState({ depth: 1 }, "", route);
  fire("popstate");
  await sleep();
}

async function visitAll(label) {
  const routes = [
    "#/",
    "#/entries",
    "#/entries?period=month&kind=expense",
    "#/entries?q=coffee",
    "#/stats",
    "#/stats?view=year",
    "#/stats?kind=income",
    "#/budgets",
    "#/accounts",
    "#/calendar",
    "#/recurring",
    "#/rule/new",
    "#/subscriptions",
    "#/settings",
    "#/currencies",
    "#/categories",
    "#/categories?kind=income",
    "#/category/new",
    "#/import",
    "#/add",
    "#/add?kind=income",
    "#/add?kind=transfer",
    "#/account-edit/new",
  ];
  for (const route of routes) {
    await go(route);
    checkScreen(label + " " + route);
  }
}

async function flows(label, store) {
  // Add an expense with the keypad: 12,50 + 3 = 15.50.
  await go("#/add");
  for (const key of ["1", "2"]) tapText(key);
  tapLabel(store.lang === "sk" ? "Desatinná čiarka" : "Decimal point");
  for (const key of ["5"]) tapText(key);
  tapLabel(store.lang === "sk" ? "Plus" : "Plus");
  tapText("3");
  const before = store.entries.size;
  tapText(store.lang === "sk" ? "Uložiť" : "Save");
  await sleep(20);
  assert.equal(store.entries.size, before + 1, label + ": the entry was saved");
  const added = [...store.entries.values()].find((e) => e.amount === "15.50");
  assert.ok(added, label + ": the keypad's sum was saved as 15.50");
  assert.equal(added.baseAmount, "15.50");
  checkScreen(label + " after saving");
  // Open it, delete it, and bring it back with Undo.
  await go("#/edit/" + added.id);
  checkScreen(label + " edit");
  tapText(store.lang === "sk" ? "Odstrániť" : "Delete");
  await sleep(20);
  assert.ok(!store.entries.has(added.id), label + ": deleted");
  assert.ok(byId("snackbar").classList.contains("show"), label + ": the snackbar offers Undo");
  tapText(store.lang === "sk" ? "Späť" : "Undo", byId("snackbar"));
  await sleep(20);
  assert.ok(!byId("snackbar").classList.contains("show"), label + ": the snackbar hides after Undo");
  assert.ok(
    [...store.entries.values()].some((e) => e.amount === "15.50"),
    label + ": Undo brought it back",
  );
  // A transfer between two accounts.
  await go("#/add?kind=transfer");
  tapText("5");
  tapText("0");
  tapText(store.lang === "sk" ? "Uložiť" : "Save");
  await sleep(20);
  const transfer = [...store.entries.values()].find((e) => e.kind === "transfer" && e.amount === "50.00");
  if (store.accounts.filter((a) => !a.archived).length > 1)
    assert.ok(transfer && transfer.toAccount && transfer.account !== transfer.toAccount, label + ": transfer saved");
  const sk = store.lang === "sk";
  const type = (input, value) => {
    input.value = value;
    input.dispatch("input");
    input.dispatch("change");
  };
  const inputs = () => [...main().walk()].filter((n) => n.tagName === "input");
  // A new category, a new account and a new recurring entry.
  await go("#/category/new");
  type(inputs()[0], "Books and papers");
  tapText(sk ? "Uložiť" : "Save");
  await sleep(20);
  assert.ok(
    store.categories.some((c) => c.name === "Books and papers"),
    label + ": category saved",
  );
  await go("#/account-edit/new");
  type(inputs()[0], "Travel card");
  tapText(sk ? "Uložiť" : "Save");
  await sleep(20);
  assert.ok(
    store.accounts.some((a) => a.name === "Travel card"),
    label + ": account saved",
  );
  await go("#/rule/new");
  type(inputs()[0], "Water bill");
  type(inputs()[1], "18,40");
  tapText(sk ? "Uložiť" : "Save");
  await sleep(20);
  const rule = store.rules.find((r) => r.name === "Water bill");
  assert.ok(rule && rule.amount === "18.40" && rule.schedule.startsWith("FREQ=MONTHLY"), label + ": rule saved");
  // A payment due with "Ask me first": Skip it from the home screen.
  if (store.rules.some((r) => r.mode === "ask" && r.nextDue <= todayIso())) {
    await go("#/");
    tapText(sk ? "Vynechať" : "Skip");
    await sleep(20);
  }
  // The subscription finder: confirm one, dismiss one and undo that.
  await go("#/subscriptions");
  checkScreen(label + " subscriptions");
  const rulesBefore = store.rules.length;
  const confirmText = sk ? "Je to predplatné" : "It’s a subscription";
  const found = [...main().walk()].some((n) => n.tagName === "button" && n.textContent.trim() === confirmText);
  if (label !== "fresh") assert.ok(found, label + ": the finder lists the example subscriptions");
  if (found) {
    tapText(confirmText);
    await sleep(20);
    assert.equal(store.rules.length, rulesBefore + 1, label + ": subscription kept");
    assert.ok(
      store.rules.some((r) => r.isSubscription && r.mode === "track"),
      label + ": kept as a tracked subscription",
    );
  }
  const dismissText = sk ? "Nie je" : "Not one";
  if ([...main().walk()].some((n) => n.tagName === "button" && n.textContent.trim() === dismissText)) {
    tapText(dismissText);
    await sleep(20);
    assert.equal((store.ui.dismissed || []).length, 1, label + ": dismissed");
    tapText(sk ? "Späť" : "Undo", byId("snackbar"));
    await sleep(20);
    assert.equal((store.ui.dismissed || []).length, 0, label + ": dismissal undone");
  }
  // The filter sheet opens and applies.
  await go("#/entries");
  tapLabel(store.lang === "sk" ? "Filtre" : "Filters");
  await sleep();
  tapText(store.lang === "sk" ? "Tento mesiac" : "This month");
  tapText(store.lang === "sk" ? "Zobraziť" : "Show");
  await sleep(20);
  assert.ok(location.hash.includes("period=month"), label + ": the filter is in the address");
  checkScreen(label + " filtered");
}

async function run(label, setup) {
  setup();
  await import(pathToFileURL(resolve(here, "../package/js/app.mjs")).href);
  await sleep(50);
  const { store } = await import(pathToFileURL(resolve(here, "../package/js/store.mjs")).href);
  store.lang = (process.env.SMOKE_LANG || "en").slice(0, 2);
  checkScreen(label + " start");
  checkLayout(label);
  await visitAll(label);
  await flows(label, store);
  console.log("ok: " + label + " (" + store.lang + ")");
  return store;
}

if (MODE === "preview") {
  await run("preview", () => {});
} else if (MODE === "fresh") {
  // A first start: the page asks the app to set itself up, then the welcome card shows.
  const bridge = fakeZapli({});
  const live = await run("fresh", () => {
    globalThis.zapli = bridge.zapli;
  });
  assert.ok(
    bridge.runs.some((r) => r[0] === "setUp"),
    "setUp ran on the first start",
  );
  assert.ok(live.prefs, "the preferences exist after setUp");
} else {
  const { sampleData } = await import(pathToFileURL(resolve(here, "../package/js/sample.mjs")).href);
  const bridge = fakeZapli(sampleData(new Date()));
  const live = await run("live", () => {
    globalThis.zapli = bridge.zapli;
  });
  assert.ok(live.live, "the store runs on the bridge");
  assert.ok(
    bridge.tables.expense.some((e) => e.amount === "15.50"),
    "the bridge holds the new entry",
  );
  console.log("actions run:", [...new Set(bridge.runs.map((r) => r[0]))].join(", ") || "none");
}
process.exit(0);
