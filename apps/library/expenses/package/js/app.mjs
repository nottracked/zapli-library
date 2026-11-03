// Start-up, the language, the screens and their routes. Each screen is a hash route (#/entries, #/edit/<id>) so
// Back, a reload after rotation and links from notifications all land where they should.

import { store } from "./store.mjs";
import { ctx, h, t } from "./ui.mjs";
import { translator, pickLanguage, localeFor } from "./i18n.mjs";
import { decimalMark } from "./money.mjs";
import { today } from "./dates.mjs";
import { icon } from "./icons.mjs";
import * as home from "./screens/home.mjs";
import * as entries from "./screens/entries.mjs";
import * as editor from "./screens/editor.mjs";
import * as stats from "./screens/stats.mjs";
import * as calendar from "./screens/calendar.mjs";
import * as budgets from "./screens/budgets.mjs";
import * as accounts from "./screens/accounts.mjs";
import * as recurring from "./screens/recurring.mjs";
import * as subscriptions from "./screens/subscriptions.mjs";
import * as settings from "./screens/settings.mjs";
import * as categories from "./screens/categories.mjs";
import * as importer from "./screens/importer.mjs";

const TABS = [
  ["", "home", "tabHome"],
  ["entries", "list", "tabEntries"],
  ["stats", "chart", "tabStats"],
  ["budgets", "budget", "tabBudgets"],
  ["accounts", "wallet", "tabAccounts"],
];

// Route → screen. A screen module's render(route) returns the screen's element.
const ROUTES = [
  [/^$/, home],
  [/^entries$/, entries],
  [/^stats$/, stats],
  [/^budgets$/, budgets],
  [/^accounts$/, accounts],
  [/^add$/, editor],
  [/^edit\/(.+)$/, editor],
  [/^calendar$/, calendar],
  [/^account\/(.+)$/, accounts],
  [/^account-edit\/(.+)$/, accounts],
  [/^recurring$/, recurring],
  [/^rule\/(.+)$/, recurring],
  [/^subscriptions$/, subscriptions],
  [/^settings$/, settings],
  [/^currencies$/, settings],
  [/^categories$/, categories],
  [/^category\/(.+)$/, categories],
  [/^import$/, importer],
];

// Where a pushed screen goes back to when it was opened directly (after a reload or from a notification).
const PARENTS = {
  add: "",
  edit: "entries",
  calendar: "entries",
  account: "accounts",
  "account-edit": "accounts",
  recurring: "budgets",
  rule: "recurring",
  subscriptions: "budgets",
  settings: "",
  currencies: "settings",
  categories: "settings",
  category: "categories",
  import: "settings",
};

const main = document.getElementById("main");
const nav = document.getElementById("tabs");
const scrolls = new Map();
let current = null;

/** The route of a hash: {path, id, params, name, tab}. */
export function parseRoute(hash) {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const clean = decodeURIComponent(path.replace(/\/+$/, ""));
  for (const [pattern, screen] of ROUTES) {
    const match = pattern.exec(clean);
    if (match) {
      return {
        path: clean,
        id: match[1] || null,
        params: new URLSearchParams(query),
        name: clean.split("/")[0],
        screen,
        tab: TABS.some(([p]) => p === clean),
      };
    }
  }
  return { path: "", id: null, params: new URLSearchParams(), name: "", screen: home, tab: true };
}

function depth() {
  return (history.state && history.state.depth) || 0;
}

/**
 * Opens a route. Other screens are pushed, so Back returns; tabs replace each other, except that leaving Home pushes
 * (Back from a tab goes Home first) and opening Home goes back to it.
 */
function go(hash, { replace = false } = {}) {
  const target = parseRoute(hash);
  const here = current;
  if (here) scrolls.set(here.path, window.scrollY);
  const deeper = !replace && !(target.tab && here && here.tab);
  if (here && here.screen !== target.screen && here.screen.leave) here.screen.leave({ deeper });
  if (!replace && target.tab && target.path === "" && here && here.tab && depth() > 0) {
    history.back();
    return;
  }
  const push = !replace && (!target.tab || !here || !here.tab || here.path === "");
  if (push) history.pushState({ depth: depth() + 1 }, "", hash);
  else history.replaceState({ depth: depth() }, "", hash);
  render(false, true);
}

/** Back from a pushed screen: through the page's history, else to the screen it belongs to. */
function back() {
  if (depth() > 0) history.back();
  else go("#/" + (PARENTS[current ? current.name : ""] || ""), { replace: true });
}

