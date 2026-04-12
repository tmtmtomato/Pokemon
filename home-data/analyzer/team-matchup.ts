/**
 * team-matchup.ts
 *
 * 3/6 Singles Team Matchup Analysis:
 * 1. Load builds from singles-ranking output (ensures consistency)
 * 2. Precompute an NxN damage matrix (primary builds only)
 * 3. Generate N random 6-Pokemon teams via Monte Carlo
 *    - Item exclusivity: no two team members may hold the same item
 * 4. For each team pair, run the selection algorithm (3 from 6)
 *    - Mega constraint: at most 1 mega evolution per selection
 * 5. Evaluate 3v3 matchups and track win rates
 * 6. Output top 50 teams with selection patterns + singles ranking scores
 *
 * Prerequisites:
 *   npm run home:singles -- --date 2026-04-10
 *
 * Usage:
 *   npx tsx home-data/analyzer/team-matchup.ts [--date 2026-04-10] [--teams 10000] [--games 200] [--seed 42]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";
import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import type {
  TeamMatchupResult,
  DamageMatrix,
  DamageMatrixEntry,
  PoolMember,
  Team,
  Selection,
  MatchEvaluation,
  RankedTeam,
  SelectionPattern,
  PokemonTeamStats,
  ThreatProfile,
  ThreatEntry,
  ThreatLevel,
} from "../types/team-matchup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const STORAGE = resolve(ROOT, "home-data/storage");

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_TOTAL_TEAMS = 10_000;
const DEFAULT_GAMES_PER_TEAM = 200;
const TEAM_SIZE = 6;
const TOP_N_TEAMS = 50;

// Selection algorithm thresholds
const SECONDARY_ATTACKER_THRESHOLD = 0.3;
const SECONDARY_ATTACKER_COVERAGE_NEEDED = 5; // out of 6

// Pool quality gate: exclude Pokemon with fewer moves (no coverage → dead weight)
const MIN_MOVE_COUNT = 2;

// Team completeness validation: each member must score ≥ this threshold
// roleScore = 0.5 * atkNiche + 0.5 * defNiche (0-100)
// At < 25, 84% of members are dead weight (0% selection rate)
const MIN_MEMBER_ROLE_SCORE = 25;

// Team generation retry limit (to avoid infinite loops with item exclusivity)
const MAX_TEAM_ATTEMPTS = 200;
const MAX_VALIDATION_RETRIES = 50_000;

// Self-KO moves (Explosion / Self-Destruct): user faints → 1:1 trade → 50% contribution
const SELF_KO_MOVES = new Set(["Explosion", "Self-Destruct"]);
const SELF_KO_PENALTY = 0.5;

// Palafin-Hero: must switch out and back in to activate → needs a pivot partner → 0.8x penalty
const SWITCH_IN_PENALTY_POKEMON = new Set(["Palafin-Hero"]);
const SWITCH_IN_PENALTY = 0.8;

// ── Internal types ──────────────────────────────────────────────────────────

type SPPattern = "physicalAT" | "specialAT" | "hbWall" | "hdWall";

interface StatsTable {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

interface BuildConfig {
  nature: string;
  item: string;
  ability: string;
  isMega: boolean;
  spPattern: SPPattern;
  sp: StatsTable;
  weight: number;
}

interface MetaPokemon {
  name: string;
  usagePct: number;
  usageRank: number;
  builds: BuildConfig[];
  moves: string[];
  /** Singles ranking scores (usage-weighted average across builds) */
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

// ── Seeded RNG ──────────────────────────────────────────────────────────────

/** Simple mulberry32 PRNG for reproducible results */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Damage Matrix ───────────────────────────────────────────────────────────

function buildDamageMatrix(pool: MetaPokemon[]): {
  matrix: DamageMatrix;
  totalCalcs: number;
} {
  const matrix: DamageMatrix = {};
  let totalCalcs = 0;
  const poolSize = pool.length;
  let attackersDone = 0;
  const progressInterval = Math.max(1, Math.floor(poolSize / 10)); // log every ~10%

  for (const attacker of pool) {
    matrix[attacker.name] = {};
    // Use primary (highest-weight) build
    const atkBuild = attacker.builds.reduce((best, b) => b.weight > best.weight ? b : best);

    const atkPokemon = new Pokemon({
      name: attacker.name,
      nature: atkBuild.nature as any,
      sp: atkBuild.sp,
      ability: atkBuild.ability,
      item: atkBuild.item,
      isMega: atkBuild.isMega,
      moves: attacker.moves,
    });

    for (const defender of pool) {
      const defBuild = defender.builds.reduce((best, b) => b.weight > best.weight ? b : best);
      const defPokemon = new Pokemon({
        name: defender.name,
        nature: defBuild.nature as any,
        sp: defBuild.sp,
        ability: defBuild.ability,
        item: defBuild.item,
        isMega: defBuild.isMega,
      });

      const field = new Field({ gameType: "Singles" as any });
      let bestEntry: DamageMatrixEntry | null = null;

      for (const moveName of attacker.moves) {
        try {
          const move = new Move(moveName);
          const result = calculate(atkPokemon, defPokemon, move, field);
          let [minPct, maxPct] = result.percentRange();
          const ko = result.koChance();
          totalCalcs++;

          // Self-KO penalty: Explosion / Self-Destruct = 1:1 trade → 50% contribution
          const selfKO = SELF_KO_MOVES.has(moveName);
          if (selfKO) {
            minPct *= SELF_KO_PENALTY;
            maxPct *= SELF_KO_PENALTY;
          }

          // Palafin-Hero penalty: must switch out and back in → needs pivot partner
          if (SWITCH_IN_PENALTY_POKEMON.has(attacker.name)) {
            minPct *= SWITCH_IN_PENALTY;
            maxPct *= SWITCH_IN_PENALTY;
          }

          if (!bestEntry || maxPct > bestEntry.maxPct) {
            bestEntry = {
              bestMove: moveName,
              minPct: round1(minPct),
              maxPct: round1(maxPct),
              koN: selfKO ? Math.max(ko.n, 2) : ko.n, // self-KO can't truly OHKO (you die too)
              koChance: round1(ko.chance),
              effectiveness: result.typeEffectiveness,
            };
          }
        } catch {
          // skip failed calcs
        }
      }

      matrix[attacker.name][defender.name] = bestEntry ?? {
        bestMove: "",
        minPct: 0,
        maxPct: 0,
        koN: 0,
        koChance: 0,
        effectiveness: 1,
      };
    }

    attackersDone++;
    if (attackersDone % progressInterval === 0 || attackersDone === poolSize) {
      const pct = Math.round((attackersDone / poolSize) * 100);
      process.stdout.write(`  [damage matrix] ${attackersDone}/${poolSize} attackers (${pct}%, ${totalCalcs} calcs)\n`);
    }
  }

  return { matrix, totalCalcs };
}

