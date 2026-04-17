/**
 * builderCalc.ts — Pure calculation functions for the Team Builder.
 *
 * All functions operate on the precomputed DamageMatrix and PoolMember data.
 * No on-the-fly calculate() calls — everything is instant.
 */

import type {
  PoolMember,
  DamageMatrix,
  DamageMatrixEntry,
  CoreRanking,
  PokemonCoreStats,
} from "../types/team-matchup";
import {
  matchupValue,
  effectiveKoN,
  baseSpecies,
  MEGA_POOL_SUFFIX,
  STEALTH_ROCK_USERS,
} from "../analyzer/team-matchup-core";

/**
 * Minimum matchupValue to consider an opponent "answerable".
 * 0.65 = speed-tie 2HKO.  Excludes slower-2HKO (0.3) which costs
 * 2 turns + 2 hits taken — too expensive in a 3v3 context.
 */
export const ANSWER_THRESHOLD = 0.65;

// ── Role Classification ──────────────────────────────────────────��──────────

export type RoleCategory =
  | "physicalAce"
  | "specialAce"
  | "mixedAce"
  | "wallBreaker"
  | "hbWall"
  | "hdWall"
  | "pivot"
  | "priorityUser"
  | "stealthRockSetter";

export interface RoleClassification {
  primary: RoleCategory;
  secondary: RoleCategory[];
  ohkoCount: number;
  twoHkoCount: number;
  cannotBeatCount: number;
  speedTier: "fast" | "mid" | "slow";
  offensiveSpread: number;   // 0-100: % of pool it can beat (matchupValue > 0)
  defensiveSpread: number;   // 0-100: % of pool where it survives (opp matchupValue <= 0)
}

const ROLE_LABELS: Record<RoleCategory, string> = {
  physicalAce: "Physical Ace",
  specialAce: "Special Ace",
  mixedAce: "Mixed Ace",
  wallBreaker: "Wall Breaker",
  hbWall: "Physical Wall",
  hdWall: "Special Wall",
  pivot: "Pivot",
  priorityUser: "Priority User",
  stealthRockSetter: "SR Setter",
};

export function getRoleLabel(role: RoleCategory): string {
  return ROLE_LABELS[role];
}

export function classifyRole(
  name: string,
  member: PoolMember,
  pool: PoolMember[],
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
): RoleClassification {
  const sp = member.sp;
  const speedTier = member.speedTier ?? (sp.spe >= 20 ? "fast" : sp.spe >= 10 ? "mid" : "slow");

  // Count matchup quality across pool
  let ohkoCount = 0;
  let twoHkoCount = 0;
  let cannotBeatCount = 0;
  let canBeatCount = 0;
  let surviveCount = 0;

  for (const opp of pool) {
    if (opp.name === name) continue;
    const mv = matchupValue(name, opp.name, matrix, poolSpeeds);
    if (mv >= 1.3) ohkoCount++;                    // OHKO range
    else if (mv >= ANSWER_THRESHOLD) twoHkoCount++; // solid 2HKO (first-strike or tie)
    else cannotBeatCount++;                         // includes slower 2HKO (0.3)

    if (mv >= ANSWER_THRESHOLD) canBeatCount++;

    // Defensive: does the opponent fail to beat us solidly?
    const oppMv = matchupValue(opp.name, name, matrix, poolSpeeds);
    if (oppMv < ANSWER_THRESHOLD) surviveCount++;
  }

  const total = pool.length - 1;
  const offensiveSpread = total > 0 ? Math.round((canBeatCount / total) * 100) : 0;
  const defensiveSpread = total > 0 ? Math.round((surviveCount / total) * 100) : 0;

  // Determine primary role from SP distribution
  const isPhysical = sp.atk >= 20;
  const isSpecial = sp.spa >= 20;
  const isBulkyPhys = sp.hp >= 28 && sp.def >= 28;
  const isBulkySpec = sp.hp >= 28 && sp.spd >= 28;
  const isFast = speedTier === "fast";

  // Determine secondary roles
  const secondary: RoleCategory[] = [];

  // SR setter check (by base species)
  const base = baseSpecies(name);
  if (STEALTH_ROCK_USERS.has(base)) secondary.push("stealthRockSetter");

  // Priority user check
  const hasPriorityKO = pool.some(
    (opp) => opp.name !== name && (matrix[name]?.[opp.name]?.priorityKoN ?? 99) <= 2,
  );
  if (hasPriorityKO) secondary.push("priorityUser");

  // Classify primary role
  let primary: RoleCategory;
  if (isBulkyPhys && !isPhysical && !isSpecial) {
    primary = "hbWall";
  } else if (isBulkySpec && !isPhysical && !isSpecial) {
    primary = "hdWall";
  } else if (isBulkyPhys) {
    primary = "hbWall";
    if (isPhysical) secondary.unshift("physicalAce");
    if (isSpecial) secondary.unshift("specialAce");
  } else if (isBulkySpec) {
    primary = "hdWall";
    if (isPhysical) secondary.unshift("physicalAce");
    if (isSpecial) secondary.unshift("specialAce");
  } else if (isPhysical && isSpecial) {
    primary = "mixedAce";
  } else if (isPhysical && isFast) {
    primary = "physicalAce";
  } else if (isSpecial && isFast) {
    primary = "specialAce";
  } else if (isPhysical && !isFast && ohkoCount >= 5) {
    primary = "wallBreaker";
  } else if (isSpecial && !isFast && ohkoCount >= 5) {
    primary = "wallBreaker";
  } else if (isPhysical) {
    primary = "physicalAce";
  } else if (isSpecial) {
    primary = "specialAce";
  } else {
    primary = "pivot";
  }

  return {
    primary,
    secondary: secondary.filter((s) => s !== primary),
    ohkoCount,
    twoHkoCount,
    cannotBeatCount,
    speedTier,
    offensiveSpread,
    defensiveSpread,
  };
}

