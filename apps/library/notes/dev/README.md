# Notes: development notes

Notes is a package app: `package/` holds the manifest (the records, the import mapping, the reminders, the nightly
emptying of the trash and the two widgets) and the page that draws every screen (`index.html`, `css/app.css` and the
modules in `js/`). Nothing is built or minified; the files are shipped as they are.

## The data

| Record      | What it keeps                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `note`      | Title, text, kind (text or checklist), colour, pinned, archived, labels, photos, created, edited, reminder, trash |
| `label`     | A label's name; notes keep their labels as names in `note.labels` ("Home, Ideas")                                 |
| `prefs`     | The one setting the reminders read: hide the note's text in them                                                  |
| `importLog` | What an import left out, so the page can say why                                                                  |

- A checklist is kept in the note's text, one item a line: `- [ ] to do`, `- [x] done`. So the text reads well in an
  export, a share, a widget and a notification, and the import turns such lines from any file into a checklist.
- A note in the trash has `trashedAt`; a job each night (and each time the app opens) deletes the ones older than 30
  days. Photos are JPEGs in `zapli.data.kv` (`photo:<id>` and a small `thumb:<id>`), named in `note.photos`; the page
  deletes the photos no note names at its next start.
- `created` and `edited` are the note's own times, so an import keeps a note's dates, and pinning or archiving does
  not count as an edit.
- The page's own settings (view, order, language, list behaviour, vibration) are one `ui` value in `zapli.data.kv`.

## The page's modules

| File                      | What it does                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `js/app.mjs`              | Start-up, the language, the hash routes and Back                                    |
| `js/store.mjs`            | The records through `zapli.data`, the photos in `kv` (made-up notes in a browser)   |
| `js/model.mjs`            | Checklists as text, labels, words, search, sorting, the trash, repeat rules, files  |
| `js/actions.mjs`          | Trash, archive, pins, colours, labels, reminders, copies and sharing, with Undo     |
| `js/cards.mjs`            | A note as a card, the masonry grid, tap, long press and the sideways swipe          |
| `js/photos.mjs`           | Taking and picking photos, making them smaller, keeping them                        |
| `js/ui.mjs`               | Elements, dialogs and sheets that Back closes, menus, the snackbar, dates and times |
| `js/i18n.mjs`             | Every text in English and Slovak                                                    |
| `js/icons.mjs`            | Line icons; `js/illus.mjs`: the pictures of the empty screens                       |
| `js/drawer.mjs`           | The side menu                                                                       |
| `js/sample.mjs`           | Made-up notes for the browser preview and the listing                               |
| `js/screens/home.mjs`     | The notes, a label, the reminders, the archive, the trash, the selection, the dock  |
| `js/screens/editor.mjs`   | The editor: text, checklist, photos, colour, labels, reminder, Undo and Redo        |
| `js/screens/search.mjs`   | Search and its filters                                                              |
| `js/screens/labels.mjs`   | Making, renaming and deleting labels                                                |
| `js/screens/settings.mjs` | Settings, export and import                                                         |

## Checks

From the repository root, with Node.js 22:

```sh
node apps/library/notes/dev/test-logic.mjs                       # model, files, import mapping, texts
node apps/library/notes/dev/smoke-render.mjs live                # every screen and the main taps on a stand-in bridge
node apps/library/notes/dev/smoke-render.mjs fresh               # a first start with no notes
node apps/library/notes/dev/smoke-render.mjs preview             # the browser preview
SMOKE_LANG=sk-SK node apps/library/notes/dev/smoke-render.mjs live
SMOKE_FONT=2 node apps/library/notes/dev/smoke-render.mjs live   # a doubled text size (the dock's words go)
node apps/library/notes/dev/make-sample-data.mjs                 # prints the listing's sampleData
```

The smoke test runs the page's code on a small stand-in for the DOM: it finds thrown errors and untranslated texts,
not how a screen looks. Try the look in a browser from a local web server (`python3 -m http.server`, then open
`apps/library/notes/package/index.html`), and on a phone by importing the packed `.zapli`.

After any change to a file in `package/`, write the file list again with
`zapli library inventory apps/library/notes --write`.
