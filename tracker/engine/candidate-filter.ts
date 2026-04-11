/**
 * Cross-turn candidate filtering.
 * Intersects candidates across multiple turns targeting the same opponent slot,
 * applying SP budget constraints, known info constraints, and base-stat priors.
 * Also computes SP density histograms and tier classifications.
 */
import type { NatureName, StatID, StatsTable } from '../../src/types.js';
import type { Candidate, TurnInference, SlotInference, SPDensity, SPTier } from './inference-types';
import { SP_BINS } from './inference-types';
import { classifyStatRoles, spPriorWeight, candidatePriorWeight } from './sp-priors';
import { getPlausibleNatures } from './inference';

const SP_BUDGET = 66;
const MAX_SP = 32;
const STAT_IDS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

interface BaseStats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

/**
 * Compute SP density histogram from consistent candidates, weighted by priors.
 * Returns fraction (0.0-1.0, weighted) of candidates in each of 8 SP bins.
 */
function computeWeightedSPDensity(
  candidates: Candidate[],
  stat: StatID,
  roles: Record<StatID, ReturnType<typeof classifyStatRoles>[StatID]>,
): SPDensity {
  const bins = new Array(SP_BINS.length).fill(0);
  let totalWeight = 0;

  for (const c of candidates) {
    const sp = c.sp[stat];
    if (sp === undefined) continue;

    // Weight = prior for this stat + prior for other inferred stats
    const w = candidatePriorWeight(roles, c.sp);

    totalWeight += w;
    for (let b = 0; b < SP_BINS.length; b++) {
      if (sp >= SP_BINS[b].min && sp <= SP_BINS[b].max) {
        bins[b] += w;
        break;
      }
    }
  }

  if (totalWeight === 0) return bins.map(() => 0);
  return bins.map(b => b / totalWeight);
}

/**
 * Classify a stat's SP allocation based on weighted density distribution.
 * - 'heavy'   : ≥55% of weight at SP 20+
 * - 'moderate' : ≥50% at SP 8-23
 * - 'none'    : ≥55% at SP 0-7
 * - 'light'   : ≥55% at SP 0-15
 * - 'unknown' : no clear majority
 */
function classifySPTier(density: SPDensity): SPTier {
  // bins: [0-3, 4-7, 8-11, 12-15, 16-19, 20-23, 24-27, 28-32]
  //        0     1    2     3      4      5      6      7
  const none = density[0] + density[1];                   // SP 0-7
  const light = none + density[2] + density[3];           // SP 0-15
  const moderate = density[2] + density[3] + density[4] + density[5]; // SP 8-23
  const heavy = density[5] + density[6] + density[7];     // SP 20-32

  if (heavy >= 0.55) return 'heavy';
  if (none >= 0.55) return 'none';
  if (moderate >= 0.50) return 'moderate';
  if (light >= 0.55) return 'light';
  return 'unknown';
}

/**
 * Aggregate inference results for a single opponent slot across multiple turns.
 * @param baseStats - opponent Pokemon's base stats (for prior weighting)
 */
