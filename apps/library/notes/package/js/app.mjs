// Start-up, the language, the screens and their routes. Each screen is a hash route (#/note/<id>, #/archive) so
// Back, a reload after rotation and shortcuts all land where they should.

import { store } from "./store.mjs";
import { ctx, h, t, swipeAwaySnack, hideSnack } from "./ui.mjs";
import { translator, pickLanguage, localeFor } from "./i18n.mjs";
import * as home from "./screens/home.mjs";
import * as search from "./screens/search.mjs";
import * as editor from "./screens/editor.mjs";
import * as labels from "./screens/labels.mjs";
import * as settings from "./screens/settings.mjs";

// Route → screen. Top-level views (the notes, a label, reminders, archive, trash) replace each other; leaving the
// notes pushes, so Back from any of them returns to the notes first.
const ROUTES = [
  [/^$/, home, true],
  [/^label\/(.+)$/, home, true],
  [/^reminders$/, home, true],
  [/^archive$/, home, true],
  [/^trash$/, home, true],
  [/^search$/, search, false],
  [/^note\/(.+)$/, editor, false],
  [/^new(?:\/(list))?$/, editor, false],
  [/^labels$/, labels, false],
  [/^settings$/, settings, false],
];

const main = document.getElementById("main");
const scrolls = new Map();
let current = null;

/** The route of a hash: {path, name, id, params, screen, top}. */
export function parseRoute(hash) {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  let clean = path.replace(/\/+$/, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // A broken escape: the path as written.
  }
  for (const [pattern, screen, top] of ROUTES) {
    const match = pattern.exec(clean);
    if (match) {
      return {
        path: clean,
        name: clean.split("/")[0],
        id: match[1] || null,
        params: new URLSearchParams(query),
        screen,
        top,
      };
    }
  }
  return { path: "", name: "", id: null, params: new URLSearchParams(), screen: home, top: true };
}

function depth() {
  return (history.state && history.state.depth) || 0;
}

/** Opens a route: other screens are pushed, so Back returns; top-level views replace each other. */
function go(hash, { replace = false } = {}) {
  const target = parseRoute(hash);
  const here = current;
  if (
    here &&
    !replace &&
    here.top &&
    target.top &&
    target.path === "" &&
    here.path !== "" &&
    depth() > 0 &&
    !(history.state && history.state.select)
  ) {
    history.back();
    return;
  }
  if (here) scrolls.set(here.path, window.scrollY);
  const push = !replace && !(here && here.top && target.top && here.path !== "");
  if (push) history.pushState({ depth: depth() + 1 }, "", hash);
  else history.replaceState({ depth: depth() }, "", hash);
  render(false);
}

/** Back from a pushed screen: through the page's history, else to the notes. */
function back() {
  if (depth() > 0) history.back();
  else go("#/", { replace: true });
}

/** Whether a screen keeps itself when the data changes (an editor, a search field). */
function keeps(route) {
  const keep = route.screen.keep;
  return typeof keep === "function" ? keep(route) : Boolean(keep);
}

/**
 * Draws the screen of the current hash. `again` is a redraw after a data change: it keeps the scroll position, and
 * a screen that keeps itself only updates. `force` draws it anew all the same.
 */
function render(again = false, force = false) {
  const route = parseRoute(location.hash);
  const same = Boolean(current && current.path === route.path && current.params.toString() === route.params.toString());
  if (again && same && keeps(route) && !force) {
    if (route.screen.update) route.screen.update(route);
    return;
  }
  if (
    current &&
    (!same || force || !again) &&
    current.screen.leave &&
    (current.screen !== route.screen || current.path !== route.path || force)
  ) {
    current.screen.leave();
  }
  if (!again) hideSnackOnNewScreen(route);
  const y = again && same ? window.scrollY : scrolls.get(route.path) || 0;
  current = route;
  let node;
  try {
    node = route.screen.render(route);
  } catch (error) {
    console.error(error);
    node = h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "empty" },
        h("h2", { class: "empty-title", text: t("somethingWrong") }),
        h("p", { class: "empty-text", text: t("somethingWrongText") }),
      ),
    );
  }
  main.textContent = "";
  main.appendChild(node);
  document.title = t("appName");
  window.scrollTo(0, y);
  if (route.screen.after) route.screen.after(node, route);
}

