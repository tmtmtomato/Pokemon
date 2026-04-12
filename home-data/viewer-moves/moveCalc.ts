/**
 * On-the-fly damage calculation helpers for the Move Consistency Viewer.
 * Uses the same calculate() engine as the analyzer pipeline.
 */
import { calculate, Pokemon, Move, Field, getEffectiveness } from "../../src/index";
import type { PoolMember, DamageMatrix } from "../types/team-matchup";

export interface MoveDamageResult {
  moveName: string;
  minPct: number;
  maxPct: number;
  koN: number;
  koChance: number;
  effectiveness: number;
}

export interface MoveMatrixRow {
  moveName: string;
  moveType: string;
  results: (MoveDamageResult | null)[]; // one per opponent
  consistency: number; // 0-100: % of opponents hit at neutral+
  seCount: number; // count of super-effective hits
}

export interface MoveMatrixData {
  rows: MoveMatrixRow[];
  bestCombo: { moves: string[]; coverage: number } | null;
}

function createPokemon(member: PoolMember, moves?: string[]): Pokemon {
  return new Pokemon({
    name: member.name,
    nature: member.nature as any,
    sp: member.sp,
    ability: member.ability,
    item: member.item,
    isMega: member.isMega,
    moves: moves ?? member.moves,
  });
}

export function computeMoveDamage(
  attacker: PoolMember,
  defender: PoolMember,
  moveName: string,
  defenderHPFraction?: number, // 0-1: reduced HP (e.g. 0.875 for SR neutral)
): MoveDamageResult | null {
  try {
    const atkPokemon = createPokemon(attacker, [moveName]);
    const defPokemon = createPokemon(defender);
    const field = new Field({ gameType: "Singles" as any });
    const move = new Move(moveName);
    const result = calculate(atkPokemon, defPokemon, move, field);
    const [minPct, maxPct] = result.percentRange();
    const effectiveHP = defenderHPFraction !== undefined
      ? Math.max(1, Math.floor(defPokemon.maxHP() * defenderHPFraction))
      : undefined;
    const ko = result.koChance(effectiveHP);
    return {
      moveName,
      minPct: Math.round(minPct * 10) / 10,
      maxPct: Math.round(maxPct * 10) / 10,
      koN: ko.n,
      koChance: Math.round(ko.chance * 1000) / 1000,
      effectiveness: result.typeEffectiveness,
    };
  } catch {
    return null;
  }
}

export function computeMoveMatrix(
  attacker: PoolMember,
  opponents: PoolMember[],
): MoveMatrixData {
  const validOpponents = opponents.filter(Boolean);
  if (validOpponents.length === 0 || attacker.moves.length === 0) {
    return { rows: [], bestCombo: null };
  }

  // Get move types from the Move class
  const moveTypes = new Map<string, string>();
  for (const moveName of attacker.moves) {
    try {
      const m = new Move(moveName);
      moveTypes.set(moveName, (m as any).type ?? "Normal");
    } catch {
      moveTypes.set(moveName, "Normal");
    }
  }

  const rows: MoveMatrixRow[] = attacker.moves.map((moveName) => {
    const results = validOpponents.map((opp) => computeMoveDamage(attacker, opp, moveName));
    const hitsNeutral = results.filter((r) => r && r.effectiveness >= 1).length;
    const seCount = results.filter((r) => r && r.effectiveness > 1).length;

    return {
      moveName,
      moveType: moveTypes.get(moveName) ?? "Normal",
      results,
      consistency: validOpponents.length > 0
        ? Math.round((hitsNeutral / validOpponents.length) * 100)
        : 0,
      seCount,
    };
  });

  // Find best 2-move combination for maximum coverage
  const bestCombo = findBestCombo(rows, validOpponents.length);

  return { rows, bestCombo };
}

function findBestCombo(
  rows: MoveMatrixRow[],
  oppCount: number,
): { moves: string[]; coverage: number } | null {
  if (rows.length <= 1 || oppCount === 0) return null;

  let bestMoves: string[] = [];
  let bestCoverage = 0;

  // Check all 2-move combinations
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      let covered = 0;
      for (let k = 0; k < oppCount; k++) {
        const a = rows[i].results[k];
        const b = rows[j].results[k];
        // Covered if either move hits at neutral+ AND deals meaningful damage (>5%)
        if ((a && a.effectiveness >= 1 && a.maxPct > 5) ||
            (b && b.effectiveness >= 1 && b.maxPct > 5)) {
          covered++;
        }
      }
      const coverage = Math.round((covered / oppCount) * 100);
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestMoves = [rows[i].moveName, rows[j].moveName];
      }
    }
  }

  return bestMoves.length > 0 ? { moves: bestMoves, coverage: bestCoverage } : null;
}

