/**
 * fetch-pokemon.ts — Track A
 *
 * Reads `_index.json` for the requested format/date and downloads the
 * Pikalytics AI markdown for every Pokemon listed
 * (`https://www.pikalytics.com/ai/pokedex/{format}/{Pokemon}`).
 *
 * Files are written to `home-data/storage/pikalytics/{date}/{format}/{Pokemon}.md`.
 *
 * Behaviour:
 *  - 800ms sleep between successful requests (politeness towards Pikalytics).
 *  - Skip already-downloaded files unless `--force` is given.
 *  - Failures are recorded into `_failures.json` and execution continues.
 *  - Up to 3 retry attempts with exponential backoff for transient errors.
 *
 * CLI:
 *   npx tsx home-data/pikalytics/fetch-pokemon.ts --format championspreview
 *   npx tsx home-data/pikalytics/fetch-pokemon.ts --format gen9ou --force
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PikalyticsFormatIndex } from "../types/pikalytics.js";

const USER_AGENT =
  "ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)";
const BASE_URL = "https://www.pikalytics.com/ai/pokedex";
const SLEEP_MS = 800;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage", "pikalytics");

interface CliArgs {
  format: string;
  date: string;
  force: boolean;
}

interface FailureRecord {
  pokemon: string;
  url: string;
  status?: number;
  error?: string;
  attemptedAt: string;
}

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    format: "championspreview",
    date: todayUtc(),
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format" && argv[i + 1]) {
      args.format = argv[i + 1]!;
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch a URL with exponential backoff (3 attempts max).
 * Returns the Response on the first non-retriable result (any status < 500).
 */
async function fetchWithRetry(
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
          `[fetch-pokemon] attempt ${attempt} failed for ${url}: ${String(
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

/**
 * Pikalytics URLs use space-encoded names (e.g. `Mr.%20Mime`).
 * `encodeURIComponent` encodes "/" and other reserved chars too — exactly what
 * we want for a single path segment.
 */
export function encodePokemonForUrl(name: string): string {
  return encodeURIComponent(name);
}

/**
 * Sanitize Pokemon name for use as a filename (Mr. Mime → "Mr. Mime.md" stays
 * but we strip path separators just in case).
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

export async function fetchPokemonForFormat(args: CliArgs): Promise<{
  successCount: number;
  skipCount: number;
  failureCount: number;
  failures: FailureRecord[];
}> {
  const outDir = resolve(STORAGE_ROOT, args.date, args.format);
  const indexPath = resolve(outDir, "_index.json");
  const failuresPath = resolve(outDir, "_failures.json");

  const raw = await readFile(indexPath, "utf8");
  const index: PikalyticsFormatIndex = JSON.parse(raw);
  if (!Array.isArray(index.topPokemon) || index.topPokemon.length === 0) {
    throw new Error(`[fetch-pokemon] empty top Pokemon in ${indexPath}`);
  }

  console.log(
    `[fetch-pokemon] format=${args.format} date=${args.date} count=${index.topPokemon.length} force=${args.force}`,
  );

  await mkdir(outDir, { recursive: true });

  const failures: FailureRecord[] = [];
  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < index.topPokemon.length; i++) {
    const entry = index.topPokemon[i]!;
    const filename = `${sanitizeFilename(entry.name)}.md`;
    const filepath = resolve(outDir, filename);

    if (!args.force && (await fileExists(filepath))) {
      skipCount++;
      if ((i + 1) % 10 === 0) {
        console.log(
          `[fetch-pokemon] progress ${i + 1}/${index.topPokemon.length} (skip:${skipCount} ok:${successCount} fail:${failures.length})`,
        );
      }
      continue;
    }

    const url = `${BASE_URL}/${encodeURIComponent(args.format)}/${encodePokemonForUrl(entry.name)}`;
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        failures.push({
          pokemon: entry.name,
          url,
          status: res.status,
          error: `HTTP ${res.status} ${res.statusText}`,
          attemptedAt: new Date().toISOString(),
        });
        console.log(
          `[fetch-pokemon] FAIL ${entry.name}: HTTP ${res.status}`,
        );
      } else {
        const md = await res.text();
        await writeFile(filepath, md, "utf8");
        successCount++;
      }
    } catch (err) {
      failures.push({
        pokemon: entry.name,
        url,
        error: String(err),
        attemptedAt: new Date().toISOString(),
      });
      console.log(`[fetch-pokemon] ERROR ${entry.name}: ${String(err)}`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(
        `[fetch-pokemon] progress ${i + 1}/${index.topPokemon.length} (ok:${successCount} skip:${skipCount} fail:${failures.length})`,
      );
    }

    await sleep(SLEEP_MS);
  }

  if (failures.length > 0) {
    await writeFile(failuresPath, JSON.stringify(failures, null, 2), "utf8");
    console.log(
      `[fetch-pokemon] wrote ${failures.length} failure record(s) to ${failuresPath}`,
    );
  }

  console.log(
    `[fetch-pokemon] done format=${args.format} ok=${successCount} skip=${skipCount} fail=${failures.length}`,
  );

  return {
    successCount,
    skipCount,
    failureCount: failures.length,
    failures,
  };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  const args = parseCliArgs(process.argv.slice(2));
  fetchPokemonForFormat(args).catch((err) => {
    console.error("[fetch-pokemon] FAILED:", err);
    process.exit(1);
  });
}
