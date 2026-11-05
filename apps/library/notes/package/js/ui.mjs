// Building blocks of the screens: the element helper, the shared context (language, formats, navigation), buttons,
// dialogs and bottom sheets that Back closes, menus, the snackbar with Undo, switches and the vibration.

import { icon } from "./icons.mjs";

/** What every screen needs; filled in by app.mjs at start and when the language changes. */
export const ctx = {
  store: null,
  t: (key) => key,
  lang: "en",
  locale: "en-GB",
  go: () => {},
  back: () => {},
  replace: () => {},
  zapli: null,
  now: () => new Date(),
};

/**
 * Makes an element. props: class, text, style (an object), on<Event> handlers, value, checked, and attributes by
 * name; null, undefined and false leave a prop out. Children: nodes, text or arrays of them; null and false are
 * skipped. Text always goes in as text, never as markup.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "style") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value") el.value = value;
    else if (key === "checked") el.checked = value;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

/** Adds children to an element, skipping null and false. */
export function put(el, ...children) {
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function t(key, params) {
  return ctx.t(key, params);
}

/** A button that shows only an icon, named for screen readers (and as a tooltip). */
export function iconButton(name, label, onClick, extra = {}) {
  return h(
    "button",
    {
      class: "icon-button " + (extra.class || ""),
      type: "button",
      "aria-label": label,
      title: label,
      "aria-pressed": extra.pressed === undefined ? null : String(Boolean(extra.pressed)),
      disabled: extra.disabled || null,
      onClick,
    },
    icon(name),
  );
}

/** A text button; kind is filled, tonal, outlined, text or danger. */
export function button(text, onClick, kind = "filled", extra = {}) {
  return h(
    "button",
    {
      class: "btn " + kind + " " + (extra.class || ""),
      type: "button",
      onClick,
      disabled: extra.disabled || null,
      "aria-label": extra.label || null,
    },
    extra.icon ? icon(extra.icon) : null,
    h("span", { class: "btn-text", text }),
  );
}

/** A selectable chip with an optional leading icon. */
export function chip(text, selected, onClick, lead = null, extra = {}) {
  return h(
    "button",
    {
      type: "button",
      class: "chip" + (selected ? " on" : "") + " " + (extra.class || ""),
      "aria-pressed": selected === null ? null : String(Boolean(selected)),
      onClick,
    },
    lead ? (typeof lead === "string" ? icon(lead) : lead) : null,
    h("span", { class: "chip-text", text }),
  );
}

/** A switch row with its text and help. */
export function toggle(label, checked, onChange, help) {
  const input = h("input", {
    type: "checkbox",
    role: "switch",
    checked,
    onChange: (e) => onChange(e.target.checked),
  });
  return h(
    "label",
    { class: "toggle" },
    h(
      "span",
      { class: "toggle-text" },
      h("span", { class: "toggle-label", text: label }),
      help ? h("span", { class: "help", text: help }) : null,
    ),
    input,
    h("span", { class: "switch", "aria-hidden": "true" }),
  );
}

// ---------------------------------------------------------------- vibration

/** A short vibration through Zapli, when the phone has it and the user did not turn it off. */
export function haptic(kind = "light") {
  const zapli = ctx.zapli;
  if (!zapli || !ctx.store || ctx.store.ui.haptics === false) return;
  try {
    if (zapli.supports && zapli.supports("haptics.impact")) zapli.haptics.impact(kind).catch(() => {});
  } catch {
    // No vibration on this phone.
  }
}

// ---------------------------------------------------------------- dates and times

function fmt(options) {
  try {
    return new Intl.DateTimeFormat(ctx.locale, options);
  } catch {
    return new Intl.DateTimeFormat("en-GB", options);
  }
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayOffset(date, now) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

export function timeOfDay(date) {
  return fmt({ hour: "numeric", minute: "2-digit" }).format(date);
}

/** A date for a list: the time today, "Yesterday", the day and month this year, else with the year. */
export function shortWhen(date, now = ctx.now()) {
  if (!date || Number.isNaN(date.getTime())) return "";
  if (sameDay(date, now)) return timeOfDay(date);
  if (dayOffset(date, now) === -1) return t("yesterday");
  if (date.getFullYear() === now.getFullYear()) return fmt({ day: "numeric", month: "short" }).format(date);
  return fmt({ day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** A full date and time for the details sheet. */
export function longWhen(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  return fmt({
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** When a reminder rings: "Today, 18:00", "Tomorrow, 8:00", the weekday within a week, else the date. */
export function reminderWhen(date, now = ctx.now()) {
  if (!date) return "";
  const days = dayOffset(date, now);
  const clock = timeOfDay(date);
  if (days === 0) return t("todayAt", { time: clock });
  if (days === 1) return t("tomorrowAt", { time: clock });
  if (days === -1) return t("yesterdayAt", { time: clock });
  if (days > 1 && days < 7) return fmt({ weekday: "short" }).format(date) + " " + clock;
  const sameYear = date.getFullYear() === now.getFullYear();
  return (
    fmt(sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).format(
      date,
    ) +
    ", " +
    clock
  );
}

// ---------------------------------------------------------------- dialogs and sheets

let openDialogs = 0;

/** Whether a dialog or sheet is open (screens leave their own gestures alone then). */
export function dialogOpen() {
  return openDialogs > 0;
}

/**
 * A modal dialog that Back closes. build(close) returns its content; the promise resolves with what close() was
 * given, or null when it was dismissed. `sheet` slides it up from the bottom with its own scrolling.
 */
export function dialog(build, { sheet = false, label, className = "" } = {}) {
  return new Promise((resolve) => {
    const d = h("dialog", { class: (sheet ? "sheet " : "dialog ") + className, "aria-label": label || null });
    let result = null;
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      result = value === undefined ? null : value;
      d.classList.add("closing");
      const finish = () => {
        if (d.open) d.close();
      };
      if (reducedMotion()) finish();
      else setTimeout(finish, 120);
    };
    d.addEventListener("close", () => {
      openDialogs = Math.max(0, openDialogs - 1);
      closed = true;
      d.remove();
      resolve(result);
    });
    d.addEventListener("cancel", () => {
      // Back or Escape closes the dialog at once, with nothing chosen.
      closed = true;
      result = null;
    });
    d.addEventListener("click", (e) => {
      if (e.target === d) close(null);
    });
    const body = h("div", { class: "dialog-body" });
    if (sheet) body.appendChild(grabber(d, () => close(null)));
    put(body, build(close));
    d.appendChild(body);
    document.body.appendChild(d);
    openDialogs++;
    d.showModal();
  });
}

/** The handle at the top of a sheet: dragging it down closes the sheet. */
function grabber(sheetEl, onClose) {
  const handle = h("div", { class: "grabber", "aria-hidden": "true" }, h("span"));
  let startY = null;
  let dy = 0;
  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    dy = 0;
    if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheetEl.style.transform = "translateY(" + dy + "px)";
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    sheetEl.style.transform = "";
    if (dy > 72) onClose();
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  return handle;
}

/** A bottom sheet with a title; build(close) returns what goes under it. */
export function sheet(title, build, options = {}) {
  return dialog((close) => [title ? h("h2", { class: "sheet-title", text: title }) : null, build(close)], {
    sheet: true,
    label: title,
    ...options,
  });
}

/**
 * A menu of actions as a sheet: items are {id, icon, text, danger, hidden}. Resolves with the chosen id, or null.
 * The choice runs from the tap on its row, so a capability it starts (the camera, sharing) has its gesture.
 */
export function menu(title, items, onChoose) {
  return sheet(
    title,
    (close) =>
      h(
        "ul",
        { class: "menu", role: "list" },
        items
          .filter((item) => item && !item.hidden)
          .map((item) =>
            h(
              "li",
              {},
              h(
                "button",
                {
                  type: "button",
                  class: "menu-item" + (item.danger ? " danger" : ""),
                  onClick: () => {
                    if (onChoose) onChoose(item.id);
                    close(item.id);
                  },
                },
                icon(item.icon || "noteOutline"),
                h("span", { class: "menu-text", text: item.text }),
                item.hint ? h("span", { class: "menu-hint", text: item.hint }) : null,
              ),
            ),
          ),
      ),
    { label: title || t("moreOptions") },
  );
}

/** Asks before something that cannot be taken back. Resolves true for yes. */
export function confirm({ title, message, ok, danger = false }) {
  return dialog(
    (close) => [
      h("h2", { class: "dialog-title", text: title }),
      message ? h("p", { class: "dialog-text", text: message }) : null,
      h(
        "div",
        { class: "dialog-actions" },
        button(t("cancel"), () => close(false), "text"),
        button(ok || t("ok"), () => close(true), danger ? "danger" : "filled"),
      ),
    ],
    { label: title },
  ).then(Boolean);
}

/** Asks for a line of text (a label's name). Resolves with the trimmed text, or null when cancelled. */
export function askText({ title, label, value = "", ok, check }) {
  return dialog(
    (close) => {
      const input = h("input", { type: "text", value, autocomplete: "off", maxlength: "50", enterkeyhint: "done" });
      input.id = "ask-" + Math.random().toString(36).slice(2, 8);
      const error = h("p", { class: "error", role: "alert" });
      const done = () => {
        const text = input.value.trim();
        const problem = check ? check(text) : text ? null : t("typeSomething");
        if (problem) {
          error.textContent = problem;
          return;
        }
        close(text);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          done();
        }
      });
      setTimeout(() => input.focus(), 60);
      return [
        h("h2", { class: "dialog-title", text: title }),
        h("div", { class: "field" }, h("label", { for: input.id, text: label }), input),
        error,
        h(
          "div",
          { class: "dialog-actions" },
          button(t("cancel"), () => close(null), "text"),
          button(ok || t("save"), done, "filled"),
        ),
      ];
    },
    { label: title },
  );
}

// ---------------------------------------------------------------- the snackbar

let snackTimer = null;
let clearTimer = null;

/** Hides the snackbar now (a new screen, a swipe). */
export function hideSnack() {
  const box = document.getElementById("snackbar");
  if (!box) return;
  clearTimeout(snackTimer);
  box.classList.remove("show");
  box.style.transform = "";
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (!box.classList.contains("show")) {
      box.textContent = "";
      box.hidden = true;
    }
  }, 260);
}

/**
 * A short message at the bottom. With `action` ({label, run}) it offers a button such as Undo for five seconds;
 * a plain message goes after three. A sideways swipe dismisses it.
 */
export function snack(text, action) {
  const box = document.getElementById("snackbar");
  if (!box || !text) return;
  clearTimeout(snackTimer);
  clearTimeout(clearTimer);
  box.textContent = "";
  box.hidden = false;
  box.appendChild(h("span", { class: "snack-text", text }));
  if (action) {
    box.appendChild(
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
  // Shown on the next frame, so it slides in.
  requestAnimationFrame(() => box.classList.add("show"));
  snackTimer = setTimeout(hideSnack, action ? 5000 : 3000);
}

/** Lets a sideways swipe dismiss the snackbar; set up once at start. */
export function swipeAwaySnack() {
  const box = document.getElementById("snackbar");
  if (!box) return;
  let x0 = null;
  let dx = 0;
  box.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest("button")) return;
    x0 = e.clientX;
    dx = 0;
  });
  box.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    box.style.transform = "translateX(" + dx + "px)";
    box.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 240));
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    box.style.opacity = "";
    if (Math.abs(dx) > 80) hideSnack();
    else box.style.transform = "";
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
}

/** A message for a failed write or call, in words. */
export function failed(error) {
  const code = error && error.code;
  if (code === "CANCELLED") return;
  if (code === "QUOTA_EXCEEDED") snack(t("storageFull"));
  else if (code === "NEEDS_GESTURE") snack(t("tapAgain"));
  else if (code === "UNSUPPORTED") snack(t("notOnThisPhone"));
  else if (code === "PERMISSION_DENIED" || code === "OS_DENIED") snack(t("notAllowed"));
  else if (code === "RATE_LIMITED") snack(t("slowDown"));
  else snack(t("couldNotSave"));
}

export function reducedMotion() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Grows a text area to fit its text, so the page scrolls instead of the box. */
export function autosize(area) {
  area.style.height = "auto";
  if (typeof area.scrollHeight === "number" && area.scrollHeight > 0) area.style.height = area.scrollHeight + "px";
}
