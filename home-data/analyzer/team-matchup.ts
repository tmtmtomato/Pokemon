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

// Team generation retry limit (to avoid infinite loops with item exclusivity)
const MAX_TEAM_ATTEMPTS = 200;

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

// ── Team Generation ─────────────────────────────────────────────────────────

function generateTeams(
  pool: MetaPokemon[],
  count: number,
  rng: () => number,
): Team[] {
  const teams: Team[] = [];
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

    teams.push({ id: `T${String(t + 1).padStart(5, "0")}`, members });
  }

  return teams;
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

  console.log(`[1/6] Pool: ${allMeta.length} Pokemon (from singles ranking)`);

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

  console.log(`[3/6] Generating ${totalTeams} teams (item exclusivity enabled)...`);
  const teams = generateTeams(allMeta, totalTeams, rng);
  console.log(`  Generated ${teams.length} teams`);

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

  // ─── Phase 5: Ranking ────────────────────────────────────────────────

  console.log(`[5/6] Ranking teams...`);

  // Build ranked team list
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
    };
  });

  // Sort by win rate, then avg score
  rankedTeams.sort((a, b) => b.winRate - a.winRate || b.avgScore - a.avgScore);
  const topTeams = rankedTeams.slice(0, TOP_N_TEAMS);
  for (let i = 0; i < topTeams.length; i++) topTeams[i].rank = i + 1;

  // Print top 10
  console.log(`\n=== Top 10 Teams ===`);
  for (const t of topTeams.slice(0, 10)) {
    console.log(
      `  #${t.rank} WR=${(t.winRate * 100).toFixed(1)}% ` +
      `[${t.members.join(", ")}] ` +
      `(${t.wins}W/${t.losses}L/${t.draws}D)`,
    );
    if (t.commonSelections[0]) {
      console.log(
        `       Selection: ${t.commonSelections[0].members.join("+")} ` +
        `(${t.commonSelections[0].frequency}x, WR=${(t.commonSelections[0].winRate * 100).toFixed(1)}%)`,
      );
    }
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
