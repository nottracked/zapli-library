// A small stand-in for the browser, enough to run the page's own code in Node for dev/check-page.mjs: elements read
// from index.html (by id, data-t, data-t-label and input names), dialogs, history and the hash, timers and animation
// frames on a clock the check moves, localStorage, and a canvas whose drawing calls do nothing but measure text.
// It is not a browser: layout is whatever the check sets, and CSS does not apply.
import { readFileSync } from "node:fs";

const clock = { now: 0 };
const timers = [];
let timerId = 0;
const frames = [];

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
    this.defaultPrevented = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {}
}

class Listeners {
  constructor() {
    this.map = {};
  }
  addEventListener(type, fn, opts) {
    (this.map[type] = this.map[type] || []).push({ fn, capture: opts === true || (opts && opts.capture) });
  }
  removeEventListener(type, fn) {
    this.map[type] = (this.map[type] || []).filter((l) => l.fn !== fn);
  }
  dispatchEvent(ev) {
    if (!ev.target) ev.target = this;
    for (const l of (this.map[ev.type] || []).slice()) l.fn.call(this, ev);
    return !ev.defaultPrevented;
  }
}

function measure(ctx, text) {
  const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font || "");
  const size = m ? Number(m[1]) : 10;
  return { width: String(text).length * size * 0.56 };
}

function context2d() {
  const grad = { addColorStop() {} };
  const target = {
    font: "10px sans-serif",
    calls: 0,
    measureText(text) {
      return measure(this, text);
    },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {
        t.calls++;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

export class FakeElement extends Listeners {
  constructor(tag, attrs = {}) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.attributes = Object.assign({}, attrs);
    this.children = [];
    this.parentNode = null;
    this._text = "";
    this.dataset = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = v;
    }
    const cls = new Set(
      String(attrs.class || "")
        .split(/\s+/)
        .filter(Boolean),
    );
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => cls.add(x)),
      remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, on) => {
        const want = on === undefined ? !cls.has(c) : on;
        if (want) cls.add(c);
        else cls.delete(c);
        return want;
      },
      contains: (c) => cls.has(c),
    };
    Object.defineProperty(this, "className", {
      get: () => Array.from(cls).join(" "),
      set: (v) => {
        cls.clear();
        String(v)
          .split(/\s+/)
          .filter(Boolean)
          .forEach((x) => cls.add(x));
      },
    });
    const style = {};
    style.setProperty = (k, v) => (style[k] = v);
    style.getPropertyValue = (k) => style[k] || "";
    this.style = style;
    this.hidden = "hidden" in attrs;
    this.checked = "checked" in attrs;
    this.disabled = false;
    this.value = attrs.value || "";
    this.type = attrs.type || "";
    this.name = attrs.name || "";
    this.id = attrs.id || "";
    this.open = false;
    this.tabIndex = 0;
    this.box = null;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.width = 300;
    this.height = 150;
    this.onclick = null;
    if (this.tagName === "CANVAS") this._ctx = context2d();
    this.isConnected = true;
    void self;
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  set innerHTML(v) {
    this.textContent = "";
  }
  get firstChild() {
    return this.children[0] || null;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === "open") this.open = true;
  }
  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === "open") this.open = false;
  }
  hasAttribute(k) {
    return k in this.attributes;
  }
  appendChild(c) {
    if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c);
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs) {
    cs.forEach((c) => this.appendChild(c));
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
  }
  focus() {
    doc.activeElement = this;
  }
  blur() {}
  click() {
    const ev = new FakeEvent("click", { target: this });
    if (typeof this.onclick === "function") this.onclick(ev);
    this.dispatchEvent(ev);
    // Checkboxes and radios change on a click, as in a browser.
    if (this.tagName === "INPUT" && (this.type === "checkbox" || this.type === "radio")) {
      if (this.type === "checkbox") this.checked = !this.checked;
      else this.checked = true;
      this.dispatchEvent(new FakeEvent("change", { target: this }));
    }
  }
  getContext() {
    return this._ctx || null;
  }
  getBoundingClientRect() {
    if (this.box) return this.box;
    if (this.id === "tz-probe") return { left: 0, top: 0, width: 80, height: 100 * (globalThis.__textScale || 1) };
    return { left: 0, top: 0, width: this.clientWidth || 360, height: this.clientHeight || 200 };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  showModal() {
    this.open = true;
    this.attributes.open = "";
  }
  close() {
    if (!this.open) return;
    this.open = false;
    delete this.attributes.open;
    this.dispatchEvent(new FakeEvent("close"));
  }
  querySelectorAll(sel) {
    return doc.querySelectorAll(sel, this);
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  closest() {
    return null;
  }
  contains(el) {
    for (let n = el; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  transferControlToOffscreen() {
    throw new Error("not in the stand-in");
  }
}

const doc = new Listeners();
const parsed = [];

function walk(el, out) {
  out.push(el);
  el.children.forEach((c) => walk(c, out));
}

function matches(el, sel) {
  if (sel === "dialog") return el.tagName === "DIALOG";
  if (sel === "dialog[open]") return el.tagName === "DIALOG" && el.open;
  if (sel === "[data-t]") return "data-t" in el.attributes;
  if (sel === "[data-t-label]") return "data-t-label" in el.attributes;
  const m = /^input\[name="([^"]+)"\]$/.exec(sel);
  if (m) return el.tagName === "INPUT" && el.name === m[1];
  if (sel.startsWith(".")) return el.classList.contains(sel.slice(1));
  return false;
}

Object.assign(doc, {
  activeElement: null,
  hidden: false,
  documentElement: new FakeElement("html"),
  body: new FakeElement("body"),
  title: "",
  getElementById(id) {
    return parsed.find((e) => e.id === id) || null;
  },
  querySelectorAll(sel, scope) {
    const all = [];
    if (scope) scope.children.forEach((c) => walk(c, all));
    const pool = scope ? all : parsed.concat(created.filter((e) => e.parentNode));
    return pool.filter((e) => matches(e, sel));
  },
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  },
  createElement(tag) {
    const el = new FakeElement(tag);
    created.push(el);
    return el;
  },
  createElementNS(ns, tag) {
    return this.createElement(tag);
  },
  createTextNode(text) {
    const el = new FakeElement("#text");
    el._text = String(text);
    return el;
  },
});
const created = [];

/** Builds the elements of index.html: every tag with an id, a data-t, a data-t-label or a name. */
export function loadPage(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? "" : a[2];
    if (attrs.id || "data-t" in attrs || "data-t-label" in attrs || attrs.name)
      parsed.push(new FakeElement(m[1], attrs));
  }
  return parsed;
}

