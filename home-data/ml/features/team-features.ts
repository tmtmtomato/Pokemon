/**
 * team-features.ts — Team-level feature extraction (67 dimensions).
 *
 * Given a 6-Pokemon team preview, produces a feature vector capturing:
 *   - Aggregate stat distribution (12 dims)
 *   - Offensive type coverage (18 dims)
 *   - Defensive type weaknesses (18 dims)
 *   - Speed distribution (3 dims)
 *   - Offensive balance (2 dims)
 *   - Tactical flags (8 dims)
 *   - Synergy metrics (6 dims)
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TYPE_NAMES } from "../lib/encoding.js";
import { normalizeMega } from "./replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeciesData {
  name: string;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: string[];
  mega?: { types: string[]; baseStats: typeof SpeciesData.prototype.baseStats; ability: string };
}

interface TypeChart {
  [attackType: string]: { [defType: string]: number };
}

export const TEAM_FEATURE_DIM = 67;

// ---------------------------------------------------------------------------
// Data loaders (cached)
// ---------------------------------------------------------------------------

let cachedSpecies: Record<string, SpeciesData> | null = null;
let cachedTypeChart: TypeChart | null = null;
let cachedMeta: Map<string, any> | null = null;
let cachedTeams: any | null = null;

async function loadSpecies(): Promise<Record<string, SpeciesData>> {
  if (cachedSpecies) return cachedSpecies;
  const path = resolve(__dirname, "..", "..", "..", "src", "data", "species.json");
  cachedSpecies = JSON.parse(await readFile(path, "utf-8"));
  return cachedSpecies!;
}

async function loadTypeChart(): Promise<TypeChart> {
  if (cachedTypeChart) return cachedTypeChart;
  const path = resolve(__dirname, "..", "..", "..", "src", "data", "typechart.json");
  cachedTypeChart = JSON.parse(await readFile(path, "utf-8"));
  return cachedTypeChart!;
}

async function loadMeta(): Promise<Map<string, any>> {
  if (cachedMeta) return cachedMeta;
  cachedMeta = new Map();
  try {
    const path = resolve(__dirname, "..", "..", "storage", "analysis", "2026-04-08-meta.json");
    const raw = JSON.parse(await readFile(path, "utf-8"));
    const fmt = raw.formats?.find((f: any) => f.formatKey === "championspreview");
    if (fmt?.pokemon) {
      for (const p of fmt.pokemon) {
        cachedMeta.set(p.name, p);
      }
    }
  } catch { /* meta optional */ }
  return cachedMeta;
}

async function loadTeamsData(): Promise<any> {
  if (cachedTeams) return cachedTeams;
  try {
    const path = resolve(__dirname, "..", "..", "storage", "analysis", "2026-04-10-teams.json");
    cachedTeams = JSON.parse(await readFile(path, "utf-8"));
  } catch {
    cachedTeams = { teams: [], cores: [] };
  }
  return cachedTeams;
}

// ---------------------------------------------------------------------------
// Known move/ability sets for tactical flags
// ---------------------------------------------------------------------------

const FAKE_OUT_USERS = new Set([
  "Incineroar", "Ambipom", "Mienshao", "Rillaboom", "Ludicolo",
  "Hitmontop", "Kangaskhan", "Persian", "Sableye",
]);

const REDIRECT_USERS = new Set([
  "Amoonguss", "Togekiss", "Indeedee", "Clefairy", "Pachirisu",
  "Farigiraf",
]);

const TRICK_ROOM_SETTERS = new Set([
  "Dusclops", "Porygon2", "Hatterene", "Cresselia", "Farigiraf",
  "Oranguru", "Bronzong", "Gothitelle", "Reuniclus", "Slowbro",
  "Slowking", "Armarouge", "Indeedee",
]);

const TAILWIND_SETTERS = new Set([
  "Whimsicott", "Tornadus", "Talonflame", "Suicune", "Murkrow",
  "Pelipper", "Aerodactyl", "Zapdos",
]);

const WEATHER_SETTERS: Record<string, string> = {
  "Drought": "sun", "Drizzle": "rain", "Sand Stream": "sand",
  "Snow Warning": "snow", "Orichalcum Pulse": "sun",
};

const INTIMIDATE_USERS = new Set(["Incineroar", "Arcanine", "Gyarados", "Landorus", "Salamence", "Hitmontop", "Staraptor"]);

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

