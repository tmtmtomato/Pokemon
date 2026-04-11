/**
 * parse-all.ts — Track B / step 4
 *
 * Walks every cached replay HTML in `home-data/storage/vgcpast/replays/{tier}/`
 * and writes a normalised ParsedReplay JSON to
 * `home-data/storage/vgcpast/parsed/{tier}/{battleId}.json`.
 *
 * Parse failures are recorded to `_parse_failures.json` inside the same tier
 * directory and never abort the run. Existing parsed JSON files are
 * overwritten so re-runs always reflect the current parser logic.
 *
 * Usage:
 *   npx tsx home-data/vgcpast/parse-all.ts                       # all tiers
 *   npx tsx home-data/vgcpast/parse-all.ts --tier Gen9VGCRegulationM-A
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGET_TIERS, safeTierName } from "./enumerate.js";
import { parseReplay } from "./parse-replay.js";
import type { ListingEntry } from "../types/replay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage", "vgcpast");
const REPLAYS_DIR = resolve(STORAGE_ROOT, "replays");
const PARSED_DIR = resolve(STORAGE_ROOT, "parsed");
const LISTINGS_DIR = resolve(STORAGE_ROOT, "listings");

interface ParseFailure {
  battleId: string;
  file: string;
  error: string;
}

async function loadListing(safeTier: string): Promise<Map<string, ListingEntry>> {
  const path = resolve(LISTINGS_DIR, `${safeTier}.json`);
  try {
    const raw = await readFile(path, "utf8");
    const list = JSON.parse(raw) as ListingEntry[];
    const map = new Map<string, ListingEntry>();
    for (const e of list) map.set(e.battleId, e);
    return map;
  } catch {
    return new Map();
  }
}

export async function parseAllForTier(tier: string): Promise<{
  parsed: number;
  failed: number;
}> {
  const safeTier = safeTierName(tier);
  const tierIn = resolve(REPLAYS_DIR, safeTier);
  const tierOut = resolve(PARSED_DIR, safeTier);
  await mkdir(tierOut, { recursive: true });

  let entries: string[] = [];
  try {
    entries = (await readdir(tierIn)).filter((f) => f.endsWith(".html"));
  } catch {
    console.log(`[parse-all] ${tier}: no replays directory, skipping`);
    return { parsed: 0, failed: 0 };
  }
  if (entries.length === 0) {
    console.log(`[parse-all] ${tier}: no replays found`);
    return { parsed: 0, failed: 0 };
  }

  const listing = await loadListing(safeTier);
  const failures: ParseFailure[] = [];
  let parsed = 0;
  let i = 0;
  for (const file of entries) {
    i++;
    const battleId = file.replace(/\.html$/, "");
    const filePath = resolve(tierIn, file);
    try {
      const html = await readFile(filePath, "utf8");
      const st = await stat(filePath);
      const hash = createHash("sha1").update(html).digest("hex");
      const listingEntry = listing.get(battleId);
      const source = {
        tierDir: safeTier,
        file: listingEntry?.file ?? file,
        url: listingEntry?.url ?? "",
        size: st.size,
        hash,
      };
      const result = parseReplay(html, source);
      const outPath = resolve(tierOut, `${battleId}.json`);
      await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      parsed++;
    } catch (err) {
      failures.push({
        battleId,
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (i % 100 === 0) {
      console.log(`[parse-all] ${tier} ${i}/${entries.length} done`);
    }
  }

  if (failures.length > 0) {
    const failPath = resolve(tierOut, "_parse_failures.json");
    await writeFile(
      failPath,
      `${JSON.stringify(failures, null, 2)}\n`,
      "utf8",
    );
  }
  console.log(
    `[parse-all] ${tier}: parsed=${parsed} failed=${failures.length} total=${entries.length}`,
  );
  return { parsed, failed: failures.length };
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
      await parseAllForTier(tier);
    } catch (err) {
      console.error(`[parse-all] ${tier} FAILED: ${String(err)}`);
    }
  }
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[parse-all] FAILED:", err);
    process.exit(1);
  });
}
