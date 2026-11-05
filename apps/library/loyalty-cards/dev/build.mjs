// Development only (not shipped): builds the app's one file, index.html, from the readable sources in dev/src.
//
//   node dev/build.mjs           # writes ../index.html
//   node dev/build.mjs --check   # exits 1 when ../index.html is not what the sources build
//
// One HTML file lets Zapli ship the app built in. The build changes nothing in the code itself:
// - the manifest (dev/src/manifest.json) goes into the page's manifest element as strict JSON;
// - the style sheet (dev/src/css/app.css) goes into a <style> element;
// - the modules (dev/src/js/**/*.mjs) go into one module script, each as a block of its own, in the order they import
//   each other: `import { a, b as c } from "./x.mjs"` becomes `const { a, b: c } = modules["js/x.mjs"];`,
//   `import * as x from …` becomes `const x = modules[…];`, and a module's `export`s become the object its block
//   returns. Comments, names and lines stay as written: nothing is minified.
// Only these forms of import and export are taken; anything else stops the build with the file and the line.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "src");
const OUT = join(here, "..", "index.html");
const ENTRY = "js/app.mjs";

const fail = (message) => {
  console.error("build: " + message);
  process.exit(2);
};

const IMPORT_NAMED = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?[ \t]*$/gm;
const IMPORT_ALL = /^import\s*\*\s*as\s+(\w+)\s+from\s*"([^"]+)";?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

/** One module: its id (path under src), its source, what it imports and what it exports. */
function readModule(id) {
  const text = readFileSync(join(SRC, id), "utf8");
  const imports = [];
  const resolveId = (spec) => {
    if (!spec.startsWith(".")) fail(`${id}: only relative imports are bundled, not "${spec}"`);
    return normalize(join(dirname(id), spec))
      .split("\\")
      .join("/");
  };
  let body = text.replace(IMPORT_NAMED, (_, names, spec) => {
    const from = resolveId(spec);
    imports.push(from);
    const parts = names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const m = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(n);
        if (!m) fail(`${id}: cannot read the import "${n}"`);
        return m[2] ? `${m[1]}: ${m[2]}` : m[1];
      });
    return `const { ${parts.join(", ")} } = modules[${JSON.stringify(from)}];`;
  });
  body = body.replace(IMPORT_ALL, (_, name, spec) => {
    const from = resolveId(spec);
    imports.push(from);
    return `const ${name} = modules[${JSON.stringify(from)}];`;
  });
  const exports = [];
  body = body.replace(EXPORT_DECL, (_, kind, name) => {
    exports.push(name);
    return `${kind} ${name}`;
  });
  body = body.replace(EXPORT_LIST, (_, names) => {
    for (const n of names
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (!/^[\w$]+$/.test(n)) fail(`${id}: cannot read the export "${n}"`);
      exports.push(n);
    }
    return "";
  });
  const leftover = /^\s*(import|export)\b.*$/m.exec(body);
  if (leftover) {
    const line = body.slice(0, leftover.index).split("\n").length;
    fail(`${id}:${line}: this import or export is not one the build takes: ${leftover[0].trim()}`);
  }
  if (/<\/script/i.test(body)) fail(`${id}: the text "</script" would end the page's script`);
  return { id, body: body.trimEnd(), imports, exports };
}

/** Every module the entry needs, each after the modules it imports. */
function ordered() {
  const done = new Map();
  const visiting = new Set();
  const visit = (id, chain) => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail(`modules import each other: ${[...chain, id].join(" → ")}`);
    visiting.add(id);
    const module = readModule(id);
    for (const dep of module.imports) visit(dep, [...chain, id]);
    visiting.delete(id);
    done.set(id, module);
  };
  visit(ENTRY, []);
  return [...done.values()];
}

/** The files of dev/src/js the entry does not reach: a sign that a module was left out. */
function unused(modules) {
  const all = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".mjs")) all.push(relative(SRC, path).split("\\").join("/"));
    }
  };
  walk(join(SRC, "js"));
  const used = new Set(modules.map((m) => m.id));
  return all.filter((id) => !used.has(id) && id !== "js/sample.mjs");
}

function build() {
  const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
  const manifestText = JSON.stringify(manifest, null, 2).replace(/<\//g, "<\\/");
  const css = readFileSync(join(SRC, "css", "app.css"), "utf8").trimEnd();
  if (/<\/style/i.test(css)) fail('css/app.css: the text "</style" would end the page\'s style');
  const modules = ordered();
  const left = unused(modules);
  if (left.length) fail(`modules no other module imports: ${left.join(", ")}`);
  const script = [
    "// Built by dev/build.mjs from the modules in dev/src/js: each block below is one module, in the order they",
    "// import each other. Edit the sources, not this file.",
    "const modules = Object.create(null);",
    ...modules.map((m) =>
      [
        "",
        `// ---------------------------------------------------------------- ${m.id}`,
        `modules[${JSON.stringify(m.id)}] = (() => {`,
        m.body,
        `  return { ${m.exports.join(", ")} };`,
        "})();",
      ].join("\n"),
    ),
  ].join("\n");
  const template = readFileSync(join(SRC, "index.html"), "utf8");
  const parts = {
    manifest: `<script type="application/zapli+json" id="zapli-manifest">\n${manifestText}\n    </script>`,
    style: `<style>\n${css}\n    </style>`,
    script: `<script type="module">\n${script}\n    </script>`,
  };
  let html = template;
  for (const [name, text] of Object.entries(parts)) {
    const marker = `<!-- build: ${name} -->`;
    if (!html.includes(marker)) fail(`index.html has no ${marker}`);
    html = html.replace(marker, () => text);
  }
  return html;
}

const html = build();
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    current = "";
  }
  if (current !== html) {
    console.error("build: index.html is not what dev/src builds; run node dev/build.mjs");
    process.exit(1);
  }
  console.log("index.html is what dev/src builds.");
} else {
  writeFileSync(OUT, html);
  console.log(`wrote index.html (${Buffer.byteLength(html)} bytes)`);
}
