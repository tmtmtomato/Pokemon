// Field model class - represents battlefield conditions
import type { Weather, Terrain, GameType, FieldConfig, SideConfig } from './types.js';

export class Side {
  readonly isReflect: boolean;
  readonly isLightScreen: boolean;
  readonly isAuroraVeil: boolean;
  readonly isProtected: boolean;
  readonly isSR: boolean;
  readonly spikes: number;
  readonly isHelpingHand: boolean;
  readonly isTailwind: boolean;
  readonly isFriendGuard: boolean;
  readonly isBattery: boolean;
  readonly isPowerSpot: boolean;
  readonly isFlowerGift: boolean;
  readonly isSteelySpirit: boolean;
  readonly isSwitching: 'in' | 'out' | undefined;
  readonly isSeeded: boolean;
  readonly isSaltCured: boolean;

  constructor(config?: SideConfig) {
    this.isReflect = config?.isReflect ?? false;
    this.isLightScreen = config?.isLightScreen ?? false;
    this.isAuroraVeil = config?.isAuroraVeil ?? false;
    this.isProtected = config?.isProtected ?? false;
    this.isSR = config?.isSR ?? false;
    this.spikes = config?.spikes ?? 0;
    this.isHelpingHand = config?.isHelpingHand ?? false;
    this.isTailwind = config?.isTailwind ?? false;
    this.isFriendGuard = config?.isFriendGuard ?? false;
    this.isBattery = config?.isBattery ?? false;
    this.isPowerSpot = config?.isPowerSpot ?? false;
    this.isFlowerGift = config?.isFlowerGift ?? false;
    this.isSteelySpirit = config?.isSteelySpirit ?? false;
    this.isSwitching = config?.isSwitching;
    this.isSeeded = config?.isSeeded ?? false;
    this.isSaltCured = config?.isSaltCured ?? false;
  }

  clone(): Side {
    return new Side({
      isReflect: this.isReflect,
      isLightScreen: this.isLightScreen,
      isAuroraVeil: this.isAuroraVeil,
      isProtected: this.isProtected,
      isSR: this.isSR,
      spikes: this.spikes,
      isHelpingHand: this.isHelpingHand,
      isTailwind: this.isTailwind,
      isFriendGuard: this.isFriendGuard,
      isBattery: this.isBattery,
      isPowerSpot: this.isPowerSpot,
      isFlowerGift: this.isFlowerGift,
      isSteelySpirit: this.isSteelySpirit,
      isSwitching: this.isSwitching,
      isSeeded: this.isSeeded,
      isSaltCured: this.isSaltCured,
    });
  }
}

export class Field {
  readonly gameType: GameType;
  readonly weather: Weather | undefined;
  readonly terrain: Terrain | undefined;
  readonly isGravity: boolean;
  readonly isAuraBreak: boolean;
  readonly isFairyAura: boolean;
  readonly isDarkAura: boolean;
  readonly isBeadsOfRuin: boolean;
  readonly isTabletsOfRuin: boolean;
  readonly isSwordOfRuin: boolean;
  readonly isVesselOfRuin: boolean;
  readonly attackerSide: Side;
  readonly defenderSide: Side;

  constructor(config?: FieldConfig) {
    this.gameType = config?.gameType ?? 'Doubles';
    this.weather = config?.weather;
    this.terrain = config?.terrain;
    this.isGravity = config?.isGravity ?? false;
    this.isAuraBreak = config?.isAuraBreak ?? false;
    this.isFairyAura = config?.isFairyAura ?? false;
    this.isDarkAura = config?.isDarkAura ?? false;
    this.isBeadsOfRuin = config?.isBeadsOfRuin ?? false;
    this.isTabletsOfRuin = config?.isTabletsOfRuin ?? false;
    this.isSwordOfRuin = config?.isSwordOfRuin ?? false;
    this.isVesselOfRuin = config?.isVesselOfRuin ?? false;
    this.attackerSide = new Side(config?.attackerSide);
    this.defenderSide = new Side(config?.defenderSide);
  }

  /** Is this a doubles battle? */
  isDoubles(): boolean {
    return this.gameType === 'Doubles';
  }

  /** Check if effective weather is active (respecting Cloud Nine / Air Lock). */
  effectiveWeather(): Weather | undefined {
    // TODO: check for Cloud Nine / Air Lock on active pokemon
    return this.weather;
  }

  clone(): Field {
    return new Field({
      gameType: this.gameType,
      weather: this.weather,
      terrain: this.terrain,
      isGravity: this.isGravity,
      isAuraBreak: this.isAuraBreak,
      isFairyAura: this.isFairyAura,
      isDarkAura: this.isDarkAura,
      isBeadsOfRuin: this.isBeadsOfRuin,
      isTabletsOfRuin: this.isTabletsOfRuin,
      isSwordOfRuin: this.isSwordOfRuin,
      isVesselOfRuin: this.isVesselOfRuin,
      attackerSide: this.attackerSide,
      defenderSide: this.defenderSide,
    });
  }
}
