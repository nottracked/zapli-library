// The app's own line icons, drawn on a 24-unit grid with round 1.8-unit strokes in the current text colour.

const PATHS = {
  plus: ["M12 5v14", "M5 12h14"],
  search: ["M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z", "M15.4 15.4L20 20"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  back: ["M19 12H5", "M11 6l-6 6l6 6"],
  more: ["M12 5.5v.01", "M12 12v.01", "M12 18.5v.01"],
  star: ["M12 3.8l2.5 5.2l5.6.8l-4.1 3.9l1 5.6L12 16.6l-5 2.7l1-5.6l-4.1-3.9l5.6-.8z"],
  scan: [
    "M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8",
    "M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8",
    "M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16",
    "M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16",
    "M8 8v8",
    "M11 8v8",
    "M13.5 8v8",
    "M16 8v8",
  ],
  image: [
    "M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z",
    "M3.5 16l4.5-4.5l4 4l2.5-2.5l6 5",
    "M15.5 8.5v.01",
  ],
  images: [
    "M7 3.5h12A1.5 1.5 0 0 1 20.5 5v10a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 15V5A1.5 1.5 0 0 1 7 3.5z",
    "M5.5 13l3.5-3.5l3 3l2-2l6.5 6",
    "M3.5 7.5V19A1.5 1.5 0 0 0 5 20.5h11.5",
  ],
  camera: ["M4 8h3.5L9 5.5h6L16.5 8H20v11H4z", "M12 10.5a3.2 3.2 0 1 1 0 6.4a3.2 3.2 0 0 1 0-6.4z"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  share: ["M12 4v11", "M8 8l4-4l4 4", "M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"],
  archive: ["M4 5h16v4H4z", "M5.5 9v9.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V9", "M10 13h4"],
  unarchive: [
    "M4 5h16v4H4z",
    "M5.5 9v9.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V9",
    "M12 17v-5",
    "M9.5 14l2.5-2.5l2.5 2.5",
  ],
  trash: ["M5 7h14", "M10 4h4", "M6.5 7l1 12.5h9l1-12.5", "M10 11v5", "M14 11v5"],
  settings: ["M4 7h9", "M17 7h3", "M15 5v4", "M4 17h3", "M11 17h9", "M9 15v4", "M4 12h13", "M20 12h0"],
  download: ["M12 4v11", "M8 11l4 4l4-4", "M5 19h14"],
  upload: ["M12 15V4", "M8 8l4-4l4 4", "M5 19h14"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  chevron: ["M9 6l6 6l-6 6"],
  chevronDown: ["M6 9l6 6l6-6"],
  chevronUp: ["M6 15l6-6l6 6"],
  sort: ["M4 7h10", "M4 12h7", "M4 17h4", "M17.5 5v14", "M14.5 16l3 3l3-3"],
  blank: [],
  sun: [
    "M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7z",
    "M12 3v2",
    "M12 19v2",
    "M3 12h2",
    "M19 12h2",
    "M5.6 5.6l1.4 1.4",
    "M17 17l1.4 1.4",
    "M5.6 18.4L7 17",
    "M17 7l1.4-1.4",
  ],
  keyboard: [
    "M4 6.5h16A1.5 1.5 0 0 1 21.5 8v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V8A1.5 1.5 0 0 1 4 6.5z",
    "M6 10h.01",
    "M9 10h.01",
    "M12 10h.01",
    "M15 10h.01",
    "M18 10h.01",
    "M8 14h8",
  ],
  wallet: [
    "M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3",
    "M4 7.5V17a2 2 0 0 0 2 2h13.5v-11H6.5A2.5 2.5 0 0 1 4 5.5",
    "M16 13.5h.01",
  ],
  coin: ["M12 4a8 8 0 1 1 0 16a8 8 0 0 1 0-16z", "M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8z"],
  info: ["M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17z", "M12 11v5", "M12 8v.01"],
  // Kinds of shop
  shopping_cart: ["M3 4h2.5l2.2 10.5h10.6L20.5 7H6.4", "M9 19.5h.01", "M17 19.5h.01"],
  storefront: [
    "M4 9.5L5.5 4.5h13L20 9.5",
    "M4 9.5a2.7 2.7 0 0 0 5.3 0a2.7 2.7 0 0 0 5.4 0a2.7 2.7 0 0 0 5.3 0",
    "M5.5 12v8h13v-8",
    "M10 20v-4.5h4V20",
  ],
  shopping_bag: ["M5 8h14l-1 12H6z", "M9 10V7a3 3 0 0 1 6 0v3"],
  medication: ["M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"],
  spa: [
    "M12 20c-4.5 0-7-3-7-7c3.5 0 6 1.5 7 4c1-2.5 3.5-4 7-4c0 4-2.5 7-7 7z",
    "M12 16.5C10 14 10 9 12 5c2 4 2 9 0 11.5z",
  ],
  directions_car: [
    "M5 16.5V12l2-5h10l2 5v4.5",
    "M3.5 12h17",
    "M5 16.5h14",
    "M7.5 19v-2.5",
    "M16.5 19v-2.5",
    "M7.5 14h.01",
    "M16.5 14h.01",
  ],
  handyman: ["M14 6.5a3.5 3.5 0 0 0 4.8 4.4L20 12l-2 2l-1.2-1.2", "M14.7 9.3L5 19", "M4.5 4.5l4 4", "M3.5 7.5l3-3"],
  keyboardKind: [
    "M4 6.5h16A1.5 1.5 0 0 1 21.5 8v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V8A1.5 1.5 0 0 1 4 6.5z",
    "M8 14h8",
  ],
  menu_book: ["M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5c2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z", "M12 6.5v13"],
  restaurant: ["M7 3.5v17", "M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5", "M16.5 20.5V3.5c-2 1-3 3.5-3 6.5v3h3"],
  local_cafe: ["M5 9h11v5.5a5.5 5.5 0 0 1-11 0z", "M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16", "M8 3.5v2.5", "M11.5 3.5v2.5"],
  flight: ["M3 13l18-7l-5 14l-3.5-6.5z", "M12.5 13.5L21 6"],
  fitness_center: ["M6.5 7v10", "M4 9.5v5", "M17.5 7v10", "M20 9.5v5", "M6.5 12h11"],
  pets: [
    "M12 13c-3 0-5.5 2.8-5.5 5c0 1.5 1.5 2 2.8 1.5c1-.4 1.8-.7 2.7-.7s1.7.3 2.7.7c1.3.5 2.8 0 2.8-1.5c0-2.2-2.5-5-5.5-5z",
    "M5.5 10.5v.01",
    "M9 6.5v.01",
    "M15 6.5v.01",
    "M18.5 10.5v.01",
  ],
  child_care: ["M12 4a8 8 0 1 1 0 16a8 8 0 0 1 0-16z", "M9 10.5v.01", "M15 10.5v.01", "M9.5 14.5a3.5 3.5 0 0 0 5 0"],
  book: ["M6 4.5h11.5v15H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5z", "M4.5 16.5A1.5 1.5 0 0 1 6 15h11.5", "M9 8h5"],
  badge: [
    "M5 6.5h14A1.5 1.5 0 0 1 20.5 8v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V8A1.5 1.5 0 0 1 5 6.5z",
    "M9 10.5a2 2 0 1 1 0 4a2 2 0 0 1 0-4z",
    "M13.5 11h4",
    "M13.5 14h3",
  ],
  sell: ["M4 4h7.5l8.5 8.5l-7.5 7.5L4 11.5z", "M8 8v.01"],
};

/** An inline SVG icon by name; `filled` fills the shape (a set star). */
export function icon(name, { filled = false } = {}) {
  const paths = PATHS[name] || PATHS.storefront;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "icon");
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", filled ? "currentColor" : "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }
  return svg;
}

/** The icon of a kind of shop (the card's `group`). */
export function kindIcon(kind) {
  if (kind === "keyboard") return icon("keyboardKind");
  return icon(PATHS[kind] ? kind : "storefront");
}
