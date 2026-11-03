// Dialogs, the settings sheet's fitting, choice tiles, the daily-deal calendar and the small formatters the card
// games share. Nothing here knows a game's rules.
import { t, tn, cap, lang } from "./i18n.js";

const $ = (id) => document.getElementById(id);

// ---- dates and numbers
export const pad2 = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayKey = () => dayKey(new Date());
export const dateOf = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function formatRate(won, played) {
  if (!played) return "–";
  try {
    return new Intl.NumberFormat(lang(), { style: "percent", maximumFractionDigits: 0 }).format(won / played);
  } catch (e) {
    return `${Math.round((100 * won) / played)}%`;
  }
}

export function formatDay(day) {
  try {
    return new Intl.DateTimeFormat(lang(), { day: "numeric", month: "long" }).format(dateOf(day));
  } catch (e) {
    return day;
  }
}

export function formatNumber(n) {
  try {
    return new Intl.NumberFormat(lang()).format(n);
  } catch (e) {
    return String(n);
  }
}

// ---- dialogs: modal, so the phone's Back closes the open one first; focus goes back where it was.
const returnFocus = new WeakMap();

export function openDialog(dlg, back) {
  if (dlg.open) return;
  returnFocus.set(dlg, back || document.activeElement);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

export function closeDialog(dlg) {
  if (!dlg.open) return;
  if (typeof dlg.close === "function") dlg.close();
  else {
    dlg.removeAttribute("open");
    dlg.dispatchEvent(new Event("close"));
  }
}

export const focusTarget = (dlg) => returnFocus.get(dlg);

export function wireDialogs() {
  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.addEventListener("close", () => {
      const el = returnFocus.get(dlg);
      returnFocus.delete(dlg);
      if (el && el.isConnected && typeof el.focus === "function" && !document.querySelector("dialog[open]"))
        el.focus({ preventScroll: true });
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) closeDialog(dlg);
    });
  });
}

// ---- the settings sheet
// Segmented choices whose labels do not fit side by side stack instead of breaking words, and the sheet's tabs wrap
// onto a second row.
export function fitSegs(scope) {
  scope.querySelectorAll(".seg").forEach((seg) => {
    if (!seg.offsetWidth) return;
    seg.classList.remove("stack");
    seg.classList.add("measure");
    const over = [...seg.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1);
    seg.classList.remove("measure");
    seg.classList.toggle("stack", over);
  });
  const tabRow = scope.querySelector(".tabs");
  if (tabRow && tabRow.offsetWidth) {
    tabRow.classList.remove("wrap");
    const over = [...tabRow.children].some((tab) => tab.scrollWidth > tab.clientWidth + 1);
    tabRow.classList.toggle("wrap", over);
  }
}

// Tile grids whose columns hold every tile's picture and the longest word of its name, at the phone's text size and
// in the game's language: no name runs over its tile's border or out of the sheet.
export function fitTiles(scope) {
  scope.querySelectorAll(".tiles").forEach((grid) => {
    if (!grid.offsetWidth) return;
    grid.classList.add("measure");
    let need = 0;
    grid.querySelectorAll(".tile").forEach((tile) => {
      const cs = getComputedStyle(tile);
      const frame = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]
        .map((k) => parseFloat(cs[k]) || 0)
        .reduce((a, b) => a + b, 0);
      tile.querySelectorAll(":scope > :not(input):not(.sr-only)").forEach((part) => {
        need = Math.max(need, part.getBoundingClientRect().width + frame);
      });
    });
    grid.classList.remove("measure");
    grid.style.setProperty("--tile-min", `${Math.ceil(need)}px`);
  });
}

// Tabs: arrow keys move between them, and the chosen panel shows.
export function wireTabs(sheet) {
  const tabs = [...sheet.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus) {
    tabs.forEach((tb) => {
      const on = tb === tab;
      tb.setAttribute("aria-selected", String(on));
      tb.tabIndex = on ? 0 : -1;
      $(tb.getAttribute("aria-controls")).hidden = !on;
    });
    fitSegs(sheet);
    fitTiles(sheet);
    if (focus) tab.focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab, false));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      selectTab(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });
  return selectTab;
}

// A choice drawn as a picture.
export function tile(name, value, checked, label, pic, disabled) {
  const el = document.createElement("label");
  el.className = `tile${checked ? " on" : ""}${disabled ? " off" : ""}`;
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.disabled = !!disabled;
  const text = document.createElement("span");
  text.textContent = label;
  el.append(input, pic, text);
  return el;
}

// ---- the daily deal's calendar: this month and last month; a won day is filled and ticked, today is outlined, days
// to come cannot be chosen. No streaks, nothing about days missed.
export function buildCalendar(month, isWon, onPick) {
  const now = new Date();
  const thisMonth = [now.getFullYear(), now.getMonth()];
  const [y, m] = month || thisMonth;
  const isThis = y === thisMonth[0] && m === thisMonth[1];
  $("cal-prev").disabled = !isThis;
  $("cal-next").disabled = isThis;
  let title = `${m + 1}/${y}`;
  try {
    title = new Intl.DateTimeFormat(lang(), { month: "long", year: "numeric" }).format(new Date(y, m, 1));
  } catch (e) {
    title = `${m + 1}/${y}`;
  }
  $("cal-month").textContent = cap(title);
  const cal = $("cal");
  cal.textContent = "";
  for (let i = 0; i < 7; i++) {
    const wd = document.createElement("span");
    wd.className = "wd";
    wd.setAttribute("aria-hidden", "true");
    try {
      wd.textContent = new Intl.DateTimeFormat(lang(), { weekday: "short" }).format(new Date(2026, 0, 5 + i));
    } catch (e) {
      wd.textContent = String(i + 1);
    }
    cal.appendChild(wd);
  }
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) cal.appendChild(document.createElement("span"));
  const days = new Date(y, m + 1, 0).getDate();
  const today = todayKey();
  let won = 0;
  for (let d = 1; d <= days; d++) {
    const key = dayKey(new Date(y, m, d));
    const done = isWon(key);
    if (done) won += 1;
    const b = document.createElement("button");
    b.type = "button";
    b.className = `d${done ? " won" : ""}${key === today ? " today" : ""}`;
    b.textContent = String(d);
    b.disabled = key > today;
    b.setAttribute("aria-label", t("dayLabel", { date: formatDay(key), won: done, today: key === today }));
    b.addEventListener("click", () => onPick(key));
    cal.appendChild(b);
  }
  $("cal-count").textContent = tn("nDaysSolved", won);
}

export function lastMonth() {
  const now = new Date();
  return now.getMonth() === 0 ? [now.getFullYear() - 1, 11] : [now.getFullYear(), now.getMonth() - 1];
}
