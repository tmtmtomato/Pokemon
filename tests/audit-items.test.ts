// Audit E: Item modifiers comprehensive verification
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('Audit E: Item stat modifiers', () => {

  // E1: Choice Band (physical Atk 1.5x)
  it('E1: Choice Band boosts physical Atk by 1.5x', () => {
    const band = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Choice Band',
    });
    const noBand = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const bandResult = calculate(band, defender, move, field);
    const noBandResult = calculate(noBand, defender, move, field);

    const ratio = bandResult.range()[0] / noBandResult.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // E1b: Choice Band doesn't boost special moves
  it('E1b: Choice Band does NOT boost special moves', () => {
    const band = new Pokemon({
      name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest', item: 'Choice Band',
    });
    const noBand = new Pokemon({
      name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest',
    });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 } });
    const move = new Move('Draco Meteor'); // Special
    const field = new Field({ gameType: 'Singles' });

    const bandResult = calculate(band, defender, move, field);
    const noBandResult = calculate(noBand, defender, move, field);

    expect(bandResult.range()[0]).toBe(noBandResult.range()[0]);
  });

  // E2: Choice Specs (special SpA 1.5x)
  it('E2: Choice Specs boosts special SpA by 1.5x', () => {
    const specs = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', item: 'Choice Specs', ability: 'Blaze',
    });
    const noSpecs = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');
    const field = new Field({ gameType: 'Singles' });

    const specsResult = calculate(specs, defender, move, field);
    const noSpecsResult = calculate(noSpecs, defender, move, field);

    const ratio = specsResult.range()[0] / noSpecsResult.range()[0];
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  // E3: Assault Vest (special SpD 1.5x)
  it('E3: Assault Vest boosts SpD by 1.5x vs special attacks', () => {
    const attacker = new Pokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze' });
    const vest = new Pokemon({
      name: 'Garchomp', sp: { hp: 32, spd: 32 }, item: 'Assault Vest',
    });
    const noVest = new Pokemon({
      name: 'Garchomp', sp: { hp: 32, spd: 32 },
    });
    const move = new Move('Flamethrower');
    const field = new Field({ gameType: 'Singles' });

    const vsVest = calculate(attacker, vest, move, field);
    const vsNoVest = calculate(attacker, noVest, move, field);

    // Vest should reduce special damage
    expect(vsVest.range()[0]).toBeLessThan(vsNoVest.range()[0]);
  });

  // E3b: Assault Vest doesn't affect physical
  it('E3b: Assault Vest does NOT affect physical damage', () => {
    const attacker = new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const vest = new Pokemon({
      name: 'Metagross', sp: { hp: 32, def: 32 }, item: 'Assault Vest',
    });
    const noVest = new Pokemon({
      name: 'Metagross', sp: { hp: 32, def: 32 },
    });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const vsVest = calculate(attacker, vest, move, field);
    const vsNoVest = calculate(attacker, noVest, move, field);

    expect(vsVest.range()[0]).toBe(vsNoVest.range()[0]);
  });
});

describe('Audit E: Item damage modifiers', () => {

  // E4: Life Orb (~1.3x / 5324/4096)
  it('E4: Life Orb boosts damage by ~1.3x', () => {
    const orb = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Life Orb',
    });
    const noOrb = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');
    const field = new Field({ gameType: 'Singles' });

    const orbResult = calculate(orb, defender, move, field);
    const noOrbResult = calculate(noOrb, defender, move, field);

    const ratio = orbResult.range()[0] / noOrbResult.range()[0];
    expect(ratio).toBeCloseTo(1.3, 0);
  });

  // E5: Expert Belt (SE -> ~1.2x)
  it('E5: Expert Belt boosts super effective damage by ~1.2x', () => {
    const belt = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Expert Belt',
    });
    const noBelt = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake'); // Ground vs Steel = 2x SE
    const field = new Field({ gameType: 'Singles' });

    const beltResult = calculate(belt, defender, move, field);
    const noBeltResult = calculate(noBelt, defender, move, field);

    const ratio = beltResult.range()[0] / noBeltResult.range()[0];
    expect(ratio).toBeCloseTo(1.2, 0);
  });

  // E5b: Expert Belt has no effect on neutral hits
  it('E5b: Expert Belt does NOT boost neutral damage', () => {
    const belt = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Expert Belt',
    });
    const noBelt = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw'); // Dragon vs Normal = 1x
    const field = new Field({ gameType: 'Singles' });

    const beltResult = calculate(belt, defender, move, field);
    const noBeltResult = calculate(noBelt, defender, move, field);

    expect(beltResult.range()[0]).toBe(noBeltResult.range()[0]);
  });

  // E6: Type-boosting item (Charcoal for Fire)
  it('E6: Charcoal boosts Fire moves by ~1.2x', () => {
    const charcoal = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze', item: 'Charcoal',
    });
    const noItem = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');
    const field = new Field({ gameType: 'Singles' });

    const charcoalResult = calculate(charcoal, defender, move, field);
    const noItemResult = calculate(noItem, defender, move, field);

    const ratio = charcoalResult.range()[0] / noItemResult.range()[0];
    expect(ratio).toBeCloseTo(1.2, 0);
  });

  // E6b: Type-boosting item doesn't affect wrong type
  it('E6b: Charcoal does NOT boost non-Fire moves', () => {
    const charcoal = new Pokemon({
      name: 'Charizard', sp: { atk: 32 }, nature: 'Adamant', ability: 'Blaze', item: 'Charcoal',
    });
    const noItem = new Pokemon({
      name: 'Charizard', sp: { atk: 32 }, nature: 'Adamant', ability: 'Blaze',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw'); // Dragon, not Fire
    const field = new Field({ gameType: 'Singles' });

    const charcoalResult = calculate(charcoal, defender, move, field);
    const noItemResult = calculate(noItem, defender, move, field);

    expect(charcoalResult.range()[0]).toBe(noItemResult.range()[0]);
  });

  // E7: Resist berry (SE -> 0.5x)
  it('E7: Yache Berry halves super effective Ice damage', () => {
    const attacker = new Pokemon({
      name: 'Abomasnow', sp: { spa: 32 }, nature: 'Modest', ability: 'Snow Warning',
    });
    const yache = new Pokemon({
      name: 'Garchomp', sp: { hp: 32, spd: 32 }, item: 'Yache Berry',
    });
    const noBerry = new Pokemon({
      name: 'Garchomp', sp: { hp: 32, spd: 32 },
    });
    const move = new Move('Ice Beam'); // Ice vs Dragon/Ground = 4x
    const field = new Field({ gameType: 'Singles' });

    const vsYache = calculate(attacker, yache, move, field);
    const vsNoBerry = calculate(attacker, noBerry, move, field);

    const ratio = vsYache.range()[0] / vsNoBerry.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  // E8: Resist berry only activates on SE hits
  it('E8: Yache Berry does NOT activate on neutral Ice damage', () => {
    const attacker = new Pokemon({
      name: 'Abomasnow', sp: { spa: 32 }, nature: 'Modest', ability: 'Snow Warning',
    });
    // Kangaskhan is Normal type, Ice vs Normal = 1x (neutral)
    const yache = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, item: 'Yache Berry',
    });
    const noBerry = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, spd: 32 },
    });
    const move = new Move('Ice Beam');
    const field = new Field({ gameType: 'Singles' });

    const vsYache = calculate(attacker, yache, move, field);
    const vsNoBerry = calculate(attacker, noBerry, move, field);

    // Berry should NOT activate on neutral hit
    expect(vsYache.range()[0]).toBe(vsNoBerry.range()[0]);
  });
});
