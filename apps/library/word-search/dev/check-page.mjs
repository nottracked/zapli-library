// Checks the page without a browser (Node 22). A small stand-in for the DOM reads index.html, then the real
// js/main.mjs runs on it and plays:
//  - every element the code looks up by id exists in index.html, once;
//  - the first start: a 6 × 6 puzzle, its word list, the quiet line that opens How to play;
//  - drags (forwards and backwards), a drag a little off the line, a miss, and tap-tap selections find words, cross
//    them off and colour them; messages stay until the next action;
//  - hints from the toolbar and from the word list; a solved puzzle, its hidden message and the next puzzle;
//  - themes, Undo, the daily puzzle, Slovak words and texts, a hard puzzle with a hidden list, the dialogs;
//  - progress survives a reload from the saved values.
// Run: node dev/check-page.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const problems = [];
const fail = (text) => problems.push(text);
const ok = (cond, what) => {
  if (!cond) fail(what);
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};

// ---- ids
const html = readFileSync(join(pkg, "index.html"), "utf8");
const ids = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
for (const [id, n] of ids) if (n > 1) fail(`id "${id}" appears ${n} times in index.html`);
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".mjs")) {
      const code = readFileSync(path, "utf8");
      for (const m of code.matchAll(/(?:\$|getElementById)\(\s*"([^"]+)"\s*\)/g)) {
        if (!ids.has(m[1])) fail(`${entry.name} looks up "#${m[1]}", which index.html does not have`);
      }
    }
  }
})(join(pkg, "js"));

// ---- a stand-in for the parts of the DOM the page uses
const VOID = new Set(["meta", "link", "input", "br", "img"]);
let doc = null;

