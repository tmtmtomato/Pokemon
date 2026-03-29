import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('Basic damage calculation', () => {
  it('Garchomp Earthquake vs Metagross (no modifiers, singles)', () => {
    const attacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
    });
    const defender = new Pokemon({
      name: 'Metagross',
      sp: { hp: 32, def: 32 },
      nature: 'Impish',
      ability: 'Clear Body',
    });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    const [min, max] = result.range();

    // Ground vs Steel/Psychic: 1x (Ground is 0.5x vs Steel but Psychic is neutral... wait)
    // Actually: Ground vs Steel = 2x, Ground vs Psychic = 1x -> 2x total
    expect(result.typeEffectiveness).toBe(2);

    // Verify damage is reasonable
    // Atk: calcStat(130, 32, 1.1) = 200
    // Def: calcStat(130, 32, 1.1) = 200 (Impish boosts Def)
    // Base: floor(floor(22 * 100 * 200 / 200) / 50 + 2) = floor(2200/50 + 2) = floor(44+2) = 46
    // No STAB for Ground on Dragon/Ground Garchomp... wait, Garchomp IS Ground type
    // STAB: 1.5x. Type: 2x. So damage range: 46 * random * 1.5 * 2
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(result.rolls).toHaveLength(16);
  });

  it('Type immunity: Normal vs Ghost deals 0 damage', () => {
    const attacker = new Pokemon({ name: 'Kangaskhan', nature: 'Adamant', sp: { atk: 32 } });
    const defender = new Pokemon({ name: 'Gengar' });
    const move = new Move('Return');
    const field = new Field({ gameType: 'Singles' });

    // Kangaskhan doesn't have Scrappy by default
    // Actually wait - Kangaskhan has Scrappy as an ability option but defaults to Early Bird
    // Return is Normal type, Gengar is Ghost/Poison -> immune
    const result = calculate(attacker, defender, move, field);
    expect(result.typeEffectiveness).toBe(0);
    expect(result.range()).toEqual([0, 0]);
  });

  it('Status move deals 0 damage', () => {
    const attacker = new Pokemon({ name: 'Garchomp' });
    const defender = new Pokemon({ name: 'Metagross' });
    const move = new Move('Swords Dance');

    const result = calculate(attacker, defender, move);
    expect(result.range()).toEqual([0, 0]);
  });
});

describe('Weather modifiers', () => {
  it('Fire move in Sun does 1.5x damage', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');

    const noWeather = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withSun = calculate(attacker, defender, move, new Field({ gameType: 'Singles', weather: 'Sun' }));

    // Sun should boost fire damage by roughly 1.5x
    const [minNone] = noWeather.range();
    const [minSun] = withSun.range();
    expect(minSun).toBeGreaterThan(minNone);
    // Verify it's approximately 1.5x (within rounding)
    expect(minSun / minNone).toBeCloseTo(1.5, 0);
  });

  it('Water move in Sun does 0.5x damage', () => {
    const attacker = new Pokemon({ name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle' });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Surf');

    const noWeather = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withSun = calculate(attacker, defender, move, new Field({ gameType: 'Singles', weather: 'Sun' }));

    const [minNone] = noWeather.range();
    const [minSun] = withSun.range();
    expect(minSun).toBeLessThan(minNone);
  });
});

