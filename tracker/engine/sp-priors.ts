/**
 * SP allocation priors based on base stats and competitive metagame tendencies.
 *
 * Key competitive tendencies (doubles / VGC):
 * - Physical attacker (high Atk): max A, then S if fast or H if slow
 * - Special attacker (high SpA): max C, then S if fast or H if slow
 * - Defensive/support (high Def/SpD): max H, then B or D
 * - Dump stat (opposing attack stat, e.g. SpA on physical attacker): 0
 * - Leftover points: 0-4 SP scattered
 *
 * SP budget: 66 total, common splits:
 *   32/32/1/1/0/0  or  32/28/4/1/1/0  or  32/20/12/1/1/0
 */
import type { StatID } from '../../src/types.js';

interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

type StatRole = 'primary' | 'secondary' | 'flex' | 'leftover' | 'dump';

/**
 * Classify each stat's expected investment role based on base stats.
 */
export function classifyStatRoles(base: BaseStats): Record<StatID, StatRole> {
  const isPhysical = base.atk >= base.spa;
  const mainAtkStat: StatID = isPhysical ? 'atk' : 'spa';
  const dumpAtkStat: StatID = isPhysical ? 'spa' : 'atk';
  const mainAtkValue = isPhysical ? base.atk : base.spa;

  // Defensive prowess: average of (HP + better defense)
  const betterDef = Math.max(base.def, base.spd);
  const bulkScore = (base.hp + betterDef) / 2;

  // Offensive prowess
  const offenseScore = mainAtkValue;

  const isFast = base.spe >= 80;
  const isSlow = base.spe <= 55;
  const isOffensive = offenseScore > bulkScore - 10; // slight bias toward offensive
  const isWall = bulkScore > offenseScore + 20;

  const roles: Record<StatID, StatRole> = {
    hp: 'leftover',
    atk: 'leftover',
    def: 'leftover',
    spa: 'leftover',
    spd: 'leftover',
    spe: 'leftover',
  };

  if (isWall) {
    // ===== Defensive / Support Pokemon =====
    // HP is almost always primary
    roles.hp = 'primary';

    // The better of Def/SpD tends to get secondary investment
    // But both are viable — mark as flex
    if (base.def >= base.spd) {
      roles.def = 'secondary';
      roles.spd = 'flex';
    } else {
      roles.spd = 'secondary';
      roles.def = 'flex';
    }

    // Attack stats: only relevant if base is high
    if (mainAtkValue >= 100) {
      roles[mainAtkStat] = 'leftover';
    } else {
      roles[mainAtkStat] = 'dump';
    }
    roles[dumpAtkStat] = 'dump';

    // Speed: usually leftover for walls
    roles.spe = 'leftover';

  } else if (isOffensive) {
    // ===== Offensive Pokemon =====
    roles[mainAtkStat] = 'primary';
    roles[dumpAtkStat] = 'dump';

    if (isFast) {
      // Fast attacker: A/C + S, scraps elsewhere
      roles.spe = 'secondary';
      roles.hp = 'leftover';
    } else if (isSlow) {
      // Slow attacker: A/C + H, maybe some B/D
      roles.hp = 'secondary';
      roles.spe = 'dump'; // intentionally slow (Trick Room candidate)
    } else {
      // Mid-speed: could go either way
      roles.spe = 'flex';
      roles.hp = 'flex';
    }

    // Defense stats for offensive mons
    roles.def = 'leftover';
    roles.spd = 'leftover';

  } else {
    // ===== Balanced / Support (e.g. Incineroar) =====
    roles.hp = 'primary';
    roles[mainAtkStat] = 'flex';
    roles[dumpAtkStat] = 'dump';

    // L-5: Both defenses are flex for balanced mons
    roles.def = 'flex';
    roles.spd = 'flex';

    roles.spe = 'leftover';
  }

  return roles;
}

/**
 * Compute a prior weight for a given SP value on a stat, based on its role.
 * Returns a multiplier > 0 (higher = more likely).
 *
 * Weights are soft biases — they don't eliminate candidates, just re-rank density.
 */
export function spPriorWeight(role: StatRole, sp: number): number {
  switch (role) {
    case 'primary':
      // Expect near-max investment (24-32)
      if (sp >= 28) return 4.0;
      if (sp >= 24) return 3.0;
      if (sp >= 16) return 0.6;
      if (sp >= 8) return 0.2;
      return 0.05;

    case 'secondary':
      // Expect high investment (24-32) — the "other max stat"
      if (sp >= 28) return 3.5;
      if (sp >= 24) return 2.5;
      if (sp >= 16) return 0.5;
      if (sp >= 8) return 0.2;
      if (sp <= 4) return 0.3; // could also be skipped entirely
      return 0.1;

    case 'flex':
      // Could be anywhere — moderate investment or none
      // Bimodal: likely 0-4 (not invested) or 20-32 (invested)
      if (sp >= 24) return 2.0;
      if (sp >= 16) return 1.2;
      if (sp >= 8) return 0.8;
      if (sp <= 4) return 1.5; // not invested is also common
      return 0.6;

    case 'leftover':
      // Expect scraps (0-8)
      if (sp === 0) return 2.0;
      if (sp <= 4) return 1.8;
      if (sp <= 8) return 1.0;
      if (sp <= 12) return 0.3;
      return 0.05;

    case 'dump':
      // Expect zero
      if (sp === 0) return 3.0;
      if (sp <= 4) return 0.3;
      return 0.02;
  }
}

/**
 * Compute the combined prior weight for a candidate build.
 * Multiplies per-stat priors for all stats that have SP values.
 */
export function candidatePriorWeight(
  roles: Record<StatID, StatRole>,
  sp: Partial<Record<StatID, number>>,
): number {
  let weight = 1.0;
  for (const [stat, value] of Object.entries(sp)) {
    if (value !== undefined) {
      weight *= spPriorWeight(roles[stat as StatID], value);
    }
  }
  return weight;
}
