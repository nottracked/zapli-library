---
name: library-tool
description: Write a new app or improve an existing one in the Zapli library (this repository) - a declarative app (app.json, spec "zapli/0.2") or a web app (index.html with an embedded manifest), its listing.json, fictional sample data and import samples, its own icon from icons/, a translation, and the version bump. Use for any change under apps/ or icons/, for fixing an app's bug or wording, adding an import format, or translating an app. Do not use for changing the Zapli app itself or the file format, and never for ads, tracking, accounts or network access without a maintainer's review.
---

# Writing an app for the Zapli library

The library is a set of original, offline, ad-free apps that Zapli (formerly anyApp) ships and updates from
this repository. An app is one of two kinds, never both:

| The app                                                                | Kind                                  | File         |
| ---------------------------------------------------------------------- | ------------------------------------- | ------------ |
| Keeps records: a tracker, log, list, wallet, flashcards                | **Declarative app**: Zapli draws it   | `app.json`   |
| Draws its own screen: a game, a canvas, a camera flow, a custom visual | **Web app**: HTML, CSS and JavaScript | `index.html` |
| Keeps records but needs one drawn screen (a heatmap, a board)          | Declarative app with one HTML screen  | `app.json`   |

Declarative apps get native screens, automatic light and dark, accessibility and the most precise install review, so
prefer them for data. Use the Zapli format names (`"spec": "zapli/0.2"`, `window.zapli`, `--zapli-*`); files with the old anyApp
names still work, but the library check flags them.

## 1. Where things go

```
apps/library/<name>/          one app; its app id is "library/<name>" (lowercase a-z, 0-9 and -)
  app.json | index.html       the app
  listing.json                how the library presents it
  import-samples/<file>       fictional files in each format the app imports (every file listed in the listing)
  screenshots/<file>.png      screenshots with the sample data (taken by maintainers)
  dev/                        scripts that are not shipped (optional)
icons/svg/<name>.svg          the app's icon source; icons/render.swift embeds it as app.iconData
```

`apps/samples/<name>/` holds sample apps that show the format; they follow the same rules but are not shipped.

## 2. A declarative app (`app.json`)

One JSON document. Only `spec`, `app` and one entity are required; every entity gets a list, a detail and a form
screen by default.

```json
{
  "spec": "zapli/0.2",
  "app": {
    "id": "library/books",
    "name": "Books",
    "version": "1.0.0",
    "icon": "menu_book",
    "category": "books_and_reference",
    "ageRating": "everyone",
    "license": "MIT"
  },
  "theme": { "seedColor": "#6D4C41", "shape": "rounded" },
  "entities": {
    "book": {
      "display": { "title": "=item.title", "subtitle": "=item.author" },
      "fields": {
        "title": { "type": "text", "required": true },
        "author": { "type": "text", "kind": "name" },
        "rating": { "type": "rating", "max": 5 },
        "finished": { "type": "date" }
      }
    }
  }
}
```

Top-level keys: `spec`, `app`, `theme`, `i18n`, `permissions`, `credentials`, `dataFlows`, `connectors`, `settings`,
`entities`, `queries`, `actions`, `triggers`, `navigation`, `screens`, `components`, `widgets`, `sharing`,
`migrations`, `meta`, `functions`, `web`. Read the existing apps (Water and To-do are good starting points) for how
each is used; copy their patterns rather than inventing new ones.

The rules that catch most mistakes:

- **Every table is an object keyed by id** (entities, fields, queries, screens, components, actions, triggers,
  widgets, functions). Ids are camelCase ASCII, `^[a-z][a-zA-Z0-9]{0,39}$`. Never an array of `{ "id": … }`.
- **Closed objects:** an unknown key is an error. Only `meta` takes free-form data.
- **Discriminators:** `type` on fields, steps, triggers, screens and widgets; `component` on components.
- **Expressions are strings that start with `=`** (`"=item.stock <= item.minStock"`, `"=today()"`); single quotes
  inside them. A string without `=` is a literal.
