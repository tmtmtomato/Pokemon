import { useReducer, useEffect } from 'react';
import type { StatID, NatureName, TypeName, StatusName, GameType, Weather, Terrain } from '../../src/types.js';
import { getSpecies } from '../../src/data/index.js';

// ===== State Types =====

export interface MyPokemonSlot {
  species: string;
  sp: Record<StatID, number>;
  nature: NatureName;
  ability: string;
  item: string;
  moves: string[];
  teraType: TypeName | 'Stellar' | '';
  isMega: boolean;
}

export interface OpponentPokemonSlot {
  species: string;
  knownAbility: string;
  knownItem: string;
  knownTeraType: TypeName | 'Stellar' | '';
  knownMoves: string[];
  nickname: string;
}

export interface FieldSnapshot {
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
  attackerSide: {
    isReflect: boolean;
    isLightScreen: boolean;
    isAuroraVeil: boolean;
    isHelpingHand: boolean;
    isBattery: boolean;
    isPowerSpot: boolean;
    isSteelySpirit: boolean;
    isFlowerGift: boolean;
    isFriendGuard: boolean;
  };
  defenderSide: {
    isReflect: boolean;
    isLightScreen: boolean;
    isAuroraVeil: boolean;
    isFriendGuard: boolean;
  };
}

export interface TurnEntry {
  id: string;
  turnNumber: number;
  attackerSide: 'mine' | 'opponent';
  attackerSlot: number;
  defenderSlot: number;
  moveName: string;
  isCrit: boolean;
  isSpread: boolean;
  observedDamagePercent: number;
  field: FieldSnapshot;
  attackerBoosts: Partial<Record<StatID, number>>;
  defenderBoosts: Partial<Record<StatID, number>>;
  attackerStatus: StatusName | '';
  defenderStatus: StatusName | '';
  revealedAbility?: string;
  revealedItem?: string;
}

export type TrackerPhase = 'setup' | 'battle' | 'review';

export interface TrackerState {
  phase: TrackerPhase;
  myTeam: MyPokemonSlot[];
  opponentTeam: OpponentPokemonSlot[];
  turns: TurnEntry[];
  currentField: FieldSnapshot;
}

// ===== Defaults =====

const defaultSP: Record<StatID, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function createMySlot(): MyPokemonSlot {
  return { species: '', sp: { ...defaultSP }, nature: 'Hardy', ability: '', item: '', moves: [], teraType: '', isMega: false };
}

export function createOpponentSlot(): OpponentPokemonSlot {
  return { species: '', knownAbility: '', knownItem: '', knownTeraType: '', knownMoves: [], nickname: '' };
}

const defaultSide = {
  isReflect: false, isLightScreen: false, isAuroraVeil: false,
  isHelpingHand: false, isBattery: false, isPowerSpot: false,
  isSteelySpirit: false, isFlowerGift: false, isFriendGuard: false,
};

const defaultDefSide = {
  isReflect: false, isLightScreen: false, isAuroraVeil: false, isFriendGuard: false,
};

export function createFieldSnapshot(): FieldSnapshot {
  return {
    gameType: 'Doubles', weather: '', terrain: '',
    isGravity: false, isFairyAura: false, isDarkAura: false, isAuraBreak: false,
    isBeadsOfRuin: false, isTabletsOfRuin: false, isSwordOfRuin: false, isVesselOfRuin: false,
    attackerSide: { ...defaultSide }, defenderSide: { ...defaultDefSide },
  };
}

const initialState: TrackerState = {
  phase: 'setup',
  myTeam: [createMySlot()],
  opponentTeam: [createOpponentSlot()],
  turns: [],
  currentField: createFieldSnapshot(),
};

// ===== Actions =====

export type TrackerAction =
  | { type: 'SET_PHASE'; phase: TrackerPhase }
  // My team
  | { type: 'SET_MY_POKEMON'; slot: number; updates: Partial<MyPokemonSlot> }
  | { type: 'SET_MY_SPECIES'; slot: number; species: string }
  | { type: 'SET_MY_SP'; slot: number; stat: StatID; value: number }
  | { type: 'SET_MY_MOVE'; slot: number; moveIndex: number; move: string }
  | { type: 'ADD_MY_SLOT' }
  | { type: 'REMOVE_MY_SLOT'; slot: number }
  | { type: 'LOAD_MY_TEAM'; team: MyPokemonSlot[] }
  // Opponent team
  | { type: 'SET_OPPONENT_POKEMON'; slot: number; updates: Partial<OpponentPokemonSlot> }
  | { type: 'SET_OPPONENT_SPECIES'; slot: number; species: string }
  | { type: 'ADD_OPPONENT_SLOT' }
  | { type: 'REMOVE_OPPONENT_SLOT'; slot: number }
  // Reveal info
  | { type: 'REVEAL_ABILITY'; opponentSlot: number; ability: string }
  | { type: 'REVEAL_ITEM'; opponentSlot: number; item: string }
  | { type: 'REVEAL_TERA'; opponentSlot: number; teraType: TypeName | 'Stellar' }
  // Field
  | { type: 'SET_FIELD'; updates: Partial<FieldSnapshot> }
  // Turns
  | { type: 'ADD_TURN'; turn: Omit<TurnEntry, 'id' | 'turnNumber'> }
  | { type: 'DELETE_TURN'; id: string }
  // Reset
  | { type: 'RESET' }
  ;

