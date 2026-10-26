# The Zapli library

This repository holds the apps of **Zapli** (formerly anyApp): everyday ones such as an expense tracker, a water
reminder, a to-do list, flashcards, a document scanner and a few games. Zapli ships with these apps built in, and later
versions of Zapli will install and update them from this repository, so a fix merged here can reach phones without a
new release of Zapli. Package apps (apps made of many files, below) are never built in: Zapli downloads them from
here when someone installs one.

Every app is an **original**: written from scratch for this library, free of ads, tracking and accounts, and free to
copy and remix under its licence. Each one works offline and keeps its data on the phone.

The file formats use the Zapli names (`"spec": "zapli/0.2"`, `window.zapli`, the `--zapli-*` CSS properties, `.zapli`
packages). Files with the old anyApp names keep working, but every app here uses the new ones.

## Browse the apps

The apps have a gallery at <https://nottracked.github.io/zapli-library/>: each one with its icon, summary, version,
licence and screenshots. The web apps open right there in your browser, where they keep their data only in that
browser; the declarative apps run in the Zapli app. The page (`index.html`, `gallery.js` and `gallery.css`) has no
build step: it reads the signed index (`library-index-v2.json`, or `library-index.json` where that is the only one)
and each app's `listing.json` when it opens, so an app shows up there once the signed index lists it, just as it
reaches phones. For a package app it also reads `package/manifest.json` and opens the page its `web.entry` names, but
only when that name keeps the path rules below and the manifest lists the file.

## Layout

```
README.md                  this file
CLAUDE.md                  instructions for AI-assisted contributors
CODEOWNERS                 who reviews which folder
.claude/skills/            the library-tool skill: how to write and improve an app here
apps/library/<name>/       the apps Zapli ships; the app id is library/<name>
apps/samples/<name>/       sample apps that show what the format can do (not shipped with Zapli)
icons/                     the apps' own icons: SVG sources, the render script, PNGs and a contact sheet
```

Each app folder holds:

```
app.json | index.html | package/   the app: a declarative definition, a web app, or a package app; exactly one
listing.json               how the library presents it: title, summary, description, licence, sample data, sources
import-samples/            small fictional files in the formats the app can import
screenshots/               screenshots taken with the sample data
dev/                       development scripts and sources that are not shipped (Solitaire's deal solver and its checks)
```

There are two kinds of app, and every app is one or the other:

- A **declarative app** (`app.json`) is one JSON document: the data, screens, actions, reminders and the permissions
  it needs. Zapli draws native screens for it. Most data apps (Expenses, Water, To-do) are this kind.
- A **web app** (`index.html`) is one HTML file with its manifest embedded in a
  `<script type="application/zapli+json">` block. Zapli runs it in a locked-down web view of its own; the same file
  also opens in a plain browser. Games and other apps that draw their own screens (Solitaire, Mines, Gridfire, Pocket
  Scan) are this kind.

A web app that needs more than one file is a **package app**: its files are in a `package/` folder, described below.

## Package apps

Most web apps fit in one HTML file, and one file is the better choice whenever it fits: it opens anywhere with a double
click, Zapli ships it built in, and Zapli versions that know nothing of packages install it too. Make a package app
instead when the app needs
what one file cannot hold well: pictures, sounds, music or fonts (which one file would carry as base64, a third
larger), WebGL shaders and textures, levels or other data, JavaScript split into modules, or a worker (a worker
always starts from a script file of its own).

```
apps/library/<name>/
  listing.json             beside package/, never inside it
  screenshots/             optional, beside package/
  dev/                     optional: sources and build scripts; never downloaded by a phone
  package/                 exactly the files of the app, nothing else
    manifest.json          the app's manifest: app.kind "web", web.entry and web.files
    index.html             the page the app opens with (web.entry)
    js/, workers/, img/, audio/, …
```

- **`package/` is a plain folder** of readable files, never a zip.
- **`manifest.json`** is the app's definition (`"spec": "zapli/0.2"`, `app.kind: "web"`), the same as the manifest a
  single-file web app embeds, with two more members in `web`: `entry`, the page the app opens with, and `files`, the
  list of every other file of `package/` with its SHA-256 and size. The HTML pages carry no embedded manifest.
- **`web.files` is written by a tool**, never by hand: `zapli library inventory --write` (Zapli's command-line tool;
  the command is on its way) lists the files, and the library check refuses a package whose list and files differ in
  any way: a file it does not list, a listed file that is missing, another size or another SHA-256.
- **Path rules.** Every file name and folder name in `package/` is plain ASCII: letters, digits, `.`, `_` and `-`,
  at most 128 characters, not starting with `.` and not ending with `.`. A path is at most 12 names deep (folders and
  the file) and 255 characters long. No hidden files (delete the `.DS_Store` files macOS leaves behind), no symbolic links, nothing under a folder
  named `_zapli` or `_anyapp` (in any case), and no Windows device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to
  `COM9`, `LPT1` to `LPT9`, also with an extension, as in `nul.js`). No two names may differ only in upper and lower
  case (`Logo.png` beside `logo.png`), and no file may have the name of a folder.
- **Limits.** At most 25 MiB a file, 100 MiB for all the files together, 1,000 files, and 512 KiB for
  `manifest.json`.
- **Readable code.** A maintainer reads every line before an app is signed, so no minified or packed JavaScript,
  unless the app's `dev/` folder holds its readable source and the script that builds the shipped file from it.