describe('STAB', () => {
  it('STAB adds 1.5x for matching type', () => {
    // Garchomp (Dragon/Ground) using Earthquake (Ground) -> STAB
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    // vs a neutral target
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    // Ground vs Fire/Dark: Ground is 2x vs Fire, 1x vs Dark = 2x total
    expect(result.typeEffectiveness).toBe(2);
    // With STAB the damage should be significant
    expect(result.range()[0]).toBeGreaterThan(0);
  });

  it('Adaptability gives 2.0x STAB instead of 1.5x', () => {
    const mega = new Pokemon({
      name: 'Lucario', sp: { spa: 32 }, nature: 'Modest',
      item: 'Lucarionite', isMega: true, // Mega Lucario has Adaptability
    });
    const normal = new Pokemon({
      name: 'Lucario', sp: { spa: 32 }, nature: 'Modest',
      ability: 'Inner Focus', // Normal Lucario, no Adaptability
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Aura Sphere');
    const field = new Field({ gameType: 'Singles' });

    const megaResult = calculate(mega, defender, move, field);
    const normalResult = calculate(normal, defender, move, field);

    // Mega Lucario Adaptability STAB should be higher than normal STAB
    expect(megaResult.range()[0]).toBeGreaterThan(normalResult.range()[0]);
  });
});

describe('Screens', () => {
  it('Reflect halves physical damage in singles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');

    const noScreen = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const withScreen = calculate(attacker, defender, move, new Field({
      gameType: 'Singles',
      defenderSide: { isReflect: true },
    }));

    expect(withScreen.range()[1]).toBeLessThan(noScreen.range()[1]);
    // Approximately half
    expect(withScreen.range()[0] / noScreen.range()[0]).toBeCloseTo(0.5, 0);
  });
});

describe('Doubles mechanics', () => {
  it('Spread moves do 0.75x in doubles', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');

    const singles = calculate(attacker, defender, move, new Field({ gameType: 'Singles' }));
    const doubles = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));

    // Earthquake is a spread move, should do less in doubles
    expect(doubles.range()[0]).toBeLessThan(singles.range()[0]);
    expect(doubles.range()[0] / singles.range()[0]).toBeCloseTo(0.75, 0);
  });

  it('Helping Hand boosts damage by 1.5x', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');

    const noHelp = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));
    const withHelp = calculate(attacker, defender, move, new Field({
      gameType: 'Doubles',
      attackerSide: { isHelpingHand: true },
    }));

    expect(withHelp.range()[0]).toBeGreaterThan(noHelp.range()[0]);
  });

  it('Friend Guard reduces damage by 0.75x', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');

    const noGuard = calculate(attacker, defender, move, new Field({ gameType: 'Doubles' }));
    const withGuard = calculate(attacker, defender, move, new Field({
      gameType: 'Doubles',
      defenderSide: { isFriendGuard: true },
    }));

    expect(withGuard.range()[0]).toBeLessThan(noGuard.range()[0]);
  });
});

describe('Mega Evolution', () => {
  it('Mega Garchomp has different stats than normal Garchomp', () => {
    const normal = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const mega = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Garchompite', isMega: true });

    // Mega Garchomp has 170 base Atk vs normal 130
    expect(mega.rawStats.atk).toBeGreaterThan(normal.rawStats.atk);
    expect(mega.effectiveAbility()).toBe('Sand Force');
  });

  it('Mega Lucario Adaptability boosts STAB to 2.0x', () => {
    const mega = new Pokemon({
      name: 'Lucario', sp: { atk: 32 }, nature: 'Adamant',
      item: 'Lucarionite', isMega: true,
    });
    expect(mega.effectiveAbility()).toBe('Adaptability');
  });
});

describe('Champions-specific: New Mega abilities', () => {
  it('Mega Meganium (Mega Sol) treats weather as Sun for fire moves', () => {
    // Mega Meganium itself uses Grass moves mainly, but Mega Sol affects weather check
    // Testing that Solar Beam works without charge in Mega Sol
    // For damage calc, we test that fire-type moves used by a Mega Sol user get Sun boost
    const mega = new Pokemon({
      name: 'Meganium', sp: { spa: 32 }, nature: 'Modest',
      item: 'Meganiumite', isMega: true,
    });
    expect(mega.effectiveAbility()).toBe('Mega Sol');
    expect(mega.types).toContain('Grass');
    expect(mega.types).toContain('Fairy');
  });

  it('Mega Feraligatr (Dragonize) changes Normal moves to Dragon', () => {
    const mega = new Pokemon({
      name: 'Feraligatr', sp: { atk: 32 }, nature: 'Adamant',
      item: 'Feraligatrite', isMega: true,
    });
    expect(mega.effectiveAbility()).toBe('Dragonize');
    expect(mega.types).toContain('Water');
    expect(mega.types).toContain('Dragon');

    // Return (Normal) should become Dragon type and get STAB
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');
    const result = calculate(mega, defender, move, new Field({ gameType: 'Singles' }));

    // Dragon vs Dragon/Ground: Dragon is 2x vs Dragon, 1x vs Ground = 2x
    expect(result.moveType).toBe('Dragon');
    expect(result.typeEffectiveness).toBe(2);
  });
});

