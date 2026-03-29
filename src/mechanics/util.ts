// 4096-based fixed-point arithmetic utilities
// These match the actual game's internal rounding behavior

/**
 * Pokemon-style rounding: rounds 0.5 toward zero (down for positive, up for negative).
 * This is "round half to zero" or "round half toward zero".
 */
export function pokeRound(value: number): number {
  return (value % 1 > 0.5) ? Math.ceil(value) : Math.floor(value);
}

/**
 * Apply a single 4096-based modifier to a value.
 * modifier is expressed as a fraction of 4096 (e.g., 1.5x = 6144)
 */
export function applyMod(value: number, mod: number): number {
  return pokeRound((value * mod) / 4096);
}

/**
 * Chain multiple 4096-based modifiers together.
 * Each modifier is applied sequentially with intermediate rounding.
 */
export function chainMods(value: number, ...mods: number[]): number {
  let result = value;
  for (const mod of mods) {
    result = applyMod(result, mod);
  }
  return result;
}

/**
 * Convert a decimal multiplier to 4096-based integer.
 * e.g., 1.5 -> 6144, 0.75 -> 3072
 */
export function toMod(multiplier: number): number {
  return Math.round(multiplier * 4096);
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Well-known 4096-based modifier constants used throughout the game.
 */
export const MOD = {
  // Common multipliers
  x0_25: 1024,    // 0.25x
  x0_5: 2048,     // 0.5x
  x0_667: 2732,   // 2/3 (~0.667x) - screens in doubles
  x0_75: 3072,    // 0.75x
  x1_0: 4096,     // 1.0x (identity)
  x1_2: 4915,     // 1.2x - type-boosting items, iron fist, reckless, etc.
  x1_25: 5120,    // 1.25x - neuroforce
  x1_3: 5325,     // ~1.3x - terrain, tough claws, sheer force, analytic, sand force
  x1_3_life_orb: 5324, // Life Orb's specific 1.3x (slightly less)
  x1_33: 5461,    // ~1.33x - collision course / electro drift
  x1_5: 6144,     // 1.5x - STAB, weather, technician, choice band, etc.
  x2_0: 8192,     // 2.0x - adaptability STAB, huge power, etc.
  x2_25: 9216,    // 2.25x - tera adaptability
} as const;
