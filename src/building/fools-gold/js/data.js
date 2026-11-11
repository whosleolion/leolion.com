import { scifiEntries } from './scifi.js?v=92d0321e';
// Fool's Gold data: catalog, modifiers, economy tags, presets.
// All money is in Base Units (BU). 1 BU = 1 copper piece by default.
// SRD rows follow the 5e SRD 5.1 equipment tables (CC-BY-4.0). Verify before publishing.
// Everything marked src "core" is original to Fool's Gold.

export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, ' +
  'available under the Creative Commons Attribution 4.0 International License (CC-BY-4.0). ' +
  'All other numbers are original to Fool\'s Gold.';

const COIN = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
export function parsePrice(s) {
  if (typeof s === 'number') return s;
  let total = 0, any = false;
  String(s).replace(/([\d.,]+)\s*(pp|gp|ep|sp|cp)/gi, (_, n, c) => { total += parseFloat(n.replace(/,/g, '')) * COIN[c.toLowerCase()]; any = true; return ''; });
  if (!any) throw new Error('bad price: ' + s);
  return total;
}

export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Row: "name ; price ; unit ; extra tags ; alias, alias"
function rows(kind, src, baseTags, list, extra = {}) {
  return list.map(line => {
    const [name, price, unit, tags, aliases] = line.split(';').map(s => s.trim());
    return {
      id: kind + '.' + slug(name), name, kind, src,
      bu: parsePrice(price), unit: unit || 'each',
      tags: [...baseTags, ...(tags ? tags.split(/\s+/) : [])],
      aliases: aliases ? aliases.split(',').map(s => s.trim()).filter(Boolean) : [],
      ...extra,
    };
  });
}

const srdGoods = [
  ...rows('good', 'srd', ['weapon', 'manufactured', 'crafted', 'metal'], [
    'Club;1sp;;;', 'Dagger;2gp', 'Greatclub;2sp', 'Handaxe;5gp;;;hand axe', 'Javelin;5sp', 'Light hammer;2gp',
    'Mace;5gp', 'Quarterstaff;2sp;;;staff', 'Sickle;1gp', 'Spear;1gp', 'Light crossbow;25gp;;;', 'Dart;5cp',
    'Shortbow;25gp;;;short bow', 'Sling;1sp', 'Battleaxe;10gp;;;battle axe', 'Flail;10gp', 'Glaive;20gp', 'Greataxe;30gp;;;great axe',
    'Greatsword;50gp;;;great sword', 'Halberd;20gp', 'Lance;10gp', 'Longsword;15gp;;;long sword', 'Maul;10gp',
    'Morningstar;15gp;;;morning star', 'Pike;5gp', 'Rapier;25gp', 'Scimitar;25gp', 'Shortsword;10gp;;;short sword',
    'Trident;5gp', 'Warhammer;15gp;;;war hammer', 'Whip;2gp', 'Blowgun;10gp', 'Hand crossbow;75gp', 'Heavy crossbow;50gp',
    'Longbow;50gp;;;long bow', 'Arrow;5cp;;ammunition;arrows', 'Crossbow bolt;5cp;;ammunition;bolt',
  ]),
  ...rows('good', 'srd', ['armor', 'manufactured', 'crafted', 'metal'], [
    'Padded armor;5gp;;;padded', 'Leather armor;10gp;;;leather', 'Studded leather armor;45gp;;;studded leather', 'Hide armor;10gp;;;hide',
    'Chain shirt;50gp', 'Scale mail;50gp', 'Breastplate;400gp', 'Half plate;750gp;;;half plate armor', 'Ring mail;30gp',
    'Chain mail;75gp', 'Splint armor;200gp;;;splint', 'Plate armor;1500gp;;;plate, full plate', 'Shield;10gp',
  ]),
  ...rows('good', 'srd', ['gear', 'manufactured', 'tool'], [
    'Backpack;2gp', 'Bedroll;1gp', 'Blanket;5sp', 'Hemp rope;1gp;;;rope, hempen rope', 'Silk rope;10gp', 'Torch;1cp;;;torches',
    'Candle;1cp', 'Waterskin;2sp', 'Hooded lantern;5gp;;;lantern', 'Bullseye lantern;10gp', 'Oil flask;1sp;;;lamp oil, oil',
    "Healer's kit;5gp;;medicine;healers kit, medkit", 'Tent;2gp;;;two person tent', 'Crowbar;2gp', 'Grappling hook;2gp', 'Lock;10gp;;;padlock',
    'Manacles;2gp;;;shackles, handcuffs', 'Steel mirror;5gp;;;mirror', 'Ink bottle;10gp;;;ink', 'Paper sheet;2sp;;;paper', 'Parchment sheet;1sp;;;parchment',
    'Perfume vial;5gp;;luxury;perfume', 'Soap;2cp', 'Spyglass;1000gp;;luxury', 'Tinderbox;5sp', 'Whetstone;1cp', 'Iron chain;5gp;;metal;chain',
    'Hammer;1gp', "Miner's pick;2gp;;;pickaxe, pick", 'Shovel;2gp', 'Sack;1cp', 'Belt pouch;5sp;;;pouch', 'Glass vial;1gp;;;vial', 'Bell;1gp',
    'Ladder;1sp;;;ten foot ladder', 'Net;1gp', 'Caltrops;1gp', "Climber's kit;25gp;;;climbing kit", 'Fishing tackle;1gp',
    'Hourglass;25gp', 'Magnifying glass;100gp', 'Lamp;5sp', 'Signal whistle;5cp;;;whistle', 'Component pouch;25gp', 'Spellbook;50gp',
    "Thieves' tools;25gp;;;thieves tools, lockpicks", "Smith's tools;20gp;;;smiths tools", 'Lute;35gp;;instrument', 'Disguise kit;25gp',
    'Holy symbol;5gp;;;amulet', 'Arcane focus;10gp;;;crystal, orb', 'Pocket watch;40gp;;luxury;wristwatch', 'Newspaper;2cp;;newspaper;broadsheet',
  ]),
  ...rows('good', 'srd', ['clothing', 'textile', 'manufactured'], [
    'Common clothes;5sp;;;peasant clothes', "Traveler's clothes;2gp;;;travelers clothes", 'Fine clothes;15gp;;luxury;nice clothes, suit of clothes',
    'Costume;5gp', "Robes;1gp;;;robe", 'Cold weather cloak;1gp;;;cloak',
  ]),
  ...rows('good', 'srd', ['food', 'consumable'], [
    'Rations;5sp;;perday;ration, travel rations', 'Bread loaf;2cp;;;bread', 'Cheese wedge;1sp;;;cheese', 'Meat chunk;3sp;;;meat',
  ]),
  ...rows('good', 'srd', ['drink', 'food', 'consumable'], [
    'Ale mug;4cp;;;ale, beer, pint', 'Ale gallon;2sp;;;', 'Common wine;2sp;;;wine, wine pitcher', 'Fine wine;10gp;;luxury;fine wine bottle',
  ]),
  ...rows('good', 'srd', ['mount', 'animal', 'livestock'], [
    'Camel;50gp', 'Donkey;8gp;;;mule', 'Draft horse;50gp', 'Riding horse;75gp;;;horse', 'Warhorse;400gp;;;war horse', 'Pony;30gp',
    'Elephant;200gp', 'Mastiff;25gp;;;dog, guard dog',
  ]),
  ...rows('good', 'srd', ['livestock', 'animal'], ['Chicken;2cp', 'Cow;10gp;;;cattle', 'Goat;1gp', 'Pig;3gp', 'Sheep;2gp']),
  ...rows('good', 'srd', ['vehicle', 'gear'], [
    'Saddle;10gp;;;riding saddle', 'Cart;15gp', 'Wagon;35gp', 'Carriage;100gp', 'Sled;20gp', 'Rowboat;50gp', 'Keelboat;3000gp', 'Longship;10000gp',
    'Sailing ship;10000gp', 'Galley;30000gp', 'Warship;25000gp',
  ]),
  ...rows('good', 'srd', ['trade', 'raw'], [
    'Wheat;1cp;lb', 'Flour;2cp;lb', 'Salt;5cp;lb', 'Iron;1sp;lb;metal', 'Copper;5sp;lb;metal', 'Silver;5gp;lb;metal;silver bullion',
    'Gold;50gp;lb;metal;gold bullion', 'Platinum;500gp;lb;metal', 'Ginger;1gp;lb;luxury spice', 'Cinnamon;2gp;lb;luxury spice',
    'Pepper;2gp;lb;luxury spice', 'Cloves;3gp;lb;luxury spice', 'Saffron;15gp;lb;luxury spice',
  ], { sellFraction: 1 }),
  ...rows('good', 'srd', ['magic', 'potion', 'consumable', 'medicine', 'crafted'], ['Potion of healing;50gp;;;healing potion, health potion, potion of health']),
];

