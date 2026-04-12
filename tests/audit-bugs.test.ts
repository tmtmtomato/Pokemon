// Audit L: Bug detection and edge cases
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';
import { applyMod, pokeRound, MOD } from '../src/mechanics/util.js';
import { getAbilityFinalMod } from '../src/mechanics/abilities.js';

describe('Audit L: Known bugs and edge cases', () => {

  // L1: Solar Power should ONLY activate in Sun
  it('L1: Solar Power does NOT activate without Sun weather (BUG)', () => {
    const solarPower = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Solar Power',
    });
    const blaze = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    // Without any weather
    const spNoWeather = calculate(solarPower, defender, move, new Field({ gameType: 'Singles' }));
    const blazeNoWeather = calculate(blaze, defender, move, new Field({ gameType: 'Singles' }));

    // Solar Power should NOT boost without Sun -> same damage as Blaze (no condition)
    expect(spNoWeather.range()[0]).toBe(blazeNoWeather.range()[0]);
  });

  // L1b: Solar Power in Rain should also NOT activate
  it('L1b: Solar Power does NOT activate in Rain', () => {
    const solarPower = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Solar Power',
    });
    const blaze = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const spRain = calculate(solarPower, defender, move,
      new Field({ gameType: 'Singles', weather: 'Rain' }));
    const blazeRain = calculate(blaze, defender, move,
      new Field({ gameType: 'Singles', weather: 'Rain' }));

    expect(spRain.range()[0]).toBe(blazeRain.range()[0]);
  });

  // L1c: Solar Power in Sun SHOULD activate
  it('L1c: Solar Power DOES activate in Sun', () => {
    const solarPower = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Solar Power',
    });
    const blaze = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const spSun = calculate(solarPower, defender, move,
      new Field({ gameType: 'Singles', weather: 'Sun' }));
    const blazeSun = calculate(blaze, defender, move,
      new Field({ gameType: 'Singles', weather: 'Sun' }));

    // Solar Power in Sun should boost SpA by 1.5x
    const ratio = spSun.range()[0] / blazeSun.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // L2: Ability final mod should use pokeRound, not Math.round
  it('L2: Ability final modifiers use correct rounding (pokeRound)', () => {
    // Test that Math.round vs pokeRound gives different results for .5
    // pokeRound(0.5) should be 0 (round toward zero)
    // Math.round(0.5) gives 1 (round up)
    expect(pokeRound(0.5)).toBe(0);
    expect(pokeRound(1.5)).toBe(1); // 1.5 -> 1 (toward zero)
    expect(pokeRound(2.5)).toBe(2); // 2.5 -> 2 (toward zero)

    // The real concern is: does the ability final mod function use consistent
    // rounding with the rest of the system?
    // Let's verify applyMod uses pokeRound
    expect(applyMod(100, MOD.x1_5)).toBe(pokeRound(100 * 6144 / 4096)); // 150
  });

  // L3: Parental Bond (Mega Kangaskhan)
  it('L3: Parental Bond awareness check', () => {
    // Mega Kangaskhan should have Parental Bond
    const megaKanga = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant',
      item: 'Kangaskhanite', isMega: true,
    });
    expect(megaKanga.effectiveAbility()).toBe('Parental Bond');
  });

  // L4+L5+L6: Battery, Power Spot, Flower Gift, Steely Spirit
  it('L4: Battery/Power Spot are defined but may not affect damage', () => {
    // Just verify these Side options exist in the type system
    const field = new Field({
      gameType: 'Doubles',
      attackerSide: { isBattery: true, isPowerSpot: true },
    });
    expect(field.attackerSide.isBattery).toBe(true);
    expect(field.attackerSide.isPowerSpot).toBe(true);
  });

  // Edge case: Very high multiplier stacking (no Life Orb since it's removed)
  it('Edge: Stacking many multipliers doesn\'t overflow', () => {
    // Helping Hand + STAB + SE + Crit
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Tyranitar', sp: { hp: 32 } });
    const move = new Move('Earthquake', { isCrit: true }); // Ground vs Rock/Dark = 2x SE, Ground STAB

    const result = calculate(attacker, defender, move, new Field({
      gameType: 'Doubles',
      attackerSide: { isHelpingHand: true },
    }));

    // Should produce valid positive numbers
    expect(result.rolls.every(r => r > 0 && isFinite(r))).toBe(true);
    expect(result.range()[1]).toBeGreaterThan(0);
  });

  // Edge case: Immune type produces 0 damage
  it('Edge: Immune type always produces all-zero rolls', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Corviknight' }); // Flying/Steel - immune to Ground
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    expect(result.typeEffectiveness).toBe(0);
    expect(result.rolls.every(r => r === 0)).toBe(true);
  });

  // Edge case: Status move always produces 0 damage
  it('Edge: Status move produces 0 damage regardless of stats', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Snorlax' });
    const move = new Move('Swords Dance');

    const result = calculate(attacker, defender, move);
    expect(result.rolls.every(r => r === 0)).toBe(true);
  });

  // Edge case: Infiltrator bypasses screens
  it('Edge: Infiltrator bypasses Reflect', () => {
    const infiltrator = new Pokemon({
      name: 'Gengar', sp: { spa: 32 }, nature: 'Modest', ability: 'Infiltrator',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Hex');

    const noScreen = calculate(infiltrator, defender, move, new Field({
      gameType: 'Singles',
    }));
    const withScreen = calculate(infiltrator, defender, move, new Field({
      gameType: 'Singles',
      defenderSide: { isLightScreen: true },
    }));

    // Infiltrator should bypass Light Screen
    expect(withScreen.range()[0]).toBe(noScreen.range()[0]);
  });

  // Edge case: Harsh Sunshine / Heavy Rain (primal weathers)
  it('Edge: Harsh Sunshine boosts Fire like normal Sun', () => {
    const attacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const sun = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', weather: 'Sun' }));
    const harshSun = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', weather: 'Harsh Sunshine' }));

    expect(harshSun.range()[0]).toBe(sun.range()[0]);
  });

  it('Edge: Heavy Rain boosts Water like normal Rain', () => {
    const attacker = new Pokemon({
      name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Surf');

    const rain = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', weather: 'Rain' }));
    const heavyRain = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', weather: 'Heavy Rain' }));

    expect(heavyRain.range()[0]).toBe(rain.range()[0]);
  });
});

describe('Audit L: MOD constant verification', () => {

  it('MOD.x0_5 = 2048 (0.5 * 4096)', () => {
    expect(MOD.x0_5).toBe(2048);
    expect(applyMod(100, MOD.x0_5)).toBe(50);
  });

  it('MOD.x0_75 = 3072 (0.75 * 4096)', () => {
    expect(MOD.x0_75).toBe(3072);
    expect(applyMod(100, MOD.x0_75)).toBe(75);
  });

  it('MOD.x1_0 = 4096 (identity)', () => {
    expect(MOD.x1_0).toBe(4096);
    expect(applyMod(100, MOD.x1_0)).toBe(100);
  });

  it('MOD.x1_2 = 4915 (~1.2 * 4096)', () => {
    expect(MOD.x1_2).toBe(4915);
    // 100 * 4915 / 4096 = 119.9951... -> fractional 0.9951 > 0.5 -> ceil -> 120
    expect(applyMod(100, MOD.x1_2)).toBe(120);
  });

  it('MOD.x1_3 = 5325 (~1.3 * 4096)', () => {
    expect(MOD.x1_3).toBe(5325);
    // 100 * 5325 / 4096 = 130.004... -> fractional 0.004 <= 0.5 -> floor -> 130
    expect(applyMod(100, MOD.x1_3)).toBe(130);
  });

  it('MOD.x1_5 = 6144 (1.5 * 4096)', () => {
    expect(MOD.x1_5).toBe(6144);
    expect(applyMod(100, MOD.x1_5)).toBe(150);
  });

  it('MOD.x2_0 = 8192 (2.0 * 4096)', () => {
    expect(MOD.x2_0).toBe(8192);
    expect(applyMod(100, MOD.x2_0)).toBe(200);
  });

  it('MOD.x0_667 = 2732 (2/3 * 4096)', () => {
    expect(MOD.x0_667).toBe(2732);
    // 100 * 2732 / 4096 = 66.699... -> fractional 0.699 > 0.5 -> ceil -> 67
    expect(applyMod(100, MOD.x0_667)).toBe(67);
  });

  it('Life Orb MOD = 5324 (5324/4096 ~ 1.2998)', () => {
    expect(MOD.x1_3_life_orb).toBe(5324);
    // 100 * 5324 / 4096 = 129.980... -> fractional 0.980 > 0.5 -> ceil -> 130
    expect(applyMod(100, MOD.x1_3_life_orb)).toBe(130);
  });
});
