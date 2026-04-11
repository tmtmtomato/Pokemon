/**
 * fetch-format-index.ts — Track A
 *
 * Downloads the Pikalytics AI format index for a given format
 * (`https://www.pikalytics.com/ai/pokedex/{format}`) and writes both
 * the raw markdown and a structured `_index.json` describing the
 * top Pokemon for that format.
 *
 * CLI:
 *   npx tsx home-data/pikalytics/fetch-format-index.ts \
 *     --format championspreview \
 *     --date 2026-04-09
 *
 * Defaults: format=championspreview, date=today (UTC, YYYY-MM-DD).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  PikalyticsFormatIndex,
  PikalyticsFormatIndexEntry,
} from "../types/pikalytics.js";

const USER_AGENT =
  "ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)";
const BASE_URL = "https://www.pikalytics.com/ai/pokedex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage", "pikalytics");

interface CliArgs {
  format: string;
  date: string;
}

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { format: "championspreview", date: todayUtc() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format" && argv[i + 1]) {
      args.format = argv[i + 1]!;
      i++;
    } else if (a === "--date" && argv[i + 1]) {
      args.date = argv[i + 1]!;
      i++;
    }
  }
  return args;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

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
          `[fetch-format-index] attempt ${attempt} failed for ${url}: ${String(
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
 * Extract a top Pokemon listing from the Pikalytics format index markdown.
 *
 * The endpoint emits a top-50 table that we parse using a few tolerant
 * heuristics:
 *   - markdown table rows of the form: `| 1 | [Name](/...) | 12.34% | ...`
 *   - bullet rows: `- **Name**: 12.34%` or `1. Name — 12.34%`
 *   - inline link form `[Name](href) - 12.34%` (without leading rank)
 *
 * The first heuristic that yields >= 5 entries wins.
 */
export function parseFormatIndexMarkdown(
  format: string,
  md: string,
): PikalyticsFormatIndex {
  const fetchedAt = new Date().toISOString();
  const lines = md.split(/\r?\n/);

  const entries: PikalyticsFormatIndexEntry[] = [];
  const seen = new Set<string>();

  // ---- Heuristic 1: markdown tables ----
  // Try to find rows with rank | name | usage% style.
  const tableRowRe =
    /^\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
  for (const line of lines) {
    const m = tableRowRe.exec(line);
    if (m) {
      const rank = Number(m[1]);
      let name = m[2]!.trim();
      // strip markdown link syntax: [Name](href)
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)/.exec(name);
      let href: string | undefined;
      if (linkMatch) {
        name = linkMatch[1]!.trim();
        href = linkMatch[2]!.trim();
      }
      // strip surrounding **
      name = name.replace(/^\*\*(.*)\*\*$/, "$1").trim();
      const usagePct = Number(m[3]);
      if (!seen.has(name) && Number.isFinite(rank) && Number.isFinite(usagePct)) {
        entries.push({ name, usagePct, rank, href });
        seen.add(name);
      }
    }
  }

  // ---- Heuristic 2: ordered or bullet list ----
  if (entries.length < 5) {
    entries.length = 0;
    seen.clear();
    const listRe =
      /^\s*(?:[-*]|(\d+)\.)\s+\*?\*?\[?([A-Za-z0-9.\-' ]+?)\]?\*?\*?\s*(?:\([^)]*\))?\s*[:\-—]\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
    let autoRank = 0;
    for (const line of lines) {
      const m = listRe.exec(line);
      if (m) {
        autoRank++;
        const rank = m[1] ? Number(m[1]) : autoRank;
        const name = m[2]!.trim();
        const usagePct = Number(m[3]);
        if (!seen.has(name)) {
          entries.push({ name, usagePct, rank });
          seen.add(name);
        }
      }
    }
  }

  // ---- Heuristic 3: link with usage % anywhere on the line ----
  if (entries.length < 5) {
    entries.length = 0;
    seen.clear();
    const linkRe =
      /\[([A-Za-z0-9.\-' ]+?)\]\(([^)]+)\)[^0-9%]*([0-9]+(?:\.[0-9]+)?)\s*%/;
    let autoRank = 0;
    for (const line of lines) {
      const m = linkRe.exec(line);
      if (m) {
        const name = m[1]!.trim();
        const href = m[2]!.trim();
        const usagePct = Number(m[3]);
        if (!seen.has(name) && /pokedex/i.test(href)) {
          autoRank++;
          entries.push({ name, usagePct, rank: autoRank, href });
          seen.add(name);
        }
      }
    }
  }

  return {
    format,
    fetchedAt,
    topPokemon: entries,
  };
}

export async function fetchFormatIndex(args: CliArgs): Promise<{
  index: PikalyticsFormatIndex;
  mdPath: string;
  jsonPath: string;
}> {
  const url = `${BASE_URL}/${encodeURIComponent(args.format)}`;
  console.log(`[fetch-format-index] downloading ${url}`);
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const md = await res.text();

  const outDir = resolve(STORAGE_ROOT, args.date, args.format);
  await mkdir(outDir, { recursive: true });
  const mdPath = resolve(outDir, "_index.md");
  const jsonPath = resolve(outDir, "_index.json");

  await writeFile(mdPath, md, "utf8");
  console.log(
    `[fetch-format-index] saved ${md.length} bytes of markdown to ${mdPath}`,
  );

  const index = parseFormatIndexMarkdown(args.format, md);
  if (index.topPokemon.length === 0) {
    throw new Error(
      `[fetch-format-index] failed to parse any Pokemon from ${url} — markdown saved at ${mdPath} for inspection`,
    );
  }
  await writeFile(jsonPath, JSON.stringify(index, null, 2), "utf8");
  console.log(
    `[fetch-format-index] parsed ${index.topPokemon.length} Pokemon and wrote ${jsonPath}`,
  );

  return { index, mdPath, jsonPath };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  const args = parseCliArgs(process.argv.slice(2));
  fetchFormatIndex(args).catch((err) => {
    console.error("[fetch-format-index] FAILED:", err);
    process.exit(1);
  });
}
