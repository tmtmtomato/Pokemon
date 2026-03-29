// Ability-based damage modifiers
import type { TypeName } from '../types.js';
import type { Pokemon } from '../pokemon.js';
import type { Move } from '../move.js';
import type { Field } from '../field.js';
import { MOD } from './util.js';

/**
 * Get base power modifier from attacker's ability.
 * Returns 4096-based modifier.
 */
export function getAbilityBasePowerMod(
  attacker: Pokemon,
  move: Move,
  _defender: Pokemon,
  field: Field,
): number {
  const ability = attacker.effectiveAbility();

  switch (ability) {
    case 'Technician':
      if (move.basePower <= 60) return MOD.x1_5;
      break;
    case 'Sheer Force':
      if (move.secondaryEffect) return MOD.x1_3;
      break;
    case 'Iron Fist':
      if (move.flags.punch) return MOD.x1_2;
      break;
    case 'Reckless':
      if (move.recoil) return MOD.x1_2;
      break;
    case 'Strong Jaw':
      if (move.flags.bite) return MOD.x1_5;
      break;
    case 'Mega Launcher':
      if (move.flags.pulse) return MOD.x1_5;
      break;
    case 'Tough Claws':
      if (move.makesContact()) return MOD.x1_3;
      break;
    case 'Sharpness':
      if (move.flags.slicing) return MOD.x1_5;
      break;
    case 'Sand Force':
      if (field.effectiveWeather() === 'Sand' &&
          (move.type === 'Rock' || move.type === 'Ground' || move.type === 'Steel'))
        return MOD.x1_3;
      break;
    // Dragonize: Normal -> Dragon type change + 1.2x power (like Aerilate etc.)
    case 'Dragonize':
      if (move.type === 'Normal' && move.category !== 'Status') return MOD.x1_2;
      break;
    // -ate abilities
    case 'Pixilate':
      if (move.type === 'Normal' && move.category !== 'Status') return MOD.x1_2;
      break;
  }
  return MOD.x1_0;
}

/**
 * Get attack stat modifier from attacker's ability.
 * Returns a multiplier (not 4096-based).
 */
export function getAbilityAttackMod(
  attacker: Pokemon,
  move: Move,
  field: Field,
): number {
  const ability = attacker.effectiveAbility();

  switch (ability) {
    case 'Huge Power':
    case 'Pure Power':
      if (move.isPhysical()) return 2.0;
      break;
    case 'Guts':
      if (attacker.status && move.isPhysical()) return 1.5;
      break;
    case 'Solar Power': {
      // Solar Power boosts SpA by 1.5x only in Sun/Harsh Sunshine
      const weather = getEffectiveWeatherForAttacker(attacker, field);
      if (move.isSpecial() && (weather === 'Sun' || weather === 'Harsh Sunshine'))
        return 1.5;
      break;
    }
  }
  return 1.0;
}

/**
 * Get defense stat modifier from defender's ability.
 * Returns a multiplier (not 4096-based).
 */
export function getAbilityDefenseMod(
  defender: Pokemon,
  move: Move,
  field: Field,
): number {
  const ability = defender.effectiveAbility();

  switch (ability) {
    case 'Grass Pelt':
      if (field.terrain === 'Grassy' && move.isPhysical()) return 1.5;
      break;
  }
  return 1.0;
}

/**
 * Get final damage modifier from defender's ability.
 * Returns 4096-based modifier.
 */
export function getAbilityFinalMod(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  typeEffectiveness: number,
  isCrit: boolean,
): number {
  const defAbility = defender.effectiveAbility();
  const atkAbility = attacker.effectiveAbility();
  const moldBreaker = attacker.hasMoldBreaker();

  let mod = MOD.x1_0;

  // Defender abilities (bypassed by Mold Breaker)
  if (!moldBreaker) {
    switch (defAbility) {
      case 'Multiscale':
        if (defender.isFullHP()) mod = Math.round(mod * MOD.x0_5 / 4096);
        break;
      case 'Filter':
      case 'Solid Rock':
      case 'Prism Armor':
        if (typeEffectiveness > 1) mod = Math.round(mod * MOD.x0_75 / 4096);
        break;
      case 'Fluffy':
        if (move.makesContact()) mod = Math.round(mod * MOD.x0_5 / 4096);
        if (move.type === 'Fire') mod = Math.round(mod * MOD.x2_0 / 4096);
        break;
      case 'Ice Scales':
        if (move.isSpecial()) mod = Math.round(mod * MOD.x0_5 / 4096);
        break;
    }
  }

  // Attacker abilities
  switch (atkAbility) {
    case 'Sniper':
      if (isCrit) mod = Math.round(mod * MOD.x1_5 / 4096);
      break;
    case 'Tinted Lens':
      if (typeEffectiveness < 1 && typeEffectiveness > 0) mod = Math.round(mod * MOD.x2_0 / 4096);
      break;
    case 'Neuroforce':
      if (typeEffectiveness > 1) mod = Math.round(mod * MOD.x1_25 / 4096);
      break;
  }

  return mod;
}

/**
 * Get STAB modifier considering abilities like Adaptability.
 * Returns 4096-based modifier.
 */
export function getSTABMod(attacker: Pokemon, moveType: TypeName): number {
  if (!attacker.hasType(moveType)) return MOD.x1_0;
  if (attacker.effectiveAbility() === 'Adaptability') return MOD.x2_0;
  return MOD.x1_5;
}

/**
 * Get the effective move type after ability-based type changes.
 * e.g., Dragonize changes Normal -> Dragon, Pixilate changes Normal -> Fairy
 */
export function getEffectiveMoveType(attacker: Pokemon, move: Move): TypeName {
  if (move.category === 'Status') return move.type;

  const ability = attacker.effectiveAbility();
  if (move.type === 'Normal') {
    switch (ability) {
      case 'Dragonize': return 'Dragon';
      case 'Pixilate': return 'Fairy';
      // Add more -ate abilities as needed
    }
  }
  return move.type;
}

/**
 * Check effective weather considering Mega Sol ability.
 * Mega Sol makes the user's moves act as if in harsh sunlight.
 */
export function getEffectiveWeatherForAttacker(
  attacker: Pokemon,
  field: Field,
): string | undefined {
  if (attacker.effectiveAbility() === 'Mega Sol') {
    return 'Sun'; // Always treated as Sun for the attacker's moves
  }
  return field.effectiveWeather();
}
