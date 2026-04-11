// Pokemon Champions Damage Calculator - Type Definitions

// ===== Type Names (18 types) =====
export type TypeName =
  | 'Normal' | 'Fire' | 'Water' | 'Electric' | 'Grass' | 'Ice'
  | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug'
  | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy';

// ===== Stats =====
export type StatID = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface StatsTable {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

// ===== Natures (Stat Alignments in Champions) =====
export type NatureName =
  | 'Hardy' | 'Lonely' | 'Brave' | 'Adamant' | 'Naughty'
  | 'Bold' | 'Docile' | 'Relaxed' | 'Impish' | 'Lax'
  | 'Timid' | 'Hasty' | 'Serious' | 'Jolly' | 'Naive'
  | 'Modest' | 'Mild' | 'Quiet' | 'Bashful' | 'Rash'
  | 'Calm' | 'Gentle' | 'Sassy' | 'Careful' | 'Quirky';

// ===== Status Conditions =====
export type StatusName = 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';

// ===== Weather =====
export type Weather = 'Sun' | 'Rain' | 'Sand' | 'Snow' | 'Harsh Sunshine' | 'Heavy Rain' | 'Strong Winds';

// ===== Terrain =====
export type Terrain = 'Electric' | 'Grassy' | 'Psychic' | 'Misty';

// ===== Game Type =====
export type GameType = 'Singles' | 'Doubles';

// ===== Move Category =====
export type MoveCategory = 'Physical' | 'Special' | 'Status';

// ===== Move Flags =====
export interface MoveFlags {
  contact?: boolean;
  punch?: boolean;
  bite?: boolean;
  bullet?: boolean;
  sound?: boolean;
  pulse?: boolean;
  slicing?: boolean;
  wind?: boolean;
}

// ===== Species Data (from JSON) =====
export interface SpeciesData {
  id: number;
  name: string;
  types: [TypeName] | [TypeName, TypeName];
  baseStats: StatsTable;
  weightKg: number;
  abilities: string[];
  isNFE?: boolean;  // 未進化ポケモン (Not Fully Evolved) — しんかのきせき判定用
  mega?: {
    stone: string;
    types: [TypeName] | [TypeName, TypeName];
    baseStats: StatsTable;
    ability: string;
    weightKg?: number;
  };
}

// ===== Move Data (from JSON) =====
export interface MoveData {
  name: string;
  type: TypeName;
  category: MoveCategory;
  basePower: number;
  pp: number;
  accuracy: number;
  priority: number;
  flags: MoveFlags;
  recoil?: [number, number];     // [numerator, denominator] e.g. [33, 100]
  drain?: [number, number];      // [numerator, denominator] e.g. [1, 2]
  multiHit?: number | [number, number]; // fixed or [min, max]
  secondaryEffect?: boolean;
  alwaysCrit?: boolean;
  // Stat overrides for unusual moves
  overrideOffensiveStat?: StatID;
  overrideDefensiveStat?: StatID;
  // Base power override condition
  bpModifier?: string;  // e.g. 'knock_off', 'acrobatics', 'facade', 'hex', 'brine'
}

// ===== Item Data (from JSON) =====
export interface ItemData {
  name: string;
  // Stat modifiers
  statBoost?: { stat: StatID; multiplier: number };
  // Damage modifier (4096-based)
  damageModifier?: number;
  // Conditional damage modifier
  conditionalDamage?: {
    condition: string; // 'super_effective', 'always', 'type_match'
    modifier: number;
    type?: TypeName;   // for type-boosting items
  };
  // Type-resist berry
  resistBerry?: { type: TypeName };
  // Mega stone
  megaStone?: string; // species name it mega evolves
  // Choice item lock
  choiceLock?: boolean;
}

// ===== Ability Data (from JSON) =====
export interface AbilityData {
  name: string;
  // Various effect flags
  effect?: string; // identifier for mechanic lookup
}

// ===== Side Configuration =====
export interface SideConfig {
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isProtected?: boolean;
  isSR?: boolean;          // Stealth Rock
  spikes?: number;         // 0-3
  isHelpingHand?: boolean;
  isTailwind?: boolean;
  isFriendGuard?: boolean;
  isBattery?: boolean;
  isPowerSpot?: boolean;
  isFlowerGift?: boolean;
  isSteelySpirit?: boolean;
  isSwitching?: 'in' | 'out';
  isSeeded?: boolean;      // Leech Seed
  isSaltCured?: boolean;
}

// ===== Field Configuration =====
export interface FieldConfig {
  gameType?: GameType;
  weather?: Weather;
  terrain?: Terrain;
  isGravity?: boolean;
  isAuraBreak?: boolean;
  isFairyAura?: boolean;
  isDarkAura?: boolean;
  isBeadsOfRuin?: boolean;
  isTabletsOfRuin?: boolean;
  isSwordOfRuin?: boolean;
  isVesselOfRuin?: boolean;
  attackerSide?: SideConfig;
  defenderSide?: SideConfig;
}

// ===== Pokemon Configuration =====
export interface PokemonConfig {
  name: string;
  sp?: Partial<StatsTable>;        // Stat Points (0-32 each, 66 total)
  nature?: NatureName;             // Stat Alignment
  ability?: string;
  item?: string;
  moves?: string[];
  status?: StatusName;
  curHP?: number;                  // current HP (percentage 0-100, or absolute)
  boosts?: Partial<StatsTable>;    // stat stages -6 to +6
  isMega?: boolean;
  // テラスタル関連
  teraType?: TypeName | 'Stellar';  // テラスタルタイプ
  isTera?: boolean;                  // テラスタル状態かどうか
  isStellarFirstUse?: boolean;       // ステラテラ: このタイプの初回使用か
  // For doubles: this pokemon's position
  isSpreadTarget?: boolean;        // is this pokemon the target of a spread move?
}

// ===== Damage Roll =====
export interface DamageRoll {
  rolls: number[];         // 16 damage values (one per random factor 85-100)
  min: number;
  max: number;
}

// ===== KO Chance =====
export interface KOChance {
  chance: number;          // 0.0 - 1.0
  n: number;               // N-hit KO (1 = OHKO, 2 = 2HKO, etc.)
  text: string;            // e.g. "guaranteed OHKO" or "75.0% chance to 2HKO"
}
