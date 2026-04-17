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
  recoilPctToSelf: number; // recoil damage per use of bestMove, as % of attacker's HP (0 if no recoil)
  isStatDrop?: boolean; // true if bestMove has a self-stat-drop (Draco Meteor, Overheat, etc.) — cannot be used twice at full power
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

/** An unanswered threat for targeted refinement (ADR-004b) */
export interface UnansweredThreat {
  opponentName: string;
  oppSpeed: number;
  usagePct: number;  // 0-100
  isMustAnswer: boolean; // ADR-006: mega or top-50 overallScore opponent
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
  unansweredOpponents: UnansweredThreat[]; // ADR-004b: detailed unanswered threats
  dangerousAttackerCount: number;     // ADR-005b: attackers hitting 3+ members at 50%+
  dangerousAttackerUncovered: number; // ADR-005b: subset with no answer
}

/** A ranked team in the final output */
export interface MemberSelectionRate {
  name: string;
  /** Fraction of total games this member was selected (0-1) */
  selectionRate: number;
  /** Win rate when this member was selected (0-1) */
  winRateWhenSelected: number;
}

export interface RankedTeam {
  rank: number;
  teamId: string;
  members: string[];
  winRate: number;
  wins: number;
  losses: number;
  draws: number;
  avgScore: number;
  /** 0.6 × WR% + 0.4 × dominance — canonical ranking score */
  compositeScore: number;
  commonSelections: SelectionPattern[];
  /** Per-member selection rates computed from ALL selection patterns */
  memberSelectionRates: MemberSelectionRate[];
  /** Number of dead-weight members (selected <5% of games) */
  deadMemberCount: number;
  /** Selection concentrated on fewer members — room for improvement */
  growthPotential: boolean;
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

/** A 3-Pokemon core ranked by weighted win rate against meta representatives */
export interface CoreRanking {
  members: string[];
  score: number;       // Weighted win rate (0-1)
  winCount: number;    // Number of meta reps beaten (unweighted)
  totalReps: number;
}

/** Per-Pokemon statistics derived from 3-core evaluation */
export interface PokemonCoreStats {
  name: string;
  avgCoreScore: number;
  maxCoreScore: number;
  trioCount: number;
  topPartners: { name: string; avgScore: number; count: number }[];
}

/** A meta representative: a 3-Pokemon selection pattern from Phase 4 */
export interface MetaRepresentative {
  members: string[];
  weight: number;      // Normalized frequency (sum = 1)
  frequency: number;   // Raw observation count
  winRate: number;
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
  topCores?: CoreRanking[];
  pokemonCoreStats?: PokemonCoreStats[];
  metaRepresentatives?: MetaRepresentative[];
}
