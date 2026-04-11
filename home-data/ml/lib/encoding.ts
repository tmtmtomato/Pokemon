/**
 * encoding.ts — Feature encoding utilities for ML pipeline.
 *
 * Provides species encoding (one-hot / multi-hot) and normalization.
 */

// ---------------------------------------------------------------------------
// Species encoder
// ---------------------------------------------------------------------------

export interface SpeciesEncoder {
  /** species name → index (0-based) */
  nameToIndex: Map<string, number>;
  /** index → species name */
  indexToName: string[];
  /** total number of unique species */
  size: number;
}

/** Build encoder from a list of all observed species names. */
export function buildSpeciesEncoder(speciesNames: Iterable<string>): SpeciesEncoder {
  const unique = [...new Set(speciesNames)].sort();
  const nameToIndex = new Map<string, number>();
  for (let i = 0; i < unique.length; i++) {
    nameToIndex.set(unique[i], i);
  }
  return { nameToIndex, indexToName: unique, size: unique.length };
}

/** One-hot encode a single species (zeros elsewhere). */
export function oneHotSpecies(
  encoder: SpeciesEncoder,
  species: string,
): Float64Array {
  const vec = new Float64Array(encoder.size);
  const idx = encoder.nameToIndex.get(species);
  if (idx !== undefined) vec[idx] = 1;
  return vec;
}

/** Multi-hot encode a team (multiple species set to 1). */
export function multiHotTeam(
  encoder: SpeciesEncoder,
  species: string[],
): Float64Array {
  const vec = new Float64Array(encoder.size);
  for (const sp of species) {
    const idx = encoder.nameToIndex.get(sp);
    if (idx !== undefined) vec[idx] = 1;
  }
  return vec;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export interface NormParams {
  mean: number;
  std: number;
}

/** Compute z-normalization parameters from an array of values. */
export function computeNormParams(values: number[]): NormParams {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 1 };

  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;

  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  const std = Math.sqrt(variance / n) || 1; // avoid division by zero

  return { mean, std };
}

/** Apply z-normalization to a single value. */
export function zNormalize(value: number, params: NormParams): number {
  return (value - params.mean) / params.std;
}

/** Apply z-normalization to an array of values. */
export function zNormalizeArray(values: number[], params?: NormParams): {
  normalized: number[];
  params: NormParams;
} {
  const p = params ?? computeNormParams(values);
  return {
    normalized: values.map((v) => (v - p.mean) / p.std),
    params: p,
  };
}

/** Min-max normalization to [0, 1]. */
export function minMaxNormalize(
  value: number,
  min: number,
  max: number,
): number {
  const range = max - min;
  if (range === 0) return 0.5;
  return (value - min) / range;
}

// ---------------------------------------------------------------------------
// Type name encoder (for type one-hot)
// ---------------------------------------------------------------------------

export const TYPE_NAMES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
  "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
] as const;

export const TYPE_INDEX = new Map(TYPE_NAMES.map((t, i) => [t, i]));

/** One-hot encode a type (18 dimensions). Dual-type: both set to 0.5 each. */
export function encodeTypes(types: string[]): Float64Array {
  const vec = new Float64Array(18);
  const value = 1 / types.length; // 0.5 for dual-type, 1.0 for mono-type
  for (const t of types) {
    const idx = TYPE_INDEX.get(t);
    if (idx !== undefined) vec[idx] = value;
  }
  return vec;
}
