// Stat calculation for Pokemon Champions (SP system, Lv50 fixed)
import type { NatureName, StatID, StatsTable } from '../types.js';

// Champions constants
const LEVEL = 50;
const IV = 31; // Always 31 in Champions

/**
 * Calculate HP stat at Lv50 with the Champions SP system.
 * HP = floor((2 * Base + IV) * Level / 100) + Level + 10 + SP
 *    = floor((2 * Base + 31) * 50 / 100) + 60 + SP
 */
export function calcHP(base: number, sp: number = 0): number {
  return Math.floor(((2 * base + IV) * LEVEL) / 100) + LEVEL + 10 + sp;
}

/**
 * Calculate a non-HP stat at Lv50 with the Champions SP system.
 * Stat = floor((floor((2 * Base + IV) * Level / 100) + 5 + SP) * NatureModifier)
 */
export function calcStat(
  base: number,
  sp: number = 0,
  natureModifier: number = 1.0,
): number {
  const raw = Math.floor(((2 * base + IV) * LEVEL) / 100) + 5 + sp;
  return Math.floor(raw * natureModifier);
}

/**
 * Get the nature modifier for a specific stat.
 * Returns 1.1 (boosted), 1.0 (neutral), or 0.9 (hindered).
 */
export function getNatureModifier(nature: NatureName, stat: StatID): number {
  if (stat === 'hp') return 1.0; // Nature never affects HP

  const boosts = NATURE_TABLE[nature];
  if (!boosts) return 1.0;
  if (boosts.plus === stat) return 1.1;
  if (boosts.minus === stat) return 0.9;
  return 1.0;
}

/**
 * Apply stat stage boost (-6 to +6).
 * Positive boosts: (2 + stage) / 2
 * Negative boosts: 2 / (2 + |stage|)
 */
export function applyBoost(stat: number, stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  if (clamped >= 0) {
    return Math.floor(stat * (2 + clamped) / 2);
  } else {
    return Math.floor(stat * 2 / (2 + Math.abs(clamped)));
  }
}

/**
 * Calculate all stats for a Pokemon given base stats, SPs, and nature.
 */
export function calcAllStats(
  baseStats: StatsTable,
  sp: Partial<StatsTable> = {},
  nature: NatureName = 'Hardy',
): StatsTable {
  return {
    hp: calcHP(baseStats.hp, sp.hp ?? 0),
    atk: calcStat(baseStats.atk, sp.atk ?? 0, getNatureModifier(nature, 'atk')),
    def: calcStat(baseStats.def, sp.def ?? 0, getNatureModifier(nature, 'def')),
    spa: calcStat(baseStats.spa, sp.spa ?? 0, getNatureModifier(nature, 'spa')),
    spd: calcStat(baseStats.spd, sp.spd ?? 0, getNatureModifier(nature, 'spd')),
    spe: calcStat(baseStats.spe, sp.spe ?? 0, getNatureModifier(nature, 'spe')),
  };
}

/**
 * Validate SP allocation: max 32 per stat, max 66 total.
 */
export function validateSP(sp: Partial<StatsTable>): { valid: boolean; total: number } {
  const values = [
    sp.hp ?? 0, sp.atk ?? 0, sp.def ?? 0,
    sp.spa ?? 0, sp.spd ?? 0, sp.spe ?? 0,
  ];
  const total = values.reduce((a, b) => a + b, 0);
  const allInRange = values.every(v => v >= 0 && v <= 32);
  return { valid: allInRange && total <= 66, total };
}

// ===== Nature table =====
const NATURE_TABLE: Record<NatureName, { plus?: StatID; minus?: StatID }> = {
  // Neutral natures (no boost/hinder)
  Hardy:  {},
  Docile: {},
  Serious: {},
  Bashful: {},
  Quirky: {},
  // +Atk
  Lonely:  { plus: 'atk', minus: 'def' },
  Brave:   { plus: 'atk', minus: 'spe' },
  Adamant: { plus: 'atk', minus: 'spa' },
  Naughty: { plus: 'atk', minus: 'spd' },
  // +Def
  Bold:    { plus: 'def', minus: 'atk' },
  Relaxed: { plus: 'def', minus: 'spe' },
  Impish:  { plus: 'def', minus: 'spa' },
  Lax:     { plus: 'def', minus: 'spd' },
  // +Spe
  Timid:   { plus: 'spe', minus: 'atk' },
  Hasty:   { plus: 'spe', minus: 'def' },
  Jolly:   { plus: 'spe', minus: 'spa' },
  Naive:   { plus: 'spe', minus: 'spd' },
  // +SpA
  Modest:  { plus: 'spa', minus: 'atk' },
  Mild:    { plus: 'spa', minus: 'def' },
  Quiet:   { plus: 'spa', minus: 'spe' },
  Rash:    { plus: 'spa', minus: 'spd' },
  // +SpD
  Calm:    { plus: 'spd', minus: 'atk' },
  Gentle:  { plus: 'spd', minus: 'def' },
  Sassy:   { plus: 'spd', minus: 'spe' },
  Careful: { plus: 'spd', minus: 'spa' },
};
