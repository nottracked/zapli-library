// What a note is and how it reads, without the page: checklists as text, labels, words, search, sorting, the
// trash's 30 days, repeat rules for reminders, and the files the app saves. Everything here is plain functions, so
// dev/test-logic.mjs runs it in Node.

/** Days a note stays in the trash before it is deleted for good. */
export const TRASH_DAYS = 30;

/** The colours a note can have, in the order the colour picker shows them. */
export const COLORS = ["none", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "grey"];

/** Longest text the store keeps in a note's body and title. */
export const MAX_BODY = 100000;
export const MAX_TITLE = 1000;
export const MAX_LABEL = 50;

// ---------------------------------------------------------------- checklists

// A checklist is kept in the note's text, one item a line: "- [ ] milk" to do, "- [x] eggs" ticked. Lines written
// by hand or by other apps ("[x] eggs", "* [ ] milk", "☐ milk", "✓ eggs") read the same way.
const TASK = /^\s*(?:[-*+•]\s*)?\[( |x|X|✓)\]\s?(.*)$/;
const OPEN_MARK = /^\s*[☐□○◯]\s*(.*)$/;
const DONE_MARK = /^\s*[☑☒✓✔]\s*(.*)$/;
const BULLET = /^\s*(?:[-*+•–]|\d{1,3}[.)])\s+/;

/** The items of a checklist's text: [{text, done}], one per non-empty line. */
export function parseItems(body) {
  const items = [];
  for (const raw of String(body || "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let m = TASK.exec(raw);
    if (m) {
      items.push({ text: m[2].trim(), done: m[1] !== " " });
      continue;
    }
    m = DONE_MARK.exec(raw);
    if (m) {
      items.push({ text: m[1].trim(), done: true });
      continue;
    }
    m = OPEN_MARK.exec(raw);
    items.push({ text: (m ? m[1] : raw.replace(BULLET, "")).trim(), done: false });
  }
  return items;
}

/** A checklist's items as the text the store keeps. Empty items are left out. */
export function serializeItems(items) {
  return items
    .map((item) => ({ text: oneLine(item.text), done: Boolean(item.done) }))
    .filter((item) => item.text !== "")
    .map((item) => (item.done ? "- [x] " : "- [ ] ") + item.text)
    .join("\n");
}

/** Plain text turned into checklist items: one per line, bullets and numbers taken off. */
export function textToItems(text) {
  return parseItems(text);
}

/** Checklist items turned into plain text: one line each, ticked or not. */
export function itemsToText(items) {
  return items
    .map((item) => oneLine(item.text))
    .filter(Boolean)
    .join("\n");
}

function oneLine(text) {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

/** Whether a text looks like a checklist (its first line is an item with a box). */
export function looksLikeChecklist(text) {
  const first = String(text || "")
    .split(/\r?\n/)
    .find((line) => line.trim());
  return Boolean(first && (TASK.test(first) || OPEN_MARK.test(first) || DONE_MARK.test(first)));
}

// ---------------------------------------------------------------- labels and photos

/** The labels of a note's label text ("Home, Ideas"): trimmed, without repeats (ignoring case). */
export function labelsOf(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(/[,;|\n]/)) {
    const name = cleanLabel(part);
    const key = name.toLocaleLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Labels as the note keeps them. */
export function labelsText(list) {
  return labelsOf(list.join(",")).join(", ");
}

/** A label name as it can be stored: no separators, single spaces, at most 50 characters. */
export function cleanLabel(name) {
  return String(name || "")
    .replace(/[,;|\n\r\t]/g, " ")
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL)
    .trim();
}

/** Whether two label names are the same label. */
export function sameLabel(a, b) {
  return String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase();
}

/** The photo ids of a note's photo text. */
export function photoIds(text) {
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s));
}

export function photosText(ids) {
  return ids.join(",");
}

// ---------------------------------------------------------------- reading a note

/** What a note says, as plain lines: the title, then the text or the items. */
export function plainBody(note) {
  if (note.kind === "list")
    return parseItems(note.body)
      .map((item) => item.text)
      .join("\n");
  return String(note.body || "");
}

/** The line a list shows for a note without a title: its first line of text, else "". */
export function firstLine(note) {
  const line = plainBody(note)
    .split(/\r?\n/)
    .find((l) => l.trim());
  return line ? line.trim() : "";
}

