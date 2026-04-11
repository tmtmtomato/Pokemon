/**
 * Type definitions for Pokemon HOME battle data API responses.
 *
 * Source: api.battle.pokemon-home.com (SV via /tt/cbd/...) and
 *         resource.pokemon-home.com/battledata/ranking/scvi/...
 *
 * All schemas verified against real responses captured 2026-04-08.
 * See home-data/storage/raw-recon/*.json for sample data.
 */

// ---------------------------------------------------------------------------
// 1. Season list — POST /tt/cbd/competition/rankmatch/list
// ---------------------------------------------------------------------------

/**
 * Single season entry. A "season" in the API has multiple `cId` entries
 * (typically 2: one for single battles `rule:0` and one for double `rule:1`).
 */
export interface SeasonEntry {
  /** Opaque competition ID used in resource URLs (string of ~20 chars). */
  cId: string;
  /** Display name, e.g. "シーズン41". */
  name: string;
  /** Start datetime, format "YYYY/MM/DD HH:mm" (JST). */
  start: string;
  /** End datetime, same format. */
  end: string;
  /** Total number of trainers who joined. */
  cnt: number;
  /** Number of trainers who reached a published rank. */
  rankCnt?: number;
  /** Battle format. 0 = single, 1 = double. */
  rule: 0 | 1;
  /** Sequential season number, e.g. 41. */
  season: number;
  /**
   * "Rule set" version. Determines the second path segment of the resource URL:
   *   .../scvi/{cId}/{rst}/{ts2}/...
   */
  rst: number;
  /** Aggregation timestamp 1 (Unix seconds). */
  ts1: number;
  /**
   * Aggregation timestamp 2 (Unix seconds). Used as third path segment of
   * the resource URL — typically the "snapshot id" for the published stats.
   */
  ts2: number;
  /** Optional regulation tag, e.g. "I". May be absent for older seasons. */
  reg?: string;
}

/** Top-level shape of the rankmatch list response. */
export interface SeasonListResponse {
  code: number;
  detail: number;
  /**
   * Two-level map: list[seasonNumber][cId] = entry.
   * Season numbers are stringified (e.g. "1", "41").
   */
  list: Record<string, Record<string, SeasonEntry>>;
}

// ---------------------------------------------------------------------------
// 2. Pokemon usage ranking — GET .../scvi/{cId}/{rst}/{ts2}/pokemon
// ---------------------------------------------------------------------------

/** A single ranking entry: just the pokemon id and form. */
export interface PokemonRankingEntry {
  /** National Pokedex id. */
  id: number;
  /** Form index (0 = base form). */
  form: number;
}

/**
 * Pokemon usage ranking response. Object keyed by stringified rank index
 * (0-based). Typically 150 entries.
 *
 * Example: { "0": { id: 1007, form: 0 }, "1": { id: 1003, form: 0 }, ... }
 */
export type PokemonRankingResponse = Record<string, PokemonRankingEntry>;

// ---------------------------------------------------------------------------
// 3. Pokemon detail — GET .../scvi/{cId}/{rst}/{ts2}/pdetail-{1..6}
// ---------------------------------------------------------------------------

/**
 * A move/ability/nature/item/tera-type entry inside the temoti/win/lose
 * sections. The `id` is the dictionary key into 10-dex-ja.json (waza/tokusei/
 * seikaku/teraType) — note it's stringified even though it represents an
 * integer. The `val` is a usage percentage as a string, e.g. "69.8".
 */
export interface UsageEntry {
  id: string;
  val: string;
}

/**
 * A "teammate" entry — same shape as a ranking entry. Appears in
 * temoti.pokemon, win.pokemon, lose.pokemon to indicate which Pokemon
 * commonly appear on the same team.
 */
export interface TeammateEntry {
  id: number;
  form: number;
}

/**
 * Aggregated build statistics for a single (pokemon, form) — overall (temoti),
 * winning teams only (win), losing teams only (lose).
 *
 * - `temoti` is full: includes waza/tokusei/seikaku/motimono/pokemon/terastal.
 * - `win` and `lose` only include `waza` and `pokemon` arrays.
 *
 * All arrays are pre-sorted by usage percentage descending and capped to ~10
 * entries. Empty arrays are returned for low-usage Pokemon.
 */
export interface PokemonDetail {
  temoti: {
    waza: UsageEntry[];
    tokusei: UsageEntry[];
    seikaku: UsageEntry[];
    motimono: UsageEntry[];
    pokemon: TeammateEntry[];
    terastal: UsageEntry[];
  };
  win: {
    waza: UsageEntry[];
    pokemon: TeammateEntry[];
  };
  lose: {
    waza: UsageEntry[];
    pokemon: TeammateEntry[];
  };
}

/**
 * Top-level pdetail response. Two-level map:
 *
 *   { [pokemonId: string]: { [formIndex: string]: PokemonDetail } }
 *
 * Sharded by pokemon id range across 6 files (1-199, 200-398, 401-596,
 * 603-792, 800-999, 1000-1024). Only pokemon with sufficient usage are
 * included.
 */
export type PokemonDetailResponse = Record<string, Record<string, PokemonDetail>>;
