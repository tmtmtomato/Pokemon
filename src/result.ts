// Result class - damage ranges, KO chance, and description
import type { DamageRoll, KOChance } from './types.js';

export class Result {
  readonly rolls: number[];
  readonly moveName: string;
  readonly moveType: string;
  readonly typeEffectiveness: number;
  readonly isCrit: boolean;
  readonly attackerName: string;
  readonly defenderName: string;
  readonly defenderMaxHP: number;

  constructor(params: {
    rolls: number[];
    moveName: string;
    moveType: string;
    typeEffectiveness: number;
    isCrit: boolean;
    attackerName: string;
    defenderName: string;
    defenderMaxHP: number;
  }) {
    this.rolls = params.rolls;
    this.moveName = params.moveName;
    this.moveType = params.moveType;
    this.typeEffectiveness = params.typeEffectiveness;
    this.isCrit = params.isCrit;
    this.attackerName = params.attackerName;
    this.defenderName = params.defenderName;
    this.defenderMaxHP = params.defenderMaxHP;
  }

  /** Get [min, max] damage range. */
  range(): [number, number] {
    if (this.rolls.length === 0) return [0, 0];
    return [Math.min(...this.rolls), Math.max(...this.rolls)];
  }

  /** Get damage range as percentage of defender's HP. */
  percentRange(): [number, number] {
    const [min, max] = this.range();
    if (this.defenderMaxHP === 0) return [0, 0];
    return [
      Math.round((min / this.defenderMaxHP) * 1000) / 10,
      Math.round((max / this.defenderMaxHP) * 1000) / 10,
    ];
  }

  /** Calculate KO chance. */
  koChance(defenderCurrentHP?: number): KOChance {
    const hp = defenderCurrentHP ?? this.defenderMaxHP;

    if (hp <= 0 || this.rolls.every(r => r === 0)) {
      return { chance: 0, n: 0, text: 'No damage' };
    }

    // Check OHKO
    const ohkoCount = this.rolls.filter(r => r >= hp).length;
    if (ohkoCount === 16) {
      return { chance: 1.0, n: 1, text: 'guaranteed OHKO' };
    }
    if (ohkoCount > 0) {
      const chance = ohkoCount / 16;
      return {
        chance,
        n: 1,
        text: `${(chance * 100).toFixed(1)}% chance to OHKO`,
      };
    }

    // Check 2HKO (simplified: best case both max rolls, worst case both min rolls)
    const [min, max] = this.range();
    if (min * 2 >= hp) {
      return { chance: 1.0, n: 2, text: 'guaranteed 2HKO' };
    }
    if (max * 2 >= hp) {
      // Count how many roll combinations give 2HKO
      let twoHitKOCount = 0;
      for (const r1 of this.rolls) {
        for (const r2 of this.rolls) {
          if (r1 + r2 >= hp) twoHitKOCount++;
        }
      }
      const chance = twoHitKOCount / (16 * 16);
      return {
        chance,
        n: 2,
        text: `${(chance * 100).toFixed(1)}% chance to 2HKO`,
      };
    }

    // Check 3HKO
    if (min * 3 >= hp) {
      return { chance: 1.0, n: 3, text: 'guaranteed 3HKO' };
    }
    if (max * 3 >= hp) {
      const chance = estimate3HKOChance(this.rolls, hp);
      return {
        chance,
        n: 3,
        text: `${(chance * 100).toFixed(1)}% chance to 3HKO`,
      };
    }

    // Check 4HKO
    if (min * 4 >= hp) {
      return { chance: 1.0, n: 4, text: 'guaranteed 4HKO' };
    }

    // General case
    const n = Math.ceil(hp / min);
    return {
      chance: 1.0,
      n,
      text: `guaranteed ${n}HKO`,
    };
  }

  /** Human-readable damage description. */
  desc(): string {
    const [min, max] = this.range();
    const [minP, maxP] = this.percentRange();
    const ko = this.koChance();
    const crit = this.isCrit ? ' (crit)' : '';
    return `${this.attackerName} ${this.moveName}${crit} vs ${this.defenderName}: ${min}-${max} (${minP}-${maxP}%) -- ${ko.text}`;
  }
}

/**
 * Estimate 3HKO chance using sampling (since full enumeration is 16^3 = 4096).
 */
function estimate3HKOChance(rolls: number[], hp: number): number {
  let koCount = 0;
  const total = rolls.length ** 3;
  for (const r1 of rolls) {
    for (const r2 of rolls) {
      for (const r3 of rolls) {
        if (r1 + r2 + r3 >= hp) koCount++;
      }
    }
  }
  return koCount / total;
}
