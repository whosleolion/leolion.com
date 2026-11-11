// Sub-libraries added from Leo's notes: clothes, animals, plants, explosives, fees, hired help, headwear.
// Prices are original estimates in the fantasy economy (1 bu = 1 cp), flagged "derived" by the 'derived' tag.
// Row: "name ; price ; unit ; extra tags ; aliases". Price: "3gp", "5sp", "2cp".
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseP = t => { const m = /^([\d.,]+)\s*(cp|sp|ep|gp|pp)$/i.exec(t.trim()); if (!m) throw new Error('bad price ' + t); return Math.round(parseFloat(m[1].replace(/,/g, '')) * { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 }[m[2].toLowerCase()]); };
function L(kind, group, tags, list, extra = {}) {
  return list.map(line => {
    const [name, price, unit, more, aliases] = line.split(';').map(x => x.trim());
    return {
      id: kind + '.l-' + slug(name), name, kind, src: 'core', bu: parseP(price), unit: unit || 'each',
      tags: [...tags, 'derived', ...(more ? more.split(/\s+/) : [])], aliases: aliases ? aliases.split(',').map(x => x.trim()).filter(Boolean) : [],
      spread: 0.2, library: group, ...extra,
    };
  });
}
export const LIBRARIES = {
  clothes: 'Clothes', animals: 'Animals', plants: 'Plants', explosives: 'Explosives', fees: 'Fees and tolls', hired: 'Hired help', headwear: 'Hats and crowns',
};
export const libraryEntries = [
  ...L('good', 'clothes', ['clothing', 'crafted'], [
    'Shirt;5sp;;;tunic shirt, blouse', 'Trousers;6sp;;;pants, breeches', 'Shoes;4sp;;footwear;shoe, sandals, slippers',
    'Gloves;1gp;;;glove', 'Hooded cloak;2gp;;;hood cloak', 'Belt;3sp;;;sash',
    'Socks;1sp;;;stockings, sock', 'Skirt;4sp', 'Vest;5sp;;;waistcoat', 'Jacket;2gp;;;jerkin', 'Apron;3sp', 'Scarf;3sp;;;shawl', 'Mittens;4sp', 'Nightgown;4sp;;;nightshirt', 'Cowl;5sp;;;hood', 'Leather jerkin;3gp', 'Wedding dress;40gp;;luxury;bridal gown', 'Fur coat;60gp;;luxury;fur', 'Silk shirt;10gp;;luxury', 'Flat cap;3sp', 'Uniform;4gp;;;livery', 'Finery;15gp;;luxury;fancy clothes, formal wear, noble clothes', 'Hat;5sp;;;bonnet, beret',
  ]),
  ...L('good', 'headwear', ['jewelry', 'crafted', 'luxury'], [
    'Crown;1000gp;;gold;royal crown', 'Diadem;250gp;;gold;tiara', 'Circlet;80gp;;;headband jewel', 'Coronet;400gp;;gold;noble crown',
  ]),
  ...L('good', 'animals', ['animal', 'living'], [
    'Rooster;2sp;;livestock;cock, cockerel', 'Hen;3sp;;livestock;hens', 'Duck;4sp;;livestock;geese, goose',
    'Rabbit;2sp;;livestock;bunny', 'Cat;1gp;;pet;kitten', 'Ram;4gp;;livestock;', 'Hawk;40gp;;trained;falcon, trained hawk', 'Rat;2sp;;wild', 'Mouse;1sp;;wild', 'Squirrel;3sp;;wild', 'Fox;3gp;;wild', 'Deer;8gp;;wild;stag, doe', 'Boar;6gp;;wild;wild pig', 'Bear cub;50gp;;wild', 'Owl;12gp;;wild', 'Ox;15gp;;livestock;oxen', 'Turkey;3sp;;livestock', 'Lamb;1gp;;livestock', 'Calf;5gp;;livestock', 'Puppy;3gp;;pet', 'Parrot;20gp;;pet;talking bird', 'Raven;5gp;;pet;crow', 'Ferret;5gp;;pet', 'Pigeon;2sp;;livestock;messenger pigeon, dove', 'Bee hive;5gp;;livestock;beehive, bees', 'Hunting dog;25gp;;trained;watchdog', 'War dog;50gp;;trained', 'Songbird;1gp;;pet;canary, finch', 'Tortoise;3gp;;pet;turtle', 'Snake;3gp;;pet;pet snake', 'Frog;1sp;;pet', 'Giant spider;200gp;;exotic', 'Dire wolf pup;300gp;;exotic',
  ]),
  ...L('good', 'plants', ['plant', 'raw'], [
    'Seeds;1cp;;;seed, seed packet, packet of seeds', 'Sapling;5sp;;;young tree, seedling', 'Herb bundle;2sp;;;herbs, bundle of herbs',
    'Flowers;1sp;;;bouquet, bunch of flowers', 'Rare flower;8gp;;;orchid', 'Rose bush;5sp;;;roses, rosebush', 'Apple tree;2gp;;;fruit tree', 'Oak sapling;1sp', 'Wheat seed;2cp;;;grain seed', 'Pumpkin;3cp', 'Bag of grain;5sp;;;sack of grain', 'Vegetable seeds;2cp;;;garden seeds', 'Vines;1gp;;;grapevine', 'Moss;1cp;;;lichen', 'Mushrooms;2sp;;;fungus, toadstool', 'Garlic;2cp', 'Poison ivy;5sp;;;nettles', 'Healing moss;5gp;;;moonmoss', 'Mandrake root;25gp;;;mandrake', 'Nightshade;8gp;;;belladonna', 'Lotus;12gp;;;lotus flower', 'Potted herb;1sp;;;herb pot', 'Tulip bulbs;4cp;;;bulbs', 'Hay bale;3cp;;;hay', 'Firewood;1cp;lb;;wood, logs', 'Tobacco;4sp;lb;;pipe weed, leaf',
  ]),
  ...L('good', 'explosives', ['weapon', 'volatile', 'alchemical'], [
    'Firecracker;2cp;;;fireworks, bang snap', 'Smoke bomb;5gp;;;smoke pellet', 'Alchemist fire flask;50gp;;;fire bomb, flask of fire',
    'Bomb;80gp;;explosive;grenade, explosive, powder keg bomb', 'Powder keg;350gp;;explosive;keg of powder, black powder', 'Demolition charge;250gp;;explosive;breaching charge, dynamite',
  ]),
  ...L('good', 'plants', ['medicine', 'crafted'], ['Toe cream;3sp;;;foot cream, foot salve, foot ointment']),
  ...L('good', 'gear', ['tool', 'crafted'], ['Fire kit;1gp;;;firestarter kit, flint and steel kit']),
  ...L('service', 'fees', ['fee'], [
    'Toll;2cp;;;road toll, bridge toll, tolls', 'City gate fee;1sp;;;gate fee, entry fee, gate tax', 'Permit;5gp;;;license, licence, trade permit',
    'Docking fee;5sp;day;;berth fee, port fee, mooring fee', 'Stabling fee;5cp;day;;stable fee', 'Bribe;10gp;;;grease, palm grease',
    'Tax;1gp;;;levy, duty, fee, fees',
  ]),
  ...L('labor', 'hired', ['labor', 'service'], [
    'Stylist;1gp;;;hairdresser, barber, hair stylist', 'Haircut;5cp;;;trim, hair cut', 'Tailor;2gp;day;skilled;seamstress, dressmaker, qualified tailor',
    'Assassin;300gp;;dangerous;hitman, hit man, hired killer, contract killer', 'Minion;1sp;day;;lackey, henchman, flunky, goon',
  ]),
];