// ===== Reducer =====

let turnCounter = 0;

function reducer(state: TrackerState, action: TrackerAction): TrackerState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    // ── My Team ──  (M-7: bounds check all slot-indexed actions)
    case 'SET_MY_SPECIES': {
      if (action.slot < 0 || action.slot >= state.myTeam.length) return state;
      const speciesData = getSpecies(action.species);
      const team = [...state.myTeam];
      team[action.slot] = {
        ...team[action.slot],
        species: action.species,
        ability: speciesData?.abilities[0] ?? '',
        item: '', moves: [], isMega: false, teraType: '',
      };
      return { ...state, myTeam: team };
    }
    case 'SET_MY_POKEMON': {
      if (action.slot < 0 || action.slot >= state.myTeam.length) return state;
      const team = [...state.myTeam];
      team[action.slot] = { ...team[action.slot], ...action.updates };
      return { ...state, myTeam: team };
    }
    case 'SET_MY_SP': {
      if (action.slot < 0 || action.slot >= state.myTeam.length) return state;
      const team = [...state.myTeam];
      const slot = team[action.slot];
      team[action.slot] = {
        ...slot,
        sp: { ...slot.sp, [action.stat]: Math.max(0, Math.min(32, action.value)) },
      };
      return { ...state, myTeam: team };
    }
    case 'SET_MY_MOVE': {
      if (action.slot < 0 || action.slot >= state.myTeam.length) return state;
      const team = [...state.myTeam];
      const slot = team[action.slot];
      const moves = [...slot.moves];
      // Ensure array is long enough
      while (moves.length <= action.moveIndex) moves.push('');
      moves[action.moveIndex] = action.move;
      team[action.slot] = { ...slot, moves };
      return { ...state, myTeam: team };
    }
    case 'LOAD_MY_TEAM':
      return { ...state, myTeam: action.team };
    case 'ADD_MY_SLOT':
      if (state.myTeam.length >= 6) return state;
      return { ...state, myTeam: [...state.myTeam, createMySlot()] };
    case 'REMOVE_MY_SLOT': {
      if (state.myTeam.length <= 1) return state;
      const team = state.myTeam.filter((_, i) => i !== action.slot);
      return { ...state, myTeam: team };
    }

    // ── Opponent Team ──
    case 'SET_OPPONENT_SPECIES': {
      if (action.slot < 0 || action.slot >= state.opponentTeam.length) return state;
      const team = [...state.opponentTeam];
      team[action.slot] = {
        ...team[action.slot],
        species: action.species,
        knownAbility: '', knownItem: '', knownTeraType: '', knownMoves: [],
      };
      return { ...state, opponentTeam: team };
    }
    case 'SET_OPPONENT_POKEMON': {
      if (action.slot < 0 || action.slot >= state.opponentTeam.length) return state;
      const team = [...state.opponentTeam];
      team[action.slot] = { ...team[action.slot], ...action.updates };
      return { ...state, opponentTeam: team };
    }
    case 'ADD_OPPONENT_SLOT':
      if (state.opponentTeam.length >= 6) return state;
      return { ...state, opponentTeam: [...state.opponentTeam, createOpponentSlot()] };
    case 'REMOVE_OPPONENT_SLOT': {
      if (state.opponentTeam.length <= 1) return state;
      const team = state.opponentTeam.filter((_, i) => i !== action.slot);
      return { ...state, opponentTeam: team };
    }

    // ── Reveals ──  (M-7: bounds check)
    case 'REVEAL_ABILITY': {
      if (action.opponentSlot < 0 || action.opponentSlot >= state.opponentTeam.length) return state;
      const team = [...state.opponentTeam];
      team[action.opponentSlot] = { ...team[action.opponentSlot], knownAbility: action.ability };
      return { ...state, opponentTeam: team };
    }
    case 'REVEAL_ITEM': {
      if (action.opponentSlot < 0 || action.opponentSlot >= state.opponentTeam.length) return state;
      const team = [...state.opponentTeam];
      team[action.opponentSlot] = { ...team[action.opponentSlot], knownItem: action.item };
      return { ...state, opponentTeam: team };
    }
    case 'REVEAL_TERA': {
      if (action.opponentSlot < 0 || action.opponentSlot >= state.opponentTeam.length) return state;
      const team = [...state.opponentTeam];
      team[action.opponentSlot] = { ...team[action.opponentSlot], knownTeraType: action.teraType };
      return { ...state, opponentTeam: team };
    }

    // ── Field ──
    case 'SET_FIELD':
      return { ...state, currentField: { ...state.currentField, ...action.updates } };

    // ── Turns ──
    case 'ADD_TURN': {
      turnCounter++;
      const entry: TurnEntry = {
        ...action.turn,
        id: `turn-${Date.now()}-${turnCounter}`,
        turnNumber: state.turns.length + 1,
      };
      // Auto-add revealed move to opponent's known moves
      const opTeam = [...state.opponentTeam];
      if (action.turn.attackerSide === 'opponent') {
        const slot = opTeam[action.turn.attackerSlot];
        if (slot && action.turn.moveName && !slot.knownMoves.includes(action.turn.moveName)) {
          opTeam[action.turn.attackerSlot] = {
            ...slot,
            knownMoves: [...slot.knownMoves, action.turn.moveName],
          };
        }
      }
      return { ...state, turns: [...state.turns, entry], opponentTeam: opTeam };
    }
    case 'DELETE_TURN': {
      // M-6: Renumber remaining turns and recompute opponent knownMoves
      const remaining = state.turns.filter(t => t.id !== action.id);
      const renumbered = remaining.map((t, i) => ({ ...t, turnNumber: i + 1 }));
      // Rebuild knownMoves from remaining turns only
      const opTeam = state.opponentTeam.map(slot => ({ ...slot, knownMoves: [] as string[] }));
      for (const t of renumbered) {
        if (t.attackerSide === 'opponent' && t.moveName) {
          const slot = opTeam[t.attackerSlot];
          if (slot && !slot.knownMoves.includes(t.moveName)) {
            slot.knownMoves = [...slot.knownMoves, t.moveName];
          }
        }
      }
      return { ...state, turns: renumbered, opponentTeam: opTeam };
    }

    case 'RESET':
      // M-5: Return fresh objects to avoid shared-reference mutation
      return {
        phase: 'setup' as const,
        myTeam: [createMySlot()],
        opponentTeam: [createOpponentSlot()],
        turns: [],
        currentField: createFieldSnapshot(),
      };

    default:
      return state;
  }
}

