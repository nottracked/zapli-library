// Checks the page's logic in Node 22: checklists as text, labels, words, search with and without accents, sorting,
// the trash's 30 days, repeat rules, the saved files (JSON and CSV with formula guards), the import mapping against
// the sample files, and that every text exists in English and Slovak (the page's and the manifest's).
// Run from the repository root: node apps/library/notes/dev/test-logic.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as m from "../package/js/model.mjs";
import { STRINGS, translator, pickLanguage, localeFor } from "../package/js/i18n.mjs";
import { sampleData } from "../package/js/sample.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "package");
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error("FAIL " + name);
    throw error;
  }
}

// ---------------------------------------------------------------- checklists

test("checklist text reads both ways", () => {
  const items = m.parseItems("- [ ] Milk\n- [x] Eggs\n\n* [X] Bread\n[ ] Tea\n☐ Rice\n✓ Salt\n• Oil\n2) Flour");
  assert.deepEqual(items, [
    { text: "Milk", done: false },
    { text: "Eggs", done: true },
    { text: "Bread", done: true },
    { text: "Tea", done: false },
    { text: "Rice", done: false },
    { text: "Salt", done: true },
    { text: "Oil", done: false },
    { text: "Flour", done: false },
  ]);
  assert.equal(m.serializeItems(items.slice(0, 2)), "- [ ] Milk\n- [x] Eggs");
  assert.equal(
    m.serializeItems([
      { text: "  ", done: false },
      { text: "a\nb", done: true },
    ]),
    "- [x] a b",
  );
  assert.deepEqual(m.parseItems(m.serializeItems(items)), items);
});

test("text and checklist convert", () => {
  assert.deepEqual(m.textToItems("Buy milk\n\n- call Ann\n3. post"), [
    { text: "Buy milk", done: false },
    { text: "call Ann", done: false },
    { text: "post", done: false },
  ]);
  assert.equal(m.itemsToText([{ text: "a", done: true }, { text: "b" }]), "a\nb");
  assert.equal(m.looksLikeChecklist("\n- [ ] milk\nbread"), true);
  assert.equal(m.looksLikeChecklist("Dear diary"), false);
});

// ---------------------------------------------------------------- labels and photos

test("labels are trimmed, separated and kept once", () => {
  assert.deepEqual(m.labelsOf("Home, Ideas;work | home\n#Recipes"), ["Home", "Ideas", "work", "Recipes"]);
  assert.equal(m.labelsText(["b", "a", "B"]), "b, a");
  assert.equal(m.cleanLabel("  To, do;  list  "), "To do list");
  assert.equal(m.cleanLabel("x".repeat(80)).length, 50);
  assert.equal(m.sameLabel("Domácnosť", "DOMÁCNOSŤ"), true);
  assert.deepEqual(m.photoIds("a1, b_2,bad id,,c-3"), ["a1", "b_2", "c-3"]);
});

// ---------------------------------------------------------------- words and emptiness

test("words and characters", () => {
  assert.equal(m.wordCount("Hello, world!"), 2);
  assert.equal(m.wordCount("Dobrý deň, ako sa máš?"), 5);
  assert.equal(m.wordCount("e-mail don’t 12.5 kg"), 5);
  assert.equal(m.wordCount("   "), 0);
  assert.equal(m.charCount("čaj"), 3);
  assert.equal(m.charCount("čaj"), 3);
  const stats = m.noteStats({ title: "Shopping", kind: "list", body: "- [ ] oat milk\n- [x] eggs" });
  assert.deepEqual(stats, { words: 4, chars: 20 });
  assert.equal(m.isEmptyNote({ title: " ", body: "- [ ] ", kind: "list" }), true);
  assert.equal(m.isEmptyNote({ title: "", body: "", photos: "p1" }), false);
  assert.equal(m.firstLine({ title: "", kind: "text", body: "\n  First line\nsecond" }), "First line");
});