- **Field types:** `text`, `longText`, `integer`, `number`, `decimal` (money: `scale`, `currency`), `boolean`, `date`,
  `time`, `datetime`, `duration`, `choice`, `multiChoice`, `rating`, `color`, `image`, `file`, `barcode`, `location`,
  `url`, `email`, `phone`, `recurrence` (an RRULE that names its day, `"FREQ=WEEKLY;BYDAY=MO"`), `ref` and `inverse`.
  Dates and durations are ISO 8601 (`"2026-10-13"`, `"08:00"`, `"P1D"`).
- **Icons** are names from the built-in Material Symbols set (`task_alt`, `local_drink`, `receipt_long`, …); copy a
  name another library app uses when you are unsure. An unknown name shows a neutral fallback.
- **No raw styling:** `theme` tokens and a semantic `tone` (`primary`, `neutral`, `success`, `warning`, `danger`) or a
  `hue`. Light and dark follow by themselves.
- **Accessibility:** a `label` on every icon-only button and image; a name field gets `kind: "name"`.
- **Phone features need a `permissions` entry** with a `purpose` of 10 to 140 characters written for the user
  (`notify.local` for reminders, `files.io` for import and export, `scan.barcode`, `auth.lock`, `widget.home`, …).
  Data that leaves the app (share, file export) needs a `dataFlows` entry `{from, to, purpose}`, and health, money or
  private fields carry a `sensitivity` (`personal`, `financial`, `health` or `secret`).
- **Never** a password, PIN, card-number or seed-phrase field, and no such word in an ordinary label or id (`pin`,
  `cvv`, `mnemonic`, "Pin to the top"): lock an app with `auth.lock` instead.
- **Text in the user's language:** `"@key"` for a plain string or `"=t('key', {'n': x})"` for a message with
  arguments, both from `i18n.strings`, whose messages use ICU plural and select (`"{n, plural, one {# day} other {#
days}}"`).
- **Imports** of other apps' exports use the declarative `files.io` `importCsv` mapping (column names best first,
  `dateFormat`, `values`, `units`, `onDuplicate`): see how Expenses, Water and To-do do it. Add a fictional sample
  file for every format you support.
- **Pure functions** (`functions`, `lang: "js"`) are for calculations expressions cannot do: exactly one synchronous
  function named like its id, no I/O, no clock or randomness (pass `today` in), a `decimal` returned as a string, and
  at least one `examples` entry worked out by hand.

## 3. A web app (`index.html`)

One self-contained HTML file with its manifest in `<head>`. A library app is always one
file, so everything it shows is in it: keep the file under 2 MB, the most every Zapli version installs. Draw with
CSS, SVG or a canvas instead of embedding pictures, and never paste big images, sounds or fonts in as base64 (it
adds a third to their size). A bigger game, or an app with many images, sounds or fonts, does not fit the library's
one-file format: make it a `.zapli` package (a zip of `manifest.json`, `index.html` and its files, packed with
`zapli pack`; up to 20 MB, 10 MB a file) and import it in Zapli with Import, then From a file, as Zapli's skill pack
describes.

Mines' head, shortened:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Mines</title>
    <script type="application/zapli+json" id="zapli-manifest">
      {
        "spec": "zapli/0.2",
        "app": {
          "id": "library/mines",
          "kind": "web",
          "name": "Mines",
          "version": "1.0.1",
          "icon": "flag",
          "category": "game_puzzle",
          "ageRating": "everyone",
          "license": "MIT"
        },
        "theme": { "seedColor": "#3F6B47" },
        "web": { "routes": { "play": "#/", "stats": "#/stats" }, "orientation": "any" }
      }
    </script>
  </head>
