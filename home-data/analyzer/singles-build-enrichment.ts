/**
 * singles-build-enrichment.ts
 *
 * Enriches src/data/species.json and src/data/moves.json with missing entries
 * needed for the singles OU power ranking tool.
 *
 * Data sources:
 *   - Pikalytics gen9ou top 50 Pokemon and their moves (>=10% usage)
 *   - Showdown BattlePokedex (30-showdown-pokedex.js) for species data
 *   - Showdown BattleMovedex (30-showdown-moves.js) for move data
 *
 * Usage:
 *   npx tsx home-data/analyzer/singles-build-enrichment.ts [--dry-run]
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const PIKA_DIR = resolve(ROOT, "home-data/storage/pikalytics/2026-04-08/gen9ou");
const RECON_DIR = resolve(ROOT, "home-data/storage/raw-recon");

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadShowdownExport(filename: string): Record<string, any> {
  const raw = readFileSync(resolve(RECON_DIR, filename), "utf-8");
  // Format: exports.BattleXxx = {...};
  // Extract the object literal by finding the first { and eval-ing
  const match = raw.match(/=\s*(\{[\s\S]+\})\s*;?\s*$/);
  if (!match) throw new Error(`Cannot parse ${filename}`);
  // Use Function constructor to safely parse (no real security risk for local data)
  return new Function(`return ${match[1]}`)();
}

function loadJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Convert showdown key format: "Great Tusk" → "greattusk" */
function toShowdownKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-'.:%]+/g, "");
}

// ── Species enrichment ──────────────────────────────────────────────────────

interface SpeciesEntry {
  id: number;
  name: string;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  weightKg: number;
  abilities: string[];
  isNFE?: boolean;
  mega?: {
    stone: string;
    types: string[];
    baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    ability: string;
    weightKg?: number;
  };
}

function enrichSpecies(
  speciesDb: Record<string, SpeciesEntry>,
  needed: string[],
  pokedex: Record<string, any>,
): string[] {
  const added: string[] = [];

  for (const name of needed) {
    if (speciesDb[name]) continue;

    const key = toShowdownKey(name);
    const sd = pokedex[key];
    if (!sd) {
      console.warn(`[species] NOT FOUND in Showdown: ${name} (key: ${key})`);
      continue;
    }

    const entry: SpeciesEntry = {
      id: sd.num,
      name: sd.name,
      types: [...sd.types],
      baseStats: { ...sd.baseStats },
      weightKg: sd.weightkg ?? 0,
      abilities: Object.values(sd.abilities).filter((a: any) => typeof a === "string") as string[],
    };

    // NFE check
    if (sd.evos && sd.evos.length > 0) {
      entry.isNFE = true;
    }

    // Check for mega evolution
    if (sd.otherFormes) {
      for (const forme of sd.otherFormes) {
        const megaKey = toShowdownKey(forme);
        const megaData = pokedex[megaKey];
        if (megaData && megaData.forme === "Mega" && megaData.requiredItem) {
          entry.mega = {
            stone: megaData.requiredItem,
            types: [...megaData.types],
            baseStats: { ...megaData.baseStats },
            ability: Object.values(megaData.abilities)[0] as string,
          };
          if (megaData.weightkg && megaData.weightkg !== sd.weightkg) {
            entry.mega.weightKg = megaData.weightkg;
          }
          break;
        }
      }
    }

    speciesDb[name] = entry;
    added.push(name);
    console.log(`[species] Added: ${name} (${entry.types.join("/")})`);
  }

  return added;
}

// ── Moves enrichment ────────────────────────────────────────────────────────

interface MoveEntry {
  name: string;
  type: string;
  category: string;
  basePower: number;
  pp: number;
  accuracy: number;
  priority: number;
  flags: Record<string, boolean>;
  secondaryEffect?: boolean;
  recoil?: [number, number];
  drain?: [number, number];
  multiHit?: number | [number, number];
  alwaysCrit?: boolean;
  bpModifier?: string;
  overrideOffensiveStat?: string;
  overrideDefensiveStat?: string;
  useTargetOffensiveStat?: boolean;
  isSpread?: boolean;
}