// ── Tough Opponents ──────────────────────────────────────────────���──────────

export interface ToughOpponent {
  name: string;
  types: string[];
  usagePct: number;
  isMega: boolean;
  bestTeamMemberValue: number;
  bestTeamMember: string | null;
  theirBestKoN: number;
  theirBestTarget: string | null;
}

export function computeToughOpponents(
  team: string[],
  pool: PoolMember[],
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
): ToughOpponent[] {
  if (team.length === 0) return [];

  const result: ToughOpponent[] = [];

  for (const opp of pool) {
    if (team.includes(opp.name)) continue;

    let bestValue = -Infinity;
    let bestMember: string | null = null;

    for (const me of team) {
      const mv = matchupValue(me, opp.name, matrix, poolSpeeds);
      if (mv > bestValue) {
        bestValue = mv;
        bestMember = me;
      }
    }

    if (bestValue < ANSWER_THRESHOLD) {
      // Also check how threatening this opponent is to us
      let theirBestKoN = 99;
      let theirBestTarget: string | null = null;
      for (const me of team) {
        const eKoN = effectiveKoN(matrix[opp.name]?.[me]);
        if (eKoN < theirBestKoN) {
          theirBestKoN = eKoN;
          theirBestTarget = me;
        }
      }

      result.push({
        name: opp.name,
        types: opp.types,
        usagePct: opp.usagePct,
        isMega: opp.isMega,
        bestTeamMemberValue: bestValue,
        bestTeamMember: bestMember,
        theirBestKoN,
        theirBestTarget,
      });
    }
  }

  // Sort by usagePct descending (most common threats first)
  result.sort((a, b) => b.usagePct - a.usagePct);
  return result;
}

// ── Complement Scoring ───────────────────────���────────────────────────────���─

export interface TeamConstraints {
  megaCapable: Set<string>;
  teamMegaCount: number;
  teamBaseSpecies: Set<string>;
  teamItems: Set<string>;
}

export function isValidCandidate(
  candidate: PoolMember,
  constraints: TeamConstraints,
): boolean {
  // Species clause
  if (constraints.teamBaseSpecies.has(baseSpecies(candidate.name))) return false;
  // Mega limit (max 2)
  if (candidate.isMega && constraints.teamMegaCount >= 2) return false;
  // Item clause
  if (candidate.item && constraints.teamItems.has(candidate.item)) return false;
  return true;
}

