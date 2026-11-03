// Development only (not shipped): a small stand-in for the browser's document, enough for the game's page to start,
// draw and play in Node, so check-page.mjs can drive it with clicks and keys. It lays nothing out (sizes come from
// a fixed table size), runs no CSS and keeps no real focus; it only catches mistakes in the page's code paths.

class ClassList {
  constructor(el) {
    this.el = el;
  }
  get set() {
    return new Set((this.el.className || "").split(/\s+/).filter(Boolean));
  }
  write(set) {
    this.el.className = [...set].join(" ");
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
  toggle(name, force) {
    const s = this.set;
    const on = force === undefined ? !s.has(name) : !!force;
    if (on) s.add(name);
    else s.delete(name);
    this.write(s);
    return on;
  }
  contains(name) {
    return this.set.has(name);
  }
}

class Style {
  constructor() {
    this.props = {};
  }
  setProperty(k, v) {
    this.props[k] = String(v);
  }
  removeProperty(k) {
    delete this.props[k];
  }
  getPropertyValue(k) {
    return this.props[k] || "";
  }
}

// Selectors the page uses: "#id", ".a.b", "tag", "[attr]", "[attr=value]", "tag.class", "dialog[open]",
// ":scope > :not(input):not(.sr-only)" and lists joined by commas.
function matches(el, sel) {
  sel = sel.trim();
  if (sel.includes(",")) return sel.split(",").some((part) => matches(el, part));
  if (sel.startsWith(":scope >")) return true;
  const re = /([#.]?[\w-]+|\[[^\]]+\])/g;
  let m;
  let any = false;
  while ((m = re.exec(sel))) {
    any = true;
    const p = m[1];
    if (p.startsWith("#")) {
      if (el.id !== p.slice(1)) return false;
    } else if (p.startsWith(".")) {
      if (!el.classList.contains(p.slice(1))) return false;
    } else if (p.startsWith("[")) {
      const [k, v] = p.slice(1, -1).split("=");
      const val = el.getAttribute(k);
      if (val === null) return false;
      if (v !== undefined && val !== v.replace(/["']/g, "")) return false;
    } else if (el.tagName !== p.toUpperCase()) return false;
  }
  return any;
}

let focused = null;

export class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.className = "";
    this.classList = new ClassList(this);
    this.style = new Style();
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.tabIndex = -1;
    this._text = "";
    this.open = false;
  }
  get id() {
    return this.attrs.id || "";
  }
  get name() {
    return this.attrs.name || "";
  }
  set name(v) {
    this.attrs.name = v;
  }
  set id(v) {
    this.attrs.id = v;
  }
  get firstChild() {
    return this.children[0] || null;
  }
  get lastElementChild() {
    return this.children[this.children.length - 1] || null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === this.ownerDocument.documentElement;
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this.children.forEach((c) => (c.parentNode = null));
    this.children = [];
    this._text = String(v);
  }
  setAttribute(k, v) {
    if (k === "class") this.className = String(v);
    else this.attrs[k] = String(v);
  }
  getAttribute(k) {
    if (k === "class") return this.className;
    if (k === "tabindex") return this.tabIndex >= 0 ? String(this.tabIndex) : (this.attrs.tabindex ?? null);
    return k in this.attrs ? this.attrs[k] : null;
  }
  removeAttribute(k) {
    delete this.attrs[k];
    if (k === "tabindex") this.tabIndex = -1;
  }
  hasAttribute(k) {
    return k in this.attrs;
  }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs) {
    cs.forEach((c) => this.appendChild(c));
  }
  insertBefore(c, ref) {
    if (!ref) return this.appendChild(c);
    if (c === ref) return c;
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = this.children.indexOf(ref);
    c.parentNode = this;
    this.children.splice(i < 0 ? this.children.length : i, 0, c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  all() {
    const out = [];
    const walk = (n) => n.children.forEach((c) => (out.push(c), walk(c)));
    walk(this);
    return out;
  }
  querySelectorAll(sel) {
    return this.all().filter((e) => matches(e, sel.split(" ").pop()));
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  closest(sel) {
    for (let n = this; n && n.tagName; n = n.parentNode) if (matches(n, sel)) return n;
    return null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type, init = {}) {
    const e = Object.assign(
      {
        type,
        target: this,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      },
      init,
    );
    for (let n = this; n; n = n.parentNode) (n.listeners[type] || []).slice().forEach((fn) => fn(e));
    if (type !== "keydown" || !e.defaultPrevented)
      (this.ownerDocument.listeners[type] || []).slice().forEach((fn) => fn(e));
    return e;
  }
  dispatchEvent(e) {
    (this.listeners[e.type] || []).forEach((fn) => fn(e));
  }
  click() {
    if (this.disabled) return;
    if (this.tagName === "INPUT" && (this.type === "checkbox" || this.type === "radio")) {
      this.checked = this.type === "radio" ? true : !this.checked;
      this.dispatch("change");
    }
    this.dispatch("click");
  }
  getBoundingClientRect() {
    const x = parseFloat(this.style.left) || 0;
    const y = parseFloat(this.style.top) || 0;
    const w = this.tagName === "SPAN" && this.id === "tz-probe" ? 0 : 40;
    return { left: x, top: y, right: x + w, bottom: y + 56, width: w, height: this.id === "tz-probe" ? 100 : 56 };
  }
  get offsetLeft() {
    return parseFloat(this.style.left) || 0;
  }
  get offsetTop() {
    return parseFloat(this.style.top) || 0;
  }
  get offsetWidth() {
    return this.hidden ? 0 : 300;
  }
  get clientWidth() {
    return this.id === "table" ? this.ownerDocument.tableSize[0] : 300;
  }
  get clientHeight() {
    return this.id === "table" ? this.ownerDocument.tableSize[1] : 300;
  }
  get scrollWidth() {
    return this.clientWidth;
  }
  focus() {
    focused = this;
  }
  select() {}
  showModal() {
    this.open = true;
    this.attrs.open = "";
  }
  close() {
    this.open = false;
    delete this.attrs.open;
    this.dispatchEvent({ type: "close" });
  }
  animate() {
    const a = { listeners: {}, cancel() {}, addEventListener() {} };
    return a;
  }
  getAnimations() {
    return [];
  }
  setPointerCapture() {}
}

// Parses the page's HTML into elements: tags, attributes and text, enough for index.html.
function parse(html, doc) {
  const root = new Element("html", doc);
  const stack = [root];
  const re =
    /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  const voids = new Set(["meta", "link", "input", "br", "img", "use", "path", "circle", "rect", "ellipse"]);
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const tag = m[1].toUpperCase();
      for (let i = stack.length - 1; i > 0; i--)
        if (stack[i].tagName === tag) {
          stack.length = i;
          break;
        }
    } else if (m[2]) {
      const el = new Element(m[2], doc);
      const attrRe = /([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
      let a;
      while ((a = attrRe.exec(m[3] || ""))) {
        const k = a[1];
        const v = a[2] === undefined ? "" : a[2].replace(/^["']|["']$/g, "");
        if (k === "class") el.className = v;
        else if (k.startsWith("data-")) {
          el.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
          el.attrs[k] = v;
        } else if (k === "hidden") el.hidden = true;
        else if (k === "type") {
          el.type = v;
          el.attrs.type = v;
        } else if (k === "tabindex") el.tabIndex = Number(v);
        else el.attrs[k] = v;
        if (k === "value") el.value = v;
      }
      stack[stack.length - 1].appendChild(el);
      if (!m[4] && !voids.has(m[2].toLowerCase())) stack.push(el);
    } else if (m[5] && m[5].trim()) {
      stack[stack.length - 1]._text += m[5].trim();
    }
  }
  return root;
}

export function makeDocument(html, tableSize) {
  const doc = {
    listeners: {},
    tableSize,
    hidden: false,
    title: "",
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    createElement: (tag) => new Element(tag, doc),
    createElementNS: (ns, tag) => new Element(tag, doc),
    createTextNode: (text) => {
      const el = new Element("#text", doc);
      el._text = text;
      return el;
    },
    getElementById: (id) => doc.documentElement.all().find((e) => e.id === id) || null,
    querySelector: (sel) => doc.documentElement.querySelector(sel),
    querySelectorAll: (sel) => doc.documentElement.querySelectorAll(sel),
    get activeElement() {
      return focused;
    },
  };
  doc.documentElement = parse(html, doc);
  doc.body = doc.documentElement.querySelector("body");
  return doc;
}

// Installs the stand-ins as globals: document, window, localStorage, matchMedia, Path2D and a timer queue that the
// check runs by hand.
export function install(html, tableSize = [360, 560]) {
  const document = makeDocument(html, tableSize);
  const timers = [];
  let now = 1800000000000;
  const store = new Map();
  const win = {
    document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout: (fn, ms) => {
      timers.push({ fn, at: now + (ms || 0) });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = null;
    },
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener() {},
    innerWidth: tableSize[0],
    innerHeight: tableSize[1] + 120,
    crypto: globalThis.crypto,
    CSS: { supports: () => true },
  };
  Object.assign(globalThis, {
    window: win,
    document,
    localStorage: win.localStorage,
    getComputedStyle: () => ({}),
    Path2D: class {},
  });
  Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true });
  document.createElement = ((orig) => (tag) => {
    const el = orig(tag);
    if (tag === "canvas") el.getContext = () => ({ isPointInPath: () => true });
    return el;
  })(document.createElement);
  // Runs every timer that is due within `ms`, in order, as time passes.
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      const due = timers.filter((t) => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      const fn = due.fn;
      due.fn = null;
      fn();
    }
    now = end;
  };
  return { document, store, advance };
}