/** Compute team-wide coverage: across all members' moves, how many opponents are covered? */
export function computeTeamCoverage(
  members: PoolMember[],
  opponents: PoolMember[],
): { covered: number; total: number } {
  const validOpponents = opponents.filter(Boolean);
  if (validOpponents.length === 0 || members.length === 0) {
    return { covered: 0, total: 0 };
  }

  let covered = 0;
  for (let oi = 0; oi < validOpponents.length; oi++) {
    let canHit = false;
    for (const member of members) {
      for (const moveName of member.moves) {
        const r = computeMoveDamage(member, validOpponents[oi], moveName);
        if (r && r.effectiveness >= 1 && r.maxPct > 5) {
          canHit = true;
          break;
        }
      }
      if (canHit) break;
    }
    if (canHit) covered++;
  }

  return { covered, total: validOpponents.length };
}

// ─── Threat Analysis ───────────────────────────────────────────

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface BestHit {
  member: string;
  move: string;
  maxPct: number;
  koN: number;
  koChance: number;
}

export interface ThreatResult {
  opponent: PoolMember;
  ourBest: BestHit;
  theirBest: { move: string; target: string; maxPct: number; koN: number; koChance: number };
  speedMatchup: "faster" | "slower" | "tie";
  threatLevel: ThreatLevel;
}

export interface ThreatAnswer {
  member: string;       // Team member that answers the threat
  reason: "outspeed_ohko" | "resist_threat" | "immune_threat" | "1v1_winner";
  ourDmg: number;       // Our max damage % to the user
  ourKoN: number;
  ourKoChance: number;
  speedTie?: boolean;   // true when memberSpeed === enemySpeed
}

export interface DangerousMove {
  user: string;       // Pokemon using the move
  move: string;
  moveType: string;
  targets: { name: string; maxPct: number; koN: number; koChance: number }[];
  ohkoCount: number;  // How many targets are guaranteed OHKOed
  answer: ThreatAnswer | null; // Who on our team handles this?
  speedTieAnswer?: ThreatAnswer | null; // Would-be answer blocked by speed tie (display only)
}

export interface ThreatAnalysisResult {
  threats: ThreatResult[];
  coverageGaps: string[];
  dangerousMoves: DangerousMove[];
  uncoveredCount: number;   // Dangerous moves with no answer
  answerRate: number;       // 0-100: % of dangerous moves answered
}

export interface TeamThreatResult {
  threats: ThreatResult[];
  overallDifficulty: number;
  worstMatchups: { ours: string; theirs: string; theirDmg: number }[];
}

// ─── HB/HD Defensive Variant Helpers ──────────────────────

const WALL_NATURE_PAIRS: Record<string, string> = {
  Bold: "Calm", Impish: "Careful", Relaxed: "Sassy", Lax: "Gentle",
  Calm: "Bold", Careful: "Impish", Sassy: "Relaxed", Gentle: "Lax",
};
const HB_SP = { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 };
const HD_SP = { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 };

function isWallBuild(m: PoolMember): boolean {
  return m.sp.hp === 32 && (m.sp.def === 32 || m.sp.spd === 32);
}

function getDefensiveAlternate(m: PoolMember): PoolMember | null {
  if (!isWallBuild(m)) return null;
  const alt = WALL_NATURE_PAIRS[m.nature];
  if (!alt) return null;
  const isHB = m.sp.def === 32;
  return { ...m, nature: alt, sp: isHB ? { ...HD_SP } : { ...HB_SP } };
}

// ─── Stealth Rock Helpers ─────────────────────────────────

export interface SRConfig {
  ourSR: boolean;     // Our team sets SR → opponents take chip
  enemySR: boolean;   // Opponent sets SR → our team takes chip
}

export function getSRChipPct(defenderTypes: string[]): number {
  const eff = getEffectiveness("Rock" as any, defenderTypes as any[]);
  return (eff / 8) * 100;
}

// ─── Threat Classification ────────────────────────────────