class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.localName = tag;
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = {};
    this.style = { setProperty: (k, v) => (this.style[k] = v) };
    const el = this;
    this.dataset = new Proxy(
      {},
      {
        get: (_, k) =>
          el.getAttribute(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`) ?? undefined,
        set: (_, k, v) => {
          el.setAttribute(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
          return true;
        },
      },
    );
    const cls = () => new Set((this.getAttribute("class") || "").split(/\s+/).filter(Boolean));
    const write = (set) => this.setAttribute("class", Array.from(set).join(" "));
    this.classList = {
      add: (...c) => write(new Set([...cls(), ...c])),
      remove: (...c) => {
        const s = cls();
        c.forEach((x) => s.delete(x));
        write(s);
      },
      toggle: (c, force) => {
        const s = cls();
        const on = force === undefined ? !s.has(c) : Boolean(force);
        if (on) s.add(c);
        else s.delete(c);
        write(s);
        return on;
      },
      contains: (c) => cls().has(c),
    };
    this.checked = false;
    this.disabled = false;
    this.clientWidth = 360;
    this.clientHeight = 420;
  }
  get parentElement() {
    return this.parentNode instanceof Node && this.parentNode.localName !== "#document" ? this.parentNode : null;
  }
  get children() {
    return this.childNodes.filter((n) => n instanceof Node);
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }
  get id() {
    return this.getAttribute("id") || "";
  }
  get name() {
    return this.getAttribute("name") || "";
  }
  get value() {
    return this.getAttribute("value") || "";
  }
  get className() {
    return this.getAttribute("class") || "";
  }
  set className(v) {
    this.setAttribute("class", v);
  }
  get hidden() {
    return this.attrs.has("hidden");
  }
  set hidden(v) {
    if (v) this.attrs.set("hidden", "");
    else this.attrs.delete("hidden");
  }
  get open() {
    return this.attrs.has("open");
  }
  get lang() {
    return this.getAttribute("lang") || "";
  }
  set lang(v) {
    this.setAttribute("lang", v);
  }
  get title() {
    return this.getAttribute("title") || "";
  }
  set title(v) {
    this.setAttribute("title", v);
  }
  set type(v) {
    this.setAttribute("type", v);
  }
  get offsetWidth() {
    return 0;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === doc.root;
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  hasAttribute(k) {
    return this.attrs.has(k);
  }
  get textContent() {
    return this.childNodes.map((n) => (n instanceof Node ? n.textContent : n.text)).join("");
  }
  set textContent(v) {
    this.childNodes.forEach((n) => {
      if (n instanceof Node) n.parentNode = null;
    });
    this.childNodes = v === "" || v === null || v === undefined ? [] : [{ text: String(v) }];
  }
  appendChild(n) {
    if (n.fragment) {
      n.childNodes.slice().forEach((c) => this.appendChild(c));
      n.childNodes = [];
      return n;
    }
    if (n.parentNode) n.remove();
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...nodes) {
    nodes.forEach((n) => this.appendChild(n));
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    ev.preventDefault = ev.preventDefault || (() => {});
    let n = this;
    while (n) {
      for (const fn of n.listeners[ev.type] || []) fn(ev);
      n = ev.bubbles === false ? null : n.parentNode;
    }
    return true;
  }
  click() {
    if (this.disabled) return;
    this.dispatchEvent({ type: "click" });
  }
  focus() {
    doc.activeElement = this;
  }
  setPointerCapture() {}
  showModal() {
    this.attrs.set("open", "");
  }
  close() {
    this.attrs.delete("open");
    this.dispatchEvent({ type: "close", bubbles: false });
  }
  getBoundingClientRect() {
    if (this.id === "board") {
      const w = parseFloat(this.style.width) || 0;
      return { left: 0, top: 0, width: w, height: w };
    }
    if (this.id === "tz-probe") return { height: 100 };
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  matches(sel) {
    return sel.split(",").some((part) => matchOne(this, part.trim()));
  }
  closest(sel) {
    let n = this;
    while (n && n instanceof Node) {
      if (n.matches(sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const visit = (n) => {
      for (const c of n.children) {
        if (c.matches(sel)) out.push(c);
        visit(c);
      }
    };
    visit(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
}

// Compound selectors only: tag, .class, #id, [attr], [attr="value"], :checked.
function matchOne(el, sel) {
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|:(checked)/g;
  let m;
  let any = false;
  while ((m = re.exec(sel))) {
    any = true;
    if (m[1] && el.localName !== m[1].toLowerCase()) return false;
    if (m[2] && !el.classList.contains(m[2])) return false;
    if (m[3] && el.id !== m[3]) return false;
    if (m[4] && (m[5] === undefined ? !el.hasAttribute(m[4]) : el.getAttribute(m[4]) !== m[5])) return false;
    if (m[6] && !el.checked) return false;
  }
  return any;
}

function parse(source) {
  const root = new Node("#document");
  const stack = [root];
  const re =
    /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(source))) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      while (stack.length > 1 && stack.pop().localName !== m[1].toLowerCase());
    } else if (m[2]) {
      const el = new Node(m[2].toLowerCase());
      for (const a of m[3].matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g)) el.attrs.set(a[1], a[2] === undefined ? "" : a[2]);
      if (el.localName === "input" && el.hasAttribute("checked")) el.checked = true;
      top.appendChild(el);
      if (!m[4] && !VOID.has(el.localName)) stack.push(el);
    } else if (m[5] && m[5].trim()) top.childNodes.push({ text: m[5] });
  }
  return root;
}

function setUpGlobals(storage) {
  const root = parse(html);
  const htmlEl = root.querySelector("html");
  doc = {
    root,
    documentElement: htmlEl,
    activeElement: null,
    hidden: false,
    title: "",
    listeners: {},
    getElementById: (id) => root.querySelector(`#${id}`),
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    createElement: (tag) => new Node(tag),
    createElementNS: (_, tag) => new Node(tag),
    createDocumentFragment: () => Object.assign(new Node("#fragment"), { fragment: true }),
    addEventListener() {},
  };
  globalThis.document = doc;
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    getComputedStyle: () => ({
      paddingLeft: "8px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
      borderLeftWidth: "2px",
    }),
    crypto: globalThis.crypto,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
  };
  globalThis.CSS = { escape: (s) => s };
  // The browser's language: English, whatever this computer's is.
  Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true });
  globalThis.Event = class {
    constructor(type) {
      this.type = type;
    }
  };
}

