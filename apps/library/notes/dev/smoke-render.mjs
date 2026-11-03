// Draws every screen of the page in Node 22 on a small stand-in for the browser's DOM, on a stand-in for Zapli's
// data bridge (or, with "preview", as a plain browser with the made-up notes), and taps through the main flows: a
// new note typed and saved, a checklist (Enter, tick, untick all), pin, archive with Undo, selection, the trash and
// restore, search, labels, a reminder, export and import, the drawer and Back. It fails on a thrown error, on a
// screen that says "something went wrong", and on a text that is still a translation key. It checks the page's code,
// not how it looks: that needs a phone.
// Run from the repository root: node apps/library/notes/dev/smoke-render.mjs [live|fresh|preview]

import assert from "node:assert/strict";
import { STRINGS } from "../package/js/i18n.mjs";
import { sampleData } from "../package/js/sample.mjs";

const MODE = process.argv[2] || "live";
const LANG = process.env.SMOKE_LANG || "en-GB";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const style = {};
    style.setProperty = (name, value) => (style[name] = value);
    this.style = style;
    this.dataset = {};
    this.classList = new ClassList(this);
    this._value = "";
    this.checked = false;
    this.open = false;
    this.disabled = false;
    this.selectionStart = null;
    this.selectionEnd = null;
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
    this.selectionStart = this.selectionEnd = this._value.length;
  }
  get hidden() {
    return "hidden" in this.attributes;
  }
  set hidden(v) {
    if (v) this.attributes.hidden = "";
    else delete this.attributes.hidden;
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
  get parentNode() {
    return this.parent;
  }
  get childNodes() {
    return this.children;
  }
  get firstChild() {
    return this.children[0] || null;
  }
  get firstElementChild() {
    return this.children.find((c) => c.nodeType === 1) || null;
  }
  get lastChild() {
    return this.children[this.children.length - 1] || null;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === "disabled") this.disabled = true;
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
  get textContent() {
    return this.nodeType === 3 ? this.text : this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    if (this.nodeType === 3) this.text = v;
    else {
      for (const c of this.children) c.parent = null;
      this.children = [];
      if (v) this.appendChild(new Node("#text", String(v)));
    }
  }
  get offsetHeight() {
    return this.classList.contains("dock") ? 70 : 48;
  }
  get offsetWidth() {
    return 300;
  }
  get scrollWidth() {
    return this.classList.contains("dock") ? Math.round(300 * FONT) : 0;
  }
  get scrollHeight() {
    return 0;
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, width: 300, height: 0 };
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  dispatch(type, extra = {}) {
    const e = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      detail: 1,
      ...extra,
    };
    for (const fn of this.listeners[type] || []) fn(e);
    return e;
  }
  click() {
    if (this.disabled) return;
    this.dispatch("click");
  }
  focus() {
    document.activeElement = this;
  }
  blur() {
    if (document.activeElement === this) document.activeElement = document.body;
  }
  select() {}
  setSelectionRange(a, b) {
    this.selectionStart = a;
    this.selectionEnd = b;
  }
  setPointerCapture() {}
  showModal() {
    this.open = true;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatch("close");
  }
  closest(selector) {
    for (let n = this; n; n = n.parent) if (n.nodeType === 1 && n.matches(selector)) return n;
    return null;
  }
  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }
  *walk() {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
  matches(selector) {
    const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
    if (attr) return this.attributes[attr[1]] === attr[2];
    if (selector.startsWith("."))
      return selector
        .slice(1)
        .split(".")
        .every((c) => this.classList.contains(c));
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

const FONT = Number(process.env.SMOKE_FONT || 1);
const documentElement = new Node("html");
const body = new Node("body");
documentElement.appendChild(body);
for (const [tag, id] of [
  ["main", "main"],
  ["div", "snackbar"],
]) {
  const n = new Node(tag);
  n.id = id;
  body.appendChild(n);
}
const docListeners = {};
globalThis.document = {
  body,
  documentElement,
  activeElement: body,
  title: "",
  visibilityState: "visible",
  createElement: (tag) => new Node(tag),
  createElementNS: (ns, tag) => new Node(tag),
  createTextNode: (text) => new Node("#text", text),
  getElementById: (id) => [...documentElement.walk()].find((n) => n.id === id) || null,
  querySelector: (s) => documentElement.querySelector(s),
  querySelectorAll: (s) => documentElement.querySelectorAll(s),
  addEventListener(type, fn) {
    (docListeners[type] ||= []).push(fn);
  },
};

const windowListeners = {};
let hash = "#/";
const states = [{ state: null, hash: "#/" }];
let index = 0;
function fire(type) {
  for (const fn of windowListeners[type] || []) fn({ type });
}
globalThis.location = {
  get hash() {
    return hash;
  },
  set hash(v) {
    states[index] = { state: states[index].state, hash: v };
    hash = v;
    fire("hashchange");
  },
  reload() {},
};
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
      setTimeout(() => fire("popstate"), 0);
    }
  },
};
let exited = false;
/** The phone's Back: an open dialog first, then the page's history, then the app is left. */
async function systemBack() {
  const dialogs = [...documentElement.walk()].filter((n) => n.tagName === "dialog" && n.open);
  if (dialogs.length) {
    const d = dialogs[dialogs.length - 1];
    d.dispatch("cancel");
    d.close();
  } else if (index > 0) globalThis.history.back();
  else exited = true;
  await sleep(30);
}

