/**
 * team-matchup-core.ts
 *
 * Shared pure functions, types, and constants used by both
 * the main orchestrator (team-matchup.ts) and worker threads
 * (team-matchup-worker.ts).
 *
 * All functions here are stateless: they take all dependencies
 * (matrix, simEnv, etc.) as parameters.
 */

import type {
  DamageMatrix,
  DamageMatrixEntry,
  MatchEvaluation,
  Selection,
  MetaRepresentative,
  CoreRanking,
  PokemonCoreStats,
} from "../types/team-matchup.js";

// ── Re-export types used by both main and worker ────────────────────────────

export type {
  DamageMatrix,
  DamageMatrixEntry,
  MatchEvaluation,
  Selection,
  MetaRepresentative,
  CoreRanking,
  PokemonCoreStats,
};

// ── Internal types ─────────────────────────────��────────────────────────────

export type SPPattern = "physicalAT" | "specialAT" | "hbWall" | "hdWall";

export interface StatsTable {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

export interface BuildConfig {
  nature: string;
  item: string;
  ability: string;
  isMega: boolean;
  spPattern: SPPattern;
  sp: StatsTable;
  weight: number;
}

export interface MetaPokemon {
  name: string;
  usagePct: number;
  usageRank: number;
  builds: BuildConfig[];
  moves: string[];
  types: string[];
  singlesScores?: {
    overallScore: number;
    offensiveScore: number;
    defensiveScore: number;
    speedStat: number;
    speedTier: "fast" | "mid" | "slow";
    speedAdvantage: number;
    sustainedScore: number;
    winRate1v1: number;
    sweepPotential: number;
  };
}

/** Simulation environment: precomputed team-level lookups */
export interface SimEnv {
  weatherUsers: Map<string, string>;
  sandChipImmune: Set<string>;
  srUsers: Set<string>;
  srChipPct: Map<string, number>;
  poolTypes: Map<string, string[]>;
  poolAbilities: Map<string, string>;
  poolSpeeds: Map<string, number>;
  disguiseUsers: Set<string>;
}

// ── Constants ──────────────────────────────��────────────────────────────────

export const MEGA_POOL_SUFFIX = "-Mega";

// Disguise ability: absorbs first hit in 3v3 evaluation
export const DISGUISE_ABILITY = "Disguise";

// Selection algorithm thresholds
export const SECONDARY_ATTACKER_THRESHOLD = 0.4;
export const SECONDARY_ATTACKER_COVERAGE_NEEDED = 5;

// Pool quality gate
export const MIN_MOVE_COUNT = 2;

// Team completeness validation
export const MIN_MEMBER_ROLE_SCORE = 25;

// Self-KO moves
export const SELF_KO_MOVES = new Set(["Explosion", "Self-Destruct"]);
export const SELF_KO_PENALTY = 0.5;

// Charge-turn moves — require a charge turn before attacking.
// Banned unless the user's ability bypasses the charge (e.g. Drought → Sun → instant Solar Beam).
export const CHARGE_TURN_MOVES = new Set(["Solar Beam", "Solar Blade"]);
export const CHARGE_EXEMPT_ABILITIES = new Set(["Drought"]);

// Recharge moves — require a recharge turn after use, losing all momentum.
// Banned outright: the simulation cannot model the opponent's free attack on recharge turn.
export const RECHARGE_MOVES = new Set(["Hyper Beam", "Giga Impact"]);

// Self-stat-drop moves — C-2 (or worse) after use, so the second hit is halved.
// If koN >= 2, the move effectively cannot KO — the opponent survives the weakened second hit.
// koN = 1 (OHKO) is still valid since only one hit is needed.
export const STAT_DROP_MOVES = new Set([
  "Draco Meteor", "Overheat", "Leaf Storm", "Fleur Cannon", "Psycho Boost",
]);

// Palafin-Hero penalty
export const SWITCH_IN_PENALTY_POKEMON = new Set(["Palafin-Hero"]);
export const SWITCH_IN_PENALTY = 0.8;

// Contact chip abilities
export const CHIP_DAMAGE_ABILITIES = new Set(["Rough Skin", "Iron Barbs"]);
export const CHIP_PCT = 12.5;

// Weather
export const WEATHER_ABILITIES: Record<string, string> = {
  "Sand Stream": "Sand",
  "Drought": "Sun",
  "Drizzle": "Rain",
  "Snow Warning": "Snow",
};

export const SAND_CHIP_PCT = 6.25;
const SAND_IMMUNE_TYPES = new Set(["Rock", "Ground", "Steel"]);
const WEATHER_CHIP_IMMUNE_ABILITIES = new Set(["Magic Guard", "Overcoat"]);

// Stealth Rock setters
export const STEALTH_ROCK_USERS = new Set([
  "Hippowdon", "Tyranitar", "Garchomp", "Excadrill", "Skarmory",
  "Clefable", "Gliscor", "Toxapex", "Corviknight", "Forretress",
  "Steelix", "Rhyperior", "Aggron", "Bastiodon", "Garganacl",
  "Sandaconda", "Empoleon",
]);

// Dead member detection — <15% selection rate = member not contributing enough
export const DEAD_SEL_THRESHOLD = 0.15;
export const DEAD_MEMBER_PENALTY = 0.88;

// Tiered refinement thresholds
export const HARD_WEAK_THRESHOLD = 0.10;  // <10%: replace ALL simultaneously
export const ACE_THRESHOLD = 0.30;        // ≥30%: consistently selected "ace"

// Stable core detection
export const STABLE_STREAK_MIN = 5;       // min consecutive rounds at ≥30%
export const STABLE_CORE_MIN_MEMBERS = 4; // min ace members to qualify as stable core

// ADR-004: threat-directed refinement
export const THREAT_BONUS_WEIGHT = 2.0;
export const MEGA_OVERSATURATION_PENALTY = 0.3;

// ADR-006: must-answer tier
export const MUST_ANSWER_TOP_N = 50;

/** Build the set of opponents that refinement MUST find an answer for.
 *  = all megas + top MUST_ANSWER_TOP_N non-mega by overallScore. */
export function buildMustAnswerSet(pool: MetaPokemon[]): Set<string> {
  const must = new Set<string>();
  const nonMega: { name: string; score: number }[] = [];
  for (const p of pool) {
    if (p.name.endsWith(MEGA_POOL_SUFFIX)) {
      must.add(p.name);
    } else {
      nonMega.push({ name: p.name, score: p.singlesScores?.overallScore ?? 0 });
    }
  }
  nonMega.sort((a, b) => b.score - a.score);
  for (let i = 0; i < Math.min(MUST_ANSWER_TOP_N, nonMega.length); i++) {
    must.add(nonMega[i].name);
  }
  return must;
}

// ── Helpers ────────────────────────────────────────────────────────��────────

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** All variant suffixes that should be stripped for species-clause checks. */
const VARIANT_SUFFIXES = [MEGA_POOL_SUFFIX, "-HB", "-HD"];

/** Strip variant suffix (-Mega, -HB, -HD) to get base species name. */
export function baseSpecies(poolName: string): string {
  for (const suffix of VARIANT_SUFFIXES) {
    if (poolName.endsWith(suffix)) {
      return poolName.slice(0, -suffix.length);
    }
  }
  return poolName;
}

export function isSandChipImmune(types: string[], ability: string): boolean {
  if (WEATHER_CHIP_IMMUNE_ABILITIES.has(ability)) return true;
  return types.some((t) => SAND_IMMUNE_TYPES.has(t));
}

/** Resolve weather when two abilities conflict: slower setter wins (sets last). */
export function resolveWeather(
  atkAbility: string, atkSpeed: number,
  defAbility: string, defSpeed: number,
): string | undefined {
  const atkW = WEATHER_ABILITIES[atkAbility];
  const defW = WEATHER_ABILITIES[defAbility];
  if (atkW && !defW) return atkW;
  if (!atkW && defW) return defW;
  if (atkW && defW) {
    if (atkSpeed < defSpeed) return atkW;
    if (defSpeed < atkSpeed) return defW;
    return atkW;
  }
  return undefined;
}

// ── Seeded RNG ────────────────────────────────────────────────────────────���─

/** Simple mulberry32 PRNG for reproducible results */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── KO / Kill Pressure ───────────────────────────────���─────────────────────

/**
 * Effective KO number that incorporates probability.
 * Guaranteed OHKO (koN=1, chance=1.0) → 1.0
 * 50% OHKO (koN=1, chance=0.5) → 1.5 (between OHKO and 2HKO)
 */
export function effectiveKoN(entry: DamageMatrixEntry | undefined | null): number {
  if (!entry || !entry.koN) return 99;
  return entry.koN + (1 - (entry.koChance ?? 0));
}

/**
 * Continuous kill pressure score from effective KO number.
 * Guaranteed OHKO → 3.0, 50% OHKO → 2.5, guaranteed 2HKO → 2.0,
 * guaranteed 3HKO → 1.0, 4HKO+ → 0.
 */
export function calcKillPressure(eKoN: number): number {
  return Math.max(0, Math.min(3, 4 - eKoN));
}

/**
 * Compute adjusted effectiveKoN accounting for virtual chip damage (sand + SR).
 */
export function adjustedEKoN(
  entry: DamageMatrixEntry | undefined | null,
  defenderChipPct: number,
): number {
  const base = effectiveKoN(entry);
  if (!entry || entry.maxPct <= 0 || defenderChipPct <= 0) return base;
  const effHP = Math.max(0, 100 - defenderChipPct);
  if (effHP <= 0) return 0;
  const adjusted = Math.ceil(effHP / entry.maxPct);
  return Math.min(base, adjusted);
}

/**
 * effectiveKoN for a priority move entry.
 */
export function effectivePriorityKoN(entry: DamageMatrixEntry | undefined | null): number {
  if (!entry || !entry.priorityKoN || entry.priorityMaxPct <= 0) return 99;
  return entry.priorityKoN + (1 - (entry.priorityKoChance ?? 0));
}

// ── 3v3 Evaluation ───────────────────────────────────────────────────────���──

/** Check if a team can set Stealth Rock: has an SR user that isn't guaranteed OHKOd. */
export function canSetSR(team: string[], oppTeam: string[], matrix: DamageMatrix, env: SimEnv): boolean {
  for (const sr of team) {
    if (!env.srUsers.has(sr)) continue;
    let isOHKOd = false;
    for (const opp of oppTeam) {
      if (effectiveKoN(matrix[opp]?.[sr]) <= 1.0) {
        isOHKOd = true;
        break;
      }
    }
    if (!isOHKOd) return true;
  }
  return false;
}

/** Resolve team-level weather from selected members. Slower setter wins on conflict. */
export function resolveTeamWeather(
  selA: string[],
  selB: string[],
  env: SimEnv,
): string | undefined {
  const setters: { name: string; weather: string; speed: number }[] = [];
  for (const n of [...selA, ...selB]) {
    const w = env.weatherUsers.get(n);
    if (w) setters.push({ name: n, weather: w, speed: env.poolSpeeds.get(n) ?? 0 });
  }
  if (setters.length === 0) return undefined;
  if (setters.length === 1) return setters[0].weather;
  setters.sort((a, b) => a.speed - b.speed);
  return setters[0].weather;
}

export function evaluate3v3(
  selA: string[],
  selB: string[],
  matrix: DamageMatrix,
  env: SimEnv,
): MatchEvaluation {
  const activeWeather = resolveTeamWeather(selA, selB, env);
  const sandActive = activeWeather === "Sand";

  const srFromA = canSetSR(selA, selB, matrix, env);
  const srFromB = canSetSR(selB, selA, matrix, env);

  function chipFor(name: string, oppHasSR: boolean): number {
    let chip = 0;
    if (sandActive && !env.sandChipImmune.has(name)) chip += SAND_CHIP_PCT;
    if (oppHasSR) chip += env.srChipPct.get(name) ?? 0;
    return chip;
  }

  // ADR-003: matchupValue unified scoring
  let A_total = 0;
  let B_total = 0;

  for (const a of selA) {
    for (const b of selB) {
      const bChip = chipFor(b, srFromA);
      const aChip = chipFor(a, srFromB);
      A_total += matchupValue(a, b, matrix, env.poolSpeeds, bChip);
      B_total += matchupValue(b, a, matrix, env.poolSpeeds, aChip);
    }
  }

  // ── Disguise ability adjustment ─────────────────────────────────────
  // For each Disguise user: find the biggest threat among opponents,
  // recalculate that one pair with koN+1, update the opponent's total.
  // This models "Disguise absorbs the most dangerous hit once per game."

  for (const a of selA) {
    if (!env.disguiseUsers.has(a)) continue;
    let maxThreat = 0;
    let maxThreatOpp = "";
    for (const b of selB) {
      const threat = matchupValue(b, a, matrix, env.poolSpeeds, chipFor(a, srFromB));
      if (threat > maxThreat) {
        maxThreat = threat;
        maxThreatOpp = b;
      }
    }
    if (maxThreatOpp && maxThreat > 0) {
      const adjusted = matchupValue(
        maxThreatOpp, a, matrix, env.poolSpeeds, chipFor(a, srFromB), 1,
      );
      B_total += adjusted - maxThreat;
    }
  }

  for (const b of selB) {
    if (!env.disguiseUsers.has(b)) continue;
    let maxThreat = 0;
    let maxThreatOpp = "";
    for (const a of selA) {
      const threat = matchupValue(a, b, matrix, env.poolSpeeds, chipFor(b, srFromA));
      if (threat > maxThreat) {
        maxThreat = threat;
        maxThreatOpp = a;
      }
    }
    if (maxThreatOpp && maxThreat > 0) {
      const adjusted = matchupValue(
        maxThreatOpp, b, matrix, env.poolSpeeds, chipFor(b, srFromA), 1,
      );
      A_total += adjusted - maxThreat;
    }
  }

  const scoreA = A_total / 22.5;  // max = 3×3×2.5
  const scoreB = B_total / 22.5;

  return {
    scoreA: round1(scoreA * 100) / 100,
    scoreB: round1(scoreB * 100) / 100,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
  };
}

// ── Speed-Weighted Kill Evaluation (ADR-002) ────────────────────────────────

/**
 * Speed-weighted matchup value for a single (attacker, defender) pair.
 * Scores reflect how effectively the attacker can KO the defender,
 * accounting for speed advantage (hits taken vs dealt).
 *
 * Score table:
 *   First-strike 1HKO: 2.5   (0 hits taken, game-dominating)
 *   Slower 1HKO:       1.3   (1 hit taken, but selection pressure value)
 *   First-strike 2HKO: 1.0   (baseline — 1 hit taken to finish)
 *   Slower 2HKO:       0.3   (2 hits taken, barely functional as answer)
 *   Priority 1HKO:     2.5   (speed-independent first strike)
 *   Speed tie:          avg of first/slower values
 *   3HKO+:             0
 */
export function matchupValue(
  me: string,
  opp: string,
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
  defenderChipPct?: number,
  extraDefenderKoN?: number,
): number {
  const entry = matrix[me]?.[opp];
  if (!entry) return 0;

  // Stat-drop moves (Draco Meteor, Overheat, etc.): C-2 after use means
  // the second hit is halved. If koN >= 2, the move cannot actually 2HKO.
  // Treat as 3HKO+ (score = 0) unless it's a genuine OHKO.
  // Fallback: check bestMove name for pre-existing matrices without isStatDrop flag.
  const isStatDrop = entry.isStatDrop ?? STAT_DROP_MOVES.has(entry.bestMove);
  if (isStatDrop && entry.koN >= 2) return 0;

  // ADR-003: chip > 0 → use adjustedEKoN
  let eKoN = defenderChipPct && defenderChipPct > 0
    ? adjustedEKoN(entry, defenderChipPct)
    : effectiveKoN(entry);

  // Disguise: defender survives extra hit(s) — shifts effective KO number
  if (extraDefenderKoN && extraDefenderKoN > 0) {
    eKoN += extraDefenderKoN;
  }

  // Priority OHKO → speed-independent first strike
  if (entry.priorityKoN === 1 && (entry.priorityKoChance ?? 0) >= 0.5) return 2.5;

  if (eKoN > 2.5) return 0; // 3HKO+ → can't effectively KO

  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;
  const isOHKO = eKoN <= 1.25;

  if (isOHKO) {
    if (mySpd > oppSpd) return 2.5;  // first-strike 1HKO
    if (mySpd === oppSpd) return 1.9; // (2.5+1.3)/2
    return 1.3;                       // slower 1HKO
  }
  // 2HKO
  if (mySpd > oppSpd) return 1.0;    // first-strike 2HKO
  if (mySpd === oppSpd) return 0.65;  // (1.0+0.3)/2
  return 0.3;                         // slower 2HKO
}

/**
 * Simulate selection rate for a candidate member across meta representatives.
 * Returns the fraction of meta reps where the candidate is selected (0..1).
 * Used as a gate in refinement to reject members that would never be selected.
 */
export function simulateSelectionRate(
  team: string[],
  candidate: string,
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  megaCapable: Set<string>,
  poolSpeeds: Map<string, number>,
): number {
  if (metaReps.length === 0) return 1;
  let selected = 0;
  for (const rep of metaReps) {
    const sel = selectTeam(team, rep.members, matrix, megaCapable, poolSpeeds);
    if (sel.members.includes(candidate)) selected++;
  }
  return selected / metaReps.length;
}

// ── Selection Algorithm ────────────────────────────────────────────────────

export function selectTeam(
  myTeam: string[],
  oppTeam: string[],
  matrix: DamageMatrix,
  megaCapable: Set<string>,
  poolSpeeds: Map<string, number>,
): Selection {
  // ADR-002: attackerScore = average matchupValue across opponents
  const atkScores: { name: string; score: number; kills: number; avgDmg: number }[] = [];

  for (const me of myTeam) {
    let totalMV = 0;
    let kills = 0;
    let totalDmg = 0;
    for (const opp of oppTeam) {
      totalMV += matchupValue(me, opp, matrix, poolSpeeds);
      const entry = matrix[me]?.[opp];
      if (!entry) continue;
      if (effectiveKoN(entry) <= 2.5) kills++;
      totalDmg += entry.maxPct;
    }
    atkScores.push({
      name: me,
      score: totalMV / oppTeam.length,
      kills,
      avgDmg: totalDmg / oppTeam.length,
    });
  }

  atkScores.sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  const roles: Selection["roles"] = [];

  // Ace
  const ace = atkScores[0];
  selected.push(ace.name);
  roles.push("ace");

  // Secondary attacker?
  for (const cand of atkScores.slice(1)) {
    if (selected.length >= 2) break;
    if (cand.score < SECONDARY_ATTACKER_THRESHOLD) break;

    const hasMegaInSelection = selected.some((s) => megaCapable.has(s));
    if (hasMegaInSelection && megaCapable.has(cand.name)) continue;

    const coveredByAce = new Set<string>();
    const coveredBySecondary = new Set<string>();
    for (const opp of oppTeam) {
      const aceEntry = matrix[ace.name]?.[opp];
      if (effectiveKoN(aceEntry) <= 2.5) coveredByAce.add(opp);
      const candEntry = matrix[cand.name]?.[opp];
      if (effectiveKoN(candEntry) <= 2.5) coveredBySecondary.add(opp);
    }
    const combined = new Set([...coveredByAce, ...coveredBySecondary]);
    if (combined.size >= SECONDARY_ATTACKER_COVERAGE_NEEDED) {
      selected.push(cand.name);
      roles.push("secondary");
      break;
    }
  }

  // Complement slots
  const selectedSet = new Set(selected);

  while (selected.length < 3) {
    let bestComplement = "";
    let bestComplementScore = -1;

    for (const me of myTeam) {
      if (selectedSet.has(me)) continue;

      const hasMegaInSelection = selected.some((s) => megaCapable.has(s));
      if (hasMegaInSelection && megaCapable.has(me)) continue;

      let defenseValue = 0;
      let offenseValue = 0;

      for (const opp of oppTeam) {
        const isThreateningToUs = selected.some((atk) => {
          const entry = matrix[opp]?.[atk];
          return effectiveKoN(entry) <= 1.5;
        });

        if (isThreateningToUs) {
          const oppToMe = matrix[opp]?.[me];
          const meToOpp = matrix[me]?.[opp];
          const canTank = effectiveKoN(oppToMe) > 1.5;
          const canHitBack = meToOpp && meToOpp.maxPct >= 30;
          if (canTank && canHitBack) defenseValue += 1;
        }

        const uncovered = !selected.some((atk) => {
          return effectiveKoN(matrix[atk]?.[opp]) <= 2.5;
        });

        if (uncovered) {
          if (effectiveKoN(matrix[me]?.[opp]) <= 2.5) offenseValue += 1;
        }
      }

      const score = 0.5 * defenseValue + 0.5 * offenseValue;
      if (score > bestComplementScore) {
        bestComplementScore = score;
        bestComplement = me;
      }
    }

    if (!bestComplement || bestComplementScore <= 0) {
      for (const cand of atkScores) {
        if (!selectedSet.has(cand.name)) {
          const hasMegaInSelection = selected.some((s) => megaCapable.has(s));
          if (hasMegaInSelection && megaCapable.has(cand.name)) continue;
          bestComplement = cand.name;
          break;
        }
      }
    }

    if (!bestComplement) {
      bestComplement = myTeam.find((m) => !selectedSet.has(m))!;
    }

    selected.push(bestComplement);
    selectedSet.add(bestComplement);
    roles.push("complement");
  }

  return { members: selected, roles };
}

// ── Team Completeness Validation ────────────────────────────────────────────

/**
 * Validate that every member provides meaningful role complementarity.
 * Rejects teams with "dead weight" members.
 */
export function validateTeamCompleteness(
  members: string[],
  pool: MetaPokemon[],
  matrix: DamageMatrix,
): boolean {
  const memberSet = new Set(members);
  const opponents = pool.filter((p) => !memberSet.has(p.name)).map((p) => p.name);
  const N = opponents.length;
  if (N === 0) return true;

  for (const me of members) {
    const others = members.filter((m) => m !== me);
    let atkNicheCount = 0;
    let defNicheCount = 0;

    for (const opp of opponents) {
      const myEntry = matrix[me]?.[opp];
      const myEKoN = effectiveKoN(myEntry);
      const myMaxPct = myEntry?.maxPct || 0;

      let betterCount = 0;
      for (const o of others) {
        const e = matrix[o]?.[opp];
        const oEKoN = effectiveKoN(e);
        const oMaxPct = e?.maxPct || 0;
        if (oEKoN < myEKoN || (oEKoN === myEKoN && oMaxPct > myMaxPct)) {
          betterCount++;
        }
      }
      if (betterCount < 3) atkNicheCount++;

      const iGetOHKOd = effectiveKoN(matrix[opp]?.[me]) <= 1.5;
      if (!iGetOHKOd && myMaxPct >= 30) {
        const anyTeammateOHKOd = others.some((o) => {
          return effectiveKoN(matrix[opp]?.[o]) <= 1.5;
        });
        if (anyTeammateOHKOd) defNicheCount++;
      }
    }

    const roleScore = Math.round(
      (0.5 * atkNicheCount / N + 0.5 * defNicheCount / N) * 100,
    );

    if (roleScore < MIN_MEMBER_ROLE_SCORE) return false;
  }

  return true;
}

// ── Core Scoring ───────────────────────────────────���────────────────────────

/**
 * Score a replacement candidate by evaluating all trios it forms with the
 * remaining team members against meta representatives.
 */
export function scoreCandidateByCore(
  candidate: string,
  remainingMembers: string[],
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
  megaCapable: Set<string>,
): number {
  const candIsMega = megaCapable.has(candidate);
  let totalScore = 0;
  let validTrios = 0;

  for (let i = 0; i < remainingMembers.length - 1; i++) {
    for (let j = i + 1; j < remainingMembers.length; j++) {
      let megas = candIsMega ? 1 : 0;
      if (megaCapable.has(remainingMembers[i])) megas++;
      if (megas > 1) continue;
      if (megaCapable.has(remainingMembers[j])) megas++;
      if (megas > 1) continue;

      const trio = [candidate, remainingMembers[i], remainingMembers[j]];
      let weightedScore = 0;
      for (const rep of metaReps) {
        const result = evaluate3v3(trio, rep.members, matrix, simEnv);
        if (result.winner === "A") weightedScore += rep.weight;
        else if (result.winner === "draw") weightedScore += rep.weight * 0.5;
      }
      totalScore += weightedScore;
      validTrios++;
    }
  }

  return validTrios > 0 ? totalScore / validTrios : 0;
}

// ── MinHeap ─────────────────────────────────────────────────────────────��───

/** Minimum heap: keeps the top-K items by score (lowest score evicted first). */
export class MinHeap<T> {
  private heap: { score: number; item: T }[] = [];
  private capacity: number;
  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(score: number, item: T): void {
    if (this.heap.length < this.capacity) {
      this.heap.push({ score, item });
      this._bubbleUp(this.heap.length - 1);
    } else if (score > this.heap[0].score) {
      this.heap[0] = { score, item };
      this._sinkDown(0);
    }
  }

