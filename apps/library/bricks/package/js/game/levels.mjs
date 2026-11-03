// The hand-made levels: four worlds of twelve. Each level is a picture of its tiles, one text per row, one character
// per tile:
//
//   .        no tile
//   a to y   a glazed tile that breaks at the first hit; the letter is its glaze (see GLAZES in render/sprites.mjs)
//   A to Y   the same glaze, fired twice: it takes two hits
//   $        a lustre tile: three hits
//   *        an ember tile: it bursts when it breaks and hits every tile around it
//   ?        a gift tile: it always drops a power-up
//   #        an iron tile: it never breaks, and a level is clear without it
//
// Every row of a level has the same length, which sets the number of columns (11 to 15). `move` makes whole rows
// slide to and fro: `row` (from 0 at the top), `cells` (how far, in tiles, each way), `speed` (radians a second) and
// `phase`. dev/check-levels.mjs checks that every tile can be reached and every level can be cleared.

export const WORLDS = [
  // Warm earthenware: the first steps, then tiles fired twice, gifts and embers.
  { id: 1, key: "terracotta", speed: 285, drop: 0.13, power: ["wide", "multi", "slow", "sticky", "life"] },
  // Blue and white: iron, lustre and the first moving rows; the paddle learns to fire sparks.
  { id: 2, key: "cobalt", speed: 300, drop: 0.12, power: ["wide", "multi", "slow", "sticky", "sparks", "life"] },
  // Copper and its green: chains of embers, cages and moving rows; molten balls and the guard.
  {
    id: 3,
    key: "copper",
    speed: 315,
    drop: 0.12,
    power: ["wide", "multi", "slow", "sticky", "sparks", "molten", "guard", "life"],
  },
  // Gold and lustre: everything together.
  {
    id: 4,
    key: "lustre",
    speed: 330,
    drop: 0.12,
    power: ["wide", "multi", "slow", "sticky", "sparks", "molten", "guard", "life"],
  },
];