export interface ComplementScore {
  name: string;
  toughsCovered: number;
  weightedToughsCovered: number;
  ownToughCount: number;
  roleComplementarity: number;
  knownCoreBonus: number;
  totalScore: number;
  reasons: string[];
  answersNames: string[];
}

export function computeComplementScores(
  team: string[],
  toughOpponents: ToughOpponent[],
  pool: PoolMember[],
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
  topCores?: CoreRanking[],
  pokemonCoreStats?: PokemonCoreStats[],
  constraints?: TeamConstraints,
): ComplementScore[] {
  if (team.length === 0 || toughOpponents.length === 0) return [];

  const totalToughUsage = toughOpponents.reduce((s, t) => s + t.usagePct, 0);

  // Determine what roles the team already has
  const teamRoles = new Set<string>();
  for (const name of team) {
    const base = baseSpecies(name);
    if (STEALTH_ROCK_USERS.has(base)) teamRoles.add("sr");
    // Simple heuristic for role detection from pool data
    const member = pool.find((p) => p.name === name);
    if (member) {
      if (member.sp.hp >= 28 && member.sp.def >= 28) teamRoles.add("hbWall");
      if (member.sp.hp >= 28 && member.sp.spd >= 28) teamRoles.add("hdWall");
    }
  }

  // Known cores lookup: precompute which pairs exist in topCores
  const coreSet = new Map<string, number>();
  if (topCores) {
    for (const core of topCores) {
      // Create pair keys for every 2-member combination in the core
      for (let i = 0; i < core.members.length; i++) {
        for (let j = i + 1; j < core.members.length; j++) {
          const key = [core.members[i], core.members[j]].sort().join("+");
          const prev = coreSet.get(key) ?? 0;
          if (core.score > prev) coreSet.set(key, core.score);
        }
      }
    }
  }

  const results: ComplementScore[] = [];

  for (const candidate of pool) {
    if (team.includes(candidate.name)) continue;
    if (constraints && !isValidCandidate(candidate, constraints)) continue;

    // 1. Tough opponents covered
    let covered = 0;
    let weightedCovered = 0;
    const answersNames: string[] = [];

    for (const tough of toughOpponents) {
      const mv = matchupValue(candidate.name, tough.name, matrix, poolSpeeds);
      if (mv >= ANSWER_THRESHOLD) {
        covered++;
        weightedCovered += tough.usagePct;
        answersNames.push(tough.name);
      }
    }

    // 2. Own strength (how few tough opponents the candidate itself has)
    let ownToughCount = 0;
    for (const opp of pool) {
      if (opp.name === candidate.name) continue;
      const mv = matchupValue(candidate.name, opp.name, matrix, poolSpeeds);
      if (mv < ANSWER_THRESHOLD) ownToughCount++;
    }

    // 3. Role complementarity
    let roleComp = 0;
    const candBase = baseSpecies(candidate.name);
    if (!teamRoles.has("sr") && STEALTH_ROCK_USERS.has(candBase)) roleComp += 0.5;
    if (!teamRoles.has("hbWall") && candidate.sp.hp >= 28 && candidate.sp.def >= 28) roleComp += 0.3;
    if (!teamRoles.has("hdWall") && candidate.sp.hp >= 28 && candidate.sp.spd >= 28) roleComp += 0.3;
    roleComp = Math.min(roleComp, 1);

    // 4. Known core bonus
    let coreBonus = 0;
    for (const teamMember of team) {
      const key = [candidate.name, teamMember].sort().join("+");
      const score = coreSet.get(key);
      if (score) coreBonus = Math.max(coreBonus, score);
    }

    // Normalize and compute total score
    const normWeighted = totalToughUsage > 0 ? weightedCovered / totalToughUsage : 0;
    const normStrength = pool.length > 1 ? 1 - ownToughCount / (pool.length - 1) : 0;

    const totalScore =
      0.50 * normWeighted +
      0.25 * normStrength +
      0.15 * roleComp +
      0.10 * coreBonus;

    // Build reasons
    const reasons: string[] = [];
    if (covered > 0) reasons.push(`Answers ${covered} tough opponent${covered > 1 ? "s" : ""}`);
    if (roleComp > 0) reasons.push("Fills missing role");
    if (coreBonus > 0) reasons.push("Known strong core");

    results.push({
      name: candidate.name,
      toughsCovered: covered,
      weightedToughsCovered: weightedCovered,
      ownToughCount,
      roleComplementarity: roleComp,
      knownCoreBonus: coreBonus,
      totalScore,
      reasons,
      answersNames,
    });
  }

  // Sort by totalScore descending
  results.sort((a, b) => b.totalScore - a.totalScore || a.ownToughCount - b.ownToughCount);
  return results;
}

