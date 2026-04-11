/**
 * distributions.ts — Track C / step 2
 *
 * Reads `storage/analysis/{date}-meta.json` (`MetaSnapshot`) and emits a
 * normalised probability-mass-function view for each Pokemon. For every
 * Pokemon and every axis (moves / items / abilities / teammates /
 * teraTypes), the raw percentages are rescaled so they sum to exactly 1,
 * producing something downstream Bayesian inference steps (tracker team
 * preview predictor) can consume directly without worrying about whether
 * Pikalytics reported 0-100 or 0-1 ranges.
 *
 * Empty axes stay as empty arrays (never NaN).
 *
 * CLI:
 *   npx tsx home-data/analyzer/distributions.ts --date 2026-04-08
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  FormatMeta,
  MetaSnapshot,
  WeightedRow,
} from "../types/analytics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ANALYSIS_ROOT = resolve(__dirname, "..", "storage", "analysis");

export interface PmfRow {
  name: string;
  /** Probability in the 0..1 range. */
  p: number;
}

export interface PokemonDistribution {
  name: string;
  /** Usage percentage in the 0-100 range (preserved from the snapshot). */
  usagePct: number;
  moves: PmfRow[];
  items: PmfRow[];
  abilities: PmfRow[];
  teammates: PmfRow[];
  teraTypes?: PmfRow[];
}

export interface FormatDistribution {
  formatKey: string;
  pokemon: PokemonDistribution[];
}

export interface DistributionsFile {
  generatedAt: string;
  formats: FormatDistribution[];
}

/** Convert weighted rows to a probability mass function summing to 1. */
export function toPmf(rows: WeightedRow[] | undefined): PmfRow[] {
  if (!rows || rows.length === 0) return [];
  let total = 0;
  for (const r of rows) {
    if (Number.isFinite(r.pct) && r.pct > 0) total += r.pct;
  }
  if (total <= 0) return [];
  const out: PmfRow[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.pct) || r.pct <= 0) continue;
    out.push({ name: r.name, p: r.pct / total });
  }
  // Sort descending by probability for consumer convenience.
  out.sort((a, b) => b.p - a.p);
  return out;
}

/** Build a FormatDistribution from a FormatMeta. */
export function formatMetaToDistribution(format: FormatMeta): FormatDistribution {
  return {
    formatKey: format.formatKey,
    pokemon: format.pokemon.map((p) => {
      const dist: PokemonDistribution = {
        name: p.name,
        usagePct: p.usagePct,
        moves: toPmf(p.moves),
        items: toPmf(p.items),
        abilities: toPmf(p.abilities),
        teammates: toPmf(p.teammates),
      };
      if (p.teraTypes && p.teraTypes.length > 0) {
        dist.teraTypes = toPmf(p.teraTypes);
      }
      return dist;
    }),
  };
}

export function buildDistributions(snapshot: MetaSnapshot): DistributionsFile {
  return {
    generatedAt: new Date().toISOString(),
    formats: snapshot.formats.map(formatMetaToDistribution),
  };
}

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

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function runDistributions(
  requestedDate: string | undefined,
): Promise<{ path: string; file: DistributionsFile }> {
  const date = requestedDate ?? todayUtc();
  const metaPath = resolve(ANALYSIS_ROOT, `${date}-meta.json`);
  console.log(`[distributions] reading ${metaPath}`);
  const snapshot = JSON.parse(
    await readFile(metaPath, "utf8"),
  ) as MetaSnapshot;
  const distributions = buildDistributions(snapshot);
  await mkdir(ANALYSIS_ROOT, { recursive: true });
  const outPath = resolve(ANALYSIS_ROOT, `${date}-distributions.json`);
  await writeFile(outPath, JSON.stringify(distributions, null, 2), "utf8");
  const totalPokemon = distributions.formats.reduce(
    (sum, f) => sum + f.pokemon.length,
    0,
  );
  console.log(
    `[distributions] wrote ${outPath} (${distributions.formats.length} formats, ${totalPokemon} pokemon rows)`,
  );
  return { path: outPath, file: distributions };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  await runDistributions(args.date);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[distributions] FAILED:", err);
    process.exit(1);
  });
}