process.on("uncaughtException", (e) => {
  for (const x of problems) console.error(`  ${x}`);
  console.error(e);
  process.exit(1);
});

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (id) => doc.getElementById(id);
const visible = (el) => {
  for (let n = el; n && n instanceof Node; n = n.parentNode) if (n.hidden) return false;
  return true;
};

let run = 0;
async function boot(storage) {
  setUpGlobals(storage);
  // A fresh copy of the modules for every start, as a reload would.
  await import(`${pathToFileURL(join(pkg, "js", "main.mjs")).href}?run=${++run}`);
  await tick(20);
}

const saved = (storage, name) => JSON.parse(storage.get(`word-search/${name}`) || "null");
const current = (storage, lang) => {
  const p = saved(storage, `progress-${lang}`);
  if (p.active === "endless") return p.endless;
  return p.open[p.active];
};

// The centre of a square of the board, in page pixels.
function at(i, size) {
  const side = parseFloat($("board").style.width);
  const cell = side / size;
  return { clientX: ((i % size) + 0.5) * cell, clientY: (Math.floor(i / size) + 0.5) * cell };
}
const STEP = { e: [0, 1], s: [1, 0], se: [1, 1], ne: [-1, 1], w: [0, -1], n: [-1, 0], nw: [-1, -1], sw: [1, -1] };
const ends = (p, word) => {
  const [dr, dc] = STEP[word.d];
  return [word.r * p.size + word.c, (word.r + dr * (word.n - 1)) * p.size + (word.c + dc * (word.n - 1))];
};

function drag(a, b, size, offset = 0) {
  const board = $("board");
  const p = (i) => ({ ...at(i, size), pointerId: 1, button: 0, bubbles: true });
  board.dispatchEvent({ type: "pointerdown", ...p(a) });
  const end = p(b);
  end.clientY += offset;
  board.dispatchEvent({ type: "pointermove", ...end });
  board.dispatchEvent({ type: "pointerup", ...end });
}

function tap(i, size) {
  const board = $("board");
  const p = { ...at(i, size), pointerId: 2, button: 0 };
  board.dispatchEvent({ type: "pointerdown", ...p });
  board.dispatchEvent({ type: "pointerup", ...p });
}

const pills = () => $("word-list").querySelectorAll(".pill");
const foundPills = () =>
  $("word-list")
    .querySelectorAll(".pill")
    .filter((x) => x.classList.contains("found"));

// ---- first start
const storage = new Map();
await boot(storage);
let g = current(storage, "en");
ok(g && g.puzzle, "the first start makes a puzzle");
eq(g.puzzle.size, 6, "the first puzzle is 6 × 6");
eq($("board").querySelectorAll(".l").length, 36, "36 letters on the board");
eq(pills().length, g.puzzle.words.length, "a pill for every word");
ok($("theme-name").textContent.length > 0, "the theme's name shows");
ok(/^Puzzle 1 · 6 × 6$/.test($("mode-label").textContent), `mode line: ${$("mode-label").textContent}`);
ok(visible($("first-help")), "the first start shows the line that opens How to play");
ok(parseFloat($("board").style.width) > 200, `the board is sized (${$("board").style.width})`);
eq($("progress").textContent, `0/${g.puzzle.words.length}`, "progress at start");

// drag forwards, with the finger a little off the line
let [a, b] = ends(g.puzzle, g.puzzle.words[0]);
drag(a, b, g.puzzle.size, 6);
g = current(storage, "en");
eq(g.state.found, [g.puzzle.words[0].w], "a drag finds the word");
ok(/found!/.test($("notice").textContent), `the find is announced: ${$("notice").textContent}`);
eq(foundPills().length, 1, "the pill is crossed off");
ok($("board").querySelectorAll(".cap").length === 1, "one capsule on the board");
ok(!visible($("first-help")), "the first-start line is gone after the first word");

