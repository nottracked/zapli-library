// Builds the word lists the game ships (package/data/words-<lang>.txt) from their sources. Nothing here is shipped.
//
//   node dev/build-lists.mjs sk
//       Slovak, from the hand-written CC0 sources of the library's Word Wheel (../word-wheel/dev/sk/), read as they
//       are and never changed: answers-*.txt give the hidden words, accepted-*.txt further words a guess may be.
//   node dev/build-lists.mjs en --enable <enable1.txt> --esl <3esl.txt> --core <2of5core.txt>
//       English, from the public-domain ENABLE list and the 12dicts 3esl and 2of5core lists (dev/README.md says where
//       to get them; their SHA-256 must match the ones recorded below). Hidden words are the common words: in
//       2of5core and 3esl. Every ENABLE word of a playable length is a valid guess.
//   --check   build in memory and compare with the shipped file instead of writing it
//
// Words keep 4 to 7 letters, counted as the game counts them (js/core/letters.mjs: Slovak CH is one letter). Every
// word is normalised (Unicode NFC, lower case), must consist of the language's letters only and is kept once; a
// hidden word is not repeated among the further words.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalise, tiles } from "../package/js/core/letters.mjs";
import { formatWordList } from "../package/js/core/wordlist.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "package", "data");
const wheelDev = join(here, "..", "..", "word-wheel", "dev");

export const MIN = 4;
export const MAX = 7;

// The English sources as downloaded (dev/README.md): a different file means a different list, so it is refused.
const ENABLE_SHA256 = "3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89";
const ESL_SHA256 = "eb70e6169534511caff9e06971b3fa71981a83f0355b29532b710ea5a9df253b";
const CORE_SHA256 = "c89531e451a4841da4452618201d7d6ccb88aafee62fa829fdcdc73ed29bdc62";

function args(argv) {
  const out = { lang: argv[0], check: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") out.check = true;
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

function finish(lang, answersIn, acceptedIn, check, header, anyLength) {
  const fits = (w) => {
    const t = tiles(w, lang);
    return t && t.length >= MIN && t.length <= MAX;
  };
  const answers = Array.from(new Set(answersIn.filter(fits))).sort(byCodePoint);
  const inAnswers = new Set(answers);
  // Slovak keeps base forms of every length among the further words: the game never takes them as guesses of the
  // wrong length, but it can name them when a player types another form of such a word (stoly: STÔL).
  const keep = (w) => (anyLength ? Boolean(tiles(w, lang)) : fits(w));
  const accepted = Array.from(new Set(acceptedIn.filter((w) => keep(w) && !inAnswers.has(w)))).sort(byCodePoint);
  const text = formatWordList(header, answers, accepted);
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
  console.log(`${lang}: ${answers.length} hidden words (${byLength(answers)})`);
  console.log(`${lang}: ${accepted.length} further words (${byLength(accepted)})`);
  if (check) {
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

/** Words of a source file: whitespace-separated, "#" starts a comment that runs to the end of the line. */
function sourceWords(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*$/, "").split(/[\s,]+/))
    .filter(Boolean);
}

function buildSlovak(check) {
  const dir = join(wheelDev, "sk");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  const tiers = { answers: [], accepted: [] };
  let refused = 0;
  for (const f of files) {
    const tier = f.startsWith("answers-") ? "answers" : f.startsWith("accepted-") ? "accepted" : null;
    if (!tier) continue;
    for (const raw of sourceWords(join(dir, f))) {
      const word = normalise(raw);
      // Capitals (names) and characters outside the Slovak alphabet are never words of the list.
      if (raw.normalize("NFC") !== word || !tiles(word, "sk")) {
        refused++;
        continue;
      }
      tiers[tier].push(word);
    }
  }
  if (refused) console.log(`sk: ${refused} source entries left out (capitals or other characters)`);
  finish(
    "sk",
    tiers.answers,
    tiers.accepted.concat(tiers.answers),
    check,
    [
      "Hidden Word word list: Slovak. Dedicated to the public domain under CC0 1.0 (dev/README.md).",
      "Built by dev/build-lists.mjs from the hand-written CC0 sources of the library's Word Wheel; do not edit by hand.",
      "Base forms only: nouns in the nominative singular (or plural for plural-only nouns), verbs in the infinitive,",
      "adjectives, pronouns and numerals in the masculine nominative, and uninflected words.",
      "[answers]: the hidden words, of 4 to 7 letters. [accepted]: further base forms of any length; those of 4 to 7",
      "letters are valid guesses, the others name base forms.",
    ],
    true,
  );
}

function buildEnglish(opt) {
  if (!opt.enable || !opt.esl || !opt.core) {
    throw new Error("English needs --enable <enable1.txt>, --esl <3esl.txt> and --core <2of5core.txt>");
  }
  const enableBytes = readFileSync(opt.enable);
  const eslBytes = readFileSync(opt.esl);
  const coreBytes = readFileSync(opt.core);
  if (sha256(enableBytes) !== ENABLE_SHA256) throw new Error(`${opt.enable} is not the recorded ENABLE file`);
  if (sha256(eslBytes) !== ESL_SHA256) throw new Error(`${opt.esl} is not the recorded 3esl file`);
  if (sha256(coreBytes) !== CORE_SHA256) throw new Error(`${opt.core} is not the recorded 2of5core file`);
  // Word Wheel's lists of words left out, kept as SHA-256 so they do not spell the words out: slurs and swear words
  // never count; crude, sexual and grim words may be guessed but are never the hidden word.
  const hashes = (name) =>
    new Set(
      readFileSync(join(wheelDev, "en", name), "utf8")
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*$/, "").trim())
        .filter(Boolean),
    );
  const blocked = hashes("blocked-sha256.txt");
  const notAnswers = hashes("not-answers-sha256.txt");
  const lines = (bytes) =>
    bytes
      .toString("latin1")
      .split(/\r?\n/)
      // A line may hold two spellings ("center/centre"); each counts.
      .flatMap((l) => l.split("/"))
      .map((w) => w.trim());
  const ok = (w) => /^[a-z]+$/.test(w) && !blocked.has(sha256(w));
  const enable = lines(enableBytes).filter(ok);
  const inEnable = new Set(enable);
  const core = new Set(lines(coreBytes).filter(ok));
  const answers = lines(eslBytes).filter((w) => ok(w) && core.has(w) && inEnable.has(w) && !notAnswers.has(sha256(w)));
  finish("en", answers, enable, opt.check, [
    "Hidden Word word list: English, from public-domain sources (dev/README.md).",
    "[answers], the hidden words: words of both the 3esl and the 2of5core lists of 12dicts by Alan Beale",
    "(public domain) that the ENABLE list has. [accepted], further valid guesses: the ENABLE word list (public",
    "domain). Some offensive words are left out. Built by dev/build-lists.mjs; do not edit by hand.",
  ]);
}

const opt = args(process.argv.slice(2));
if (opt.lang === "sk") buildSlovak(opt.check);
else buildEnglish(opt);