// ---- modern list additions: typical US prices in dollars, around 2025 (stored as cents) ----
const usd = n => Math.round(n * 100);
function M(kind, group, tags, list) {
  return list.map(line => {
    const [name, price, unit, more, aliases] = line.split(';').map(x => x.trim());
    return { id: kind + '.m-' + slug(name), name, kind, src: 'modern', bu: usd(parseFloat(price)), unit: unit || 'each', tags: [...tags, 'derived', ...(more ? more.split(/\s+/) : [])], aliases: aliases ? aliases.split(',').map(x => x.trim()).filter(Boolean) : [], spread: 0.25, library: group };
  });
}
export const modernLibrary = [
  ...M('good', 'clothes', ['clothing', 'crafted'], [
    'T-shirt;15;;;t shirt, tee, shirt', 'Dress shirt;40', 'Dress;60;;;gown', 'Hat;20;;;cap', 'Socks;12;;;sock', 'Gloves;20;;;glove', 'Work boots;120;;;boots, boot', 'Dress shoes;90', 'Sandals;25', 'Sweater;55;;;jumper, pullover', 'Hoodie;45;;;sweatshirt', 'Shorts;28', 'Skirt;35', 'Tuxedo;450;;;tux', 'Wedding dress;1500;;;bridal gown', 'Underwear;12;;;boxers, briefs', 'Pajamas;30;;;pjs', 'Scarf;22', 'Belt;28', 'Raincoat;60;;;rain jacket', 'Leather jacket;220', 'Swimsuit;40;;;bathing suit', 'Baseball cap;22', 'Beanie;18;;;winter hat', 'Sunglasses;30;;;shades', 'Necktie;25;;;tie', 'Uniform;55;;;scrubs', 'Running shoes;95', 'Heels;80;;;high heels',
  ]),
  ...M('good', 'bedding', ['household', 'crafted'], ['Blanket;25;;;throw blanket, blankets', 'Wool blanket;70', 'Pillow;18', 'Bed sheets;40;;;sheets']),
  ...M('good', 'care', ['medicine', 'crafted'], ['Foot cream;9;;;toe cream, heel cream', 'Hand lotion;7;;;lotion', 'Sunscreen;12']),
  ...M('good', 'gear', ['tool', 'crafted'], ['Fire starter kit;15;;;fire kit, firestarter', 'Camping stove;35', 'Flashlight;15;;;torch']),
  ...M('good', 'plants', ['plant', 'raw'], ['Seed packet;3;;;seeds, seed', 'Potted plant;20;;;houseplant', 'Sapling;25;;;seedling', 'Flower bouquet;30;;;flowers, bouquet', 'Rose bush;22', 'Fruit tree;45;;;apple tree, lemon tree', 'Succulent;8;;;cactus', 'Orchid;30', 'Bag of potting soil;9;;;soil, potting soil', 'Fertilizer;14;;;plant food', 'Christmas tree;75;;;pine tree, xmas tree', 'Sod roll;7;;;turf', 'Mulch bag;6;;;mulch', 'Bulb pack;8;;;tulip bulbs, bulbs', 'Garden seeds;4;;;vegetable seeds', 'Houseplant, large;90;;;fiddle leaf fig, large plant', 'Hanging basket;28']),
  ...M('good', 'animals', ['animal', 'living'], ['Chicken;12;;livestock;hen, rooster', 'Sheep;250;;livestock', 'Goat;300;;livestock', 'Cow;1800;;livestock', 'Horse;3500;;livestock;pony', 'Adopted dog;300;;pet;dog, puppy', 'Adopted cat;150;;pet;cat, kitten', 'Purebred puppy;2200;;pet;purebred dog', 'Hamster;25;;pet;gerbil', 'Goldfish;3;;pet;fish', 'Parakeet;35;;pet;budgie', 'Rabbit;45;;pet;bunny', 'Turtle;40;;pet', 'Pig;350;;livestock;hog', 'Duck;15;;livestock', 'Turkey;60;;livestock', 'Donkey;800;;livestock', 'Alpaca;1800;;livestock', 'Beehive;250;;livestock', 'Racehorse;50000', 'Snake;80;;pet;pet snake, python', 'Bearded dragon;90;;pet;lizard']),
  ...M('good', 'explosives', ['weapon', 'volatile'], ['Firecrackers;10;;;fireworks, firecracker', 'Fireworks box;80']),
  ...M('good', 'paper', ['household'], ['Printer paper;8;;;ream of paper', 'Notebook;4;;;notepad']),
  ...M('service', 'fees', ['fee'], ['Parking fee;20', 'Business permit;75;;;permit, license, licence', 'Late fee;35']),
  ...M('labor', 'hired', ['labor', 'service'], ['Tailoring job;25;;;tailor, alterations, hemming', 'Hair coloring;120;;;stylist, hair color', 'Tour guide;200;day;;guide']),
];