const srdServices = [
  ...rows('service', 'srd', ['transport'], ['City cab ride;1cp;;;cab, hansom, hackney, cab ride'], { generic: true }),
  ...rows('labor', 'srd', ['labor', 'unskilled'], ['Untrained hireling;2sp;day;;laborer, labourer, unskilled worker, hand, hired hand, porter'], { generic: true }),
  ...rows('labor', 'srd', ['labor', 'skilled'], ['Skilled hireling;2gp;day;;skilled worker, craftsman, artisan, tradesman'], { generic: true }),
  ...rows('lodging', 'srd', ['lodging'], ['Inn room;5sp;day;;inn, inn stay, room, tavern room, lodging, hotel, bed, board'], { generic: true }),
  ...rows('service', 'srd', ['food', 'meal'], ['Meal;3sp;each;;meals, dinner, supper, lunch, breakfast'], { generic: true }),
];

const coreEntries = [
  // Travel. perMile in BU, mpd = miles per day. bu is per day of travel.
  { id: 'travel.rail', name: 'Rail passage', kind: 'travel', src: 'core', group: 'travel', unit: 'day', perMile: 0.4, mpd: 250,
    tags: ['transport', 'rail'], aliases: ['train', 'rail', 'railway', 'railroad', 'steam train', 'locomotive', 'train ride', 'train ticket'],
    basis: 'Derived: the SRD coach is 3 cp a mile. Rail is far faster and cheaper per mile, so about 0.4 cp a mile at 250 miles a day, roughly 1 gp per day of travel.' },
  { id: 'travel.coach', generic: true, name: 'Coach passage', kind: 'travel', src: 'srd', group: 'travel', unit: 'day', perMile: 3, mpd: 24,
    tags: ['transport', 'coach'], aliases: ['coach', 'stagecoach', 'stage coach', 'stage', 'carriage ride', 'wagon ride', 'coach ride'],
    basis: 'SRD: coach, between towns, 3 cp a mile, at about 24 miles a day.' },
  { id: 'travel.ship', generic: true, name: 'Ship passage', kind: 'travel', src: 'srd', group: 'travel', unit: 'day', perMile: 10, mpd: 100,
    tags: ['transport', 'ship'], aliases: ['ship', 'boat passage', 'boat ride', 'ship ride', 'sea passage', 'voyage', 'sailing', 'ferry'],
    basis: 'SRD: ship passage, 1 sp a mile, at about 100 miles a day.' },
  { id: 'travel.steamer', name: 'Steamer passage', kind: 'travel', src: 'core', group: 'travel', unit: 'day', perMile: 6, mpd: 200,
    tags: ['transport', 'ship'], aliases: ['steamer', 'steamship', 'steam ship', 'paddle steamer', 'liner', 'ocean liner'],
    basis: 'Derived: faster than a sailing ship, so cheaper per mile at 200 miles a day.' },
  { id: 'travel.airship', name: 'Airship passage', kind: 'travel', src: 'core', group: 'travel', unit: 'day', perMile: 12, mpd: 300,
    tags: ['transport', 'air'], aliases: ['airship', 'zeppelin', 'dirigible', 'sky ship', 'skyship', 'balloon'],
    basis: 'Fool\'s Gold estimate: a premium mode at 300 miles a day and 12 cp a mile.' },
  { id: 'travel.messenger', generic: true, name: 'Messenger', kind: 'travel', src: 'srd', group: 'travel-message', unit: 'day', perMile: 2, mpd: 40,
    tags: ['transport', 'messenger'], aliases: ['courier', 'runner', 'send a message', 'send a letter'],
    basis: 'SRD: messenger, 2 cp a mile.' },
  // Services and labor
  ...rows('service', 'core', ['service', 'communication'], ['Telegram;3sp;each;;telegraph, wire, cable']),
  ...rows('service', 'core', ['service', 'transport'], ['Tram fare;2cp;each;;tram, tram ticket, tram ride, omnibus, streetcar']),
  ...rows('labor', 'core', ['labor', 'unskilled', 'factory'], ['Factory hand;25cp;day;;mill worker, factory worker, factory laborer']),
  ...rows('labor', 'core', ['labor', 'skilled'], [
    'Blacksmith;3gp;day;metal crafted;smith', 'Carpenter;2gp;day', 'Cook;6sp;day;food', 'Scribe;4sp;day;;clerk, secretary', 'Servant;2sp;day;;maid, butler, footman',
    'Guide;2gp;day', 'Bodyguard;5gp;day;combat;guard, bouncer', 'Mercenary;3gp;day;combat;sellsword, soldier for hire, hired sword', 'Engineer;5gp;day;;steam engineer, mechanic',
    'Physician;5gp;day;medicine;doctor, surgeon, healer', 'Lawyer;8gp;day;;barrister, solicitor, attorney', 'Sage;10gp;day;;scholar, researcher, expert', 'Alchemist;6gp;day;magic crafted',
    'Wizard for hire;12gp;day;magic;wizard, mage, hedge wizard, mage for hire, sorcerer', 'Spy;10gp;day;;informant, agent', 'Thug;1gp;day;combat;ruffian, muscle',
  ]),
  ...rows('spell', 'core', ['spell', 'magic', 'service'], [
    'Cantrip casting;15gp;each;;cantrip', '1st level spell casting;40gp;each;;1st level spell, first level spell', '2nd level spell casting;90gp;each;;2nd level spell, second level spell',
    '3rd level spell casting;220gp;each;;3rd level spell, third level spell', '4th level spell casting;500gp;each;;4th level spell, fourth level spell',
    '5th level spell casting;1200gp;each;;5th level spell, fifth level spell', '6th level spell casting;2800gp;each;;6th level spell, sixth level spell',
    '7th level spell casting;6500gp;each;;7th level spell, seventh level spell', '8th level spell casting;15000gp;each;;8th level spell, eighth level spell',
    '9th level spell casting;35000gp;each;;9th level spell, ninth level spell',
  ]),
  // Property
  ...rows('property', 'core', ['property'], [
    'Cottage;200gp;;;hut, cabin', 'Townhouse;1500gp;;;house, terrace house, row house', 'Manor;15000gp;;;mansion, estate', 'Castle;250000gp;;;keep, fortress',
    'Shop;1000gp;;;storefront, store', 'Tavern building;5000gp;;;pub, alehouse', 'Warehouse;2000gp', 'Workshop;800gp;;;smithy, forge', 'Acre of farmland;3gp;;;acre, farmland, farm land',
    'Factory;20000gp;;industrial;mill, works', 'Dock berth;300gp;;;berth, mooring',
  ]),
  // Original goods for variety
  ...rows('good', 'core', ['gear', 'industrial', 'manufactured'], [
    'Steam engine;400gp;;;engine, boiler', 'Gaslamp;8gp;;;gas lamp, streetlamp, street lamp', 'Revolver;60gp;;weapon;pistol, firearm, gun', 'Coal;4cp;lb;raw fuel;',
  ]),
];