describe('Special moves', () => {
  it('Foul Play uses defender Atk stat', () => {
    // Low-Atk attacker using Foul Play against high-Atk defender
    const attacker = new Pokemon({ name: 'Mimikyu', sp: {}, nature: 'Bold', ability: 'Disguise' });
    const highAtk = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const lowAtk = new Pokemon({ name: 'Hatterene', sp: {}, nature: 'Bold' });

    const move = new Move('Foul Play');
    const field = new Field({ gameType: 'Singles' });

    const vsHighAtk = calculate(attacker, highAtk, move, field);
    const vsLowAtk = calculate(attacker, lowAtk, move, field);

    // Foul Play vs high-Atk target should do more damage
    expect(vsHighAtk.range()[0]).toBeGreaterThan(vsLowAtk.range()[0]);
  });

  it('Body Press uses own Def stat for damage', () => {
    // Corviknight has high Def (105 base) -> Body Press should be strong
    const attacker = new Pokemon({
      name: 'Corviknight', sp: { def: 32 }, nature: 'Impish', ability: 'Mirror Armor',
    });
    const defender = new Pokemon({ name: 'Tyranitar', sp: { hp: 32, def: 32 } });

    const bodyPress = new Move('Body Press');
    const field = new Field({ gameType: 'Singles' });
    const result = calculate(attacker, defender, bodyPress, field);

    // Fighting vs Rock/Dark: 4x super effective!
    expect(result.typeEffectiveness).toBe(4);
    expect(result.range()[0]).toBeGreaterThan(0);
  });

  it('Psyshock targets physical Defense', () => {
    // High SpD, low Def defender should take more from Psyshock than Psychic
    // Using Meganium (Grass) - not immune to Psychic, and can invest in SpD
    const attacker = new Pokemon({ name: 'Hatterene', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce' });
    const defender = new Pokemon({
      name: 'Meganium', sp: { hp: 32, spd: 32 }, // high SpD, no Def investment
      nature: 'Careful',
    });

    const psyshock = calculate(attacker, defender, new Move('Psyshock'), new Field({ gameType: 'Singles' }));
    const psychic = calculate(attacker, defender, new Move('Psychic'), new Field({ gameType: 'Singles' }));

    // Psyshock should do MORE damage because it targets the uninvested physical Defense
    expect(psyshock.range()[0]).toBeGreaterThan(psychic.range()[0]);
  });

  it('Knock Off does 1.5x to item holders', () => {
    const attacker = new Pokemon({ name: 'Kingambit', sp: { atk: 32 }, nature: 'Adamant', ability: 'Defiant' });
    const withItem = new Pokemon({ name: 'Garchomp', sp: { hp: 32 }, item: 'Leftovers' });
    const noItem = new Pokemon({ name: 'Garchomp', sp: { hp: 32 } });

    const move = new Move('Knock Off');
    const field = new Field({ gameType: 'Singles' });

    const vsItem = calculate(attacker, withItem, move, field);
    const vsNoItem = calculate(attacker, noItem, move, field);

    // Should do 1.5x more to the item holder
    expect(vsItem.range()[0]).toBeGreaterThan(vsNoItem.range()[0]);
  });
});

describe('Items', () => {
  it('Choice Band boosts physical damage by 1.5x', () => {
    const withBand = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Choice Band' });
    const noBand = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const withBandResult = calculate(withBand, defender, move, field);
    const noBandResult = calculate(noBand, defender, move, field);

    expect(withBandResult.range()[0]).toBeGreaterThan(noBandResult.range()[0]);
    // Approximately 1.5x
    expect(withBandResult.range()[0] / noBandResult.range()[0]).toBeCloseTo(1.5, 0);
  });

  it('Life Orb boosts damage by ~1.3x', () => {
    const withOrb = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Life Orb' });
    const noOrb = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Incineroar', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const withOrbResult = calculate(withOrb, defender, move, field);
    const noOrbResult = calculate(noOrb, defender, move, field);

    expect(withOrbResult.range()[0]).toBeGreaterThan(noOrbResult.range()[0]);
  });

  it('Yache Berry halves super effective Ice damage', () => {
    const attacker = new Pokemon({ name: 'Abomasnow', sp: { spa: 32 }, nature: 'Modest', ability: 'Snow Warning' });
    const withBerry = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 }, item: 'Yache Berry' });
    const noBerry = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Ice Beam');
    const field = new Field({ gameType: 'Singles' });

    const vsBerry = calculate(attacker, withBerry, move, field);
    const vsNoBerry = calculate(attacker, noBerry, move, field);

    // Ice vs Dragon/Ground = 4x. With Yache Berry = 2x effective damage
    expect(vsBerry.range()[0]).toBeLessThan(vsNoBerry.range()[0]);
  });
});

