// Audit G: Field conditions (Weather, Terrain, Screens, Doubles mechanics)
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('Audit G: Weather modifiers', () => {

  const fireAttacker = () => new Pokemon({
    name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
  });
  const waterAttacker = () => new Pokemon({
    name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle',
  });
  const neutralDefender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
  });

  // G1: Sun + Fire = 1.5x
  it('G1: Fire move in Sun does ~1.5x', () => {
    const noWeather = calculate(fireAttacker(), neutralDefender(), new Move('Flamethrower'),
      new Field({ gameType: 'Singles' }));
    const sun = calculate(fireAttacker(), neutralDefender(), new Move('Flamethrower'),
      new Field({ gameType: 'Singles', weather: 'Sun' }));

    const ratio = sun.range()[0] / noWeather.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // G2: Sun + Water = 0.5x
  it('G2: Water move in Sun does ~0.5x', () => {
    const noWeather = calculate(waterAttacker(), neutralDefender(), new Move('Surf'),
      new Field({ gameType: 'Singles' }));
    const sun = calculate(waterAttacker(), neutralDefender(), new Move('Surf'),
      new Field({ gameType: 'Singles', weather: 'Sun' }));

    const ratio = sun.range()[0] / noWeather.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  // G3: Rain + Water = 1.5x
  it('G3: Water move in Rain does ~1.5x', () => {
    const noWeather = calculate(waterAttacker(), neutralDefender(), new Move('Surf'),
      new Field({ gameType: 'Singles' }));
    const rain = calculate(waterAttacker(), neutralDefender(), new Move('Surf'),
      new Field({ gameType: 'Singles', weather: 'Rain' }));

    const ratio = rain.range()[0] / noWeather.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // G4: Rain + Fire = 0.5x
  it('G4: Fire move in Rain does ~0.5x', () => {
    const noWeather = calculate(fireAttacker(), neutralDefender(), new Move('Flamethrower'),
      new Field({ gameType: 'Singles' }));
    const rain = calculate(fireAttacker(), neutralDefender(), new Move('Flamethrower'),
      new Field({ gameType: 'Singles', weather: 'Rain' }));

    const ratio = rain.range()[0] / noWeather.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  // G5: Sand + Rock SpD 1.5x
  it('G5: Sandstorm boosts Rock-type SpD by 1.5x', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze' });
    const rockDef = new Pokemon({
      name: 'Tyranitar', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Sand Stream',
    });
    const move = new Move('Flamethrower');

    const noSand = calculate(attacker, rockDef, move, new Field({ gameType: 'Singles' }));
    const withSand = calculate(attacker, rockDef, move, new Field({ gameType: 'Singles', weather: 'Sand' }));

    // Sand should reduce special damage to Rock-types
    expect(withSand.range()[0]).toBeLessThan(noSand.range()[0]);
  });

  // G5b: Sand doesn't boost non-Rock SpD
  it('G5b: Sandstorm does NOT boost non-Rock SpD', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze' });
    const nonRock = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const noSand = calculate(attacker, nonRock, move, new Field({ gameType: 'Singles' }));
    const withSand = calculate(attacker, nonRock, move, new Field({ gameType: 'Singles', weather: 'Sand' }));

    expect(withSand.range()[0]).toBe(noSand.range()[0]);
  });

  // G6: Snow + Ice Def 1.5x
  it('G6: Snow boosts Ice-type Def by 1.5x', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const iceDef = new Pokemon({
      name: 'Abomasnow', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Snow Warning',
    });
    const move = new Move('Close Combat');

    const noSnow = calculate(attacker, iceDef, move, new Field({ gameType: 'Singles' }));
    const withSnow = calculate(attacker, iceDef, move, new Field({ gameType: 'Singles', weather: 'Snow' }));

    expect(withSnow.range()[0]).toBeLessThan(noSnow.range()[0]);
  });

  // G6b: Snow doesn't boost non-Ice Def
  it('G6b: Snow does NOT boost non-Ice Def', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const nonIce = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');

    const noSnow = calculate(attacker, nonIce, move, new Field({ gameType: 'Singles' }));
    const withSnow = calculate(attacker, nonIce, move, new Field({ gameType: 'Singles', weather: 'Snow' }));

    expect(withSnow.range()[0]).toBe(noSnow.range()[0]);
  });
});

describe('Audit G: Terrain', () => {

  // G7: Electric Terrain + Electric move
  it('G7: Electric Terrain boosts Electric move by ~1.3x', () => {
    const attacker = new Pokemon({ name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle' });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Thunderbolt');

    // Note: Ground-types are immune to Electric... Garchomp is Ground type!
    // Thunderbolt vs Dragon/Ground = 0x (immune). Let's use a different defender.
    const defender2 = new Pokemon({ name: 'Corviknight', sp: { hp: 32, spd: 32 } });

    const noTerrain = calculate(attacker, defender2, move, new Field({ gameType: 'Singles' }));
    const withTerrain = calculate(attacker, defender2, move,
      new Field({ gameType: 'Singles', terrain: 'Electric' }));

    const ratio = withTerrain.range()[0] / noTerrain.range()[0];
    expect(ratio).toBeCloseTo(1.3, 0);
  });

  // G8: Grassy Terrain + Grass move
  it('G8: Grassy Terrain boosts Grass move by ~1.3x', () => {
    const attacker = new Pokemon({ name: 'Meganium', sp: { spa: 32 }, nature: 'Modest', ability: 'Overgrow' });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Energy Ball');

    const noTerrain = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withTerrain = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', terrain: 'Grassy' }));

    const ratio = withTerrain.range()[0] / noTerrain.range()[0];
    expect(ratio).toBeCloseTo(1.3, 0);
  });

  // G9: Psychic Terrain + Psychic move
  it('G9: Psychic Terrain boosts Psychic move by ~1.3x', () => {
    const attacker = new Pokemon({ name: 'Hatterene', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce' });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Psychic');

    const noTerrain = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withTerrain = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', terrain: 'Psychic' }));

    const ratio = withTerrain.range()[0] / noTerrain.range()[0];
    expect(ratio).toBeCloseTo(1.3, 0);
  });

  // G10: Misty Terrain halves Dragon moves
  it('G10: Misty Terrain halves Dragon move damage', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');

    const noTerrain = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withMisty = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', terrain: 'Misty' }));

    const ratio = withMisty.range()[0] / noTerrain.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });
});

describe('Audit G: Screens', () => {

  // G11: Reflect (physical) - Singles 0.5x, Doubles ~0.667x
  it('G11a: Reflect halves physical damage in Singles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withScreen = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', defenderSide: { isReflect: true } }));

    const ratio = withScreen.range()[0] / noScreen.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  it('G11b: Reflect reduces physical damage to ~0.667x in Doubles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    // Use a non-spread move to isolate screen effect
    const move = new Move('Dragon Claw');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));
    const withScreen = calculate(attacker, defender, move,
      new Field({ gameType: 'Doubles', defenderSide: { isReflect: true } }));

    const ratio = withScreen.range()[0] / noScreen.range()[0];
    expect(ratio).toBeCloseTo(0.667, 1);
  });

  // G12: Light Screen (special)
  it('G12: Light Screen halves special damage in Singles', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withScreen = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', defenderSide: { isLightScreen: true } }));

    const ratio = withScreen.range()[0] / noScreen.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  // G13: Aurora Veil (both physical and special)
  it('G13a: Aurora Veil halves physical damage in Singles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withVeil = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', defenderSide: { isAuroraVeil: true } }));

    const ratio = withVeil.range()[0] / noScreen.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  it('G13b: Aurora Veil halves special damage in Singles', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withVeil = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', defenderSide: { isAuroraVeil: true } }));

    const ratio = withVeil.range()[0] / noScreen.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  // G11c: Reflect doesn't affect special moves
  it('G11c: Reflect does NOT affect special moves', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withReflect = calculate(attacker, defender, move,
      new Field({ gameType: 'Singles', defenderSide: { isReflect: true } }));

    expect(withReflect.range()[0]).toBe(noScreen.range()[0]);
  });
});

