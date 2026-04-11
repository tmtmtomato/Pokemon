/**
 * run-all.ts — Track A end-to-end runner
 *
 * Sequentially executes the full Pikalytics pipeline for one or more
 * formats:
 *   1. fetch-llms (once per run, not per format)
 *   2. fetch-format-index (per format)
 *   3. fetch-pokemon       (per format)
 *   4. parse-all           (per format)
 *
 * CLI:
 *   npx tsx home-data/pikalytics/run-all.ts \
 *     --format championspreview,gen9ou \
 *     --date 2026-04-09
 *
 * Defaults: format=championspreview,gen9ou, date=today (UTC).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchLlms } from "./fetch-llms.js";
import { fetchFormatIndex } from "./fetch-format-index.js";
import { fetchPokemonForFormat } from "./fetch-pokemon.js";
import { parseAllForFormat } from "./parse-all.js";

const __filename = fileURLToPath(import.meta.url);

interface CliArgs {
  formats: string[];
  date: string;
  force: boolean;
}

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    formats: ["championspreview", "gen9ou"],
    date: todayUtc(),
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format" && argv[i + 1]) {
      args.formats = argv[i + 1]!
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      i++;
    } else if (a === "--date" && argv[i + 1]) {
      args.date = argv[i + 1]!;
      i++;
    } else if (a === "--force") {
      args.force = true;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  console.log(
    `[run-all] formats=${args.formats.join(",")} date=${args.date} force=${args.force}`,
  );

  // Step 1: download the llms-full.txt API spec once.
  try {
    await fetchLlms();
  } catch (err) {
    console.log(`[run-all] WARNING: fetch-llms failed: ${String(err)}`);
  }

  for (const format of args.formats) {
    console.log(`\n[run-all] === ${format} ===`);
    try {
      await fetchFormatIndex({ format, date: args.date });
    } catch (err) {
      console.log(
        `[run-all] ERROR fetch-format-index ${format}: ${String(err)}`,
      );
      continue;
    }

    try {
      await fetchPokemonForFormat({
        format,
        date: args.date,
        force: args.force,
      });
    } catch (err) {
      console.log(`[run-all] ERROR fetch-pokemon ${format}: ${String(err)}`);
    }

    try {
      await parseAllForFormat({ format, date: args.date });
    } catch (err) {
      console.log(`[run-all] ERROR parse-all ${format}: ${String(err)}`);
    }
  }

  console.log(`\n[run-all] complete`);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[run-all] FAILED:", err);
    process.exit(1);
  });
}
