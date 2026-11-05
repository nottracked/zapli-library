// Checks the page without a browser (Node 22):
//  - every element the code looks up by id (`$("…")`, getElementById) exists in index.html, once;
//  - the letter wheel's gestures, on a small stand-in for the DOM: a swipe across letters tries the word, swiping
//    back takes a letter back, a swipe through the middle (the shuffle button) still works, taps build a word letter
//    by letter, a tap on the last letter takes it back, a tapped answer is taken at once and stays lit for a moment,
//    a longer word through it and the next word need no extra tap, a screen reader's click picks a letter, and a
//    keyboard's "c" picks CH on a wheel without C.
// Run: node dev/check-page.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
const problems = [];
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    problems.push(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};

// ---- ids
const html = readFileSync(join(pkg, "index.html"), "utf8");
const ids = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
for (const [id, n] of ids) if (n > 1) problems.push(`id "${id}" appears ${n} times in index.html`);
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".mjs")) {
      const code = readFileSync(path, "utf8");
      for (const m of code.matchAll(/(?:\$|getElementById)\(\s*"([^"]+)"\s*\)/g)) {
        if (!ids.has(m[1])) problems.push(`${entry.name} looks up "#${m[1]}", which index.html does not have`);
      }
    }
  }
}
walk(join(pkg, "js"));

// ---- a stand-in for the few DOM parts the wheel uses
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty() {}, left: "0%", top: "0%" };
    this.classList = {
      set: new Set(),
      toggle: (c, on) => (on ? this.classList.set.add(c) : this.classList.set.delete(c)),
      add: (c) => this.classList.set.add(c),
      remove: (c) => this.classList.set.delete(c),
      contains: (c) => this.classList.set.has(c),
    };
    this.listeners = {};
    this.textContent = "";
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  appendChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  set className(v) {
    v.split(/\s+/)
      .filter(Boolean)
      .forEach((c) => this.classList.set.add(c));
  }
  querySelector(sel) {
    if (sel === "svg.lines") return this.svg;
    if (sel === "polyline") return this.line;
    return null;
  }
  querySelectorAll(sel) {
    return sel === ".tile" ? this.children.filter((c) => c.classList.contains("tile")) : [];
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  closest(sel) {
    return sel === ".tile" && this.classList.contains("tile") ? this : null;
  }
  setPointerCapture() {}
  getBoundingClientRect() {
    if (this.box) return this.box;
    // A tile: its centre from style.left/top in % of the 300 px wheel; 25 % wide.
    const x = (parseFloat(this.style.left) / 100) * 300;
    const y = (parseFloat(this.style.top) / 100) * 300;
    return { left: x - 37.5, top: y - 37.5, width: 75, height: 75 };
  }
}

globalThis.document = { createElement: (tag) => new FakeElement(tag) };
// Timers wait until the check runs them, as time passing would.
let timers = [];
globalThis.window = {
  setTimeout: (fn) => {
    timers.push(fn);
    return timers.length;
  },
  clearTimeout(id) {
    if (id) timers[id - 1] = null;
  },
};
const runTimers = () => {
  const due = timers;
  timers = [];
  due.forEach((fn) => fn && fn());
};

