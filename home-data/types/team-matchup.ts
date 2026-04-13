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
  isContact: boolean; // true if bestMove makes contact
  chipPctToAttacker: number; // % of attacker HP lost per hit (Rough Skin/Iron Barbs: 12.5)
  weatherChipToDefender: number; // 6.25 if Sand active & defender not immune, else 0
  priorityMaxPct: number; // max damage % from best priority move (0 if none)
  priorityKoN: number; // KO count from best priority move (0 if none)
  priorityKoChance: number; // KO chance for priority move (0 if none)
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

/** Threat level classification for a pool opponent */
export type ThreatLevel = "low" | "medium" | "high" | "critical";

/** Per-opponent threat assessment */
export interface ThreatEntry {
  opponent: string;
  usagePct: number;        // Opponent's usage rate in the meta
  threatLevel: ThreatLevel;
  ourBestKoN: number;      // Best KO count any team member achieves
  ourBestMember: string;   // Who deals best damage
  theirBestKoN: number;    // Their best KO count against any team member
  theirBestTarget: string; // Who they hit hardest
  hasAnswer: boolean;      // Can we reliably handle this opponent?
}

/** Aggregate threat profile for a team vs the pool */
export interface ThreatProfile {
  killPressure: number;      // 0-100: offensive dominance (殺意)
  threatResistance: number;  // 0-100: defensive safety (脅威耐性)
  answerRate: number;        // 0-100: usage-weighted answer rate (使用率加重回答率)
  dominanceScore: number;    // Combined 0-100 score
  criticalThreats: number;   // Count of critical-level opponents
  highThreats: number;       // Count of high-level opponents
  unansweredCount: number;   // Count of unanswered opponents
  criticalGaps: number;      // Count of unanswered top-10 usage opponents
  topThreats: ThreatEntry[]; // Top 5 most dangerous opponents
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
  threatProfile?: ThreatProfile;
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
    poolFiltered?: number;
    teamsRejected?: number;
  };
  pool: PoolMember[];
  damageMatrix: DamageMatrix;
  topTeams: RankedTeam[];
  pokemonStats: PokemonTeamStats[];
}