/** Map Showdown flag keys to our flag keys */
function extractFlags(sdFlags: Record<string, any>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  if (sdFlags.contact) flags.contact = true;
  if (sdFlags.punch) flags.punch = true;
  if (sdFlags.bite) flags.bite = true;
  if (sdFlags.bullet) flags.bullet = true;
  if (sdFlags.sound) flags.sound = true;
  if (sdFlags.pulse) flags.pulse = true;
  if (sdFlags.slicing) flags.slicing = true;
  if (sdFlags.wind) flags.wind = true;
  return flags;
}

/** Special moves that need bpModifier or overrides */
const SPECIAL_MOVE_HANDLERS: Record<string, Partial<MoveEntry>> = {
  "Low Kick": { bpModifier: "low_kick" },
  "Grass Knot": { bpModifier: "low_kick" },    // same weight-based formula
  "Heavy Slam": { bpModifier: "heavy_slam" },
  "Heat Crash": { bpModifier: "heavy_slam" },
  "Foul Play": { overrideOffensiveStat: "atk", useTargetOffensiveStat: true },
  "Body Press": { overrideOffensiveStat: "def" },
  "Psyshock": { overrideDefensiveStat: "def" },
  "Psystrike": { overrideDefensiveStat: "def" },
  "Secret Sword": { overrideDefensiveStat: "def" },
  "Photon Geyser": { overrideDefensiveStat: "def" },
  "Psychic Noise": { overrideDefensiveStat: "def" },
};

/** Convert Showdown recoil format to our format */
function extractRecoil(sd: any): [number, number] | undefined {
  if (sd.recoil) return [sd.recoil[0], sd.recoil[1]];
  // Some moves have self-damage strings; check common patterns
  if (sd.mindBlowerRecoil || sd.struggleRecoil) return [50, 100];
  return undefined;
}

