// A small stand-in for the browser's DOM, enough to run the game's page in Node 22 for dev/check-page.mjs: it reads
// index.html into elements, finds them with simple selectors (tags, ids, classes, attributes, and one level of
// descendants), and passes events up the tree. There is no layout: sizes are fixed numbers. Nothing here ships.

const VOID = new Set(["meta", "link", "input", "br", "img", "hr", "source", "use", "path", "rect", "circle"]);

export class StandInEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles !== false;
    this.defaultPrevented = false;
    this.stopped = false;
    Object.assign(this, init);
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.stopped = true;
  }
}

function camel(name) {
  return name.replace(/-([a-z])/g, (all, c) => c.toUpperCase());
}

export class StandInElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    this.ownerDocument = doc;
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = {};
    this.text = "";
    this.checked = false;
    this.value = "";
    this.scrollTop = 0;
    this.open = false;
    const el = this;
    this.style = new Proxy(
      { setProperty: (k, v) => (el.style[k] = v), getPropertyValue: (k) => el.style[k] || "" },
      { set: (o, k, v) => ((o[k] = v), true) },
    );
    this.classList = {
      add: (...c) => c.forEach((x) => el.classSet.add(x)) || el.syncClass(),
      remove: (...c) => c.forEach((x) => el.classSet.delete(x)) || el.syncClass(),
      toggle: (c, on) => {
        const want = on === undefined ? !el.classSet.has(c) : Boolean(on);
        if (want) el.classSet.add(c);
        else el.classSet.delete(c);
        el.syncClass();
        return want;
      },
      contains: (c) => el.classSet.has(c),
    };
    this.classSet = new Set();
  }
  syncClass() {
    this.attrs.set("class", Array.from(this.classSet).join(" "));
  }
  get className() {
    return Array.from(this.classSet).join(" ");
  }
  set className(v) {
    this.classSet = new Set(String(v).split(/\s+/).filter(Boolean));
    this.syncClass();
  }
  get id() {
    return this.attrs.get("id") || "";
  }
  set id(v) {
    this.attrs.set("id", v);
  }
  get name() {
    return this.attrs.get("name") || "";
  }
  get type() {
    return this.attrs.get("type") || "";
  }
  set type(v) {
    this.attrs.set("type", v);
  }
  get title() {
    return this.attrs.get("title") || "";
  }
  set title(v) {
    this.attrs.set("title", String(v));
  }
  get lang() {
    return this.attrs.get("lang") || "";
  }
  set lang(v) {
    this.attrs.set("lang", String(v));
  }
  get hidden() {
    return this.attrs.has("hidden");
  }
  set hidden(v) {
    if (v) this.attrs.set("hidden", "");
    else this.attrs.delete("hidden");
  }
  get disabled() {
    return this.attrs.has("disabled");
  }
  set disabled(v) {
    if (v) this.attrs.set("disabled", "");
    else this.attrs.delete("disabled");
  }
  get dataset() {
    const out = {};
    for (const [k, v] of this.attrs) if (k.startsWith("data-")) out[camel(k.slice(5))] = v;
    const el = this;
    return new Proxy(out, {
      set(o, k, v) {
        el.attrs.set(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v));
        o[k] = v;
        return true;
      },
    });
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  setAttribute(k, v) {
    if (k === "class") this.className = v;
    else this.attrs.set(k, String(v));
  }
  removeAttribute(k) {
    if (k === "class") this.className = "";
    else this.attrs.delete(k);
  }
  hasAttribute(k) {
    return this.attrs.has(k);
  }
  get children() {
    return this.childNodes.filter((c) => c instanceof StandInElement);
  }
  get parentElement() {
    return this.parentNode instanceof StandInElement ? this.parentNode : null;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === this.ownerDocument.documentElement;
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    for (const c of this.children) c.parentNode = null;
    this.childNodes = [];
    this.text = String(v);
  }
  appendChild(c) {
    if (c.isFragment) {
      for (const x of c.childNodes.slice()) this.appendChild(x);
      c.childNodes = [];
      return c;
    }
    if (c.parentNode) c.remove();
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((x) => x !== this);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    let node = this;
    while (node) {
      event.currentTarget = node;
      for (const fn of (node.listeners && node.listeners[event.type]) || []) fn.call(node, event);
      if (!event.bubbles || event.stopped) break;
      node = node.parentNode || (node === this.ownerDocument.documentElement ? this.ownerDocument : null);
    }
    return !event.defaultPrevented;
  }
  click() {
    if (this.disabled) return;
    if (this.localName === "input" && this.type === "checkbox") this.checked = !this.checked;
    if (this.localName === "input" && this.type === "radio") {
      for (const other of this.ownerDocument.querySelectorAll(`input[name="${this.name}"]`)) other.checked = false;
      this.checked = true;
    }
    const e = new StandInEvent("click", { detail: 1 });
    this.dispatchEvent(e);
    if (this.localName === "input" && (this.type === "checkbox" || this.type === "radio")) {
      this.dispatchEvent(new StandInEvent("change"));
    }
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  select() {}
  setPointerCapture() {}
  showModal() {
    this.open = true;
    this.attrs.set("open", "");
  }
  close() {
    this.open = false;
    this.attrs.delete("open");
    this.dispatchEvent(new StandInEvent("close", { bubbles: false }));
  }
  getBoundingClientRect() {
    return this.box || { left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 };
  }
  get clientWidth() {
    return this.size ? this.size[0] : 360;
  }
  get clientHeight() {
    return this.size ? this.size[1] : 300;
  }
  get offsetWidth() {
    return this.clientWidth;
  }
  get offsetHeight() {
    return this.clientHeight;
  }
  get scrollHeight() {
    return 1000;
  }
  matches(sel) {
    return sel.split(",").some((s) => matchChain(this, s.trim().split(/\s+/)));
  }
  closest(sel) {
    let n = this;
    while (n instanceof StandInElement) {
      if (n.matches(sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (c.matches(sel) && isInside(c, this)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
}

function isInside(el, scope) {
  let n = el.parentNode;
  while (n) {
    if (n === scope) return true;
    n = n.parentNode;
  }
  return false;
}

function matchCompound(el, sel) {
  const m = sel.match(/^([a-z][a-z0-9-]*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\])*)$/i);
  if (!m) throw new Error(`stand-in DOM: selector not supported: ${sel}`);
  if (m[1] && el.localName !== m[1].toLowerCase()) return false;
  for (const part of m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) || []) {
    if (part[0] === "#" && el.id !== part.slice(1)) return false;
    if (part[0] === "." && !el.classSet.has(part.slice(1))) return false;
    if (part[0] === "[") {
      const a = part.slice(1, -1).match(/^([\w-]+)(?:="([^"]*)")?$/);
      if (!a) throw new Error(`stand-in DOM: attribute selector not supported: ${part}`);
      if (a[1] === "open" && el.localName === "dialog") {
        if (!el.open) return false;
      } else if (!el.attrs.has(a[1])) return false;
      if (a[2] !== undefined) {
        const v = a[1] === "value" && el.localName === "input" ? el.attrs.get("value") : el.attrs.get(a[1]);
        if (v !== a[2]) return false;
      }
    }
  }
  return true;
}

function matchChain(el, parts) {
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  if (parts.length === 1) return true;
  let n = el.parentNode;
  while (n instanceof StandInElement) {
    if (matchChain(n, parts.slice(0, -1))) return true;
    n = n.parentNode;
  }
  return false;
}

/** Reads an HTML file into a stand-in document. Scripts and styles keep no content. */
export function parseDocument(html) {
  const doc = {
    listeners: {},
    activeElement: null,
    title: "",
    hidden: false,
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    dispatchEvent(event) {
      event.currentTarget = doc;
      for (const fn of this.listeners[event.type] || []) fn.call(doc, event);
      return !event.defaultPrevented;
    },
    createElement: (tag) => new StandInElement(tag, doc),
    createDocumentFragment: () => {
      const f = new StandInElement("fragment", doc);
      f.isFragment = true;
      return f;
    },
    getElementById: (id) => doc.documentElement.querySelectorAll(`#${id}`)[0] || null,
    querySelector: (sel) => doc.documentElement.querySelector(sel),
    querySelectorAll: (sel) => doc.documentElement.querySelectorAll(sel),
  };
  const rootEl = new StandInElement("html", doc);
  doc.documentElement = rootEl;
  const stack = [rootEl];
  const src = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/i, "");
  const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  let skipUntil = null;
  while ((m = re.exec(src))) {
    const [all, tag, attrText, selfClose, text] = m;
    if (skipUntil) {
      if (all.toLowerCase() === `</${skipUntil}>`) {
        skipUntil = null;
        stack.pop();
      }
      continue;
    }
    if (text !== undefined) {
      const top = stack[stack.length - 1];
      if (text.trim()) {
        const t = new StandInElement("#text", doc);
        t.text = text.replace(/\s+/g, " ");
        top.appendChild(t);
      }
      continue;
    }
    const name = tag.toLowerCase();
    if (all.startsWith("</")) {
      while (stack.length > 1 && stack[stack.length - 1].localName !== name) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (name === "html") {
      for (const a of attrText.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) rootEl.attrs.set(a[1], a[2] || "");
      continue;
    }
    const el = new StandInElement(name, doc);
    for (const a of attrText.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
      const value = (a[2] || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      if (a[1] === "class") el.className = value;
      else el.attrs.set(a[1], value);
    }
    if (el.localName === "input") {
      el.value = el.attrs.get("value") || "";
      el.checked = el.attrs.has("checked");
    }
    stack[stack.length - 1].appendChild(el);
    if (name === "head") doc.head = el;
    if (name === "body") doc.body = el;
    if (name === "script" || name === "style" || name === "textarea") {
      if (!selfClose) {
        stack.push(el);
        skipUntil = name;
      }
      continue;
    }
    if (!selfClose && !VOID.has(name)) stack.push(el);
  }
  // Plain text nodes are no elements to the selectors.
  const strip = (n) => {
    n.childNodes = n.childNodes.filter((c) => {
      if (c.localName === "#text") {
        n.text += c.text;
        return false;
      }
      strip(c);
      return true;
    });
  };
  strip(rootEl);
  return doc;
}
