// Texts in the player's language. A game passes its own table of strings, one object per language:
//
//   { en: { key: "Text with {name}", count: { one: "# word", other: "# words" } }, sk: { … } }
//
// A plain string may hold {name} placeholders. A plural is an object with the forms of Intl.PluralRules ("one",
// "few", "many", "other"); "#" stands for the number. Keys a language lacks fall back to English.

export const SUPPORTED = ["en", "sk"];

/** The language to show: the player's choice, else the phone's (Zapli tells the page; a browser has its own). */
export function pickLang(choice, phoneLocale) {
  if (SUPPORTED.includes(choice)) return choice;
  const loc = String(phoneLocale || (typeof navigator !== "undefined" && navigator.language) || "en");
  return /^sk([-_]|$)/i.test(loc) ? "sk" : "en";
}

export function createI18n(strings) {
  let lang = "en";
  let table = strings.en;

  function fill(text, args) {
    return String(text).replace(/\{(\w+)\}/g, (all, name) => (args && name in args ? String(args[name]) : all));
  }

  function plural(forms, n) {
    let cat = "other";
    try {
      cat = new Intl.PluralRules(lang).select(n);
    } catch (e) {
      cat = n === 1 ? "one" : "other";
    }
    return forms[cat] || forms.other;
  }

  return {
    get lang() {
      return lang;
    },
    setLang(code) {
      lang = SUPPORTED.includes(code) ? code : "en";
      table = strings[lang];
    },
    /** A key's value as it is in the table (an object of names, say), in the language or else in English. */
    raw(key) {
      return key in table ? table[key] : strings.en[key];
    },
    has(key) {
      return key in table || key in strings.en;
    },
    /** The text of a key, its {placeholders} filled from args. */
    t(key, args) {
      const v = key in table ? table[key] : strings.en[key];
      if (v === undefined) return key;
      if (typeof v === "object") return fill(plural(v, 0).replace("#", "0"), args);
      return fill(v, args);
    },
    /** A count with its noun: a plural table { one: "# word", other: "# words" } gives "5 words" for 5. */
    tn(key, n, args) {
      const v = key in table ? table[key] : strings.en[key];
      if (v === undefined) return `${n} ${key}`;
      const form = typeof v === "object" ? plural(v, n) : v;
      return fill(form.replace("#", new Intl.NumberFormat(lang).format(n)), args);
    },
  };
}
