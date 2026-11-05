// Word Search's themes in English: an id shared with the Slovak themes, a name, and the theme's words, common nouns
// of 3 to 12 letters, separated by spaces. The hidden messages are traditional sayings and short cheers.
//
// Written for this game. The themes and messages in js/data/ are dedicated to the public domain under CC0 1.0
// (dev/README.md says more): anyone may copy, change and use them, for any purpose, without asking.

export const THEMES = [
  {
    id: "farm",
    name: "On the farm",
    words:
      "cow pig hen goat sheep horse duck goose lamb calf foal piglet chick rooster donkey turkey pony barn stable " +
      "tractor hay straw field fence gate farmer trough milk egg wool orchard meadow haystack scarecrow pitchfork " +
      "harvest silo pasture",
  },
  {
    id: "wild",
    name: "Wild animals",
    words:
      "lion tiger bear wolf fox deer moose zebra giraffe elephant monkey gorilla rhino hippo camel kangaroo koala " +
      "panda leopard cheetah jaguar badger beaver otter squirrel hedgehog rabbit hare bison buffalo lynx raccoon " +
      "antelope chimpanzee crocodile snake lizard boar",
  },
  {
    id: "birds",
    name: "Birds",
    words:
      "owl crow robin eagle hawk swan stork heron swallow sparrow parrot pigeon dove wren finch magpie falcon gull " +
      "puffin penguin ostrich peacock pelican flamingo woodpecker nightingale cuckoo blackbird kingfisher lark jay " +
      "raven starling vulture nest feather beak wing",
  },
  {
    id: "creatures",
    name: "Small creatures",
    words:
      "ant bee wasp fly moth beetle butterfly caterpillar cricket grasshopper dragonfly mosquito spider snail slug " +
      "worm flea termite firefly hornet cocoon larva web hive honey antenna centipede millipede scorpion aphid " +
      "cicada gnat tick bumblebee",
  },
  {
    id: "sea",
    name: "The sea",
    words:
      "wave tide shell crab fish whale shark dolphin seal octopus squid jellyfish starfish lobster shrimp oyster " +
      "mussel coral reef seaweed anchor ship boat sail lighthouse island beach sand pearl current ocean diver net " +
      "buoy tuna cod eel walrus turtle",
  },
  {
    id: "fruit",
    name: "Fruit",
    words:
      "apple pear plum cherry peach apricot grape banana orange lemon lime melon watermelon kiwi mango pineapple " +
      "strawberry raspberry blueberry blackberry currant gooseberry fig date coconut papaya quince nectarine " +
      "grapefruit cranberry pomegranate avocado tangerine olive",
  },
  {
    id: "vegetables",
    name: "Vegetables",
    words:
      "carrot potato onion garlic leek cabbage lettuce spinach pea bean corn pepper tomato cucumber pumpkin radish " +
      "beetroot turnip celery broccoli cauliflower kale asparagus artichoke lentil chickpea squash mushroom sprout " +
      "kohlrabi parsnip shallot rhubarb gherkin",
  },
  {
    id: "kitchen",
    name: "In the kitchen",
    words:
      "pan pot lid cup mug bowl plate fork knife spoon ladle whisk kettle oven stove fridge freezer sink tap " +
      "toaster grater sieve jug glass tray apron napkin cupboard drawer shelf recipe timer scales blender colander " +
      "teapot cutlery",
  },
  {
    id: "food",
    name: "Food",
    words:
      "bread butter cheese egg soup salad rice pasta noodle pizza sandwich sausage ham bacon chicken steak fish " +
      "pancake porridge cereal toast jam honey sauce gravy stew pie dumpling roast salt sugar flour oil vinegar " +
      "mustard ketchup curry burger",
  },
  {
    id: "sweets",
    name: "Sweet things",
    words:
      "cake biscuit cookie candy sweet chocolate toffee fudge muffin cupcake waffle pudding custard cream icing " +
      "sugar jelly lollipop caramel marzipan meringue tart strudel sorbet dessert sprinkles syrup praline brownie " +
      "crumble trifle gingerbread bun pastry popcorn nougat",
  },
  {
    id: "cafe",
    name: "At the café",
    words:
      "coffee tea cocoa milk juice water lemonade espresso cup saucer spoon sugar cream menu bill tip waiter table " +
      "chair counter cake croissant bagel scone kettle foam bean mug straw ice terrace napkin tray",
  },
  {
    id: "home",
    name: "At home",
    words:
      "house room door window wall floor roof stairs hall kitchen bedroom bathroom attic cellar garage balcony " +
      "chimney sofa armchair table chair bed lamp rug carpet curtain mirror clock shelf cushion pillow blanket " +
      "wardrobe bookcase desk radiator fireplace doorbell key lock",
  },
  {
    id: "garden",
    name: "The garden",
    words:
      "spade rake hoe shed hose lawn grass hedge bush tree rose tulip daisy seed soil pot bucket compost mower " +
      "bench path pond fountain bird nest worm snail bee greenhouse wheelbarrow sprinkler weed bulb root leaf " +
      "fence gnome swing sunflower",
  },
  {
    id: "forest",
    name: "The forest",
    words:
      "tree oak pine birch beech maple willow fir spruce larch ash elm alder branch twig leaf bark root trunk " +
      "moss fern mushroom acorn cone log stump path clearing deer fox owl woodpecker squirrel berry ivy thicket",
  },
  {
    id: "flowers",
    name: "Flowers",
    words:
      "rose tulip daisy lily iris poppy violet orchid lilac lavender daffodil crocus snowdrop sunflower dandelion " +
      "clover peony carnation marigold pansy cornflower bluebell primrose jasmine magnolia heather petal stem bud " +
      "bloom pollen bouquet vase",
  },
  {
    id: "weather",
    name: "Weather",
    words:
      "sun rain snow wind cloud fog mist frost ice hail storm thunder lightning rainbow breeze gale drizzle shower " +
      "puddle sleet blizzard heat drought flood umbrella forecast sunshine temperature degree sky dew haze gust " +
      "snowflake cold warmth",
  },
  {
    id: "winter",
    name: "Winter",
    words:
      "snow ice frost sled ski skate snowman scarf glove mitten hat coat boots fireplace cocoa blanket icicle " +
      "snowball blizzard chill cold hockey rink igloo candle sleigh reindeer pine holly shovel chimney slush thaw " +
      "snowflake",
  },
  {
    id: "summer",
    name: "Summer",
    words:
      "sun beach sand sea wave holiday picnic tent lemonade sunglasses swimsuit towel shade heat sunburn " +
      "watermelon strawberry barbecue camp lake pool float bucket spade shell kite sandal hat fan breeze island " +
      "boat festival sunset butterfly cherry vacation",
  },
  {
    id: "landscape",
    name: "Landscape",
    words:
      "hill valley river lake stream field meadow mountain peak cliff cave rock stone island coast shore bay " +
      "desert dune forest wood swamp marsh pond waterfall canyon plain volcano glacier ridge slope spring brook " +
      "gorge plateau horizon path",
  },
  {
    id: "mountains",
    name: "Mountains",
    words:
      "peak summit ridge slope cliff rock boulder cave glacier snow avalanche pass valley cabin hut trail path " +
      "rope boot backpack map compass climber guide tent eagle goat marmot pine waterfall lake view altitude ice " +
      "helmet stream chalet",
  },
  {
    id: "sports",
    name: "Sports",
    words:
      "football tennis golf hockey rugby cricket boxing cycling rowing sailing skiing swimming running judo karate " +
      "archery fencing diving surfing climbing skating ball goal net racket bat team coach match race medal score " +
      "referee stadium player winner volleyball basketball",
  },
  {
    id: "games",
    name: "Games and toys",
    words:
      "doll ball kite puzzle chess cards dice domino marble robot teddy train blocks drum whistle balloon puppet " +
      "swing slide rope hoop pawn king queen knight bishop castle rook game toy maze riddle quiz jigsaw rattle " +
      "skittles",
  },
  {
    id: "jobs",
    name: "Jobs",
    words:
      "baker butcher cook chef doctor nurse dentist vet farmer teacher pilot driver sailor soldier firefighter " +
      "plumber builder painter writer singer actor dancer judge lawyer banker clerk waiter cleaner gardener tailor " +
      "barber hairdresser carpenter electrician engineer scientist librarian miner artist nanny",
  },
  {
    id: "body",
    name: "The body",
    words:
      "head hair face eye ear nose mouth lip tongue tooth chin cheek neck shoulder arm elbow wrist hand finger " +
      "thumb nail chest back belly hip leg knee ankle foot heel toe skin bone heart lung brain muscle eyebrow " +
      "forehead stomach",
  },
  {
    id: "health",
    name: "At the doctor's",
    words:
      "doctor nurse patient medicine pill tablet syrup bandage plaster injection vaccine fever cough cold flu " +
      "sneeze rash thermometer stethoscope clinic hospital ambulance pharmacy prescription crutch wheelchair " +
      "health rest vitamin tissue appointment scar wound dose",
  },
  {
    id: "clothes",
    name: "Clothes",
    words:
      "shirt blouse skirt dress trousers jeans shorts coat jacket sweater jumper scarf hat cap glove sock shoe " +
      "boot sandal slipper belt tie vest suit uniform hood button zip pocket collar sleeve apron cardigan raincoat " +
      "tights swimsuit overalls",
  },
  {
    id: "travel",
    name: "Travel",
    words:
      "trip journey holiday ticket passport visa suitcase bag backpack map guide hotel hostel camp tent airport " +
      "flight plane train station platform bus ferry cruise port border customs luggage souvenir postcard photo " +
      "camera tourist route compass timetable booking delay",
  },
  {
    id: "transport",
    name: "Getting around",
    words:
      "car bus tram train taxi bicycle scooter motorbike lorry truck van coach ship boat ferry yacht canoe kayak " +
      "raft plane helicopter rocket balloon tractor ambulance metro wheel engine road bridge tunnel track garage " +
      "bike trailer",
  },
  {
    id: "town",
    name: "In town",
    words:
      "street road square park bridge tower church castle museum cinema library school hospital bank shop market " +
      "bakery cafe hotel station office factory fountain statue bench crossing pavement corner district gallery " +
      "zoo pharmacy stadium playground port monument",
  },
  {
    id: "shopping",
    name: "Shopping",
    words:
      "shop store market stall basket trolley bag receipt price sale discount cashier till queue counter shelf " +
      "aisle coin wallet purse change label brand bargain gift customer seller size mirror order delivery parcel " +
      "list bakery butcher florist cart",
  },
  {
    id: "school",
    name: "At school",
    words:
      "pupil teacher class lesson desk chair board chalk pen pencil eraser ruler book notebook page homework test " +
      "exam mark grade map globe bag break bell gym library timetable subject history science art music geography " +
      "reading writing spelling playground",
  },
  {
    id: "office",
    name: "At the office",
    words:
      "desk chair computer screen keyboard mouse printer paper folder file stapler clip pen envelope stamp letter " +
      "phone meeting report boss colleague deadline calendar diary memo label scissors tape glue drawer cabinet " +
      "lamp notice budget invoice schedule copier",
  },
  {
    id: "music",
    name: "Music",
    words:
      "song tune note chord choir band piano guitar violin cello flute drum trumpet horn harp organ banjo " +
      "accordion clarinet oboe tuba saxophone harmonica bass melody rhythm beat tempo singer concert opera " +
      "orchestra conductor stage ballad lullaby anthem record radio microphone",
  },
  {
    id: "art",
    name: "Art and craft",
    words:
      "paint brush canvas easel palette pencil crayon chalk ink clay pottery statue sculpture frame portrait " +
      "sketch drawing collage mosaic needle thread wool yarn knitting glue scissors paper card gallery museum " +
      "artist studio design pattern shade embroidery lace",
  },
  {
    id: "books",
    name: "Books",
    words:
      "book page cover chapter story novel poem tale fable myth legend author writer poet reader title hero plot " +
      "ending library shelf bookmark diary letter comic atlas dictionary magazine newspaper sentence word verse " +
      "rhyme index spine print publisher bookshop",
  },
  {
    id: "tools",
    name: "In the workshop",
    words:
      "hammer nail screw bolt nut saw drill file chisel wrench spanner pliers tape ruler level ladder glue " +
      "sandpaper paint brush bench vice clamp axe knife hook hinge wire plank timber toolbox workshop helmet " +
      "gloves sawdust shovel bucket screwdriver",
  },
  {
    id: "shapes",
    name: "Shapes",
    words:
      "circle square triangle rectangle oval cube sphere cylinder cone pyramid prism hexagon pentagon octagon " +
      "star heart arc spiral diamond rhombus line point dot angle side edge corner curve radius diameter axis grid " +
      "pattern ring cross semicircle diagonal ellipse",
  },
  {
    id: "family",
    name: "Family",
    words:
      "mother father parent son daughter child baby brother sister twin aunt uncle cousin niece nephew grandma " +
      "grandpa grandson wife husband bride groom family home wedding birthday relative toddler teenager adult " +
      "nanny guest friend grandchild",
  },
  {
    id: "feelings",
    name: "Feelings",
    words:
      "joy love hope fear anger pride shame worry sorrow grief envy calm peace relief surprise delight wonder " +
      "trust doubt boredom courage kindness patience gratitude happiness sadness laughter smile tear hug comfort " +
      "mood temper excitement curiosity longing jealousy",
  },
  {
    id: "space",
    name: "Space",
    words:
      "sun moon star planet comet meteor asteroid galaxy orbit rocket astronaut satellite telescope crater eclipse " +
      "gravity universe cosmos nebula sky night dawn dusk shuttle capsule alien probe light dust ring horizon " +
      "observatory spacesuit",
  },
  {
    id: "computers",
    name: "Computers and phones",
    words:
      "computer laptop tablet phone screen keyboard mouse cable charger battery button icon app file folder game " +
      "email message printer scanner camera speaker headphones microphone memory website video photo network " +
      "signal router update robot chip data code program cursor pixel",
  },
  {
    id: "celebrations",
    name: "Celebrations",
    words:
      "party birthday cake candle gift present balloon card guest invitation music dance song feast wedding " +
      "ribbon bow costume mask parade firework festival holiday anniversary confetti lantern garland banner wish " +
      "cheer applause decoration picnic host celebration",
  },
  {
    id: "camping",
    name: "Camping",
    words:
      "tent camp fire campfire torch lantern mat map compass rope knife kettle pot stove match axe wood log stick " +
      "backpack boots trail hike river lake forest star moon owl blanket hammock canoe whistle marshmallow " +
      "sausage flashlight",
  },
  {
    id: "river",
    name: "By the river",
    words:
      "river stream brook bank bridge ferry boat raft canoe oar paddle fish trout carp pike frog duck swan otter " +
      "beaver reed willow mill dam weir island current ripple pebble stone sand mud rod net hook bait angler " +
      "heron dragonfly catfish",
  },
  {
    id: "time",
    name: "Time",
    words:
      "second minute hour day week month year decade century morning noon afternoon evening night midnight dawn " +
      "dusk today tomorrow yesterday clock watch calendar date season spring summer autumn winter weekend " +
      "birthday moment future past present alarm timer hourglass",
  },
  {
    id: "herbs",
    name: "Herbs and spices",
    words:
      "salt pepper mint basil thyme sage dill parsley chive rosemary oregano garlic ginger cinnamon nutmeg clove " +
      "vanilla saffron paprika cumin caraway fennel curry mustard anise lovage marjoram tarragon coriander " +
      "cardamom turmeric chamomile nettle",
  },
];

