// Made-up notes for the browser preview and the library's screenshots, in English and Slovak. Nobody in them is
// real, and the books and films are invented.

import { isoLocal, repeatRule } from "./model.mjs";

const NOTES = {
  en: [
    {
      key: "groceries",
      title: "Groceries",
      kind: "list",
      body: "- [ ] Oat milk\n- [ ] Sourdough bread\n- [ ] Tomatoes\n- [ ] Basil\n- [ ] Greek yogurt\n- [x] Coffee beans\n- [x] Lemons",
      color: "yellow",
      pinned: true,
      labels: "Home",
      hours: 2,
    },
    {
      key: "pancakes",
      title: "Pancakes for six",
      body: "250 g flour\n3 eggs\n500 ml milk\nA pinch of salt\n\nWhisk the eggs and milk, add the flour slowly and let it rest for 20 minutes. Thin layer, medium heat, flip once.",
      color: "orange",
      pinned: true,
      labels: "Recipes",
      hours: 30,
    },
    {
      key: "mountains",
      title: "Weekend in the mountains",
      kind: "list",
      body: "- [ ] Hiking boots\n- [ ] Map of the trails\n- [ ] Snacks for the hut\n- [ ] Sun cream\n- [x] Rain jacket\n- [x] Power bank",
      color: "blue",
      labels: "Travel",
      hours: 5,
      remind: { days: 3, hour: 8 },
    },
    {
      key: "vet",
      title: "Call the vet",
      body: "Booster shot for Pepper. Ask about the new food.",
      hours: 9,
      remind: { days: 1, hour: 9 },
    },
    {
      key: "garden",
      title: "Garden ideas",
      body: "Raised bed by the fence for herbs.\nTry climbing beans on the old ladder.\nAsk Mira about her tomato seeds.",
      color: "green",
      labels: "Home, Ideas",
      hours: 50,
    },
    {
      key: "bookclub",
      title: "Book club – November",
      body: "The Quiet Lighthouse, chapters 1–9.\n\nQuestions: why does the keeper stay? What changes after the storm?",
      color: "purple",
      labels: "Books",
      hours: 74,
    },
    {
      key: "meeting",
      title: "Team meeting",
      body: "Launch moves to week 48.\nDesign review on Thursday.\nSend the draft to Theo by Wednesday.",
      labels: "Work",
      hours: 26,
    },
    {
      key: "gifts",
      title: "Gift ideas",
      kind: "list",
      body: "- [ ] Pottery class for two\n- [ ] Star map print\n- [x] Board game evening",
      color: "pink",
      labels: "Ideas",
      hours: 120,
    },
    {
      key: "water",
      title: "",
      body: "Water the plants every Sunday evening.",
      color: "teal",
      hours: 140,
      remind: { days: 0, hour: 19, repeat: "weekly", weekday: 0 },
    },
    {
      key: "films",
      title: "Films to watch",
      kind: "list",
      body: "- [ ] The Night Garden\n- [ ] Paper Boats\n- [x] Winter Line",
      color: "brown",
      labels: "Ideas",
      hours: 200,
    },
    {
      key: "words",
      title: "Words to keep",
      body: "“Small steps, every day.”\n“Write it down, then let it go.”",
      color: "grey",
      hours: 300,
    },
    {
      key: "bike",
      title: "Bike service",
      body: "Chain, brakes and the back tyre. The shop closes at 18:00 on Saturdays.",
      color: "teal",
      archived: true,
      hours: 400,
    },
    {
      key: "parking",
      title: "Old parking spot",
      body: "Level 2, row C.",
      trashedDays: 5,
      hours: 500,
    },
  ],
  sk: [
    {
      key: "groceries",
      title: "Nákup",
      kind: "list",
      body: "- [ ] Ovsené mlieko\n- [ ] Kváskový chlieb\n- [ ] Paradajky\n- [ ] Bazalka\n- [ ] Grécky jogurt\n- [x] Kávové zrná\n- [x] Citróny",
      color: "yellow",
      pinned: true,
      labels: "Domácnosť",
      hours: 2,
    },
    {
      key: "pancakes",
      title: "Palacinky pre šiestich",
      body: "250 g hladkej múky\n3 vajcia\n500 ml mlieka\nŠtipka soli\n\nVajcia rozšľahajte s mliekom, postupne primiešajte múku a cesto nechajte 20 minút odpočívať. Tenká vrstva, stredný oheň, otočiť raz.",
      color: "orange",
      pinned: true,
      labels: "Recepty",
      hours: 30,
    },
    {
      key: "mountains",
      title: "Víkend na horách",
      kind: "list",
      body: "- [ ] Turistické topánky\n- [ ] Mapa chodníkov\n- [ ] Niečo na zjedenie na chatu\n- [ ] Opaľovací krém\n- [x] Nepremokavá bunda\n- [x] Powerbanka",
      color: "blue",
      labels: "Cestovanie",
      hours: 5,
      remind: { days: 3, hour: 8 },
    },
    {
      key: "vet",
      title: "Zavolať veterinárovi",
      body: "Preočkovanie pre Korenka. Spýtať sa na nové krmivo.",
      hours: 9,
      remind: { days: 1, hour: 9 },
    },
    {
      key: "garden",
      title: "Nápady do záhrady",
      body: "Vyvýšený záhon pri plote na bylinky.\nSkúsiť popínavú fazuľu na starom rebríku.\nOpýtať sa Miry na semienka paradajok.",
      color: "green",
      labels: "Domácnosť, Nápady",
      hours: 50,
    },
    {
      key: "bookclub",
      title: "Knižný klub – november",
      body: "Tichý maják, kapitoly 1 – 9.\n\nOtázky: Prečo strážca zostáva? Čo sa zmení po búrke?",
      color: "purple",
      labels: "Knihy",
      hours: 74,
    },
    {
      key: "meeting",
      title: "Porada tímu",
      body: "Spustenie sa presúva na 48. týždeň.\nRevízia dizajnu vo štvrtok.\nPoslať návrh Teovi do stredy.",
      labels: "Práca",
      hours: 26,
    },
    {
      key: "gifts",
      title: "Tipy na darčeky",
      kind: "list",
      body: "- [ ] Kurz keramiky pre dvoch\n- [ ] Obraz hviezdnej oblohy\n- [x] Večer spoločenských hier",
      color: "pink",
      labels: "Nápady",
      hours: 120,
    },
    {
      key: "water",
      title: "",
      body: "Každú nedeľu večer poliať kvety.",
      color: "teal",
      hours: 140,
      remind: { days: 0, hour: 19, repeat: "weekly", weekday: 0 },
    },
    {
      key: "films",
      title: "Filmy na pozretie",
      kind: "list",
      body: "- [ ] Nočná záhrada\n- [ ] Papierové lode\n- [x] Zimná línia",
      color: "brown",
      labels: "Nápady",
      hours: 200,
    },
    {
      key: "words",
      title: "Slová, ktoré si chcem zapamätať",
      body: "„Malé kroky, každý deň.“\n„Zapíš si to a pusti to z hlavy.“",
      color: "grey",
      hours: 300,
    },
    {
      key: "bike",
      title: "Servis bicykla",
      body: "Reťaz, brzdy a zadná pneumatika. V sobotu zatvárajú o 18:00.",
      color: "teal",
      archived: true,
      hours: 400,
    },
    {
      key: "parking",
      title: "Staré parkovacie miesto",
      body: "Poschodie 2, rad C.",
      trashedDays: 5,
      hours: 500,
    },
  ],
};

