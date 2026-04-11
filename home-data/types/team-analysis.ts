/**
 * Type definitions for the team analysis pipeline.
 *
 * Consumed by both the aggregator (`team-aggregate.ts`) and the viewer
 * (`viewer-teams/`). Percentages are in the 0-100 range.
 */

export interface SelectionEntry {
  /** Sorted brought species (mega forms normalized to base). */
  species: string[];
  key: string;
  count: number;
  wins: number;
  winRate: number;
  /** Pick rate within this team composition (0-100). */
  pickRate: number;
}

export interface TeamEntry {
  /** Sorted preview species list (canonical key). */
  species: string[];
  key: string;
  count: number;
  wins: number;
  winRate: number;
  /** Top selection patterns, sorted by count descending. */
  selections: SelectionEntry[];
  /** Per-mon selection rate within this composition (species → 0-100). */
  perMonSelectionRate: Record<string, number>;
}

export interface CoreEntry {
  /** 3 species forming the core. */
  species: string[];
  key: string;
  /** Number of teams (previews) containing this core. */
  teamCount: number;
  /** Times all 3 appeared in brought together. */
  coPickCount: number;
  /** coPickCount / teamCount (0-100). */
  coPickRate: number;
  /** Win rate when all 3 co-picked (0-100). */
  coPickWinRate: number;
  /** Partial (2-of-3) pick patterns. */
  partialPicks: { pair: string[]; count: number; winRate: number }[];
  /** Top teams containing this core. */
  topTeams: { teamKey: string; count: number; winRate: number }[];
  /** Companion Pokemon for the remaining 3 slots. */
  companions: { name: string; count: number; pct: number }[];
}

export interface TeamAnalysis {
  generatedAt: string;
  tiers: string[];
  totalReplays: number;
  totalTeams: number;
  /** Teams with count >= threshold, sorted by count descending. */
  teams: TeamEntry[];
  /** 3-mon cores with teamCount >= threshold, sorted by teamCount descending. */
  cores: CoreEntry[];
}
