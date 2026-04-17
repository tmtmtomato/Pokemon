/**
 * team-matchup.ts
 *
 * Evolutionary Team Matchup Analysis with Worker Parallelization:
 * 1-2.  Pool + damage matrix
 * 3.    Generate N random 6-Pokemon teams via Monte Carlo
 * 4.    [Parallel] Round-robin matchup evaluation
 * 5.    [Parallel] 3-core meta evaluation (exhaustive combo scoring)
 * 6-7.  Core-seeded team generation + evaluation
 * 8.    Iterative hill-climbing refinement (tiered + dual)
 * 9.    Re-evaluation (top N elite matchups)
 * 10-11. Elite refinement (closed pool) + final re-eval
 * 12.   Ranking + threat analysis + stable core detection
 * 13.   Exhaustive remaining-slot search for stable cores
 *
 * Prerequisites:
 *   npm run home:singles -- --date 2026-04-10
 *
 * Usage:
 *   npx tsx home-data/analyzer/team-matchup.ts [--date DATE] [--teams N] [--games N] [--seed N] [--workers N] [--refine-rounds N] [--skip-cores] [--loop]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { calculate, Pokemon, Move, Field, getEffectiveness, calcStat, getNatureModifier } from "../../src/index.js";
import type { TypeName, NatureName } from "../../src/types.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import type {
  TeamMatchupResult,
  DamageMatrixEntry,
  PoolMember,
  Team,
  RankedTeam,
  SelectionPattern,
  PokemonTeamStats,
  ThreatProfile,
  ThreatEntry,
  ThreatLevel,
  UnansweredThreat,
} from "../types/team-matchup.js";
import type { MatchupHistory, MatchupSnapshot, SnapshotTeam } from "../types/matchup-history.js";

// Import shared functions from core module
import {
  round1,
  baseSpecies,
  isSandChipImmune,
  resolveWeather,
  mulberry32,
  effectiveKoN,
  calcKillPressure,
  adjustedEKoN,
  effectivePriorityKoN,
  evaluate3v3,
  selectTeam,
  validateTeamCompleteness,
  scoreCandidateByCore,
  simulateSelectionRate,
  MinHeap,
  serializeSimEnv,
  MEGA_POOL_SUFFIX,
  MIN_MOVE_COUNT,
  SELF_KO_MOVES,
  SELF_KO_PENALTY,
  SWITCH_IN_PENALTY_POKEMON,
  SWITCH_IN_PENALTY,
  CHIP_DAMAGE_ABILITIES,
  CHIP_PCT,
  WEATHER_ABILITIES,
  SAND_CHIP_PCT,
  STEALTH_ROCK_USERS,
  DEAD_SEL_THRESHOLD,
  DEAD_MEMBER_PENALTY,
  HARD_WEAK_THRESHOLD,
  ACE_THRESHOLD,
  STABLE_STREAK_MIN,
  STABLE_CORE_MIN_MEMBERS,
  CHARGE_TURN_MOVES,
  CHARGE_EXEMPT_ABILITIES,
  RECHARGE_MOVES,
  STAT_DROP_MOVES,
  THREAT_BONUS_WEIGHT,
  MEGA_OVERSATURATION_PENALTY,
  DISGUISE_ABILITY,
  buildAnswerContext,
  meetsAnswerCriteria as meetsAnswerCriteriaCore,
  buildMustAnswerSet,
} from "./team-matchup-core.js";
import type {
  DamageMatrix,
  SimEnv,
  MetaPokemon,
  MetaRepresentative,
  CoreRanking,
  PokemonCoreStats,
  AnswerContext,
} from "./team-matchup-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const STORAGE = resolve(ROOT, "home-data/storage");

/** Load pokechamdb raw data to get non-mega item preferences for synthesized builds. */
function loadNonMegaItemMap(): Map<string, string> {
  const rawPath = resolve(STORAGE, "pokechamdb/all-raw.json");
  if (!existsSync(rawPath)) return new Map();
  const allRaw: any[] = JSON.parse(readFileSync(rawPath, "utf-8"));
  const result = new Map<string, string>();
  for (const raw of allRaw) {
    const items: string[] = (raw.items ?? []).map((i: any) => i.name ?? i);
    // All mega stones in this game end in "ite" — no false positives
    const nonMega = items.find(i => !i.endsWith("ite"));
    if (nonMega) result.set(raw.name, nonMega);
  }
  return result;
}
const nonMegaItemMap = loadNonMegaItemMap();

/** Calculate effective Speed for a primary build (including Choice Scarf). */
function buildSpeed(pokemonName: string, build: { nature: string; sp: { spe: number }; isMega: boolean; item: string }): number {
  const species = getSpecies(baseSpecies(pokemonName));
  if (!species) return 0;
  const baseSpe = build.isMega && species.mega ? species.mega.baseStats.spe : species.baseStats.spe;
  const natMod = getNatureModifier(build.nature as NatureName, "spe");
  let speed = calcStat(baseSpe, build.sp.spe, natMod);
  if (build.item === "Choice Scarf") speed = Math.floor(speed * 1.5);
  return speed;
}

// ── Config ──────────────────────────────────────────────────────────────────

// Pokemon banned from team BUILDING but kept in opponent pool for evaluation.
// Palafin: default form is not Mighty, so it effectively can't enter mid-battle.
const TEAM_BUILD_BANNED = new Set(["Palafin-Hero"]);

/** Defensive build variants: separate pool entries with defensive SP spreads.
 *  Follows the same pattern as mega expansion: independent damage matrix rows. */
const DEFENSIVE_VARIANTS: {
  source: string;
  suffix: string;
  nature: string;
  item: string;
  ability: string;
  sp: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  weightMultiplier: number;
  moves?: string[];
}[] = [
  {
    source: "Garchomp",
    suffix: "-HB",
    nature: "Impish",
    item: "Leftovers",
    ability: "Rough Skin",
    sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
    weightMultiplier: 0.3,
    moves: ["Earthquake", "Dragon Claw", "Stealth Rock", "Rock Slide"],
  },
  {
    source: "Garchomp",
    suffix: "-HD",
    nature: "Careful",
    item: "Leftovers",
    ability: "Rough Skin",
    sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
    weightMultiplier: 0.25,
    moves: ["Earthquake", "Dragon Claw", "Stealth Rock", "Rock Slide"],
  },
  {
    source: "Mimikyu",
    suffix: "-HB",
    nature: "Impish",
    item: "Leftovers",
    ability: "Disguise",
    sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
    weightMultiplier: 0.2,
    moves: ["Play Rough", "Shadow Sneak", "Shadow Claw"],
  },
  {
    source: "Mimikyu",
    suffix: "-HD",
    nature: "Careful",
    item: "Leftovers",
    ability: "Disguise",
    sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
    weightMultiplier: 0.25,
    moves: ["Play Rough", "Shadow Sneak", "Shadow Claw"],
  },
];

const DEFAULT_TOTAL_TEAMS = 20_000;
const DEFAULT_GAMES_PER_TEAM = 200;
const TEAM_SIZE = 6;
const TOP_N_TEAMS = 50;

// Team generation retry limits
const MAX_TEAM_ATTEMPTS = 200;
const MAX_VALIDATION_RETRIES = 50_000;

// 3-Core Meta Evaluation
const META_REPS_COUNT = 150;
const TOP_CORES_COUNT = 200;

// Core-seeded team generation
const CORE_SEED_TOP_CORES = 100;
const CORE_SEED_TEAMS_PER_CORE = 20;
const CORE_SEED_CANDIDATE_POOL = 15;

// Iterative refinement
const DEFAULT_REFINE_ROUNDS = 8;
const REFINE_TOP_N = 300;
const REFINE_SEL_THRESHOLD = 0.15;       // hard floor: <15% = definitely replace
const REFINE_SEL_THRESHOLD_SOFT = 0.25;  // soft ceiling: 15-25% = candidate for dual swap
const REFINE_CANDIDATES_PER_SLOT = 40;
// Selection simulation gate: reject candidates whose simulated selection rate
// against meta representatives is below this threshold (ADR-002 follow-up)
const REFINE_MIN_SIM_SEL_RATE = 0.10;
// Rounds 1-5: single-member swap (<15%)
// Rounds 6-7: dual-member swap (<25%, i.e. both members in the soft zone or below)
// Round 8: single-member final polish (<15%)

// Final re-evaluation
const REEVAL_TOP_N = 200;
const REEVAL_GAMES = 1000;
const FINAL_REEVAL_TOP_N = 512;  // broader final re-eval to stabilize all potential top teams

// Post-re-eval refinement: fix members that became weak in the elite meta
const POST_REEVAL_REFINE_ROUNDS = 5;
const POST_REEVAL_TOP_N = 100;

// Anti-curve-fitting: diversity challengers mixed into elite evaluation.
// Prevents teams from over-specializing against only the elite top-N.
const DIVERSITY_CHALLENGER_COUNT = 100; // mid-ranked teams added as sparring partners

// Anti-curve-fitting: power teams for exhaustive evaluation.
// Teams composed of individually strong Pokemon, independent of evolved meta.
const POWER_TEAM_COUNT = 300;       // number of power teams to generate
const POWER_TEAM_POOL_SIZE = 50;    // top K Pokemon by overallScore

// Worker parallelism
const DEFAULT_WORKERS = Math.min(availableParallelism() - 1, 20);

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// ── Damage Matrix ───────────────────────────────────────────────────────────

function buildDamageMatrix(pool: MetaPokemon[]): {
  matrix: DamageMatrix;
  totalCalcs: number;
  bannedMoveSkips: number;
  failedCalcs: number;
} {
  const matrix: DamageMatrix = {};
  let totalCalcs = 0;
  let bannedMoveSkips = 0;
  let failedCalcs = 0;
  const poolSize = pool.length;
  const progressInterval = Math.max(1, Math.floor(poolSize / 10));

  for (const attacker of pool) {
    matrix[attacker.name] = {};
    const atkBuild = attacker.builds.reduce((best, b) => b.weight > best.weight ? b : best);

    const atkPokemon = new Pokemon({
      name: baseSpecies(attacker.name),
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
        name: baseSpecies(defender.name),
        nature: defBuild.nature as any,
        sp: defBuild.sp,
        ability: defBuild.ability,
        item: defBuild.item,
        isMega: defBuild.isMega,
      });

      const atkSpeed = buildSpeed(attacker.name, atkBuild);
      const defSpeed = buildSpeed(defender.name, defBuild);
      const pairWeather = resolveWeather(atkBuild.ability, atkSpeed, defBuild.ability, defSpeed);
      const field = pairWeather
        ? new Field({ gameType: "Singles" as any, weather: pairWeather as any })
        : new Field({ gameType: "Singles" as any });

      let bestEntry: DamageMatrixEntry | null = null;
      let bestPriorityEntry: { maxPct: number; koN: number; koChance: number } | null = null;
      let bestMoveRecoilRatio = 0;

      const defTypes = defender.types ?? [];
      const defWeatherChip = (pairWeather === "Sand" && !isSandChipImmune(defTypes, defBuild.ability))
        ? SAND_CHIP_PCT : 0;
      const defHasChip = CHIP_DAMAGE_ABILITIES.has(defBuild.ability);

      for (const moveName of attacker.moves) {
        // Skip charge-turn moves unless ability exempts (e.g. Drought → instant Solar Beam)
        if (CHARGE_TURN_MOVES.has(moveName) && !CHARGE_EXEMPT_ABILITIES.has(atkBuild.ability)) {
          bannedMoveSkips++;
          continue;
        }
        // Skip recharge moves (Hyper Beam, Giga Impact) — recharge turn not modeled
        if (RECHARGE_MOVES.has(moveName)) {
          bannedMoveSkips++;
          continue;
        }

        try {
          const move = new Move(moveName);
          const result = calculate(atkPokemon, defPokemon, move, field);
          let [minPct, maxPct] = result.percentRange();
          const ko = result.koChance();
          totalCalcs++;

          const selfKO = SELF_KO_MOVES.has(moveName);
          if (selfKO) {
            minPct *= SELF_KO_PENALTY;
            maxPct *= SELF_KO_PENALTY;
          }
          if (SWITCH_IN_PENALTY_POKEMON.has(baseSpecies(attacker.name))) {
            minPct *= SWITCH_IN_PENALTY;
            maxPct *= SWITCH_IN_PENALTY;
          }

          const contact = move.makesContact();
          const chipPct = (contact && defHasChip) ? CHIP_PCT : 0;

          if (!bestEntry || maxPct > bestEntry.maxPct) {
            bestEntry = {
              bestMove: moveName,
              minPct: round1(minPct),
              maxPct: round1(maxPct),
              koN: selfKO ? Math.max(ko.n, 2) : ko.n,
              koChance: round1(ko.chance),
              effectiveness: result.typeEffectiveness,
              isContact: contact,
              chipPctToAttacker: chipPct,
              weatherChipToDefender: defWeatherChip,
              priorityMaxPct: 0,
              priorityKoN: 0,
              priorityKoChance: 0,
              recoilPctToSelf: 0,
              isStatDrop: STAT_DROP_MOVES.has(moveName),
            };
            bestMoveRecoilRatio = move.recoil ? move.recoil[0] / move.recoil[1] : 0;
          }

          if (move.priority >= 1 && maxPct > 0 && !selfKO) {
            if (!bestPriorityEntry || maxPct > bestPriorityEntry.maxPct) {
              bestPriorityEntry = {
                maxPct: round1(maxPct),
                koN: ko.n,
                koChance: round1(ko.chance),
              };
            }
          }
        } catch {
          failedCalcs++;
        }
      }

      const entry: DamageMatrixEntry = bestEntry ?? {
        bestMove: "",
        minPct: 0,
        maxPct: 0,
        koN: 0,
        koChance: 0,
        effectiveness: 1,
        isContact: false,
        chipPctToAttacker: 0,
        weatherChipToDefender: defWeatherChip,
        priorityMaxPct: 0,
        priorityKoN: 0,
        priorityKoChance: 0,
        recoilPctToSelf: 0,
      };
      if (bestPriorityEntry) {
        entry.priorityMaxPct = bestPriorityEntry.maxPct;
        entry.priorityKoN = bestPriorityEntry.koN;
        entry.priorityKoChance = bestPriorityEntry.koChance;
      }
      if (bestMoveRecoilRatio > 0 && entry.maxPct > 0) {
        const atkHP = atkPokemon.maxHP();
        const defHP = defPokemon.maxHP();
        entry.recoilPctToSelf = round1(entry.maxPct * (defHP / atkHP) * bestMoveRecoilRatio);
      }
      matrix[attacker.name][defender.name] = entry;
    }

    const attackersDone = pool.indexOf(attacker) + 1;
    if (attackersDone % progressInterval === 0 || attackersDone === poolSize) {
      const pct = Math.round((attackersDone / poolSize) * 100);
      process.stdout.write(`  [damage matrix] ${attackersDone}/${poolSize} attackers (${pct}%, ${totalCalcs} calcs)\n`);
    }
  }

  return { matrix, totalCalcs, bannedMoveSkips, failedCalcs };
}

// ── Team Generation ─────────────────────────────────────────────────────────

function buildPrimaryItemMap(pool: MetaPokemon[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pool) {
    const best = p.builds.reduce((a, b) => b.weight > a.weight ? b : a);
    m.set(p.name, best.item);
  }
  return m;
}

