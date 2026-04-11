/**
 * aggregate.ts — Track B / step 5
 *
 * Reads every parsed replay JSON in
 * `home-data/storage/vgcpast/parsed/{tier}/` and produces a tier-level
 * `_summary.json` capturing per-Pokemon usage, wins, items, abilities,
 * moves, tera types, teammates and opponents.
 *
 * Pokemon are keyed by exact species name with formes preserved (so
 * `Gengar` and `Gengar-Mega` are counted separately). Wins are credited
 * to every brought mon on the winning side; teammates are the other
 * brought mons on the same side; opponents are every brought mon on the
 * other side.
 *
 * Usage:
 *   npx tsx home-data/vgcpast/aggregate.ts                       # all tiers
 *   npx tsx home-data/vgcpast/aggregate.ts --tier Gen9VGCRegulationM-A
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedReplay, ReplayMon } from "../types/replay.js";
import { TARGET_TIERS, safeTierName } from "./enumerate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage", "vgcpast");
const PARSED_DIR = resolve(STORAGE_ROOT, "parsed");

interface PokemonSummary {
  usageCount: number;
  usagePct: number;
  brought: number;
  wins: number;
  winRate: number;
  /** Times this Pokemon appeared in team preview (party registration). */
  registered: number;
  /** Selection rate: brought / registered (0-100). */
  selectionRate: number;
  items: Record<string, number>;
  abilities: Record<string, number>;
  moves: Record<string, number>;
  /** Per-move win counts: how many times this Pokemon won while using each move. */
  moveWins: Record<string, number>;
  teraTypes: Record<string, number>;
  teammates: Record<string, number>;
  opponents: Record<string, number>;
  /** Co-occurrence in team preview (party-level, before selection). */
  partymates: Record<string, number>;
}

interface TierSummary {
  tier: string;
  safeTier: string;
  totalReplays: number;
  pokemon: Record<string, PokemonSummary>;
}

function makePokemonSummary(): PokemonSummary {
  return {
    usageCount: 0,
    usagePct: 0,
    brought: 0,
    wins: 0,
    winRate: 0,
    registered: 0,
    selectionRate: 0,
    items: {},
    abilities: {},
    moves: {},
    moveWins: {},
    teraTypes: {},
    teammates: {},
    opponents: {},
    partymates: {},
  };
}

function bumpCount(obj: Record<string, number>, key: string): void {
  obj[key] = (obj[key] ?? 0) + 1;
}

/** Canonical species key. We keep formes verbatim. */
function speciesKey(mon: ReplayMon): string {
  return mon.species;
}

export async function aggregateTier(tier: string): Promise<TierSummary> {
  const safeTier = safeTierName(tier);
  const tierDir = resolve(PARSED_DIR, safeTier);
  let entries: string[] = [];
  try {
    entries = (await readdir(tierDir)).filter(
      (f) => f.endsWith(".json") && !f.startsWith("_"),
    );
  } catch {
    console.log(`[aggregate] ${tier}: no parsed directory, skipping`);
    return {
      tier,
      safeTier,
      totalReplays: 0,
      pokemon: {},
    };
  }

  const pokemon: Record<string, PokemonSummary> = {};
  let totalReplays = 0;

  for (const file of entries) {
    const path = resolve(tierDir, file);
    let parsed: ParsedReplay;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as ParsedReplay;
    } catch (err) {
      console.warn(`[aggregate] ${tier}: failed to read ${file}: ${String(err)}`);
      continue;
    }
    totalReplays++;

    for (const team of parsed.teams) {
      const isWinner =
        parsed.winner !== undefined && team.player === parsed.winner;

      // --- Preview (6-mon party) aggregation ---
      const previewKeys = Array.from(
        new Set(team.preview.map(speciesKey)),
      );
      for (const pk of previewKeys) {
        const summary = (pokemon[pk] ??= makePokemonSummary());
        summary.registered++;
      }
      // Party-level co-occurrence (preview teammates).
      for (const pk of previewKeys) {
        const summary = pokemon[pk];
        for (const other of previewKeys) {
          if (other === pk) continue;
          bumpCount(summary.partymates, other);
        }
      }

      // --- Brought (selection) aggregation ---
      // Use brought rather than preview so usage counts only mons that
      // actually saw play. Fall back to preview if brought is empty (e.g.
      // truncated logs) — that way we don't lose information.
      const broughtList = team.brought.length > 0 ? team.brought : team.preview;
      // Build a list of opponent species (their brought / preview) for cross
      // tabulation.
      const otherTeam = parsed.teams.find((t) => t.side !== team.side);
      const opponentList = otherTeam
        ? otherTeam.brought.length > 0
          ? otherTeam.brought
          : otherTeam.preview
        : [];
      const opponentKeys = Array.from(
        new Set(opponentList.map(speciesKey)),
      );

      const teammateKeys = Array.from(new Set(broughtList.map(speciesKey)));

      for (const mon of broughtList) {
        const key = speciesKey(mon);
        const summary = (pokemon[key] ??= makePokemonSummary());
        summary.usageCount++;
        summary.brought++;
        if (isWinner) summary.wins++;
        if (mon.itemRevealed) bumpCount(summary.items, mon.itemRevealed);
        if (mon.abilityRevealed) bumpCount(summary.abilities, mon.abilityRevealed);
        for (const m of mon.movesRevealed) {
          bumpCount(summary.moves, m);
          if (isWinner) bumpCount(summary.moveWins, m);
        }
        if (mon.teraType) bumpCount(summary.teraTypes, mon.teraType);
        for (const tk of teammateKeys) {
          if (tk === key) continue;
          bumpCount(summary.teammates, tk);
        }
        for (const ok of opponentKeys) {
          bumpCount(summary.opponents, ok);
        }
      }
    }
  }

  // Derive percentages and win rates.
  const totalSlots = totalReplays * 2; // each replay has 2 sides
  for (const key of Object.keys(pokemon)) {
    const s = pokemon[key];
    s.usagePct = totalSlots > 0 ? (s.usageCount / totalSlots) * 100 : 0;
    s.winRate = s.usageCount > 0 ? (s.wins / s.usageCount) * 100 : 0;
    s.selectionRate = s.registered > 0 ? (s.brought / s.registered) * 100 : 0;
  }

  const summary: TierSummary = {
    tier,
    safeTier,
    totalReplays,
    pokemon,
  };

  await mkdir(tierDir, { recursive: true });
  const outPath = resolve(tierDir, "_summary.json");
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(
    `[aggregate] ${tier}: ${totalReplays} replays, ${Object.keys(pokemon).length} pokemon → ${outPath}`,
  );
  return summary;
}

interface CliArgs {
  tier?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tier") args.tier = argv[++i];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tiers = args.tier ? [args.tier] : [...TARGET_TIERS];
  for (const tier of tiers) {
    try {
      await aggregateTier(tier);
    } catch (err) {
      console.error(`[aggregate] ${tier} FAILED: ${String(err)}`);
    }
  }
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[aggregate] FAILED:", err);
    process.exit(1);
  });
}