// Magic categories priced by rarity curve (original numbers; not the DMG table).
const magicCats = [
  ['potion', 'Potion', 'consumable', 1, ['potion', 'consumable', 'magic', 'crafted'], 'potions, elixir, philter, draught, brew'],
  ['scroll', 'Scroll', 'consumable', 1.1, ['scroll', 'consumable', 'magic', 'crafted'], 'scrolls, spell scroll'],
  ['wand', 'Wand', 'permanent', 0.8, ['wand', 'magic', 'crafted'], 'wands'],
  ['staff', 'Magic staff', 'permanent', 1.2, ['staff', 'magic', 'crafted'], 'magic staves, staves'],
  ['rod', 'Rod', 'permanent', 1.0, ['rod', 'magic', 'crafted'], 'rods'],
  ['ring', 'Magic ring', 'permanent', 1.0, ['ring', 'magic', 'crafted', 'jewelry'], 'ring, rings, magic rings'],
  ['magic-weapon', 'Magic weapon', 'permanent', 1.1, ['weapon', 'magic', 'crafted'], 'magic sword, enchanted weapon, enchanted sword, magical weapon'],
  ['magic-armor', 'Magic armor', 'permanent', 1.1, ['armor', 'magic', 'crafted'], 'magic armour, enchanted armor, magical armor'],
  ['wondrous', 'Wondrous item', 'permanent', 1.0, ['wondrous', 'magic', 'crafted'], 'wondrous items, magic item, magic items, magical item, trinket, relic, artifact'],
].map(([id, name, curve, scale, tags, aliases]) => ({
  id: 'good.cat-' + id, name, kind: 'good', src: 'core', curve, scale, tags, aliases: aliases.split(',').map(s => s.trim()), isCategory: true, group: 'magic',
  basis: 'Original rarity curve (' + curve + '), not the published DMG table.',
}));

// Generic category templates (so a half-known noun still gets an answer).
const genericCats = [
  ['weapon', 'Weapon', '15gp', ['weapon', 'manufactured', 'crafted', 'metal'], 'weapons, blade, sword, swords, axe, bow, arms'],
  ['armor', 'Armor', '75gp', ['armor', 'manufactured', 'crafted', 'metal'], 'armour, armors, mail'],
  ['tool', 'Tool', '5gp', ['tool', 'manufactured'], 'tools, equipment, gear, supplies, kit'],
  ['clothing', 'Clothing', '2gp', ['clothing', 'textile', 'manufactured'], 'clothes, outfit, garment, coat, dress, boots'],
  ['jewelry', 'Jewelry', '50gp', ['jewelry', 'luxury', 'crafted'], 'jewellery, necklace, bracelet'],
  ['gem', 'Gemstone', '100gp', ['gem', 'luxury'], 'gems, gemstones, jewel, jewels, diamond, ruby'],
  ['art', 'Art object', '250gp', ['luxury', 'art', 'crafted'], 'painting, statue, sculpture, artwork, art'],
  ['food', 'Food', '5sp', ['food', 'consumable'], 'meal food, groceries, provisions'],
  ['animal', 'Animal', '10gp', ['animal', 'livestock'], 'animals, livestock, pet, beast'],
  ['vehicle', 'Vehicle', '100gp', ['vehicle', 'manufactured'], 'vehicles, boat'],
  ['medicine', 'Medicine', '5gp', ['medicine', 'consumable', 'crafted'], 'medicines, remedy, salve, tonic, antidote, poison'],
  ['book', 'Book', '25gp', ['book', 'crafted'], 'books, tome, manual'],
].map(([id, name, price, tags, aliases]) => ({
  id: 'good.cat-' + id, name, kind: 'good', src: 'core', bu: parsePrice(price), unit: 'each', spread: 0.6, tags, aliases: aliases.split(',').map(s => s.trim()), isCategory: true,
  basis: 'Generic price for when no specific item is named.',
}));


