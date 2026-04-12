/**
 * Core inference engine.
 * Given an observed damage %, enumerate candidate builds and find which ones
 * produce damage matching the observation.
 */
import type { NatureName, StatID, TypeName, StatsTable } from '../../src/types.js';
import type { TurnEntry, MyPokemonSlot, OpponentPokemonSlot, FieldSnapshot } from '../hooks/useTracker';
import type { Candidate, TurnInference } from './inference-types';
import { ATTACKER_DAMAGE_ITEMS, TYPE_BOOST_ITEMS, RESIST_BERRY_TYPES, getDamageTolerance } from './inference-types';
import { calculate, Pokemon, Move, Field } from '../../src/index.js';
import { getSpecies, getMove } from '../../src/data/index.js';
import { ALL_NATURES, NATURE_TABLE } from '../../app/lib/constants';

// Max SP per stat and total budget
const MAX_SP = 32;
const SP_BUDGET = 66;

/**
 * Get plausible natures for a Pokemon based on its base stats.
 * Competitive heuristic: the minus stat is always min(baseAtk, baseSpA).
 * Neutral natures are excluded entirely.
 * When baseAtk === baseSpA, both dump stats are allowed (8 natures).
 */
export function getPlausibleNatures(baseAtk: number, baseSpA: number): NatureName[] {
  if (baseAtk === baseSpA) {
    return ALL_NATURES.filter(n => {
      const entry = NATURE_TABLE[n];
      return entry.minus === 'atk' || entry.minus === 'spa';
    });
  }
  const dumpStat: StatID = baseSpA < baseAtk ? 'spa' : 'atk';
  return ALL_NATURES.filter(n => NATURE_TABLE[n].minus === dumpStat);
}

/**
 * Build the list of items to enumerate for the attacker side.
 * Includes base damage items + type-matching booster for the move type.
 */
function getAttackerItems(moveType: TypeName): string[] {
  const items: string[] = [...ATTACKER_DAMAGE_ITEMS];
  // Add type-boosting item for the move's type
  for (const [item, type] of Object.entries(TYPE_BOOST_ITEMS)) {
    if (type === moveType) {
      items.push(item);
      break;
    }
  }
  return items;
}

/**
 * Build the list of items to enumerate for the defender side.
 * Includes base defensive items + the resist berry for the move type (if super effective).
 */
function getDefenderItems(moveType: TypeName, isSuperEffective: boolean, isNFE: boolean): string[] {
  const items: string[] = [''];
  // Champions has no defensive damage items (no Assault Vest/Eviolite)
  // Add resist berry only if the move is super effective
  if (isSuperEffective) {
    for (const [item, type] of Object.entries(RESIST_BERRY_TYPES)) {
      if (type === moveType) {
        items.push(item);
        break;
      }
    }
  }
  return items;
}

/**
 * Convert FieldSnapshot to Field constructor config.
 */
function toFieldConfig(fs: FieldSnapshot) {
  return {
    gameType: fs.gameType,
    weather: fs.weather || undefined,
    terrain: fs.terrain || undefined,
    isGravity: fs.isGravity,
    isFairyAura: fs.isFairyAura,
    isDarkAura: fs.isDarkAura,
    isAuraBreak: fs.isAuraBreak,
    isBeadsOfRuin: fs.isBeadsOfRuin,
    isTabletsOfRuin: fs.isTabletsOfRuin,
    isSwordOfRuin: fs.isSwordOfRuin,
    isVesselOfRuin: fs.isVesselOfRuin,
    attackerSide: { ...fs.attackerSide },
    defenderSide: { ...fs.defenderSide },
  };
}

/**
 * Check if a roll matches the observed damage percentage within tolerance.
 * M-4: Tolerance is HP-dependent — smaller HP means wider tolerance.
 */
function matchesPercent(rollDmg: number, defenderMaxHP: number, observedPercent: number): boolean {
  const rollPercent = (rollDmg / defenderMaxHP) * 100;
  return Math.abs(rollPercent - observedPercent) <= getDamageTolerance(defenderMaxHP);
}

/**
 * Mode A: Opponent attacks me (被弾).
 * Known: defender (my Pokemon full build), move, field.
 * Unknown: attacker nature, attack SP, item, ability.
 */
