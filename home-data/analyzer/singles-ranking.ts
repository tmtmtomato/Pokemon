/**
 * singles-ranking.ts
 *
 * Generates a singles meta power ranking by:
 * 1. Loading ALL Champions roster Pokemon (with Pikalytics data where available, fallback for rest)
 * 2. Reading raw-recon for nature distributions
 * 3. Building virtual "builds" (nature x item x ability combos)
 * 4. Running damage calculations for all attacker x defender x move combos
 * 5. Scoring each Pokemon on offensive/defensive power
 * 6. Outputting a ranked JSON
 *
 * Usage:
 *   npx tsx home-data/analyzer/singles-ranking.ts [--date 2026-04-10]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";
import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { calcStat, getNatureModifier } from "../../src/mechanics/stats.js";
import type { NatureName } from "../../src/types.js";
import type {
  SinglesRanking,
  RankedPokemon,
  PokemonBuild,
  BuildConfig,
  BuildScores,
  MatchupSummary,
  MoveStats,
  SPPattern,
  StatsTable,
} from "../types/singles-ranking.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const STORAGE = resolve(ROOT, "home-data/storage");

// ── Config ──────────────────────────────────────────────────────────────────

// All Champions Pokemon are used (loaded from champions-roster.json), no top-N limit
const MIN_ITEM_PCT = 5;
const MIN_ABILITY_PCT = 20;
const MIN_NATURE_PCT = 5;
const MAX_NATURES = 3;
const MAX_ATTACKING_MOVES = 4;
const FORCED_SPEED_NATURE_PCT = 5; // % weight for force-added speed natures

// Scoring weights
const W_COVERAGE = 0.3;
const W_DAMAGE = 0.3;
const W_LETHALITY = 0.4; // twoHkoRate
const W_DEF_CONSISTENCY = 0.3;
const W_SURVIVAL = 0.4;
const W_TANKINESS = 0.3;
const W_OFFENSE = 0.35;
const W_DEFENSE = 0.35;
const W_SUSTAINED = 0.30;

// Self-KO moves (Explosion / Self-Destruct): user faints → 1:1 trade → 50% contribution
const SELF_KO_MOVES = new Set(["Explosion", "Self-Destruct"]);
const SELF_KO_PENALTY = 0.5;

// Palafin-Hero: must switch out and back in to activate → needs a pivot partner → 0.8x penalty
const SWITCH_IN_PENALTY_POKEMON = new Set(["Palafin-Hero"]);
const SWITCH_IN_PENALTY = 0.8;

// ── Champions available items ───────────────────────────────────────────────
// Source: https://gamewith.jp/pokemon-champions/546487
// Items NOT in Champions: Life Orb, Choice Band, Choice Specs, Assault Vest,
// Rocky Helmet, Expert Belt, Eviolite, Heavy-Duty Boots, etc.
const CHAMPIONS_ITEMS = new Set([
  // Type-boosting (1.2x) — all 18 types
  "Charcoal", "Mystic Water", "Miracle Seed", "Magnet", "Never-Melt Ice",
  "Dragon Fang", "Black Belt", "Silk Scarf", "Poison Barb", "Soft Sand",
  "Sharp Beak", "Twisted Spoon", "Silver Powder", "Hard Stone", "Spell Tag",
  "Black Glasses", "Metal Coat", "Fairy Feather",
  // Battle items
  "Focus Sash", "Choice Scarf", "Leftovers", "Mental Herb", "White Herb",
  "Scope Lens", "Shell Bell", "Light Ball",
  // Berries
  "Sitrus Berry", "Lum Berry", "Oran Berry",
  "Occa Berry", "Passho Berry", "Wacan Berry", "Rindo Berry", "Yache Berry",
  "Chople Berry", "Kebia Berry", "Shuca Berry", "Coba Berry", "Payapa Berry",
  "Tanga Berry", "Charti Berry", "Kasib Berry", "Haban Berry", "Colbur Berry",
  "Babiri Berry", "Roseli Berry",
  // Mega Stones are always allowed (checked separately)
]);

// Type → type-boosting item mapping (for replacing unavailable items)
const TYPE_BOOST_ITEMS: Record<string, string> = {
  Normal: "Silk Scarf", Fire: "Charcoal", Water: "Mystic Water",
  Electric: "Magnet", Grass: "Miracle Seed", Ice: "Never-Melt Ice",
  Fighting: "Black Belt", Poison: "Poison Barb", Ground: "Soft Sand",
  Flying: "Sharp Beak", Psychic: "Twisted Spoon", Bug: "Silver Powder",
  Rock: "Hard Stone", Ghost: "Spell Tag", Dragon: "Dragon Fang",
  Dark: "Black Glasses", Steel: "Metal Coat", Fairy: "Fairy Feather",
};

/** Check if an item is available in Champions (including mega stones) */
function isChampionsItem(item: string): boolean {
  if (CHAMPIONS_ITEMS.has(item)) return true;
  // Mega stones are always valid
  if (item.endsWith("ite") || item.endsWith("ite X") || item.endsWith("ite Y")) return true;
  // Wellspring Mask etc.
  if (item.endsWith(" Mask")) return true;
  return false;
}

/** Get the best replacement for an unavailable item */
function replaceItem(item: string, types: string[], spPattern: SPPattern): string {
  // Offensive builds → type-boosting item for primary STAB
  if (spPattern === "physicalAT" || spPattern === "specialAT") {
    return TYPE_BOOST_ITEMS[types[0]] ?? "Silk Scarf";
  }
  // Defensive builds → Leftovers
  return "Leftovers";
}

// ── SP Patterns ─────────────────────────────────────────────────────────────

const SP_PATTERNS: Record<SPPattern, StatsTable> = {
  physicalAT: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  specialAT: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  hbWall: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
  hdWall: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
};

// Nature ID → English name (standard game order)
const NATURE_NAMES: string[] = [
  "Hardy",
  "Lonely",
  "Brave",
  "Adamant",
  "Naughty",
  "Bold",
  "Docile",
  "Relaxed",
  "Impish",
  "Lax",
  "Timid",
  "Hasty",
  "Serious",
  "Jolly",
  "Naive",
  "Modest",
  "Mild",
  "Quiet",
  "Bashful",
  "Rash",
  "Calm",
  "Gentle",
  "Sassy",
  "Careful",
  "Quirky",
];

