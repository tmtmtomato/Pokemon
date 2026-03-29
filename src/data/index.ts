// Data loader - reads from JSON files and provides lookup functions
import type { SpeciesData, MoveData, ItemData, AbilityData } from '../types.js';
import speciesData from './species.json' with { type: 'json' };
import movesData from './moves.json' with { type: 'json' };
import itemsData from './items.json' with { type: 'json' };
import abilitiesData from './abilities.json' with { type: 'json' };

const species = speciesData as Record<string, SpeciesData>;
const moves = movesData as Record<string, MoveData>;
const items = itemsData as Record<string, ItemData>;
const abilities = abilitiesData as Record<string, AbilityData>;

export function getSpecies(name: string): SpeciesData | undefined {
  return species[name];
}

export function getMove(name: string): MoveData | undefined {
  return moves[name];
}

export function getItem(name: string): ItemData | undefined {
  return items[name];
}

export function getAbility(name: string): AbilityData | undefined {
  return abilities[name];
}

export function getAllSpeciesNames(): string[] {
  return Object.keys(species);
}

export function getAllMoveNames(): string[] {
  return Object.keys(moves);
}

export function getAllItemNames(): string[] {
  return Object.keys(items);
}

export function getAllAbilityNames(): string[] {
  return Object.keys(abilities);
}
