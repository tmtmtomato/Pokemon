// Item-based damage modifiers
import type { TypeName } from '../types.js';
import type { Pokemon } from '../pokemon.js';
import type { Move } from '../move.js';
import { MOD } from './util.js';
import { getItem } from '../data/index.js';

/**
 * Get attack stat multiplier from attacker's item.
 */
export function getItemAttackMod(attacker: Pokemon, move: Move): number {
  const item = getItem(attacker.item);
  if (!item?.statBoost) return 1.0;

  if (item.statBoost.stat === 'atk' && move.isPhysical()) return item.statBoost.multiplier;
  if (item.statBoost.stat === 'spa' && move.isSpecial()) return item.statBoost.multiplier;
  return 1.0;
}

/**
 * Get defense stat multiplier from defender's item.
 */
export function getItemDefenseMod(defender: Pokemon, move: Move): number {
  const item = getItem(defender.item);
  if (!item) return 1.0;

  // Assault Vest
  if (item.statBoost?.stat === 'spd' && move.isSpecial()) return item.statBoost.multiplier;

  // Eviolite (would need NFE check on species data - simplified for now)
  return 1.0;
}

/**
 * Get final damage modifier from attacker's item (4096-based).
 */
export function getItemFinalMod(
  attacker: Pokemon,
  move: Move,
  moveType: TypeName,
  typeEffectiveness: number,
): number {
  const item = getItem(attacker.item);
  if (!item?.conditionalDamage) return MOD.x1_0;

  const cond = item.conditionalDamage;

  switch (cond.condition) {
    case 'always':
      return cond.modifier; // Life Orb
    case 'super_effective':
      if (typeEffectiveness > 1) return cond.modifier; // Expert Belt
      break;
    case 'type_match':
      if (cond.type === moveType) return cond.modifier; // Type-boosting items
      break;
  }
  return MOD.x1_0;
}

/**
 * Get damage modifier from defender's item (4096-based).
 * Mainly resist berries.
 */
export function getItemDefenderFinalMod(
  defender: Pokemon,
  moveType: TypeName,
  typeEffectiveness: number,
): number {
  const item = getItem(defender.item);
  if (!item?.resistBerry) return MOD.x1_0;

  if (item.resistBerry.type === moveType && typeEffectiveness > 1) {
    return MOD.x0_5;
  }
  return MOD.x1_0;
}

/**
 * Check if attacker has no held item (for Acrobatics).
 */
export function hasNoItem(pokemon: Pokemon): boolean {
  return !pokemon.item || pokemon.item === '';
}