/** Whether a note has nothing in it: no title, no text, no items and no photos. */
export function isEmptyNote(note) {
  return !String(note.title || "").trim() && !plainBody(note).trim() && photoIds(note.photos).length === 0;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’_-]*/gu;

/** Words in a text: runs of letters and digits, with apostrophes and hyphens inside. */
export function wordCount(text) {
  const found = String(text || "").match(WORD);
  return found ? found.length : 0;
}

/** Characters as people count them (a letter with an accent is one). */
export function charCount(text) {
  return [...String(text || "").normalize("NFC")].length;
}

/** The words and characters of a whole note, title included. */
export function noteStats(note) {
  const text = [note.title || "", plainBody(note)].filter(Boolean).join("\n");
  return { words: wordCount(text), chars: charCount(text.replace(/\n/g, "")) };
}

/** A note as text to send to another app: the title, a blank line, then the text or ☐/☑ items. */
export function shareText(note) {
  const parts = [];
  if (String(note.title || "").trim()) parts.push(note.title.trim());
  if (note.kind === "list") {
    const lines = parseItems(note.body).map((item) => (item.done ? "☑ " : "☐ ") + item.text);
    if (lines.length) parts.push(lines.join("\n"));
  } else if (String(note.body || "").trim()) parts.push(String(note.body).trim());
  return parts.join("\n\n");
}

// ---------------------------------------------------------------- search

/** Text folded for search: no accents, lower case ("Čaj" finds "caj"). */
export function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** The words of a search, folded. */
export function searchTerms(query) {
  return fold(query).split(/\s+/).filter(Boolean).slice(0, 12);
}

/** Whether a note holds every word of the search: in its title, text, items or labels. */
export function noteMatches(note, terms) {
  if (!terms.length) return true;
  const hay = note._fold || fold([note.title, plainBody(note), note.labels].join("\n"));
  return terms.every((term) => hay.includes(term));
}

/**
 * The parts of a text that match the search words: [{text, hit}], in order, for highlighting. Folding keeps one
 * character for each, so positions in the folded text are positions in the text.
 */
export function highlight(text, terms) {
  const source = String(text || "");
  if (!terms.length || !source) return [{ text: source, hit: false }];
  const chars = [...source];
  // The folded text, and for each of its code units the character of the source it came from.
  let flat = "";
  const owner = [];
  chars.forEach((c, i) => {
    const f = fold(c) || c;
    flat += f;
    for (let k = 0; k < f.length; k++) owner.push(i);
  });
  const marks = new Array(chars.length).fill(false);
  for (const term of terms) {
    let at = flat.indexOf(term);
    while (at >= 0) {
      for (let k = at; k < at + term.length; k++) marks[owner[k]] = true;
      at = flat.indexOf(term, at + term.length);
    }
  }
  const parts = [];
  for (let i = 0; i < chars.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += chars[i];
    else parts.push({ text: chars[i], hit: marks[i] });
  }
  return parts;
}

// ---------------------------------------------------------------- order

function time(iso) {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/** When a note was last changed and made, in milliseconds (the record's own times when the note has none). */
export function editedMs(note) {
  return time(note.edited) || time(note.updatedAt) || time(note.created) || time(note.createdAt);
}

export function createdMs(note) {
  return time(note.created) || time(note.createdAt) || editedMs(note);
}

/** Notes in the order the user chose: last edited, created or by title. A copy; the list is left as it is. */
export function sortNotes(notes, mode, locale) {
  const list = [...notes];
  if (mode === "title") {
    const collator = new Intl.Collator(locale || undefined, { sensitivity: "base", numeric: true });
    const name = (n) => (String(n.title || "").trim() || firstLine(n)).toString();
    list.sort((a, b) => {
      const x = name(a);
      const y = name(b);
      if (!x !== !y) return x ? -1 : 1;
      return collator.compare(x, y) || editedMs(b) - editedMs(a);
    });
  } else if (mode === "created") list.sort((a, b) => createdMs(b) - createdMs(a));
  else list.sort((a, b) => editedMs(b) - editedMs(a));
  return list;
}

// ---------------------------------------------------------------- the trash

/** Whole days until a note in the trash is deleted for good (0 when it is due). */
export function trashDaysLeft(trashedAt, now) {
  const at = time(trashedAt);
  if (!at) return TRASH_DAYS;
  const end = at + TRASH_DAYS * 86400000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86400000));
}

