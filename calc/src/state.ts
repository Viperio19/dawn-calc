import type * as I from './data/interface';

export namespace State {
  export interface Pokemon {
    name: I.SpeciesName;
    level?: number;
    ability?: I.AbilityName;
    abilityOn?: boolean;
    isDynamaxed?: boolean;
    dynamaxLevel?: number;
    isStarstruck?: boolean;
    isLockOn?: boolean;
    corrosiveBond?: boolean;
    gritStages?: number;
    alliesFainted?: number;
    boostedStat?: I.StatIDExceptHP | 'auto';
    foesFainted?: number;
    relicanthTurns?: number;
    item?: I.ItemName;
    gender?: I.GenderName;
    nature?: I.NatureName;
    ivs?: Partial<I.StatsTable>;
    evs?: Partial<I.StatsTable>;
    boosts?: Partial<I.StatsTable>;
    originalCurHP?: number;
    status?: I.StatusName | '';
    teraType?: I.TypeName;
    toxicCounter?: number;
    moves?: I.MoveName[];
    overrides?: Partial<I.Specie>;
  }

  export interface Move {
    name: I.MoveName;
    useZ?: boolean;
    useMax?: boolean;
    isCrit?: boolean;
    isStellarFirstUse?: boolean;
    hits?: number;
    timesUsed?: number;
    timesUsedWithMetronome?: number;
    stockpiles?: number;
    moveSlot?: number;
    overrides?: Partial<I.Move>;
  }

  export interface Field {
    gameType: I.GameType;
    weather?: I.Weather;
    terrain?: I.Terrain;
    chromaticField?: string;
    isMagicRoom?: boolean;
    isWonderRoom?: boolean;
    isGravity?: boolean;
    isAuraBreak?: boolean;
    isFairyAura?: boolean;
    isDarkAura?: boolean;
    isBeadsOfRuin?: boolean;
    isSwordOfRuin?: boolean;
    isTabletsOfRuin?: boolean;
    isVesselOfRuin?: boolean;
    attackerSide: Side;
    defenderSide: Side;
  }

  export interface Side {
    spikes?: number;
    steelsurge?: boolean;
    vinelash?: boolean;
    wildfire?: boolean;
    cannonade?: boolean;
    volcalith?: boolean;
    isSR?: boolean;
    isReflect?: boolean;
    isLightScreen?: boolean;
    isStickyWeb?: boolean;
    isProtected?: boolean;
    isSeeded?: boolean;
    isIngrain?: boolean;
    isAquaRing?: boolean;
    isNightmare?: boolean;
    isSaltCured?: boolean;
    isForesight?: boolean;
    isSoak?: boolean;
    isTailwind?: boolean;
    isMagnetRise?: boolean;
    isHelpingHand?: boolean;
    isFlowerGift?: boolean;
    isFriendGuard?: boolean;
    isAuroraVeil?: boolean;
    isAreniteWall?: boolean;
    isBattery?: boolean;
    isPowerSpot?: boolean;
    isSteelySpirit?: boolean;
    isSwitching?: 'out' | 'in';
  }
}
