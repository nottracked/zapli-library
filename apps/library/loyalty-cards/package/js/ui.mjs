// Shared pieces of the screens: building elements, the snackbar with Undo, sheets and questions as modal <dialog>s
// (the phone's Back closes an open dialog first), and haptics.

import { icon } from "./icons.mjs";

/** What every screen reads: the language, the store, navigation. Filled in by app.mjs at start. */
export const ctx = {
  lang: "en",
  locale: "en",
  t: (key) => key,
  store: null,
  go: () => {},
  back: () => {},
  replace: () => {},
  zapli: null,
  country: "int",
};

export const t = (key, values) => ctx.t(key, values);

/**
 * An element: h("button", {class: "x", onClick: fn, "aria-label": "…"}, child, …). `text` sets the text; attributes
 * with null or false are left out; children may be strings, nodes, arrays or null.
 */
export function h(tag, attrs = {}, ...children) {
  const el =
    tag === "svg" ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") el.textContent = value;
    else if (key === "class") el.className = value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value") el.value = value;
    else if (key === "checked") el.checked = Boolean(value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

/** A button with an optional icon; `kind` is filled, tonal, text or icon (an icon-only button needs `label`). */
export function button(label, onClick, kind = "filled", { iconName, id, disabled, extraClass } = {}) {
  const iconOnly = kind === "icon";
  return h(
    "button",
    {
      type: "button",
      id,
      class: `btn ${kind}${extraClass ? " " + extraClass : ""}`,
      onClick,
      disabled,
      "aria-label": iconOnly ? label : null,
      title: iconOnly ? label : null,
    },
    iconName ? icon(iconName) : null,
    iconOnly ? null : h("span", { class: "btn-label", text: label }),
  );
}

// ---------------------------------------------------------------- snackbar

let snackTimer = 0;

/** A message at the bottom of the screen; with `action` a button (Undo). It stays 7 s (10 s with a button), or until the screen changes. */
export function snack(text, action) {
  const bar = document.getElementById("snackbar");
  if (!bar) return;
  clearTimeout(snackTimer);
  bar.textContent = "";
  bar.appendChild(h("span", { class: "snack-text", text }));
  if (action) {
    bar.appendChild(
      h("button", {
        type: "button",
        class: "snack-action",
        text: action.label,
        onClick: () => {
          hideSnack();
          action.run();
        },
      }),
    );
  }
  bar.classList.add("on");
  snackTimer = setTimeout(hideSnack, action ? 10000 : 7000);
}

export function hideSnack() {
  const bar = document.getElementById("snackbar");
  if (!bar) return;
  clearTimeout(snackTimer);
  bar.classList.remove("on");
  bar.textContent = "";
}

// ---------------------------------------------------------------- dialogs

/**
 * A modal dialog: `build(close)` returns its content. `sheet` slides it up from the bottom; `full` fills the screen.
 * Returns a promise of the value `close` was called with (undefined when Back or the scrim closed it).
 */
export function dialog(build, { sheet = false, full = false, label = "", onClose } = {}) {
  return new Promise((resolve) => {
    const el = h("dialog", {
      class: "dialog" + (sheet ? " sheet" : "") + (full ? " full" : ""),
      "aria-label": label || null,
    });
    let result;
    const close = (value) => {
      result = value;
      if (el.open) el.close();
    };
    const body = h("div", { class: "dialog-body" });
    el.appendChild(body);
    append(body, [build(close)]);
    el.addEventListener("close", () => {
      el.remove();
      if (onClose) onClose(result);
      resolve(result);
    });
    // A tap on the scrim (outside the panel) closes it.
    el.addEventListener("click", (e) => {
      if (e.target === el) close();
    });
    document.body.appendChild(el);
    el.showModal();
    const focus = el.querySelector("[autofocus]");
    if (focus) focus.focus();
  });
}

/** A yes/no question; resolves true for the confirming button. */
export function confirmDialog({ title, body, yes, no = t("cancel"), danger = false }) {
  return dialog(
    (close) =>
      h(
        "div",
        { class: "ask" },
        h("h2", { class: "ask-title", text: title }),
        body ? h("p", { class: "ask-body", text: body }) : null,
        h(
          "div",
          { class: "ask-buttons" },
          button(no, () => close(false), "text"),
          button(yes, () => close(true), danger ? "filled danger" : "filled"),
        ),
      ),
    { label: title },
  ).then(Boolean);
}

/** A header for a screen: Back (or Close), the title, and buttons at the end. */
export function topBar({ title, onBack, backIcon = "back", backLabel, actions = [], large = false }) {
  return h(
    "header",
    { class: "topbar" + (large ? " large" : "") },
    onBack ? button(backLabel || t("back"), onBack, "icon", { iconName: backIcon }) : null,
    h("h1", { class: "topbar-title", text: title }),
    h("div", { class: "topbar-actions" }, actions),
  );
}

// ---------------------------------------------------------------- haptics

/** A short vibration for a card added or saved, when the user keeps vibration on and the phone can. */
export function buzz(kind = "success") {
  const zapli = ctx.zapli;
  if (!ctx.store || ctx.store.ui.vibrate === false) return;
  try {
    if (zapli && zapli.supports && zapli.supports("haptics.impact")) zapli.haptics.impact(kind).catch(() => {});
    else if (navigator.vibrate) navigator.vibrate(kind === "light" ? 10 : 25);
  } catch {
    // No vibration on this phone.
  }
}

/** Dates as the phone's language writes them: "15 Oct 2026", "15. 10. 2026". */
export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(String(iso).length === 10 ? iso + "T12:00:00" : iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(ctx.locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatNumber(n) {
  try {
    return new Intl.NumberFormat(ctx.locale, { maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
}
