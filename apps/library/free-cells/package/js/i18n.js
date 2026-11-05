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
    // The guide's short start.
    tldrTitle: "In 15 seconds",
    goalLabel: "Goal:",
    tipLabel: "Tip:",
    moreRules: "More about the rules",
    tldrTip2: "Turn your phone *sideways* for bigger cards.",
    turnTip: "Turn your phone sideways for bigger cards",
    sidewaysNote: "For the biggest cards, turn your phone sideways.",
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
    tldrTitle: "Za 15 sekúnd",
    goalLabel: "Cieľ:",
    tipLabel: "Tip:",
    moreRules: "Viac o pravidlách",
    tldrTip2: "Otočte telefón *na šírku* a karty budú väčšie.",
    turnTip: "Otočte telefón na šírku a karty budú väčšie",
    sidewaysNote: "Najväčšie karty budú, keď telefón otočíte na šírku.",
  },
};

// The game's own words.
const GAME = {
  en: {
    foundLabel: (a) => `Foundation, ${a.suit} up to the ${a.rank}`,
    placeFound: "a foundation",
    wentUp: (a) => `${a.Cards} went up.`,
    appName: "Free Cells",
    tldrGoal: "Bring all cards to the *four foundations*, one suit each, from the ace up to the king.",
    tldr1: "Build the columns *down in alternating colours*: a red 7 on a black 8.",
    tldr2: "A *free cell* holds any one card.",
    tldr3: "An *empty column* takes any card.",
    tldrTip: "Keep the *free cells empty* as long as you can.",
    firstHelp: "New to Free Cells? How to play in 15 seconds",
    dealLabel: "Deal",
    dealButton: (a) => `Deal ${a.n}. Choose a deal number`,
    dealTitle: "Deal number",
    dealIntro:
      "Every number from 1 to 1,000,000 is a deal of its own, numbered the classic way, so a number gives the same deal every time.",
    dealField: "Deal number",
    dealRange: "Type a whole number from 1 to 1,000,000.",
    playDeal: "Play this deal",
    randomDeal: "Random deal",
    dealCannot: "Only a few deals of the million cannot be won. This is one of them.",
    dealN: (a) => `Deal ${a.n}`,
    fourSub: "Clubs green and diamonds blue. The rule stays: red cards on black ones, and back.",
    autoPlay: "Move safe cards up by themselves",
    autoPlaySub: "Aces, twos and cards nothing else can use go to the foundations.",
    hintsOptSub: "The Hint button shows a move from a real way to win.",
    autoFinishSub: "When every column is in order, the rest plays out.",
    lightOptSub: "A calm light next to the moves turns amber, and Undo takes you straight back.",
    cellsRight: "Free cells on the right",
    cellsRightSub: "The foundations move to the left.",
    dailyIntro:
      "A new deal every day, the same deal on every phone, and one that can be won. Days you missed this month and last month can still be played.",
    resetAsk: "Clear all statistics? This cannot be undone.",
    helpGoal:
      "Build four foundations, one for each suit, from the ace up to the king. You win when all 52 cards are on the foundations. Every card is face up from the start, so you can plan ahead.",
    helpColumns: "The eight columns",
    helpColumns1: "Build down in alternating colours: a red 6 on a black 7, a black 9 on a red 10.",
    helpColumns2: "Any card can go into an empty column.",
    helpCells: "The free cells",
    helpCells1: "Each of the four free cells holds one card while you need it out of the way.",
    helpCells2:
      "Several cards in order move together when there is room to move them one by one: one card, plus one for every empty free cell, doubled for every empty column.",
    helpMoving1:
      "Tap a card to pick it up (with the cards on it), then tap the column, free cell or foundation where it should go. Tap the picked-up card again to put it back.",
    helpMoving2: "Undo takes back as many moves as you like. Hint shows a move from a real way to win.",
    helpMoving3:
      "With the light on, it turns amber when the game can no longer be won. Its button takes you back to the last position that can still be won.",
    helpMoving4: "Cards on a foundation stay there. Once the columns are in order, Finish plays the rest.",
    helpKeys1:
      "[Tab] to a card, then [Enter] to pick it up or move it, [1]–[8] to send it to a column, [C] to a free cell or [F] to a foundation. [Esc] puts it back.",
    helpKeys2: "[U] undoes, [H] shows a hint and [N] starts a new game.",
    cellLabel: (a) => `Free cell ${a.i}: ${a.card}`,
    cellEmptyLabel: (a) => `Free cell ${a.i}: empty`,
    foundEmptyLabel: (a) => `Foundation for ${a.suit}, empty`,
    columnLabel: (a) => `Column ${a.i}: ${a.cards}`,
    placeCell: "a free cell",
    notRun: "Only cards in order, in alternating colours, move together.",
    tooMany: (a) =>
      `${a.n} at once is too many right now. ${a.cap} can move together: one, plus one for every empty free cell, doubled for every empty column.`,
    newGameSr: (a) => `New game, deal ${a.n}.`,
    hintNone: "No winning move found in time. The game may still be winnable.",
    lostAtStart: "This deal cannot be won, whatever you do.",
  },
  sk: {
    foundLabel: (a) => `Základňa: ${a.suit}, navrchu ${a.card}`,
    placeFound: "základňu",
    wentUp: (a) => `Na základne išli: ${a.cards}.`,
    appName: "Free Cells",
    tldrGoal: "Dajte všetky karty na *štyri základne*, každú farbu zvlášť, od esa po kráľa.",
    tldr1: "V stĺpcoch kladte karty *zostupne a striedajte farby*: červenú sedmičku na čiernu osmičku.",
    tldr2: "Na *voľné políčko* sa zmestí jedna ľubovoľná karta.",
    tldr3: "Do *prázdneho stĺpca* môže ísť akákoľvek karta.",
    tldrTip: "Nechajte *voľné políčka prázdne*, kým sa dá.",
    firstHelp: "Free Cells hráte prvýkrát? Ako hrať za 15 sekúnd",
    dealLabel: "Rozdanie",
    dealButton: (a) => `Rozdanie ${a.n}. Vybrať číslo rozdania`,
    dealTitle: "Číslo rozdania",
    dealIntro:
      "Každé číslo od 1 do 1 000 000 je samostatné rozdanie, očíslované klasickým spôsobom, takže rovnaké číslo dá vždy rovnaké rozdanie.",
    dealField: "Číslo rozdania",
    dealRange: "Zadajte celé číslo od 1 do 1 000 000.",
    playDeal: "Hrať toto rozdanie",
    randomDeal: "Náhodné rozdanie",
    dealCannot: "Z milióna rozdaní sa nedá vyhrať len niekoľko. Toto je jedno z nich.",
    dealN: (a) => `Rozdanie ${a.n}`,
    fourSub: "Kríže zelené a kára modré. Pravidlo ostáva: červené karty na čierne a naopak.",
    autoPlay: "Bezpečné karty presúvať na základne automaticky",
    autoPlaySub: "Esá, dvojky a karty, na ktoré už nemožno nič priložiť, idú na základne.",
    hintsOptSub: "Tlačidlo Nápoveda ukáže ťah zo skutočnej cesty k výhre.",
    autoFinishSub: "Keď sú všetky stĺpce zoradené, zvyšok sa dohrá sám.",
    lightOptSub:
      "Pokojné svetielko vedľa ťahov sa rozsvieti na oranžovo a Späť vás vráti rovno tam, kde sa dalo vyhrať.",
    cellsRight: "Voľné políčka vpravo",
    cellsRightSub: "Základne sa presunú doľava.",
    dailyIntro:
      "Každý deň nové rozdanie, ktoré sa dá vyhrať, na každom telefóne rovnaké. Vynechané dni z tohto a minulého mesiaca si môžete zahrať aj neskôr.",
    resetAsk: "Vymazať všetky štatistiky? Nedá sa to vrátiť.",
    helpGoal:
      "Poskladajte štyri základne, pre každú farbu jednu, od esa po kráľa. Vyhráte, keď bude všetkých 52 kariet na základniach. Všetky karty sú od začiatku otočené lícom nahor, takže môžete plánovať dopredu.",
    helpColumns: "Osem stĺpcov",
    helpColumns1:
      "Karty kladte zostupne a striedajte červenú s čiernou: červenú šestku na čiernu sedmičku, čiernu deviatku na červenú desiatku.",
    helpColumns2: "Do prázdneho stĺpca môžete dať akúkoľvek kartu.",
    helpCells: "Voľné políčka",
    helpCells1: "Na každé zo štyroch voľných políčok si odložíte jednu kartu, kým vám zavadzia.",
    helpCells2:
      "Viac zoradených kariet sa presunie naraz, ak je miesto presúvať ich po jednej: jedna karta, k tomu jedna za každé voľné políčko, a to celé dvakrát za každý prázdny stĺpec.",
    helpMoving1:
      "Klepnutím kartu zdvihnete (aj s kartami na nej), potom klepnite na stĺpec, voľné políčko alebo základňu, kam patrí. Keď na zdvihnutú kartu klepnete znova, vrátite ju späť.",
    helpMoving2: "Späť vráti ľubovoľný počet ťahov. Nápoveda ukáže ťah zo skutočnej cesty k výhre.",
    helpMoving3:
      "Keď je svetielko zapnuté, rozsvieti sa na oranžovo, ak sa hra už nedá vyhrať. Jeho tlačidlo vás vráti na posledné miesto, odkiaľ sa ešte dá vyhrať.",
    helpMoving4: "Karty zo základní sa už nevracajú. Keď sú stĺpce zoradené, Dokončiť dohrá zvyšok.",
    helpKeys1:
      "Klávesom [Tab] prejdite na kartu; [Enter] ju zdvihne alebo presunie, [1] – [8] ju pošle do stĺpca, [C] na voľné políčko a [F] na základňu. [Esc] ju položí späť.",
    helpKeys2: "[U] vráti ťah, [H] ukáže nápovedu a [N] začne novú hru.",
    cellLabel: (a) => `Voľné políčko ${a.i}: ${a.card}`,
    cellEmptyLabel: (a) => `Voľné políčko ${a.i}: prázdne`,
    foundEmptyLabel: (a) => `Základňa pre ${a.suit}: prázdna`,
    columnLabel: (a) => `Stĺpec ${a.i}: ${a.cards}`,
    placeCell: "voľné políčko",
    notRun: "Naraz sa presúvajú len zoradené karty so striedajúcimi sa farbami.",
    tooMany: (a) =>
      `${a.n} naraz je teraz priveľa. Spolu sa dá presunúť ${a.cap}: jedna, k tomu jedna za každé voľné políčko, a to celé dvakrát za každý prázdny stĺpec.`,
    newGameSr: (a) => `Nová hra, rozdanie ${a.n}.`,
    hintNone: "Ťah k výhre sa nepodarilo nájsť včas. Hra sa možno ešte dá vyhrať.",
    lostAtStart: "Toto rozdanie sa nedá vyhrať, nech hráte akokoľvek.",
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
  // Lines with key words: "a *free cell* holds" becomes a <b>free cell</b> holds.
  document.querySelectorAll("[data-t-rich]").forEach((el) => {
    el.textContent = "";
    t(el.dataset.tRich)
      .split(/(\*[^*]+\*)/)
      .forEach((part) => {
        if (/^\*.+\*$/.test(part)) {
          const b = document.createElement("b");
          b.textContent = part.slice(1, -1);
          el.appendChild(b);
        } else if (part) el.appendChild(document.createTextNode(part));
      });
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
