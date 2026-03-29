// Audit B: Core damage formula verification with hand-calculated values
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('Audit B: Core damage formula - hand-calculated verification', () => {

  // B1: Base formula: floor(floor(22 * BP * A / D) / 50) + 2
  it('B1: Base damage matches hand calculation (Garchomp EQ vs Metagross)', () => {
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

    // Metagross: Impish (+Def/-SpA), 32 SP HP, 32 SP Def
    // Base Def = 130, SP = 32, Nature = 1.1
    // Raw Def = floor((floor((2*130+31)*50/100) + 5 + 32) * 1.1) = 200
    const defender = new Pokemon({
      name: 'Metagross', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Clear Body',
    });
    expect(defender.rawStats.def).toBe(200);

    // Metagross HP: floor((2*80+31)*50/100) + 50 + 10 + 32
    //             = floor(9550/100) + 92 = 95 + 92 = 187
    expect(defender.rawStats.hp).toBe(187);

    // Base damage = floor(floor(22 * 100 * 200 / 200) / 50) + 2
    //             = floor(floor(440000 / 200) / 50) + 2
    //             = floor(2200 / 50) + 2
    //             = floor(44) + 2 = 46
    // Then: Type effectiveness = 2x (Ground vs Steel/Psychic: 2*1 = 2)
    // STAB = 1.5x (Garchomp is Dragon/Ground, EQ is Ground)
    // Singles, no weather, no crit, no burn, no items, no abilities affecting

    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });
    const result = calculate(attacker, defender, move, field);

    // 16 rolls from 85-100
    // For roll r: floor(46 * r / 100) * STAB(1.5) * Type(2)
    // r=85: floor(46*85/100) = floor(39.1) = 39
    //   -> STAB: applyMod(39, 6144) = pokeRound(39*6144/4096) = pokeRound(58.5) = 58
    //   -> Type: floor(58 * 2) = 116
    // r=100: floor(46*100/100) = 46
    //   -> STAB: applyMod(46, 6144) = pokeRound(46*6144/4096) = pokeRound(69) = 69
    //   -> Type: floor(69 * 2) = 138

    expect(result.rolls).toHaveLength(16);
    expect(result.rolls[0]).toBe(116);   // r=85
    expect(result.rolls[15]).toBe(138);  // r=100
    expect(result.typeEffectiveness).toBe(2);
  });

  // B2: All 16 random rolls are distinct and increasing
  it('B2: 16 rolls from 85-100 are non-decreasing', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
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
    // Blissey (low Atk base 10) with no SP, no nature vs high Def Corviknight
    const attacker = new Pokemon({ name: 'Blissey', sp: {}, nature: 'Bold', ability: 'Natural Cure' });
    // Blissey Atk: floor((floor((2*10+31)*50/100) + 5) * 0.9) = floor((25 + 5) * 0.9) = floor(27) = 27
    const defender = new Pokemon({
      name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor',
    });
    // Use a weak Normal move (Return: 102) vs Steel = 0.5x
    // Actually Corviknight is Flying/Steel. Normal vs Flying = 1, Normal vs Steel = 0.5
    // = 0.5x total
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
    // Garchomp (Dragon/Ground) using Ice Beam (Ice, Special) vs Incineroar (Fire/Dark)
    // Wait, Garchomp doesn't learn Ice Beam in our data... let me use a different combo
    // Metagross (Steel/Psychic) using Earthquake (Ground) vs Incineroar (Fire/Dark)
    // Ground vs Fire = 2x, Ground vs Dark = 1x -> 2x (not neutral)
    // Let me find a neutral case:
    // Kangaskhan (Normal) using Return (Normal, 102 BP) vs Corviknight (Flying/Steel)
    // Normal vs Flying = 1, Normal vs Steel = 0.5 -> 0.5x (not neutral either)
    // Garchomp using Dragon Claw (Dragon, 80) vs Incineroar (Fire/Dark) -> Dragon vs Fire = 0.5x, Dragon vs Dark = 1x -> 0.5x
    // Actually, let me use: Incineroar using Crunch (Dark, 80) vs Corviknight (Flying/Steel)
    // Dark vs Flying = 1, Dark vs Steel = 1 -> 1x neutral! No STAB (Incineroar is Fire/Dark, Crunch is Dark = STAB!)
    // Try: Garchomp using Crunch (Dark, 80) vs Corviknight -> no STAB, neutral
    // Dark vs Flying = 1, Dark vs Steel = 1 -> 1x
    // Garchomp is Dragon/Ground, Dark is not STAB
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
