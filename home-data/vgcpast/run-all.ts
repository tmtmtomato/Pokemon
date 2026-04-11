/**
 * run-all.ts — Track B / orchestrator
 *
 * Wires the four steps of the vgcpast pipeline together:
 *   1. enumerate listing pages → ListingEntry[]
 *   2. fetch every replay HTML (rate-limited)
 *   3. parse every cached HTML → ParsedReplay JSON
 *   4. aggregate per-tier summary JSON
 *
 * Each step prints progress; failures within a step do not abort later
 * steps. Use `--tier` to limit to one tier or `--limit` to cap fetch volume.
 *
 * Usage:
 *   npx tsx home-data/vgcpast/run-all.ts                              # all tiers, all replays
 *   npx tsx home-data/vgcpast/run-all.ts --tier Gen9VGCRegulationM-A
 *   npx tsx home-data/vgcpast/run-all.ts --tier ... --limit 200 --force
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateTier } from "./aggregate.js";
import { TARGET_TIERS, enumerateTier } from "./enumerate.js";
import { fetchReplaysForTier } from "./fetch-replays.js";
import { parseAllForTier } from "./parse-all.js";

const __filename = fileURLToPath(import.meta.url);

interface CliArgs {
  tier?: string;
  limit?: number;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--tier") args.tier = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tiers = args.tier ? [args.tier] : [...TARGET_TIERS];
  for (const tier of tiers) {
    console.log(`\n=== ${tier} ===`);
    try {
      await enumerateTier(tier, { force: args.force });
    } catch (err) {
      console.error(`[run-all] enumerate(${tier}) FAILED: ${String(err)}`);
      continue;
    }
    try {
      await fetchReplaysForTier(tier, {
        limit: args.limit,
        force: args.force,
      });
    } catch (err) {
      console.error(`[run-all] fetch(${tier}) FAILED: ${String(err)}`);
    }
    try {
      await parseAllForTier(tier);
    } catch (err) {
      console.error(`[run-all] parse(${tier}) FAILED: ${String(err)}`);
    }
    try {
      await aggregateTier(tier);
    } catch (err) {
      console.error(`[run-all] aggregate(${tier}) FAILED: ${String(err)}`);
    }
  }
  console.log(`\n[run-all] DONE: ${tiers.length} tier(s) processed`);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[run-all] FAILED:", err);
    process.exit(1);
  });
}
