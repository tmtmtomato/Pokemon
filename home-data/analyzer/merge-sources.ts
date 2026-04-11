/**
 * merge-sources.ts — Track C / step 1
 *
 * Merges the Pikalytics per-format top-50 dumps (Track A) with the
 * vgcpast.es tier aggregates (Track B) into a single `MetaSnapshot` JSON
 * document keyed by format. The result lives in
 * `home-data/storage/analysis/{date}-meta.json` and feeds both the
 * distributions step and the HTML viewer.
 *
 * Merge policy:
 *   - Pikalytics is the preferred source for usagePct / rank / moves /
 *     abilities / items / teammates because it samples a much wider
 *     ladder than the vgcpast replay archive.
 *   - vgcpast is the preferred source for winRate and any raw sample
 *     counts (`WeightedRow.n`). A short note describing the sample size
 *     is appended to `PokemonMeta.notes`.
 *   - Pokemon that appear in vgcpast but not in Pikalytics are still
 *     emitted with vgcpast-derived rows so that the viewer can see the
 *     long tail.
 *
 * CLI:
 *   npx tsx home-data/analyzer/merge-sources.ts --date 2026-04-08
 *
 * If `--date` is omitted the today's UTC date is used; if no Pikalytics
 * directory exists for today, the latest date found under
 * `storage/pikalytics/` is picked automatically.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  PikalyticsFormatIndex,
  PikalyticsPokemonStats,
  UsageRow,
} from "../types/pikalytics.js";
import type {
  FormatMeta,
  MetaSnapshot,
  PokemonMeta,
  TopBuild,
  WeightedRow,
} from "../types/analytics.js";

import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage");
const PIKALYTICS_ROOT = resolve(STORAGE_ROOT, "pikalytics");
const VGCPAST_PARSED_ROOT = resolve(STORAGE_ROOT, "vgcpast", "parsed");
const ANALYSIS_ROOT = resolve(STORAGE_ROOT, "analysis");

// Legal abilities per species (built from Showdown pokedex + Champions data).
const require_ = createRequire(import.meta.url);
const LEGAL_ABILITIES: Record<string, string[]> = require_(
  resolve(STORAGE_ROOT, "i18n", "species-abilities.json"),
);

/** Mapping: Pikalytics format key → vgcpast tier (safeTier) list. */
const FORMAT_TO_TIERS: Record<string, string[]> = {
  championspreview: [
    "Gen9VGCRegulationM-A",
    "Gen9VGCRegulationM-A_Bo3_",
    "Gen9Pre-ChampionsVGC",
    "Gen9Pre-ChampionsVGC_Bo3_",
  ],
  gen9ou: ["Gen9Pre-ChampionsOU"],
};

const FORMAT_DISPLAY: Record<string, string> = {
  championspreview: "Pokemon Champions VGC 2026 (preview)",
  gen9ou: "Gen 9 OU (Pre-Champions)",
};

// ---------------------------------------------------------------------------
// vgcpast summary type (mirrors aggregate.ts output)
// ---------------------------------------------------------------------------

export interface VgcpastPokemonSummary {
  usageCount: number;
  usagePct: number;
  brought: number;
  wins: number;
  winRate: number;
  /** Times in team preview (party registration). */
  registered: number;
  /** Selection rate: brought / registered (0-100). */
  selectionRate: number;
  items: Record<string, number>;
  abilities: Record<string, number>;
  moves: Record<string, number>;
  moveWins?: Record<string, number>;
  teraTypes: Record<string, number>;
  teammates: Record<string, number>;
  opponents: Record<string, number>;
  /** Co-occurrence in team preview (party-level). */
  partymates: Record<string, number>;
}

export interface VgcpastTierSummary {
  tier: string;
  safeTier: string;
  totalReplays: number;
  pokemon: Record<string, VgcpastPokemonSummary>;
}

// ---------------------------------------------------------------------------
// Combined vgcpast per-format accumulator (sums multiple tiers)
// ---------------------------------------------------------------------------

export interface VgcpastFormatAggregate {
  totalReplays: number;
  pokemon: Record<string, VgcpastPokemonSummary>;
  tierLabels: string[];
}

/**
 * Merge multiple vgcpast tier summaries into a single aggregate keyed by
 * species. Counts are summed; the usagePct / winRate fields are
 * recomputed from the merged totals.
 */
