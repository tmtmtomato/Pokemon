/**
 * run-all.ts — Track C orchestration
 *
 * Runs the full analyzer pipeline in order:
 *   1. merge-sources → `{date}-meta.json`
 *   2. distributions → `{date}-distributions.json`
 *   3. matchups      → `{date}-matchups.json`
 *
 * This script is idempotent and safe to re-run at any time. It is the
 * entry point exposed through the root `npm run home:analyze` script.
 *
 * CLI:
 *   npx tsx home-data/analyzer/run-all.ts --date 2026-04-08
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mergeAllSources } from "./merge-sources.js";
import { runDistributions } from "./distributions.js";
import { runMatchups } from "./matchups.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  console.log("[run-all] === analyzer pipeline start ===");

  console.log("[run-all] step 1/3: merge-sources");
  const merged = await mergeAllSources(args.date);
  const resolvedDate = merged.date;

  console.log("[run-all] step 2/3: distributions");
  await runDistributions(resolvedDate);

  console.log("[run-all] step 3/3: matchups");
  await runMatchups(resolvedDate);

  console.log(`[run-all] === analyzer pipeline done (date=${resolvedDate}) ===`);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[run-all] FAILED:", err);
    process.exit(1);
  });
}