// ── Matchup Details ────────────────────────────────────────────────��────────

export type MatchupColor = "favorable" | "marginal" | "unfavorable";

export interface MatchupDetail {
  opponent: string;
  opponentTypes: string[];
  opponentUsagePct: number;
  value: number;
  bestMove: string;
  koN: number;
  koChance: number;
  minPct: number;
  maxPct: number;
  speedComparison: "faster" | "slower" | "tie";
  priorityKoN: number;
  color: MatchupColor;
}

export function computeMatchupDetails(
  name: string,
  pool: PoolMember[],
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
): MatchupDetail[] {
  const mySpd = poolSpeeds.get(name) ?? 0;
  const results: MatchupDetail[] = [];

  for (const opp of pool) {
    if (opp.name === name) continue;
    const entry = matrix[name]?.[opp.name];
    const mv = matchupValue(name, opp.name, matrix, poolSpeeds);
    const oppSpd = poolSpeeds.get(opp.name) ?? 0;

    results.push({
      opponent: opp.name,
      opponentTypes: opp.types,
      opponentUsagePct: opp.usagePct,
      value: mv,
      bestMove: entry?.bestMove ?? "—",
      koN: entry?.koN ?? 0,
      koChance: entry?.koChance ?? 0,
      minPct: entry?.minPct ?? 0,
      maxPct: entry?.maxPct ?? 0,
      speedComparison: mySpd > oppSpd ? "faster" : mySpd < oppSpd ? "slower" : "tie",
      priorityKoN: entry?.priorityKoN ?? 0,
      color: mv >= 1.0 ? "favorable" : mv >= ANSWER_THRESHOLD ? "marginal" : "unfavorable",
    });
  }

  // Sort: unfavorable first (most important to see), then by usagePct
  results.sort((a, b) => {
    const colorOrder = { unfavorable: 0, marginal: 1, favorable: 2 };
    const cmp = colorOrder[a.color] - colorOrder[b.color];
    if (cmp !== 0) return cmp;
    return b.opponentUsagePct - a.opponentUsagePct;
  });

  return results;
}

// ── Team Summary ──────────────────────────���─────────────────────────────���───

export interface TeamSummaryStats {
  toughOpponentCount: number;
  totalPool: number;
  coveragePct: number;   // % of pool with matchupValue > 0
  avgBestValue: number;  // average of best matchupValue per opponent
  megaCount: number;
  hasSRSetter: boolean;
}

export function computeTeamSummary(
  team: string[],
  pool: PoolMember[],
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
): TeamSummaryStats {
  let covered = 0;
  let totalBest = 0;
  let megaCount = 0;
  let hasSR = false;

  for (const name of team) {
    if (pool.find((p) => p.name === name)?.isMega) megaCount++;
    if (STEALTH_ROCK_USERS.has(baseSpecies(name))) hasSR = true;
  }

  const opponents = pool.filter((p) => !team.includes(p.name));

  for (const opp of opponents) {
    let best = -Infinity;
    for (const me of team) {
      const mv = matchupValue(me, opp.name, matrix, poolSpeeds);
      if (mv > best) best = mv;
    }
    if (best >= ANSWER_THRESHOLD) covered++;
    totalBest += Math.max(best, 0);
  }

  const toughCount = opponents.length - covered;

  return {
    toughOpponentCount: toughCount,
    totalPool: opponents.length,
    coveragePct: opponents.length > 0 ? Math.round((covered / opponents.length) * 100) : 0,
    avgBestValue: opponents.length > 0 ? Math.round((totalBest / opponents.length) * 100) / 100 : 0,
    megaCount,
    hasSRSetter: hasSR,
  };
}