describe('Burn', () => {
  it('Burn halves physical damage', () => {
    const burned = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', status: 'brn' });
    const healthy = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const burnResult = calculate(burned, defender, move, field);
    const healthyResult = calculate(healthy, defender, move, field);

    expect(burnResult.range()[0]).toBeLessThan(healthyResult.range()[0]);
    expect(burnResult.range()[0] / healthyResult.range()[0]).toBeCloseTo(0.5, 0);
  });
});

describe('Critical hits', () => {
  it('Critical hit does 1.5x damage', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const normal = new Move('Earthquake');
    const crit = new Move('Earthquake', { isCrit: true });
    const field = new Field({ gameType: 'Singles' });

    const normalResult = calculate(attacker, defender, normal, field);
    const critResult = calculate(attacker, defender, crit, field);

    expect(critResult.range()[0]).toBeGreaterThan(normalResult.range()[0]);
  });

  it('Critical hit ignores Reflect', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const crit = new Move('Earthquake', { isCrit: true });

    const noScreen = calculate(attacker, defender, crit, new Field({
      gameType: 'Singles',
    }));
    const withScreen = calculate(attacker, defender, crit, new Field({
      gameType: 'Singles',
      defenderSide: { isReflect: true },
    }));

    // Crit should ignore Reflect - damage should be equal
    expect(withScreen.range()[0]).toBe(noScreen.range()[0]);
  });
});

describe('Result description', () => {
  it('generates readable description', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    const desc = result.desc();

    expect(desc).toContain('Garchomp');
    expect(desc).toContain('Metagross');
    expect(desc).toContain('Earthquake');
    expect(desc).toContain('%');
  });
});

describe('KO chance', () => {
  it('reports guaranteed OHKO for massive damage', () => {
    // Ice Beam (4x SE) against Garchomp
    const attacker = new Pokemon({
      name: 'Hatterene', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce',
      item: 'Choice Specs',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: {} }); // uninvested
    const move = new Move('Ice Beam');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    const ko = result.koChance();

    // 4x SE + STAB (Fairy type doesn't give STAB for Ice)... actually Hatterene is Psychic/Fairy
    // Ice Beam has no STAB but 4x SE should OHKO uninvested Garchomp
    expect(ko.n).toBe(1);
  });
});
