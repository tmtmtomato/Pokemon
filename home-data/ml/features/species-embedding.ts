/**
 * species-embedding.ts — Dense embedding vectors for Pokemon species.
 *
 * Each Pokemon gets a 36-dimensional vector combining static game data
 * (base stats, types) with meta-derived statistics (usage, win rate).
 *
 * Dimensions:
 *   [0..5]   Base stats (z-normalized): hp, atk, def, spa, spd, spe
 *   [6]      BST total (normalized)
 *   [7..24]  Type one-hot (18 types, dual-type → 0.5 each)
 *   [25..26] Physical/Special split: atk/(atk+spa), spa/(atk+spa)
 *   [27]     Speed percentile in meta (0-1)
 *   [28..29] Bulk indices: HP*Def, HP*SpD (normalized)
 *   [30]     Has mega evolution (binary)
 *   [31]     Usage rate (0-1)
 *   [32]     Win rate (0-1, centered at 0.5)
 *   [33]     Selection rate (0-1)
 *   [34..35] Role scores: physical attacker, special attacker
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeNormParams, encodeTypes, zNormalize } from "../lib/encoding.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeciesData {
  id: number;
  name: string;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: string[];
  mega?: {
    stone: string;
    types: string[];
    baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    ability: string;
  };
}

interface MetaPokemon {
  name: string;
  usagePct: number;
  winRate?: number;
  selectionRate?: number;
  moves: { name: string; pct: number; winRate?: number }[];
}

export interface EmbeddingIndex {
  /** species name → 36-dim Float64Array */
  embeddings: Map<string, Float64Array>;
  /** ordered list of all species */
  speciesList: string[];
  /** dimension of each embedding */
  dim: number;
}

export const EMBEDDING_DIM = 36;

// ---------------------------------------------------------------------------
// Building embeddings
// ---------------------------------------------------------------------------

