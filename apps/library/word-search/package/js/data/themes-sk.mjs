// Word Search's themes in Slovak: the same ids as the English themes, a name, and the theme's words, common nouns in
// their base form (nominative singular, plural-only nouns in the plural) of 3 to 12 letters, separated by spaces.
// Letters with diacritics are letters of their own, and "ch" is one letter, so "chlieb" fills five squares.
// The hidden messages are traditional Slovak proverbs and short cheers.
//
// Written for this game. The themes and messages in js/data/ are dedicated to the public domain under CC0 1.0
// (dev/README.md says more): anyone may copy, change and use them, for any purpose, without asking.

export const THEMES = [
  {
    id: "farm",
    name: "Na gazdovstve",
    words:
      "krava prasa sliepka koza ovca kôň kačica hus jahňa teľa žriebä prasiatko kuriatko kohút osol moriak poník " +
      "stodola maštaľ chliev kurín traktor seno slama pole plot brána gazda pluh válov mlieko vajce vlna sad lúka " +
      "strašiak vidly žatva bača salaš",
  },
  {
    id: "wild",
    name: "Divé zvieratá",
    words:
      "lev tiger medveď vlk líška jeleň srna los zebra žirafa slon opica gorila nosorožec hroch ťava klokan koala " +
      "panda leopard gepard jaguár jazvec bobor vydra veverička jež zajac králik bizón byvol rys antilopa šimpanz " +
      "krokodíl had jašterica diviak kamzík svišť",
  },
  {
    id: "birds",
    name: "Vtáky",
    words:
      "sova vrana červienka orol jastrab labuť bocian volavka lastovička vrabec papagáj holub hrdlička sýkorka " +
      "pinka straka sokol čajka tučniak pštros páv pelikán plameniak ďateľ slávik kukučka drozd kos rybárik " +
      "škovránok havran škorec sojka kavka výr sup hniezdo pierko zobák krídlo",
  },
  {
    id: "creatures",
    name: "Drobné živočíchy",
    words:
      "mravec včela osa mucha mol chrobák lienka motýľ húsenica svrček kobylka vážka komár pavúk slimák dážďovka " +
      "blcha kliešť termit čmeliak sršeň kukla larva pavučina plást med tykadlo stonožka škorpión voška cikáda " +
      "chrúst roháč mravenisko pijavica",
  },
  {
    id: "sea",
    name: "More",
    words:
      "vlna príliv odliv mušľa krab ryba veľryba žralok delfín tuleň chobotnica kalmár medúza hviezdica homár " +
      "kreveta ustrica slávka koral útes riasa kotva loď čln plachta prístav maják ostrov pláž piesok perla prúd " +
      "oceán potápač sieť bója tuniak treska úhor mrož korytnačka záliv",
  },
  {
    id: "fruit",
    name: "Ovocie",
    words:
      "jablko hruška slivka čerešňa višňa broskyňa marhuľa hrozno banán pomaranč citrón limetka melón kiwi mango " +
      "ananás jahoda malina čučoriedka ostružina ríbezľa egreš figa datľa kokos papája dula nektárinka brusnica " +
      "avokádo mandarínka oliva šípka hrozienko",
  },
  {
    id: "vegetables",
    name: "Zelenina",
    words:
      "mrkva zemiak cibuľa cesnak pór kapusta šalát špenát hrach fazuľa kukurica paprika rajčina uhorka tekvica " +
      "cuketa reďkovka cvikla repa zeler petržlen brokolica karfiol kel špargľa artičok baklažán šošovica cícer " +
      "patizón huba pažítka kaleráb paštrnák chren",
  },
  {
    id: "kitchen",
    name: "V kuchyni",
    words:
      "panvica hrniec pokrievka šálka hrnček misa tanier vidlička nôž lyžica naberačka metlička kanvica rúra " +
      "sporák chladnička mraznička drez kohútik hriankovač strúhadlo sitko džbán pohár tácka zástera obrúsok " +
      "kredenc zásuvka polica recept váha mixér cedník valček dóza varecha príbor",
  },
  {
    id: "food",
    name: "Jedlo",
    words:
      "chlieb maslo syr vajce polievka šalát ryža cestoviny rezance pizza sendvič klobása šunka slanina kurča " +
      "mäso rezeň guláš omeleta palacinka kaša jogurt hrianka džem med omáčka prívarok knedľa halušky pirohy " +
      "lokša soľ cukor múka olej ocot horčica kečup bryndza oštiepok",
  },
  {
    id: "sweets",
    name: "Sladkosti",
    words:
      "koláč sušienka keks cukrík čokoláda karamel šiška oblátka puding krém poleva cukor med želé lízanka " +
      "marcipán torta štrúdľa sorbet dezert sirup pralinka perník buchta závin trubička veterník medovník laskonka " +
      "makovník orechovník šľahačka zmrzlina nugát",
  },
  {
    id: "cafe",
    name: "V kaviarni",
    words:
      "káva čaj kakao mlieko džús voda limonáda espreso šálka podšálka lyžička cukor smotana lístok účet " +
      "sprepitné čašník stôl stolička pult koláč rožok pagáč kanvica pena zrnko hrnček slamka ľad kaviareň " +
      "terasa obsluha tácka servítka",
  },
  {
    id: "home",
    name: "Doma",
    words:
      "dom izba dvere okno stena podlaha strecha schody chodba kuchyňa spálňa kúpeľňa povala pivnica garáž " +
      "balkón komín pohovka kreslo stôl stolička posteľ lampa koberec záclona zrkadlo hodiny polica vankúš " +
      "perina deka skriňa knižnica radiátor kozub zvonček kľúč zámok gauč predsieň",
  },
  {
    id: "garden",
    name: "Záhrada",
    words:
      "rýľ hrable motyka kôlňa hadica trávnik tráva krík strom ruža tulipán sedmokráska semienko pôda kvetináč " +
      "vedro kompost kosačka lavička chodník jazierko fontána vták hniezdo dážďovka slimák včela skleník fúrik " +
      "krhla postrekovač burina cibuľka koreň list plot trpaslík hojdačka slnečnica hriadka jabloň",
  },
  {
    id: "forest",
    name: "Les",
    words:
      "strom dub borovica breza buk javor vŕba jedľa smrek smrekovec jaseň brest jelša konár vetvička list kôra " +
      "koreň kmeň mach papraď huba žaluď šiška poleno peň chodník čistina jeleň líška sova ďateľ veverička malina " +
      "brečtan húština horár rúbanisko ihličie hríb",
  },
  {
    id: "flowers",
    name: "Kvety",
    words:
      "ruža tulipán sedmokráska ľalia kosatec mak fialka orchidea orgován levanduľa narcis šafran snežienka " +
      "slnečnica púpava ďatelina pivonka klinček nechtík sirôtka nevädza zvonček prvosienka jazmín magnólia vres " +
      "stonka púčik kvet peľ kytica váza harmanček margaréta astra georgína chryzantéma lekno mečík lupeň",
  },
  {
    id: "weather",
    name: "Počasie",
    words:
      "slnko dážď sneh vietor oblak hmla opar mráz ľad krupobitie búrka hrom blesk dúha vánok víchrica mrholenie " +
      "prehánka mláka fujavica horúčava sucho povodeň dáždnik predpoveď teplota stupeň obloha rosa inovať " +
      "námraza poryv vločka chlad teplo smog oblačnosť",
  },
  {
    id: "winter",
    name: "Zima",
    words:
      "sneh ľad mráz sánky lyže korčule snehuliak šál rukavica palčiaky čiapka kabát čižmy kozub kakao deka " +
      "cencúľ guľovačka fujavica chlad hokej klzisko iglu sviečka december január február sob sane jedlička " +
      "imelo lopata čľapkanica odmäk vločka kachle",
  },
  {
    id: "summer",
    name: "Leto",
    words:
      "slnko pláž piesok more vlna prázdniny dovolenka piknik stan zmrzlina limonáda okuliare plavky uterák tieň " +
      "horúčava melón jahoda gril tábor jazero bazén lehátko vedierko lopatka mušľa šarkan sandál klobúk vejár " +
      "vánok ostrov loďka festival letovisko kúpalisko opaľovanie čerešňa",
  },
  {
    id: "landscape",
    name: "Krajina",
    words:
      "kopec údolie rieka jazero potok pole lúka hora vrch štít útes jaskyňa skala kameň ostrov pobrežie breh " +
      "záliv púšť duna les háj močiar rybník vodopád kaňon rovina nížina sopka ľadovec hrebeň svah prameň " +
      "roklina planina obzor cesta dolina sedlo",
  },
  {
    id: "mountains",
    name: "Hory",
    words:
      "štít vrchol hrebeň svah skala balvan jaskyňa ľadovec sneh lavína sedlo dolina chata útulňa chodník značka " +
      "lano batoh mapa kompas horolezec sprievodca stan orol kamzík svišť kosodrevina vodopád pleso výhľad " +
      "prilba potok turista salaš palica lanovka",
  },
  {
    id: "sports",
    name: "Šport",
    words:
      "futbal tenis golf hokej ragby box cyklistika veslovanie plachtenie lyžovanie plávanie beh džudo karate " +
      "lukostreľba šerm surfovanie lezenie korčuľovanie lopta gól bránka sieť raketa pálka tím tréner zápas " +
      "preteky medaila pohár skóre rozhodca štadión hráč víťaz volejbal basketbal hádzaná",
  },
  {
    id: "games",
    name: "Hry a hračky",
    words:
      "bábika lopta šarkan skladačka šach karty kocka domino gulička vĺčik robot macko vláčik stavebnica bubon " +
      "píšťalka balón bábka hojdačka šmýkačka švihadlo obruč pešiak kráľ kráľovná jazdec strelec veža dáma hra " +
      "hračka bludisko hádanka kvíz kolotoč pieskovisko plastelína kolky",
  },
  {
    id: "jobs",
    name: "Povolania",
    words:
      "pekár mäsiar kuchár lekár lekárnik zubár veterinár farmár učiteľ pilot vodič námorník vojak policajt " +
      "hasič inštalatér murár maliar spisovateľ spevák herec tanečník sudca právnik bankár úradník čašník " +
      "kominár záhradník krajčír holič kaderník stolár tesár elektrikár inžinier vedec knihovník baník rybár " +
      "umelec poštár hodinár kováč",
  },
  {
    id: "body",
    name: "Ľudské telo",
    words:
      "hlava vlasy tvár oko ucho nos ústa pera jazyk zub brada líce krk rameno ruka lakeť zápästie dlaň prst " +
      "palec necht hruď chrbát brucho bok noha koleno členok chodidlo päta koža kosť srdce pľúca mozog sval " +
      "obočie čelo žalúdok mihalnica",
  },
  {
    id: "health",
    name: "U lekára",
    words:
      "lekár sestra pacient liek tabletka sirup obväz náplasť injekcia očkovanie horúčka kašeľ nádcha chrípka " +
      "bolesť kýchanie vyrážka teplomer fonendoskop ambulancia nemocnica sanitka lekáreň recept sadra barla " +
      "vozík zdravie odpočinok vitamín vreckovka rana jazva čakáreň prehliadka kvapky",
  },
  {
    id: "clothes",
    name: "Oblečenie",
    words:
      "košeľa blúzka sukňa šaty nohavice rifle šortky kabát bunda sveter šál klobúk čiapka rukavica ponožka " +
      "topánka čižma sandál papuča opasok kravata vesta pyžamo oblek uniforma kapucňa gombík zips vrecko golier " +
      "rukáv zástera pršiplášť pančuchy plavky montérky tričko mikina sako kroj",
  },
  {
    id: "travel",
    name: "Cestovanie",
    words:
      "výlet cesta dovolenka lístok pas kufor taška batoh mapa sprievodca hotel penzión kemp stan letisko let " +
      "lietadlo vlak stanica nástupište autobus trajekt plavba prístav hranica colnica batožina suvenír " +
      "pohľadnica fotka fotoaparát turista trasa kompas rezervácia meškanie pamiatka cestovateľ",
  },
  {
    id: "transport",
    name: "Doprava",
    words:
      "auto autobus električka vlak taxík bicykel kolobežka motorka nákladiak dodávka loď čln trajekt jachta " +
      "kanoe kajak plť lietadlo vrtuľník raketa balón traktor sanitka metro lanovka sane koleso motor cesta most " +
      "tunel koľajnica benzín garáž parkovisko diaľnica križovatka semafor trolejbus",
  },
  {
    id: "town",
    name: "V meste",
    words:
      "ulica cesta námestie park most veža kostol hrad múzeum divadlo kino knižnica škola nemocnica banka obchod " +
      "trh pekáreň kaviareň hotel stanica úrad továreň fontána socha lavička lampa priechod chodník roh štvrť " +
      "galéria pošta lekáreň štadión ihrisko radnica zámok sídlisko električka",
  },
  {
    id: "shopping",
    name: "Nakupovanie",
    words:
      "obchod trh stánok košík vozík taška účtenka cena výpredaj zľava pokladňa rad pult polica regál minca " +
      "bankovka peňaženka výdavok cenovka značka darček zákazník predavač veľkosť zrkadlo kabínka objednávka " +
      "doručenie balík zoznam pekáreň mäsiarstvo kvetinárstvo drogéria potraviny nákup akcia",
  },
  {
    id: "school",
    name: "V škole",
    words:
      "žiak učiteľ trieda hodina lavica stolička tabuľa krieda pero ceruzka guma pravítko kniha zošit strana " +
      "úloha test písomka známka mapa glóbus taška aktovka prestávka zvonček telocvičňa knižnica rozvrh predmet " +
      "dejepis matematika fyzika chémia zemepis čítanie písanie diktát peračník kružidlo nožnice riaditeľ",
  },
  {
    id: "office",
    name: "V kancelárii",
    words:
      "stôl stolička počítač obrazovka klávesnica myš tlačiareň papier šanón súbor zošívačka spinka pero obálka " +
      "pečiatka list telefón porada správa šéf kolega termín kalendár diár poznámka štítok nožnice páska lepidlo " +
      "zásuvka skriňa lampa nástenka rozpočet faktúra harmonogram kopírka archív",
  },
  {
    id: "music",
    name: "Hudba",
    words:
      "pieseň melódia tón akord zbor kapela klavír gitara husle violončelo flauta bubon trúbka roh harfa organ " +
      "akordeón heligónka klarinet hoboj tuba saxofón harmonika basa rytmus takt tempo spevák koncert opera " +
      "orchester dirigent pódium uspávanka hymna platňa rádio mikrofón fujara cimbal píšťalka",
  },
  {
    id: "art",
    name: "Umenie a ručné práce",
    words:
      "farba štetec plátno stojan paleta ceruzka pastelka krieda atrament hlina keramika socha plastika rám " +
      "portrét skica kresba koláž mozaika steh ihla niť vlna priadza pletenie háčkovanie lepidlo nožnice papier " +
      "výkres galéria múzeum umelec ateliér vzor výšivka čipka tieň",
  },
  {
    id: "books",
    name: "Knihy",
    words:
      "kniha strana obálka kapitola príbeh román báseň rozprávka bájka mýtus povesť autor spisovateľ básnik " +
      "čitateľ názov hrdina dej koniec knižnica polica záložka denník list komiks atlas slovník časopis noviny " +
      "veta slovo verš rým register tlač vydavateľ kníhkupectvo",
  },
  {
    id: "tools",
    name: "V dielni",
    words:
      "kladivo klinec skrutka matica píla vŕtačka pilník dláto hoblík kľúč kliešte meter vodováha rebrík lepidlo " +
      "farba štetec ponk zverák svorka sekera nôž hák pánt drôt doska fošňa drevo hobliny piliny lopata vedro " +
      "skrutkovač prilba kufrík náradie dielňa",
  },
  {
    id: "shapes",
    name: "Tvary",
    words:
      "kruh štvorec trojuholník obdĺžnik ovál kocka guľa valec kužeľ ihlan hranol šesťuholník päťuholník " +
      "osemuholník hviezda srdce oblúk špirála kosoštvorec lichobežník čiara bod uhol strana hrana vrchol krivka " +
      "polomer priemer stred mriežka vzor krúžok kríž elipsa polkruh uhlopriečka štvorček",
  },
  {
    id: "family",
    name: "Rodina",
    words:
      "mama otec ocko matka rodič syn dcéra dieťa bábätko brat sestra dvojča teta strýko ujo bratranec " +
      "sesternica neter synovec babka dedko vnuk vnučka manželka manžel nevesta ženích rodina domov svadba " +
      "narodeniny batoľa tínedžer hosť sused priateľ svokra svokor švagor švagriná",
  },
  {
    id: "feelings",
    name: "Pocity",
    words:
      "radosť láska nádej strach hnev hrdosť hanba starosť smútok žiaľ závisť pokoj mier úľava prekvapenie " +
      "potešenie údiv dôvera pochybnosť nuda odvaha láskavosť trpezlivosť vďačnosť šťastie smiech úsmev slza " +
      "objatie útecha nálada zlosť nadšenie zvedavosť túžba žiarlivosť ľútosť hrôza",
  },
  {
    id: "space",
    name: "Vesmír",
    words:
      "slnko mesiac hviezda planéta kométa meteor asteroid galaxia dráha raketa astronaut kozmonaut družica " +
      "ďalekohľad kráter zatmenie gravitácia vesmír kozmos hmlovina obloha noc svitanie súmrak raketoplán kabína " +
      "sonda mimozemšťan prach prstenec obzor súhvezdie hvezdáreň svetlo orbita skafander",
  },
  {
    id: "computers",
    name: "Počítače a telefóny",
    words:
      "počítač notebook tablet telefón mobil obrazovka klávesnica myš kábel nabíjačka batéria tlačidlo ikona " +
      "aplikácia súbor priečinok hra správa tlačiareň skener fotoaparát reproduktor slúchadlá mikrofón pamäť " +
      "stránka video fotka sieť signál aktualizácia robot čip dáta kód program kurzor pixel displej",
  },
  {
    id: "celebrations",
    name: "Oslavy",
    words:
      "oslava večierok narodeniny torta sviečka darček balón pohľadnica hosť pozvánka hudba tanec pieseň " +
      "prípitok hostina svadba stuha mašľa kostým maska sprievod ohňostroj festival sviatok výročie konfety " +
      "lampión girlanda transparent želanie potlesk výzdoba piknik hostiteľ ples fašiangy zábava jarmok hody",
  },
  {
    id: "camping",
    name: "Táborenie",
    words:
      "stan tábor oheň táborák baterka lucerna spacák karimatka mapa kompas lano nôž kotlík hrniec varič zápalka " +
      "sekera drevo poleno palica batoh chodník túra rieka jazero les hviezda mesiac sova komár repelent deka " +
      "hamaka kanoe píšťalka opekačka špekáčik slanina ešus plachta",
  },
  {
    id: "river",
    name: "Pri rieke",
    words:
      "rieka potok breh most kompa loďka plť kanoe veslo pádlo ryba pstruh kapor šťuka žaba kačica labuť vydra " +
      "bobor trstina vŕba mlyn hrádza jez ostrov prúd vlnka kamienok kameň piesok bahno prút udica sieť háčik " +
      "návnada rybár volavka vážka sumec",
  },
  {
    id: "time",
    name: "Čas",
    words:
      "sekunda minúta hodina deň týždeň mesiac rok desaťročie storočie ráno poludnie popoludnie večer noc polnoc " +
      "svitanie súmrak dnešok zajtrajšok včerajšok hodiny hodinky kalendár dátum obdobie jar leto jeseň zima " +
      "víkend narodeniny okamih chvíľa budúcnosť minulosť prítomnosť budík stopky",
  },
  {
    id: "herbs",
    name: "Bylinky a koreniny",
    words:
      "soľ korenie mäta bazalka tymián šalvia kôpor petržlen pažítka rozmarín oregano cesnak zázvor škorica " +
      "klinček vanilka šafran paprika rasca fenikel čili karí horčica aníz ligurček majorán estragón koriander " +
      "kardamón kurkuma harmanček žihľava medovka lipa skorocel nechtík",
  },
];

