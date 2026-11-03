// The board: the lock that holds the guess being typed, and above it the log of guesses tried so far, newest next to
// the lock. Each guess is a card of letter chips, each chip with its mark: filled with a dot (in its place), outlined
// with a ring (in the word, elsewhere) or faded with a dash (not in the word). The lock shows the letters known in
// their places as faint letters in empty places, and opens when the word is found.

export function createBoard(els, { t, onSlot }) {
  const { log, cards, lock, slots, left } = els;
  let length = 0;

  function chip(tile, mark) {
    const c = document.createElement("span");
    c.className = `chip ${mark || ""}`.trim();
    const ch = document.createElement("span");
    ch.className = "ch";
    ch.textContent = tile.toUpperCase();
    const mk = document.createElement("span");
    mk.className = "mk";
    c.appendChild(ch);
    c.appendChild(mk);
    return c;
  }

  function markText(tile, mark) {
    const letter = tile.toUpperCase();
    if (mark === "hit") return t("markHit", { letter });
    if (mark === "near") return t("markNear", { letter });
    return t("markMiss", { letter });
  }

  function card(tiles, marks, n) {
    const li = document.createElement("li");
    li.className = "card";
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(n);
    no.setAttribute("aria-hidden", "true");
    const row = document.createElement("span");
    row.className = "chips";
    row.setAttribute("aria-hidden", "true");
    tiles.forEach((tile, i) => row.appendChild(chip(tile, marks[i])));
    li.appendChild(no);
    li.appendChild(row);
    li.setAttribute(
      "aria-label",
      t("guessLabel", {
        n,
        word: tiles.join("").toUpperCase(),
        marks: tiles.map((tile, i) => markText(tile, marks[i])).join(", "),
      }),
    );
    return li;
  }

  /** Draws every guess at once (a game opened or restored). */
  function setGuesses(list) {
    cards.textContent = "";
    list.forEach(({ tiles, marks }, i) => cards.appendChild(card(tiles, marks, i + 1)));
    scrollEnd();
  }

  /**
   * Adds a guess that was just tried: the card rises out of the lock into the log, then each chip stamps its mark in
   * turn. Returns how long that takes, in milliseconds (0 when motion is reduced).
   */
  function addGuess(tiles, marks, n, still) {
    const li = card(tiles, marks, n);
    if (!still) {
      li.classList.add("rise");
      li.querySelectorAll(".chip").forEach((c, i) => {
        c.classList.add("stamp");
        c.style.animationDelay = `${180 + i * 90}ms`;
      });
    }
    cards.appendChild(li);
    scrollEnd();
    return still ? 0 : 180 + tiles.length * 90 + 260;
  }

  function scrollEnd() {
    log.scrollTop = log.scrollHeight;
  }

  /** Builds the lock's places for a word length. */
  function setLength(n) {
    length = n;
    slots.textContent = "";
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.dataset.i = String(i);
      const ch = document.createElement("span");
      ch.className = "ch";
      b.appendChild(ch);
      slots.appendChild(b);
    }
  }

  /**
   * Shows the guess being typed: `places` the letters (null for an empty place), `caret` the place the next letter
   * goes to, `known` the letters known in their places (from earlier guesses and the hint), `given` the place of the
   * hint's letter while it stands given in the guess (-1 for none).
   */
  function setDraft(places, caret, known, given, typedAt, editable) {
    const buttons = slots.querySelectorAll(".slot");
    buttons.forEach((b, i) => {
      const tile = places[i];
      const ch = b.querySelector(".ch");
      const ghost = !tile && known[i];
      ch.textContent = (tile || known[i] || "").toUpperCase();
      b.classList.toggle("filled", Boolean(tile));
      b.classList.toggle("ghost", Boolean(ghost));
      b.classList.toggle("given", i === given);
      b.classList.toggle("caret", editable && i === caret);
      b.classList.toggle("typed", i === typedAt);
      b.disabled = !editable;
      const state = tile
        ? tile.toUpperCase()
        : known[i]
          ? t("slotKnown", { letter: known[i].toUpperCase() })
          : t("slotEmpty");
      b.setAttribute(
        "aria-label",
        i === given ? t("slotGiven", { n: i + 1, letter: tile.toUpperCase() }) : t("slotLabel", { n: i + 1, state }),
      );
      if (i === caret && editable) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
  }

  /** The shake of a guess that was refused. */
  function shake() {
    lock.classList.remove("shake");
    void lock.offsetWidth;
    lock.classList.add("shake");
  }

  /**
   * Opens the lock on the found word (`still` skips the motion) or, for a word not found, shows it in the places as
   * outlines. `closed` puts the lock back for a new word.
   */
  function finish(state, answerTiles, still) {
    lock.classList.remove("open", "failed", "opening");
    const buttons = slots.querySelectorAll(".slot");
    if (state === "closed") {
      buttons.forEach((b) => {
        b.classList.remove("win", "reveal");
        b.style.animationDelay = "";
      });
      return;
    }
    buttons.forEach((b, i) => {
      const ch = b.querySelector(".ch");
      ch.textContent = (answerTiles[i] || "").toUpperCase();
      b.classList.remove("ghost", "caret", "typed", "given");
      b.classList.add(state === "won" ? "win" : "reveal");
      b.style.animationDelay = still ? "" : `${i * 70}ms`;
      b.disabled = true;
      b.setAttribute("aria-label", t("slotLabel", { n: i + 1, state: ch.textContent }));
    });
    lock.classList.add(state === "won" ? "open" : "failed");
    if (state === "won" && !still) lock.classList.add("opening");
  }

  function setLeft(text) {
    left.textContent = text;
  }

  slots.addEventListener("click", (e) => {
    const b = e.target.closest(".slot");
    if (b && !b.disabled) onSlot(Number(b.dataset.i));
  });

  return {
    setGuesses,
    addGuess,
    setLength,
    setDraft,
    shake,
    finish,
    setLeft,
    scrollEnd,
    get length() {
      return length;
    },
  };
}