describe('Audit G: Doubles mechanics', () => {

  // G14: Spread 0.75x
  it('G14: Spread move does 0.75x in Doubles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake'); // isSpread: true

    const singles = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const doubles = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));

    const ratio = doubles.range()[0] / singles.range()[0];
    expect(ratio).toBeCloseTo(0.75, 0);
  });

  // G14b: Non-spread move is unaffected in Doubles
  it('G14b: Non-spread move is unaffected in Doubles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw'); // not spread

    const singles = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const doubles = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));

    expect(doubles.range()[0]).toBe(singles.range()[0]);
  });

  // G15: Helping Hand 1.5x
  it('G15: Helping Hand boosts damage by ~1.5x', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');

    const noHelp = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));
    const withHelp = calculate(attacker, defender, move,
      new Field({ gameType: 'Doubles', attackerSide: { isHelpingHand: true } }));

    const ratio = withHelp.range()[0] / noHelp.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // G16: Friend Guard 0.75x
  it('G16: Friend Guard reduces damage by ~0.75x', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');

    const noFG = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));
    const withFG = calculate(attacker, defender, move,
      new Field({ gameType: 'Doubles', defenderSide: { isFriendGuard: true } }));

    const ratio = withFG.range()[0] / noFG.range()[0];
    expect(ratio).toBeCloseTo(0.75, 0);
  });
});