// ---- Modern real-world pack (original numbers: a typical mid-size US city, around 2025) ----
// Prices are in cents. Place modifiers scale housing harder than anything else (placeScale).
const usd = n => Math.round(n * 100);
function modern(kind, tags, list, extra = {}) {
  return list.map(line => {
    const [name, price, unit, more, aliases] = line.split(';').map(x => x.trim());
    return {
      id: kind + '.m-' + slug(name), name, kind, src: 'modern', bu: usd(parseFloat(price.replace(/,/g, ''))), unit: unit || 'each',
      tags: [...tags, ...(more ? more.split(/\s+/) : [])], aliases: aliases ? aliases.split(',').map(x => x.trim()).filter(Boolean) : [], ...extra,
    };
  });
}
const modernEntries = [
  ...modern('lodging', ['lodging', 'rent', 'property'], [
    'Studio apartment rent;1250;month;;studio, studio apartment, studio rent',
    'Apartment rent, medium;1650;month;;medium apartment, one bedroom apartment, 1 bedroom apartment, apartment, flat, apartment rent, monthly rent, medium apartment rent',
    'Apartment rent, large;2300;month;;large apartment, two bedroom apartment, 2 bedroom apartment, big apartment, large apartment rent',
    'House rent;2700;month;;rental house, house rental, house rent',
    'Room rental;850;month;;shared room, room in a shared apartment, roommate room',
    'Office rent;3200;month;;office, office space, commercial lease',
  ], { group: 'rent', placeScale: 3, noTier: true }),
  ...modern('lodging', ['lodging'], ['Hotel room;170;day;;hotel, hotel room, hotel stay', 'Motel room;95;day;;motel', 'Hostel bed;45;day;;hostel, hostel bed', 'Vacation rental;210;day;;airbnb, short term rental, holiday rental'], { placeScale: 2 }),
  ...modern('service', ['service', 'subscription'], [
    'Utilities bill;210;month;;utilities, electric bill, utility bill', 'Internet service;70;month;;internet, wifi, broadband', 'Phone plan;65;month;;cell plan, mobile plan, phone bill',
    'Gym membership;50;month;;gym', 'Streaming subscription;16;month;;streaming', 'Health insurance premium;480;month;;health insurance, insurance premium', 'Car insurance;160;month',
    'Childcare;1400;month;;daycare, day care',
  ], { noTier: true }),
  ...modern('service', ['service', 'food', 'meal'], [
    'Coffee;4.50;;;latte, espresso', 'Fast food meal;13;;;burger, fast food', 'Restaurant meal;28;;;dinner, lunch, breakfast, meal, restaurant, casual dinner, sit down meal',
    'Fine dining dinner;140;;;fancy dinner, tasting menu, fine dining, upscale dinner', 'Pizza;22', 'Sandwich;11;;;sub',
  ]),
  ...modern('service', ['service', 'food'], ['Weekly groceries;150;week;;groceries, grocery shopping, grocery run']),
  ...modern('good', ['food', 'drink', 'consumable'], ['Beer;7.50;;;pint, draft beer', 'Cocktail;16;;;mixed drink', 'Bottle of wine;24;;;wine']),
  ...modern('service', ['service', 'transport'], [
    'Taxi ride;26;;;taxi, cab, rideshare, ride share, car service', 'Subway ride;3;;;subway, metro, bus fare, bus ride, light rail', 'Parking;22;;;parking spot, parking garage', 'Toll;6;;;road toll',
    'Gas tank;55;;;gas, fuel, petrol, fill up',
  ]),
  ...modern('service', ['service', 'transport'], ['Rental car;70;day;;car rental, hire car']),
  { id: 'travel.intercity-train', name: 'Intercity train', kind: 'travel', src: 'modern', group: 'travel', unit: 'day', perMile: 28, mpd: 500, tags: ['transport', 'rail'], aliases: ['train', 'train ticket', 'train ride', 'railway', 'rail', 'amtrak style train'], basis: 'Fool\'s Gold estimate: about 28 cents a mile on a typical intercity line, 500 miles in a long day.' },
  { id: 'travel.intercity-bus', name: 'Intercity bus', kind: 'travel', src: 'modern', group: 'travel', unit: 'day', perMile: 11, mpd: 500, tags: ['transport', 'coach'], aliases: ['bus', 'bus ticket', 'coach bus', 'long distance bus'], basis: 'Fool\'s Gold estimate: about 11 cents a mile.' },
  { id: 'travel.commercial-flight', name: 'Commercial flight', kind: 'travel', src: 'modern', group: 'travel', unit: 'day', perMile: 14, mpd: 2400, tags: ['transport', 'air'], aliases: ['flight', 'plane', 'plane ticket', 'airplane', 'airline', 'air ticket', 'flight ticket'], basis: 'Fool\'s Gold estimate: about 14 cents a mile, 2,400 miles in a day of travel.' },
  ...modern('labor', ['labor', 'unskilled'], ['Day laborer;120;day;;laborer, labourer, unskilled worker, hand, hired hand'], {}),
  ...modern('labor', ['labor', 'skilled'], [
    'Skilled tradesperson;450;day;;tradesperson, tradesman, craftsman, skilled worker, handyman', 'Electrician;850;day', 'Plumber;900;day', 'Contractor;700;day;;builder, carpenter', 'Lawyer;2400;day;;attorney, solicitor, barrister',
    'Accountant;1200;day;;bookkeeper', 'Software developer;1000;day;;developer, programmer, coder', 'Security guard;210;day;;guard, bouncer', 'Cleaner;170;day;;maid, housekeeper', 'Babysitter;130;day;;sitter, nanny',
    'Chauffeur;320;day;;driver', 'Private investigator;900;day;;investigator, detective, pi', 'Bodyguard;1000;day;combat;', 'Tutor;400;day;;teacher',
  ]),
  ...modern('service', ['service', 'medicine'], [
    'Doctor visit;220;;;doctor, clinic visit, physician visit', 'Dentist visit;190;;;dentist', 'Therapy session;150;;;therapist, counseling', 'Emergency room visit;2600;;;er, er visit, emergency room',
    'Ambulance ride;1300;;;ambulance', 'Haircut;38;;;barber', 'Massage;110', 'Dry cleaning;18', 'Movie ticket;16;;;cinema, movie', 'Concert ticket;95;;;concert', 'Legal retainer;5000;;;retainer', 'Wedding;35000;;;wedding reception',
    'Funeral;9500;;;burial',
  ]),
  ...modern('service', ['service', 'medicine'], ['Hospital stay;3500;day;;hospital, hospital bed']),
  ...modern('service', ['service'], ['College tuition;32000;year;;tuition, college', 'Private school tuition;22000;year;;private school']),
  ...modern('good', ['manufactured', 'gadget'], [
    'Smartphone;850;;;phone, cell phone, mobile phone, iphone style phone', 'Burner phone;45;;;prepaid phone, throwaway phone', 'Laptop;1150;;;computer, notebook computer', 'Television;550;;;tv, telly', 'Headphones;160;;;earbuds',
  ]),
  ...modern('good', ['manufactured', 'clothing'], ['Jeans;75;;;pants, trousers', 'Sneakers;115;;;shoes, trainers', 'Business suit;520;;luxury;suit', 'Winter coat;180;;;coat, jacket', 'Designer handbag;2400;;luxury;handbag, purse']),
  ...modern('good', ['manufactured', 'luxury'], ['Luxury watch;9000;;;rolex style watch, expensive watch', 'Engagement ring;5500;;;diamond ring', 'Wristwatch;250;;;watch']),
  ...modern('good', ['manufactured'], [
    'Book;20;;book;paperback, hardcover', 'Newspaper;3;;newspaper;paper', 'Pack of cigarettes;9.50;;;cigarettes, smokes', 'Bicycle;520;;vehicle;bike', 'Motorcycle;9500;;vehicle;motorbike', 'Car;38000;;vehicle;automobile, new car, sedan, suv',
    'Sofa;900;;;couch', 'Mattress;1000;;;bed frame', 'Refrigerator;1300;;;fridge', 'Over the counter medicine;12;;medicine;medicine, painkillers, cold medicine', 'Prescription medication;60;;medicine;prescription, meds',
  ]),
  ...modern('good', ['manufactured', 'weapon', 'metal'], ['Handgun;600;;;pistol, gun, firearm, revolver', 'Hunting rifle;900;;;rifle, shotgun', 'Pocketknife;45;;;knife', 'Bulletproof vest;650;;armor;body armor, kevlar vest']),
  ...modern('property', ['property'], ['House;420000;;;home, family home, house purchase', 'Condo;360000;;;condominium', 'Acre of land;6000;;;acre, land'], { placeScale: 3 }),
].map(e => ({ spread: 0.15, ...e }));
const modernCats = [
  ['gadget', 'Gadget', 300, ['manufactured', 'gadget'], 'gadgets, device, electronics, gizmo'],
  ['clothes', 'Clothing', 80, ['manufactured', 'clothing'], 'clothes, clothing, outfit, garment'],
  ['furniture', 'Furniture', 600, ['manufactured'], 'furnishings, table, chair, desk'],
  ['appliance', 'Appliance', 700, ['manufactured'], 'appliances, oven, washer, dryer'],
  ['vehicle', 'Vehicle', 22000, ['manufactured', 'vehicle'], 'vehicles, truck, van'],
  ['tool', 'Tool', 60, ['manufactured', 'tool'], 'tools, equipment, drill, hammer'],
].map(([id, name, price, tags, aliases]) => ({ id: 'good.cat-m-' + id, name, kind: 'good', src: 'modern', bu: usd(price), unit: 'each', spread: 0.6, tags, aliases: aliases.split(',').map(x => x.trim()), isCategory: true, basis: 'Generic price for when no specific item is named.' }));

// A harvested-materials category, the usual landing spot for "monster parts" style words.
const componentCat = { id: 'good.cat-component', name: 'Crafting component', kind: 'good', src: 'core', bu: parsePrice('25gp'), unit: 'each', spread: 0.8, tags: ['component', 'raw', 'crafted'], aliases: ['component', 'components', 'ingredient', 'ingredients', 'reagent', 'reagents', 'crafting material', 'crafting materials'], isCategory: true, basis: 'Generic price for harvested materials and crafting ingredients.' };

