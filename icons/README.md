# The library tools' own icons

Each tool in `apps/library/` brings its own icon (`app.iconData`: a PNG, base64-encoded, inside the tool's definition).
This folder holds their sources and the script that turns them into what the tools carry:

```
icons/
  README.md          this file
  render.swift       renders the SVGs, embeds them in the tools, draws the contact sheet; --check verifies
  svg/<tool>.svg     the hand-written source of each icon, named after the tool's folder
  png/<tool>.png     what the script rendered: exactly the bytes the tool's app.iconData holds
  contact-sheet.png  every icon in the app's sticker frame at 192, 96 and 48 px, on the light and dark sheet
```

Nothing here ships: the app bundles only each tool's `app.json` or `index.html` and its `listing.json`, and the PNG
reaches the phone inside the definition.

## Where the icons show

A library tool is reviewed, so on Android its own icon shows wherever Zapli draws a tool's sticker: the library's tiles
and recent tools, the install and update reviews, About, Permissions, the bar at the top of a running tool and pinned
shortcuts. Where the app does not show a tool's own icon yet, it draws `app.icon`, so every tool keeps its `app.icon`
as the fallback. The app decodes the PNG once in an isolated process, keeps a 192 × 192 raster of its own and fills
the sticker's face with it: the white keyline is 5 % of the sticker's side, and the face is clipped to a rounded square
whose corner radius is 30 % of the face.

## The set

One set, so the library reads as a sticker sheet:

- **Canvas:** 192 × 192 px, full bleed and opaque; the art is the whole face. The mask cuts only the corners outside
  the inscribed circle (Ø 192): everything that matters lies inside that circle, and the corners carry only
  background.
- **192 px** because the app keeps exactly 192 × 192: an icon of that size is decoded as drawn, while a larger one
  would be scaled down as it is decoded.
- **Background:** at the top the tool's sticker colour (its `theme.seedColor` at the sticker's tone), darker towards
  the bottom. Expenses leans green and Flashcards blue-green, so the two teal tools tell apart.
- **Light from the top:** every object casts a hard shadow 8 px straight down (black, 20 %), as the sticker's lift
  does; round and glass things get a highlight at the upper left; a top face is lighter than its side (Flashcards'
  cap, Gridfire's wings).
- **Shapes:** bold filled shapes; main lines 12 px with round caps, small marks at least 7 px; corners 12–16 px on cards
  and sheets, 22 px on Mines' tile. No text, no thin lines, no tiny detail: each icon has to read at 48 px.
- **Colours:** white for the main object, and accents shared by the set: sun yellow `#FFC531`, heart red `#E2333B`,
  ink `#1E2433`. Red and ink only on white or a light tile, yellow on the background (where Expenses' coin overlaps its
  receipt, a deeper gold rim keeps them apart). Contrast (WCAG): white 4.8:1
  or more on every background, yellow 3:1 or more, red 3.7:1 or more and ink 13:1 or more on what they sit on; the
  marks inside an object 3.2:1 or more (To-do's lines, Water's water).

| Tool           | Shows                                                       | Background (top → bottom) |
| -------------- | ----------------------------------------------------------- | ------------------------- |
| Blood pressure | a white heart with a pulse line cut through it              | `#CF302D` → `#B42323`     |
| Expenses       | a receipt with a gold coin                                  | `#0A7D67` → `#045F50`     |
| Flashcards     | a stack of index cards, a graduation cap on the front one   | `#087E85` → `#035F66`     |
| Gridfire       | a ship and its flame over a grid of light that bends        | `#0A6F86` → `#053849`     |
| Loyalty cards  | a store card with a bold barcode, a second card behind      | `#7A55D4` → `#6040BA`     |
| Mines          | the game's red flag on a raised square of the field         | `#4C7A54` → `#375E3F`     |
| Pocket Scan    | a page inside the camera's four corners, a yellow scan line | `#3563E6` → `#2447B8`     |
| Solitaire      | two playing cards fanned out: a big red heart and a spade   | `#467762` → `#2E5747`     |
| To-do          | a list with two items ticked off and one to go              | `#5065CA` → `#3B4EB2`     |
| Water          | a glass of water with a wave on top                         | `#0475B8` → `#005590`     |

Every icon is original, drawn for this library from plain shapes: no other app's or brand's icon, and none of their
marks (the library's rule 1, [README](../README.md)). They are MIT like the tools.

## Rendering

From the repository root, on macOS (no dependency: AppKit draws the SVG through CoreSVG, and the script writes the PNG
itself):

```sh
swift icons/render.swift           # png/, each tool's app.iconData, contact-sheet.png
swift icons/render.swift --check   # fails when a PNG or an app.iconData is not a fresh render
```

The script renders each `svg/<tool>.svg` at 192 × 192 in sRGB and writes a PNG of its own: RGB (every pixel is
opaque), each row with the filter that suits it, the Compression framework's zlib, and only `IHDR`, `sRGB`, `IDAT` and
`IEND` (no time or text chunk). The same SVG on the same macOS gives the same bytes; another macOS version may draw
some edge pixels differently, which `--check` reports. Then render again only when an SVG changed, since new bytes are a
new icon to every installed copy. It refuses a PNG over the format's limit of 32,768 bytes; today's are 8,719 to
19,731 bytes.

The embed sets `app.iconData` (plain base64, no `data:` prefix) as the last member of the tool's `app` block, the one
whose first member is `"id": "library/<tool>"`, in `app.json` or in the `index.html` manifest; an existing
`iconData` line is replaced. CoreSVG reads paths, rects, circles, ellipses, groups with transforms, opacity and linear
or radial gradients; keep to those (no filters, masks or text). The script refuses an SVG that could reach outside
itself (`href`, `<image>`, `<script>`, `<foreignObject>`, `@import`, a `url()` other than the file's own `#id`) or
declares a document type or an entity (`<!DOCTYPE`, `<!ENTITY`: an external entity reads another file, an internal one
can expand without end), in any letter case, before anything parses it.

`--check` is not part of the automatic checks, on purpose: it needs macOS (AppKit and CoreSVG draw the SVG), so it
cannot run on Linux or Windows, and a newer macOS may draw some edge pixels differently, which would fail a check after
an operating system update with no change in the repository. Run it by hand on a Mac whenever an SVG, a PNG or a
tool's `app.iconData` changes (step 3 below); a maintainer runs it before merging such a change. What the phone gets is
checked on every platform anyway: the app checks the bundled tools' bytes, and the validator and the app's isolated
decoder check the icon's format, size and encoding.

## Changing an icon

1. Edit `svg/<tool>.svg`, run the script and look at `contact-sheet.png` at 48 px as well as at 192.
2. Raise the tool's `app.version` (a patch): the app offers a library tool's update only for a newer version.
3. Run the library checks (the [README](../README.md) says how), then `swift icons/render.swift --check`.

The update review says "Changes its icon." with the icon before and after. An icon alone is not a risky change, so
the app asks nothing for it and such an update applies by itself, except for an install whose app lock is on
(Expenses and Blood pressure offer one): applying needs the user's unlock, so its tile offers "Update to version …"
and the update waits for the user.
