// A month of daily puzzles: one button per day from the first daily puzzle to today, marked solved or started.
// Shared by the word games that have a daily puzzle.

import { FIRST_DAY, monthLength, weekday, daysBetween } from "../core/dates.mjs";

const pad = (n) => String(n).padStart(2, "0");

export function createCalendar(root, { onPick, label }) {
  let year = 0;
  let month = 0;

  /**
   * Draws a month (1 to 12). `today` is "YYYY-MM-DD"; `status(day)` says "solved", "started" or "".
   * Returns the number of solved days in the month.
   */
  function render(y, m, today, status, lang) {
    year = y;
    month = m;
    root.textContent = "";
    let names = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    let longNames = names;
    try {
      const short = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
      const long = new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" });
      // 2024-01-01 was a Monday.
      names = [0, 1, 2, 3, 4, 5, 6].map((i) => short.format(new Date(Date.UTC(2024, 0, 1 + i))));
      longNames = [0, 1, 2, 3, 4, 5, 6].map((i) => long.format(new Date(Date.UTC(2024, 0, 1 + i))));
    } catch (e) {
      // the English short names above
    }
    names.forEach((n, i) => {
      const wd = document.createElement("abbr");
      wd.className = "wd";
      wd.textContent = n;
      wd.title = longNames[i];
      root.appendChild(wd);
    });
    const first = `${y}-${pad(m)}-01`;
    for (let i = 0; i < weekday(first); i++) root.appendChild(document.createElement("span"));
    let solved = 0;
    for (let d = 1; d <= monthLength(y, m); d++) {
      const day = `${y}-${pad(m)}-${pad(d)}`;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "d";
      b.textContent = String(d);
      b.dataset.day = day;
      const s = status(day);
      if (s === "solved") solved++;
      if (s) b.classList.add(s);
      if (day === today) b.classList.add("today");
      const playable = daysBetween(FIRST_DAY, day) >= 0 && daysBetween(day, today) >= 0;
      b.disabled = !playable;
      b.setAttribute("aria-label", label(day, s));
      if (day === today) b.setAttribute("aria-current", "date");
      root.appendChild(b);
    }
    return solved;
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest(".d");
    if (b && !b.disabled) onPick(b.dataset.day);
  });

  return {
    render,
    get year() {
      return year;
    },
    get month() {
      return month;
    },
  };
}