function inferModeA(
  turn: TurnEntry,
  mySlot: MyPokemonSlot,
  opponentSlot: OpponentPokemonSlot,
): TurnInference {
  const opponentSpecies = getSpecies(opponentSlot.species)!;
  const moveData = getMove(turn.moveName)!;
  const isPhysical = moveData.category === 'Physical';
  const atkStatId: StatID = isPhysical ? 'atk' : 'spa';

  // Build the defender (my Pokemon, fully known)
  const defenderConfig = {
    name: mySlot.species,
    nature: mySlot.nature,
    sp: { ...mySlot.sp },
    ability: mySlot.ability,
    item: mySlot.item,
    teraType: mySlot.teraType || undefined,
    isTera: !!mySlot.teraType,
    boosts: turn.defenderBoosts as Partial<StatsTable>,
    status: turn.defenderStatus || undefined,
  };
  const defender = new Pokemon(defenderConfig);
  const defenderMaxHP = defender.maxHP();

  // Move (override isSpread from user toggle, not just move data)
  const move = new Move(turn.moveName, {
    isCrit: turn.isCrit,
    isSpread: turn.isSpread,
  });

  // Field: FieldSnapshot's attackerSide/defenderSide are set per-turn by the user
  // relative to the attacker/defender, so no swap is needed.
  const fieldConfig = toFieldConfig(turn.field);

  // Items to enumerate for attacker
  const attackerItems = getAttackerItems(moveData.type);

  // Abilities to enumerate
  const abilities = opponentSlot.knownAbility
    ? [opponentSlot.knownAbility]
    : opponentSpecies.abilities;

  // Known item constraint
  const itemsToTry = opponentSlot.knownItem
    ? [opponentSlot.knownItem]
    : attackerItems;

  // Competitive nature filter: only natures dumping the weaker attack stat
  const natures = getPlausibleNatures(
    opponentSpecies.baseStats.atk, opponentSpecies.baseStats.spa,
  );

  const candidates: Candidate[] = [];

  for (const nature of natures) {
    for (let sp = 0; sp <= MAX_SP; sp++) {
      for (const item of itemsToTry) {
        for (const ability of abilities) {
          // Build the attacker with this candidate config
          const attackerSP: Partial<StatsTable> = { [atkStatId]: sp };
          try {
            const attacker = new Pokemon({
              name: opponentSlot.species,
              nature,
              sp: attackerSP,
              ability,
              item,
              boosts: turn.attackerBoosts as Partial<StatsTable>,
              status: turn.attackerStatus || undefined,
            });

            const field = new Field(fieldConfig);
            const result = calculate(attacker, defender, move, field);

            // Check if any roll matches
            const matchedRolls: number[] = [];
            for (let r = 0; r < result.rolls.length; r++) {
              if (matchesPercent(result.rolls[r], defenderMaxHP, turn.observedDamagePercent)) {
                matchedRolls.push(r);
              }
            }

            if (matchedRolls.length > 0) {
              candidates.push({
                nature,
                sp: { [atkStatId]: sp },
                item,
                ability,
                matchedRolls,
              });
            }
          } catch {
            // Skip invalid combos
          }
        }
      }
    }
  }

  return {
    turnId: turn.id,
    opponentSlot: turn.attackerSlot,
    mode: 'A',
    candidates,
    inferredStats: [atkStatId],
  };
}

/**
 * Mode B: I attack opponent (与ダメ).
 * Known: attacker (my Pokemon full build), move, field.
 * Unknown: defender nature, HP SP, defense SP, item, ability.
 */
