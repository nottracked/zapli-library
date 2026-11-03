// Draws every screen of the page in Node 22 on a small stand-in for the browser's DOM, once with the browser
// preview's example data and once on a stand-in for Zapli's data bridge, and taps through the main flows (add an
// entry with the keypad, edit it, delete it with Undo, a transfer, a category, an account, a recurring entry, a
// subscription, the filters). It fails on a thrown error, on a screen that shows "something went wrong", and on
// a text that is still a translation key. It checks the page's code, not how it looks: that needs a phone.
// Run from the repository root: node apps/library/expenses/dev/smoke-render.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
let ui = null;
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
    if (this.classList.contains("quick-label")) return Math.ceil(this.textContent.length * 7 * FONT);
    if (!this.classList.contains("tab-label")) return 0;
    const scale = this.style.fontSize ? parseFloat(this.style.fontSize) : 1;
    return Math.ceil(this.textContent.length * 6.6 * FONT * scale);
  }
  get clientWidth() {
    if (this.classList.contains("quick-label")) {
      // A tile's width: about 100 px with three or more to a row, 160 px with two, 300 px with one.
      let row = this.parent;
      while (row && !row.classList.contains("quick-row")) row = row.parent;
      return row && row.classList.contains("one") ? 300 : row && row.classList.contains("two") ? 160 : 100;
    }
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
    activated = true;
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
  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
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
  listeners: {},
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  },
};
/** A pointer event on the document, as a finger on `target` would start it (capture listeners see it first). */
function pointer(type, target, extra = {}) {
  activated = true;
  const e = { type, target, clientX: 0, preventDefault() {}, ...extra };
  for (const fn of document.listeners[type] || []) fn(e);
  target.dispatch(type, extra);
}

const windowListeners = {};
let hash = "#/";
const states = [{ state: null, hash: "#/" }];
let index = 0;
globalThis.location = {
  get hash() {
    return hash;
  },
  // A hash set from outside the app's own navigation: the current entry changes and hashchange fires.
  set hash(v) {
    states[index] = { state: states[index].state, hash: v };
    hash = v;
    fire("hashchange");
  },
  reload() {},
};
function fire(type) {
  for (const fn of windowListeners[type] || []) fn({ type });
}
// The page's history as Android's WebView keeps it. An entry the page adds without a tap since the last navigation
// makes the browser skip the entry it was added on, as Chromium's history intervention does, so the phone's Back
// cannot land there (and leaves the app when nothing else is below).
let activated = false;
function move(to) {
  index = to;
  hash = states[index].hash;
  activated = false;
  setTimeout(() => fire("popstate"), 0);
}
globalThis.history = {
  get length() {
    return states.length;
  },
  get state() {
    return states[index].state;
  },
  pushState(state, title, url) {
    if (!activated) states[index].skippable = true;
    states.splice(index + 1);
    states.push({ state, hash: url });
    index++;
    hash = url;
    activated = false;
  },
  replaceState(state, title, url) {
    states[index] = { ...states[index], state, hash: url };
    hash = url;
  },
  back() {
    this.go(-1);
  },
  go(n) {
    const to = index + n;
    if (n !== 0 && to >= 0 && to < states.length) move(to);
  },
};
let exited = false;
/** The phone's Back: the page's history first; with nothing left in it, the app is left. */
/**
 * The phone's Back as Zapli's runner sends it: an open dialog closes first; else the WebView goes back while it can
 * (skipping entries the browser skips); else the app is left.
 */
async function systemBack() {
  const dialogs = [...documentElement.walk()].filter((n) => n.tagName === "dialog" && n.open);
  let to = index - 1;
  while (to >= 0 && states[to].skippable) to--;
  if (dialogs.length) dialogs[dialogs.length - 1].close();
  else if (to >= 0) move(to);
  else exited = true;
  await sleep(20);
}

/** Opens a screen as a tap on a link to it does. */
async function open(route) {
  activated = true;
  ui.ctx.go(route);
  await sleep(20);
}
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
  for (const l of main().querySelectorAll(".quick-label")) {
    assert.ok(
      l.scrollWidth <= l.clientWidth + 1,
      label + ": quick-add tile '" + l.textContent + "' shows its whole name",
    );
  }
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
  location.hash = route;
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
  await open("#/add");
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
  await open("#/edit/" + added.id);
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
  await open("#/add?kind=transfer");
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
  await open("#/category/new");
  type(inputs()[0], "Books and papers");
  tapText(sk ? "Uložiť" : "Save");
  await sleep(20);
  assert.ok(
    store.categories.some((c) => c.name === "Books and papers"),
    label + ": category saved",
  );
  await open("#/account-edit/new");
  type(inputs()[0], "Travel card");
  tapText(sk ? "Uložiť" : "Save");
  await sleep(20);
  assert.ok(
    store.accounts.some((a) => a.name === "Travel card"),
    label + ": account saved",
  );
  await open("#/rule/new");
  type(inputs()[0], "Water bill");
  type(inputs()[1], "18,40");
  tapText(sk ? "Uložiť" : "Save");
  await sleep(20);
  const rule = store.rules.find((r) => r.name === "Water bill");
  assert.ok(rule && rule.amount === "18.40" && rule.schedule.startsWith("FREQ=MONTHLY"), label + ": rule saved");
  // A payment due with "Ask me first": Skip it from the home screen.
  if (store.rules.some((r) => r.mode === "ask" && r.nextDue <= todayIso())) {
    await open("#/");
    tapText(sk ? "Vynechať" : "Skip");
    await sleep(20);
  }
  // The subscription finder: confirm one, dismiss one and undo that.
  await open("#/subscriptions");
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
  await open("#/entries");
  tapLabel(store.lang === "sk" ? "Filtre" : "Filters");
  await sleep();
  tapText(store.lang === "sk" ? "Tento mesiac" : "This month");
  tapText(store.lang === "sk" ? "Zobraziť" : "Show");
  await sleep(20);
  assert.ok(location.hash.includes("period=month"), label + ": the filter is in the address");
  checkScreen(label + " filtered");
}

