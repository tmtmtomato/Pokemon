// Main calculate() function - public API entry point
import { Pokemon } from './pokemon.js';
import { Move } from './move.js';
import { Field } from './field.js';
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
  const fld = field ? field.clone() : new Field();
  const mv = move.clone();

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
