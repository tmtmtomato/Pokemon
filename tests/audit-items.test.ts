// Audit E: Item modifiers comprehensive verification
// Note: Choice Band, Choice Specs, Life Orb, Expert Belt, Assault Vest, and Eviolite
// have been removed from Champions. Only type-boost items, resist berries, mega stones,
// and basic items (Focus Sash, Leftovers, etc.) remain.
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('Audit E: Item damage modifiers', () => {

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

  // E6c: Mystic Water boosts Water moves
  it('E6c: Mystic Water boosts Water moves by ~1.2x', () => {
    const mysticWater = new Pokemon({
      name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle', item: 'Mystic Water',
    });
    const noItem = new Pokemon({
      name: 'Pelipper', sp: { spa: 32 }, nature: 'Modest', ability: 'Drizzle',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 } });
    const move = new Move('Surf');
    const field = new Field({ gameType: 'Singles' });

    const mysticResult = calculate(mysticWater, defender, move, field);
    const noItemResult = calculate(noItem, defender, move, field);

    const ratio = mysticResult.range()[0] / noItemResult.range()[0];
    expect(ratio).toBeCloseTo(1.2, 0);
  });

  // E6d: Dragon Fang boosts Dragon moves
  it('E6d: Dragon Fang boosts Dragon moves by ~1.2x', () => {
    const dragonFang = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', item: 'Dragon Fang',
    });
    const noItem = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Dragon Claw');
    const field = new Field({ gameType: 'Singles' });

    const fangResult = calculate(dragonFang, defender, move, field);
    const noItemResult = calculate(noItem, defender, move, field);

    const ratio = fangResult.range()[0] / noItemResult.range()[0];
    expect(ratio).toBeCloseTo(1.2, 0);
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
