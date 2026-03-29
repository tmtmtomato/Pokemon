// Type effectiveness calculation
import type { TypeName } from '../types.js';
import typeChart from '../data/typechart.json' with { type: 'json' };

/**
 * Get the effectiveness multiplier of an attack type against defender types.
 * Returns 0, 0.25, 0.5, 1, 2, or 4.
 */
export function getEffectiveness(
  moveType: TypeName,
  defenderTypes: TypeName[],
): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    const chart = (typeChart as Record<string, Record<string, number>>)[moveType];
    if (chart && defType in chart) {
      multiplier *= chart[defType];
    }
  }
  return multiplier;
}

/**
 * Get the display label for an effectiveness multiplier (Champions style).
 */
export function getEffectivenessLabel(multiplier: number): string {
  if (multiplier === 0) return 'No effect';
  if (multiplier === 0.25) return 'Mostly ineffective';
  if (multiplier === 0.5) return 'Not very effective';
  if (multiplier === 1) return 'Neutral';
  if (multiplier === 2) return 'Super effective';
  if (multiplier >= 4) return 'Extremely effective';
  return `${multiplier}x`;
}

/**
 * Check if a move type is immune against defender types.
 */
export function isImmune(moveType: TypeName, defenderTypes: TypeName[]): boolean {
  return getEffectiveness(moveType, defenderTypes) === 0;
}

/**
 * Check if a move type is super effective against defender types.
 */
export function isSuperEffective(moveType: TypeName, defenderTypes: TypeName[]): boolean {
  return getEffectiveness(moveType, defenderTypes) > 1;
}

/**
 * Check if a move type is not very effective against defender types.
 */
export function isNotVeryEffective(moveType: TypeName, defenderTypes: TypeName[]): boolean {
  const eff = getEffectiveness(moveType, defenderTypes);
  return eff > 0 && eff < 1;
}
