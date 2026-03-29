import { describe, it, expect } from 'vitest';
import { getEffectiveness, getEffectivenessLabel, isImmune, isSuperEffective, isNotVeryEffective } from '../src/mechanics/type-effectiveness.js';

describe('getEffectiveness', () => {
  // 4x (Extremely Effective)
  it('Ice vs Grass/Ground (Torterra) = 4x', () => {
    expect(getEffectiveness('Ice', ['Grass', 'Ground'])).toBe(4);
  });

  it('Fighting vs Normal/Ice = 4x', () => {
    expect(getEffectiveness('Fighting', ['Normal', 'Ice'])).toBe(4);
  });

  it('Ground vs Fire/Steel (Heatran-like) = 4x', () => {
    expect(getEffectiveness('Ground', ['Fire', 'Steel'])).toBe(4);
  });

  // 2x (Super Effective)
  it('Fire vs Grass = 2x', () => {
    expect(getEffectiveness('Fire', ['Grass'])).toBe(2);
  });

  it('Water vs Fire = 2x', () => {
    expect(getEffectiveness('Water', ['Fire'])).toBe(2);
  });

  it('Fire vs Bug/Steel (Scizor) = 4x', () => {
    expect(getEffectiveness('Fire', ['Bug', 'Steel'])).toBe(4);
  });

  // 1x (Neutral)
  it('Normal vs Normal = 1x', () => {
    expect(getEffectiveness('Normal', ['Normal'])).toBe(1);
  });

  it('Fire vs Water/Grass = 1x (cancel out)', () => {
    // Fire vs Water = 0.5, Fire vs Grass = 2 -> 0.5 * 2 = 1
    expect(getEffectiveness('Fire', ['Water', 'Grass'])).toBe(1);
  });

  // 0.5x (Not Very Effective)
  it('Fire vs Water = 0.5x', () => {
    expect(getEffectiveness('Fire', ['Water'])).toBe(0.5);
  });

  it('Grass vs Fire = 0.5x', () => {
    expect(getEffectiveness('Grass', ['Fire'])).toBe(0.5);
  });

  // 0.25x (Mostly Ineffective)
  it('Grass vs Bug/Steel (Scizor) = 0.25x', () => {
    expect(getEffectiveness('Grass', ['Bug', 'Steel'])).toBe(0.25);
  });

  it('Bug vs Fire/Flying = 0.25x', () => {
    expect(getEffectiveness('Bug', ['Fire', 'Flying'])).toBe(0.25);
  });

  // 0x (Immune)
  it('Normal vs Ghost = 0x', () => {
    expect(getEffectiveness('Normal', ['Ghost'])).toBe(0);
  });

  it('Electric vs Ground = 0x', () => {
    expect(getEffectiveness('Electric', ['Ground'])).toBe(0);
  });

  it('Fighting vs Ghost = 0x', () => {
    expect(getEffectiveness('Fighting', ['Ghost'])).toBe(0);
  });

  it('Ghost vs Normal = 0x', () => {
    expect(getEffectiveness('Ghost', ['Normal'])).toBe(0);
  });

  it('Dragon vs Fairy = 0x', () => {
    expect(getEffectiveness('Dragon', ['Fairy'])).toBe(0);
  });

  it('Ground vs Flying = 0x', () => {
    expect(getEffectiveness('Ground', ['Flying'])).toBe(0);
  });

  it('Poison vs Steel = 0x', () => {
    expect(getEffectiveness('Poison', ['Steel'])).toBe(0);
  });

  it('Psychic vs Dark = 0x', () => {
    expect(getEffectiveness('Psychic', ['Dark'])).toBe(0);
  });

  // Immunity overrides super effective
  it('Ground vs Flying/Water = 0x (immunity overrides)', () => {
    expect(getEffectiveness('Ground', ['Flying', 'Water'])).toBe(0);
  });

  it('Fighting vs Ghost/Normal = 0x', () => {
    expect(getEffectiveness('Fighting', ['Ghost', 'Normal'])).toBe(0);
  });

  // Single type pokemon
  it('works with single-type array', () => {
    expect(getEffectiveness('Water', ['Fire'])).toBe(2);
  });

  // Dual type - Steel/Fairy
  it('Poison vs Steel/Fairy = 0x (Steel immunity)', () => {
    expect(getEffectiveness('Poison', ['Steel', 'Fairy'])).toBe(0);
  });

  it('Fire vs Steel/Fairy = 2x', () => {
    expect(getEffectiveness('Fire', ['Steel', 'Fairy'])).toBe(2);
  });

  it('Ground vs Steel/Fairy = 2x', () => {
    expect(getEffectiveness('Ground', ['Steel', 'Fairy'])).toBe(2);
  });
});

describe('getEffectivenessLabel', () => {
  it('returns Champions-style labels', () => {
    expect(getEffectivenessLabel(4)).toBe('Extremely effective');
    expect(getEffectivenessLabel(2)).toBe('Super effective');
    expect(getEffectivenessLabel(1)).toBe('Neutral');
    expect(getEffectivenessLabel(0.5)).toBe('Not very effective');
    expect(getEffectivenessLabel(0.25)).toBe('Mostly ineffective');
    expect(getEffectivenessLabel(0)).toBe('No effect');
  });
});

describe('isImmune', () => {
  it('Electric vs Ground is immune', () => {
    expect(isImmune('Electric', ['Ground'])).toBe(true);
  });

  it('Fire vs Grass is not immune', () => {
    expect(isImmune('Fire', ['Grass'])).toBe(false);
  });
});

describe('isSuperEffective', () => {
  it('Fire vs Grass is super effective', () => {
    expect(isSuperEffective('Fire', ['Grass'])).toBe(true);
  });

  it('Normal vs Rock is not super effective', () => {
    expect(isSuperEffective('Normal', ['Rock'])).toBe(false);
  });
});

describe('isNotVeryEffective', () => {
  it('Fire vs Water is not very effective', () => {
    expect(isNotVeryEffective('Fire', ['Water'])).toBe(true);
  });

  it('Normal vs Ghost is NOT "not very effective" (it is immune)', () => {
    expect(isNotVeryEffective('Normal', ['Ghost'])).toBe(false);
  });
});
