// The stores the app knows, so adding a card is a tap on its tile: the store's name, the kind of shop, a colour of
// the app's own palette close to the store's colour family (no logos, no brand artwork, no exact brand colours), and
// a few other names people search for. `sk`, `cz` and `int` give the store's place in the popular list of Slovakia,
// Czechia and the international (English) set; a store without one is still found by search.

/** The app's palette for card faces and store tiles: a background and the text colour that reads on it. */
export const TONES = {
  red: { bg: "#D42A2C", fg: "#FFFFFF" },
  crimson: { bg: "#AF1D35", fg: "#FFFFFF" },
  tomato: { bg: "#CF3B22", fg: "#FFFFFF" },
  orange: { bg: "#C6520B", fg: "#FFFFFF" },
  amber: { bg: "#F4A51C", fg: "#2A1A00" },
  yellow: { bg: "#FFD43B", fg: "#2A2100" },
  lime: { bg: "#93C83E", fg: "#14240A" },
  green: { bg: "#2A803F", fg: "#FFFFFF" },
  forest: { bg: "#1D6236", fg: "#FFFFFF" },
  mint: { bg: "#8ED8BE", fg: "#0D2E24" },
  teal: { bg: "#0D7A72", fg: "#FFFFFF" },
  cyan: { bg: "#0B78AB", fg: "#FFFFFF" },
  blue: { bg: "#1C5FC2", fg: "#FFFFFF" },
  royal: { bg: "#2A3F9E", fg: "#FFFFFF" },
  navy: { bg: "#152B5C", fg: "#FFFFFF" },
  violet: { bg: "#5A3EC0", fg: "#FFFFFF" },
  purple: { bg: "#782C8C", fg: "#FFFFFF" },
  magenta: { bg: "#BE1A6C", fg: "#FFFFFF" },
  pink: { bg: "#F2A7C3", fg: "#3D0A1F" },
  brown: { bg: "#6B4733", fg: "#FFFFFF" },
  sand: { bg: "#EADBBC", fg: "#33270F" },
  black: { bg: "#18191D", fg: "#FFFFFF" },
  slate: { bg: "#46525F", fg: "#FFFFFF" },
  white: { bg: "#FFFFFF", fg: "#18191D" },
};

/** The text colours a store's name may take on its tile, besides the tone's own. */
export const INKS = {
  red: "#C8102E",
  navy: "#14306B",
  blue: "#1B4FA8",
  yellow: "#FFD43B",
  green: "#1E7A3A",
  black: "#18191D",
  white: "#FFFFFF",
};

// A store: id, name, kind (the card's kind of shop), tone, optional ink, country ranks and search names.
const B = (id, name, kind, tone, ranks, aliases = [], ink) => ({ id, name, kind, tone, ink, ...ranks, aliases });

const GROCERY = "shopping_cart";
const SHOP = "storefront";
const CLOTHES = "shopping_bag";
const PHARMACY = "medication";
const BEAUTY = "spa";
const FUEL = "directions_car";
const DIY = "handyman";
const TECH = "keyboard";
const BOOKS = "menu_book";
const FOOD = "restaurant";
const COFFEE = "local_cafe";
const SPORT = "fitness_center";
const PETS = "pets";
const KIDS = "child_care";
const MEMBER = "badge";