export function combineVgcpastTiers(
  summaries: VgcpastTierSummary[],
): VgcpastFormatAggregate {
  const combined: Record<string, VgcpastPokemonSummary> = {};
  let totalReplays = 0;
  const tierLabels: string[] = [];

  for (const s of summaries) {
    totalReplays += s.totalReplays;
    tierLabels.push(`${s.tier} (${s.totalReplays})`);
    for (const [species, row] of Object.entries(s.pokemon)) {
      const existing = (combined[species] ??= {
        usageCount: 0,
        usagePct: 0,
        brought: 0,
        wins: 0,
        winRate: 0,
        registered: 0,
        selectionRate: 0,
        items: {},
        abilities: {},
        moves: {},
        moveWins: {},
        teraTypes: {},
        teammates: {},
        opponents: {},
        partymates: {},
      });
      existing.usageCount += row.usageCount;
      existing.brought += row.brought;
      existing.wins += row.wins;
      existing.registered += row.registered ?? 0;
      mergeCounts(existing.items, row.items);
      mergeCounts(existing.abilities, row.abilities);
      mergeCounts(existing.moves, row.moves);
      if (row.moveWins) mergeCounts(existing.moveWins ??= {}, row.moveWins);
      mergeCounts(existing.teraTypes, row.teraTypes);
      mergeCounts(existing.teammates, row.teammates);
      mergeCounts(existing.opponents, row.opponents);
      if (row.partymates) mergeCounts(existing.partymates, row.partymates);
    }
  }

  // Recompute derived percentages on the merged totals.
  const totalSlots = totalReplays * 2;
  for (const row of Object.values(combined)) {
    row.usagePct = totalSlots > 0 ? (row.usageCount / totalSlots) * 100 : 0;
    row.winRate = row.usageCount > 0 ? (row.wins / row.usageCount) * 100 : 0;
    row.selectionRate = row.registered > 0 ? (row.brought / row.registered) * 100 : 0;
  }

  return { totalReplays, pokemon: combined, tierLabels };
}

function mergeCounts(
  into: Record<string, number>,
  from: Record<string, number>,
): void {
  for (const [k, v] of Object.entries(from)) {
    into[k] = (into[k] ?? 0) + v;
  }
}

// ---------------------------------------------------------------------------
// Row conversion helpers
// ---------------------------------------------------------------------------

function pikalyticsRows(rows: UsageRow[] | undefined): WeightedRow[] {
  if (!rows) return [];
  return rows.map((r) => ({ name: r.name, pct: r.pct }));
}

/**
 * Filter ability rows to only include abilities the species can
 * legitimately have (per Showdown pokedex + Champions data).
 * Removes noise like "Sushi Plate" appearing on Incineroar.
 */
function filterLegalAbilities(
  rows: WeightedRow[],
  species: string,
): WeightedRow[] {
  const legal = LEGAL_ABILITIES[species];
  if (!legal) return rows; // unknown species → keep all
  const legalSet = new Set(legal);
  return rows.filter((r) => legalSet.has(r.name));
}

/**
 * Normalize rows so their `pct` values sum to 100.
 * Use for distributions where each Pokemon has exactly one choice
 * (abilities, items, tera types) — NOT for moves or teammates.
 */
function normalizeRows(rows: WeightedRow[]): WeightedRow[] {
  if (rows.length === 0) return rows;
  const total = rows.reduce((s, r) => s + r.pct, 0);
  if (total <= 0) return rows;
  return rows.map((r) => ({ ...r, pct: (r.pct / total) * 100 }));
}

/**
 * Parse the "top build" line from the Pikalytics FAQ markdown blob.
 * Pikalytics writes one of two messages in the FAQ section:
 *
 *   "The top build for X features a **Relaxed** nature with an EV
 *    spread of `252/0/236/0/20/0`. This configuration accounts for
 *    20.406% of competitive builds."
 *
 *   "No EV spread or nature data available."
 *
 * Returns `undefined` for the latter (and for any other unrecognised
 * shape so the field gracefully drops out of the snapshot).
 */
export function parseTopBuild(rawMarkdown: string | undefined): TopBuild | undefined {
  if (!rawMarkdown) return undefined;
  const re =
    /top build for [^*]+features a \*\*([^*]+)\*\* nature with an EV spread of `([0-9]+(?:\/[0-9]+){5})`\.\s*This configuration accounts for ([0-9.]+)%/i;
  const m = re.exec(rawMarkdown);
  if (!m) return undefined;
  const nature = m[1].trim();
  const evs = m[2].trim();
  const pct = Number(m[3]);
  if (!nature || !evs || !Number.isFinite(pct)) return undefined;
  return { nature, evs, pct };
}