- **No service workers.** The gallery serves every app from one web address, so one app's service worker would take
  over the others' pages, and Zapli refuses them anyway. The app works offline without one: its files are on the
  phone.
- **Phones download it when it is installed.** Zapli's library lists a package app from its manifest alone; the app's
  files are downloaded when someone installs it (Zapli says how much first), and an update downloads only the files
  that changed.

## The rules every app follows

1. **Original.** No other app's name, slogan, text, icons, colours or screenshots, and no comparison wording
   ("alternative to", "like …", "clone of"). Plain descriptive names ("Expenses", "Water"). Every app names an icon
   from the built-in set in `app.icon` as its fallback, and the library's apps also carry their own icon
   (`app.iconData`), drawn from scratch in `icons/`. What an app type needs is learned from public sources, for
   function only, and those sources are listed in the listing's `research`.
2. **Migration first: your data comes along.** An app that keeps data imports what the common apps of its type export
   (their CSV or JSON export, or another documented format), maps their usual columns and accepts the common variants.
   The listing says so in generic words ("the CSV file most expense apps export"), never naming another app. Each
   supported format has a small fictional sample in `import-samples/`, listed in the listing's `migration.samples`.
3. **Fictional data only.** Sample data and sample import files describe nobody real: invented names, e-mail
   addresses only at `example.com` (or another reserved example domain), and phone numbers, if any, only from
   555-0100 to 555-0199.
4. **Works offline.** Everything an app needs is in its own file: no code, fonts or styles loaded from the network.
5. **No ads, no tracking, no analytics**, and no accounts.
6. **No network unless declared and reviewed.** An app can reach the internet only through hosts it declares in its
   manifest, and only after the maintainers' security review of that host. Today no app in `apps/library/` declares
   one; two samples do (a food database and a user's own server), to show the format.
7. **Accessible.** Real labels on every control, touch targets of at least 48 px, readable at large text sizes, and
   nothing told by colour alone.
8. **Light and dark.** Every screen works in both.
9. **English first, translations welcome.** Every app works in English and Slovak, following the phone's language;
   an app's name stays the same in every language.

## Versions

Each app's version is `app.version` (in `app.json`, in the manifest inside `index.html`, or in a package app's
`package/manifest.json`), in `MAJOR.MINOR.PATCH` form. Zapli updates an installed app only when the library's copy has a newer version, so:

- **Raise the version for every change users should get**: a patch (`2.4.1` → `2.4.2`) for fixes and wording, a minor
  version (`2.4.2` → `2.5.0`) for new features, a major version for a change that reworks the app.
- Keep `listing.json` in step in the same change: when the app gains or loses a feature, its description says so.
- Users keep their data across updates. Never rename or remove a stored field without a migration; ask in the pull
  request if you are unsure.

## Licence

Each app's `listing.json` declares its licence: MIT for every app today (Apache-2.0, MIT-0, 0BSD and CC0-1.0 are
allowed too; non-commercial and no-derivatives licences are not). When a definition sets `app.license`, the listing
names the same one. The whole repository is under the MIT licence in `LICENSE`.

## Contributing

Contributions come as pull requests. Fixes, better wording, accessibility improvements, new import formats and
**translations from native speakers** are especially welcome.

1. Fork the repository and make your change in the app's folder (`apps/library/<name>/`).
2. Raise `app.version` and update `listing.json` when the change is one users should get (see Versions).
3. Try it: a web app opens in any browser (open `index.html`); any app can be imported into Zapli on your phone
   (Import, then From a file or Paste from clipboard), where it installs as an unreviewed copy next to the library's own (without its own icon;
   the install review says why). A package app opens in a browser from a local web server, since browsers run
   modules and workers only from a web address: run `python3 -m http.server` in the repository's folder and open
   `http://localhost:8000/apps/library/<name>/package/index.html`. To try it in Zapli, pack its `package/` folder into
   a `.zapli` file with `zapli pack` and import that file (an imported file may have at most 20 MB, and no file in it
   more than 10 MB).
4. Open a pull request that says what you changed and why. For a translation, say which language and that you are a
   native speaker.

By opening a pull request you agree that your contribution is licensed under this repository's MIT licence, and that
you have the right to license it so.

A maintainer reviews every pull request and runs the library checks before merging: every definition validates with
no errors and no warnings; every listing fits its schema and names the same id and licence as its definition; the
sample data fits the app's data; every screenshot and sample import file exists and reads in its format; a package
app's files keep the path rules and the limits, match its manifest's list exactly and hold no minified code without
its source; no app registers a service worker; and no listing names another app or brand, uses comparison wording or
carries real-looking e-mail addresses or phone numbers. `CODEOWNERS` says who reviews which folder.

Phones take apps from this repository only through the signed index: a list of every app's version and the SHA-256
of its files, signed with Zapli's key, which never leaves the maintainers' hands. It comes in two files from one
signing: `library-index.json` for Zapli versions that know only single-file apps, and `library-index-v2.json`, which
also lists the package apps. For a package app the index holds the SHA-256 of its `manifest.json`, and the manifest
holds the SHA-256 of every file, so the signature covers each file. Zapli checks that signature on the phone and
installs nothing it does not cover, so a change reaches phones only once a maintainer has merged it and signed a new
index.

Contributors who work with an AI assistant: `CLAUDE.md` and the `library-tool` skill in `.claude/skills/` describe the
format and the rules in detail.
