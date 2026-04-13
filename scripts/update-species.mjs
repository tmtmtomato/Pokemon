#!/usr/bin/env node
/**
 * Update species.json to match Pokemon Champions roster.
 * - Remove Pokemon not in Champions
 * - Add Beedrill
 * - Add/update mega evolution data for all 59 mega-capable Pokemon
 * - Fix Floette base stats (Eternal Flower form)
 * - Fix mega stone name discrepancies
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECIES_PATH = resolve(__dirname, '../src/data/species.json');

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf-8'));

// ============================================================
// 1. Define the Champions Pokemon roster (Serebii-verified)
// ============================================================
const CHAMPIONS_POKEMON = new Set([
  // --- Base roster (182 from Serebii /pokemonchampions/pokemon.shtml) ---
  'Venusaur', 'Charizard', 'Blastoise', 'Beedrill', 'Pidgeot', 'Arbok',
  'Pikachu', 'Raichu', 'Clefable', 'Ninetales', 'Arcanine', 'Alakazam',
  'Machamp', 'Victreebel', 'Slowbro', 'Gengar', 'Kangaskhan', 'Starmie',
  'Pinsir', 'Tauros', 'Gyarados', 'Ditto', 'Vaporeon', 'Jolteon', 'Flareon',
  'Aerodactyl', 'Snorlax', 'Dragonite', 'Meganium', 'Typhlosion', 'Feraligatr',
  'Ariados', 'Ampharos', 'Azumarill', 'Politoed', 'Espeon', 'Umbreon',
  'Slowking', 'Forretress', 'Steelix', 'Scizor', 'Heracross', 'Skarmory',
  'Houndoom', 'Tyranitar', 'Pelipper', 'Gardevoir', 'Sableye', 'Aggron',
  'Medicham', 'Manectric', 'Sharpedo', 'Camerupt', 'Torkoal', 'Altaria',
  'Milotic', 'Castform', 'Banette', 'Chimecho', 'Absol', 'Glalie',
  'Torterra', 'Infernape', 'Empoleon', 'Luxray', 'Roserade', 'Rampardos',
  'Bastiodon', 'Lopunny', 'Spiritomb', 'Garchomp', 'Lucario', 'Hippowdon',
  'Toxicroak', 'Abomasnow', 'Weavile', 'Rhyperior', 'Leafeon', 'Glaceon',
  'Gliscor', 'Mamoswine', 'Gallade', 'Froslass', 'Rotom',
  'Serperior', 'Emboar', 'Samurott', 'Watchog', 'Liepard', 'Simisage',
  'Simisear', 'Simipour', 'Excadrill', 'Audino', 'Conkeldurr', 'Whimsicott',
  'Krookodile', 'Cofagrigus', 'Garbodor', 'Zoroark', 'Reuniclus', 'Vanilluxe',
  'Emolga', 'Chandelure', 'Beartic', 'Stunfisk', 'Golurk', 'Hydreigon',
  'Volcarona', 'Chesnaught', 'Delphox', 'Greninja', 'Diggersby', 'Talonflame',
  'Vivillon', 'Floette', 'Florges', 'Pangoro', 'Furfrou', 'Meowstic',
  'Aegislash', 'Aromatisse', 'Slurpuff', 'Clawitzer', 'Heliolisk', 'Tyrantrum',
  'Aurorus', 'Sylveon', 'Hawlucha', 'Dedenne', 'Goodra', 'Klefki', 'Trevenant',
  'Gourgeist', 'Avalugg', 'Noivern', 'Decidueye', 'Incineroar', 'Primarina',
  'Toucannon', 'Crabominable', 'Lycanroc', 'Toxapex', 'Mudsdale', 'Araquanid',
  'Salazzle', 'Tsareena', 'Oranguru', 'Passimian', 'Mimikyu', 'Drampa',
  'Kommo-o', 'Corviknight', 'Flapple', 'Appletun', 'Sandaconda', 'Polteageist',
  'Hatterene', 'Mr. Rime', 'Runerigus', 'Alcremie', 'Morpeko', 'Dragapult',
  'Wyrdeer', 'Kleavor', 'Basculegion', 'Sneasler', 'Meowscarada', 'Skeledirge',
  'Quaquaval', 'Maushold', 'Garganacl', 'Armarouge', 'Ceruledge', 'Bellibolt',
  'Scovillain', 'Espathra', 'Tinkaton', 'Palafin', 'Orthworm', 'Glimmora',
  'Farigiraf', 'Kingambit', 'Sinistcha', 'Archaludon', 'Hydrapple',

  // --- Alternate forms (Serebii Pokedex-verified) ---
  'Ninetales-Alola',
  'Arcanine-Hisui',
  'Slowbro-Galar',
  'Slowking-Galar',
  'Tauros-Paldea-Combat', 'Tauros-Paldea-Blaze', 'Tauros-Paldea-Aqua',
  'Rotom-Heat', 'Rotom-Wash', 'Rotom-Mow', 'Rotom-Frost', 'Rotom-Fan',
  'Lycanroc-Dusk', 'Lycanroc-Midnight',
  'Decidueye-Hisui',
  'Typhlosion-Hisui',
  'Samurott-Hisui',
  'Zoroark-Hisui',
  'Goodra-Hisui',
  'Avalugg-Hisui',
  'Stunfisk-Galar',
  'Basculegion-F',
  'Meowstic-F',
  'Maushold-Four',
  'Sinistcha-Masterpiece',
  'Palafin-Hero',
]);

// ============================================================
// 2. Define mega evolution data
// ============================================================
const MEGA_DATA = {
  // --- Returning megas (Gen 6-7 stats, verified on Serebii Champions Pokedex) ---
  'Venusaur': { stone: 'Venusaurite', types: ['Grass', 'Poison'], ability: 'Thick Fat',
    baseStats: { hp: 80, atk: 100, def: 123, spa: 122, spd: 120, spe: 80 } },
  'Blastoise': { stone: 'Blastoisinite', types: ['Water'], ability: 'Mega Launcher',
    baseStats: { hp: 79, atk: 103, def: 120, spa: 135, spd: 115, spe: 78 } },
  'Beedrill': { stone: 'Beedrillite', types: ['Bug', 'Poison'], ability: 'Adaptability',
    baseStats: { hp: 65, atk: 150, def: 40, spa: 15, spd: 80, spe: 145 } },
  'Pidgeot': { stone: 'Pidgeotite', types: ['Normal', 'Flying'], ability: 'No Guard',
    baseStats: { hp: 83, atk: 80, def: 80, spa: 135, spd: 80, spe: 121 } },
  'Alakazam': { stone: 'Alakazite', types: ['Psychic'], ability: 'Trace',
    baseStats: { hp: 55, atk: 50, def: 65, spa: 175, spd: 105, spe: 150 } },
  'Slowbro': { stone: 'Slowbronite', types: ['Water', 'Psychic'], ability: 'Shell Armor',
    baseStats: { hp: 95, atk: 75, def: 180, spa: 130, spd: 80, spe: 30 } },
  'Gengar': { stone: 'Gengarite', types: ['Ghost', 'Poison'], ability: 'Shadow Tag',
    baseStats: { hp: 60, atk: 65, def: 80, spa: 170, spd: 95, spe: 130 } },
  'Kangaskhan': { stone: 'Kangaskhanite', types: ['Normal'], ability: 'Parental Bond',
    baseStats: { hp: 105, atk: 125, def: 100, spa: 60, spd: 100, spe: 100 } },
  'Pinsir': { stone: 'Pinsirite', types: ['Bug', 'Flying'], ability: 'Aerilate',
    baseStats: { hp: 65, atk: 155, def: 120, spa: 65, spd: 90, spe: 105 } },
  'Gyarados': { stone: 'Gyaradosite', types: ['Water', 'Dark'], ability: 'Mold Breaker',
    baseStats: { hp: 95, atk: 155, def: 109, spa: 70, spd: 130, spe: 81 } },
  'Aerodactyl': { stone: 'Aerodactylite', types: ['Rock', 'Flying'], ability: 'Tough Claws',
    baseStats: { hp: 80, atk: 135, def: 85, spa: 70, spd: 95, spe: 150 } },
  'Ampharos': { stone: 'Ampharosite', types: ['Electric', 'Dragon'], ability: 'Mold Breaker',
    baseStats: { hp: 90, atk: 95, def: 105, spa: 165, spd: 110, spe: 45 } },
  'Steelix': { stone: 'Steelixite', types: ['Steel', 'Ground'], ability: 'Sand Force',
    baseStats: { hp: 75, atk: 125, def: 230, spa: 55, spd: 95, spe: 30 } },
  'Scizor': { stone: 'Scizorite', types: ['Bug', 'Steel'], ability: 'Technician',
    baseStats: { hp: 70, atk: 150, def: 140, spa: 65, spd: 100, spe: 75 } },
  'Heracross': { stone: 'Heracronite', types: ['Bug', 'Fighting'], ability: 'Skill Link',
    baseStats: { hp: 80, atk: 185, def: 115, spa: 40, spd: 105, spe: 75 } },
  'Houndoom': { stone: 'Houndoominite', types: ['Dark', 'Fire'], ability: 'Solar Power',
    baseStats: { hp: 75, atk: 90, def: 90, spa: 140, spd: 90, spe: 115 } },
  'Tyranitar': { stone: 'Tyranitarite', types: ['Rock', 'Dark'], ability: 'Sand Stream',
    baseStats: { hp: 100, atk: 164, def: 150, spa: 95, spd: 120, spe: 71 } },
  'Sableye': { stone: 'Sablenite', types: ['Dark', 'Ghost'], ability: 'Magic Bounce',
    baseStats: { hp: 50, atk: 85, def: 125, spa: 85, spd: 115, spe: 20 } },
  'Aggron': { stone: 'Aggronite', types: ['Steel'], ability: 'Filter',
    baseStats: { hp: 70, atk: 140, def: 230, spa: 60, spd: 80, spe: 50 } },
  'Medicham': { stone: 'Medichamite', types: ['Fighting', 'Psychic'], ability: 'Pure Power',
    baseStats: { hp: 60, atk: 100, def: 85, spa: 80, spd: 85, spe: 100 } },
  'Manectric': { stone: 'Manectite', types: ['Electric'], ability: 'Intimidate',
    baseStats: { hp: 70, atk: 75, def: 80, spa: 135, spd: 80, spe: 135 } },
  'Sharpedo': { stone: 'Sharpedonite', types: ['Water', 'Dark'], ability: 'Strong Jaw',
    baseStats: { hp: 70, atk: 140, def: 70, spa: 110, spd: 65, spe: 105 } },
  'Camerupt': { stone: 'Cameruptite', types: ['Fire', 'Ground'], ability: 'Sheer Force',
    baseStats: { hp: 70, atk: 120, def: 100, spa: 145, spd: 105, spe: 20 } },
  'Altaria': { stone: 'Altarianite', types: ['Dragon', 'Fairy'], ability: 'Pixilate',
    baseStats: { hp: 75, atk: 110, def: 110, spa: 110, spd: 105, spe: 80 } },
  'Banette': { stone: 'Banettite', types: ['Ghost'], ability: 'Prankster',
    baseStats: { hp: 64, atk: 165, def: 75, spa: 93, spd: 83, spe: 75 } },
  'Absol': { stone: 'Absolite', types: ['Dark'], ability: 'Magic Bounce',
    baseStats: { hp: 65, atk: 150, def: 60, spa: 115, spd: 60, spe: 115 } },
  'Glalie': { stone: 'Glalitite', types: ['Ice'], ability: 'Refrigerate',
    baseStats: { hp: 80, atk: 120, def: 80, spa: 120, spd: 80, spe: 100 } },
  'Lopunny': { stone: 'Lopunnite', types: ['Normal', 'Fighting'], ability: 'Scrappy',
    baseStats: { hp: 65, atk: 136, def: 94, spa: 54, spd: 96, spe: 135 } },
  'Garchomp': { stone: 'Garchompite', types: ['Dragon', 'Ground'], ability: 'Sand Force',
    baseStats: { hp: 108, atk: 170, def: 115, spa: 120, spd: 95, spe: 92 } },
  'Lucario': { stone: 'Lucarionite', types: ['Fighting', 'Steel'], ability: 'Adaptability',
    baseStats: { hp: 70, atk: 145, def: 88, spa: 140, spd: 70, spe: 112 } },
  'Abomasnow': { stone: 'Abomasite', types: ['Grass', 'Ice'], ability: 'Snow Warning',
    baseStats: { hp: 90, atk: 132, def: 105, spa: 132, spd: 105, spe: 30 } },
  'Gallade': { stone: 'Galladite', types: ['Psychic', 'Fighting'], ability: 'Inner Focus',
    baseStats: { hp: 68, atk: 165, def: 95, spa: 65, spd: 115, spe: 110 } },
  'Audino': { stone: 'Audinite', types: ['Normal', 'Fairy'], ability: 'Healer',
    baseStats: { hp: 103, atk: 60, def: 126, spa: 80, spd: 126, spe: 50 } },
  'Gardevoir': { stone: 'Gardevoirite', types: ['Psychic', 'Fairy'], ability: 'Pixilate',
    baseStats: { hp: 68, atk: 85, def: 65, spa: 165, spd: 135, spe: 100 } },

  // --- Champions-exclusive new megas (Serebii-verified stats) ---
  'Clefable': { stone: 'Clefablite', types: ['Fairy', 'Flying'], ability: 'Magic Bounce',
    baseStats: { hp: 95, atk: 80, def: 93, spa: 135, spd: 110, spe: 70 } },
  'Victreebel': { stone: 'Victreebelite', types: ['Grass', 'Poison'], ability: 'Innards Out',
    baseStats: { hp: 80, atk: 125, def: 85, spa: 135, spd: 95, spe: 70 } },
  'Starmie': { stone: 'Starminite', types: ['Water', 'Psychic'], ability: 'Huge Power',
    baseStats: { hp: 60, atk: 100, def: 105, spa: 130, spd: 105, spe: 120 } },
  'Dragonite': { stone: 'Dragoninite', types: ['Dragon', 'Flying'], ability: 'Multiscale',
    baseStats: { hp: 91, atk: 124, def: 115, spa: 145, spd: 125, spe: 100 } },
  'Meganium': { stone: 'Meganiumite', types: ['Grass', 'Fairy'], ability: 'Mega Sol',
    baseStats: { hp: 80, atk: 92, def: 115, spa: 143, spd: 115, spe: 80 } },
  'Feraligatr': { stone: 'Feraligite', types: ['Water', 'Dragon'], ability: 'Dragonize',
    baseStats: { hp: 85, atk: 160, def: 125, spa: 89, spd: 93, spe: 78 } },
  'Skarmory': { stone: 'Skarmorite', types: ['Steel', 'Flying'], ability: 'Stalwart',
    baseStats: { hp: 65, atk: 140, def: 110, spa: 40, spd: 100, spe: 110 } },
  'Chimecho': { stone: 'Chimechite', types: ['Psychic', 'Steel'], ability: 'Levitate',
    baseStats: { hp: 75, atk: 50, def: 110, spa: 135, spd: 120, spe: 65 } },
  'Froslass': { stone: 'Froslassite', types: ['Ice', 'Ghost'], ability: 'Snow Warning',
    baseStats: { hp: 70, atk: 80, def: 70, spa: 140, spd: 100, spe: 120 } },
  'Emboar': { stone: 'Emboarite', types: ['Fire', 'Fighting'], ability: 'Mold Breaker',
    baseStats: { hp: 110, atk: 148, def: 75, spa: 110, spd: 110, spe: 75 } },
  'Excadrill': { stone: 'Excadrite', types: ['Ground', 'Steel'], ability: 'Piercing Drill',
    baseStats: { hp: 110, atk: 165, def: 100, spa: 65, spd: 65, spe: 103 } },
  'Chandelure': { stone: 'Chandelurite', types: ['Ghost', 'Fire'], ability: 'Infiltrator',
    baseStats: { hp: 60, atk: 75, def: 110, spa: 175, spd: 110, spe: 90 } },
  'Golurk': { stone: 'Golurkite', types: ['Ground', 'Ghost'], ability: 'Unseen Fist',
    baseStats: { hp: 89, atk: 159, def: 105, spa: 70, spd: 105, spe: 55 } },
  'Chesnaught': { stone: 'Chesnaughtite', types: ['Grass', 'Fighting'], ability: 'Bulletproof',
    baseStats: { hp: 88, atk: 137, def: 172, spa: 74, spd: 115, spe: 44 } },
  'Delphox': { stone: 'Delphoxite', types: ['Fire', 'Psychic'], ability: 'Levitate',
    baseStats: { hp: 75, atk: 69, def: 72, spa: 159, spd: 125, spe: 134 } },
  'Greninja': { stone: 'Greninjite', types: ['Water', 'Dark'], ability: 'Protean',
    baseStats: { hp: 72, atk: 125, def: 77, spa: 133, spd: 81, spe: 142 } },
  'Floette': { stone: 'Floettite', types: ['Fairy'], ability: 'Fairy Aura',
    baseStats: { hp: 74, atk: 85, def: 87, spa: 155, spd: 148, spe: 102 } },
  'Meowstic': { stone: 'Meowsticite', types: ['Psychic'], ability: 'Trace',
    baseStats: { hp: 74, atk: 48, def: 76, spa: 143, spd: 101, spe: 124 } },
  'Hawlucha': { stone: 'Hawluchanite', types: ['Fighting', 'Flying'], ability: 'No Guard',
    baseStats: { hp: 78, atk: 137, def: 100, spa: 74, spd: 93, spe: 118 } },
  'Crabominable': { stone: 'Crabominite', types: ['Fighting', 'Ice'], ability: 'Iron Fist',
    baseStats: { hp: 97, atk: 157, def: 122, spa: 62, spd: 107, spe: 33 } },
  'Drampa': { stone: 'Drampanite', types: ['Normal', 'Dragon'], ability: 'Berserk',
    baseStats: { hp: 78, atk: 85, def: 110, spa: 160, spd: 116, spe: 36 } },
  'Scovillain': { stone: 'Scovillainite', types: ['Grass', 'Fire'], ability: 'Spicy Spray',
    baseStats: { hp: 65, atk: 138, def: 85, spa: 138, spd: 85, spe: 75 } },
  'Glimmora': { stone: 'Glimmoranite', types: ['Rock', 'Poison'], ability: 'Adaptability',
    baseStats: { hp: 83, atk: 90, def: 105, spa: 150, spd: 96, spe: 101 } },
};

// Charizard special: has two megas (X and Y)
const CHARIZARD_MEGA_X = {
  stone: 'Charizardite X', types: ['Fire', 'Dragon'], ability: 'Tough Claws',
  baseStats: { hp: 78, atk: 130, def: 111, spa: 130, spd: 85, spe: 100 }
};

// ============================================================
// 3. Define Beedrill (missing from species.json)
// ============================================================
const BEEDRILL_DATA = {
  id: 15,
  name: 'Beedrill',
  types: ['Bug', 'Poison'],
  baseStats: { hp: 65, atk: 90, def: 40, spa: 45, spd: 80, spe: 75 },
  weightKg: 29.5,
  abilities: ['Swarm', 'Sniper'],
};

// ============================================================
// 4. Fix Floette base stats (Eternal Flower form in Champions)
// ============================================================
const FLOETTE_ETERNAL = {
  hp: 74, atk: 65, def: 67, spa: 125, spd: 128, spe: 92
};

// ============================================================
// 5. Process species.json
// ============================================================

const result = {};
let removed = [];
let kept = [];
let megaAdded = [];
let megaUpdated = [];

// Add Beedrill first
result['Beedrill'] = BEEDRILL_DATA;

for (const [name, data] of Object.entries(species)) {
  if (!CHAMPIONS_POKEMON.has(name)) {
    removed.push(name);
    continue;
  }
  kept.push(name);

  // Fix Floette base stats to Eternal Flower form
  if (name === 'Floette') {
    data.baseStats = { ...FLOETTE_ETERNAL };
    data.isNFE = false; // Eternal Flower is not NFE
  }

  // Add/update mega evolution data
  const megaInfo = MEGA_DATA[name];
  if (megaInfo) {
    const existingMega = data.mega;
    data.mega = {
      stone: megaInfo.stone,
      types: megaInfo.types,
      baseStats: megaInfo.baseStats,
      ability: megaInfo.ability,
    };
    if (existingMega) {
      megaUpdated.push(name);
    } else {
      megaAdded.push(name);
    }
  } else if (data.mega) {
    // Pokemon has mega data but shouldn't (e.g., Metagross)
    console.log(`  WARNING: Removing mega data for ${name} (not in Champions mega list)`);
    delete data.mega;
  }

  // Special: Charizard has two megas
  if (name === 'Charizard') {
    data.megaX = CHARIZARD_MEGA_X;
  }

  result[name] = data;
}

// Sort by id, then by name for forms
const sorted = Object.entries(result).sort((a, b) => {
  if (a[1].id !== b[1].id) return a[1].id - b[1].id;
  return a[0].localeCompare(b[0]);
});

const output = {};
for (const [name, data] of sorted) {
  output[name] = data;
}

writeFileSync(SPECIES_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');

// ============================================================
// 6. Report
// ============================================================
console.log('=== Species.json Update Report ===');
console.log(`Kept: ${kept.length} Pokemon`);
console.log(`Removed: ${removed.length} Pokemon`);
console.log(`Mega added: ${megaAdded.length} (${megaAdded.join(', ')})`);
console.log(`Mega updated: ${megaUpdated.length} (${megaUpdated.join(', ')})`);
console.log(`Beedrill added: yes`);
console.log(`Floette base stats fixed to Eternal Flower`);
console.log();
console.log('Removed Pokemon:');
removed.forEach(n => console.log(`  - ${n}`));

// Verify all Champions Pokemon are present
const missing = [];
for (const name of CHAMPIONS_POKEMON) {
  if (!output[name] && name !== 'Beedrill') {
    missing.push(name);
  }
}
if (missing.length > 0) {
  console.log();
  console.log('WARNING: Missing Champions Pokemon (not in original data):');
  missing.forEach(n => console.log(`  - ${n}`));
}