// ===== Persistence =====

const STORAGE_KEY = 'champions-tracker';

function migrateMySlot(raw: Partial<MyPokemonSlot>): MyPokemonSlot {
  const base = createMySlot();
  return {
    ...base,
    ...raw,
    sp: { ...base.sp, ...(raw.sp ?? {}) },
    moves: Array.isArray(raw.moves) ? raw.moves : base.moves,
  };
}

function migrateOpponentSlot(raw: Partial<OpponentPokemonSlot>): OpponentPokemonSlot {
  const base = createOpponentSlot();
  return {
    ...base,
    ...raw,
    knownMoves: Array.isArray(raw.knownMoves) ? raw.knownMoves : base.knownMoves,
  };
}

function loadState(): TrackerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as TrackerState;
    // Restore turnCounter from saved turns
    if (saved.turns?.length) {
      turnCounter = saved.turns.length;
    }
    // H-1: Migrate nested array items to ensure all fields exist
    const myTeam = Array.isArray(saved.myTeam) && saved.myTeam.length > 0
      ? saved.myTeam.map(s => migrateMySlot(s))
      : [createMySlot()];
    const opponentTeam = Array.isArray(saved.opponentTeam) && saved.opponentTeam.length > 0
      ? saved.opponentTeam.map(s => migrateOpponentSlot(s))
      : [createOpponentSlot()];
    return {
      phase: saved.phase ?? 'setup',
      myTeam,
      opponentTeam,
      turns: Array.isArray(saved.turns) ? saved.turns : [],
      currentField: { ...createFieldSnapshot(), ...(saved.currentField ?? {}) },
    };
  } catch {
    return initialState;
  }
}

function saveState(state: TrackerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

// ===== Hook =====

export function useTracker() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return { state, dispatch };
}
