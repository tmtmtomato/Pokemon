/**
 * fetch-llms.ts — Track A
 *
 * Downloads the Pikalytics `llms-full.txt` API specification document and
 * stores it under `home-data/storage/pikalytics/llms-full.txt`.
 *
 * This file is intentionally fetched without any caching: it is small and
 * acts as the unchanging reference for the rest of the Pikalytics fetcher
 * pipeline. Any existing copy is overwritten on each run.
 *
 * Usage:
 *   npx tsx home-data/pikalytics/fetch-llms.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USER_AGENT =
  "ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)";
const SOURCE_URL = "https://www.pikalytics.com/llms-full.txt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_DIR = resolve(__dirname, "..", "storage", "pikalytics");
const OUTPUT_PATH = resolve(STORAGE_DIR, "llms-full.txt");

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a URL with exponential backoff (3 attempts max).
 * Throws on persistent failure.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": USER_AGENT,
          ...(init?.headers ?? {}),
        },
      });
      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status} (server error) for ${url}`);
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const backoff = 1000 * Math.pow(2, attempt - 1);
        console.log(
          `[fetch-llms] attempt ${attempt} failed for ${url}: ${String(
            err,
          )}; backing off ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }
  }
  throw new Error(
    `fetchWithRetry: gave up after ${maxAttempts} attempts: ${String(
      lastError,
    )}`,
  );
}

async function main(): Promise<void> {
  console.log(`[fetch-llms] downloading ${SOURCE_URL}`);
  const res = await fetchWithRetry(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${SOURCE_URL}`);
  }
  const text = await res.text();
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, text, "utf8");
  console.log(
    `[fetch-llms] saved ${text.length} bytes to ${OUTPUT_PATH}`,
  );
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[fetch-llms] FAILED:", err);
    process.exit(1);
  });
}

export { main as fetchLlms };