export const BRANDS = [
  // Groceries
  B("kaufland", "Kaufland", GROCERY, "red", { sk: 1, cz: 3, int: 14 }, ["kaufland card", "k card"]),
  B("lidl", "Lidl", GROCERY, "blue", { sk: 2, cz: 2, int: 3 }, ["lidl plus"], "yellow"),
  B("tesco", "Tesco", GROCERY, "white", { sk: 3, cz: 4, int: 1 }, ["clubcard", "tesco clubcard"], "navy"),
  B("billa", "Billa", GROCERY, "yellow", { sk: 4, cz: 5, int: 22 }, ["billa club", "billa bonus"], "red"),
  B("coop-jednota", "COOP Jednota", GROCERY, "red", { sk: 6 }, ["jednota", "coop", "konzum"]),
  B("terno", "Terno", GROCERY, "royal", { sk: 9 }, ["terno karta"]),
  B("fresh", "Fresh", GROCERY, "green", { sk: 18 }, ["fresh market"]),
  B("cba", "CBA", GROCERY, "crimson", { sk: 30 }, []),
  B("labas", "Labaš", GROCERY, "orange", { sk: 36 }, ["labas"]),
  B("metro", "Metro", GROCERY, "navy", { sk: 29, cz: 36, int: 26 }, ["metro cash and carry", "makro"], "yellow"),
  B("albert", "Albert", GROCERY, "blue", { cz: 1 }, ["albert karta", "moje albert"]),
  B("penny", "Penny", GROCERY, "red", { cz: 6 }, ["penny market"], "yellow"),
  B("globus", "Globus", GROCERY, "yellow", { cz: 8 }, ["globus karta"], "green"),
  B("coop-cz", "COOP", GROCERY, "red", { cz: 12 }, ["coop centrum", "jednota"]),
  B("zabka", "Žabka", GROCERY, "green", { cz: 13 }, ["zabka", "zabka jush"]),
  B("rohlik", "Rohlík", GROCERY, "lime", { cz: 20 }, ["rohlik"]),
  B("sainsburys", "Sainsbury’s", GROCERY, "orange", { int: 2 }, ["sainsburys", "nectar"]),
  B("morrisons", "Morrisons", GROCERY, "forest", { int: 6 }, ["more card"], "yellow"),
  B("coop-uk", "Co-op", GROCERY, "cyan", { int: 7 }, ["co op", "coop membership"]),
  B("waitrose", "Waitrose", GROCERY, "forest", { int: 9 }, ["mywaitrose"]),
  B("asda", "Asda", GROCERY, "green", { int: 10 }, ["asda rewards"]),
  B("marks-spencer", "M&S", GROCERY, "black", { int: 8 }, ["marks and spencer", "sparks"]),
  B("carrefour", "Carrefour", GROCERY, "blue", { int: 15 }, []),
  B("auchan", "Auchan", GROCERY, "red", { int: 21 }, []),
  B("spar", "Spar", GROCERY, "green", { int: 20 }, ["eurospar", "interspar"], "white"),
  B("iceland", "Iceland", GROCERY, "red", { int: 23 }, ["bonus card"]),

  // Drugstores, beauty and pharmacies
  B(
    "dm",
    "dm",
    BEAUTY,
    "white",
    { sk: 5, cz: 7, int: 16 },
    ["dm drogerie", "dm drogeria", "dm drogerie markt", "active beauty"],
    "navy",
  ),
  B("teta", "TETA", BEAUTY, "pink", { sk: 8, cz: 10 }, ["teta drogerie", "teta drogeria"]),
  B("rossmann", "Rossmann", BEAUTY, "red", { cz: 9, int: 17 }, ["rossmann club"]),
  B("dr-max", "Dr.Max", PHARMACY, "green", { sk: 7, cz: 11 }, ["dr max", "drmax", "lekaren", "lekarna", "karta vyhod"]),
  B("benu", "Benu", PHARMACY, "teal", { sk: 12, cz: 18 }, ["benu lekaren", "benu lekarna"]),
  B("schneider", "Lekáreň Schneider", PHARMACY, "forest", { sk: 37 }, ["schneider", "lekaren schneider"]),
  B("adus", "Adus", PHARMACY, "cyan", { sk: 40 }, ["adus lekaren"]),
  B("pilulka", "Pilulka", PHARMACY, "teal", { cz: 32 }, ["pilulka lekarna"]),
  B("douglas", "Douglas", BEAUTY, "black", { sk: 26, cz: 28, int: 18 }, ["douglas beauty card"], "white"),
  B("marionnaud", "Marionnaud", BEAUTY, "purple", { sk: 27, cz: 30 }, []),
  B("notino", "Notino", BEAUTY, "black", { sk: 31, cz: 29 }, []),
  B("sephora", "Sephora", BEAUTY, "black", { sk: 32, cz: 31, int: 19 }, []),
  B("yves-rocher", "Yves Rocher", BEAUTY, "forest", { sk: 42, cz: 41 }, ["yves rocher"]),
  B("boots", "Boots", PHARMACY, "navy", { int: 4 }, ["advantage card", "boots advantage"]),
  B("superdrug", "Superdrug", BEAUTY, "magenta", { int: 5 }, ["health and beautycard"]),
  B("holland-barrett", "Holland & Barrett", PHARMACY, "forest", { int: 24 }, [
    "holland and barrett",
    "rewards for life",
  ]),

  // Fuel
  B("slovnaft", "Slovnaft", FUEL, "green", { sk: 10 }, ["slovnaft bonus", "bonus karta"]),
  B("omv", "OMV", FUEL, "teal", { sk: 11, cz: 16, int: 27 }, ["omv karta", "myomv"]),
  B("shell", "Shell", FUEL, "yellow", { sk: 13, cz: 15, int: 11 }, ["clubsmart", "shell go+"], "red"),
  B("mol", "MOL", FUEL, "red", { cz: 17 }, ["mol move"]),
  B("orlen", "Orlen", FUEL, "red", { cz: 14 }, ["benzina", "orlen vitay", "vitay"]),
  B("bp", "BP", FUEL, "green", { int: 12 }, ["bpme", "bp rewards"], "yellow"),
  B("esso", "Esso", FUEL, "royal", { int: 25 }, ["esso extras"]),

  // Home, DIY and furniture
  B("hornbach", "Hornbach", DIY, "orange", { sk: 14, cz: 19 }, ["projektova karta"]),
  B("obi", "OBI", DIY, "orange", { sk: 15, cz: 21 }, ["obi heimwerker", "obi karta"]),
  B("ikea", "IKEA", SHOP, "blue", { sk: 16, cz: 22, int: 13 }, ["ikea family"], "yellow"),
  B("merkury", "Merkury Market", DIY, "red", { sk: 35 }, ["merkury"]),
  B("mountfield", "Mountfield", DIY, "green", { sk: 39, cz: 40 }, []),
  B("bauhaus", "Bauhaus", DIY, "red", { cz: 23 }, []),
  B("uni-hobby", "Uni Hobby", DIY, "blue", { cz: 35 }, ["unihobby"], "yellow"),
  B("mobelix", "Möbelix", SHOP, "red", { sk: 38, cz: 37 }, ["mobelix"]),
  B("xxxlutz", "XXXLutz", SHOP, "red", { sk: 41, cz: 38 }, ["lutz"]),
  B("jysk", "JYSK", SHOP, "blue", { sk: 43, cz: 34 }, ["jysk club"]),
  B("sconto", "Sconto", SHOP, "orange", { cz: 42 }, []),

  // Electronics
  B("nay", "Nay", TECH, "black", { sk: 22 }, ["nay elektrodom"], "yellow"),
  B("datart", "Datart", TECH, "red", { sk: 24, cz: 24 }, []),
  B("okay", "Okay", TECH, "orange", { sk: 33 }, ["okay elektro"]),
  B("electro-world", "Electro World", TECH, "royal", { cz: 27 }, ["electroworld"]),
  B("alza", "Alza", TECH, "navy", { sk: 44, cz: 25 }, ["alzaplus"]),

  // Clothes and shoes
  B("ccc", "CCC", CLOTHES, "orange", { sk: 19, cz: 26 }, ["ccc club"]),
  B("deichmann", "Deichmann", CLOTHES, "forest", { sk: 20, cz: 33, int: 28 }, []),
  B("bata", "Baťa", CLOTHES, "red", { sk: 25, cz: 39 }, ["bata", "bata club"]),
  B("hm", "H&M", CLOTHES, "red", { sk: 21, cz: 55, int: 29 }, ["h and m", "hm member"]),
  B("reserved", "Reserved", CLOTHES, "black", { sk: 45, cz: 45 }, []),
  B("pepco", "Pepco", CLOTHES, "blue", { sk: 34, cz: 43 }, []),
  B("lindex", "Lindex", CLOTHES, "black", { sk: 46 }, ["lindex more"]),
  B("tchibo", "Tchibo", SHOP, "navy", { sk: 28, cz: 44, int: 30 }, ["tchibo privat card"]),

  // Books
  B("martinus", "Martinus", BOOKS, "crimson", { sk: 17 }, ["martinus karta"]),
  B("panta-rhei", "Panta Rhei", BOOKS, "red", { sk: 23 }, ["panta rhei club"]),
  B("luxor", "Luxor", BOOKS, "navy", { cz: 46 }, ["knihy luxor"]),
  B("dobrovsky", "Knihy Dobrovský", BOOKS, "teal", { cz: 47 }, ["dobrovsky"]),
  B("waterstones", "Waterstones", BOOKS, "black", { int: 31 }, ["waterstones plus"]),

  // Coffee and food
  B("costa", "Costa Coffee", COFFEE, "crimson", { int: 32 }, ["costa", "costa club"]),
  B("starbucks", "Starbucks", COFFEE, "forest", { int: 33 }, ["starbucks rewards"]),

  // Sport
  B("decathlon", "Decathlon", SPORT, "blue", { sk: 47, cz: 48, int: 34 }, []),
  B("sportisimo", "Sportisimo", SPORT, "blue", { sk: 48, cz: 49 }, ["sportisimo karta"], "yellow"),
  B("intersport", "Intersport", SPORT, "royal", { sk: 49 }, []),
  B("hervis", "Hervis", SPORT, "red", { cz: 50 }, []),

  // Pets, children, cinemas
  B("pet-center", "Pet Center", PETS, "orange", { sk: 50, cz: 51 }, ["petcenter"]),
  B("super-zoo", "Super zoo", PETS, "green", { cz: 52 }, ["superzoo"]),
  B("dracik", "Dráčik", KIDS, "purple", { sk: 51, cz: 53 }, ["dracik"]),
  B("cinema-city", "Cinema City", MEMBER, "black", { sk: 52, cz: 54 }, ["cinemacity"]),
  B("cinemax", "Cinemax", MEMBER, "red", { sk: 53 }, []),
];