export const modernWorld = [
  ...M('good', 'knives', ['weapon', 'manufactured', 'metal', 'knife'], [
    'Kitchen knife;30;;;chef knife, chefs knife, cooking knife', 'Steak knife set;40;;;steak knives', 'Swiss army knife;35;;;multitool knife, penknife', 'Hunting knife;60', 'Combat knife;120;;;tactical knife, fighting knife', 'Survival knife;80;;;bushcraft knife',
    'Switchblade;25;;;flick knife, automatic knife', 'Butterfly knife;30;;;balisong', 'Machete;30;;;bush knife', 'Utility knife;8;;;box cutter, razor knife', 'Straight razor;60;;;cut-throat razor, barber razor', 'Throwing knives;40;;;throwing knife set',
    'Cleaver;25;;;meat cleaver', 'Hatchet;30;;;hand axe', 'Splitting axe;50;;;felling axe, axe', 'Katana;150;;;samurai sword, replica sword', 'Scissors;10;;;shears',
  ]),
  ...M('good', 'weapons', ['weapon', 'manufactured', 'metal'], [
    'Revolver;550', 'Shotgun;450;;;pump shotgun, scattergun', 'Semi-automatic rifle;900;;;assault rifle, ar-15', 'Air rifle;60;;;bb gun, pellet gun', 'Ammunition box;25;;;ammo, bullets, box of ammo', 'Taser;200;;;stun gun',
    'Pepper spray;15', 'Baseball bat;40;;;bat', 'Crowbar;25;;;pry bar', 'Brass knuckles;20;;;knuckledusters', 'Handcuffs;25;;;cuffs', 'Compound bow;400;;;hunting bow', 'Crossbow;350', 'Archery set;80;;;target bow', 'Slingshot;12;;;catapult',
    'Body armor plate;300;;armor;armor plate, ballistic plate', 'Gun safe;300;;;safe', 'Fake gun;20;;;prop gun, toy gun, replica pistol',
  ]),
  ...M('good', 'animals', ['animal', 'living'], [
    'Piglet;120;;livestock', 'Lamb;200;;livestock', 'Calf;600;;livestock;', 'Goose;30;;livestock', 'Cockatiel;120;;pet;', 'Guinea pig;40;;pet', 'Ferret;150;;pet', 'Chinchilla;200;;pet', 'Pet rat;20;;pet;rat, fancy rat', 'Hedgehog;150;;pet',
    'Tarantula;40;;pet;spider', 'Koi fish;60;;pet;koi', 'Betta fish;15;;pet;', 'Aquarium fish;8;;pet', 'Tortoise;300;;pet', 'Gecko;60;;pet;leopard gecko', 'Working dog;1500;;trained;sheepdog, herding dog', 'Guard dog;5000;;trained;protection dog, attack dog',
    'Service dog;15000;;trained;guide dog, seeing eye dog', 'Police dog;12000;;trained;k9, k-9', 'Honeybee colony;200;;livestock;bees, bee colony', 'Llama;2000;;livestock', 'Mule;1800;;livestock', 'Falcon;2500;;trained;trained falcon, hawk', 'Parrot;1500;;pet;macaw', 'Cat, purebred;1200;;pet;purebred cat, siamese, persian',
    'Dog, stray adoption;120;;pet;shelter dog, rescue dog',
  ]),
  ...M('good', 'plants', ['plant', 'raw'], [
    'Tomato plant;5;;;tomato seedling', 'Herb plant;4;;;basil plant, herbs, potted herb', 'Lawn seed;25;;;grass seed', 'Bonsai tree;60;;;bonsai', 'Venus flytrap;10;;;flytrap', 'Palm tree;150;;;palm', 'Mature tree, installed;800;;;tree installation, large tree', 'Pumpkin;5',
    'Dozen roses;60;;;roses, cut roses, dozen red roses', 'Hay bale;8;;;hay', 'Firewood cord;300;;;cord of wood, firewood', 'Bamboo;25;;;bamboo plant', 'Cactus, large;50;;;saguaro', 'Wreath;40;;;holiday wreath', 'Sunflower seeds;3;;;birdseed', 'Hops;15;;;hop plant',
  ]),
  ...M('good', 'household', ['household', 'manufactured'], [
    'Hammer;15;;;claw hammer', 'Screwdriver set;20', 'Cordless drill;90;;;power drill, drill', 'Circular saw;120;;;power saw', 'Wrench set;40;;;spanner set, wrenches', 'Ladder;90', 'Shovel;30;;;spade', 'Paracord;15;;;nylon rope, cord, rope',
    'Duct tape;6;;;gaffer tape', 'Tarp;15;;;tarpaulin', 'Tent;120;;;camping tent', 'Sleeping bag;70', 'Backpack;60;;;rucksack, knapsack', 'Lightbulb;4;;;light bulb', 'Batteries pack;12;;;batteries, aa batteries', 'Padlock;20;;;lock',
    'Smoke detector;25;;;smoke alarm', 'Fire extinguisher;35', 'First aid kit;25;;;medkit, first-aid kit', 'Umbrella;20;;;brolly', 'Candles;12;;;candle', 'Toilet paper pack;18;;;toilet paper, loo roll', 'Soap;4;;;bar of soap', 'Toothbrush;4',
    'Microwave;100;;;microwave oven', 'Coffee maker;80;;;coffee machine', 'Toaster;30', 'Vacuum cleaner;180;;;vacuum, hoover', 'Washing machine;700;;;laundry machine', 'Air conditioner;350;;;ac unit', 'Space heater;50;;;heater', 'Alarm system;300;;;home security system, burglar alarm',
  ]),
  ...M('good', 'electronics', ['gadget', 'manufactured'], [
    'Tablet;400;;;ipad', 'Smartwatch;250;;;smart watch', 'Game console;450;;;playstation, xbox, console', 'Camera;600;;;digital camera, dslr', 'Drone;500;;;quadcopter', 'Bluetooth speaker;60;;;speaker', 'Power bank;30;;;portable charger', 'Phone charger;20;;;charger',
    'Router;80;;;wifi router', 'Printer;150', 'Monitor;200;;;computer monitor, screen', 'Keyboard;60', 'Walkie-talkie;40;;;walkie talkie, two-way radio, radio', 'Binoculars;80;;;field glasses', 'GPS unit;120;;;gps, satnav',
  ]),
  ...M('good', 'food', ['food'], [
    'Loaf of bread;4;;;bread', 'Gallon of milk;4;;;milk', 'Dozen eggs;4;;;eggs', 'Hamburger;6;;;cheeseburger', 'Hot dog;4', 'Bottled water;2;;;water bottle, water', 'Soda;2;;;pop, soft drink, cola', 'Candy bar;2;;;chocolate bar, candy', 'Ice cream;5;;;ice cream cone',
    'Bag of rice;12;;;rice', 'Block of cheese;6;;;cheese', 'Steak;18;;;steak dinner, ribeye', 'Bottle of whiskey;35;;;whiskey, whisky, liquor, bourbon', 'Cigar;12;;;cigars',
  ]),
  ...M('service', 'services', ['service'], [
    'Locksmith call;150;;;locksmith', 'Pest control visit;200;;;exterminator, pest control', 'Movers;800;day;;moving company, moving service', 'Notary stamp;15;;;notary', 'Storage unit;120;month;;storage locker', 'Tattoo;200;;;tattoo session',
    'Courier delivery;20;;;courier, delivery', 'Car repair;400;;;mechanic, auto repair', 'Oil change;80', 'Car wash;15', 'Vet visit;80;;;veterinarian, vet', 'Dog walking;25;;;dog walker', 'Pet boarding;45;day;;kennel, pet hotel', 'Dog grooming;70;;;pet grooming',
    'Speeding ticket;150;;;traffic ticket, traffic fine', 'Bail bond;1500;;;bail', 'Funeral flowers;120', 'Wedding photographer;2200;;;photographer', 'Dj for a night;600;;;dj, disc jockey', 'Plumbing call;180', 'Translator;60;day;;interpreter',
  ]),
  ...M('good', 'vehicles', ['vehicle', 'manufactured'], [
    'Electric scooter;400;;;e-scooter, scooter', 'Skateboard;100', 'Pickup truck;35000;;;pickup', 'Used car;12000;;;second-hand car, secondhand car', 'Boat;20000;;;motorboat, speedboat', 'Camper van;80000;;;rv, campervan, motorhome', 'Kayak;500;;;canoe', 'Electric bike;1500;;;e-bike', 'Moped;2000',
  ]),
];