// ── Team Completeness Validation ─────────────────────────────────────────────

/**
 * Validate that every member of a 6-Pokemon team provides meaningful role
 * complementarity. Rejects teams with "dead weight" members that are outclassed
 * by other teammates in every matchup.
 *
 * For each member, compute a roleScore (0-100):
 *   atkNiche: fraction of opponents where this member is a top-3 attacker on the team
 *   defNiche: fraction of opponents where this member uniquely absorbs a threat
 *             (survives when a teammate gets OHKOd, AND can hit back ≥30%)
 *   roleScore = 0.5 * atkNiche + 0.5 * defNiche
 *
 * If any member's roleScore < MIN_MEMBER_ROLE_SCORE, the team is rejected.
 */
function validateTeamCompleteness(
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
      // ATK NICHE: Is this member top-3 attacker vs this opponent?
      const myEntry = matrix[me]?.[opp];
      const myKoN = myEntry?.koN || 99;
      const myMaxPct = myEntry?.maxPct || 0;

      let betterCount = 0;
      for (const o of others) {
        const e = matrix[o]?.[opp];
        const oKoN = e?.koN || 99;
        const oMaxPct = e?.maxPct || 0;
        if (oKoN < myKoN || (oKoN === myKoN && oMaxPct > myMaxPct)) {
          betterCount++;
        }
      }
      if (betterCount < 3) atkNicheCount++;

      // DEF NICHE: Does this member provide unique switch-in value vs this opponent?
      // Criteria: I survive the opponent's best (not OHKOd) while at least one
      // teammate gets OHKOd, AND I can hit back ≥30%.
      const oppToMe = matrix[opp]?.[me];
      const iGetOHKOd = oppToMe && oppToMe.koN === 1 && (oppToMe.koChance ?? 0) >= 0.5;
      if (!iGetOHKOd && myMaxPct >= 30) {
        const anyTeammateOHKOd = others.some((o) => {
          const e = matrix[opp]?.[o];
          return e && e.koN === 1 && (e.koChance ?? 0) >= 0.5;
        });
        if (anyTeammateOHKOd) defNicheCount++;
      }
    }

    const roleScore = Math.round(
      (0.5 * atkNicheCount / N + 0.5 * defNicheCount / N) * 100,
    );

    if (roleScore < MIN_MEMBER_ROLE_SCORE) {
      return false; // Early exit: this member is dead weight
    }
  }

  return true;
}

// ── Team Generation ─────────────────────────────────────────────────────────

function generateTeams(
  pool: MetaPokemon[],
  count: number,
  rng: () => number,
  matrix: DamageMatrix,
): { teams: Team[]; validationRejects: number } {
  const teams: Team[] = [];
  let validationRejects = 0;

  // Mild weighting: Pokemon with higher usage get slight boost
  // weight = 1 + 0.2 * ln(1 + usagePct) — nearly flat but slightly favors popular Pokemon
  const weights = pool.map((p) => 1 + 0.2 * Math.log(1 + p.usagePct));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const cumulative: number[] = [];
  let cum = 0;
  for (const w of weights) {
    cum += w / totalWeight;
    cumulative.push(cum);
  }

  // Track mega-capable Pokemon
  const megaCapable = new Set(pool.filter((p) => p.builds.some((b) => b.isMega)).map((p) => p.name));

  // Precompute primary item for each pool member (for item exclusivity)
  const primaryItem = new Map<string, string>();
  for (const p of pool) {
    const best = p.builds.reduce((a, b) => b.weight > a.weight ? b : a);
    primaryItem.set(p.name, best.item);
  }

  for (let t = 0; t < count; t++) {
    const members: string[] = [];
    let megaCount = 0;
    const used = new Set<number>();
    const usedItems = new Set<string>(); // Item exclusivity tracking
    let attempts = 0;

    while (members.length < TEAM_SIZE && attempts < MAX_TEAM_ATTEMPTS) {
      attempts++;
      const r = rng();
      let idx = cumulative.findIndex((c) => r < c);
      if (idx < 0) idx = pool.length - 1;

      if (used.has(idx)) continue;
      const name = pool[idx].name;
      const item = primaryItem.get(name)!;

      // Limit mega-capable to 2 (but only 1 can be selected — enforced in selectTeam)
      if (megaCapable.has(name) && megaCount >= 2) continue;

      // Item exclusivity: no two team members with the same item
      if (usedItems.has(item)) continue;

      used.add(idx);
      members.push(name);
      usedItems.add(item);
      if (megaCapable.has(name)) megaCount++;
    }

    // If we couldn't fill 6, skip this team and try again
    if (members.length < TEAM_SIZE) {
      t--;
      continue;
    }

    // Team completeness validation: reject teams with dead-weight members
    if (!validateTeamCompleteness(members, pool, matrix)) {
      validationRejects++;
      if (validationRejects <= MAX_VALIDATION_RETRIES) {
        t--;
        continue;
      }
      // Safety valve: if we've hit the retry limit, accept despite failure
      console.warn(`[team-matchup] WARNING: hit validation retry limit (${MAX_VALIDATION_RETRIES}), accepting team`);
    }

    teams.push({ id: `T${String(t + 1).padStart(5, "0")}`, members });
  }

  return { teams, validationRejects };
}