// a message stays until the next action
await tick(50);
ok($("notice").textContent.length > 0, "the message stays");
$("board").dispatchEvent({ type: "pointerdown", ...at(0, 6), pointerId: 3, button: 0 });
eq($("notice").textContent, "", "the next touch clears it");
$("board").dispatchEvent({ type: "pointerup", ...at(0, 6), pointerId: 3, button: 0 });
tap(0, 6); // let go of the first tap again

// backwards
[a, b] = ends(g.puzzle, g.puzzle.words[1]);
drag(b, a, g.puzzle.size);
eq(current(storage, "en").state.found.length, 2, "a backwards drag finds the word");

// a miss changes nothing
const before = current(storage, "en").state.found.length;
drag(0, 1, g.puzzle.size);
const missFound = current(storage, "en").state.found.length;
ok(missFound === before || missFound === before + 1, "a miss changes nothing (unless it was a word)");

// tap the first letter, then the last
g = current(storage, "en");
const tapWord = g.puzzle.words.find((x) => !g.state.found.includes(x.w));
[a, b] = ends(g.puzzle, tapWord);
tap(a, g.puzzle.size);
ok($("board").querySelector(".anchor").classList.contains("on"), "the first tap is marked");
tap(b, g.puzzle.size);
ok(current(storage, "en").state.found.includes(tapWord.w), "tap, tap finds the word");

// hints: the toolbar, then the list
$("btn-hint").click();
g = current(storage, "en");
eq(g.state.used, 1, "a hint is counted");
ok($("board").querySelectorAll(".ring").length === 1, "the hint rings a first letter");
ok($("notice").classList.contains("hint"), "the hint says which letter");
const open = pills().find((x) => !x.classList.contains("found"));
open.click();
ok(visible($("ask")), "a tap on a word offers its hints");
$("ask-where").click();
ok($("board").querySelectorAll(".outline").length === 1, "Show where outlines the word");
eq(current(storage, "en").state.used, 2, "two hints counted");

// solve the rest
g = current(storage, "en");
for (const word of g.puzzle.words) {
  if (current(storage, "en").state.found.includes(word.w)) continue;
  [a, b] = ends(g.puzzle, word);
  drag(a, b, g.puzzle.size);
}
g = current(storage, "en");
eq(g.state.done, true, "every word found solves the puzzle");
ok(visible($("solved")) && !visible($("words")), "the solved panel replaces the list");
eq(saved(storage, "stats-en").solved, 1, "one puzzle solved in the statistics");
if (g.puzzle.message) {
  ok(visible($("reveal")), "the hidden message is shown");
  eq($("reveal-text").textContent, g.puzzle.message.toUpperCase(), "the message reads right");
  ok($("board").classList.contains("reveal"), "the board lights the message's letters");
}
ok(saved(storage, "collection-en").themes[g.puzzle.theme].w.length >= g.puzzle.words.length, "the words are collected");
ok($("btn-hint").disabled, "no hints on a solved puzzle");

// next puzzle
$("btn-next").click();
ok(/^Puzzle 2 /.test($("mode-label").textContent), `the next puzzle is number 2: ${$("mode-label").textContent}`);
ok(visible($("words")) && !visible($("solved")), "the list is back");

