import { useReducer, useMemo } from 'react';
import type { StatID, NatureName, GameType, Weather, Terrain, StatusName, TypeName } from '../../src/types.js';
import { calculate, Pokemon, Move, Field } from '../../src/index.js';
import type { Result } from '../../src/index.js';
import { getSpecies, getMove } from '../../src/data/index.js';

// ===== Form State Types =====

export interface PokemonFormState {
  species: string;
  sp: Record<StatID, number>;
  nature: NatureName;
  ability: string;
  item: string;
  teraType: TypeName | 'Stellar' | '';
  isTera: boolean;
  isStellarFirstUse: boolean;
  status: StatusName | '';
  curHP: number;
  boosts: Record<StatID, number>;
  isMega: boolean;
}

export interface MoveFormState {
  name: string;
  isCrit: boolean;
  isSpread: boolean;
}

export interface SideFormState {
  isReflect: boolean;
  isLightScreen: boolean;
  isAuroraVeil: boolean;
  isHelpingHand: boolean;
  isFriendGuard: boolean;
  isBattery: boolean;
  isPowerSpot: boolean;
  isFlowerGift: boolean;
  isSteelySpirit: boolean;
}

export interface FieldFormState {
  gameType: GameType;
  weather: Weather | '';
  terrain: Terrain | '';
  isGravity: boolean;
  isFairyAura: boolean;
  isDarkAura: boolean;
  isAuraBreak: boolean;
  isBeadsOfRuin: boolean;
  isTabletsOfRuin: boolean;
  isSwordOfRuin: boolean;
  isVesselOfRuin: boolean;
  attackerSide: SideFormState;
  defenderSide: SideFormState;
}

export interface CalcState {
  activeTab: 'attacker' | 'defender';
  attacker: PokemonFormState;
  defender: PokemonFormState;
  move: MoveFormState;
  field: FieldFormState;
}

// ===== Actions =====

export type CalcAction =
  | { type: 'SET_TAB'; tab: 'attacker' | 'defender' }
  | { type: 'SET_SPECIES'; side: 'attacker' | 'defender'; species: string }
  | { type: 'SET_SP'; side: 'attacker' | 'defender'; stat: StatID; value: number }
  | { type: 'SET_NATURE'; side: 'attacker' | 'defender'; nature: NatureName }
  | { type: 'SET_ABILITY'; side: 'attacker' | 'defender'; ability: string }
  | { type: 'SET_ITEM'; side: 'attacker' | 'defender'; item: string }
  | { type: 'SET_TERA_TYPE'; side: 'attacker' | 'defender'; teraType: TypeName | 'Stellar' | '' }
  | { type: 'SET_IS_TERA'; side: 'attacker' | 'defender'; isTera: boolean }
  | { type: 'SET_STATUS'; side: 'attacker' | 'defender'; status: StatusName | '' }
  | { type: 'SET_HP'; side: 'attacker' | 'defender'; curHP: number }
  | { type: 'SET_BOOST'; side: 'attacker' | 'defender'; stat: StatID; value: number }
  | { type: 'SET_MEGA'; side: 'attacker' | 'defender'; isMega: boolean }
  | { type: 'SET_MOVE'; name: string }
  | { type: 'SET_CRIT'; isCrit: boolean }
  | { type: 'SET_SPREAD'; isSpread: boolean }
  | { type: 'SET_GAME_TYPE'; gameType: GameType }
  | { type: 'SET_WEATHER'; weather: Weather | '' }
  | { type: 'SET_TERRAIN'; terrain: Terrain | '' }
  | { type: 'SET_FIELD_FLAG'; flag: string; value: boolean }
  | { type: 'SET_SIDE_FLAG'; side: 'attacker' | 'defender'; flag: string; value: boolean }
  | { type: 'LOAD_POKEMON'; side: 'attacker' | 'defender'; pokemon: PokemonFormState };

// ===== Defaults =====

const defaultSP: Record<StatID, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const defaultBoosts: Record<StatID, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const defaultSide: SideFormState = {
  isReflect: false, isLightScreen: false, isAuroraVeil: false,
  isHelpingHand: false, isFriendGuard: false,
  isBattery: false, isPowerSpot: false, isFlowerGift: false, isSteelySpirit: false,
};

function defaultPokemon(): PokemonFormState {
  return {
    species: '', sp: { ...defaultSP }, nature: 'Hardy', ability: '', item: '',
    teraType: '', isTera: false, isStellarFirstUse: true,
    status: '', curHP: 100, boosts: { ...defaultBoosts }, isMega: false,
  };
}

const initialState: CalcState = {
  activeTab: 'attacker',
  attacker: defaultPokemon(),
  defender: defaultPokemon(),
  move: { name: '', isCrit: false, isSpread: true },
  field: {
    gameType: 'Doubles', weather: '', terrain: '', isGravity: false,
    isFairyAura: false, isDarkAura: false, isAuraBreak: false,
    isBeadsOfRuin: false, isTabletsOfRuin: false, isSwordOfRuin: false, isVesselOfRuin: false,
    attackerSide: { ...defaultSide }, defenderSide: { ...defaultSide },
  },
};

// ===== Reducer =====

function updatePokemon(state: CalcState, side: 'attacker' | 'defender', update: Partial<PokemonFormState>): CalcState {
  return { ...state, [side]: { ...state[side], ...update } };
}