// Nature → boosted stat
const NATURE_BOOST: Record<string, string | undefined> = {
  Lonely: "atk",
  Brave: "atk",
  Adamant: "atk",
  Naughty: "atk",
  Bold: "def",
  Relaxed: "def",
  Impish: "def",
  Lax: "def",
  Timid: "spe",
  Hasty: "spe",
  Jolly: "spe",
  Naive: "spe",
  Modest: "spa",
  Mild: "spa",
  Quiet: "spa",
  Rash: "spa",
  Calm: "spd",
  Gentle: "spd",
  Sassy: "spd",
  Careful: "spd",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function classifySPPattern(nature: string, baseAtk: number, baseSpa: number): SPPattern {
  const boost = NATURE_BOOST[nature];
  if (!boost) {
    // Neutral nature: classify by Pokemon's orientation
    return baseAtk >= baseSpa ? "physicalAT" : "specialAT";
  }
  switch (boost) {
    case "atk":
      return "physicalAT";
    case "spa":
      return "specialAT";
    case "def":
      return "hbWall";
    case "spd":
      return "hdWall";
    case "spe":
      return baseAtk >= baseSpa ? "physicalAT" : "specialAT";
    default:
      return "physicalAT";
  }
}

/**
 * Force-add a speed-boosting nature variant for attacker Pokemon.
 * Physical attackers get Jolly, special attackers get Timid.
 * Both are added if the Pokemon is mixed.
 */
function forceAddSpeedNature(
  natures: { nature: string; pct: number }[],
  baseAtk: number,
  baseSpa: number,
): { nature: string; pct: number }[] {
  const result = [...natures];
  const hasPhysicalAT = natures.some((n) => {
    const b = NATURE_BOOST[n.nature];
    return b === "atk" || (!b && baseAtk >= baseSpa) || b === "spe";
  });
  const hasSpecialAT = natures.some((n) => {
    const b = NATURE_BOOST[n.nature];
    return b === "spa" || (!b && baseSpa > baseAtk) || b === "spe";
  });

  if (hasPhysicalAT || baseAtk >= baseSpa) {
    if (!result.some((n) => n.nature === "Jolly")) {
      result.push({ nature: "Jolly", pct: FORCED_SPEED_NATURE_PCT });
    }
  }
  if (hasSpecialAT || baseSpa > baseAtk) {
    if (!result.some((n) => n.nature === "Timid")) {
      result.push({ nature: "Timid", pct: FORCED_SPEED_NATURE_PCT });
    }
  }
  return result;
}

// ── Speed helpers ────────────────────────────────────────────────────────────

/** Calculate the effective Speed stat for a build (including Choice Scarf). */
function calcBuildSpeed(pokemonName: string, build: BuildConfig): number {
  const species = getSpecies(pokemonName);
  if (!species) return 0;
  // Use mega base stats if applicable
  const baseSpe = build.isMega && species.mega ? species.mega.baseStats.spe : species.baseStats.spe;
  const natMod = getNatureModifier(build.nature as NatureName, "spe");
  let speed = calcStat(baseSpe, build.sp.spe, natMod);
  if (build.item === "Choice Scarf") {
    speed = Math.floor(speed * 1.5);
  }
  return speed;
}

/** Classify speed tier for display purposes. */
function speedTier(stat: number): "fast" | "mid" | "slow" {
  if (stat >= 150) return "fast";
  if (stat >= 100) return "mid";
  return "slow";
}

// ── Data loading ────────────────────────────────────────────────────────────

interface PikaDetail {
  pokemon: string;
  moves: { name: string; pct: number }[];
  abilities: { name: string; pct: number }[];
  items: { name: string; pct: number }[];
}

interface ReconNatureEntry {
  id: string;
  val: string;
}

function loadPikaDetail(name: string): PikaDetail | null {
  const path = resolve(STORAGE, `pikalytics/2026-04-08/championspreview/${name}.json`);
  if (!existsSync(path)) return null;
  const data = loadJson<PikaDetail>(path);
  // Pikalytics sometimes truncates form names (e.g., "Ting" for "Ting-Lu")
  // Override with the canonical name from the index
  data.pokemon = name;
  return data;
}

/** Build EN name → raw-recon Pokemon ID mapping */
function buildNameToIdMap(): Map<string, { id: string; form: string }> {
  const dex = loadJson<{ poke: Record<string, string> }>(
    resolve(STORAGE, "raw-recon/10-dex-ja.json"),
  );
  const enToJa = loadJson<Record<string, string>>(resolve(STORAGE, "i18n/pokemon-ja.json"));
  const ranking = loadJson<{ id: number; form: number }[]>(
    resolve(STORAGE, "raw-recon/02-pokemon-ranking-single.json"),
  );

  // JA name → ID
  const jaToId: Record<string, string> = {};
  for (const [id, jaName] of Object.entries(dex.poke)) {
    jaToId[jaName] = id;
  }

  // Build result map
  const result = new Map<string, { id: string; form: string }>();
  for (const [enName, jaName] of Object.entries(enToJa)) {
    const id = jaToId[jaName];
    if (id) {
      // Find form from ranking
      const rankEntry = ranking.find((r) => String(r.id) === id);
      result.set(enName, { id, form: String(rankEntry?.form ?? 0) });
    }
  }
  return result;
}

/** Load nature data for a Pokemon from raw-recon */
function loadNatures(
  nameToId: Map<string, { id: string; form: string }>,
  pokemonName: string,
): { nature: string; pct: number }[] {
  const mapping = nameToId.get(pokemonName);
  if (!mapping) return [];

  // Find which pdetail file contains this ID
  for (let i = 1; i <= 6; i++) {
    const path = resolve(STORAGE, `raw-recon/03-pdetail-${i}-single.json`);
    if (!existsSync(path)) continue;
    const data = loadJson<Record<string, Record<string, { temoti: { seikaku: ReconNatureEntry[] } }>>>(path);
    const pokemonData = data[mapping.id];
    if (!pokemonData) continue;
    const formData = pokemonData[mapping.form];
    if (!formData?.temoti?.seikaku) continue;

    return formData.temoti.seikaku
      .map((s) => ({
        nature: NATURE_NAMES[parseInt(s.id)] ?? "Hardy",
        pct: parseFloat(s.val),
      }))
      .filter((n) => n.pct >= MIN_NATURE_PCT)
      .slice(0, MAX_NATURES);
  }
  return [];
}

// ── Build generation ────────────────────────────────────────────────────────

interface MetaPokemon {
  name: string;
  usagePct: number;
  usageRank: number;
  builds: BuildConfig[];
  moves: string[]; // attacking moves
}

function generateBuilds(
  pikaDetail: PikaDetail,
  natures: { nature: string; pct: number }[],
  usagePct: number,
  usageRank: number,
): MetaPokemon | null {
  const species = getSpecies(pikaDetail.pokemon);
  if (!species) {
    console.warn(`  [skip] Species not found: ${pikaDetail.pokemon}`);
    return null;
  }

  // Filter items by >= 5% AND available in Champions
  const items = pikaDetail.items.filter((i) => i.pct >= MIN_ITEM_PCT && isChampionsItem(i.name));
  if (items.length === 0) {
    // Try any Pikalytics item that's available in Champions
    const anyValid = pikaDetail.items.find((i) => isChampionsItem(i.name));
    if (anyValid) items.push(anyValid);
  }
  if (items.length === 0) {
    // No valid item — use type-boosting item for primary STAB
    const spPattern = classifySPPattern(
      natures[0]?.nature ?? "Hardy",
      species.baseStats.atk,
      species.baseStats.spa,
    );
    items.push({ name: replaceItem("", species.types, spPattern), pct: 100 });
  }

  // Champions: auto-add mega stone if this Pokemon has one and it's not already listed
  if (species.mega) {
    const stoneName = species.mega.stone;
    if (stoneName && !items.some((i) => i.name === stoneName)) {
      items.push({ name: stoneName, pct: 15 }); // synthetic rate
    }
  }

  // Filter abilities by >= 20%
  const abilities = pikaDetail.abilities.filter((a) => a.pct >= MIN_ABILITY_PCT);
  if (abilities.length === 0 && pikaDetail.abilities.length > 0) {
    abilities.push(pikaDetail.abilities[0]); // fallback to top Pikalytics ability
  }
  if (abilities.length === 0) {
    // No Pikalytics ability data — use first ability from species data
    abilities.push({ name: species.abilities[0], pct: 100 });
  }

  // Use raw-recon natures, or infer from species stats
  let resolvedNatures = [...natures];
  if (resolvedNatures.length === 0) {
    // Fallback: pick a nature based on the Pokemon's stats
    if (species.baseStats.atk >= species.baseStats.spa) {
      resolvedNatures = [{ nature: "Adamant", pct: 50 }, { nature: "Jolly", pct: 50 }];
    } else {
      resolvedNatures = [{ nature: "Modest", pct: 50 }, { nature: "Timid", pct: 50 }];
    }
  }

  // Force-add speed nature for attackers (Jolly for physical, Timid for special)
  resolvedNatures = forceAddSpeedNature(resolvedNatures, species.baseStats.atk, species.baseStats.spa);

  // Get attacking moves (filtered by learnset)
  const learnset = getLearnset(pikaDetail.pokemon);
  const attackingMoves: string[] = [];
  for (const m of pikaDetail.moves) {
    if (attackingMoves.length >= MAX_ATTACKING_MOVES) break;
    const moveData = getMoveData(m.name);
    if (!moveData || moveData.category === "Status" || moveData.basePower <= 0) continue;
    // Learnset check: skip moves this Pokemon cannot learn
    if (learnset && !learnset.has(m.name)) continue;
    attackingMoves.push(m.name);
  }

  if (attackingMoves.length === 0) {
    console.warn(`  [skip] No attacking moves for ${pikaDetail.pokemon}`);
    return null;
  }

  // Generate build combinations
  const builds: BuildConfig[] = [];
  for (const nat of resolvedNatures) {
    for (const item of items) {
      for (const ability of abilities) {
        const spPattern = classifySPPattern(
          nat.nature,
          species.baseStats.atk,
          species.baseStats.spa,
        );

        // Check if this item is a mega stone for this Pokemon
        const isMega = !!(species.mega && species.mega.stone === item.name);

        builds.push({
          nature: nat.nature,
          item: item.name,
          ability: isMega && species.mega ? species.mega.ability : ability.name,
          isMega,
          spPattern,
          sp: SP_PATTERNS[spPattern],
          weight: (nat.pct / 100) * (item.pct / 100) * (ability.pct / 100),
        });
      }
    }
  }

  // Normalize weights
  const totalWeight = builds.reduce((s, b) => s + b.weight, 0);
  if (totalWeight > 0) {
    for (const b of builds) b.weight /= totalWeight;
  }

  return {
    name: pikaDetail.pokemon,
    usagePct,
    usageRank,
    builds,
    moves: attackingMoves,
  };
}

// ── Default build generation (for Pokemon without Pikalytics data) ──────────

// Cache for moves.json (loaded once, used by generateDefaultBuild)
let _cachedMovesJson: Record<string, any> | null = null;
function getCachedMovesJson(): Record<string, any> {
  if (!_cachedMovesJson) {
    _cachedMovesJson = loadJson<Record<string, any>>(resolve(ROOT, "src/data/moves.json"));
  }
  return _cachedMovesJson;
}

// Learnset data: Pokemon name → list of learnable move names
let _cachedLearnsets: Record<string, string[]> | null = null;
function getLearnset(name: string): Set<string> | null {
  if (!_cachedLearnsets) {
    const path = resolve(ROOT, "home-data/storage/learnsets.json");
    if (existsSync(path)) {
      _cachedLearnsets = loadJson<Record<string, string[]>>(path);
    } else {
      _cachedLearnsets = {};
    }
  }
  const moves = _cachedLearnsets![name];
  return moves ? new Set(moves) : null;
}

function generateDefaultBuild(
  name: string,
  natures: { nature: string; pct: number }[],
  usageRank: number,
): MetaPokemon | null {
  const species = getSpecies(name);
  if (!species) {
    console.warn(`  [skip] Species not found: ${name}`);
    return null;
  }

  // Determine nature based on stats
  let resolvedNatures = [...natures];
  if (resolvedNatures.length === 0) {
    if (species.baseStats.atk >= species.baseStats.spa) {
      resolvedNatures = [{ nature: "Adamant", pct: 50 }, { nature: "Jolly", pct: 50 }];
    } else {
      resolvedNatures = [{ nature: "Modest", pct: 50 }, { nature: "Timid", pct: 50 }];
    }
  }

  // Force-add speed nature for attackers
  resolvedNatures = forceAddSpeedNature(resolvedNatures, species.baseStats.atk, species.baseStats.spa);

  // Default item: type-boosting item for primary STAB, plus mega stone if available
  const defaultItem = TYPE_BOOST_ITEMS[species.types[0]] ?? "Silk Scarf";
  const items: { name: string; pct: number }[] = [{ name: defaultItem, pct: 100 }];
  if (species.mega) {
    items.push({ name: species.mega.stone, pct: 50 });
  }

  // Default ability: first ability
  const abilities: { name: string; pct: number }[] = [
    { name: species.abilities[0], pct: 100 },
  ];

  // Find attacking moves: best STAB + coverage moves this Pokemon can actually learn
  const allMoves = getCachedMovesJson();
  const learnset = getLearnset(name); // null if no learnset data
  const attackingMoves: string[] = [];

  // Candidate moves: only moves in moves.json that are attacking AND learnable
  const candidates: { name: string; type: string; power: number; category: string }[] = [];
  for (const [moveName, moveData] of Object.entries(allMoves) as [string, any][]) {
    if (moveData.category === "Status" || !moveData.basePower || moveData.basePower <= 0) continue;
    // Learnset check: skip moves this Pokemon cannot learn
    if (learnset && !learnset.has(moveName)) continue;
    candidates.push({ name: moveName, type: moveData.type, power: moveData.basePower, category: moveData.category });
  }

  // Sort by power descending
  candidates.sort((a, b) => b.power - a.power);

  // Preferred category
  const preferred = species.baseStats.atk >= species.baseStats.spa ? "Physical" : "Special";

  // Pick best STAB moves (up to 2, one per type)
  for (const type of species.types) {
    const bestMove = candidates.find((m) =>
      m.type === type && !attackingMoves.includes(m.name) && m.category === preferred,
    ) ?? candidates.find((m) => m.type === type && !attackingMoves.includes(m.name));

    if (bestMove) {
      attackingMoves.push(bestMove.name);
    }
  }

  // Add coverage moves if needed (up to 4 total), prefer different types
  if (attackingMoves.length < 4) {
    const coveredTypes = new Set(attackingMoves.map((m) => allMoves[m].type));
    for (const m of candidates) {
      if (attackingMoves.length >= 4) break;
      if (attackingMoves.includes(m.name)) continue;
      if (m.category !== preferred) continue;
      if (coveredTypes.has(m.type)) continue; // prefer type diversity
      attackingMoves.push(m.name);
      coveredTypes.add(m.type);
    }
  }

  // Fill remaining slots with highest-power moves (any type)
  if (attackingMoves.length < 4) {
    for (const m of candidates) {
      if (attackingMoves.length >= 4) break;
      if (attackingMoves.includes(m.name)) continue;
      if (m.category !== preferred) continue;
      attackingMoves.push(m.name);
    }
  }

  if (attackingMoves.length === 0) {
    console.warn(`  [skip] No viable attacking moves for ${name}`);
    return null;
  }

  // Generate build combinations
  const builds: BuildConfig[] = [];
  for (const nat of resolvedNatures) {
    for (const item of items) {
      for (const ability of abilities) {
        const spPattern = classifySPPattern(nat.nature, species.baseStats.atk, species.baseStats.spa);
        const isMega = !!(species.mega && species.mega.stone === item.name);
        builds.push({
          nature: nat.nature,
          item: item.name,
          ability: isMega && species.mega ? species.mega.ability : ability.name,
          isMega,
          spPattern,
          sp: SP_PATTERNS[spPattern],
          weight: (nat.pct / 100) * (item.pct / 100) * (ability.pct / 100),
        });
      }
    }
  }

  // Normalize weights
  const totalWeight = builds.reduce((s, b) => s + b.weight, 0);
  if (totalWeight > 0) for (const b of builds) b.weight /= totalWeight;

  return {
    name,
    usagePct: 1.0, // equal weight for all Champions Pokemon
    usageRank,
    builds,
    moves: attackingMoves,
  };
}

// ── Damage calculation ──────────────────────────────────────────────────────

interface CalcResult {
  minPct: number;
  maxPct: number;
  koN: number;
  koChance: number;
  effectiveness: number;
}

function runCalc(
  attackerMeta: MetaPokemon,
  attackerBuild: BuildConfig,
  defenderMeta: MetaPokemon,
  defenderBuild: BuildConfig,
  moveName: string,
): CalcResult | null {
  try {
    const attacker = new Pokemon({
      name: attackerMeta.name,
      nature: attackerBuild.nature as any,
      sp: attackerBuild.sp,
      ability: attackerBuild.ability,
      item: attackerBuild.item,
      isMega: attackerBuild.isMega,
      moves: [moveName],
    });

    const defender = new Pokemon({
      name: defenderMeta.name,
      nature: defenderBuild.nature as any,
      sp: defenderBuild.sp,
      ability: defenderBuild.ability,
      item: defenderBuild.item,
      isMega: defenderBuild.isMega,
    });

    const field = new Field({ gameType: "Singles" as any });
    const move = new Move(moveName);
    const result = calculate(attacker, defender, move, field);

    const [minPct, maxPct] = result.percentRange();
    const ko = result.koChance();

    return {
      minPct,
      maxPct,
      koN: ko.n,
      koChance: ko.chance,
      effectiveness: result.typeEffectiveness,
    };
  } catch {
    return null;
  }
}

// ── 1v1 Simulation ──────────────────────────────────────────────────────────

interface Sim1v1Result {
  win: boolean;
  remainingHpPct: number; // 0-100, winner's remaining HP
}

/** Simulate a 1v1 turn-by-turn battle using damage percentages. */
function simulate1v1Turn(
  ourDmgPct: number,
  theirDmgPct: number,
  weFaster: boolean,
): Sim1v1Result {
  let ourHP = 100;
  let theirHP = 100;
  for (let turn = 0; turn < 10; turn++) {
    if (weFaster) {
      theirHP -= ourDmgPct;
      if (theirHP <= 0) return { win: true, remainingHpPct: Math.max(0, ourHP) };
      ourHP -= theirDmgPct;
      if (ourHP <= 0) return { win: false, remainingHpPct: Math.max(0, theirHP) };
    } else {
      ourHP -= theirDmgPct;
      if (ourHP <= 0) return { win: false, remainingHpPct: Math.max(0, theirHP) };
      theirHP -= ourDmgPct;
      if (theirHP <= 0) return { win: true, remainingHpPct: Math.max(0, ourHP) };
    }
  }
  // Stalemate: whoever has more HP wins
  if (ourHP >= theirHP) return { win: true, remainingHpPct: ourHP };
  return { win: false, remainingHpPct: theirHP };
}

/**
 * Simulate a 1v1 with speed tie handling (average both move-order scenarios).
 * Returns fractional winRate (0-1) and average remaining HP% when winning.
 */
function simulate1v1(
  ourDmgPct: number,
  theirDmgPct: number,
  ourSpeed: number,
  theirSpeed: number,
): { winRate: number; avgRemHpPct: number } {
  if (ourSpeed > theirSpeed) {
    const sim = simulate1v1Turn(ourDmgPct, theirDmgPct, true);
    return { winRate: sim.win ? 1 : 0, avgRemHpPct: sim.win ? sim.remainingHpPct : 0 };
  }
  if (ourSpeed < theirSpeed) {
    const sim = simulate1v1Turn(ourDmgPct, theirDmgPct, false);
    return { winRate: sim.win ? 1 : 0, avgRemHpPct: sim.win ? sim.remainingHpPct : 0 };
  }
  // Same speed: average both move-order scenarios
  const simFirst = simulate1v1Turn(ourDmgPct, theirDmgPct, true);
  const simSecond = simulate1v1Turn(ourDmgPct, theirDmgPct, false);
  const wr = (simFirst.win ? 0.5 : 0) + (simSecond.win ? 0.5 : 0);
  if (wr === 0) return { winRate: 0, avgRemHpPct: 0 };
  const hpSum =
    (simFirst.win ? simFirst.remainingHpPct * 0.5 : 0) +
    (simSecond.win ? simSecond.remainingHpPct * 0.5 : 0);
  return { winRate: wr, avgRemHpPct: hpSum / wr };
}

// ── Chain simulation (v2) ──────────────────────────────────────────────────

const CHAIN_SAMPLES = 200;
const MAX_CHAIN_KOS = 6;

/** Simple mulberry32 PRNG for reproducible results */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple string hash for seeded RNG */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

/** Simulate a battle from a given starting HP%. Opponent always starts at 100%. */
function simulateFromHP(
  startHP: number,
  ourDmgPct: number,
  theirDmgPct: number,
  ourSpeed: number,
  theirSpeed: number,
): { win: boolean; remainingHP: number } {
  // Helper for a single scenario (known move order)
  function runSim(weFaster: boolean): { win: boolean; remainingHP: number } {
    let ourHP = startHP;
    let theirHP = 100;
    for (let turn = 0; turn < 10; turn++) {
      if (weFaster) {
        theirHP -= ourDmgPct;
        if (theirHP <= 0) return { win: true, remainingHP: Math.max(0, ourHP) };
        ourHP -= theirDmgPct;
        if (ourHP <= 0) return { win: false, remainingHP: 0 };
      } else {
        ourHP -= theirDmgPct;
        if (ourHP <= 0) return { win: false, remainingHP: 0 };
        theirHP -= ourDmgPct;
        if (theirHP <= 0) return { win: true, remainingHP: Math.max(0, ourHP) };
      }
    }
    if (ourHP >= theirHP) return { win: true, remainingHP: ourHP };
    return { win: false, remainingHP: 0 };
  }

  if (ourSpeed > theirSpeed) return runSim(true);
  if (ourSpeed < theirSpeed) return runSim(false);

  // Same speed: average both scenarios
  const first = runSim(true);
  const second = runSim(false);
  if (first.win && second.win) {
    return { win: true, remainingHP: (first.remainingHP + second.remainingHP) / 2 };
  }
  if (first.win) {
    return { win: true, remainingHP: first.remainingHP / 2 };
  }
  if (second.win) {
    return { win: true, remainingHP: second.remainingHP / 2 };
  }
  return { win: false, remainingHP: 0 };
}

interface ChainOpponent {
  key: string;
  speed: number;
  weight: number;
  bestMove: string;
}

/** Weighted shuffle using Fisher-Yates with usage-weight probability */
function weightedShuffle(opponents: ChainOpponent[], rng: () => number): ChainOpponent[] {
  // Weighted random sampling without replacement (Efraimidis-Spirakis algorithm)
  const keyed = opponents.map(o => ({
    opp: o,
    key: Math.pow(rng(), 1 / o.weight),
  }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.map(k => k.opp);
}

/** Run CHAIN_SAMPLES Monte Carlo chains and return average KOs and mid-HP. */
function simulateChain(
  attackerName: string,
  atkSpeed: number,
  offMap: Map<string, MatchupResult>,
  defMap: Map<string, MatchupResult>,
  allMeta: MetaPokemon[],
  rng: () => number,
): { avgKOs: number; avgMidHP: number } {
  // Build opponent pool with usage weights
  const opponents: ChainOpponent[] = [];
  for (const defMeta of allMeta) {
    for (let di = 0; di < defMeta.builds.length; di++) {
      const key = `${defMeta.name}:${di}`;
      const w = defMeta.usagePct * defMeta.builds[di].weight;
      if (w <= 0) continue;
      const off = offMap.get(key);
      opponents.push({
        key,
        speed: calcBuildSpeed(defMeta.name, defMeta.builds[di]),
        weight: w,
        bestMove: off?.bestMove ?? "",
      });
    }
  }

  if (opponents.length === 0) return { avgKOs: 0, avgMidHP: 0 };

  const isPalafinHero = SWITCH_IN_PENALTY_POKEMON.has(attackerName);
  let totalKOs = 0;
  let totalMidHP = 0;

  for (let sample = 0; sample < CHAIN_SAMPLES; sample++) {
    const order = weightedShuffle(opponents, rng);
    let currentHP = 100;
    let kos = 0;
    let hpSum = 0;

    for (const opp of order) {
      if (kos >= MAX_CHAIN_KOS) break;

      const offEntry = offMap.get(opp.key);
      if (!offEntry || offEntry.maxPct <= 0) break;

      const defEntry = defMap.get(opp.key);
      const theirDmg = defEntry ? defEntry.maxPct : 0;

      const result = simulateFromHP(currentHP, offEntry.maxPct, theirDmg, atkSpeed, opp.speed);

      if (result.win) {
        let remHP = result.remainingHP;
        if (SELF_KO_MOVES.has(offEntry.bestMove)) remHP = 0;
        if (isPalafinHero) remHP *= SWITCH_IN_PENALTY;
        currentHP = remHP;
        kos++;
        hpSum += currentHP;
      } else {
        break;
      }
    }

    totalKOs += kos;
    totalMidHP += kos > 0 ? hpSum / kos : 0;
  }

  return {
    avgKOs: totalKOs / CHAIN_SAMPLES,
    avgMidHP: totalMidHP / CHAIN_SAMPLES,
  };
}

// ── Scoring ─────────────────────────────────────────────────────────────────

interface MatchupResult {
  defenderName: string;
  defenderBuildIndex: number;
  bestMove: string;
  minPct: number;
  maxPct: number;
  koN: number;
  koChance: number;
  effectiveness: number;
  defenderUsageWeight: number;
  speedMultiplier: number; // 1.0=outspeed, 0.5=same speed (KO'd), 0.0=outsped & KO'd
}

function scoreBuild(
  attackerMeta: MetaPokemon,
  attackerBuild: BuildConfig,
  attackerBuildIndex: number,
  allMeta: MetaPokemon[],
): {
  scores: BuildScores;
  moveStats: MoveStats[];
  offensiveMatchups: MatchupResult[];
  defensiveMatchups: MatchupResult[];
} {
  const offensiveMatchups: MatchupResult[] = [];
  const defensiveMatchups: MatchupResult[] = [];
  const atkSpeed = calcBuildSpeed(attackerMeta.name, attackerBuild);

  // === Step 1: Defensive matchups (all meta attacks this build) ===
  // Computed FIRST so we can look up "can defender D KO us?" for speed adjustment
  for (const atkMeta of allMeta) {
    for (let ai = 0; ai < atkMeta.builds.length; ai++) {
      const atkBuild = atkMeta.builds[ai];
      let bestResult: CalcResult | null = null;
      let bestMove = "";

      for (const moveName of atkMeta.moves) {
        const result = runCalc(atkMeta, atkBuild, attackerMeta, attackerBuild, moveName);
        if (result && (!bestResult || result.maxPct > bestResult.maxPct)) {
          bestResult = result;
          bestMove = moveName;
        }
      }

      if (bestResult) {
        defensiveMatchups.push({
          defenderName: atkMeta.name,
          defenderBuildIndex: ai,
          bestMove,
          ...bestResult,
          defenderUsageWeight: atkMeta.usagePct * atkBuild.weight,
          speedMultiplier: 1, // not used for defensive scoring
        });
      }
    }
  }

  // Build incoming KO lookup: "pokemonName:buildIndex" → can they OHKO us?
  const incomingOHKO = new Map<string, boolean>();
  for (const dm of defensiveMatchups) {
    incomingOHKO.set(
      `${dm.defenderName}:${dm.defenderBuildIndex}`,
      dm.koN === 1 && dm.koChance >= 0.5,
    );
  }

  // === Step 2: Offensive matchups with speed adjustment ===
  // Per-move tracking: moveName → list of results with speed multiplier
  const perMoveResults = new Map<
    string,
    { result: CalcResult; defUsageWeight: number; speedMult: number }[]
  >();
  for (const moveName of attackerMeta.moves) {
    perMoveResults.set(moveName, []);
  }

  // Speed advantage counter (for speedAdvantage metric)
  let speedAdvCount = 0;
  let speedTotalCount = 0;

  for (const defMeta of allMeta) {
    for (let di = 0; di < defMeta.builds.length; di++) {
      const defBuild = defMeta.builds[di];
      const defSpeed = calcBuildSpeed(defMeta.name, defBuild);
      const defUsageWeight = defMeta.usagePct * defBuild.weight;
      const defCanOHKO = incomingOHKO.get(`${defMeta.name}:${di}`) ?? false;

      // Count speed advantage (independent of moves)
      speedTotalCount++;
      if (atkSpeed > defSpeed) speedAdvCount += 1;
      else if (atkSpeed === defSpeed) speedAdvCount += 0.5;

      // For each move, compute damage and speed-adjusted effective value
      let bestEffective = -1;
      let bestResult: CalcResult | null = null;
      let bestMove = "";
      let bestSpeedMult = 1.0;

      for (const moveName of attackerMeta.moves) {
        const result = runCalc(attackerMeta, attackerBuild, defMeta, defBuild, moveName);
        if (!result) continue;

        // Determine speed multiplier for this specific move
        const moveData = getMoveData(moveName);
        const priority = moveData?.priority ?? 0;

        let speedMult = 1.0;
        if (priority > 0) {
          // Priority moves always go first — no speed check
          speedMult = 1.0;
        } else if (atkSpeed > defSpeed) {
          speedMult = 1.0; // we outspeed
        } else if (atkSpeed < defSpeed) {
          speedMult = defCanOHKO ? 0.0 : 1.0; // outsped: dead → 0, alive → 1
        } else {
          speedMult = defCanOHKO ? 0.5 : 1.0; // same speed: 50/50 if KO'd
        }

        // Self-KO penalty: Explosion / Self-Destruct = 1:1 trade → 50% contribution
        if (SELF_KO_MOVES.has(moveName)) speedMult *= SELF_KO_PENALTY;

        // Palafin-Hero penalty: must switch out and back in → needs pivot partner
        if (SWITCH_IN_PENALTY_POKEMON.has(attackerMeta.name)) speedMult *= SWITCH_IN_PENALTY;

        // Track per-move results (with speed multiplier)
        perMoveResults.get(moveName)!.push({ result, defUsageWeight, speedMult });

        // Pick best move by speed-adjusted effective damage
        const effectiveDmg = result.maxPct * speedMult;
        if (effectiveDmg > bestEffective || (effectiveDmg === bestEffective && result.maxPct > (bestResult?.maxPct ?? 0))) {
          bestEffective = effectiveDmg;
          bestResult = result;
          bestMove = moveName;
          bestSpeedMult = speedMult;
        }
      }

      if (bestResult) {
        offensiveMatchups.push({
          defenderName: defMeta.name,
          defenderBuildIndex: di,
          bestMove,
          ...bestResult,
          defenderUsageWeight: defUsageWeight,
          speedMultiplier: bestSpeedMult,
        });
      }
    }
  }

  // === Step 3: Offensive scores (speed-adjusted) ===
  const totalOff = offensiveMatchups.length || 1;
  const totalOffWeight = offensiveMatchups.reduce((s, m) => s + m.defenderUsageWeight, 0) || 1;

  // Speed-adjusted: multiply contributions by speedMultiplier
  const coverage =
    (offensiveMatchups.reduce((s, m) => s + (m.effectiveness >= 1 ? m.speedMultiplier : 0), 0) / totalOff) * 100;
  const weightedDamage =
    offensiveMatchups.reduce((s, m) => s + m.maxPct * m.speedMultiplier * m.defenderUsageWeight, 0) / totalOffWeight;
  const ohkoRate =
    (offensiveMatchups.reduce((s, m) => s + (m.koN === 1 && m.koChance >= 0.5 ? m.speedMultiplier : 0), 0) / totalOff) * 100;
  const twoHkoRate =
    (offensiveMatchups.reduce((s, m) => s + (m.koN <= 2 && m.koChance >= 0.5 ? m.speedMultiplier : 0), 0) / totalOff) * 100;

  const normalizedDamage = Math.min(weightedDamage / 2, 100);
  const offensiveScore =
    W_COVERAGE * coverage + W_DAMAGE * normalizedDamage + W_LETHALITY * twoHkoRate;

  // === Step 4: Per-move stats (speed-adjusted) ===
  const moveStats: MoveStats[] = [];
  for (const moveName of attackerMeta.moves) {
    const results = perMoveResults.get(moveName)!;
    if (results.length === 0) continue;
    const total = results.length;
    const totalW = results.reduce((s, r) => s + r.defUsageWeight, 0) || 1;
    const moveData = getMoveData(moveName);
    moveStats.push({
      name: moveName,
      type: moveData?.type ?? "Normal",
      coverage: round1(
        (results.reduce((s, r) => s + (r.result.effectiveness >= 1 ? r.speedMult : 0), 0) / total) * 100,
      ),
      seCoverage: round1(
        (results.reduce((s, r) => s + (r.result.effectiveness > 1 ? r.speedMult : 0), 0) / total) * 100,
      ),
      avgDamage: round1(
        results.reduce((s, r) => s + r.result.maxPct * r.speedMult * r.defUsageWeight, 0) / totalW,
      ),
      ohkoRate: round1(
        (results.reduce((s, r) => s + (r.result.koN === 1 && r.result.koChance >= 0.5 ? r.speedMult : 0), 0) / total) * 100,
      ),
      twoHkoRate: round1(
        (results.reduce((s, r) => s + (r.result.koN <= 2 && r.result.koChance >= 0.5 ? r.speedMult : 0), 0) / total) * 100,
      ),
    });
  }

  // === Step 5: Defensive scores (unchanged — pure tanking ability) ===
  const totalDef = defensiveMatchups.length || 1;

  const defensiveConsistency =
    (defensiveMatchups.filter((m) => m.maxPct < 50).length / totalDef) * 100;
  const survivalRate =
    (defensiveMatchups.filter((m) => !(m.koN === 1 && m.koChance >= 0.5)).length / totalDef) * 100;

  let tankinessSum = 0;
  for (const m of defensiveMatchups) {
    tankinessSum += m.koN > 0 ? m.koN : 5;
  }
  const tankinessIndex = tankinessSum / totalDef;
  const normalizedTankiness = Math.min(((tankinessIndex - 1) / 4) * 100, 100);

  const defensiveScore =
    W_DEF_CONSISTENCY * defensiveConsistency +
    W_SURVIVAL * survivalRate +
    W_TANKINESS * normalizedTankiness;

  // === Step 6: Speed metrics ===
  const speedAdvantage = speedTotalCount > 0
    ? (speedAdvCount / speedTotalCount) * 100
    : 0;

  // === Step 7: Sustained combat (v2 chain simulation) ===
  // Build lookup maps for cross-referencing offensive/defensive matchups
  const offMap = new Map<string, MatchupResult>();
  for (const m of offensiveMatchups) {
    offMap.set(`${m.defenderName}:${m.defenderBuildIndex}`, m);
  }
  const defMap = new Map<string, MatchupResult>();
  for (const m of defensiveMatchups) {
    defMap.set(`${m.defenderName}:${m.defenderBuildIndex}`, m);
  }

  // 7a: Independent 1v1 win rate (kept as separate metric)
  let winWeightSum = 0;
  let totalWeightSum = 0;

  for (const defMeta of allMeta) {
    for (let di = 0; di < defMeta.builds.length; di++) {
      const defBuild = defMeta.builds[di];
      const defSpeed = calcBuildSpeed(defMeta.name, defBuild);
      const defUsageWeight = defMeta.usagePct * defBuild.weight;
      const key = `${defMeta.name}:${di}`;
      const off = offMap.get(key);
      const def = defMap.get(key);

      totalWeightSum += defUsageWeight;

      if (!off || off.maxPct <= 0) continue;

      const theirDmg = def ? def.maxPct : 0;
      const sim = simulate1v1(off.maxPct, theirDmg, atkSpeed, defSpeed);
      if (sim.winRate > 0) {
        winWeightSum += sim.winRate * defUsageWeight;
      }
    }
  }

  const winRate1v1 = totalWeightSum > 0 ? (winWeightSum / totalWeightSum) * 100 : 0;

  // 7b: Chain simulation — sustained score & sweep potential via Monte Carlo
  const chainSeed = hashString(`${attackerMeta.name}:${attackerBuildIndex}`);
  const chainRng = mulberry32(chainSeed);
  const chain = simulateChain(attackerMeta.name, atkSpeed, offMap, defMap, allMeta, chainRng);
  const sustainedScore = chain.avgMidHP;
  const sweepPotential = Math.min(6.0, chain.avgKOs);

  const overallScore =
    W_OFFENSE * offensiveScore + W_DEFENSE * defensiveScore + W_SUSTAINED * sustainedScore;

  return {
    scores: {
      coverage: round1(coverage),
      weightedDamage: round1(normalizedDamage),
      ohkoRate: round1(ohkoRate),
      twoHkoRate: round1(twoHkoRate),
      offensiveScore: round1(offensiveScore),
      defensiveConsistency: round1(defensiveConsistency),
      survivalRate: round1(survivalRate),
      tankinessIndex: round1(tankinessIndex),
      defensiveScore: round1(defensiveScore),
      speedStat: atkSpeed,
      speedAdvantage: round1(speedAdvantage),
      speedTier: speedTier(atkSpeed),
      sustainedScore: round1(sustainedScore),
      winRate1v1: round1(winRate1v1),
      sweepPotential: round1(sweepPotential),
      overallScore: round1(overallScore),
    },
    moveStats,
    offensiveMatchups,
    defensiveMatchups,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Type coverage helpers ───────────────────────────────────────────────────

function getSEHitTypes(meta: MetaPokemon): string[] {
  const types = new Set<string>();
  for (const moveName of meta.moves) {
    const moveData = getMoveData(moveName);
    if (moveData) types.add(moveData.type);
  }
  return [...types].sort();
}

function getSEWeakTypes(name: string, build: BuildConfig): string[] {
  const ALL_TYPES = [
    "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison",
    "Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy",
  ];
  const weakTypes: string[] = [];
  try {
    const defender = new Pokemon({
      name,
      nature: build.nature as any,
      sp: build.sp,
      ability: build.ability,
      item: build.item,
      isMega: build.isMega,
    });

    for (const type of ALL_TYPES) {
      // Use a generic move of each type to check effectiveness
      // We'll check type chart directly instead
      try {
        const testMove = new Move("Return"); // placeholder
        const field = new Field({ gameType: "Singles" as any });
        // Actually, let's check via type effectiveness
        // We need a move of each type — simpler to just check types
      } catch {
        // skip
      }
    }
    // Simpler approach: check defender types against type chart
    const defTypes = defender.types;
    // Use the type chart
    const typeChart = loadJson<Record<string, Record<string, number>>>(
      resolve(ROOT, "src/data/typechart.json"),
    );
    for (const atkType of ALL_TYPES) {
      let mult = 1;
      for (const defType of defTypes) {
        mult *= typeChart[atkType]?.[defType] ?? 1;
      }
      if (mult > 1) weakTypes.push(atkType);
    }
  } catch {
    // skip
  }
  return weakTypes;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const dateArg = process.argv.find((a, i) => process.argv[i - 1] === "--date") ?? "2026-04-10";

  console.log(`[singles-ranking] Starting...`);
  console.log(`[singles-ranking] Date: ${dateArg}`);

  // 1. Load Champions roster (all Pokemon in the game)
  const roster: string[] = loadJson(resolve(ROOT, "home-data/storage/champions-roster.json"));
  console.log(`[1/5] Loaded ${roster.length} Champions Pokemon`);

  // 2. Build name→ID mapping for raw-recon
  const nameToId = buildNameToIdMap();
  console.log(`[2/5] Name→ID mapping: ${nameToId.size} entries`);

  // 3. Generate builds for all Pokemon (Pikalytics data where available, fallback otherwise)
  const allMeta: MetaPokemon[] = [];
  let pikaCount = 0;
  let defaultCount = 0;
  for (let rank = 0; rank < roster.length; rank++) {
    const name = roster[rank];
    const pikaDetail = loadPikaDetail(name);
    const natures = loadNatures(nameToId, name);

    let meta: MetaPokemon | null;
    if (pikaDetail) {
      // Has Pikalytics data - use existing logic with equal weight
      meta = generateBuilds(pikaDetail, natures, 1.0, rank + 1);
      if (meta) pikaCount++;
    } else {
      // No Pikalytics data - generate default build
      meta = generateDefaultBuild(name, natures, rank + 1);
      if (meta) defaultCount++;
    }

    if (meta) {
      allMeta.push(meta);
      const natStr = natures.length > 0
        ? natures.map((n) => `${n.nature}(${n.pct}%)`).join(", ")
        : "inferred";
      const source = pikaDetail ? "pika" : "default";
      console.log(
        `  ${name}: ${meta.builds.length} builds, ${meta.moves.length} moves [${natStr}] (${source})`,
      );
    }
  }
  console.log(`  Sources: ${pikaCount} from Pikalytics, ${defaultCount} from default builds`);

  const totalBuilds = allMeta.reduce((s, m) => s + m.builds.length, 0);
  console.log(`[3/5] Generated ${totalBuilds} builds across ${allMeta.length} Pokemon`);

  // 4. Run damage calculations and scoring
  let totalCalcs = 0;
  const rankedPokemon: RankedPokemon[] = [];

  for (const meta of allMeta) {
    const pokemonBuilds: PokemonBuild[] = [];

    for (let bi = 0; bi < meta.builds.length; bi++) {
      const build = meta.builds[bi];
      const { scores, moveStats, offensiveMatchups, defensiveMatchups } = scoreBuild(
        meta,
        build,
        bi,
        allMeta,
      );

      totalCalcs += offensiveMatchups.length + defensiveMatchups.length;

      // Top/bottom matchups
      const sortedOff = [...offensiveMatchups].sort((a, b) => b.maxPct - a.maxPct);
      const sortedDef = [...defensiveMatchups].sort((a, b) => b.maxPct - a.maxPct);

      const toMatchup = (m: MatchupResult): MatchupSummary => ({
        targetName: m.defenderName,
        targetBuildIndex: m.defenderBuildIndex,
        bestMove: m.bestMove,
        minPct: round1(m.minPct),
        maxPct: round1(m.maxPct),
        koN: m.koN,
        koChance: round1(m.koChance),
      });

      pokemonBuilds.push({
        config: build,
        scores,
        moves: meta.moves,
        moveStats,
        bestOffensiveMatchups: sortedOff.slice(0, 5).map(toMatchup),
        worstOffensiveMatchups: sortedOff.slice(-5).reverse().map(toMatchup),
        mostThreateningAttackers: sortedDef.slice(0, 5).map(toMatchup),
        bestDefensiveMatchups: sortedDef.slice(-5).reverse().map(toMatchup),
      });
    }

    // Aggregate scores across builds (weight-averaged)
    // Numeric fields only — speedTier is derived from speedStat after averaging
    const numericKeys: (keyof BuildScores)[] = [
      "coverage", "weightedDamage", "ohkoRate", "twoHkoRate", "offensiveScore",
      "defensiveConsistency", "survivalRate", "tankinessIndex", "defensiveScore",
      "speedStat", "speedAdvantage",
      "sustainedScore", "winRate1v1", "sweepPotential",
      "overallScore",
    ];
    const aggScores: BuildScores = {
      coverage: 0, weightedDamage: 0, ohkoRate: 0, twoHkoRate: 0, offensiveScore: 0,
      defensiveConsistency: 0, survivalRate: 0, tankinessIndex: 0, defensiveScore: 0,
      speedStat: 0, speedAdvantage: 0, speedTier: "mid",
      sustainedScore: 0, winRate1v1: 0, sweepPotential: 0,
      overallScore: 0,
    };

    for (const pb of pokemonBuilds) {
      const w = pb.config.weight;
      for (const key of numericKeys) {
        (aggScores as any)[key] += (pb.scores[key] as number) * w;
      }
    }

    // Round aggregated numeric scores
    for (const key of numericKeys) {
      (aggScores as any)[key] = round1(aggScores[key] as number);
    }
    // Derive speedTier from aggregated speedStat
    aggScores.speedTier = speedTier(aggScores.speedStat);

    rankedPokemon.push({
      name: meta.name,
      rank: 0, // will be set after sorting
      usagePct: meta.usagePct,
      usageRank: meta.usageRank,
      scores: aggScores,
      builds: pokemonBuilds.sort((a, b) => b.config.weight - a.config.weight),
      seHitTypes: getSEHitTypes(meta),
      seWeakTypes: getSEWeakTypes(meta.name, meta.builds[0]),
    });

    process.stdout.write(".");
  }

  console.log();

  // 5. Sort by overallScore and assign ranks
  rankedPokemon.sort((a, b) => b.scores.overallScore - a.scores.overallScore);
  for (let i = 0; i < rankedPokemon.length; i++) {
    rankedPokemon[i].rank = i + 1;
  }

  console.log(`[4/5] Completed ${totalCalcs} damage calculations`);

  // Print top 10
  console.log(`\n=== Top 10 Power Ranking (ATK×0.35 + DEF×0.35 + SUSTAINED×0.30) ===`);
  for (const p of rankedPokemon.slice(0, 10)) {
    console.log(
      `  #${p.rank} ${p.name.padEnd(20)} Overall=${p.scores.overallScore} ` +
        `ATK=${p.scores.offensiveScore} DEF=${p.scores.defensiveScore} ` +
        `SUS=${p.scores.sustainedScore} Win1v1=${p.scores.winRate1v1}% Sweep=${p.scores.sweepPotential} ` +
        `SPE=${p.scores.speedStat}(${p.scores.speedTier})`,
    );
  }

  // 6. Output JSON
  const output: SinglesRanking = {
    generatedAt: new Date().toISOString(),
    format: "champions",
    totalPokemon: rankedPokemon.length,
    totalBuilds,
    totalCalculations: totalCalcs,
    pokemon: rankedPokemon,
  };

  const outPath = resolve(STORAGE, `analysis/${dateArg}-singles.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`\n[5/5] Written to ${outPath}`);
  console.log(
    `  ${output.totalPokemon} Pokemon, ${output.totalBuilds} builds, ${output.totalCalculations} calculations`,
  );
}

main();
