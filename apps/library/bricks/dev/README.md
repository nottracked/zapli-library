# Bricks: how it is built and checked

Nothing in `dev/` ships: a phone downloads only `package/`. This folder holds the checks that run without a browser,
on Node 22, from the app's folder (`apps/library/bricks/`):

```sh
node dev/check-physics.mjs   # no tunnelling at up to 4,000 units a second, the paddle's angle rule, the minimum slope
node dev/check-levels.mjs    # every level: its picture, nothing walled in, and a bot that clears it (--quick: faster)
node dev/check-sprites.mjs   # every picture drawn at zero, tiny, negative and normal sizes, on a strict canvas
node dev/check-i18n.mjs      # English and Slovak texts complete, alike and all used
node dev/check-page.mjs      # the page itself, on a stand-in for the browser (dev/fake-dom.mjs), in eleven scenarios
```

One more check needs a Chromium (Playwright's cached headless shell, or any Chrome named in `CHROME`), driven over
the DevTools protocol with nothing but Node:

```sh
node dev/check-layout.mjs    # the board holds still while the score grows and power-ups start and end (--shots <dir>)
```

After a change to any file of `package/`, run `zapli library inventory apps/library/bricks --write`.

## The code

- `package/js/game/`: the game, with no drawing and no sound, so the checks can run it:
  - `arena.mjs`: the arena's fixed size (360 × 600 units; the page scales it to the screen);
  - `levels.mjs`: the 48 hand-made levels as pictures, one character a brick (the legend is at the top of the file);
  - `build.mjs`: turns a picture into bricks;
  - `physics.mjs`: continuous collision of a ball with boxes, the paddle's angle rule and the minimum slope;
  - `game.mjs`: one level in play, in fixed steps of 1/120 s: balls, paddle, bricks, power-ups, sparks and embers. It
    reports what happens as events and saves to plain JSON (`snapshot`, `restoreGame`);
  - `generate.mjs`: the daily level and the waves of endless play, made from a seed.
- `package/js/render/`: the canvas: `sprites.mjs` paints bricks, beads and glows once into small canvases;
  `renderer.mjs` draws each frame and the effects the game's events start.
- `package/js/audio/sound.mjs`: every sound, synthesised with Web Audio.
- `package/js/ui/`: the texts (`strings.mjs`), saved progress (`progress.mjs`) and the start screen's picture
  (`logo.mjs`).
- `package/js/core/`: shared with the library's word games: repeatable randomness, dates, texts in two languages and
  saved values in Zapli's store with a local copy.
- `package/js/main.mjs`: the page: screens, the game loop, input, results, settings and the app's life cycle.

## Making a level

Draw it in `levels.mjs` as rows of equal length (11 to 15 characters, at most 15 rows). Leave the top row empty when
you can: a ball that gets above the wall is the best moment of the game. Iron must never wall bricks in for good; a gap
of one brick is enough for the ball. Then run `node dev/check-levels.mjs`: it refuses walled-in bricks and rows that
slide into a wall, and its bot must clear the level. The time the bot needs is a rough measure of difficulty.
