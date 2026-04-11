/**
 * matchup-features.ts — Pairwise matchup features for selection prediction.
 *
 * Given my 6-mon team vs opponent's 6-mon team, produces:
 *   - My team features (67 dims)
 *   - Opponent team features (67 dims)
 *   - Cross-matchup features (6 dims)
 *   Total: ~140 dimensions
 *
 * Per-mon features for the selection model (50 dims per mon):
 *   - Species embedding (36 dims)
 *   - Matchup-specific features vs opponent team (14 dims)
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type EmbeddingIndex, getEmbedding, EMBEDDING_DIM } from "./species-embedding.js";
import { extractTeamFeatures, TEAM_FEATURE_DIM, TEAM_FEATURE_NAMES } from "./team-features.js";
import { normalizeMega } from "./replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeciesData {
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: string[];
  mega?: { types: string[]; baseStats: typeof SpeciesData.prototype.baseStats };
}

interface TypeChart {
  [attackType: string]: { [defType: string]: number };
}

export const CROSS_FEATURE_DIM = 6;
export const MATCHUP_FEATURE_DIM = TEAM_FEATURE_DIM * 2 + CROSS_FEATURE_DIM; // 140
export const PER_MON_FEATURE_DIM = EMBEDDING_DIM + 22; // 58

export const CROSS_FEATURE_NAMES: string[] = [
  "net_type_advantage", "speed_advantage", "intimidate_diff",
  "historical_matchup", "weather_conflict", "trick_room_asymmetry",
];

export const MATCHUP_FEATURE_NAMES: string[] = [
  ...TEAM_FEATURE_NAMES.map((n) => `my_${n}`),
  ...TEAM_FEATURE_NAMES.map((n) => `opp_${n}`),
  ...CROSS_FEATURE_NAMES,
];

// ---------------------------------------------------------------------------
// Cached data
// ---------------------------------------------------------------------------

let cachedSpecies: Record<string, SpeciesData> | null = null;
let cachedTypeChart: TypeChart | null = null;
let cachedMatchups: Map<string, { aWinRate: number; games: number }> | null = null;
let cachedPartymates: Map<string, Map<string, number>> | null = null;
let cachedMoveWinRates: Map<string, { name: string; pct: number; winRate: number }[]> | null = null;

async function ensureData() {
  if (!cachedSpecies) {
    const path = resolve(__dirname, "..", "..", "..", "src", "data", "species.json");
    cachedSpecies = JSON.parse(await readFile(path, "utf-8"));
  }
  if (!cachedTypeChart) {
    const path = resolve(__dirname, "..", "..", "..", "src", "data", "typechart.json");
    cachedTypeChart = JSON.parse(await readFile(path, "utf-8"));
  }
  if (!cachedMatchups) {
    cachedMatchups = new Map();
    try {
      const path = resolve(__dirname, "..", "..", "storage", "analysis", "2026-04-08-matchups.json");
      const raw = JSON.parse(await readFile(path, "utf-8"));
      for (const tier of raw.tiers ?? []) {
        for (const pair of tier.pairs ?? []) {
          const key = `${pair.a}|${pair.b}`;
          cachedMatchups.set(key, { aWinRate: pair.aWinRate, games: pair.games });
          cachedMatchups.set(`${pair.b}|${pair.a}`, {
            aWinRate: 1 - pair.aWinRate,
            games: pair.games,
          });
        }
      }
    } catch { /* optional */ }
  }
  if (!cachedPartymates) {
    cachedPartymates = new Map();
    cachedMoveWinRates = new Map();
    try {
      const path = resolve(__dirname, "..", "..", "storage", "analysis", "2026-04-08-meta.json");
      const raw = JSON.parse(await readFile(path, "utf-8"));
      const fmt = raw.formats?.find((f: any) => f.formatKey === "championspreview");
      if (fmt?.pokemon) {
        for (const pk of fmt.pokemon) {
          // Partymate co-occurrence
          const pm = new Map<string, number>();
          for (const mate of pk.partymates ?? pk.teammates ?? []) {
            pm.set(mate.name, mate.pct / 100);
          }
          cachedPartymates.set(pk.name, pm);

          // Move win rates
          const moves = (pk.moves ?? [])
            .filter((m: any) => m.winRate !== undefined)
            .map((m: any) => ({ name: m.name, pct: m.pct / 100, winRate: m.winRate / 100 }));
          if (moves.length > 0) {
            cachedMoveWinRates!.set(pk.name, moves);
          }
        }
      }
    } catch { /* optional */ }
  }
}