// Categories that stand for a family of entries (generic word -> default member).
export const FAMILIES = [
  { id: 'travel', name: 'Travel', kind: 'travel', terms: ['travel', 'travelling', 'traveling', 'transport', 'transportation', 'trip', 'journey', 'ride'], defaultKey: 'travel', fallback: 'travel.coach', ask: 'Travel mode', offer: true },
  { id: 'rent', name: 'Rent', kind: 'lodging', terms: ['rent', 'rental', 'lease', 'rent payment'], defaultKey: 'rent', fallback: 'lodging.m-apartment-rent-medium', ask: 'Kind of rental', offer: true },
];

export const CATALOG = [...srdGoods, ...srdServices, ...coreEntries, ...magicCats, ...genericCats, componentCat, ...modernEntries, ...modernCats, ...scifiEntries];
// Not every weapon or armor is metal; not everything labelled in the SRD tables is SRD.
const NONMETAL = new Set(['Club', 'Greatclub', 'Quarterstaff', 'Sling', 'Shortbow', 'Longbow', 'Whip', 'Blowgun', 'Padded armor', 'Leather armor', 'Studded leather armor', 'Hide armor']);
for (const e of CATALOG) {
  if (NONMETAL.has(e.name)) e.tags = e.tags.filter(t => t !== 'metal');
  if (e.src === 'srd' && (e.name === 'Newspaper' || e.name === 'Pocket watch')) { e.src = 'core'; }
  if (e.tags.includes('perday')) e.perDay = true;
}

// Rarity curves: middle price in BU per rarity, band as multipliers of the middle.
export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary'];
export const RARITY_CURVES = {
  consumable: { mid: { common: 5000, uncommon: 17500, rare: 61000, 'very rare': 215000, legendary: 750000 }, band: [0.6, 1.6] },
  permanent: { mid: { common: 20000, uncommon: 100000, rare: 500000, 'very rare': 2500000, legendary: 12500000 }, band: [0.55, 1.8] },
};

export const TIER_NAMES = ['budget', 'standard', 'expensive', 'luxury'];
export const TIER_FACTORS = {
  travel: { budget: [0.4, 0.7], standard: [1, 1], expensive: [2.5, 4], luxury: [5, 10] },
  lodging: { budget: [0.15, 0.4], standard: [1, 1], expensive: [1.6, 4], luxury: [4, 8] },
  service: { budget: [0.5, 0.8], standard: [1, 1], expensive: [1.5, 2.5], luxury: [3, 6] },
  good: { budget: [0.6, 0.85], standard: [1, 1], expensive: [1.5, 2.5], luxury: [3, 6] },
};
export const TIER_WHY = {
  travel: { budget: 'Cheap seats: third class, steerage, open deck.', expensive: 'First class: private compartment, better service.', luxury: 'The finest cabin on the line.' },
  lodging: { budget: 'Floor space or a shared bunk.', expensive: 'A comfortable to wealthy room.', luxury: 'Aristocratic suite.' },
  service: { budget: 'A cheaper, less experienced provider.', expensive: 'A top practitioner.', luxury: 'The very best in the region.' },
  good: { budget: 'Cheap version, lower quality.', expensive: 'Higher quality version.', luxury: 'Luxury grade.' },
};

export const BULK = [[500, [0.65, 0.85]], [100, [0.75, 0.92]], [25, [0.85, 0.97]], [10, [0.92, 1]]];

// ---- Modifiers ----
export const GROUPS = {
  place:        { label: 'Where',        exclusive: true,  ask: 'Where' },
  channel:      { label: 'Channel',      exclusive: true,  ask: 'Sold through' },
  urgency:      { label: 'Urgency',      exclusive: true,  ask: 'How fast' },
  condition:    { label: 'Condition',    exclusive: true,  ask: 'Condition' },
  order:        { label: 'Order',        exclusive: true,  ask: 'Made to order?' },
  relationship: { label: 'Relationship', exclusive: true,  ask: 'Their attitude' },
  supply:       { label: 'Local supply', exclusive: true,  ask: 'Local supply' },
  events:       { label: 'Events',       exclusive: false, ask: 'Events' },
  provenance:   { label: 'Provenance',   exclusive: false, ask: 'Provenance' },
  route:        { label: 'Route',        exclusive: true,  ask: 'Route' },
};
const NONTRAVEL = ['good', 'service', 'labor', 'lodging', 'spell', 'property'];
const ALLK = [...NONTRAVEL, 'travel'];
const M = (id, label, group, aliases, buy, sell, kinds, why, extra = {}) => ({ id, label, group, aliases, buy, sell: sell || buy, kinds, why, ...extra });