export const COUNTRIES = ["sk", "cz", "int"];

/** The country whose list a phone language opens with: Slovak → Slovakia, Czech → Czechia, others international. */
export function countryFor(language) {
  const lang = String(language || "").toLowerCase();
  if (lang.startsWith("sk")) return "sk";
  if (lang.startsWith("cs") || lang.startsWith("cz")) return "cz";
  return "int";
}

/** A word as search compares it: lower case, no accents, letters and digits only. */
export function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const byId = new Map(BRANDS.map((b) => [b.id, b]));
const byName = new Map();
for (const b of BRANDS) {
  for (const name of [b.name, ...b.aliases]) {
    const key = fold(name).replace(/ /g, "");
    if (!byName.has(key)) byName.set(key, b);
  }
}

export function brandById(id) {
  return (id && byId.get(id)) || null;
}

/** The store a card's name stands for, when it is one of the list's names (cards saved before the list existed). */
export function brandForName(name) {
  const key = fold(name).replace(/ /g, "");
  return (key && byName.get(key)) || null;
}

/** The popular stores of `country`, most popular first. */
export function popular(country) {
  return BRANDS.filter((b) => b[country]).sort((a, b) => a[country] - b[country]);
}

/** Every store of `country`'s list, A to Z, then the others. */
export function allStores(country) {
  const name = (a, b) => fold(a.name).localeCompare(fold(b.name));
  const here = BRANDS.filter((b) => b[country]).sort(name);
  const elsewhere = BRANDS.filter((b) => !b[country]).sort(name);
  return { here, elsewhere };
}

