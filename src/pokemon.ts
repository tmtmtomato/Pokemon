// Pokemon model class
import type { TypeName, NatureName, StatusName, StatID, StatsTable, PokemonConfig, SpeciesData } from './types.js';
import { calcAllStats, applyBoost } from './mechanics/stats.js';
import { getSpecies } from './data/index.js';

export class Pokemon {
  readonly species: SpeciesData;
  readonly name: string;
  readonly sp: StatsTable;
  readonly nature: NatureName;
  readonly ability: string;
  readonly item: string;
  readonly moves: string[];
  readonly status: StatusName | undefined;
  readonly curHP: number; // percentage 0-100
  readonly boosts: StatsTable;
  readonly isMega: boolean;

  // Computed
  readonly types: TypeName[];
  readonly rawStats: StatsTable;
  readonly baseStats: StatsTable;
  readonly weightKg: number;

  constructor(config: PokemonConfig) {
    const speciesData = getSpecies(config.name);
    if (!speciesData) {
      throw new Error(`Unknown species: ${config.name}`);
    }
    this.species = speciesData;
    this.name = config.name;
    this.nature = config.nature ?? 'Hardy';
    this.ability = config.ability ?? speciesData.abilities[0];
    this.item = config.item ?? '';
    this.moves = config.moves ?? [];
    this.status = config.status;
    this.curHP = config.curHP ?? 100;
    this.isMega = config.isMega ?? false;

    // SP allocation with defaults
    this.sp = {
      hp: config.sp?.hp ?? 0,
      atk: config.sp?.atk ?? 0,
      def: config.sp?.def ?? 0,
      spa: config.sp?.spa ?? 0,
      spd: config.sp?.spd ?? 0,
      spe: config.sp?.spe ?? 0,
    };

    // Boosts
    this.boosts = {
      hp: 0,
      atk: config.boosts?.atk ?? 0,
      def: config.boosts?.def ?? 0,
      spa: config.boosts?.spa ?? 0,
      spd: config.boosts?.spd ?? 0,
      spe: config.boosts?.spe ?? 0,
    };

    // Apply mega evolution if applicable
    if (this.isMega && speciesData.mega) {
      this.baseStats = speciesData.mega.baseStats;
      this.types = [...speciesData.mega.types];
      this.weightKg = speciesData.mega.weightKg ?? speciesData.weightKg;
    } else {
      this.baseStats = speciesData.baseStats;
      this.types = [...speciesData.types];
      this.weightKg = speciesData.weightKg;
    }

    // Calculate raw stats from base stats + SP + nature
    this.rawStats = calcAllStats(this.baseStats, this.sp, this.nature);
  }

  /** Get a stat with boost applied. */
  stat(statId: StatID): number {
    return applyBoost(this.rawStats[statId], this.boosts[statId]);
  }

  /** Get max HP. */
  maxHP(): number {
    return this.rawStats.hp;
  }

  /** Get current HP as absolute value. */
  currentHP(): number {
    return Math.floor(this.maxHP() * this.curHP / 100);
  }

  /** Check if this pokemon has full HP. */
  isFullHP(): boolean {
    return this.curHP >= 100;
  }

  /** Check if pokemon has a specific type. */
  hasType(type: TypeName): boolean {
    return this.types.includes(type);
  }

  /** Get the effective ability (respects Mega ability override). */
  effectiveAbility(): string {
    if (this.isMega && this.species.mega) {
      return this.species.mega.ability;
    }
    return this.ability;
  }

  /** Check if ability is a Mold Breaker variant. */
  hasMoldBreaker(): boolean {
    const ability = this.effectiveAbility();
    return ability === 'Mold Breaker' || ability === 'Teravolt' || ability === 'Turboblaze';
  }

  /** Deep clone this Pokemon. */
  clone(): Pokemon {
    return new Pokemon({
      name: this.name,
      sp: { ...this.sp },
      nature: this.nature,
      ability: this.ability,
      item: this.item,
      moves: [...this.moves],
      status: this.status,
      curHP: this.curHP,
      boosts: { ...this.boosts },
      isMega: this.isMega,
    });
  }
}