export function aggregateSlotInference(
  turnInferences: TurnInference[],
  baseStats?: BaseStats,
  slotNumber?: number,
): SlotInference {
  if (turnInferences.length === 0) {
    // L-7: Use the provided slot number instead of hardcoded 0
    return emptySlotInference(slotNumber ?? 0);
  }

  const opponentSlot = turnInferences[0].opponentSlot;

  // Classify stat roles from base stats (for prior weighting)
  const roles = baseStats
    ? classifyStatRoles(baseStats)
    : { hp: 'flex' as const, atk: 'flex' as const, def: 'flex' as const,
        spa: 'flex' as const, spd: 'flex' as const, spe: 'flex' as const };

  // Collect all possible values per dimension
  let possibleNatures: Set<NatureName> | null = null;
  let possibleItems: Set<string> | null = null;
  let possibleAbilities: Set<string> | null = null;
  const spRanges: Record<StatID, [number, number]> = {
    hp: [0, MAX_SP], atk: [0, MAX_SP], def: [0, MAX_SP],
    spa: [0, MAX_SP], spd: [0, MAX_SP], spe: [0, MAX_SP],
  };

  for (const inf of turnInferences) {
    // Extract unique values from this turn's candidates
    const turnNatures = new Set(inf.candidates.map(c => c.nature));
    const turnItems = new Set(inf.candidates.map(c => c.item));
    const turnAbilities = new Set(inf.candidates.map(c => c.ability));

    // Intersect with running sets
    if (possibleNatures === null) {
      possibleNatures = turnNatures;
    } else {
      possibleNatures = intersectSets(possibleNatures, turnNatures);
    }

    if (possibleItems === null) {
      possibleItems = turnItems;
    } else {
      possibleItems = intersectSets(possibleItems, turnItems);
    }

    if (possibleAbilities === null) {
      possibleAbilities = turnAbilities;
    } else {
      possibleAbilities = intersectSets(possibleAbilities, turnAbilities);
    }

    // Tighten SP ranges for inferred stats
    for (const stat of inf.inferredStats) {
      const spValues = inf.candidates.map(c => c.sp[stat] ?? 0);
      if (spValues.length === 0) continue;
      // L-1: Use reduce instead of Math.min/max spread to avoid stack overflow
      const min = spValues.reduce((a, b) => a < b ? a : b, spValues[0]);
      const max = spValues.reduce((a, b) => a > b ? a : b, spValues[0]);
      const newMin = Math.max(spRanges[stat][0], min);
      const newMax = Math.min(spRanges[stat][1], max);
      // M-2: Guard against min > max (no valid range)
      if (newMin > newMax) {
        return emptySlotInference(opponentSlot);
      }
      spRanges[stat] = [newMin, newMax];
    }
  }

  // Apply SP budget constraint: if sum of minimums > 66, tighten
  const minSum = STAT_IDS.reduce((s, id) => s + spRanges[id][0], 0);
  if (minSum > SP_BUDGET) {
    return emptySlotInference(opponentSlot);
  }

  // Remaining budget after allocating known minimums
  const remainingBudget = SP_BUDGET - minSum;
  for (const stat of STAT_IDS) {
    spRanges[stat][1] = Math.min(spRanges[stat][1], spRanges[stat][0] + remainingBudget);
  }

  // Count candidates that are consistent across ALL turns
  const consistentCandidates = getConsistentCandidates(
    turnInferences,
    possibleNatures ?? new Set(),
    possibleItems ?? new Set(),
    possibleAbilities ?? new Set(),
  );

  // Sort by prior-weighted roll matches
  const scored = consistentCandidates.map(c => ({
    candidate: c,
    score: c.matchedRolls.length * candidatePriorWeight(roles, c.sp),
  }));
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, 20).map(s => s.candidate);

  // Compute prior-weighted SP density and tier for each stat
  const spDensity = {} as Record<StatID, SPDensity>;
  const spTier = {} as Record<StatID, SPTier>;
  for (const stat of STAT_IDS) {
    const density = computeWeightedSPDensity(consistentCandidates, stat, roles);
    spDensity[stat] = density;
    const hasData = density.some(d => d > 0);
    spTier[stat] = hasData ? classifySPTier(density) : 'unknown';
  }

  // Compute unique build count (nature + stat values only, ignoring item/ability)
  // and narrowing ratio against total search space
  const uniqueBuilds = new Set<string>();
  for (const c of consistentCandidates) {
    const spPart = Object.entries(c.sp)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    uniqueBuilds.add(`${c.nature}|${spPart}`);
  }
  const uniqueBuildCount = uniqueBuilds.size;

  // Total search space: plausible natures × SP combinations
  // Mode A: 4 × 33 = 132, Mode B: 4 × 33 × 33 = 4356
  const natureCount = baseStats
    ? getPlausibleNatures(baseStats.atk, baseStats.spa).length
    : 4;
  const inferredStatCount = turnInferences[0]?.inferredStats.length ?? 1;
  const totalSearchSpace = natureCount * Math.pow(MAX_SP + 1, inferredStatCount);
  const narrowingRatio = totalSearchSpace > 0 ? uniqueBuildCount / totalSearchSpace : 1;

  return {
    opponentSlot,
    natures: possibleNatures ?? new Set(),
    items: possibleItems ?? new Set(),
    abilities: possibleAbilities ?? new Set(),
    spRange: spRanges,
    spDensity,
    spTier,
    candidateCount: consistentCandidates.length,
    uniqueBuildCount,
    narrowingRatio,
    topCandidates,
  };
}