const { createWheel, LINGER_MS } = await import("../package/js/ui/wheel-view.mjs");
const root = new FakeElement("div");
root.box = { left: 0, top: 0, width: 300, height: 300 };
root.svg = new FakeElement("svg");
root.line = new FakeElement("polyline");
root.svg.querySelectorAll = () => [root.line];
const hub = root.appendChild(new FakeElement("button"));
hub.className = "hub";
const words = [];
let current = [];
let lit = false;
let letters = 0;
let open = new Set();
const wheel = createWheel(root, {
  letterLabel: (l) => `Letter ${l}`,
  onChange: (w, how) => {
    current = w;
    lit = how.lit;
  },
  onSubmit: (w, how) => {
    words.push(`${w.join("")}${how.auto ? " (taken)" : ""}`);
    if (how.auto) open.delete(w.join(""));
  },
  onLetter: () => letters++,
  answers: () => ({
    isNew: (t) => t.length >= 3 && open.has(t.join("")),
    leadsOn: (t) => [...open].some((w) => w.startsWith(t.join(""))),
  }),
});
wheel.set(["ch", "l", "i", "e", "b"]);
const tiles = root.querySelectorAll(".tile");
const centre = (i) => {
  const r = tiles[i].getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
const at = (i) => {
  const [x, y] = Array.isArray(i) ? i : centre(i);
  return { clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault() {}, target: tiles[i] || root };
};
const fire = (type, ev) => root.listeners[type](ev);
const tapOn = (i) => {
  fire("pointerdown", at(i));
  fire("pointerup", at(i));
};

eq(root.children.includes(hub), true, "setting the letters keeps the shuffle button in the middle");
eq(
  tiles.map((t) => t.textContent),
  ["CH", "L", "I", "E", "B"],
  "the wheel shows CH as one letter",
);
// Swipe CH -> L -> I -> E -> B and lift: tries "chlieb".
fire("pointerdown", at(0));
for (const i of [1, 2, 3, 4]) fire("pointermove", at(i));
fire("pointerup", at(4));
eq(words, ["chlieb"], "a swipe tries the word");
eq(current, [], "the word clears after a swipe");
eq(letters, 5, "every letter that joins a swipe is felt once");
// Swipe CH -> L -> I, back over L (takes I back), then lift: tries "chl".
fire("pointerdown", at(0));
fire("pointermove", at(1));
fire("pointermove", at(2));
fire("pointermove", at(1));
eq(current, ["ch", "l"], "swiping back takes the last letter back");
fire("pointerup", at(1));
eq(words.at(-1), "chl", "the swipe tries what is left");
// A swipe across the middle of the wheel: L (right, top) through the centre to E (left, bottom), then B.
fire("pointerdown", at(1));
fire("pointermove", at([150, 150]));
eq(current, ["l"], "the middle of the wheel (the shuffle button) adds nothing to a swipe");
fire("pointermove", at(3));
fire("pointermove", at(4));
fire("pointerup", at(4));
eq(words.at(-1), "leb", "a swipe through the middle still tries its word");
// A touch on the middle does not start a word: the shuffle button gets it.
fire("pointerdown", at([150, 150]));
eq(current, [], "a touch on the shuffle button starts no word");
fire("pointerup", at([150, 150]));
// Taps of a word that is no answer: L, I, E build it; a tap on E again takes it back; the tick tries it.
for (const i of [1, 2, 3]) tapOn(i);
eq(current, ["l", "i", "e"], "taps build a word");
tapOn(3);
eq(current, ["l", "i"], "a tap on the last letter takes it back");
wheel.submit();
eq(words.at(-1), "li", "the tick tries the tapped word");
// Taps of an answer not found yet: taken on its last letter, without the tick, and lit for a moment.
open = new Set(["lie", "lieb", "bel"]);
const before = words.length;
for (const i of [1, 2, 3]) tapOn(i);
eq(words.slice(before), ["lie (taken)"], "a tapped answer is taken at once");
eq([current, lit], [["l", "i", "e"], true], "the taken word stays lit");
// While it is lit, a tap on B carries it on: LIEB is an answer too.
tapOn(4);
eq(words.slice(before), ["lie (taken)", "lieb (taken)"], "a longer word through a taken one is taken too");
runTimers();
eq([current, lit], [[], false], `the lit word clears by itself (after ${LINGER_MS} ms)`);
// The next word straight after a taken one: B E L, no extra tap.
open = new Set(["lie", "bel"]);
for (const i of [1, 2, 3]) tapOn(i);
tapOn(4);
eq(current, ["b"], "a letter that cannot carry the lit word on starts the next word");
tapOn(3);
tapOn(1);
eq(words.slice(-1), ["bel (taken)"], "the next word is taken without an extra tap");
runTimers();
// A swipe that starts while a word is lit makes its own word.
open = new Set(["lie"]);
for (const i of [1, 2, 3]) tapOn(i);
eq(lit, true, "LIE taken and lit");
fire("pointerdown", at(4));
fire("pointermove", at(3));
fire("pointermove", at(1));
fire("pointerup", at(1));
eq(words.at(-1), "bel", "a swipe after a taken word starts afresh");
// The tick while a taken word is lit only clears it; it says nothing.
open = new Set(["lie"]);
for (const i of [1, 2, 3]) tapOn(i);
const said = words.length;
wheel.submit();
eq([words.length, current], [said, []], "the tick on a taken word only clears it");
runTimers();
open = new Set();
// A screen reader's click without pointer events picks a letter.
fire("click", { target: tiles[4] });
eq(current, ["b"], "a click picks a letter");
wheel.clear();
// Keyboard: "c" picks CH when the wheel has no C.
wheel.type("c");
wheel.type("l");
eq(current, ["ch", "l"], "typing c picks CH");
wheel.pop();
eq(current, ["ch"], "Backspace takes a letter back");
wheel.clear();
eq(
  tiles.map((t) => t.attributes["aria-pressed"]),
  ["false", "false", "false", "false", "false"],
  "nothing chosen",
);

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else console.log(`ids: ${ids.size} in index.html, all found; wheel gestures: all checks passed`);
