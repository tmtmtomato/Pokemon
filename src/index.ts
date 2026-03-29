// Public API
export { calculate } from './calculate.js';
export { Pokemon } from './pokemon.js';
export { Move } from './move.js';
export { Field, Side } from './field.js';
export { Result } from './result.js';

// Mechanics utilities (for advanced usage)
export { calcHP, calcStat, calcAllStats, validateSP, getNatureModifier, applyBoost } from './mechanics/stats.js';
export { getEffectiveness, getEffectivenessLabel } from './mechanics/type-effectiveness.js';
export { pokeRound, applyMod, chainMods, MOD } from './mechanics/util.js';

// Types
export type {
  TypeName, StatID, StatsTable, NatureName, StatusName,
  Weather, Terrain, GameType, MoveCategory, MoveFlags,
  SpeciesData, MoveData, ItemData, AbilityData,
  PokemonConfig, FieldConfig, SideConfig,
  DamageRoll, KOChance,
} from './types.js';
