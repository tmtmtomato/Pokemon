/**
 * fetch-replays.ts — Track B / step 2
 *
 * Reads listing JSON produced by `enumerate.ts` and downloads every replay
 * HTML to `home-data/storage/vgcpast/replays/{safeTier}/{battleId}.html`.
 *
 * Concurrency model:
 *   - Up to 5 worker tasks pull from a single queue.
 *   - Each worker sleeps 250ms between requests (effective ~20 req/s total).
 *   - Failed URLs are retried with exponential backoff (1s/2s/4s) by the
 *     fetch helper. Persistent failures are logged to `_failures.json` in
 *     the same tier directory.
 *
 * The script is idempotent: any existing `{battleId}.html` is skipped unless
 * `--force` is supplied.
 *
 * Usage:
 *   npx tsx home-data/vgcpast/fetch-replays.ts                       # all tiers
 *   npx tsx home-data/vgcpast/fetch-replays.ts --tier Gen9VGCRegulationM-A
 *   npx tsx home-data/vgcpast/fetch-replays.ts --tier ... --limit 100
 *   npx tsx home-data/vgcpast/fetch-replays.ts --force
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ListingEntry } from "../types/replay.js";
import { TARGET_TIERS, safeTierName } from "./enumerate.js";

const USER_AGENT =
  "ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage", "vgcpast");
const LISTINGS_DIR = resolve(STORAGE_ROOT, "listings");
const REPLAYS_DIR = resolve(STORAGE_ROOT, "replays");

interface FailureRecord {
  url: string;
  battleId: string;
  status?: number;
  error: string;
  attempts: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch with exponential backoff. Returns the response body on success or
 * throws on persistent failure. 404 responses are returned as-is so the
 * caller can record them in failures without retrying further.
 */
async function fetchHtml(url: string): Promise<string> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status === 404) {
        throw Object.assign(new Error(`HTTP 404 for ${url}`), {
          status: 404,
          terminal: true,
        });
      }
      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastError = err;
      if (typeof err === "object" && err !== null && "terminal" in err) {
        throw err;
      }
      if (attempt < maxAttempts) {
        const backoff = 1000 * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`fetch failed: ${String(lastError)}`);
}

interface FetchTierOptions {
  limit?: number;
  force?: boolean;
}

async function loadListing(safeTier: string): Promise<ListingEntry[]> {
  const path = resolve(LISTINGS_DIR, `${safeTier}.json`);
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as ListingEntry[];
}

/** Fetch replays for one tier with the rate-limited worker pool. */
export async function fetchReplaysForTier(
  tier: string,
  opts: FetchTierOptions = {},
): Promise<{ saved: number; skipped: number; failed: number }> {
  const safeTier = safeTierName(tier);
  const tierDir = resolve(REPLAYS_DIR, safeTier);
  await mkdir(tierDir, { recursive: true });

  const all = await loadListing(safeTier);
  const entries = opts.limit ? all.slice(0, opts.limit) : all;
  const total = entries.length;

  const queue = entries.slice();
  let cursor = 0;
  let saved = 0;
  let skipped = 0;
  const failures: FailureRecord[] = [];

  const concurrency = 5;
  const workerDelayMs = 250;

  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = cursor++;
          if (i >= queue.length) return;
          const entry = queue[i];
          const dest = resolve(tierDir, `${entry.battleId}.html`);
          if (!opts.force && (await fileExists(dest))) {
            skipped++;
          } else {
            try {
              const html = await fetchHtml(entry.url);
              await writeFile(dest, html, "utf8");
              saved++;
            } catch (err) {
              const record: FailureRecord = {
                url: entry.url,
                battleId: entry.battleId,
                error: err instanceof Error ? err.message : String(err),
                attempts: 3,
              };
              if (typeof err === "object" && err !== null && "status" in err) {
                record.status = (err as { status: number }).status;
              }
              failures.push(record);
            }
          }
          const done = saved + skipped + failures.length;
          if (done % 100 === 0) {
            console.log(`[fetch-replays] ${tier} ${done}/${total} done`);
          }
          await sleep(workerDelayMs);
        }
      })(),
    );
  }
  await Promise.all(workers);

  if (failures.length > 0) {
    const failPath = resolve(tierDir, "_failures.json");
    await writeFile(
      failPath,
      `${JSON.stringify(failures, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `[fetch-replays] ${tier}: ${failures.length} failures → ${failPath}`,
    );
  }
  console.log(
    `[fetch-replays] ${tier}: saved=${saved} skipped=${skipped} failed=${failures.length} total=${total}`,
  );
  return { saved, skipped, failed: failures.length };
}

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
    try {
      await fetchReplaysForTier(tier, {
        limit: args.limit,
        force: args.force,
      });
    } catch (err) {
      console.error(`[fetch-replays] ${tier} FAILED: ${String(err)}`);
    }
  }
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[fetch-replays] FAILED:", err);
    process.exit(1);
  });
}