// Hidden messages: what the letters left over spell, read row by row, once every word is found. Traditional
// sayings, and short cheers for the smallest grids.
export const MESSAGES = [
  "Well done",
  "Good job",
  "Nice work",
  "Keep going",
  "You did it",
  "Great find",
  "Sharp eyes",
  "Eagle eyes",
  "Bravo",
  "Splendid",
  "Top marks",
  "Brilliant",
  "Superb work",
  "Happy days",
  "Carry on",
  "Hats off",
  "Enjoy the day",
  "Stay curious",
  "Sweet dreams",
  "Have a nice day",
  "Time flies",
  "Easy does it",
  "Home sweet home",
  "Little by little",
  "Hope for the best",
  "Waste not want not",
  "No news is good news",
  "Look before you leap",
  "Knowledge is power",
  "Patience is a virtue",
  "Seeing is believing",
  "Every dog has its day",
  "Still waters run deep",
  "Practice makes perfect",
  "Better late than never",
  "Well begun is half done",
  "Out of sight out of mind",
  "Measure twice cut once",
  "Great minds think alike",
  "All is well that ends well",
  "Honesty is the best policy",
  "Many hands make light work",
  "A stitch in time saves nine",
  "There is no place like home",
  "Slow and steady wins the race",
  "Two heads are better than one",
  "Every cloud has a silver lining",
  "The early bird catches the worm",
  "Laughter is the best medicine",
  "The best things in life are free",
  "Actions speak louder than words",
  "A friend in need is a friend indeed",
  "Where there is a will there is a way",
  "An apple a day keeps the doctor away",
  "Necessity is the mother of invention",
  "Birds of a feather flock together",
  "Do not count your chickens before they hatch",
  "Every journey begins with a single step",
];
