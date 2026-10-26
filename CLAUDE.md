# The Zapli library

This repository holds the apps of Zapli (formerly anyApp): original, offline and ad-free, shipped with Zapli and
updated from here. The file formats use the Zapli names (`"spec": "zapli/0.2"`, `window.zapli`,
`--zapli-*`, `.zapli`); the old anyApp names still work, but the library check flags them, so never add them. `README.md` has the rules for people; this file is the short version
for AI-assisted work.

## Layout

- `apps/library/<name>/`: the apps Zapli ships (app id `library/<name>`).
- `apps/samples/<name>/`: sample apps that show the format (app id `samples/<name>`); not shipped with Zapli.
- Each app folder: `app.json` (declarative app) **or** `index.html` (web app with an embedded manifest), never both;
  `listing.json`; optional `import-samples/`, `screenshots/` and `dev/` (scripts that are not shipped).
- `icons/`: the apps' own icons (`svg/` sources, `render.swift`, `png/`, `contact-sheet.png`).

## Hard rules

- **No remote code at runtime.** Every script, style, font and image an app uses is inside its own file. No CDN links,
  no `eval` or `new Function`, no frames.
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
- Comments say what the code does and why, in plain words. No notes about who asked for something, no internal ticket
  or decision numbers, no TODOs.
- Keep user-visible text and behaviour unchanged unless the change is the point of the pull request.

## Checks

Maintainers run `zapli library check` (Zapli's command-line tool) and the validator on every pull request: 0 errors
and 0 warnings for every definition, every listing fits its schema, sample data fits the app, sample files and
screenshots exist, and no forbidden content. Contributors cannot run them yet, so be exact: valid JSON, ids that match,
and say in the pull request what you could and could not check.

Use the `library-tool` skill (`.claude/skills/library-tool/SKILL.md`) to write or change an app.
