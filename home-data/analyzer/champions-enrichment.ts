/**
 * champions-enrichment.ts
 *
 * Adds all missing Pokemon Champions species to src/data/species.json.
 * Sources:
 *   - Showdown BattlePokedex (home-data/storage/raw-recon/30-showdown-pokedex.js)
 *   - Hardcoded Champions-exclusive mega data
 *   - Champions dex list from Serebii
 *
 * Usage:
 *   npx tsx home-data/analyzer/champions-enrichment.ts [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const RECON_DIR = resolve(ROOT, "home-data/storage/raw-recon");
const SPECIES_PATH = resolve(ROOT, "src/data/species.json");
const ROSTER_PATH = resolve(ROOT, "home-data/storage/champions-roster.json");

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadShowdownExport(filename: string): Record<string, any> {
  const raw = readFileSync(resolve(RECON_DIR, filename), "utf-8");
  const match = raw.match(/=\s*(\{[\s\S]+\})\s*;?\s*$/);
  if (!match) throw new Error(`Cannot parse ${filename}`);
  return new Function(`return ${match[1]}`)();
}

function loadJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function toShowdownKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-'.:%]+/g, "");
}

// ── Types ────────────────────────────────────────────────────────────────────

interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

interface MegaData {
  stone: string;
  types: string[];
  baseStats: BaseStats;
  ability: string;
  weightKg?: number;
}

interface SpeciesEntry {
  id: number;
  name: string;
  types: string[];
  baseStats: BaseStats;
  weightKg: number;
  abilities: string[];
  isNFE?: boolean;
  mega?: MegaData;
}

// ── Champions Dex Numbers ────────────────────────────────────────────────────
// From Serebii. Also includes 549 (Lilligant-Hisui), 876 (Indeedee), 901 (Ursaluna).

const CHAMPIONS_DEX_NUMBERS: number[] = [
  // Kanto
  3, 6, 9, 15, 18, 24, 25, 26, 36, 38, 59, 65, 68, 71, 80, 94, 115, 121,
  127, 128, 130, 132, 134, 135, 136, 142, 143, 149,
  // Johto
  154, 157, 160, 168, 181, 184, 186, 196, 197, 199, 205, 208, 212, 214, 227,
  229, 248,
  // Hoenn
  279, 282, 302, 306, 308, 310, 319, 323, 324, 334, 350, 351, 354, 358, 359,
  362,
  // Sinnoh
  389, 392, 395, 405, 407, 409, 411, 428, 442, 445, 448, 450, 454, 460, 461,
  464, 470, 471, 472, 473, 475, 478, 479,
  // Unova
  497, 500, 503, 505, 510, 512, 514, 516, 530, 531, 534, 547, 553, 563, 569,
  571, 579, 584, 587, 609, 614, 618, 623, 635, 637,
  // Kalos
  652, 655, 658, 660, 663, 666, 670, 671, 675, 676, 678, 681, 683, 685, 693,
  695, 697, 699, 700, 701, 702, 706, 707, 709, 711, 713, 715,
  // Alola
  724, 727, 730, 733, 740, 745, 748, 750, 752, 758, 763, 765, 766, 778, 780,
  784,
  // Galar/Hisui
  823, 841, 842, 844, 855, 858, 866, 867, 869, 877, 887, 899, 900, 902, 903,
  // Paldea
  908, 911, 914, 925, 934, 936, 937, 939, 952, 956, 959, 964, 968, 970, 981,
  983, 1013, 1018, 1019,
  // Missing from dex list but needed for forms
  549, // Lilligant (for Lilligant-Hisui)
  876, // Indeedee / Indeedee-F
  901, // Ursaluna
];

// Deduplicate
const DEX_NUMBERS = [...new Set(CHAMPIONS_DEX_NUMBERS)].sort((a, b) => a - b);

// ── Regional Variants & Alternate Forms ──────────────────────────────────────
// These are forms that exist as separate entries in species.json (not just base)

const CHAMPIONS_FORMS: string[] = [
  // Alolan
  "Raichu-Alola",
  "Ninetales-Alola",
  // Galarian
  "Slowbro-Galar",
  "Slowking-Galar",
  "Stunfisk-Galar",
  // Hisuian
  "Arcanine-Hisui",
  "Typhlosion-Hisui",
  "Samurott-Hisui",
  "Lilligant-Hisui",
  "Zoroark-Hisui",
  "Goodra-Hisui",
  "Avalugg-Hisui",
  "Decidueye-Hisui",
  // Paldean Tauros
  "Tauros-Paldea-Combat",
  "Tauros-Paldea-Blaze",
  "Tauros-Paldea-Aqua",
  // Rotom forms
  "Rotom-Wash",
  "Rotom-Heat",
  "Rotom-Mow",
  "Rotom-Frost",
  "Rotom-Fan",
  // Lycanroc forms
  "Lycanroc-Midnight",
  "Lycanroc-Dusk",
  // Palafin Hero
  "Palafin-Hero",
  // Basculegion-F
  "Basculegion-F",
  // Indeedee-F
  "Indeedee-F",
  // Maushold-Four
  "Maushold-Four",
  // Sinistcha-Masterpiece
  "Sinistcha-Masterpiece",
  // Meowstic-F
  "Meowstic-F",
];

// ── Standard Showdown Megas ──────────────────────────────────────────────────
// These Pokemon have mega data in the standard Showdown Pokedex.
// Key: base species name, Value: showdown key for mega entry

const STANDARD_MEGAS: Record<string, string> = {
  Venusaur: "venusaurmega",
  Blastoise: "blastoisemega",
  Beedrill: "beedrillmega",
  Pidgeot: "pidgeotmega",
  Alakazam: "alakazammega",
  Slowbro: "slowbromega",
  // Gengar: already has mega
  // Kangaskhan: already has mega
  Pinsir: "pinsirmega",
  Gyarados: "gyaradosmega",
  Aerodactyl: "aerodactylmega",
  Ampharos: "ampharosmega",
  Steelix: "steelixmega",
  // Scizor: already has mega
  Heracross: "heracrossmega",
  Houndoom: "houndoommega",
  // Tyranitar: already has mega
  // Gardevoir: already has mega
  Sableye: "sableyemega",
  Aggron: "aggronmega",
  Medicham: "medichammega",
  Manectric: "manectricmega",
  Sharpedo: "sharpedomega",
  Camerupt: "cameruptmega",
  Altaria: "altariamega",
  Banette: "banettemega",
  Absol: "absolmega",
  Glalie: "glaliemega",
  Lopunny: "lopunnymega",
  // Garchomp: already has mega
  // Lucario: already has mega
  // Abomasnow: already has mega
  Gallade: "gallademega",
  Audino: "audinomega",
  // Metagross: already has mega
  // Charizard: already has Y mega, we'll add X as megaX
};

// ── Champions-Exclusive Megas (hardcoded) ────────────────────────────────────
// These are NOT in the standard Showdown Pokedex (but may be in the modded one).
// We hardcode them from the spec to ensure correctness.

interface ChampionsMegaSpec {
  species: string;
  types: string[];
  baseStats: BaseStats;
  ability: string;
  stone: string;
}

const CHAMPIONS_EXCLUSIVE_MEGAS: ChampionsMegaSpec[] = [
  {
    species: "Clefable",
    types: ["Fairy", "Flying"],
    baseStats: { hp: 95, atk: 80, def: 93, spa: 135, spd: 110, spe: 70 },
    ability: "Magic Bounce",
    stone: "Clefablite",
  },
  {
    species: "Victreebel",
    types: ["Grass", "Poison"],
    baseStats: { hp: 80, atk: 125, def: 85, spa: 135, spd: 95, spe: 70 },
    ability: "Innards Out",
    stone: "Victreebelite",
  },
  {
    species: "Starmie",
    types: ["Water", "Psychic"],
    baseStats: { hp: 60, atk: 100, def: 105, spa: 130, spd: 105, spe: 120 },
    ability: "Huge Power",
    stone: "Starmiite",
  },
  // Dragonite-Mega: ALREADY IN species.json
  // Meganium-Mega: ALREADY IN species.json
  // Feraligatr-Mega: ALREADY IN species.json
  {
    species: "Skarmory",
    types: ["Steel", "Flying"],
    baseStats: { hp: 65, atk: 140, def: 110, spa: 40, spd: 100, spe: 110 },
    ability: "Stalwart",
    stone: "Skarmorite",
  },
  // Froslass-Mega: ALREADY IN species.json
  // Emboar-Mega: ALREADY IN species.json
  {
    species: "Excadrill",
    types: ["Ground", "Steel"],
    baseStats: { hp: 110, atk: 165, def: 100, spa: 65, spd: 65, spe: 103 },
    ability: "Unseen Fist",
    stone: "Excadrillite",
  },
  {
    species: "Chandelure",
    types: ["Ghost", "Fire"],
    baseStats: { hp: 60, atk: 75, def: 110, spa: 175, spd: 110, spe: 90 },
    ability: "Infiltrator",
    stone: "Chandelurite",
  },
  {
    species: "Golurk",
    types: ["Ground", "Ghost"],
    baseStats: { hp: 89, atk: 159, def: 105, spa: 70, spd: 105, spe: 55 },
    ability: "Unseen Fist",
    stone: "Golurkite",
  },
  {
    species: "Chesnaught",
    types: ["Grass", "Fighting"],
    baseStats: { hp: 88, atk: 137, def: 172, spa: 74, spd: 115, spe: 44 },
    ability: "Bulletproof",
    stone: "Chesnaughtite",
  },
  // Delphox-Mega: ALREADY IN species.json
  {
    species: "Greninja",
    types: ["Water", "Dark"],
    baseStats: { hp: 72, atk: 125, def: 77, spa: 133, spd: 81, spe: 142 },
    ability: "Protean",
    stone: "Greninjaite",
  },
  {
    species: "Hawlucha",
    types: ["Fighting", "Flying"],
    baseStats: { hp: 78, atk: 137, def: 100, spa: 74, spd: 93, spe: 118 },
    ability: "No Guard",
    stone: "Hawluchite",
  },
  {
    species: "Floette",
    types: ["Fairy"],
    baseStats: { hp: 74, atk: 85, def: 87, spa: 155, spd: 148, spe: 102 },
    ability: "Fairy Aura",
    stone: "Floettite",
  },
  {
    species: "Meowstic",
    types: ["Psychic"],
    baseStats: { hp: 74, atk: 48, def: 76, spa: 143, spd: 101, spe: 124 },
    ability: "Trace",
    stone: "Meowstite",
  },
  {
    species: "Crabominable",
    types: ["Fighting", "Ice"],
    baseStats: { hp: 97, atk: 157, def: 122, spa: 62, spd: 107, spe: 33 },
    ability: "Iron Fist",
    stone: "Crabominablite",
  },
  {
    species: "Drampa",
    types: ["Normal", "Dragon"],
    baseStats: { hp: 78, atk: 85, def: 110, spa: 160, spd: 116, spe: 36 },
    ability: "Berserk",
    stone: "Drampite",
  },
  {
    species: "Scovillain",
    types: ["Grass", "Fire"],
    baseStats: { hp: 65, atk: 138, def: 85, spa: 138, spd: 85, spe: 75 },
    ability: "Spicy Spray",
    stone: "Scovillainite",
  },
  {
    species: "Glimmora",
    types: ["Rock", "Poison"],
    baseStats: { hp: 83, atk: 90, def: 105, spa: 150, spd: 96, spe: 101 },
    ability: "Adaptability",
    stone: "Glimmorite",
  },
  {
    species: "Chimecho",
    types: ["Psychic", "Steel"],
    baseStats: { hp: 75, atk: 50, def: 110, spa: 135, spd: 120, spe: 65 },
    ability: "Levitate",
    stone: "Chimechite",
  },
];

// ── Pokemon that already have megas in species.json ──────────────────────────

const ALREADY_HAS_MEGA = new Set([
  "Abomasnow",
  "Charizard",
  "Darkrai",
  "Delphox",
  "Dragonite",
  "Emboar",
  "Feraligatr",
  "Froslass",
  "Garchomp",
  "Gardevoir",
  "Gengar",
  "Kangaskhan",
  "Lucario",
  "Meganium",
  "Metagross",
  "Salamence",
  "Scizor",
  "Tyranitar",
]);

// ── NFE overrides ────────────────────────────────────────────────────────────
// Some Pokemon are NFE despite being in Champions (Pikachu, Floette)

const NFE_OVERRIDES = new Set(["Pikachu", "Floette"]);

// ── Main enrichment logic ────────────────────────────────────────────────────

function convertAbilities(sdAbilities: Record<string, string>): string[] {
  const result: string[] = [];
  // Add numbered abilities first (0, 1, ...), then hidden (H), then S
  if (sdAbilities["0"]) result.push(sdAbilities["0"]);
  if (sdAbilities["1"]) result.push(sdAbilities["1"]);
  if (sdAbilities["H"] && !result.includes(sdAbilities["H"])) {
    result.push(sdAbilities["H"]);
  }
  if (sdAbilities["S"] && !result.includes(sdAbilities["S"])) {
    result.push(sdAbilities["S"]);
  }
  return result;
}

function createEntryFromShowdown(
  sd: any,
  nameOverride?: string,
): SpeciesEntry {
  const entry: SpeciesEntry = {
    id: sd.num,
    name: nameOverride ?? sd.name,
    types: [...sd.types],
    baseStats: { ...sd.baseStats },
    weightKg: sd.weightkg ?? 0,
    abilities: convertAbilities(sd.abilities),
  };
  return entry;
}

function run() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== Champions Enrichment Script ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  // Load data
  const pokedex = loadShowdownExport("30-showdown-pokedex.js");
  const speciesDb: Record<string, SpeciesEntry> = loadJson(SPECIES_PATH);

  const stats = {
    speciesAdded: 0,
    speciesSkipped: 0,
    megasAdded: 0,
    megasSkippedAlreadyExist: 0,
    formsAdded: 0,
    formsSkipped: 0,
    warnings: [] as string[],
  };

  // Build a lookup: dex number -> showdown key for base forms (no forme field)
  const dexNumToBase = new Map<number, string>();
  for (const [key, entry] of Object.entries(pokedex) as [string, any][]) {
    if (!entry.forme && entry.num > 0) {
      // Only store the first base form found for each dex number
      if (!dexNumToBase.has(entry.num)) {
        dexNumToBase.set(entry.num, key);
      }
    }
  }

  // ── Step 1: Add missing base species by dex number ─────────────────────────

  console.log("--- Step 1: Adding missing base species ---");

  for (const dexNum of DEX_NUMBERS) {
    const sdKey = dexNumToBase.get(dexNum);
    if (!sdKey) {
      stats.warnings.push(`Dex #${dexNum}: not found in Showdown Pokedex`);
      continue;
    }

    const sd = pokedex[sdKey];
    const name = sd.name as string;

    if (speciesDb[name]) {
      stats.speciesSkipped++;
      continue;
    }

    const entry = createEntryFromShowdown(sd);

    // Check NFE override
    if (NFE_OVERRIDES.has(name)) {
      entry.isNFE = true;
    }
    // Also set isNFE if Showdown says it has evolutions (but only if in our override set)
    // For Champions, generally all are fully evolved unless in NFE_OVERRIDES
    // But some like Pikachu have evos in Showdown - handle via override

    speciesDb[name] = entry;
    stats.speciesAdded++;
    console.log(`  [+] ${name} (#${dexNum}) - ${entry.types.join("/")}`);
  }

  // ── Step 2: Add missing forms (regional variants, Rotom, etc.) ─────────────

  console.log();
  console.log("--- Step 2: Adding missing forms ---");

  for (const formName of CHAMPIONS_FORMS) {
    if (speciesDb[formName]) {
      stats.formsSkipped++;
      continue;
    }

    const sdKey = toShowdownKey(formName);
    const sd = pokedex[sdKey];
    if (!sd) {
      stats.warnings.push(`Form "${formName}": not found in Showdown (key: ${sdKey})`);
      continue;
    }

    const entry = createEntryFromShowdown(sd, formName);
    speciesDb[formName] = entry;
    stats.formsAdded++;
    console.log(`  [+] ${formName} (#${sd.num}) - ${entry.types.join("/")}`);
  }

  // ── Step 3: Add standard Showdown megas ────────────────────────────────────

  console.log();
  console.log("--- Step 3: Adding standard Showdown megas ---");

  for (const [baseName, megaKey] of Object.entries(STANDARD_MEGAS)) {
    // Base species must exist (either already existed or was added in step 1)
    if (!speciesDb[baseName]) {
      stats.warnings.push(
        `Mega for "${baseName}": base species not in species.json`,
      );
      continue;
    }

    if (speciesDb[baseName].mega) {
      stats.megasSkippedAlreadyExist++;
      continue;
    }

    const megaSd = pokedex[megaKey];
    if (!megaSd) {
      stats.warnings.push(
        `Mega "${megaKey}": not found in Showdown Pokedex`,
      );
      continue;
    }

    speciesDb[baseName].mega = {
      stone: megaSd.requiredItem,
      types: [...megaSd.types],
      baseStats: { ...megaSd.baseStats },
      ability: convertAbilities(megaSd.abilities)[0],
    };

    // Add mega weightKg if different from base
    if (megaSd.weightkg && megaSd.weightkg !== speciesDb[baseName].weightKg) {
      speciesDb[baseName].mega!.weightKg = megaSd.weightkg;
    }

    stats.megasAdded++;
    console.log(
      `  [+] ${baseName}-Mega (stone: ${megaSd.requiredItem}) - ${megaSd.types.join("/")}`,
    );
  }

  // ── Step 4: Add Charizard Mega X ───────────────────────────────────────────
  // Champions has both Mega X and Mega Y. The existing entry has Y.
  // We keep Y as the primary mega, and add megaX as a separate field.
  // NOTE: We don't add megaX as a separate field because the SpeciesEntry
  // format only supports a single mega. Instead, we note that Charizard-Y
  // is already present. Charizard-X data is preserved in the roster.

  console.log();
  console.log("--- Step 4: Charizard Mega X ---");
  console.log(
    "  [!] Charizard already has Mega Y. Mega X is noted but not overwritten.",
  );
  console.log(
    "      Mega X: Fire/Dragon, 78/130/111/130/85/100, Tough Claws, Charizardite X",
  );

  // ── Step 5: Add Champions-exclusive megas ──────────────────────────────────

  console.log();
  console.log("--- Step 5: Adding Champions-exclusive megas ---");

  for (const mega of CHAMPIONS_EXCLUSIVE_MEGAS) {
    if (!speciesDb[mega.species]) {
      stats.warnings.push(
        `Champions mega for "${mega.species}": base species not in species.json`,
      );
      continue;
    }

    if (speciesDb[mega.species].mega) {
      stats.megasSkippedAlreadyExist++;
      console.log(
        `  [=] ${mega.species}-Mega: already has mega data, skipping`,
      );
      continue;
    }

    speciesDb[mega.species].mega = {
      stone: mega.stone,
      types: [...mega.types],
      baseStats: { ...mega.baseStats },
      ability: mega.ability,
    };

    stats.megasAdded++;
    console.log(
      `  [+] ${mega.species}-Mega (stone: ${mega.stone}) - ${mega.types.join("/")}`,
    );
  }

  // ── Step 6: Sort species.json alphabetically ───────────────────────────────

  console.log();
  console.log("--- Step 6: Sorting species.json ---");

  const sortedDb: Record<string, SpeciesEntry> = {};
  const sortedKeys = Object.keys(speciesDb).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
  for (const key of sortedKeys) {
    sortedDb[key] = speciesDb[key];
  }

  // ── Step 7: Generate champions-roster.json ─────────────────────────────────

  console.log("--- Step 7: Generating champions-roster.json ---");

  // Build a set of all Champions-legal names
  const rosterNames = new Set<string>();

  // Add base species from dex numbers
  for (const dexNum of DEX_NUMBERS) {
    const sdKey = dexNumToBase.get(dexNum);
    if (sdKey) {
      const sd = pokedex[sdKey];
      rosterNames.add(sd.name);
    }
  }

  // Add all forms
  for (const formName of CHAMPIONS_FORMS) {
    rosterNames.add(formName);
  }

  // Add base forms for Rotom, Lycanroc (dex nums already cover these)
  // Make sure Lycanroc base is included (it's dex 745)
  rosterNames.add("Lycanroc");
  rosterNames.add("Rotom");
  rosterNames.add("Tauros"); // base Tauros is dex 128
  rosterNames.add("Palafin"); // base Palafin for completeness
  rosterNames.add("Basculegion");
  rosterNames.add("Indeedee");
  rosterNames.add("Maushold");
  rosterNames.add("Sinistcha");
  rosterNames.add("Meowstic");
  rosterNames.add("Floette");
  rosterNames.add("Ursaluna");
  rosterNames.add("Lilligant"); // base Lilligant (dex 549)

  // Remove Scraggy explicitly - it's in the old data but NOT Champions legal
  // (It shouldn't be in the dex list, but double check)
  // Actually Scraggy is not in our DEX_NUMBERS list, so it won't be added.
  // But if it exists in species.json already, we leave it (don't remove existing).

  const rosterSorted = [...rosterNames].sort();

  console.log(`  Roster size: ${rosterSorted.length} Pokemon`);

  // ── Step 8: Write output ───────────────────────────────────────────────────

  if (!dryRun) {
    saveJson(SPECIES_PATH, sortedDb);
    console.log(`  Wrote: ${SPECIES_PATH}`);

    mkdirSync(resolve(ROOT, "home-data/storage"), { recursive: true });
    saveJson(ROSTER_PATH, rosterSorted);
    console.log(`  Wrote: ${ROSTER_PATH}`);
  } else {
    console.log("  [DRY RUN] No files written.");
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log();
  console.log("=== Summary ===");
  console.log(`  Species added:          ${stats.speciesAdded}`);
  console.log(`  Species already existed: ${stats.speciesSkipped}`);
  console.log(`  Forms added:            ${stats.formsAdded}`);
  console.log(`  Forms already existed:  ${stats.formsSkipped}`);
  console.log(`  Megas added:            ${stats.megasAdded}`);
  console.log(`  Megas already existed:  ${stats.megasSkippedAlreadyExist}`);
  console.log(
    `  Total species.json entries: ${Object.keys(sortedDb).length}`,
  );

  if (stats.warnings.length > 0) {
    console.log();
    console.log("=== Warnings ===");
    for (const w of stats.warnings) {
      console.warn(`  [!] ${w}`);
    }
  }

  console.log();
  console.log("Done!");
}

run();