test("share text", () => {
  assert.equal(m.shareText({ title: "Trip", kind: "list", body: "- [ ] Map\n- [x] Boots" }), "Trip\n\n☐ Map\n☑ Boots");
  assert.equal(m.shareText({ title: "", kind: "text", body: " Hello " }), "Hello");
});

// ---------------------------------------------------------------- search

test("search ignores case and accents and needs every word", () => {
  const note = { title: "Nákup na víkend", kind: "list", body: "- [ ] Čaj\n- [x] Cesnak", labels: "Domácnosť" };
  const has = (q) => m.noteMatches(note, m.searchTerms(q));
  assert.equal(has("caj"), true);
  assert.equal(has("CESNAK vikend"), true);
  assert.equal(has("domacnost"), true);
  assert.equal(has("caj ryza"), false);
  assert.equal(has(""), true);
});

test("highlighting marks the found words in the original text", () => {
  const parts = m.highlight("Čerstvý čaj", m.searchTerms("caj"));
  assert.deepEqual(parts, [
    { text: "Čerstvý ", hit: false },
    { text: "čaj", hit: true },
  ]);
  const emoji = m.highlight("🍵 Tea time", m.searchTerms("tea"));
  assert.equal(emoji.find((p) => p.hit).text, "Tea");
});

// ---------------------------------------------------------------- order

