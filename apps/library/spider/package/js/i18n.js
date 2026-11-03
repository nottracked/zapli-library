// Every text the game shows or speaks, by language, and the helpers that pick the language and fill the page.
// Counts use plural forms ({one, few, other}: Slovak has "few" for 2-4).

const COMMON = {
  en: {
    moves: "Moves",
    time: "Time",
    statistics: "Statistics",
    howToPlay: "How to play",
    settings: "Settings",
    cardTable: "Card table",
    gameBar: "Game",
    newGame: "New game",
    undo: "Undo",
    hint: "Hint",
    finish: "Finish",
    newTitle: "New game?",
    newBody: "This game is not finished yet. If you leave it now, it counts as a loss in your statistics.",
    keepPlaying: "Keep playing",
    replayDeal: "Replay this deal",
    newDeal: "New deal",
    done: "Done",
    close: "Close",
    tabLook: "Look",
    tabGame: "Game",
    cardSize: "Card size",
    sizeNormal: "Normal",
    sizeLarge: "Large",
    sizeLargest: "Largest",
    sizeAuto: "Picked to match your phone's text size. Choose one to keep it.",
    sizeKept: "Your choice stays, whatever the phone's text size.",
    colours: "Colours",
    four: "Four suit colours",
    contrast: "High contrast",
    contrastSub: "Pure white cards, thicker outlines and darker colours.",
    theme: "Light or dark",
    themeDevice: "Like the phone",
    themeLight: "Light",
    themeDark: "Dark",
    helpers: "Helpers",
    gamesPlayed: "Games played",
    gamesWon: "Games won",
    winRate: "Win rate",
    bestTime: "Best time",
    fewestMoves: "Fewest moves",
    winStreak: "Winning streak",
    longestStreak: "Longest streak",
    statsNote: "A game counts once you make your first move. Statistics stay on this device.",
    resetYes: "Clear statistics",
    resetNo: "Keep them",
    reset: "Reset…",
    statsCleared: "Statistics cleared.",
    helpMoving: "Moving cards",
    helpKeys: "Keyboard",
    helpStorage: "Your game in progress, your settings and your statistics are saved on this device only.",
    solved: "Solved",
    newBestTime: "New best time",
    fewestYet: "Fewest moves yet",
    suits: ["spades", "hearts", "clubs", "diamonds"],
    ranks: ["", "ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"],
    card: (a) => `${a.rank} of ${a.suit}`,
    nCards: { one: "# card", other: "# cards" },
    nMoves: { one: "# move", other: "# moves" },
    nWins: { one: "# win", other: "# wins" },
    nGames: { one: "# game", other: "# games" },
    nGamesOf: { one: "# game", other: "# games" },
    columnEmptyLabel: (a) => `Column ${a.i}: empty`,
    placeColumn: (a) => `column ${a.i}`,
    moved: (a) => `${a.card}${a.more ? ` and ${a.more}` : ""} to ${a.place}.`,
    undone: "Took back the last move.",
    noMove: (a) => `No move for the ${a.card}.`,
    noFit: (a) => `The ${a.card} does not fit on ${a.place}.`,
    hintMove: (a) => `Try the ${a.card} on ${a.place}.`,
    solvedSr: (a) => `Solved in ${a.time} with ${a.moves}.`,
    winRecord: (a) => `${a.mode}${a.wins} in ${a.gamesOf}, winning streak ${a.streak}.`,
    picked: (a) => `${a.card} picked up. Tap where it should go.`,
    pickedRun: (a) => `${a.card} and ${a.more} picked up. Tap where they should go.`,
    putBack: "Put back.",
    cardShape: "Card shape",
    cardBack: "Card back",
    tableLabel: "Table",
    language: "Language",
    langAuto: "Automatic",
    tapMode: "Tapping a card",
    tapSelect: "Picks it up",
    tapSend: "Sends it to the best place",
    tapNote: "A picked-up card goes where you tap next. Tapping it again sends it to the best place.",
    shape_rect: "Rectangle",
    shape_heart: "Heart",
    shape_lace: "Lace",
    shape_ticket: "Ticket",
    shape_pebble: "Pebble",
    shape_flower: "Flower",
    shapeSmaller: (a) => `${a.names}: at this card size the ranks are a little smaller, so they stay inside the card.`,
    shapeNone: (a) => `${a.names}: not at this card size.`,
    back_stripes: "Stripes",
    back_hearts: "Hearts",
    back_flowers: "Flowers",
    back_stars: "Stars",
    back_checks: "Checks",
    back_waves: "Waves",
    back_zigzag: "Zigzag",
    back_contrast: "High contrast",
    table_felt: "Green felt",
    table_seed: "App colour",
    table_blue: "Blue",
    table_wine: "Burgundy",
    table_grey: "Light grey",
    table_black: "Calm high contrast",
    daily: "Daily deal",
    playToday: "Play today's deal",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    nDaysSolved: { one: "# day solved this month.", other: "# days solved this month." },
    dayLabel: (a) => `${a.date}${a.won ? ", solved" : ""}${a.today ? ", today" : ""}`,
    dailyOf: (a) => `Daily deal of ${a.date}`,
    dailyWon: (a) => `The daily deal of ${a.date} is solved.`,
    hintsOpt: "Hints",
    autoFinish: "Finish by itself",
    showTargets: "Show where a card can go",
    showTargetsSub: "The places that fit light up while you hold a card, and a second tap sends it there.",
    clock: "Show the clock",
    clockSub: "The time counts for your best times either way.",
    undoNote: "Undo is always unlimited.",
    deckStyle: "Card style",
    deck_bold: "Bold",
    deck_crisp: "Crisp",
    // The light that says whether the game can still be won.
    lightOpt: "Tell me when the game can no longer be won",
    lightWin: "Can still be won",
    lightLost: "Can no longer be won",
    lightUnsure: "Not sure whether it can still be won",
    lightChecking: "Checking whether it can still be won",
    lightOff: "Winnable check is off",
    lostNotice: "This game can no longer be won from here.",
    backWinnable: (a) => `Back ${a.moves} to where it could be won`,
    backDone: "Back where the game can still be won.",
    hintThinking: "Looking for a winning move…",
    hintLost: "No move wins from here any more.",
    keepLooking: "Keep looking",
    noMovesLeft: "No moves are left. Undo a few moves, or start a new game.",
  },
  sk: {
    moves: "Ťahy",
    time: "Čas",
    statistics: "Štatistiky",
    howToPlay: "Ako hrať",
    settings: "Nastavenia",
    cardTable: "Herný stôl",
    gameBar: "Hra",
    newGame: "Nová hra",
    undo: "Späť",
    hint: "Nápoveda",
    finish: "Dokončiť",
    newTitle: "Nová hra?",
    newBody: "Táto hra ešte nie je dohraná. Ak ju teraz opustíte, v štatistikách sa započíta ako prehra.",
    keepPlaying: "Hrať ďalej",
    replayDeal: "Hrať toto rozdanie znova",
    newDeal: "Nové rozdanie",
    done: "Hotovo",
    close: "Zavrieť",
    tabLook: "Vzhľad",
    tabGame: "Hra",
    cardSize: "Veľkosť kariet",
    sizeNormal: "Normálne",
    sizeLarge: "Veľké",
    sizeLargest: "Najväčšie",
    sizeAuto: "Vybrané podľa veľkosti písma v telefóne. Keď si vyberiete, voľba zostane.",
    sizeKept: "Vaša voľba zostane, nech je písmo v telefóne akékoľvek.",
    colours: "Farby",
    four: "Štyri farby",
    contrast: "Vysoký kontrast",
    contrastSub: "Čisto biele karty, hrubšie okraje a tmavšie farby.",
    theme: "Svetlý alebo tmavý",
    themeDevice: "Ako telefón",
    themeLight: "Svetlý",
    themeDark: "Tmavý",
    helpers: "Pomôcky",
    gamesPlayed: "Odohrané hry",
    gamesWon: "Vyhrané hry",
    winRate: "Úspešnosť",
    bestTime: "Najlepší čas",
    fewestMoves: "Najmenej ťahov",
    winStreak: "Séria výhier",
    longestStreak: "Najdlhšia séria",
    statsNote: "Hra sa započíta po prvom ťahu. Štatistiky zostávajú len v tomto zariadení.",
    resetYes: "Vymazať štatistiky",
    resetNo: "Ponechať",
    reset: "Vynulovať…",
    statsCleared: "Štatistiky sú vymazané.",
    helpMoving: "Presúvanie kariet",
    helpKeys: "Klávesnica",
    helpStorage: "Rozohraná hra, nastavenia a štatistiky sa ukladajú len v tomto zariadení.",
    solved: "Vyhrali ste!",
    newBestTime: "Nový najlepší čas",
    fewestYet: "Zatiaľ najmenej ťahov",
    suits: ["piky", "srdcia", "kríže", "kára"],
    ranks: [
      "",
      "eso",
      "dvojka",
      "trojka",
      "štvorka",
      "päťka",
      "šestka",
      "sedmička",
      "osmička",
      "deviatka",
      "desiatka",
      "dolník",
      "dáma",
      "kráľ",
    ],
    // The suit's adjective agrees with the rank's noun: neuter (eso), masculine (dolník, kráľ), feminine (the
    // numbers and dáma).
    card: (a) => {
      const forms = [
        ["pikové", "pikový", "piková"],
        ["srdcové", "srdcový", "srdcová"],
        ["krížové", "krížový", "krížová"],
        ["kárové", "kárový", "kárová"],
      ][a.s];
      return `${forms[a.r === 1 ? 0 : a.r === 11 || a.r === 13 ? 1 : 2]} ${a.rank}`;
    },
    nCards: { one: "# karta", few: "# karty", other: "# kariet" },
    nMoves: { one: "# ťah", few: "# ťahy", other: "# ťahov" },
    nWins: { one: "# výhra", few: "# výhry", other: "# výhier" },
    nGames: { one: "# hra", few: "# hry", other: "# hier" },
    nGamesOf: { one: "# hry", few: "# hier", other: "# hier" },
    columnEmptyLabel: (a) => `Stĺpec ${a.i}: prázdny`,
    placeColumn: (a) => `stĺpec ${a.i}`,
    moved: (a) => `${a.card}${a.more ? ` a ${a.more}` : ""} na ${a.place}.`,
    undone: "Posledný ťah je vrátený.",
    noMove: (a) => `${a.Card}: žiadny ťah.`,
    noFit: (a) => `${a.Card} sa nehodí na ${a.place}.`,
    hintMove: (a) => `Skúste: ${a.card} na ${a.place}.`,
    solvedSr: (a) => `Vyhrali ste za ${a.time}, ťahov: ${a.n}.`,
    winRecord: (a) => `${a.mode}${a.wins} z ${a.gamesOf}, séria výhier ${a.streak}.`,
    picked: (a) => `Zdvihnutá karta: ${a.card}. Klepnite, kam patrí.`,
    pickedRun: (a) => `Zdvihnutá karta: ${a.card} a ${a.more}. Klepnite, kam patria.`,
    putBack: "Karta je položená späť.",
    cardShape: "Tvar kariet",
    cardBack: "Rub kariet",
    tableLabel: "Stôl",
    language: "Jazyk",
    langAuto: "Automaticky",
    tapMode: "Klepnutie na kartu",
    tapSelect: "Kartu zdvihne",
    tapSend: "Pošle ju na najlepšie miesto",
    tapNote: "Zdvihnutá karta ide tam, kam klepnete. Keď na ňu klepnete znova, presunie sa na najlepšie miesto.",
    shape_rect: "Obdĺžnik",
    shape_heart: "Srdce",
    shape_lace: "Čipka",
    shape_ticket: "Lístok",
    shape_pebble: "Kamienok",
    shape_flower: "Kvet",
    shapeSmaller: (a) => `${a.names}: pri tejto veľkosti sú čísla trochu menšie, aby zostali vnútri karty.`,
    shapeNone: (a) => `${a.names}: pri tejto veľkosti kariet sa nedá použiť.`,
    back_stripes: "Pruhy",
    back_hearts: "Srdiečka",
    back_flowers: "Kvety",
    back_stars: "Hviezdy",
    back_checks: "Kocky",
    back_waves: "Vlny",
    back_zigzag: "Cikcak",
    back_contrast: "Vysoký kontrast",
    table_felt: "Zelené súkno",
    table_seed: "Farba aplikácie",
    table_blue: "Modrý",
    table_wine: "Bordový",
    table_grey: "Svetlosivý",
    table_black: "Pokojný kontrastný",
    daily: "Denná hra",
    playToday: "Hrať dnešnú hru",
    prevMonth: "Predchádzajúci mesiac",
    nextMonth: "Nasledujúci mesiac",
    nDaysSolved: {
      one: "Tento mesiac je vyriešený # deň.",
      few: "Tento mesiac sú vyriešené # dni.",
      other: "Tento mesiac je vyriešených # dní.",
    },
    dayLabel: (a) => `${a.date}${a.won ? ", vyriešené" : ""}${a.today ? ", dnes" : ""}`,
    dailyOf: (a) => `Denná hra ${a.date}`,
    dailyWon: (a) => `Denná hra ${a.date} je vyriešená.`,
    hintsOpt: "Nápoveda",
    autoFinish: "Dohrať automaticky",
    showTargets: "Ukázať, kam karta patrí",
    showTargetsSub: "Miesta, kam sa karta hodí, sa rozsvietia, kým ju držíte, a druhé klepnutie ju tam presunie.",
    clock: "Zobrazovať čas",
    clockSub: "Čas sa počíta tak či tak, pre vaše najlepšie časy.",
    undoNote: "Späť sa dá vždy, bez obmedzenia.",
    deckStyle: "Štýl kariet",
    deck_bold: "Výrazný",
    deck_crisp: "Jednoduchý",
    lightOpt: "Upozorniť, keď sa hra už nedá vyhrať",
    lightWin: "Dá sa ešte vyhrať",
    lightLost: "Už sa nedá vyhrať",
    lightUnsure: "Nie je isté, či sa dá ešte vyhrať",
    lightChecking: "Overuje sa, či sa dá ešte vyhrať",
    lightOff: "Overovanie je vypnuté",
    lostNotice: "Odtiaľto sa táto hra už nedá vyhrať.",
    backWinnable: (a) => `O ${a.moves} späť, kde sa dalo vyhrať`,
    backDone: "Ste späť tam, kde sa hra dá ešte vyhrať.",
    hintThinking: "Hľadám ťah, ktorý vedie k výhre…",
    hintLost: "Odtiaľto už k výhre nevedie žiadny ťah.",
    keepLooking: "Hľadať ďalej",
    noMovesLeft: "Už nie sú žiadne ťahy. Vráťte niekoľko ťahov alebo začnite novú hru.",
  },
};

