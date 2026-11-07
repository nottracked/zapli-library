# Hidden Word: sources, word lists and checks

Nothing in `dev/` ships: a phone downloads only `package/`. This folder holds the script that builds the word lists
the game reads, and the checks that run without a browser.

## The word lists

The game reads two files, `package/data/words-sk.txt` and `package/data/words-en.txt`, in the word games' list
format (`package/js/core/wordlist.mjs`):

- **`[answers]`**: the hidden words, of 4 to 7 letters, common words a player can be asked to find;
- **`[accepted]`**: further words. In English, every word of 4 to 7 letters a guess may be. In Slovak, further base
  forms of any length: those of 4 to 7 letters are valid guesses, and the others let the game name the base form of a
  word typed in another form (`stoly`: STÔL has 4 letters).

Letters are counted as the game counts them (`package/js/core/letters.mjs`): in Slovak the letters with accents are
letters of their own, and CH is one letter, so `chlieb` has 5. `dev/build-lists.mjs` writes both files; never edit
them by hand.

### Slovak: the library's own list, CC0 1.0

The Slovak words come from the hand-written sources of the library's Word Wheel (`apps/library/word-wheel/dev/sk/`),
which were written word by word for the library's word games and dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (Word Wheel's `dev/README.md` says how). The
build script reads them as they are and never changes them: Word Wheel's answer words are Hidden Word's hidden words,
and its accepted words are further valid guesses.

They are **base forms only**, as a dictionary lists them: nouns in the nominative singular (or plural for plural-only
nouns), verbs in the infinitive, adjectives, pronouns and numerals in the masculine nominative, and words that do not
change. The game says so when a player types another form, and that guess costs nothing.

**Licence.** The Slovak list built from those sources, `package/data/words-sk.txt`, is dedicated to the public domain
under CC0 1.0 as its sources are: to the extent possible under law, its authors have waived all copyright and related
or neighbouring rights to it. The game's code and its other files are under the GNU General Public License, version 3
or later (`LICENSES/GPL-3.0-or-later.txt`); the English list keeps the public-domain status of its sources.

### English: public-domain sources

The same downloads as Word Wheel's, checked by their SHA-256:

- **Hidden words:** words of both the **3esl** and the **2of5core** lists of **12dicts** (release 6.0.2, June 2016,
  by Alan Beale), which ENABLE also has: about 2,800 common words of 4 to 7 letters. The package's ReadMe says: "The
  12dicts lists were compiled by Alan Beale. I explicitly release them to the public domain, but request
  acknowledgment of their use." Read on 2026-11-03 at <https://wordlist.aspell.net/12dicts-readme/>. The files used
  are `American/3esl.txt` (SHA-256 `eb70e6169534511caff9e06971b3fa71981a83f0355b29532b710ea5a9df253b`) and
  `Special/2of5core.txt` (SHA-256 `c89531e451a4841da4452618201d7d6ccb88aafee62fa829fdcdc73ed29bdc62`) from
  <https://downloads.sourceforge.net/wordlist/12dicts-6.0.2.zip> (SHA-256
  `64ac1d35acb66b550c7ebc56e080b62e0bad8f5984d72059dc2e05ac48780e52`). With thanks to Alan Beale for 12dicts.
- **Valid guesses: ENABLE** (Enhanced North American Benchmark Lexicon, the 2000 edition, `enable1.txt`): every word
  of 4 to 7 letters. Its README says: "The ENABLE master word list, WORD.LST, is herewith formally released into the
  Public Domain. Anyone is free to use it or distribute it in any manner they see fit." Read on 2026-11-03 at
  <https://sources.debian.org/src/scowl/6-2/r/enable/README>. The file used was downloaded from
  <https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt>, SHA-256
  `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`.
- **Left out:** the build reads Word Wheel's `dev/en/blocked-sha256.txt` (slurs and swear words, left out of both
  tiers) and `dev/en/not-answers-sha256.txt` (words that may be guessed but are never the hidden word: crude, sexual
  and grim words, abbreviations, odd, archaic and rare words, and forms of another word such as past tenses, so the
  hidden words are base forms). Both list the SHA-256 of each word, so they do not spell the words out.

Neither download is kept here.

### Daily and practice words

Each language and length has two fixed orders of its hidden words, shuffled with the repeatable randomness of
`package/js/core/rng.mjs` from the language and the length alone, so every phone has the same ones. The daily word of
a date is the word at the date's number in the daily order (`package/js/game/words.mjs`), so within a year no daily
word comes twice at a length, and everyone who plays the same language and length gets the same word. Practice goes
through the other order and passes over today's daily word. A new word list changes the words of days not yet
opened; a day already started keeps its word.

## Building and checking

From the app's folder (`apps/library/hidden-word/`), with Node 22:

```sh
node dev/build-lists.mjs sk                     # writes package/data/words-sk.txt from Word Wheel's dev/sk/
node dev/build-lists.mjs en --enable <enable1.txt> --esl <3esl.txt> --core <2of5core.txt>
node dev/build-lists.mjs sk --check             # fails when the shipped file is not what the sources build
node dev/check-game.mjs                         # marks, hard mode, hints, typing, the lists, a year of daily words
node dev/check-i18n.mjs                         # English and Slovak texts complete and alike
node dev/check-page.mjs                         # the page on a stand-in DOM: a whole game in both languages,
                                                # the word-language picker and the vibration
```

`dev/check-page.mjs` runs the real page code on `dev/stand-in-dom.mjs`, a small stand-in for the browser's DOM with
no layout, so it checks what the page does, not how it looks.

After a change to any file of `package/`, run `zapli library inventory apps/library/hidden-word --write`.

## The code

- `package/js/core/`: shared by the library's word games: letters and alphabets, the word list format, repeatable
  randomness, days and streaks, saved values in Zapli's store with a local copy, and texts in two languages.
- `package/js/game/`: this game: its rules and marks (`rules.mjs`), its words (`words.mjs`: the lists, the daily and
  practice words, Slovak base forms), the guess being typed (`draft.mjs`) and its texts (`strings.mjs`).
- `package/js/ui/`: views: the lock and its log of guesses (`board.mjs`), the keyboard (`keyboard.mjs`) and a month
  calendar of daily words (`calendar-view.mjs`).
- `package/js/main.mjs`: the page, which wires them together.
