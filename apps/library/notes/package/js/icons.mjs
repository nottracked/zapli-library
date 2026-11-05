// The page's line icons, drawn for this app on a 24 × 24 grid and stroked with the text colour (round caps and
// joins). A few have a filled variant for an "on" state, such as a pinned note.

const SVG_NS = "http://www.w3.org/2000/svg";

// Each icon is a list of path commands; a "fill:" prefix draws that path filled instead of stroked.
const PATHS = {
  menu: ["M4 7h16", "M4 12h16", "M4 17h10"],
  search: ["M10.5 4.5a6 6 0 1 1 0 12a6 6 0 0 1 0-12z", "M15 15l4.5 4.5"],
  back: ["M19 12H5.5", "M11 6l-6 6 6 6"],
  close: ["M6.5 6.5l11 11", "M17.5 6.5l-11 11"],
  add: ["M12 5v14", "M5 12h14"],
  pen: ["M4.5 19.5l1.2-4.4L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.9 18.3z", "M13.8 7l3.2 3.2", "M13 19.5h6.5"],
  checklist: [
    "M3.8 5.3h4.4v4.4H3.8z",
    "M3.8 14.3h4.4v4.4H3.8z",
    "M4.9 16.5l1 1 1.6-2",
    "M11.5 7.5h8.7",
    "M11.5 16.5h8.7",
  ],
  checkbox: ["M5 5h14v14H5z"],
  camera: ["M4 8.5h3.5L9 6h6l1.5 2.5H20v10H4z", "M12 10.6a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6z"],
  image: ["M4.5 5h15v14h-15z", "M4.5 16l4.5-4.5 4 4 2.5-2.5 4 4", "M15.5 8.8h.01"],
  grid: ["M4.5 4.5h6v6h-6z", "M13.5 4.5h6v9h-6z", "M4.5 13.5h6v6h-6z", "M13.5 16.5h6v3h-6z"],
  rows: ["M4.5 5h15v5.5h-15z", "M4.5 13.5h15V19h-15z"],
  pin: ["M9 4.5h6", "M10 4.5v5.2L7.2 13h9.6L14 9.7V4.5", "M12 13v6.5"],
  pinOn: ["fill:M9 4.5h6v1h-1v4.2l3.3 3.8v.5H6.7v-.5L10 9.7V5.5H9z", "M12 13v6.5"],
  bell: ["M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 1.5H5z", "M10.2 20.5a2 2 0 0 0 3.6 0"],
  bellPlus: [
    "M6.5 16.5v-5a5.5 5.5 0 0 1 9-4.2",
    "M17.5 11v5.5l1.5 1.5H5l1.5-1.5",
    "M10.2 20.5a2 2 0 0 0 3.6 0",
    "M18.5 3.5v5",
    "M16 6h5",
  ],
  archive: ["M4 5h16v4H4z", "M5.5 9v10h13V9", "M10 13h4"],
  unarchive: ["M4 5h16v4H4z", "M5.5 9v10h13V9", "M12 17.5v-5.5", "M9.5 14.5L12 12l2.5 2.5"],
  trash: ["M5 7h14", "M9.5 7V4.5h5V7", "M7 7l.9 12.5h8.2L17 7", "M10.3 10.5v5.5", "M13.7 10.5v5.5"],
  restore: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4", "M12 8.5V12l2.5 2"],
  more: [
    "fill:M12 4.2a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 0 1 0-3.2z",
    "fill:M12 10.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 0 1 0-3.2z",
    "fill:M12 16.6a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 0 1 0-3.2z",
  ],
  palette: [
    "M12 4a8 8 0 1 0 0 16c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.8-1.3-3 0-1 .8-1.6 1.8-1.6H17a3 3 0 0 0 3-3C20 7 16.4 4 12 4z",
    "fill:M7.8 11.2a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 0 1 0-2.4z",
    "fill:M10 7.4a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 0 1 0-2.4z",
    "fill:M14.6 7.6a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 0 1 0-2.4z",
  ],
  label: [
    "M4.5 6.5v5.2l7.8 7.8a1.5 1.5 0 0 0 2.1 0l5.1-5.1a1.5 1.5 0 0 0 0-2.1L11.7 4.5H6.5a2 2 0 0 0-2 2z",
    "M8.6 8.6h.01",
  ],
  labelAdd: [
    "M4.5 6.5v5.2l7.8 7.8a1.5 1.5 0 0 0 2.1 0l2-2",
    "M11.7 4.5H6.5a2 2 0 0 0-2 2",
    "M8.6 8.6h.01",
    "M17.5 5v6",
    "M14.5 8h6",
  ],
  undo: ["M9 6.5L4.5 11 9 15.5", "M4.5 11h9.5a5 5 0 0 1 0 10H12"],
  redo: ["M15 6.5l4.5 4.5-4.5 4.5", "M19.5 11H10a5 5 0 0 0 0 10h2"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  grip: [
    "fill:M9 6a1.4 1.4 0 1 1 0 2.8A1.4 1.4 0 0 1 9 6z",
    "fill:M15 6a1.4 1.4 0 1 1 0 2.8A1.4 1.4 0 0 1 15 6z",
    "fill:M9 10.6a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8z",
    "fill:M15 10.6a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8z",
    "fill:M9 15.2a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8z",
    "fill:M15 15.2a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8z",
  ],
  chevronDown: ["M6 9.5l6 6 6-6"],
  arrowUp: ["M12 19V5.5", "M6.5 11L12 5.5l5.5 5.5"],
  arrowDown: ["M12 5v13.5", "M6.5 13l5.5 5.5 5.5-5.5"],
  toTop: ["M5 4.5h14", "M12 20V9.5", "M7 14.5l5-5 5 5"],
  toBottom: ["M5 19.5h14", "M12 4v10.5", "M7 9.5l5 5 5-5"],
  chevronRight: ["M9.5 6l6 6-6 6"],
  chevronLeft: ["M14.5 6l-6 6 6 6"],
  share: ["M12 15V4.5", "M8 8.5l4-4 4 4", "M6 12v7.5h12V12"],
  copy: ["M8.5 8.5h11v11h-11z", "M15.5 8.5v-4h-11v11h4"],
  info: ["M12 3.8a8.2 8.2 0 1 1 0 16.4a8.2 8.2 0 0 1 0-16.4z", "M12 11v5.5", "M12 7.8h.01"],
  settings: [
    "M12 9.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6z",
    "M12 3.5v2.2",
    "M12 18.3v2.2",
    "M3.5 12h2.2",
    "M18.3 12h2.2",
    "M6 6l1.6 1.6",
    "M16.4 16.4L18 18",
    "M6 18l1.6-1.6",
    "M16.4 7.6L18 6",
  ],
  exportFile: ["M12 14.5V4", "M7.8 8.2L12 4l4.2 4.2", "M5 13v6.5h14V13"],
  importFile: ["M12 4v10.5", "M7.8 10.3l4.2 4.2 4.2-4.2", "M5 13v6.5h14V13"],
  lock: ["M6.5 11h11v9h-11z", "M8.8 11V8.2a3.2 3.2 0 0 1 6.4 0V11"],
  repeat: ["M16.5 3.5l3 3-3 3", "M5 12v-1.5a4 4 0 0 1 4-4h10.5", "M7.5 20.5l-3-3 3-3", "M19 12v1.5a4 4 0 0 1-4 4H4.5"],
  clock: ["M12 4a8 8 0 1 1 0 16a8 8 0 0 1 0-16z", "M12 8v4.5l3 1.8"],
  textLines: ["M5 6.5h14", "M5 11h14", "M5 15.5h9"],
  sun: ["M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7z", "M12 3.5v1.5", "M12 19v1.5", "M3.5 12H5", "M19 12h1.5"],
  sweep: ["M5 7h14", "M9.5 7V4.5h5V7", "M7 7l.9 12.5h8.2L17 7", "M9.8 11.5l4.4 4.4", "M14.2 11.5l-4.4 4.4"],
  sort: ["M7 5v14", "M4 16l3 3 3-3", "M13 7h7", "M13 12h5", "M13 17h3"],
  vibrate: ["M8 4.5h8v15H8z", "M4.5 9v6", "M19.5 9v6"],
  translate: [
    "M4 6h9",
    "M8.5 4v2",
    "M6 6c.6 3 2.8 5.6 6 7",
    "M11 6c-.6 3-2.8 5.6-6 7",
    "M13 20l3.5-8 3.5 8",
    "M14.3 17.2h4.4",
  ],
  noteOutline: ["M6 4h9l4 4v12H6z", "M15 4v4h4", "M9 12h6", "M9 15.5h4"],
  sparkle: [
    "M12 4l1.6 4.6L18 10l-4.4 1.4L12 16l-1.6-4.6L6 10l4.4-1.4z",
    "M18.5 15.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z",
  ],
  text: ["M6 6.5V5h12v1.5", "M12 5v14", "M9.5 19h5"],
  fontSize: ["M4 18l4.5-12L13 18", "M5.8 14h5.4", "M15 18l2.8-7.5 2.8 7.5", "M16 15.7h3.6"],
};

/** An icon as an inline SVG element; `label` names it for screen readers, else it is hidden from them. */
export function icon(name, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon icon-" + name);
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  svg.setAttribute("focusable", "false");
  for (const d of PATHS[name] || PATHS.noteOutline) {
    const path = document.createElementNS(SVG_NS, "path");
    if (d.startsWith("fill:")) {
      path.setAttribute("d", d.slice(5));
      path.setAttribute("class", "solid");
    } else path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Every icon name, for the checks in dev/. */
export const ICON_NAMES = Object.keys(PATHS);
