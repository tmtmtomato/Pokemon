/**
 * Type definitions for the Pikalytics fetcher/parser pipeline (Track A).
 *
 * These shapes mirror the structured Markdown returned by the Pikalytics
 * `/ai/pokedex/{format}` and `/ai/pokedex/{format}/{pokemon}` endpoints.
 *
 * Percentages (`pct`, `usagePct`) are stored as numbers in the 0–100 range,
 * matching the raw values printed in the source markdown (e.g. `41.092`).
 */

export interface UsageRow {
  /** Display name as it appears in the source markdown (e.g. "Fake Out"). */
  name: string;
  /** Usage percentage in the 0–100 range. */
  pct: number;
}

export interface SpreadRow {
  /** EV spread, e.g. "252 HP / 252 Atk / 4 Spe". */
  ev: string;
  /** Nature, e.g. "Adamant". */
  nature: string;
  /** Usage percentage in the 0–100 range. */
  pct: number;
}

export interface PikalyticsBaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  bst: number;
}

export interface PikalyticsPokemonStats {
  /** Pokemon display name, e.g. "Incineroar". */
  pokemon: string;
  /** Format key, e.g. "championspreview". */
  format: string;
  /** Game label, e.g. "Pokémon Scarlet Violet". */
  game: string;
  /** Data refresh date as printed in the source markdown, e.g. "2026-03". */
  dataDate: string;
  /** Up to 10 most common moves. */
  moves: UsageRow[];
  /** Common abilities (any length). */
  abilities: UsageRow[];
  /** Common held items (any length). */
  items: UsageRow[];
  /** Common teammates. */
  teammates: UsageRow[];
  /** Tera Type usage, when reported. */
  teraTypes?: UsageRow[];
  /** EV spread/nature combinations, when reported. */
  spreads?: SpreadRow[];
  /** Base stats with derived BST. */
  baseStats: PikalyticsBaseStats;
  /** Original markdown source, preserved for downstream consumers. */
  rawMarkdown: string;
}

export interface PikalyticsFormatIndexEntry {
  /** Pokemon display name. */
  name: string;
  /** Usage percentage in the 0–100 range. */
  usagePct: number;
  /** 1-indexed rank within the format. */
  rank: number;
  /** Optional href if the source markdown includes a link. */
  href?: string;
}

export interface PikalyticsFormatIndex {
  /** Format key, e.g. "championspreview". */
  format: string;
  /** ISO timestamp of when the index was fetched. */
  fetchedAt: string;
  /** Top Pokemon listing extracted from the format index page. */
  topPokemon: PikalyticsFormatIndexEntry[];
}