function countsToWeightedRows(
  counts: Record<string, number>,
  total: number,
  winCounts?: Record<string, number>,
): WeightedRow[] {
  if (total <= 0) return [];
  const rows: WeightedRow[] = [];
  for (const [name, n] of Object.entries(counts)) {
    if (n <= 0) continue;
    const row: WeightedRow = { name, pct: (n / total) * 100, n };
    if (winCounts && n > 0) {
      const wins = winCounts[name] ?? 0;
      row.winRate = (wins / n) * 100;
    }
    rows.push(row);
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

// ---------------------------------------------------------------------------
// Merge of a single format (Pikalytics + combined vgcpast aggregate)
// ---------------------------------------------------------------------------

export interface FormatInputs {
  formatKey: string;
  display?: string;
  pikalyticsIndex?: PikalyticsFormatIndex | null;
  pikalyticsStats: PikalyticsPokemonStats[];
  vgcpast: VgcpastFormatAggregate | null;
}

/**
 * Build a `FormatMeta` from one format's worth of Pikalytics + vgcpast
 * source material. This is the pure function under test; the file I/O
 * wrappers live below.
 */
export function mergeFormat(inputs: FormatInputs): FormatMeta {
  const { formatKey, pikalyticsIndex, pikalyticsStats, vgcpast } = inputs;
  const display =
    inputs.display ?? FORMAT_DISPLAY[formatKey] ?? formatKey;

  // Index Pikalytics data by species name.
  const pikaStatsByName = new Map<string, PikalyticsPokemonStats>();
  for (const s of pikalyticsStats) pikaStatsByName.set(s.pokemon, s);

  const pikaIndexEntries = pikalyticsIndex?.topPokemon ?? [];
  const pikaRankByName = new Map<string, number>();
  const pikaUsageByName = new Map<string, number>();
  for (const e of pikaIndexEntries) {
    pikaRankByName.set(e.name, e.rank);
    pikaUsageByName.set(e.name, e.usagePct);
  }

  const allNames = new Set<string>();
  for (const name of pikaStatsByName.keys()) allNames.add(name);
  for (const name of pikaRankByName.keys()) allNames.add(name);
  if (vgcpast) {
    for (const name of Object.keys(vgcpast.pokemon)) allNames.add(name);
  }

  const sources: ("pikalytics" | "vgcpast" | "home")[] = [];
  if (pikalyticsStats.length > 0 || pikaIndexEntries.length > 0) {
    sources.push("pikalytics");
  }
  if (vgcpast && vgcpast.totalReplays > 0) sources.push("vgcpast");

  const pokemonMetas: PokemonMeta[] = [];
  for (const name of allNames) {
    const pikaStats = pikaStatsByName.get(name);
    const pikaUsage = pikaUsageByName.get(name);
    const pikaRank = pikaRankByName.get(name);
    const vgcRow = vgcpast?.pokemon[name];

    const notes: string[] = [];

    // Usage percentage — prefer Pikalytics index, fall back to vgcpast.
    let usagePct = 0;
    if (pikaUsage !== undefined) {
      usagePct = pikaUsage;
    } else if (vgcRow) {
      usagePct = vgcRow.usagePct;
    }

    // Moves / abilities / items / teammates: Pikalytics if present,
    // otherwise vgcpast counts-derived percentages.
    let moves: WeightedRow[];
    let abilities: WeightedRow[];
    let items: WeightedRow[];
    let teammates: WeightedRow[];
    let teraTypes: WeightedRow[] | undefined;

    let topBuild: TopBuild | undefined;
    if (pikaStats) {
      moves = pikalyticsRows(pikaStats.moves);
      // Enrich Pikalytics move rows with vgcpast per-move win rates when available.
      if (vgcRow?.moveWins && vgcRow.moves) {
        for (const row of moves) {
          const moveCount = vgcRow.moves[row.name];
          const moveWins = vgcRow.moveWins[row.name];
          if (moveCount && moveCount > 0) {
            row.winRate = ((moveWins ?? 0) / moveCount) * 100;
          }
        }
      }
      abilities = normalizeRows(
        filterLegalAbilities(pikalyticsRows(pikaStats.abilities), name),
      );
      // Fall back to vgcpast abilities when Pikalytics data was all noise.
      if (abilities.length === 0 && vgcRow) {
        abilities = normalizeRows(
          filterLegalAbilities(
            countsToWeightedRows(vgcRow.abilities, vgcRow.usageCount),
            name,
          ),
        );
      }
      items = normalizeRows(pikalyticsRows(pikaStats.items));
      teammates = pikalyticsRows(pikaStats.teammates);
      teraTypes = pikaStats.teraTypes
        ? normalizeRows(pikalyticsRows(pikaStats.teraTypes))
        : undefined;
      topBuild = parseTopBuild(pikaStats.rawMarkdown);
      notes.push(`Pikalytics ${pikaStats.dataDate}`);
    } else if (vgcRow) {
      moves = countsToWeightedRows(vgcRow.moves, vgcRow.usageCount, vgcRow.moveWins);
      abilities = normalizeRows(
        filterLegalAbilities(countsToWeightedRows(vgcRow.abilities, vgcRow.usageCount), name),
      );
      items = normalizeRows(countsToWeightedRows(vgcRow.items, vgcRow.usageCount));
      teammates = countsToWeightedRows(vgcRow.teammates, vgcRow.usageCount);
      const teraRows = normalizeRows(countsToWeightedRows(
        vgcRow.teraTypes,
        vgcRow.usageCount,
      ));
      teraTypes = teraRows.length > 0 ? teraRows : undefined;
    } else {
      moves = [];
      abilities = [];
      items = [];
      teammates = [];
    }

    // vgcpast notes + winRate.
    let winRate: number | undefined;
    if (vgcRow) {
      winRate = vgcRow.winRate;
      notes.push(
        `vgcpast ${vgcRow.usageCount} games (wr ${vgcRow.winRate.toFixed(1)}%)`,
      );
    }

    // Party-level data from vgcpast.
    let partymates: WeightedRow[] | undefined;
    let selectionRate: number | undefined;
    let registered: number | undefined;
    if (vgcRow && vgcRow.registered > 0) {
      selectionRate = vgcRow.selectionRate;
      registered = vgcRow.registered;
      const pmRows = countsToWeightedRows(
        vgcRow.partymates ?? {},
        vgcRow.registered,
      );
      if (pmRows.length > 0) partymates = pmRows;
    }

    pokemonMetas.push({
      name,
      usagePct,
      rank: pikaRank ?? 0,
      winRate,
      moves,
      abilities,
      items,
      teraTypes,
      teammates,
      partymates,
      selectionRate,
      registered,
      topBuild,
      notes,
    });
  }

  // Rank ordering: Pikalytics rank first (ascending), with unranked
  // (rank === 0) entries sorted by usagePct descending and then alpha.
  pokemonMetas.sort((a, b) => {
    const aRanked = a.rank > 0;
    const bRanked = b.rank > 0;
    if (aRanked && bRanked) return a.rank - b.rank;
    if (aRanked) return -1;
    if (bRanked) return 1;
    if (b.usagePct !== a.usagePct) return b.usagePct - a.usagePct;
    return a.name.localeCompare(b.name);
  });

  // Backfill a synthetic rank for entries that only appear in vgcpast
  // so the viewer can still order them sensibly.
  let nextRank = pokemonMetas.reduce((max, p) => Math.max(max, p.rank), 0) + 1;
  for (const p of pokemonMetas) {
    if (p.rank === 0) {
      p.rank = nextRank++;
    }
  }

  return {
    formatKey,
    display,
    sources,
    totalReplays: vgcpast?.totalReplays ?? 0,
    totalTeams: (vgcpast?.totalReplays ?? 0) * 2,
    pokemon: pokemonMetas,
  };
}

// ---------------------------------------------------------------------------
// File I/O glue
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function pickLatestPikalyticsDate(): Promise<string | null> {
  try {
    const entries = await readdir(PIKALYTICS_ROOT);
    const dateLike = entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e));
    if (dateLike.length === 0) return null;
    dateLike.sort();
    return dateLike[dateLike.length - 1];
  } catch {
    return null;
  }
}

