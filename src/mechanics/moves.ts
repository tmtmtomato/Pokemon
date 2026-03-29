// Move-specific damage modifiers and special handling
import type { Pokemon } from '../pokemon.js';
import type { Move } from '../move.js';

/**
 * Get effective base power after move-specific modifiers.
 */
export function getEffectiveBasePower(
  move: Move,
  attacker: Pokemon,
  defender: Pokemon,
): number {
  let bp = move.basePower;

  switch (move.bpModifier) {
    case 'knock_off':
      // 1.5x if target has a held item (and it's not a mega stone being used)
      if (defender.item && !defender.isMega) bp = Math.floor(bp * 1.5);
      break;
    case 'acrobatics':
      // 2x if user has no item
      if (!attacker.item) bp *= 2;
      break;
    case 'facade':
      // 2x if user has burn/poison/paralysis
      if (attacker.status === 'brn' || attacker.status === 'psn' ||
          attacker.status === 'tox' || attacker.status === 'par') bp *= 2;
      break;
    case 'hex':
      // 2x if target has a status condition
      if (defender.status) bp *= 2;
      break;
  }

  return bp;
}

/**
 * Determine which offensive stat to use.
 * Handles Foul Play, Body Press, Photon Geyser etc.
 */
export function getOffensiveStat(
  move: Move,
  attacker: Pokemon,
  defender: Pokemon,
  isCrit: boolean,
): number {
  // Foul Play: use target's Atk
  if (move.useTargetOffensiveStat) {
    const stage = isCrit ? Math.max(0, defender.boosts.atk) : defender.boosts.atk;
    const raw = defender.rawStats.atk;
    return applyBoostDirect(raw, stage);
  }

  // Body Press: use user's Def
  if (move.overrideOffensiveStat === 'def') {
    const stage = isCrit ? Math.max(0, attacker.boosts.def) : attacker.boosts.def;
    const raw = attacker.rawStats.def;
    return applyBoostDirect(raw, stage);
  }

  // Normal case
  const statId = move.isPhysical() ? 'atk' : 'spa';
  const stage = isCrit ? Math.max(0, attacker.boosts[statId]) : attacker.boosts[statId];
  const raw = attacker.rawStats[statId];
  return applyBoostDirect(raw, stage);
}

/**
 * Determine which defensive stat to use.
 * Handles Psyshock/Psystrike targeting physical defense.
 */
export function getDefensiveStat(
  move: Move,
  defender: Pokemon,
  isCrit: boolean,
): number {
  // Psyshock: special move targeting physical defense
  const statId = move.overrideDefensiveStat ?? (move.isPhysical() ? 'def' : 'spd');
  const stage = isCrit ? Math.min(0, defender.boosts[statId]) : defender.boosts[statId];
  const raw = defender.rawStats[statId];
  return applyBoostDirect(raw, stage);
}

// Helper: apply boost directly to a raw stat value
function applyBoostDirect(stat: number, stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  if (clamped >= 0) {
    return Math.floor(stat * (2 + clamped) / 2);
  } else {
    return Math.floor(stat * 2 / (2 + Math.abs(clamped)));
  }
}
