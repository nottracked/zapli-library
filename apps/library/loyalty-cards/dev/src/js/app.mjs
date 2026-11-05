// Start-up, the language and the screens with their routes. Each screen is a hash route (#/card/<id>, #/add) so
// the phone's Back, a reload after rotation and the home-screen shortcuts land where they should.

import { countryFor } from "./brands.mjs";
import { pickLanguage, translator } from "./i18n.mjs";
import { store } from "./store.mjs";
import { ctx, followKeyboard, h, hideSnack, t } from "./ui.mjs";
import * as wallet from "./screens/wallet.mjs";
import * as add from "./screens/add.mjs";
import * as card from "./screens/card.mjs";
import * as edit from "./screens/edit.mjs";
import * as settings from "./screens/settings.mjs";

const ROUTES = [
  [/^$/, wallet],
  [/^add$/, add],
  [/^card\/(.+)$/, card],
  [/^edit\/(.+)$/, edit],
  [/^settings$/, settings],
  [/^archived$/, settings],
];

const main = document.getElementById("main");
let current = null;
const scrolls = new Map();

/** The route of a hash: {path, id, params, name, screen}. */
export function parseRoute(hash) {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const clean = decodeURIComponent(path.replace(/\/+$/, ""));
  for (const [pattern, screen] of ROUTES) {
    const match = pattern.exec(clean);
    if (match)
      return {
        path: clean,
        id: match[1] || null,
        params: new URLSearchParams(query),
        name: clean.split("/")[0],
        screen,
      };
  }
  return { path: "", id: null, params: new URLSearchParams(), name: "", screen: wallet };
}

// ---------------------------------------------------------------- Back
//
// Each screen opened by a tap gets a history entry of its own, holding the path to it (`stack`) and how many entries
// lie above the wallet (`depth`), so the phone's Back goes one screen back and leaves the app from the wallet. Entries
// are added during a tap: Chromium lets Back skip an entry a page added before it was first touched. A screen reached
// after the scanner or the photo picker (no tap any more) takes the place of the one that opened them instead.
//
// A rotation, a dark-mode switch or a new text size makes the phone load the page again at its address, with nothing
// behind it. At start, the way there is laid down again (the wallet, then each screen above it), so Back still goes
// to the wallet. Until the page is first touched after such a load, Chromium may skip those entries, and a Back
// before any touch can still leave the app.

function chainFor(hash) {
  const route = parseRoute(hash);
  if (route.path === "") return ["#/"];
  if (route.name === "edit") return ["#/", "#/card/" + route.id, hash];
  if (route.name === "archived") return ["#/", "#/settings", hash];
  return ["#/", hash];
}

function currentStack() {
  return (history.state && history.state.stack) || chainFor(location.hash || "#/");
}

function depth() {
  return (history.state && history.state.depth) || 0;
}

/** A page loaded at a screen with no history of its own: the wallet below it, then the screens up to it. */
function layDownPath() {
  const chain = chainFor(location.hash || "#/");
  history.replaceState({ stack: chain.slice(0, 1), depth: 0 }, "", chain[0]);
  for (let i = 1; i < chain.length; i++) history.pushState({ stack: chain.slice(0, i + 1), depth: i }, "", chain[i]);
}

let ownStep = false;

/** Opens a screen on top of this one (from a tap). */
function go(hash) {
  hideSnack();
  if (current) scrolls.set(current.path, window.scrollY);
  const target = parseRoute(hash);
  if (target.path === "") {
    if (depth() > 0) {
      ownStep = true;
      history.go(-depth());
      return;
    }
    history.replaceState({ stack: ["#/"], depth: 0 }, "", "#/");
  } else {
    leaveCurrent(target);
    history.pushState({ stack: [...currentStack(), hash], depth: depth() + 1 }, "", hash);
  }
  render();
}

/** Shows a screen in the place of this one (after the scanner or a picker, or a swipe to the next card). */
function replace(hash, { quiet = false } = {}) {
  const stack = currentStack();
  const target = parseRoute(hash);
  if (!quiet) leaveCurrent(target);
  history.replaceState({ stack: [...stack.slice(0, -1), hash], depth: depth() }, "", hash);
  if (!quiet) render();
}

/** The back arrow: the same step as the phone's Back; without an entry below, the screen's parent takes its place. */
function back() {
  hideSnack();
  if (depth() > 0) {
    ownStep = true;
    history.back();
    return;
  }
  const stack = currentStack();
  const next = stack.length > 1 ? stack.slice(0, -1) : ["#/"];
  leaveCurrent(parseRoute(next[next.length - 1]));
  history.replaceState({ stack: next, depth: 0 }, "", next[next.length - 1]);
  render();
}