function reducer(state: CalcState, action: CalcAction): CalcState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };

    case 'SET_SPECIES': {
      const speciesData = getSpecies(action.species);
      if (!speciesData) return state;
      return updatePokemon(state, action.side, {
        species: action.species,
        ability: speciesData.abilities[0] ?? '',
        item: '', isMega: false, teraType: '', isTera: false,
      });
    }

    case 'SET_SP': {
      const pokemon = state[action.side];
      const newSP = { ...pokemon.sp, [action.stat]: Math.max(0, Math.min(32, action.value)) };
      return updatePokemon(state, action.side, { sp: newSP });
    }

    case 'SET_NATURE':
      return updatePokemon(state, action.side, { nature: action.nature });
    case 'SET_ABILITY':
      return updatePokemon(state, action.side, { ability: action.ability });
    case 'SET_ITEM':
      return updatePokemon(state, action.side, { item: action.item, isMega: false });
    case 'SET_TERA_TYPE':
      return updatePokemon(state, action.side, {
        teraType: action.teraType,
        isTera: action.teraType !== '',
        isStellarFirstUse: action.teraType === 'Stellar',
      });
    case 'SET_IS_TERA':
      return updatePokemon(state, action.side, { isTera: action.isTera });
    case 'SET_STATUS':
      return updatePokemon(state, action.side, { status: action.status });
    case 'SET_HP':
      return updatePokemon(state, action.side, { curHP: action.curHP });
    case 'SET_BOOST': {
      const pokemon = state[action.side];
      return updatePokemon(state, action.side, {
        boosts: { ...pokemon.boosts, [action.stat]: Math.max(-6, Math.min(6, action.value)) },
      });
    }
    case 'SET_MEGA':
      return updatePokemon(state, action.side, { isMega: action.isMega });

    case 'SET_MOVE': {
      const moveData = getMove(action.name);
      return { ...state, move: { ...state.move, name: action.name, isSpread: moveData?.isSpread ?? false } };
    }
    case 'SET_CRIT':
      return { ...state, move: { ...state.move, isCrit: action.isCrit } };
    case 'SET_SPREAD':
      return { ...state, move: { ...state.move, isSpread: action.isSpread } };

    case 'SET_GAME_TYPE':
      return { ...state, field: { ...state.field, gameType: action.gameType } };
    case 'SET_WEATHER':
      return { ...state, field: { ...state.field, weather: action.weather } };
    case 'SET_TERRAIN':
      return { ...state, field: { ...state.field, terrain: action.terrain } };

    case 'SET_FIELD_FLAG':
      return { ...state, field: { ...state.field, [action.flag]: action.value } };

    case 'SET_SIDE_FLAG': {
      const sideKey = action.side === 'attacker' ? 'attackerSide' : 'defenderSide';
      return {
        ...state,
        field: {
          ...state.field,
          [sideKey]: { ...state.field[sideKey], [action.flag]: action.value },
        },
      };
    }

    case 'LOAD_POKEMON':
      return { ...state, [action.side]: action.pokemon };

    default:
      return state;
  }
}

// ===== Hook =====

function buildPokemonConfig(p: PokemonFormState) {
  return {
    name: p.species,
    sp: p.sp,
    nature: p.nature,
    ability: p.ability,
    item: p.item || undefined,
    status: p.status || undefined,
    curHP: p.curHP,
    boosts: p.boosts,
    isMega: p.isMega,
    teraType: (p.teraType || undefined) as TypeName | 'Stellar' | undefined,
    isTera: p.isTera,
    isStellarFirstUse: p.isStellarFirstUse,
  };
}

function buildFieldConfig(f: FieldFormState, moveIsSpread: boolean) {
  // When user disables spread for a spread move in Doubles,
  // pass Singles to skip 0.75x (minor screen accuracy trade-off for MVP)
  const effectiveGameType = (f.gameType === 'Doubles' && !moveIsSpread) ? 'Singles' : f.gameType;

  return {
    gameType: effectiveGameType as GameType,
    weather: f.weather || undefined,
    terrain: f.terrain || undefined,
    isGravity: f.isGravity,
    isFairyAura: f.isFairyAura,
    isDarkAura: f.isDarkAura,
    isAuraBreak: f.isAuraBreak,
    isBeadsOfRuin: f.isBeadsOfRuin,
    isTabletsOfRuin: f.isTabletsOfRuin,
    isSwordOfRuin: f.isSwordOfRuin,
    isVesselOfRuin: f.isVesselOfRuin,
    attackerSide: { ...f.attackerSide },
    defenderSide: { ...f.defenderSide },
  };
}

export function useCalc() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const result = useMemo((): Result | null => {
    if (!state.attacker.species || !state.defender.species || !state.move.name) {
      return null;
    }
    try {
      const atk = new Pokemon(buildPokemonConfig(state.attacker));
      const def = new Pokemon(buildPokemonConfig(state.defender));
      const move = new Move(state.move.name, { isCrit: state.move.isCrit });
      const field = new Field(buildFieldConfig(state.field, state.move.isSpread));
      return calculate(atk, def, move, field);
    } catch {
      return null;
    }
  }, [state.attacker, state.defender, state.move, state.field]);

  return { state, dispatch, result };
}
