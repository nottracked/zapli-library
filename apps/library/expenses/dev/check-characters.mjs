// Fails when a file of the app or of dev/ holds a literal invisible or direction-changing character (a byte order
// mark, a zero-width space or joiner, a left-to-right or right-to-left mark, embedding, override or isolate). Code
// writes them as escapes ("\ufeff") so a reader sees them.
// Run from the repository root: node apps/library/expenses/dev/check-characters.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const HIDDEN = /[\u{FEFF}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/u;
const TEXT = /\.(mjs|js|css|html|json|md)$/;

function* files(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (TEXT.test(name)) yield path;
  }
}

const problems = [];
for (const folder of ["package", "dev"]) {
  for (const path of files(join(app, folder))) {
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const m = HIDDEN.exec(line);
        if (m)
          problems.push(relative(app, path) + ":" + (i + 1) + ": U+" + m[0].codePointAt(0).toString(16).toUpperCase());
      });
  }
}
if (problems.length) {
  console.error("Literal invisible characters (write them as escapes):\n" + problems.join("\n"));
  process.exit(1);
}
console.log("ok: no literal invisible characters in package/ and dev/");