export const MODIFIERS = [
  M('capital', 'capital / major market', 'place', ['capital', 'capital city', 'major market', 'metropolis', 'major city', 'big city', 'royal city', 'the capital'], [1.05, 1.35], [1, 1.25], NONTRAVEL, 'Big-city demand and rents raise prices, and there are more buyers.', { rank: 4 }),
  M('city', 'large city', 'place', ['city', 'large city', 'port city', 'city market', 'urban'], [1, 1.15], [0.95, 1.15], NONTRAVEL, 'A busy city market, close to average with a small premium.', { rank: 3 }),
  M('town', 'market town', 'place', ['town', 'market town', 'small town', 'town market'], [0.9, 1.05], [0.85, 1], NONTRAVEL, 'A modest market. Prices sit near the base.', { rank: 2 }),
  M('village', 'village', 'place', ['village', 'hamlet', 'rural', 'countryside', 'farm village'], [0.85, 1], [0.65, 0.9], NONTRAVEL, 'Cheap to live in, but few buyers and little choice.', { rank: 1 }),
  M('outpost', 'trading outpost', 'place', ['outpost', 'trading outpost', 'trading post', 'frontier post', 'fort', 'camp'], [1.2, 1.8], [0.6, 0.9], NONTRAVEL, 'Everything is hauled in, so buying costs more and sellers get less.', { rank: 1 }),
  M('remote', 'remote wilderness', 'place', ['wilderness', 'remote', 'backcountry', 'middle of nowhere', 'wilds', 'frontier', 'the wilds'], [1.5, 3], [0.35, 0.7], NONTRAVEL, 'Almost no supply and almost no buyers.', { rank: 0 }),

  M('black-market', 'black market', 'channel', ['black market', 'blackmarket', 'bm', 'back alley', 'underground market', 'shady dealer', 'no questions asked', 'fence'], [1.5, 3], [0.4, 0.7], ['good', 'service', 'labor', 'spell'], 'Buyers pay a premium for no questions asked. Sellers lose a cut to the risk.'),
  M('auction', 'auction', 'channel', ['auction', 'auction house', 'bidding'], [1.1, 1.6], [0.9, 1.4], ['good', 'property'], 'Competing bidders push prices up, minus the house fee.'),
  M('pawn', 'pawnshop', 'channel', ['pawn', 'pawnshop', 'pawn shop', 'pawnbroker'], [1, 1.2], [0.3, 0.5], ['good'], 'Pawnbrokers pay a fraction and mark up what they sell.'),
  M('wholesale', 'wholesale', 'channel', ['wholesale', 'bulk dealer', 'wholesaler', 'trade price', 'at cost'], [0.6, 0.85], [0.7, 0.9], ['good'], 'Dealers buy and sell in volume at thin margins.'),
  M('direct', 'direct from the maker', 'channel', ['direct', 'direct sale', 'from the maker', 'from the artisan', 'private sale'], [0.8, 1], [1, 1.2], ['good'], 'Cutting out the shopkeeper.', { sides: ['buy'] }),
  M('peddler', 'street peddler', 'channel', ['peddler', 'pedlar', 'street vendor', 'vendor', 'hawker', 'traveling merchant', 'travelling merchant', 'street stall'], [1.1, 1.5], [0.5, 0.8], ['good'], 'Convenient, so it costs extra. Peddlers lowball what they buy.'),

  M('rush', 'rush job', 'urgency', ['rush', 'rush job', 'rushed', 'urgent', 'urgently', 'asap', 'right now', 'same day', 'overnight', 'expedite', 'expedited', 'last minute', 'last-minute', 'in a hurry'], [1.5, 3], [0.6, 0.85], ALLK, 'Paying to skip the queue. When selling in a hurry, you take what you can get.', { goodTags: ['crafted'] }),
  M('leisurely', 'no rush', 'urgency', ['leisurely', 'no rush', 'take your time', 'slow', 'unhurried', 'whenever', 'off peak', 'off-peak'], [0.8, 0.95], [1, 1.1], ALLK, 'Flexible timing earns a small discount.', { goodTags: ['crafted'] }),

  M('shoddy', 'shoddy', 'condition', ['shoddy', 'poor quality', 'low quality', 'crude'], [0.5, 0.8], [0.4, 0.7], ['good', 'property'], 'Poorly made, still functional.'),
  M('used', 'secondhand', 'condition', ['used', 'secondhand', 'second hand', 'second-hand', 'worn', 'pre-owned', 'preowned', 'hand me down'], [0.5, 0.8], [0.4, 0.7], ['good', 'property'], 'Secondhand goods trade at a discount.'),
  M('damaged', 'damaged', 'condition', ['damaged', 'broken', 'cracked', 'ruined', 'dented', 'in disrepair'], [0.2, 0.5], [0.15, 0.4], ['good', 'property'], 'Needs repairs before it is worth anything.'),
  M('fine', 'fine quality', 'condition', ['fine', 'fine quality', 'high quality', 'well made', 'well-made', 'good quality', 'quality'], [1.5, 2.5], [1.4, 2.2], ['good', 'property'], 'Better materials and craft.', { goodTags: ['crafted', 'luxury', 'art', 'jewelry', 'clothing', 'tool'] }),
  M('masterwork', 'masterwork', 'condition', ['masterwork', 'masterpiece', 'exquisite', 'flawless', 'peerless', 'master crafted'], [4, 10], [3, 8], ['good', 'property'], 'The best a master can make.', { goodTags: ['crafted', 'luxury', 'art', 'jewelry', 'clothing', 'tool'] }),
  M('antique', 'antique', 'condition', ['antique', 'ancient', 'heirloom', 'vintage', 'old world'], [2, 6], [1.5, 4.5], ['good'], 'Age and rarity add value, if the right collector is around.', { goodTags: ['crafted', 'luxury', 'art', 'jewelry', 'book', 'weapon', 'armor'] }),

  M('custom', 'made to order', 'order', ['custom', 'commissioned', 'commission', 'bespoke', 'made to order', 'tailored', 'custom made', 'custom-made'], [1.3, 2], [1.3, 2], ['good'], 'Built to the buyer\'s spec instead of pulled off a shelf.', { goodTags: ['crafted'] }),

  M('friendly', 'friendly', 'relationship', ['friendly', 'friend', 'friends', 'good terms', 'favor', 'favour', 'owes me', 'a friend'], [0.75, 0.95], [1.05, 1.25], ALLK, 'A friend gives you a fair deal.'),
  M('regular', 'regular customer', 'relationship', ['regular', 'regular customer', 'repeat customer', 'known customer', 'loyal'], [0.85, 0.97], [1, 1.1], ALLK, 'Known customers get a little off.'),
  M('guild', 'guild rate', 'relationship', ['guild', 'guild rate', 'guild member', 'union', 'professional discount'], [0.8, 0.95], [1, 1.1], ALLK, 'Insiders trade among themselves at better rates.'),
  M('outsider', 'outsider', 'relationship', ['outsider', 'tourist', 'foreigner', 'stranger', 'newcomer', 'out of towner'], [1.15, 1.5], [0.8, 1], ALLK, 'Locals can tell you are not from around here.'),
  M('hostile', 'hostile', 'relationship', ['hostile', 'unfriendly', 'enemy', 'hated', 'disliked', 'grudge', 'bad blood'], [1.3, 2], [0.5, 0.8], ALLK, 'They would rather not deal with you, so they charge for the trouble.'),

  M('shortage', 'shortage', 'supply', ['shortage', 'scarce', 'scarcity', 'short supply', 'in short supply', 'rationed', 'rationing', 'out of stock', 'sold out'], [1.4, 2.5], [1.2, 1.8], ['good'], 'Not enough to go around.'),
  M('glut', 'glut', 'supply', ['glut', 'surplus', 'oversupply', 'flooded market', 'plentiful', 'abundant', 'overstocked'], [0.6, 0.85], [0.5, 0.8], ['good'], 'The market is full of it.'),
  M('offseason', 'out of season', 'supply', ['out of season', 'off season', 'off-season', 'unseasonal'], [1.3, 2], [1.1, 1.5], ['good'], 'Out of season, supply is thin.', { goodTags: ['food', 'livestock', 'raw', 'trade'] }),

  M('wartime', 'wartime', 'events', ['war', 'wartime', 'at war', 'during the war', 'war time', 'conflict'], [1.05, 1.3], [1, 1.2], ALLK, 'War strains supply and raises demand for arms, food and medicine.', {
    tagBoost: [{ tags: ['weapon', 'armor', 'medicine', 'potion', 'food', 'mount', 'combat'], f: [1.3, 1.9] }] }),
  M('siege', 'under siege', 'events', ['siege', 'besieged', 'under siege', 'blockade', 'blockaded'], [2, 5], [0.8, 1.5], ALLK, 'Nothing gets in. Everything that exists costs a fortune, and sellers of anything useful name their price.', {
    tagBoost: [{ tags: ['food', 'weapon', 'armor', 'medicine', 'potion'], f: [1.2, 1.8], sides: ['sell'] }] }),
  M('festival', 'festival', 'events', ['festival', 'carnival', 'holiday', 'feast day', 'market day', 'faire'], [1.05, 1.3], [1, 1.25], ALLK, 'Crowds fill rooms and empty shelves.', {
    tagBoost: [{ tags: ['lodging', 'food', 'drink', 'luxury', 'meal'], f: [1.2, 1.7] }] }),
  M('plague', 'plague', 'events', ['plague', 'epidemic', 'outbreak', 'quarantine', 'disease', 'pandemic'], [1.05, 1.2], [1, 1.1], ALLK, 'Sickness drives up the price of cures and care.', {
    tagBoost: [{ tags: ['medicine', 'potion', 'physician'], f: [1.6, 3] }, { kinds: ['travel'], f: [1.1, 1.5] }] }),
  M('boom', 'economic boom', 'events', ['boom', 'gold rush', 'prosperity', 'prosperous', 'good times', 'economic boom'], [1.1, 1.5], [1.05, 1.4], ALLK, 'Money is flowing and everyone raises their prices.'),
  M('recession', 'recession', 'events', ['recession', 'depression', 'hard times', 'downturn', 'famine times', 'slump'], [0.8, 0.95], [0.6, 0.9], ALLK, 'Money is tight, so prices sag.'),

  M('stolen', 'stolen goods', 'provenance', ['stolen', 'hot', 'hot goods', 'looted', 'filched', 'knocked off', 'swiped'], [0.4, 0.8], [0.3, 0.6], ['good'], 'Hot goods move cheap, because nobody wants to be caught with them.'),
  M('contraband', 'contraband', 'provenance', ['contraband', 'smuggled', 'illegal', 'banned', 'forbidden', 'restricted', 'illicit'], [1.5, 3.5], [0.7, 1.3], ['good', 'service', 'spell'], 'Risk is priced in. The right buyer pays well.'),
  M('famed', 'famed provenance', 'provenance', ['famous', 'famed', 'historic', 'legendary maker', 'once belonged to', 'storied'], [1.5, 4], [1.3, 3.5], ['good'], 'A good story is worth money.'),
  M('cursed', 'cursed', 'provenance', ['cursed', 'haunted', 'hexed', 'jinxed', 'unlucky'], [0.3, 0.7], [0.2, 0.5], ['good', 'property'], 'Nobody wants it, except the odd collector.'),

  M('route-trunk', 'major route', 'route', [], [1.1, 1.4], null, ['travel'], 'Between the biggest cities there is heavy traffic, and the lines charge for it.', { rank: 4 }),
  M('route-hub', 'city to town', 'route', [], [1, 1.2], null, ['travel'], 'A big city connected to a smaller place.'),
  M('route-local', 'local route', 'route', [], [0.9, 1.1], null, ['travel'], 'Short, competitive local service.'),
  M('route-remote', 'remote route', 'route', [], [1.3, 2], null, ['travel'], 'Sparse service to a remote place.'),
  M('border', 'crossing a border', 'route', ['border', 'cross border', 'cross-border', 'international', 'abroad', 'overseas'], [1.15, 1.6], null, ['travel'], 'Customs, papers and tolls.'),
];
// A separate stackable group for border so it can combine with a route kind.
MODIFIERS.find(m => m.id === 'border').group = 'events';