// Tajničky: what the letters left over spell, read row by row, once every word is found. Traditional proverbs, and
// short cheers for the smallest grids.
export const MESSAGES = [
  "Výborne",
  "Bravo",
  "Pekný deň",
  "Dobrú noc",
  "Hotovo",
  "Ide to ako po masle",
  "Veľa zdaru",
  "Len tak ďalej",
  "Skvelá práca",
  "Dobrú chuť",
  "Ostrý zrak",
  "Tak sa to robí",
  "Kto hľadá, nájde",
  "Lož má krátke nohy",
  "Aký otec, taký syn",
  "Vrana k vrane sadá",
  "Dobrá rada nad zlato",
  "Pomaly ďalej zájdeš",
  "Mýliť sa je ľudské",
  "Sýty hladnému neverí",
  "Všetkého veľa škodí",
  "Aká práca, taká pláca",
  "Ráno je múdrejšie večera",
  "Zvyk je železná košeľa",
  "Aj na slnku sú škvrny",
  "Tichá voda brehy myje",
  "Kto šetrí, má za tri",
  "Hlad je najlepší kuchár",
  "Priateľa poznáš v núdzi",
  "Veselá myseľ, pol zdravia",
  "Bez práce nie sú koláče",
  "Kto si počká, ten sa dočká",
  "Kde je vôľa, tam je cesta",
  "Nekupuj mačku vo vreci",
  "Dvakrát meraj, raz strihaj",
  "Ranná hodina, zlatá hodina",
  "Trpezlivosť ruže prináša",
  "Všade dobre, doma najlepšie",
  "Čo oko nevidí, srdce nebolí",
  "Nehovor hop, kým nepreskočíš",
  "Opakovanie je matka múdrosti",
  "Všetko zlé je na niečo dobré",
  "Kto nič nerobí, nič nepokazí",
  "Zdravie je najväčšie bohatstvo",
  "Komu sa nelení, tomu sa zelení",
  "Jablko nepadá ďaleko od stromu",
  "Kto neskôr chodí, sám sebe škodí",
  "Darovanému koňovi na zuby nehľaď",
  "Nie je všetko zlato, čo sa blyští",
  "Kde sa dvaja bijú, tretí sa smeje",
  "Kto inému jamu kope, sám do nej padne",
  "Dobré slovo aj železné dvere otvorí",
  "Ako sa do hory volá, tak sa z hory ozýva",
  "Lepší vrabec v hrsti ako holub na streche",
  "Čo môžeš urobiť dnes, neodkladaj na zajtra",
  "Kto sa smeje naposledy, ten sa smeje najlepšie",
];
