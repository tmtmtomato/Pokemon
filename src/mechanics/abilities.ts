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
    // パンクロック（攻撃側）: 音技のダメージ1.3倍
    case 'Punk Rock':
      if (move.flags.sound) return MOD.x1_3;
      break;
    // アナライズ: 後攻時ダメージ1.3倍（計算エンジンでは常時適用、UI側で条件制御）
    case 'Analytic':
      return MOD.x1_3;
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
    // ごりむちゅう: 物理攻撃力1.5倍（こだわりハチマキと同等）
    case 'Gorilla Tactics':
      if (move.isPhysical()) return 1.5;
      break;
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
      // パンクロック（防御側）: 音技の被ダメージ0.5倍（かたやぶりで貫通される）
      case 'Punk Rock':
        if (move.flags.sound) mod = Math.round(mod * MOD.x0_5 / 4096);
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
 * Get STAB modifier considering abilities like Adaptability and Terastallization.
 * Returns 4096-based modifier.
 *
 * テラスタル時のSTAB計算:
 * - テラタイプ = 元タイプ = 技タイプ → 2.0x（てきおうりょく: 2.25x）
 * - テラタイプ = 技タイプ、元タイプ不一致 → 1.5x（てきおうりょく: 2.0x）
 * - テラスタル後、元タイプの技使用 → 1.5x
 * - ステラテラ: 初回2.0x、2回目以降は元タイプ一致なら1.5x、不一致なら1.0x
 */
export function getSTABMod(attacker: Pokemon, moveType: TypeName): number {
  const isAdaptability = attacker.effectiveAbility() === 'Adaptability';

  if (attacker.isTera && attacker.teraType) {
    // ステラテラ
    if (attacker.teraType === 'Stellar') {
      if (attacker.hasOriginalType(moveType)) {
        // 元タイプ一致の技: 初回2.0x、2回目以降1.5x
        return attacker.isStellarFirstUse ? MOD.x2_0 : MOD.x1_5;
      }
      // 元タイプ不一致: 初回2.0x、2回目以降1.0x
      return attacker.isStellarFirstUse ? MOD.x2_0 : MOD.x1_0;
    }

    // 通常テラスタル
    const teraMatchesMove = attacker.teraType === moveType;
    const originalMatchesMove = attacker.hasOriginalType(moveType);

    if (teraMatchesMove && originalMatchesMove) {
      // テラタイプ = 元タイプ = 技タイプ → 2.0x（てきおうりょく: 2.25x）
      return isAdaptability ? MOD.x2_25 : MOD.x2_0;
    }
    if (teraMatchesMove) {
      // テラタイプ = 技タイプ、元タイプ不一致 → 1.5x（てきおうりょく: 2.0x）
      return isAdaptability ? MOD.x2_0 : MOD.x1_5;
    }
    if (originalMatchesMove) {
      // テラスタル後、元タイプの技使用 → 1.5x
      return MOD.x1_5;
    }

    // 不一致
    return MOD.x1_0;
  }

  // 非テラ: 従来通り
  if (!attacker.hasOriginalType(moveType)) return MOD.x1_0;
  if (isAdaptability) return MOD.x2_0;
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
