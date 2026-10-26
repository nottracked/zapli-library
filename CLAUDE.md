# The Zapli library

This repository holds the apps of Zapli (formerly anyApp): original, offline and ad-free, shipped with Zapli and
updated from here. The file formats use the Zapli names (`"spec": "zapli/0.2"`, `window.zapli`,
`--zapli-*`, `.zapli`); the old anyApp names still work, but the library check flags them, so never add them. `README.md` has the rules for people; this file is the short version
for AI-assisted work.

## Layout

- `apps/library/<name>/`: the apps Zapli ships (app id `library/<name>`).
- `apps/samples/<name>/`: sample apps that show the format (app id `samples/<name>`); not shipped with Zapli.
- Each app folder: exactly one of `app.json` (declarative app), `index.html` (web app with an embedded manifest) or
  `package/` (a package app: a web app of many files); `listing.json`; optional `import-samples/`, `screenshots/`
  and `dev/` (scripts and sources that are not shipped).
- A package app's folder: `listing.json`, `screenshots/` and `dev/` beside `package/`, and in `package/` only the
  app's files: `manifest.json` (the definition, with `app.kind: "web"`, `web.entry` and `web.files`), the entry page
  and its scripts, workers, pictures, sounds and data. Prefer one HTML file whenever the app fits in one; choose a
  package for pictures, sounds, fonts, WebGL assets, modules or workers. Phones download a package app's files only
  when it is installed or updated, and Zapli never ships one built in.
- `icons/`: the apps' own icons (`svg/` sources, `render.swift`, `png/`, `contact-sheet.png`).

## Hard rules

- **No remote code at runtime.** Every script, style, font and image an app uses is inside its own file (or, for a
  package app, its own `package/` folder). No CDN links, no `eval` or `new Function`, no frames.
- **No ads, analytics, trackers or accounts**, and no SDK that brings them.
- **No network hosts without review.** Never add a host to `permissions["net.http"]` or a `fetch` to a new place;
  a maintainer's security review comes first. Today no app in `apps/library/` declares a host.
- **Fictional data only.** Sample data and import samples describe nobody real: e-mail only at `example.com` (or
  another reserved example domain), phone numbers only 555-0100 to 555-0199.
- **No personal data anywhere**: no real names, addresses, e-mails, device names, local paths or private notes in code,
  comments, listings or commit messages.
- **Original work.** Never copy another app's name, text, icons, colours or screenshots, and never name another app in
  user-facing text ("alternative to …", "like …").
- **Keep `listing.json` and the version in step.** A change users should get raises `app.version` (patch for fixes,
  minor for features) and updates the listing's description when the app's features change.
- **Users keep their data.** Never rename or remove a stored field or entity without a migration.
- **Package apps:**
  - `web.files` lists every file of `package/` except `manifest.json`, each with its SHA-256 and size. Never edit it
    by hand: run `zapli library inventory --write` (the command is coming in Zapli's command-line tool) after every
    change to a file of the package; the check refuses any difference.
  - Path rules for every file and folder in `package/`: ASCII letters, digits, `.`, `_` and `-` only, at most 128
    characters a name, never starting or ending with `.`; at most 12 names deep and 255 characters; no hidden files
    (delete `.DS_Store`), no symbolic links, nothing under `_zapli/` or `_anyapp/` in any case, no Windows device
    names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, also as `nul.js`), no two names that differ only
    in case, and no file named like a folder.
  - Limits: 25 MiB a file, 100 MiB a package, 1,000 files, 512 KiB for `manifest.json`.
  - Readable code only: no minified or packed JavaScript unless `dev/` holds its readable source and the script that
    builds it.
- **No service workers** in any app: the gallery serves every app from one web address.
- Comments say what the code does and why, in plain words. No notes about who asked for something, no internal ticket
  or decision numbers, no TODOs.
- Keep user-visible text and behaviour unchanged unless the change is the point of the pull request.

## Checks

Maintainers run `zapli library check` (Zapli's command-line tool) and the validator on every pull request: 0 errors
and 0 warnings for every definition, every listing fits its schema, sample data fits the app, sample files and
screenshots exist, a package app's files keep the path rules and limits and match `web.files`, no minified code
without its source, no service worker, and no forbidden content. Contributors cannot run them yet, so be exact: valid
JSON, ids that match, and say in the pull request what you could and could not check.

Use the `library-tool` skill (`.claude/skills/library-tool/SKILL.md`) to write or change an app.
