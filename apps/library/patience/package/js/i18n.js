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
    appName: "Patience",
    allGames: "All games",
    chooseGame: "Choose a game",
    gameName: { pyramid: "Pyramid", golf: "Golf", peaks: "Peaks" },
    gameTag: {
      pyramid: "Pairs that add up to 13",
      golf: "One up or one down, seven columns",
      peaks: "Three peaks and long runs",
    },
    fresh: "A fresh deal is ready",
    inPlay: (a) => `In play, ${a.moves}`,
    winsLine: (a) => `Won ${a.won} of ${a.played}`,
    dailyChip: "Today's deal",
    dailyChipDone: "Today's deal solved",
    openGame: (a) => `Play ${a.game}`,
    openDaily: (a) => `Today's deal of ${a.game}`,
    firstHelp: (a) => `How to play ${a.game} in 15 seconds`,
    turnTipShort: "Turn sideways for bigger cards",
    lightTap: "Tap for what the light means",
    lightIntro: "The green dot by the moves means this deal can still be won. Tap it any time.",
    lightTipWin:
      "Green: this deal can still be won. If a move makes a win impossible, the dot turns amber and one tap takes you back.",
    lightTipLost: "Amber: this deal can no longer be won from here. “Back” in the bar below returns to where it could.",
    lightTipUnsure: "A hollow ring: the game is still checking, or could not be sure in time.",
    lightTipOff: "The winnable light is off. You can turn it on in Settings, Game.",
    fourSub: "Clubs green and diamonds blue.",
    // The short start of each game's guide.
    pyrGoal: "Clear the *pyramid*: take away all 28 of its cards.",
    pyrRule1: "Take away *two free cards that make 13*: a 6 and a 7, a jack and a 2.",
    pyrRule2: "A *king* is 13 alone: tap it and it goes. A queen is 12, a jack 11.",
    pyrRule3: "A card is *free* when no card lies over it.",
    pyrRule4: "Stuck? *Tap the stock* to turn a card; it can pair too.",
    pyrTip: "Before you pair, look which of the matching cards frees more.",
    golfGoal: "Clear all *seven columns* onto the waste.",
    golfRule1: "Play a column's *uncovered card* if it is *one higher or lower* than the waste: a 6 or an 8 on a 7.",
    golfRule2: {
      none: "Suits do not matter. *Nothing goes on a king.*",
      queen: "Suits do not matter. *Only a queen goes on a king.*",
      wrap: "Suits do not matter. *A king and an ace* follow each other.",
    },
    golfRule3: "Stuck? *Tap the stock* to turn a new card onto the waste.",
    golfTip: "Turn and turn back: 5, 6, 5, 4 keeps a run going longer.",
    peaksGoal: "Clear all *three peaks* onto the waste.",
    peaksRule1: "Play any *face-up card* that is *one higher or lower* than the waste.",
    peaksRule2: {
      wrap: "Suits do not matter, and *a king and an ace* follow each other.",
      nowrap: "Suits do not matter. A king and an ace do *not* follow each other.",
    },
    peaksRule3: "A card *turns over* once no card lies over it.",
    peaksRule4: "Stuck? *Tap the stock*. That ends your *run* of cards.",
    peaksTip: "Play the longest run you can see before you turn the stock.",
    // The details.
    pyrHelpGoal:
      "Take away all 28 cards of the pyramid. A pair must add up to 13: aces count 1, jacks 11, queens 12 and kings 13, so a king goes alone. Cards left in the stock do not count.",
    pyrHelpFree: "A card is free when both cards lying over it are gone. The bottom row is free from the start.",
    pyrHelpWaste:
      "The top card of the waste is free too: pair it with a card of the pyramid, or tap it when it is a king.",
    pyrHelpStock: {
      1: "Tap the stock to turn its next card onto the waste. The stock goes round once.",
      3: "Tap the stock to turn its next card onto the waste. When it is empty, tap it to turn the waste over: you can go through the stock three times.",
      0: "Tap the stock to turn its next card onto the waste. When it is empty, tap it to turn the waste over, as often as you like.",
    },
    pyrHelpMoving:
      "Tap a free card, then a card that makes 13 with it. Tap the picked-up card again to put it back. Dragging one onto the other works too.",
    golfHelpGoal: "Move all 35 cards of the seven columns onto the waste. Cards left in the stock do not count.",
    golfHelpPlay:
      "Only the uncovered card of each column can move. It goes onto the waste when it is one higher or lower than the waste's top card, whatever the suit.",
    golfHelpKings:
      "In classic Golf nothing goes on a king, and an ace takes only a 2. In Settings you can let a queen go on a king, or a queen or an ace (then a king may also go on an ace).",
    golfHelpStock: "Tap the stock to turn its next card onto the waste. It goes round once.",
    peaksHelpGoal: "Move all 28 cards of the three peaks onto the waste. Cards left in the stock do not count.",
    peaksHelpPlay:
      "Any face-up card can go onto the waste when it is one higher or lower than the top card, whatever the suit. A king and an ace follow each other, unless you turn that off in Settings.",
    peaksHelpTurn:
      "A face-down card turns over once both cards lying over it are gone. With every card face up (in Settings), you can plan the whole game.",
    peaksHelpStock: "Tap the stock to turn a new card onto the waste. It goes round once.",
    peaksHelpRun:
      "Your run counts the cards you play from the peaks in a row; a card from the stock starts it again. Statistics keep your longest run.",
    helpRules: "The rules",
    helpHelpers: "Undo, Hint and the light",
    helpTap:
      "Tap a card to play it; in Pyramid, tap two cards that make 13. When a card cannot go, the game says why. Dragging works too.",
    helpUndo: "Undo takes back as many moves as you like. Hint shows the next move of a real way to win.",
    helpLight:
      "The light next to the moves stays green while the deal can still be won. It turns amber when it cannot, and its button takes you back to where it could. The game knows the order of the stock, so the answer is exact; a hollow light means it ran out of time.",
    helpFinish:
      "Once the rest can be cleared without the stock, Finish plays it out (by itself, unless you turn that off).",
    helpKeys1: "[Tab] to a card, then [Enter] to play it or pick it up. [Esc] puts it back.",
    helpKeys2:
      "[D] turns a card from the stock, [U] undoes, [H] shows a hint, [N] deals again and [G] shows all games.",
    // What happens on the table, for the messages and the screen reader.
    toWaste: (a) => `${a.Card} to the waste.`,
    turnedUp: (a) => `Turned up the ${a.card}.`,
    paired: (a) => `${a.Card} and the ${a.other} taken away.`,
    kingAway: (a) => `${a.Card} taken away.`,
    redealt: (a) => `The waste is back in the stock: time ${a.n} of ${a.of}.`,
    redealtFree: (a) => `The waste is back in the stock: time ${a.n}.`,
    notOneApart: (a) => `The ${a.card} does not fit on the ${a.top}: only a card one higher or lower does.`,
    nothingOnKing: "Nothing goes on a king. Turn a card from the stock.",
    onlyQueenOnKing: "Only a queen goes on a king.",
    covered: "That card is still covered.",
    notThirteen: (a) => `The ${a.card} and the ${a.other} make ${a.sum}, not 13.`,
    pickedPair: (a) => `${a.Card} picked up. Tap a card that makes 13 with it.`,
    noPartner: "No free card makes 13 with it now.",
    stockEmpty: "The stock is empty.",
    noMoreRounds: "The stock cannot be turned over again.",
    stockLabel: (a) => `Stock, ${a.cards} left. Turn a card`,
    stockRedealLabel: "Stock is empty. Turn the waste over",
    stockEmptyLabel: "Stock is empty",
    wasteLabel: (a) => `Waste: ${a.card}`,
    wasteEmptyLabel: "Waste is empty",
    outLabel: (a) => `Taken away: ${a.cards}`,
    passesLabel: (a) => `Time ${a.n} of ${a.of} through the stock`,
    passesFreeLabel: (a) => `Time ${a.n} through the stock`,
    columnLabel: (a) => `Column ${a.i}: ${a.cards}`,
    run: "Run",
    runLabel: (a) => `Run of ${a.n}`,
    longestRun: "Longest run",
    winRun: (a) => `Longest run: ${a.n}.`,
    hintPlay: (a) => `Try the ${a.card} on the waste.`,
    hintPair: (a) => `Try the ${a.card} with the ${a.other}.`,
    hintKing: (a) => `Take away the ${a.card}.`,
    hintDraw: "Turn a card from the stock.",
    hintRedeal: "Turn the waste over into the stock.",
    hintNone: "No sure winning move found in time. The deal may still be winnable.",
    lostAtStart: "This deal cannot be won.",
    stuck: "No moves left.",
    restart: "Restart",
    newGameSr: (a) => `New deal of ${a.game}.`,
    // Settings.
    passesOpt: "Times through the stock",
    passes1: "Once",
    passes3: "Three times",
    passes0: "No limit",
    passesNote: "Three times is the usual game; once is the hardest.",
    kingsOpt: "On a king",
    kingsNone: "Nothing",
    kingsQueen: "A queen",
    kingsWrap: "Queen or ace",
    kingsNote: "Classic Golf puts nothing on a king. With “Queen or ace”, a king may also go on an ace.",
    wrapOpt: "A king and an ace follow each other",
    wrapOptSub: "Off: kings and aces end a run.",
    openOpt: "Every card face up",
    openOptSub: "A calmer puzzle: you see the whole deal and can plan every move.",
    dealsLabel: "Deals",
    dealsWinnable: "Winnable",
    dealsAny: "Any deal",
    dealsNote: "A winnable deal is one the solver has won. You may still need Undo.",
    nextGameNote: "Rule changes start with your next game.",
    hintsOptSub: "The Hint button shows the next move of a real way to win.",
    autoFinishSub: "Once the rest can be cleared without the stock, it plays out.",
    showTargetsSub: "Outlines the cards you can play now (in Pyramid, the partners of a picked-up card).",
    lightOptSub:
      "A calm light next to the moves turns amber when this deal can no longer be won, and one tap takes you back to where it could.",
    stockRight: "Stock on the right",
    stockRightSub: "Easier to reach with your right thumb.",
    vibration: "Vibration",
    vibrationSub: "A light tap as cards go, a longer one when you win.",
    // The daily deal, statistics and the win.
    dailyIntro:
      "A new winnable deal every day for each game, with the rules you play. Days you missed this month and last month can still be played.",
    dailyStreak: { one: "Solved # day in a row.", other: "Solved # days in a row." },
    resetAsk: "Clear the statistics of all three games? This cannot be undone.",
    dailySolved: "Daily deals solved",
    dealEasy: "Winnable deal",
    dealAny: "Any deal",
  },
  sk: {
    appName: "Patience",
    allGames: "Všetky hry",
    chooseGame: "Vyberte si hru",
    gameName: { pyramid: "Pyramída", golf: "Golf", peaks: "Vrcholy" },
    gameTag: {
      pyramid: "Dvojice, ktoré dajú spolu 13",
      golf: "O jedno vyššie alebo nižšie, sedem stĺpcov",
      peaks: "Tri vrcholy a dlhé reťaze",
    },
    fresh: "Nové rozdanie je pripravené",
    inPlay: (a) => `Rozohraté, ${a.moves}`,
    winsLine: (a) => `Vyhraté: ${a.won} z ${a.played}`,
    dailyChip: "Dnešná hra",
    dailyChipDone: "Dnešná hra vyriešená",
    openGame: (a) => `Hrať: ${a.game}`,
    openDaily: (a) => `Dnešná hra: ${a.game}`,
    firstHelp: (a) => `${a.game}: ako hrať za 15 sekúnd`,
    turnTipShort: "Na šírku budú karty väčšie",
    lightTap: "Klepnite a uvidíte, čo svetielko znamená",
    lightIntro: "Zelená bodka pri ťahoch znamená, že sa toto rozdanie dá ešte vyhrať. Klepnite na ňu kedykoľvek.",
    lightTipWin:
      "Zelená: toto rozdanie sa dá ešte vyhrať. Keď ťah výhru znemožní, bodka sa zmení na oranžovú a jedným klepnutím sa vrátite.",
    lightTipLost:
      "Oranžová: odtiaľto sa toto rozdanie už nedá vyhrať. „Späť“ v pruhu nižšie vás vráti tam, kde sa ešte dalo.",
    lightTipUnsure: "Prázdny krúžok: hra to ešte overuje alebo to nestihla zistiť.",
    lightTipOff: "Svetielko je vypnuté. Zapnúť ho môžete v nastaveniach, na karte Hra.",
    fourSub: "Kríže zelené a kára modré.",
    pyrGoal: "Vyčistite *pyramídu*: odložte všetkých jej 28 kariet.",
    pyrRule1: "Odložte *dve voľné karty, ktoré dajú 13*: šestku so sedmičkou, dolníka s dvojkou.",
    pyrRule2: "*Kráľ* má 13 sám: klepnite naň a zmizne. Dáma má 12, dolník 11.",
    pyrRule3: "Karta je *voľná*, keď na nej neleží iná karta.",
    pyrRule4: "Neviete ďalej? *Klepnite na balíček* a otočte kartu; aj tá tvorí dvojice.",
    pyrTip: "Skôr než odložíte dvojicu, pozrite sa, ktorá z hodiacich sa kariet uvoľní viac.",
    golfGoal: "Presuňte všetkých *sedem stĺpcov* na kôpku.",
    golfRule1:
      "Zahrajte *odkrytú kartu* stĺpca, ak je *o jedno vyššia alebo nižšia* ako kôpka: šestku či osmičku na sedmičku.",
    golfRule2: {
      none: "Na farbe nezáleží. *Na kráľa nejde nič.*",
      queen: "Na farbe nezáleží. *Na kráľa ide len dáma.*",
      wrap: "Na farbe nezáleží a *kráľ s esom* na seba nadväzujú.",
    },
    golfRule3: "Neviete ďalej? *Klepnite na balíček* a otočte na kôpku novú kartu.",
    golfTip: "Striedajte smer, napríklad 5, 6, 5, 4: reťaz vydrží dlhšie.",
    peaksGoal: "Presuňte všetky *tri vrcholy* na kôpku.",
    peaksRule1: "Zahrajte ktorúkoľvek *odkrytú kartu*, ktorá je *o jedno vyššia alebo nižšia* ako kôpka.",
    peaksRule2: {
      wrap: "Na farbe nezáleží a *kráľ s esom* na seba nadväzujú.",
      nowrap: "Na farbe nezáleží. Kráľ a eso na seba *nenadväzujú*.",
    },
    peaksRule3: "Karta sa *otočí*, keď na nej už neleží iná karta.",
    peaksRule4: "Neviete ďalej? *Klepnite na balíček*. Tým sa vaša *reťaz* kariet končí.",
    peaksTip: "Kým otočíte balíček, zahrajte čo najdlhšiu reťaz.",
    pyrHelpGoal:
      "Odložte všetkých 28 kariet pyramídy. Dvojica musí dať spolu 13: eso má 1, dolník 11, dáma 12 a kráľ 13, takže kráľ ide sám. Karty, ktoré zostanú v balíčku, sa nerátajú.",
    pyrHelpFree: "Karta je voľná, keď sú preč obe karty, ktoré na nej ležia. Spodný rad je voľný od začiatku.",
    pyrHelpWaste: "Aj vrchná karta kôpky je voľná: spojte ju s kartou z pyramídy, a ak je to kráľ, klepnite naň.",
    pyrHelpStock: {
      1: "Klepnutím na balíček otočíte jeho ďalšiu kartu na kôpku. Balíčkom sa prejde len raz.",
      3: "Klepnutím na balíček otočíte jeho ďalšiu kartu na kôpku. Keď je prázdny, klepnutím vrátite kôpku späť: balíčkom môžete prejsť trikrát.",
      0: "Klepnutím na balíček otočíte jeho ďalšiu kartu na kôpku. Keď je prázdny, klepnutím vrátite kôpku späť, koľkokrát chcete.",
    },
    pyrHelpMoving:
      "Klepnite na voľnú kartu a potom na kartu, s ktorou dá 13. Keď na zdvihnutú kartu klepnete znova, položíte ju späť. Funguje aj pretiahnutie jednej na druhú.",
    golfHelpGoal:
      "Presuňte všetkých 35 kariet zo siedmich stĺpcov na kôpku. Karty, ktoré zostanú v balíčku, sa nerátajú.",
    golfHelpPlay:
      "Pohnúť sa dá len odkrytou kartou každého stĺpca. Na kôpku ide, keď je o jedno vyššia alebo nižšia ako jej vrchná karta, nech je farba akákoľvek.",
    golfHelpKings:
      "V klasickom golfe na kráľa nejde nič a na eso len dvojka. V nastaveniach môžete na kráľa povoliť dámu, alebo dámu či eso (potom môže ísť aj kráľ na eso).",
    golfHelpStock: "Klepnutím na balíček otočíte jeho ďalšiu kartu na kôpku. Balíčkom sa prejde len raz.",
    peaksHelpGoal:
      "Presuňte všetkých 28 kariet z troch vrcholov na kôpku. Karty, ktoré zostanú v balíčku, sa nerátajú.",
    peaksHelpPlay:
      "Na kôpku môže ísť ktorákoľvek odkrytá karta, ktorá je o jedno vyššia alebo nižšia ako vrchná karta, nech je farba akákoľvek. Kráľ a eso na seba nadväzujú, ak to v nastaveniach nevypnete.",
    peaksHelpTurn:
      "Karta lícom nadol sa otočí, keď sú preč obe karty, ktoré na nej ležia. Keď sú všetky karty lícom nahor (v nastaveniach), môžete si naplánovať celú hru.",
    peaksHelpStock: "Klepnutím na balíček otočíte novú kartu na kôpku. Balíčkom sa prejde len raz.",
    peaksHelpRun:
      "Reťaz počíta karty, ktoré zahráte z vrcholov za sebou; karta z balíčka ju začne odznova. Štatistiky si pamätajú vašu najdlhšiu reťaz.",
    helpRules: "Pravidlá",
    helpHelpers: "Späť, Nápoveda a svetielko",
    helpTap:
      "Klepnutím kartu zahráte; v pyramíde klepnite na dve karty, ktoré dajú 13. Keď karta nemôže ísť, hra povie prečo. Funguje aj pretiahnutie.",
    helpUndo: "Späť vráti ľubovoľný počet ťahov. Nápoveda ukáže ďalší ťah zo skutočnej cesty k výhre.",
    helpLight:
      "Svetielko vedľa ťahov svieti nazeleno, kým sa rozdanie dá vyhrať. Keď už nie, zmení sa na oranžové a jeho tlačidlo vás vráti tam, kde sa ešte dalo. Hra pozná poradie kariet v balíčku, takže odpoveď je presná; prázdny krúžok znamená, že jej nestačil čas.",
    helpFinish: "Keď sa zvyšok dá vyčistiť bez balíčka, tlačidlo Dokončiť ho dohrá (samo od seba, ak to nevypnete).",
    helpKeys1: "Klávesom [Tab] prejdite na kartu; [Enter] ju zahrá alebo zdvihne. [Esc] ju položí späť.",
    helpKeys2: "[D] otočí kartu z balíčka, [U] vráti ťah, [H] ukáže nápovedu, [N] rozdá znova a [G] ukáže všetky hry.",
    toWaste: (a) => `${a.Card} na kôpku.`,
    turnedUp: (a) => `Otočená karta: ${a.card}.`,
    paired: (a) => `Odložené: ${a.card} a ${a.other}.`,
    kingAway: (a) => `Odložená karta: ${a.card}.`,
    redealt: (a) => `Kôpka je späť v balíčku: ${a.n}. prechod z ${a.of}.`,
    redealtFree: (a) => `Kôpka je späť v balíčku: ${a.n}. prechod.`,
    notOneApart: (a) => `${a.Card} sa nehodí na ${a.top}: hodí sa len karta o jedno vyššia alebo nižšia.`,
    nothingOnKing: "Na kráľa nejde nič. Otočte kartu z balíčka.",
    onlyQueenOnKing: "Na kráľa ide len dáma.",
    covered: "Táto karta je ešte zakrytá.",
    notThirteen: (a) => `${a.Card} a ${a.other} dajú spolu ${a.sum}, nie 13.`,
    pickedPair: (a) => `Zdvihnutá karta: ${a.card}. Klepnite na kartu, s ktorou dá 13.`,
    noPartner: "Teraz nie je voľná žiadna karta, ktorá by s ňou dala 13.",
    stockEmpty: "Balíček je prázdny.",
    noMoreRounds: "Balíček sa už nedá znova otočiť.",
    stockLabel: (a) => `Balíček, zostáva ${a.cards}. Otočiť kartu`,
    stockRedealLabel: "Balíček je prázdny. Vrátiť kôpku do balíčka",
    stockEmptyLabel: "Balíček je prázdny",
    wasteLabel: (a) => `Kôpka: ${a.card}`,
    wasteEmptyLabel: "Kôpka je prázdna",
    outLabel: (a) => `Odložené: ${a.cards}`,
    passesLabel: (a) => `${a.n}. prechod balíčkom z ${a.of}`,
    passesFreeLabel: (a) => `${a.n}. prechod balíčkom`,
    columnLabel: (a) => `Stĺpec ${a.i}: ${a.cards}`,
    run: "Reťaz",
    runLabel: (a) => `Reťaz: ${a.n}`,
    longestRun: "Najdlhšia reťaz",
    winRun: (a) => `Najdlhšia reťaz: ${a.n}.`,
    hintPlay: (a) => `Skúste: ${a.card} na kôpku.`,
    hintPair: (a) => `Skúste: ${a.card} a ${a.other}.`,
    hintKing: (a) => `Skúste odložiť: ${a.card}.`,
    hintDraw: "Otočte kartu z balíčka.",
    hintRedeal: "Vráťte kôpku do balíčka.",
    hintNone: "Istý ťah k výhre sa nepodarilo nájsť včas. Rozdanie sa možno ešte dá vyhrať.",
    lostAtStart: "Toto rozdanie sa nedá vyhrať.",
    stuck: "Už nie sú žiadne ťahy.",
    restart: "Odznova",
    newGameSr: (a) => `Nové rozdanie: ${a.game}.`,
    passesOpt: "Prechody balíčkom",
    passes1: "Raz",
    passes3: "Trikrát",
    passes0: "Bez obmedzenia",
    passesNote: "Trikrát je bežná hra, raz je najťažšie.",
    kingsOpt: "Na kráľa",
    kingsNone: "Nič",
    kingsQueen: "Dáma",
    kingsWrap: "Dáma alebo eso",
    kingsNote: "V klasickom golfe na kráľa nejde nič. Pri voľbe „Dáma alebo eso“ môže ísť aj kráľ na eso.",
    wrapOpt: "Kráľ a eso na seba nadväzujú",
    wrapOptSub: "Vypnuté: kráľ a eso reťaz ukončia.",
    openOpt: "Všetky karty lícom nahor",
    openOptSub: "Pokojnejší hlavolam: vidíte celé rozdanie a môžete si naplánovať každý ťah.",
    dealsLabel: "Rozdania",
    dealsWinnable: "Riešiteľné",
    dealsAny: "Akékoľvek",
    dealsNote: "Riešiteľné rozdanie riešiteľ už raz vyhral. Možno budete potrebovať Späť.",
    nextGameNote: "Zmeny pravidiel platia od ďalšej hry.",
    hintsOptSub: "Tlačidlo Nápoveda ukáže ďalší ťah zo skutočnej cesty k výhre.",
    autoFinishSub: "Keď sa zvyšok dá vyčistiť bez balíčka, dohrá sa sám.",
    showTargetsSub: "Zvýrazní karty, ktoré sa dajú práve zahrať (v pyramíde dvojice k zdvihnutej karte).",
    lightOptSub:
      "Pokojné svetielko vedľa ťahov sa rozsvieti nazeleno, kým sa rozdanie dá vyhrať, a naoranžovo, keď už nie. Jedno klepnutie vás vráti tam, kde sa ešte dalo.",
    stockRight: "Balíček vpravo",
    stockRightSub: "Pravým palcom sa k nemu dostanete ľahšie.",
    vibration: "Vibrovanie",
    vibrationSub: "Jemné ťuknutie, keď karty idú preč, a dlhšie pri výhre.",
    dailyIntro:
      "Každý deň nové rozdanie pre každú hru, ktoré sa dá vyhrať, s pravidlami, ktoré hráte. Vynechané dni z tohto a minulého mesiaca si môžete zahrať aj neskôr.",
    dailyStreak: {
      one: "Vyriešený # deň po sebe.",
      few: "Vyriešené # dni po sebe.",
      other: "Vyriešených # dní po sebe.",
    },
    resetAsk: "Vymazať štatistiky všetkých troch hier? Nedá sa to vrátiť.",
    dailySolved: "Vyriešené denné hry",
    dealEasy: "Riešiteľné rozdanie",
    dealAny: "Akékoľvek rozdanie",
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
