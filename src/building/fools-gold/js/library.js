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