// themes: pick one, then Undo after a word was found
g = current(storage, "en");
[a, b] = ends(g.puzzle, g.puzzle.words[0]);
drag(a, b, g.puzzle.size);
const left = current(storage, "en").puzzle;
$("btn-themes").click();
ok($("dlg-themes").open, "Themes opens");
const cards = $("theme-cards").querySelectorAll(".theme-card");
eq(cards.length, 46, "46 theme cards");
const pick = cards.find((x) => x.dataset.theme !== left.theme && x.dataset.theme === "space") || cards[5];
pick.click();
ok(!$("dlg-themes").open, "picking a theme closes the sheet");
eq(current(storage, "en").puzzle.theme, pick.dataset.theme, "the new puzzle has the theme picked");
ok(visible($("btn-undo")), "Undo is offered");
$("btn-undo").click();
eq(current(storage, "en").puzzle.seed, left.seed, "Undo brings back the puzzle left");

// the daily puzzle
$("btn-switch").click();
let p = saved(storage, "progress-en");
ok(p.active !== "endless", "Today's puzzle opens the daily puzzle");
ok(/^Daily · /.test($("mode-label").textContent), `daily mode line: ${$("mode-label").textContent}`);
const daily = p.open[p.active].puzzle;
ok(Boolean(daily.message), "the daily puzzle has a hidden message");
$("btn-daily").click();
ok($("dlg-daily").open, "the calendar opens");
ok($("cal").querySelectorAll(".d").length >= 28, "the calendar shows a month");
$("daily-close").click();

// Slovak words
$("btn-lang").click();
g = current(storage, "sk");
ok(g && g.puzzle.lang === "sk", "the language button makes a Slovak puzzle");
eq($("lang-code").textContent, "SK", "the button says SK");
const skLetters = new Set(
  "a á ä b c č d ď e é f g h ch i í j k l ĺ ľ m n ň o ó ô p q r ŕ s š t ť u ú v w x y ý z ž".split(" "),
);
ok(
  g.puzzle.grid.every((x) => skLetters.has(x)),
  "Slovak grids use Slovak letters",
);

// Slovak texts
const ui = $("dlg-settings").querySelector('input[name="ui"][value="sk"]');
ui.checked = true;
$("dlg-settings").dispatchEvent({ type: "change", target: ui });
eq($("btn-hint").querySelector("span").textContent, "Nápoveda", "the game speaks Slovak");
eq(doc.documentElement.getAttribute("lang"), "sk", "the page's language is Slovak");

// hard: 12 × 12, the list shows only lengths
const hard = $("dlg-settings").querySelector('input[name="difficulty"][value="hard"]');
hard.checked = true;
$("dlg-settings").dispatchEvent({ type: "change", target: hard });
eq(saved(storage, "settings").difficulty, "hard", "the difficulty is saved");
$("btn-themes").click();
$("theme-cards").querySelectorAll(".theme-card")[3].click();
g = current(storage, "sk");
eq(g.puzzle.size, 12, "a hard puzzle is 12 × 12");
ok(
  pills().every((x) => x.classList.contains("blank")),
  "a hard puzzle hides the words",
);
ok(
  pills().every((x) => /^•+$/.test(x.textContent)),
  "blank pills show the word's length",
);

// dialogs open and close
for (const [btn, dlg, done] of [
  ["btn-stats", "dlg-stats", "stats-done"],
  ["btn-help", "dlg-help", "help-done"],
  ["btn-settings", "dlg-settings", "settings-done"],
]) {
  $(btn).click();
  ok($(dlg).open, `${btn} opens ${dlg}`);
  $(done).click();
  ok(!$(dlg).open, `${done} closes ${dlg}`);
}
$("btn-stats").click();
ok($("stats-body").querySelectorAll("tr").length >= 9, "statistics have their rows");
$("stats-done").click();

// a reload keeps everything
await tick(50);
const seed = current(storage, "sk").puzzle.seed;
await boot(storage);
eq(current(storage, "sk").puzzle.seed, seed, "a reload opens the same puzzle");
eq($("lang-code").textContent, "SK", "and the same language");

if (problems.length) {
  for (const x of problems) console.error(`  ${x}`);
  process.exitCode = 1;
} else console.log(`ids: ${ids.size} in index.html, all found; the page played every check, all passed`);
process.exit();
