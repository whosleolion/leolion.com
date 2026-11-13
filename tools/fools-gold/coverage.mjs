// How much of what a table would ask for does each calibrated world know? Prints the unknown rate and the misses.
// Usage: node tools/fools-gold/coverage.mjs [world]
import { presetWorld, normalizeWorld } from '../../src/building/fools-gold/js/store.js';
import { compileWorld } from '../../src/building/fools-gold/js/world.js';
import { parse } from '../../src/building/fools-gold/js/parser.js';
import { estimate } from '../../src/building/fools-gold/js/engine.js';
const L = s => s.split(',').map(x => x.trim()).filter(Boolean);
export const CORPUS = {
  srd: L(`abacus, amulet, arrows, backpack, bell, blanket, bread, bucket, candle, cheese, chain, chalk, climbers kit, cloak, crowbar, dice, fishing tackle, flask, grappling hook, hammer, healers kit, holy symbol, ink, ladder, lamp, lock, manacles, map, mirror, oil, parchment, perfume, pick, piton, pot, pouch, quiver, ration, rope, sack, scale, shovel, whistle, soap, spyglass, tent, tinderbox, torch, vial, waterskin,
    camel, elephant, mastiff, pony, donkey, mule, draft horse, warhorse, riding horse, saddle, bit and bridle, saddlebags, carriage, sled, wagon, galley, keelboat, longship, rowboat, sailing ship, warship,
    ale, wine, meat, feast, stew, mead, whiskey, bath, laundry, tavern meal, stabling, ferry, messenger, scribe, sage, healer, priest, wizard, alchemist, tutor, bard, musician, jester, torchbearer, porter, cook, guard, mercenary, spy, thief, blacksmith, carpenter, tailor, cobbler,
    shoes, boots, hat, gloves, belt, robe, dress, lute, harp, flute, drum, horn, bagpipes, lyre, book, scroll, mug, plate, spoon, candlestick,
    potion of invisibility, wand of magic missiles, cloak of elvenkind, sword +1, staff of power, vorpal sword, flame tongue, amulet of health, boots of speed, deck of many things, crystal ball, rod of lordly might, ring of invisibility, bag of holding, potion of flying, potion of giant strength, scroll of resurrection, +1 armor, +2 shield, adamantine armor, mithral chain shirt, dragon scale mail, holy water, poison, antitoxin, thieves tools, disguise kit, forgery kit, herbalism kit, alchemists supplies, smiths tools, navigators tools, tinkers tools, cartographers tools, calligraphers supplies, brewers supplies, cooks utensils, glassblowers tools, jewelers tools, leatherworkers tools, masons tools, painters supplies, potters tools, weavers tools, woodcarvers tools,
    house, cottage, inn, tavern, shop, castle, tower, farm, mill, temple, guild hall, stronghold, ruby, emerald, pearl, diamond, sapphire, garnet, opal, jade, topaz, amethyst, painting, statue, tapestry, goblet, crown, tiara, necklace, ring, brooch, wheat, flour, iron, copper, silver, gold, salt, spices, silk, cotton, linen, wool, fur, leather, timber, saffron, pepper, cinnamon, ginger, chicken, cow, pig, sheep, goat, dog, cat, hawk, falcon, raven, owl, rat, horse, coffin, sarcophagus, bed, chair, table, candelabra, chandelier, barrel of ale, keg of beer, bottle of wine, loaf of bread, wheel of cheese, side of beef, sack of grain, bag of flour, bolt of cloth, bale of hay, cord of wood, ton of coal`),
  modern: L(`coffee, tea, soda, water bottle, sandwich, burger, pizza, salad, steak, sushi, taco, fries, ice cream, chocolate, beer, wine, whiskey, cocktail, groceries, milk, eggs, bread, apple, banana, rice, pasta,
    taxi, uber, bus ticket, subway, train ticket, plane ticket, rental car, gas, parking, toll, bike, scooter, motorcycle, used car, new car, truck, boat,
    hotel, motel, airbnb, apartment rent, house rent, mortgage, utilities, internet, phone plan, electricity bill, water bill, insurance, tuition, childcare,
    smartphone, laptop, tablet, tv, headphones, camera, drone, console, speaker, charger, printer, monitor, keyboard, mouse, router, smartwatch,
    jeans, t-shirt, shoes, sneakers, boots, coat, jacket, suit, dress, hat, sunglasses, watch, handbag, wallet, backpack, umbrella, ring, necklace,
    doctor, dentist, therapist, ambulance, hospital, prescription, vitamins, bandages, painkillers, haircut, massage, manicure, gym, yoga class, tattoo,
    lawyer, accountant, plumber, electrician, locksmith, mechanic, contractor, cleaner, babysitter, tutor, photographer, dj, caterer, florist, notary, translator, private investigator, bodyguard, security guard,
    pistol, rifle, shotgun, knife, crowbar, baseball bat, taser, pepper spray, handcuffs, bulletproof vest, lockpick set, flashlight, rope, duct tape, tent, sleeping bag, first aid kit, fire extinguisher, generator, chainsaw, toolbox, ladder,
    funeral, wedding, concert ticket, movie ticket, museum ticket, theme park ticket, restaurant dinner, bar tab, bottle service, flowers, gift card, newspaper, magazine, book, video game, guitar, piano, bicycle, couch, mattress, refrigerator, washing machine, microwave, air conditioner, dog, cat, vet visit, dog food, fish tank`),
  scifi: L(`pulse pistol, pulse rifle, blaster, laser pistol, plasma rifle, shotgun, grenade, vibro blade, stun baton, combat armor, body armor, shield generator, medkit, stim pack, oxygen canister, space suit, helmet, jetpack, grav boots, cyberdeck, cybernetic arm, cybernetic eye, neural implant, scanner, drone, datapad, comm unit, translator, lockpick, hacking tool, fake id,
    ration bar, meal, drink, hotel room, hab pod, apartment rent, docking fee, ship fuel, ship repairs, ship rental, shuttle charter, interstellar passage, cargo hold, escape pod, robot, android, pet, medic, pilot, engineer, hacker, smuggler, bounty hunter, mercenary, bodyguard, crew,
    laptop, phone, vehicle, hoverbike, rover, spaceship, freighter, fighter, starship, warp drive, reactor, jump drive, sensor array, weapon mount, missile`),
};
export function run(id) {
  const w = presetWorld(id === 'vcm' ? 'vcm' : id); normalizeWorld(w); const c = compileWorld(w);
  const miss = [], total = CORPUS[id].length;
  for (const s of CORPUS[id]) { const q = parse(s, c).query; const e = q.subject ? estimate(q, c) : null; if (!(e && e.ok)) miss.push(s); }
  return { total, miss };
}
if (process.argv[1] && process.argv[1].endsWith('coverage.mjs')) {
  for (const id of process.argv[2] ? [process.argv[2]] : Object.keys(CORPUS)) { const r = run(id); console.log(`\n${id}: ${r.total - r.miss.length}/${r.total} known (${Math.round(100 * (r.total - r.miss.length) / r.total)}%)\n  missing: ${r.miss.join('; ')}`); }
}