function classifyThreat(
  ourBestKoN: number,
  theirBestKoN: number,
  speed: "faster" | "slower" | "tie",
): ThreatLevel {
  // CRITICAL: can't KO within 3 hits AND they KO us in 2
  if (ourBestKoN >= 3 && theirBestKoN <= 2) return "critical";
  // HIGH: can't KO within 3 hits OR they KO in 2 while faster
  if (ourBestKoN >= 3 || (theirBestKoN <= 2 && speed === "slower")) return "high";
  // MEDIUM: need 2 hits to KO
  if (ourBestKoN === 2) return "medium";
  // LOW: we OHKO
  return "low";
}

function getMoveType(moveName: string): string {
  try {
    const m = new Move(moveName);
    return (m as any).type ?? "Normal";
  } catch {
    return "Normal";
  }
}

/** Evaluate threat of a single opponent against our team */
export function computeThreatScore(
  myTeam: PoolMember[],
  opponent: PoolMember,
  srConfig?: SRConfig,
): ThreatResult {
  // SR fractions
  const enemySRFrac = srConfig?.ourSR
    ? 1 - getSRChipPct(opponent.types) / 100
    : undefined;

  // Our best: which member + move deals the most damage?
  let ourBest: BestHit = { member: "", move: "", maxPct: 0, koN: 0, koChance: 0 };
  for (const member of myTeam) {
    for (const moveName of member.moves) {
      const r = computeMoveDamage(member, opponent, moveName, enemySRFrac);
      if (r && r.maxPct > ourBest.maxPct) {
        ourBest = { member: member.name, move: moveName, maxPct: r.maxPct, koN: r.koN, koChance: r.koChance };
      }
    }
  }

  // Their best: which move + which of our members takes the most damage?
  // For wall builds, test both HB and HD variants — use the one that takes LESS damage
  let theirBest = { move: "", target: "", maxPct: 0, koN: 0, koChance: 0 };
  for (const moveName of opponent.moves) {
    for (const member of myTeam) {
      const memberSRFrac = srConfig?.enemySR
        ? 1 - getSRChipPct(member.types) / 100
        : undefined;

      // Test both HB and HD variants for wall builds, pick less damage
      let r = computeMoveDamage(opponent, member, moveName, memberSRFrac);
      const alt = getDefensiveAlternate(member);
      if (alt) {
        const rAlt = computeMoveDamage(opponent, alt, moveName, memberSRFrac);
        if (rAlt && (!r || rAlt.maxPct < r.maxPct)) r = rAlt;
      }

      if (r && r.maxPct > theirBest.maxPct) {
        theirBest = { move: moveName, target: member.name, maxPct: r.maxPct, koN: r.koN, koChance: r.koChance };
      }
    }
  }

  // Speed: compare fastest team member vs opponent
  const ourFastest = Math.max(...myTeam.map((m) => m.speedStat ?? 0));
  const oppSpeed = opponent.speedStat ?? 0;
  const speedMatchup: "faster" | "slower" | "tie" =
    ourFastest > oppSpeed ? "faster" : ourFastest < oppSpeed ? "slower" : "tie";

  const threatLevel = classifyThreat(
    ourBest.koN || 99,
    theirBest.koN || 99,
    speedMatchup,
  );

  return { opponent, ourBest, theirBest, speedMatchup, threatLevel };
}

const ALL_TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
  "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
];

/**
 * Find a team member that can reliably answer the user of a dangerous move.
 *
 * Evaluates the FULL 1v1 matchup after switching in, not just the single
 * dangerous move. The enemy has 3 other moves that may hit the answer hard.
 *
 * Answer criteria (in priority order):
 * 1. Immune to the dangerous move AND wins or trades in the full 1v1
 * 2. Resists the dangerous move AND wins the full 1v1
 * 3. Outspeeds AND OHKOs the user (revenge kill)
 *
 * 1v1 outcome logic:
 *   We outspeed → we win if ourKoN <= theirKoN (we KO first or same turn)
 *   They outspeed → we win only if ourKoN < theirKoN (they hit first)
 *   For immune: lenient — even losing 1v1 is ok if we force a switch
 *     (they can't stay in spamming the dangerous move)
 */
