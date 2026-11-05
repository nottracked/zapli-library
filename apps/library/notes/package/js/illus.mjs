// Small drawings for the empty screens, drawn for this app on a 160 × 120 grid. Their colours come from the page's
// own variables, so they follow light and dark.

const SVG_NS = "http://www.w3.org/2000/svg";

// Each shape: [class, path]. "soft" is a pale accent shape, "paper" a sheet with an ink outline, "ink" a line,
// "accent" a filled accent shape.
const SCENES = {
  notes: [
    ["soft", "M30 96c0-30 22-58 52-58s52 22 52 50c0 8-4 12-12 12H38c-6 0-8-1-8-4z"],
    ["paper", "M46 30l50-8a6 6 0 0 1 7 5l9 58a6 6 0 0 1-5 7l-50 8a6 6 0 0 1-7-5l-9-58a6 6 0 0 1 5-7z"],
    ["paper", "M58 24h52a6 6 0 0 1 6 6v60a6 6 0 0 1-6 6H58a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6z"],
    ["ink", "M64 40h30"],
    ["ink", "M64 52h40"],
    ["ink", "M64 64h34"],
    ["ink", "M64 76h22"],
    ["accent", "M118 70l14-30a4 4 0 0 1 7 3l-12 31-9 5z"],
    ["accent", "M30 34l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  ],
  reminders: [
    ["soft", "M24 92c4-34 30-62 58-62s52 26 54 58c0 6-3 10-9 10H32c-5 0-8-2-8-6z"],
    ["paper", "M80 26c16 0 26 12 26 28v18l8 10H46l8-10V54c0-16 10-28 26-28z"],
    ["ink", "M72 90a8 8 0 0 0 16 0"],
    ["ink", "M80 18v8"],
    ["accent", "M118 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
    ["ink", "M34 46c2-8 6-14 12-18"],
    ["ink", "M126 46c-2-8-6-14-12-18"],
  ],
  archive: [
    ["soft", "M22 94c6-30 30-56 60-56s52 22 56 52c1 7-3 10-10 10H30c-6 0-9-2-8-6z"],
    ["paper", "M58 22h44a5 5 0 0 1 5 5v30H53V27a5 5 0 0 1 5-5z"],
    ["ink", "M62 34h30"],
    ["ink", "M62 44h22"],
    ["paper", "M40 52h80v8H40z"],
    ["paper", "M44 60h72v30a6 6 0 0 1-6 6H50a6 6 0 0 1-6-6z"],
    ["accent", "M70 72h20a4 4 0 0 1 0 8H70a4 4 0 0 1 0-8z"],
  ],
  trash: [
    ["soft", "M26 94c6-28 28-54 56-54s50 22 54 50c1 7-3 10-10 10H34c-6 0-9-2-8-6z"],
    ["paper", "M54 44h52l-5 50a6 6 0 0 1-6 5H65a6 6 0 0 1-6-5z"],
    ["paper", "M48 36h64a3 3 0 0 1 3 3v5H45v-5a3 3 0 0 1 3-3z"],
    ["ink", "M72 30h16"],
    ["ink", "M70 56v32"],
    ["ink", "M90 56v32"],
    ["accent", "M122 28l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
    ["accent", "M34 58l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"],
  ],
  search: [
    ["soft", "M24 94c4-30 28-58 58-58s54 24 56 54c0 7-4 10-10 10H32c-6 0-8-2-8-6z"],
    ["paper", "M44 24h48a6 6 0 0 1 6 6v58a6 6 0 0 1-6 6H44a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6z"],
    ["ink", "M50 40h30"],
    ["ink", "M50 52h36"],
    ["ink", "M50 64h20"],
    ["paper", "M104 50a20 20 0 1 1 0 40a20 20 0 0 1 0-40z"],
    ["ink", "M118 84l14 14"],
    ["accent", "M104 60a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6z"],
  ],
  label: [
    ["soft", "M24 92c6-30 30-56 60-56s52 24 54 54c0 7-3 10-10 10H32c-6 0-8-3-8-8z"],
    ["paper", "M46 30h40l30 30a6 6 0 0 1 0 8L90 94a6 6 0 0 1-8 0L52 64V36a6 6 0 0 1-6-6z"],
    ["accent", "M66 42a6 6 0 1 1 0 12a6 6 0 0 1 0-12z"],
    ["ink", "M78 70l12 12"],
  ],
};

/** A drawing as an SVG element, hidden from screen readers (the text beside it says the same). */
export function illustration(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 160 120");
  svg.setAttribute("class", "illus");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [kind, d] of SCENES[name] || SCENES.notes) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", kind);
    svg.appendChild(path);
  }
  return svg;
}
