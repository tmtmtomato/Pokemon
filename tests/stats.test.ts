import { describe, it, expect } from 'vitest';
import { calcHP, calcStat, getNatureModifier, applyBoost, calcAllStats, validateSP } from '../src/mechanics/stats.js';

describe('calcHP', () => {
  it('Garchomp base 108 HP, SP 0', () => {
    // floor((2*108+31)*50/100) + 60 + 0 = floor(247*50/100) + 60 = 123 + 60 = 183
    expect(calcHP(108, 0)).toBe(183);
  });

  it('Garchomp base 108 HP, SP 32 (max)', () => {
    // 123 + 60 + 32 = 215
    expect(calcHP(108, 32)).toBe(215);
  });

  it('Blissey base 255 HP, SP 0', () => {
    // floor((2*255+31)*50/100) + 60 = floor(541*50/100) + 60 = 270 + 60 = 330
    expect(calcHP(255, 0)).toBe(330);
  });

  it('Blissey base 255 HP, SP 32', () => {
    expect(calcHP(255, 32)).toBe(362);
  });

  it('Shedinja-like base 1 HP, SP 0', () => {
    // floor((2*1+31)*50/100) + 60 = floor(33*50/100) + 60 = 16 + 60 = 76
    // Note: in actual game Shedinja stays at 1 HP, but the formula gives 76
    expect(calcHP(1, 0)).toBe(76);
  });
});

describe('calcStat', () => {
  it('Garchomp base 130 Atk, SP 32, Adamant (+Atk)', () => {
    // floor((floor((2*130+31)*50/100) + 5 + 32) * 1.1)
    // = floor((floor(291*50/100) + 37) * 1.1)
    // = floor((145 + 37) * 1.1)
    // = floor(182 * 1.1) = floor(200.2) = 200
    expect(calcStat(130, 32, 1.1)).toBe(200);
  });

  it('Garchomp base 130 Atk, SP 0, Adamant', () => {
    // floor((145 + 5 + 0) * 1.1) = floor(150 * 1.1) = floor(165) = 165
    expect(calcStat(130, 0, 1.1)).toBe(165);
  });

  it('Garchomp base 130 Atk, SP 32, neutral nature', () => {
    // floor((145 + 5 + 32) * 1.0) = 182
    expect(calcStat(130, 32, 1.0)).toBe(182);
  });

  it('Metagross base 135 Atk, SP 32, Adamant', () => {
    // floor((floor((2*135+31)*50/100) + 5 + 32) * 1.1)
    // = floor((floor(301*50/100) + 37) * 1.1)
    // = floor((150 + 37) * 1.1)
    // = floor(187 * 1.1) = floor(205.7) = 205
    expect(calcStat(135, 32, 1.1)).toBe(205);
  });

  it('Chansey base 5 Atk, SP 0, neutral', () => {
    // floor((floor((2*5+31)*50/100) + 5 + 0) * 1.0)
    // = floor(20 + 5) = 25
    expect(calcStat(5, 0, 1.0)).toBe(25);
  });

  it('handles hindering nature (-10%)', () => {
    // Garchomp base 130 Atk, SP 32, Modest (-Atk)
    // floor(182 * 0.9) = floor(163.8) = 163
    expect(calcStat(130, 32, 0.9)).toBe(163);
  });
});

describe('getNatureModifier', () => {
  it('Adamant boosts Atk', () => {
    expect(getNatureModifier('Adamant', 'atk')).toBe(1.1);
  });

  it('Adamant hinders SpA', () => {
    expect(getNatureModifier('Adamant', 'spa')).toBe(0.9);
  });

  it('Adamant is neutral for Def', () => {
    expect(getNatureModifier('Adamant', 'def')).toBe(1.0);
  });

  it('Hardy (neutral) is 1.0 for everything', () => {
    expect(getNatureModifier('Hardy', 'atk')).toBe(1.0);
    expect(getNatureModifier('Hardy', 'spa')).toBe(1.0);
  });

  it('Nature never affects HP', () => {
    expect(getNatureModifier('Adamant', 'hp')).toBe(1.0);
    expect(getNatureModifier('Bold', 'hp')).toBe(1.0);
  });

  it('Jolly boosts Spe, hinders SpA', () => {
    expect(getNatureModifier('Jolly', 'spe')).toBe(1.1);
    expect(getNatureModifier('Jolly', 'spa')).toBe(0.9);
  });

  it('Modest boosts SpA, hinders Atk', () => {
    expect(getNatureModifier('Modest', 'spa')).toBe(1.1);
    expect(getNatureModifier('Modest', 'atk')).toBe(0.9);
  });
});

describe('applyBoost', () => {
  it('+0 is identity', () => {
    expect(applyBoost(100, 0)).toBe(100);
  });

  it('+1 is 1.5x', () => {
    expect(applyBoost(100, 1)).toBe(150);
  });

  it('+2 is 2.0x', () => {
    expect(applyBoost(100, 2)).toBe(200);
  });

  it('+6 is 4.0x', () => {
    expect(applyBoost(100, 6)).toBe(400);
  });

  it('-1 is 2/3x', () => {
    expect(applyBoost(100, -1)).toBe(66); // floor(200/3) = 66
  });

  it('-2 is 0.5x', () => {
    expect(applyBoost(100, -2)).toBe(50);
  });

  it('-6 is 0.25x', () => {
    expect(applyBoost(100, -6)).toBe(25);
  });

  it('clamps to [-6, +6]', () => {
    expect(applyBoost(100, 7)).toBe(applyBoost(100, 6));
    expect(applyBoost(100, -7)).toBe(applyBoost(100, -6));
  });

  it('handles non-round stat values', () => {
    // Garchomp 200 Atk at +1: floor(200 * 3/2) = 300
    expect(applyBoost(200, 1)).toBe(300);
    // 165 Atk at -1: floor(165 * 2/3) = floor(110) = 110
    expect(applyBoost(165, -1)).toBe(110);
  });
});

describe('calcAllStats', () => {
  it('calculates Garchomp stats with SP32 Atk, SP32 Spe, Jolly', () => {
    const baseStats = { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 };
    const sp = { atk: 32, spe: 32 };
    const stats = calcAllStats(baseStats, sp, 'Jolly');

    expect(stats.hp).toBe(183);       // SP 0
    expect(stats.atk).toBe(182);      // SP 32, neutral (Jolly doesn't boost atk)
    expect(stats.spe).toBe(169);      // SP 32, +Spe
    expect(stats.spa).toBeLessThan(stats.atk); // Jolly hinders SpA
  });
});

describe('validateSP', () => {
  it('valid: 32+32+2 = 66', () => {
    const result = validateSP({ hp: 0, atk: 32, def: 0, spa: 0, spd: 2, spe: 32 });
    expect(result.valid).toBe(true);
    expect(result.total).toBe(66);
  });

  it('invalid: over 66 total', () => {
    const result = validateSP({ atk: 32, def: 32, spe: 32 });
    expect(result.valid).toBe(false);
    expect(result.total).toBe(96);
  });

  it('invalid: over 32 per stat', () => {
    const result = validateSP({ atk: 33 });
    expect(result.valid).toBe(false);
  });

  it('valid: all zeros', () => {
    const result = validateSP({});
    expect(result.valid).toBe(true);
    expect(result.total).toBe(0);
  });
});
