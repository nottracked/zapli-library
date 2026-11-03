// Builds the word list files the game ships (package/data/words-<lang>.txt) from their sources.
//
//   node dev/build-lists.mjs sk
//       Slovak, from the hand-written sources in dev/sk/ (answers-*.txt and accepted-*.txt).
//   node dev/build-lists.mjs en --enable <enable1.txt> --esl <3esl.txt> --core <2of5core.txt>
//       English, from the public-domain ENABLE list and the 12dicts 3esl and 2of5core lists (dev/README.md says where
//       to get them; their SHA-256 must match the ones recorded below). 2of5core marks the answer words that count as
//       common, which are the hidden words a wheel counts; Slovak counts every answer word as common.
//   --min <n> --max <n>   the shortest and longest words kept, in tiles (default 3 and 7, what a wheel can hold)
//   --check               build in memory and compare with the shipped file instead of writing it
//
// Every word is normalised (Unicode NFC, lower case), must consist of the language's letters only (js/core/letters.mjs)
// and is kept once. A word of the answer tier is not repeated in the accepted tier. The Slovak sources also get the
// spelling checks below, which print warnings for a person to look at; they never change a word.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalise, tiles } from "../package/js/core/letters.mjs";
import { formatWordList } from "../package/js/core/wordlist.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "package", "data");

// The English sources as downloaded (dev/README.md): a different file means a different list, so it is refused.
const ENABLE_SHA256 = "3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89";
const ESL_SHA256 = "eb70e6169534511caff9e06971b3fa71981a83f0355b29532b710ea5a9df253b";
const CORE_SHA256 = "c89531e451a4841da4452618201d7d6ccb88aafee62fa829fdcdc73ed29bdc62";

function args(argv) {
  const out = { lang: argv[0], min: 3, max: 7, check: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") out.check = true;
    else if (a === "--min") out.min = Number(argv[++i]);
    else if (a === "--max") out.max = Number(argv[++i]);
    else if (a === "--enable") out.enable = argv[++i];
    else if (a === "--esl") out.esl = argv[++i];
    else if (a === "--core") out.core = argv[++i];
    else throw new Error(`unknown option ${a}`);
  }
  if (out.lang !== "sk" && out.lang !== "en") throw new Error("say which list to build: sk or en");
  return out;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Words of a source file: whitespace-separated, "#" starts a comment that runs to the end of the line. */
function sourceWords(path) {
  const out = [];
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .forEach((line, n) => {
      const text = line.replace(/#.*$/, "");
      for (const raw of text.split(/[\s,]+/)) {
        if (raw) out.push({ raw, at: `${path.slice(here.length + 1)}:${n + 1}` });
      }
    });
  return out;
}

// ---- Slovak spelling checks (warnings only)

const LONG = new Set(["á", "é", "í", "ó", "ú", "ý", "ô", "ĺ", "ŕ"]);
const VOWEL = new Set(["a", "á", "ä", "e", "é", "i", "í", "o", "ó", "ô", "u", "ú", "y", "ý"]);

/** The syllable nuclei of a word, each marked long or short (diphthongs ia, ie, iu and ô are long). */
function nuclei(word) {
  // A final -ia, -ie, -iu or -ium is not counted: in loanwords (história, štúdium) it is no diphthong, and nouns in
  // -ie (prianie) keep it after a long syllable by rule.
  const ch = Array.from(word.replace(/i[aeu]m?$/, "a"));
  const out = [];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c === "i" && (ch[i + 1] === "a" || ch[i + 1] === "e" || ch[i + 1] === "u") && i > 0 && !VOWEL.has(ch[i - 1])) {
      out.push(true);
      i++;
    } else if (VOWEL.has(c)) out.push(LONG.has(c));
    else if (c === "ĺ" || c === "ŕ") out.push(true);
    else if ((c === "r" || c === "l") && i > 0 && !VOWEL.has(ch[i - 1]) && !VOWEL.has(ch[i + 1] || "a"))
      out.push(false);
  }
  return out;
}

function slovakWarnings(word) {
  const w = [];
  if (/[ďťňľ][eéiíy]/.test(word)) w.push("a caron on d, t, n or l before e or i");
  if (/[čšžjďťňľ][yý]/.test(word)) w.push("y after a soft consonant");
  if (/[^bmpv]ä/.test(word) || /^ä/.test(word)) w.push("ä after a letter other than b, m, p, v");
  const n = nuclei(word);
  for (let i = 1; i < n.length; i++) {
    if (n[i] && n[i - 1]) {
      w.push("two long syllables in a row");
      break;
    }
  }
  if (/(.)\1\1/.test(word)) w.push("a letter three times in a row");
  return w;
}

// ---- building