async function readPikalyticsFormat(
  date: string,
  formatKey: string,
): Promise<{
  index: PikalyticsFormatIndex | null;
  stats: PikalyticsPokemonStats[];
}> {
  const formatDir = resolve(PIKALYTICS_ROOT, date, formatKey);
  if (!(await fileExists(formatDir))) {
    return { index: null, stats: [] };
  }
  let index: PikalyticsFormatIndex | null = null;
  const indexPath = resolve(formatDir, "_index.json");
  if (await fileExists(indexPath)) {
    try {
      index = JSON.parse(await readFile(indexPath, "utf8")) as PikalyticsFormatIndex;
    } catch (err) {
      console.warn(
        `[merge-sources] ${formatKey}: failed to parse _index.json: ${String(err)}`,
      );
    }
  }
  const files = (await readdir(formatDir)).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  );
  const stats: PikalyticsPokemonStats[] = [];
  for (const file of files) {
    const path = resolve(formatDir, file);
    try {
      const parsed = JSON.parse(
        await readFile(path, "utf8"),
      ) as PikalyticsPokemonStats;
      // Pikalytics' page-title scrape sometimes drops the form suffix
      // (e.g. Ogerpon-Wellspring.json contains `pokemon: "Ogerpon"`),
      // which would mis-key the merge step. The file basename always
      // matches the Pikalytics URL slug and is form-aware, so trust it.
      const basename = file.replace(/\.json$/, "");
      if (parsed.pokemon !== basename) {
        parsed.pokemon = basename;
      }
      stats.push(parsed);
    } catch (err) {
      console.warn(
        `[merge-sources] ${formatKey}: failed to read ${file}: ${String(err)}`,
      );
    }
  }
  return { index, stats };
}

