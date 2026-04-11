/**
 * Inference engine tests.
 * Verifies that when we calculate damage from a known build,
 * the inference engine can find that build among the candidates.
 */
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';
import { inferTurn } from '../tracker/engine/inference';
import { aggregateSlotInference } from '../tracker/engine/candidate-filter';
import type { MyPokemonSlot, OpponentPokemonSlot, TurnEntry, FieldSnapshot } from '../tracker/hooks/useTracker';
import { createFieldSnapshot } from '../tracker/hooks/useTracker';

// ===== Helper: Create a my-team slot from known config =====
function makeMySlot(config: {
  species: string;
  nature?: string;
  sp?: Partial<Record<string, number>>;
  ability?: string;
  item?: string;
  teraType?: string;
}): MyPokemonSlot {
  return {
    species: config.species,
    nature: (config.nature ?? 'Hardy') as any,
    sp: {
      hp: config.sp?.hp ?? 0, atk: config.sp?.atk ?? 0, def: config.sp?.def ?? 0,
      spa: config.sp?.spa ?? 0, spd: config.sp?.spd ?? 0, spe: config.sp?.spe ?? 0,
    },
    ability: config.ability ?? '',
    item: config.item ?? '',
    moves: [],  // L-10: Required by MyPokemonSlot interface
    teraType: (config.teraType ?? '') as any,
    isMega: false,
  };
}

// ===== Helper: Create opponent slot =====
function makeOppSlot(config: {
  species: string;
  knownAbility?: string;
  knownItem?: string;
}): OpponentPokemonSlot {
  return {
    species: config.species,
    knownAbility: config.knownAbility ?? '',
    knownItem: config.knownItem ?? '',
    knownTeraType: '',
    knownMoves: [],
    nickname: '',
  };
}

// ===== Helper: Calculate actual damage % for a known matchup =====
function getDamagePercent(
  attacker: { name: string; nature?: string; sp?: Partial<Record<string, number>>; ability?: string; item?: string },
  defender: { name: string; nature?: string; sp?: Partial<Record<string, number>>; ability?: string; item?: string },
  moveName: string,
  fieldConfig?: Partial<FieldSnapshot>,
): number {
  const atkPokemon = new Pokemon({
    name: attacker.name,
    nature: (attacker.nature ?? 'Hardy') as any,
    sp: attacker.sp as any,
    ability: attacker.ability,
    item: attacker.item,
  });
  const defPokemon = new Pokemon({
    name: defender.name,
    nature: (defender.nature ?? 'Hardy') as any,
    sp: defender.sp as any,
    ability: defender.ability,
    item: defender.item,
  });
  const move = new Move(moveName);
  const field = new Field(fieldConfig ? {
    gameType: fieldConfig.gameType,
    weather: fieldConfig.weather || undefined,
    terrain: fieldConfig.terrain || undefined,
  } : undefined);

  const result = calculate(atkPokemon, defPokemon, move, field);
  const defMaxHP = defPokemon.maxHP();
  // Use the median roll (roll 8 of 16)
  const medianDmg = result.rolls[8];
  return (medianDmg / defMaxHP) * 100;
}

// ===== Helper: Create a turn entry =====
function makeTurn(config: {
  attackerSide: 'mine' | 'opponent';
  attackerSlot: number;
  defenderSlot: number;
  moveName: string;
  damagePercent: number;
  field?: FieldSnapshot;
}): TurnEntry {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    turnNumber: 1,
    attackerSide: config.attackerSide,
    attackerSlot: config.attackerSlot,
    defenderSlot: config.defenderSlot,
    moveName: config.moveName,
    isCrit: false,
    isSpread: false,
    observedDamagePercent: config.damagePercent,
    field: config.field ?? createFieldSnapshot(),
    attackerBoosts: {},
    defenderBoosts: {},
    attackerStatus: '',
    defenderStatus: '',
  };
}