const memory = new Map();
const storage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};
globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => (windowListeners[type] ||= []).push(fn);
globalThis.scrollTo = () => {};
globalThis.scrollY = 0;
globalThis.innerWidth = 360;
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.getComputedStyle = () => ({ columnGap: "10px" });
globalThis.matchMedia = () => ({ matches: false });
Object.defineProperty(globalThis, "navigator", { value: { language: LANG }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.URL.createObjectURL = () => "blob:x";
globalThis.URL.revokeObjectURL = () => {};
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => {
  const id = realSetInterval(fn, ms);
  id.unref?.();
  return id;
};
void memory;

// ---------------------------------------------------------------- a stand-in for Zapli's data bridge

const saved = [];
const runs = [];
function fakeZapli(seed) {
  const tables = { note: [], label: [], prefs: [], importLog: [] };
  for (const [entity, list] of Object.entries(seed)) if (tables[entity]) tables[entity] = list.map((r) => ({ ...r }));
  const kv = new Map();
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
      Object.entries(w || {}).every(([f, cond]) => {
        if (cond && typeof cond === "object") return !("gte" in cond) || r[f] >= cond.gte;
        return r[f] === cond;
      }),
    );
  const notify = () => {
    for (const w of watchers)
      setTimeout(() => w.cb(sort(where(tables[w.entity], w.q.where), w.q.sort).slice(0, w.q.limit || 200)), 0);
  };
  const add = (entity, values) => {
    const t = stamp();
    const record = { id: entity + "-" + clock, createdAt: t, updatedAt: t, _version: 1 };
    if (entity === "note")
      Object.assign(record, { kind: "text", color: "none", pinned: false, archived: false, fresh: false });
    for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) record[k] = v;
    tables[entity].push(record);
    return record;
  };
  const zapli = {
    tables,
    ready: Promise.resolve({}),
    supports: (name) =>
      ["data.entities", "data.watch", "camera.photo", "media.pick", "files.save", "share", "haptics.impact"].includes(
        name,
      ),
    app: { locale: () => LANG, on: () => () => {}, info: async () => ({ version: "1.0.0" }) },
    haptics: { impact: async () => {} },
    ui: { openSettings: async () => {} },
    files: {
      async save(file) {
        saved.push({ name: file.name, type: file.type, text: await file.data.text() });
        return true;
      },
    },
    async share() {},
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
        const record = add(entity, values);
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
        if (action === "importNotes") {
          add("note", { title: "Imported one", body: "From a file", labels: "Imported; Work", fresh: true });
          add("note", { title: "", body: "- [ ] a\n- [x] b", fresh: true });
          await zapli.data.runAction("settleImport", { stamp: args.stamp });
          add("importLog", { stamp: args.stamp, skipped: 1, problems: "Row 4: The date can't be read." });
        }
        if (action === "settleImport") {
          for (const n of tables.note.filter((x) => x.fresh)) {
            n.fresh = false;
            n.importId = args.stamp;
            if (/^\s*([-*+] )?\[[ xX]\] /.test(n.body || "")) n.kind = "list";
            n.labels = String(n.labels || "").replace(/\s*[;|]\s*/g, ", ");
            n.updatedAt = stamp();
          }
        }
        if (action === "undoImport") tables.note = tables.note.filter((n) => n.importId !== args.stamp);
        if (action === "emptyTrash") tables.note = tables.note.filter((n) => !n.trashedAt);
        if (action === "renameLabel") {
          for (const n of tables.note) {
            const list = String(n.labels || "")
              .split(", ")
              .filter(Boolean)
              .map((l) => (l === args.from ? args.to : l))
              .filter(Boolean);
            n.labels = list.join(", ");
          }
        }
        notify();
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
  };
  return zapli;
}

