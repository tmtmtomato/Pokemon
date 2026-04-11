/**
 * replay-walker.ts — Iterate over parsed VGC replays with filtering.
 *
 * Follows the file-walking pattern from team-aggregate.ts.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedReplay } from "../../types/replay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VGCPAST_PARSED_ROOT = resolve(__dirname, "..", "..", "storage", "vgcpast", "parsed");

export const VGC_DOUBLES_TIERS = [
  "Gen9VGCRegulationM-A",
  "Gen9VGCRegulationM-A_Bo3_",
  "Gen9Pre-ChampionsVGC",
  "Gen9Pre-ChampionsVGC_Bo3_",
];

export interface WalkOptions {
  tiers?: string[];
  minRating?: number;
  requireWinner?: boolean;
  maxReplays?: number;
  doublesOnly?: boolean;
}

const DEFAULT_OPTIONS: WalkOptions = {
  tiers: VGC_DOUBLES_TIERS,
  minRating: 0,
  requireWinner: true,
  doublesOnly: true,
};

/** Normalize mega-evolved forms back to base: "Charizard-Mega-Y" → "Charizard" */
export function normalizeMega(species: string): string {
  return species.replace(/-Mega(?:-[A-Z])?$/, "");
}

/** Get average rating of both players (or 0 if no ratings). */
export function getAvgRating(replay: ParsedReplay): number {
  const ratings = replay.players
    .map((p) => p.rating)
    .filter((r): r is number => r !== undefined);
  if (ratings.length === 0) return 0;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

/** Compute sample weight from rating. */
export function ratingWeight(avgRating: number): number {
  return 1 + Math.max(0, (avgRating - 1100)) / 400;
}

/**
 * Walk all replay files matching the given options.
 * Returns array of parsed replays (loaded into memory).
 */
export async function loadReplays(options: Partial<WalkOptions> = {}): Promise<ParsedReplay[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const replays: ParsedReplay[] = [];
  let count = 0;

  for (const tier of opts.tiers ?? VGC_DOUBLES_TIERS) {
    const tierDir = resolve(VGCPAST_PARSED_ROOT, tier);
    let files: string[];
    try {
      files = await readdir(tierDir);
    } catch {
      continue; // tier directory doesn't exist
    }

    for (const file of files) {
      if (!file.endsWith(".json") || file.startsWith("_")) continue;

      if (opts.maxReplays && count >= opts.maxReplays) break;

      try {
        const data = await readFile(resolve(tierDir, file), "utf-8");
        const replay: ParsedReplay = JSON.parse(data);

        // Filter: doubles only
        if (opts.doublesOnly && replay.gametype !== "doubles") continue;

        // Filter: require winner
        if (opts.requireWinner && !replay.winner) continue;

        // Filter: min rating
        if (opts.minRating && opts.minRating > 0) {
          const avg = getAvgRating(replay);
          if (avg > 0 && avg < opts.minRating) continue;
        }

        replays.push(replay);
        count++;
      } catch {
        // skip malformed files
      }
    }

    if (opts.maxReplays && count >= opts.maxReplays) break;
  }

  return replays;
}

/**
 * Collect all unique species names across all replays.
 */
export function collectSpeciesNames(replays: ParsedReplay[]): Set<string> {
  const names = new Set<string>();
  for (const replay of replays) {
    for (const team of replay.teams) {
      for (const mon of team.preview) {
        names.add(normalizeMega(mon.species));
      }
    }
  }
  return names;
}