function generateTeams(
  pool: MetaPokemon[],
  count: number,
  rng: () => number,
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  banned?: Set<string>,
): { teams: Team[]; validationRejects: number } {
  const teams: Team[] = [];
  let validationRejects = 0;

  const weights = pool.map((p) => 1 + 0.2 * Math.log(1 + p.usagePct));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const cumulative: number[] = [];
  let cum = 0;
  for (const w of weights) {
    cum += w / totalWeight;
    cumulative.push(cum);
  }

  for (let t = 0; t < count; t++) {
    const members: string[] = [];
    const used = new Set<number>();
    const usedItems = new Set<string>();
    const usedSpecies = new Set<string>();
    let attempts = 0;

    while (members.length < TEAM_SIZE && attempts < MAX_TEAM_ATTEMPTS) {
      attempts++;
      const r = rng();
      let idx = cumulative.findIndex((c) => r < c);
      if (idx < 0) idx = pool.length - 1;

      if (used.has(idx)) continue;
      const name = pool[idx].name;
      if (banned?.has(name)) continue;
      const item = primaryItem.get(name)!;
      const species = baseSpecies(name);

      if (usedSpecies.has(species)) continue;
      if (usedItems.has(item)) continue;

      used.add(idx);
      members.push(name);
      usedItems.add(item);
      usedSpecies.add(species);
    }

    if (members.length < TEAM_SIZE) {
      t--;
      continue;
    }

    if (!validateTeamCompleteness(members, pool, matrix)) {
      validationRejects++;
      if (validationRejects <= MAX_VALIDATION_RETRIES) {
        t--;
        continue;
      }
      console.warn(`[team-matchup] WARNING: hit validation retry limit (${MAX_VALIDATION_RETRIES}), accepting team`);
    }

    teams.push({ id: `T${String(t + 1).padStart(5, "0")}`, members });
  }

  return { teams, validationRejects };
}

/**
 * Generate teams from the highest individual-power Pokemon in the pool.
 * Used as anti-curve-fitting opponents: ensures exhaustive evaluation isn't
 * overfitting to the evolved meta. Round-robin anchoring guarantees each
 * top Pokemon appears as a core member across multiple teams.
 */
function generatePowerTeams(
  pool: MetaPokemon[],
  count: number,
  topK: number,
  rng: () => number,
  primaryItem: Map<string, string>,
  megaCapable: Set<string>,
): Team[] {
  // Sort by overallScore descending, take top K
  const ranked = pool
    .filter(p => p.singlesScores != null)
    .sort((a, b) => b.singlesScores!.overallScore - a.singlesScores!.overallScore);
  const topPool = ranked.slice(0, topK);

  if (topPool.length < TEAM_SIZE) return [];

  const teams: Team[] = [];
  const seenTeams = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 20;

  while (teams.length < count && attempts < maxAttempts) {
    attempts++;

    // Round-robin anchor: each top Pokemon takes turns as the centerpiece
    const anchor = topPool[teams.length % topPool.length];
    const members: string[] = [anchor.name];
    const usedSpecies = new Set([baseSpecies(anchor.name)]);
    const usedItems = new Set<string>();
    const anchorItem = primaryItem.get(anchor.name) ?? "";
    if (anchorItem) usedItems.add(anchorItem);
    let megaCount = megaCapable.has(anchor.name) ? 1 : 0;

    // Fill remaining slots via Fisher-Yates shuffle of topPool indices
    const indices = Array.from({ length: topPool.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (const idx of indices) {
      if (members.length >= TEAM_SIZE) break;
      const p = topPool[idx];
      if (p.name === anchor.name) continue;
      const species = baseSpecies(p.name);
      if (usedSpecies.has(species)) continue;
      const item = primaryItem.get(p.name) ?? "";
      if (item && usedItems.has(item)) continue;
      if (megaCapable.has(p.name) && megaCount >= 1) continue;

      members.push(p.name);
      usedSpecies.add(species);
      if (item) usedItems.add(item);
      if (megaCapable.has(p.name)) megaCount++;
    }

    if (members.length < TEAM_SIZE) continue;

    const teamKey = [...members].sort().join("+");
    if (seenTeams.has(teamKey)) continue;
    seenTeams.add(teamKey);

    teams.push({
      id: `P${String(teams.length).padStart(5, "0")}`,
      members,
    });
  }

  return teams;
}

// ── Worker Pool Management ──────────────────────────────────────────────────

interface WorkerPool {
  workers: Worker[];
  send: <T>(workerIdx: number, task: any) => Promise<T>;
  terminate: () => Promise<void>;
}

function createWorkerPool(
  numWorkers: number,
  matrix: DamageMatrix,
  simEnv: SimEnv,
  megaCapable: Set<string>,
): WorkerPool {
  const workerUrl = new URL("./team-matchup-worker.ts", import.meta.url);
  const serializedEnv = serializeSimEnv(simEnv);
  const megaArr = [...megaCapable];

  // Workers need tsx to resolve .ts imports. Re-use parent's tsx registration.
  // process.execArgv when running via `npx tsx` contains:
  //   ['--require', '.../tsx/dist/preflight.cjs', '--import', '.../tsx/dist/loader.mjs']
  // We extract flag+value pairs that involve tsx.
  const workerExecArgv: string[] = [];
  const parentArgs = process.execArgv;
  for (let i = 0; i < parentArgs.length; i++) {
    const flag = parentArgs[i];
    if ((flag === "--require" || flag === "--import" || flag === "--loader") && i + 1 < parentArgs.length) {
      const value = parentArgs[i + 1];
      if (value.includes("tsx")) {
        workerExecArgv.push(flag, value);
        i++; // skip value
      }
    }
  }
  // Fallback: if no tsx args found, explicitly register
  if (workerExecArgv.length === 0) {
    workerExecArgv.push("--import", "tsx");
  }

  const workers: Worker[] = [];
  for (let i = 0; i < numWorkers; i++) {
    const w = new Worker(workerUrl, {
      workerData: {
        matrix,
        simEnv: serializedEnv,
        megaCapable: megaArr,
      },
      execArgv: workerExecArgv,
    });
    workers.push(w);
  }

  function send<T>(workerIdx: number, task: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const w = workers[workerIdx];
      const onMessage = (result: T) => {
        w.removeListener("error", onError);
        resolve(result);
      };
      const onError = (err: Error) => {
        w.removeListener("message", onMessage);
        reject(err);
      };
      w.once("message", onMessage);
      w.once("error", onError);
      w.postMessage(task);
    });
  }

  async function terminate(): Promise<void> {
    await Promise.all(workers.map((w) => w.terminate()));
  }

  return { workers, send, terminate };
}

// ── Parallel Matchup Evaluation ─────────────────────────────────────────────

/** Aggregated per-pokemon selection statistics */
interface SelectionAgg {
  timesInTeam: number;
  timesSelected: number;
  winsWhenSelected: number;
  partnerCounts: Record<string, number>;
}

interface MatchupResults {
  teamWins: number[];
  teamLosses: number[];
  teamDraws: number[];
  teamScoreSum: number[];
  teamSelections: Map<number, Map<string, { count: number; wins: number }>>;
  selectionAgg: Map<string, SelectionAgg>;
}

async function runMatchupsParallel(
  pool: WorkerPool,
  teams: Team[],
  startIdx: number,
  endIdx: number,
  gamesPerTeam: number,
  baseSeed: number,
  totalTeamCount: number,
  expandedPoolNames: string[],
): Promise<MatchupResults> {
  const numWorkers = pool.workers.length;
  const rangeSize = endIdx - startIdx;
  const chunkSize = Math.ceil(rangeSize / numWorkers);

  const promises = pool.workers.map((_, i) => {
    const chunkStart = startIdx + i * chunkSize;
    const chunkEnd = Math.min(chunkStart + chunkSize, endIdx);
    if (chunkStart >= endIdx) return null;
    return pool.send<any>(i, {
      type: "matchups",
      teams,
      startIdx: chunkStart,
      endIdx: chunkEnd,
      gamesPerTeam,
      seed: baseSeed + i * 999_983, // large prime offset per worker
    });
  });

  const results = (await Promise.all(promises)).filter(Boolean);

  // Merge results
  const teamWins = new Array(totalTeamCount).fill(0);
  const teamLosses = new Array(totalTeamCount).fill(0);
  const teamDraws = new Array(totalTeamCount).fill(0);
  const teamScoreSum = new Array(totalTeamCount).fill(0);
  const teamSelections = new Map<number, Map<string, { count: number; wins: number }>>();
  const selectionAgg = new Map<string, SelectionAgg>();

  for (const r of results) {
    for (let ti = 0; ti < totalTeamCount; ti++) {
      teamWins[ti] += r.wins[ti] ?? 0;
      teamLosses[ti] += r.losses[ti] ?? 0;
      teamDraws[ti] += r.draws[ti] ?? 0;
      teamScoreSum[ti] += r.scoreSum[ti] ?? 0;
    }

    // Merge selections
    for (const [ti, entries] of r.selections as [number, [string, { count: number; wins: number }][]][]) {
      let selMap = teamSelections.get(ti);
      if (!selMap) { selMap = new Map(); teamSelections.set(ti, selMap); }
      for (const [key, val] of entries) {
        const existing = selMap.get(key) ?? { count: 0, wins: 0 };
        existing.count += val.count;
        existing.wins += val.wins;
        selMap.set(key, existing);
      }
    }

    // Merge aggregated selection stats
    for (const [name, agg] of r.selectionAgg as [string, SelectionAgg][]) {
      const existing = selectionAgg.get(name);
      if (existing) {
        existing.timesInTeam += agg.timesInTeam;
        existing.timesSelected += agg.timesSelected;
        existing.winsWhenSelected += agg.winsWhenSelected;
        for (const [partner, count] of Object.entries(agg.partnerCounts)) {
          existing.partnerCounts[partner] = (existing.partnerCounts[partner] ?? 0) + count;
        }
      } else {
        selectionAgg.set(name, { ...agg, partnerCounts: { ...agg.partnerCounts } });
      }
    }
  }

  return { teamWins, teamLosses, teamDraws, teamScoreSum, teamSelections, selectionAgg };
}

/** Extend tracking arrays when new teams are added */
function extendResults(
  results: MatchupResults,
  newCount: number,
): void {
  for (let i = 0; i < newCount; i++) {
    results.teamWins.push(0);
    results.teamLosses.push(0);
    results.teamDraws.push(0);
    results.teamScoreSum.push(0);
  }
}

/** Merge partial matchup results into the main accumulator */
function mergeIntoResults(
  main: MatchupResults,
  partial: MatchupResults,
): void {
  const len = Math.min(main.teamWins.length, partial.teamWins.length);
  for (let i = 0; i < len; i++) {
    main.teamWins[i] += partial.teamWins[i];
    main.teamLosses[i] += partial.teamLosses[i];
    main.teamDraws[i] += partial.teamDraws[i];
    main.teamScoreSum[i] += partial.teamScoreSum[i];
  }
  for (const [ti, selMap] of partial.teamSelections) {
    let mainMap = main.teamSelections.get(ti);
    if (!mainMap) { mainMap = new Map(); main.teamSelections.set(ti, mainMap); }
    for (const [key, val] of selMap) {
      const existing = mainMap.get(key) ?? { count: 0, wins: 0 };
      existing.count += val.count;
      existing.wins += val.wins;
      mainMap.set(key, existing);
    }
  }
  for (const [name, agg] of partial.selectionAgg) {
    const existing = main.selectionAgg.get(name);
    if (existing) {
      existing.timesInTeam += agg.timesInTeam;
      existing.timesSelected += agg.timesSelected;
      existing.winsWhenSelected += agg.winsWhenSelected;
      for (const [partner, count] of Object.entries(agg.partnerCounts)) {
        existing.partnerCounts[partner] = (existing.partnerCounts[partner] ?? 0) + count;
      }
    } else {
      main.selectionAgg.set(name, { ...agg, partnerCounts: { ...agg.partnerCounts } });
    }
  }
}

// ── Parallel Core Scoring ───────────────────────────────────────────────────

function extractMetaRepresentatives(
  teamSelections: Map<number, Map<string, { count: number; wins: number }>>,
  topN: number,
): MetaRepresentative[] {
  const global = new Map<string, { frequency: number; wins: number }>();
  for (const [, selMap] of teamSelections) {
    for (const [key, val] of selMap) {
      const existing = global.get(key);
      if (existing) {
        existing.frequency += val.count;
        existing.wins += val.wins;
      } else {
        global.set(key, { frequency: val.count, wins: val.wins });
      }
    }
  }

  const sorted = [...global.entries()]
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, topN);

  const totalFreq = sorted.reduce((s, e) => s + e[1].frequency, 0);

  return sorted.map(([key, val]) => ({
    members: key.split("+"),
    weight: totalFreq > 0 ? val.frequency / totalFreq : 1 / sorted.length,
    frequency: val.frequency,
    winRate: val.frequency > 0 ? val.wins / val.frequency : 0,
  }));
}