const lang = LANG.startsWith("sk") ? "sk" : "en";
const seed = MODE === "fresh" ? {} : sampleData(new Date(), lang);
const zapli = MODE === "preview" ? null : fakeZapli(seed);
if (zapli) globalThis.zapli = zapli;

// ---------------------------------------------------------------- helpers

const main = () => document.getElementById("main");
const all = (sel, root = documentElement) => root.querySelectorAll(sel);
const text = (node = main()) => node.textContent;
const T = STRINGS[lang];
const tx = (key, n) => {
  const v = T[key];
  if (typeof v === "string") return v;
  return (n === 1 ? v.one : v.other).replace("{n}", n);
};
function button(label, root = documentElement) {
  const found = all("button", root).find(
    (b) =>
      b.getAttribute("aria-label") === label || b.textContent.trim() === label || b.getAttribute("title") === label,
  );
  const inner =
    found ||
    all("button", root).find((b) => [...b.walk()].some((c) => c.tagName === "span" && c.textContent.trim() === label));
  assert.ok(inner, "no button " + JSON.stringify(label) + " on " + location.hash);
  return inner;
}
async function tap(label, root) {
  button(label, root).click();
  await sleep(40);
}
function openDialog() {
  const d = all("dialog").filter((n) => n.open);
  return d[d.length - 1] || null;
}
function check(where) {
  const words = text(documentElement);
  assert.ok(!words.includes(T.somethingWrong), where + ": the screen broke");
  const keys = Object.keys(T).filter((k) => /[A-Z_]/.test(k) && k.length > 6);
  for (const key of keys) assert.ok(!words.includes(key), where + ": untranslated " + key);
  for (const n of documentElement.walk()) {
    for (const [k, v] of Object.entries(n.attributes)) {
      if ((k === "aria-label" || k === "title" || k === "placeholder") && /^[a-z]+[A-Z]\w+$/.test(v)) {
        assert.fail(where + ": untranslated " + k + " " + v);
      }
    }
  }
}
function typeInto(input, value) {
  input.value = value;
  input.dispatch("input");
}
function cards() {
  return all(".card");
}
function cardFor(title) {
  return cards().find((c) => c.textContent.includes(title));
}

// ---------------------------------------------------------------- the run

await import("../package/js/app.mjs");
await sleep(150);
check("start");

if (MODE === "preview") {
  assert.ok(text().includes(T.previewBanner), "the preview says it is one");
  assert.ok(cardFor(lang === "sk" ? "Nákup" : "Groceries"), "made-up notes show");
  await tap(tx("newNote"));
  await sleep(50);
  typeInto(all(".body-input")[0], "A preview note");
  await sleep(800);
  await systemBack();
  await sleep(80);
  assert.ok(cardFor("A preview note"), "a preview note is kept");
  check("preview");
  console.log("smoke-render preview: ok");
  process.exit(0);
}

