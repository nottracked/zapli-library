# Expenses: development notes

Expenses is a package app: `package/` holds the manifest (records, queries, the import and export mappings, the
background jobs and the widgets) and the page that draws every screen (`index.html`, `css/app.css` and the modules in
`js/`). Nothing is built or minified; the files are shipped as they are.

## The page's modules

| File               | What it does                                                                |
| ------------------ | --------------------------------------------------------------------------- |
| `js/app.mjs`       | Start-up, the language, the hash routes and the bottom tabs                 |
| `js/store.mjs`     | The records through `zapli.data` (and example data in a plain browser)      |
| `js/ledger.mjs`    | Balances, totals, budgets and "safe to spend today"                         |
| `js/subs.mjs`      | The subscription finder                                                     |
| `js/homecards.mjs` | Which cards Home shows, and their order (the choice in the page settings)   |
| `js/rrule.mjs`     | Repeat rules of recurring entries: next dates, yearly counts, sentences     |
| `js/money.mjs`     | Exact amounts in cents, rates in millionths, formats for English and Slovak |
| `js/calc.mjs`      | The calculator of the amount field                                          |
| `js/dates.mjs`     | Calendar dates as ISO text                                                  |
| `js/i18n.mjs`      | Every text in English and Slovak                                            |
| `js/ui.mjs`        | Shared pieces of the screens (rows, dialogs, the snackbar with Undo)        |
| `js/charts.mjs`    | The ring and bar charts (SVG)                                               |
| `js/icons.mjs`     | Line icons, category pictures and colours                                   |
| `js/csv.mjs`       | The CSV the page saves itself (search results)                              |
| `js/sample.mjs`    | Made-up example data for the browser preview and the listing                |
| `js/screens/*.mjs` | One module per screen                                                       |

## Checks

From the repository root, with Node.js 22:

```sh
node apps/library/expenses/dev/test-logic.mjs          # money, calculator, dates, rules, budgets, finder, texts
node apps/library/expenses/dev/smoke-render.mjs live    # every screen and the main taps on a stand-in bridge
node apps/library/expenses/dev/smoke-render.mjs fresh   # a first start: the app sets itself up
node apps/library/expenses/dev/smoke-render.mjs preview # the browser preview
SMOKE_LANG=sk-SK node apps/library/expenses/dev/smoke-render.mjs live
node apps/library/expenses/dev/check-characters.mjs   # no literal invisible or direction characters
node apps/library/expenses/dev/make-sample-data.mjs     # prints the listing's sampleData
```

The smoke test runs the page's code on a small stand-in for the DOM and for the phone's Back (which goes back in the
WebView while it can, skipping entries added without a tap, and otherwise leaves the app): it finds thrown errors,
untranslated texts and wrong Back steps, not how a screen looks. Try the look in a browser from a local web server (`python3 -m http.server`, then open
`apps/library/expenses/package/index.html`), and on a phone by importing the packed `.zapli`.

After any change to a file in `package/`, write the file list again with `zapli library inventory
apps/library/expenses --write`.
