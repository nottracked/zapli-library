// Checks the rules for words made by tapping letters one by one (package/js/wheel/taps.mjs), without a browser
// (Node 22): a word that is an answer not found yet is taken at once; a longer word through it is never lost; the
// next word never needs an extra tap; nothing is taken that is no answer or was found before.
// Run: node dev/check-taps.mjs
import { EMPTY, tap, back, wordOf, fromWord } from "../package/js/wheel/taps.mjs";
import { tiles as tilesOf } from "../package/js/core/letters.mjs";

const problems = [];
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    problems.push(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};

// A wheel (its letters by position) and the answers not found yet; `found` grows as words are taken, as on the page.
function wheel(letters, answers, lang = "en") {
  const open = new Set(answers);
  const ctx = {
    letters,
    isNew: (t) => t.length >= 3 && open.has(t.join("")),
    leadsOn: (t) => {
      const s = t.join("");
      for (const w of open) if (w.startsWith(s)) return true;
      return false;
    },
  };
  let state = EMPTY;
  const taken = [];
  // Taps the letters of `text` in order, each on the first position with that letter that the current word does
  // not use (or, when all are used, the first one), as a player's finger would.
  const play = (text) => {
    for (const t of tilesOf(text, lang)) {
      const used = new Set(wordOf(state));
      let i = letters.findIndex((l, k) => l === t && !used.has(k));
      if (i < 0) i = letters.indexOf(t);
      const r = tap(state, i, ctx);
      state = r.state;
      if (r.taken) {
        taken.push(r.taken.join(""));
        open.delete(r.taken.join(""));
      }
    }
    return api;
  };
  const api = {
    play,
    tapAt(i) {
      const r = tap(state, i, ctx);
      state = r.state;
      if (r.taken) {
        taken.push(r.taken.join(""));
        open.delete(r.taken.join(""));
      }
      return api;
    },
    get word() {
      return wordOf(state)
        .map((i) => letters[i])
        .join("");
    },
    get lit() {
      return state.lit;
    },
    get state() {
      return state;
    },
    set state(v) {
      state = v;
    },
    taken,
    // The wheel clears a taken word by itself after a moment.
    linger() {
      if (state.lit) state = EMPTY;
      return api;
    },
  };
  return api;
}

// 1. A tapped answer is taken at once, and stays lit.
{
  const w = wheel(["c", "a", "t", "s", "n", "d"], ["cat", "sat", "and", "cats", "sand"]);
  w.play("ca");
  eq(w.taken, [], "two letters are never taken");
  w.play("t");
  eq(w.taken, ["cat"], "CAT is taken on its last letter");
  eq([w.word, w.lit], ["cat", true], "the taken word stays lit");
}

// 2. A longer word through a taken one is never lost (the wheel has two O's: K O L E S O).
{
  const w = wheel(["k", "o", "l", "e", "s", "o"], ["kol", "koleso", "les"], "sk");
  w.play("kol");
  eq(w.taken, ["kol"], "KOL is taken on the way");
  w.play("eso");
  eq(w.taken, ["kol", "koleso"], "KOLESO is taken too, built on through KOL");
  eq(w.word, "koleso", "the long word is what shows");
}

