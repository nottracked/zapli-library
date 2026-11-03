// The page's pictures: line icons drawn for this app (24 × 24, stroked with the text colour), a picture for each
// category icon the store names, and the colours of categories.

const SVG_NS = "http://www.w3.org/2000/svg";

// Each icon is a list of SVG path commands, drawn with round caps and joins.
const PATHS = {
  add: ["M12 5v14", "M5 12h14"],
  back: ["M19 12H5", "M11 6l-6 6 6 6"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  check: ["M5 12.5l4.5 4.5L19 7"],
  search: ["M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z", "M15.5 15.5L20 20"],
  filter: ["M4 6h16", "M7 12h10", "M10 18h4"],
  calendar: ["M5 6h14v14H5z", "M5 10h14", "M9 3.5v4", "M15 3.5v4"],
  home: ["M4 11l8-7 8 7", "M6 9.5V20h12V9.5", "M10 20v-5h4v5"],
  list: ["M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01", "M4.5 12h.01", "M4.5 18h.01"],
  chart: ["M5 20V10", "M10 20V4", "M15 20v-7", "M20 20v-11"],
  budget: ["M12 3a9 9 0 1 0 9 9h-9z", "M15 3.5A9 9 0 0 1 20.5 9H15z"],
  wallet: ["M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z", "M4 7l11-3v3", "M15.5 13.5h.01"],
  settings: [
    "M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6z",
    "M12 2.8v2.4",
    "M12 18.8v2.4",
    "M2.8 12h2.4",
    "M18.8 12h2.4",
    "M5.5 5.5l1.7 1.7",
    "M16.8 16.8l1.7 1.7",
    "M5.5 18.5l1.7-1.7",
    "M16.8 7.2l1.7-1.7",
  ],
  trash: ["M5 7h14", "M9 7V4.5h6V7", "M7 7l1 13h8l1-13", "M10.5 11v5.5", "M13.5 11v5.5"],
  edit: ["M5 19l1-4 10-10 3 3-10 10z", "M14 7l3 3"],
  camera: ["M4 8h4l1.5-2.5h5L16 8h4v11H4z", "M12 10.5a3.2 3.2 0 1 1 0 6.4a3.2 3.2 0 0 1 0-6.4z"],
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 3-3 4 4", "M15.5 8.5h.01"],
  repeat: ["M17 3l3 3-3 3", "M4 12V9a3 3 0 0 1 3-3h13", "M7 21l-3-3 3-3", "M20 12v3a3 3 0 0 1-3 3H4"],
  swap: ["M7 4L4 7l3 3", "M4 7h13", "M17 14l3 3-3 3", "M20 17H7"],
  chevronRight: ["M9 5l7 7-7 7"],
  chevronLeft: ["M15 5l-7 7 7 7"],
  chevronDown: ["M5 9l7 7 7-7"],
  more: ["M12 5h.01", "M12 12h.01", "M12 19h.01"],
  importFile: ["M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 19.5h14"],
  exportFile: ["M12 15V4", "M7.5 8.5L12 4l4.5 4.5", "M5 19.5h14"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  receipt: ["M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z", "M9 8h6", "M9 12h6", "M9 16h3"],
  tag: ["M4 4h7l9 9-7 7-9-9z", "M8 8h.01"],
  sparkle: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"],
  undo: ["M9 7L4 12l5 5", "M4 12h10a4.5 4.5 0 0 1 0 9h-3"],
  info: ["M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z", "M12 11v6", "M12 7.5h.01"],
  warning: ["M12 4l9 16H3z", "M12 10v4.5", "M12 17.5h.01"],
  backspace: ["M9 6h11v12H9l-6-6z", "M12.5 9.5l5 5", "M17.5 9.5l-5 5"],
  bell: ["M6 16V11a6 6 0 0 1 12 0v5l2 2H4z", "M10 20.5a2 2 0 0 0 4 0"],
  savings: ["M5 11a7 6 0 0 1 14 0v3l-2 1v3h-3v-2h-4v2H7v-3.5A6 6 0 0 1 5 11z", "M15.5 10h.01", "M10 6.5l2-2.5"],
  income: ["M12 20V5", "M6 11l6-6 6 6"],
  expense: ["M12 4v15", "M6 13l6 6 6-6"],
};

/** An icon as an inline SVG element; `label` gives it a name for screen readers, else it is hidden from them. */
export function icon(name, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else svg.setAttribute("aria-hidden", "true");
  for (const d of PATHS[name] || PATHS.info) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** The picture shown for each category icon name the store keeps, with the colour it brings. */
export const CATEGORY_ICONS = {
  shopping_cart: ["🛒", "green"],
  restaurant: ["🍽️", "orange"],
  local_cafe: ["☕", "brown"],
  local_drink: ["🥤", "amber"],
  directions_car: ["🚗", "blue"],
  directions_bike: ["🚲", "lime"],
  directions_walk: ["🚌", "teal"],
  flight: ["✈️", "cyan"],
  home: ["🏠", "brown"],
  bolt: ["⚡", "amber"],
  water_drop: ["💧", "cyan"],
  wifi: ["📶", "indigo"],
  call: ["📱", "indigo"],
  receipt_long: ["🧾", "indigo"],
  autorenew: ["🔁", "violet"],
  medical_services: ["🩺", "red"],
  medication: ["💊", "red"],
  fitness_center: ["🏋️", "lime"],
  spa: ["💆", "pink"],
  shopping_bag: ["🛍️", "violet"],
  movie: ["🎬", "pink"],
  sports_esports: ["🎮", "violet"],
  music_note: ["🎵", "pink"],
  menu_book: ["📚", "brown"],
  school: ["🎓", "blue"],
  child_care: ["🧸", "amber"],
  family_restroom: ["👪", "orange"],
  pets: ["🐾", "brown"],
  cake: ["🎁", "pink"],
  local_florist: ["🌷", "green"],
  cleaning_services: ["🧹", "cyan"],
  handyman: ["🔧", "orange"],
  work: ["💼", "blue"],
  savings: ["🐷", "green"],
  volunteer_activism: ["🤝", "red"],
  account_balance: ["🏦", "grey"],
  attach_money: ["💵", "green"],
  sell: ["🏷️", "teal"],
  trending_up: ["📈", "green"],
  storefront: ["🏪", "blue"],
  emoji_events: ["🏆", "amber"],
  category: ["📦", "grey"],
};

/** The icons offered when a category is made or edited, in picker order. */
export const ICON_CHOICES = Object.keys(CATEGORY_ICONS);

/** The pictures of the kinds of account. */
export const ACCOUNT_ICONS = { bank: "🏦", cash: "💶", card: "💳", savings: "🐷", other: "👛" };

/** The twelve colours a category can take (the store keeps the hex value). */
export const COLOR_CHOICES = [
  ["#D32F2F", "red"],
  ["#C2185B", "pink"],
  ["#7B1FA2", "violet"],
  ["#512DA8", "indigo"],
  ["#1976D2", "blue"],
  ["#0288D1", "cyan"],
  ["#00897B", "teal"],
  ["#388E3C", "green"],
  ["#F9A825", "amber"],
  ["#EF6C00", "orange"],
  ["#6D4C41", "brown"],
  ["#546E7A", "grey"],
];

/** The colour name of a category: its own colour when set, else its icon's. */
export function hueOf(category) {
  if (!category) return "grey";
  const own = category.color && COLOR_CHOICES.find(([hex]) => hex === String(category.color).toUpperCase());
  if (own) return own[1];
  return (CATEGORY_ICONS[category.icon] || CATEGORY_ICONS.category)[1];
}

/** The picture of a category icon name. */
export function emojiOf(name) {
  return (CATEGORY_ICONS[name] || CATEGORY_ICONS.category)[0];
}