function findAnswer(
  myTeam: PoolMember[],
  enemy: PoolMember,
  dangerousMoveName: string,
  enemySpeed: number,
  srConfig?: SRConfig,
): { answer: ThreatAnswer | null; speedTieAnswer: ThreatAnswer | null } {
  let bestAnswer: ThreatAnswer | null = null;
  let bestPriority = 999;
  let bestSpeedTie: ThreatAnswer | null = null;
  let bestSpeedTiePriority = 999;

  // SR fractions
  const enemySRFrac = srConfig?.ourSR
    ? 1 - getSRChipPct(enemy.types) / 100
    : undefined;

  for (const member of myTeam) {
    const memberSRFrac = srConfig?.enemySR
      ? 1 - getSRChipPct(member.types) / 100
      : undefined;

    // Test both HB and HD variants for wall builds
    const variants: PoolMember[] = [member];
    const alt = getDefensiveAlternate(member);
    if (alt) variants.push(alt);

    for (const variant of variants) {
      // Check how much damage the dangerous move does to this variant
      const incomingDmg = computeMoveDamage(enemy, variant, dangerousMoveName, memberSRFrac);
      const memberSpeed = member.speedStat ?? 0;
      const outspeeds = memberSpeed > enemySpeed;
      const isSpeedTie = memberSpeed === enemySpeed && memberSpeed > 0;

      // Our best damage to the enemy (same for both variants — wall atk/spa SP=0)
      let ourBestDmg = 0;
      let ourBestKoN = 99;
      let ourBestKoChance = 0;
      for (const moveName of member.moves) {
        const r = computeMoveDamage(member, enemy, moveName, enemySRFrac);
        if (r && r.maxPct > ourBestDmg) {
          ourBestDmg = r.maxPct;
          ourBestKoN = r.koN;
          ourBestKoChance = r.koChance;
        }
      }

      // Enemy's best move against THIS variant (not just the dangerous move)
      let enemyBestDmg = 0;
      let enemyBestKoN = 99;
      for (const enmove of enemy.moves) {
        const r = computeMoveDamage(enemy, variant, enmove, memberSRFrac);
        if (r && r.maxPct > enemyBestDmg) {
          enemyBestDmg = r.maxPct;
          enemyBestKoN = r.koN;
        }
      }

      // 1v1 outcome: who KOs first considering speed?
      const weWin1v1 = outspeeds
        ? ourBestKoN <= enemyBestKoN   // we hit first → KO same turn or before
        : ourBestKoN < enemyBestKoN;   // they hit first → we must KO strictly before

      // Helper to update best answer or speed-tie answer
      const tryUpdate = (priority: number, reason: ThreatAnswer["reason"]) => {
        const entry: ThreatAnswer = {
          member: member.name, reason, ourDmg: ourBestDmg,
          ourKoN: ourBestKoN, ourKoChance: ourBestKoChance,
          speedTie: isSpeedTie || undefined,
        };
        if (priority < bestPriority || (priority === bestPriority && ourBestDmg > (bestAnswer?.ourDmg ?? 0))) {
          bestAnswer = entry;
          bestPriority = priority;
        }
      };

      // Helper to record a speed-tie potential answer (would answer if faster)
      const trySpeedTie = (priority: number, reason: ThreatAnswer["reason"]) => {
        if (priority < bestSpeedTiePriority || (priority === bestSpeedTiePriority && ourBestDmg > (bestSpeedTie?.ourDmg ?? 0))) {
          bestSpeedTie = {
            member: member.name, reason, ourDmg: ourBestDmg,
            ourKoN: ourBestKoN, ourKoChance: ourBestKoChance,
            speedTie: true,
          };
          bestSpeedTiePriority = priority;
        }
      };

      // Priority 1: Immune to the dangerous move
      if (incomingDmg && incomingDmg.effectiveness === 0 && ourBestDmg > 5) {
        if (enemyBestKoN <= 1 && !outspeeds) {
          // Speed tie: immune switch-in but enemy OHKOs with coverage before we act
          if (isSpeedTie && ourBestKoN === 1) trySpeedTie(1, "immune_threat");
          continue;
        }
        if (weWin1v1 || ourBestKoN <= 2 || enemyBestKoN >= 3) {
          tryUpdate(1, "immune_threat");
        }
        continue;
      }

      // Priority 2: Resists the dangerous move
      if (incomingDmg && incomingDmg.effectiveness < 1 && ourBestKoN <= 3) {
        if (!weWin1v1) continue;
        tryUpdate(2, "resist_threat");
        continue;
      }

      // Priority 3: Outspeeds and OHKOs (revenge kill)
      if (outspeeds && ourBestKoN === 1) {
        tryUpdate(3, "outspeed_ohko");
        continue;
      }
      // Speed tie: would OHKO if faster
      if (isSpeedTie && ourBestKoN === 1) {
        trySpeedTie(3, "outspeed_ohko");
        continue;
      }

      // Priority 4: General 1v1 winner — can 2HKO AND wins KO race
      if (ourBestKoN <= 2 && enemyBestKoN >= 2) {
        const weWin = outspeeds
          ? ourBestKoN <= enemyBestKoN
          : ourBestKoN < enemyBestKoN;
        if (weWin) {
          tryUpdate(4, "1v1_winner");
        } else if (isSpeedTie && ourBestKoN <= enemyBestKoN) {
          // Would win if faster (ourKoN <= enemyKoN with speed advantage)
          trySpeedTie(4, "1v1_winner");
        }
      }
    }
  }

  return { answer: bestAnswer, speedTieAnswer: bestAnswer ? null : bestSpeedTie };
}

