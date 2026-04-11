/**
 * Type definitions for the analyzer pipeline (Track C).
 *
 * These shapes describe the merged meta snapshot produced by
 * `analyzer/merge-sources.ts`, which fuses Pikalytics per-format top-50
 * dumps (Track A) with vgcpast.es replay aggregates (Track B) into a
 * single `MetaSnapshot` document keyed by format.
 *
 * Percentages are stored in the 0-100 range to match the upstream
 * Pikalytics data. `WeightedRow.n` is an optional raw count from the
 * vgcpast aggregates; it is `undefined` when the source did not provide
 * a sample size (e.g. when a row came from Pikalytics only).
 */

export interface WeightedRow {
  /** Display name of the move / item / ability / teammate. */
  name: string;
  /** Usage percentage in the 0-100 range. */
  pct: number;
  /** Optional raw sample count backing the percentage (vgcpast only). */
  n?: number;
  /** Optional win rate in the 0-100 range when this row was used (vgcpast moves only). */
  winRate?: number;
}

/**
 * Pikalytics "top build" — single most-common nature + EV spread combo
 * with its adoption rate. The spread is the raw Pikalytics string in the
 * canonical HP/Atk/Def/SpA/SpD/Spe order, e.g. "252/0/236/0/20/0".
 */
export interface TopBuild {
  /** Nature name in English, e.g. "Relaxed". */
  nature: string;
  /** Slash-separated EV spread, HP/Atk/Def/SpA/SpD/Spe. */
  evs: string;
  /** Percentage of competitive builds matching this configuration. */
  pct: number;
}

export interface PokemonMeta {
  /** Canonical species display name, e.g. "Incineroar" or "Gengar-Mega". */
  name: string;
  /** Usage percentage in the 0-100 range (Pikalytics-preferred). */
  usagePct: number;
  /** 1-indexed rank within the format (Pikalytics-preferred). */
  rank: number;
  /** Observed win rate in the 0-100 range (vgcpast, when available). */
  winRate?: number;
  /** Common moves distribution. */
  moves: WeightedRow[];
  /** Common abilities distribution. */
  abilities: WeightedRow[];
  /** Common held items distribution. */
  items: WeightedRow[];
  /** Tera type distribution, when reported. */
  teraTypes?: WeightedRow[];
  /** Common teammates distribution (brought / selection level). */
  teammates: WeightedRow[];
  /** Party-level teammates (team preview / registration level, vgcpast only). */
  partymates?: WeightedRow[];
  /** Selection rate: how often this Pokemon is brought when registered (0-100, vgcpast only). */
  selectionRate?: number;
  /** Times this Pokemon appeared in team preview (vgcpast only). */
  registered?: number;
  /** Optional matchup counters (reserved for future use). */
  counters?: WeightedRow[];
  /** Most common nature + EV spread, parsed from Pikalytics FAQ markdown. */
  topBuild?: TopBuild;
  /** Free-form notes describing the data sources used. */
  notes: string[];
}

export interface FormatMeta {
  /** Format key, e.g. "championspreview" or "gen9ou". */
  formatKey: string;
  /** Human-readable format label. */
  display: string;
  /** List of data sources that contributed to this format. */
  sources: ("pikalytics" | "vgcpast" | "home")[];
  /** Sum of vgcpast replays used (0 when no vgcpast tier mapped). */
  totalReplays: number;
  /** Sum of teams observed across vgcpast tiers (totalReplays * 2). */
  totalTeams: number;
  /** Per-Pokemon meta entries, rank-ordered ascending. */
  pokemon: PokemonMeta[];
}

export interface MetaSnapshot {
  /** ISO timestamp when the snapshot was generated. */
  generatedAt: string;
  /** Per-format meta data. */
  formats: FormatMeta[];
}
