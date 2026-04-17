/**
 * spAnalysisCalc.ts — SP threshold analysis for the Team Builder.
 *
 * Uses precomputed SP grids (from compute-sp-grid.mjs) for fast threshold
 * analysis. Falls back to runtime recalcDamage() for combos not in the grid.
 *
 * KO notation: 確N (guaranteed N-hit KO) / 乱N (random N-hit KO).
 * "HKO" notation is banned — always use 確/乱 granularity.
 */

import { calculate, Pokemon, Move, Field, calcStat, calcHP, getNatureModifier }
  from "../../src/index";
import type { PoolMember, DamageMatrix, DamageMatrixEntry }
  from "../types/team-matchup";
import { baseSpecies, matchupValue, effectiveKoN }
  from "../analyzer/team-matchup-core";
import type { NatureName, StatID } from "../../src/types";

// ── Precomputed SP Grid types ───────────────────────────────────────────────

/** Single KO result at a given SP level. */
type GridCell = { koN: number; koChance: number } | null;

/** Compact cell: [koN, koChance] tuple or 0 (null). Written by compute-sp-grid. */
type CompactCell = 0 | [number, number];

/** Grid entries keyed by "opponentName|moveName|stat", value = Array(33). */
type CompactGridEntries = Record<string, CompactCell[]>;

/** Full precomputed SP grid data (compact format from JSON). */
export interface SPGridData {
  /** Member attacks opponent, vary member's atk/spa. */
  attackerGrid: Record<string, CompactGridEntries>;
  /** Opponent attacks member, vary member's hp/def/spd. */
  defenderGrid: Record<string, CompactGridEntries>;
}