// ---- window, history, location

const historyStack = [{ state: null, hash: "" }];
let historyIndex = 0;

function setHash(hash, push) {
  const h = hash.startsWith("#") ? hash : `#${hash}`;
  if (push) {
    historyStack.length = historyIndex + 1;
    historyStack.push({ state: null, hash: h });
    historyIndex++;
  } else historyStack[historyIndex] = { state: historyStack[historyIndex].state, hash: h };
}

const location = {
  get hash() {
    return historyStack[historyIndex].hash;
  },
  set hash(v) {
    const before = this.hash;
    setHash(v, true);
    if (before !== this.hash) later(() => win.dispatchEvent(new FakeEvent("hashchange")));
  },
  replace(url) {
    setHash(String(url).replace(/^[^#]*/, ""), false);
  },
};

const history = {
  get state() {
    return historyStack[historyIndex].state;
  },
  get length() {
    return historyStack.length;
  },
  pushState(state, title, url) {
    historyStack.length = historyIndex + 1;
    historyStack.push({ state: JSON.parse(JSON.stringify(state)), hash: url ? String(url) : location.hash });
    historyIndex++;
  },
  replaceState(state, title, url) {
    historyStack[historyIndex] = { state: JSON.parse(JSON.stringify(state)), hash: url ? String(url) : location.hash };
  },
  back() {
    if (historyIndex === 0) return;
    const before = location.hash;
    historyIndex--;
    later(() => {
      win.dispatchEvent(new FakeEvent("popstate", { state: history.state }));
      if (before !== location.hash) win.dispatchEvent(new FakeEvent("hashchange"));
    });
  },
};

function later(fn, ms = 0) {
  timers.push({ id: ++timerId, at: clock.now + ms, fn });
  return timerId;
}

const storage = new Map();
const win = new Listeners();
Object.assign(win, {
  document: doc,
  location,
  history,
  devicePixelRatio: 2,
  innerWidth: 390,
  innerHeight: 800,
  navigator: { language: "en-GB" },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  setTimeout: (fn, ms) => later(fn, ms || 0),
  clearTimeout: (id) => {
    const i = timers.findIndex((x) => x.id === id);
    if (i >= 0) timers.splice(i, 1);
  },
  requestAnimationFrame: (fn) => {
    frames.push(fn);
    return frames.length;
  },
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  performance: { now: () => clock.now },
});
win.window = win;

/** Installs the stand-in as the globals the page uses. */
export function install(extra = {}) {
  Object.assign(win, extra);
  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  for (const k of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "matchMedia",
    "requestAnimationFrame",
    "getComputedStyle",
    "navigator",
    "performance",
    "setTimeout",
    "clearTimeout",
  ]) {
    set(k, win[k]);
  }
  set("Event", FakeEvent);
  set("OffscreenCanvas", undefined);
  return { win, doc, storage, clock };
}

/** Moves the clock: runs due timers and animation frames (60 a second) for `ms` milliseconds. */
export async function advance(ms) {
  const end = clock.now + ms;
  while (clock.now < end) {
    clock.now = Math.min(end, clock.now + 1000 / 60);
    const due = timers.filter((x) => x.at <= clock.now).sort((a, b) => a.at - b.at);
    for (const x of due) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
    const run = frames.splice(0, frames.length);
    for (const fn of run) fn(clock.now);
    await Promise.resolve();
  }
  await new Promise((r) => setImmediate(r));
}

export { FakeEvent, win, doc };
