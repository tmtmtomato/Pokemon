// Audit B: Core damage formula verification with hand-calculated values
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('Audit B: Core damage formula - hand-calculated verification', () => {

  // B1: Base formula: floor(floor(22 * BP * A / D) / 50) + 2
  it('B1: Base damage matches hand calculation (Garchomp EQ vs Excadrill)', () => {
    // Garchomp: Adamant, 32 SP Atk
    // Base Atk = 130, SP = 32, Nature = 1.1
    // Raw Atk = floor((floor((2*130+31)*50/100) + 5 + 32) * 1.1)
    //         = floor((floor(14550/100) + 37) * 1.1)
    //         = floor((145 + 37) * 1.1)
    //         = floor(182 * 1.1)
    //         = floor(200.2) = 200
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil',
    });
    expect(attacker.rawStats.atk).toBe(200);

    // Excadrill: Impish (+Def/-SpA), 32 SP HP, 32 SP Def
    // Base Def = 60, SP = 32, Nature = 1.1
    // Raw Def = floor((floor((2*60+31)*50/100) + 5 + 32) * 1.1)
    //         = floor((floor(7550/100) + 37) * 1.1)
    //         = floor((75 + 37) * 1.1) = floor(123.2) = 123
    const defender = new Pokemon({
      name: 'Excadrill', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Sand Rush',
    });
    expect(defender.rawStats.def).toBe(123);

    // Excadrill HP: floor((2*110+31)*50/100) + 50 + 10 + 32
    //             = floor(12550/100) + 92 = 125 + 92 = 217
    expect(defender.rawStats.hp).toBe(217);

    // Base damage = floor(floor(22 * 100 * 200 / 123) / 50) + 2
    //             = floor(floor(440000 / 123) / 50) + 2
    //             = floor(3577 / 50) + 2
    //             = floor(71.54) + 2 = 71 + 2 = 73
    // Type effectiveness = 1x (Ground vs Ground/Steel: 1*2 = 2... wait, Ground vs Steel is 2x, Ground vs Ground is 1x = 2x total)
    // STAB = 1.5x (Garchomp is Dragon/Ground, EQ is Ground)

    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });
    const result = calculate(attacker, defender, move, field);

    expect(result.rolls).toHaveLength(16);
    expect(result.typeEffectiveness).toBe(2);
    // We verify rolls by running the calc engine (exact values depend on rounding chain)
    // r=85: floor(73*85/100) = 62 -> STAB: applyMod(62, 6144) = pokeRound(62*1.5) = 93 -> Type: 93*2 = 186
    // r=100: floor(73*100/100) = 73 -> STAB: applyMod(73, 6144) = pokeRound(73*1.5) = pokeRound(109.5) = 109 -> Type: 109*2 = 218
    expect(result.rolls[0]).toBe(186);   // r=85
    expect(result.rolls[15]).toBe(218);  // r=100
  });

  // B2: All 16 random rolls are distinct and increasing
  it('B2: 16 rolls from 85-100 are non-decreasing', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    expect(result.rolls).toHaveLength(16);

    for (let i = 1; i < result.rolls.length; i++) {
      expect(result.rolls[i]).toBeGreaterThanOrEqual(result.rolls[i - 1]);
    }
  });

  // B3: Minimum damage is 1 (very weak attack)
  it('B3: Minimum damage is 1 even for tiny damage', () => {
    // Snorlax with Bold (-Atk) and no SP Atk vs high Def Corviknight
    const attacker = new Pokemon({ name: 'Snorlax', sp: {}, nature: 'Bold', ability: 'Immunity' });
    const defender = new Pokemon({
      name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor',
    });
    // Return: 102 BP, Normal vs Flying/Steel = 0.5x (Normal vs Steel)
    const move = new Move('Return');
    const field = new Field({ gameType: 'Singles' });
    const result = calculate(attacker, defender, move, field);

    // All rolls should be >= 1
    for (const roll of result.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1);
    }
  });

  // B4: Modifier application order verification
  it('B4: Spread+Weather+STAB+Type all apply correctly together', () => {
    // Pelipper (Water/Flying) using Surf (Water, spread) in Rain in Doubles
    // Against Garchomp (Dragon/Ground) -> Water vs Ground = 2x, Water vs Dragon = 0.5x -> 1x total
    const attacker = new Pokemon({
      name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Surf');

    // Singles, no weather (baseline)
    const baseline = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));

    // Doubles with Rain
    const doublesRain = calculate(attacker, defender, move, new Field({
      gameType: 'Doubles',
      weather: 'Rain',
    }));

    // Doubles should have spread (0.75x) and rain (1.5x for water) = 0.75*1.5 = 1.125x vs singles
    // Due to rounding, this should be approximately 1.125x
    const ratio = doublesRain.range()[0] / baseline.range()[0];
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.2);
  });

  // B5: Neutral damage (no STAB, no SE) hand calculation
  it('B5: Neutral damage hand calculation (no STAB, no SE)', () => {
    // Garchomp (Dragon/Ground) using Crunch (Dark) vs Corviknight (Flying/Steel)
    // Dark vs Flying = 1, Dark vs Steel = 1 -> 1x. No STAB (Garchomp is Dragon/Ground)
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil',
    });
    const defender = new Pokemon({
      name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor',
    });
    // Garchomp Atk: 200 (verified above)
    // Corviknight Def: base 105, SP=32, Impish(+Def)
    // = floor((floor((2*105+31)*50/100) + 5 + 32) * 1.1)
    // = floor((floor(12050/100) + 37) * 1.1)
    // = floor((120 + 37) * 1.1)
    // = floor(157 * 1.1)
    // = floor(172.7) = 172
    expect(defender.rawStats.def).toBe(172);

    const move = new Move('Crunch');
    const field = new Field({ gameType: 'Singles' });
    const result = calculate(attacker, defender, move, field);

    // Base damage = floor(floor(22 * 80 * 200 / 172) / 50) + 2
    //             = floor(floor(352000 / 172) / 50) + 2
    //             = floor(floor(2046.51) / 50) + 2
    //             = floor(2046 / 50) + 2
    //             = floor(40.92) + 2 = 40 + 2 = 42
    // No STAB, 1x type effectiveness
    // r=85: floor(42*85/100) = floor(35.7) = 35
    // r=100: floor(42*100/100) = 42
    expect(result.typeEffectiveness).toBe(1);
    expect(result.rolls[0]).toBe(35);   // r=85
    expect(result.rolls[15]).toBe(42);  // r=100
  });
});
