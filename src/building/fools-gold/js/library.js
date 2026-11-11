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
    'Socks;1sp;;;stockings, sock', 'Finery;15gp;;luxury;fancy clothes, formal wear, noble clothes', 'Hat;5sp;;;cap, bonnet, beret',
  ]),
  ...L('good', 'headwear', ['jewelry', 'crafted', 'luxury'], [
    'Crown;1000gp;;gold;royal crown', 'Diadem;250gp;;gold;tiara', 'Circlet;80gp;;;headband jewel', 'Coronet;400gp;;gold;noble crown',
  ]),
  ...L('good', 'animals', ['animal', 'living'], [
    'Rooster;2sp;;livestock;cock, cockerel', 'Hen;3sp;;livestock;hens', 'Duck;4sp;;livestock;geese, goose',
    'Rabbit;2sp;;livestock;bunny', 'Cat;1gp;;pet;kitten', 'Ram;4gp;;livestock;', 'Hawk;40gp;;trained;falcon, trained hawk',
  ]),
  ...L('good', 'plants', ['plant', 'raw'], [
    'Seeds;1cp;;;seed, seed packet, packet of seeds', 'Sapling;5sp;;;young tree, seedling', 'Herb bundle;2sp;;;herbs, bundle of herbs',
    'Flowers;1sp;;;bouquet, bunch of flowers', 'Rare flower;8gp;;;orchid',
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
    'T-shirt;15;;;t shirt, tee, shirt', 'Dress shirt;40', 'Dress;60;;;gown', 'Hat;20;;;cap', 'Socks;12;;;sock', 'Gloves;20;;;glove', 'Work boots;120;;;boots, boot', 'Dress shoes;90',
  ]),
  ...M('good', 'bedding', ['household', 'crafted'], ['Blanket;25;;;throw blanket, blankets', 'Wool blanket;70', 'Pillow;18', 'Bed sheets;40;;;sheets']),
  ...M('good', 'care', ['medicine', 'crafted'], ['Foot cream;9;;;toe cream, heel cream', 'Hand lotion;7;;;lotion', 'Sunscreen;12']),
  ...M('good', 'gear', ['tool', 'crafted'], ['Fire starter kit;15;;;fire kit, firestarter', 'Camping stove;35', 'Flashlight;15;;;torch']),
  ...M('good', 'plants', ['plant', 'raw'], ['Seed packet;3;;;seeds, seed', 'Potted plant;20;;;houseplant', 'Sapling;25;;;seedling', 'Flower bouquet;30;;;flowers, bouquet']),
  ...M('good', 'animals', ['animal', 'living'], ['Chicken;12;;livestock;hen, rooster', 'Sheep;250;;livestock', 'Goat;300;;livestock', 'Cow;1800;;livestock', 'Horse;3500;;livestock;pony', 'Adopted dog;300;;pet;dog, puppy', 'Adopted cat;150;;pet;cat, kitten']),
  ...M('good', 'explosives', ['weapon', 'volatile'], ['Firecrackers;10;;;fireworks, firecracker', 'Fireworks box;80']),
  ...M('good', 'paper', ['household'], ['Printer paper;8;;;ream of paper', 'Notebook;4;;;notepad']),
  ...M('service', 'fees', ['fee'], ['Parking fee;20;;;parking', 'Business permit;75;;;permit, license, licence', 'Late fee;35']),
  ...M('labor', 'hired', ['labor', 'service'], ['Tailoring job;25;;;tailor, alterations, hemming', 'Hair coloring;120;;;stylist, hair color', 'Tour guide;200;day;;guide']),
];
