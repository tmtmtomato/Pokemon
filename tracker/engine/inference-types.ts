import type { NatureName, StatID, StatsTable, TypeName } from '../../src/types.js';

/** A candidate build for an opponent Pokemon */
export interface Candidate {
  nature: NatureName;
  /** SP allocation for the relevant stats being inferred */
  sp: Partial<StatsTable>;
  item: string;
  ability: string;
  /** Which damage rolls (0-15) matched the observed damage */
  matchedRolls: number[];
}

/** Per-turn inference result for one opponent slot */
export interface TurnInference {
  turnId: string;
  opponentSlot: number;
  mode: 'A' | 'B'; // A = opponent attacks (infer atk), B = I attack (infer def)
  candidates: Candidate[];
  inferredStats: StatID[]; // Which stats were inferred (e.g. ['atk'] or ['hp','def'])
}

/** SP density histogram — 8 bins covering SP 0-32 */
export const SP_BINS = [
  { label: '0-3',   min: 0,  max: 3 },
  { label: '4-7',   min: 4,  max: 7 },
  { label: '8-11',  min: 8,  max: 11 },
  { label: '12-15', min: 12, max: 15 },
  { label: '16-19', min: 16, max: 19 },
  { label: '20-23', min: 20, max: 23 },
  { label: '24-27', min: 24, max: 27 },
  { label: '28-32', min: 28, max: 32 },
] as const;

/** SP tier classification thresholds */
export type SPTier = 'none' | 'light' | 'moderate' | 'heavy' | 'unknown';

/** Per-stat density: fraction of candidates in each bin (0.0-1.0) */
export type SPDensity = number[];  // length = SP_BINS.length (8)

/** Aggregated inference across all turns for one opponent slot */
export interface SlotInference {
  opponentSlot: number;
  /** Possible natures remaining */
  natures: Set<NatureName>;
  /** Possible items remaining */
  items: Set<string>;
  /** Possible abilities remaining */
  abilities: Set<string>;
  /** SP range per stat: [min, max] */
  spRange: Record<StatID, [number, number]>;
  /** SP density per stat: fraction of candidates in each bin */
  spDensity: Record<StatID, SPDensity>;
  /** SP tier per stat (dominant allocation category) */
  spTier: Record<StatID, SPTier>;
  /** Number of matching candidate builds */
  candidateCount: number;
  /** Unique nature/stat combinations (deduplicated from item/ability) */
  uniqueBuildCount: number;
  /** Ratio of remaining builds vs total search space (0.0 = fully narrowed, 1.0 = no narrowing) */
  narrowingRatio: number;
  /** Best-guess candidate (most common across turns) */
  topCandidates: Candidate[];
}

/**
 * Items that affect damage when held by attacker.
 * L-2: Empty string '' represents "no item" or any non-damage-affecting item.
 * This sentinel is used throughout inference as the default/unknown item value.
 */
export const ATTACKER_DAMAGE_ITEMS = [
  '', // No item / non-damage item
  // Champions has no generic attack-boosting items (no Choice Band/Specs/Life Orb)
  // Type-boost items are handled separately via TYPE_BOOST_ITEMS
] as const;

/** Items that affect damage when held by defender */
export const DEFENDER_DAMAGE_ITEMS = [
  '', // No item / non-damage item
  // Champions has no defensive damage items (no Assault Vest/Eviolite)
] as const;

/** Type-boosting items mapped to the type they boost */
export const TYPE_BOOST_ITEMS: Record<string, TypeName> = {
  'Charcoal': 'Fire',
  'Mystic Water': 'Water',
  'Miracle Seed': 'Grass',
  'Magnet': 'Electric',
  'Never-Melt Ice': 'Ice',
  'Dragon Fang': 'Dragon',
  'Black Belt': 'Fighting',
  'Silk Scarf': 'Normal',
  'Poison Barb': 'Poison',
  'Soft Sand': 'Ground',
  'Sharp Beak': 'Flying',
  'Twisted Spoon': 'Psychic',
  'Silver Powder': 'Bug',
  'Hard Stone': 'Rock',
  'Spell Tag': 'Ghost',
  'Black Glasses': 'Dark',
  'Metal Coat': 'Steel',
  'Fairy Feather': 'Fairy',
};

/** Resist berry to type mapping */
export const RESIST_BERRY_TYPES: Record<string, TypeName> = {
  'Occa Berry': 'Fire',
  'Passho Berry': 'Water',
  'Wacan Berry': 'Electric',
  'Rindo Berry': 'Grass',
  'Yache Berry': 'Ice',
  'Chople Berry': 'Fighting',
  'Kebia Berry': 'Poison',
  'Shuca Berry': 'Ground',
  'Coba Berry': 'Flying',
  'Payapa Berry': 'Psychic',
  'Tanga Berry': 'Bug',
  'Charti Berry': 'Rock',
  'Kasib Berry': 'Ghost',
  'Haban Berry': 'Dragon',
  'Colbur Berry': 'Dark',
  'Babiri Berry': 'Steel',
  'Roseli Berry': 'Fairy',
  'Chilan Berry': 'Normal',  // L-6
};

/** Tolerance for damage% matching (±%) — base value, adjusted by HP */
export const DAMAGE_TOLERANCE = 1.0;

/**
 * M-4: Get HP-dependent tolerance. Lower HP means each point of damage
 * is a larger % — so we need wider tolerance for low-HP Pokemon.
 */
export function getDamageTolerance(maxHP: number): number {
  // One point of damage = (100/maxHP)% of HP
  // Allow at least 1 roll step of error
  const onePointPercent = 100 / maxHP;
  return Math.max(DAMAGE_TOLERANCE, onePointPercent * 1.5);
}