describe('Inference Engine - Mode A (opponent attacks me)', () => {
  it('should find Adamant Choice Band Garchomp among candidates', () => {
    // Known opponent: Adamant Garchomp, 32 Atk SP, Choice Band, Rough Skin
    // Attacking my: Hardy Cresselia, 32 HP / 32 Def SP
    const actualDmg = getDamagePercent(
      { name: 'Garchomp', nature: 'Adamant', sp: { atk: 32 }, ability: 'Rough Skin', item: 'Choice Band' },
      { name: 'Cresselia', nature: 'Hardy', sp: { hp: 32, def: 32 }, ability: 'Levitate' },
      'Earthquake',
    );

    const myTeam = [makeMySlot({
      species: 'Cresselia', nature: 'Hardy', sp: { hp: 32, def: 32 },
      ability: 'Levitate',
    })];
    const oppTeam = [makeOppSlot({ species: 'Garchomp' })];

    const turn = makeTurn({
      attackerSide: 'opponent',
      attackerSlot: 0,
      defenderSlot: 0,
      moveName: 'Earthquake',
      damagePercent: actualDmg,
    });

    const result = inferTurn(turn, myTeam, oppTeam);

    expect(result.mode).toBe('A');
    expect(result.candidates.length).toBeGreaterThan(0);

    // The actual build should be among the candidates
    const match = result.candidates.find(c =>
      c.nature === 'Adamant' &&
      c.sp.atk === 32 &&
      c.item === 'Choice Band'
    );
    expect(match).toBeDefined();
  });

  it('should find Modest Choice Specs Flutter Mane with special attack', () => {
    const actualDmg = getDamagePercent(
      { name: 'Flutter Mane', nature: 'Modest', sp: { spa: 32 }, ability: 'Protosynthesis', item: 'Choice Specs' },
      { name: 'Incineroar', nature: 'Careful', sp: { hp: 32, spd: 20 }, ability: 'Intimidate' },
      'Moonblast',
    );

    const myTeam = [makeMySlot({
      species: 'Incineroar', nature: 'Careful', sp: { hp: 32, spd: 20 },
      ability: 'Intimidate',
    })];
    const oppTeam = [makeOppSlot({ species: 'Flutter Mane' })];

    const turn = makeTurn({
      attackerSide: 'opponent',
      attackerSlot: 0,
      defenderSlot: 0,
      moveName: 'Moonblast',
      damagePercent: actualDmg,
    });

    const result = inferTurn(turn, myTeam, oppTeam);
    expect(result.candidates.length).toBeGreaterThan(0);

    const match = result.candidates.find(c =>
      c.nature === 'Modest' &&
      c.sp.spa === 32 &&
      c.item === 'Choice Specs'
    );
    expect(match).toBeDefined();
  });

  it('should narrow candidates when opponent ability is known', () => {
    const actualDmg = getDamagePercent(
      { name: 'Garchomp', nature: 'Jolly', sp: { atk: 24 }, ability: 'Rough Skin', item: 'Life Orb' },
      { name: 'Metagross', nature: 'Adamant', sp: { hp: 20, def: 12 }, ability: 'Clear Body' },
      'Earthquake',
    );

    const myTeam = [makeMySlot({
      species: 'Metagross', nature: 'Adamant', sp: { hp: 20, def: 12 },
      ability: 'Clear Body',
    })];
    // With known ability, should have fewer candidates
    const oppTeamKnown = [makeOppSlot({ species: 'Garchomp', knownAbility: 'Rough Skin' })];
    const oppTeamUnknown = [makeOppSlot({ species: 'Garchomp' })];

    const turn = makeTurn({
      attackerSide: 'opponent',
      attackerSlot: 0,
      defenderSlot: 0,
      moveName: 'Earthquake',
      damagePercent: actualDmg,
    });

    const resultKnown = inferTurn(turn, myTeam, oppTeamKnown);
    const resultUnknown = inferTurn(turn, myTeam, oppTeamUnknown);

    expect(resultKnown.candidates.length).toBeLessThanOrEqual(resultUnknown.candidates.length);
    expect(resultKnown.candidates.length).toBeGreaterThan(0);
  });
});