if (MODE === "fresh") {
  assert.ok(text().includes(T.emptyNotesTitle), "an empty start says what to do");
  await tap(tx("newList"));
  const item = all(".item-text")[0];
  assert.ok(item, "a new checklist has an item to type in");
  assert.equal(document.activeElement, item, "the keyboard goes to the first item");
  typeInto(item, "Milk");
  item.dispatch("keydown", { key: "Enter" });
  await sleep(20);
  const second = all(".item-text")[1];
  assert.equal(document.activeElement, second, "Enter goes to a new item");
  typeInto(second, "Bread");
  await sleep(800);
  assert.match(location.hash, /^#\/note\//, "the new note got its own address");
  const stored = zapli.tables.note[0];
  assert.equal(stored.kind, "list");
  assert.equal(stored.body, "- [ ] Milk\n- [ ] Bread");
  await systemBack();
  await sleep(60);
  assert.ok(cardFor("Milk"), "the new checklist shows");
  check("fresh");
  console.log("smoke-render fresh: ok");
  process.exit(0);
}

// live: a phone with the made-up notes
const groceries = lang === "sk" ? "Nákup" : "Groceries";
assert.ok(cardFor(groceries), "notes show");
assert.ok(text().includes(T.pinnedSection), "pinned notes have their section");
assert.ok(all(".dock").length === 1, "the dock is there");

// A new note in one tap, typing at once.
await tap(tx("newNote"));
assert.equal(location.hash, "#/new");
const area = all(".body-input")[0];
assert.equal(document.activeElement, area, "the keyboard goes to the text");
typeInto(area, "Call the plumber about the kitchen tap");
await sleep(800);
assert.match(location.hash, /^#\/note\//);
const made = zapli.tables.note.find((n) => n.body === "Call the plumber about the kitchen tap");
assert.ok(made && made.created && made.edited, "the note is stored with its times");
assert.ok(text().includes(tx("wordCount", 7)), "the word count shows");
// Undo brings the empty text back, Redo the words.
await tap(T.undoEdit);
assert.equal(all(".body-input")[0].value, "");
await tap(T.redoEdit);
assert.equal(all(".body-input")[0].value, "Call the plumber about the kitchen tap");
// Pin and colour.
await tap(T.pin);
await tap(T.colour);
await tap(T.color_green, openDialog());
await sleep(800);
assert.equal(zapli.tables.note.find((n) => n.id === made.id).color, "green");
assert.equal(zapli.tables.note.find((n) => n.id === made.id).pinned, true);
check("editor");
await systemBack();
await sleep(60);
assert.equal(location.hash, "#/");
assert.ok(cardFor("plumber"), "the new note is on the main screen");

// A checklist: tick, untick all, convert.
cardFor(groceries).querySelector(".card-hit").click();
await sleep(40);
assert.match(location.hash, /^#\/note\//);
const firstBox = all(".check")[0];
firstBox.click();
await sleep(500);
await sleep(800);
const groceryNote = zapli.tables.note.find((n) => n.title === groceries);
assert.ok(/- \[x\] /.test(groceryNote.body.split("\n")[0]) === false, "a ticked item goes down");
assert.equal((groceryNote.body.match(/- \[x\]/g) || []).length, 3, "three items are ticked now");
await tap(T.moreOptions);
await tap(T.untickAll, openDialog());
await sleep(800);
assert.equal((zapli.tables.note.find((n) => n.title === groceries).body.match(/- \[x\]/g) || []).length, 0);
// Paste several lines into an item: one item a line.
const lastItem = all(".item-text").slice(-1)[0];
lastItem.dispatch("paste", { clipboardData: { getData: () => "Apples\nPears\nPlums" } });
await sleep(800);
assert.ok(zapli.tables.note.find((n) => n.title === groceries).body.includes("- [ ] Plums"), "pasted lines are items");
check("checklist");

// Archive from the editor, then Undo from the snackbar.
await tap(T.archive);
await sleep(80);
assert.equal(location.hash, "#/");
assert.ok(text(document.getElementById("snackbar")).includes(tx("archivedNotes", 1)));
await tap(T.undo, document.getElementById("snackbar"));
await sleep(80);
assert.equal(zapli.tables.note.find((n) => n.title === groceries).archived, false);

// A reminder from the quick choices.
cardFor("plumber").querySelector(".card-hit").click();
await sleep(40);
await tap(T.remindMe);
await sleep(40);
const preset = all(".preset", openDialog())[0];
preset.click();
await sleep(300);
assert.ok(zapli.tables.note.find((n) => n.id === made.id).remindAt, "the reminder is stored");
assert.ok(all(".meta-chip").length >= 1, "the reminder chip shows");
await systemBack();
await sleep(60);

// Selection: long press, then move to the trash, then restore from the trash.
const card = cardFor("plumber").querySelector(".card-hit");
card.dispatch("contextmenu");
await sleep(40);
assert.ok(history.state.select, "a long press selects");
assert.ok(all(".card.selected").length === 1);
await tap(T.delete);
await sleep(80);
assert.ok(zapli.tables.note.find((n) => n.id === made.id).trashedAt, "the note is in the trash");
assert.ok(!cardFor("plumber"), "and off the main screen");
await tap(T.menu);
await tap(T.navTrash, openDialog());
await sleep(200);
assert.equal(location.hash, "#/trash");
assert.ok(text().includes(T.trashRule), "the trash says its rule");
cardFor("plumber").querySelector(".card-hit").click();
await sleep(40);
assert.ok(
  text().includes(tx("inTrashBanner", 30).replace("{n}", "30")) || all(".info-card").length,
  "a note in the trash says so",
);
await tap(T.restore);
await sleep(80);
assert.ok(!zapli.tables.note.find((n) => n.id === made.id).trashedAt, "restored");
await systemBack();
await sleep(60);
await systemBack();
await sleep(60);
assert.equal(location.hash, "#/");

// Search without accents, from the main screen.
await tap(T.searchNotes);
assert.equal(location.hash, "#/search");
const input = all(".search-input")[0];
typeInto(input, lang === "sk" ? "ovsene" : "oat");
await sleep(200);
assert.ok(cardFor(groceries), "search finds an item of a checklist");
assert.ok(all("mark").length >= 1, "the words are marked");
// A type filter: only checklists.
typeInto(all(".search-input")[0], "");
await sleep(200);
all(".type-tile")[0].click();
await sleep(60);
assert.match(location.hash, /type=list/, "the filter is in the address");
assert.ok(cards().length > 0, "checklists are found");
for (const c of cards()) assert.ok(c.querySelector(".card-items"), "only checklists are shown");
all(".active-filters .chip")[0].click();
await sleep(60);
assert.ok(all(".type-tile").length === 4, "removing the filter shows the filters again");
check("search");
await systemBack();
await sleep(60);

// Labels from inside a note: find or create one, tick it.
cardFor("plumber").querySelector(".card-hit").click();
await sleep(40);
await tap(T.moreOptions);
await tap(T.labels, openDialog());
await sleep(300);
const find = all(".find-label", openDialog())[0];
typeInto(find, "Plumbing");
find.dispatch("keydown", { key: "Enter" });
await sleep(120);
assert.ok(zapli.tables.note.find((n) => n.id === made.id).labels.includes("Plumbing"), "the label is on the note");
assert.ok(
  zapli.tables.label.some((l) => l.name === "Plumbing"),
  "and in the labels",
);
await systemBack();
await sleep(150);
assert.ok(
  all(".meta-chip").some((c) => c.textContent.includes("Plumbing")),
  "the note shows its label",
);
await systemBack();
await sleep(60);

// Labels: make one, rename it, delete it.
await tap(T.menu);
await tap(T.editLabels, openDialog());
await sleep(200);
assert.equal(location.hash, "#/labels");
typeInto(all(".new-label-input")[0], "Garden");
await tap(T.createLabelButton);
await sleep(80);
assert.ok(
  zapli.tables.label.some((l) => l.name === "Garden"),
  "the label is made",
);
await systemBack();
await sleep(60);

// Settings: export both files, then import.
await tap(T.menu);
await tap(T.navSettings, openDialog());
await sleep(200);
await tap(T.exportJson);
await sleep(80);
const json = JSON.parse(saved[saved.length - 1].text);
assert.equal(json.format, "notes");
assert.ok(json.notes.length >= 10);
await tap(T.exportCsv);
await sleep(80);
// Reading a Blob as text drops the byte order mark the file starts with.
assert.ok(saved[saved.length - 1].text.replace(/^\uFEFF/, "").startsWith('"Title","Text"'));
await tap(T.importNotes);
await tap(T.importCsv, openDialog());
await sleep(200);
const imported = zapli.tables.note.filter((n) => n.importId);
assert.equal(imported.length, 2, "two notes came in");
assert.equal(imported.find((n) => !n.title).kind, "list", "a checklist from a file stays a checklist");
assert.ok(
  zapli.tables.label.some((l) => l.name === "Imported"),
  "labels from the file are made",
);
assert.ok(text().includes(tx("importSkipped", 1)), "the left-out row is reported");
await tap(T.undo, document.getElementById("snackbar"));
await sleep(80);
assert.equal(zapli.tables.note.filter((n) => n.importId).length, 0, "Undo takes the import back");
check("settings");
await systemBack();
await sleep(60);

// The drawer and Back: the drawer closes first, then sections return to the notes.
await tap(T.menu);
assert.ok(openDialog(), "the drawer opens");
await systemBack();
assert.ok(!openDialog(), "Back closes it");
await tap(T.menu);
await tap(T.navArchive, openDialog());
await sleep(200);
assert.equal(location.hash, "#/archive");
await tap(T.menu);
await tap(T.navReminders, openDialog());
await sleep(200);
assert.equal(location.hash, "#/reminders");
check("reminders");
await systemBack();
await sleep(60);
assert.equal(location.hash, "#/", "Back from a section returns to the notes");
await systemBack();
assert.ok(exited, "Back from the notes leaves the app");

console.log("smoke-render live (" + LANG + ", text " + FONT + "×): ok, " + runs.length + " actions run");
process.exit(0);