test("sorting by edit, creation and title", () => {
  const notes = [
    { id: "a", title: "Čaj", edited: "2026-11-01T10:00:00+01:00", created: "2026-10-01T10:00:00+01:00" },
    { id: "b", title: "Cibuľa", edited: "2026-11-03T10:00:00+01:00", created: "2026-09-01T10:00:00+01:00" },
    { id: "c", title: "", body: "zebra", edited: "2026-11-02T10:00:00+01:00", created: "2026-11-01T10:00:00+01:00" },
    { id: "d", title: "", body: "", edited: "2026-10-02T10:00:00+01:00", created: "2026-08-01T10:00:00+01:00" },
  ];
  assert.deepEqual(
    m.sortNotes(notes, "edited").map((n) => n.id),
    ["b", "c", "a", "d"],
  );
  assert.deepEqual(
    m.sortNotes(notes, "created").map((n) => n.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(
    m.sortNotes(notes, "title", "sk").map((n) => n.id),
    ["b", "a", "c", "d"],
  );
});

// ---------------------------------------------------------------- the trash

test("the trash counts 30 days", () => {
  const at = new Date(2026, 10, 1, 12, 0);
  const iso = m.isoLocal(at);
  assert.equal(m.trashDaysLeft(iso, at), 30);
  assert.equal(m.trashDaysLeft(iso, new Date(at.getTime() + 29.5 * 86400000)), 1);
  assert.equal(m.trashDaysLeft(iso, new Date(at.getTime() + 30 * 86400000)), 0);
  assert.equal(m.trashDaysLeft(iso, new Date(at.getTime() + 40 * 86400000)), 0);
});

// ---------------------------------------------------------------- reminders

test("repeat rules and the next reminder", () => {
  const tue = new Date(2026, 10, 3, 18, 30); // Tuesday 3 November 2026
  assert.equal(m.repeatRule("weekly", tue), "FREQ=WEEKLY;BYDAY=TU;DTSTART=20261103");
  assert.equal(m.repeatRule("monthly", tue), "FREQ=MONTHLY;BYMONTHDAY=3;DTSTART=20261103");
  assert.equal(m.repeatRule("yearly", tue), "FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=3;DTSTART=20261103");
  assert.equal(m.repeatRule("none", tue), "");
  for (const kind of ["daily", "weekdays", "weekly", "monthly", "yearly"])
    assert.equal(m.repeatKind(m.repeatRule(kind, tue)), kind);
  assert.equal(m.repeatKind("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;DTSTART=20261013"), "custom");
  assert.equal(m.repeatKind(""), "none");

  const at = m.isoLocal(tue);
  const wed = new Date(2026, 10, 4, 9, 0);
  assert.equal(m.nextReminder(at, "", new Date(2026, 10, 3, 9, 0)).getTime(), tue.getTime());
  assert.equal(m.nextReminder(at, "", wed), null);
  assert.equal(
    m.nextReminder(at, m.repeatRule("weekly", tue), wed).getTime(),
    new Date(2026, 10, 10, 18, 30).getTime(),
  );
  assert.equal(m.nextReminder(at, m.repeatRule("daily", tue), wed).getTime(), new Date(2026, 10, 4, 18, 30).getTime());
  assert.equal(
    m.nextReminder(at, m.repeatRule("monthly", tue), wed).getTime(),
    new Date(2026, 11, 3, 18, 30).getTime(),
  );
  const fri = new Date(2026, 10, 6, 19, 0);
  assert.equal(
    m.nextReminder(at, m.repeatRule("weekdays", tue), fri).getTime(),
    new Date(2026, 10, 9, 18, 30).getTime(),
  );
  // A repeating reminder never rings before its first time.
  const later = m.isoLocal(new Date(2026, 10, 20, 8, 0));
  assert.equal(
    m.nextReminder(later, m.repeatRule("daily", new Date(2026, 10, 20, 8, 0)), wed).getTime(),
    new Date(2026, 10, 20, 8, 0).getTime(),
  );
});

test("quick reminder times", () => {
  const morning = m.reminderPresets(new Date(2026, 10, 3, 10, 0));
  assert.deepEqual(
    morning.map((p) => [p.id, p.at.getDate(), p.at.getHours()]),
    [
      ["laterToday", 3, 18],
      ["tomorrow", 4, 8],
      ["nextWeek", 9, 8],
    ],
  );
  const evening = m.reminderPresets(new Date(2026, 10, 9, 18, 0));
  assert.deepEqual(
    evening.map((p) => [p.id, p.at.getDate()]),
    [
      ["tonight", 9],
      ["tomorrow", 10],
      ["nextWeek", 16],
    ],
  );
  assert.equal(m.reminderPresets(new Date(2026, 10, 3, 22, 0)).length, 2);
});

test("local date-times carry the offset", () => {
  assert.match(m.isoLocal(new Date(2026, 0, 2, 3, 4, 5)), /^2026-01-02T03:04:05[+-]\d{2}:\d{2}$/);
});

// ---------------------------------------------------------------- files

test("the JSON export reads back and leaves out the trash", () => {
  const data = sampleData(new Date(2026, 10, 3, 12, 0), "en");
  const json = JSON.parse(m.exportJson(data.note, new Date(2026, 10, 3, 12, 0)));
  assert.equal(json.format, "notes");
  assert.equal(json.version, 1);
  assert.equal(json.notes.length, data.note.filter((n) => !n.trashedAt).length);
  const list = json.notes.find((n) => n.title === "Groceries");
  assert.equal(list.kind, "list");
  assert.equal(list.pinned, true);
  assert.equal(list.labels, "Home");
  assert.ok(json.notes.some((n) => n.repeat && n.repeat.startsWith("FREQ=WEEKLY")));
  assert.ok(!JSON.stringify(json).includes("parking"));
});

test("CSV cells are quoted and guarded like Zapli's own exports", () => {
  assert.equal(m.csvCell("plain"), '"plain"');
  assert.equal(m.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(m.csvCell("=SUM(A1)"), '"\'=SUM(A1)"');
  assert.equal(m.csvCell("-12.5"), '"-12.5"');
  assert.equal(m.csvCell("- [ ] milk\n- [x] eggs"), "\"'- [ ] milk\n'- [x] eggs\"");
  assert.equal(m.csvCell("a, @b"), '"a, \'@b"');
  assert.equal(m.csvCell("\tx"), '"\'\tx"');
  const csv = m.exportCsv([
    { title: "A", body: "x", labels: "Home;Work", color: "red", pinned: true, created: "2026-11-01T10:00:00+01:00" },
    { title: "Gone", body: "y", trashedAt: "2026-11-01T10:00:00+01:00" },
  ]);
  assert.ok(csv.startsWith('\uFEFF"Title","Text","Labels"'));
  assert.ok(csv.includes('"Home, Work"'));
  assert.ok(!csv.includes("Gone"));
  assert.equal(csv.split("\r\n").length, 3);
});

test("file names carry the date", () => {
  assert.equal(m.fileName("json", new Date(2026, 0, 5)), "notes-2026-01-05.json");
});

// ---------------------------------------------------------------- the import mapping against the samples

const manifest = JSON.parse(readFileSync(join(pkg, "manifest.json"), "utf8"));
const mapping = manifest.actions.importNotes.steps[0].args.fields;
const loose = (name) =>
  name
    .trim()
    .replace(/\s*[([][^)\]]*[)\]]$/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** Which field each column of a header fills, as the import matches names (as written, then loosely). */
function mapColumns(columns) {
  const out = {};
  for (const [field, spec] of Object.entries(mapping)) {
    for (const name of spec.from) {
      const hit = columns.find((c) => c === name) || columns.find((c) => loose(c) === loose(name));
      if (hit) {
        out[field] = hit;
        break;
      }
    }
  }
  return out;
}

function csvHeader(text) {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0];
  const sep = first.includes(";") && !first.includes(",") ? ";" : ",";
  return first.split(sep).map((c) => c.replace(/^"|"$/g, ""));
}

test("every import sample maps its title and text", () => {
  const dir = join(here, "..", "import-samples");
  const files = readdirSync(dir);
  assert.ok(files.length >= 3);
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    const columns = file.endsWith(".json") ? Object.keys(JSON.parse(text).notes[0]) : csvHeader(text);
    const mapped = mapColumns(columns);
    assert.ok(mapped.body || mapped.title, file + ": no title or text column");
    for (const c of columns) {
      const used = Object.values(mapped).includes(c) || ["trashed", "isTrashed", "Deleted"].includes(c);
      assert.ok(used, file + ": column " + c + " is not read");
    }
  }
});