function finish(lang, answersIn, acceptedIn, opt, header, commonIn) {
  const fits = (w) => {
    const t = tiles(w, lang);
    return t && t.length >= opt.min && t.length <= opt.max;
  };
  const answers = Array.from(new Set(answersIn.filter(fits))).sort(byCodePoint);
  const inAnswers = new Set(answers);
  const accepted = Array.from(new Set(acceptedIn.filter((w) => fits(w) && !inAnswers.has(w)))).sort(byCodePoint);
  const common = commonIn ? answers.filter((w) => commonIn.has(w)) : null;
  if (common) console.log(`${lang}: ${common.length} of the answer words marked common`);
  const text = formatWordList(header, answers, accepted, common);
  const file = join(dataDir, `words-${lang}.txt`);
  const byLength = (list) => {
    const counts = {};
    for (const w of list) {
      const n = tiles(w, lang).length;
      counts[n] = (counts[n] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([n, c]) => `${n}:${c}`)
      .join(" ");
  };
  console.log(`${lang}: ${answers.length} answer words (${byLength(answers)})`);
  console.log(`${lang}: ${accepted.length} more accepted words (${byLength(accepted)})`);
  if (opt.check) {
    let shipped = "";
    try {
      shipped = readFileSync(file, "utf8");
    } catch (e) {
      shipped = "";
    }
    if (shipped !== text) {
      console.error(`${file} is not what the sources build: run without --check`);
      process.exitCode = 1;
    } else console.log(`${file} is up to date`);
  } else {
    writeFileSync(file, text);
    console.log(`wrote ${file} (${Buffer.byteLength(text)} bytes)`);
  }
}

function buildSlovak(opt) {
  const dir = join(here, "sk");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  const tiers = { answers: [], accepted: [] };
  const firstAt = new Map();
  let errors = 0;
  let warnings = 0;
  for (const f of files) {
    const tier = f.startsWith("answers-") ? "answers" : f.startsWith("accepted-") ? "accepted" : null;
    if (!tier) continue;
    for (const { raw, at } of sourceWords(join(dir, f))) {
      const word = normalise(raw);
      if (raw.normalize("NFC") !== word) {
        console.error(`${at}: "${raw}" has capitals: names are not words of the list`);
        errors++;
        continue;
      }
      if (!tiles(word, "sk")) {
        console.error(`${at}: "${raw}" has a character that is no Slovak letter`);
        errors++;
        continue;
      }
      const seen = firstAt.get(word);
      if (seen && seen.tier === tier) {
        if (process.env.SHOW_DUPLICATES) console.log(`${at}: "${word}" again (first at ${seen.at})`);
      } else if (!seen) {
        firstAt.set(word, { tier, at });
        for (const w of slovakWarnings(word)) {
          console.log(`${at}: "${word}": ${w}`);
          warnings++;
        }
      }
      tiers[tier].push(word);
    }
  }
  if (errors) throw new Error(`${errors} errors in the Slovak sources`);
  console.log(`sk: ${warnings} spelling warnings to look at`);
  finish("sk", tiers.answers, tiers.accepted, opt, [
    "Word Wheel word list: Slovak. Dedicated to the public domain under CC0 1.0 (dev/README.md).",
    "Built from the hand-written sources in dev/sk/ by dev/build-lists.mjs; do not edit by hand.",
    "Base forms only: nouns in the nominative singular (or plural for plural-only nouns), verbs in the infinitive,",
    "adjectives, pronouns and numerals in the masculine nominative, and uninflected words.",
  ]);
}

function buildEnglish(opt) {
  if (!opt.enable || !opt.esl || !opt.core) {
    throw new Error("English needs --enable <enable1.txt>, --esl <3esl.txt> and --core <2of5core.txt>");
  }
  const coreBytes = readFileSync(opt.core);
  if (sha256(coreBytes) !== CORE_SHA256) throw new Error(`${opt.core} is not the recorded 2of5core file`);
  // Lines may hold two spellings ("center/centre"); each counts.
  const core = new Set(
    coreBytes
      .toString("latin1")
      .split(/\r?\n/)
      .flatMap((l) => l.split("/"))
      .map((w) => w.trim())
      .filter((w) => /^[a-z]+$/.test(w)),
  );
  const enableBytes = readFileSync(opt.enable);
  const eslBytes = readFileSync(opt.esl);
  if (sha256(enableBytes) !== ENABLE_SHA256) throw new Error(`${opt.enable} is not the recorded ENABLE file`);
  if (sha256(eslBytes) !== ESL_SHA256) throw new Error(`${opt.esl} is not the recorded 3esl file`);
  const hashes = (name) =>
    new Set(
      readFileSync(join(here, "en", name), "utf8")
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*$/, "").trim())
        .filter(Boolean),
    );
  const blocked = hashes("blocked-sha256.txt");
  const notAnswers = hashes("not-answers-sha256.txt");
  const ok = (w) => /^[a-z]+$/.test(w) && !blocked.has(sha256(w));
  const enable = enableBytes
    .toString("latin1")
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(ok);
  const inEnable = new Set(enable);
  const esl = eslBytes
    .toString("latin1")
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter((w) => ok(w) && inEnable.has(w) && !notAnswers.has(sha256(w)));
  finish(
    "en",
    esl,
    enable,
    opt,
    [
      "Word Wheel word list: English, from public-domain sources (dev/README.md).",
      "Answer words: the 3esl list of 12dicts by Alan Beale (public domain), as far as ENABLE has them.",
      "Accepted words: the ENABLE word list (public domain).",
      "Common words (hidden words a wheel counts): the 2of5core list of 12dicts (public domain), as far as the answers",
      "have them. Built by dev/build-lists.mjs; do not edit by hand. Some offensive words are left out of both tiers.",
    ],
    core,
  );
}

const opt = args(process.argv.slice(2));
if (opt.lang === "sk") buildSlovak(opt);
else buildEnglish(opt);