// ---------------------------------------------------------------- reminders

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"];

function ymd(date) {
  return (
    String(date.getFullYear()).padStart(4, "0") +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0")
  );
}

/** The repeat rule for a reminder that first rings at `date` (a local Date): "" for none. */
export function repeatRule(kind, date) {
  const start = ";DTSTART=" + ymd(date);
  switch (kind) {
    case "daily":
      return "FREQ=DAILY" + start;
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" + start;
    case "weekly":
      return "FREQ=WEEKLY;BYDAY=" + DAY_CODES[date.getDay()] + start;
    case "monthly":
      return "FREQ=MONTHLY;BYMONTHDAY=" + date.getDate() + start;
    case "yearly":
      return "FREQ=YEARLY;BYMONTH=" + (date.getMonth() + 1) + ";BYMONTHDAY=" + date.getDate() + start;
    default:
      return "";
  }
}

function ruleParts(rule) {
  const parts = {};
  for (const piece of String(rule || "").split(";")) {
    const [k, v] = piece.split("=");
    if (k && v !== undefined) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  return parts;
}

/** Which of the repeat choices a stored rule is: one of REPEATS, or "custom" for a rule from elsewhere. */
export function repeatKind(rule) {
  if (!rule) return "none";
  const p = ruleParts(rule);
  const plain = !p.INTERVAL || p.INTERVAL === "1";
  if (!plain || p.COUNT || p.UNTIL) return "custom";
  if (p.FREQ === "DAILY" && !p.BYDAY && !p.BYMONTHDAY && !p.BYMONTH) return "daily";
  if (p.FREQ === "WEEKLY" && p.BYDAY === "MO,TU,WE,TH,FR") return "weekdays";
  if (p.FREQ === "WEEKLY" && /^(MO|TU|WE|TH|FR|SA|SU)$/.test(p.BYDAY || "")) return "weekly";
  if (p.FREQ === "MONTHLY" && /^\d{1,2}$/.test(p.BYMONTHDAY || "") && !p.BYDAY) return "monthly";
  if (p.FREQ === "YEARLY" && /^\d{1,2}$/.test(p.BYMONTHDAY || "") && /^\d{1,2}$/.test(p.BYMONTH || "")) return "yearly";
  return "custom";
}

function startOfRule(rule) {
  const m = /DTSTART=(\d{4})(\d{2})(\d{2})/i.exec(String(rule || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function occursOn(parts, kind, day) {
  switch (kind) {
    case "daily":
      return true;
    case "weekdays":
      return day.getDay() >= 1 && day.getDay() <= 5;
    case "weekly":
      return DAY_CODES[day.getDay()] === parts.BYDAY;
    case "monthly":
      return day.getDate() === Number(parts.BYMONTHDAY);
    case "yearly":
      return day.getDate() === Number(parts.BYMONTHDAY) && day.getMonth() + 1 === Number(parts.BYMONTH);
    default:
      return false;
  }
}

/**
 * When a reminder rings next, at or after `now`: its own time for a one-off one (null once it is past), the next
 * day its rule names at that time of day for a repeating one. null for a rule this page does not read.
 */
export function nextReminder(remindAt, rule, now) {
  const first = remindAt ? new Date(remindAt) : null;
  if (!first || Number.isNaN(first.getTime())) return null;
  const kind = repeatKind(rule);
  if (kind === "none") return first.getTime() >= now.getTime() ? first : null;
  if (kind === "custom") return first.getTime() >= now.getTime() ? first : null;
  const parts = ruleParts(rule);
  const start = startOfRule(rule) || new Date(first.getFullYear(), first.getMonth(), first.getDate());
  let day = new Date(Math.max(start.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()));
  day = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  for (let i = 0; i < 800; i++) {
    if (occursOn(parts, kind, day)) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), first.getHours(), first.getMinutes());
      if (at.getTime() >= now.getTime() && at.getTime() >= first.getTime() - 60000) return at;
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return null;
}

/** The quick choices of the reminder sheet: later today (when there is time left), tomorrow and next week. */
export function reminderPresets(now) {
  const at = (days, hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0, 0);
  const out = [];
  if (now.getHours() < 17) out.push({ id: "laterToday", at: at(0, 18) });
  else if (now.getHours() < 20) out.push({ id: "tonight", at: at(0, 21) });
  out.push({ id: "tomorrow", at: at(1, 8) });
  const toMonday = (8 - now.getDay()) % 7 || 7;
  out.push({ id: "nextWeek", at: at(toMonday, 8) });
  return out;
}

/** A local date and time as ISO 8601 with the phone's offset, as the store keeps date-times. */
export function isoLocal(date) {
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    String(date.getFullYear()).padStart(4, "0") +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds()) +
    sign +
    pad(Math.trunc(offset / 60)) +
    ":" +
    pad(offset % 60)
  );
}

// ---------------------------------------------------------------- files

/** The app's own export: every note that is not in the trash, as JSON the import reads back. */
export function exportJson(notes, now) {
  const rows = [...notes]
    .filter((n) => !n.trashedAt)
    .sort((a, b) => createdMs(a) - createdMs(b))
    .map((n) => {
      const row = { title: n.title || "", text: n.body || "", kind: n.kind === "list" ? "list" : "text" };
      row.color = n.color || "none";
      row.pinned = Boolean(n.pinned);
      row.archived = Boolean(n.archived);
      row.labels = labelsText(labelsOf(n.labels));
      if (n.created || n.createdAt) row.created = n.created || n.createdAt;
      if (n.edited || n.updatedAt) row.edited = n.edited || n.updatedAt;
      if (n.remindAt) row.remindAt = n.remindAt;
      if (n.repeat) row.repeat = n.repeat;
      return row;
    });
  return JSON.stringify({ format: "notes", version: 1, exported: isoLocal(now), notes: rows }, null, 2) + "\n";
}

const CSV_HEADER = [
  "Title",
  "Text",
  "Labels",
  "Color",
  "Pinned",
  "Archived",
  "Created",
  "Edited",
  "Reminder",
  "Repeat",
];

/** Every note that is not in the trash as CSV: a header row and one row a note, readable by spreadsheets. */
export function exportCsv(notes) {
  const rows = [CSV_HEADER];
  for (const n of [...notes].filter((x) => !x.trashedAt).sort((a, b) => createdMs(a) - createdMs(b))) {
    rows.push([
      n.title || "",
      n.body || "",
      labelsText(labelsOf(n.labels)),
      n.color || "none",
      n.pinned ? "true" : "false",
      n.archived ? "true" : "false",
      n.created || n.createdAt || "",
      n.edited || n.updatedAt || "",
      n.remindAt || "",
      n.repeat || "",
    ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const PART_SEPARATORS = ",;\t\r\n";
const FORMULA_STARTS = "=+-@＝＋－＠";
const LINE_STARTS = "\t\r\n";
const PLAIN_NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

function isSpace(c) {
  return /\s/.test(c) && !PART_SEPARATORS.includes(c);
}

function startsFormula(text, index, cellStart) {
  let at = index;
  while (at < text.length && (isSpace(text[at]) || text[at] === "'" || text[at] === '"')) at++;
  const c = text[at];
  if (c === undefined) return false;
  return FORMULA_STARTS.includes(c) || (cellStart && LINE_STARTS.includes(c));
}

/**
 * One CSV cell: quoted, and with a ' before each part a spreadsheet could run as a formula (the start, and the text
 * after each comma, semicolon, tab or line break), the way Zapli's own exports do it, so the import takes them off.
 */
export function csvCell(value) {
  const text = String(value);
  let out = "";
  let from = 0;
  for (;;) {
    let start = from;
    while (start < text.length && isSpace(text[start])) start++;
    let end = start;
    while (end < text.length && !PART_SEPARATORS.includes(text[end])) end++;
    const part = text.slice(start, end);
    const guard = startsFormula(text, start, from === 0) && !PLAIN_NUMBER.test(part);
    out += text.slice(from, start) + (guard ? "'" : "") + part;
    if (end >= text.length) break;
    out += text[end];
    from = end + 1;
  }
  return '"' + out.replace(/"/g, '""') + '"';
}

/** A file name with today's date: notes-2026-11-03.json. */
export function fileName(extension, now) {
  const d = now;
  const day =
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return "notes-" + day + "." + extension;
}

/** A short random id for photos, made from the time and a random part. */
export function newId(random = Math.random, now = Date.now()) {
  return now.toString(36) + Math.floor(random() * 1e8).toString(36);
}
