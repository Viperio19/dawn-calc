import type { Generation, MoveCategory, NatureName, StatID, StatsTable, TypeName, Weather } from '../data/interface';
import type { Field, Side } from '../field';
import type { Move } from '../move';
import type { Pokemon } from '../pokemon';
import type { RawDesc } from '../desc';
export declare function isGrounded(pokemon: Pokemon, field: Field): boolean;
export declare function getModifiedStat(stat: number, mod: number, gen?: Generation): number;
export declare function computeFinalStats(gen: Generation, attacker: Pokemon, defender: Pokemon, field: Field, ...stats: StatID[]): void;
export declare function getFinalSpeed(gen: Generation, pokemon: Pokemon, field: Field, side: Side): number;
export declare function getMoveEffectiveness(gen: Generation, move: Move, type: TypeName, field: Field, isGhostRevealed?: boolean, isGravity?: boolean, isRingTarget?: boolean): number;
export declare function checkAirLock(pokemon: Pokemon, field: Field): void;
export declare function checkTeraformZero(pokemon: Pokemon, field: Field): void;
export declare function checkForecast(pokemon: Pokemon, weather?: Weather): void;
export declare function checkItem(pokemon: Pokemon, magicRoomActive?: boolean): void;
export declare function checkWonderRoom(pokemon: Pokemon, wonderRoomActive?: boolean): void;
export declare function checkIntimidate(gen: Generation, source: Pokemon, target: Pokemon, field: Field): void;
export declare function checkDownload(source: Pokemon, target: Pokemon, wonderRoomActive?: boolean): void;
export declare function checkIntrepidSword(source: Pokemon, gen: Generation): void;
export declare function checkDauntlessShield(source: Pokemon, gen: Generation): void;
export declare function checkCrestBoosts(source: Pokemon): void;
export declare function checkFieldBoosts(source: Pokemon, field: Field): void;
export declare function checkWindRider(source: Pokemon, attackingSide: Side): void;
export declare function checkEmbody(source: Pokemon, gen: Generation): void;
export declare function checkInfiltrator(pokemon: Pokemon, affectedSide: Side): void;
export declare function checkSeedBoost(pokemon: Pokemon, field: Field): void;
export declare function checkMultihitBoost(gen: Generation, attacker: Pokemon, defender: Pokemon, move: Move, field: Field, desc: RawDesc, attackerUsedItem?: boolean, defenderUsedItem?: boolean): boolean[];
export declare function chainMods(mods: number[], lowerBound: number, upperBound: number): number;
export declare function getBaseDamage(level: number, basePower: number, attack: number, defense: number): number;
export declare function getQPBoostedStat(pokemon: Pokemon, gen?: Generation): StatID;
export declare function isQPActive(pokemon: Pokemon, field: Field): boolean;
export declare function getFinalDamage(baseAmount: number, i: number, effectiveness: number, isBurned: boolean, stabMod: number, finalMod: number, protect?: boolean): number;
export declare function getShellSideArmCategory(source: Pokemon, target: Pokemon): MoveCategory;
export declare function getWeight(pokemon: Pokemon, desc: RawDesc, role: 'defender' | 'attacker'): number;
export declare function getStabMod(pokemon: Pokemon, move: Move, desc: RawDesc): number;
export declare function getStellarStabMod(pokemon: Pokemon, move: Move, stabMod?: number, turns?: number): number;
export declare function countBoosts(gen: Generation, boosts: StatsTable): number;
export declare function getStatDescriptionText(gen: Generation, pokemon: Pokemon, stat: StatID, natureName?: NatureName): string;
export declare function handleFixedDamageMoves(attacker: Pokemon, move: Move): number;
export declare function pokeRound(num: number): number;
export declare function OF16(n: number): number;
export declare function OF32(n: number): number;
export declare function getMimicryType(field: Field): TypeName;