</html>
```

- The manifest is strict JSON, exactly once, with `app.kind: "web"` and a `permissions` entry (with a `purpose`) for
  every phone feature the code uses.
- **Everything inline.** CSS and JavaScript in the file, images as inline SVG or `data:` URIs. No CDN, no Google
  Fonts, no remote CSS; use `system-ui, sans-serif` or the `--zapli-font-family` token.
- **No code from strings or frames:** no `eval`, `new Function`, string `setTimeout`, handlers set as strings,
  `javascript:` URLs, `<iframe>`, `<object>` or `<embed>`. Inline `<script>` blocks and static `onclick="…"`
  attributes are fine.
- **No network.** No `fetch`, `XMLHttpRequest`, `WebSocket` or links that load other sites, unless a maintainer has
  reviewed a declared host.
- **It must run in a plain browser too.** `window.zapli` exists only inside Zapli: feature-detect it, wait for
  `await zapli.ready` (it can reject: catch it) before `zapli.supports("…")`, and keep a browser fallback for every
  call (`localStorage` for `zapli.data.kv`, the page's own dialog for `zapli.ui.confirm`).
- **Storage:** wrap `localStorage` and IndexedDB in `try`/`catch` with an in-memory fallback. `zapli.data.kv` keeps
  data in the app's own store, which travels with the user's export (Solitaire keeps both and lets the newer win).
- **Save on `pause`:** `zapli.app.on("pause", …)` (and `visibilitychange` in a browser); rotation and a dark-mode
  switch reload the page, so restore state from storage at start.
- **Hash routes** (`#/stats`) for panels and screens; Back closes the open panel first. Declare them in `web.routes`.
- **Gestures:** the camera, the photo picker, saving and sharing must be called directly in a tap handler.
- **Look:** mobile first at 360 px, `env(safe-area-inset-*)` padding, 48 px touch targets, `color-scheme: light dark`
  with your own `prefers-color-scheme` rules, `prefers-reduced-motion` respected, and the theme tokens with fallbacks
  (`var(--zapli-color-primary, #3F6B47)`).
- **Accessibility:** real `<button>`, `<label>` and headings, `aria-label` on icon buttons, `aria-live` for status,
  visible focus, `lang` on `<html>`.
- Never draw anything that looks like the phone's or Zapli's own dialogs or bars, and never use Zapli's own words in
  your dialogs ("Allow", "Don't allow", "Reviewed", "Contains its own code").

## 4. `listing.json`