async function scoreCoresParallel(
  pool: WorkerPool,
  expandedPool: MetaPokemon[],
  megaCapable: Set<string>,
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
  topK: number,
): Promise<{ topCores: CoreRanking[]; pokemonCoreStats: PokemonCoreStats[]; totalCoresEvaluated: number }> {
  // Group pool entries by base species
  const speciesGroups = new Map<string, string[]>();
  for (const p of expandedPool) {
    const bs = baseSpecies(p.name);
    const group = speciesGroups.get(bs);
    if (group) group.push(p.name);
    else speciesGroups.set(bs, [p.name]);
  }
  const speciesKeys = [...speciesGroups.keys()].sort();
  const S = speciesKeys.length;

  const numWorkers = pool.workers.length;
  const chunkSize = Math.ceil(S / numWorkers);
  const startTime = Date.now();

  const promises = pool.workers.map((_, i) => {
    const speciesStart = i * chunkSize;
    const speciesEnd = Math.min(speciesStart + chunkSize, S);
    if (speciesStart >= S - 2) return null;
    return pool.send<any>(i, {
      type: "cores",
      speciesStart,
      speciesEnd,
      speciesKeys,
      speciesGroups: [...speciesGroups.entries()],
      metaReps,
      topK,
    });
  });

  const results = (await Promise.all(promises)).filter(Boolean);

  // Merge results
  const mergedHeap = new MinHeap<string[]>(topK);
  const mergedPokemonAcc = new Map<string, { scoreSum: number; count: number; maxScore: number }>();
  const mergedPairAcc = new Map<string, { scoreSum: number; count: number }>();
  let totalCores = 0;

  for (const r of results) {
    mergedHeap.mergeFrom(r.topItems);
    totalCores += r.totalCores;

    for (const [name, acc] of r.pokemonAcc as [string, { scoreSum: number; count: number; maxScore: number }][]) {
      const existing = mergedPokemonAcc.get(name);
      if (existing) {
        existing.scoreSum += acc.scoreSum;
        existing.count += acc.count;
        if (acc.maxScore > existing.maxScore) existing.maxScore = acc.maxScore;
      } else {
        mergedPokemonAcc.set(name, { ...acc });
      }
    }

    for (const [key, acc] of r.pairAcc as [string, { scoreSum: number; count: number }][]) {
      const existing = mergedPairAcc.get(key);
      if (existing) {
        existing.scoreSum += acc.scoreSum;
        existing.count += acc.count;
      } else {
        mergedPairAcc.set(key, { ...acc });
      }
    }
  }

  // Build top cores output
  const topCores: CoreRanking[] = mergedHeap.toSorted().map(({ score, item }) => ({
    members: item,
    score: Math.round(score * 1000) / 1000,
    winCount: 0,
    totalReps: metaReps.length,
  }));

  // Fill winCount (cheap: only ~200 × 150 = 30K calls)
  for (const core of topCores) {
    let wins = 0;
    for (const rep of metaReps) {
      const result = evaluate3v3(core.members, rep.members, matrix, simEnv);
      if (result.winner === "A") wins++;
    }
    core.winCount = wins;
  }

  // Build per-Pokemon core stats with top partners
  const pokemonCoreStats: PokemonCoreStats[] = [];
  for (const [name, acc] of mergedPokemonAcc) {
    if (acc.count === 0) continue;

    const partners: { name: string; avgScore: number; count: number }[] = [];
    for (const [pairKey, pairVal] of mergedPairAcc) {
      const [a, b] = pairKey.split("|");
      if (a === name) partners.push({ name: b, avgScore: pairVal.scoreSum / pairVal.count, count: pairVal.count });
      else if (b === name) partners.push({ name: a, avgScore: pairVal.scoreSum / pairVal.count, count: pairVal.count });
    }
    partners.sort((a, b) => b.avgScore - a.avgScore);

    pokemonCoreStats.push({
      name,
      avgCoreScore: Math.round((acc.scoreSum / acc.count) * 1000) / 1000,
      maxCoreScore: Math.round(acc.maxScore * 1000) / 1000,
      trioCount: acc.count,
      topPartners: partners.slice(0, 10).map(p => ({
        name: p.name,
        avgScore: Math.round(p.avgScore * 1000) / 1000,
        count: p.count,
      })),
    });
  }
  pokemonCoreStats.sort((a, b) => b.avgCoreScore - a.avgCoreScore);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Evaluated ${totalCores} cores in ${elapsed}s (${numWorkers} workers)`);

  return { topCores, pokemonCoreStats, totalCoresEvaluated: totalCores };
}

// ── Core-Seeded Team Generation ─────────────────────────────────────────────

/**
 * Generate teams around top cores from Phase 5.
 * For each core (3 members), fill remaining 3 slots with smart sampling.
 */
function generateCoreSeededTeams(
  topCores: CoreRanking[],
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  simEnv: SimEnv,
  megaCapable: Set<string>,
  coresCount: number,
  teamsPerCore: number,
  candidatePool: number,
  rng: () => number,
  banned?: Set<string>,
): Team[] {
  const seenTeams = new Set<string>();
  const teams: Team[] = [];
  let nextId = 1;

  const coresToUse = topCores.filter(
    c => !c.members.some(m => banned?.has(m)),
  ).slice(0, coresCount);

  for (const core of coresToUse) {
    const coreMembers = core.members;
    const coreSpecies = new Set(coreMembers.map(m => baseSpecies(m)));
    const coreItems = new Set(coreMembers.map(m => primaryItem.get(m) ?? ""));

    // Collect valid candidates for remaining 3 slots
    const candidates: { name: string; score: number }[] = [];
    for (const p of pool) {
      if (banned?.has(p.name)) continue;
      const species = baseSpecies(p.name);
      const item = primaryItem.get(p.name) ?? "";
      if (coreSpecies.has(species)) continue;
      if (coreItems.has(item)) continue;
      if (coreMembers.includes(p.name)) continue;

      // Score by core compatibility
      const score = scoreCandidateByCore(
        p.name, coreMembers, metaReps, matrix, simEnv, megaCapable,
      );
      candidates.push({ name: p.name, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, Math.max(candidatePool * 3, 30));

    // Generate multiple team variants from this core
    for (let v = 0; v < teamsPerCore; v++) {
      const selected = [...coreMembers];
      const usedSpecies = new Set(coreMembers.map(m => baseSpecies(m)));
      const usedItems = new Set(coreMembers.map(m => primaryItem.get(m) ?? ""));

      // Greedily pick 3 more from shuffled top candidates
      const shuffled = [...topCandidates];
      // Fisher-Yates partial shuffle for top candidates
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Add some randomness: pick from top-K with weighted probability
      for (const cand of shuffled) {
        if (selected.length >= TEAM_SIZE) break;
        const species = baseSpecies(cand.name);
        const item = primaryItem.get(cand.name) ?? "";
        if (usedSpecies.has(species)) continue;
        if (usedItems.has(item)) continue;

        selected.push(cand.name);
        usedSpecies.add(species);
        usedItems.add(item);
      }

      if (selected.length < TEAM_SIZE) continue;

      const teamKey = [...selected].sort().join("+");
      if (seenTeams.has(teamKey)) continue;

      if (!validateTeamCompleteness(selected, pool, matrix)) continue;

      seenTeams.add(teamKey);
      teams.push({
        id: `C${String(nextId++).padStart(5, "0")}`,
        members: selected,
      });
    }
  }

  return teams;
}

// ── Iterative Refinement ────────────────────────────────────────────────────

/** Compute per-member selection rates for a team */
function getMemberSelRates(
  team: Team,
  ti: number,
  results: MatchupResults,
): Map<string, number> {
  const totalGames = results.teamWins[ti] + results.teamLosses[ti] + results.teamDraws[ti];
  const rates = new Map<string, number>();
  if (totalGames === 0) { team.members.forEach(m => rates.set(m, 0)); return rates; }

  const selMap = results.teamSelections.get(ti);
  const counts = new Map<string, number>();
  team.members.forEach(m => counts.set(m, 0));
  if (selMap) {
    for (const [key, val] of selMap.entries()) {
      for (const name of key.split("+")) {
        counts.set(name, (counts.get(name) ?? 0) + val.count);
      }
    }
  }
  for (const m of team.members) rates.set(m, (counts.get(m) ?? 0) / totalGames);
  return rates;
}

/**
 * ADR-004b: Score a candidate by base core score + threat-directed bonus.
 * Candidates that answer unanswered threats get bonus proportional to threat usage.
 */
function scoreTargetedCandidate(
  candidateName: string,
  remaining: string[],
  unanswered: UnansweredThreat[],
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
  megaCapable: Set<string>,
): { baseScore: number; threatBonus: number; answeredCount: number; mustAnswerCount: number } {
  const baseScore = scoreCandidateByCore(candidateName, remaining, metaReps, matrix, simEnv, megaCapable);

  // Build context for post-swap team
  const postSwapMembers = [...remaining, candidateName];
  const ctx = buildAnswerContext(postSwapMembers, matrix, simEnv);

  let threatBonus = 0;
  let answeredCount = 0;
  let mustAnswerCount = 0;
  for (const threat of unanswered) {
    if (meetsAnswerCriteriaCore(candidateName, threat.opponentName, threat.oppSpeed, ctx)) {
      threatBonus += threat.usagePct;
      answeredCount++;
      if (threat.isMustAnswer) mustAnswerCount++;
    }
  }

  return { baseScore, threatBonus, answeredCount, mustAnswerCount };
}

/** Score and select top candidates for a slot replacement (ADR-004c/d) */
function selectTopCandidates(
  candidates: { name: string; members: string[]; teamKey: string }[],
  remaining: string[],
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
  megaCapable: Set<string>,
  limit: number,
  unanswered?: UnansweredThreat[],
): { name: string; members: string[]; teamKey: string }[] {
  if (metaReps.length > 0) {
    const hasMustAnswerGap = unanswered?.some(t => t.isMustAnswer) ?? false;
    const scored = candidates.map(c => {
      if (unanswered && unanswered.length > 0) {
        const { baseScore, threatBonus, answeredCount, mustAnswerCount } = scoreTargetedCandidate(
          c.name, remaining, unanswered, metaReps, matrix, simEnv, megaCapable,
        );
        return {
          ...c,
          finalScore: baseScore + THREAT_BONUS_WEIGHT * threatBonus,
          answeredCount,
          answersMustAnswer: hasMustAnswerGap && mustAnswerCount > 0,
        };
      } else {
        return {
          ...c,
          finalScore: scoreCandidateByCore(c.name, remaining, metaReps, matrix, simEnv, megaCapable),
          answeredCount: 0,
          answersMustAnswer: false,
        };
      }
    });

    // ADR-004d: mega oversaturation penalty
    const existingMegaCount = remaining.filter(m => megaCapable.has(m)).length;
    for (const c of scored) {
      if (megaCapable.has(c.name) && existingMegaCount >= 2) {
        c.finalScore *= MEGA_OVERSATURATION_PENALTY;
      }
    }

    // ADR-006: tiered sort — must-answer answerers first, then finalScore
    scored.sort((a, b) => {
      if (a.answersMustAnswer !== b.answersMustAnswer) {
        return a.answersMustAnswer ? -1 : 1;
      }
      return b.finalScore - a.finalScore || b.answeredCount - a.answeredCount;
    });
    // Selection simulation gate
    const shortlist = scored.slice(0, limit * 2);
    const gated = shortlist.filter(c => {
      const simRate = simulateSelectionRate(
        c.members, c.name, metaReps, matrix, megaCapable, simEnv.poolSpeeds,
      );
      return simRate >= REFINE_MIN_SIM_SEL_RATE;
    });
    return gated.slice(0, limit);
  }
  // No core data — random sample
  if (candidates.length <= limit) return candidates;
  for (let ci = candidates.length - 1; ci > 0; ci--) {
    const ri = Math.floor(Math.random() * (ci + 1));
    [candidates[ci], candidates[ri]] = [candidates[ri], candidates[ci]];
  }
  return candidates.slice(0, limit);
}

/**
 * Generate single-member swap refinement teams.
 * Replaces members with selectionRate < threshold.
 */
function generateSingleSwaps(
  topIndices: number[],
  teams: Team[],
  results: MatchupResults,
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  simEnv: SimEnv,
  megaCapable: Set<string>,
  seenTeams: Set<string>,
  threshold: number,
  candidatesPerSlot: number,
  nextIdRef: { value: number },
  mustAnswerSet?: Set<string>,
): Team[] {
  const refinedTeams: Team[] = [];

  for (const ti of topIndices) {
    const team = teams[ti];
    const rates = getMemberSelRates(team, ti, results);
    const weakMembers = team.members.filter(m => (rates.get(m) ?? 0) < threshold);
    if (weakMembers.length === 0) continue;

    // ADR-004c: compute threat profile once per team
    const threatProfile = computeTeamThreatProfile(team.members, pool, matrix, simEnv, mustAnswerSet);

    for (const weakMember of weakMembers) {
      const remaining = team.members.filter(m => m !== weakMember);
      const usedSpecies = new Set(remaining.map(m => baseSpecies(m)));
      const usedItems = new Set(remaining.map(m => primaryItem.get(m) ?? ""));

      const candidates: { name: string; members: string[]; teamKey: string }[] = [];
      for (const candidate of pool) {
        const cName = candidate.name;
        if (usedSpecies.has(baseSpecies(cName))) continue;
        if (usedItems.has(primaryItem.get(cName) ?? "")) continue;
        if (remaining.includes(cName)) continue;

        const newMembers = [...remaining, cName];
        const teamKey = [...newMembers].sort().join("+");
        if (seenTeams.has(teamKey)) continue;
        if (!validateTeamCompleteness(newMembers, pool, matrix)) continue;
        candidates.push({ name: cName, members: newMembers, teamKey });
      }

      const selected = selectTopCandidates(
        candidates, remaining, metaReps, matrix, simEnv, megaCapable, candidatesPerSlot,
        threatProfile.unansweredOpponents,
      );
      for (const c of selected) {
        seenTeams.add(c.teamKey);
        refinedTeams.push({ id: `R${String(nextIdRef.value++).padStart(5, "0")}`, members: c.members });
      }
    }
  }
  return refinedTeams;
}

/**
 * Score pool candidates against a partial team (remaining members).
 * Returns sorted array of { name, score } — highest score first.
 */
function scorePoolCandidates(
  remaining: string[],
  pool: MetaPokemon[],
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
  megaCapable: Set<string>,
  usedSpecies: Set<string>,
  usedItems: Set<string>,
  unanswered?: UnansweredThreat[],
): { name: string; score: number }[] {
  const hasMustAnswerGap = unanswered?.some(t => t.isMustAnswer) ?? false;
  const candidates: { name: string; score: number; answersMustAnswer: boolean }[] = [];
  for (const p of pool) {
    if (usedSpecies.has(baseSpecies(p.name))) continue;
    if (usedItems.has(primaryItem.get(p.name) ?? "")) continue;
    if (remaining.includes(p.name)) continue;
    let score: number;
    let answersMustAnswer = false;
    if (metaReps.length > 0 && unanswered && unanswered.length > 0) {
      const { baseScore, threatBonus, mustAnswerCount } = scoreTargetedCandidate(
        p.name, remaining, unanswered, metaReps, matrix, simEnv, megaCapable,
      );
      score = baseScore + THREAT_BONUS_WEIGHT * threatBonus;
      answersMustAnswer = hasMustAnswerGap && mustAnswerCount > 0;
    } else {
      score = metaReps.length > 0
        ? scoreCandidateByCore(p.name, remaining, metaReps, matrix, simEnv, megaCapable)
        : Math.random();
    }
    candidates.push({ name: p.name, score, answersMustAnswer });
  }
  // ADR-006: tiered sort — must-answer answerers first
  candidates.sort((a, b) => {
    if (a.answersMustAnswer !== b.answersMustAnswer) {
      return a.answersMustAnswer ? -1 : 1;
    }
    return b.score - a.score;
  });
  return candidates;
}

/**
 * Generate multi-member swap teams: replace N members simultaneously.
 * Uses backtracking to produce valid N-combinations from top candidates.
 */
function generateMultiMemberSwap(
  team: Team,
  weakMembers: string[],
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  simEnv: SimEnv,
  megaCapable: Set<string>,
  seenTeams: Set<string>,
  candidatesPerSlot: number,
  nextIdRef: { value: number },
  idPrefix: string,
  unanswered?: UnansweredThreat[],
): Team[] {
  const remaining = team.members.filter(m => !weakMembers.includes(m));
  const baseUsedSpecies = new Set(remaining.map(m => baseSpecies(m)));
  const baseUsedItems = new Set(remaining.map(m => primaryItem.get(m) ?? "").filter(Boolean));

  const scored = scorePoolCandidates(
    remaining, pool, primaryItem, metaReps, matrix, simEnv, megaCapable,
    baseUsedSpecies, baseUsedItems, unanswered,
  );
  const topK = scored.slice(0, candidatesPerSlot);
  if (topK.length < weakMembers.length) return [];

  const n = weakMembers.length;
  const maxTeams = candidatesPerSlot; // cap output per team
  const results: Team[] = [];

  function backtrack(startIdx: number, chosen: string[], species: Set<string>, items: Set<string>) {
    if (chosen.length === n) {
      const newMembers = [...remaining, ...chosen];
      const teamKey = [...newMembers].sort().join("+");
      if (seenTeams.has(teamKey)) return;
      if (!validateTeamCompleteness(newMembers, pool, matrix)) return;
      // Selection simulation gate: reject if any new member would never be selected
      if (metaReps.length > 0) {
        const blocked = chosen.some(c =>
          simulateSelectionRate(newMembers, c, metaReps, matrix, megaCapable, simEnv.poolSpeeds)
            < REFINE_MIN_SIM_SEL_RATE
        );
        if (blocked) return;
      }
      seenTeams.add(teamKey);
      results.push({ id: `${idPrefix}${String(nextIdRef.value++).padStart(5, "0")}`, members: newMembers });
      return;
    }
    for (let i = startIdx; i < topK.length && results.length < maxTeams; i++) {
      const c = topK[i];
      const cSpecies = baseSpecies(c.name);
      if (species.has(cSpecies)) continue;
      const cItem = primaryItem.get(c.name) ?? "";
      if (cItem && items.has(cItem)) continue;

      chosen.push(c.name);
      species.add(cSpecies);
      if (cItem) items.add(cItem);

      backtrack(i + 1, chosen, species, items);

      chosen.pop();
      species.delete(cSpecies);
      if (cItem) items.delete(cItem);
    }
  }

  backtrack(0, [], new Set(baseUsedSpecies), new Set(baseUsedItems));
  return results;
}

/**
 * Generate ALL valid teams for a stable core by exhaustively filling remaining slots.
 * Pre-scores combinations and returns only the top N candidates.
 */
function generateExhaustiveTeams(
  aceMembers: string[],
  pool: MetaPokemon[],
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
  megaCapable: Set<string>,
  topN: number,
): { team: Team; score: number }[] {
  const slotsToFill = 6 - aceMembers.length;
  if (slotsToFill <= 0) return [];

  const usedSpecies = new Set(aceMembers.map(m => baseSpecies(m)));
  const usedItems = new Set(
    aceMembers.map(m => primaryItem.get(m) ?? "").filter(Boolean),
  );

  // Collect valid candidates (species/item/self exclusion)
  const candidates: string[] = [];
  for (const p of pool) {
    if (usedSpecies.has(baseSpecies(p.name))) continue;
    const item = primaryItem.get(p.name) ?? "";
    if (item && usedItems.has(item)) continue;
    if (aceMembers.includes(p.name)) continue;
    candidates.push(p.name);
  }

  // Use MinHeap to keep top N scored teams
  const heap = new MinHeap<{ members: string[]; score: number }>(topN);
  let totalCombos = 0;
  let nextId = 0;

  if (slotsToFill === 1) {
    for (const c of candidates) {
      const newMembers = [...aceMembers, c];
      if (!validateTeamCompleteness(newMembers, pool, matrix)) continue;
      const score = scoreCandidateByCore(c, aceMembers, metaReps, matrix, simEnv, megaCapable);
      heap.push(score, { members: newMembers, score });
      totalCombos++;
    }
  } else {
    // 2 slots: try all valid pairs
    for (let i = 0; i < candidates.length - 1; i++) {
      const c1 = candidates[i];
      const c1Species = baseSpecies(c1);
      const c1Item = primaryItem.get(c1) ?? "";
      const score1 = scoreCandidateByCore(c1, aceMembers, metaReps, matrix, simEnv, megaCapable);

      for (let j = i + 1; j < candidates.length; j++) {
        const c2 = candidates[j];
        if (baseSpecies(c2) === c1Species) continue;
        const c2Item = primaryItem.get(c2) ?? "";
        if (c1Item && c2Item && c1Item === c2Item) continue;

        const newMembers = [...aceMembers, c1, c2];
        if (!validateTeamCompleteness(newMembers, pool, matrix)) continue;

        const score2 = scoreCandidateByCore(c2, aceMembers, metaReps, matrix, simEnv, megaCapable);
        // Also score c2 with c1 in context for synergy signal
        const synergy = scoreCandidateByCore(c2, [...aceMembers, c1], metaReps, matrix, simEnv, megaCapable);
        const score = score1 + score2 + synergy * 0.3;
        heap.push(score, { members: newMembers, score });
        totalCombos++;
      }
    }
  }

  const results = heap.toSorted();
  console.log(`    Exhaustive: ${totalCombos} valid combos → top ${results.length}`);

  return results.map(r => ({
    team: { id: `X${String(nextId++).padStart(5, "0")}`, members: r.item.members },
    score: r.score,
  }));
}

/**
 * Tiered swap refinement:
 * - Tier 1: ALL <10% members replaced simultaneously (multi-member swap)
 * - Tier 2: ONE 10-15% member replaced (single swap, weakest first)
 */
function generateTieredSwaps(
  topIndices: number[],
  teams: Team[],
  results: MatchupResults,
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  simEnv: SimEnv,
  megaCapable: Set<string>,
  seenTeams: Set<string>,
  candidatesPerSlot: number,
  nextIdRef: { value: number },
  mustAnswerSet?: Set<string>,
): Team[] {
  const refinedTeams: Team[] = [];

  for (const ti of topIndices) {
    const team = teams[ti];
    const rates = getMemberSelRates(team, ti, results);

    // ADR-004c: compute threat profile once per team
    const threatProfile = computeTeamThreatProfile(team.members, pool, matrix, simEnv, mustAnswerSet);

    // Tier 1: ALL <10% replaced simultaneously
    const hardWeak = team.members.filter(m => (rates.get(m) ?? 0) < HARD_WEAK_THRESHOLD);
    if (hardWeak.length > 0) {
      if (hardWeak.length === 1) {
        // Single swap for the one <10% member
        const weakMember = hardWeak[0];
        const remaining = team.members.filter(m => m !== weakMember);
        const usedSpecies = new Set(remaining.map(m => baseSpecies(m)));
        const usedItems = new Set(remaining.map(m => primaryItem.get(m) ?? ""));
        const candidates: { name: string; members: string[]; teamKey: string }[] = [];
        for (const candidate of pool) {
          const cName = candidate.name;
          if (usedSpecies.has(baseSpecies(cName))) continue;
          if (usedItems.has(primaryItem.get(cName) ?? "")) continue;
          if (remaining.includes(cName)) continue;
          const newMembers = [...remaining, cName];
          const teamKey = [...newMembers].sort().join("+");
          if (seenTeams.has(teamKey)) continue;
          if (!validateTeamCompleteness(newMembers, pool, matrix)) continue;
          candidates.push({ name: cName, members: newMembers, teamKey });
        }
        const selected = selectTopCandidates(
          candidates, remaining, metaReps, matrix, simEnv, megaCapable, candidatesPerSlot,
          threatProfile.unansweredOpponents,
        );
        for (const c of selected) {
          seenTeams.add(c.teamKey);
          refinedTeams.push({ id: `M${String(nextIdRef.value++).padStart(5, "0")}`, members: c.members });
        }
      } else {
        // Multi-member swap: replace all <10% at once
        const swaps = generateMultiMemberSwap(
          team, hardWeak, pool, matrix, primaryItem,
          metaReps, simEnv, megaCapable, seenTeams,
          candidatesPerSlot, nextIdRef, "M",
          threatProfile.unansweredOpponents,
        );
        for (const s of swaps) refinedTeams.push(s);
      }
    }

    // Tier 2: ONE member in 10-15% range (the weakest)
    const softWeak = team.members.filter(m => {
      const r = rates.get(m) ?? 0;
      return r >= HARD_WEAK_THRESHOLD && r < REFINE_SEL_THRESHOLD;
    });
    if (softWeak.length > 0) {
      softWeak.sort((a, b) => (rates.get(a) ?? 0) - (rates.get(b) ?? 0));
      const weakest = softWeak[0];
      const remaining = team.members.filter(m => m !== weakest);
      const usedSpecies = new Set(remaining.map(m => baseSpecies(m)));
      const usedItems = new Set(remaining.map(m => primaryItem.get(m) ?? ""));
      const candidates: { name: string; members: string[]; teamKey: string }[] = [];
      for (const candidate of pool) {
        const cName = candidate.name;
        if (usedSpecies.has(baseSpecies(cName))) continue;
        if (usedItems.has(primaryItem.get(cName) ?? "")) continue;
        if (remaining.includes(cName)) continue;
        const newMembers = [...remaining, cName];
        const teamKey = [...newMembers].sort().join("+");
        if (seenTeams.has(teamKey)) continue;
        if (!validateTeamCompleteness(newMembers, pool, matrix)) continue;
        candidates.push({ name: cName, members: newMembers, teamKey });
      }
      const selected = selectTopCandidates(
        candidates, remaining, metaReps, matrix, simEnv, megaCapable, candidatesPerSlot,
        threatProfile.unansweredOpponents,
      );
      for (const c of selected) {
        seenTeams.add(c.teamKey);
        refinedTeams.push({ id: `R${String(nextIdRef.value++).padStart(5, "0")}`, members: c.members });
      }
    }
  }
  return refinedTeams;
}

/**
 * Generate dual-member swap refinement teams.
 * For top teams, replace pairs of members both below softThreshold (<25%).
 * Uses a tighter topN (100) since combinatorially more expensive.
 */
function generateDualSwaps(
  topIndices: number[],
  teams: Team[],
  results: MatchupResults,
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  simEnv: SimEnv,
  megaCapable: Set<string>,
  seenTeams: Set<string>,
  softThreshold: number,
  candidatesPerSlot: number,
  nextIdRef: { value: number },
  mustAnswerSet?: Set<string>,
): Team[] {
  const refinedTeams: Team[] = [];
  const dualIndices = topIndices.slice(0, 100);

  for (const ti of dualIndices) {
    const team = teams[ti];
    const rates = getMemberSelRates(team, ti, results);

    // Find members below soft threshold (<25%)
    const softWeak = team.members.filter(m => (rates.get(m) ?? 0) < softThreshold);
    if (softWeak.length < 2) continue;

    // ADR-004c: compute threat profile once per team
    const threatProfile = computeTeamThreatProfile(team.members, pool, matrix, simEnv, mustAnswerSet);
    const unanswered = threatProfile.unansweredOpponents;

    // Try all pairs of weak members
    for (let a = 0; a < softWeak.length - 1; a++) {
      for (let b = a + 1; b < softWeak.length; b++) {
        const removed = new Set([softWeak[a], softWeak[b]]);
        const remaining = team.members.filter(m => !removed.has(m));
        const usedSpecies = new Set(remaining.map(m => baseSpecies(m)));
        const usedItems = new Set(remaining.map(m => primaryItem.get(m) ?? ""));

        // Collect candidate replacements for the 2 open slots
        const slotCandidates: MetaPokemon[] = [];
        for (const candidate of pool) {
          const cName = candidate.name;
          if (usedSpecies.has(baseSpecies(cName))) continue;
          if (usedItems.has(primaryItem.get(cName) ?? "")) continue;
          if (remaining.includes(cName)) continue;
          slotCandidates.push(candidate);
        }

        // Score each candidate individually, take top N
        const hasMustAnswerGap = unanswered.some(t => t.isMustAnswer);
        let rankedCandidates: { name: string; score: number; answersMustAnswer: boolean }[];
        if (metaReps.length > 0) {
          // ADR-004c: use threat-directed scoring
          const existingMegaCount = remaining.filter(m => megaCapable.has(m)).length;
          rankedCandidates = slotCandidates.map(c => {
            let score: number;
            let answersMustAnswer = false;
            if (unanswered.length > 0) {
              const { baseScore, threatBonus, mustAnswerCount } = scoreTargetedCandidate(
                c.name, remaining, unanswered, metaReps, matrix, simEnv, megaCapable,
              );
              score = baseScore + THREAT_BONUS_WEIGHT * threatBonus;
              answersMustAnswer = hasMustAnswerGap && mustAnswerCount > 0;
            } else {
              score = scoreCandidateByCore(c.name, remaining, metaReps, matrix, simEnv, megaCapable);
            }
            // ADR-004d: mega oversaturation penalty
            if (megaCapable.has(c.name) && existingMegaCount >= 2) {
              score *= MEGA_OVERSATURATION_PENALTY;
            }
            return { name: c.name, score, answersMustAnswer };
          });
          // ADR-006: tiered sort — must-answer answerers first
          rankedCandidates.sort((a, b) => {
            if (a.answersMustAnswer !== b.answersMustAnswer) {
              return a.answersMustAnswer ? -1 : 1;
            }
            return b.score - a.score;
          });
        } else {
          rankedCandidates = slotCandidates.map(c => ({ name: c.name, score: 0 }));
          for (let ci = rankedCandidates.length - 1; ci > 0; ci--) {
            const ri = Math.floor(Math.random() * (ci + 1));
            [rankedCandidates[ci], rankedCandidates[ri]] = [rankedCandidates[ri], rankedCandidates[ci]];
          }
        }

        // Take top candidates and form pairs
        const topPool = rankedCandidates.slice(0, candidatesPerSlot);
        let pairsGenerated = 0;
        const maxPairsPerRemoval = candidatesPerSlot;

        for (let ci = 0; ci < topPool.length - 1 && pairsGenerated < maxPairsPerRemoval; ci++) {
          const c1 = topPool[ci];
          const c1Species = baseSpecies(c1.name);
          const c1Item = primaryItem.get(c1.name) ?? "";
          for (let cj = ci + 1; cj < topPool.length && pairsGenerated < maxPairsPerRemoval; cj++) {
            const c2 = topPool[cj];
            if (baseSpecies(c2.name) === c1Species) continue;
            if ((primaryItem.get(c2.name) ?? "") === c1Item && c1Item !== "") continue;

            const newMembers = [...remaining, c1.name, c2.name];
            const teamKey = [...newMembers].sort().join("+");
            if (seenTeams.has(teamKey)) continue;
            if (!validateTeamCompleteness(newMembers, pool, matrix)) continue;
            // Selection simulation gate: reject if any new member would never be selected
            if (metaReps.length > 0) {
              const blocked = [c1.name, c2.name].some(c =>
                simulateSelectionRate(newMembers, c, metaReps, matrix, megaCapable, simEnv.poolSpeeds)
                  < REFINE_MIN_SIM_SEL_RATE
              );
              if (blocked) continue;
            }

            seenTeams.add(teamKey);
            refinedTeams.push({ id: `D${String(nextIdRef.value++).padStart(5, "0")}`, members: newMembers });
            pairsGenerated++;
          }
        }
      }
    }
  }
  return refinedTeams;
}

/** Update ace streak tracker after a round. */
function updateStreaks(
  streaks: Map<number, Map<string, number>>,
  topIndices: number[],
  teams: Team[],
  results: MatchupResults,
): void {
  const newActiveSet = new Set(topIndices);
  // Reset streaks for teams that dropped out of top N
  for (const ti of streaks.keys()) {
    if (!newActiveSet.has(ti)) streaks.delete(ti);
  }
  for (const ti of topIndices) {
    const rates = getMemberSelRates(teams[ti], ti, results);
    let memberStreaks = streaks.get(ti);
    if (!memberStreaks) { memberStreaks = new Map(); streaks.set(ti, memberStreaks); }
    for (const m of teams[ti].members) {
      if ((rates.get(m) ?? 0) >= ACE_THRESHOLD) {
        memberStreaks.set(m, (memberStreaks.get(m) ?? 0) + 1);
      } else {
        memberStreaks.set(m, 0);
      }
    }
  }
}

/**
 * Multi-round iterative refinement with phased strategy:
 * - Rounds 1-5: tiered swap (<10% all-replace + 10-15% one-replace)
 * - Rounds 6-7: dual-member swap (threshold < 25%, top 100 teams)
 * - Round 8: tiered swap final polish
 *
 * Tracks ace streaks (≥30% selection rate) across rounds.
 */
async function iterativeRefinement(
  teams: Team[],
  results: MatchupResults,
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  primaryItem: Map<string, string>,
  metaReps: MetaRepresentative[],
  simEnv: SimEnv,
  megaCapable: Set<string>,
  workerPool: WorkerPool,
  expandedPoolNames: string[],
  config: {
    rounds: number;
    topN: number;
    selThreshold: number;
    selThresholdSoft: number;
    candidatesPerSlot: number;
    gamesPerTeam: number;
    baseSeed: number;
  },
  streaks: Map<number, Map<string, number>>,
  mustAnswerSet?: Set<string>,
): Promise<{ totalRefined: number; totalMatchups: number }> {
  let totalRefined = 0;
  let totalMatchups = 0;
  const seenTeams = new Set<string>();
  for (const t of teams) seenTeams.add([...t.members].sort().join("+"));
  const nextIdRef = { value: teams.length + 1 };

  for (let round = 0; round < config.rounds; round++) {
    const roundStart = Date.now();

    // 1. Rank teams by win rate
    const indices = teams.map((_, i) => i);
    indices.sort((a, b) => {
      const gamesA = results.teamWins[a] + results.teamLosses[a] + results.teamDraws[a];
      const gamesB = results.teamWins[b] + results.teamLosses[b] + results.teamDraws[b];
      const wrA = gamesA > 0 ? results.teamWins[a] / gamesA : 0;
      const wrB = gamesB > 0 ? results.teamWins[b] / gamesB : 0;
      return wrB - wrA;
    });

    const topIndices = indices.slice(0, config.topN);

    // Update ace streaks before generating swaps
    updateStreaks(streaks, topIndices, teams, results);

    // 2. Generate refined teams — mode depends on round
    //    R1-5 (idx 0-4): tiered swap (<10% all + 10-15% one)
    //    R6-7 (idx 5-6): dual-swap, threshold <25%
    //    R8   (idx 7):   tiered swap final polish
    const isDualRound = round >= 5 && round <= 6;
    let refinedTeams: Team[];

    if (isDualRound) {
      refinedTeams = generateDualSwaps(
        topIndices, teams, results, pool, matrix, primaryItem,
        metaReps, simEnv, megaCapable, seenTeams,
        config.selThresholdSoft, config.candidatesPerSlot, nextIdRef,
        mustAnswerSet,
      );
    } else {
      refinedTeams = generateTieredSwaps(
        topIndices, teams, results, pool, matrix, primaryItem,
        metaReps, simEnv, megaCapable, seenTeams,
        config.candidatesPerSlot, nextIdRef,
        mustAnswerSet,
      );
    }

    const mode = isDualRound ? "dual-swap" : "tiered";

    if (refinedTeams.length === 0) {
      console.log(`  Round ${round + 1} (${mode}): no candidates (converged)`);
      continue; // try next round's mode
    }

    // 3. Append and evaluate
    const oldLen = teams.length;
    for (const rt of refinedTeams) teams.push(rt);
    extendResults(results, refinedTeams.length);

    const partial = await runMatchupsParallel(
      workerPool, teams, oldLen, teams.length,
      config.gamesPerTeam, config.baseSeed + (round + 1) * 7_919,
      teams.length, expandedPoolNames,
    );
    mergeIntoResults(results, partial);

    totalRefined += refinedTeams.length;
    totalMatchups += refinedTeams.length * config.gamesPerTeam;

    const elapsed = ((Date.now() - roundStart) / 1000).toFixed(1);
    console.log(
      `  Round ${round + 1} (${mode}): +${refinedTeams.length} teams, ` +
      `${refinedTeams.length * config.gamesPerTeam} matchups (${elapsed}s)`
    );
  }

  // Final streak update after last round
  {
    const indices = teams.map((_, i) => i);
    indices.sort((a, b) => {
      const gA = results.teamWins[a] + results.teamLosses[a] + results.teamDraws[a];
      const gB = results.teamWins[b] + results.teamLosses[b] + results.teamDraws[b];
      return (gB > 0 ? results.teamWins[b] / gB : 0) - (gA > 0 ? results.teamWins[a] / gA : 0);
    });
    updateStreaks(streaks, indices.slice(0, config.topN), teams, results);
  }

  return { totalRefined, totalMatchups };
}

// ── Threat Analysis ─────────────────────────────────────────────────────────

function classifyThreatLevel(
  ourBestEKoN: number,
  theirBestEKoN: number,
  speed: "faster" | "slower" | "tie",
): ThreatLevel {
  if (ourBestEKoN >= 3 && theirBestEKoN <= 2) return "critical";
  if (ourBestEKoN >= 3 || (theirBestEKoN <= 2 && speed === "slower")) return "high";
  if (ourBestEKoN <= 2.5) return "medium";
  return "low";
}

function computeTeamThreatProfile(
  members: string[],
  pool: MetaPokemon[],
  matrix: DamageMatrix,
  env: SimEnv,
  mustAnswerSet?: Set<string>,
): ThreatProfile {
  const teamSet = new Set(members);
  const opponents = pool.filter((p) => !teamSet.has(p.name));

  const megaMembers = new Set<string>();
  for (const m of members) {
    const meta = pool.find((p) => p.name === m);
    if (meta?.builds.some((b) => b.isMega)) megaMembers.add(m);
  }
  const hasMegaConstraint = megaMembers.size >= 2;

  // ADR-004a: use independent meetsAnswerCriteria via AnswerContext
  const ctx = buildAnswerContext(members, matrix, env);

  function oppChipFor(oppName: string): number {
    let chip = 0;
    if (ctx.teamHasSand && !env.sandChipImmune.has(oppName)) chip += SAND_CHIP_PCT;
    if (ctx.teamHasSR) chip += env.srChipPct.get(oppName) ?? 0;
    return chip;
  }

  const opponentsByUsage = [...opponents].sort((a, b) => b.usagePct - a.usagePct);
  const top10UsageNames = new Set(opponentsByUsage.slice(0, 10).map((p) => p.name));

  let killPressureSum = 0;
  let threatPenaltySum = 0;
  let answeredUsageSum = 0;
  let totalUsageSum = 0;
  let answeredCount = 0;
  let unansweredCount = 0;
  let criticalGaps = 0;
  let criticalThreats = 0;
  let highThreats = 0;
  const entries: ThreatEntry[] = [];
  const unansweredList: UnansweredThreat[] = [];
  let dangerousAttackerCount = 0;
  let dangerousAttackerUncovered = 0;

  const megaExclusiveAnswers = new Map<string, number>();
  const megaExclusiveKills = new Map<string, number>();

  // meetsAnswerCriteria is now imported from team-matchup-core (ADR-004a)

  for (const opp of opponents) {
    const oppSpeed = opp.singlesScores?.speedStat ?? 0;

    const oppVirtualChip = oppChipFor(opp.name);

    let ourBestEKoN = 99;
    let ourBestMember = "";
    let nonMegaBestEKoN = 99;
    for (const me of members) {
      const entry = matrix[me]?.[opp.name];
      if (!entry) continue;
      const eKoN = adjustedEKoN(entry, oppVirtualChip);
      if (eKoN < ourBestEKoN) {
        ourBestEKoN = eKoN;
        ourBestMember = me;
      }
      if (!megaMembers.has(me) && eKoN < nonMegaBestEKoN) nonMegaBestEKoN = eKoN;
    }

    let theirBestEKoN = 99;
    let theirBestTarget = "";
    const oppWeather = env.weatherUsers.get(opp.name);
    for (const me of members) {
      const entry = matrix[opp.name]?.[me];
      if (!entry) continue;
      let meChip = 0;
      if (oppWeather === "Sand" && !env.sandChipImmune.has(me)) meChip += SAND_CHIP_PCT;
      const eKoN = adjustedEKoN(entry, meChip);
      if (eKoN < theirBestEKoN) {
        theirBestEKoN = eKoN;
        theirBestTarget = me;
      }
    }

    const ourFastestRelevant = Math.max(...members.map((m) => ctx.poolSpeeds.get(m) ?? 0));
    const speed: "faster" | "slower" | "tie" =
      ourFastestRelevant > oppSpeed ? "faster" :
      ourFastestRelevant < oppSpeed ? "slower" : "tie";

    const threatLevel = classifyThreatLevel(ourBestEKoN, theirBestEKoN, speed);

    const kp = calcKillPressure(ourBestEKoN);
    killPressureSum += kp;

    if (hasMegaConstraint && megaMembers.has(ourBestMember) && kp > 0) {
      const nonMegaKp = calcKillPressure(nonMegaBestEKoN);
      const lostPoints = kp - nonMegaKp;
      if (lostPoints > 0) {
        megaExclusiveKills.set(ourBestMember, (megaExclusiveKills.get(ourBestMember) ?? 0) + lostPoints);
      }
    }

    const penaltyMap: Record<ThreatLevel, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    threatPenaltySum += penaltyMap[threatLevel];
    if (threatLevel === "critical") criticalThreats++;
    if (threatLevel === "high") highThreats++;

    let hasAnswer = false;
    let answerIsNonMega = false;
    let answeringMega: string | null = null;

    for (const me of members) {
      if (megaMembers.has(me)) continue;
      if (meetsAnswerCriteriaCore(me, opp.name, oppSpeed, ctx)) {
        hasAnswer = true;
        answerIsNonMega = true;
        break;
      }
    }

    if (!hasAnswer) {
      for (const me of members) {
        if (!megaMembers.has(me)) continue;
        if (meetsAnswerCriteriaCore(me, opp.name, oppSpeed, ctx)) {
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
      // ADR-004b: collect unanswered threats
      unansweredList.push({
        opponentName: opp.name,
        oppSpeed,
        usagePct: opp.usagePct,
        isMustAnswer: mustAnswerSet?.has(opp.name) ?? false,
      });
    }

    // ADR-005b: wide-hit dangerous attacker detection
    let wideHitCount = 0;
    for (const me of members) {
      const entry = matrix[opp.name]?.[me];
      if (entry && entry.maxPct >= 50) wideHitCount++;
    }
    if (wideHitCount >= 3) {
      dangerousAttackerCount++;
      if (!hasAnswer) dangerousAttackerUncovered++;
    }

    if (hasMegaConstraint && hasAnswer && !answerIsNonMega && answeringMega) {
      megaExclusiveAnswers.set(answeringMega, (megaExclusiveAnswers.get(answeringMega) ?? 0) + 1);
    }

    entries.push({
      opponent: opp.name,
      usagePct: oppUsage,
      threatLevel,
      ourBestKoN: ourBestEKoN >= 99 ? 0 : Math.round(ourBestEKoN * 10) / 10,
      ourBestMember,
      theirBestKoN: theirBestEKoN >= 99 ? 0 : Math.round(theirBestEKoN * 10) / 10,
      theirBestTarget,
      hasAnswer,
    });
  }

  // Mega contention adjustment
  let megaContestedAnswers = 0;
  if (hasMegaConstraint && megaExclusiveAnswers.size >= 2) {
    const counts = [...megaExclusiveAnswers.values()].sort((a, b) => a - b);
    megaContestedAnswers = counts[0];
    answeredCount = Math.max(0, answeredCount - megaContestedAnswers);
    const avgUsage = totalUsageSum / (opponents.length || 1);
    answeredUsageSum = Math.max(0, answeredUsageSum - megaContestedAnswers * avgUsage);
  }

  if (hasMegaConstraint && megaExclusiveKills.size >= 2) {
    const points = [...megaExclusiveKills.values()].sort((a, b) => a - b);
    killPressureSum = Math.max(0, killPressureSum - points[0]);
  }

  const oppCount = opponents.length || 1;
  const maxKillPressure = 3 * oppCount;
  const maxThreatPenalty = 3 * oppCount;

  const killPressure = Math.round((killPressureSum / maxKillPressure) * 100);
  const threatResistance = Math.round((1 - threatPenaltySum / maxThreatPenalty) * 100);
  const answerRate = totalUsageSum > 0
    ? Math.round((answeredUsageSum / totalUsageSum) * 100)
    : Math.round((answeredCount / oppCount) * 100);

  let dominanceScore = Math.round(
    0.30 * killPressure + 0.30 * threatResistance + 0.40 * answerRate,
  );

  if (criticalGaps > 0) {
    dominanceScore = Math.round(dominanceScore * Math.pow(0.85, criticalGaps));
  }

  const topThreats = entries
    .filter((e) => e.threatLevel === "critical" || e.threatLevel === "high" || !e.hasAnswer)
    .sort((a, b) => {
      if (!a.hasAnswer && b.hasAnswer) return -1;
      if (a.hasAnswer && !b.hasAnswer) return 1;
      const usageDiff = b.usagePct - a.usagePct;
      if (Math.abs(usageDiff) > 0.001) return usageDiff;
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
    unansweredOpponents: unansweredList,
    dangerousAttackerCount,
    dangerousAttackerUncovered,
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

  const weakCounts: Record<string, number> = {};
  for (const atkType of ALL_TYPES) weakCounts[atkType] = 0;

  for (const name of members) {
    try {
      const species = getSpecies(baseSpecies(name));
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

  return ALL_TYPES.filter((t) => weakCounts[t] >= 3).sort();
}

// ── Pokemon Statistics ──────────────────────────────────────────────────────

function computePokemonStats(
  topTeams: RankedTeam[],
  allTeams: Team[],
  selectionAgg: Map<string, SelectionAgg>,
): PokemonTeamStats[] {
  const poolNames = new Set<string>();
  for (const team of topTeams) for (const m of team.members) poolNames.add(m);

  const stats: PokemonTeamStats[] = [];

  for (const name of poolNames) {
    const inTopTeams = topTeams.filter((t) => t.members.includes(name)).length;
    const pickRate = inTopTeams / topTeams.length;

    const agg = selectionAgg.get(name);
    const selectionRate = agg && agg.timesInTeam > 0 ? agg.timesSelected / agg.timesInTeam : 0;
    const winRateWhenSelected = agg && agg.timesSelected > 0 ? agg.winsWhenSelected / agg.timesSelected : 0;

    const commonPartners = agg
      ? Object.entries(agg.partnerCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([pName, count]) => ({ name: pName, count }))
      : [];

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

async function main(seedOverride?: number) {
  const args = process.argv;
  const dateArg = getArg(args, "--date") ?? "2026-04-10";
  const totalTeams = parseInt(getArg(args, "--teams") ?? String(DEFAULT_TOTAL_TEAMS));
  const gamesPerTeam = parseInt(getArg(args, "--games") ?? String(DEFAULT_GAMES_PER_TEAM));
  const seed = seedOverride ?? parseInt(getArg(args, "--seed") ?? "42");
  const numWorkers = Math.max(1, parseInt(getArg(args, "--workers") ?? String(DEFAULT_WORKERS)));
  const refineRounds = parseInt(getArg(args, "--refine-rounds") ?? String(DEFAULT_REFINE_ROUNDS));
  const skipCores = args.includes("--skip-cores");
  const rng = mulberry32(seed);

  console.log(`[team-matchup] Starting (evolutionary pipeline)...`);
  console.log(`  Date: ${dateArg}, Teams: ${totalTeams}, Games/team: ${gamesPerTeam}, Seed: ${seed}`);
  console.log(`  Workers: ${numWorkers}, Refine rounds: ${refineRounds}`);

  const pipelineStart = Date.now();

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
    const builds = (rp.builds as any[]).map((b: any) => b.config);
    const moves: string[] = rp.builds[0]?.moves ?? [];
    if (builds.length === 0 || moves.length === 0) continue;
    if (moves.length < MIN_MOVE_COUNT) continue;
    if (!getSpecies(rp.name)) continue;

    allMeta.push({
      name: rp.name,
      usagePct: rp.usagePct,
      usageRank: rp.usageRank,
      builds,
      moves,
      types: getSpecies(rp.name)?.types ?? [],
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
  console.log(`[1/13] Pool: ${allMeta.length} Pokemon (${poolFiltered} filtered: <${MIN_MOVE_COUNT} moves)`);

  // ─── Phase 1b: Split mega-capable Pokemon ─────────────────────────────

  const expandedPool: MetaPokemon[] = [];
  let synthesizedCount = 0;

  for (const mp of allMeta) {
    const megaBuilds = mp.builds.filter((b) => b.isMega);
    const nonMegaBuilds = mp.builds.filter((b) => !b.isMega);

    if (megaBuilds.length > 0) {
      expandedPool.push({ ...mp, name: mp.name + MEGA_POOL_SUFFIX, builds: megaBuilds });

      if (nonMegaBuilds.length > 0) {
        expandedPool.push({ ...mp, builds: nonMegaBuilds });
      } else {
        const bestMega = megaBuilds.reduce((a, b) => (a.weight > b.weight ? a : b));
        const species = getSpecies(mp.name);
        // Use pokechamdb's top non-mega item; fallback to Leftovers
        const item = nonMegaItemMap.get(mp.name) ?? "Leftovers";
        const abilities = species?.abilities ?? [];
        const baseAbility = abilities[abilities.length - 1] ?? bestMega.ability;
        expandedPool.push({
          ...mp,
          builds: [{
            ...bestMega,
            isMega: false,
            item,
            ability: baseAbility,
            weight: bestMega.weight * 0.7,
          }],
        });
        synthesizedCount++;
      }
    } else {
      expandedPool.push(mp);
    }
  }

  const megaEntries = expandedPool.filter((p) => p.name.endsWith(MEGA_POOL_SUFFIX)).length;
  console.log(`  Mega split: ${megaEntries} mega entries, ${synthesizedCount} synthesized non-mega builds`);

  // ─── Phase 1c: Defensive build variants ────────────────────────────
  let defVariantCount = 0;
  for (const variant of DEFENSIVE_VARIANTS) {
    const sourceEntry = expandedPool.find(p => p.name === variant.source);
    if (!sourceEntry) {
      console.warn(`  [1/13] Defensive variant: source "${variant.source}" not found, skipping`);
      continue;
    }
    const sourceBuild = sourceEntry.builds.reduce((a, b) => a.weight > b.weight ? a : b);
    const variantName = variant.source + variant.suffix;
    const species = getSpecies(variant.source);
    // Defensive builds have no speed investment: use base speed stat only
    const baseSpe = species?.baseStats?.spe ?? 80;

    expandedPool.push({
      ...sourceEntry,
      name: variantName,
      builds: [{
        nature: variant.nature,
        item: variant.item,
        ability: variant.ability,
        isMega: false,
        spPattern: variant.sp.def > variant.sp.spd ? "hbWall" : "hdWall",
        sp: variant.sp,
        weight: sourceBuild.weight * variant.weightMultiplier,
      }],
      moves: variant.moves ?? sourceEntry.moves,
      singlesScores: sourceEntry.singlesScores ? {
        ...sourceEntry.singlesScores,
        speedStat: baseSpe,
        speedTier: "slow" as const,
        speedAdvantage: 0,
      } : undefined,
    });
    defVariantCount++;
  }
  if (defVariantCount > 0) {
    console.log(`  Defensive variants: ${defVariantCount} entries added`);
  }

  // ─── Phase 1d: Auto-generate opposite defensive variants ──────────
  // For every pool member with an HB or HD build that doesn't already have
  // the opposite variant, synthesize one automatically.
  const HB_SP = { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 };
  const HD_SP = { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 };
  const HB_NATURES_PHYS = ["Impish", "Relaxed"]; // physical defensive natures
  const HB_NATURES_SPEC = ["Bold"];               // special defensive natures (still HB spread)
  const HD_NATURES_PHYS = ["Careful", "Sassy"];   // physical HD natures
  const HD_NATURES_SPEC = ["Calm"];               // special HD natures

  const existingNames = new Set(expandedPool.map(p => p.name));
  const autoVariants: typeof expandedPool = [];

  for (const mp of expandedPool) {
    // Skip megas and already-synthesized variants
    if (mp.name.endsWith(MEGA_POOL_SUFFIX)) continue;
    if (mp.name.endsWith("-HB") || mp.name.endsWith("-HD")) continue;

    const build = mp.builds.reduce((a, b) => a.weight > b.weight ? a : b);
    const sp = build.sp;
    const isHB = sp.hp >= 16 && sp.def >= 16 && sp.atk <= 4 && sp.spe <= 4;
    const isHD = sp.hp >= 16 && sp.spd >= 16 && sp.atk <= 4 && sp.spe <= 4;
    if (!isHB && !isHD) continue;

    // Determine which opposite variant to create
    const oppSuffix = isHB ? "-HD" : "-HB";
    const oppName = mp.name + oppSuffix;
    if (existingNames.has(oppName)) continue;

    const oppSP = isHB ? HD_SP : HB_SP;
    // Pick appropriate nature: mirror the physical/special category
    const isPhysNature = [...HB_NATURES_PHYS, ...HD_NATURES_PHYS].includes(build.nature);
    let oppNature: string;
    if (isHB) {
      // HB→HD: Impish→Careful, Bold→Calm, Relaxed→Sassy
      oppNature = isPhysNature ? "Careful" : "Calm";
      if (build.nature === "Relaxed") oppNature = "Sassy";
    } else {
      // HD→HB: Careful→Impish, Calm→Bold, Sassy→Relaxed
      oppNature = isPhysNature ? "Impish" : "Bold";
      if (build.nature === "Sassy") oppNature = "Relaxed";
    }

    const species = getSpecies(baseSpecies(mp.name));
    const baseSpe = species?.baseStats?.spe ?? 80;

    autoVariants.push({
      ...mp,
      name: oppName,
      builds: [{
        ...build,
        nature: oppNature,
        spPattern: oppSuffix === "-HB" ? "hbWall" : "hdWall",
        sp: oppSP,
        weight: build.weight * 0.5, // lower weight than the original defensive build
      }],
      singlesScores: mp.singlesScores ? {
        ...mp.singlesScores,
        speedStat: baseSpe,
        speedTier: "slow" as const,
        speedAdvantage: 0,
      } : undefined,
    });
    existingNames.add(oppName);
  }

  for (const v of autoVariants) expandedPool.push(v);
  if (autoVariants.length > 0) {
    console.log(`  Auto defensive variants: ${autoVariants.length} opposite builds added`);
  }

  console.log(`  Expanded pool: ${expandedPool.length} entries (from ${allMeta.length} species)`);

  const expandedPoolNames = expandedPool.map(p => p.name);

  // ─── Phase 2: Damage matrix ──────────────────────────────────────────

  console.log(`[2/13] Computing damage matrix...`);
  const { matrix, totalCalcs, bannedMoveSkips, failedCalcs } = buildDamageMatrix(expandedPool);
  console.log(`  ${totalCalcs} calculations (${expandedPool.length}×${expandedPool.length} pairs)`);
  if (bannedMoveSkips > 0) console.log(`  ${bannedMoveSkips} banned move skips (charge/recharge moves)`);
  if (failedCalcs > 0) console.warn(`  WARNING: ${failedCalcs} failed calculations (unknown moves)`);

  const megaCapable = new Set(
    expandedPool.filter((p) => p.name.endsWith(MEGA_POOL_SUFFIX)).map((p) => p.name),
  );
  console.log(`  Mega entries: ${[...megaCapable].join(", ")}`);

  // ─── Phase 2b: Build simulation environment ──────────────────────────

  const simEnv: SimEnv = {
    weatherUsers: new Map(),
    sandChipImmune: new Set(),
    srUsers: new Set(),
    srChipPct: new Map(),
    poolTypes: new Map(),
    poolAbilities: new Map(),
    poolSpeeds: new Map(),
    disguiseUsers: new Set(),
  };

  for (const p of expandedPool) {
    const primaryBuild = p.builds.reduce((best, b) => (b.weight > best.weight ? b : best));
    const speciesName = baseSpecies(p.name);
    const species = getSpecies(speciesName);
    const types = species?.types ?? [];

    simEnv.poolTypes.set(p.name, types);
    simEnv.poolAbilities.set(p.name, primaryBuild.ability);
    simEnv.poolSpeeds.set(p.name, buildSpeed(p.name, primaryBuild));

    const weather = WEATHER_ABILITIES[primaryBuild.ability];
    if (weather) simEnv.weatherUsers.set(p.name, weather);
    if (isSandChipImmune(types, primaryBuild.ability)) simEnv.sandChipImmune.add(p.name);
    if (STEALTH_ROCK_USERS.has(speciesName)) simEnv.srUsers.add(p.name);
    if (primaryBuild.ability === DISGUISE_ABILITY) simEnv.disguiseUsers.add(p.name);
    simEnv.srChipPct.set(p.name, getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100);
  }

  if (simEnv.disguiseUsers.size > 0) {
    console.log(`  Disguise users: ${[...simEnv.disguiseUsers].join(", ")}`);
  }

  const weatherByType = new Map<string, string[]>();
  for (const [name, w] of simEnv.weatherUsers) {
    if (!weatherByType.has(w)) weatherByType.set(w, []);
    weatherByType.get(w)!.push(name);
  }
  for (const [w, names] of weatherByType) console.log(`  ${w} setters: ${names.join(", ")}`);
  console.log(`  SR setters: ${[...simEnv.srUsers].join(", ") || "none"}`);

  // ─── Phase 3: Generate random teams ───────────────────────────────────

  // buildPool excludes Pokemon banned from team construction (e.g. Palafin).
  // expandedPool is kept intact so banned Pokemon still appear as opponents.
  const buildPool = expandedPool.filter(p => !TEAM_BUILD_BANNED.has(p.name));
  if (buildPool.length < expandedPool.length) {
    console.log(`  Build-banned: ${[...TEAM_BUILD_BANNED].join(", ")} (remain in opponent pool)`);
  }

  console.log(`[3/13] Generating ${totalTeams} random teams...`);
  const primaryItem = buildPrimaryItemMap(expandedPool);
  const { teams, validationRejects } = generateTeams(buildPool, totalTeams, rng, matrix, primaryItem, TEAM_BUILD_BANNED);
  console.log(`  Generated ${teams.length} teams (${validationRejects} rejected for dead-weight members)`);

  // ─── Create worker pool ───────────────────────────────────────────────

  console.log(`  Creating ${numWorkers} worker threads...`);
  const workerPool = createWorkerPool(numWorkers, matrix, simEnv, megaCapable);

  let totalMatchups = 0;

  // ─── Phase 4: Parallel matchup evaluation ─────────────────────────────

  console.log(`[4/13] Running ${totalTeams} × ${gamesPerTeam} matchups (${numWorkers} workers)...`);
  const matchResults = await runMatchupsParallel(
    workerPool, teams, 0, totalTeams, gamesPerTeam, seed, totalTeams, expandedPoolNames,
  );
  totalMatchups += totalTeams * gamesPerTeam;
  console.log(`  Total matchups: ${totalMatchups}`);

  // ─── Phase 5: Parallel 3-Core Meta Evaluation ────────────────────────

  let metaReps: MetaRepresentative[] = [];
  let coreResult: { topCores: CoreRanking[]; pokemonCoreStats: PokemonCoreStats[]; totalCoresEvaluated: number } | null = null;

  if (!skipCores) {
    console.log(`[5/13] 3-Core Meta Evaluation (${numWorkers} workers)...`);

    metaReps = extractMetaRepresentatives(matchResults.teamSelections, META_REPS_COUNT);
    console.log(`  Meta representatives: ${metaReps.length} (top: ${metaReps[0]?.members.join("+")} freq=${metaReps[0]?.frequency})`);

    coreResult = await scoreCoresParallel(
      workerPool, expandedPool, megaCapable, metaReps, matrix, simEnv, TOP_CORES_COUNT,
    );
    console.log(`  Top 3 cores:`);
    for (const core of coreResult.topCores.slice(0, 3)) {
      console.log(`    ${core.members.join(" + ")} → score ${core.score} (${core.winCount}/${core.totalReps} wins)`);
    }
  } else {
    console.log(`[5/13] Skipping 3-Core Meta Evaluation (--skip-cores)`);
  }

  // ─── Phase 6: Core-seeded team generation ────────────────────────────

  if (coreResult && metaReps.length > 0) {
    console.log(`[6/13] Core-seeded team generation (top ${CORE_SEED_TOP_CORES} cores × ${CORE_SEED_TEAMS_PER_CORE} variants)...`);

    const coreSeededTeams = generateCoreSeededTeams(
      coreResult.topCores, buildPool, matrix, primaryItem,
      metaReps, simEnv, megaCapable,
      CORE_SEED_TOP_CORES, CORE_SEED_TEAMS_PER_CORE, CORE_SEED_CANDIDATE_POOL,
      rng, TEAM_BUILD_BANNED,
    );
    console.log(`  Generated ${coreSeededTeams.length} core-seeded teams`);

    if (coreSeededTeams.length > 0) {
      const oldLen = teams.length;
      for (const ct of coreSeededTeams) teams.push(ct);
      extendResults(matchResults, coreSeededTeams.length);

      // ─── Phase 7: Evaluate core-seeded teams ───────────────────────

      console.log(`[7/13] Evaluating core-seeded teams (${numWorkers} workers)...`);
      const corePartial = await runMatchupsParallel(
        workerPool, teams, oldLen, teams.length,
        gamesPerTeam, seed + 314_159, teams.length, expandedPoolNames,
      );
      mergeIntoResults(matchResults, corePartial);
      totalMatchups += coreSeededTeams.length * gamesPerTeam;
      console.log(`  Core-seeded matchups: ${coreSeededTeams.length * gamesPerTeam} (total: ${totalMatchups})`);
    }
  } else {
    console.log(`[6/13] Skipping core-seeded generation (no cores available)`);
    console.log(`[7/13] Skipping core-seeded evaluation`);
  }

  // ─── Phase 8: Iterative refinement ─────────────────────────────────

  // Streak tracker: shared across Phase 8 and elite refinement
  const aceStreaks = new Map<number, Map<string, number>>();

  // ADR-006: must-answer pool for threat-directed refinement
  const mustAnswerSet = buildMustAnswerSet(buildPool);
  console.log(`  Must-answer pool: ${mustAnswerSet.size} Pokemon`);

  console.log(`[8/13] Iterative refinement (${refineRounds} rounds: R1-5 tiered <${(HARD_WEAK_THRESHOLD * 100).toFixed(0)}%all+<${(REFINE_SEL_THRESHOLD * 100).toFixed(0)}%one, R6-7 dual <${(REFINE_SEL_THRESHOLD_SOFT * 100).toFixed(0)}%, R8 final, top ${REFINE_TOP_N})...`);
  const refineResult = await iterativeRefinement(
    teams, matchResults, buildPool, matrix, primaryItem,
    metaReps, simEnv, megaCapable, workerPool, expandedPoolNames,
    {
      rounds: refineRounds,
      topN: REFINE_TOP_N,
      selThreshold: REFINE_SEL_THRESHOLD,
      selThresholdSoft: REFINE_SEL_THRESHOLD_SOFT,
      candidatesPerSlot: REFINE_CANDIDATES_PER_SLOT,
      gamesPerTeam,
      baseSeed: seed + 271_828,
    },
    aceStreaks,
    mustAnswerSet,
  );
  totalMatchups += refineResult.totalMatchups;
  console.log(`  Total refined: ${refineResult.totalRefined} teams, ${refineResult.totalMatchups} matchups`);

  // ─── Phase 9: Final re-evaluation ────────────────────────────────────

  {
    // Re-evaluate top teams with many more games for stable rankings
    const indices = teams.map((_, i) => i);
    indices.sort((a, b) => {
      const gamesA = matchResults.teamWins[a] + matchResults.teamLosses[a] + matchResults.teamDraws[a];
      const gamesB = matchResults.teamWins[b] + matchResults.teamLosses[b] + matchResults.teamDraws[b];
      const wrA = gamesA > 0 ? matchResults.teamWins[a] / gamesA : 0;
      const wrB = gamesB > 0 ? matchResults.teamWins[b] / gamesB : 0;
      return wrB - wrA;
    });
    const reEvalIndices = indices.slice(0, REEVAL_TOP_N);

    // Create a compact array of just these teams for re-evaluation
    const reEvalTeams: Team[] = reEvalIndices.map(ti => teams[ti]);

    console.log(`[9/13] Re-evaluating top ${reEvalTeams.length} teams × ${REEVAL_GAMES} games...`);
    const reEvalStart = Date.now();

    const reEvalResults = await runMatchupsParallel(
      workerPool, reEvalTeams, 0, reEvalTeams.length,
      REEVAL_GAMES, seed + 577_215,
      reEvalTeams.length, expandedPoolNames,
    );

    // Write re-eval results back into the main results arrays
    for (let ri = 0; ri < reEvalIndices.length; ri++) {
      const ti = reEvalIndices[ri];
      matchResults.teamWins[ti] += reEvalResults.teamWins[ri];
      matchResults.teamLosses[ti] += reEvalResults.teamLosses[ri];
      matchResults.teamDraws[ti] += reEvalResults.teamDraws[ri];
      matchResults.teamScoreSum[ti] += reEvalResults.teamScoreSum[ri];

      // Merge selection patterns
      const mainSel = matchResults.teamSelections.get(ti) ?? new Map();
      const reEvalSel = reEvalResults.teamSelections.get(ri);
      if (reEvalSel) {
        for (const [key, val] of reEvalSel) {
          const existing = mainSel.get(key) ?? { count: 0, wins: 0 };
          existing.count += val.count;
          existing.wins += val.wins;
          mainSel.set(key, existing);
        }
        matchResults.teamSelections.set(ti, mainSel);
      }
    }

    // Merge aggregated selection stats
    for (const [name, agg] of reEvalResults.selectionAgg) {
      const existing = matchResults.selectionAgg.get(name);
      if (existing) {
        existing.timesInTeam += agg.timesInTeam;
        existing.timesSelected += agg.timesSelected;
        existing.winsWhenSelected += agg.winsWhenSelected;
        for (const [partner, count] of Object.entries(agg.partnerCounts)) {
          existing.partnerCounts[partner] = (existing.partnerCounts[partner] ?? 0) + count;
        }
      } else {
        matchResults.selectionAgg.set(name, { ...agg, partnerCounts: { ...agg.partnerCounts } });
      }
    }

    const reEvalMatchups = reEvalTeams.length * REEVAL_GAMES;
    totalMatchups += reEvalMatchups;
    const reEvalElapsed = ((Date.now() - reEvalStart) / 1000).toFixed(1);
    console.log(`  Re-evaluation: ${reEvalMatchups} matchups (${reEvalElapsed}s)`);
  }

  // ─── Phase 10-11: Elite refinement loop ─────────────────────────────────
  // After re-evaluation, selection rates shift in the elite meta context.
  // Run refinement within a CLOSED elite pool so that the evaluation
  // environment matches the final output context (top teams vs top teams).

  {
    console.log(`[10-11/13] Elite refinement (${POST_REEVAL_REFINE_ROUNDS} rounds, top-${REEVAL_TOP_N} + ${DIVERSITY_CHALLENGER_COUNT} diversity challengers)...`);
    const eliteStart = Date.now();

    for (let eliteRound = 0; eliteRound < POST_REEVAL_REFINE_ROUNDS; eliteRound++) {
      const roundStart = Date.now();

      // 1. Pick current top N from main pool
      const mainIndices = teams.map((_, i) => i);
      mainIndices.sort((a, b) => {
        const gA = matchResults.teamWins[a] + matchResults.teamLosses[a] + matchResults.teamDraws[a];
        const gB = matchResults.teamWins[b] + matchResults.teamLosses[b] + matchResults.teamDraws[b];
        return (gB > 0 ? matchResults.teamWins[b] / gB : 0) - (gA > 0 ? matchResults.teamWins[a] / gA : 0);
      });
      const eliteMainIndices = mainIndices.slice(0, REEVAL_TOP_N);

      // 2. Create elite pool + diversity challengers (anti-curve-fitting).
      //    Diversity teams are mid-ranked (rank N..N+D) that act as sparring
      //    partners — they won't be refined but prevent elite over-specialization.
      const eliteTeams: Team[] = eliteMainIndices.map(ti => teams[ti]);
      const eliteN = eliteTeams.length;
      const diversityIndices = mainIndices.slice(REEVAL_TOP_N, REEVAL_TOP_N + DIVERSITY_CHALLENGER_COUNT);
      for (const di of diversityIndices) eliteTeams.push(teams[di]);

      // 3. Evaluate elite teams against the mixed pool (elite + diversity)
      //    Only elite teams (0..eliteN) play actively; diversity teams are opponents only.
      const eliteEval = await runMatchupsParallel(
        workerPool, eliteTeams, 0, eliteN,
        REEVAL_GAMES, seed + 1_000_003 + eliteRound * 314_159,
        eliteTeams.length, expandedPoolNames,
      );

      // 4. Identify weak members and generate replacements
      const seenElite = new Set<string>();
      for (const t of eliteTeams) seenElite.add([...t.members].sort().join("+"));
      const nextEliteId = { value: teams.length + 1 };

      // Use elite eval results (not main results) for selection rate calculation
      const eliteTopIndices = eliteTeams.map((_, i) => i);
      eliteTopIndices.sort((a, b) => {
        const gA = eliteEval.teamWins[a] + eliteEval.teamLosses[a] + eliteEval.teamDraws[a];
        const gB = eliteEval.teamWins[b] + eliteEval.teamLosses[b] + eliteEval.teamDraws[b];
        return (gB > 0 ? eliteEval.teamWins[b] / gB : 0) - (gA > 0 ? eliteEval.teamWins[a] / gA : 0);
      });

      // Update streaks in elite context (continuing from Phase 8)
      // Map elite indices back to main indices for streak tracking
      for (let ei = 0; ei < eliteN; ei++) {
        const mainTi = eliteMainIndices[ei];
        const rates = getMemberSelRates(eliteTeams[ei], ei, eliteEval);
        let memberStreaks = aceStreaks.get(mainTi);
        if (!memberStreaks) { memberStreaks = new Map(); aceStreaks.set(mainTi, memberStreaks); }
        for (const m of eliteTeams[ei].members) {
          if ((rates.get(m) ?? 0) >= ACE_THRESHOLD) {
            memberStreaks.set(m, (memberStreaks.get(m) ?? 0) + 1);
          } else {
            memberStreaks.set(m, 0);
          }
        }
      }

      const refinedTeams = generateTieredSwaps(
        eliteTopIndices.slice(0, POST_REEVAL_TOP_N),
        eliteTeams, eliteEval, buildPool, matrix, primaryItem,
        metaReps, simEnv, megaCapable, seenElite,
        REFINE_CANDIDATES_PER_SLOT, nextEliteId,
        mustAnswerSet,
      );

      if (refinedTeams.length === 0) {
        const elapsed = ((Date.now() - roundStart) / 1000).toFixed(1);
        console.log(`  Elite round ${eliteRound + 1}: no candidates (converged, ${elapsed}s)`);
        break;
      }

      // 5. Add refined teams to elite pool and evaluate within the pool.
      //    Layout: [elite (0..eliteN) | diversity (eliteN..preRefineLen) | refined (preRefineLen..end)]
      const preRefineLen = eliteTeams.length;
      for (const rt of refinedTeams) eliteTeams.push(rt);
      extendResults(eliteEval, refinedTeams.length);

      const refinedEval = await runMatchupsParallel(
        workerPool, eliteTeams, preRefineLen, eliteTeams.length,
        REEVAL_GAMES, seed + 1_500_007 + eliteRound * 271_828,
        eliteTeams.length, expandedPoolNames,
      );
      mergeIntoResults(eliteEval, refinedEval);

      // 6. Promote elite-refined teams that beat the weakest elite member
      //    back to the main pool with their elite evaluation data.
      //    Only consider elite + refined (not diversity) for ranking.
      const rankableIndices: number[] = [];
      for (let i = 0; i < eliteN; i++) rankableIndices.push(i);
      for (let i = preRefineLen; i < eliteTeams.length; i++) rankableIndices.push(i);
      rankableIndices.sort((a, b) => {
        const gA = eliteEval.teamWins[a] + eliteEval.teamLosses[a] + eliteEval.teamDraws[a];
        const gB = eliteEval.teamWins[b] + eliteEval.teamLosses[b] + eliteEval.teamDraws[b];
        return (gB > 0 ? eliteEval.teamWins[b] / gB : 0) - (gA > 0 ? eliteEval.teamWins[a] / gA : 0);
      });

      // Count how many new teams made it into top N
      let promoted = 0;
      for (const ei of rankableIndices.slice(0, REEVAL_TOP_N)) {
        if (ei >= preRefineLen) promoted++;
      }

      // Add ALL refined teams to the main pool (they'll be ranked in Phase 12)
      for (const rt of refinedTeams) teams.push(rt);
      extendResults(matchResults, refinedTeams.length);

      // Copy elite evaluation data to main results for the new teams
      for (let ri = 0; ri < refinedTeams.length; ri++) {
        const eliteIdx = preRefineLen + ri;
        const mainIdx = teams.length - refinedTeams.length + ri;
        matchResults.teamWins[mainIdx] = eliteEval.teamWins[eliteIdx];
        matchResults.teamLosses[mainIdx] = eliteEval.teamLosses[eliteIdx];
        matchResults.teamDraws[mainIdx] = eliteEval.teamDraws[eliteIdx];
        matchResults.teamScoreSum[mainIdx] = eliteEval.teamScoreSum[eliteIdx];

        const eliteSel = eliteEval.teamSelections.get(eliteIdx);
        if (eliteSel) matchResults.teamSelections.set(mainIdx, eliteSel);
      }

      // Merge elite selectionAgg into main
      for (const [name, agg] of eliteEval.selectionAgg) {
        const existing = matchResults.selectionAgg.get(name);
        if (existing) {
          existing.timesInTeam += agg.timesInTeam;
          existing.timesSelected += agg.timesSelected;
          existing.winsWhenSelected += agg.winsWhenSelected;
          for (const [partner, count] of Object.entries(agg.partnerCounts)) {
            existing.partnerCounts[partner] = (existing.partnerCounts[partner] ?? 0) + count;
          }
        } else {
          matchResults.selectionAgg.set(name, { ...agg, partnerCounts: { ...agg.partnerCounts } });
        }
      }

      const eliteMatchups = (eliteN + refinedTeams.length) * REEVAL_GAMES;
      totalMatchups += eliteMatchups;
      const elapsed = ((Date.now() - roundStart) / 1000).toFixed(1);
      console.log(
        `  Elite round ${eliteRound + 1}: +${refinedTeams.length} refined, ` +
        `${promoted} promoted to top-${REEVAL_TOP_N} (${elapsed}s)`
      );

      // Early exit: no new teams broke into top N
      if (promoted === 0) {
        console.log(`  No promotions — elite pool converged`);
        break;
      }
    }

    const eliteElapsed = ((Date.now() - eliteStart) / 1000).toFixed(1);
    console.log(`  Elite refinement total: ${eliteElapsed}s`);
  }

  // ─── Phase 11 (cont): Final re-evaluation ─────────────────────────────
  // Re-evaluate the final top N with fresh games in the elite context.
  // IMPORTANT: OVERWRITE (not merge) the main results for these teams,
  // so that the output stats purely reflect elite matchup quality.

  // Map from main team index → elite-only results (for top teams)
  const eliteOverrides = new Map<number, {
    wins: number; losses: number; draws: number; scoreSum: number;
    selections: Map<string, { count: number; wins: number }>;
  }>();

  {
    const indices = teams.map((_, i) => i);
    indices.sort((a, b) => {
      const gamesA = matchResults.teamWins[a] + matchResults.teamLosses[a] + matchResults.teamDraws[a];
      const gamesB = matchResults.teamWins[b] + matchResults.teamLosses[b] + matchResults.teamDraws[b];
      const wrA = gamesA > 0 ? matchResults.teamWins[a] / gamesA : 0;
      const wrB = gamesB > 0 ? matchResults.teamWins[b] / gamesB : 0;
      return wrB - wrA;
    });
    // Pull FINAL_REEVAL_TOP_N teams so all potential top-50 candidates get stable 1000-game stats.
    // Teams beyond REEVAL_TOP_N act as both candidates AND diversity challengers.
    const finalIndices = indices.slice(0, FINAL_REEVAL_TOP_N);
    const finalTeams: Team[] = finalIndices.map(ti => teams[ti]);

    console.log(`  Final re-evaluation: top ${finalTeams.length} × ${REEVAL_GAMES} games...`);
    const finalStart = Date.now();

    const finalResults = await runMatchupsParallel(
      workerPool, finalTeams, 0, finalTeams.length,
      REEVAL_GAMES, seed + 2_000_003,
      finalTeams.length, expandedPoolNames,
    );

    // Store elite-only results as overrides (NOT merged into accumulated stats)
    for (let ri = 0; ri < finalIndices.length; ri++) {
      const ti = finalIndices[ri];
      eliteOverrides.set(ti, {
        wins: finalResults.teamWins[ri],
        losses: finalResults.teamLosses[ri],
        draws: finalResults.teamDraws[ri],
        scoreSum: finalResults.teamScoreSum[ri],
        selections: finalResults.teamSelections.get(ri) ?? new Map(),
      });
    }

    // Merge selectionAgg normally (for pokemon-level stats, not team-level)
    for (const [name, agg] of finalResults.selectionAgg) {
      const existing = matchResults.selectionAgg.get(name);
      if (existing) {
        existing.timesInTeam += agg.timesInTeam;
        existing.timesSelected += agg.timesSelected;
        existing.winsWhenSelected += agg.winsWhenSelected;
        for (const [partner, count] of Object.entries(agg.partnerCounts)) {
          existing.partnerCounts[partner] = (existing.partnerCounts[partner] ?? 0) + count;
        }
      } else {
        matchResults.selectionAgg.set(name, { ...agg, partnerCounts: { ...agg.partnerCounts } });
      }
    }

    const finalMatchups = finalTeams.length * REEVAL_GAMES;
    totalMatchups += finalMatchups;
    const elapsed = ((Date.now() - finalStart) / 1000).toFixed(1);
    console.log(`  Final re-evaluation: ${finalMatchups} matchups (${elapsed}s)`);
  }

  // ─── Phase 12: Ranking with threat analysis ──────────────────────────

  console.log(`[12/13] Ranking teams (with threat analysis)...`);

  const rankedTeams: RankedTeam[] = teams.map((team, ti) => {
    // Use elite-only results for top teams, accumulated results for others
    const elite = eliteOverrides.get(ti);
    const tw = elite ? elite.wins : (matchResults.teamWins[ti] ?? 0);
    const tl = elite ? elite.losses : (matchResults.teamLosses[ti] ?? 0);
    const td = elite ? elite.draws : (matchResults.teamDraws[ti] ?? 0);
    const totalGames = tw + tl + td;
    const winRate = totalGames > 0 ? tw / totalGames : 0;
    const scoreSum = elite ? elite.scoreSum : (matchResults.teamScoreSum[ti] ?? 0);

    const selMap = elite ? elite.selections : (matchResults.teamSelections.get(ti) ?? new Map());
    const patterns: SelectionPattern[] = [...selMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([key, val]) => ({
        members: key.split("+"),
        frequency: val.count,
        winRate: val.count > 0 ? round1((val.wins / val.count) * 100) / 100 : 0,
      }));

    const threatProfile = computeTeamThreatProfile(team.members, expandedPool, matrix, simEnv, mustAnswerSet);

    const memberCounts = new Map<string, number>();
    const memberWins = new Map<string, number>();
    team.members.forEach(m => { memberCounts.set(m, 0); memberWins.set(m, 0); });
    for (const [key, val] of selMap.entries()) {
      for (const name of key.split("+")) {
        memberCounts.set(name, (memberCounts.get(name) ?? 0) + val.count);
        memberWins.set(name, (memberWins.get(name) ?? 0) + val.wins);
      }
    }
    const memberSelectionRates = team.members.map(m => {
      const count = memberCounts.get(m) ?? 0;
      const wins = memberWins.get(m) ?? 0;
      return {
        name: m,
        selectionRate: totalGames > 0 ? round1((count / totalGames) * 100) / 100 : 0,
        winRateWhenSelected: count > 0 ? round1((wins / count) * 100) / 100 : 0,
      };
    });
    const deadMemberCount = memberSelectionRates.filter(
      r => r.selectionRate < DEAD_SEL_THRESHOLD,
    ).length;

    const wrPct = round1(winRate * 100);
    const rawComposite = 0.6 * wrPct + 0.4 * (threatProfile?.dominanceScore ?? 0);
    // Apply dead-member penalty: each dead member multiplies score by DEAD_MEMBER_PENALTY
    const compositeScore = round1(
      deadMemberCount > 0 ? rawComposite * Math.pow(DEAD_MEMBER_PENALTY, deadMemberCount) : rawComposite,
    );
    const growthPotential = deadMemberCount > 0;

    return {
      rank: 0,
      teamId: team.id,
      members: team.members,
      winRate: wrPct / 100,
      wins: tw,
      losses: tl,
      draws: td,
      avgScore: totalGames > 0 ? round1((scoreSum / totalGames) * 100) / 100 : 0,
      compositeScore,
      commonSelections: patterns,
      memberSelectionRates,
      deadMemberCount,
      growthPotential,
      typeProfile: {
        offensiveTypes: getTeamOffensiveTypes(team.members, expandedPool),
        defensiveWeaks: getTeamDefensiveWeaks(team.members),
      },
      threatProfile,
    };
  });

  // Only teams that went through the final re-evaluation (eliteOverrides) are
  // eligible for the top output.  This ensures stable 1000-game stats.
  const reEvaluatedTeams = rankedTeams.filter((_, ti) => eliteOverrides.has(ti));

  // Rank by composite score (0.6×WR% + 0.4×dominance) — no dead-member penalty.
  // Dead member info is used for refinement & growth-potential display, not ranking.
  reEvaluatedTeams.sort((a, b) => {
    return b.compositeScore - a.compositeScore || b.winRate - a.winRate;
  });
  const topTeams = reEvaluatedTeams.slice(0, TOP_N_TEAMS);
  for (let i = 0; i < topTeams.length; i++) topTeams[i].rank = i + 1;

  // Print top 10
  console.log(`\n=== Top 10 Teams ===`);
  for (const t of topTeams.slice(0, 10)) {
    const tp = t.threatProfile;
    console.log(
      `  #${t.rank} [${t.teamId}] Score=${t.compositeScore} WR=${(t.winRate * 100).toFixed(1)}% ` +
      `Kill=${tp?.killPressure ?? "?"}  Safe=${tp?.threatResistance ?? "?"} ` +
      `Ans=${tp?.answerRate ?? "?"}% ` +
      `Dead=${t.deadMemberCount}${t.growthPotential ? " ↑" : ""}` +
      ` Gaps=${tp?.criticalGaps ?? 0}`,
    );
    const selStr = t.memberSelectionRates
      .map(r => `${r.name.split("-")[0]}:${(r.selectionRate * 100).toFixed(0)}%`)
      .join(" ");
    console.log(`       [${selStr}]`);
  }

  // ─── Stable core detection ──────────────────────────────────────────
  // Find teams where 4+ members maintained ≥30% selection rate for 5+ rounds.
  // These stable cores are candidates for exhaustive search of remaining slots.

  interface StableCore {
    teamId: string;
    members: string[];
    aceMembers: { name: string; streak: number }[];
    remainingSlots: string[];
    winRate: number;
  }

  const stableCores: StableCore[] = [];
  for (const t of topTeams) {
    const ti = teams.findIndex(tm => tm.id === t.teamId);
    if (ti < 0) continue;
    const memberStreaks = aceStreaks.get(ti);
    if (!memberStreaks) continue;

    const aces = teams[ti].members
      .filter(m => (memberStreaks.get(m) ?? 0) >= STABLE_STREAK_MIN)
      .map(m => ({ name: m, streak: memberStreaks.get(m)! }));

    if (aces.length >= STABLE_CORE_MIN_MEMBERS) {
      const aceNames = new Set(aces.map(a => a.name));
      stableCores.push({
        teamId: t.teamId,
        members: teams[ti].members,
        aceMembers: aces.sort((a, b) => b.streak - a.streak),
        remainingSlots: teams[ti].members.filter(m => !aceNames.has(m)),
        winRate: t.winRate,
      });
    }
  }

  if (stableCores.length > 0) {
    console.log(`\n=== Stable Cores (${STABLE_CORE_MIN_MEMBERS}+ aces with ${STABLE_STREAK_MIN}+ round streak) ===`);
    for (const sc of stableCores.slice(0, 10)) {
      const aceStr = sc.aceMembers.map(a => `${a.name.split("-")[0]}(${a.streak}R)`).join(", ");
      const slotStr = sc.remainingSlots.map(s => s.split("-")[0]).join(", ");
      console.log(`  [${sc.teamId}] WR=${(sc.winRate * 100).toFixed(1)}% Aces: ${aceStr} | Flex: ${slotStr}`);
    }
  } else {
    console.log(`\n=== No stable cores found (need ${STABLE_CORE_MIN_MEMBERS}+ aces with ${STABLE_STREAK_MIN}+ streak) ===`);
  }

  // ─── Phase 13: Exhaustive remaining-slot search for stable cores ────

  const EXHAUST_TOP_PER_CORE = 100;
  const EXHAUST_EVAL_GAMES = 500;
  const MAX_EXHAUST_CORES = 20;

  interface ExhaustiveResult {
    coreTeamId: string;
    coreMembers: string[];
    aceMembers: { name: string; streak: number }[];
    totalCombinations: number;
    results: {
      rank: number;
      members: string[];
      winRate: number;
      memberSelectionRates: { name: string; selectionRate: number; winRateWhenSelected: number }[];
    }[];
  }
  const exhaustiveResults: ExhaustiveResult[] = [];

  if (stableCores.length > 0) {
    const coresToSearch = stableCores.slice(0, MAX_EXHAUST_CORES);
    console.log(`\n[13/13] Exhaustive search for ${coresToSearch.length} stable cores...`);
    const exhaustStart = Date.now();

    // Generate exhaustive teams for all cores
    const allExhaustTeams: Team[] = [];
    const coreRanges: { coreIdx: number; start: number; count: number; totalCombos: number }[] = [];

    for (let ci = 0; ci < coresToSearch.length; ci++) {
      const sc = coresToSearch[ci];
      const aceNames = sc.aceMembers.map(a => a.name);
      console.log(`  Core ${ci + 1}/${coresToSearch.length}: [${sc.teamId}] ${aceNames.map(n => n.split("-")[0]).join(", ")} (${sc.remainingSlots.length} slots)`);

      const start = allExhaustTeams.length;
      const exhaustive = generateExhaustiveTeams(
        aceNames, buildPool, primaryItem, metaReps, matrix, simEnv, megaCapable,
        EXHAUST_TOP_PER_CORE,
      );
      for (const e of exhaustive) allExhaustTeams.push(e.team);
      coreRanges.push({
        coreIdx: ci,
        start,
        count: exhaustive.length,
        totalCombos: 0, // logged inside generateExhaustiveTeams
      });
    }

    if (allExhaustTeams.length > 0) {
      // Collect top elite teams for opponent pool
      const eliteForEval = topTeams.slice(0, REEVAL_TOP_N).map(t => {
        const ti = teams.findIndex(tm => tm.id === t.teamId);
        return teams[ti];
      }).filter(Boolean);

      // Anti-curve-fitting: generate teams from individually strong Pokemon
      const powerTeams = generatePowerTeams(
        buildPool, POWER_TEAM_COUNT, POWER_TEAM_POOL_SIZE,
        mulberry32(seed + 5_000_001), primaryItem, megaCapable,
      );
      console.log(`  Power teams: ${powerTeams.length} (top-${POWER_TEAM_POOL_SIZE} by overallScore)`);

      // Combined pool: [elite teams..., power teams..., exhaustive teams...]
      const evalPool = [...eliteForEval, ...powerTeams, ...allExhaustTeams];
      const eliteCount = eliteForEval.length;
      const opponentCount = eliteCount + powerTeams.length;
      const exhaustStart2 = opponentCount;
      const exhaustEnd = evalPool.length;

      console.log(`  Evaluating ${allExhaustTeams.length} candidates vs ${opponentCount} opponents (${eliteCount} elite + ${powerTeams.length} power) (${EXHAUST_EVAL_GAMES} games)...`);

      const exhaustEval = await runMatchupsParallel(
        workerPool, evalPool, exhaustStart2, exhaustEnd,
        EXHAUST_EVAL_GAMES, seed + 3_000_001,
        evalPool.length, expandedPoolNames,
      );

      const evalMatchups = allExhaustTeams.length * EXHAUST_EVAL_GAMES;
      totalMatchups += evalMatchups;

      // Extract results per core
      for (const cr of coreRanges) {
        const sc = coresToSearch[cr.coreIdx];
        const coreTeams: { idx: number; team: Team; wr: number }[] = [];

        for (let k = 0; k < cr.count; k++) {
          const evalIdx = opponentCount + cr.start + k;
          const w = exhaustEval.teamWins[evalIdx] ?? 0;
          const l = exhaustEval.teamLosses[evalIdx] ?? 0;
          const d = exhaustEval.teamDraws[evalIdx] ?? 0;
          const total = w + l + d;
          coreTeams.push({
            idx: evalIdx,
            team: evalPool[evalIdx],
            wr: total > 0 ? w / total : 0,
          });
        }

        coreTeams.sort((a, b) => b.wr - a.wr);
        const topResults = coreTeams.slice(0, 10);

        const aceStr = sc.aceMembers.map(a => `${a.name.split("-")[0]}(${a.streak}R)`).join(", ");
        console.log(`\n  === Core [${sc.teamId}] Aces: ${aceStr} ===`);

        const resultEntries: ExhaustiveResult["results"] = [];
        for (let rank = 0; rank < topResults.length; rank++) {
          const r = topResults[rank];
          const selMap = exhaustEval.teamSelections.get(r.idx) ?? new Map();
          const totalGames = (exhaustEval.teamWins[r.idx] ?? 0) +
            (exhaustEval.teamLosses[r.idx] ?? 0) + (exhaustEval.teamDraws[r.idx] ?? 0);

          const memberCounts = new Map<string, number>();
          const memberWins = new Map<string, number>();
          r.team.members.forEach(m => { memberCounts.set(m, 0); memberWins.set(m, 0); });
          for (const [key, val] of selMap.entries()) {
            for (const name of key.split("+")) {
              memberCounts.set(name, (memberCounts.get(name) ?? 0) + val.count);
              memberWins.set(name, (memberWins.get(name) ?? 0) + val.wins);
            }
          }
          const memberSelectionRates = r.team.members.map(m => ({
            name: m,
            selectionRate: totalGames > 0 ? round1((memberCounts.get(m)! / totalGames) * 100) / 100 : 0,
            winRateWhenSelected: (memberCounts.get(m) ?? 0) > 0
              ? round1((memberWins.get(m)! / memberCounts.get(m)!) * 100) / 100 : 0,
          }));

          resultEntries.push({
            rank: rank + 1,
            members: r.team.members,
            winRate: round1(r.wr * 100) / 100,
            memberSelectionRates,
          });

          const selStr = memberSelectionRates
            .map(ms => `${ms.name.split("-")[0]}:${(ms.selectionRate * 100).toFixed(0)}%`)
            .join(" ");
          console.log(`    #${rank + 1} WR=${(r.wr * 100).toFixed(1)}% [${selStr}]`);
        }

        exhaustiveResults.push({
          coreTeamId: sc.teamId,
          coreMembers: sc.aceMembers.map(a => a.name),
          aceMembers: sc.aceMembers,
          totalCombinations: cr.count,
          results: resultEntries,
        });
      }

      const exhaustElapsed = ((Date.now() - exhaustStart) / 1000).toFixed(1);
      console.log(`\n  Exhaustive search: ${evalMatchups} matchups (${exhaustElapsed}s)`);
    }
  } else {
    console.log(`\n[13/13] Exhaustive search: skipped (no stable cores)`);
  }

  // ─── Terminate workers ────────────────────────────────────────────────

  await workerPool.terminate();

  // ─── Output ────────────────────────────────────────────────────────

  console.log(`\n[Output] Computing stats & writing...`);

  const pokemonStats = computePokemonStats(topTeams, teams, matchResults.selectionAgg);

  const poolMembers: PoolMember[] = expandedPool.map((meta) => {
    const primaryBuild = meta.builds.reduce((best, b) => b.weight > best.weight ? b : best);
    const speciesName = baseSpecies(meta.name);
    const species = getSpecies(speciesName);
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
      overallScore: meta.singlesScores?.overallScore,
      offensiveScore: meta.singlesScores?.offensiveScore,
      defensiveScore: meta.singlesScores?.defensiveScore,
      speedStat: buildSpeed(meta.name, primaryBuild),
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
      poolSize: expandedPool.length,
      poolFiltered,
      teamsRejected: validationRejects,
    },
    pool: poolMembers,
    damageMatrix: matrix,
    topTeams,
    pokemonStats,
    ...(coreResult ? {
      topCores: coreResult.topCores,
      pokemonCoreStats: coreResult.pokemonCoreStats,
      metaRepresentatives: metaReps.map(r => ({
        members: r.members,
        weight: Math.round(r.weight * 10000) / 10000,
        frequency: r.frequency,
        winRate: Math.round(r.winRate * 1000) / 1000,
      })),
    } : {}),
    ...(stableCores.length > 0 ? {
      stableCores: stableCores.map(sc => ({
        teamId: sc.teamId,
        members: sc.members,
        aceMembers: sc.aceMembers,
        remainingSlots: sc.remainingSlots,
        winRate: sc.winRate,
      })),
    } : {}),
    ...(exhaustiveResults.length > 0 ? { exhaustiveResults } : {}),
  };

  const outPath = resolve(STORAGE, `analysis/${dateArg}-team-matchup.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  // Write damage matrix as a separate file (for moves viewer — avoids 22MB embed in main JSON)
  const dmOutPath = resolve(STORAGE, `analysis/${dateArg}-damage-matrix.json`);
  writeFileSync(dmOutPath, JSON.stringify(matrix) + "\n", "utf-8");
  console.log(`[Output] Damage matrix → ${dmOutPath}`);

  // ── Save compact snapshot to cross-run history ──────────────────────
  {
    const snapshot: MatchupSnapshot = {
      generatedAt: output.generatedAt,
      dateArg,
      config: {
        totalTeams,
        gamesPerTeam,
        poolSize: expandedPool.length,
        seed,
      },
      topTeamWinRate: topTeams[0]?.winRate ?? 0,
      topTeamCompositeScore: topTeams[0]?.compositeScore ?? 0,
      topTeams: topTeams.slice(0, 10).map((t): SnapshotTeam => ({
        rank: t.rank,
        members: t.members,
        winRate: t.winRate,
        compositeScore: t.compositeScore,
        deadMemberCount: t.deadMemberCount,
      })),
      pokemonPickRates: Object.fromEntries(
        pokemonStats.map(ps => [ps.name, Math.round(ps.pickRate * 1000) / 1000]),
      ),
      pokemonSelectionRates: Object.fromEntries(
        pokemonStats.map(ps => [ps.name, Math.round(ps.selectionRate * 1000) / 1000]),
      ),
      topCores: (coreResult?.topCores ?? []).slice(0, 10).map(c => ({
        members: c.members,
        score: Math.round(c.score * 1000) / 1000,
      })),
      poolStats: {
        total: expandedPool.length,
        megas: expandedPool.filter(p => p.isMega).length,
      },
    };

    const historyPath = resolve(STORAGE, "analysis/_matchup-history.json");
    let history: MatchupHistory = { version: 1, snapshots: [] };
    if (existsSync(historyPath)) {
      try { history = JSON.parse(readFileSync(historyPath, "utf-8")); } catch { /* start fresh */ }
    }
    history.snapshots.push(snapshot);
    writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n", "utf-8");
    console.log(`[Output] Snapshot saved to history (${history.snapshots.length} total runs)`);
  }

  const sizeKB = Math.round(readFileSync(outPath).length / 1024);
  const pipelineElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`Written to ${outPath} (${sizeKB}KB)`);
  console.log(`  Pool: ${expandedPool.length} entries, Matrix calcs: ${totalCalcs}, Matchups: ${totalMatchups}`);
  console.log(`  Teams evaluated: ${teams.length} (${totalTeams} random + ${teams.length - totalTeams} core-seeded/refined)`);
  console.log(`  Pipeline time: ${pipelineElapsed}s (${numWorkers} workers)`);
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

  if (coreResult) {
    console.log(`\n=== Top 10 3-Pokemon Cores ===`);
    for (const core of coreResult.topCores.slice(0, 10)) {
      console.log(`  ${core.members.join(" + ").padEnd(60)} score=${core.score} (${core.winCount}/${core.totalReps} wins)`);
    }
    console.log(`\n=== Pokemon Core Value (Top 15) ===`);
    for (const ps of coreResult.pokemonCoreStats.slice(0, 15)) {
      console.log(
        `  ${ps.name.padEnd(20)} avg=${ps.avgCoreScore} max=${ps.maxCoreScore} trios=${ps.trioCount}` +
        `  partners: ${ps.topPartners.slice(0, 3).map(p => p.name).join(", ")}`,
      );
    }
  }
}

// ─── Entry point: single run or loop mode ──────────────────────────────
const isLoop = process.argv.includes("--loop");
const baseSeed = parseInt(getArg(process.argv, "--seed") ?? "42");

if (isLoop) {
  (async () => {
    let iteration = 0;
    console.log(`[loop] Continuous mode — Ctrl+C to stop. Base seed: ${baseSeed}`);
    while (true) {
      const seed = baseSeed + iteration;
      console.log(`\n${"═".repeat(60)}`);
      console.log(`[loop] Iteration ${iteration + 1} (seed=${seed})`);
      console.log(`${"═".repeat(60)}`);
      await main(seed);
      iteration++;
      console.log(`\n[loop] Completed ${iteration} runs. Starting next...`);
    }
  })().catch((err) => {
    console.error("[team-matchup] Fatal error:", err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error("[team-matchup] Fatal error:", err);
    process.exit(1);
  });
}
