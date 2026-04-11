/**
 * matchups.ts — Track C / step 3
 *
 * Walks every `storage/vgcpast/parsed/{safeTier}/{battleId}.json`
 * (`ParsedReplay`) in a tier and tabulates 1v1 pair win rates across
 * species. For every replay we take the winning side's `brought` roster
 * (or `preview` as a fallback) and cross it with the losing side's
 * `brought`/`preview` roster, producing a `(a, b, aWins, bWins, games)`
 * row for every distinct (alphabetical) species pair.
 *
 * This is a coarse "co-occurrence win rate" rather than a true 1v1
 * matchup matrix — vgcpast replays don't reliably record which
 * individual mons actually engaged each other — but it's a useful
 * first-order signal for a meta viewer and matches what similar
 * community pipelines publish.
 *
 * CLI:
 *   npx tsx home-data/analyzer/matchups.ts --date 2026-04-08
 *   npx tsx home-data/analyzer/matchups.ts --date 2026-04-08 --tier Gen9VGCRegulationM-A
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ParsedReplay, ReplayMon } from "../types/replay.js";

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
  "Gen9Pre-ChampionsOU",
];

const LARGE_TIER_THRESHOLD_PAIRS = 10000;
const LARGE_TIER_MIN_GAMES = 3;

export interface MatchupPair {
  /** Species A (alphabetically first). */
  a: string;
  /** Species B (alphabetically second). */
  b: string;
  /** Number of replays in which both species appeared on opposing sides. */
  games: number;
  /** Number of those replays won by the side that brought `a`. */
  aWins: number;
  /** Number of those replays won by the side that brought `b`. */
  bWins: number;
  /** aWins / games. */
  aWinRate: number;
}

export interface TierMatchups {
  tier: string;
  totalReplays: number;
  pairs: MatchupPair[];
}

export interface MatchupsFile {
  generatedAt: string;
  tiers: TierMatchups[];
}

interface PairAccumulator {
  a: string;
  b: string;
  games: number;
  aWins: number;
  bWins: number;
}

function speciesKey(mon: ReplayMon): string {
  return mon.species;
}

function uniqueSpecies(mons: ReplayMon[]): string[] {
  return Array.from(new Set(mons.map(speciesKey)));
}

/** Turn a pair of species into a stable (alphabetical) key. */
function pairKey(x: string, y: string): { key: string; aFirst: boolean } {
  if (x <= y) return { key: `${x}\u0000${y}`, aFirst: true };
  return { key: `${y}\u0000${x}`, aFirst: false };
}

export function accumulatePair(
  acc: Map<string, PairAccumulator>,
  x: string,
  y: string,
  xWon: boolean,
): void {
  if (x === y) return;
  const { key, aFirst } = pairKey(x, y);
  let entry = acc.get(key);
  if (!entry) {
    entry = {
      a: aFirst ? x : y,
      b: aFirst ? y : x,
      games: 0,
      aWins: 0,
      bWins: 0,
    };
    acc.set(key, entry);
  }
  entry.games++;
  // "a" is always the alphabetically-first species; map xWon accordingly.
  const aIsX = aFirst;
  if (xWon) {
    if (aIsX) entry.aWins++;
    else entry.bWins++;
  } else {
    if (aIsX) entry.bWins++;
    else entry.aWins++;
  }
}

export function processReplayIntoAcc(
  replay: ParsedReplay,
  acc: Map<string, PairAccumulator>,
): void {
  if (!replay.winner) return;
  if (!Array.isArray(replay.teams) || replay.teams.length < 2) return;

  const winningTeam = replay.teams.find((t) => t.player === replay.winner);
  const losingTeam = replay.teams.find((t) => t.player !== replay.winner);
  if (!winningTeam || !losingTeam) return;

  const winnerMons =
    winningTeam.brought.length > 0 ? winningTeam.brought : winningTeam.preview;
  const loserMons =
    losingTeam.brought.length > 0 ? losingTeam.brought : losingTeam.preview;
  if (winnerMons.length === 0 || loserMons.length === 0) return;

  const winnerSpecies = uniqueSpecies(winnerMons);
  const loserSpecies = uniqueSpecies(loserMons);

  for (const w of winnerSpecies) {
    for (const l of loserSpecies) {
      accumulatePair(acc, w, l, true);
    }
  }
}

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