// ---------------------------------------------------------------------------
// Team-level matchup features (140 dims)
// ---------------------------------------------------------------------------

export async function extractMatchupFeatures(
  myTeam: string[],
  oppTeam: string[],
): Promise<Float64Array> {
  await ensureData();

  const myFeatures = await extractTeamFeatures(myTeam);
  const oppFeatures = await extractTeamFeatures(oppTeam);
  const cross = extractCrossFeatures(myTeam, oppTeam);

  const result = new Float64Array(MATCHUP_FEATURE_DIM);
  result.set(myFeatures, 0);
  result.set(oppFeatures, TEAM_FEATURE_DIM);
  result.set(cross, TEAM_FEATURE_DIM * 2);
  return result;
}

function extractCrossFeatures(myTeam: string[], oppTeam: string[]): Float64Array {
  const cross = new Float64Array(CROSS_FEATURE_DIM);
  const myNames = myTeam.map(normalizeMega);
  const oppNames = oppTeam.map(normalizeMega);

  // [0] Net type advantage
  let myAdvantage = 0;
  let oppAdvantage = 0;
  for (const myName of myNames) {
    const myMon = cachedSpecies![myName];
    if (!myMon) continue;
    for (const oppName of oppNames) {
      const oppMon = cachedSpecies![oppName];
      if (!oppMon) continue;
      // My offense vs their defense
      for (const atkType of myMon.types) {
        let eff = 1;
        for (const defType of oppMon.types) {
          eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
        }
        if (eff > 1) myAdvantage += eff;
      }
      // Their offense vs my defense
      for (const atkType of oppMon.types) {
        let eff = 1;
        for (const defType of myMon.types) {
          eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
        }
        if (eff > 1) oppAdvantage += eff;
      }
    }
  }
  const totalAdv = myAdvantage + oppAdvantage || 1;
  cross[0] = (myAdvantage - oppAdvantage) / totalAdv; // [-1, 1]

  // [1] Speed advantage: fraction of my mons that outspeed opponent mons
  let speedWins = 0;
  let speedTotal = 0;
  for (const myName of myNames) {
    const myMon = cachedSpecies![myName];
    if (!myMon) continue;
    for (const oppName of oppNames) {
      const oppMon = cachedSpecies![oppName];
      if (!oppMon) continue;
      speedTotal++;
      if (myMon.baseStats.spe > oppMon.baseStats.spe) speedWins++;
    }
  }
  cross[1] = speedTotal > 0 ? speedWins / speedTotal : 0.5;

  // [2] Intimidate differential
  const INTIM = new Set(["Incineroar", "Arcanine", "Gyarados", "Landorus", "Salamence"]);
  const myIntim = myNames.filter((n) => INTIM.has(n)).length;
  const oppIntim = oppNames.filter((n) => INTIM.has(n)).length;
  cross[2] = (myIntim - oppIntim) / 3; // normalize

  // [3] Historical matchup score from matchups data
  let matchupSum = 0;
  let matchupCount = 0;
  for (const myName of myNames) {
    for (const oppName of oppNames) {
      const key = `${myName}|${oppName}`;
      const entry = cachedMatchups?.get(key);
      if (entry && entry.games >= 5) {
        matchupSum += entry.aWinRate;
        matchupCount++;
      }
    }
  }
  cross[3] = matchupCount > 0 ? matchupSum / matchupCount : 0.5;

  // [4] Weather conflict (both teams have weather setters)
  const WEATHER_ABILITIES = new Set(["Drought", "Drizzle", "Sand Stream", "Snow Warning", "Orichalcum Pulse"]);
  const myWeather = myNames.some((n) => {
    const mon = cachedSpecies![n];
    return mon?.abilities.some((a) => WEATHER_ABILITIES.has(a));
  });
  const oppWeather = oppNames.some((n) => {
    const mon = cachedSpecies![n];
    return mon?.abilities.some((a) => WEATHER_ABILITIES.has(a));
  });
  cross[4] = myWeather && oppWeather ? 1 : 0;

  // [5] Trick Room asymmetry
  const TR_SETTERS = new Set(["Dusclops", "Porygon2", "Hatterene", "Cresselia", "Farigiraf", "Oranguru", "Bronzong", "Armarouge", "Indeedee"]);
  const myTR = myNames.filter((n) => TR_SETTERS.has(n)).length;
  const oppTR = oppNames.filter((n) => TR_SETTERS.has(n)).length;
  cross[5] = (myTR - oppTR) / 2; // normalize

  return cross;
}

