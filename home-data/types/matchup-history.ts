/**
 * Type definitions for cross-run matchup history accumulation.
 * Each pipeline run extracts a compact snapshot (~20KB) from the
 * full team-matchup output (~27MB) and appends it here.
 */

/** Compact team representation for history tracking */
export interface SnapshotTeam {
  rank: number;
  members: string[];
  winRate: number;
  compositeScore: number;
  deadMemberCount: number;
}

/** Compact snapshot extracted from a single pipeline run */
export interface MatchupSnapshot {
  /** ISO 8601 timestamp when this run completed */
  generatedAt: string;
  /** Date argument used for the run (e.g. "2026-04-13") */
  dateArg: string;
  /** Pipeline configuration for this run */
  config: {
    totalTeams: number;
    gamesPerTeam: number;
    poolSize: number;
    seed: number;
  };
  /** Top team win rate (convergence tracking) */
  topTeamWinRate: number;
  /** Top team composite score */
  topTeamCompositeScore: number;
  /** Top 10 teams: compact representation */
  topTeams: SnapshotTeam[];
  /** Pokemon pick rates in top-50 teams (name -> 0-1) */
  pokemonPickRates: Record<string, number>;
  /** Pokemon in-game selection rates (name -> 0-1) */
  pokemonSelectionRates: Record<string, number>;
  /** Top 10 three-Pokemon cores */
  topCores: { members: string[]; score: number }[];
  /** Pool size summary */
  poolStats: {
    total: number;
    megas: number;
  };
}

/** Root history document: accumulated across runs */
export interface MatchupHistory {
  /** Schema version for forward compatibility */
  version: 1;
  /** Ordered list of snapshots (oldest first) */
  snapshots: MatchupSnapshot[];
}