// 3. Straight on to the next word after a taken one: no extra tap.
{
  const w = wheel(["l", "e", "s", "n", "o", "k"], ["les", "seno", "noc", "lesk"], "sk");
  w.play("les");
  eq(w.taken, ["les"], "LES taken");
  w.play("s");
  eq([w.word, w.lit], ["s", false], "a tap on a letter of the lit word starts a new word with it");
  w.play("eno");
  eq(w.taken, ["les", "seno"], "SENO is taken right after LES");
}
{
  const w = wheel(["l", "e", "s", "n", "o", "k"], ["les", "noe", "lesk"], "sk");
  w.play("les").play("n");
  eq(w.word, "n", "a letter that leads nowhere from the lit word starts a new word");
  w.play("oe");
  eq(w.taken, ["les", "noe"], "the new word is taken");
}
{
  // CAT, then SAT: the S makes CATS (an answer, so it counts), then A cannot carry CATS on: the word becomes S A.
  const w = wheel(["c", "a", "t", "s", "n", "d"], ["cat", "cats", "sat", "and"]);
  w.play("cat").play("s");
  eq(w.taken, ["cat", "cats"], "CATS counts on the way");
  w.play("a");
  eq(w.word, "sa", "the taps after CAT that can still make a word are kept: SA");
  w.play("t");
  eq(w.taken, ["cat", "cats", "sat"], "SAT is taken without an extra tap");
}
{
  // CATS, then AND: S A leads to SAND for a moment, then N D falls back to the taps after CATS.
  const w = wheel(["c", "a", "t", "s", "n", "d"], ["cats", "sand", "and"]);
  w.play("cats").play("a");
  eq(w.word, "sa", "S A could still become SAND");
  w.play("n");
  eq(w.word, "san", "S A N still could");
  w.play("d");
  eq(w.taken, ["cats", "sand"], "SAND is taken");
}
{
  const w = wheel(["c", "a", "t", "s", "n", "d"], ["cats", "and", "dna"]);
  w.play("cats").play("a").play("n");
  eq(w.word, "an", "when nothing longer can be made, the taps after the taken word are the word");
  w.play("d");
  eq(w.taken, ["cats", "and"], "AND is taken");
}

// 4. Found words and words that are no answer.
{
  const w = wheel(["l", "e", "s", "y", "k"], ["lesk"], "sk");
  w.play("les");
  eq([w.taken, w.lit], [[], false], "a word that was found before (or is no answer) is not taken");
  w.play("y");
  eq(w.word, "lesy", "a word that is no answer is built as usual, for the tick");
  w.play("y");
  eq(w.word, "les", "a tap on the last letter takes it back");
  w.tapAt(1);
  eq(w.word, "les", "a tap on another letter of the word does nothing");
  w.play("k");
  eq(w.taken, ["lesk"], "LESK is taken");
}
{
  const w = wheel(["a", "b", "c"], ["abc"]);
  const before = w.state;
  w.tapAt(0).tapAt(0);
  eq([w.word, w.state === before || w.word === ""], ["", true], "two taps on one letter add and take it back");
}

// 5. The lit word clears by itself; a tap after that starts afresh.
{
  const w = wheel(["l", "e", "s", "k", "a"], ["les", "leska", "kel"], "sk");
  w.play("les").linger();
  eq([w.word, w.lit], ["", false], "the lit word is gone after a moment");
  w.play("k");
  eq(w.word, "k", "a tap after that is a new word, even where it could have carried the old one on");
}

// 6. Building on a taken word toward a longer one keeps it while it can still become a word.
{
  const w = wheel(["l", "e", "s", "k", "a"], ["les", "leska"], "sk");
  w.play("les").play("k");
  eq([w.word, w.lit], ["lesk", false], "LESK leads to LESKA: kept, not lit");
  w.play("a");
  eq(w.taken, ["les", "leska"], "LESKA is taken");
}

// 7. The delete key: one letter back, then built by hand (no rereading).
{
  const w = wheel(["l", "e", "s", "k", "a"], ["les", "leska"], "sk");
  w.play("les");
  w.state = back(w.state);
  eq([w.word, w.lit], ["le", false], "delete takes the last letter of a lit word");
  w.state = back(back(w.state));
  eq(w.state, EMPTY, "deleting the last letter leaves no word");
  eq(back(EMPTY), EMPTY, "delete on no word changes nothing");
}

// 8. CH is one letter and one tap.
{
  const w = wheel(["ch", "l", "i", "e", "b"], ["chlieb", "lieč"], "sk");
  w.play("chlieb");
  eq(w.taken, ["chlieb"], "CHLIEB is taken: CH is one tap");
}

// 9. A swipe the system interrupted becomes a word being built.
eq(fromWord([2, 0, 1]), { stream: [2, 0, 1], start: 0, lit: false, after: 0 }, "fromWord builds a plain word");
eq(fromWord([]), EMPTY, "fromWord of nothing is no word");

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else console.log("tapped words: all checks passed");