/** Full threat analysis of our team vs the entire pool */
export function computeFullThreatAnalysis(
  myTeam: PoolMember[],
  pool: PoolMember[],
  srConfig?: SRConfig,
): ThreatAnalysisResult {
  const teamNames = new Set(myTeam.map((m) => m.name));
  const enemies = pool.filter((p) => !teamNames.has(p.name));

  // 1. Threat ranking
  const threats = enemies
    .map((opp) => computeThreatScore(myTeam, opp, srConfig))
    .sort((a, b) => {
      const levelOrder: Record<ThreatLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const ld = levelOrder[a.threatLevel] - levelOrder[b.threatLevel];
      if (ld !== 0) return ld;
      // Within same level, sort by our best damage ascending (harder to kill first)
      return a.ourBest.maxPct - b.ourBest.maxPct;
    });

  // 2. Coverage gaps: types we have no SE move for
  const teamMoveTypes = new Set<string>();
  for (const member of myTeam) {
    for (const moveName of member.moves) {
      teamMoveTypes.add(getMoveType(moveName));
    }
  }
  // A type is "covered" if we have a move type that is SE against it
  // For simplicity, check which types in the pool we can't hit SE
  const coverageGaps: string[] = [];
  for (const defType of ALL_TYPES) {
    // Check if any team member has an SE hit against a pure-type Pokemon of this type
    let canHitSE = false;
    // Find a pool member of this type to test against
    const representative = enemies.find((p) => p.types.includes(defType));
    if (representative) {
      for (const member of myTeam) {
        for (const moveName of member.moves) {
          const r = computeMoveDamage(member, representative, moveName);
          if (r && r.effectiveness > 1) {
            canHitSE = true;
            break;
          }
        }
        if (canHitSE) break;
      }
    } else {
      canHitSE = true; // no representative in pool, not relevant
    }
    if (!canHitSE) coverageGaps.push(defType);
  }

  // 3. Dangerous moves: opponent moves that threaten 3+ team members
  //    + answer check: does our team have a reliable check for the user?
  const moveHitsMap = new Map<string, DangerousMove>();
  for (const enemy of enemies) {
    const enemySpeed = enemy.speedStat ?? 0;
    for (const moveName of enemy.moves) {
      const key = `${enemy.name}::${moveName}`;
      const targets: { name: string; maxPct: number; koN: number; koChance: number }[] = [];
      for (const member of myTeam) {
        // For dangerous move target listing, use enemy SR + HB/HD best variant
        const memberSRFrac = srConfig?.enemySR
          ? 1 - getSRChipPct(member.types) / 100
          : undefined;
        let r = computeMoveDamage(enemy, member, moveName, memberSRFrac);
        const altM = getDefensiveAlternate(member);
        if (altM) {
          const rAlt = computeMoveDamage(enemy, altM, moveName, memberSRFrac);
          if (rAlt && (!r || rAlt.maxPct < r.maxPct)) r = rAlt;
        }
        if (r && r.effectiveness >= 1 && r.maxPct >= 50) {
          targets.push({ name: member.name, maxPct: r.maxPct, koN: r.koN, koChance: r.koChance });
        }
      }
      if (targets.length >= 3) {
        const ohkoCount = targets.filter((t) => t.koN === 1 && t.koChance >= 1).length;
        // Find an answer: a team member that can reliably handle the user
        const { answer, speedTieAnswer } = findAnswer(myTeam, enemy, moveName, enemySpeed, srConfig);
        moveHitsMap.set(key, {
          user: enemy.name,
          move: moveName,
          moveType: getMoveType(moveName),
          targets: targets.sort((a, b) => b.maxPct - a.maxPct),
          ohkoCount,
          answer,
          speedTieAnswer,
        });
      }
    }
  }
  const dangerousMoves = [...moveHitsMap.values()]
    .sort((a, b) => {
      // Unanswered threats first
      if (!a.answer && b.answer) return -1;
      if (a.answer && !b.answer) return 1;
      // Then by OHKO count descending
      if (b.ohkoCount !== a.ohkoCount) return b.ohkoCount - a.ohkoCount;
      // Then by target count
      if (b.targets.length !== a.targets.length) return b.targets.length - a.targets.length;
      const avgA = a.targets.reduce((s, t) => s + t.maxPct, 0) / a.targets.length;
      const avgB = b.targets.reduce((s, t) => s + t.maxPct, 0) / b.targets.length;
      return avgB - avgA;
    });

  const uncoveredCount = dangerousMoves.filter((dm) => !dm.answer).length;
  const answerRate = dangerousMoves.length > 0
    ? Math.round(((dangerousMoves.length - uncoveredCount) / dangerousMoves.length) * 100)
    : 100;

  return { threats, coverageGaps, dangerousMoves, uncoveredCount, answerRate };
}

