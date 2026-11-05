# Loyalty cards: development notes

Loyalty cards ships as one file, `index.html`, so Zapli can carry it built in. That file is made by `dev/build.mjs`
from the readable sources in `dev/src/`; edit the sources, never `index.html`, and build again:

```sh
node dev/build.mjs           # writes index.html
node dev/build.mjs --check   # exits 1 when index.html is not what dev/src builds
```

The build puts `dev/src/manifest.json` (the records, the import and export mappings, the expiry reminder and the
earlier setting it still reads, the widget and the actions the page runs: the code's brightness, the full-screen code,
counting a use, writing that setting into older cards) into the page's manifest element, `dev/src/css/app.css` into a
`<style>` element, and the modules of `dev/src/js/` into one module script, each module a block of its own in the
order they import each other. Nothing is minified: names, comments and lines stay as written.

## The modules (`dev/src/js/`)

| File                   | What it does                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `app.mjs`              | Start-up, the language, the hash routes and Back                                                  |
| `store.mjs`            | The cards through `zapli.data`, photos and settings in `zapli.data.kv`; a browser preview         |
| `order.mjs`            | The wallet's order: favourites first, then most used, last used, A to Z or the user's own         |
| `brands.mjs`           | The store list: names, kinds of shop, the palette's colours, ranks by country, search             |
| `faces.mjs`            | Card faces and store tiles, their colours and contrast, fitting names and numbers to a line       |
| `formats.mjs`          | Barcode types: the type of a typed number, the number checks, cleaning and grouping               |
| `barcode/*.mjs`        | The encoders of all thirteen barcode types and the SVG drawing                                    |
| `photos.mjs`           | Photos of cards (made small for the store), barcodes read from pictures                           |
| `i18n.mjs`             | Every text in English and Slovak                                                                  |
| `ui.mjs`               | Shared pieces: elements, the snackbar with Undo, sheets, the bar above the keyboard, haptics      |
| `icons.mjs`            | The app's line icons                                                                              |
| `sample.mjs`           | Made-up cards for the browser preview and the listing                                             |
| `screens/wallet.mjs`   | The wallet: faces, favourites, search; holding a card for its menu, dragging it to reorder        |
| `screens/add.mjs`      | Adding a card, before and after a scan                                                            |
| `screens/chooser.mjs`  | The one field that finds the store or names the card, the tiles, the bar's main button            |
| `screens/transfer.mjs` | The scanner, saving a new card and landing on it, the typed number, screenshots, CSV files        |
| `screens/card.mjs`     | A card at the till: the code, full screen, brightness, swiping, details, photos, share, moving it |
| `screens/edit.mjs`     | Editing a card                                                                                    |
| `screens/settings.mjs` | Settings and the archived cards                                                                   |

The barcode encoders follow the standards named in each file; the tables (`qr-tables.mjs`, `pdf417-patterns.mjs`)
are the standards' tables, and `dev/test-barcodes.mjs` reads every kind back with ZXing's decoders.

## Checks

From the app's folder, with Node.js 22 (the browser checks also need a Chromium: `CHROME`, or Playwright's cached
headless shell, or Google Chrome; they refuse to run on an `index.html` that is not what `dev/src` builds):

```sh
node dev/test-logic.mjs                       # store list, barcode types, the wallet's orders, manifest, update from 2.5.3, texts
node dev/test-barcodes.mjs                    # check digits, refusals, sizes
ZXING_JAR=<zxing core 3.5.x jar> node dev/test-barcodes.mjs   # and every code read back by ZXing (Java 17)
node dev/test-flows.mjs                       # every way of adding a card, holding, dragging and moving cards, editing,
                                              # Back after a reload, the code full screen, large text, screen readers,
                                              # expiry reminders of cards kept from 2.5.3
node dev/shots.mjs --out <dir>                # screenshots: 360 × 800, 412 × 915 and 412 × 600, light and dark, 200 %, turned
node dev/make-sample-data.mjs                 # prints the listing's sampleData
```

The browser checks run the built `index.html` on a stand-in for Zapli's bridge (`dev/fake-zapli.js`: records with
watches, the key-value store, the declared actions, the scanner, the picker, a barcode reader that reads a picture's
name), real mouse input for holding and dragging, and a touch scroll gesture. Back is pressed as the phone does it:
an open dialog closes first (the host's own script), then the page's history, else the app is left. They find thrown
errors, wrong saves and wrong Back steps, and show the look; the phone's own scanner, brightness, picker and widget
are checked on a phone.
`dev/fixtures/store-2.5.3.json` holds cards as version 2.5.3 stored them, which the logic check reads as this version
does, and the two settings 2.5.3 declared. Its setting "Remind me before a card expires" is still declared, so the value
a user stored stays readable: a card without a reminder of its own follows it, a new card starts as it is, and the page
runs the declared action `keepReminderChoice` once to write it into each card that has none.

After changing a screenshot, write its hash into the listing with `zapli library inventory apps/library/loyalty-cards
--write`.
