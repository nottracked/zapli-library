// The gallery of the Zapli library's tools.
//
// It reads the signed tool list and each tool's listing.json from this same site when the page opens, so it needs no
// build step: a tool shows here once it is in the index, as it reaches phones. The list is library-index-v2.json,
// which also lists package apps (an app made of many files in its package/ folder), or library-index.json where
// there is no such file yet. Nothing is fetched from any other site. Text from the files goes into the page as text,
// never as HTML, and every path the page builds comes from parts that were checked first.
"use strict";

(() => {
  const REPO = "https://github.com/nottracked/zapli-library";
  // The newer list first; the first one that reads is used.
  const INDEXES = [
    { file: "library-index-v2.json", format: "zapli-library-index/2", packages: true },
    { file: "library-index.json", format: "zapli-library-index/1", packages: false },
  ];
  const MAX_INDEX_BYTES = 256 * 1024;
  const MAX_LISTING_BYTES = 256 * 1024;
  const MAX_MANIFEST_BYTES = 512 * 1024;
  const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

  // An app id is "<publisher>/<name>"; both parts are lowercase letters, digits and dashes.
  const APP_ID = /^([a-z0-9][a-z0-9-]{0,62})\/([a-z0-9][a-z0-9-]{0,62})$/;
  const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
  const SCREENSHOT_FILE = /^screenshots\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|webp)$/;
  const CATEGORY_ID = /^[a-z_]{1,40}$/;
  const ROUTE = /^#\/([a-z0-9-]+\/[a-z0-9-]+)$/;

  // The path rules of a file in a package app (the library's package paths): at most 12 segments, each of ASCII
  // letters, digits, ".", "_" and "-" that does not start with "." (no hidden files, no "." or ".."), does not end in
  // "." and is not a Windows device name before its first "."; nothing under _zapli/ or _anyapp/ in any case, and none
  // of the names the package format keeps for itself.
  const PACKAGE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/;
  const PACKAGE_MAX_DEPTH = 12;
  const PACKAGE_MAX_PATH = 255;
  const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  const RESERVED_FOLDER = /^_(zapli|anyapp)$/i;
  const RESERVED_FILES = ["manifest.json", "signature.json", "web-storage.json"];
  const ENTRY_PAGE = /\.html?$/i;

  // Play category ids whose plain name is not simply the id in words.
  const CATEGORY_NAMES = {
    game_role_playing: "Role-playing game",
    libraries_and_demo: "Libraries & demo",
    video_players: "Video players & editors",
  };

  const listView = document.getElementById("list-view");
  const detailView = document.getElementById("detail-view");
  const hero = document.getElementById("hero");
  const stickers = document.getElementById("stickers");
  const baseTitle = document.title;

  let tools = [];
  let listScroll = 0;
  let lastDetailId = null;

  // ---- small DOM helpers: every value is set as text or as a plain attribute ----

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value === true ? "" : String(value));
      }
    }
    for (const child of children) {
      if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
  }

  // Text only screen readers hear, for links whose visible words need the tool's name.
  function hidden(text) {
    return el("span", { class: "visually-hidden", text });
  }

  function str(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }

  function capitalise(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function categoryName(id) {
    if (!CATEGORY_ID.test(id)) return "";
    if (Object.prototype.hasOwnProperty.call(CATEGORY_NAMES, id)) return CATEGORY_NAMES[id];
    const game = id.startsWith("game_");
    const words = capitalise((game ? id.slice(5) : id).replace(/_and_/g, " & ").replace(/_/g, " "));
    return game ? `${words} game` : words;
  }

  // ---- reading the files ----

  // A JSON file of this site, read as strict UTF-8 and refused above its size limit.
  async function getJson(path, maxBytes) {
    const response = await fetch(path, { cache: "no-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new Error(`${path} is larger than ${maxBytes} bytes`);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }

  // The index keeps its signed content as base64 in "payload"; the page shows it and leaves the signature to Zapli.
  function decodePayload(index, known) {
    if (!index || index.format !== known.format || typeof index.payload !== "string") {
      throw new Error(`${known.file} is not in a format this page knows`);
    }
    const binary = atob(index.payload);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !payload ||
      payload.format !== known.format ||
      !Array.isArray(payload.tools) ||
      (known.packages && !Array.isArray(payload.packages))
    ) {
      throw new Error(`${known.file} lists no apps`);
    }
    return payload;
  }

  // The first index that reads: library-index-v2.json, else library-index.json.
  async function loadIndex() {
    const problems = [];
    for (const known of INDEXES) {
      try {
        const payload = decodePayload(await getJson(known.file, MAX_INDEX_BYTES), known);
        return { tools: payload.tools, packages: known.packages ? payload.packages : [] };
      } catch (e) {
        problems.push(e && e.message ? String(e.message) : `${known.file} could not be read`);
      }
    }
    throw new Error(problems.join("; "));
  }

  // The part every entry shares: the id, its folder and the listing's path, each checked.
  function appFromEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = typeof entry.id === "string" ? APP_ID.exec(entry.id) : null;
    if (!id) return null;
    const folder = `apps/${id[1]}/${id[2]}`;
    if (entry.folder !== folder) return null;
    const listing = typeof entry.listing === "string" && FILE_NAME.test(entry.listing) ? entry.listing : null;
    return {
      id: entry.id,
      publisher: id[1],
      name: id[2],
      folder,
      version: str(entry.version, 30),
      listingPath: listing ? `${folder}/${listing}` : null,
      listing: null,
      listingFailed: false,
    };
  }

  // A single-file tool: its app.json or index.html is in its folder.
  function toolFromEntry(entry) {
    const tool = appFromEntry(entry);
    if (!tool) return null;
    const kind = entry.file === "index.html" ? "web" : entry.file === "app.json" ? "declarative" : null;
    if (!kind) return null;
    return Object.assign(tool, {
      kind,
      isPackage: false,
      openPath: kind === "web" ? `${tool.folder}/${entry.file}` : null,
    });
  }

  // A package app: a web app whose files are in its folder's package/; which page opens first is in the package's
  // manifest, read later (readEntry).
  function packageFromEntry(entry) {
    const tool = appFromEntry(entry);
    if (!tool) return null;
    const bytes =
      Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= MAX_PACKAGE_BYTES ? entry.bytes : 0;
    return Object.assign(tool, {
      kind: "web",
      isPackage: true,
      bytes,
      manifestPath: `${tool.folder}/package/manifest.json`,
      openPath: null,
    });
  }

  // Whether a path keeps the path rules of a package's files.
  function packagePath(path) {
    if (typeof path !== "string" || path.length === 0 || path.length > PACKAGE_MAX_PATH) return false;
    if (RESERVED_FILES.includes(path)) return false;
    const segments = path.split("/");
    if (segments.length > PACKAGE_MAX_DEPTH || RESERVED_FOLDER.test(segments[0])) return false;
    return segments.every(
      (segment) =>
        PACKAGE_SEGMENT.test(segment) && !segment.endsWith(".") && !WINDOWS_DEVICE.test(segment.split(".")[0]),
    );
  }

  // The page a package app opens with: its manifest's web.entry, when the manifest is this app's, the entry is an HTML
  // page that keeps the path rules, and web.files lists it. Anything else opens nothing.
  function readEntry(manifest, tool) {
    if (!manifest || typeof manifest !== "object") throw new Error("not a manifest");
    const app = manifest.app;
    const web = manifest.web;
    if (!app || app.id !== tool.id || app.kind !== "web") throw new Error("the manifest is not this web app's");
    if (!web || typeof web !== "object" || !web.files || typeof web.files !== "object") {
      throw new Error("the manifest lists no files");
    }
    const entry = web.entry;
    if (!packagePath(entry) || !ENTRY_PAGE.test(entry) || !Object.prototype.hasOwnProperty.call(web.files, entry)) {
      throw new Error("the manifest's start page is not a listed page of the package");
    }
    return entry;
  }

  // Keeps only the listing fields the page shows, each checked for its type and length.
  function readListing(raw) {
    if (!raw || typeof raw !== "object") throw new Error("not a listing");
    const screenshots = Array.isArray(raw.screenshots)
      ? raw.screenshots
          .filter((s) => s && typeof s.file === "string" && SCREENSHOT_FILE.test(s.file))
          .slice(0, 8)
          .map((s) => ({ file: s.file, caption: str(s.caption, 200) }))
      : [];
    const migration = raw.migration && typeof raw.migration === "object" ? str(raw.migration.summary, 400) : "";
    return {
      title: str(raw.title, 60),
      summary: str(raw.summary, 160),
      description: str(raw.description, 8000),
      category: categoryName(str(raw.category, 40)),
      license: str(raw.license, 40),
      replaces: str(raw.replaces, 80),
      screenshots,
      migration,
    };
  }

  async function loadListing(tool) {
    if (!tool.listingPath) {
      tool.listingFailed = true;
      return;
    }
    try {
      tool.listing = readListing(await getJson(tool.listingPath, MAX_LISTING_BYTES));
    } catch (e) {
      tool.listingFailed = true;
    }
  }

  async function loadEntry(tool) {
    try {
      const entry = readEntry(await getJson(tool.manifestPath, MAX_MANIFEST_BYTES), tool);
      tool.openPath = `${tool.folder}/package/${entry}`;
    } catch (e) {
      // Without a start page that keeps the rules, the app gets no link here (openLink says so).
    }
  }

  // Tools and package apps in one list, by id; an id listed twice is shown once.
  async function loadTools() {
    const index = await loadIndex();
    const list = [];
    const seen = new Set();
    for (const tool of [...index.tools.map(toolFromEntry), ...index.packages.map(packageFromEntry)]) {
      if (!tool || seen.has(tool.id)) continue;
      seen.add(tool.id);
      list.push(tool);
    }
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    await Promise.all(list.map((tool) => Promise.all([loadListing(tool), tool.isPackage ? loadEntry(tool) : null])));
    return list;
  }

  // ---- pieces of a tool ----

  function titleOf(tool) {
    return (tool.listing && tool.listing.title) || capitalise(tool.name.replace(/-/g, " "));
  }

  function routeOf(tool) {
    return `#/${tool.id}`;
  }

  // The tool's own icon as a sticker; the library's tools keep theirs in icons/png/. Without one, its initial.
  function sticker(tool, size) {
    const initial = () =>
      el("span", { class: `sticker sticker-${size} sticker-initial`, "aria-hidden": "true" }, titleOf(tool).charAt(0));
    if (tool.publisher !== "library") return initial();
    const pixels = size === "large" ? 96 : size === "small" ? 44 : 60;
    const img = el("img", {
      class: `sticker sticker-${size}`,
      src: `icons/png/${tool.name}.png`,
      alt: "",
      width: pixels,
      height: pixels,
      decoding: "async",
    });
    img.addEventListener("error", () => img.replaceWith(initial()), { once: true });
    return img;
  }

  // The category as a chip, then the version and the licence on a line of their own.
  function metaLines(tool) {
    const listing = tool.listing || {};
    const chip = listing.category
      ? el("p", { class: "meta" }, el("span", { class: "chip", text: listing.category }))
      : null;
    const rest = [];
    if (tool.version) rest.push(`Version ${tool.version}`);
    if (listing.license) rest.push(`${listing.license} licence`);
    const line = rest.length ? el("p", { class: "meta" }) : null;
    rest.forEach((text, i) => {
      if (i > 0) line.append(el("span", { "aria-hidden": "true", text: " · " }));
      line.append(text);
    });
    return [chip, line];
  }

  // The link that opens a web app here; a package app whose start page could not be read gets a line instead.
  function openLink(tool, extraClass) {
    if (!tool.openPath) {
      return el("p", { class: "note", text: "It cannot be opened here just now. Reload the page to try again." });
    }
    return el(
      "a",
      { class: `button ${extraClass || ""}`.trim(), href: tool.openPath },
      el("span", null, "Open ", hidden(`${titleOf(tool)} `), "in your browser"),
      el("span", { "aria-hidden": "true", text: "→" }),
    );
  }

  // A download size in the units phones show: kB and MB of 1,000 and 1,000,000 bytes.
  function sizeText(bytes) {
    if (bytes < 1000) return `${bytes} bytes`;
    if (bytes < 1000000) return `${Math.round(bytes / 1000)} kB`;
    return `${(bytes / 1000000).toFixed(1)} MB`;
  }

  function screenshotStrip(tool, large) {
    const shots = tool.listing ? tool.listing.screenshots : [];
    if (!shots.length) return null;
    const list = el("ul", { class: "shots-list", role: "list" });
    for (const shot of shots) {
      const src = `${tool.folder}/${shot.file}`;
      const img = el("img", {
        src,
        alt: shot.caption || `A screenshot of ${titleOf(tool)}`,
        loading: "lazy",
        decoding: "async",
        width: 108,
        height: 240,
      });
      if (large) {
        const figure = el(
          "figure",
          null,
          el("a", { href: src, class: "shot-link" }, img, hidden(" (opens the full-size picture)")),
        );
        if (shot.caption) {
          // The caption is already the picture's text alternative, so screen readers skip it here.
          figure.append(el("figcaption", { "aria-hidden": "true", text: shot.caption }));
        }
        list.append(el("li", null, figure));
      } else {
        list.append(el("li", null, img));
      }
    }
    // A scrolling strip takes keyboard focus, so arrow keys can scroll it.
    return el(
      "div",
      {
        class: large ? "shots shots-large" : "shots",
        role: "region",
        tabindex: 0,
        "aria-label": `Screenshots of ${titleOf(tool)}`,
      },
      list,
    );
  }

  function card(tool) {
    const listing = tool.listing || {};
    const title = titleOf(tool);
    const headingId = `tool-${tool.publisher}-${tool.name}`;
    const detailsLink = el(
      "a",
      { class: "button button-quiet", href: routeOf(tool), "data-tool": tool.id },
      el("span", null, "Details", hidden(` about ${title}`)),
    );
    const actions = el("div", { class: "actions" });
    const foot = el("div", { class: "card-foot" }, actions);
    if (tool.kind === "web" && tool.openPath) {
      actions.append(openLink(tool), detailsLink);
      foot.append(el("p", { class: "note", text: "In the browser, it keeps its data only in that browser." }));
    } else if (tool.kind === "web") {
      actions.append(detailsLink);
      foot.append(openLink(tool));
    } else {
      actions.append(
        el("p", { class: "runs-in" }, el("span", { class: "dot", "aria-hidden": "true" }), "Runs in the Zapli app"),
        detailsLink,
      );
    }
    return el(
      "li",
      null,
      el(
        "article",
        { class: "card", "aria-labelledby": headingId },
        el(
          "div",
          { class: "card-head" },
          sticker(tool, "medium"),
          el("div", { class: "card-title" }, el("h3", { id: headingId, text: title }), ...metaLines(tool)),
        ),
        tool.listingFailed
          ? el("p", { class: "summary", text: "Its description could not be loaded just now." })
          : listing.summary
            ? el("p", { class: "summary", text: listing.summary })
            : null,
        tool.kind === "declarative" ? screenshotStrip(tool, false) : null,
        foot,
      ),
    );
  }

  function section(id, heading, intro, group) {
    if (!group.length) return null;
    return el(
      "section",
      { class: "group", "aria-labelledby": id },
      el("h2", { id, text: heading }),
      el("p", { class: "group-intro", text: intro }),
      el("ul", { class: "cards", role: "list" }, ...group.map(card)),
    );
  }

  // ---- the description: a small, safe subset of Markdown ----
  //
  // Paragraphs, "### " headings, a paragraph that is all bold (read as a heading), "- " bullets and **bold**.
  // Everything else stays plain text.

  function inline(target, text) {
    const parts = text.split("**");
    // An odd number of markers leaves the last one unmatched: keep it as written.
    if (parts.length % 2 === 0)
      parts.splice(parts.length - 2, 2, `${parts[parts.length - 2]}**${parts[parts.length - 1]}`);
    parts.forEach((part, i) => {
      if (!part) return;
      target.append(i % 2 === 1 ? el("strong", { text: part }) : part);
    });
    return target;
  }

  function renderDescription(source, headingTag) {
    const out = el("div", { class: "description" });
    let paragraph = [];
    let list = null;
    const flushParagraph = () => {
      if (!paragraph.length) return;
      const text = paragraph.join(" ");
      paragraph = [];
      const whole = /^\*\*([^*]+)\*\*$/.exec(text);
      out.append(whole ? el(headingTag, { text: whole[1].trim() }) : inline(el("p"), text));
    };
    const flushList = () => {
      if (list) out.append(list);
      list = null;
    };
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      const bullet = /^[-*]\s+(.*)$/.exec(line);
      if (!line) {
        flushParagraph();
        flushList();
      } else if (heading) {
        flushParagraph();
        flushList();
        out.append(el(headingTag, { text: heading[1].replace(/\*\*/g, "").trim() }));
      } else if (bullet) {
        flushParagraph();
        if (!list) list = el("ul");
        list.append(inline(el("li"), bullet[1]));
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
    return out;
  }

  // ---- the detail view ----

  function detail(tool) {
    const listing = tool.listing || {};
    const title = titleOf(tool);
    const heading = el("h1", { id: "detail-title", tabindex: -1, text: title });
    const facts = el("dl", { class: "facts-list" });
    const fact = (name, value) => {
      if (value) facts.append(el("div", null, el("dt", { text: name }), el("dd", { text: value })));
    };
    fact("Category", listing.category);
    fact("Version", tool.version);
    fact("Licence", listing.license);
    if (tool.kind === "web") fact("Runs", "In your browser and in the Zapli app");
    if (tool.isPackage && tool.bytes) fact("Download", `${sizeText(tool.bytes)}, when you install it in the Zapli app`);

    const action =
      tool.kind === "web"
        ? el(
            "div",
            { class: "detail-action" },
            openLink(tool, "button-large"),
            tool.openPath
              ? el("p", {
                  class: "note",
                  text: "Nothing to install. In the browser, it keeps its data only in that browser on this device; in the Zapli app, it keeps it on your phone.",
                })
              : null,
          )
        : el(
            "div",
            { class: "detail-action tile" },
            el("p", { class: "runs-in" }, el("span", { class: "dot", "aria-hidden": "true" }), "Runs in the Zapli app"),
            el("p", {
              class: "note",
              text: "This app is made of Zapli's own screens, so it runs only inside the Zapli app, where it works offline and keeps its data on your phone.",
            }),
          );

    const body = el(
      "article",
      { class: "detail", "aria-labelledby": "detail-title" },
      el(
        "p",
        { class: "back" },
        el("a", { href: "#", class: "back-link" }, el("span", { "aria-hidden": "true", text: "←" }), "All apps"),
      ),
      el(
        "div",
        { class: "detail-head" },
        sticker(tool, "large"),
        el(
          "div",
          null,
          heading,
          listing.replaces ? el("p", { class: "kind", text: capitalise(listing.replaces) }) : null,
          listing.summary ? el("p", { class: "detail-summary", text: listing.summary }) : null,
        ),
      ),
      action,
      facts,
    );

    const strip = screenshotStrip(tool, true);
    if (strip) body.append(el("h2", { text: "Screenshots" }), strip);

    if (listing.description) {
      body.append(el("h2", { text: `About ${title}` }), renderDescription(listing.description, "h3"));
    } else if (tool.listingFailed) {
      body.append(
        el("p", {
          class: "status",
          text: "Its description could not be loaded just now. Reload the page to try again.",
        }),
      );
    }

    if (listing.migration) {
      body.append(el("h2", { text: "Bring your data" }), el("p", { text: listing.migration }));
    }

    body.append(
      el("p", { class: "source" }, el("a", { href: `${REPO}/tree/main/${tool.folder}` }, "See its files on GitHub")),
    );
    return body;
  }

  // ---- views and routes: "#/<publisher>/<name>" shows a tool, an empty hash the list; other anchors
  // (the skip link) leave the view as it is ----

  function showList() {
    const fromDetail = !detailView.hidden;
    detailView.hidden = true;
    detailView.replaceChildren();
    listView.hidden = false;
    hero.hidden = false;
    document.title = baseTitle;
    if (fromDetail) {
      window.scrollTo(0, listScroll);
      const link = lastDetailId
        ? Array.from(listView.querySelectorAll("a[data-tool]")).find((a) => a.dataset.tool === lastDetailId)
        : null;
      if (link) link.focus({ preventScroll: true });
    }
  }

  function showDetail(tool) {
    if (!listView.hidden) listScroll = window.scrollY;
    lastDetailId = tool.id;
    listView.hidden = true;
    hero.hidden = true;
    detailView.replaceChildren(detail(tool));
    detailView.hidden = false;
    document.title = `${titleOf(tool)} · ${baseTitle}`;
    window.scrollTo(0, 0);
    const heading = document.getElementById("detail-title");
    if (heading) heading.focus({ preventScroll: true });
  }

  function route() {
    const hash = location.hash;
    const match = ROUTE.exec(hash);
    const tool = match ? tools.find((t) => t.id === match[1]) : null;
    if (tool) showDetail(tool);
    else if (!hash || hash === "#" || hash.startsWith("#/")) showList();
  }

  function showProblem(message) {
    listView.replaceChildren(
      el(
        "div",
        { class: "problem", role: "alert" },
        el("h2", { text: "The apps could not be loaded" }),
        el("p", { text: "Check your connection and reload the page, or browse the apps in the repository." }),
        el("p", null, el("a", { href: `${REPO}/tree/main/apps/library` }, "The apps on GitHub")),
        el("p", { class: "problem-detail", text: message }),
      ),
    );
  }

  function render() {
    if (!tools.length) {
      listView.replaceChildren(el("p", { class: "status", text: "No apps are listed yet." }));
      return;
    }
    stickers.replaceChildren(...tools.map((tool) => sticker(tool, "small")));
    listView.replaceChildren(
      ...[
        section(
          "web-tools",
          "Try them in your browser",
          "These are web apps: open one and use it right here, with nothing to install. In a browser, an app keeps its data only in that browser on that device.",
          tools.filter((t) => t.kind === "web"),
        ),
        section(
          "app-tools",
          "In the Zapli app",
          "These apps are made of Zapli's own screens, so they run only inside the Zapli app on your phone.",
          tools.filter((t) => t.kind === "declarative"),
        ),
      ].filter(Boolean),
    );
  }

  // The page sets the scroll position itself, since the list arrives after the page has loaded. Coming back from a
  // tool opened in this tab returns to the place in the list; the position is kept for this tab only.
  const SCROLL_KEY = "zapli-gallery-scroll";

  function rememberScroll() {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(listView.hidden ? listScroll : window.scrollY));
    } catch (e) {
      // Storage can be off (a private window); the list then opens at the top.
    }
  }

  function restoreScroll() {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      const y = Number(sessionStorage.getItem(SCROLL_KEY));
      if (nav && nav.type === "back_forward" && y > 0) {
        if (listView.hidden) listScroll = y;
        else window.scrollTo(0, y);
      }
    } catch (e) {
      // Without storage the list opens at the top.
    }
  }

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", rememberScroll);

  loadTools()
    .then((list) => {
      tools = list;
      render();
      route();
      restoreScroll();
    })
    .catch((e) => {
      showProblem(e && e.message ? String(e.message) : "Unknown problem");
    });
})();