// The game's own words.
const GAME = {
  en: {
    appName: "Spider",
    fourSub: "Clubs green and diamonds blue, so every suit has a colour of its own.",
    suitsLabel: "Suits",
    suits1: "One",
    suits2: "Two",
    suits4: "Four",
    suitsNote: "One suit is the gentlest game, four suits the hardest.",
    suitsMode: { 1: "One suit", 2: "Two suits", 4: "Four suits" },
    dealsLabel: "Deals",
    dealsWinnable: "Winnable",
    dealsAny: "Any deal",
    dealsNote: "A winnable deal is one the solver has won. You may still need Undo.",
    nextGameNote: "Changes to the suits and the deals start with your next game.",
    hintsOptSub: "The Hint button shows a move from a real way to win, when one is found in time.",
    autoFinishSub: "When the stock is empty, every card is face up and a way to win is known, the rest plays out.",
    lightOptSub:
      "A calm light next to the moves turns amber when the game is lost for sure, and Undo takes you straight back. Spider has so many ways to play that sometimes the light only says it is not sure.",
    stockRight: "Stock on the right",
    stockRightSub: "Easier to reach with your right thumb.",
    dailyIntro:
      "A new winnable deal every day, with the suits you play. Days you missed this month and last month can still be played.",
    resetAsk: "Clear all statistics for every number of suits? This cannot be undone.",
    helpGoal:
      "Put away eight runs, each from the king down to the ace in one suit. A finished run goes away by itself. You win when all 104 cards are put away.",
    helpColumns: "The ten columns",
    helpColumns1: "Build down whatever the suit: any 6 on any 7.",
    helpColumns2:
      "Cards of one suit in order move together; mixed suits move one at a time. The card under them turns over.",
    helpColumns3: "Any card, or any run of one suit, can go into an empty column.",
    helpStock: "The stock",
    helpStock1: "Tap the stock to deal one card onto every column. It holds five deals.",
    helpStock2: "You can deal only when no column is empty.",
    helpMoving1:
      "Tap a card to pick it up (with the cards on it), then tap the column where it should go. Tap the picked-up card again to put it back.",
    helpMoving2: "Undo takes back as many moves as you like. Hint shows a move from a real way to win.",
    helpMoving3:
      "With the light on, it turns amber when the game can no longer be won, and its button takes you back. A hollow light means not sure: Spider has too many ways to play to always know.",
    helpKeys1:
      "[Tab] to a card, then [Enter] to pick it up or move it, or [1]–[9] and [0] to send it to a column. [Esc] puts it back.",
    helpKeys2: "[D] deals from the stock, [U] undoes, [H] shows a hint and [N] starts a new game.",
    nFaceDown: { one: "# face-down card", other: "# face-down cards" },
    nDeals: { one: "# deal", other: "# deals" },
    stockLabel: (a) => `Stock, ${a.deals} left. Deal a row`,
    stockEmptyLabel: "Stock is empty",
    doneLabel: (a) => `Runs put away: ${a.n} of 8`,
    columnLabel: (a) => `Column ${a.i}: ${a.down ? `${a.down}, then ` : ""}${a.cards}`,
    notRun: "Only cards of one suit, in order, move together.",
    dealt: "Dealt a row.",
    turnedUp: (a) => `Turned up the ${a.card}.`,
    putAway: (a) => `A run of ${a.suit} is put away.`,
    noDealEmpty: "Fill every empty column before you deal.",
    stockIsEmpty: "The stock is empty.",
    hintDeal: "Deal a row from the stock.",
    newGameSr: (a) => `New game with ${a.suits}.`,
    suitsSr: { 1: "one suit", 2: "two suits", 4: "four suits" },
    dealEasy: (a) => `Winnable deal, ${a.suits}`,
    dealAny: (a) => `Any deal, ${a.suits}`,
    hintNone: "No sure winning move found in time. The game may still be winnable.",
    lostAtStart: "This game can no longer be won.",
  },
  sk: {
    appName: "Spider",
    four: "Farebné kríže a kára",
    fourSub: "Kríže zelené a kára modré, takže každá farba kariet má vlastnú farbu.",
    suitsLabel: "Farby v hre",
    suits1: "Jedna",
    suits2: "Dve",
    suits4: "Štyri",
    suitsNote: "S jednou farbou je hra najľahšia, so štyrmi najťažšia.",
    suitsMode: { 1: "Jedna farba", 2: "Dve farby", 4: "Štyri farby" },
    dealsLabel: "Rozdania",
    dealsWinnable: "Riešiteľné",
    dealsAny: "Akékoľvek",
    dealsNote: "Riešiteľné rozdanie riešiteľ už raz vyhral. Možno budete potrebovať Späť.",
    nextGameNote: "Zmeny farieb a rozdaní platia od ďalšej hry.",
    hintsOptSub: "Tlačidlo Nápoveda ukáže ťah zo skutočnej cesty k výhre, ak sa ju podarí včas nájsť.",
    autoFinishSub: "Keď je balíček prázdny, všetky karty sú otočené a cesta k výhre je známa, zvyšok sa dohrá sám.",
    lightOptSub:
      "Pokojné svetielko vedľa ťahov sa rozsvieti na oranžovo, keď je hra určite prehratá, a Späť vás vráti rovno tam, kde sa dalo vyhrať. Spider má toľko možností, že niekedy svetielko povie len, že si nie je isté.",
    stockRight: "Balíček vpravo",
    stockRightSub: "Pravým palcom sa k nemu dostanete ľahšie.",
    dailyIntro:
      "Každý deň nové rozdanie, ktoré sa dá vyhrať, s farbami, ktoré hráte. Vynechané dni z tohto a minulého mesiaca si môžete zahrať aj neskôr.",
    resetAsk: "Vymazať štatistiky pre všetky počty farieb? Nedá sa to vrátiť.",
    helpGoal:
      "Odložte osem postupiek, každú od kráľa po eso v jednej farbe. Hotová postupka sa odloží sama. Vyhráte, keď bude odložených všetkých 104 kariet.",
    helpColumns: "Desať stĺpcov",
    helpColumns1: "Karty kladte zostupne bez ohľadu na farbu: akúkoľvek šestku na akúkoľvek sedmičku.",
    helpColumns2:
      "Zoradené karty jednej farby sa presúvajú spolu, karty rôznych farieb po jednej. Karta pod nimi sa otočí.",
    helpColumns3: "Do prázdneho stĺpca môžete dať akúkoľvek kartu alebo postupku jednej farby.",
    helpStock: "Balíček",
    helpStock1: "Klepnutím na balíček rozdáte na každý stĺpec jednu kartu. Balíček vystačí na päť rozdaní.",
    helpStock2: "Rozdávať sa dá, len keď nie je prázdny žiadny stĺpec.",
    helpMoving1:
      "Klepnutím kartu zdvihnete (aj s kartami na nej), potom klepnite na stĺpec, kam patrí. Keď na zdvihnutú kartu klepnete znova, vrátite ju späť.",
    helpMoving2: "Späť vráti ľubovoľný počet ťahov. Nápoveda ukáže ťah zo skutočnej cesty k výhre.",
    helpMoving3:
      "Keď je svetielko zapnuté, rozsvieti sa na oranžovo, ak sa hra už nedá vyhrať, a jeho tlačidlo vás vráti späť. Prázdny krúžok znamená, že to nie je isté: Spider má priveľa možností, aby sa to dalo vždy zistiť.",
    helpKeys1:
      "Klávesom [Tab] prejdite na kartu; [Enter] ju zdvihne alebo presunie, [1] – [9] a [0] ju pošlú do stĺpca. [Esc] ju položí späť.",
    helpKeys2: "[D] rozdá z balíčka, [U] vráti ťah, [H] ukáže nápovedu a [N] začne novú hru.",
    nFaceDown: { one: "# karta lícom nadol", few: "# karty lícom nadol", other: "# kariet lícom nadol" },
    nDeals: { one: "# rozdanie", few: "# rozdania", other: "# rozdaní" },
    stockLabel: (a) => `Balíček, zostáva ${a.deals}. Rozdať`,
    stockEmptyLabel: "Balíček je prázdny",
    doneLabel: (a) => `Odložené postupky: ${a.n} z 8`,
    columnLabel: (a) => `Stĺpec ${a.i}: ${a.down ? `${a.down}, potom ` : ""}${a.cards}`,
    notRun: "Spolu sa presúvajú len zoradené karty jednej farby.",
    dealt: "Rozdané.",
    turnedUp: (a) => `Otočená karta: ${a.card}.`,
    putAway: (a) => `Postupka (${a.suit}) je odložená.`,
    noDealEmpty: "Pred rozdávaním zaplňte všetky prázdne stĺpce.",
    stockIsEmpty: "Balíček je prázdny.",
    hintDeal: "Rozdajte z balíčka.",
    newGameSr: (a) => `Nová hra: ${a.suits}.`,
    suitsSr: { 1: "jedna farba", 2: "dve farby", 4: "štyri farby" },
    dealEasy: (a) => `Riešiteľné rozdanie, ${a.suits}`,
    dealAny: (a) => `Akékoľvek rozdanie, ${a.suits}`,
    hintNone: "Istý ťah k výhre sa nepodarilo nájsť včas. Hra sa možno ešte dá vyhrať.",
    lostAtStart: "Táto hra sa už nedá vyhrať.",
  },
};

