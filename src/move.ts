// Move model class
import type { TypeName, MoveCategory, MoveFlags, StatID, MoveData } from './types.js';
import { getMove } from './data/index.js';

export class Move {
  readonly name: string;
  readonly type: TypeName;
  readonly category: MoveCategory;
  readonly basePower: number;
  readonly pp: number;
  readonly accuracy: number;
  readonly priority: number;
  readonly flags: MoveFlags;
  readonly recoil?: [number, number];
  readonly drain?: [number, number];
  readonly multiHit?: number | [number, number];
  readonly secondaryEffect?: boolean;
  readonly alwaysCrit?: boolean;
  readonly overrideOffensiveStat?: StatID;
  readonly overrideDefensiveStat?: StatID;
  readonly bpModifier?: string;
  readonly useTargetOffensiveStat?: boolean;
  readonly isSpread?: boolean;

  // Runtime overrides
  readonly isCrit: boolean;
  readonly hits: number; // for multi-hit moves, specified hit count

  constructor(name: string, options?: { isCrit?: boolean; hits?: number }) {
    const data = getMove(name) as (MoveData & { useTargetOffensiveStat?: boolean; isSpread?: boolean }) | undefined;
    if (!data) {
      throw new Error(`Unknown move: ${name}`);
    }
    this.name = data.name;
    this.type = data.type;
    this.category = data.category;
    this.basePower = data.basePower;
    this.pp = data.pp;
    this.accuracy = data.accuracy;
    this.priority = data.priority;
    this.flags = data.flags;
    this.recoil = data.recoil;
    this.drain = data.drain;
    this.multiHit = data.multiHit;
    this.secondaryEffect = data.secondaryEffect;
    this.alwaysCrit = data.alwaysCrit;
    this.overrideOffensiveStat = data.overrideOffensiveStat;
    this.overrideDefensiveStat = data.overrideDefensiveStat;
    this.bpModifier = data.bpModifier;
    this.useTargetOffensiveStat = data.useTargetOffensiveStat;
    this.isSpread = data.isSpread;

    this.isCrit = options?.isCrit ?? false;
    this.hits = options?.hits ?? 1;
  }

  /** Is this a physical move? */
  isPhysical(): boolean {
    return this.category === 'Physical';
  }

  /** Is this a special move? */
  isSpecial(): boolean {
    return this.category === 'Special';
  }

  /** Is this a contact move? */
  makesContact(): boolean {
    return this.flags.contact ?? false;
  }

  /** Clone with possible overrides. */
  clone(overrides?: { isCrit?: boolean; hits?: number }): Move {
    return new Move(this.name, {
      isCrit: overrides?.isCrit ?? this.isCrit,
      hits: overrides?.hits ?? this.hits,
    });
  }
}
