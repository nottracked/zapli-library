// The word list files of the word games (data/words-<lang>.txt): plain UTF-8 text, one word per line, in two tiers.
//
//   # comment lines start with "#"
//   [answers]      common base forms a puzzle may ask for
//   …
//   [accepted]     more real words the games accept (a word of the first tier is not repeated here)
//   …
//   [common]       optional: the answer words that count as common everyday words (a list without this section
//   …              counts every answer word as common)
//
// dev/build-lists.mjs writes the files; the page, the worker and the checks read them with this module.

/** Reads a word list file into its tiers. Unknown sections are skipped, so later files can add some. */
export function parseWordList(text) {
  const answers = [];
  const accepted = [];
  const common = [];
  let into = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "[answers]") into = answers;
    else if (line === "[accepted]") into = accepted;
    else if (line === "[common]") into = common;
    else if (line.startsWith("[")) into = null;
    else if (into) into.push(line.normalize("NFC"));
  }
  return { answers, accepted, common };
}

/** Writes the tiers in the file format above, with a header of comment lines. */
export function formatWordList(header, answers, accepted, common) {
  const lines = [];
  for (const h of header) lines.push(`# ${h}`.trimEnd());
  lines.push("[answers]", ...answers, "[accepted]", ...accepted);
  if (common && common.length) lines.push("[common]", ...common);
  lines.push("");
  return lines.join("\n");
}
