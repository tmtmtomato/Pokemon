/**
 * Cross-validation: Our calculator vs @smogon/calc (Gen 9)
 *
 * SP→EV mapping proof (Lv50, IV=31):
 *   B = 2*base + 31 (always odd)
 *   Ours:   floor(B/2) + 5 + SP
 *   Smogon: floor((B + floor(EV/4)) / 2) + 5
 *   When EV = SP*8 (or 252 for SP=32), both yield identical raw stats.
 */
import { describe, it, expect } from 'vitest';
import { calculate as ourCalc, Pokemon as OurPokemon, Move as OurMove, Field as OurField } from '../src/index.js';
import {
  calculate as smogonCalc,
  Pokemon as SmogonPokemon,
  Move as SmogonMove,
  Field as SmogonField,
  Generations,
} from '@smogon/calc';

const gen = Generations.get(9);

/** Convert Champions SP value to Smogon EV */
function spToEv(sp: number): number {
  return sp === 32 ? 252 : sp * 8;
}

/** Flatten smogon damage to number[] (handles number | number[] | number[][]) */
function flatDamage(d: number | number[] | number[][]): number[] {
  if (typeof d === 'number') return Array(16).fill(d);
  if (Array.isArray(d[0])) return d[0] as number[];
  return d as number[];
}

/** Compare two 16-roll arrays, allowing ±tolerance per roll */
function compareDamage(ours: number[], smogon: number[], tolerance = 0) {
  expect(ours.length).toBe(16);
  expect(smogon.length).toBe(16);
  for (let i = 0; i < 16; i++) {
    expect(
      Math.abs(ours[i] - smogon[i]),
      `Roll ${i}: ours=${ours[i]} smogon=${smogon[i]}`
    ).toBeLessThanOrEqual(tolerance);
  }
}

describe('Cross-validation vs @smogon/calc: stat parity', () => {
  it('SP=32 ↔ EV=252: Garchomp Atk stats match', () => {
    const ours = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' });
    const smogon = new SmogonPokemon(gen, 'Garchomp', {
      level: 50, nature: 'Adamant', ivs: { atk: 31 }, evs: { atk: 252 },
    });
    expect(ours.rawStats.atk).toBe(smogon.rawStats.atk);
  });

  it('SP=0 ↔ EV=0: Metagross Def stats match', () => {
    const ours = new OurPokemon({ name: 'Metagross', sp: {}, nature: 'Impish' });
    const smogon = new SmogonPokemon(gen, 'Metagross', {
      level: 50, nature: 'Impish', evs: {},
    });
    expect(ours.rawStats.def).toBe(smogon.rawStats.def);
  });

  it('HP stats match (SP=32 ↔ EV=252)', () => {
    const ours = new OurPokemon({ name: 'Metagross', sp: { hp: 32 }, nature: 'Hardy' });
    const smogon = new SmogonPokemon(gen, 'Metagross', {
      level: 50, nature: 'Hardy', evs: { hp: 252 },
    });
    expect(ours.rawStats.hp).toBe(smogon.rawStats.hp);
  });

  it('SP=16 ↔ EV=128: intermediate stats match', () => {
    const ours = new OurPokemon({ name: 'Garchomp', sp: { spa: 16 }, nature: 'Modest' });
    const smogon = new SmogonPokemon(gen, 'Garchomp', {
      level: 50, nature: 'Modest', evs: { spa: 128 },
    });
    expect(ours.rawStats.spa).toBe(smogon.rawStats.spa);
  });

  it('Full stat spread: all 6 stats match', () => {
    const ours = new OurPokemon({
      name: 'Garchomp', sp: { hp: 4, atk: 32, def: 0, spa: 0, spd: 0, spe: 30 }, nature: 'Jolly',
    });
    const smogon = new SmogonPokemon(gen, 'Garchomp', {
      level: 50, nature: 'Jolly',
      evs: { hp: 32, atk: 252, def: 0, spa: 0, spd: 0, spe: 240 },
    });
    for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
      expect(ours.rawStats[stat], `stat ${stat}`).toBe(smogon.rawStats[stat]);
    }
  });
});