/**
 * The stores that match `query`, best first: a name that starts with it, then a word of the name or of another name
 * that starts with it, then one that contains it. Ties go to the store popular in `country`, then by name.
 */
export function search(query, country) {
  const q = fold(query);
  if (!q) return popular(country);
  const compact = q.replace(/ /g, "");
  const scored = [];
  for (const b of BRANDS) {
    let best = 0;
    for (const [i, name] of [b.name, ...b.aliases].entries()) {
      const f = fold(name);
      const flat = f.replace(/ /g, "");
      let score = 0;
      if (flat === compact) score = 100;
      else if (flat.startsWith(compact)) score = 80;
      else if (f.split(" ").some((w) => w.startsWith(q))) score = 60;
      else if (flat.includes(compact)) score = 30;
      if (score && i > 0) score -= 5;
      best = Math.max(best, score);
    }
    if (best) scored.push([best + (b[country] ? 10 : 0), b]);
  }
  return scored
    .sort(
      (x, y) => y[0] - x[0] || (x[1][country] || 999) - (y[1][country] || 999) || x[1].name.localeCompare(y[1].name),
    )
    .map(([, b]) => b);
}

/** The colours of a store's tile: its tone and the ink of its name. */
export function brandColours(brand) {
  const tone = TONES[brand.tone] || TONES.slate;
  return { bg: tone.bg, fg: brand.ink ? INKS[brand.ink] : tone.fg };
}
