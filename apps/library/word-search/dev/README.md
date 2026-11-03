# Word Search: themes, checks and the code

Nothing in `dev/` ships: a phone downloads only `package/`. This folder holds the checks that run without a browser
and the review sheet for the Slovak themes.

## The themes and hidden messages

The game reads its words from two modules, `package/js/data/themes-en.mjs` and `package/js/data/themes-sk.mjs`. Each
has:

- `THEMES`: 46 themes, the same ids in the same order in both languages, each with a name and its words, common
  nouns of 3 to 12 letters, separated by spaces (more than 1,600 words in each language);
- `MESSAGES`: the hidden messages, traditional sayings and short cheers. Once every word of a puzzle is found, the
  squares no word uses spell one of them, read row by row.

The themes, their words and the messages were written for this game. They were not copied from, filtered through or
checked against any other game's lists. The sayings are traditional proverbs, which belong to everyone.

**Licence.** The themes and messages (the files in `package/js/data/`) are dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/): to the extent possible under law, their authors
have waived all copyright and related or neighbouring rights to them. Anyone may copy, change and use them, for any
purpose, without asking. The game's code and its other files are under the GNU General Public License, version 3 or
later (`LICENSES/GPL-3.0-or-later.txt`).

**What a word is here:**

- **Common nouns only**, no names of people, places, brands or feasts written with a capital, and no abbreviations.
- **Slovak words in their base form:** the nominative singular (`ryba`), and plural-only nouns in the plural
  (`nohavice`, `dvere`, `halušky`).
- **Letters.** Slovak letters with diacritics are letters of their own, and **CH is one letter in one square**, as
  in Slovak crosswords and in Word Wheel (`package/js/core/letters.mjs`, shared with it): `chlieb` fills five squares.
  DZ and DŽ are two squares.
- **English words** avoid the ones spelled differently on the two sides of the Atlantic (colour, centre, theatre), so
  every player finds the spelling they expect.
- No word is part of another word of the same puzzle (CAT and CATERPILLAR never meet): the generator leaves such a pair
  out, so a word can never be found inside another.

**Filler letters.** The squares of a puzzle without a hidden message are filled with letters drawn in proportion to
how often each letter turns up in the language's text (`package/js/search/filler.mjs`), so the hidden words do not
stand out by their letters.

A native speaker reviews the Slovak themes before each release: `node dev/review-sheet.mjs <file.md>` writes every
theme's words and every message, numbered, to tick. Words that the library's Slovak word list
(`apps/library/word-wheel/dev/sk/`) does not have are marked to check first.

## Checks

From the app's folder (`apps/library/word-search/`), with Node 22:

```sh
node dev/check-game.mjs        # themes; every theme at every size, with and without a message; 400 daily puzzles
node dev/check-page.mjs        # the page on a stand-in DOM: drags, taps, hints, solving, themes, Undo, daily, Slovak
node dev/check-i18n.mjs        # English and Slovak texts complete and alike; How to play starts with 15 seconds
node dev/review-sheet.mjs <file.md>
```

After a change to any file of `package/`, run `zapli library inventory apps/library/word-search --write`.

## The code

- `package/js/core/`: shared by the word games (the same files as Word Wheel's): letters and alphabets, repeatable
  randomness, days and streaks, saved values in Zapli's store with a local copy, and texts in two languages.
- `package/js/search/`: this game. The themes as words and tiles (`themes.mjs`), sizes and directions by level, by
  difficulty and by weekday (`levels.mjs`), the generator (`generator.mjs`), filler letters (`filler.mjs`), the rules of
  play (`puzzle.mjs`) and the texts (`strings.mjs`).
- `package/js/ui/`: the letter grid with its capsules and gestures (`board-view.mjs`) and the month calendar of daily
  puzzles (`calendar-view.mjs`, shared with Word Wheel).
- `package/js/main.mjs`: the page, which wires them together.

A puzzle takes a few milliseconds to make (the slowest of the puzzles checked, a 12 × 12 grid with a hidden message, under 15 ms on a laptop), so
the page makes it itself and needs no worker. Daily puzzles are the same for everyone because the generator takes its
random numbers from the language and the date; a change to the themes or the generator changes the puzzles of days not
yet played.
