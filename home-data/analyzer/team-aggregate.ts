/**
 * team-aggregate.ts — Team & core analysis pipeline
 *
 * Walks every `storage/vgcpast/parsed/{safeTier}/{battleId}.json`
 * and aggregates:
 *   1. Team compositions (6-mon previews) with selection patterns
 *   2. 3-mon cores with co-pick rates and companion analysis
 *
 * CLI:
 *   npx tsx home-data/analyzer/team-aggregate.ts --date 2026-04-08
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ParsedReplay, ReplayTeam } from "../types/replay.js";
import type {
  CoreEntry,
  SelectionEntry,
  TeamAnalysis,
  TeamEntry,
} from "../types/team-analysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage");
const VGCPAST_PARSED_ROOT = resolve(STORAGE_ROOT, "vgcpast", "parsed");
const ANALYSIS_ROOT = resolve(STORAGE_ROOT, "analysis");

const DEFAULT_TIERS = [
  "Gen9VGCRegulationM-A",
  "Gen9VGCRegulationM-A_Bo3_",
  "Gen9Pre-ChampionsVGC",
  "Gen9Pre-ChampionsVGC_Bo3_",
];

const MIN_TEAM_COUNT = 3;
const MIN_CORE_COUNT = 10;
const MAX_SELECTIONS_PER_TEAM = 20;
const MAX_TOP_TEAMS_PER_CORE = 10;
const MAX_COMPANIONS_PER_CORE = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize mega-evolved forms back to base: "Charizard-Mega-Y" → "Charizard" */
function normalizeMega(species: string): string {
  return species.replace(/-Mega(?:-[A-Z])?$/, "");
}

/** Canonical key from sorted species array. */
function makeKey(species: string[]): string {
  return species.join(" / ");
}

/** Generate all C(n,3) combinations from an array. */
function combinations3<T>(arr: T[]): [T, T, T][] {
  const result: [T, T, T][] = [];
  const n = arr.length;
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        result.push([arr[i], arr[j], arr[k]]);
      }
    }
  }
  return result;
}

