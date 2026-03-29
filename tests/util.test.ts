import { describe, it, expect } from 'vitest';
import { pokeRound, applyMod, chainMods, toMod, clamp, MOD } from '../src/mechanics/util.js';

describe('pokeRound', () => {
  it('rounds down for values below 0.5', () => {
    expect(pokeRound(10.3)).toBe(10);
    expect(pokeRound(10.49)).toBe(10);
  });

  it('rounds DOWN (toward zero) for exactly 0.5', () => {
    expect(pokeRound(10.5)).toBe(10);
    expect(pokeRound(100.5)).toBe(100);
    expect(pokeRound(0.5)).toBe(0);
  });

  it('rounds up for values above 0.5', () => {
    expect(pokeRound(10.51)).toBe(11);
    expect(pokeRound(10.9)).toBe(11);
  });

  it('handles integers unchanged', () => {
    expect(pokeRound(42)).toBe(42);
    expect(pokeRound(0)).toBe(0);
  });
});

describe('applyMod', () => {
  it('1.0x modifier is identity', () => {
    expect(applyMod(100, MOD.x1_0)).toBe(100);
  });

  it('1.5x modifier works correctly', () => {
    // 100 * 6144 / 4096 = 150.0 exactly
    expect(applyMod(100, MOD.x1_5)).toBe(150);
  });

  it('0.5x modifier halves value', () => {
    expect(applyMod(100, MOD.x0_5)).toBe(50);
  });

  it('Life Orb modifier (5324/4096)', () => {
    // 100 * 5324 / 4096 = 129.98... -> rounds to 129 (0.98 > 0.5 -> 130)
    expect(applyMod(100, MOD.x1_3_life_orb)).toBe(130);
  });

  it('handles intermediate rounding correctly', () => {
    // 77 * 6144 / 4096 = 115.5 -> pokeRound -> 115 (exactly 0.5 rounds down)
    expect(applyMod(77, MOD.x1_5)).toBe(115);
  });
});

describe('chainMods', () => {
  it('single modifier same as applyMod', () => {
    expect(chainMods(100, MOD.x1_5)).toBe(applyMod(100, MOD.x1_5));
  });

  it('chains two modifiers sequentially', () => {
    // 100 * 1.5 = 150, then 150 * 0.5 = 75
    const result = chainMods(100, MOD.x1_5, MOD.x0_5);
    expect(result).toBe(75);
  });

  it('order matters due to intermediate rounding', () => {
    // 77 * 1.5 = 115.5 -> 115, then 115 * 0.75 = 86.25 -> 86
    const a = chainMods(77, MOD.x1_5, MOD.x0_75);
    // 77 * 3072/4096 = 57.75 -> pokeRound(57.75) = 58 (0.75 > 0.5)
    // then 58 * 6144/4096 = 87.0 -> 87
    const b = chainMods(77, MOD.x0_75, MOD.x1_5);
    // They can differ due to intermediate rounding
    expect(a).toBe(86);
    expect(b).toBe(87);
  });
});

describe('toMod', () => {
  it('converts common multipliers', () => {
    expect(toMod(1.0)).toBe(4096);
    expect(toMod(1.5)).toBe(6144);
    expect(toMod(0.5)).toBe(2048);
    expect(toMod(2.0)).toBe(8192);
  });
});

describe('clamp', () => {
  it('clamps values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