| Field         | Required | What it holds                                                                                                                               |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | yes      | The app id, the same as `app.id` and the folder: `library/<name>`                                                                           |
| `category`    | yes      | A Google Play category id in lowercase: `finance`, `health_and_fitness`, `productivity`, `tools`, `game_puzzle`, …; equal to `app.category` |
| `replaces`    | yes      | The app type in generic words, at most 60 characters: `expense tracker`, `water reminder`. Never another app's name                         |
| `title`       | yes      | The app's name in the library, at most 30 characters, usually `app.name`                                                                    |
| `summary`     | yes      | One line, at most 80 characters: what it does for its user                                                                                  |
| `description` | yes      | Markdown, at most 4,000 characters: what it does, what it never does (ads, tracking, accounts) and where the data stays                     |
| `license`     | yes      | `MIT` (or `Apache-2.0`, `MIT-0`, `0BSD`, `CC0-1.0`); the same as `app.license`                                                              |
| `tags`        | no       | At most 10 lowercase search tags (`budget`, `meal planning`)                                                                                |
| `screenshots` | no       | At most 8 `{file, caption, theme}` (`theme` is `light` or `dark`; the caption is also the image's text alternative)                         |
| `sampleData`  | no       | Fictional records by entity id (at most 50 each) that fill the screenshots                                                                  |
| `migration`   | no       | `{formats, summary, samples}`: the formats it imports (`csv`, `json`, `txt`), a generic summary, and `{file, about}` per sample file        |
| `research`    | no       | At most 30 `{source, used_for}`: the public https pages the author learned the app type from, including other apps' export formats          |

- **Sample data** uses the stored values as the app keeps them: text as strings, `decimal` as a plain string
  (`"12.50"`), dates `YYYY-MM-DD`, times `HH:MM`, a `datetime` with its offset (`2026-10-15T08:30:00+02:00`), a
  `multiChoice` as an array, a `ref` as the `id` of another sample record. Leave out computed and inverse fields and
  `image` and `file` fields. Values respect the field's limits and unique keys.
- **Nothing real:** invented names; e-mail addresses only at `example.com`, `example.org` or `example.net`; phone
  numbers only 555-0100 to 555-0199. The same holds in `import-samples/`.
- **No other app's name** in `title`, `summary`, `description`, `replaces`, `tags`, captions or `migration` texts, and
  no comparison wording ("alternative to", "clone of", "inspired by"). Other apps may be named only in `research`.
- Every file in `import-samples/` is listed in `migration.samples`, and its extension is one of `formats`. Keep the
  bytes of a sample exactly as the exporting app writes them (some use CRLF line endings on purpose).

## 5. The icon

Each app carries its own 192 × 192 px PNG in `app.iconData` (plain base64, the last member of the `app` block) and
keeps `app.icon` as the fallback. Never edit `iconData` by hand: draw `icons/svg/<name>.svg` (192 × 192, full bleed,
everything that matters inside the inscribed circle, bold shapes that read at 48 px, no text) following
`icons/README.md`, then run `swift icons/render.swift` on a Mac. It writes `icons/png/<name>.png`, the app's
`app.iconData` and `icons/contact-sheet.png`; `swift icons/render.swift --check` verifies them. Without a Mac, send the
SVG and ask a maintainer to render it.

## 6. A translation

- **Web apps** keep their texts in a `STRINGS` table with one object per language (Solitaire and Pocket Scan have `en`
  and `sk`). Add a language as a complete object with every key of `en` and the plural forms the language needs (the
  `sk` object shows how), extend the code that picks the language (the user's choice where the app offers one, then
  `zapli.app.locale()`, then `navigator.language`), and add it to any language setting the app shows.
- **Declarative apps** read translations from `i18n.strings` (`{ "key": { "en": "…", "sk": "…" } }`), but most of their
  texts are still plain strings. Ask in an issue before translating one, so the strings can be moved to keys first.
- Keep the app's name as it is in every language (Solitaire stays Solitaire, Water stays Water): in its title,
  widgets and notifications, a name is a name. Translate everything else.
- Translate for people, not word by word: natural wording a native speaker would use, the phone's own words for
  everyday actions (tap, share, photos), and the same term for the same thing everywhere. Translations come from native
  speakers; a machine translation alone is not enough.
- Mention the new language in the listing's description, and raise the version (a minor version).

## 7. Versions

- Raise `app.version` for every change users should get: a patch for fixes and wording, a minor version for new
  features or a new language, a major version for a rework. Zapli updates an installed app only to a newer version.
- Keep `listing.json` in step: when features change, the description says so.
- Users keep their data. Never rename or remove a stored field or entity, or change a field's type, without a
  `migrations` entry; ask a maintainer first.

## 8. Comments

Comments explain what the code does and why, in plain neutral words. No notes about who asked for something, no
ticket or decision numbers, no TODOs, no jokes, no personal names, paths or devices.

## 9. Before you open a pull request

- [ ] The JSON parses (the definition, the manifest block, the listing), and the files are formatted like the ones
      around them (Prettier, 120 columns).
- [ ] `app.id`, the listing's `id` and the folder agree; `app.license` and the listing's `license` agree;
      `app.category` and the listing's `category` agree.
- [ ] `app.version` is raised for a change users should get, and the listing's description matches the app.
- [ ] Every phone feature used has a `permissions` entry with a purpose; nothing reaches the network.
- [ ] No code, font or style loaded from the network; no `eval`, frames or password fields.
- [ ] Sample data and import samples are fictional; every import sample is listed in `migration.samples`.
- [ ] No other app's name or comparison wording outside `research`.
- [ ] Every control has a label; it works in light and dark, at 360 px width and at 200 % text size.
- [ ] A web app works in a plain browser with no console errors, and inside Zapli (import the file: it installs as an
      unreviewed copy next to the library's own).
- [ ] The pull request says what you changed, how you tried it, and what you could not check. Maintainers run the
      library checks and the validator (0 errors, 0 warnings) before merging.
