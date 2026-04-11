/**
 * Type definitions for the Singles Meta Power Ranking tool.
 */

export type SPPattern = "physicalAT" | "specialAT" | "hbWall" | "hdWall";

export interface StatsTable {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface BuildConfig {
  nature: string;
  item: string;
  ability: string;
  isMega: boolean;
  spPattern: SPPattern;
  sp: StatsTable;
  /** Product of nature_rate * item_rate * ability_rate (0-1) */
  weight: number;
}

export interface MatchupSummary {
  targetName: string;
  targetBuildIndex: number;
  bestMove: string;
  minPct: number;
  maxPct: number;
  koN: number; // 1=OHKO, 2=2HKO, etc; 0=no KO within 4 hits
  koChance: number; // 0.0-1.0
}

export interface BuildScores {
  // Offensive (speed-adjusted: matchups where outsped & KO'd count as 0)
  coverage: number; // 0-100: fraction of meta hit at neutral+
  weightedDamage: number; // 0-100: normalized average best-move damage %
  ohkoRate: number; // 0-100: fraction OHKO'd
  twoHkoRate: number; // 0-100: fraction OHKO'd or 2HKO'd
  offensiveScore: number; // 0-100: composite

  // Defensive
  defensiveConsistency: number; // 0-100: fraction of attacks dealing <50%
  survivalRate: number; // 0-100: fraction NOT OHKO'd
  tankinessIndex: number; // avg hits survived (raw, not 0-100)
  defensiveScore: number; // 0-100: composite

  // Speed
  speedStat: number; // Lv50 Speed stat (with Choice Scarf if applicable)
  speedAdvantage: number; // 0-100: % of meta builds outsped
  speedTier: "fast" | "mid" | "slow"; // fast>=150, mid>=100, slow<100

  // Sustained (1v1 simulation)
  sustainedScore: number; // 0-100: usage-weighted avg remaining HP% after winning 1v1
  winRate1v1: number; // 0-100: 1v1 win rate vs meta
  sweepPotential: number; // 1.0-6.0: expected consecutive KOs

  overallScore: number; // 0-100: composite (0.35*ATK + 0.35*DEF + 0.30*SUSTAINED)
}

/** Per-move offensive breakdown */
export interface MoveStats {
  name: string;
  type: string;
  /** % of meta hit at neutral or better (effectiveness >= 1) */
  coverage: number;
  /** % of meta hit super-effectively (effectiveness > 1) */
  seCoverage: number;
  /** Usage-weighted average max damage % */
  avgDamage: number;
  /** % of meta OHKO'd by this move alone */
  ohkoRate: number;
  /** % of meta 2HKO'd by this move alone */
  twoHkoRate: number;
}

export interface PokemonBuild {
  config: BuildConfig;
  scores: BuildScores;
  moves: string[];
  moveStats: MoveStats[];
  bestOffensiveMatchups: MatchupSummary[];
  worstOffensiveMatchups: MatchupSummary[];
  mostThreateningAttackers: MatchupSummary[];
  bestDefensiveMatchups: MatchupSummary[];
}

export interface RankedPokemon {
  name: string;
  rank: number;
  usagePct: number;
  usageRank: number;
  scores: BuildScores;
  builds: PokemonBuild[];
  seHitTypes: string[];
  seWeakTypes: string[];
}

export interface SinglesRanking {
  generatedAt: string;
  format: string;
  totalPokemon: number;
  totalBuilds: number;
  totalCalculations: number;
  pokemon: RankedPokemon[];
}