// ---------------------------------------------------------------------------
// Per-mon features for selection model (50 dims)
// ---------------------------------------------------------------------------

/**
 * Compute per-mon matchup features for selection prediction.
 * For each of my 6 mons, computes: embedding(36) + matchup_vs_opp(14) = 50 dims.
 */
export async function extractPerMonFeatures(
  monSpecies: string,
  oppTeam: string[],
  myTeam: string[],
  embeddingIndex: EmbeddingIndex,
): Promise<Float64Array> {
  await ensureData();

  const result = new Float64Array(PER_MON_FEATURE_DIM);
  const baseName = normalizeMega(monSpecies);

  // [0..35] Species embedding
  const emb = getEmbedding(embeddingIndex, baseName);
  result.set(emb, 0);

  const myMon = cachedSpecies![baseName];
  if (!myMon) return result;

  const oppNames = oppTeam.map(normalizeMega);
  const myNames = myTeam.map(normalizeMega).filter((n) => n !== baseName);

  // [36] Type advantage vs opponent (avg super-effective score)
  let typeAdv = 0;
  for (const oppName of oppNames) {
    const oppMon = cachedSpecies![oppName];
    if (!oppMon) continue;
    for (const atkType of myMon.types) {
      let eff = 1;
      for (const defType of oppMon.types) {
        eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
      }
      if (eff > 1) typeAdv += eff;
    }
  }
  result[36] = typeAdv / (oppNames.length * 4 || 1); // normalize

  // [37] Type disadvantage from opponent (avg threat level)
  let typeDisadv = 0;
  for (const oppName of oppNames) {
    const oppMon = cachedSpecies![oppName];
    if (!oppMon) continue;
    for (const atkType of oppMon.types) {
      let eff = 1;
      for (const defType of myMon.types) {
        eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
      }
      if (eff > 1) typeDisadv += eff;
    }
  }
  result[37] = typeDisadv / (oppNames.length * 4 || 1);

  // [38] Speed advantage vs opponent (fraction outsped)
  let speedWins = 0;
  let speedComparisons = 0;
  for (const oppName of oppNames) {
    const oppMon = cachedSpecies![oppName];
    if (!oppMon) continue;
    speedComparisons++;
    if (myMon.baseStats.spe > oppMon.baseStats.spe) speedWins++;
  }
  result[38] = speedComparisons > 0 ? speedWins / speedComparisons : 0.5;

  // [39] Is unique role provider (only weather setter, only Fake Out, etc.)
  const FAKE_OUT = new Set(["Incineroar", "Ambipom", "Mienshao", "Sableye"]);
  const isFakeOut = FAKE_OUT.has(baseName);
  const teamHasOtherFakeOut = myNames.some((n) => FAKE_OUT.has(n));
  result[39] = isFakeOut && !teamHasOtherFakeOut ? 1 : 0;

  // [40] Is unique type coverage provider
  // Check if this mon provides a super-effective type that no teammate provides
  let uniqueCoverage = 0;
  for (const oppName of oppNames) {
    const oppMon = cachedSpecies![oppName];
    if (!oppMon) continue;
    let myHitsSE = false;
    for (const atkType of myMon.types) {
      let eff = 1;
      for (const defType of oppMon.types) {
        eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
      }
      if (eff > 1) myHitsSE = true;
    }
    if (myHitsSE) {
      // Check if any teammate also hits SE
      let teammateHitsSE = false;
      for (const tmName of myNames) {
        const tmMon = cachedSpecies![tmName];
        if (!tmMon) continue;
        for (const atkType of tmMon.types) {
          let eff = 1;
          for (const defType of oppMon.types) {
            eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
          }
          if (eff > 1) { teammateHitsSE = true; break; }
        }
        if (teammateHitsSE) break;
      }
      if (!teammateHitsSE) uniqueCoverage++;
    }
  }
  result[40] = uniqueCoverage / (oppNames.length || 1);

  // [41] Teammate synergy score (avg co-occurrence with other 5)
  let synSum = 0;
  let synCount = 0;
  const synPartymates = cachedPartymates?.get(baseName);
  if (synPartymates) {
    for (const tmName of myNames) {
      const coOcc = synPartymates.get(tmName);
      if (coOcc !== undefined) {
        synSum += coOcc;
        synCount++;
      }
    }
  }
  result[41] = synCount > 0 ? synSum / synCount : 0;

  // [42] Meta selection rate for this species
  result[42] = emb[33]; // from embedding (selection rate)

  // [43] Historical win rate vs opponent's species
  let wrSum = 0;
  let wrCount = 0;
  for (const oppName of oppNames) {
    const key = `${baseName}|${oppName}`;
    const entry = cachedMatchups?.get(key);
    if (entry && entry.games >= 3) {
      wrSum += entry.aWinRate;
      wrCount++;
    }
  }
  result[43] = wrCount > 0 ? wrSum / wrCount : 0.5;

  // [44] Is mega-capable
  result[44] = myMon.mega ? 1 : 0;

  // [45] Team already has another mega candidate
  const otherMegas = myNames.filter((n) => cachedSpecies![n]?.mega).length;
  result[45] = otherMegas > 0 ? 1 : 0;

  // [46] Defensive niche: resists types that threaten teammates
  let defensiveNiche = 0;
  for (const atkType of Object.keys(cachedTypeChart!)) {
    // How many teammates are weak to this type?
    let weakTeammates = 0;
    for (const tmName of myNames) {
      const tmMon = cachedSpecies![tmName];
      if (!tmMon) continue;
      let eff = 1;
      for (const defType of tmMon.types) {
        eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
      }
      if (eff > 1) weakTeammates++;
    }
    // Does this mon resist that type?
    let myEff = 1;
    for (const defType of myMon.types) {
      myEff *= cachedTypeChart![atkType]?.[defType] ?? 1;
    }
    if (myEff < 1 && weakTeammates > 0) defensiveNiche += weakTeammates;
  }
  result[46] = Math.min(1, defensiveNiche / 10); // normalize

  // [47] Threat count: how many opponent mons threaten this mon with SE
  let threatCount = 0;
  for (const oppName of oppNames) {
    const oppMon = cachedSpecies![oppName];
    if (!oppMon) continue;
    for (const atkType of oppMon.types) {
      let eff = 1;
      for (const defType of myMon.types) {
        eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
      }
      if (eff > 1) { threatCount++; break; }
    }
  }
  result[47] = threatCount / (oppNames.length || 1);

  // [48] Check count: how many opponent mons this mon threatens
  let checkCount = 0;
  for (const oppName of oppNames) {
    const oppMon = cachedSpecies![oppName];
    if (!oppMon) continue;
    for (const atkType of myMon.types) {
      let eff = 1;
      for (const defType of oppMon.types) {
        eff *= cachedTypeChart![atkType]?.[defType] ?? 1;
      }
      if (eff > 1) { checkCount++; break; }
    }
  }
  result[48] = checkCount / (oppNames.length || 1);

  // [49] Intimidate (binary: is this mon an Intimidate user)
  const INTIM = new Set(["Incineroar", "Arcanine", "Gyarados", "Landorus", "Salamence"]);
  result[49] = INTIM.has(baseName) ? 1 : 0;

  // --- New features: matchup granularity + meta synergy ---

  // [50] Best matchup WR vs any opponent mon
  // [51] Worst matchup WR vs any opponent mon
  // [52] Favorable matchup count (>55% WR, normalized)
  // [53] Unfavorable matchup count (<45% WR, normalized)
  // [54] Matchup data confidence (log-normalized total games)
  let bestWR = 0.5, worstWR = 0.5;
  let favorableCount = 0, unfavorableCount = 0;
  let totalGames = 0;
  let hasAnyMatchup = false;
  for (const oppName of oppNames) {
    const key = `${baseName}|${oppName}`;
    const entry = cachedMatchups?.get(key);
    if (entry && entry.games >= 3) {
      if (!hasAnyMatchup) {
        bestWR = entry.aWinRate;
        worstWR = entry.aWinRate;
        hasAnyMatchup = true;
      } else {
        if (entry.aWinRate > bestWR) bestWR = entry.aWinRate;
        if (entry.aWinRate < worstWR) worstWR = entry.aWinRate;
      }
      if (entry.aWinRate > 0.55) favorableCount++;
      if (entry.aWinRate < 0.45) unfavorableCount++;
      totalGames += entry.games;
    }
  }
  result[50] = bestWR;
  result[51] = worstWR;
  result[52] = favorableCount / (oppNames.length || 1);
  result[53] = unfavorableCount / (oppNames.length || 1);
  result[54] = Math.min(1, Math.log1p(totalGames) / 8); // log(~3000) ≈ 8

  // [55] Partymate synergy with rest of my team (from meta.json)
  let partySynergy = 0;
  let partyCount = 0;
  const myPartymates = cachedPartymates?.get(baseName);
  if (myPartymates) {
    for (const tmName of myNames) {
      const coOccurrence = myPartymates.get(tmName);
      if (coOccurrence !== undefined) {
        partySynergy += coOccurrence;
        partyCount++;
      }
    }
  }
  result[55] = partyCount > 0 ? partySynergy / partyCount : 0;

  // [56] This mon's average move win rate (from meta.json)
  const moveWRs = cachedMoveWinRates?.get(baseName);
  if (moveWRs && moveWRs.length > 0) {
    let wSum = 0, wWeight = 0;
    for (const m of moveWRs) {
      wSum += m.winRate * m.pct;
      wWeight += m.pct;
    }
    result[56] = wWeight > 0 ? wSum / wWeight : 0.5;
  } else {
    result[56] = 0.5;
  }

  // [57] Opponent team archetype mismatch score
  // If opponent has Trick Room setters and this mon is fast → bad matchup
  // If opponent lacks TR and this mon is slow → slight disadvantage
  const TR_SETTERS = new Set(["Dusclops", "Porygon2", "Hatterene", "Cresselia", "Farigiraf", "Oranguru", "Bronzong", "Armarouge", "Indeedee"]);
  const oppHasTR = oppNames.some((n) => TR_SETTERS.has(n));
  const isFast = myMon.baseStats.spe >= 100;
  const isSlow = myMon.baseStats.spe <= 50;
  if (oppHasTR) {
    result[57] = isSlow ? 0.7 : isFast ? 0.3 : 0.5; // slow mons thrive vs TR
  } else {
    result[57] = isFast ? 0.7 : isSlow ? 0.3 : 0.5; // fast mons thrive vs non-TR
  }

  return result;
}