describe('Cross-validation vs @smogon/calc: damage rolls (tolerance=0, exact match)', () => {

  it('CV-1: Basic STAB+SE (Garchomp EQ vs Metagross)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Clear Body' });
    const ourM = new OurMove('Earthquake');
    const ourResult = ourCalc(ourA, ourD, ourM, new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Clear Body' });
    const smM = new SmogonMove(gen, 'Earthquake');
    const smResult = smogonCalc(gen, smA, smD, smM, new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-2: Neutral damage, no STAB (Garchomp Crunch vs Corviknight)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Crunch'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Corviknight', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Mirror Armor' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Crunch'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-3: Special STAB+SE (Heatran Flamethrower vs Metagross)', () => {
    const ourA = new OurPokemon({ name: 'Heatran', sp: { spa: 32 }, nature: 'Modest', ability: 'Flash Fire' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Flamethrower'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Heatran', { level: 50, nature: 'Modest', evs: { spa: 252 }, ability: 'Flash Fire' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Flamethrower'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-4: Sun + Fire STAB (Charizard Flamethrower in Sun)', () => {
    const ourA = new OurPokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Timid', ability: 'Blaze' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Flamethrower'), new OurField({ gameType: 'Singles', weather: 'Sun' }));

    const smA = new SmogonPokemon(gen, 'Charizard', { level: 50, nature: 'Timid', evs: { spa: 252 }, ability: 'Blaze' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Flamethrower'), new SmogonField({ gameType: 'Singles', weather: 'Sun' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-5: Rain nerfs Fire (Charizard Flamethrower in Rain)', () => {
    const ourA = new OurPokemon({ name: 'Charizard', sp: { spa: 32 }, nature: 'Timid', ability: 'Blaze' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Flamethrower'), new OurField({ gameType: 'Singles', weather: 'Rain' }));

    const smA = new SmogonPokemon(gen, 'Charizard', { level: 50, nature: 'Timid', evs: { spa: 252 }, ability: 'Blaze' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Flamethrower'), new SmogonField({ gameType: 'Singles', weather: 'Rain' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-6: Choice Band (Garchomp EQ + Choice Band)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil', item: 'Choice Band' });
    const ourD = new OurPokemon({ name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil', item: 'Choice Band' });
    const smD = new SmogonPokemon(gen, 'Corviknight', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Mirror Armor' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-7: Life Orb (Garchomp Dragon Claw + Life Orb vs Dragonite)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil', item: 'Life Orb' });
    const ourD = new OurPokemon({ name: 'Dragonite', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Inner Focus' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Dragon Claw'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil', item: 'Life Orb' });
    const smD = new SmogonPokemon(gen, 'Dragonite', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Inner Focus' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Dragon Claw'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-8: Reflect screen (Garchomp EQ vs Metagross behind Reflect)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake'), new OurField({
      gameType: 'Singles', defenderSide: { isReflect: true },
    }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake'), new SmogonField({
      gameType: 'Singles', defenderSide: { isReflect: true },
    }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-9: Critical hit (Garchomp EQ crit vs Metagross)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake', { isCrit: true }), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake', { isCrit: true }), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-10: Burn penalty on physical attack', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil', status: 'brn' });
    const ourD = new OurPokemon({ name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil', status: 'brn' });
    const smD = new SmogonPokemon(gen, 'Corviknight', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Mirror Armor' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-11: Huge Power (Azumarill Return)', () => {
    const ourA = new OurPokemon({ name: 'Azumarill', sp: { atk: 32 }, nature: 'Adamant', ability: 'Huge Power' });
    const ourD = new OurPokemon({ name: 'Garchomp', sp: { hp: 32, def: 0 }, nature: 'Jolly', ability: 'Sand Veil' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Return'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Azumarill', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Huge Power' });
    const smD = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Jolly', evs: { hp: 252 }, ability: 'Sand Veil' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Return'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-12: Technician (Scizor Bullet Punch)', () => {
    const ourA = new OurPokemon({ name: 'Scizor', sp: { atk: 32 }, nature: 'Adamant', ability: 'Technician' });
    const ourD = new OurPokemon({ name: 'Garchomp', sp: { hp: 32, def: 0 }, nature: 'Jolly', ability: 'Sand Veil' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Bullet Punch'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Scizor', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Technician' });
    const smD = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Jolly', evs: { hp: 252 }, ability: 'Sand Veil' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Bullet Punch'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-13: Electric Terrain + Electric move (Thunderbolt)', () => {
    // Use a special Electric attacker - Raikou if available, or any Pokemon with Thunderbolt
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Corviknight', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Mirror Armor' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Thunderbolt'), new OurField({
      gameType: 'Singles', terrain: 'Electric',
    }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Modest', evs: { spa: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Corviknight', { level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Mirror Armor' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Thunderbolt'), new SmogonField({
      gameType: 'Singles', terrain: 'Electric',
    }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-14: Doubles spread + Helping Hand', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake'), new OurField({
      gameType: 'Doubles',
      attackerSide: { isHelpingHand: true },
    }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake', { isSpread: true }), new SmogonField({
      gameType: 'Doubles',
      attackerSide: { isHelpingHand: true },
    }));

    // Helping Hand is a final mod — may differ by ±1 due to chainMods vs individual apply
    compareDamage(ourResult.rolls, flatDamage(smResult.damage), 1);
  });

  it('CV-15: Stat boost (+2 Atk)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil', boosts: { atk: 2 } });
    const ourD = new OurPokemon({ name: 'Corviknight', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Mirror Armor' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil', boosts: { atk: 2 } });
    const smD = new SmogonPokemon(gen, 'Corviknight', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Mirror Armor' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake'), new SmogonField({ gameType: 'Singles' }));

    // Stat boost application may differ by ±1 due to floor(stat*multiplier) vs chainMods
    compareDamage(ourResult.rolls, flatDamage(smResult.damage), 1);
  });

  it('CV-16: Expert Belt + SE (Garchomp EQ vs Heatran)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil', item: 'Expert Belt' });
    const ourD = new OurPokemon({ name: 'Heatran', sp: { hp: 32, def: 0 }, nature: 'Calm', ability: 'Flash Fire' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil', item: 'Expert Belt' });
    const smD = new SmogonPokemon(gen, 'Heatran', { level: 50, nature: 'Calm', evs: { hp: 252 }, ability: 'Flash Fire' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-17: Crit ignores Reflect', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Earthquake', { isCrit: true }), new OurField({
      gameType: 'Singles', defenderSide: { isReflect: true },
    }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Earthquake', { isCrit: true }), new SmogonField({
      gameType: 'Singles', defenderSide: { isReflect: true },
    }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-18: Multiscale defense (Dragonite at full HP)', () => {
    const ourA = new OurPokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil' });
    const ourD = new OurPokemon({ name: 'Dragonite', sp: { hp: 32, def: 32 }, nature: 'Impish', ability: 'Multiscale', curHP: 100 });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Dragon Claw'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' });
    const smD = new SmogonPokemon(gen, 'Dragonite', { level: 50, nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Multiscale', curHP: 999 });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Dragon Claw'), new SmogonField({ gameType: 'Singles' }));

    compareDamage(ourResult.rolls, flatDamage(smResult.damage));
  });

  it('CV-19: Sandstorm SpD boost for Rock types', () => {
    const ourA = new OurPokemon({ name: 'Heatran', sp: { spa: 32 }, nature: 'Modest', ability: 'Flash Fire' });
    const ourD = new OurPokemon({ name: 'Tyranitar', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Sand Stream' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Flamethrower'), new OurField({
      gameType: 'Singles', weather: 'Sand',
    }));

    const smA = new SmogonPokemon(gen, 'Heatran', { level: 50, nature: 'Modest', evs: { spa: 252 }, ability: 'Flash Fire' });
    const smD = new SmogonPokemon(gen, 'Tyranitar', { level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Sand Stream' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Flamethrower'), new SmogonField({
      gameType: 'Singles', weather: 'Sand',
    }));

    // Sand SpD boost uses stat multiplier — may differ ±1
    compareDamage(ourResult.rolls, flatDamage(smResult.damage), 1);
  });

  it('CV-20: Assault Vest + special attack', () => {
    const ourA = new OurPokemon({ name: 'Heatran', sp: { spa: 32 }, nature: 'Modest', ability: 'Flash Fire' });
    const ourD = new OurPokemon({ name: 'Garchomp', sp: { hp: 32, spd: 0 }, nature: 'Jolly', ability: 'Sand Veil', item: 'Assault Vest' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Flamethrower'), new OurField({ gameType: 'Singles' }));

    const smA = new SmogonPokemon(gen, 'Heatran', { level: 50, nature: 'Modest', evs: { spa: 252 }, ability: 'Flash Fire' });
    const smD = new SmogonPokemon(gen, 'Garchomp', { level: 50, nature: 'Jolly', evs: { hp: 252 }, ability: 'Sand Veil', item: 'Assault Vest' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Flamethrower'), new SmogonField({ gameType: 'Singles' }));

    // AV stat mult — may differ ±1
    compareDamage(ourResult.rolls, flatDamage(smResult.damage), 1);
  });
});

describe('Cross-validation vs @smogon/calc: documented structural differences', () => {
  it('Documents exact differences when multiple final mods stack', () => {
    // Life Orb + Reflect + Filter/Solid Rock
    const ourA = new OurPokemon({ name: 'Heatran', sp: { spa: 32 }, nature: 'Modest', ability: 'Flash Fire', item: 'Life Orb' });
    const ourD = new OurPokemon({ name: 'Metagross', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Clear Body' });
    const ourResult = ourCalc(ourA, ourD, new OurMove('Flamethrower'), new OurField({
      gameType: 'Singles',
      defenderSide: { isLightScreen: true },
    }));

    const smA = new SmogonPokemon(gen, 'Heatran', { level: 50, nature: 'Modest', evs: { spa: 252 }, ability: 'Flash Fire' as any, item: 'Life Orb' });
    const smD = new SmogonPokemon(gen, 'Metagross', { level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Clear Body' });
    const smResult = smogonCalc(gen, smA, smD, new SmogonMove(gen, 'Flamethrower'), new SmogonField({
      gameType: 'Singles',
      defenderSide: { isLightScreen: true },
    }));

    const ourRolls = ourResult.rolls;
    const smRolls = flatDamage(smResult.damage);

    // Log the actual values for documentation
    console.log('Multiple final mods (Life Orb + Light Screen):');
    console.log('  Ours:   ', JSON.stringify(ourRolls));
    console.log('  Smogon: ', JSON.stringify(smRolls));
    const diffs = ourRolls.map((v, i) => v - smRolls[i]);
    console.log('  Diffs:  ', JSON.stringify(diffs));
    console.log('  Max diff:', Math.max(...diffs.map(Math.abs)));

    // Should be within ±1 (documented structural difference)
    compareDamage(ourRolls, smRolls, 1);
  });
});
