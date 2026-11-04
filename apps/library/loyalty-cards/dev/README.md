# Loyalty cards: development notes

Loyalty cards is a package app: `package/` holds the manifest (the card records, the import and export mappings, the
expiry reminder, the widget and the actions the page runs: the code's brightness, the full-screen code, counting a use)
and the page that draws every screen (`index.html`, `css/app.css` and the modules in `js/`). Nothing is built or
minified; the files are shipped as they are.

## The page's modules

| File                      | What it does                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `js/app.mjs`              | Start-up, the language, the hash routes and Back                                          |
| `js/store.mjs`            | The cards through `zapli.data`, photos and settings in `zapli.data.kv`; a browser preview |
| `js/brands.mjs`           | The store list: names, kinds of shop, the palette's colours, ranks by country, search     |
| `js/faces.mjs`            | Card faces and store tiles, their colours and contrast, fitting names to their boxes      |
| `js/formats.mjs`          | Barcode types: the type of a typed number, the number checks, cleaning and grouping       |
| `js/barcode/*.mjs`        | The encoders of all thirteen barcode types and the SVG drawing (below)                    |
| `js/photos.mjs`           | Photos of cards (made small for the store), barcodes read from pictures                   |
| `js/i18n.mjs`             | Every text in English and Slovak                                                          |
| `js/ui.mjs`               | Shared pieces: elements, the snackbar with Undo, sheets and questions, haptics, dates     |
| `js/icons.mjs`            | The app's line icons                                                                      |
| `js/sample.mjs`           | Made-up cards for the browser preview and the listing                                     |
| `js/screens/wallet.mjs`   | The wallet: faces, favourites, order, search                                              |
| `js/screens/add.mjs`      | Adding a card: the store list, then the scanner                                           |
| `js/screens/picker.mjs`   | The store list itself (tiles, countries, search, other card)                              |
| `js/screens/transfer.mjs` | The scanner, the store's sheet with the typed number, screenshots, CSV import and backup  |
| `js/screens/card.mjs`     | A card at the till: the code, brightness, swiping, details, photos, share                 |
| `js/screens/edit.mjs`     | Editing a card                                                                            |
| `js/screens/settings.mjs` | Settings and the archived cards                                                           |

## The barcode encoders

`js/barcode/` draws every code the app shows: EAN-13, EAN-8, UPC-A, UPC-E, Code 128 (fewest symbols, code sets A, B
and C), Code 39, Code 93 (full ASCII), Codabar, ITF, QR Code (numeric, alphanumeric or UTF-8 bytes with ECI 26, the
best mask), Data Matrix ECC 200 (square sizes 10×10 to 144×144), PDF417 (text or byte compaction, the recommended
error correction) and Aztec (compact and full range). They follow the standards named in each file; the tables
(`qr-tables.mjs`, `pdf417-patterns.mjs`) are the standards' tables. `dev/test-barcodes.mjs` reads every kind back with
ZXing's decoders.

## Checks

From the app's folder, with Node.js 22 (the browser checks also need a Chromium: `CHROME`, or Playwright's cached
headless shell, or Google Chrome):

```sh
node dev/test-logic.mjs                       # store list, barcode types, wallet order, manifest, update from 2.5.3, texts
node dev/test-barcodes.mjs                    # check digits, refusals, sizes
ZXING_JAR=<zxing core 3.5.x jar> node dev/test-barcodes.mjs   # and every code read back by ZXing (Java 17)
node dev/test-flows.mjs                       # adding a card every way, the till, swiping, editing, in a browser
node dev/shots.mjs --out <dir>                # screenshots: 360 × 800 and 412 × 915, light and dark, 200 % text, turned
node dev/make-sample-data.mjs                 # prints the listing's sampleData
```

The browser checks run the page on a stand-in for Zapli's bridge (`dev/fake-zapli.js`: records with watches, the
key-value store, the declared actions, the scanner, the picker, a barcode reader that reads a picture's name). They
find thrown errors, wrong saves and wrong Back steps, and show the look; the phone's own scanner, brightness, picker
and widget are checked on a phone. `dev/fixtures/store-2.5.3.json` holds cards as version 2.5.3 stored them (every
stored field, old colours, every barcode type), which the logic check reads as 3.0 does.

After any change to a file in `package/`, write the file list again with
`zapli library inventory apps/library/loyalty-cards --write`.
