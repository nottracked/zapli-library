// Development only (not shipped): checks the app's logic in Node, without a browser.
//
//   node dev/test-logic.mjs
//
// The store list (ids, kinds, colours that read, search, the country order), barcode types (detection as version
// 2.5.3 worked it out, the number checks, cleaning a typed number), the wallet's order and search, the points field,
// the manifest (every stored field of 2.5.3 kept with its type, every import column name kept, the export readable by
// the import, the import samples' columns mapped, expiry reminders as 2.5.3's setting left them), the made-up sample
// cards, and the texts (every key in both languages, the same values in each message).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRANDS,
  COUNTRIES,
  INKS,
  TONES,
  brandColours,
  brandForName,
  countryFor,
  fold,
  popular,
  search,
} from "./src/js/brands.mjs";
import { cardColours, contrast } from "./src/js/faces.mjs";
import {
  FORMAT_IDS,
  checkDigitSlip,
  cleanNumber,
  detectFormat,
  drawnFormat,
  groupedNumber,
  numberProblem,
} from "./src/js/formats.mjs";
import { STRINGS, pickLanguage, pluralForm, translator } from "./src/js/i18n.mjs";
import { sampleCards } from "./src/js/sample.mjs";
import { HOLD_MS, matches } from "./src/js/screens/wallet.mjs";
import { moved, orderedCards } from "./src/js/order.mjs";
import { readPoints } from "./src/js/screens/edit.mjs";
import { encode } from "./src/js/barcode/index.mjs";
import { gs1CheckDigit } from "./src/js/barcode/linear.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const manifest = JSON.parse(readFileSync(join(here, "src", "manifest.json"), "utf8"));
const old = JSON.parse(readFileSync(join(here, "fixtures", "store-2.5.3.json"), "utf8"));