async function readVgcpastTierSummary(
  safeTier: string,
): Promise<VgcpastTierSummary | null> {
  const summaryPath = resolve(VGCPAST_PARSED_ROOT, safeTier, "_summary.json");
  if (!(await fileExists(summaryPath))) return null;
  try {
    return JSON.parse(await readFile(summaryPath, "utf8")) as VgcpastTierSummary;
  } catch (err) {
    console.warn(
      `[merge-sources] ${safeTier}: failed to parse summary: ${String(err)}`,
    );
    return null;
  }
}

async function readVgcpastForFormat(
  formatKey: string,
): Promise<VgcpastFormatAggregate | null> {
  const tiers = FORMAT_TO_TIERS[formatKey] ?? [];
  if (tiers.length === 0) return null;
  const summaries: VgcpastTierSummary[] = [];
  for (const safeTier of tiers) {
    const s = await readVgcpastTierSummary(safeTier);
    if (s) summaries.push(s);
  }
  if (summaries.length === 0) return null;
  return combineVgcpastTiers(summaries);
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

export async function mergeAllSources(
  requestedDate: string | undefined,
): Promise<{ path: string; snapshot: MetaSnapshot; date: string }> {
  let date = requestedDate ?? todayUtc();
  const candidateDir = resolve(PIKALYTICS_ROOT, date);
  if (!(await fileExists(candidateDir))) {
    const fallback = await pickLatestPikalyticsDate();
    if (fallback) {
      console.log(
        `[merge-sources] no pikalytics data for ${date}, falling back to ${fallback}`,
      );
      date = fallback;
    } else {
      console.warn(
        `[merge-sources] no pikalytics directory found for ${date} and no fallback available`,
      );
    }
  }

  const formatKeys = Object.keys(FORMAT_TO_TIERS);
  // Also include any Pikalytics format directory that exists for the date
  // but isn't in the mapping table — we still want to surface it in the
  // meta snapshot even without a vgcpast counterpart.
  try {
    const extra = await readdir(resolve(PIKALYTICS_ROOT, date));
    for (const name of extra) {
      if (!formatKeys.includes(name)) {
        const dir = resolve(PIKALYTICS_ROOT, date, name);
        const st = await stat(dir).catch(() => null);
        if (st?.isDirectory()) formatKeys.push(name);
      }
    }
  } catch {
    // ignore — we already warned above
  }

  const formats: FormatMeta[] = [];
  for (const formatKey of formatKeys) {
    console.log(`[merge-sources] merging format ${formatKey}`);
    const pika = await readPikalyticsFormat(date, formatKey);
    const vgc = await readVgcpastForFormat(formatKey);
    const format = mergeFormat({
      formatKey,
      pikalyticsIndex: pika.index,
      pikalyticsStats: pika.stats,
      vgcpast: vgc,
    });
    console.log(
      `[merge-sources]   ${formatKey}: ${format.pokemon.length} pokemon (${format.sources.join(
        "+",
      )}), vgcpast replays=${format.totalReplays}`,
    );
    formats.push(format);
  }

  const snapshot: MetaSnapshot = {
    generatedAt: new Date().toISOString(),
    formats,
  };

  await mkdir(ANALYSIS_ROOT, { recursive: true });
  const outPath = resolve(ANALYSIS_ROOT, `${date}-meta.json`);
  await writeFile(outPath, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`[merge-sources] wrote ${outPath}`);
  return { path: outPath, snapshot, date };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  await mergeAllSources(args.date);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[merge-sources] FAILED:", err);
    process.exit(1);
  });
}