// ── Selection Algorithm ─────────────────────────────────────────────────────

function selectTeam(
  myTeam: string[],
  oppTeam: string[],
  matrix: DamageMatrix,
  megaCapable: Set<string>,
): Selection {
  // Step 1: Score each of my Pokemon as an attacker vs opponent's 6
  const atkScores: { name: string; score: number; kills: number; avgDmg: number }[] = [];

  for (const me of myTeam) {
    let kills = 0;
    let totalDmg = 0;
    for (const opp of oppTeam) {
      const entry = matrix[me]?.[opp];
      if (!entry) continue;
      if (entry.koN >= 1 && entry.koN <= 2 && entry.koChance >= 0.5) kills++;
      totalDmg += entry.maxPct;
    }
    const consistency = kills / oppTeam.length;
    const avgDmg = totalDmg / oppTeam.length / 100;
    atkScores.push({
      name: me,
      score: 0.6 * consistency + 0.4 * avgDmg,
      kills,
      avgDmg: totalDmg / oppTeam.length,
    });
  }

  atkScores.sort((a, b) => b.score - a.score);

  // Step 2: Pick 1-2 attackers (mega exclusive: max 1 mega per selection)
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

    // Mega constraint: max 1 mega in selection
    const hasMegaInSelection = selected.some((s) => megaCapable.has(s));
    if (hasMegaInSelection && megaCapable.has(cand.name)) continue;

    // Check if ace + secondary cover enough opponents
    const coveredByAce = new Set<string>();
    const coveredBySecondary = new Set<string>();
    for (const opp of oppTeam) {
      const aceEntry = matrix[ace.name]?.[opp];
      if (aceEntry && aceEntry.koN >= 1 && aceEntry.koN <= 2 && aceEntry.koChance >= 0.5) {
        coveredByAce.add(opp);
      }
      const candEntry = matrix[cand.name]?.[opp];
      if (candEntry && candEntry.koN >= 1 && candEntry.koN <= 2 && candEntry.koChance >= 0.5) {
        coveredBySecondary.add(opp);
      }
    }
    const combined = new Set([...coveredByAce, ...coveredBySecondary]);
    if (combined.size >= SECONDARY_ATTACKER_COVERAGE_NEEDED) {
      selected.push(cand.name);
      roles.push("secondary");
      break;
    }
  }

  // Step 3-4: Fill complement slots to reach 3
  const selectedSet = new Set(selected);

  while (selected.length < 3) {
    let bestComplement = "";
    let bestComplementScore = -1;

    for (const me of myTeam) {
      if (selectedSet.has(me)) continue;

      // Mega constraint: max 1 mega in selection
      const hasMegaInSelection = selected.some((s) => megaCapable.has(s));
      if (hasMegaInSelection && megaCapable.has(me)) continue;

      let defenseValue = 0;
      let offenseValue = 0;

      for (const opp of oppTeam) {
        // A. Does this opponent threaten our selected attackers?
        const isThreateningToUs = selected.some((atk) => {
          const entry = matrix[opp]?.[atk];
          return entry && entry.koN === 1 && entry.koChance >= 0.5;
        });

        if (isThreateningToUs) {
          // Can this candidate survive and hit back?
          const oppToMe = matrix[opp]?.[me];
          const meToOpp = matrix[me]?.[opp];
          const canTank = !oppToMe || oppToMe.koN !== 1 || oppToMe.koChance < 0.5;
          const canHitBack = meToOpp && meToOpp.maxPct >= 30;
          if (canTank && canHitBack) defenseValue += 1;
        }

        // B. Uncovered by current selection?
        const uncovered = !selected.some((atk) => {
          const entry = matrix[atk]?.[opp];
          return entry && entry.koN >= 1 && entry.koN <= 2 && entry.koChance >= 0.5;
        });

        if (uncovered) {
          const meToOpp = matrix[me]?.[opp];
          if (meToOpp && meToOpp.koN >= 1 && meToOpp.koN <= 2 && meToOpp.koChance >= 0.5) {
            offenseValue += 1;
          }
        }
      }

      const score = 0.5 * defenseValue + 0.5 * offenseValue;
      if (score > bestComplementScore) {
        bestComplementScore = score;
        bestComplement = me;
      }
    }

    // Fallback: if no good complement, pick by attacker score
    if (!bestComplement || bestComplementScore <= 0) {
      for (const cand of atkScores) {
        if (!selectedSet.has(cand.name)) {
          // Mega constraint: max 1 mega in selection
          const hasMegaInSelection = selected.some((s) => megaCapable.has(s));
          if (hasMegaInSelection && megaCapable.has(cand.name)) continue;
          bestComplement = cand.name;
          break;
        }
      }
    }

    if (!bestComplement) {
      // Last resort: any remaining (even if mega constraint violated)
      bestComplement = myTeam.find((m) => !selectedSet.has(m))!;
    }

    selected.push(bestComplement);
    selectedSet.add(bestComplement);
    roles.push("complement");
  }

  return { members: selected, roles };
}

// ── 3v3 Evaluation ──────────────────────────────────────────────────────────