/** Generate all C(n,2) pairs from an array. */
function combinations2<T>(arr: T[]): [T, T][] {
  const result: [T, T][] = [];
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      result.push([arr[i], arr[j]]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Accumulators
// ---------------------------------------------------------------------------

interface SelectionAcc {
  count: number;
  wins: number;
}

interface TeamAcc {
  species: string[];
  count: number;
  wins: number;
  selections: Map<string, SelectionAcc>;
  perMonBrought: Map<string, number>;
}

interface PartialPairAcc {
  count: number;
  wins: number;
}

interface CoreAcc {
  species: string[];
  teamCount: number;
  coPickCount: number;
  coPickWins: number;
  partialPairs: Map<string, PartialPairAcc>;
  companions: Map<string, number>;
  teamKeys: Map<string, { count: number; wins: number }>;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

function processTeamObservation(
  team: ReplayTeam,
  won: boolean,
  teamMap: Map<string, TeamAcc>,
  coreMap: Map<string, CoreAcc>,
): void {
  // Extract preview species (sorted)
  const previewSpecies = team.preview.map((m) => m.species).sort();
  if (previewSpecies.length < 6) return; // Incomplete preview

  const teamKey = makeKey(previewSpecies);

  // Extract brought species (mega-normalized, sorted)
  const broughtSpecies = team.brought
    .map((m) => normalizeMega(m.species))
    .sort();
  const broughtKey = makeKey(broughtSpecies);
  const broughtSet = new Set(broughtSpecies);

  // --- Team accumulation ---
  let teamAcc = teamMap.get(teamKey);
  if (!teamAcc) {
    teamAcc = {
      species: previewSpecies,
      count: 0,
      wins: 0,
      selections: new Map(),
      perMonBrought: new Map(),
    };
    teamMap.set(teamKey, teamAcc);
  }
  teamAcc.count++;
  if (won) teamAcc.wins++;

  // Selection pattern
  if (broughtSpecies.length > 0) {
    let selAcc = teamAcc.selections.get(broughtKey);
    if (!selAcc) {
      selAcc = { count: 0, wins: 0 };
      teamAcc.selections.set(broughtKey, selAcc);
    }
    selAcc.count++;
    if (won) selAcc.wins++;

    // Per-mon brought tracking
    for (const sp of broughtSpecies) {
      teamAcc.perMonBrought.set(sp, (teamAcc.perMonBrought.get(sp) ?? 0) + 1);
    }
  }

  // --- Core accumulation (C(6,3) = 20 cores per team) ---
  const cores = combinations3(previewSpecies);
  for (const coreSpecies of cores) {
    const coreKey = makeKey(coreSpecies);

    let coreAcc = coreMap.get(coreKey);
    if (!coreAcc) {
      coreAcc = {
        species: [...coreSpecies],
        teamCount: 0,
        coPickCount: 0,
        coPickWins: 0,
        partialPairs: new Map(),
        companions: new Map(),
        teamKeys: new Map(),
      };
      coreMap.set(coreKey, coreAcc);
    }
    coreAcc.teamCount++;

    // Track team key
    let tkAcc = coreAcc.teamKeys.get(teamKey);
    if (!tkAcc) {
      tkAcc = { count: 0, wins: 0 };
      coreAcc.teamKeys.set(teamKey, tkAcc);
    }
    tkAcc.count++;
    if (won) tkAcc.wins++;

    // How many of the core are in brought?
    const coreInBrought = coreSpecies.filter((s) => broughtSet.has(s));

    if (coreInBrought.length === 3) {
      coreAcc.coPickCount++;
      if (won) coreAcc.coPickWins++;
    }

    if (coreInBrought.length >= 2) {
      // Track partial pairs (all 2-of-3 combinations within the core)
      const pairs = combinations2(coreSpecies);
      for (const pair of pairs) {
        const bothBrought = pair[0] && pair[1] &&
          broughtSet.has(pair[0]) && broughtSet.has(pair[1]);
        if (bothBrought) {
          const pairKey = makeKey([...pair]);
          let pairAcc = coreAcc.partialPairs.get(pairKey);
          if (!pairAcc) {
            pairAcc = { count: 0, wins: 0 };
            coreAcc.partialPairs.set(pairKey, pairAcc);
          }
          pairAcc.count++;
          if (won) pairAcc.wins++;
        }
      }
    }

    // Companions: the other 3 species not in this core
    for (const sp of previewSpecies) {
      if (!coreSpecies.includes(sp)) {
        coreAcc.companions.set(sp, (coreAcc.companions.get(sp) ?? 0) + 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Finalization
// ---------------------------------------------------------------------------

function finalizeTeams(teamMap: Map<string, TeamAcc>): TeamEntry[] {
  const teams: TeamEntry[] = [];

  for (const [key, acc] of teamMap) {
    if (acc.count < MIN_TEAM_COUNT) continue;

    const winRate = (acc.wins / acc.count) * 100;

    // Build selections
    const selections: SelectionEntry[] = [];
    for (const [selKey, selAcc] of acc.selections) {
      selections.push({
        species: selKey.split(" / "),
        key: selKey,
        count: selAcc.count,
        wins: selAcc.wins,
        winRate: selAcc.count > 0 ? (selAcc.wins / selAcc.count) * 100 : 0,
        pickRate: (selAcc.count / acc.count) * 100,
      });
    }
    selections.sort((a, b) => b.count - a.count);

    // Per-mon selection rate
    const perMonSelectionRate: Record<string, number> = {};
    for (const sp of acc.species) {
      const brought = acc.perMonBrought.get(sp) ?? 0;
      perMonSelectionRate[sp] = (brought / acc.count) * 100;
    }

    teams.push({
      species: acc.species,
      key,
      count: acc.count,
      wins: acc.wins,
      winRate,
      selections: selections.slice(0, MAX_SELECTIONS_PER_TEAM),
      perMonSelectionRate,
    });
  }

  teams.sort((a, b) => b.count - a.count);
  return teams;
}

function finalizeCores(coreMap: Map<string, CoreAcc>): CoreEntry[] {
  const cores: CoreEntry[] = [];

  for (const [key, acc] of coreMap) {
    if (acc.teamCount < MIN_CORE_COUNT) continue;

    const coPickRate = (acc.coPickCount / acc.teamCount) * 100;
    const coPickWinRate =
      acc.coPickCount > 0 ? (acc.coPickWins / acc.coPickCount) * 100 : 0;

    // Partial picks
    const partialPicks: CoreEntry["partialPicks"] = [];
    for (const [pairKey, pairAcc] of acc.partialPairs) {
      partialPicks.push({
        pair: pairKey.split(" / "),
        count: pairAcc.count,
        winRate: pairAcc.count > 0 ? (pairAcc.wins / pairAcc.count) * 100 : 0,
      });
    }
    partialPicks.sort((a, b) => b.count - a.count);

    // Top teams
    const topTeams: CoreEntry["topTeams"] = [];
    for (const [teamKey, tkAcc] of acc.teamKeys) {
      topTeams.push({
        teamKey,
        count: tkAcc.count,
        winRate: tkAcc.count > 0 ? (tkAcc.wins / tkAcc.count) * 100 : 0,
      });
    }
    topTeams.sort((a, b) => b.count - a.count);

    // Companions
    const companions: CoreEntry["companions"] = [];
    for (const [name, count] of acc.companions) {
      companions.push({
        name,
        count,
        pct: (count / acc.teamCount) * 100,
      });
    }
    companions.sort((a, b) => b.count - a.count);

    cores.push({
      species: acc.species,
      key,
      teamCount: acc.teamCount,
      coPickCount: acc.coPickCount,
      coPickRate,
      coPickWinRate,
      partialPicks,
      topTeams: topTeams.slice(0, MAX_TOP_TEAMS_PER_CORE),
      companions: companions.slice(0, MAX_COMPANIONS_PER_CORE),
    });
  }

  cores.sort((a, b) => b.teamCount - a.teamCount);
  return cores;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

async function collectReplayFiles(tierDir: string): Promise<string[]> {
  try {
    const entries = await readdir(tierDir);
    return entries.filter(
      (f) => f.endsWith(".json") && !f.startsWith("_"),
    );
  } catch {
    return [];
  }
}

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runTeamAggregate(
  requestedDate?: string,
): Promise<{ path: string }> {
  const date = requestedDate ?? todayUtc();
  const tiers = [...DEFAULT_TIERS];

  const teamMap = new Map<string, TeamAcc>();
  const coreMap = new Map<string, CoreAcc>();
  let totalReplays = 0;
  let totalTeamObs = 0;
  const usedTiers: string[] = [];

  for (const tier of tiers) {
    const tierDir = resolve(VGCPAST_PARSED_ROOT, tier);
    const st = await stat(tierDir).catch(() => null);
    if (!st?.isDirectory()) {
      console.log(`[team-agg] ${tier}: directory missing, skipping`);
      continue;
    }

    const files = await collectReplayFiles(tierDir);
    if (files.length === 0) {
      console.log(`[team-agg] ${tier}: no replay files`);
      continue;
    }

    console.log(`[team-agg] ${tier}: processing ${files.length} replays`);
    usedTiers.push(tier);

    for (const file of files) {
      const path = resolve(tierDir, file);
      let replay: ParsedReplay;
      try {
        replay = JSON.parse(await readFile(path, "utf8")) as ParsedReplay;
      } catch (err) {
        console.warn(
          `[team-agg] ${tier}: failed to read ${file}: ${String(err)}`,
        );
        continue;
      }

      totalReplays++;

      if (!replay.winner) continue;
      if (!Array.isArray(replay.teams) || replay.teams.length < 2) continue;

      for (const team of replay.teams) {
        const won = team.player === replay.winner;
        processTeamObservation(team, won, teamMap, coreMap);
        totalTeamObs++;
      }
    }
  }

  const teams = finalizeTeams(teamMap);
  const cores = finalizeCores(coreMap);

  const out: TeamAnalysis = {
    generatedAt: new Date().toISOString(),
    tiers: usedTiers,
    totalReplays,
    totalTeams: totalTeamObs,
    teams,
    cores,
  };

  await mkdir(ANALYSIS_ROOT, { recursive: true });
  const outPath = resolve(ANALYSIS_ROOT, `${date}-teams.json`);
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log(
    `[team-agg] wrote ${outPath} (${totalReplays} replays, ${totalTeamObs} team obs, ${teams.length} teams, ${cores.length} cores)`,
  );
  return { path: outPath };
}

// CLI
interface CliArgs {
  date?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--date") args.date = argv[++i];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  await runTeamAggregate(args.date);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[team-agg] FAILED:", err);
    process.exit(1);
  });
}
