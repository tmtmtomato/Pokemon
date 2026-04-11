// Core damage formula implementation
import type { Pokemon } from '../pokemon.js';
import type { Move } from '../move.js';
import type { Field } from '../field.js';
import { applyMod, MOD } from './util.js';
import { getEffectiveness } from './type-effectiveness.js';
import { getEffectiveMoveType, getSTABMod, getAbilityBasePowerMod, getAbilityAttackMod, getAbilityDefenseMod, getAbilityFinalMod, getEffectiveWeatherForAttacker } from './abilities.js';
import { getItemAttackMod, getItemDefenseMod, getItemFinalMod, getItemDefenderFinalMod } from './items.js';
import { getEffectiveBasePower, getOffensiveStat, getDefensiveStat } from './moves.js';

const LEVEL = 50;

export interface DamageCalcResult {
  rolls: number[];        // 16 damage values
  moveType: TypeName;     // effective move type (after ability changes)
  typeEffectiveness: number;
  isCrit: boolean;
}

import type { TypeName } from '../types.js';

/**
 * Calculate damage for a single hit.
 * Returns an array of 16 damage values (one per random factor 85-100).
 */
export function calculateDamage(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
): DamageCalcResult {
  const isCrit = move.isCrit || (move.alwaysCrit ?? false);

  // Status moves deal no damage
  if (move.category === 'Status') {
    return { rolls: new Array(16).fill(0), moveType: move.type, typeEffectiveness: 0, isCrit };
  }

  // 1. Determine effective move type (Dragonize, Pixilate, etc.)
  const moveType = getEffectiveMoveType(attacker, move);

  // 2. Type effectiveness
  // テラスタル中の防御側はテラタイプで相性判定（ステラテラは元タイプで判定）
  const defenderTypes = defender.effectiveTypes();
  const typeEff = getEffectiveness(moveType, defenderTypes);
  if (typeEff === 0) {
    return { rolls: new Array(16).fill(0), moveType, typeEffectiveness: 0, isCrit };
  }

  // 3. Effective base power
  let basePower = getEffectiveBasePower(move, attacker, defender);

  // Ability-based BP modifier
  const abilityBpMod = getAbilityBasePowerMod(attacker, move, defender, field);
  if (abilityBpMod !== MOD.x1_0) {
    basePower = applyMod(basePower, abilityBpMod);
  }

  // Terrain boost (1.3x for matching type, grounded pokemon)
  if (field.terrain) {
    const terrainType = getTerrainType(field.terrain);
    if (terrainType === moveType) {
      basePower = applyMod(basePower, MOD.x1_3);
    }
    // Misty Terrain: Dragon moves vs grounded = 0.5x
    if (field.terrain === 'Misty' && moveType === 'Dragon') {
      basePower = applyMod(basePower, MOD.x0_5);
    }
  }

  // Helping Hand
  if (field.attackerSide.isHelpingHand) {
    basePower = applyMod(basePower, MOD.x1_5);
  }

  // バッテリー: 味方の特殊技ダメージ 1.3倍
  if (field.attackerSide.isBattery && move.isSpecial()) {
    basePower = applyMod(basePower, MOD.x1_3);
  }

  // パワースポット: 味方の全攻撃技ダメージ 1.3倍
  if (field.attackerSide.isPowerSpot) {
    basePower = applyMod(basePower, MOD.x1_3);
  }

  // はがねのせいしん: 味方の鋼タイプ技ダメージ 1.5倍
  if (field.attackerSide.isSteelySpirit && moveType === 'Steel') {
    basePower = applyMod(basePower, MOD.x1_5);
  }

  // フェアリーオーラ: フェアリー技のダメージ ~1.33倍（オーラブレイク時は0.75倍に反転）
  if (field.isFairyAura && moveType === 'Fairy') {
    basePower = applyMod(basePower, field.isAuraBreak ? MOD.x0_75 : MOD.x1_33);
  }

  // ダークオーラ: あく技のダメージ ~1.33倍（オーラブレイク時は0.75倍に反転）
  if (field.isDarkAura && moveType === 'Dark') {
    basePower = applyMod(basePower, field.isAuraBreak ? MOD.x0_75 : MOD.x1_33);
  }

  basePower = Math.max(1, basePower);

  // 4. Offensive stat (A)
  let A = getOffensiveStat(move, attacker, defender, isCrit);

  // Ability-based attack modifier
  const abilityAtkMod = getAbilityAttackMod(attacker, move, field);
  if (abilityAtkMod !== 1.0) {
    A = Math.floor(A * abilityAtkMod);
  }

  // Item-based attack modifier (Choice Band/Specs)
  const itemAtkMod = getItemAttackMod(attacker, move);
  if (itemAtkMod !== 1.0) {
    A = Math.floor(A * itemAtkMod);
  }

  // フラワーギフト: 晴れ時、味方の物理攻撃力 1.5倍
  if (field.attackerSide.isFlowerGift && move.isPhysical()) {
    const fgWeather = getEffectiveWeatherForAttacker(attacker, field);
    if (fgWeather === 'Sun' || fgWeather === 'Harsh Sunshine') {
      A = Math.floor(A * 1.5);
    }
  }

  // わざわいのうつわ(Tablets of Ruin): 攻撃側の物理攻撃力を0.75倍
  if (field.isTabletsOfRuin && move.isPhysical()) {
    A = Math.floor(A * 0.75);
  }
  // わざわいのおふだ(Vessel of Ruin): 攻撃側の特殊攻撃力を0.75倍
  if (field.isVesselOfRuin && move.isSpecial()) {
    A = Math.floor(A * 0.75);
  }

  // 5. Defensive stat (D)
  let D = getDefensiveStat(move, defender, isCrit);

  // Sandstorm: Rock-type SpD 1.5x
  if (field.effectiveWeather() === 'Sand' && defender.hasType('Rock') && move.isSpecial()) {
    D = Math.floor(D * 1.5);
  }
  // Snow: Ice-type Def 1.5x
  if (field.effectiveWeather() === 'Snow' && defender.hasType('Ice') && move.isPhysical()) {
    D = Math.floor(D * 1.5);
  }

  // Ability-based defense modifier
  const abilityDefMod = getAbilityDefenseMod(defender, move, field);
  if (abilityDefMod !== 1.0) {
    D = Math.floor(D * abilityDefMod);
  }

  // Item-based defense modifier (Assault Vest)
  const itemDefMod = getItemDefenseMod(defender, move);
  if (itemDefMod !== 1.0) {
    D = Math.floor(D * itemDefMod);
  }

  // フラワーギフト: 晴れ時、味方の特防 1.5倍
  if (field.defenderSide.isFlowerGift && move.isSpecial()) {
    const fgDefWeather = field.effectiveWeather();
    if (fgDefWeather === 'Sun' || fgDefWeather === 'Harsh Sunshine') {
      D = Math.floor(D * 1.5);
    }
  }

  // わざわいのつるぎ(Sword of Ruin): 防御側の物理防御を0.75倍
  if (field.isSwordOfRuin && move.isPhysical()) {
    D = Math.floor(D * 0.75);
  }
  // わざわいのたま(Beads of Ruin): 防御側の特殊防御を0.75倍
  if (field.isBeadsOfRuin && move.isSpecial()) {
    D = Math.floor(D * 0.75);
  }

  D = Math.max(1, D);

  // 6. Base damage: floor(floor(2*50/5+2) * Power * A / D) / 50 + 2)
  // = floor(floor(22 * Power * A / D) / 50 + 2)
  let baseDamage = Math.floor(Math.floor((22 * basePower * A) / D) / 50) + 2;

  // 7. Apply modifiers chain

  // Spread move in doubles
  if (field.isDoubles() && move.isSpread) {
    baseDamage = applyMod(baseDamage, MOD.x0_75);
  }

  // Weather modifier
  const effectiveWeather = getEffectiveWeatherForAttacker(attacker, field);
  const weatherMod = getWeatherMod(moveType, effectiveWeather);
  if (weatherMod !== MOD.x1_0) {
    baseDamage = applyMod(baseDamage, weatherMod);
  }

  // Critical hit
  if (isCrit) {
    baseDamage = applyMod(baseDamage, MOD.x1_5);
  }

  // 8. Apply random factor (85-100) to get 16 rolls
  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let dmg = Math.floor((baseDamage * r) / 100);

    // STAB
    const stabMod = getSTABMod(attacker, moveType);
    if (stabMod !== MOD.x1_0) {
      dmg = applyMod(dmg, stabMod);
    }

    // Type effectiveness
    if (typeEff !== 1) {
      dmg = Math.floor(dmg * typeEff);
    }

    // Burn (halves physical damage unless Guts/Facade)
    if (attacker.status === 'brn' && move.isPhysical() &&
        attacker.effectiveAbility() !== 'Guts' && move.bpModifier !== 'facade') {
      dmg = applyMod(dmg, MOD.x0_5);
    }

    // === "other" modifier chain ===

    // Screens (not on crit, not with Infiltrator)
    if (!isCrit && attacker.effectiveAbility() !== 'Infiltrator') {
      if (move.isPhysical() && (field.defenderSide.isReflect || field.defenderSide.isAuroraVeil)) {
        dmg = applyMod(dmg, field.isDoubles() ? MOD.x0_667 : MOD.x0_5);
      }
      if (move.isSpecial() && (field.defenderSide.isLightScreen || field.defenderSide.isAuroraVeil)) {
        dmg = applyMod(dmg, field.isDoubles() ? MOD.x0_667 : MOD.x0_5);
      }
    }

    // Ability final modifiers (Multiscale, Filter, Sniper, etc.)
    const abilityFinalMod = getAbilityFinalMod(attacker, defender, move, typeEff, isCrit);
    if (abilityFinalMod !== MOD.x1_0) {
      dmg = applyMod(dmg, abilityFinalMod);
    }

    // Item final modifiers (Life Orb, Expert Belt, type items)
    const itemFinalMod = getItemFinalMod(attacker, move, moveType, typeEff);
    if (itemFinalMod !== MOD.x1_0) {
      dmg = applyMod(dmg, itemFinalMod);
    }

    // Defender item modifier (resist berries)
    const defItemMod = getItemDefenderFinalMod(defender, moveType, typeEff);
    if (defItemMod !== MOD.x1_0) {
      dmg = applyMod(dmg, defItemMod);
    }

    // Friend Guard in doubles
    if (field.isDoubles() && field.defenderSide.isFriendGuard) {
      dmg = applyMod(dmg, MOD.x0_75);
    }

    // Minimum 1 damage
    dmg = Math.max(1, dmg);

    // おやこあい (Parental Bond): 2撃目 0.25倍を加算
    // 変化技・多段技には適用されない
    if (attacker.effectiveAbility() === 'Parental Bond' && !move.multiHit && move.category !== 'Status') {
      const secondHit = Math.max(1, applyMod(dmg, MOD.x0_25));
      dmg = dmg + secondHit;
    }

    rolls.push(dmg);
  }

  return { rolls, moveType, typeEffectiveness: typeEff, isCrit };
}

// === Helper functions ===

function getWeatherMod(moveType: TypeName, weather: string | undefined): number {
  if (!weather) return MOD.x1_0;
  if ((weather === 'Sun' || weather === 'Harsh Sunshine') && moveType === 'Fire') return MOD.x1_5;
  if ((weather === 'Sun' || weather === 'Harsh Sunshine') && moveType === 'Water') return MOD.x0_5;
  if ((weather === 'Rain' || weather === 'Heavy Rain') && moveType === 'Water') return MOD.x1_5;
  if ((weather === 'Rain' || weather === 'Heavy Rain') && moveType === 'Fire') return MOD.x0_5;
  return MOD.x1_0;
}

function getTerrainType(terrain: string): TypeName | undefined {
  switch (terrain) {
    case 'Electric': return 'Electric';
    case 'Grassy': return 'Grass';
    case 'Psychic': return 'Psychic';
    default: return undefined;
  }
}