export const ROUTE_TEXT = { 'route-trunk': 'capital to capital', 'route-hub': 'city to town', 'route-local': 'town to village', 'route-remote': 'village to wilderness' };

export const INTERACTIONS = [
  ['black-market', 'rush', 0.6], ['stolen', 'black-market', 0.5], ['siege', 'wartime', 0.5],
  ['shortage', 'siege', 0.6], ['shortage', 'wartime', 0.7], ['rush', 'shortage', 0.7], ['contraband', 'black-market', 0.6],
];
export const STACK_WEIGHTS = [1, 0.75, 0.5, 0.35, 0.25, 0.2];

// ---- Economy tags ----
const E = (id, label, describe, categories) => ({ id, label, describe, categories });
export const ECONOMY_TAGS = [
  E('industrial-boom', 'Thriving industrial economy', 'Factories make plain goods cheap and fast. Skilled hands, city food and city land cost more.', [
    { tags: ['manufactured'], f: [0.7, 0.9] }, { tags: ['tool', 'weapon', 'armor'], f: [0.85, 0.97] }, { tags: ['transport'], f: [0.8, 1] },
    { tags: ['skilled'], f: [1.1, 1.4] }, { tags: ['food'], f: [1.05, 1.25] }, { kinds: ['property'], f: [1.2, 1.8] }, { tags: ['unskilled'], f: [0.9, 1] }, { tags: ['newspaper'], f: [0.8, 0.9] }]),
  E('scarce-wilderland', 'Scarce wilderland', 'Everything made is hauled in. Metal, tools, travel and luxuries cost a lot. Raw food and animals are cheap.', [
    { tags: ['manufactured'], f: [1.4, 2.2] }, { tags: ['metal'], f: [1.5, 2.5] }, { tags: ['weapon', 'armor'], f: [1.3, 2] }, { tags: ['food'], f: [0.9, 1.6] },
    { tags: ['livestock', 'raw'], f: [0.7, 0.95] }, { tags: ['transport'], f: [1.5, 2.5] }, { kinds: ['lodging'], f: [1.2, 1.8] }, { tags: ['labor'], f: [0.7, 1] },
    { tags: ['luxury'], f: [1.5, 3] }, { tags: ['magic'], f: [1.1, 1.6] }]),
  E('trade-hub', 'Trade hub', 'Goods from everywhere. Competition keeps most things near or under the base price.', [
    { kinds: ['good'], f: [0.9, 1] }, { tags: ['luxury'], f: [0.8, 0.95] }, { tags: ['transport'], f: [0.85, 1] }, { tags: ['magic'], f: [0.9, 1.1] }]),
  E('war-torn', 'War-torn', 'Arms, food and medicine are scarce. Land is cheap, because nobody wants to own it.', [
    { tags: ['weapon', 'armor'], f: [1.4, 2.2] }, { tags: ['food'], f: [1.3, 2.2] }, { tags: ['medicine', 'potion'], f: [1.5, 2.5] }, { tags: ['skilled'], f: [1.2, 1.6] },
    { kinds: ['property'], f: [0.3, 0.7] }, { tags: ['luxury'], f: [0.7, 1] }, { tags: ['transport'], f: [1.3, 2] }, { kinds: ['lodging'], f: [1.1, 1.4] }]),
  E('isolated', 'Isolated', 'Cut off from outside trade. Imports and luxuries cost a lot.', [
    { tags: ['manufactured'], f: [1.3, 1.9] }, { tags: ['luxury'], f: [1.5, 2.5] }, { tags: ['food'], f: [0.85, 1.1] }, { tags: ['transport'], f: [1.3, 2] }, { tags: ['magic'], f: [1.2, 2] }]),
  E('post-collapse', 'Post-collapse', 'Old industry is gone. Salvage, metal and food are precious. Property is nearly free.', [
    { tags: ['manufactured'], f: [2, 4] }, { tags: ['metal'], f: [2, 3.5] }, { tags: ['food'], f: [1.5, 3] }, { kinds: ['property'], f: [0.1, 0.4] }, { tags: ['magic'], f: [1.5, 3] }, { tags: ['labor'], f: [0.7, 1.1] }]),
  E('agrarian', 'Agrarian', 'Farm country. Food and animals are cheap. Made goods and luxuries cost more.', [
    { tags: ['food', 'livestock'], f: [0.7, 0.9] }, { tags: ['manufactured'], f: [1.1, 1.4] }, { tags: ['luxury'], f: [1.1, 1.5] }, { tags: ['unskilled'], f: [0.9, 1] }, { kinds: ['property'], f: [0.7, 1] }]),
  E('guild-controlled', 'Guild-controlled', 'Guilds fix prices and limit who can sell. Skilled work and made goods cost more.', [
    { tags: ['skilled'], f: [1.2, 1.5] }, { tags: ['crafted'], f: [1.05, 1.25] }]),
  E('high-cost-metro', 'High cost of living', 'Housing, services and eating out are expensive. Goods are about normal.', [
    { tags: ['rent', 'property'], f: [1.3, 1.9] }, { kinds: ['lodging'], f: [1.15, 1.5] }, { tags: ['meal', 'service'], f: [1.1, 1.35] }, { tags: ['skilled'], f: [1.15, 1.4] }]),
  E('low-cost-region', 'Low cost of living', 'Cheap housing and services. Imported goods cost the same as anywhere.', [
    { tags: ['rent', 'property'], f: [0.55, 0.8] }, { kinds: ['lodging'], f: [0.7, 0.9] }, { tags: ['meal', 'service'], f: [0.8, 0.95] }, { tags: ['skilled', 'unskilled'], f: [0.75, 0.95] }]),
  E('magic-rich', 'Magic is everyday', 'Enchanting is routine, so magic items and casting are cheaper.', [
    { tags: ['magic'], f: [0.5, 0.8] }, { tags: ['potion', 'scroll'], f: [0.6, 0.85] }, { kinds: ['spell'], f: [0.6, 0.85] }]),
  E('magic-scarce', 'Magic is rare', 'Few can enchant, so magic items and casting are very expensive.', [
    { tags: ['magic'], f: [2, 4] }, { kinds: ['spell'], f: [2, 4] }]),
];