function evaluate3v3(
  selA: string[],
  selB: string[],
  matrix: DamageMatrix,
): MatchEvaluation {
  // A attacks B
  const B_killed = new Set<number>();
  let A_ohkos = 0;
  let A_totalDmg = 0;

  for (const a of selA) {
    for (let j = 0; j < selB.length; j++) {
      const entry = matrix[a]?.[selB[j]];
      if (!entry) continue;
      if (entry.koN >= 1 && entry.koN <= 2 && entry.koChance >= 0.5) B_killed.add(j);
      if (entry.koN === 1 && entry.koChance >= 0.5) A_ohkos++;
      A_totalDmg += entry.maxPct;
    }
  }

  // B attacks A
  const A_killed = new Set<number>();
  let B_ohkos = 0;
  let B_totalDmg = 0;

  for (const b of selB) {
    for (let i = 0; i < selA.length; i++) {
      const entry = matrix[b]?.[selA[i]];
      if (!entry) continue;
      if (entry.koN >= 1 && entry.koN <= 2 && entry.koChance >= 0.5) A_killed.add(i);
      if (entry.koN === 1 && entry.koChance >= 0.5) B_ohkos++;
      B_totalDmg += entry.maxPct;
    }
  }

  const A_kills = B_killed.size;
  const B_kills = A_killed.size;
  const A_avgDmg = A_totalDmg / 9;
  const B_avgDmg = B_totalDmg / 9;

  const scoreA = 0.35 * (A_kills / 3)
               + 0.25 * (A_ohkos / 9)
               + 0.20 * (1 - B_kills / 3)
               + 0.20 * (A_avgDmg / 100);

  const scoreB = 0.35 * (B_kills / 3)
               + 0.25 * (B_ohkos / 9)
               + 0.20 * (1 - A_kills / 3)
               + 0.20 * (B_avgDmg / 100);

  return {
    scoreA: round1(scoreA * 100) / 100,
    scoreB: round1(scoreB * 100) / 100,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
  };
}

// ── Type Coverage Helpers ───────────────────────────────────────────────────

function getTeamOffensiveTypes(members: string[], pool: MetaPokemon[]): string[] {
  const types = new Set<string>();
  for (const name of members) {
    const meta = pool.find((p) => p.name === name);
    if (!meta) continue;
    for (const moveName of meta.moves) {
      const moveData = getMoveData(moveName);
      if (moveData) types.add(moveData.type);
    }
  }
  return [...types].sort();
}

function getTeamDefensiveWeaks(members: string[]): string[] {
  const ALL_TYPES = [
    "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison",
    "Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy",
  ];
  const typeChart = loadJson<Record<string, Record<string, number>>>(
    resolve(ROOT, "src/data/typechart.json"),
  );

  // Count how many team members are weak to each type
  const weakCounts: Record<string, number> = {};
  for (const atkType of ALL_TYPES) weakCounts[atkType] = 0;

  for (const name of members) {
    try {
      const species = getSpecies(name);
      if (!species) continue;
      const defTypes = species.types as string[];
      for (const atkType of ALL_TYPES) {
        let mult = 1;
        for (const defType of defTypes) {
          mult *= typeChart[atkType]?.[defType] ?? 1;
        }
        if (mult > 1) weakCounts[atkType]++;
      }
    } catch { /* skip */ }
  }

  // Return types that hit 3+ members SE
  return ALL_TYPES.filter((t) => weakCounts[t] >= 3).sort();
}

// ── Pokemon Statistics ──────────────────────────────────────────────────────

function computePokemonStats(
  topTeams: RankedTeam[],
  allTeams: Team[],
  selectionLog: Map<string, { teamId: string; selected: string[]; won: boolean }[]>,
): PokemonTeamStats[] {
  const pool = new Set<string>();
  for (const team of topTeams) for (const m of team.members) pool.add(m);

  const stats: PokemonTeamStats[] = [];

  for (const name of pool) {
    // Pick rate in top 50
    const inTopTeams = topTeams.filter((t) => t.members.includes(name)).length;
    const pickRate = inTopTeams / topTeams.length;

    // Selection stats
    const logs = selectionLog.get(name) ?? [];
    const timesInTeam = logs.length;
    const timesSelected = logs.filter((l) => l.selected.includes(name)).length;
    const selectionRate = timesInTeam > 0 ? timesSelected / timesInTeam : 0;

    // Win rate when selected
    const selectedLogs = logs.filter((l) => l.selected.includes(name));
    const winsWhenSelected = selectedLogs.filter((l) => l.won).length;
    const winRateWhenSelected = selectedLogs.length > 0 ? winsWhenSelected / selectedLogs.length : 0;

    // Common partners (when selected together)
    const partnerCounts: Record<string, number> = {};
    for (const log of selectedLogs) {
      for (const partner of log.selected) {
        if (partner !== name) {
          partnerCounts[partner] = (partnerCounts[partner] ?? 0) + 1;
        }
      }
    }
    const commonPartners = Object.entries(partnerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pName, count]) => ({ name: pName, count }));

    stats.push({
      name,
      pickRate: round1(pickRate * 100) / 100,
      selectionRate: round1(selectionRate * 100) / 100,
      winRateWhenSelected: round1(winRateWhenSelected * 100) / 100,
      commonPartners,
    });
  }

  return stats.sort((a, b) => b.pickRate - a.pickRate);
}

// ── Threat Analysis ─────────────────────────────────────────────────────

/**
 * Classify threat level of a single opponent against a team.
 * Uses the same logic as moveCalc.ts classifyThreat:
 *   CRITICAL: ourBestKoN >= 3 AND theirBestKoN <= 2
 *   HIGH:     ourBestKoN >= 3 OR (theirBestKoN <= 2 AND slower)
 *   MEDIUM:   ourBestKoN === 2
 *   LOW:      ourBestKoN === 1
 */
function classifyThreatLevel(
  ourBestKoN: number,
  theirBestKoN: number,
  speed: "faster" | "slower" | "tie",
): ThreatLevel {
  if (ourBestKoN >= 3 && theirBestKoN <= 2) return "critical";
  if (ourBestKoN >= 3 || (theirBestKoN <= 2 && speed === "slower")) return "high";
  if (ourBestKoN === 2) return "medium";
  return "low";
}