let lastPath = null;
/** A message about another screen goes when the user moves on, but an Undo for what was just done stays. */
function hideSnackOnNewScreen(route) {
  if (
    lastPath !== null &&
    lastPath !== route.path &&
    route.name !== "note" &&
    route.name !== "new" &&
    lastPath.split("/")[0] !== "note" &&
    lastPath.split("/")[0] !== "new"
  )
    hideSnack();
  lastPath = route.path;
}

function applyLanguage() {
  const zapli = window.zapli;
  let phone = navigator.language || "en";
  try {
    if (zapli && zapli.app && zapli.app.locale) phone = zapli.app.locale() || phone;
  } catch {
    // The browser's language is good enough.
  }
  ctx.lang = pickLanguage(store.ui.lang, phone);
  ctx.locale = localeFor(ctx.lang, phone);
  ctx.t = translator(ctx.lang);
  document.documentElement.lang = ctx.lang;
}

/** The note text size setting and the like, as classes on the page. */
function applyLook() {
  const root = document.documentElement;
  root.dataset.textSize = store.ui.textSize || "normal";
}

async function start() {
  ctx.store = store;
  ctx.go = (hash) => go(hash);
  ctx.replace = (hash) => go(hash, { replace: true });
  ctx.back = back;
  ctx.route = () => current || parseRoute(location.hash);
  ctx.refresh = (force = false) => render(true, force);
  ctx.syncRoute = () => {
    current = parseRoute(location.hash);
  };
  ctx.zapli = window.zapli || null;
  applyLanguage();
  main.appendChild(
    h(
      "div",
      { class: "loading", role: "status" },
      h("span", { class: "spinner", "aria-hidden": "true" }),
      h("span", { text: t("loading") }),
    ),
  );
  try {
    await store.open(ctx.lang);
  } catch {
    applyLanguage();
    main.textContent = "";
    main.appendChild(
      h(
        "div",
        { class: "empty" },
        h("h2", { class: "empty-title", text: t("couldNotLoad") }),
        h("p", { class: "empty-text", text: t("couldNotLoadText") }),
        h("button", { class: "btn filled", type: "button", text: t("tryAgain"), onClick: () => location.reload() }),
      ),
    );
    return;
  }
  applyLanguage();
  applyLook();
  if (store.live) {
    try {
      ctx.appInfo = await ctx.zapli.app.info();
    } catch {
      ctx.appInfo = null;
    }
  }
  document.body.classList.toggle("preview", !store.live);

  // A fresh start (not a reload after rotation): count it, and open a new note when the user asked for that.
  let fresh = true;
  try {
    fresh = !sessionStorage.getItem("notes-open");
    sessionStorage.setItem("notes-open", "1");
  } catch {
    fresh = true;
  }
  if (fresh) store.saveUi({ starts: (store.ui.starts || 0) + 1 });
  if (!history.state) history.replaceState({ depth: 0 }, "", location.hash || "#/");
  if (fresh && store.ui.startNew && parseRoute(location.hash).path === "") {
    history.replaceState({ depth: 0 }, "", "#/");
    history.pushState({ depth: 1 }, "", "#/new");
  }

  store.on(() => {
    const lang = ctx.lang;
    applyLanguage();
    applyLook();
    render(true, lang !== ctx.lang);
  });
  window.addEventListener("popstate", () => render(false));
  window.addEventListener("hashchange", () => {
    if (!current || parseRoute(location.hash).path !== current.path) render(false);
  });
  window.addEventListener("resize", () => {
    if (current && current.screen.resize) current.screen.resize(main.firstChild);
  });
  const pause = () => {
    if (current && current.screen.pause) current.screen.pause();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pause();
  });
  try {
    if (ctx.zapli && ctx.zapli.app) ctx.zapli.app.on("pause", pause);
  } catch {
    // The page's own visibility event covers it.
  }
  swipeAwaySnack();
  render(false);
  // Photos of notes the trash deleted by itself go, once the screen is up.
  setTimeout(() => store.sweepPhotos(), 3000);
  // A new day (the page left open over midnight) redraws "today" and "yesterday".
  let day = new Date().toDateString();
  setInterval(() => {
    if (new Date().toDateString() !== day) {
      day = new Date().toDateString();
      render(true);
    }
  }, 60000);
}

start();
