// Main calculate() function - public API entry point
import { Pokemon } from './pokemon.js';
import { Move } from './move.js';
import { Field } from './field.js';
import type { FieldConfig } from './types.js';
import { Result } from './result.js';
import { calculateDamage } from './mechanics/damage.js';

/**
 * Calculate damage for one attack.
 *
 * @param attacker - The attacking Pokemon
 * @param defender - The defending Pokemon
 * @param move - The move being used
 * @param field - The field conditions (weather, terrain, screens, etc.)
 * @returns A Result object with damage rolls, KO chance, and description
 */
export function calculate(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field?: Field,
): Result {
  // Clone inputs to ensure immutability
  const atk = attacker.clone();
  const def = defender.clone();
  const mv = move.clone();

  // Auto-detect ability-based field effects from attacker/defender
  // These OR with manual field flags (for Doubles ally abilities)
  const atkAbility = atk.effectiveAbility();
  const defAbility = def.effectiveAbility();
  const autoFieldOverrides: Partial<FieldConfig> = {};

  // Aura abilities: active when ANY Pokemon on field has the ability
  if (atkAbility === 'Fairy Aura' || defAbility === 'Fairy Aura') {
    autoFieldOverrides.isFairyAura = true;
  }
  if (atkAbility === 'Dark Aura' || defAbility === 'Dark Aura') {
    autoFieldOverrides.isDarkAura = true;
  }
  if (atkAbility === 'Aura Break' || defAbility === 'Aura Break') {
    autoFieldOverrides.isAuraBreak = true;
  }

  // Ruin abilities: lower opposing stat
  // Tablets of Ruin (holder): other Pokemon's Atk -25%
  if (defAbility === 'Tablets of Ruin') autoFieldOverrides.isTabletsOfRuin = true;
  // Vessel of Ruin (holder): other Pokemon's SpA -25%
  if (defAbility === 'Vessel of Ruin') autoFieldOverrides.isVesselOfRuin = true;
  // Sword of Ruin (holder): other Pokemon's Def -25%
  if (atkAbility === 'Sword of Ruin') autoFieldOverrides.isSwordOfRuin = true;
  // Beads of Ruin (holder): other Pokemon's SpD -25%
  if (atkAbility === 'Beads of Ruin') autoFieldOverrides.isBeadsOfRuin = true;

  // Merge: auto-detected flags OR manual field flags
  const fieldConfig = field ? {
    gameType: field.gameType,
    weather: field.weather,
    terrain: field.terrain,
    isGravity: field.isGravity,
    isAuraBreak: field.isAuraBreak || autoFieldOverrides.isAuraBreak || false,
    isFairyAura: field.isFairyAura || autoFieldOverrides.isFairyAura || false,
    isDarkAura: field.isDarkAura || autoFieldOverrides.isDarkAura || false,
    isBeadsOfRuin: field.isBeadsOfRuin || autoFieldOverrides.isBeadsOfRuin || false,
    isTabletsOfRuin: field.isTabletsOfRuin || autoFieldOverrides.isTabletsOfRuin || false,
    isSwordOfRuin: field.isSwordOfRuin || autoFieldOverrides.isSwordOfRuin || false,
    isVesselOfRuin: field.isVesselOfRuin || autoFieldOverrides.isVesselOfRuin || false,
    attackerSide: field.attackerSide,
    defenderSide: field.defenderSide,
  } : autoFieldOverrides;
  const fld = new Field(fieldConfig);

  // Run core damage calculation
  const { rolls, moveType, typeEffectiveness, isCrit } = calculateDamage(atk, def, mv, fld);

  return new Result({
    rolls,
    moveName: mv.name,
    moveType,
    typeEffectiveness,
    isCrit,
    attackerName: atk.name + (atk.isMega ? '-Mega' : ''),
    defenderName: def.name + (def.isMega ? '-Mega' : ''),
    defenderMaxHP: def.maxHP(),
  });
}