// ─── Adoption Reason Analysis ─────────────────────────────────

export interface MemberAdoptionReason {
  name: string;
  answerCount: number;          // Dangerous moves this member answers
  exclusiveAnswerCount: number; // Dangerous moves ONLY this member answers
  exclusiveVs: string[];        // Enemy Pokemon only this member answers
  uniqueTypes: string[];        // Move types only this member has on the team
  selectionRate: number;        // 0-100: from topTeam commonSelections (set externally)
}

/** Compute adoption reasons for each team member based on threat analysis */
export function computeAdoptionReasons(
  myTeam: PoolMember[],
  analysis: ThreatAnalysisResult,
): Omit<MemberAdoptionReason, "selectionRate">[] {
  // Count answers per member
  const answerCounts = new Map<string, number>();
  // Track which enemies each member answers (by enemy name)
  const answeredEnemiesByMember = new Map<string, Set<string>>();
  for (const dm of analysis.dangerousMoves) {
    if (dm.answer) {
      const name = dm.answer.member;
      answerCounts.set(name, (answerCounts.get(name) ?? 0) + 1);
      if (!answeredEnemiesByMember.has(name)) answeredEnemiesByMember.set(name, new Set());
      answeredEnemiesByMember.get(name)!.add(dm.user);
    }
  }

  // Exclusive answers: for each enemy, if only ONE member answers ALL their dangerous moves
  const enemyAnswerers = new Map<string, Set<string>>(); // enemy → members that answer
  for (const dm of analysis.dangerousMoves) {
    if (dm.answer) {
      if (!enemyAnswerers.has(dm.user)) enemyAnswerers.set(dm.user, new Set());
      enemyAnswerers.get(dm.user)!.add(dm.answer.member);
    }
  }

  const exclusiveCounts = new Map<string, number>();
  const exclusiveVsMap = new Map<string, string[]>();
  for (const [enemy, members] of enemyAnswerers) {
    if (members.size === 1) {
      const member = [...members][0];
      exclusiveCounts.set(member, (exclusiveCounts.get(member) ?? 0) + 1);
      if (!exclusiveVsMap.has(member)) exclusiveVsMap.set(member, []);
      exclusiveVsMap.get(member)!.push(enemy);
    }
  }

  // Unique move types per member
  const memberMoveTypes = new Map<string, Set<string>>();
  for (const member of myTeam) {
    const types = new Set<string>();
    for (const moveName of member.moves) {
      types.add(getMoveType(moveName));
    }
    memberMoveTypes.set(member.name, types);
  }

  return myTeam.map((member) => {
    const myTypes = memberMoveTypes.get(member.name) ?? new Set<string>();
    // Types that no other team member has
    const uniqueTypes: string[] = [];
    for (const type of myTypes) {
      const othersHaveIt = myTeam.some(
        (m) => m.name !== member.name && (memberMoveTypes.get(m.name)?.has(type) ?? false),
      );
      if (!othersHaveIt) uniqueTypes.push(type);
    }

    return {
      name: member.name,
      answerCount: answerCounts.get(member.name) ?? 0,
      exclusiveAnswerCount: exclusiveCounts.get(member.name) ?? 0,
      exclusiveVs: exclusiveVsMap.get(member.name) ?? [],
      uniqueTypes,
    };
  });
}