/** The next day at `hour` that is `weekday` (0 = Sunday), or `days` from today at `hour`. */
function reminderDate(now, remind) {
  if (remind.weekday !== undefined) {
    const ahead = (remind.weekday - now.getDay() + 7) % 7;
    let at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, remind.hour, 0, 0);
    if (at <= now) at = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 7, remind.hour, 0, 0);
    return at;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + remind.days, remind.hour, 0, 0);
}

/** The made-up notes and labels as the store keeps them, with times counted back from `now`. */
export function sampleData(now, lang = "en") {
  const set = NOTES[lang === "sk" ? "sk" : "en"];
  const labelNames = new Set();
  const note = set.map((n, i) => {
    const edited = new Date(now.getTime() - n.hours * 3600000);
    const record = {
      id: "sample-" + n.key,
      title: n.title,
      body: n.body,
      kind: n.kind || "text",
      color: n.color || "none",
      pinned: Boolean(n.pinned),
      archived: Boolean(n.archived),
      created: isoLocal(new Date(edited.getTime() - (i + 1) * 86400000)),
      edited: isoLocal(edited),
    };
    if (n.labels) {
      record.labels = n.labels;
      n.labels.split(",").forEach((l) => labelNames.add(l.trim()));
    }
    if (n.remind) {
      const at = reminderDate(now, n.remind);
      record.remindAt = isoLocal(at);
      if (n.remind.repeat) record.repeat = repeatRule(n.remind.repeat, at);
    }
    if (n.trashedDays) record.trashedAt = isoLocal(new Date(now.getTime() - n.trashedDays * 86400000));
    record.createdAt = record.created;
    record.updatedAt = record.edited;
    return record;
  });
  const label = [...labelNames].map((name, i) => ({ id: "label-" + i, name }));
  return { note, label, prefs: [], kv: {}, ui: {} };
}