  toSorted(): { score: number; item: T }[] {
    return [...this.heap].sort((a, b) => b.score - a.score);
  }

  /** Merge another heap's items into this one */
  mergeFrom(items: { score: number; item: T }[]): void {
    for (const { score, item } of items) {
      this.push(score, item);
    }
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i].score < this.heap[parent].score) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1, right = 2 * i + 2;
      if (left < n && this.heap[left].score < this.heap[smallest].score) smallest = left;
      if (right < n && this.heap[right].score < this.heap[smallest].score) smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

// ── SimEnv Serialization ───────────────────────────────���────────────────────

/** Serialize SimEnv for transfer to worker threads (Maps/Sets → plain objects). */
export function serializeSimEnv(env: SimEnv): any {
  return {
    weatherUsers: [...env.weatherUsers.entries()],
    sandChipImmune: [...env.sandChipImmune],
    srUsers: [...env.srUsers],
    srChipPct: [...env.srChipPct.entries()],
    poolTypes: [...env.poolTypes.entries()],
    poolAbilities: [...env.poolAbilities.entries()],
    poolSpeeds: [...env.poolSpeeds.entries()],
    disguiseUsers: [...env.disguiseUsers],
  };
}

/** Deserialize SimEnv from worker thread data. */
export function deserializeSimEnv(data: any): SimEnv {
  return {
    weatherUsers: new Map(data.weatherUsers),
    sandChipImmune: new Set(data.sandChipImmune),
    srUsers: new Set(data.srUsers),
    srChipPct: new Map(data.srChipPct),
    poolTypes: new Map(data.poolTypes),
    poolAbilities: new Map(data.poolAbilities),
    poolSpeeds: new Map(data.poolSpeeds),
    disguiseUsers: new Set(data.disguiseUsers ?? []),
  };
}

// ── ADR-004a: Answer Context & meetsAnswerCriteria ───────────────────────────

/** Context for meetsAnswerCriteria — all external state needed for answer check */
export interface AnswerContext {
  matrix: DamageMatrix;
  poolSpeeds: Map<string, number>;
  teamHasSand: boolean;
  teamHasSR: boolean;
  srChipPct: Map<string, number>;
  sandChipImmune: Set<string>;
  weatherUsers: Map<string, string>;
}

/** Build AnswerContext from SimEnv + team members */
export function buildAnswerContext(
  members: string[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
): AnswerContext {
  const teamWeatherSetters = members.filter(m => simEnv.weatherUsers.has(m));
  const teamWeather = teamWeatherSetters.length > 0
    ? simEnv.weatherUsers.get(teamWeatherSetters[0]) : undefined;

  return {
    matrix,
    poolSpeeds: simEnv.poolSpeeds,
    teamHasSand: teamWeather === "Sand",
    teamHasSR: members.some(m => simEnv.srUsers.has(m)),
    srChipPct: simEnv.srChipPct,
    sandChipImmune: simEnv.sandChipImmune,
    weatherUsers: simEnv.weatherUsers,
  };
}

/** Check if team member `me` can answer opponent `oppName` */
export function meetsAnswerCriteria(
  me: string, oppName: string, oppSpeed: number, ctx: AnswerContext,
): boolean {
  const meToOpp = ctx.matrix[me]?.[oppName];
  const oppToMe = ctx.matrix[oppName]?.[me];
  if (!meToOpp) return false;

  // oppChipFor inline
  let oppChip = 0;
  if (ctx.teamHasSand && !ctx.sandChipImmune.has(oppName)) oppChip += SAND_CHIP_PCT;
  if (ctx.teamHasSR) oppChip += ctx.srChipPct.get(oppName) ?? 0;

  const myEKoN = adjustedEKoN(meToOpp, oppChip);

  const memberSpeed = ctx.poolSpeeds.get(me) ?? 0;
  const outspeeds = memberSpeed > oppSpeed;
  const hasPriority = meToOpp.priorityMaxPct > 0;
  const oppHasPriority = oppToMe ? oppToMe.priorityMaxPct > 0 : false;

  const canCombinedKO = hasPriority && !oppHasPriority &&
    (meToOpp.maxPct + meToOpp.priorityMaxPct + oppChip >= 100);
  if (myEKoN > 2.5 && !canCombinedKO) return false;

  // myChipFrom inline
  const oppWeather = ctx.weatherUsers.get(oppName);
  let meChip = 0;
  if (oppWeather === "Sand" && !ctx.sandChipImmune.has(me)) meChip += SAND_CHIP_PCT;

  let theirEKoNToMe = adjustedEKoN(oppToMe, meChip);

  const selfDmgPerHit = meToOpp.recoilPctToSelf + meToOpp.chipPctToAttacker;
  if (selfDmgPerHit > 0 && oppToMe && oppToMe.maxPct > 0) {
    const hitsNeeded = Math.ceil(myEKoN);
    const totalSelfDmg = hitsNeeded * selfDmgPerHit;
    const myEffectiveHP = 100 - totalSelfDmg - meChip;
    if (myEffectiveHP > 0) {
      const adjusted = Math.ceil(myEffectiveHP / oppToMe.maxPct);
      theirEKoNToMe = Math.min(theirEKoNToMe, adjusted);
    } else {
      theirEKoNToMe = 0;
    }
  }

  if (outspeeds) {
    if (myEKoN <= 1.25) return true;
    if (theirEKoNToMe >= 2 && myEKoN <= theirEKoNToMe) return true;
  }

  if (!outspeeds && hasPriority && !oppHasPriority) {
    if (canCombinedKO) {
      const oppDmgToMe = oppToMe?.maxPct ?? 0;
      const recoilFromMainMove = meToOpp.recoilPctToSelf;
      const contactChipFromMainMove = meToOpp.chipPctToAttacker;
      const myHPAfterTurn1 = 100 - oppDmgToMe - recoilFromMainMove - contactChipFromMainMove - meChip;
      if (myHPAfterTurn1 > 0) return true;
    }
    if (theirEKoNToMe >= 2) {
      const prioEKoN = adjustedEKoN(
        { ...meToOpp, maxPct: meToOpp.priorityMaxPct, koN: meToOpp.priorityKoN, koChance: meToOpp.priorityKoChance },
        oppChip,
      );
      if (prioEKoN <= 2.5 && prioEKoN <= theirEKoNToMe) return true;
    }
  }

  if (!outspeeds && theirEKoNToMe >= 2 && myEKoN < theirEKoNToMe) return true;

  return false;
}
