/**
 * enumerate.ts — Track B / step 1
 *
 * Walks the vgcpast.es directory listings for every tier we care about and
 * extracts a structured ListingEntry[] for downstream fetching.
 *
 * For each tier we:
 *   1. fetch `https://replays.vgcpast.es/{encodedTier}/`
 *   2. cache the raw HTML to `home-data/storage/vgcpast/listings/{safeTier}.html`
 *   3. extract every `<a href="...html">` referencing a battle replay
 *   4. decompose the filename via the standard pattern
 *   5. write a `ListingEntry[]` JSON to `.../listings/{safeTier}.json`
 *
 * The script is idempotent: re-running with `--force` redownloads the HTML,
 * otherwise the cached copy is reused but the JSON is always rebuilt.
 *
 * Usage:
 *   npx tsx home-data/vgcpast/enumerate.ts            # all tiers
 *   npx tsx home-data/vgcpast/enumerate.ts --force    # bust the cache
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ListingEntry } from "../types/replay.js";

const USER_AGENT =
  "ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)";

/** Listing HTML cache TTL in milliseconds (6 hours). */
const LISTING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_DIR = resolve(__dirname, "..", "storage", "vgcpast", "listings");

/** All tiers we want to enumerate from vgcpast.es. */
export const TARGET_TIERS = [
  "Gen9VGCRegulationM-A",
  "Gen9VGCRegulationM-A(Bo3)",
  "Gen9Pre-ChampionsVGC",
  "Gen9Pre-ChampionsVGC(Bo3)",
  "Gen9Pre-ChampionsOU",
] as const;

/** Convert a tier into a filename-safe slug. */
export function safeTierName(tier: string): string {
  return tier.replace(/[()]/g, "_");
}

/**
 * URL-encode a tier or filename. `encodeURIComponent` is RFC 3986 strict
 * and intentionally leaves `( ) ! * '` alone, but the nginx instance backing
 * vgcpast.es returns 500 on a small fraction of requests when the literal
 * `(` and `)` characters appear in the path. Encoding them defensively
 * (the same way the listing HTML does — `%28` / `%29`) is harmless and
 * resolves those edge cases.
 */
export function encodeTier(tier: string): string {
  return encodeURIComponent(tier).replace(/[()]/g, (c) =>
    c === "(" ? "%28" : "%29",
  );
}

