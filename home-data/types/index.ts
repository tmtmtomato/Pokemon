/**
 * Public type re-exports for the home-data module.
 *
 * Two layers:
 *   1. `api.ts` — raw HOME API response shapes
 *   2. `dex.ts` — dictionary file shapes
 *
 * Higher-level normalized/derived types (presets, distributions, etc.) will
 * live alongside the analyzer once that module exists.
 */

export type {
  SeasonEntry,
  SeasonListResponse,
  PokemonRankingEntry,
  PokemonRankingResponse,
  UsageEntry,
  TeammateEntry,
  PokemonDetail,
  PokemonDetailResponse,
} from "./api.js";

export type {
  DexJa,
  WazaInfoJa,
  TokuseiInfoJa,
  ItemInfoJa,
  ItemNameJa,
  ZknFormJa,
} from "./dex.js";

export type {
  UsageRow,
  SpreadRow,
  PikalyticsBaseStats,
  PikalyticsPokemonStats,
  PikalyticsFormatIndex,
  PikalyticsFormatIndexEntry,
} from "./pikalytics.js";

export type {
  ListingEntry,
  ReplayPlayer,
  ReplayMon,
  ReplayTeam,
  ReplayEvent,
  ParsedReplay,
} from "./replay.js";

export type {
  WeightedRow,
  PokemonMeta,
  FormatMeta,
  MetaSnapshot,
} from "./analytics.js";

export type {
  SelectionEntry,
  TeamEntry,
  CoreEntry,
  TeamAnalysis,
} from "./team-analysis.js";