function tapRow(title) {
  const t = [...main().walk()].find((n) => n.classList && n.classList.contains("row-title") && n.textContent === title);
  assert.ok(t, "no row '" + title + "' on " + location.hash);
  let b = t;
  while (b && b.tagName !== "button") b = b.parent;
  b.click();
}

const sk = (store) => store.lang === "sk";
const amountShown = () => main().querySelector(".amount-expr").textContent;

/** Back follows the app's depth, a half-typed entry is kept, the snackbar's time and dismissal, the keypad. */
async function flows2(label, store) {
  const sk = store.lang === "sk";
  const T = (en, skText) => (sk ? skText : en);
  // Back: a tab goes Home, Home leaves the app; a detail goes to its list, then Home.
  await open("#/");
  assert.equal(index, 0, label + ": Home holds one history entry");
  tapText(T("Stats", "Štatistiky"));
  await sleep(20);
  assert.equal(location.hash, "#/stats");
  await systemBack();
  assert.equal(location.hash, "#/", label + ": Back from a tab goes Home");
  assert.ok(!exited, label + ": Back from a tab stays in the app");
  await systemBack();
  assert.ok(exited, label + ": Back on Home leaves the app");
  exited = false;
  tapText(T("Accounts", "Účty"));
  await sleep(20);
  tapRow(store.accounts[0].name);
  await sleep(20);
  assert.ok(location.hash.startsWith("#/account/"), label + ": an account opened");
  await systemBack();
  assert.equal(location.hash, "#/accounts", label + ": Back from a detail goes to its tab");
  await systemBack();
  assert.equal(location.hash, "#/", label + ": then Home");
  assert.ok(!exited);
  await systemBack();
  assert.ok(exited, label + ": then out of the app");
  exited = false;
  tapLabel(T("Settings", "Nastavenia"));
  await sleep(20);
  tapRow(T("Categories", "Kategórie"));
  await sleep(20);
  assert.equal(location.hash, "#/categories");
  tapRow(store.categories.find((c) => !c.parent && c.kind !== "income").name);
  await sleep(20);
  assert.ok(location.hash.startsWith("#/category/"), label + ": a category opened");
  await systemBack();
  assert.equal(location.hash, "#/categories", label + ": Back from a category goes to the list");
  await systemBack();
  assert.equal(location.hash, "#/settings", label + ": Back from categories goes to settings");
  await systemBack();
  assert.equal(location.hash, "#/");
  assert.ok(!exited);
  await systemBack();
  assert.ok(exited, label + ": and out from Home");
  exited = false;
  // Add from Home, then Back: Home, then out.
  tapLabel(T("Add an entry", "Pridať záznam"));
  await sleep(20);
  assert.equal(location.hash, "#/add");
  await systemBack();
  assert.equal(location.hash, "#/", label + ": Back from Add goes Home");
  await systemBack();
  assert.ok(exited, label + ": Back on Home leaves");
  exited = false;
  // A sheet closes first: Entries → filters → Back closes the sheet, the next Back goes Home.
  tapText(T("Entries", "Záznamy"));
  await sleep(20);
  tapLabel(T("Filters", "Filtre"));
  await sleep(20);
  await systemBack();
  assert.equal(location.hash, "#/entries", label + ": Back closes the sheet first");
  await systemBack();
  assert.equal(location.hash, "#/", label + ": then goes Home");
  assert.ok(!exited);
  // The app's own back arrow takes the same step.
  tapText(T("Accounts", "Účty"));
  await sleep(20);
  tapRow(store.accounts[0].name);
  await sleep(20);
  tapLabel(T("Back", "Späť"));
  await sleep(20);
  assert.equal(location.hash, "#/accounts", label + ": the arrow goes back one screen");
  tapText(T("Home", "Prehľad"));
  await sleep(20);
  assert.equal(location.hash, "#/", label + ": the Home tab goes Home");
  await systemBack();
  assert.ok(exited, label + ": with nothing left below Home");
  exited = false;

  // A half-typed entry survives Back and comes back with a Discard.
  await open("#/add");
  const earlier = [...main().walk()].find(
    (n) => n.tagName === "button" && n.textContent.trim() === T("Discard", "Zahodiť"),
  );
  if (earlier) {
    // A draft kept from an earlier step of this test (a transfer that could not be saved) goes first.
    earlier.click();
    await sleep(50);
  }
  tapText("4");
  tapText("2");
  await systemBack();
  assert.equal(location.hash, "#/", label + ": Back leaves the form");
  assert.ok(byId("snackbar").textContent.includes(T("kept", "odložený")), label + ": the draft is said to be kept");
  await sleep(700);
  assert.equal(store.ui.drafts.new.expr, "42", label + ": the draft is in the app's store (also across a reload)");
  // A reload onto the form (a rotation re-creates the page at its address) carries on without the banner.
  const hasBanner = () =>
    [...main().walk()].some((n) => n.tagName === "button" && n.textContent.trim() === T("Discard", "Zahodiť"));
  ui.ctx.startHash = "#/add";
  location.hash = "#/add";
  await sleep(20);
  assert.equal(amountShown(), "42", label + ": the draft is back after a reload");
  assert.ok(!hasBanner(), label + ": no banner after a reload");
  tapLabel(T("Back", "Späť"));
  await sleep(20);
  assert.equal(location.hash, "#/", label + ": the arrow leaves a form opened by a reload for its parent");
  await open("#/add");
  assert.equal(amountShown(), "42", label + ": reopening Add brings the draft back");
  assert.ok(hasBanner(), label + ": with the banner when Add is opened again");
  tapText(T("Discard", "Zahodiť"));
  await sleep(50);
  assert.equal(amountShown(), "0", label + ": Discard starts again");
  assert.ok(!store.ui.drafts.new, label + ": and forgets the draft");

  // The keypad: holding the delete key clears the amount; a tap deletes one digit.
  for (const key of ["1", "2", "3"]) tapText(key);
  const back = main().querySelector(".back");
  back.dispatch("pointerdown");
  await sleep(650);
  back.dispatch("pointerup");
  back.click();
  assert.equal(amountShown(), "0", label + ": holding delete clears the amount");
  tapText("5");
  tapText("6");
  main().querySelector(".amount-back").click();
  assert.equal(amountShown(), "5", label + ": the delete key in the amount field removes one digit");

  // Editing a saved amount: the first digit replaces it.
  const saved = [...store.entries.values()].find((e) => e.amount === "15.50");
  await open("#/edit/" + saved.id);
  main().querySelector(".amount-display").click();
  tapText("2");
  assert.equal(amountShown(), "2", label + ": the first digit replaces a saved amount");
  tapText("1");
  assert.equal(amountShown(), "21", label + ": later digits add to it");
  await systemBack();
  await open("#/edit/" + saved.id);
  assert.equal(amountShown(), "21", label + ": unsaved changes to an entry come back too");
  tapText(T("Discard", "Zahodiť"));
  await sleep(50);
  assert.equal(amountShown(), "15" + store.mark + "5", label + ": Discard shows the saved amount again");
  await systemBack();

  // The snackbar: about four seconds, gone on a tap elsewhere, a swipe or its close button; it names what was saved.
  const addOne = async (digit) => {
    await open("#/add");
    tapText(digit);
    tapText(T("Save", "Uložiť"));
    await sleep(30);
  };
  const box = byId("snackbar");
  await addOne("7");
  assert.ok(box.classList.contains("show"), label + ": saved");
  assert.match(box.textContent, /7/, label + ": the message names the amount");
  await sleep(4300);
  assert.ok(!box.classList.contains("show"), label + ": the snackbar goes after about four seconds");
  await addOne("8");
  pointer("pointerdown", main());
  assert.ok(!box.classList.contains("show"), label + ": a tap elsewhere dismisses it");
  await addOne("9");
  pointer("pointerdown", box, { clientX: 10 });
  pointer("pointerup", box, { clientX: 120 });
  assert.ok(!box.classList.contains("show"), label + ": a swipe dismisses it");
  await addOne("6");
  box.querySelector(".snack-close").click();
  assert.ok(!box.classList.contains("show"), label + ": its close button dismisses it");
  await addOne("5");
  tapText(T("Stats", "Štatistiky"));
  await sleep(20);
  assert.ok(!box.classList.contains("show"), label + ": a new screen dismisses it");
}

async function run(label, setup) {
  setup();
  await import(pathToFileURL(resolve(here, "../package/js/app.mjs")).href);
  ui = await import(pathToFileURL(resolve(here, "../package/js/ui.mjs")).href);
  await sleep(50);
  const { store } = await import(pathToFileURL(resolve(here, "../package/js/store.mjs")).href);
  store.lang = (process.env.SMOKE_LANG || "en").slice(0, 2);
  checkScreen(label + " start");
  checkLayout(label);
  await visitAll(label);
  await flows(label, store);
  store.mark = sk(store) ? "," : ".";
  await flows2(label, store);
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