export const LEVELS = [
  // ---- World 1: Terracotta
  {
    id: "1-1",
    name: { en: "First light", sk: "Prvé svetlo" },
    rows: [".............", ".ooooooooooo.", ".aaaaaaaaaaa.", ".yyyyyyyyyyy.", ".ggggggggggg."],
  },
  {
    id: "1-2",
    name: { en: "Valley", sk: "Údolie" },
    rows: ["c...........c", "cc.........cc", "oco.......oco", "aoco.....ocoa", "yaoco...ocoay", "gyaoco.ocoayg"],
  },
  {
    id: "1-3",
    name: { en: "Arch", sk: "Oblúk" },
    rows: [
      "...ccccccc...",
      "..coooooooc..",
      ".coaaaaaaaoc.",
      ".coa.....aoc.",
      ".coa.....aoc.",
      ".coa.....aoc.",
      ".yy.......yy.",
    ],
  },
  {
    id: "1-4",
    name: { en: "Ribbons", sk: "Stužky" },
    rows: [
      "ccccc...ccccc",
      ".............",
      ".aaaaaaaaaaa.",
      ".............",
      "yyyyy...yyyyy",
      ".............",
      ".ggggggggggg.",
    ],
  },
  {
    id: "1-5",
    name: { en: "Fired twice", sk: "Dvakrát vypálené" },
    rows: [".............", ".aaaaaaaaaaa.", ".aOOOOOOOOOa.", ".aOyyyyyyyOa.", ".aOOOOOOOOOa.", ".aaaaaaaaaaa."],
  },
  {
    id: "1-6",
    name: { en: "Diamond", sk: "Kosoštvorec" },
    rows: [
      "......c......",
      ".....cyc.....",
      "....cyAyc....",
      "...cyAgAyc...",
      "..cyAgGgAyc..",
      "...cyAgAyc...",
      "....cyAyc....",
      ".....cyc.....",
      "......c......",
    ],
  },
  {
    id: "1-7",
    name: { en: "Gifts", sk: "Darčeky" },
    rows: [
      ".............",
      ".nnn.....nnn.",
      ".n?n.....n?n.",
      ".nnn.....nnn.",
      ".....ccc.....",
      ".....c?c.....",
      ".....ccc.....",
      ".AAAAAAAAAAA.",
    ],
  },
  {
    id: "1-8",
    name: { en: "Checkers", sk: "Šachovnica" },
    rows: ["a.a.a.a.a.a.a", ".o.o.o.o.o.o.", "c.c.c.c.c.c.c", ".y.y.y.y.y.y.", "G.G.G.G.G.G.G", ".w.w.w.w.w.w."],
  },
  {
    id: "1-9",
    name: { en: "Sun", sk: "Slnko" },
    rows: [
      "...y..y..y...",
      "....y.y.y....",
      "..y.ooooo.y..",
      "...ooOOOoo...",
      ".yyoOOYOOoyy.",
      "...ooOOOoo...",
      "..y.ooooo.y..",
      "....y.y.y....",
      "...y..y..y...",
    ],
  },
  {
    id: "1-10",
    name: { en: "Spark", sk: "Iskra" },
    rows: [
      ".............",
      ".aaaaaaaaaaa.",
      ".aaaaa*aaaaa.",
      ".ccccccccccc.",
      ".cc*ccccc*cc.",
      ".yyyyyyyyyyy.",
      ".yyyyy*yyyyy.",
    ],
  },
  {
    id: "1-11",
    name: { en: "Mug", sk: "Hrnček" },
    rows: [
      ".............",
      "..nnnnnnn....",
      "..nWWWWWn.nn.",
      "..nWcWcWn..n.",
      "..nWWWWWn..n.",
      "..nWcWcWn.nn.",
      "..nWWWWWn....",
      "...nnnnn.....",
    ],
  },
  {
    id: "1-12",
    name: { en: "Teapot", sk: "Čajník" },
    rows: [
      "......y......",
      "....ooooo....",
      "...ccccccc...",
      "o..cCCCCCc.aa",
      ".o.cCwCwCca.a",
      "..ocCCCCCca.a",
      "...cCwCwCcaa.",
      "...ccccccc...",
      "....yyyyy....",
    ],
  },

  // ---- World 2: Cobalt
  {
    id: "2-1",
    name: { en: "Tide", sk: "Príliv" },
    rows: ["s.....s.....s", "ss...sss...ss", "bss.sbsbs.ssb", "bbsssbbbsssbb", "tbbbbbtbbbbbt", "ttttttttttttt"],
  },
  {
    id: "2-2",
    name: { en: "Iron gate", sk: "Železná brána" },
    rows: [
      ".............",
      ".wwwwwwwwwww.",
      ".bbbbbbbbbbb.",
      ".............",
      "#.#.#.#.#.#.#",
      ".............",
      ".sssssssssss.",
    ],
  },
  {
    id: "2-3",
    name: { en: "Fish", sk: "Ryba" },
    rows: [
      ".............",
      "....sss......",
      "..ssBBBs...s.",
      ".sBBwBBBs.ss.",
      "sBBkwBBBBsss.",
      ".sBBBBBBs.ss.",
      "..ssBBBs...s.",
      "....sss......",
    ],
  },
  {
    id: "2-4",
    name: { en: "Windows", sk: "Okná" },
    rows: [
      ".............",
      ".bbb.bbb.bbb.",
      ".bTb.bTb.bTb.",
      ".bbb.bbb.bbb.",
      ".............",
      ".ttt.ttt.ttt.",
      ".tSt.tSt.tSt.",
      ".ttt.ttt.ttt.",
      "#...#...#...#",
    ],
  },
  {
    id: "2-5",
    name: { en: "Pillars", sk: "Stĺpy" },
    rows: ["b.s.t.w.t.s.b", "B.S.T.W.T.S.B", "b.s.t.w.t.s.b", "#.#.#.#.#.#.#", "b.s.t.w.t.s.b", "B.S.T.W.T.S.B"],
  },
  {
    id: "2-6",
    name: { en: "Lustre", sk: "Lesk" },
    rows: [
      ".............",
      "..$$$$$$$$$..",
      ".bbbbbbbbbbb.",
      ".sssssssssss.",
      ".ttttttttttt.",
      ".............",
      "...w.w.w.w...",
    ],
  },
  {
    id: "2-7",
    name: { en: "Anchor", sk: "Kotva" },
    rows: [
      "......w......",
      ".....wbw.....",
      "......w......",
      "...wwwWwww...",
      "......W......",
      "......W......",
      ".s....W....s.",
      ".ss...W...ss.",
      "..ss..W..ss..",
      "...sssSsss...",
    ],
  },
  {
    id: "2-8",
    name: { en: "Snowflake", sk: "Vločka" },
    rows: [
      "......s......",
      "..s...s...s..",
      "...s..w..s...",
      "....sSwSs....",
      ".....WWW.....",
      "sssswWbWwssss",
      ".....WWW.....",
      "....sSwSs....",
      "...s..w..s...",
      "..s...s...s..",
      "......s......",
    ],
  },
  {
    id: "2-9",
    name: { en: "Rails", sk: "Koľajnice" },
    rows: [
      ".............",
      "..bbbbbbbbb..",
      ".............",
      "...sssssss...",
      ".............",
      "....ttttt....",
      ".............",
      ".wwwwwwwwwww.",
    ],
    move: [
      { row: 3, cells: 3, speed: 0.9, phase: 0 },
      { row: 5, cells: 4, speed: 0.75, phase: Math.PI },
    ],
  },
  {
    id: "2-10",
    name: { en: "Lighthouse", sk: "Maják" },
    rows: [
      "......y......",
      ".....rrr.....",
      ".....wWw.....",
      ".....rRr.....",
      ".....wWw.....",
      "....rrRrr....",
      "....wwWww....",
      "...rrrRrrr...",
      "###.......###",
    ],
  },
  {
    id: "2-11",
    name: { en: "Whale", sk: "Veľryba" },
    rows: [
      ".........s.s.",
      "..........s..",
      "...bbbbb..s..",
      ".bbBBBBBbbb..",
      "bBwBBBBBBBbb.",
      "bBBBBBBBBBBbb",
      ".bbsssssssbb.",
      "..bbbbbbbbb..",
    ],
  },
  {
    id: "2-12",
    name: { en: "The deep", sk: "Hlbina" },
    rows: [
      ".............",
      ".$$$.....$$$.",
      ".$b$.....$b$.",
      ".$$$.....$$$.",
      ".............",
      "....#####....",
      ".ssss...ssss.",
      ".SSSSSSSSSSS.",
      ".............",
      "..ppppppppp..",
    ],
    move: [{ row: 9, cells: 2, speed: 1.0, phase: 0 }],
  },

  // ---- World 3: Copper
  {
    id: "3-1",
    name: { en: "Verdigris", sk: "Medenka" },
    rows: [".............", "ggggggggggggg", "gTTTTTTTTTTTg", "gTrrrrrrrrrTg", "gTTTTTTTTTTTg", "ggggggggggggg"],
  },
  {
    id: "3-2",
    name: { en: "Forge", sk: "Vyhňa" },
    rows: [
      ".............",
      ".rrrrrrrrrrr.",
      ".r*r*r*r*r*r.",
      ".ooooooooooo.",
      ".aaaaaaaaaaa.",
      ".a*aaaaaaa*a.",
      ".yyyyyyyyyyy.",
    ],
  },
  {
    id: "3-3",
    name: { en: "Cage", sk: "Klietka" },
    rows: [
      ".............",
      ".####...####.",
      ".#ooooooooo#.",
      ".#oRRRRRRRo#.",
      ".#oR*****Ro#.",
      ".#oRRRRRRRo#.",
      ".#ooooooooo#.",
      ".####...####.",
    ],
  },
  {
    id: "3-4",
    name: { en: "Leaf", sk: "List" },
    rows: [
      "......g......",
      ".....gGg.....",
      "....gGgGg....",
      "...gGgggGg...",
      "..gGgg.ggGg..",
      "..gGg.g.gGg..",
      "..gGgg.ggGg..",
      "...gGgggGg...",
      "....gGgGg....",
      ".....gGg.....",
      "......o......",
      "......o......",
    ],
  },
  {
    id: "3-5",
    name: { en: "Pendulum", sk: "Kyvadlo" },
    rows: [
      "......#......",
      "......#......",
      ".............",
      "....rrrrr....",
      ".............",
      "...ooooooo...",
      ".............",
      "..aaaaaaaaa..",
    ],
    move: [
      { row: 3, cells: 4, speed: 0.7, phase: 0 },
      { row: 5, cells: 3, speed: 0.9, phase: Math.PI },
      { row: 7, cells: 2, speed: 1.1, phase: Math.PI / 2 },
    ],
  },
  {
    id: "3-6",
    name: { en: "Gears", sk: "Ozubené kolesá" },
    rows: [
      ".............",
      "..t.t...r.r..",
      ".tTTTt.rRRRr.",
      "..T*T...R*R..",
      ".tTTTt.rRRRr.",
      "..t.t...r.r..",
      ".............",
      "..ggggggggg..",
      "..g.g.g.g.g..",
    ],
  },
  {
    id: "3-7",
    name: { en: "Mushroom", sk: "Hríb" },
    rows: [
      "....rrrrr....",
      "..rrwrrrwrr..",
      ".rrrrrwrrrrr.",
      ".rwrrrrrrrwr.",
      ".rrrrrrrrrrr.",
      ".....aaa.....",
      ".....aAa.....",
      ".....aAa.....",
      "....aaaaa....",
    ],
  },
  {
    id: "3-8",
    name: { en: "Fuse", sk: "Zápalnica" },
    rows: [
      ".............",
      ".ooooooooooo.",
      ".oOOOOOOOOOo.",
      ".o*********o.",
      ".oOOOOOOOOOo.",
      ".ooooooooooo.",
      ".............",
      "...a.a.a.a...",
    ],
  },
  {
    id: "3-9",
    name: { en: "Maze", sk: "Bludisko" },
    rows: [
      ".............",
      ".tttt...tttt.",
      ".tTTt...tTTt.",
      ".tttt...tttt.",
      "..#.#####.#..",
      "..#.......#..",
      "..###.#.###..",
      ".............",
      "..ooooooooo..",
    ],
  },
  {
    id: "3-10",
    name: { en: "Cat", sk: "Mačka" },
    rows: [
      ".a.........a.",
      ".aa.......aa.",
      ".aAa.....aAa.",
      ".aaaaaaaaaaa.",
      ".aakaaaaakaa.",
      ".aaaaanaaaaa.",
      ".aaaaaaaaaaa.",
      "..aaaaaaaaa..",
      "....aaaaa....",
    ],
  },
  {
    id: "3-11",
    name: { en: "Bridges", sk: "Mosty" },
    rows: [
      ".............",
      ".tttt...tttt.",
      ".............",
      "###.......###",
      "...ooooooo...",
      "###.......###",
      ".............",
      "...ggggggg...",
    ],
    move: [
      { row: 4, cells: 3, speed: 0.8, phase: 0 },
      { row: 7, cells: 3, speed: 0.8, phase: Math.PI },
    ],
  },
  {
    id: "3-12",
    name: { en: "Crucible", sk: "Téglik" },
    rows: [
      ".$$.......$$.",
      ".$r$.....$r$.",
      "..$.......$..",
      ".............",
      "#rrrrrrrrrrr#",
      "#rOOOOOOOOOr#",
      "#rO*******Or#",
      "#rOOOOOOOOOr#",
      "#rrrrrrrrrrr#",
      "###.......###",
      ".............",
      "....aaaaa....",
    ],
    move: [{ row: 11, cells: 4, speed: 0.8, phase: 0 }],
  },

  // ---- World 4: Lustre
  {
    id: "4-1",
    name: { en: "Crown", sk: "Koruna" },
    rows: [
      "y.....y.....y",
      "yy...yYy...yy",
      "yYy.yYrYy.yYy",
      "yYYyYYYYYyYYy",
      "y$$$$$$$$$$$y",
      "yYYYYYYYYYYYy",
      "ppppppppppppp",
    ],
  },
  {
    id: "4-2",
    name: { en: "Mosaic", sk: "Mozaika" },
    rows: ["pnpnpnpnpnpnpnp", "nwnwnwnwnwnwnwn", "pnPnPnPnPnPnPnp", "nwnwnwnwnwnwnwn", "pnpnpnpnpnpnpnp"],
  },
  {
    id: "4-3",
    name: { en: "Butterfly", sk: "Motýľ" },
    rows: [
      ".pp.......pp.",
      "pPPp.....pPPp",
      "pPnPp.k.pPnPp",
      "pPPPPpkpPPPPp",
      ".pPPPPkPPPPp.",
      "..ppPPkPPpp..",
      "..pnPpkpPnp..",
      "...pp.k.pp...",
    ],
  },
  {
    id: "4-4",
    name: { en: "Carousel", sk: "Kolotoč" },
    rows: [
      ".....yyy.....",
      ".............",
      "...nnnnnnn...",
      ".............",
      "....lllll....",
      ".............",
      "...ppppppp...",
      ".............",
      "##.........##",
    ],
    move: [
      { row: 2, cells: 3, speed: 0.9, phase: 0 },
      { row: 4, cells: 4, speed: 0.9, phase: Math.PI },
      { row: 6, cells: 3, speed: 0.9, phase: 0 },
    ],
  },
  {
    id: "4-5",
    name: { en: "Vault", sk: "Trezor" },
    rows: [
      ".............",
      ".###########.",
      ".#$$$$$$$$$#.",
      ".#$aaaaaaa$#.",
      ".#$a?a?a?a$#.",
      ".#$aaaaaaa$#.",
      ".#$$$$$$$$$#.",
      ".####...####.",
      ".............",
      "..yyyyyyyyy..",
    ],
  },
  {
    id: "4-6",
    name: { en: "Rocket", sk: "Raketa" },
    rows: [
      "......w......",
      ".....wWw.....",
      ".....wsw.....",
      "....wwWww....",
      "....wsWsw....",
      "....wwWww....",
      "...rwwWwwr...",
      "..rr.wWw.rr..",
      "..r..ooo..r..",
      "......y......",
    ],
  },
  {
    id: "4-7",
    name: { en: "Fireworks", sk: "Ohňostroj" },
    rows: [
      "..y...l...n..",
      ".y*y.l*l.n*n.",
      "..y...l...n..",
      ".............",
      "....p...p....",
      "...p*p.p*p...",
      "....p...p....",
      ".............",
      "aaaaaaaaaaaaa",
    ],
  },
  {
    id: "4-8",
    name: { en: "Owl", sk: "Sova" },
    rows: [
      ".a.........a.",
      ".aaaaaaaaaaa.",
      "aawwwaaawwwaa",
      "awwkwwawwkwwa",
      "aawwwayawwwaa",
      ".aaaaaYaaaaa.",
      ".aAaAaAaAaAa.",
      ".aaAaAaAaAaa.",
      "..aaaaaaaaa..",
      "...y.....y...",
    ],
  },
  {
    id: "4-9",
    name: { en: "Tiers", sk: "Poschodia" },
    rows: [
      ".....$$$.....",
      ".............",
      "..ppppppppp..",
      ".............",
      "##...lll...##",
      ".............",
      "...nnnnnnn...",
      ".............",
      "...yyyyyyy...",
    ],
    move: [
      { row: 2, cells: 2, speed: 1.0, phase: 0 },
      { row: 6, cells: 3, speed: 0.85, phase: 0 },
      { row: 8, cells: 3, speed: 0.85, phase: Math.PI },
    ],
  },
  {
    id: "4-10",
    name: { en: "Heart", sk: "Srdce" },
    rows: [
      "..nnn...nnn..",
      ".nNNNn.nNNNn.",
      "nNwNNNnNNNNNn",
      "nNNNNNNNNNNNn",
      ".nNNNNNNNNNn.",
      "..nNNNNNNNn..",
      "...nNNNNNn...",
      "....nNNNn....",
      ".....nNn.....",
      "......n......",
    ],
  },
  {
    id: "4-11",
    name: { en: "Labyrinth", sk: "Labyrint" },
    rows: [
      "$$$$.....$$$$",
      "p..#.###.#..p",
      "pp.#..*..#.pp",
      "#..##...##..#",
      "..ppp...ppp..",
      ".####...####.",
      ".............",
      "..nnnnnnnnn..",
    ],
  },
  {
    id: "4-12",
    name: { en: "Great kiln", sk: "Veľká pec" },
    rows: [
      "..y$y...y$y..",
      ".yYYYy.yYYYy.",
      "..y$y...y$y..",
      ".............",
      "#rrrrr*rrrrr#",
      "#oOOOOOOOOOo#",
      "#aA*A?A?A*Aa#",
      "#oOOOOOOOOOo#",
      "#rrrrr*rrrrr#",
      "###.......###",
      ".............",
      "...ppppppp...",
      ".............",
      "..nnnnnnnnn..",
    ],
    move: [
      { row: 11, cells: 3, speed: 0.9, phase: 0 },
      { row: 13, cells: 2, speed: 1.1, phase: Math.PI },
    ],
  },
];

/** The level with an id ("2-7"), or null. */
export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

/** The world a hand-made level belongs to. */
export function worldOf(level) {
  return WORLDS[Number(String(level.id).split("-")[0]) - 1] || WORLDS[0];
}

/** The level after this one, or null after the last. */
export function nextLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
}

/** The level before this one, or null for the first. */
export function previousLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i > 0 ? LEVELS[i - 1] : null;
}