describe('Inference Engine - Mode B (I attack opponent)', () => {
  it('should find opponent defensive build among candidates', () => {
    // I attack with known Garchomp → opponent's Cresselia
    const actualDmg = getDamagePercent(
      { name: 'Garchomp', nature: 'Adamant', sp: { atk: 32 }, ability: 'Rough Skin', item: 'Choice Band' },
      { name: 'Cresselia', nature: 'Bold', sp: { hp: 32, def: 32 }, ability: 'Levitate' },
      'Crunch',
    );

    const myTeam = [makeMySlot({
      species: 'Garchomp', nature: 'Adamant', sp: { atk: 32 },
      ability: 'Rough Skin', item: 'Choice Band',
    })];
    const oppTeam = [makeOppSlot({ species: 'Cresselia' })];

    const turn = makeTurn({
      attackerSide: 'mine',
      attackerSlot: 0,
      defenderSlot: 0,
      moveName: 'Crunch',
      damagePercent: actualDmg,
    });

    const result = inferTurn(turn, myTeam, oppTeam);

    expect(result.mode).toBe('B');
    expect(result.candidates.length).toBeGreaterThan(0);

    // The actual build should be among the candidates
    const match = result.candidates.find(c =>
      c.nature === 'Bold' &&
      c.sp.hp === 32 &&
      c.sp.def === 32
    );
    expect(match).toBeDefined();
  });
});

describe('Cross-turn aggregation', () => {
  it('should narrow candidates across 2 turns', () => {
    // Turn 1: Opponent Garchomp uses Earthquake on my Cresselia
    const dmg1 = getDamagePercent(
      { name: 'Garchomp', nature: 'Adamant', sp: { atk: 32 }, ability: 'Rough Skin', item: 'Choice Band' },
      { name: 'Cresselia', nature: 'Hardy', sp: { hp: 32, def: 32 }, ability: 'Levitate' },
      'Earthquake',
    );

    // Turn 2: Same Garchomp uses Dragon Claw on my Incineroar
    const dmg2 = getDamagePercent(
      { name: 'Garchomp', nature: 'Adamant', sp: { atk: 32 }, ability: 'Rough Skin', item: 'Choice Band' },
      { name: 'Incineroar', nature: 'Careful', sp: { hp: 32, spd: 20 }, ability: 'Intimidate' },
      'Dragon Claw',
    );

    const myTeam = [
      makeMySlot({ species: 'Cresselia', nature: 'Hardy', sp: { hp: 32, def: 32 }, ability: 'Levitate' }),
      makeMySlot({ species: 'Incineroar', nature: 'Careful', sp: { hp: 32, spd: 20 }, ability: 'Intimidate' }),
    ];
    const oppTeam = [makeOppSlot({ species: 'Garchomp' })];

    const turn1 = makeTurn({ attackerSide: 'opponent', attackerSlot: 0, defenderSlot: 0, moveName: 'Earthquake', damagePercent: dmg1 });
    const turn2 = makeTurn({ attackerSide: 'opponent', attackerSlot: 0, defenderSlot: 1, moveName: 'Dragon Claw', damagePercent: dmg2 });

    const inf1 = inferTurn(turn1, myTeam, oppTeam);
    const inf2 = inferTurn(turn2, myTeam, oppTeam);

    // Each individual turn should have candidates
    expect(inf1.candidates.length).toBeGreaterThan(0);
    expect(inf2.candidates.length).toBeGreaterThan(0);

    // Aggregation should have results
    const aggregated = aggregateSlotInference([inf1, inf2]);
    expect(aggregated.candidateCount).toBeGreaterThan(0);

    // Cross-turn should narrow nature/item sets
    // (intersection of per-turn sets must be <= smallest per-turn set)
    expect(aggregated.natures.size).toBeLessThanOrEqual(
      Math.min(new Set(inf1.candidates.map(c => c.nature)).size, new Set(inf2.candidates.map(c => c.nature)).size)
    );

    // Adamant + Choice Band should still be among possibilities
    expect(aggregated.natures.has('Adamant')).toBe(true);
    expect(aggregated.items.has('Choice Band')).toBe(true);
  });
});
