import type {State} from './state';
import type {GameType, Weather, Terrain} from './data/interface';

export class Field implements State.Field {
  gameType: GameType;
  weather?: Weather;
  terrain?: Terrain;
  chromaticField?: string;
  isMagicRoom: boolean;
  isWonderRoom: boolean;
  isGravity: boolean;
  isAuraBreak?: boolean;
  isFairyAura?: boolean;
  isDarkAura?: boolean;
  isBeadsOfRuin?: boolean;
  isSwordOfRuin?: boolean;
  isTabletsOfRuin?: boolean;
  isVesselOfRuin?: boolean;
  attackerSide: Side;
  defenderSide: Side;

  constructor(field: Partial<State.Field> = {}) {
    this.gameType = field.gameType || 'Singles';
    this.terrain = field.terrain;
    this.chromaticField = field.chromaticField;
    this.weather = field.weather;
    this.isMagicRoom = !!field.isMagicRoom;
    this.isWonderRoom = !!field.isWonderRoom;
    this.isGravity = !!field.isGravity;
    this.isAuraBreak = field.isAuraBreak || false;
    this.isFairyAura = field.isFairyAura || false;
    this.isDarkAura = field.isDarkAura || false;
    this.isBeadsOfRuin = field.isBeadsOfRuin || false;
    this.isSwordOfRuin = field.isSwordOfRuin || false;
    this.isTabletsOfRuin = field.isTabletsOfRuin || false;
    this.isVesselOfRuin = field.isVesselOfRuin || false;

    this.attackerSide = new Side(field.attackerSide || {});
    this.defenderSide = new Side(field.defenderSide || {});
  }

  hasWeather(...weathers: Weather[]) {
    return !!(this.weather && weathers.includes(this.weather));
  }

  hasTerrain(...terrains: Terrain[]) {
    return !!(this.terrain && terrains.includes(this.terrain));
  }

  swap() {
    [this.attackerSide, this.defenderSide] = [this.defenderSide, this.attackerSide];
    return this;
  }

  clone() {
    return new Field({
      gameType: this.gameType,
      weather: this.weather,
      terrain: this.terrain,
      chromaticField: this.chromaticField,
      isMagicRoom: this.isMagicRoom,
      isWonderRoom: this.isWonderRoom,
      isGravity: this.isGravity,
      attackerSide: this.attackerSide,
      defenderSide: this.defenderSide,
      isAuraBreak: this.isAuraBreak,
      isDarkAura: this.isDarkAura,
      isFairyAura: this.isFairyAura,
      isBeadsOfRuin: this.isBeadsOfRuin,
      isSwordOfRuin: this.isSwordOfRuin,
      isTabletsOfRuin: this.isTabletsOfRuin,
      isVesselOfRuin: this.isVesselOfRuin,
    });
  }
}

export class Side implements State.Side {
  spikes: number;
  steelsurge: boolean;
  vinelash: boolean;
  wildfire: boolean;
  cannonade: boolean;
  volcalith: boolean;
  isSR: boolean;
  isReflect: boolean;
  isLightScreen: boolean;
  isStickyWeb: boolean;
  isProtected: boolean;
  isIngrain: boolean;
  isAquaRing: boolean;
  isSeeded: boolean;
  isNightmare: boolean;
  isSaltCured: boolean;
  isForesight: boolean;
  isSoak: boolean;
  isTailwind: boolean;
  isMagnetRise: boolean;
  isHelpingHand: boolean;
  isFlowerGift: boolean;
  isFriendGuard: boolean;
  isAuroraVeil: boolean;
  isAreniteWall: boolean;
  isBattery: boolean;
  isPowerSpot: boolean;
  isSteelySpirit: boolean;
  isSwitching?: 'out' | 'in';

  constructor(side: State.Side = {}) {
    this.spikes = side.spikes || 0;
    this.steelsurge = !!side.steelsurge;
    this.vinelash = !!side.vinelash;
    this.wildfire = !!side.wildfire;
    this.cannonade = !!side.cannonade;
    this.volcalith = !!side.volcalith;
    this.isSR = !!side.isSR;
    this.isReflect = !!side.isReflect;
    this.isLightScreen = !!side.isLightScreen;
    this.isStickyWeb = !!side.isStickyWeb;
    this.isProtected = !!side.isProtected;
    this.isIngrain = !!side.isIngrain;
    this.isAquaRing = !!side.isAquaRing;
    this.isSeeded = !!side.isSeeded;
    this.isNightmare = !!side.isNightmare;
    this.isSaltCured = !!side.isSaltCured;
    this.isForesight = !!side.isForesight;
    this.isSoak = !!side.isSoak;
    this.isTailwind = !!side.isTailwind;
    this.isMagnetRise = !!side.isMagnetRise;
    this.isHelpingHand = !!side.isHelpingHand;
    this.isFlowerGift = !!side.isFlowerGift;
    this.isFriendGuard = !!side.isFriendGuard;
    this.isAuroraVeil = !!side.isAuroraVeil;
    this.isAreniteWall = !!side.isAreniteWall;
    this.isBattery = !!side.isBattery;
    this.isPowerSpot = !!side.isPowerSpot;
    this.isSteelySpirit = !!side.isSteelySpirit;
    this.isSwitching = side.isSwitching;
  }

  clone() {
    return new Side(this);
  }
}