/** Encode a filename for URL use, also escaping `(` / `)`. */
export function encodeFile(file: string): string {
  return encodeURIComponent(file).replace(/[()]/g, (c) =>
    c === "(" ? "%28" : "%29",
  );
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

/** Check if a file exists AND is younger than the given TTL. */
async function isFreshCache(p: string, ttlMs: number): Promise<boolean> {
  try {
    const s = await stat(p);
    return Date.now() - s.mtimeMs < ttlMs;
  } catch {
    return false;
  }
}

/** Fetch with exponential backoff (1s, 2s, 4s) up to 3 attempts. */
async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const backoff = 1000 * Math.pow(2, attempt - 1);
        console.log(
          `[enumerate] attempt ${attempt} failed for ${url}: ${String(
            err,
          )}; backing off ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }
  }
  throw new Error(
    `fetchWithRetry: gave up after ${maxAttempts} attempts: ${String(lastError)}`,
  );
}

/**
 * Decompose a vgcpast filename into parts.
 *
 * Examples (token suffix is optional):
 *   Gen9VGCRegulationM-A_9wtt_VerdugoMC_battle-gen9vgcregulationma-716983.html
 *   Gen9VGCRegulationM-A_9wtt_adfla12_battle-gen9vgcregulationma-716577-ctm1bcyuylxrjpjdttigcuymv9hlptxpw.html
 *
 * Strategy:
 *   - Split off the trailing "_battle-{tierLower}-{battleId}[-{token}].html"
 *   - The remaining prefix is "{tier}_{p1}_{p2}". Tier may itself contain
 *     hyphens (e.g. "Gen9VGCRegulationM-A") but never underscores, so the
 *     first underscore separates tier and p1; the second separates p1 and p2.
 */
export function parseListingFilename(
  file: string,
): Omit<ListingEntry, "tier" | "safeTier" | "url"> | null {
  // Match the trailing battle component first.
  const battleRe = /^(?<prefix>.+)_battle-(?<tierLower>[a-z0-9]+)-(?<battleId>\d+)(?:-(?<token>[a-z0-9]+))?\.html$/;
  const m = file.match(battleRe);
  if (!m || !m.groups) return null;
  const { prefix, tierLower, battleId, token } = m.groups;
  // prefix = "{tierName}_{p1}_{p2}". Find the first underscore that splits
  // tier from players. Tier never has underscores; players never do either
  // (vgcpast sanitises usernames already). The first underscore is therefore
  // tier|rest, and the next underscore in `rest` is p1|p2.
  const firstUs = prefix.indexOf("_");
  if (firstUs === -1) return null;
  const tierName = prefix.slice(0, firstUs);
  const rest = prefix.slice(firstUs + 1);
  const secondUs = rest.indexOf("_");
  if (secondUs === -1) return null;
  const p1 = rest.slice(0, secondUs);
  const p2 = rest.slice(secondUs + 1);
  // Use tierName so the result is self-describing even if the directory tier
  // differs in casing (it shouldn't, but it's a safe sanity check).
  return {
    file,
    battleId,
    tierLower,
    p1,
    p2,
    token,
    hasToken: Boolean(token),
    // tier is filled in by the caller (so we keep the directory tier as truth).
  } as unknown as Omit<ListingEntry, "tier" | "safeTier" | "url">;
}

/** Extract every replay `<a href>` from a directory listing HTML. */
export function extractListingHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\s+href="([^"]+\.html)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    // Skip parent links and obvious non-replays.
    if (raw === "../" || raw === "./") continue;
    if (!raw.includes("battle-")) continue;
    out.push(raw);
  }
  return out;
}

interface EnumerateOptions {
  force?: boolean;
}

/**
 * Enumerate one tier: cache the listing HTML, then build a ListingEntry[]
 * JSON. Returns the number of replays found.
 */
export async function enumerateTier(
  tier: string,
  opts: EnumerateOptions = {},
): Promise<number> {
  const safeTier = safeTierName(tier);
  const url = `https://replays.vgcpast.es/${encodeTier(tier)}/`;
  const htmlPath = resolve(STORAGE_DIR, `${safeTier}.html`);
  const jsonPath = resolve(STORAGE_DIR, `${safeTier}.json`);

  await mkdir(STORAGE_DIR, { recursive: true });

  let html: string;
  if (!opts.force && (await isFreshCache(htmlPath, LISTING_CACHE_TTL_MS))) {
    console.log(`[enumerate] cached ${safeTier} → ${htmlPath}`);
    html = await readFile(htmlPath, "utf8");
  } else {
    const stale = await fileExists(htmlPath);
    console.log(`[enumerate] ${stale ? "refreshing (stale)" : "fetching"} ${url}`);
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    html = await res.text();
    await writeFile(htmlPath, html, "utf8");
    console.log(
      `[enumerate] saved ${html.length} bytes to ${htmlPath}`,
    );
  }

  const hrefs = extractListingHrefs(html);
  const entries: ListingEntry[] = [];
  let skipped = 0;
  for (const href of hrefs) {
    // Listings sometimes URL-encode the tier prefix; decode first.
    const decoded = decodeURIComponent(href);
    // The href is just the filename (relative to the directory).
    const file = decoded.replace(/^.*\//, "");
    const parsed = parseListingFilename(file);
    if (!parsed) {
      skipped++;
      continue;
    }
    entries.push({
      tier,
      safeTier,
      url: `${url}${encodeFile(file)}`,
      file: parsed.file,
      battleId: parsed.battleId,
      tierLower: parsed.tierLower,
      p1: parsed.p1,
      p2: parsed.p2,
      token: parsed.token,
      hasToken: parsed.hasToken,
    });
  }
  await writeFile(jsonPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(
    `[enumerate] ${tier}: ${entries.length} replays (${skipped} skipped) → ${jsonPath}`,
  );
  return entries.length;
}

interface CliArgs {
  force: boolean;
  tier?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--tier") args.tier = argv[++i];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tiers = args.tier ? [args.tier] : [...TARGET_TIERS];
  let total = 0;
  for (const tier of tiers) {
    try {
      total += await enumerateTier(tier, { force: args.force });
    } catch (err) {
      console.error(`[enumerate] ${tier} FAILED: ${String(err)}`);
    }
  }
  console.log(`[enumerate] DONE: ${total} replay URLs across ${tiers.length} tiers`);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[enumerate] FAILED:", err);
    process.exit(1);
  });
}