/** Feature names for per-mon features. */
export const PER_MON_FEATURE_NAMES: string[] = [
  // Embedding (36)
  "emb_hp", "emb_atk", "emb_def", "emb_spa", "emb_spd", "emb_spe",
  "emb_bst",
  ...Array.from({ length: 18 }, (_, i) => `emb_type_${i}`),
  "emb_phys_ratio", "emb_spec_ratio",
  "emb_speed_pctile", "emb_bulk_phys", "emb_bulk_spec",
  "emb_has_mega", "emb_usage", "emb_winrate", "emb_selrate",
  "emb_role_phys", "emb_role_spec",
  // Matchup-specific (14)
  "type_adv_vs_opp", "type_disadv_from_opp",
  "speed_adv_vs_opp", "is_unique_role", "is_unique_coverage",
  "teammate_synergy", "meta_sel_rate", "hist_wr_vs_opp",
  "is_mega", "team_has_other_mega",
  "defensive_niche", "threat_count", "check_count", "is_intimidate",
  // Matchup granularity + meta synergy (8)
  "best_matchup_wr", "worst_matchup_wr",
  "favorable_matchup_count", "unfavorable_matchup_count",
  "matchup_confidence", "partymate_synergy",
  "avg_move_winrate", "archetype_fit",
];