// ─── Gap Solutions ────────────────────────────────────────

export interface SolutionCandidate {
  member: PoolMember;
  answer: ThreatAnswer;
}

export interface ThreatSolution {
  user: string;
  move: string;
  moveType: string;
  candidates: SolutionCandidate[];
}

/** Find pool Pokemon that can answer uncovered dangerous moves */
export function findSolutions(
  uncoveredMoves: DangerousMove[],
  pool: PoolMember[],
  teamNames: Set<string>,
): ThreatSolution[] {
  const oppNames = new Set(uncoveredMoves.map((dm) => dm.user));
  const solutions: ThreatSolution[] = [];

  for (const dm of uncoveredMoves) {
    const enemy = pool.find((p) => p.name === dm.user);
    if (!enemy) continue;
    const enemySpeed = enemy.speedStat ?? 0;

    const candidates: SolutionCandidate[] = [];

    for (const candidate of pool) {
      if (teamNames.has(candidate.name)) continue;
      if (oppNames.has(candidate.name)) continue;

      // Use single-member findAnswer logic inline
      const { answer } = findAnswer([candidate], enemy, dm.move, enemySpeed);
      if (answer) {
        candidates.push({ member: candidate, answer });
      }
    }

    // Sort: immune > resist > outspeed_ohko > 1v1_winner, then by damage
    const reasonPriority: Record<string, number> = {
      immune_threat: 1, resist_threat: 2, outspeed_ohko: 3, "1v1_winner": 4,
    };
    candidates.sort((a, b) => {
      const pa = reasonPriority[a.answer.reason] ?? 9;
      const pb = reasonPriority[b.answer.reason] ?? 9;
      if (pa !== pb) return pa - pb;
      return b.answer.ourDmg - a.answer.ourDmg;
    });

    solutions.push({
      user: dm.user,
      move: dm.move,
      moveType: dm.moveType,
      candidates: candidates.slice(0, 5),
    });
  }

  return solutions;
}

/** Evaluate threat of an opponent team against our team */
export function computeTeamThreat(
  myTeam: PoolMember[],
  opponentTeam: PoolMember[],
): TeamThreatResult {
  const threats = opponentTeam.map((opp) => computeThreatScore(myTeam, opp));

  // Overall difficulty: 0-100 based on threat levels
  const levelScores: Record<ThreatLevel, number> = { critical: 100, high: 70, medium: 40, low: 10 };
  const totalScore = threats.reduce((s, t) => s + levelScores[t.threatLevel], 0);
  const overallDifficulty = Math.min(100, Math.round(totalScore / threats.length));

  // Worst matchups: for each opponent, their best hit against us
  const worstMatchups = threats
    .filter((t) => t.theirBest.maxPct > 30)
    .map((t) => ({
      ours: t.theirBest.target,
      theirs: t.opponent.name,
      theirDmg: t.theirBest.maxPct,
    }))
    .sort((a, b) => b.theirDmg - a.theirDmg);

  return { threats, overallDifficulty, worstMatchups };
}

// ─── Meta Tier Weights (Competitive Usage-Based) ──────────────

/** Tier weights based on competitive meta usage. S=10×, A/Mega=9×, B=8×, C=7×, D=6×, E=5×, Untiered=1×. */
export const META_TIER_WEIGHTS: Record<string, number> = {
  // S tier (weight 10)
  Garchomp: 10, Corviknight: 10, Primarina: 10,
  // A tier (weight 9)
  Archaludon: 9, Kingambit: 9, Hippowdon: 9, Espathra: 9, Aegislash: 9,
  // B tier (weight 8)
  Hydreigon: 8, Mimikyu: 8, Rotom: 8, Toxapex: 8, Diggersby: 8,
  Glimmora: 8, Umbreon: 8, Meowscarada: 8, Sneasler: 8, Basculegion: 8,
  // C tier (weight 7)
  Azumarill: 7, "Mr. Rime": 7, Sylveon: 7, Tyranitar: 7, Snorlax: 7,
  Ceruledge: 7, Dragapult: 7,
  // D tier (weight 6)
  Mamoswine: 6, "Samurott-Hisui": 6, "Slowbro-Galar": 6, Palafin: 6,
  Greninja: 6, Sinistcha: 6, Volcarona: 6, Gallade: 6, Avalugg: 6,
  // E tier (weight 5)
  Dragonite: 5, Incineroar: 5, Skeledirge: 5, Skarmory: 5,
  Excadrill: 5, Arcanine: 5, Orthworm: 5, Torterra: 5,
  Pelipper: 5, "Ninetales-Alola": 5, "Goodra-Hisui": 5, Araquanid: 5,
};