function enrichMoves(
  movesDb: Record<string, MoveEntry>,
  needed: string[],
  movedex: Record<string, any>,
): string[] {
  const added: string[] = [];

  for (const name of needed) {
    if (movesDb[name]) continue;

    const key = toShowdownKey(name);
    const sd = movedex[key];
    if (!sd) {
      console.warn(`[moves] NOT FOUND in Showdown: ${name} (key: ${key})`);
      continue;
    }

    // Skip status moves entirely
    if (sd.category === "Status") continue;
    // Skip 0 BP moves (Counter, Mirror Coat, etc.)
    if (!sd.basePower || sd.basePower === 0) continue;
    // Skip Z-moves and Max moves
    if (sd.isZ || sd.isMax || sd.isNonstandard === "Past") continue;

    const entry: MoveEntry = {
      name: sd.name,
      type: sd.type,
      category: sd.category, // "Physical" or "Special"
      basePower: sd.basePower,
      pp: sd.pp ?? 5,
      accuracy: sd.accuracy === true ? 101 : (sd.accuracy ?? 100), // true = never misses → 101
      priority: sd.priority ?? 0,
      flags: extractFlags(sd.flags ?? {}),
      secondaryEffect: !!sd.secondary || !!sd.secondaries,
    };

    // Recoil
    const recoil = extractRecoil(sd);
    if (recoil) entry.recoil = recoil;

    // Drain
    if (sd.drain) entry.drain = [sd.drain[0], sd.drain[1]];

    // Multi-hit
    if (sd.multihit) {
      entry.multiHit = Array.isArray(sd.multihit) ? [sd.multihit[0], sd.multihit[1]] : sd.multihit;
    }

    // Always crit
    if (sd.willCrit) entry.alwaysCrit = true;

    // Spread moves (target === "allAdjacentFoes" or "allAdjacent")
    if (sd.target === "allAdjacentFoes" || sd.target === "allAdjacent") {
      entry.isSpread = true;
    }

    // Special handlers
    const special = SPECIAL_MOVE_HANDLERS[name];
    if (special) {
      Object.assign(entry, special);
    }

    movesDb[name] = entry;
    added.push(name);
  }

  console.log(`[moves] Added ${added.length} attacking moves`);
  return added;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const dryRun = process.argv.includes("--dry-run");

  // 1. Load Pikalytics index to find top 50
  const pikaIndex = loadJson<{ topPokemon: { name: string; usagePct: number; rank: number }[] }>(
    resolve(PIKA_DIR, "_index.json"),
  );
  const top50 = pikaIndex.topPokemon.slice(0, 50);
  console.log(`[info] Top 50 OU Pokemon loaded (${top50.length} entries)`);

  // 2. Collect all moves from top 50 with >= 10% usage
  const neededMoves = new Set<string>();
  for (const poke of top50) {
    try {
      const detail = loadJson<{ moves: { name: string; pct: number }[] }>(
        resolve(PIKA_DIR, `${poke.name}.json`),
      );
      for (const m of detail.moves ?? []) {
        if (m.pct >= 10 && m.name !== "Other") {
          neededMoves.add(m.name);
        }
      }
    } catch {
      console.warn(`[info] No Pikalytics detail for ${poke.name}, skipping moves`);
    }
  }
  console.log(`[info] ${neededMoves.size} unique moves needed (>=10% in top 50)`);

  // 3. Load existing data
  const speciesPath = resolve(ROOT, "src/data/species.json");
  const movesPath = resolve(ROOT, "src/data/moves.json");
  const speciesDb = loadJson<Record<string, SpeciesEntry>>(speciesPath);
  const movesDb = loadJson<Record<string, MoveEntry>>(movesPath);

  console.log(`[info] Existing: ${Object.keys(speciesDb).length} species, ${Object.keys(movesDb).length} moves`);

  // 4. Load Showdown data
  const pokedex = loadShowdownExport("30-showdown-pokedex.js");
  const movedex = loadShowdownExport("30-showdown-moves.js");

  // 5. Enrich species
  const neededSpecies = top50.map((p) => p.name).filter((n) => !speciesDb[n]);
  console.log(`\n[species] ${neededSpecies.length} missing species to add`);
  const addedSpecies = enrichSpecies(speciesDb, neededSpecies, pokedex);

  // 6. Enrich moves
  const missingMoves = [...neededMoves].filter((n) => !movesDb[n]);
  console.log(`\n[moves] ${missingMoves.length} missing moves to check`);
  const addedMoves = enrichMoves(movesDb, missingMoves, movedex);

  // 7. Summary
  console.log(`\n=== Summary ===`);
  console.log(`Species added: ${addedSpecies.length} (${addedSpecies.join(", ") || "none"})`);
  console.log(`Moves added: ${addedMoves.length}`);
  if (addedMoves.length > 0) {
    // Group by type
    const byType: Record<string, string[]> = {};
    for (const name of addedMoves) {
      const t = movesDb[name].type;
      (byType[t] ??= []).push(name);
    }
    for (const [type, moves] of Object.entries(byType).sort()) {
      console.log(`  ${type}: ${moves.join(", ")}`);
    }
  }
  console.log(`Final totals: ${Object.keys(speciesDb).length} species, ${Object.keys(movesDb).length} moves`);

  // 8. Save
  if (dryRun) {
    console.log("\n[dry-run] No files written.");
  } else {
    // Sort species alphabetically
    const sortedSpecies: Record<string, SpeciesEntry> = {};
    for (const key of Object.keys(speciesDb).sort()) {
      sortedSpecies[key] = speciesDb[key];
    }
    saveJson(speciesPath, sortedSpecies);
    console.log(`[saved] ${speciesPath}`);

    // Keep moves in current order, append new at end
    saveJson(movesPath, movesDb);
    console.log(`[saved] ${movesPath}`);
  }
}

main();