/**
 * Find candidates that are consistent across ALL turn inferences.
 * L-4: When turns infer different stats (Mode A vs Mode B), match only on
 * nature/item/ability. When turns infer the same stats, also match on SP values.
 */
function getConsistentCandidates(
  turnInferences: TurnInference[],
  validNatures: Set<NatureName>,
  validItems: Set<string>,
  validAbilities: Set<string>,
): Candidate[] {
  if (turnInferences.length === 0) return [];
  if (turnInferences.length === 1) {
    return turnInferences[0].candidates.filter(c =>
      validNatures.has(c.nature) &&
      validItems.has(c.item) &&
      validAbilities.has(c.ability)
    );
  }

  // Group turns by their inferred stats (same-stat turns use full key, cross-stat use base key)
  const first = turnInferences[0];
  const firstStatsKey = first.inferredStats.slice().sort().join(',');
  const rest = turnInferences.slice(1);

  const restSets = rest.map(inf => {
    const infStatsKey = inf.inferredStats.slice().sort().join(',');
    const sameMode = infStatsKey === firstStatsKey;
    const set = new Set<string>();
    for (const c of inf.candidates) {
      // M-1: Use full key (with SP) for same-mode turns, base key for cross-mode
      set.add(sameMode ? candidateKeyFull(c) : candidateKeyBase(c));
    }
    return { set, sameMode };
  });

  return first.candidates.filter(c => {
    if (!validNatures.has(c.nature)) return false;
    if (!validItems.has(c.item)) return false;
    if (!validAbilities.has(c.ability)) return false;
    const fullKey = candidateKeyFull(c);
    const baseKey = candidateKeyBase(c);
    return restSets.every(({ set, sameMode }) =>
      set.has(sameMode ? fullKey : baseKey)
    );
  });
}

/** Key including SP values — for matching within same inference mode */
function candidateKeyFull(c: Candidate): string {
  const spPart = Object.entries(c.sp)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  return `${c.nature}|${c.item}|${c.ability}|${spPart}`;
}

/** Key without SP — for matching across different inference modes */
function candidateKeyBase(c: Candidate): string {
  return `${c.nature}|${c.item}|${c.ability}`;
}

function intersectSets<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

function emptySlotInference(slot: number): SlotInference {
  const emptyDensity = new Array(SP_BINS.length).fill(0);
  return {
    opponentSlot: slot,
    natures: new Set(),
    items: new Set(),
    abilities: new Set(),
    spRange: {
      hp: [0, MAX_SP], atk: [0, MAX_SP], def: [0, MAX_SP],
      spa: [0, MAX_SP], spd: [0, MAX_SP], spe: [0, MAX_SP],
    },
    spDensity: {
      hp: [...emptyDensity], atk: [...emptyDensity], def: [...emptyDensity],
      spa: [...emptyDensity], spd: [...emptyDensity], spe: [...emptyDensity],
    },
    spTier: {
      hp: 'unknown', atk: 'unknown', def: 'unknown',
      spa: 'unknown', spd: 'unknown', spe: 'unknown',
    },
    candidateCount: 0,
    uniqueBuildCount: 0,
    narrowingRatio: 1,
    topCandidates: [],
  };
}