describe('Audit H: Critical hits', () => {

  // H1: Crit 1.5x
  it('H1: Critical hit does ~1.5x damage', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const normal = new Move('Earthquake');
    const crit = new Move('Earthquake', { isCrit: true });
    const field = new Field({ gameType: 'Singles' });

    const normalResult = calculate(attacker, defender, normal, field);
    const critResult = calculate(attacker, defender, crit, field);

    const ratio = critResult.range()[0] / normalResult.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // H2: Crit ignores Reflect
  it('H2: Critical hit ignores Reflect', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const crit = new Move('Earthquake', { isCrit: true });

    const noScreen = calculate(attacker, defender, crit, new Field({ gameType: 'Singles' }));
    const withScreen = calculate(attacker, defender, crit,
      new Field({ gameType: 'Singles', defenderSide: { isReflect: true } }));

    expect(withScreen.range()[0]).toBe(noScreen.range()[0]);
  });

  // H3: Crit ignores defender's +Def boost
  it('H3: Critical hit ignores defender positive Def boost', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const boosted = new Pokemon({
      name: 'Metagross', sp: { hp: 32, def: 32 }, boosts: { def: 2 },
    });
    const unboosted = new Pokemon({
      name: 'Metagross', sp: { hp: 32, def: 32 },
    });
    const crit = new Move('Earthquake', { isCrit: true });
    const field = new Field({ gameType: 'Singles' });

    const vsBoosted = calculate(attacker, boosted, crit, field);
    const vsUnboosted = calculate(attacker, unboosted, crit, field);

    // Crit should ignore the +2 Def boost
    expect(vsBoosted.range()[0]).toBe(vsUnboosted.range()[0]);
  });

  // H4: Crit ignores attacker's -Atk drop
  it('H4: Critical hit ignores attacker negative Atk drop', () => {
    const dropped = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', boosts: { atk: -2 },
    });
    const normal = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const crit = new Move('Earthquake', { isCrit: true });
    const field = new Field({ gameType: 'Singles' });

    const droppedResult = calculate(dropped, defender, crit, field);
    const normalResult = calculate(normal, defender, crit, field);

    // Crit should ignore the -2 Atk drop
    expect(droppedResult.range()[0]).toBe(normalResult.range()[0]);
  });
});