const MEGA_WEIGHT = 9; // All megas = A tier equivalent
const UNTIERED_WEIGHT = 1;

export type MetaTier = "S" | "A" | "B" | "C" | "D" | "E" | "Mega" | "-";

export function getMetaWeight(name: string, isMega: boolean): number {
  const w = META_TIER_WEIGHTS[name];
  if (isMega) return Math.max(w ?? 0, MEGA_WEIGHT);
  return w ?? UNTIERED_WEIGHT;
}

export function getMetaTier(name: string, isMega: boolean): MetaTier {
  const w = META_TIER_WEIGHTS[name];
  if (isMega) return "Mega";
  if (!w) return "-";
  if (w >= 10) return "S";
  if (w >= 9) return "A";
  if (w >= 8) return "B";
  if (w >= 7) return "C";
  if (w >= 6) return "D";
  return "E";
}

export interface WeightedRankingEntry {
  member: PoolMember;
  tier: MetaTier;
  metaWeight: number;
  weightedWinRate: number;  // 0-100: tier-weighted 1v1 win rate
  rawWinRate: number;       // 0-100: flat winRate1v1 from pool data
  composite: number;        // weighted win rate × 0.6 + overallScore × 0.4
}

/**
 * KO quality factor: fast KOs are worth more than stall victories.
 * OHKO=1.0, 2HKO=0.85, 3HKO=0.65, 4HKO=0.45, 5-6HKO=0.25, 7+=0.1
 */
function koQuality(koN: number): number {
  if (koN <= 1) return 1.0;
  if (koN === 2) return 0.85;
  if (koN === 3) return 0.65;
  if (koN === 4) return 0.45;
  if (koN <= 6) return 0.25;
  return 0.1;  // stall wins barely count
}

/** Compute tier-weighted 1v1 ranking using precomputed damage matrix. */
export function computeWeightedRanking(
  pool: PoolMember[],
  damageMatrix: DamageMatrix,
): WeightedRankingEntry[] {
  return pool.map((member) => {
    let weightedWins = 0;
    let totalWeight = 0;

    for (const opponent of pool) {
      if (opponent.name === member.name) continue;

      const aToB = damageMatrix[member.name]?.[opponent.name];
      const bToA = damageMatrix[opponent.name]?.[member.name];
      if (!aToB || !bToA) continue;

      const oppWeight = getMetaWeight(opponent.name, opponent.isMega);
      totalWeight += oppWeight;

      const aKoN = aToB.koN || 99; // 0 = no KO in 4 hits → treat as 99
      const bKoN = bToA.koN || 99;
      const aSpeed = member.speedStat ?? 0;
      const bSpeed = opponent.speedStat ?? 0;

      let winResult: number;
      if (aSpeed > bSpeed) {
        winResult = aKoN <= bKoN ? 1 : 0;
      } else if (bSpeed > aSpeed) {
        winResult = aKoN < bKoN ? 1 : 0;
      } else {
        // Speed tie: partial credit
        if (aKoN < bKoN) winResult = 0.75;
        else if (aKoN === bKoN) winResult = 0.5;
        else winResult = 0.25;
      }

      // Scale win value by KO quality (fast KOs worth more)
      if (winResult > 0) {
        winResult *= koQuality(aKoN);
      }

      weightedWins += winResult * oppWeight;
    }

    const weightedWinRate = totalWeight > 0 ? (weightedWins / totalWeight) * 100 : 0;
    const overallScore = member.overallScore ?? 0;
    const composite = weightedWinRate * 0.6 + overallScore * 0.4;

    return {
      member,
      tier: getMetaTier(member.name, member.isMega),
      metaWeight: getMetaWeight(member.name, member.isMega),
      weightedWinRate,
      rawWinRate: member.winRate1v1 ?? 0,
      composite,
    };
  }).sort((a, b) => b.composite - a.composite);
}
