// Search: every word typed must appear in a note's title, text, items or labels, with or without accents
// ("cesta" finds "cesťa"). Filters for checklists, reminders, photos, pinned notes, a label or a colour narrow it.
// Archived notes are searched too and say so; the trash is not. The words and filters live in the address, so Back
// from a note returns to the same results.

import { ctx, h, t, iconButton, chip } from "../ui.mjs";
import { icon } from "../icons.mjs";
import { illustration } from "../illus.mjs";
import { noteCard, watchGrid } from "../cards.mjs";
import { searchTerms, noteMatches, sortNotes, sameLabel, COLORS } from "../model.mjs";
import { swatches } from "../actions.mjs";

const TYPES = [
  ["list", "checklist", "typeLists"],
  ["reminder", "bell", "typeReminders"],
  ["photo", "image", "typePhotos"],
  ["pinned", "pin", "typePinned"],
];

let state = { q: "", type: "", label: "", color: "" };
let dom = {};
let stopGrid = () => {};
let timer = null;

function fromRoute(route) {
  const p = route.params;
  return {
    q: p.get("q") || "",
    type: TYPES.some(([id]) => id === p.get("type")) ? p.get("type") : "",
    label: p.get("label") || "",
    color: COLORS.includes(p.get("color")) ? p.get("color") : "",
  };
}

/** Writes the words and filters into the address without a new history entry. */
function keepInAddress() {
  const p = new URLSearchParams();
  for (const k of ["q", "type", "label", "color"]) if (state[k]) p.set(k, state[k]);
  const hash = "#/search" + (p.toString() ? "?" + p.toString() : "");
  if (location.hash !== hash) {
    history.replaceState(history.state, "", hash);
    ctx.syncRoute();
  }
}

function filtered() {
  const terms = searchTerms(state.q);
  const list = ctx.store.all.filter((n) => {
    if (n.trashedAt) return false;
    if (state.type === "list" && n.kind !== "list") return false;
    if (state.type === "reminder" && !n.remindAt) return false;
    if (state.type === "photo" && !n._photos.length) return false;
    if (state.type === "pinned" && !n.pinned) return false;
    if (state.label && !n._labels.some((l) => sameLabel(l, state.label))) return false;
    if (state.color && (n.color || "none") !== state.color) return false;
    return noteMatches(n, terms);
  });
  return { terms, list: sortNotes(list, ctx.store.ui.sort || "edited", ctx.locale) };
}

function active() {
  return Boolean(state.q.trim() || state.type || state.label || state.color);
}

function setFilter(patch) {
  state = { ...state, ...patch };
  keepInAddress();
  draw();
}

function filterPanel() {
  const labels = ctx.store.labels;
  return h(
    "div",
    { class: "filters" },
    h("h2", { class: "section-title", text: t("searchTypes") }),
    h(
      "div",
      { class: "type-grid" },
      TYPES.map(([id, iconName, key]) =>
        h(
          "button",
          { type: "button", class: "type-tile", onClick: () => setFilter({ type: id }) },
          h("span", { class: "type-icon" }, icon(iconName)),
          h("span", { class: "type-text", text: t(key) }),
        ),
      ),
    ),
    labels.length ? h("h2", { class: "section-title", text: t("labels") }) : null,
    labels.length
      ? h(
          "div",
          { class: "chip-row wrap" },
          labels.map((name) => chip(name, false, () => setFilter({ label: name }), "label")),
        )
      : null,
    h("h2", { class: "section-title", text: t("colours") }),
    swatches(null, (color) => setFilter({ color })),
  );
}

function activeChips() {
  const chips = [];
  if (state.type) {
    const [, iconName, key] = TYPES.find(([id]) => id === state.type);
    chips.push(chip(t(key), true, () => setFilter({ type: "" }), iconName, { class: "removable" }));
  }
  if (state.label) chips.push(chip(state.label, true, () => setFilter({ label: "" }), "label", { class: "removable" }));
  if (state.color) {
    chips.push(
      chip(
        t("color_" + state.color),
        true,
        () => setFilter({ color: "" }),
        h("span", { class: "dot tint-" + state.color }),
        {
          class: "removable",
        },
      ),
    );
  }
  if (!chips.length) return null;
  for (const c of chips) {
    c.appendChild(icon("close"));
    c.setAttribute("aria-label", t("removeFilter", { name: c.textContent }));
  }
  return h("div", { class: "chip-row wrap active-filters" }, chips);
}

/** Draws the results (or the filter panel) under the search field. */
function draw() {
  if (!dom.results) return;
  stopGrid();
  stopGrid = () => {};
  dom.results.textContent = "";
  dom.clear.hidden = !state.q;
  if (!active()) {
    dom.results.appendChild(filterPanel());
    dom.status.textContent = "";
    return;
  }
  const chips = activeChips();
  if (chips) dom.results.appendChild(chips);
  const { terms, list } = filtered();
  dom.status.textContent = t("resultCount", { n: list.length });
  if (!list.length) {
    dom.results.appendChild(
      h(
        "div",
        { class: "empty" },
        illustration("search"),
        h("h2", { class: "empty-title", text: state.q.trim() ? t("noMatchFor", { q: state.q.trim() }) : t("noMatch") }),
        h("p", { class: "empty-text", text: t("noMatchText") }),
      ),
    );
    return;
  }
  dom.results.appendChild(h("p", { class: "count-text pad-x", text: t("resultCount", { n: list.length }) }));
  const view = ctx.store.ui.view === "list" ? "list" : "grid";
  const grid = h(
    "div",
    { class: "masonry " + view },
    list.map((note) =>
      noteCard(note, {
        terms,
        mode: "search",
        view,
        onOpen: (n) => ctx.go("#/note/" + n.id),
      }),
    ),
  );
  dom.results.appendChild(grid);
  stopGrid = watchGrid(grid);
}

export function render(route) {
  state = fromRoute(route);
  const input = h("input", {
    type: "search",
    class: "search-input",
    value: state.q,
    placeholder: t("searchNotes"),
    "aria-label": t("searchNotes"),
    autocomplete: "off",
    enterkeyhint: "search",
    spellcheck: "false",
  });
  input.addEventListener("input", () => {
    state.q = input.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      keepInAddress();
      draw();
    }, 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
  const clear = iconButton("close", t("clearSearch"), () => {
    input.value = "";
    state.q = "";
    keepInAddress();
    draw();
    input.focus();
  });
  const results = h("div", { class: "content search-results" });
  const status = h("p", { class: "visually-hidden", role: "status", "aria-live": "polite" });
  dom = { input, clear, results, status };
  const screen = h(
    "div",
    { class: "screen search" },
    h(
      "header",
      { class: "bar search-bar" },
      iconButton("back", t("back"), () => ctx.back()),
      h("div", { class: "search-field" }, icon("search"), input, clear),
    ),
    status,
    results,
  );
  draw();
  return screen;
}

/** After the screen is on the page: the keyboard opens for a new search. */
export function after() {
  if (dom.input && !active()) dom.input.focus();
}

/** The field keeps its text and cursor while notes change; only the results are drawn again. */
export function keep() {
  return true;
}

export function update() {
  draw();
}

export function leave() {
  stopGrid();
  stopGrid = () => {};
  clearTimeout(timer);
  dom = {};
}
