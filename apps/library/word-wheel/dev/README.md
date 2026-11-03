# Word Wheel: sources, word lists and checks

Nothing in `dev/` ships: a phone downloads only `package/`. This folder holds the sources of the word lists, the
script that builds the lists the game reads, and the checks that run without a browser.

## The word lists

The game reads two files, `package/data/words-sk.txt` and `package/data/words-en.txt` (format:
`package/js/core/wordlist.mjs`). Each has two tiers:

- **answer words** (`[answers]`): common words a puzzle may ask for;
- **accepted words** (`[accepted]`): more real words the game accepts as extra words, but never asks for. A word of
  the first tier is not repeated in the second.

Both files hold the words of 3 to 7 letters, what a wheel can hold. `dev/build-lists.mjs` writes them; never edit
them by hand. The next word games can build lists of other lengths from the same sources (`--min`, `--max`).

### Slovak: our own list, CC0 1.0

No Slovak word list under a licence that allows this use was found: the spell-checking dictionaries are GPL, LGPL or
MPL, and the corpus frequency lists come with terms of their own. So the Slovak list was written for this game,
word by word, in `dev/sk/`:

- `answers-*.txt`: the answer tier, by theme (people, home, nature, town, ideas, verbs, adjectives, other words, and
  more words gathered letter by letter);
- `accepted-*.txt`: the accepted tier (function words, verbs with prefixes, rarer nouns, diminutives, adjectives,
  adverbs).

It was not copied from, filtered through or checked against any other word list.

**Licence.** The Slovak word list (the files in `dev/sk/` and the Slovak list built from them,
`package/data/words-sk.txt`) is dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/): to the extent possible under law, its
authors have waived all copyright and related or neighbouring rights to it. Anyone may copy, change and use it, for
any purpose, without asking. The game's code is MIT, as the rest of the library.

**What a Slovak word is here:**

- **Base forms only**, as a dictionary lists them: nouns in the nominative singular (`ryba`), plural-only nouns in
  the plural (`nohavice`, `dvere`), verbs in the infinitive without `sa` or `si` (`robiť`, `smiať`), adjectives,
  pronouns and numerals in the masculine nominative singular (`pekný`, `môj`, `prvý`), and words that do not change
  (adverbs, prepositions, conjunctions, interjections).
- **Letters.** The letters with diacritics (á, ä, č, ď, é, í, ĺ, ľ, ň, ó, ô, ŕ, š, ť, ú, ý, ž) are letters of their
  own: `kôň` is not `kon`. **CH is one letter and one tile**, as in the Slovak alphabet and in Slovak crosswords,
  which write it in one square: a Slovak word never has a C followed by an H that are two letters, so the spelling
  alone always tells. **DZ and DŽ are two tiles**: they are letters of the alphabet too, but across a prefix they are
  two letters (`pod-zemie`, `od-žiť`), which the spelling alone cannot tell, and two tiles never make a word wrong.
  So the Slovak wheel has 44 possible letters (`package/js/core/letters.mjs`).
- **Left out:** proper nouns (names of people, places, days and feasts written with a capital), abbreviations,
  words with digits or hyphens, vulgar and offensive words, and slang. The answer tier also leaves out words that are
  rare, regional or archaic.
- **Spelling.** The build script refuses capitals and characters outside the alphabet, and prints warnings for a
  person to look at: a caron before e or i, y after a soft consonant, ä after another letter than b, m, p or v, two
  long syllables in a row (the rhythmic rule; loanwords and nouns in -ie are exceptions, which is why these are
  warnings), and a letter three times in a row.

A native speaker reviews the list before each release: `node dev/review-sheet.mjs <file.md>` writes every answer word
of the first 30 daily wheels and a random sample of 300 accepted words, numbered, to tick.

### English: public-domain sources

- **Accepted words: ENABLE** (Enhanced North American Benchmark Lexicon, the 2000 edition, file `enable1.txt`,
  172,823 words). Its README says: "The ENABLE master word list, WORD.LST, is herewith formally released into the
  Public Domain. Anyone is free to use it or distribute it in any manner they see fit." Read on 2026-11-03 at
  <https://sources.debian.org/src/scowl/6-2/r/enable/README> (the README as the SCOWL sources carry it). The file used
  was downloaded from <https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt>, SHA-256
  `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`.
- **Answer words: the 3esl list of 12dicts** (release 6.0.2, June 2016, by Alan Beale): about 22,000 words found in
  three dictionaries for learners of English, a core vocabulary. The package's ReadMe says: "The 12dicts lists were
  compiled by Alan Beale. I explicitly release them to the public domain, but request acknowledgment of their use."
  (Its caveat about AGID concerns only the 2of12inf and 2+2+3 lists, which are not used.) Read on 2026-11-03 at
  <https://wordlist.aspell.net/12dicts-readme/> and in `ReadMe.html` of
  <https://downloads.sourceforge.net/wordlist/12dicts-6.0.2.zip> (SHA-256
  `64ac1d35acb66b550c7ebc56e080b62e0bad8f5984d72059dc2e05ac48780e52`); the file used is `American/3esl.txt`, SHA-256
  `eb70e6169534511caff9e06971b3fa71981a83f0355b29532b710ea5a9df253b`. With thanks to Alan Beale for 12dicts.
- The answer tier is the 3esl words in lower case, of letters a to z only, that ENABLE also has. The accepted tier is
  the rest of ENABLE. Neither download is kept here: the build script checks their SHA-256 and builds the shipped
  file from them.
- **Left out:** `dev/en/blocked-sha256.txt` drops slurs and swear words from both tiers; `dev/en/not-answers-sha256.txt`
  keeps crude, sexual and grim words and some body parts as extra words but never asks for them. Both list the
  SHA-256 of each word (lower case, UTF-8), so the files do not spell the words out.

### Building and checking

From the app's folder (`apps/library/word-wheel/`), with Node 22:

```sh
node dev/build-lists.mjs sk                     # writes package/data/words-sk.txt from dev/sk/
node dev/build-lists.mjs en --enable <enable1.txt> --esl <3esl.txt>
node dev/build-lists.mjs sk --check             # fails when the shipped file is not what the sources build
node dev/check-game.mjs                         # letters, dates, a year of daily wheels, endless wheels, hints
node dev/check-i18n.mjs                         # English and Slovak texts complete and alike
node dev/check-page.mjs                         # ids the code looks up, and the wheel's swipe and taps
node dev/review-sheet.mjs <file.md>             # the review sheet for a native speaker
```

After a change to any file of `package/`, run `zapli library inventory apps/library/word-wheel --write`.

## The code

The game is split so that the next word games can reuse its parts:

- `package/js/core/`: shared by word games: letters and alphabets (`letters.mjs`), the word list format
  (`wordlist.mjs`), repeatable randomness (`rng.mjs`), days and streaks (`dates.mjs`), saved values in Zapli's store
  with a local copy (`store.mjs`) and texts in two languages (`i18n.mjs`).
- `package/js/wheel/`: this game: the generator (`generator.mjs`) and the crossword layout (`layout.mjs`), the state
  of a puzzle (`puzzle.mjs`), the puzzle source (`source.mjs`) and the texts (`strings.mjs`).
- `package/js/ui/`: views: the wheel, the crossword and a month calendar for daily puzzles.
- `package/workers/puzzles.mjs`: reads a word list once and makes puzzles off the page's thread.

Daily wheels are the same for every player because the generator takes its random numbers from the language and the
date (`rng.mjs`); a new word list changes the wheels of days not yet played.