test("the app's own exports map completely", () => {
  const data = sampleData(new Date(2026, 10, 3, 12, 0), "en");
  const json = JSON.parse(m.exportJson(data.note, new Date()));
  const keys = new Set(json.notes.flatMap((n) => Object.keys(n)));
  const mapped = mapColumns([...keys]);
  for (const k of keys) assert.ok(Object.values(mapped).includes(k), "JSON key " + k);
  const header = csvHeader(m.exportCsv(data.note));
  const csvMapped = mapColumns(header);
  for (const c of header) assert.ok(Object.values(csvMapped).includes(c), "CSV column " + c);
});

// ---------------------------------------------------------------- texts

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

test("English and Slovak have the same texts, plural forms and values", () => {
  const { en, sk } = STRINGS;
  assert.deepEqual(Object.keys(sk).sort(), Object.keys(en).sort());
  const holes = (s) => [...JSON.stringify(s).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
  for (const key of Object.keys(en)) {
    assert.equal(typeof sk[key], typeof en[key], key);
    if (typeof en[key] === "object") {
      for (const form of ["one", "other"]) assert.ok(en[key][form], key + " en." + form);
      for (const form of ["one", "few", "other"]) assert.ok(sk[key][form], key + " sk." + form);
    }
    assert.deepEqual([...new Set(holes(sk[key]))], [...new Set(holes(en[key]))], key);
  }
  assert.equal(sk.appName, "Notes");
});

test("every text the code asks for exists", () => {
  const dynamic = [
    ...m.COLORS.map((c) => "color_" + c),
    "preset_laterToday",
    "preset_tonight",
    "preset_tomorrow",
    "preset_nextWeek",
    "repeatNone",
    "repeatDaily",
    "repeatWeekdays",
    "repeatWeekly",
    "repeatMonthly",
    "repeatYearly",
    "repeatCustom",
    "emptyNotesTitle",
    "emptyNotesText",
    "emptyLabelTitle",
    "emptyLabelText",
    "emptyRemindersTitle",
    "emptyRemindersText",
    "emptyArchiveTitle",
    "emptyArchiveText",
    "emptyTrashTitle2",
    "emptyTrashText2",
    "typeLists",
    "typeReminders",
    "typePhotos",
    "typePinned",
    "sortEdited",
    "sortCreated",
    "sortTitle",
    "navNotes",
    "navReminders",
    "navArchive",
    "navTrash",
  ];
  const used = new Set(dynamic);
  for (const file of sourceFiles(join(pkg, "js"))) {
    const code = readFileSync(file, "utf8");
    for (const match of code.matchAll(/\bt\("([A-Za-z0-9_]+)"\s*[,)]/g)) used.add(match[1]);
  }
  for (const key of used) assert.ok(key in STRINGS.en, "missing text: " + key);
});

test("plural forms are picked by number", () => {
  const sk = translator("sk");
  assert.equal(sk("noteCount", { n: 1 }), "1 poznámka");
  assert.equal(sk("noteCount", { n: 3 }), "3 poznámky");
  assert.equal(sk("noteCount", { n: 5 }), "5 poznámok");
  assert.equal(sk("noteCount", { n: 0 }), "0 poznámok");
  assert.equal(sk("resultCount", { n: 0 }), "Nič sa nenašlo");
  assert.equal(sk("goneInDays", { n: 2 }), "Natrvalo sa odstráni o 2 dni");
  const en = translator("en");
  assert.equal(en("noteCount", { n: 1 }), "1 note");
  assert.equal(en("noteCount", { n: 12 }), "12 notes");
  assert.equal(en("reminderSet", { when: "Today, 18:00" }), "Reminder: Today, 18:00");
  assert.equal(en("nope"), "nope");
  assert.equal(pickLanguage("", "sk-SK"), "sk");
  assert.equal(pickLanguage("", "de-AT"), "en");
  assert.equal(pickLanguage("en", "sk-SK"), "en");
  assert.equal(localeFor("sk", "en-US"), "sk-SK");
  assert.equal(localeFor("en", "en-US"), "en-US");
});

test("the manifest's texts exist in both languages and its purposes fit", () => {
  const strings = manifest.i18n.strings;
  const text = JSON.stringify(manifest);
  const keys = new Set([...text.matchAll(/"@([A-Za-z0-9_]+)"/g)].map((x) => x[1]));
  for (const match of text.matchAll(/t\('([A-Za-z0-9_]+)'/g)) keys.add(match[1]);
  for (const key of keys) {
    assert.ok(strings[key], "manifest text " + key);
    assert.ok(strings[key].en && strings[key].sk, "manifest text " + key + " in both languages");
  }
  for (const [id, entry] of Object.entries(manifest.permissions)) {
    const p = strings[entry.purpose.slice(1)];
    for (const lang of ["en", "sk"]) {
      assert.ok(p[lang].length >= 10 && p[lang].length <= 140, id + " purpose length (" + lang + ")");
      assert.ok(!/\b(Zapli|Android|Allow)\b/.test(p[lang]), id + " purpose names the host");
    }
  }
});

test("no network and no code from strings in the page", () => {
  for (const file of [...sourceFiles(join(pkg, "js")), join(pkg, "index.html"), join(pkg, "css", "app.css")]) {
    const code = readFileSync(file, "utf8");
    assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|serviceWorker/.test(code), file + " reaches the network");
    assert.ok(!/\beval\(|new Function\(|innerHTML/.test(code), file + " builds code or markup from strings");
  }
});

console.log("test-logic: " + passed + " checks passed");