async function processTier(safeTier: string): Promise<TierMatchups | null> {
  const tierDir = resolve(VGCPAST_PARSED_ROOT, safeTier);
  const st = await stat(tierDir).catch(() => null);
  if (!st?.isDirectory()) {
    console.log(`[matchups] ${safeTier}: directory missing, skipping`);
    return null;
  }
  const files = await collectReplayFiles(tierDir);
  if (files.length === 0) {
    console.log(`[matchups] ${safeTier}: no replay files`);
    return null;
  }
  console.log(`[matchups] ${safeTier}: processing ${files.length} replays`);
  const acc = new Map<string, PairAccumulator>();
  let totalReplays = 0;
  for (const file of files) {
    const path = resolve(tierDir, file);
    let replay: ParsedReplay;
    try {
      replay = JSON.parse(await readFile(path, "utf8")) as ParsedReplay;
    } catch (err) {
      console.warn(
        `[matchups] ${safeTier}: failed to read ${file}: ${String(err)}`,
      );
      continue;
    }
    totalReplays++;
    processReplayIntoAcc(replay, acc);
  }

  let pairs: MatchupPair[] = Array.from(acc.values()).map((p) => ({
    a: p.a,
    b: p.b,
    games: p.games,
    aWins: p.aWins,
    bWins: p.bWins,
    aWinRate: p.games > 0 ? p.aWins / p.games : 0,
  }));

  if (pairs.length > LARGE_TIER_THRESHOLD_PAIRS) {
    console.log(
      `[matchups] ${safeTier}: ${pairs.length} pairs > ${LARGE_TIER_THRESHOLD_PAIRS}, filtering games >= ${LARGE_TIER_MIN_GAMES}`,
    );
    pairs = pairs.filter((p) => p.games >= LARGE_TIER_MIN_GAMES);
  }

  pairs.sort((p1, p2) => {
    if (p2.games !== p1.games) return p2.games - p1.games;
    return p1.a.localeCompare(p2.a) || p1.b.localeCompare(p2.b);
  });

  console.log(
    `[matchups] ${safeTier}: ${totalReplays} replays → ${pairs.length} pairs`,
  );
  return {
    tier: safeTier,
    totalReplays,
    pairs,
  };
}

interface CliArgs {
  date?: string;
  tier?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--date") args.date = argv[++i];
    else if (a === "--tier") args.tier = argv[++i];
  }
  return args;
}

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function runMatchups(
  requestedDate: string | undefined,
  requestedTier?: string,
): Promise<{ path: string; file: MatchupsFile }> {
  const date = requestedDate ?? todayUtc();
  const tiers = requestedTier ? [requestedTier] : [...DEFAULT_TIERS];
  const tierResults: TierMatchups[] = [];
  for (const t of tiers) {
    const result = await processTier(t);
    if (result) tierResults.push(result);
  }

  const out: MatchupsFile = {
    generatedAt: new Date().toISOString(),
    tiers: tierResults,
  };

  await mkdir(ANALYSIS_ROOT, { recursive: true });
  const outPath = resolve(ANALYSIS_ROOT, `${date}-matchups.json`);
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  const totalPairs = tierResults.reduce((sum, t) => sum + t.pairs.length, 0);
  console.log(
    `[matchups] wrote ${outPath} (${tierResults.length} tiers, ${totalPairs} pairs total)`,
  );
  return { path: outPath, file: out };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  await runMatchups(args.date, args.tier);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[matchups] FAILED:", err);
    process.exit(1);
  });
}