/** Decode compact grid entry to GridCell. */
function decodeGrid(compact: CompactCell[]): GridCell[] {
  return compact.map(c => c === 0 ? null : { koN: c[0], koChance: c[1] });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type SPAllocation = PoolMember["sp"];

function spTotal(sp: SPAllocation): number {
  return sp.hp + sp.atk + sp.def + sp.spa + sp.spd + sp.spe;
}

function createPokemon(
  member: PoolMember, spOverride?: SPAllocation, moves?: string[],
): Pokemon {
  return new Pokemon({
    name: baseSpecies(member.name),
    nature: member.nature as NatureName,
    sp: spOverride ?? member.sp,
    ability: member.ability,
    item: member.item,
    isMega: member.isMega,
    moves: moves ?? member.moves,
  });
}

function recalcDamage(
  attacker: PoolMember, defender: PoolMember, moveName: string,
  attackerSP?: SPAllocation, defenderSP?: SPAllocation,
): { minPct: number; maxPct: number; koN: number; koChance: number } | null {
  try {
    const atkPoke = createPokemon(attacker, attackerSP, [moveName]);
    const defPoke = createPokemon(defender, defenderSP);
    const field = new Field({ gameType: "Singles" as any });
    const move = new Move(moveName);
    const result = calculate(atkPoke, defPoke, move, field);
    const [minPct, maxPct] = result.percentRange();
    const ko = result.koChance();
    return {
      minPct: Math.round(minPct * 10) / 10,
      maxPct: Math.round(maxPct * 10) / 10,
      koN: ko.n,
      koChance: Math.round(ko.chance * 1000) / 1000,
    };
  } catch {
    return null;
  }
}

function getMoveCategory(moveName: string): "Physical" | "Special" | "Status" {
  try {
    const m = new Move(moveName);
    if (m.isPhysical()) return "Physical";
    if (m.isSpecial()) return "Special";
    return "Status";
  } catch {
    return "Status";
  }
}

function getMoveType(moveName: string): string {
  try {
    const m = new Move(moveName);
    return (m as any).type ?? "Normal";
  } catch {
    return "Normal";
  }
}

// ── KO label (確/乱) ─────────────────────────────────────────────────────────

/** Format KO as 確N or 乱N(X%). Never use "HKO" — always 確/乱 granularity. */
export function koLabel(koN: number, koChance: number): string {
  if (koN <= 0) return "—";
  if (koChance >= 1.0) return `確${koN}`;
  const pct = Math.round(koChance * 100);
  return `乱${koN}(${pct}%)`;
}

/** Absolute color class for a KO result — same value = same color everywhere.
 *  確 and 乱 are always distinct within the same koN. */
export function koColor(koN: number, koChance: number): string {
  if (koN <= 0) return "text-gray-500";
  const guaranteed = koChance >= 1.0;
  if (koN === 1) return guaranteed ? "text-red-400 font-bold" : "text-red-400";
  if (koN === 2) return guaranteed ? "text-orange-400" : "text-yellow-400";
  if (koN === 3) return guaranteed ? "text-blue-400" : "text-cyan-400";
  // koN >= 4
  return guaranteed ? "text-green-400 font-bold" : "text-green-400";
}

// ── Tab A: Defensive Thresholds ──────────────────────────────────────────────

export interface DefensiveThresholdEntry {
  attackerName: string;
  attackerUsagePct: number;
  moveName: string;
  moveType: string;
  currentMinPct: number;
  currentMaxPct: number;
  currentKoN: number;
  currentKoChance: number;
  /** SP you can safely remove from the relevant def stat before koN worsens.
   *  null = cannot reduce (already at threshold or SP=0). */
  spMarginToLose: number | null;
  /** Additional SP in relevant def stat to push koN up by 1.
   *  null = impossible within budget. */
  spNeededToSurvive: number | null;
  /** Which stat matters for surviving this attack */
  relevantStat: "hp" | "def" | "spd";
  /** Is this physical or special? */
  category: "Physical" | "Special";
}

/** One constraining attacker for a specific defensive stat. */
export interface DefensiveConstrainer {
  attackerName: string;
  moveName: string;
  /** SP that can be reduced before THIS attacker's KO threshold worsens (0 = none) */
  margin: number;
  /** Attacker's offensive SP investment (atk or spa depending on move category) */
  attackerOffensiveSP: number;
  /** Nature modifier on the relevant offensive stat (1.1 / 1.0 / 0.9) */
  attackerNatMod: number;
  /** Attacker's held item */
  attackerItem: string;
  /** Speed relationship: is the ATTACKER faster/slower/tie vs defender */
  speedComparison: "faster" | "slower" | "tie";
  category: "Physical" | "Special";
  currentKoN: number;
  currentKoChance: number;
  attackerUsagePct: number;
  /** KO count AFTER margin is exceeded (worsened state) */
  worsenedKoN: number;
  worsenedKoChance: number;
}

/** Per-stat safe reduction summary with constrainer stack for decision-making. */
export interface DefensiveSafeMarginEntry {
  stat: "hp" | "def" | "spd";
  currentSP: number;
  /** Min margin across all constrainers. */
  safeReduction: number;
  /** Kept for backward compat — same as constrainers[0] */
  constrainingAttacker: string;
  constrainingMove: string;
  /** Constrainers sorted by margin asc (tightest first), up to 8 entries */
  constrainers: DefensiveConstrainer[];
}

export function analyzeDefensiveThresholds(
  member: PoolMember,
  pool: PoolMember[],
  matrix: DamageMatrix,
): DefensiveThresholdEntry[] {
  const results: DefensiveThresholdEntry[] = [];

  for (const opp of pool) {
    if (opp.name === member.name) continue;
    const entry = matrix[opp.name]?.[member.name];
    if (!entry || entry.maxPct <= 0 || entry.koN <= 0) continue;

    // Pre-filter: only near-threshold entries worth analyzing
    const isNearOHKO = entry.koN === 1 && entry.maxPct <= 120;
    const isNear2HKO = entry.koN === 2 && entry.maxPct >= 40 && entry.maxPct <= 60;
    const isRollDependent = entry.koN <= 2 && entry.koChance < 1 && entry.koChance > 0;

    if (!isNearOHKO && !isNear2HKO && !isRollDependent) continue;

    const category = getMoveCategory(entry.bestMove);
    if (category === "Status") continue;

    const defStat: "def" | "spd" = category === "Physical" ? "def" : "spd";

    // Check stats with actual SP investment.
    // Pick the one with the TIGHTEST margin (closest to threshold).
    let marginStat: "hp" | "def" | "spd" = defStat;
    let spMarginToLose: number | null = null;

    if (entry.koN >= 2) {
      const candidates: ("hp" | "def" | "spd")[] = [];
      if (member.sp[defStat] > 0) candidates.push(defStat);
      if (member.sp.hp > 0) candidates.push("hp");

      for (const stat of candidates) {
        const margin = findDefensiveMarginSingle(
          member, opp, entry.bestMove, stat, entry.koN,
        );
        if (margin !== null && margin >= member.sp[stat]) continue;
        if (margin !== null && (spMarginToLose === null || margin < spMarginToLose)) {
          spMarginToLose = margin;
          marginStat = stat;
        }
      }
    }

    const surviveStat = member.sp[defStat] < 32 ? defStat
      : member.sp.hp < 32 ? "hp"
      : defStat;
    const spNeededToSurvive = findDefensiveSPToSurvive(
      member, opp, entry.bestMove, surviveStat, entry.koN,
    );

    if (spMarginToLose === null && spNeededToSurvive === null) continue;

    results.push({
      attackerName: opp.name,
      attackerUsagePct: opp.usagePct,
      moveName: entry.bestMove,
      moveType: getMoveType(entry.bestMove),
      currentMinPct: entry.minPct,
      currentMaxPct: entry.maxPct,
      currentKoN: entry.koN,
      currentKoChance: entry.koChance,
      spMarginToLose,
      spNeededToSurvive,
      relevantStat: spMarginToLose !== null ? marginStat
        : spNeededToSurvive !== null ? surviveStat
        : defStat,
      category,
    });
  }

  results.sort((a, b) => {
    if (a.currentKoN !== b.currentKoN) return a.currentKoN - b.currentKoN;
    const am = a.spMarginToLose ?? 999;
    const bm = b.spMarginToLose ?? 999;
    if (am !== bm) return am - bm;
    return b.attackerUsagePct - a.attackerUsagePct;
  });

  return results;
}

/** Compute both safe-reduction margins AND upgrade opportunities for defensive
 *  stats (hp/def/spd) in a single pass using a precomputed SP damage grid.
 *
 *  Same grid approach as computeOffensiveAnalysis — one recalcDamage sweep per
 *  (opponent × move) pair, then linear scan for both margin and upgrade. */
export function computeDefensiveAnalysis(
  member: PoolMember,
  pool: PoolMember[],
  _matrix: DamageMatrix,
  spGrid?: SPGridData,
): { safeMargins: DefensiveSafeMarginEntry[]; upgrades: DefensiveUpgradeEntry[] } {
  const safeMargins: DefensiveSafeMarginEntry[] = [];
  const upgrades: DefensiveUpgradeEntry[] = [];
  const defSpeed = computeActualSpeed(member);

  // Precomputed grid lookup for this member
  const precomputed = spGrid?.defenderGrid?.[member.name];

  // Determine which stats need analysis
  const statsToCheck: ("hp" | "def" | "spd")[] = [];
  if (member.sp.hp > 0 || member.sp.hp < 32) statsToCheck.push("hp");
  if (member.sp.def > 0 || member.sp.def < 32) statsToCheck.push("def");
  if (member.sp.spd > 0 || member.sp.spd < 32) statsToCheck.push("spd");

  const sortedPool = [...pool]
    .filter((p) => p.name !== member.name)
    .sort((a, b) => b.usagePct - a.usagePct)
    .slice(0, 100);

  for (const stat of statsToCheck) {
    const currentSP = member.sp[stat];
    const constrainers: DefensiveConstrainer[] = [];
    const upgraders: DefensiveUpgrader[] = [];

    for (const opp of sortedPool) {
      for (const moveName of opp.moves) {
        const cat = getMoveCategory(moveName);
        if (cat === "Status") continue;
        if (stat === "def" && cat !== "Physical") continue;
        if (stat === "spd" && cat !== "Special") continue;

        // Skip unrealistic attackers: move category mismatches invested stat
        // e.g. Special move from an opponent with spa=0 + negative nature
        const offStatForMove = cat === "Physical" ? "atk" : "spa";
        if (opp.sp[offStatForMove as keyof typeof opp.sp] === 0
          && getNatureModifier(opp.nature as NatureName, offStatForMove as StatID) < 1.0) continue;

        // Try precomputed grid first
        const gridKey = `${opp.name}|${moveName}|${stat}`;
        const compactCached = precomputed?.[gridKey];

        let grid: (GridCell)[];
        let dmg: { koN: number; koChance: number };

        if (compactCached) {
          // Decode compact [koN, koChance] → {koN, koChance}
          grid = decodeGrid(compactCached);
          const baseline = grid[currentSP];
          if (!baseline || baseline.koN <= 0 || baseline.koN > 4) continue;
          dmg = baseline;
        } else {
          // Fallback: compute on-the-fly
          const calcDmg = recalcDamage(opp, member, moveName);
          if (!calcDmg || calcDmg.maxPct <= 0 || calcDmg.koN <= 0) continue;
          if (calcDmg.koN > 4) continue;
          dmg = { koN: calcDmg.koN, koChance: calcDmg.koChance };

          grid = new Array(33);
          grid[currentSP] = dmg;
          for (let sp = 0; sp <= 32; sp++) {
            if (sp === currentSP) continue;
            const testSP = { ...member.sp, [stat]: sp };
            const r = recalcDamage(opp, member, moveName, undefined, testSP);
            grid[sp] = r && r.koN > 0 ? { koN: r.koN, koChance: r.koChance } : null;
          }
        }

        // Common metadata
        const offStat = cat === "Physical" ? "atk" : "spa";
        const atkNatMod = getNatureModifier(opp.nature as NatureName, offStat as StatID);
        const atkSpeed = computeActualSpeed(opp);
        const speedCmp: "faster" | "slower" | "tie" =
          atkSpeed > defSpeed ? "faster" : atkSpeed < defSpeed ? "slower" : "tie";

        // === Margin analysis: scan downward ===
        // Skip already-確1: reducing defense from 確1 doesn't worsen anything
        if (dmg.koN <= 3 && currentSP > 0
          && !(dmg.koN === 1 && dmg.koChance >= 1.0)) {
          let margin = currentSP;
          for (let sp = currentSP - 1; sp >= 0; sp--) {
            const g = grid[sp];
            if (!g || g.koN <= 0) continue; // Skip unknown cells
            // Defensive worsened: koN decreased (killed faster) OR 乱→確 transition
            if (g.koN < dmg.koN
              || (g.koN === dmg.koN && g.koChance >= 1.0 && dmg.koChance < 1.0)) {
              margin = currentSP - sp - 1;
              break;
            }
          }

          // Skip if full SP removal doesn't worsen anything
          if (margin >= currentSP) continue;

          const worsenedIdx = currentSP - margin - 1;
          const worsened = worsenedIdx >= 0 ? grid[worsenedIdx] : null;
          if (!worsened) continue; // No valid data at worsened SP

          constrainers.push({
            attackerName: opp.name,
            moveName,
            margin,
            attackerOffensiveSP: opp.sp[offStat],
            attackerNatMod: atkNatMod,
            attackerItem: opp.item,
            speedComparison: speedCmp,
            category: cat as "Physical" | "Special",
            currentKoN: dmg.koN,
            currentKoChance: dmg.koChance,
            attackerUsagePct: opp.usagePct,
            worsenedKoN: worsened.koN,
            worsenedKoChance: worsened.koChance,
          });
        }

        // === Upgrade analysis: scan upward ===
        // Only track meaningful transitions: koN change or 確→乱 (chance crossing 1.0)
        if (!(dmg.koN >= 4) && currentSP < 32) {
          for (let sp = currentSP + 1; sp <= 32; sp++) {
            const g = grid[sp];
            if (!g || g.koN <= 0) continue;
            const improved =
              g.koN > dmg.koN // Need more hits — strictly better
              || (g.koN === dmg.koN && g.koChance < 1.0 && dmg.koChance >= 1.0); // 確→乱 transition
            if (improved) {
              upgraders.push({
                attackerName: opp.name,
                moveName,
                spNeeded: sp - currentSP,
                attackerOffensiveSP: opp.sp[offStat],
                attackerNatMod: atkNatMod,
                attackerItem: opp.item,
                speedComparison: speedCmp,
                category: cat as "Physical" | "Special",
                currentKoN: dmg.koN,
                currentKoChance: dmg.koChance,
                improvedKoN: g.koN,
                improvedKoChance: g.koChance,
                attackerUsagePct: opp.usagePct,
              });
              break; // Cheapest upgrade per combo
            }
          }
        }
      }
    }

    // === Dedup constrainers ===
    const cByAtkMove = new Map<string, DefensiveConstrainer>();
    for (const c of constrainers) {
      const k = `${c.attackerName}|${c.moveName}`;
      const ex = cByAtkMove.get(k);
      if (!ex || c.margin < ex.margin) cByAtkMove.set(k, c);
    }
    const cDeduped = new Map<string, DefensiveConstrainer>();
    for (const c of cByAtkMove.values()) {
      const k = `${baseSpecies(c.attackerName)}|${c.moveName}|${c.margin}`;
      const ex = cDeduped.get(k);
      if (!ex || c.currentKoN < ex.currentKoN
        || (c.currentKoN === ex.currentKoN && c.attackerUsagePct > ex.attackerUsagePct)) {
        const mu = ex ? ex.attackerUsagePct + c.attackerUsagePct : c.attackerUsagePct;
        cDeduped.set(k, { ...c, attackerUsagePct: mu });
      }
    }
    const sortedC = [...cDeduped.values()].sort((a, b) =>
      a.margin !== b.margin ? a.margin - b.margin : b.attackerUsagePct - a.attackerUsagePct,
    );

    if (currentSP > 0) {
      safeMargins.push({
        stat,
        currentSP,
        safeReduction: sortedC.length > 0 ? sortedC[0].margin : currentSP,
        constrainingAttacker: sortedC[0]?.attackerName ?? "",
        constrainingMove: sortedC[0]?.moveName ?? "",
        constrainers: sortedC,
      });
    }

    // === Dedup upgraders ===
    const uByAtkMove = new Map<string, DefensiveUpgrader>();
    for (const u of upgraders) {
      const k = `${u.attackerName}|${u.moveName}`;
      const ex = uByAtkMove.get(k);
      if (!ex || u.spNeeded < ex.spNeeded) uByAtkMove.set(k, u);
    }
    const uDeduped = new Map<string, DefensiveUpgrader>();
    for (const u of uByAtkMove.values()) {
      const k = `${baseSpecies(u.attackerName)}|${u.moveName}|${u.spNeeded}`;
      const ex = uDeduped.get(k);
      if (!ex || u.currentKoN < ex.currentKoN
        || (u.currentKoN === ex.currentKoN && u.attackerUsagePct > ex.attackerUsagePct)) {
        const mu = ex ? ex.attackerUsagePct + u.attackerUsagePct : u.attackerUsagePct;
        uDeduped.set(k, { ...u, attackerUsagePct: mu });
      }
    }
    const sortedU = [...uDeduped.values()].sort((a, b) =>
      a.spNeeded !== b.spNeeded ? a.spNeeded - b.spNeeded : b.attackerUsagePct - a.attackerUsagePct,
    );

    if (currentSP < 32) {
      upgrades.push({
        stat,
        currentSP,
        cheapestUpgrade: sortedU.length > 0 ? sortedU[0].spNeeded : (32 - currentSP + 1),
        upgraders: sortedU,
      });
    }
  }

  return { safeMargins, upgrades };
}

/** How many SP can be removed from a SINGLE stat before koN worsens? */
function findDefensiveMarginSingle(
  defender: PoolMember, attacker: PoolMember,
  moveName: string, stat: "hp" | "def" | "spd", currentKoN: number,
): number | null {
  const currentVal = defender.sp[stat];
  if (currentVal <= 0) return null;

  let lo = 1, hi = currentVal, answer: number | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const testSP = { ...defender.sp, [stat]: currentVal - mid };
    const result = recalcDamage(attacker, defender, moveName, undefined, testSP);
    if (result && result.koN >= currentKoN) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}

/** How much additional SP in a stat needed to push koN up by 1? */
function findDefensiveSPToSurvive(
  defender: PoolMember, attacker: PoolMember,
  moveName: string, stat: "hp" | "def" | "spd", currentKoN: number,
): number | null {
  const currentVal = defender.sp[stat];
  const budget = 66 - spTotal(defender.sp);
  const maxAdd = Math.min(32 - currentVal, budget);
  if (maxAdd <= 0) return null;

  let lo = 1, hi = maxAdd, answer: number | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const testSP = { ...defender.sp, [stat]: currentVal + mid };
    const result = recalcDamage(attacker, defender, moveName, undefined, testSP);
    if (result && result.koN > currentKoN) {
      answer = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return answer;
}

// ── Tab B: Offensive Thresholds ──────────────────────────────────────────────

/** One constraining defender for a specific offensive stat (mirror of DefensiveConstrainer). */
export interface OffensiveConstrainer {
  defenderName: string;
  moveName: string;
  /** SP that can be reduced before THIS defender's KO threshold worsens (0 = none) */
  margin: number;
  /** Defender's relevant defensive SP (def for Physical, spd for Special) */
  defenderDefensiveSP: number;
  /** Nature modifier on the defender's relevant defensive stat */
  defenderNatMod: number;
  /** Defender's held item */
  defenderItem: string;
  /** Speed relationship: is the ATTACKER (us) faster/slower/tie vs defender */
  speedComparison: "faster" | "slower" | "tie";
  category: "Physical" | "Special";
  currentKoN: number;
  currentKoChance: number;
  defenderUsagePct: number;
  /** KO count AFTER margin is exceeded (worsened state) */
  worsenedKoN: number;
  worsenedKoChance: number;
}

/** Per-stat safe reduction summary for offensive stats (mirror of DefensiveSafeMarginEntry). */
export interface OffensiveSafeMarginEntry {
  stat: "atk" | "spa";
  currentSP: number;
  /** Min margin across all constrainers. */
  safeReduction: number;
  constrainingDefender: string;
  constrainingMove: string;
  /** Constrainers sorted by margin asc (tightest first), up to 10 entries */
  constrainers: OffensiveConstrainer[];
}

export interface OffensiveThresholdEntry {
  defenderName: string;
  defenderUsagePct: number;
  moveName: string;
  moveType: string;
  currentMinPct: number;
  currentMaxPct: number;
  currentKoN: number;
  currentKoChance: number;
  /** Additional SP in atk/spa to flip threshold. Always non-null (filtered). */
  spNeededToFlip: number;
  /** Resulting koN after flip */
  flippedKoN: number;
  /** Resulting koChance after flip (1.0 = 確, <1.0 = 乱) */
  flippedKoChance: number;
  /** Which offensive stat to invest */
  relevantStat: "atk" | "spa";
  category: "Physical" | "Special";
  /** Delta in matchupValue when threshold flips */
  matchupValueChange: number;
}

export function analyzeOffensiveThresholds(
  member: PoolMember,
  pool: PoolMember[],
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
): OffensiveThresholdEntry[] {
  const results: OffensiveThresholdEntry[] = [];

  for (const opp of pool) {
    if (opp.name === member.name) continue;
    const entry = matrix[member.name]?.[opp.name];
    if (!entry || entry.maxPct <= 0) continue;

    // Pre-filter: near a threshold flip
    const near2to1 = entry.koN === 2 && entry.maxPct >= 42;
    const near3to2 = entry.koN === 3 && entry.maxPct >= 28;
    const nearGuarantee = entry.koN > 0 && entry.koN <= 3 && entry.koChance < 0.9;

    if (!near2to1 && !near3to2 && !nearGuarantee) continue;

    const category = getMoveCategory(entry.bestMove);
    if (category === "Status") continue;

    const relevantStat: "atk" | "spa" = category === "Physical" ? "atk" : "spa";
    const targetKoN = Math.max(1, entry.koN - 1);

    const flipResult = findOffensiveSPToFlip(
      member, opp, entry.bestMove, relevantStat, targetKoN,
    );

    // Only show entries where the flip is achievable
    if (!flipResult) continue;

    const currentMV = matchupValue(member.name, opp.name, matrix, poolSpeeds);
    const newMV = estimateNewMatchupValue(
      targetKoN, member, opp, poolSpeeds,
    );

    results.push({
      defenderName: opp.name,
      defenderUsagePct: opp.usagePct,
      moveName: entry.bestMove,
      moveType: getMoveType(entry.bestMove),
      currentMinPct: entry.minPct,
      currentMaxPct: entry.maxPct,
      currentKoN: entry.koN,
      currentKoChance: entry.koChance,
      spNeededToFlip: flipResult.spNeeded,
      flippedKoN: flipResult.koN,
      flippedKoChance: flipResult.koChance,
      relevantStat,
      category,
      matchupValueChange: newMV - currentMV,
    });
  }

  // Sort by impact: usage × MV change
  results.sort((a, b) => {
    const impactA = a.defenderUsagePct * Math.abs(a.matchupValueChange);
    const impactB = b.defenderUsagePct * Math.abs(b.matchupValueChange);
    return impactB - impactA;
  });

  return results;
}

/** Binary search: additional SP in atkStat to drop koN to target.
 *  Returns SP needed + resulting koN/koChance, or null if impossible. */
function findOffensiveSPToFlip(
  attacker: PoolMember, defender: PoolMember,
  moveName: string, atkStat: "atk" | "spa", targetKoN: number,
): { spNeeded: number; koN: number; koChance: number } | null {
  const currentVal = attacker.sp[atkStat];
  const budget = 66 - spTotal(attacker.sp);
  const maxAdd = Math.min(32 - currentVal, budget);
  if (maxAdd <= 0) return null;

  let lo = 1, hi = maxAdd;
  let answer: { spNeeded: number; koN: number; koChance: number } | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const testSP = { ...attacker.sp, [atkStat]: currentVal + mid };
    const result = recalcDamage(attacker, defender, moveName, testSP);
    if (result && result.koN <= targetKoN && result.koN > 0) {
      answer = { spNeeded: mid, koN: result.koN, koChance: result.koChance };
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return answer;
}

/** Estimate matchupValue for a given koN using speed data. */
function estimateNewMatchupValue(
  koN: number,
  attacker: PoolMember,
  defender: PoolMember,
  poolSpeeds: Map<string, number>,
): number {
  const mySpd = poolSpeeds.get(attacker.name) ?? 0;
  const oppSpd = poolSpeeds.get(defender.name) ?? 0;

  if (koN <= 1) {
    if (mySpd > oppSpd) return 2.5;
    if (mySpd === oppSpd) return 1.9;
    return 1.3;
  }
  if (koN <= 2) {
    if (mySpd > oppSpd) return 1.0;
    if (mySpd === oppSpd) return 0.65;
    return 0.3;
  }
  return 0;
}

/** Compute both safe-reduction margins AND upgrade opportunities for offensive
 *  stats (atk/spa) in a single pass using a precomputed SP damage grid.
 *
 *  Grid approach: for each relevant (opponent × move) pair, precompute damage
 *  at ALL SP levels (0-32) once, then derive margins and upgrades via linear
 *  scan — no binary search needed, no duplicate recalcDamage calls. */
export function computeOffensiveAnalysis(
  member: PoolMember,
  pool: PoolMember[],
  _matrix: DamageMatrix,
  spGrid?: SPGridData,
): { safeMargins: OffensiveSafeMarginEntry[]; upgrades: OffensiveUpgradeEntry[] } {
  const safeMargins: OffensiveSafeMarginEntry[] = [];
  const upgrades: OffensiveUpgradeEntry[] = [];
  const mySpeed = computeActualSpeed(member);

  // Precomputed grid lookup for this member
  const precomputed = spGrid?.attackerGrid?.[member.name];

  // Determine which stats need analysis
  const statsToCheck: ("atk" | "spa")[] = [];
  if (member.sp.atk > 0 || member.sp.atk < 32) statsToCheck.push("atk");
  if (member.sp.spa > 0 || member.sp.spa < 32) statsToCheck.push("spa");

  const sortedPool = [...pool]
    .filter((p) => p.name !== member.name)
    .sort((a, b) => b.usagePct - a.usagePct)
    .slice(0, 100);

  for (const stat of statsToCheck) {
    const currentSP = member.sp[stat];
    const constrainers: OffensiveConstrainer[] = [];
    const upgraders: OffensiveUpgrader[] = [];

    for (const opp of sortedPool) {
      for (const moveName of member.moves) {
        const cat = getMoveCategory(moveName);
        if (cat === "Status") continue;
        if (stat === "atk" && cat !== "Physical") continue;
        if (stat === "spa" && cat !== "Special") continue;

        // Try precomputed grid first
        const gridKey = `${opp.name}|${moveName}|${stat}`;
        const compactCached = precomputed?.[gridKey];

        let grid: (GridCell)[];
        let dmg: { koN: number; koChance: number };

        if (compactCached) {
          // Decode compact [koN, koChance] → {koN, koChance}
          grid = decodeGrid(compactCached);
          const baseline = grid[currentSP];
          if (!baseline || baseline.koN <= 0 || baseline.koN > 4) continue;
          dmg = baseline;
        } else {
          // Fallback: compute on-the-fly
          const calcDmg = recalcDamage(member, opp, moveName);
          if (!calcDmg || calcDmg.maxPct <= 0 || calcDmg.koN <= 0) continue;
          if (calcDmg.koN > 4) continue;
          dmg = { koN: calcDmg.koN, koChance: calcDmg.koChance };

          grid = new Array(33);
          grid[currentSP] = dmg;
          for (let sp = 0; sp <= 32; sp++) {
            if (sp === currentSP) continue;
            const testSP = { ...member.sp, [stat]: sp };
            const r = recalcDamage(member, opp, moveName, testSP);
            grid[sp] = r && r.koN > 0 ? { koN: r.koN, koChance: r.koChance } : null;
          }
        }

        // Common metadata for this opponent
        const defStat = cat === "Physical" ? "def" : "spd";
        const defNatMod = getNatureModifier(
          opp.nature as NatureName, defStat as StatID,
        );
        const oppSpeed = computeActualSpeed(opp);
        const speedCmp: "faster" | "slower" | "tie" =
          mySpeed > oppSpeed ? "faster" : mySpeed < oppSpeed ? "slower" : "tie";

        // === Margin analysis: scan downward from currentSP ===
        if (dmg.koN <= 3 && currentSP > 0) {
          // Find how far we can reduce before KO worsens
          let margin = currentSP; // Assume full removal is safe
          for (let sp = currentSP - 1; sp >= 0; sp--) {
            const g = grid[sp];
            if (!g || g.koN <= 0) continue; // Skip unknown cells
            // Offensive worsened: koN increased OR 確→乱 transition
            if (g.koN > dmg.koN
              || (g.koN === dmg.koN && g.koChance < 1.0 && dmg.koChance >= 1.0)) {
              margin = currentSP - sp - 1;
              break;
            }
          }

          // Skip if full SP removal doesn't worsen anything
          if (margin >= currentSP) continue;

          const worsenedIdx = currentSP - margin - 1;
          const worsened = worsenedIdx >= 0 ? grid[worsenedIdx] : null;
          if (!worsened) continue; // No valid data at worsened SP

          constrainers.push({
            defenderName: opp.name,
            moveName,
            margin,
            defenderDefensiveSP: opp.sp[defStat],
            defenderNatMod: defNatMod,
            defenderItem: opp.item,
            speedComparison: speedCmp,
            category: cat as "Physical" | "Special",
            currentKoN: dmg.koN,
            currentKoChance: dmg.koChance,
            defenderUsagePct: opp.usagePct,
            worsenedKoN: worsened.koN,
            worsenedKoChance: worsened.koChance,
          });
        }

        // === Upgrade analysis: scan upward from currentSP ===
        // Only track meaningful transitions: koN change or 乱→確 (chance crossing 1.0)
        if (!(dmg.koN === 1 && dmg.koChance >= 1.0) && currentSP < 32) {
          for (let sp = currentSP + 1; sp <= 32; sp++) {
            const g = grid[sp];
            if (!g || g.koN <= 0) continue;
            const improved =
              g.koN < dmg.koN // Fewer hits needed
              || (g.koN === dmg.koN && g.koChance >= 1.0 && dmg.koChance < 1.0); // 乱→確 transition
            if (improved) {
              upgraders.push({
                defenderName: opp.name,
                moveName,
                spNeeded: sp - currentSP,
                defenderDefensiveSP: opp.sp[defStat],
                defenderNatMod: defNatMod,
                defenderItem: opp.item,
                speedComparison: speedCmp,
                category: cat as "Physical" | "Special",
                currentKoN: dmg.koN,
                currentKoChance: dmg.koChance,
                improvedKoN: g.koN,
                improvedKoChance: g.koChance,
                defenderUsagePct: opp.usagePct,
              });
              break; // Cheapest upgrade per combo
            }
          }
        }
      }
    }

    // === Dedup constrainers ===
    const cByDefMove = new Map<string, OffensiveConstrainer>();
    for (const c of constrainers) {
      const k = `${c.defenderName}|${c.moveName}`;
      const ex = cByDefMove.get(k);
      if (!ex || c.margin < ex.margin) cByDefMove.set(k, c);
    }
    const cDeduped = new Map<string, OffensiveConstrainer>();
    for (const c of cByDefMove.values()) {
      const k = `${baseSpecies(c.defenderName)}|${c.moveName}|${c.margin}`;
      const ex = cDeduped.get(k);
      if (!ex || c.currentKoN < ex.currentKoN
        || (c.currentKoN === ex.currentKoN && c.defenderUsagePct > ex.defenderUsagePct)) {
        const mu = ex ? ex.defenderUsagePct + c.defenderUsagePct : c.defenderUsagePct;
        cDeduped.set(k, { ...c, defenderUsagePct: mu });
      }
    }
    const sortedC = [...cDeduped.values()].sort((a, b) =>
      a.margin !== b.margin ? a.margin - b.margin : b.defenderUsagePct - a.defenderUsagePct,
    );

    if (currentSP > 0) {
      safeMargins.push({
        stat,
        currentSP,
        safeReduction: sortedC.length > 0 ? sortedC[0].margin : currentSP,
        constrainingDefender: sortedC[0]?.defenderName ?? "",
        constrainingMove: sortedC[0]?.moveName ?? "",
        constrainers: sortedC,
      });
    }

    // === Dedup upgraders ===
    const uByDefMove = new Map<string, OffensiveUpgrader>();
    for (const u of upgraders) {
      const k = `${u.defenderName}|${u.moveName}`;
      const ex = uByDefMove.get(k);
      if (!ex || u.spNeeded < ex.spNeeded) uByDefMove.set(k, u);
    }
    const uDeduped = new Map<string, OffensiveUpgrader>();
    for (const u of uByDefMove.values()) {
      const k = `${baseSpecies(u.defenderName)}|${u.moveName}|${u.spNeeded}`;
      const ex = uDeduped.get(k);
      if (!ex || u.currentKoN < ex.currentKoN
        || (u.currentKoN === ex.currentKoN && u.defenderUsagePct > ex.defenderUsagePct)) {
        const mu = ex ? ex.defenderUsagePct + u.defenderUsagePct : u.defenderUsagePct;
        uDeduped.set(k, { ...u, defenderUsagePct: mu });
      }
    }
    const sortedU = [...uDeduped.values()].sort((a, b) =>
      a.spNeeded !== b.spNeeded ? a.spNeeded - b.spNeeded : b.defenderUsagePct - a.defenderUsagePct,
    );

    if (currentSP < 32) {
      upgrades.push({
        stat,
        currentSP,
        cheapestUpgrade: sortedU.length > 0 ? sortedU[0].spNeeded : (32 - currentSP + 1),
        upgraders: sortedU,
      });
    }
  }

  return { safeMargins, upgrades };
}

// ── Upgrade stacks (SP increase benefits) ────────────────────────────────────

/** One upgrade opportunity for an offensive stat (adding SP improves KO). */
export interface OffensiveUpgrader {
  defenderName: string;
  moveName: string;
  /** Additional SP needed to reach the improved KO threshold */
  spNeeded: number;
  defenderDefensiveSP: number;
  defenderNatMod: number;
  defenderItem: string;
  speedComparison: "faster" | "slower" | "tie";
  category: "Physical" | "Special";
  currentKoN: number;
  currentKoChance: number;
  /** Improved KO state after adding spNeeded */
  improvedKoN: number;
  improvedKoChance: number;
  defenderUsagePct: number;
}

/** Per-stat upgrade summary for offensive stats (atk/spa). */
export interface OffensiveUpgradeEntry {
  stat: "atk" | "spa";
  currentSP: number;
  /** Cheapest upgrade cost across all upgraders */
  cheapestUpgrade: number;
  upgraders: OffensiveUpgrader[];
}

/** One upgrade opportunity for a defensive stat (adding SP improves survival). */
export interface DefensiveUpgrader {
  attackerName: string;
  moveName: string;
  /** Additional SP needed to improve survival threshold */
  spNeeded: number;
  attackerOffensiveSP: number;
  attackerNatMod: number;
  attackerItem: string;
  speedComparison: "faster" | "slower" | "tie";
  category: "Physical" | "Special";
  currentKoN: number;
  currentKoChance: number;
  /** Improved KO state after adding spNeeded (higher koN = better for defender) */
  improvedKoN: number;
  improvedKoChance: number;
  attackerUsagePct: number;
}

/** Per-stat upgrade summary for defensive stats (hp/def/spd). */
export interface DefensiveUpgradeEntry {
  stat: "hp" | "def" | "spd";
  currentSP: number;
  /** Cheapest upgrade cost across all upgraders */
  cheapestUpgrade: number;
  upgraders: DefensiveUpgrader[];
}

// ── Tab C: Speed Tiers ──────────────────────────────────────────────────────

export interface SpeedTierPokemon {
  name: string;
  /** "無"=S0, "準"=S32/neutral, "最"=S32/+nature, ""=other, "拘"=Choice Scarf */
  tag: string;
  /** Whether this is a Choice Scarf boosted speed entry */
  isScarf?: boolean;
}

export interface SpeedTierEntry {
  speed: number;
  pokemon: SpeedTierPokemon[];
  usagePctSum: number;
  additionalSPNeeded: number;
  totalSPNeeded: number;
  currentlyOutspeeds: boolean;
  reachable: boolean;
  /** Within the S SP adjustable range (affected by investment changes) */
  inAdjustableRange: boolean;
  matchupFlips: number;
  /** How many SP can be reduced while still outspeeding (only for currentlyOutspeeds entries) */
  spReductionMargin: number;
  /** Whether ALL entries in this tier are scarf-boosted */
  isScarf?: boolean;
}

export interface ScarfSpeedInfo {
  /** Own speed when holding Choice Scarf at current SP */
  scarfSpeed: number;
  /** Own speed when holding Choice Scarf at S=0 */
  scarfMinSpeed: number;
  /** Own speed when holding Choice Scarf at S=32 */
  scarfMaxSpeed: number;
}

export function analyzeSpeedTiers(
  member: PoolMember,
  pool: PoolMember[],
  matrix: DamageMatrix,
  _poolSpeeds: Map<string, number>,
): { tiers: SpeedTierEntry[]; scarfInfo: ScarfSpeedInfo } {
  // Compute my actual Lv50 speed from SP allocation
  const myNatMod = getNatureModifier(member.nature as NatureName, "spe");
  let myBaseSpe = 0;
  try {
    const poke = createPokemon(member);
    myBaseSpe = poke.baseStats.spe;
  } catch { /* fallback */ }
  const mySpeed = calcStat(myBaseSpe, member.sp.spe, myNatMod);

  // Adjustable range: S=0 to S=32 (reallocation from other stats)
  const myMinSpeed = calcStat(myBaseSpe, 0, myNatMod);
  const myMaxSpeed = calcStat(myBaseSpe, 32, myNatMod);

  // Own scarf speeds
  const scarfInfo: ScarfSpeedInfo = {
    scarfSpeed: Math.floor(mySpeed * 1.5),
    scarfMinSpeed: Math.floor(myMinSpeed * 1.5),
    scarfMaxSpeed: Math.floor(myMaxSpeed * 1.5),
  };

  // Compute each opponent's actual Lv50 speed from their SP allocation
  const tierMap = new Map<number, { pokemon: SpeedTierPokemon[]; usageSum: number; isScarf: boolean }>();
  const addToTier = (speed: number, name: string, tag: string, usage: number, isScarf: boolean) => {
    const existing = tierMap.get(speed);
    if (existing) {
      existing.pokemon.push({ name, tag, isScarf });
      existing.usageSum += usage;
      // Mark tier as scarf only if ALL entries are scarf
      if (!isScarf) existing.isScarf = false;
    } else {
      tierMap.set(speed, { pokemon: [{ name, tag, isScarf }], usageSum: usage, isScarf });
    }
  };

  for (const opp of pool) {
    if (opp.name === member.name) continue;
    const oppSpeed = computeActualSpeed(opp);
    if (oppSpeed === 0) continue;
    const tag = getSpeedTag(opp);
    addToTier(oppSpeed, opp.name, tag, opp.usagePct, false);

    // Add scarf-boosted speed tier for Choice Scarf holders
    if (opp.item === "Choice Scarf") {
      const scarfSpeed = Math.floor(oppSpeed * 1.5);
      addToTier(scarfSpeed, opp.name, "拘", opp.usagePct, true);
    }
  }

  const results: SpeedTierEntry[] = [];

  for (const [speed, tier] of tierMap) {
    const targetSpeed = speed + 1;
    const totalSPNeeded = computeSPForSpeed(myBaseSpe, targetSpeed, myNatMod);
    const additionalSP = Math.max(0, totalSPNeeded - member.sp.spe);
    const currently = mySpeed > speed;
    const reachable = totalSPNeeded <= 32;
    // In adjustable range: SP changes can flip the outspeed relationship
    const inAdjustableRange = speed >= myMinSpeed && speed < myMaxSpeed;

    let flips = 0;
    if (!currently) {
      for (const p of tier.pokemon) {
        const entry = matrix[member.name]?.[p.name];
        if (!entry) continue;
        const eKoN = effectiveKoN(entry);
        if (eKoN <= 2.5 && eKoN > 0) flips++;
      }
    }

    // How much SP can be reduced while still outspeeding this tier
    const spReductionMargin = currently
      ? Math.max(0, member.sp.spe - totalSPNeeded)
      : 0;

    // Scarf-boosted adjustable range check (using scarf speeds)
    const scarfAdjustable = speed >= scarfInfo.scarfMinSpeed && speed < scarfInfo.scarfMaxSpeed;
    // For scarf-only tiers, also consider reachable via scarf
    const scarfTotalSPNeeded = computeSPForScarfSpeed(myBaseSpe, targetSpeed, myNatMod);
    const scarfReachable = scarfTotalSPNeeded <= 32;

    results.push({
      speed,
      pokemon: tier.pokemon,
      usagePctSum: tier.usageSum,
      additionalSPNeeded: additionalSP,
      totalSPNeeded,
      currentlyOutspeeds: currently,
      reachable,
      inAdjustableRange: inAdjustableRange || (tier.isScarf && scarfAdjustable),
      matchupFlips: flips,
      spReductionMargin,
      isScarf: tier.isScarf,
    });
  }

  results.sort((a, b) => b.speed - a.speed);
  return { tiers: results, scarfInfo };
}

/** Compute actual Lv50 speed stat from a PoolMember's SP allocation. */
export function computeActualSpeed(member: PoolMember): number {
  try {
    const poke = createPokemon(member);
    const baseSpe = poke.baseStats.spe;
    const natMod = getNatureModifier(member.nature as NatureName, "spe");
    return calcStat(baseSpe, member.sp.spe, natMod);
  } catch {
    return 0;
  }
}

/** Speed investment tag: 無=S0, 準=S32/neutral, 最=S32/+nature */
function getSpeedTag(member: PoolMember): string {
  if (member.sp.spe === 0) return "無";
  const natMod = getNatureModifier(member.nature as NatureName, "spe");
  if (member.sp.spe >= 32 && natMod >= 1.1) return "最";
  if (member.sp.spe >= 32) return "準";
  return "";
}

function computeSPForSpeed(
  baseSpe: number, targetSpeed: number, natMod: number,
): number {
  const rawBase = Math.floor(((2 * baseSpe + 31) * 50) / 100);
  for (let sp = 0; sp <= 32; sp++) {
    const stat = Math.floor((rawBase + 5 + sp) * natMod);
    if (stat >= targetSpeed) return sp;
  }
  return 99;
}

/** Compute SP needed to reach targetSpeed with Choice Scarf (×1.5). */
function computeSPForScarfSpeed(
  baseSpe: number, targetSpeed: number, natMod: number,
): number {
  const rawBase = Math.floor(((2 * baseSpe + 31) * 50) / 100);
  for (let sp = 0; sp <= 32; sp++) {
    const stat = Math.floor(Math.floor((rawBase + 5 + sp) * natMod) * 1.5);
    if (stat >= targetSpeed) return sp;
  }
  return 99;
}