function inferModeB(
  turn: TurnEntry,
  mySlot: MyPokemonSlot,
  opponentSlot: OpponentPokemonSlot,
): TurnInference {
  const opponentSpecies = getSpecies(opponentSlot.species)!;
  const moveData = getMove(turn.moveName)!;
  const isPhysical = moveData.category === 'Physical';
  const defStatId: StatID = isPhysical ? 'def' : 'spd';

  // Build the attacker (my Pokemon, fully known)
  const attacker = new Pokemon({
    name: mySlot.species,
    nature: mySlot.nature,
    sp: { ...mySlot.sp },
    ability: mySlot.ability,
    item: mySlot.item,
    teraType: mySlot.teraType || undefined,
    isTera: !!mySlot.teraType,
    boosts: turn.attackerBoosts as Partial<StatsTable>,
    status: turn.attackerStatus || undefined,
  });

  // Move (override isSpread from user toggle)
  const move = new Move(turn.moveName, {
    isCrit: turn.isCrit,
    isSpread: turn.isSpread,
  });

  // Field
  const fieldConfig = toFieldConfig(turn.field);

  // M-3: Actually compute super effectiveness instead of always true
  let isSuperEffective = false;
  try {
    const dummyDef = new Pokemon({ name: opponentSlot.species });
    const dummyField = new Field(fieldConfig);
    const dummyResult = calculate(attacker, dummyDef, move, dummyField);
    isSuperEffective = dummyResult.typeEffectiveness > 1;
  } catch {
    isSuperEffective = true; // fallback: conservative
  }

  // Is the opponent NFE?
  const isNFE = opponentSpecies.isNFE ?? false;

  // Items to enumerate for defender
  const defenderItems = opponentSlot.knownItem
    ? [opponentSlot.knownItem]
    : getDefenderItems(moveData.type, isSuperEffective, isNFE);

  // Abilities
  const abilities = opponentSlot.knownAbility
    ? [opponentSlot.knownAbility]
    : opponentSpecies.abilities;

  // Competitive nature filter: only natures dumping the weaker attack stat
  const natures = getPlausibleNatures(
    opponentSpecies.baseStats.atk, opponentSpecies.baseStats.spa,
  );

  const candidates: Candidate[] = [];

  for (const nature of natures) {
    for (let hpSP = 0; hpSP <= MAX_SP; hpSP++) {
      for (let defSP = 0; defSP <= MAX_SP; defSP++) {
        // Quick SP budget check (these 2 stats alone can't exceed budget)
        if (hpSP + defSP > SP_BUDGET) continue;

        for (const item of defenderItems) {
          for (const ability of abilities) {
            const defenderSP: Partial<StatsTable> = {
              hp: hpSP,
              [defStatId]: defSP,
            };

            try {
              const defender = new Pokemon({
                name: opponentSlot.species,
                nature,
                sp: defenderSP,
                ability,
                item,
                teraType: opponentSlot.knownTeraType || undefined,
                isTera: !!opponentSlot.knownTeraType,
                boosts: turn.defenderBoosts as Partial<StatsTable>,
                status: turn.defenderStatus || undefined,
              });

              const defenderMaxHP = defender.maxHP();
              const field = new Field(fieldConfig);
              const result = calculate(attacker, defender, move, field);

              // Check if any roll matches
              const matchedRolls: number[] = [];
              for (let r = 0; r < result.rolls.length; r++) {
                if (matchesPercent(result.rolls[r], defenderMaxHP, turn.observedDamagePercent)) {
                  matchedRolls.push(r);
                }
              }

              if (matchedRolls.length > 0) {
                candidates.push({
                  nature,
                  sp: { hp: hpSP, [defStatId]: defSP },
                  item,
                  ability,
                  matchedRolls,
                });
              }
            } catch {
              // Skip invalid combos
            }
          }
        }
      }
    }
  }

  return {
    turnId: turn.id,
    opponentSlot: turn.defenderSlot,
    mode: 'B',
    candidates,
    inferredStats: ['hp', defStatId],
  };
}

/**
 * Run inference for a single turn.
 */
export function inferTurn(
  turn: TurnEntry,
  myTeam: MyPokemonSlot[],
  opponentTeam: OpponentPokemonSlot[],
): TurnInference {
  if (turn.attackerSide === 'opponent') {
    // Opponent attacks me → Mode A (infer their attack stat)
    const mySlot = myTeam[turn.defenderSlot];
    const oppSlot = opponentTeam[turn.attackerSlot];
    return inferModeA(turn, mySlot, oppSlot);
  } else {
    // I attack opponent → Mode B (infer their defense stat + HP)
    const mySlot = myTeam[turn.attackerSlot];
    const oppSlot = opponentTeam[turn.defenderSlot];
    return inferModeB(turn, mySlot, oppSlot);
  }
}