export async function extractTeamFeatures(teamSpecies: string[]): Promise<Float64Array> {
  const species = await loadSpecies();
  const typeChart = await loadTypeChart();
  const meta = await loadMeta();

  const vec = new Float64Array(TEAM_FEATURE_DIM);
  const mons = teamSpecies.map((name) => {
    const base = normalizeMega(name);
    return species[base] ?? species[name];
  }).filter(Boolean);

  if (mons.length === 0) return vec;

  // --------------- Stats (12 dims: mean + max of 6 stats) ---------------
  const statKeys = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
  for (let s = 0; s < 6; s++) {
    const key = statKeys[s];
    const vals = mons.map((m) => m.baseStats[key]);
    vec[s * 2] = vals.reduce((a, b) => a + b, 0) / vals.length / 150; // normalized mean
    vec[s * 2 + 1] = Math.max(...vals) / 200; // normalized max
  }

  // --------------- Offensive type coverage (18 dims) ---------------
  // For each of 18 types, max effectiveness any team member's STAB types deal
  for (let t = 0; t < 18; t++) {
    const defType = TYPE_NAMES[t];
    let maxEff = 0;
    for (const mon of mons) {
      for (const atkType of mon.types) {
        const eff = typeChart[atkType]?.[defType] ?? 1;
        if (eff > maxEff) maxEff = eff;
      }
    }
    vec[12 + t] = maxEff / 4; // normalize: 4x → 1.0
  }

  // --------------- Defensive type weaknesses (18 dims) ---------------
  // For each of 18 types, count how many team members are weak to it
  for (let t = 0; t < 18; t++) {
    const atkType = TYPE_NAMES[t];
    let weakCount = 0;
    for (const mon of mons) {
      let eff = 1;
      for (const defType of mon.types) {
        eff *= typeChart[atkType]?.[defType] ?? 1;
      }
      if (eff > 1) weakCount++;
    }
    vec[30 + t] = weakCount / mons.length; // normalize by team size
  }

  // --------------- Speed distribution (3 dims) ---------------
  const speeds = mons.map((m) => m.baseStats.spe).sort((a, b) => a - b);
  vec[48] = speeds[0] / 200; // min speed
  vec[49] = speeds[Math.floor(speeds.length / 2)] / 200; // median
  vec[50] = speeds[speeds.length - 1] / 200; // max speed

  // --------------- Offensive balance (2 dims) ---------------
  let physCount = 0, specCount = 0;
  for (const mon of mons) {
    if (mon.baseStats.atk > mon.baseStats.spa) physCount++;
    else specCount++;
  }
  const total = physCount + specCount || 1;
  vec[51] = physCount / total;
  vec[52] = specCount / total;

  // --------------- Tactical flags (8 dims) ---------------
  const teamNames = teamSpecies.map(normalizeMega);

  // Weather setters (4 dims: sun, rain, sand, snow)
  const weatherFlags = { sun: 0, rain: 0, sand: 0, snow: 0 };
  for (const mon of mons) {
    for (const abil of mon.abilities) {
      const weather = WEATHER_SETTERS[abil];
      if (weather && weather in weatherFlags) {
        weatherFlags[weather as keyof typeof weatherFlags] = 1;
      }
    }
  }
  vec[53] = weatherFlags.sun;
  vec[54] = weatherFlags.rain;
  vec[55] = weatherFlags.sand;
  vec[56] = weatherFlags.snow;

  // Has mega (1 dim)
  vec[57] = mons.some((m) => m.mega) ? 1 : 0;

  // Has Intimidate (1 dim)
  vec[58] = teamNames.some((n) => INTIMIDATE_USERS.has(n)) ? 1 : 0;

  // Has Fake Out (1 dim)
  vec[59] = teamNames.some((n) => FAKE_OUT_USERS.has(n)) ? 1 : 0;

  // Has redirection (1 dim) - merged with TR/TW below as tactical flags
  vec[60] = teamNames.some((n) => REDIRECT_USERS.has(n)) ? 1 : 0;

  // --------------- Synergy (6 dims) ---------------
  // Trick Room capability (1 dim)
  vec[61] = teamNames.some((n) => TRICK_ROOM_SETTERS.has(n)) ? 1 : 0;

  // Tailwind capability (1 dim)
  vec[62] = teamNames.some((n) => TAILWIND_SETTERS.has(n)) ? 1 : 0;

  // Teammate synergy from meta data (2 dims: mean, max pair synergy)
  let synergySum = 0;
  let synergyMax = 0;
  let synergyCount = 0;
  for (let i = 0; i < teamNames.length; i++) {
    const metaMon = meta.get(teamNames[i]);
    if (!metaMon?.teammates) continue;
    for (let j = i + 1; j < teamNames.length; j++) {
      const teammate = metaMon.teammates.find((t: any) => t.name === teamNames[j]);
      if (teammate) {
        const score = teammate.pct / 100;
        synergySum += score;
        if (score > synergyMax) synergyMax = score;
        synergyCount++;
      }
    }
  }
  vec[63] = synergyCount > 0 ? synergySum / synergyCount : 0;
  vec[64] = synergyMax;

  // Core strength from teams data (2 dims: best core win rate, core co-pick rate)
  try {
    const teamsData = await loadTeamsData();
    const teamKey = teamSpecies.slice().sort().join(" / ");
    const teamEntry = teamsData.teams?.find((t: any) => t.key === teamKey);
    vec[65] = teamEntry ? teamEntry.winRate / 100 : 0.5;

    // Best 3-mon core win rate
    let bestCoreWR = 0;
    if (teamsData.cores) {
      for (const core of teamsData.cores) {
        if (core.species.every((s: string) => teamNames.includes(s))) {
          if (core.coPickWinRate > bestCoreWR) bestCoreWR = core.coPickWinRate;
        }
      }
    }
    vec[66] = bestCoreWR / 100;
  } catch {
    vec[65] = 0.5;
    vec[66] = 0;
  }

  return vec;
}

/** Feature names for the 67-dimensional team feature vector. */
export const TEAM_FEATURE_NAMES: string[] = [
  // Stats (12)
  "hp_mean", "hp_max", "atk_mean", "atk_max", "def_mean", "def_max",
  "spa_mean", "spa_max", "spd_mean", "spd_max", "spe_mean", "spe_max",
  // Type coverage (18)
  ...TYPE_NAMES.map((t) => `coverage_${t}`),
  // Type weakness (18)
  ...TYPE_NAMES.map((t) => `weakness_${t}`),
  // Speed distribution (3)
  "spe_min", "spe_median", "spe_fastest",
  // Offensive balance (2)
  "physical_ratio", "special_ratio",
  // Tactical flags (8)
  "has_sun", "has_rain", "has_sand", "has_snow",
  "has_mega", "has_intimidate", "has_fake_out", "has_redirect",
  // Synergy (6)
  "has_trick_room", "has_tailwind",
  "teammate_synergy_mean", "teammate_synergy_max",
  "team_win_rate", "best_core_win_rate",
];
