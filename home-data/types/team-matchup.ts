/**
 * Type definitions for the 3/6 Singles Team Matchup analysis system.
 */

/** Precomputed damage result for one attacker→defender pair */
export interface DamageMatrixEntry {
  bestMove: string;
  minPct: number;
  maxPct: number;
  koN: number; // 1=OHKO, 2=2HKO, ...; 0=no KO in 4 hits
  koChance: number; // 0.0-1.0
  effectiveness: number;
}

/** Full 49×49 damage matrix: matrix[attackerName][defenderName] */
export type DamageMatrix = Record<string, Record<string, DamageMatrixEntry>>;

/** Minimal Pokemon info stored per pool member */
export interface PoolMember {
  name: string;
  usagePct: number;
  usageRank: number;
  isMega: boolean;
  nature: string;
  item: string;
  ability: string;
  types: string[];
  moves: string[]; // attacking moves
  sp: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  // Singles ranking scores (from singles-ranking pipeline)
  overallScore?: number;
  offensiveScore?: number;
  defensiveScore?: number;
  speedStat?: number;
  speedTier?: "fast" | "mid" | "slow";
  speedAdvantage?: number;
  sustainedScore?: number;
  winRate1v1?: number;
  sweepPotential?: number;
}

/** A team of 6 Pokemon */
export interface Team {
  id: string;
  members: string[]; // 6 Pokemon names
}

/** A 3-Pokemon selection from a team */
export interface Selection {
  members: string[]; // 3 Pokemon names
  roles: ("ace" | "secondary" | "complement")[];
}

/** Result of a 3v3 matchup evaluation */
export interface MatchEvaluation {
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "draw";
}

/** A selection pattern (aggregated across many games) */
export interface SelectionPattern {
  members: string[];
  frequency: number;
  winRate: number;
}

/** A ranked team in the final output */
export interface RankedTeam {
  rank: number;
  teamId: string;
  members: string[];
  winRate: number;
  wins: number;
  losses: number;
  draws: number;
  avgScore: number;
  commonSelections: SelectionPattern[];
  typeProfile: {
    offensiveTypes: string[];
    defensiveWeaks: string[];
  };
}

/** Per-Pokemon statistics across all teams */
export interface PokemonTeamStats {
  name: string;
  /** Fraction of TOP50 teams containing this Pokemon */
  pickRate: number;
  /** Times selected / times in a team */
  selectionRate: number;
  /** Win rate when selected */
  winRateWhenSelected: number;
  /** Common partners in selection */
  commonPartners: { name: string; count: number }[];
}

/** Root output document */
export interface TeamMatchupResult {
  generatedAt: string;
  format: string;
  config: {
    totalTeams: number;
    gamesPerTeam: number;
    poolSize: number;
  };
  pool: PoolMember[];
  damageMatrix: DamageMatrix;
  topTeams: RankedTeam[];
  pokemonStats: PokemonTeamStats[];
}
