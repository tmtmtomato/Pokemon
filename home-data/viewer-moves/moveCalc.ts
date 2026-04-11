/**
 * On-the-fly damage calculation helpers for the Move Consistency Viewer.
 * Uses the same calculate() engine as the analyzer pipeline.
 */
import { calculate, Pokemon, Move, Field } from "../../src/index";
import type { PoolMember } from "../types/team-matchup";

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
): MoveDamageResult | null {
  try {
    const atkPokemon = createPokemon(attacker, [moveName]);
    const defPokemon = createPokemon(defender);
    const field = new Field({ gameType: "Singles" as any });
    const move = new Move(moveName);
    const result = calculate(atkPokemon, defPokemon, move, field);
    const [minPct, maxPct] = result.percentRange();
    const ko = result.koChance();
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
}

export interface ThreatResult {
  opponent: PoolMember;
  ourBest: BestHit;
  theirBest: { move: string; target: string; maxPct: number; koN: number };
  speedMatchup: "faster" | "slower" | "tie";
  threatLevel: ThreatLevel;
}

export interface ThreatAnswer {
  member: string;       // Team member that answers the threat
  reason: "outspeed_ohko" | "resist_threat" | "immune_threat";
  ourDmg: number;       // Our max damage % to the user
  ourKoN: number;
}

export interface DangerousMove {
  user: string;       // Pokemon using the move
  move: string;
  moveType: string;
  targets: { name: string; maxPct: number; koN: number }[];
  ohkoCount: number;  // How many targets are OHKOed
  answer: ThreatAnswer | null; // Who on our team handles this?
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
): ThreatResult {
  // Our best: which member + move deals the most damage?
  let ourBest: BestHit = { member: "", move: "", maxPct: 0, koN: 0 };
  for (const member of myTeam) {
    for (const moveName of member.moves) {
      const r = computeMoveDamage(member, opponent, moveName);
      if (r && r.maxPct > ourBest.maxPct) {
        ourBest = { member: member.name, move: moveName, maxPct: r.maxPct, koN: r.koN };
      }
    }
  }

  // Their best: which move + which of our members takes the most damage?
  let theirBest = { move: "", target: "", maxPct: 0, koN: 0 };
  for (const moveName of opponent.moves) {
    for (const member of myTeam) {
      const r = computeMoveDamage(opponent, member, moveName);
      if (r && r.maxPct > theirBest.maxPct) {
        theirBest = { move: moveName, target: member.name, maxPct: r.maxPct, koN: r.koN };
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
): ThreatAnswer | null {
  let bestAnswer: ThreatAnswer | null = null;
  let bestPriority = 999;

  for (const member of myTeam) {
    // Check how much damage the dangerous move does to this member
    const incomingDmg = computeMoveDamage(enemy, member, dangerousMoveName);
    const memberSpeed = member.speedStat ?? 0;
    const outspeeds = memberSpeed > enemySpeed;

    // Our best damage to the enemy
    let ourBestDmg = 0;
    let ourBestKoN = 99;
    for (const moveName of member.moves) {
      const r = computeMoveDamage(member, enemy, moveName);
      if (r && r.maxPct > ourBestDmg) {
        ourBestDmg = r.maxPct;
        ourBestKoN = r.koN;
      }
    }

    // Enemy's best move against THIS member (not just the dangerous move)
    let enemyBestDmg = 0;
    let enemyBestKoN = 99;
    for (const enmove of enemy.moves) {
      const r = computeMoveDamage(enemy, member, enmove);
      if (r && r.maxPct > enemyBestDmg) {
        enemyBestDmg = r.maxPct;
        enemyBestKoN = r.koN;
      }
    }

    // 1v1 outcome: who KOs first considering speed?
    const weWin1v1 = outspeeds
      ? ourBestKoN <= enemyBestKoN   // we hit first → KO same turn or before
      : ourBestKoN < enemyBestKoN;   // they hit first → we must KO strictly before

    // Priority 1: Immune to the dangerous move
    // Even if 1v1 is unfavorable, immunity forces the opponent to switch
    // or use a weaker coverage move — still a valid answer if we can threaten.
    // But if enemy OHKOs us with another move, we can't even stay in one turn.
    if (incomingDmg && incomingDmg.effectiveness === 0 && ourBestDmg > 5) {
      // Reject if enemy OHKOs us with coverage (we switch in free, but die immediately)
      if (enemyBestKoN <= 1 && !outspeeds) continue;
      // Accept if: we win 1v1, OR we can 2HKO (force trades), OR enemy can't quickly KO us
      if (weWin1v1 || ourBestKoN <= 2 || enemyBestKoN >= 3) {
        const priority = 1;
        if (priority < bestPriority || (priority === bestPriority && ourBestDmg > (bestAnswer?.ourDmg ?? 0))) {
          bestAnswer = { member: member.name, reason: "immune_threat", ourDmg: ourBestDmg, ourKoN: ourBestKoN };
          bestPriority = priority;
        }
      }
      continue;
    }

    // Priority 2: Resists the dangerous move
    // Must win or trade evenly in the full 1v1 — half-damage on switch-in
    // is meaningless if the enemy 2HKOs you with another move and you can't KO back.
    if (incomingDmg && incomingDmg.effectiveness < 1 && ourBestKoN <= 3) {
      if (!weWin1v1) continue; // lose the 1v1 → not a real answer
      const priority = 2;
      if (priority < bestPriority || (priority === bestPriority && ourBestDmg > (bestAnswer?.ourDmg ?? 0))) {
        bestAnswer = { member: member.name, reason: "resist_threat", ourDmg: ourBestDmg, ourKoN: ourBestKoN };
        bestPriority = priority;
      }
      continue;
    }

    // Priority 3: Outspeeds and OHKOs (revenge kill — no defensive advantage needed)
    if (outspeeds && ourBestKoN === 1) {
      const priority = 3;
      if (priority < bestPriority || (priority === bestPriority && ourBestDmg > (bestAnswer?.ourDmg ?? 0))) {
        bestAnswer = { member: member.name, reason: "outspeed_ohko", ourDmg: ourBestDmg, ourKoN: ourBestKoN };
        bestPriority = priority;
      }
    }
  }

  return bestAnswer;
}

/** Full threat analysis of our team vs the entire pool */
export function computeFullThreatAnalysis(
  myTeam: PoolMember[],
  pool: PoolMember[],
): ThreatAnalysisResult {
  const teamNames = new Set(myTeam.map((m) => m.name));
  const enemies = pool.filter((p) => !teamNames.has(p.name));

  // 1. Threat ranking
  const threats = enemies
    .map((opp) => computeThreatScore(myTeam, opp))
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
      const targets: { name: string; maxPct: number; koN: number }[] = [];
      for (const member of myTeam) {
        const r = computeMoveDamage(enemy, member, moveName);
        if (r && r.effectiveness >= 1 && r.maxPct > 20) {
          targets.push({ name: member.name, maxPct: r.maxPct, koN: r.koN });
        }
      }
      if (targets.length >= 3) {
        const ohkoCount = targets.filter((t) => t.koN === 1).length;
        // Find an answer: a team member that can reliably handle the user
        const answer = findAnswer(myTeam, enemy, moveName, enemySpeed);
        moveHitsMap.set(key, {
          user: enemy.name,
          move: moveName,
          moveType: getMoveType(moveName),
          targets: targets.sort((a, b) => b.maxPct - a.maxPct),
          ohkoCount,
          answer,
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
