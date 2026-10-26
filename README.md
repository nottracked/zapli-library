# The Zapli library

This repository holds the apps of **Zapli** (formerly anyApp): everyday ones such as an expense tracker, a water
reminder, a to-do list, flashcards, a document scanner and a few games. Zapli ships with these apps built in, and later
versions of Zapli will install and update them from this repository, so a fix merged here can reach phones without a
new release of Zapli.

Every app is an **original**: written from scratch for this library, free of ads, tracking and accounts, and free to
copy and remix under its licence. Each one works offline and keeps its data on the phone.

The file formats use the Zapli names (`"spec": "zapli/0.2"`, `window.zapli`, the `--zapli-*` CSS properties, `.zapli`
packages). Files with the old anyApp names keep working, but every app here uses the new ones.

## Browse the apps

The apps have a gallery at <https://nottracked.github.io/zapli-library/>: each one with its icon, summary, version,
licence and screenshots. The web apps open right there in your browser, where they keep their data only in that
browser; the declarative apps run in the Zapli app. The page (`index.html`, `gallery.js` and `gallery.css`) has no
build step: it reads `library-index.json` and each app's `listing.json` when it opens, so an app shows up there once
the signed index lists it, just as it reaches phones.

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
app.json | index.html      the app: a declarative definition or a web app, never both
listing.json               how the library presents it: title, summary, description, licence, sample data, sources
import-samples/            small fictional files in the formats the app can import
screenshots/               screenshots taken with the sample data
dev/                       development scripts that are not shipped (Solitaire's deal solver and its checks)
```

There are two kinds of app, and every app is one or the other:

- A **declarative app** (`app.json`) is one JSON document: the data, screens, actions, reminders and the permissions
  it needs. Zapli draws native screens for it. Most data apps (Expenses, Water, To-do) are this kind.
- A **web app** (`index.html`) is one HTML file with its manifest embedded in a
  `<script type="application/zapli+json">` block. Zapli runs it in a locked-down web view of its own; the same file
  also opens in a plain browser. Games and other apps that draw their own screens (Solitaire, Mines, Gridfire, Pocket
  Scan) are this kind.

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

Each app's version is `app.version` (in `app.json`, or in the manifest inside `index.html`), in `MAJOR.MINOR.PATCH`
form. Zapli updates an installed app only when the library's copy has a newer version, so:

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
   the install review says why).
4. Open a pull request that says what you changed and why. For a translation, say which language and that you are a
   native speaker.

By opening a pull request you agree that your contribution is licensed under this repository's MIT licence, and that
you have the right to license it so.

A maintainer reviews every pull request and runs the library checks before merging: every definition validates with
no errors and no warnings; every listing fits its schema and names the same id and licence as its definition; the
sample data fits the app's data; every screenshot and sample import file exists and reads in its format; and no
listing names another app or brand, uses comparison wording or carries real-looking e-mail addresses or phone
numbers. `CODEOWNERS` says who reviews which folder.

Phones take apps from this repository only through `library-index.json`: a list of every app's version and the
SHA-256 of its files, signed with Zapli's key, which never leaves the maintainers' hands. Zapli checks that signature
on the phone and installs nothing it does not cover, so a change reaches phones only once a maintainer has merged it
and signed a new index.

Contributors who work with an AI assistant: `CLAUDE.md` and the `library-tool` skill in `.claude/skills/` describe the
format and the rules in detail.