function leaveCurrent(target) {
  if (current && current.screen.leave && current.screen !== target.screen) current.screen.leave();
}

function onPopState() {
  if (ownStep) ownStep = false;
  else hideSnack();
  const target = parseRoute(location.hash);
  leaveCurrent(target);
  render();
}

// ---------------------------------------------------------------- drawing

/** Draws the screen of the current hash; `again` is a redraw after a change of data. */
function render(again = false) {
  const route = parseRoute(location.hash);
  const same = Boolean(current && current.path === route.path);
  if (again && same && route.screen.refresh) {
    route.screen.refresh(route);
    return;
  }
  if (again && same && route.screen.keep) return;
  const y = same ? window.scrollY : scrolls.get(route.path) || 0;
  current = route;
  let node;
  try {
    node = route.screen.render(route);
  } catch (error) {
    console.error(error);
    node = h(
      "div",
      { class: "empty" },
      h("h2", { text: t("somethingWrong") }),
      h("p", { text: String(error && error.message) }),
    );
  }
  main.textContent = "";
  main.appendChild(node);
  if (route.screen.mounted) route.screen.mounted(route);
  document.title = t("appName");
  window.scrollTo(0, y);
  if (!same) main.focus({ preventScroll: true });
}

/** How much larger than normal the phone draws text, so faces and grids make room at large text sizes. */
function measureTextScale() {
  const probe = h("span", {
    style: { position: "absolute", visibility: "hidden", fontSize: "16px", lineHeight: "1" },
    text: "M",
  });
  document.body.appendChild(probe);
  const scale = probe.getBoundingClientRect().height / 16 || 1;
  probe.remove();
  document.documentElement.classList.toggle("big-text", scale >= 1.45);
  document.documentElement.classList.toggle("huge-text", scale >= 1.8);
}

function applyLanguage() {
  let phone = navigator.language || "en";
  try {
    if (ctx.zapli && ctx.zapli.app && ctx.zapli.app.locale) phone = ctx.zapli.app.locale() || phone;
  } catch {
    // The browser's language is good enough.
  }
  ctx.lang = pickLanguage(store.ui.lang, phone);
  ctx.locale = ctx.lang === "sk" ? "sk-SK" : String(phone).startsWith("en") ? phone : "en-GB";
  ctx.t = translator(ctx.lang);
  ctx.country = store.ui.country && store.ui.country !== "auto" ? store.ui.country : countryFor(phone);
  document.documentElement.lang = ctx.lang;
}

async function start() {
  ctx.store = store;
  ctx.go = go;
  ctx.back = back;
  ctx.replace = replace;
  ctx.zapli = window.zapli || null;
  applyLanguage();
  main.appendChild(h("p", { class: "loading", role: "status", text: t("loading") }));
  try {
    await store.open();
  } catch (error) {
    console.error(error);
    main.textContent = "";
    main.appendChild(
      h(
        "div",
        { class: "empty" },
        h("h2", { text: t("couldNotLoad") }),
        h("p", { text: t("couldNotLoadHelp") }),
        h("button", { class: "btn filled", type: "button", text: t("tryAgain"), onClick: () => location.reload() }),
      ),
    );
    return;
  }
  applyLanguage();
  measureTextScale();
  followKeyboard();
  if (!history.state || !history.state.stack) layDownPath();
  store.on(() => {
    applyLanguage();
    render(true);
  });
  window.addEventListener("popstate", onPopState);
  window.addEventListener("resize", () => {
    measureTextScale();
    if (current && current.screen.resized) current.screen.resized();
  });
  // An address typed into a browser shows that screen in place of this one: no entry may be added without a tap.
  window.addEventListener("hashchange", () => {
    const stack = currentStack();
    if (location.hash !== stack[stack.length - 1]) replace(location.hash || "#/");
  });
  if (ctx.zapli && ctx.zapli.app) {
    ctx.zapli.app.on("pause", () => current && current.screen.paused && current.screen.paused());
    ctx.zapli.app.on("resume", () => current && current.screen.resumed && current.screen.resumed());
  }
  document.addEventListener("visibilitychange", () => {
    if (!current) return;
    if (document.visibilityState === "hidden" && current.screen.paused) current.screen.paused();
    if (document.visibilityState === "visible" && current.screen.resumed) current.screen.resumed();
  });
  render();
  if (!store.live) document.body.classList.add("preview");
}

start();