export async function buildEmbeddingIndex(): Promise<EmbeddingIndex> {
  // Load species data
  const speciesPath = resolve(__dirname, "..", "..", "..", "src", "data", "species.json");
  const speciesJson = JSON.parse(await readFile(speciesPath, "utf-8")) as Record<string, SpeciesData>;

  // Load meta data for usage/win/selection rates
  const metaPath = resolve(__dirname, "..", "..", "storage", "analysis");
  let metaMap = new Map<string, MetaPokemon>();
  try {
    // Try latest meta file
    const files = ["2026-04-08-meta.json"];
    for (const f of files) {
      try {
        const raw = JSON.parse(await readFile(resolve(metaPath, f), "utf-8"));
        const fmt = raw.formats?.find((f: any) => f.formatKey === "championspreview");
        if (fmt?.pokemon) {
          for (const p of fmt.pokemon) {
            metaMap.set(p.name, p);
          }
        }
        break;
      } catch { /* try next */ }
    }
  } catch { /* meta data optional */ }

  const allSpecies = Object.values(speciesJson);

  // Compute normalization params from all species
  const allHp = allSpecies.map((s) => s.baseStats.hp);
  const allAtk = allSpecies.map((s) => s.baseStats.atk);
  const allDef = allSpecies.map((s) => s.baseStats.def);
  const allSpa = allSpecies.map((s) => s.baseStats.spa);
  const allSpd = allSpecies.map((s) => s.baseStats.spd);
  const allSpe = allSpecies.map((s) => s.baseStats.spe);
  const allBst = allSpecies.map((s) => {
    const bs = s.baseStats;
    return bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe;
  });
  const allBulkP = allSpecies.map((s) => s.baseStats.hp * s.baseStats.def);
  const allBulkS = allSpecies.map((s) => s.baseStats.hp * s.baseStats.spd);

  const normHp = computeNormParams(allHp);
  const normAtk = computeNormParams(allAtk);
  const normDef = computeNormParams(allDef);
  const normSpa = computeNormParams(allSpa);
  const normSpd = computeNormParams(allSpd);
  const normSpe = computeNormParams(allSpe);
  const normBst = computeNormParams(allBst);
  const normBulkP = computeNormParams(allBulkP);
  const normBulkS = computeNormParams(allBulkS);

  // Speed percentile: sorted speeds for ranking
  const sortedSpeeds = allSpe.slice().sort((a, b) => a - b);

  const embeddings = new Map<string, Float64Array>();
  const speciesList: string[] = [];

  for (const sp of allSpecies) {
    const vec = new Float64Array(EMBEDDING_DIM);
    const bs = sp.baseStats;
    const bst = bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe;

    // [0..5] Base stats z-normalized
    vec[0] = zNormalize(bs.hp, normHp);
    vec[1] = zNormalize(bs.atk, normAtk);
    vec[2] = zNormalize(bs.def, normDef);
    vec[3] = zNormalize(bs.spa, normSpa);
    vec[4] = zNormalize(bs.spd, normSpd);
    vec[5] = zNormalize(bs.spe, normSpe);

    // [6] BST normalized
    vec[6] = zNormalize(bst, normBst);

    // [7..24] Type one-hot (18 dims)
    const typeVec = encodeTypes(sp.types);
    vec.set(typeVec, 7);

    // [25..26] Physical/Special split
    const atkTotal = bs.atk + bs.spa || 1;
    vec[25] = bs.atk / atkTotal;
    vec[26] = bs.spa / atkTotal;

    // [27] Speed percentile
    const speedRank = sortedSpeeds.filter((s) => s <= bs.spe).length;
    vec[27] = speedRank / sortedSpeeds.length;

    // [28..29] Bulk indices normalized
    vec[28] = zNormalize(bs.hp * bs.def, normBulkP);
    vec[29] = zNormalize(bs.hp * bs.spd, normBulkS);

    // [30] Has mega
    vec[30] = sp.mega ? 1 : 0;

    // [31..33] Meta stats (usage, win rate, selection rate)
    const meta = metaMap.get(sp.name);
    vec[31] = meta ? meta.usagePct / 100 : 0;
    vec[32] = meta?.winRate !== undefined ? meta.winRate / 100 : 0.5;
    vec[33] = meta?.selectionRate !== undefined ? meta.selectionRate / 100 : 0.5;

    // [34..35] Role scores
    // Physical attacker: high atk, moves tend to be physical
    vec[34] = bs.atk > bs.spa ? Math.min(1, bs.atk / 150) : Math.min(1, bs.atk / 150) * 0.5;
    vec[35] = bs.spa > bs.atk ? Math.min(1, bs.spa / 150) : Math.min(1, bs.spa / 150) * 0.5;

    // If meta has move data, refine role scores
    if (meta?.moves) {
      const physMoves = ["Earthquake", "Close Combat", "Flare Blitz", "Iron Head", "Rock Slide",
        "Knock Off", "Extreme Speed", "Ice Spinner", "Sucker Punch", "Fake Out",
        "Darkest Lariat", "Throat Chop", "Swords Dance", "Dragon Claw", "U-turn"];
      const specMoves = ["Shadow Ball", "Moonblast", "Flamethrower", "Thunderbolt", "Ice Beam",
        "Psychic", "Energy Ball", "Dark Pulse", "Aura Sphere", "Nasty Plot",
        "Dazzling Gleam", "Heat Wave", "Draco Meteor", "Hydro Pump"];

      let physScore = 0, specScore = 0;
      for (const m of meta.moves) {
        if (physMoves.includes(m.name)) physScore += m.pct;
        if (specMoves.includes(m.name)) specScore += m.pct;
      }
      const totalMoveScore = physScore + specScore || 1;
      vec[34] = physScore / totalMoveScore;
      vec[35] = specScore / totalMoveScore;
    }

    embeddings.set(sp.name, vec);
    speciesList.push(sp.name);
  }

  return { embeddings, speciesList, dim: EMBEDDING_DIM };
}

/**
 * Get embedding for a species. Returns zero vector if unknown.
 */
export function getEmbedding(index: EmbeddingIndex, species: string): Float64Array {
  return index.embeddings.get(species) ?? new Float64Array(EMBEDDING_DIM);
}