function renderNav(route) {
  nav.textContent = "";
  nav.hidden = !route.tab;
  nav.setAttribute("aria-label", t("sections"));
  for (const [path, iconName, key] of TABS) {
    const on = route.path === path;
    nav.appendChild(
      h(
        "a",
        {
          href: "#/" + path,
          class: "tab" + (on ? " on" : ""),
          "aria-current": on ? "page" : null,
          onClick: (e) => {
            e.preventDefault();
            if (!on) go("#/" + path);
          },
        },
        h("span", { class: "tab-icon" }, icon(iconName)),
        h("span", { class: "tab-label", text: t(key) }),
      ),
    );
  }
}

/** Whether a screen keeps itself when the data changes (a form the user is typing in). */
function keeps(route) {
  const keep = route.screen.keep;
  return typeof keep === "function" ? keep(route) : Boolean(keep);
}

/**
 * Fits the tab labels on one line each: at a large text size they shrink together (to 45 % at most, about the normal size at a doubled text size) instead of
 * breaking a word, and what still does not fit ends in "…". Then the tab bar's real height goes to --tabs-h, which
 * keeps the Add button, the snackbar and the end of each screen above the bar at every text size.
 */
function fitTabs() {
  const root = document.documentElement;
  if (nav.hidden) return;
  const labels = [...nav.querySelectorAll(".tab-label")];
  const tooWide = () => labels.some((l) => l.scrollWidth > l.clientWidth + 1);
  let scale = 1;
  for (const l of labels) l.style.fontSize = "";
  while (labels.length && tooWide() && scale > 0.45) {
    scale = Math.round((scale - 0.05) * 100) / 100;
    for (const l of labels) l.style.fontSize = scale + "em";
  }
  if (typeof nav.offsetHeight === "number" && nav.offsetHeight > 0)
    root.style.setProperty("--tabs-h", nav.offsetHeight + "px");
}

/** The Add button's real height, so a snackbar shows above it rather than over it. */
function measureFab() {
  const fab = main.querySelector(".fab");
  const height = fab && typeof fab.offsetHeight === "number" ? fab.offsetHeight : 0;
  document.documentElement.style.setProperty("--fab-h", height + "px");
}

/** Draws the screen of the current hash. `again` is a redraw after a data change: it keeps the scroll position. */
function render(again = false, viaGo = false) {
  ctx.today = today();
  const route = parseRoute(location.hash);
  const same = Boolean(current && current.path === route.path && again);
  if (same && keeps(route)) return;
  // Back (or a link from outside) leaves a screen without go(): its typed values are dropped.
  if (!again && !viaGo && current && current.screen !== route.screen && current.screen.leave)
    current.screen.leave({ deeper: false });
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
  document.body.classList.toggle("with-tabs", route.tab);
  renderNav(route);
  fitTabs();
  measureFab();
  document.title = t("appName");
  window.scrollTo(0, y);
  if (!same) main.focus({ preventScroll: true });
}

function applyLanguage() {
  const zapli = window.zapli;
  let phone = navigator.language || "en";
  try {
    if (zapli && zapli.app && zapli.app.locale) phone = zapli.app.locale() || phone;
  } catch {
    // The phone's language from the browser is good enough.
  }
  ctx.lang = pickLanguage(store.ui.lang, phone);
  ctx.locale = localeFor(ctx.lang, phone);
  ctx.mark = decimalMark(ctx.locale);
  ctx.t = translator(ctx.lang);
  document.documentElement.lang = ctx.lang;
}

/** Fills in what an install without its setup still lacks: preferences, accounts and categories. */
async function setUpWhenNeeded() {
  if (!store.live || store.prefs) return;
  try {
    await store.run("setUp");
  } catch {
    // The page still works; the next start tries again.
  }
}

/** Adds recurring entries that fell due while the phone was off, in case the background job has not run yet. */
async function postDueRules() {
  if (!store.live) return;
  const due = store.rules.some((r) => r.active && r.mode === "auto" && r.nextDue <= ctx.today);
  if (!due) return;
  try {
    await store.run("postDue");
  } catch {
    // The midnight job adds them later.
  }
}

async function start() {
  ctx.store = store;
  ctx.go = go;
  ctx.back = back;
  ctx.zapli = window.zapli || null;
  ctx.today = today();
  applyLanguage();
  main.appendChild(h("p", { class: "loading", role: "status", text: t("loading") }));
  try {
    await store.open();
  } catch (error) {
    applyLanguage();
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
  if (!history.state) history.replaceState({ depth: 0 }, "", location.hash || "#/");
  store.on(() => {
    applyLanguage();
    render(true);
  });
  window.addEventListener("popstate", () => render());
  window.addEventListener("resize", () => {
    fitTabs();
    measureFab();
  });
  window.addEventListener("hashchange", () => render());
  render();
  await setUpWhenNeeded();
  await postDueRules();
  // A new day (the page left open over midnight) redraws today's numbers.
  setInterval(() => {
    if (today() !== ctx.today) render(true);
  }, 60000);
  if (!store.live) document.body.classList.add("preview");
}

start();