// ---- Language data ----
export const ACTION_TERMS = {
  buy: ['buy', 'buying', 'bought', 'purchase', 'purchasing', 'pay', 'paying', 'get', 'getting', 'hire', 'hiring', 'hired', 'booking', 'ordering'],
  sell: ['sell', 'selling', 'sold', 'offload', 'offloading', 'unload', 'flip', 'flipping', 'dump', 'dumping'],
  value: ['value', 'valuing', 'appraise', 'appraisal', 'appraising', 'worth', 'evaluate', 'assess', 'valuation'],
};
export const RARITY_TERMS = {
  common: ['common', 'ordinary'], uncommon: ['uncommon'], rare: ['rare'], 'very rare': ['very rare', 'veryrare'], legendary: ['legendary item', 'legendary', 'mythic', 'artifact rarity'],
};
export const TIER_TERMS = {
  budget: ['cheap', 'budget', 'economy', 'third class', '3rd class', 'steerage', 'basic', 'bargain', 'low end', 'low-end', 'frugal', 'lowest'],
  standard: ['standard', 'regular price', 'average', 'normal', 'second class', '2nd class', 'mid range', 'mid-range', 'typical'],
  expensive: ['expensive', 'pricey', 'first class', '1st class', 'premium', 'deluxe', 'high end', 'high-end', 'upscale', 'fancy', 'costly', 'top shelf', 'top-shelf', 'posh'],
  luxury: ['luxury', 'luxurious', 'opulent', 'lavish', 'royal', 'five star', '5 star', 'five-star', 'palatial'],
};
export const UNIT_TERMS = {
  day: ['day', 'days', 'daily'], night: ['night', 'nights'], week: ['week', 'weeks'], month: ['month', 'months', 'monthly'], year: ['year', 'years', 'yearly', 'annual'],
  mile: ['mile', 'miles', 'mi'], league: ['league', 'leagues'], lb: ['lb', 'lbs', 'pounds of', 'pound of', 'pound'],
};
export const COUNT_TERMS = ['passenger', 'person', 'people', 'traveler', 'traveller', 'adult', 'guest', 'seat', 'ticket', 'head', 'pax', 'party member'];
export const MONEY_TERMS = ['gp', 'sp', 'cp', 'pp', 'ep'];
export const FILLERS = new Set(('price prices cost costs costing how much many what whats is are would will do does did can could i we you me my our us they it its the a an of for ' +
  'in at on from between both and with per about around approx approximately roughly estimate estimated please give tell want wanna need looking look to or then also if one ' +
  'ride trip journey fare passage skilled unskilled untrained experienced during while amid when major big large main some any each by be there that this these those get got has have into onto up down over under just only really very quite pretty ' +
  'cities city town ones thing things item items stuff piece pieces unit units set pair pairs worth of ride rides lot lots whole entire total overall ' +
  'sell buy').split(/\s+/).filter(Boolean));
// 'sell'/'buy' handled as actions before fillers; keep out of fillers:
FILLERS.delete('sell'); FILLERS.delete('buy'); FILLERS.delete('cities'); FILLERS.delete('city'); FILLERS.delete('town'); FILLERS.delete('worth');
FILLERS.delete('big'); FILLERS.delete('large'); FILLERS.delete('get');

export const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  couple: 2, pair: 2, few: 3, several: 4,
};

// ---- World presets ----
const GSC = [
  { id: 'gp', name: 'gold piece', plural: 'gold pieces', bu: 100, glyph: 'G' },
  { id: 'sp', name: 'silver piece', plural: 'silver pieces', bu: 10, glyph: 'S' },
  { id: 'cp', name: 'copper piece', plural: 'copper pieces', bu: 1, glyph: 'C' },
];
const baseDials = { priceLevel: 1, volatility: 0.5, stacking: 'dampened', sellFraction: 0.5 };
export const WORLD_PRESETS = {
  vcm: () => ({
    id: 'vcm', name: 'Industrial Fantasy', blurb: 'Rail, factories and arcane streetlights.',
    baseline: 'srd', lists: ['srd', 'fantasy'], currency: { denominations: GSC.map(d => ({ ...d })), belowSmallest: 'round', note: '1 cp is roughly a dollar' },
    anchors: { wage: 25 }, economyTags: ['industrial-boom', 'magic-rich'],
    dials: { ...baseDials }, defaults: { travel: 'travel.rail' }, vocabulary: [], items: [],
  }),
  srd: () => ({
    id: 'srd', name: 'Standard Fantasy', blurb: 'Straight SRD prices, no world adjustments.',
    baseline: 'srd', lists: ['srd', 'fantasy'], currency: { denominations: GSC.map(d => ({ ...d })), belowSmallest: 'round', note: '' },
    anchors: { wage: 20 }, economyTags: [], dials: { ...baseDials }, defaults: { travel: 'travel.coach' }, vocabulary: [], items: [],
  }),
  modern: () => ({
    id: 'modern', name: 'Modern day, real world', blurb: 'Current US prices for rent, meals, flights and services.',
    baseline: 'modern', lists: ['modern'], currency: { denominations: [{ id: 'usd', name: 'dollar', plural: 'dollars', bu: 100 }, { id: 'c', name: 'cent', plural: 'cents', bu: 1 }], belowSmallest: 'round', note: '1 base unit is one cent', symbol: '$', decimal: 100 },
    anchors: { wage: 12000 }, economyTags: [], dials: { ...baseDials, sellFraction: 0.5 }, defaults: { travel: 'travel.intercity-train', rent: 'lodging.m-apartment-rent-medium' }, vocabulary: [], items: [],
    samples: ['a month of rent in a major city, medium apartment', '6 months of rent in a city', 'dinner for 2 at a fancy restaurant', 'flight 1500 miles', 'hire a lawyer for 2 days', 'taxi ride in the capital', 'buy a laptop', 'sell a used car'],
  }),
  scifi: () => ({
    id: 'scifi', name: 'Science fiction', blurb: 'Credits, blasters, cyberware and station rent.',
    baseline: 'other', lists: ['scifi'], currency: { denominations: [{ id: 'cr', name: 'credit', plural: 'credits', bu: 1, glyph: 'C' }], belowSmallest: 'round', note: '1 base unit is one credit' },
    anchors: { wage: 60 }, economyTags: [], dials: { ...baseDials }, defaults: { travel: 'travel.s-interstellar-passage', rent: 'lodging.s-station-apartment-rent' }, vocabulary: [], items: [],
  }),
};
export const SAMPLE_QUERIES = [
  'price for train ride between two major capital cities, 3 days travel expensive',
  'sell 5 rare potions black market rush',
  'how much for a night at an inn in the capital',
  'hire a skilled blacksmith for a week',
  'buy a longsword',
  'appraise a masterwork rapier',
  'sell 20 rations at a trading outpost',
  'wand during a siege',
];