let failures = 0;
let checks = 0;
const check = (ok, what) => {
  checks++;
  if (!ok) {
    failures++;
    console.log("FAIL", what);
  }
};
const eq = (a, b, what) =>
  check(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- the store list
const kinds = manifest.entities.card.fields.group.options.map((o) => o.value);
const ids = new Set();
for (const b of BRANDS) {
  check(!ids.has(b.id), `store id ${b.id} once`);
  ids.add(b.id);
  check(/^[a-z0-9-]{1,40}$/.test(b.id), `store id ${b.id} fits the card's brand field`);
  check(b.name && b.name.length <= 60, `${b.id} has a name that fits a card's store`);
  check(kinds.includes(b.kind), `${b.id}'s kind ${b.kind} is a kind of shop of the card`);
  check(TONES[b.tone], `${b.id}'s tone ${b.tone} is in the palette`);
  check(!b.ink || INKS[b.ink], `${b.id}'s ink ${b.ink} is in the palette`);
  check(
    COUNTRIES.some((c) => b[c]),
    `${b.id} is in at least one country's list`,
  );
  const { bg, fg } = brandColours(b);
  // A store's name on its tile is large bold text: WCAG asks for 3:1.
  check(contrast(bg, fg) >= 3, `${b.name}'s name reads on its tile (${contrast(bg, fg).toFixed(2)}:1)`);
}
for (const [name, tone] of Object.entries(TONES)) {
  // The small text of a face (the last digits) takes the tone's own text colour: 4.5:1.
  check(
    contrast(tone.bg, tone.fg) >= 4.5,
    `tone ${name} keeps small text readable (${contrast(tone.bg, tone.fg).toFixed(2)}:1)`,
  );
}
for (const c of COUNTRIES) {
  const ranks = BRANDS.filter((b) => b[c]).map((b) => b[c]);
  eq(ranks.length, new Set(ranks).size, `every place of the ${c} list is taken once`);
}
const counts = Object.fromEntries(COUNTRIES.map((c) => [c, BRANDS.filter((b) => b[c]).length]));
check(counts.sk >= 45 && counts.cz >= 45 && counts.int >= 30, `the lists are full enough: ${JSON.stringify(counts)}`);
eq(countryFor("sk-SK"), "sk", "Slovak phone opens Slovakia");
eq(countryFor("cs-CZ"), "cz", "Czech phone opens Czechia");
eq(countryFor("en-GB"), "int", "English phone opens the international list");
eq(countryFor("de-AT"), "int", "another language opens the international list");
eq(
  popular("sk")
    .slice(0, 4)
    .map((b) => b.id),
  ["kaufland", "lidl", "tesco", "billa"],
  "Slovakia's most popular stores first",
);
eq(popular("cz")[0].id, "albert", "Czechia's most popular store first");
eq(popular("int")[0].id, "tesco", "the international list's first store");
eq(search("kauf", "sk")[0].id, "kaufland", "a name's start finds it");
eq(search("clubcard", "sk")[0].id, "tesco", "another name finds the store");
eq(search("dr max", "sk")[0].id, "dr-max", "a name with a dot found with a space");
eq(search("drmax", "cz")[0].id, "dr-max", "and without one");
eq(search("zabka", "cz")[0].id, "zabka", "accents need not be typed");
eq(search("Žabka", "sk")[0].id, "zabka", "nor matter when they are");
check(
  search("lekaren", "sk").every((b) => b.kind === "medication"),
  "a kind's word finds pharmacies only",
);
eq(search("h&m", "sk")[0].id, "hm", "an ampersand");
eq(search("xyzzy", "sk").length, 0, "nothing for a store not in the list");
eq(search("coop", "cz")[0].id, "coop-cz", "the store of the chosen country first");
eq(search("coop", "sk")[0].id, "coop-jednota", "…in either country");
eq(brandForName("DM drogerie markt").id, "dm", "a card's typed name finds its store");
eq(brandForName("kaufland").id, "kaufland", "in lower case too");
eq(brandForName("Corner Grocer"), null, "a store not in the list has none");
eq(fold("Lekáreň Schneider"), "lekaren schneider", "folding drops accents and case");

// ---------------------------------------------------------------- barcode types
// The type version 2.5.3 drew an "auto" card in (its virtual field drawnFormat), as an independent reference.
const old253 = (n) =>
  n.length === 13 && /^\d+$/.test(n) && gs1CheckDigit(n.slice(0, 12)) === +n[12]
    ? "ean13"
    : n.length === 8 && /^\d+$/.test(n) && gs1CheckDigit(n.slice(0, 7)) === +n[7]
      ? "ean8"
      : n.length === 12 && /^\d+$/.test(n) && gs1CheckDigit(n.slice(0, 11)) === +n[11]
        ? "upcA"
        : /^[ -~]+$/.test(n)
          ? "code128"
          : "qr";
for (const n of [
  "4006381333931",
  "4006381333932",
  "96385074",
  "12345670",
  "036000291452",
  "400638133393",
  "GB-4471-0093",
  "Café 12",
  "2900123456785",
  "1234",
  "A12345B",
]) {
  eq(detectFormat(n), old253(n), `automatic type of ${n} as 2.5.3 drew it`);
}
eq(drawnFormat({ number: "4006381333931", format: "code128" }), "code128", "a chosen type is kept");
eq(drawnFormat({ number: "4006381333931", format: "auto" }), "ean13", "automatic works it out");
eq(cleanNumber(" 4006 3813 3393 1 "), "4006381333931", "spaces in a printed number go");
eq(cleanNumber("GB-4471 0093"), "GB-4471 0093", "a number with letters keeps its spaces");
eq(groupedNumber("2900123456785"), "2900\u20091234\u20095678\u20095", "digits in groups of four");
eq(groupedNumber("BTC-7781"), "BTC-7781", "other numbers as they are");
eq(numberProblem("2900123456", "ean13"), "ean13Needs12", "too short for EAN-13");
eq(numberProblem("4006381333932", "ean13"), "lastDigitThisEan", "a wrong EAN-13 check digit");
eq(numberProblem("400638133393", "ean13"), null, "12 digits get their check digit");
eq(numberProblem("04252615", "upcE"), "lastDigitThisUpc2", "a wrong UPC-E check digit");
eq(numberProblem("654321", "upcE"), null, "six UPC-E digits");
eq(numberProblem("abc", "code39"), "code39TakesCapital", "Code 39 lower case");
eq(numberProblem("Café", "code128"), "code128TakesPlain", "Code 128 accents");
eq(numberProblem("A123", "codabar"), "codabarTakesDigitsWith", "Codabar frame");
eq(numberProblem("4821337", "itf"), "itfNeedsEvenNumber", "ITF odd");
// A typed number with an EAN or UPC length whose last digit is off is asked about, not drawn as Code 128 silently.
for (const n of ["4006381333932", "7700123456781", "12345678", "036000291453"]) {
  eq(checkDigitSlip(n), "lastDigitTyped", `${n}: a slip in the last digit`);
}
for (const n of [
  "4006381333931",
  "7700123456786",
  "12345670",
  "036000291452",
  "1234567",
  "GB-4471-0093",
  "4006381333931234",
]) {
  eq(checkDigitSlip(n), null, `${n}: nothing to ask`);
}
eq(numberProblem("", "auto"), "numberMissing", "an empty number");
eq(numberProblem("x".repeat(301), "auto"), "thatIsTooLong", "a number too long");
// Every number the page accepts for a type, the encoder draws (except the length-only refusals the checks share).
for (const [n, f] of [
  ["400638133393", "ean13"],
  ["9638507", "ean8"],
  ["03600029145", "upcA"],
  ["654321", "upcE"],
  ["FS 008812", "code39"],
  ["A12345B", "codabar"],
  ["482133", "itf"],
]) {
  check(numberProblem(n, f) === null && encode(n, f).ok, `${f} ${n} accepted and drawn`);
}
eq(
  FORMAT_IDS.filter((f) => f !== "auto").sort(),
  manifest.entities.card.fields.format.options
    .map((o) => o.value)
    .filter((f) => f !== "auto")
    .sort(),
  "the page offers the manifest's barcode types",
);

// ---------------------------------------------------------------- the wallet
const cards = [
  { id: "a", store: "Zeta", uses: 1, lastUsed: "2026-10-01T10:00:00Z" },
  { id: "b", store: "alpha", uses: 9, lastUsed: "2026-09-01T10:00:00Z" },
  { id: "c", store: "Mid", uses: 3, pinned: true },
  { id: "d", store: "Old", uses: 50, archived: true },
  { id: "e", store: "Čaj", uses: 3, lastUsed: "2026-10-02T10:00:00Z", note: "Zľava v utorok" },
];
eq(
  orderedCards(cards, "use").map((c) => c.id),
  ["c", "b", "e", "a"],
  "favourites first, then most used, archived left out",
);
eq(
  orderedCards(cards, "recent").map((c) => c.id),
  ["c", "e", "a", "b"],
  "favourites first, then last used",
);
eq(
  orderedCards(cards, "name").map((c) => c.id),
  ["c", "b", "e", "a"],
  "favourites first, then A to Z without accents",
);
// The user's own order: the ids as moved; a card added since comes first among its group, newest first.
const own = [
  { id: "p", store: "P", pinned: true },
  { id: "q", store: "Q", pinned: true },
  { id: "r", store: "R" },
  { id: "s", store: "S" },
  { id: "t", store: "T" },
  { id: "n", store: "New", createdAt: "2026-11-04T10:00:00Z" },
];
const mine = ["q", "p", "t", "s", "r"];
eq(
  orderedCards(own, "mine", mine).map((c) => c.id),
  ["q", "p", "n", "t", "s", "r"],
  "my order, a new card first among the others",
);
eq(moved(own, "mine", mine, "s", -1), ["q", "p", "n", "s", "t", "r"], "move up within the others");
eq(moved(own, "mine", mine, "p", -1), ["p", "q", "n", "t", "s", "r"], "move up within the favourites");
eq(moved(own, "mine", mine, "q", -1), null, "the first favourite cannot move up");
eq(moved(own, "mine", mine, "r", 1), null, "the last card cannot move down");
eq(moved(own, "mine", mine, "n", 1), ["q", "p", "t", "n", "s", "r"], "a new card moves into the list");
eq(moved(cards, "use", [], "e", -1), ["c", "e", "b", "a"], "moving from another order starts from the order on show");
check(
  matches(cards[4], "caj") && matches(cards[4], "zlava") && !matches(cards[4], "zeta"),
  "search ignores accents and reads notes",
);
eq(HOLD_MS, 400, "a card lifts after the phone's own long press, 400 ms");
eq(readPoints("1 240,5"), 1240.5, "points with a decimal comma");
eq(readPoints("1,240.5"), 1240.5, "points with a decimal point");
eq(readPoints(""), null, "no points");
check(Number.isNaN(readPoints("abc")), "points that are no number");

// ---------------------------------------------------------------- the manifest and the update from 2.5.3
const fields = manifest.entities.card.fields;
for (const [name, type] of Object.entries(old.storedFields)) {
  eq(fields[name] && fields[name].type, type, `2.5.3's stored field ${name} kept with its type`);
}
const importStep = manifest.actions.importCards.steps[0].args.fields;
for (const [name, from] of Object.entries(old.importHeaders)) {
  const now = (importStep[name] && importStep[name].from) || [];
  for (const header of from) check(now.includes(header), `2.5.3's import column "${header}" still read into ${name}`);
}
const strings = manifest.i18n.strings;
const labelOf = (field, lang) => {
  const label = fields[field].label;
  return label && label.startsWith("@") ? strings[label.slice(1)][lang] : label;
};
for (const column of manifest.actions.exportCards.steps[0].args.columns) {
  check(fields[column], `exported column ${column} is a field`);
  for (const lang of ["en", "sk"]) {
    const label = labelOf(column, lang);
    const from = (importStep[column] && importStep[column].from) || [];
    check(from.includes(label), `the ${lang} export's column "${label}" imports back into ${column}`);
  }
}
for (const option of fields.group.options) {
  for (const lang of ["en", "sk"]) {
    const label = strings[option.label.slice(1)][lang];
    const values = importStep.group.values || {};
    check(
      values[label] === option.value || label.toLowerCase() === option.value,
      `kind "${label}" imports back as ${option.value}`,
    );
  }
}
const allFrom = Object.values(importStep).flatMap((f) => (f.from || []).map((h) => h.toLowerCase()));
for (const file of readdirSync(join(app, "import-samples"))) {
  const text = readFileSync(join(app, "import-samples", file), "utf8").replace(/^\ufeff/, "");
  const header = text.split(/\r?\n/)[0];
  const columns = header
    .split(header.includes(";") ? ";" : ",")
    .map((c) => c.replace(/^"|"$/g, "").trim().toLowerCase());
  const mapped = columns.filter((c) => allFrom.includes(c));
  check(mapped.length >= 2, `${file}: ${mapped.length} of ${columns.length} columns mapped (${mapped.join(", ")})`);
  check(
    importStep.store.from.some((h) => columns.includes(h.toLowerCase())),
    `${file}: a store column`,
  );
  check(
    importStep.number.from.some((h) => columns.includes(h.toLowerCase())),
    `${file}: a number column`,
  );
}
// 2.5.3's cards as the page reads them: a colour, a type, a code or the reason there is none.
for (const card of old.cards) {
  const colours = cardColours(card);
  check(
    /^#[0-9A-F]{6}$/i.test(colours.bg) && contrast(colours.bg, colours.fg) >= 3,
    `${card.store}: a face colour that reads`,
  );
  const format = drawnFormat(card);
  const drawn = encode(card.number, format).ok;
  check(drawn || card.store === "Mistyped Market", `${card.store}: its code (${format}) is drawn`);
}
eq(cardColours(old.cards[1]).bg, TONES.red.bg, "2.5.3's red colour becomes the palette's red");
eq(brandForName(old.cards[1].store).id, "kaufland", "a 2.5.3 card typed as kaufland finds its store");
check(
  !encode("4006381333932", "ean13").ok,
  "a 2.5.3 card with a wrong check digit is shown with its reason, not a wrong code",
);

// ---------------------------------------------------------------- expiry reminders as 2.5.3's users left them
// 2.5.3 had one setting for all cards, "Remind me before a card expires"; this version has a reminder per card
// (`remind`), which 2.5.3's cards do not have. The setting stays declared, so the value a user stored stays readable:
// a card without a reminder of its own follows it, a new card starts as it is, and the action keepReminderChoice
// (run by the page) writes it into each card that has none. The manifest's expressions must read exactly as these
// models of them, which are then run on 2.5.3's cards.
const declared = (manifest.settings || {}).expiryReminders || {};
for (const key of ["type", "default"]) {
  eq(declared[key], old.storedSettings.expiryReminders[key], `2.5.3's setting expiryReminders kept: ${key}`);
}
const GUARD =
  "=coalesce(item.remind, settings.expiryReminders) && has(item.expires) && item.expires >= today() && !item.archived";
eq(manifest.triggers.expirySoon.when, GUARD, "the expiry reminder asks the card first, then the old setting");
eq(fields.remind.default, "=settings.expiryReminders", "a new card's reminder starts as the old setting");
eq(
  manifest.queries.noReminderChoice,
  { entity: "card", where: "=!has(item.remind)", limit: 1000 },
  "the cards without a reminder of their own",
);
eq(
  (manifest.actions.keepReminderChoice || {}).steps,
  [{ type: "forEach", query: "noReminderChoice", do: "copyReminderChoice", args: { card: "=item.id" } }],
  "keepReminderChoice visits each of them",
);
eq(
  (manifest.actions.copyReminderChoice || {}).steps,
  [{ type: "updateRecord", record: "=args.card", set: { remind: "=settings.expiryReminders" } }],
  "and writes the old setting into it",
);
const TODAY = "2026-11-05";
const reminds = (card, settings) =>
  Boolean((card.remind ?? settings.expiryReminders) && card.expires != null && card.expires >= TODAY && !card.archived);
const reminds311 = (card) =>
  Boolean((card.remind ?? true) && card.expires != null && card.expires >= TODAY && !card.archived);
const kept = (cards, settings) => cards.map((c) => (c.remind == null ? { ...c, remind: settings.expiryReminders } : c));
const due = (cards, rule) => cards.filter(rule).map((c) => c.store);
const OFF = { expiryReminders: false };
const ON = { expiryReminders: true };
const UNTOUCHED = { expiryReminders: declared.default };
check(due(old.cards, reminds311).length > 0, "2.5.3's cards include one an expiry reminder is due for");
eq(
  due(old.cards, (c) => reminds(c, OFF)),
  [],
  "turned off in 2.5.3: no card reminds",
);
eq(
  due(kept(old.cards, OFF), (c) => reminds(c, OFF)),
  [],
  "turned off: none either once the setting is written in",
);
for (const [settings, what] of [
  [ON, "left on"],
  [UNTOUCHED, "never touched"],
]) {
  eq(
    due(old.cards, (c) => reminds(c, settings)),
    due(old.cards, reminds311),
    `${what}: the cards remind as in 3.1.1`,
  );
  eq(
    due(kept(old.cards, settings), (c) => reminds(c, settings)),
    due(old.cards, reminds311),
    `${what}: the same once the setting is written in`,
  );
}
const later = { store: "Later Card", expires: "2027-03-01", archived: false };
eq(reminds({ ...later, remind: UNTOUCHED.expiryReminders }, UNTOUCHED), true, "a new install: a new card reminds");
eq(reminds({ ...later, remind: OFF.expiryReminders }, OFF), false, "turned off: a card added later starts off");
eq(reminds({ ...later, remind: true }, OFF), true, "turned off: a card switched on by hand reminds");

// ---------------------------------------------------------------- sample cards
for (const card of sampleCards()) {
  check(numberProblem(card.number, card.format) === null, `sample ${card.store}: its number fits its type`);
  check(encode(card.number, drawnFormat(card)).ok, `sample ${card.store}: its code is drawn`);
  check(
    Object.values(TONES).some((t) => t.bg === card.color),
    `sample ${card.store}: a palette colour`,
  );
  check(kinds.includes(card.group), `sample ${card.store}: a kind of shop`);
  check(!brandForName(card.store), `sample ${card.store}: a made-up store, not one of the list`);
}

// ---------------------------------------------------------------- texts
const en = STRINGS.en;
const sk = STRINGS.sk;
for (const key of Object.keys(en)) {
  check(key in sk, `Slovak has ${key}`);
  const names = (m) => [...new Set([...JSON.stringify(m).matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort().join();
  if (key in sk) eq(names(sk[key]), names(en[key]), `${key} takes the same values in both languages`);
}
for (const key of Object.keys(sk)) check(key in en, `English has ${key}`);
eq(sk.appName, en.appName, "the app's name is the same in both languages");
eq(pickLanguage("auto", "sk-SK"), "sk", "a Slovak phone");
eq(pickLanguage("auto", "cs-CZ"), "sk", "a Czech phone reads Slovak");
eq(pickLanguage("en", "sk-SK"), "en", "the user's choice wins");
eq(
  [1, 2, 4, 5, 0].map((n) => pluralForm("sk", n)),
  ["one", "few", "few", "other", "other"],
  "Slovak plural forms",
);
eq(translator("sk")("queueDone", { n: 3 }), "Pridané 3 karty.", "a Slovak plural message");
eq(translator("en")("points", { n: 1 }), "1 point", "an English plural message");
for (const [lang, table] of Object.entries(STRINGS)) {
  for (const [key, value] of Object.entries(table)) {
    for (const text of typeof value === "object" ? Object.values(value) : [value]) {
      check(
        !/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(text),
        `${lang}.${key} has no invisible characters`,
      );
      check(!/\bzapli\b/i.test(text), `${lang}.${key} never names the host`);
    }
  }
}

console.log(failures ? `${failures} of ${checks} checks failed` : `All ${checks} logic checks passed.`);
process.exit(failures ? 1 : 0);