export const STRINGS = {
  en: Object.assign({}, COMMON.en, GAME.en),
  sk: Object.assign({}, COMMON.sk, GAME.sk),
};

let current = "en";
let words = STRINGS.en;

export const lang = () => current;

export function t(key, args) {
  const v = key in words ? words[key] : STRINGS.en[key];
  if (typeof v === "function") return v(args || {});
  return v === undefined ? key : v;
}

// A count with its noun: {one: "# card", other: "# cards"} (Slovak adds few and many).
export function tn(key, n) {
  const forms = t(key);
  let cat = "other";
  try {
    cat = new Intl.PluralRules(current).select(n);
  } catch (e) {
    cat = n === 1 ? "one" : "other";
  }
  const form = forms[cat] || forms.other;
  return form.replace("#", String(n));
}

export const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function translatePage() {
  document.documentElement.lang = current;
  document.title = t("appName");
  document.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  document.querySelectorAll("[data-t-label]").forEach((el) => {
    const text = t(el.dataset.tLabel);
    el.setAttribute("aria-label", text);
    if (el.tagName === "BUTTON") el.title = text;
  });
  // Lines with keys: "[Tab] to a card" becomes <kbd>Tab</kbd> to a card.
  document.querySelectorAll("[data-t-keys]").forEach((el) => {
    el.textContent = "";
    t(el.dataset.tKeys)
      .split(/(\[[^\]]+\])/)
      .forEach((part) => {
        if (/^\[.+\]$/.test(part)) {
          const k = document.createElement("kbd");
          k.textContent = part.slice(1, -1);
          el.appendChild(k);
        } else if (part) el.appendChild(document.createTextNode(part));
      });
  });
}

// The language: the player's choice, else the phone's (Zapli tells the page; a browser has its own).
function pickLang(choice) {
  if (choice === "en" || choice === "sk") return choice;
  let loc = "";
  try {
    const app = window.zapli && window.zapli.app;
    if (app && typeof app.locale === "function") loc = String(app.locale() || "");
  } catch (e) {
    loc = "";
  }
  if (!loc) loc = navigator.language || "en";
  return /^sk([-_]|$)/i.test(loc) ? "sk" : "en";
}

export function setLang(choice) {
  current = pickLang(choice);
  words = STRINGS[current];
  translatePage();
}