/**
 * Compute threat profile for a team against the entire pool using the precomputed damage matrix.
 *
 * killPressure (殺意):     How effectively can this team KO pool opponents?
 * threatResistance (脅威耐性): How safe is this team from pool threats?
 * answerRate (回答率):      What % of opponents does the team have a reliable answer for?
 */
function computeTeamThreatProfile(
  members: string[],
  pool: MetaPokemon[],
  matrix: DamageMatrix,
): ThreatProfile {
  const teamSet = new Set(members);
  const opponents = pool.filter((p) => !teamSet.has(p.name));

  // ── Mega constraint awareness ──
  // Identify mega-capable members in this team.
  // Teams can have ≤2 mega-capable Pokemon, but only 1 can be selected per 3v3.
  // The damage matrix uses mega stats, so non-active megas are overestimated.
  const megaMembers = new Set<string>();
  for (const m of members) {
    const meta = pool.find((p) => p.name === m);
    if (meta?.builds.some((b) => b.isMega)) megaMembers.add(m);
  }
  const hasMegaConstraint = megaMembers.size >= 2;

  // Precompute member speeds for reuse
  const memberSpeeds = new Map<string, number>();
  for (const m of members) {
    const meta = pool.find((p) => p.name === m);
    memberSpeeds.set(m, meta?.singlesScores?.speedStat ?? 0);
  }

  // Sort opponents by usage descending to identify top-10 usage mons
  const opponentsByUsage = [...opponents].sort((a, b) => b.usagePct - a.usagePct);
  const top10UsageNames = new Set(opponentsByUsage.slice(0, 10).map((p) => p.name));

  let killPressureSum = 0;
  let threatPenaltySum = 0;
  let answeredUsageSum = 0;   // usage-weighted answered
  let totalUsageSum = 0;      // total usage weight
  let answeredCount = 0;
  let unansweredCount = 0;
  let criticalGaps = 0;       // unanswered top-10 usage opponents
  let criticalThreats = 0;
  let highThreats = 0;
  const entries: ThreatEntry[] = [];

  // Track mega-exclusive dependencies for contention check
  // megaExclusiveAnswers[megaName] = count of opponents answered ONLY by this mega
  const megaExclusiveAnswers = new Map<string, number>();
  // megaExclusiveKills[megaName] = kill pressure points that ONLY this mega provides
  const megaExclusiveKills = new Map<string, number>();

  /** Check if a member meets answer criteria vs an opponent */
  function meetsAnswerCriteria(me: string, oppName: string, oppSpeed: number): boolean {
    const meToOpp = matrix[me]?.[oppName];
    const oppToMe = matrix[oppName]?.[me];
    if (!meToOpp) return false;
    const myKoN = meToOpp.koN || 99;
    if (myKoN > 2) return false; // can't KO in ≤2

    const memberSpeed = memberSpeeds.get(me) ?? 0;
    const outspeeds = memberSpeed > oppSpeed;

    // Outspeeds and OHKOs (revenge kill)
    if (outspeeds && myKoN === 1) return true;

    // Survives opponent's best and wins KO race
    const theirKoNToMe = oppToMe?.koN || 99;
    if (theirKoNToMe >= 2) {
      const weWin = outspeeds
        ? myKoN <= theirKoNToMe
        : myKoN < theirKoNToMe;
      if (weWin) return true;
    }
    return false;
  }

  for (const opp of opponents) {
    const oppSpeed = opp.singlesScores?.speedStat ?? 0;

    // ── Our best damage (mega-aware) ──
    // Track both overall best and best non-mega alternative
    let ourBestKoN = 99;
    let ourBestMember = "";
    let nonMegaBestKoN = 99;
    for (const me of members) {
      const entry = matrix[me]?.[opp.name];
      if (!entry) continue;
      const koN = entry.koN || 99;
      if (koN < ourBestKoN) {
        ourBestKoN = koN;
        ourBestMember = me;
      }
      if (!megaMembers.has(me) && koN < nonMegaBestKoN) {
        nonMegaBestKoN = koN;
      }
    }

    // Their best: which team member takes the most damage?
    let theirBestKoN = 99;
    let theirBestTarget = "";
    for (const me of members) {
      const entry = matrix[opp.name]?.[me];
      if (!entry) continue;
      const koN = entry.koN || 99;
      if (koN < theirBestKoN) {
        theirBestKoN = koN;
        theirBestTarget = me;
      }
    }

    // Speed comparison (team-level)
    const ourFastestRelevant = Math.max(...members.map((m) => memberSpeeds.get(m) ?? 0));
    const speed: "faster" | "slower" | "tie" =
      ourFastestRelevant > oppSpeed ? "faster" :
      ourFastestRelevant < oppSpeed ? "slower" : "tie";

    const threatLevel = classifyThreatLevel(ourBestKoN, theirBestKoN, speed);

    // ── Kill pressure (mega-aware) ──
    // Score based on ourBest, but track if this kill is mega-exclusive
    let killPoints = 0;
    if (ourBestKoN === 1) killPoints = 3;
    else if (ourBestKoN === 2) killPoints = 2;
    else if (ourBestKoN === 3) killPoints = 1;
    killPressureSum += killPoints;

    // If the best killer is mega and no non-mega alternative within same tier
    if (hasMegaConstraint && megaMembers.has(ourBestMember) && killPoints > 0) {
      let nonMegaKillPoints = 0;
      if (nonMegaBestKoN === 1) nonMegaKillPoints = 3;
      else if (nonMegaBestKoN === 2) nonMegaKillPoints = 2;
      else if (nonMegaBestKoN === 3) nonMegaKillPoints = 1;

      const lostPoints = killPoints - nonMegaKillPoints;
      if (lostPoints > 0) {
        megaExclusiveKills.set(
          ourBestMember,
          (megaExclusiveKills.get(ourBestMember) ?? 0) + lostPoints,
        );
      }
    }

    // Threat penalty
    const penaltyMap: Record<ThreatLevel, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    threatPenaltySum += penaltyMap[threatLevel];
    if (threatLevel === "critical") criticalThreats++;
    if (threatLevel === "high") highThreats++;

    // ── Answer check (mega-aware) ──
    // Prefer non-mega answers. Track if answer is mega-exclusive.
    let hasAnswer = false;
    let answerIsNonMega = false;
    let answeringMega: string | null = null;

    // First pass: look for non-mega answers
    for (const me of members) {
      if (megaMembers.has(me)) continue;
      if (meetsAnswerCriteria(me, opp.name, oppSpeed)) {
        hasAnswer = true;
        answerIsNonMega = true;
        break;
      }
    }

    // Second pass: if no non-mega answer, try mega answers
    if (!hasAnswer) {
      for (const me of members) {
        if (!megaMembers.has(me)) continue;
        if (meetsAnswerCriteria(me, opp.name, oppSpeed)) {
          hasAnswer = true;
          answeringMega = me;
          break;
        }
      }
    }

    const oppUsage = opp.usagePct;
    totalUsageSum += oppUsage;

    if (hasAnswer) {
      answeredCount++;
      answeredUsageSum += oppUsage;
    } else {
      unansweredCount++;
      if (top10UsageNames.has(opp.name)) criticalGaps++;
    }

    // Track mega-exclusive answer dependency
    if (hasMegaConstraint && hasAnswer && !answerIsNonMega && answeringMega) {
      megaExclusiveAnswers.set(
        answeringMega,
        (megaExclusiveAnswers.get(answeringMega) ?? 0) + 1,
      );
    }

    entries.push({
      opponent: opp.name,
      usagePct: oppUsage,
      threatLevel,
      ourBestKoN: ourBestKoN === 99 ? 0 : ourBestKoN,
      ourBestMember,
      theirBestKoN: theirBestKoN === 99 ? 0 : theirBestKoN,
      theirBestTarget,
      hasAnswer,
    });
  }

  // ── Mega contention adjustment ──
  // If 2+ different megas have exclusive dependencies, there's a selection conflict:
  // you can only bring 1 mega per 3v3, so one group's exclusive answers are lost.
  // Conservative estimate: subtract the SMALLER group (best-case mega choice).
  let megaContestedAnswers = 0;
  let megaContestedKillPoints = 0;

  if (hasMegaConstraint && megaExclusiveAnswers.size >= 2) {
    const counts = [...megaExclusiveAnswers.values()].sort((a, b) => a - b);
    megaContestedAnswers = counts[0]; // the smaller group is lost
    answeredCount = Math.max(0, answeredCount - megaContestedAnswers);
    // Also subtract contested usage weight (approximate: use average opponent usage)
    const avgUsage = totalUsageSum / (opponents.length || 1);
    answeredUsageSum = Math.max(0, answeredUsageSum - megaContestedAnswers * avgUsage);
  }

  if (hasMegaConstraint && megaExclusiveKills.size >= 2) {
    const points = [...megaExclusiveKills.values()].sort((a, b) => a - b);
    megaContestedKillPoints = points[0]; // the smaller group's extra points are lost
    killPressureSum = Math.max(0, killPressureSum - megaContestedKillPoints);
  }

  const oppCount = opponents.length || 1;
  const maxKillPressure = 3 * oppCount;
  const maxThreatPenalty = 3 * oppCount;

  const killPressure = Math.round((killPressureSum / maxKillPressure) * 100);
  const threatResistance = Math.round((1 - threatPenaltySum / maxThreatPenalty) * 100);

  // Usage-weighted answer rate: high-usage unanswered opponents penalize much harder
  const answerRate = totalUsageSum > 0
    ? Math.round((answeredUsageSum / totalUsageSum) * 100)
    : Math.round((answeredCount / oppCount) * 100);

  // Combined dominance score: kill intent + safety + answer coverage
  // answerRate weight increased from 20% → 35% to heavily punish unanswered gaps
  let dominanceScore = Math.round(
    0.30 * killPressure + 0.30 * threatResistance + 0.40 * answerRate,
  );

  // Critical gap penalty: unanswered top-10 usage opponents are devastating
  // Each critical gap applies a multiplicative penalty (e.g., 3 gaps → 0.85^3 ≈ 0.61)
  if (criticalGaps > 0) {
    const gapPenalty = Math.pow(0.85, criticalGaps);
    dominanceScore = Math.round(dominanceScore * gapPenalty);
  }

  // Top threats: unanswered first (sorted by usage), then answered critical/high
  const topThreats = entries
    .filter((e) => e.threatLevel === "critical" || e.threatLevel === "high" || !e.hasAnswer)
    .sort((a, b) => {
      // Unanswered always first
      if (!a.hasAnswer && b.hasAnswer) return -1;
      if (a.hasAnswer && !b.hasAnswer) return 1;
      // Within same answer status: sort by usage (most common threats first)
      const usageDiff = b.usagePct - a.usagePct;
      if (Math.abs(usageDiff) > 0.001) return usageDiff;
      // Tiebreak: threat level
      const order: Record<ThreatLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.threatLevel] - order[b.threatLevel];
    })
    .slice(0, 8);

  return {
    killPressure,
    threatResistance,
    answerRate,
    dominanceScore,
    criticalThreats,
    highThreats,
    unansweredCount,
    criticalGaps,
    topThreats,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv;
  const dateArg = args.find((a, i) => args[i - 1] === "--date") ?? "2026-04-10";
  const totalTeams = parseInt(args.find((a, i) => args[i - 1] === "--teams") ?? String(DEFAULT_TOTAL_TEAMS));
  const gamesPerTeam = parseInt(args.find((a, i) => args[i - 1] === "--games") ?? String(DEFAULT_GAMES_PER_TEAM));
  const seed = parseInt(args.find((a, i) => args[i - 1] === "--seed") ?? "42");
  const rng = mulberry32(seed);

  console.log(`[team-matchup] Starting...`);
  console.log(`  Date: ${dateArg}, Teams: ${totalTeams}, Games/team: ${gamesPerTeam}, Seed: ${seed}`);

  // ─── Phase 1: Load builds from singles ranking ────────────────────────

  const singlesPath = resolve(STORAGE, `analysis/${dateArg}-singles.json`);
  if (!existsSync(singlesPath)) {
    console.error(`Singles ranking data not found: ${singlesPath}`);
    console.error(`Run 'npm run home:singles -- --date ${dateArg}' first.`);
    process.exit(1);
  }

  const singlesData = loadJson<any>(singlesPath);
  const allMeta: MetaPokemon[] = [];

  for (const rp of singlesData.pokemon) {
    const builds: BuildConfig[] = (rp.builds as any[]).map((b: any) => b.config);
    const moves: string[] = rp.builds[0]?.moves ?? [];
    if (builds.length === 0 || moves.length === 0) continue;
    if (moves.length < MIN_MOVE_COUNT) continue; // Pool quality gate

    allMeta.push({
      name: rp.name,
      usagePct: rp.usagePct,
      usageRank: rp.usageRank,
      builds,
      moves,
      singlesScores: {
        overallScore: rp.scores.overallScore,
        offensiveScore: rp.scores.offensiveScore,
        defensiveScore: rp.scores.defensiveScore,
        speedStat: rp.scores.speedStat,
        speedTier: rp.scores.speedTier,
        speedAdvantage: rp.scores.speedAdvantage,
        sustainedScore: rp.scores.sustainedScore ?? 0,
        winRate1v1: rp.scores.winRate1v1 ?? 0,
        sweepPotential: rp.scores.sweepPotential ?? 1,
      },
    });
  }

  const originalPoolSize = (singlesData.pokemon as any[]).length;
  const poolFiltered = originalPoolSize - allMeta.length;
  console.log(`[1/6] Pool: ${allMeta.length} Pokemon (${poolFiltered} filtered: <${MIN_MOVE_COUNT} moves)`);

  // ─── Phase 2: Damage matrix ──────────────────────────────────────────

  console.log(`[2/6] Computing damage matrix...`);
  const { matrix, totalCalcs } = buildDamageMatrix(allMeta);
  console.log(`  ${totalCalcs} calculations (${allMeta.length}×${allMeta.length} pairs)`);

  // Identify mega-capable Pokemon
  const megaCapable = new Set(
    allMeta.filter((p) => p.builds.some((b) => b.isMega)).map((p) => p.name),
  );
  console.log(`  Mega-capable: ${[...megaCapable].join(", ")}`);

  // ─── Phase 3: Generate teams (with item exclusivity) ──────────────────

  console.log(`[3/6] Generating ${totalTeams} teams (item exclusivity + completeness validation)...`);
  const { teams, validationRejects } = generateTeams(allMeta, totalTeams, rng, matrix);
  console.log(`  Generated ${teams.length} teams (${validationRejects} rejected for dead-weight members)`);

  // ─── Phase 4: Round-robin evaluation (max 1 mega per selection) ───────

  console.log(`[4/6] Running ${totalTeams} × ${gamesPerTeam} matchups...`);

  // Per-team tracking
  const teamWins: number[] = new Array(totalTeams).fill(0);
  const teamLosses: number[] = new Array(totalTeams).fill(0);
  const teamDraws: number[] = new Array(totalTeams).fill(0);
  const teamScoreSum: number[] = new Array(totalTeams).fill(0);
  const teamSelections: Map<number, Map<string, { count: number; wins: number }>> = new Map();
  // Per-Pokemon selection log (for top teams only — collected later)
  const selectionLog = new Map<string, { teamId: string; selected: string[]; won: boolean }[]>();
  for (const meta of allMeta) selectionLog.set(meta.name, []);

  // For each team, pick random opponents
  let totalMatchups = 0;
  for (let ti = 0; ti < totalTeams; ti++) {
    const myTeam = teams[ti];
    const selMap = new Map<string, { count: number; wins: number }>();
    teamSelections.set(ti, selMap);

    for (let g = 0; g < gamesPerTeam; g++) {
      // Pick random opponent (different from self)
      let oi = ti;
      while (oi === ti) oi = Math.floor(rng() * totalTeams);
      const oppTeam = teams[oi];

      // Select 3 from each (mega constraint: max 1 mega per selection)
      const selA = selectTeam(myTeam.members, oppTeam.members, matrix, megaCapable);
      const selB = selectTeam(oppTeam.members, myTeam.members, matrix, megaCapable);

      // Evaluate
      const result = evaluate3v3(selA.members, selB.members, matrix);
      totalMatchups++;

      if (result.winner === "A") {
        teamWins[ti]++;
        teamLosses[oi]++;
      } else if (result.winner === "B") {
        teamLosses[ti]++;
        teamWins[oi]++;
      } else {
        teamDraws[ti]++;
        teamDraws[oi]++;
      }

      teamScoreSum[ti] += result.scoreA;

      // Track selection pattern
      const selKey = [...selA.members].sort().join("+");
      const existing = selMap.get(selKey) ?? { count: 0, wins: 0 };
      existing.count++;
      if (result.winner === "A") existing.wins++;
      selMap.set(selKey, existing);

      // Log selections for Pokemon stats
      for (const name of myTeam.members) {
        selectionLog.get(name)!.push({
          teamId: myTeam.id,
          selected: selA.members,
          won: result.winner === "A",
        });
      }
    }

    if ((ti + 1) % 1000 === 0) process.stdout.write(`  ${ti + 1}/${totalTeams}\n`);
  }

  console.log(`  Total matchups: ${totalMatchups}`);

  // ─── Phase 5: Ranking with threat analysis ─────────────────────────

  console.log(`[5/6] Ranking teams (with threat analysis)...`);

  // Build ranked team list with threat profiles
  const rankedTeams: RankedTeam[] = teams.map((team, ti) => {
    const totalGames = teamWins[ti] + teamLosses[ti] + teamDraws[ti];
    const winRate = totalGames > 0 ? teamWins[ti] / totalGames : 0;

    // Selection patterns
    const selMap = teamSelections.get(ti)!;
    const patterns: SelectionPattern[] = [...selMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([key, val]) => ({
        members: key.split("+"),
        frequency: val.count,
        winRate: val.count > 0 ? round1((val.wins / val.count) * 100) / 100 : 0,
      }));

    // Compute threat profile for this team vs entire pool
    const threatProfile = computeTeamThreatProfile(team.members, allMeta, matrix);

    return {
      rank: 0,
      teamId: team.id,
      members: team.members,
      winRate: round1(winRate * 100) / 100,
      wins: teamWins[ti],
      losses: teamLosses[ti],
      draws: teamDraws[ti],
      avgScore: totalGames > 0 ? round1((teamScoreSum[ti] / totalGames) * 100) / 100 : 0,
      commonSelections: patterns,
      typeProfile: {
        offensiveTypes: getTeamOffensiveTypes(team.members, allMeta),
        defensiveWeaks: getTeamDefensiveWeaks(team.members),
      },
      threatProfile,
    };
  });

  // Sort by combined score: winRate (60%) + dominanceScore (40%)
  // This promotes teams with high kill pressure AND low threats
  rankedTeams.sort((a, b) => {
    const scoreA = 0.6 * (a.winRate * 100) + 0.4 * (a.threatProfile?.dominanceScore ?? 0);
    const scoreB = 0.6 * (b.winRate * 100) + 0.4 * (b.threatProfile?.dominanceScore ?? 0);
    return scoreB - scoreA || b.winRate - a.winRate;
  });
  const topTeams = rankedTeams.slice(0, TOP_N_TEAMS);
  for (let i = 0; i < topTeams.length; i++) topTeams[i].rank = i + 1;

  // Print top 10
  console.log(`\n=== Top 10 Teams (殺意×脅威耐性) ===`);
  for (const t of topTeams.slice(0, 10)) {
    const tp = t.threatProfile;
    const combined = tp ? (0.6 * (t.winRate * 100) + 0.4 * tp.dominanceScore).toFixed(1) : "?";
    console.log(
      `  #${t.rank} Combined=${combined} WR=${(t.winRate * 100).toFixed(1)}% ` +
      `Kill=${tp?.killPressure ?? "?"}  Safe=${tp?.threatResistance ?? "?"} ` +
      `Ans=${tp?.answerRate ?? "?"}% ` +
      `Unans=${tp?.unansweredCount ?? "?"} Gaps=${tp?.criticalGaps ?? 0} ` +
      `Crit=${tp?.criticalThreats ?? 0} High=${tp?.highThreats ?? 0}`,
    );
    console.log(
      `       [${t.members.join(", ")}]`,
    );
  }

  // ─── Phase 6: Pokemon stats + Output ─────────────────────────────────

  console.log(`\n[6/6] Computing stats & writing output...`);

  const pokemonStats = computePokemonStats(topTeams, teams, selectionLog);

  // Build pool info (enriched with singles ranking scores)
  const poolMembers: PoolMember[] = allMeta.map((meta) => {
    const primaryBuild = meta.builds.reduce((best, b) => b.weight > best.weight ? b : best);
    const species = getSpecies(meta.name);
    return {
      name: meta.name,
      usagePct: meta.usagePct,
      usageRank: meta.usageRank,
      isMega: primaryBuild.isMega,
      nature: primaryBuild.nature,
      item: primaryBuild.item,
      ability: primaryBuild.ability,
      types: species?.types ?? [],
      moves: meta.moves,
      sp: primaryBuild.sp,
      // Singles ranking scores
      overallScore: meta.singlesScores?.overallScore,
      offensiveScore: meta.singlesScores?.offensiveScore,
      defensiveScore: meta.singlesScores?.defensiveScore,
      speedStat: meta.singlesScores?.speedStat,
      speedTier: meta.singlesScores?.speedTier,
      speedAdvantage: meta.singlesScores?.speedAdvantage,
      sustainedScore: meta.singlesScores?.sustainedScore,
      winRate1v1: meta.singlesScores?.winRate1v1,
      sweepPotential: meta.singlesScores?.sweepPotential,
    };
  });

  const output: TeamMatchupResult = {
    generatedAt: new Date().toISOString(),
    format: "championspreview",
    config: {
      totalTeams,
      gamesPerTeam,
      poolSize: allMeta.length,
      poolFiltered,
      teamsRejected: validationRejects,
    },
    pool: poolMembers,
    damageMatrix: matrix,
    topTeams,
    pokemonStats,
  };

  const outPath = resolve(STORAGE, `analysis/${dateArg}-team-matchup.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  const sizeKB = Math.round(readFileSync(outPath).length / 1024);
  console.log(`Written to ${outPath} (${sizeKB}KB)`);
  console.log(`  Pool: ${allMeta.length}, Matrix calcs: ${totalCalcs}, Matchups: ${totalMatchups}`);
  console.log(`  Top team WR: ${(topTeams[0]?.winRate * 100).toFixed(1)}%`);
  if (topTeams[0]?.threatProfile) {
    const tp = topTeams[0].threatProfile;
    console.log(`  Top team dominance: Kill=${tp.killPressure} Safe=${tp.threatResistance} Ans=${tp.answerRate}%`);
  }

  // Print Pokemon stats
  console.log(`\n=== Pokemon Popularity in Top 50 Teams ===`);
  for (const ps of pokemonStats.slice(0, 15)) {
    console.log(
      `  ${ps.name.padEnd(20)} Pick=${(ps.pickRate * 100).toFixed(0)}% ` +
      `Sel=${(ps.selectionRate * 100).toFixed(0)}% ` +
      `WR=${(ps.winRateWhenSelected * 100).toFixed(1)}%`,
    );
  }
}

main();
