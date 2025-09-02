import type {Generation, Weather, Terrain, TypeName, ID} from './data/interface';
import type {Field, Side} from './field';
import type {Move} from './move';
import type {Pokemon} from './pokemon';
import {type Damage, damageRange, multiDamageRange} from './result';
import {error} from './util';
// NOTE: This needs to come last to simplify bundling
import {isGrounded} from './mechanics/util';

export interface RawDesc {
  HPEVs?: string;
  attackBoost?: number;
  attackEVs?: string;
  attackerAbility?: string;
  attackerItem?: string;
  attackerName: string;
  attackerTera?: string;
  defenderAbility?: string;
  defenderItem?: string;
  defenderName: string;
  defenderTera?: string;
  defenseBoost?: number;
  defenseEVs?: string;
  hits?: number;
  alliesFainted?: number;
  foesFainted?: number;
  relicanthTurnsAttack?: number;
  relicanthTurnsDefense?: number;
  isStellarFirstUse?: boolean;
  isBeadsOfRuin?: boolean;
  isSwordOfRuin?: boolean;
  isTabletsOfRuin?: boolean;
  isVesselOfRuin?: boolean;
  isAuroraVeil?: boolean;
  isAreniteWall?: boolean;
  isFlowerGiftAttacker?: boolean;
  isFlowerGiftDefender?: boolean;
  isSteelySpiritAttacker?: boolean;
  isFriendGuard?: boolean;
  isHelpingHand?: boolean;
  isCritical?: boolean;
  isLightScreen?: boolean;
  isBurned?: boolean;
  isProtected?: boolean;
  isReflect?: boolean;
  isBattery?: boolean;
  isPowerSpot?: boolean;
  isWonderRoom?: boolean;
  isSwitching?: 'out' | 'in';
  moveBP?: number;
  moveName: string;
  moveTurns?: string;
  moveType?: TypeName;
  moveType2?: TypeName;
  rivalry?: 'buffed' | 'nerfed';
  terrain?: Terrain;
  chromaticField?: string;
  fieldCondition?: string;
  gritStages?: number;
  weather?: Weather;
  subWeather?: string;
  isMagnetRise?: boolean;
  isAttackerSoak?: boolean;
  isDefenderSoak?: boolean;
  isDefenderDynamaxed?: boolean;
  defenderType?: string;
  attackerType?: string;
  mirrorBeamType?: string;
  moveSlot?: number;
}

export function display(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  damage: Damage,
  rawDesc: RawDesc,
  notation = '%',
  err = true
) {
  const [min, max] = damageRange(damage);

  const minDisplay = toDisplay(notation, min, defender.maxHP());
  const maxDisplay = toDisplay(notation, max, defender.maxHP());

  const desc = buildDescription(rawDesc, attacker, defender);
  const damageText = `${min}-${max} (${minDisplay} - ${maxDisplay}${notation})`;

  if (move.category === 'Status' && !move.named('Nature Power')) return `${desc}: ${damageText}`;
  const koChanceText = getKOChance(gen, attacker, defender, move, field, damage, err).text;
  return koChanceText ? `${desc}: ${damageText} -- ${koChanceText}` : `${desc}: ${damageText}`;
}

export function displayMove(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  damage: Damage,
  field: Field,
  notation = '%'
) {
  const [min, max] = damageRange(damage);

  const minDisplay = toDisplay(notation, min, defender.maxHP());
  const maxDisplay = toDisplay(notation, max, defender.maxHP());

  const recoveryText = getRecovery(gen, attacker, defender, move, damage, field, notation).text;
  const recoilText = getRecoil(gen, attacker, defender, move, damage, field, notation).text;

  return `${minDisplay} - ${maxDisplay}${notation}${recoveryText &&
    ` (${recoveryText})`}${recoilText && ` (${recoilText})`}`;
}

export function getRecovery(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  damage: Damage,
  field: Field,
  notation = '%'
) {
  const [minDamage, maxDamage] = damageRange(damage);
  let minD;
  let maxD;
  if (move.timesUsed && move.timesUsed > 1) {
    [minD, maxD] = multiDamageRange(damage) as [number[], number[]];
  } else {
    minD = [minDamage];
    maxD = [maxDamage];
  }

  const recovery = [0, 0] as [number, number];
  let text = '';

  const ignoresShellBell =
    gen.num === 3 && move.named('Doom Desire', 'Future Sight');
  if (attacker.hasItem('Shell Bell') && !ignoresShellBell) {
    for (let i = 0; i < minD.length; i++) {
      recovery[0] += minD[i] > 0 ? Math.max(Math.round(minD[i] / 8), 1) : 0;
      recovery[1] += maxD[i] > 0 ? Math.max(Math.round(maxD[i] / 8), 1) : 0;
    }
    // This is incorrect if the opponent heals during your damage
    // Ex: Sitrus Berry procs in the middle of multi-hit move
    const maxHealing = Math.round(defender.curHP() / 8);
    recovery[0] = Math.min(recovery[0], maxHealing);
    recovery[1] = Math.min(recovery[1], maxHealing);
  }

  if (move.named('G-Max Finale')) {
    recovery[0] += Math.round(attacker.maxHP() / 6);
    recovery[1] += Math.round(attacker.maxHP() / 6);
  }

  if (move.named('Pain Split')) {
    const average = Math.floor((attacker.curHP() + defender.curHP()) / 2);
    recovery[0] = recovery[1] = average - attacker.curHP();
  }

  // Parental Bond counts as multiple heals for drain moves, but not for Shell Bell
  // Currently no drain moves are multihit, however this covers for it.
  if (attacker.hasAbility('Parental Bond') || move.hits > 1) {
    [minD, maxD] = multiDamageRange(damage) as [number[], number[]];
  }

  if (move.drain) {
    const percentHealed = move.drain[0] / move.drain[1];
    const max = Math.round(defender.curHP() * percentHealed);
    for (let i = 0; i < minD.length; i++) {
      const range = [minD[i], maxD[i]];
      for (const j in recovery) {
        let drained = Math.max(Math.round(range[j] * percentHealed), 1);
        if (attacker.hasItem('Big Root') || attacker.named('Shiinotic-Crest')) drained = Math.trunc(drained * 5324 / 4096); // Shiinotic Crest - Draining effect recovery is boosted by 30%
        recovery[j] += Math.min(drained, max);
      }
    }
  }

  // Ring Arena - Grit Stage Effects: 2 - After an attack, the Pokemon gains 1/6 of the damage in HP dealt to other Pokemon
  if (attacker.gritStages && attacker.gritStages >= 2) {
    const percentHealed = 1 / 6;
    const max = Math.round(defender.maxHP() * percentHealed);
    for (let i = 0; i < minD.length; i++) {
      const range = [minD[i], maxD[i]];
      for (const j in recovery) {
        let drained = Math.max(Math.round(range[j] * percentHealed), 1);
        recovery[j] += Math.min(drained, max);
      }
    }
  }

  // Ashen Beach - Scorching Sands recovers 50% of damage dealt
  if (field.chromaticField === 'Ashen-Beach' && move.named('Scorching Sands')) {
    const percentHealed = 1 / 2;
    const max = Math.round(defender.maxHP() * percentHealed);
    for (let i = 0; i < minD.length; i++) {
      const range = [minD[i], maxD[i]];
      for (const j in recovery) {
        let drained = Math.max(Math.round(range[j] * percentHealed), 1);
        recovery[j] += Math.min(drained, max);
      }
    }
  }

  // Crests - Draining

  if ((attacker.named('Dusknoir-Crest') && move.named('Shadow Punch')) || attacker.named('Gothitelle-Crest-Dark')) {
    let tempPercentHealed = 0;
    // Dusknoir Crest - Shadow Punch heals for 50% of the damage dealt
    if (attacker.named('Dusknoir-Crest')) {
      tempPercentHealed = 0.5;
    // Gothitelle Crest - Drain 25% of damage dealt when dark
    } else if (attacker.named('Gothitelle-Crest-Dark')) {
      tempPercentHealed = 0.25;
    }
    const percentHealed = tempPercentHealed;
    const max = Math.round(defender.maxHP() * percentHealed);
    for (let i = 0; i < minD.length; i++) {
      const range = [minD[i], maxD[i]];
      for (const j in recovery) {
        let drained = Math.max(Math.round(range[j] * percentHealed), 1);
        if (attacker.hasItem('Big Root')) drained = Math.trunc(drained * 5324 / 4096);
        recovery[j] += Math.min(drained, max);
      }
    }
  }

  if (recovery[1] === 0) return {recovery, text};

  const minHealthRecovered = toDisplay(notation, recovery[0], attacker.maxHP());
  const maxHealthRecovered = toDisplay(notation, recovery[1], attacker.maxHP());
  const change = recovery[0] > 0 ? 'recovered' : 'lost';
  text = `${minHealthRecovered} - ${maxHealthRecovered}${notation} ${change}`;

  return {recovery, text};
}

// TODO: return recoil damage as exact HP
export function getRecoil(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  damage: Damage,
  field: Field,
  notation = '%'
) {
  const [min, max] = damageRange(damage);

  let recoil: [number, number] | number = [0, 0];
  let text = '';

  const damageOverflow = min > defender.curHP() || max > defender.curHP();
  if (move.recoil || defender.named('Bastiodon-Crest') || (move.named('Megahorn') && field.chromaticField === 'Undercolony')) {
    let tempMod = 0;
    
    if (move.recoil) {
      tempMod += (move.recoil[0] / move.recoil[1]) * 100;
    }

    // Bastiodon Crest - Deals 50% of all damage it takes as recoil to the attacker
    if (defender.named('Bastiodon-Crest')) {
      tempMod += 50;
    }

    // Undercolony - Megahorn is now 100% accurate, but user takes 1/3 recoil damage
    if (move.named('Megahorn') && field.chromaticField === 'Undercolony') {
      tempMod += (1 / 3) * 100;
    }

    const mod = tempMod;

    let minRecoilDamage, maxRecoilDamage;
    if (damageOverflow) {
      minRecoilDamage =
        toDisplay(notation, defender.curHP() * mod, attacker.maxHP(), 100);
      maxRecoilDamage =
        toDisplay(notation, defender.curHP() * mod, attacker.maxHP(), 100);
    } else {
      minRecoilDamage = toDisplay(
        notation, Math.min(min, defender.curHP()) * mod, attacker.maxHP(), 100
      );
      maxRecoilDamage = toDisplay(
        notation, Math.min(max, defender.curHP()) * mod, attacker.maxHP(), 100
      );
    }
    if (!attacker.hasAbility('Rock Head') && !attacker.named('Rampardos-Crest')) {
      recoil = [minRecoilDamage, maxRecoilDamage];
      text = `${minRecoilDamage} - ${maxRecoilDamage}${notation} recoil damage`;
    }
  } else if (move.hasCrashDamage) {
    const genMultiplier = gen.num === 2 ? 12.5 : gen.num >= 3 ? 50 : 1;

    let minRecoilDamage, maxRecoilDamage;
    if (damageOverflow && gen.num !== 2) {
      minRecoilDamage =
        toDisplay(notation, defender.curHP() * genMultiplier, attacker.maxHP(), 100);
      maxRecoilDamage =
        toDisplay(notation, defender.curHP() * genMultiplier, attacker.maxHP(), 100);
    } else {
      minRecoilDamage = toDisplay(
        notation, Math.min(min, defender.maxHP()) * genMultiplier, attacker.maxHP(), 100
      );
      maxRecoilDamage = toDisplay(
        notation, Math.min(max, defender.maxHP()) * genMultiplier, attacker.maxHP(), 100
      );
    }

    recoil = [minRecoilDamage, maxRecoilDamage];
    switch (gen.num) {
    case 1:
      recoil = toDisplay(notation, 1, attacker.maxHP());
      text = '1hp damage on miss';
      break;
    case 2: case 3: case 4:
      if (defender.hasType('Ghost')) {
        if (gen.num === 4) {
          const gen4CrashDamage = Math.floor(((defender.maxHP() * 0.5) / attacker.maxHP()) * 100);
          recoil = notation === '%' ? gen4CrashDamage : Math.floor((gen4CrashDamage / 100) * 48);
          text = `${gen4CrashDamage}% crash damage`;
        } else {
          recoil = 0;
          text = 'no crash damage on Ghost types';
        }
      } else {
        text = `${minRecoilDamage} - ${maxRecoilDamage}${notation} crash damage on miss`;
      }
      break;
    default:
      recoil = notation === '%' ? 24 : 50;
      text = '50% crash damage';
    }
  } else if (move.struggleRecoil) {
    recoil = notation === '%' ? 12 : 25;
    text = '25% struggle damage';
    // Struggle recoil is actually rounded down in Gen 4 per DaWoblefet's research, but until we
    // return recoil damage as exact HP the best we can do is add some more text to this effect
    if (gen.num === 4) text += ' (rounded down)';
  } else if (move.mindBlownRecoil) {
    recoil = notation === '%' ? 24 : 50;
    text = '50% recoil damage';
  }

  return {recoil, text};
}

export function getKOChance(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  damageObj: Damage,
  err = true
) {
  const [damage, approximate] = combine(damageObj);
  if (isNaN(damage[0])) {
    error(err, 'damage[0] must be a number.');
    return {chance: 0, n: 0, text: ''};
  }
  if (damage[damage.length - 1] === 0) {
    error(err, 'damage[damage.length - 1] === 0.');
    return {chance: 0, n: 0, text: ''};
  }

  // Code doesn't really work if these aren't set.
  if (move.timesUsed === undefined) move.timesUsed = 1;
  if (move.timesUsedWithMetronome === undefined) move.timesUsedWithMetronome = 1;
  if (move.stockpiles === undefined) move.stockpiles = 0;
  if (move.moveSlot === undefined) move.moveSlot = 1;

  if (damage[0] >= defender.maxHP() && move.timesUsed === 1 && move.timesUsedWithMetronome === 1) {
    return {chance: 1, n: 1, text: 'guaranteed OHKO'};
  }

  const hazards = getHazards(gen, defender, field.defenderSide, field);
  const eot = getEndOfTurn(gen, attacker, defender, move, field);
  const toxicCounter =
    defender.hasStatus('tox') &&
    !(defender.hasAbility('Magic Guard', 'Poison Heal') ||
     (defender.named('Zangoose-Crest')) || // Zangoose Crest - Grants Poison Heal
     (defender.hasAbility('Shield Dust') && field.chromaticField === 'Jungle') || // Jungle - Shield Dust grants Magic Guard
     (defender.named('Flareon') && field.chromaticField === 'Rainbow') || // Rainbow - Flareon gets Magic Guard
     (field.chromaticField === 'Corrosive-Mist' && (defender.hasAbility('Toxic Chain', 'Poison Touch', 'Flash Fire') || // Corrosive Mist - Toxic Chain, Poison Touch, and Flash Fire grant Poison Heal / detonation clears status
      move.named('Sludge Bomb', 'Temper Flare', 'Heat Wave')))) ? defender.toxicCounter : 0;

  // multi-hit moves have too many possibilities for brute-forcing to work, so reduce it
  // to an approximate distribution if greater than 3 hits
  const qualifier = approximate ? 'approx. ' : '';

  const hazardsText = hazards.texts.length > 0
    ? ' after ' + serializeText(hazards.texts)
    : '';
  const afterText =
    hazards.texts.length > 0 || eot.texts.length > 0
      ? ' after ' + serializeText(hazards.texts.concat(eot.texts))
      : '';
  const afterTextNoHazards = eot.texts.length > 0 ? ' after ' + serializeText(eot.texts) : '';

  function roundChance(chance: number) {
    // prevent displaying misleading 100% or 0% chances
    return Math.max(Math.min(Math.round(chance * 1000), 999), 1) / 10;
  }

  function KOChance(
    chanceWithoutEot: number | undefined,
    chanceWithEot: number | undefined,
    n: number,
    multipleTurns = false,
  ) {
    // chanceWithoutEot and chanceWithEot are calculated separately for OHKOs
    // because the difference between KOing at start of turn is very important in some cases
    // for 2HKOs and onward, only chanceWithEot is calculated,
    // so chanceWithoutEot will be set to 0 for the purposes of this function
    // all this really does is skip straight to that last else if block
    // using the number of hits we can determine the type of KO we are checking for
    // chance is the value that is returned by this function,
    // and is the higher of the two chance parameters
    const KOTurnText = n === 1 ? 'OHKO'
      : (multipleTurns ? `KO in ${n} turns` : `${n}HKO`);
    let text = qualifier;
    let chance = undefined;
    if (chanceWithoutEot === undefined || chanceWithEot === undefined) {
      text += `possible ${KOTurnText}`;
      // not a KO
    } else if (chanceWithoutEot + chanceWithEot === 0) {
      chance = 0;
      text += 'not a KO';
      // if the move OHKOing is guaranteed even without end of turn damage
    } else if (chanceWithoutEot === 1) {
      chance = chanceWithoutEot;
      text = 'guaranteed ';
      text += `OHKO${hazardsText}`;
    } else if (chanceWithoutEot > 0) {
      chance = chanceWithEot;
      // if the move OHKOing is possible, but eot damage guarantees the OHKO
      // I have it so that the text specifies the chance of the OHKO without eot damage,
      // because it might matter in some scenarios
      // eg. if your opponent has a move that can OHKO you but you're faster,
      // it might be important to get the OKKO before they can move
      if (chanceWithEot === 1) {
        text += `${roundChance(chanceWithoutEot)}% chance to ${KOTurnText}${hazardsText} ` +
          `(guaranteed ${KOTurnText}${afterTextNoHazards})`;
        // if the move OHKOing is possible, and eot damage increases the odds of the KO
      } else if (chanceWithEot > chanceWithoutEot) {
        text += `${roundChance(chanceWithoutEot)}% chance to ${KOTurnText}${hazardsText} ` +
          `(${qualifier}${roundChance(chanceWithEot)}% chance to ` +
          `${KOTurnText}${afterTextNoHazards})`;
        // if the move KOing is possible, and eot damage does not increase the odds of the KO
      } else if (chanceWithoutEot > 0) {
        text += `${roundChance(chanceWithoutEot)}% chance to ${KOTurnText}${hazardsText}`;
      }
    } else if (chanceWithoutEot === 0) {
      chance = chanceWithEot;
      // if the move KOing is not possible, but eot damage guarantees the OHKO
      if (chanceWithEot === 1) {
        text = 'guaranteed ';
        text += `${KOTurnText}${afterText}`;
        // if the move KOing is not possible, but eot damage might KO
      } else if (chanceWithEot > 0) {
        text += `${roundChance(chanceWithEot)}% chance to ${KOTurnText}${afterText}`;
      }
    }
    return {chance, n, text};
  }

  if ((move.timesUsed === 1 && move.timesUsedWithMetronome === 1) || move.isZ) {
    const chance = computeKOChance(
      damage, defender.curHP() - hazards.damage, 0, 1, 1, defender.maxHP(), 0
    );
    const chanceWithEot = computeKOChance(
      damage, defender.curHP() - hazards.damage, eot.damage, 1, 1, defender.maxHP(), toxicCounter
    );

    // checks if either chance is greater than 0
    if (chance + chanceWithEot > 0) return KOChance(chance, chanceWithEot, 1);

    for (let i = 2; i <= 4; i++) {
      const chance = computeKOChance(
        damage, defender.curHP() - hazards.damage, eot.damage, i, 1, defender.maxHP(), toxicCounter
      );
      if (chance > 0) return KOChance(0, chance, i);
    }

    for (let i = 5; i <= 9; i++) {
      if (
        predictTotal(damage[0], eot.damage, i, 1, toxicCounter, defender.maxHP()) >=
        defender.curHP() - hazards.damage
      ) {
        return KOChance(0, 1, i);
      } else if (
        predictTotal(damage[damage.length - 1], eot.damage, i, 1, toxicCounter, defender.maxHP()) >=
        defender.curHP() - hazards.damage
      ) {
        // possible but no concrete chance
        return KOChance(undefined, undefined, i);
      }
    }
  } else {
    const chance = computeKOChance(
      damage, defender.maxHP() - hazards.damage,
      eot.damage,
      move.hits || 1,
      move.timesUsed || 1,
      defender.maxHP(),
      toxicCounter
    );
    if (chance > 0) return KOChance(0, chance, move.timesUsed, chance === 1);

    if (predictTotal(
      damage[0],
      eot.damage,
      1,
      move.timesUsed,
      toxicCounter,
      defender.maxHP()
    ) >=
      defender.curHP() - hazards.damage
    ) {
      return KOChance(0, 1, move.timesUsed, true);
    } else if (
      predictTotal(
        damage[damage.length - 1],
        eot.damage,
        1,
        move.timesUsed,
        toxicCounter,
        defender.maxHP()
      ) >=
      defender.curHP() - hazards.damage
    ) {
      // possible but no real idea
      return KOChance(undefined, undefined, move.timesUsed, true);
    }
    return KOChance(0, 0, move.timesUsed);
  }

  return {chance: 0, n: 0, text: ''};
}

function combine(damage: Damage): [number[], boolean] {
  // Fixed Damage
  if (typeof damage === 'number') return [[damage], false];

  // Standard Damage (16 or 39 rolls)
  if (damage.length >= 16 && typeof damage[0] === 'number') {
    return [damage as number[], false];
  }
  // Fixed Multi-hit Damage (currently only parental bond)
  if (typeof damage[0] === 'number' && typeof damage[1] === 'number') {
    return [[damage[0] + damage[1]], false];
  }
  // Multi-hit Damage

  // Reduce Distribution to be at most 256 elements, maintains min and max
  function reduce(dist: number[], scaleValue: number): number[] {
    // should always be 16^2 or 39^2
    const new_length = dist.length / scaleValue;
    const reduced = [];
    reduced[0] = dist[0];
    reduced[new_length - 1] = dist[dist.length - 1];
    for (let i = 1; i < new_length - 1; i++) {
      reduced[i] = dist[Math.round(i * scaleValue + scaleValue / 2)];
    }
    return reduced;
  }

  function combineTwo(dist1: number[], dist2: number[]): number[] {
    const combined = dist1.flatMap(val1 => dist2.map(val2 => val1 + val2)).sort((a, b) => a - b);
    return combined;
  }

  // Combine n distributions to return an approximation of sum
  // Perfectly accurate for <= 3 hits, within 1% otherwise (Max 0.5% off for 7 hits)
  function combineDistributions(dists: number[][]): [number[], boolean] {
    let combined = [0];
    const numRolls = dists[0].length;
    // Usually returns numRolls^2 values, but allow for perfect accuracy for exactly 3 hits
    const numAccuracy = (numRolls === 16 && dists.length === 3) ? 3 : 2;
    let approximate = false;
    for (let i = 0; i < dists.length; i++) {
      const distribution = dists[i];
      combined = combineTwo(combined, distribution);
      if (i >= numAccuracy) {
        combined = reduce(combined, distribution.length);
        approximate = true;
      }
    }
    return [combined, approximate];
  }

  const d = damage as number[][];
  return combineDistributions(d);
}

const TRAPPING = [
  'Bind', 'Clamp', 'Fire Spin', 'Infestation', 'Magma Storm', 'Sand Tomb',
  'Thunder Cage', 'Whirlpool', 'Wrap', 'G-Max Sandblast', 'G-Max Centiferno',
];

function getHazards(gen: Generation, defender: Pokemon, defenderSide: Side, field: Field) {
  let damage = 0;
  const texts: string[] = [];

  const defenderGrounded = defenderSide.isIngrain || defender.hasItem('Iron Ball') ||
    (!defender.hasType('Flying') &&
    !defenderSide.isMagnetRise &&
    !(defender.hasAbility('Magnet Pull') && field.chromaticField === 'Cave') && // Cave - Magnet Pull grants Levitate
    !defender.hasAbility('Levitate', 'Lunar Idol', 'Solar Idol') && // Aevian - Solar/Lunar Idol: Immune to Ground-type moves
    !defender.hasItem('Air Balloon') &&
    !defender.named('Probopass-Crest')); // Probopass Crest - Grants Levitate

  // Acidic Wasteland - Hazards are consumed when set but regurgitate at the end of the turn as an attacking move
  if (field.chromaticField === 'Acidic-Wasteland') {
    // Acidic Wasteland - Regurgigated hazards: Stealth Rock applies double its normal effect
    if (defenderSide.isSR) {
      const rockType = gen.types.get('rock' as ID)!;
      let effectiveness =
        rockType.effectiveness[defender.types[0]]! *
        (defender.types[1] ? rockType.effectiveness[defender.types[1]]! : 1);
  
      if (defender.named('Torterra-Crest')) { // Torterra Crest - Inverse type effectiveness
        effectiveness = 1 / effectiveness; // No need to check for dividing by zero because nothing is immune to rock
      }

      damage += Math.floor((effectiveness * defender.maxHP()) / 4);
      texts.push('regurgitated Stealth Rock');    
    }
    // Acidic Wasteland - Regurgigated hazards: Spikes deal 33% of the Pokemon’s max HP; ignores Flying immunity
    if (defenderSide.spikes != 0) {
      damage += Math.floor(defender.maxHP() / 3);
      texts.push('regurgitated Spikes');
    }
  } else if (defender.hasItem('Heavy-Duty Boots') || defender.hasAbility('Magic Guard') ||
       (defender.hasAbility('Shield Dust') && field.chromaticField === 'Jungle') || // Jungle - Shield Dust grants Magic Guard
       (defender.named('Flareon') && field.chromaticField === 'Rainbow')) { // Rainbow - Flareon gains Magic Guard
      return {damage, texts};
  } else {
    if (defenderSide.isSR && !defender.hasAbility('Mountaineer') &&
        !(defender.hasType('Rock') && field.chromaticField === 'Undercolony') && // Undercolony - Rock types absorb Stealth Rocks
        !(defender.hasAbility('Sturdy') && field.chromaticField === 'Cave')) { // Cave - Sturdy grants immunity to Stealth Rocks
      const rockType = gen.types.get('rock' as ID)!;
      let effectiveness =
        defender.teraType && defender.teraType !== 'Stellar'
          ? rockType.effectiveness[defender.teraType]!
          : rockType.effectiveness[defender.types[0]]! *
            (defender.types[1] ? rockType.effectiveness[defender.types[1]]! : 1);

      // Glaceon Crest - Gives resistance to fighting and rock type moves
      if (defender.named('Glaceon-Crest') && effectiveness > 0.5) {
        effectiveness = 0.5;
      // Snowy Peaks - Stealth Rocks do neutral damage to Ice Types instead of Super Effective
      } else if (defender.hasType('Ice') && field.chromaticField === 'Snowy-Peaks') {
        effectiveness /= 2;
      }

      // Cave - Stealth Rocks do resisted damage to rock types
      if (defender.hasType('Rock') && field.chromaticField === 'Cave' && effectiveness > 0.5) {
        effectiveness = 0.5;
      }

      // XOR between Torterra-Crest and Inverse Field so they cancel each other out
      if ((defender.named('Torterra-Crest') && !(field.chromaticField === 'Inverse')) || // Torterra Crest - Inverse type effectiveness
          (!defender.named('Torterra-Crest') && (field.chromaticField === 'Inverse'))) { // Inverse - Inverse type effectiveness
        effectiveness = 1 / effectiveness; // No need to check for dividing by zero because nothing is immune to rock
      }
      
      // Undercolony - Shell Armor & Battle Armor makes user resist the Rock type
      if (field.chromaticField === 'Undercolony' && defender.hasAbility('Shell Armor', 'Battle Armor') && effectiveness > 0.5) {
        effectiveness = 0.5;
      }

      damage += Math.floor((effectiveness * defender.maxHP()) / 8);
      texts.push('Stealth Rock');
    }
    if (defenderSide.steelsurge && !defender.hasAbility('Mountaineer')) {
      const steelType = gen.types.get('steel' as ID)!;
      let effectiveness =
        defender.teraType && defender.teraType !== 'Stellar'
          ? steelType.effectiveness[defender.teraType]!
          : steelType.effectiveness[defender.types[0]]! *
            (defender.types[1] ? steelType.effectiveness[defender.types[1]]! : 1);

      // XOR between Torterra-Crest and Inverse Field so they cancel each other out
      if ((defender.named('Torterra-Crest') && !(field.chromaticField === 'Inverse')) || // Torterra Crest - Inverse type effectiveness
          (!defender.named('Torterra-Crest') && (field.chromaticField === 'Inverse'))) { // Inverse - Inverse type effectiveness
        effectiveness = 1 / effectiveness; // No need to check for dividing by zero because nothing is immune to steel
      }
      
      damage += Math.floor((effectiveness * defender.maxHP()) / 8);
      texts.push('Steelsurge');
    }

    if (defenderGrounded) {
      if (defenderSide.spikes === 1) {
        damage += Math.floor(defender.maxHP() / 8);
        if (gen.num === 2) {
          texts.push('Spikes');
        } else {
          texts.push('1 layer of Spikes');
        }
      } else if (defenderSide.spikes === 2) {
        damage += Math.floor(defender.maxHP() / 6);
        texts.push('2 layers of Spikes');
      } else if (defenderSide.spikes === 3) {
        damage += Math.floor(defender.maxHP() / 4);
        texts.push('3 layers of Spikes');
      }
    }
  }

  if (isNaN(damage)) {
    damage = 0;
  }

  return {damage, texts};
}

function getEndOfTurn(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field
) {
  let damage = 0;
  const texts = [];

  const loseItem = move.named('Knock Off') && !defender.hasAbility('Sticky Hold');

  // psychic noise should suppress all recovery effects
  const healBlock =
    (move.named('Psychic Noise') ||
     ((move.named('Shock Wave') || move.named('Nature Power')) && field.chromaticField === 'Thundering-Plateau') || // Thundering Plateau - Shock Wave applies Heal Block
     (attacker.hasItem('Prism Scale') || defender.hasItem('Prism Scale')) && field.chromaticField === 'Fable') && // Fable - Prism Scale: Apply Heal Block to both sides
    !(
      // suppression conditions
      attacker.hasAbility('Sheer Force') ||
      defender.hasItem('Covert Cloak') ||
      defender.hasAbility('Shield Dust', 'Aroma Veil')
    );
  
  // Jungle - Shield Dust grants Magic Guard
  // Rainbow - Flareon gains Magic Guard
  const defenderMagicGuard = defender.hasAbility('Magic Guard') ||
                             (defender.hasAbility('Shield Dust') && field.chromaticField === 'Jungle') ||
                             (defender.named('Flareon') && field.chromaticField === 'Rainbow');
  const attackerMagicGuard = attacker.hasAbility('Magic Guard') ||
                             (attacker.hasAbility('Shield Dust') && field.chromaticField === 'Jungle') ||
                             (attacker.named('Flareon') && field.chromaticField === 'Rainbow');

  if (field.hasWeather('Sun', 'Harsh Sunshine')) {
    if (defender.hasAbility('Dry Skin', 'Solar Power')) {
      damage -= Math.floor(defender.maxHP() / 8);
      texts.push(defender.ability + ' damage');
    }
    // Druddigon Crest - If harsh sunlight is active, it will restore 1/8th of its maximum HP at the end of each turn
    if (defender.named('Druddigon-Crest') && !healBlock) {
      damage += Math.floor(defender.maxHP() / 8);
      texts.push('Crest recovery');
    }
  } else if (field.hasWeather('Rain', 'Heavy Rain')) {
    if (!healBlock) {
      if (defender.hasAbility('Dry Skin')) {
        damage += Math.floor(defender.maxHP() / 8);
        texts.push('Dry Skin recovery');
      } else if (defender.hasAbility('Rain Dish')) {
        damage += Math.floor(defender.maxHP() / 16);
        texts.push('Rain Dish recovery');
      }
    }
  } else if (field.hasWeather('Sand')) {
    if (
      !defender.hasType('Rock', 'Ground', 'Steel') &&
      !defender.hasAbility('Overcoat', 'Sand Force', 'Sand Rush', 'Sand Veil') &&
      !defender.hasItem('Safety Goggles') && 
      !defenderMagicGuard
    ) {
      damage -= Math.floor(defender.maxHP() / (gen.num === 2 ? 8 : 16));
      texts.push('sandstorm damage');
    }
  } else if (field.hasWeather('Hail', 'Snow')) {
    if (defender.hasAbility('Ice Body')) {
      if (!healBlock) {
        damage += Math.floor(defender.maxHP() / 16);
        texts.push('Ice Body recovery');
      }
    } else if (
      !defender.hasType('Ice') &&
      !defender.hasAbility('Overcoat', 'Snow Cloak') &&
      !defenderMagicGuard &&
      !defender.hasItem('Safety Goggles') &&
      !defender.named('Empoleon-Crest')
    ) {
      // Snowy Peaks - Snow deals 1/16 weather damage like Sandstorm (Ice-types are immune)
      if (field.hasWeather('Snow') && field.chromaticField === 'Snowy-Peaks') {
        damage -= Math.floor(defender.maxHP() / 16);
        texts.push('snow damage');
      } else if (field.hasWeather('Hail')) {
        damage -= Math.floor(defender.maxHP() / 16);
        texts.push('hail damage');
      }
    }
  }

  // Volcanic Top - Activates Solar Power
  if (defender.hasAbility('Solar Power') && !field.hasWeather('Sun', 'Harsh Sunshine') && field.chromaticField === 'Volcanic-Top') {
    damage -= Math.floor(defender.maxHP() / 8);
    texts.push('Solar Power damage');
  }

  // Snowy Peaks - Activates Ice Body
  if (defender.hasAbility('Ice Body') && !field.hasWeather('Hail', 'Snow') && field.chromaticField === 'Snowy-Peaks' && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Ice Body recovery');    
  }
  
  // Water's Surface - Activates Rain Dish
  if (defender.hasAbility('Rain Dish') && !field.hasWeather('Rain', 'Heavy Rain') && field.chromaticField === 'Waters-Surface' && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Rain Dish recovery');
  }

  // Underwater - Dry Skin and Water Absorb restore 1/8 of the user’s Max HP
  if (defender.hasAbility('Dry Skin', 'Water Absorb') && field.chromaticField === 'Underwater' && !healBlock) {
    damage += Math.floor(defender.maxHP() / 8);
    texts.push(defender.ability + ' recovery');
  }

  if (defender.hasItem('Leftovers') && !loseItem && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Leftovers recovery');
  } else if (defender.hasItem('Black Sludge') && !loseItem) {
    if (defender.hasType('Poison')) {
      if (!healBlock) {
        damage += Math.floor(defender.maxHP() / 16);
        texts.push('Black Sludge recovery');
      }
    } else if (!defender.hasAbility('Klutz') && !defenderMagicGuard) {
      damage -= Math.floor(defender.maxHP() / 8);
      texts.push('Black Sludge damage');
    }
  } else if (defender.hasItem('Sticky Barb') && !loseItem &&
    !defender.hasAbility('Magic Guard', 'Klutz')) {
    damage -= Math.floor(defender.maxHP() / 8);
    texts.push('Sticky Barb damage');
  }

  if (field.defenderSide.isIngrain && !healBlock) {
    let recovery = Math.floor(defender.maxHP() / (field.chromaticField === 'Flower-Garden' ? 8 : 16)); // Flower Garden - Ingrain restores 1/8th of the user's Max HP
    if (defender.hasItem('Big Root')) recovery = Math.trunc(recovery * 5324 / 4096);
    damage += recovery;
    texts.push('Ingrain recovery');
  }

  if ((field.defenderSide.isAquaRing || defender.named('Phione-Crest')) && !healBlock) { // Phione Crest - Grants Aqua Ring
    let recovery = Math.floor(defender.maxHP() / (field.chromaticField === 'Waters-Surface' ? 10: 16));
    if (defender.hasItem('Big Root')) recovery = Math.trunc(recovery * 5324 / 4096);
    damage += recovery;
    texts.push('Aqua Ring recovery');
  }

  if (field.defenderSide.isSeeded) {
    if (!defenderMagicGuard) {
      // 1/16 in gen 1, 1/8 in gen 2 onwards
      damage -= Math.floor(defender.maxHP() / (gen.num >= 2 ? 8 : 16));
      texts.push('Leech Seed damage');
    }
  }

  if (field.attackerSide.isSeeded && !defenderMagicGuard) {
    let recovery = Math.floor(attacker.maxHP() / (gen.num >= 2 ? 8 : 16));
    if (defender.hasItem('Big Root')) recovery = Math.trunc(recovery * 5324 / 4096);
    if (attacker.hasAbility('Liquid Ooze')) {
      damage -= recovery;
      texts.push('Liquid Ooze damage');
    } else if (!healBlock) {
      damage += recovery;
      texts.push('Leech Seed recovery');
    }
  }

  if (field.hasTerrain('Grassy')) {
    // Flower Garden - Grassy Terrain only heals Grass Type Pokemon
    if (isGrounded(defender, field, field.defenderSide) && !(field.chromaticField === 'Flower-Garden' && !defender.hasType('Grass')) && !healBlock) {
      damage += Math.floor(defender.maxHP() / 16);
      texts.push('Grassy Terrain recovery');
    }
  }

  const defenderPoisonHeal = defender.hasAbility('Poison Heal') ||
                             defender.named('Zangoose-Crest') || // Zangoose Crest - Grants Poison Heal
                             (field.chromaticField === 'Rainbow' && defender.named('Umbreon')) || // Rainbow - Umbreon gains Poison Heal
                             (field.chromaticField === 'Corrosive-Mist' && defender.hasAbility('Toxic Chain', 'Poison Touch', 'Flash Fire')); // Corrosive Mist - Toxic Chain, Poison Touch, and Flash Fire grant Poison Heal

  // Corrosive Mist - Sludge Bomb, Temper Flare and Heat Wave additionally detonate poisoned, badly poisoned, and burned Pokemon, cleansing status and dealing 33% of their max HP
  if (field.chromaticField === 'Corrosive-Mist' && defender.hasStatus('psn', 'tox', 'brn') && move.named('Sludge Bomb', 'Temper Flare', 'Heat Wave', 'Corrosive Gas')) {
    damage -= Math.floor(defender.maxHP() / 3);
    texts.push('detonation damage');
  } else if (defender.hasStatus('psn')) {
    if (defenderPoisonHeal) {
      if (!healBlock) {
        damage += Math.floor(defender.maxHP() / 8);
        texts.push('Poison Heal');
      }
    } else if (!defenderMagicGuard) {
      damage -= Math.floor(defender.maxHP() / (gen.num === 1 ? 16 : 8));
      texts.push('poison damage');
    }
  } else if (defender.hasStatus('tox')) {
    if (defenderPoisonHeal) {
      if (!healBlock) {
        damage += Math.floor(defender.maxHP() / 8);
        texts.push('Poison Heal');
      }
    } else if (!defenderMagicGuard) {
      texts.push('toxic damage');
    }
  } else if (defender.hasStatus('brn') && !defenderMagicGuard) {
    let modifier = 1;

    if (defender.hasAbility('Heatproof')) {
      modifier *= 2;
    }

    // Water's Surface - Burn damage is halved
    if (field.chromaticField === 'Waters-Surface') {
      modifier *= 2;
    }

    // Corrosive Mist - Burned pokemon take 1/8th of their max HP per turn
    if (field.chromaticField === 'Corrosive-Mist') {
      modifier /= 2;
    }

    damage -= Math.floor(defender.maxHP() / ((gen.num === 1 || gen.num > 6 ? 16 : 8) * modifier));
    texts.push((modifier > 1 ? 'reduced ' : '') + 'burn damage');
  } else if (
    (defender.hasStatus('slp') || defender.hasAbility('Comatose')) &&
    !defenderMagicGuard
  ) {
    damage -= Math.floor(defender.maxHP() / 8);
    texts.push('Bad Dreams');
  // Acidic Wasteland - Activates Poison Heal
  } else if (field.chromaticField === 'Acidic-Wasteland') {
    if (defenderPoisonHeal) {
      if (!healBlock) {
        damage += Math.floor(defender.maxHP() / 8);
        texts.push('Poison Heal');
      }
    } else if (defender.hasAbility('Liquid Ooze')) {
      if (!healBlock) {
        damage += Math.floor(defender.maxHP() / 16);
        texts.push('Liquid Ooze recovery');
      }      
    }
  }

  if (!defenderMagicGuard &&
      ((TRAPPING.includes(move.name) && gen.num > 1) ||
       (attacker.named('Vespiquen-Crest-Offense') && move.named('Attack Order')) || // Vespiquen Crest - Attack order applies Infestation
       (move.named('Leaf Tornado') && field.chromaticField === 'Flower-Garden') || // Flower Garden - Leaf Tornado is now a binding move that deals 1/8 max HP per turn for 2-5 turns
       (move.named('Sandsear Storm') && field.chromaticField === 'Desert'))) { // Desert - Sandsear Storm applies Sand Tomb trapping and chip damage effect 
    // Underwater - Whirlpool deals ⅙ of the target’s Max HP per turn
    if (attacker.hasItem('Binding Band') || (move.named('Whirlpool') && field.chromaticField === 'Underwater')) {
      damage -= gen.num > 5 ? Math.floor(defender.maxHP() / 6) : Math.floor(defender.maxHP() / 8);
      texts.push('trapping damage');
    } else {
      damage -= gen.num > 5 ? Math.floor(defender.maxHP() / 8) : Math.floor(defender.maxHP() / 16);
      texts.push('trapping damage');
    }
  }
  if (field.defenderSide.isSaltCured && !defenderMagicGuard) {
    const isWaterOrSteel = defender.hasType('Water', 'Steel');
    damage -= Math.floor(defender.maxHP() / (isWaterOrSteel ? 4 : 8));
    texts.push('Salt Cure');
  }
  if (!defender.hasType('Fire') && !defenderMagicGuard &&
      (move.named('Fire Pledge (Grass Pledge Boosted)', 'Grass Pledge (Fire Pledge Boosted)'))) {
    damage -= Math.floor(defender.maxHP() / 8);
    texts.push('Sea of Fire damage');
  }

  if (!defenderMagicGuard && !defender.hasType('Grass') && 
      (field.defenderSide.vinelash || move.named('G-Max Vine Lash'))) {
    damage -= Math.floor(defender.maxHP() / 6);
    texts.push('Vine Lash damage');
  }

  if (!defenderMagicGuard && !defender.hasType('Fire') &&
      (field.defenderSide.wildfire || move.named('G-Max Wildfire'))) {
    damage -= Math.floor(defender.maxHP() / 6);
    texts.push('Wildfire damage');
  }

  if (!defenderMagicGuard && !defender.hasType('Water') &&
      (field.defenderSide.cannonade || move.named('G-Max Cannonade'))) {
    damage -= Math.floor(defender.maxHP() / 6);
    texts.push('Cannonade damage');
  }

  if (!defenderMagicGuard && !defender.hasType('Rock') &&
      (field.defenderSide.volcalith || move.named('G-Max Volcalith'))) {
    damage -= Math.floor(defender.maxHP() / 6);
    texts.push('Volcalith damage');
  }

  if (field.defenderSide.isNightmare && (defender.hasStatus('slp') || defender.hasAbility('Comatose')) && !defenderMagicGuard) {
    // Haunted Graveyard - Nightmare deals 1/3 of the target’s Max HP (From 1/4th)
    damage -= field.chromaticField === 'Haunted-Graveyard' ? Math.floor(defender.maxHP() / 3) : Math.floor(defender.maxHP() / 4);
    texts.push('Nightmare');
  }

  // Crests - End of turn text

  // Gothitelle Crest - Recovers 1/16th of its max HP per round when psychic
  if (defender.named('Gothitelle-Crest') && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Crest recovery');
  }

  // Meganium Crest - Meganium and its allies heal 1/16 of their HP at the end of turn
  if (defender.named('Meganium-Crest') && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Crest recovery');
  }

  // Shiinotic Crest - Drains 1/16th of Max HP from statused pokemon at end of turn
  if (attacker.named('Shiinotic-Crest') && defender.status && !defenderMagicGuard) {
    damage -= Math.floor(defender.maxHP() / 16);
    texts.push('Crest damage');
  }
  if (defender.named('Shiinotic-Crest') && attacker.status && !attackerMagicGuard && !healBlock) {
    damage += Math.floor(attacker.maxHP() / 16);
    texts.push('Crest recovery');
  }

  // Spiritomb Crest - Recovers 1/32 of its max HP per turn for each fainted ally
  if (defender.named('Spiritomb-Crest') && defender.alliesFainted! > 0 && !healBlock) {
    damage += Math.floor(defender.maxHP() * defender.alliesFainted! / 32);
    texts.push('Crest recovery (' + Math.min(5, defender.alliesFainted!) + ` ${defender.alliesFainted === 1 ? 'ally' : 'allies'} fainted)`);
  }

  // Vespiquen Crest - Grants a leftovers effect
  if (defender.named('Vespiquen-Crest-Defense') && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Crest recovery');
  }

  // Fields - End of turn text

  // Jungle - Cutting moves deal an additional 1/8th max hp, modified by type effectiveness [Grass Type] to affected opposing Pokémon
  if (field.chromaticField === 'Jungle' && move.flags.slicing && !defenderMagicGuard) {
    const grassType = gen.types.get('grass' as ID)!;
    let effectiveness =
    grassType.effectiveness[defender.types[0]]! *
      (defender.types[1] ? grassType.effectiveness[defender.types[1]]! : 1);

    // Torterra Crest - Inverse type effectiveness
    if (defender.named('Torterra-Crest')) { 
      effectiveness = 1 / effectiveness;
    // Simipour Crest - Simisage Crest - Give resistance to grass type moves (grass / fire pseudo-typings)
    } else if (defender.named('Simipour-Crest', 'Simisage-Crest')) {
      effectiveness *= 0.5;
    // Whiscash Crest - Gives grass immunity
    } else if (defender.named('Whiscash-Crest')) {
      effectiveness = 0;
    }
  
    damage -= Math.floor((effectiveness * defender.maxHP()) / 8);
    texts.push('Tree Slam damage');
  }

  // Jungle - Parasite - Users holding Binding Band cause Pokémon on the opposing side of the field to lose 6% of their max hp at the end of each turn
  if (field.chromaticField === 'Jungle' && attacker.hasItem('Binding Band') && !defenderMagicGuard) {
    damage -= Math.floor(defender.maxHP() / 16);
    texts.push('Parasite damage');
  }

  // Thundering Plateau - Volt Absorb restores 1/16 of the user's Max HP per turn
  if (field.chromaticField === 'Thundering-Plateau' && defender.hasAbility('Volt Absorb') && !healBlock) {
    damage += Math.floor(defender.maxHP() / 16);
    texts.push('Volt Absorb recovery');
  }

  const VOLCANIC_ERUPTION = [
    'Bulldoze', 'Earthquake', 'Eruption', 'Lava Plume', 'Magma Storm', 'Magnitude', 'Stomping Tantrum',
  ];

  // Volcanic Top - Volcanic Eruption deals 1/8th of all Pokemon's max health determined by the effectiveness of Fire against the target
  if (field.chromaticField === 'Volcanic-Top' && (VOLCANIC_ERUPTION.includes(move.name) || (move.named('Nature Power') && !field.terrain)) &&
      !defender.hasAbility('Flash Fire', 'Well-Baked Body') && !defenderMagicGuard) {
    const fireType = gen.types.get('fire' as ID)!;
    let effectiveness =
    fireType.effectiveness[defender.types[0]]! *
      (defender.types[1] ? fireType.effectiveness[defender.types[1]]! : 1);

    // Leafeon Crest - Gives resistance to fire and flying type moves
    if (defender.named('Leafeon-Crest') && effectiveness > 0.5) {
      effectiveness = 0.5;
    // Torterra Crest - Inverse type effectiveness
    } else if (defender.named('Torterra-Crest')) { 
      effectiveness = 1 / effectiveness;
    // Simisage Crest - Simisear Crest - Give resistance to fire type moves (fire / water pseudo-typings)
    } else if (defender.named('Simisage-Crest', 'Simisear-Crest')) {
      effectiveness *= 0.5;
    }
  
    damage -= Math.floor((effectiveness * defender.maxHP()) / 8);
    texts.push('Volcanic Eruption damage');
  }

  // Ashen Beach - Sand Veil heals 1/8 at the end of each turn whilst in Sandstorm
  if (field.chromaticField === 'Ashen-Beach' && defender.hasAbility('Sand Veil') && field.hasWeather('Sand') && !healBlock) {
    damage += Math.floor(defender.maxHP() / 8);
    texts.push('Sand Veil recovery');
  }

  return {damage, texts};
}

function computeKOChance(
  damage: number[],
  hp: number,
  eot: number,
  hits: number,
  timesUsed: number,
  maxHP: number,
  toxicCounter: number
) {
  let toxicDamage = 0;
  if (toxicCounter > 0) {
    toxicDamage = Math.floor((toxicCounter * maxHP) / 16);
    toxicCounter++;
  }
  const n = damage.length;
  if (hits === 1) {
    // ignore end of turn healing for the hit that KOs
    // so that the pokemon doesnt "revive" from being KO'd
    // since recovery happens before toxic damage (and therefore always reduces toxic damage),
    // if the net healing is greater than zero, toxicDamage should also be set to zero.
    if (eot - toxicDamage > 0) {
      eot = 0;
      toxicDamage = 0;
    }
    for (let i = 0; i < n; i++) {
      if (damage[n - 1] - eot + toxicDamage < hp) return 0;
      if (damage[i] - eot + toxicDamage >= hp) {
        return (n - i) / n;
      }
    }
  }

  let sum = 0;
  let lastc = 0;
  for (let i = 0; i < n; i++) {
    let c;
    if (i === 0 || damage[i] !== damage[i - 1]) {
      c = computeKOChance(
        damage,
        hp - damage[i] + eot - toxicDamage,
        eot,
        hits - 1,
        timesUsed,
        maxHP,
        toxicCounter
      );
    } else {
      c = lastc;
    }
    if (c === 1) {
      sum += n - i;
      break;
    } else {
      sum += c;
    }
    lastc = c;
  }
  return sum / n;
}

function predictTotal(
  damage: number,
  eot: number,
  hits: number,
  timesUsed: number,
  toxicCounter: number,
  maxHP: number
) {
  let toxicDamage = 0;
  // hits - 1 is used in this for loop, as well as in the total = ...  calcs later
  // the last turn of eot damage is calculated separately
  // since if the damage is less than 0 (healing)
  // we want to exclude that from the calculations
  // since on the last turn the pokemon has been ko'd by the attack
  // and should not be able to heal after fainting
  let lastTurnEot = eot;
  if (toxicCounter > 0) {
    for (let i = 0; i < hits - 1; i++) {
      toxicDamage += Math.floor(((toxicCounter + i) * maxHP) / 16);
    }
    lastTurnEot -= Math.floor(((toxicCounter + (hits - 1)) * maxHP) / 16);
  }
  let total = 0;
  if (hits > 1 && timesUsed === 1) {
    total = damage * hits - eot * (hits - 1) + toxicDamage;
  } else {
    total = damage - eot * (hits - 1) + toxicDamage;
  }
  // if the net eot health gain is negative for the last turn, include it in the total
  if (lastTurnEot < 0) total -= lastTurnEot;
  return total;
}

function squashMultihit(gen: Generation, d: number[], hits: number, err = true) {
  if (d.length === 1) {
    return [d[0] * hits];
  } else if (gen.num === 1) {
    const r = [];
    for (let i = 0; i < d.length; i++) {
      r[i] = d[i] * hits;
    }
    return r;
  } else if (d.length === 16) {
    switch (hits) {
    case 2:
      return [
        2 * d[0], d[2] + d[3], d[4] + d[4], d[4] + d[5], d[5] + d[6], d[6] + d[6],
        d[6] + d[7], d[7] + d[7], d[8] + d[8], d[8] + d[9], d[9] + d[9], d[9] + d[10],
        d[10] + d[11], d[11] + d[11], d[12] + d[13], 2 * d[15],
      ];
    case 3:
      return [
        3 * d[0], d[3] + d[3] + d[4], d[4] + d[4] + d[5], d[5] + d[5] + d[6],
        d[5] + d[6] + d[6], d[6] + d[6] + d[7], d[6] + d[7] + d[7], d[7] + d[7] + d[8],
        d[7] + d[8] + d[8], d[8] + d[8] + d[9], d[8] + d[9] + d[9], d[9] + d[9] + d[10],
        d[9] + d[10] + d[10], d[10] + d[11] + d[11], d[11] + d[12] + d[12], 3 * d[15],
      ];
    case 4:
      return [
        4 * d[0], 4 * d[4], d[4] + d[5] + d[5] + d[5], d[5] + d[5] + d[6] + d[6],
        4 * d[6], d[6] + d[6] + d[7] + d[7], 4 * d[7], d[7] + d[7] + d[7] + d[8],
        d[7] + d[8] + d[8] + d[8], 4 * d[8], d[8] + d[8] + d[9] + d[9], 4 * d[9],
        d[9] + d[9] + d[10] + d[10], d[10] + d[10] + d[10] + d[11], 4 * d[11], 4 * d[15],
      ];
    case 5:
      return [
        5 * d[0], d[4] + d[4] + d[4] + d[5] + d[5], d[5] + d[5] + d[5] + d[5] + d[6],
        d[5] + d[6] + d[6] + d[6] + d[6], d[6] + d[6] + d[6] + d[6] + d[7],
        d[6] + d[6] + d[7] + d[7] + d[7], 5 * d[7], d[7] + d[7] + d[7] + d[8] + d[8],
        d[7] + d[7] + d[8] + d[8] + d[8], 5 * d[8], d[8] + d[8] + d[8] + d[9] + d[9],
        d[8] + d[9] + d[9] + d[9] + d[9], d[9] + d[9] + d[9] + d[9] + d[10],
        d[9] + d[10] + d[10] + d[10] + d[10], d[10] + d[10] + d[11] + d[11] + d[11], 5 * d[15],
      ];
    case 10:
      return [
        10 * d[0], 10 * d[4], 3 * d[4] + 7 * d[5], 5 * d[5] + 5 * d[6], 10 * d[6],
        5 * d[6] + 5 * d[7], 10 * d[7], 7 * d[7] + 3 * d[8], 3 * d[7] + 7 * d[8], 10 * d[8],
        5 * d[8] + 5 * d[9], 4 * d[9], 5 * d[9] + 5 * d[10], 7 * d[10] + 3 * d[11], 10 * d[11],
        10 * d[15],
      ];
    default:
      error(err, `Unexpected # of hits: ${hits}`);
      return d;
    }
  } else if (d.length === 39) {
    switch (hits) {
    case 2:
      return [
        2 * d[0], 2 * d[7], 2 * d[10], 2 * d[12], 2 * d[14], d[15] + d[16],
        2 * d[17], d[18] + d[19], d[19] + d[20], 2 * d[21], d[22] + d[23],
        2 * d[24], 2 * d[26], 2 * d[28], 2 * d[31], 2 * d[38],
      ];
    case 3:
      return [
        3 * d[0], 3 * d[9], 3 * d[12], 3 * d[13], 3 * d[15], 3 * d[16],
        3 * d[17], 3 * d[18], 3 * d[20], 3 * d[21], 3 * d[22], 3 * d[23],
        3 * d[25], 3 * d[26], 3 * d[29], 3 * d[38],
      ];
    case 4:
      return [
        4 * d[0], 2 * d[10] + 2 * d[11], 4 * d[13], 4 * d[14], 2 * d[15] + 2 * d[16],
        2 * d[16] + 2 * d[17], 2 * d[17] + 2 * d[18], 2 * d[18] + 2 * d[19],
        2 * d[19] + 2 * d[20], 2 * d[20] + 2 * d[21], 2 * d[21] + 2 * d[22],
        2 * d[22] + 2 * d[23], 4 * d[24], 4 * d[25], 2 * d[27] + 2 * d[28], 4 * d[38],
      ];
    case 5:
      return [
        5 * d[0], 5 * d[11], 5 * d[13], 5 * d[15], 5 * d[16], 5 * d[17],
        5 * d[18], 5 * d[19], 5 * d[19], 5 * d[20], 5 * d[21], 5 * d[22],
        5 * d[23], 5 * d[25], 5 * d[27], 5 * d[38],
      ];
    case 10:
      return [
        10 * d[0], 10 * d[11], 10 * d[13], 10 * d[15], 10 * d[16], 10 * d[17],
        10 * d[18], 10 * d[19], 10 * d[19], 10 * d[20], 10 * d[21], 10 * d[22],
        10 * d[23], 10 * d[25], 10 * d[27], 10 * d[38],
      ];
    default:
      error(err, `Unexpected # of hits: ${hits}`);
      return d;
    }
  } else if (d.length === 256) {
    if (hits > 1) {
      error(err, `Unexpected # of hits for Parental Bond: ${hits}`);
    }
    // FIXME: Come up with a better Parental Bond approximation
    const r: number[] = [];
    for (let i = 0; i < 16; i++) {
      let val = 0;
      for (let j = 0; j < 16; j++) {
        val += d[i + j];
      }
      r[i] = Math.round(val / 16);
    }
    return r;
  } else {
    error(err, `Unexpected # of possible damage values: ${d.length}`);
    return d;
  }
}

function buildDescription(description: RawDesc, attacker: Pokemon, defender: Pokemon) {
  const [attackerLevel, defenderLevel] = getDescriptionLevels(attacker, defender);
  let output = '';
  if (description.attackBoost) {
    if (description.attackBoost > 0) {
      output += '+';
    }
    output += description.attackBoost + ' ';
  }
  output = appendIfSet(output, attackerLevel);
  output = appendIfSet(output, description.attackEVs);
  output = appendIfSet(output, description.attackerItem);
  output = appendIfSet(output, description.attackerAbility);
  output = appendIfSet(output, description.rivalry);
  if (description.fieldCondition) {
    output += description.fieldCondition + ' ';
  }
  if (description.isBurned) {
    output += 'burned ';
  }
  if (description.gritStages) {
    output += Math.min(5, description.gritStages) + ' Grit Stages ';
  }
  if (description.alliesFainted) {
    output += Math.min(5, description.alliesFainted) +
      ` ${description.alliesFainted === 1 ? 'ally' : 'allies'} fainted `;
  }
  if (description.foesFainted) {
    output += Math.min(5, description.foesFainted) +
      ` ${description.alliesFainted === 1 ? 'foe' : 'foes'} fainted `;
  }
  if (description.relicanthTurnsAttack) {
    output += Math.min(10, description.relicanthTurnsAttack) +
      ` ${description.relicanthTurnsAttack === 1 ? 'Turn' : 'Turns'} `;
  }
  if (description.attackerTera) {
    output += `Tera ${description.attackerTera} `;
  } else if (description.isAttackerSoak) {
    output += `Soak `;
  } else if (description.attackerType) {
    output += description.attackerType + ' ';
  }

  if (description.isStellarFirstUse) {
    output += '(First Use) ';
  }

  if (description.isBeadsOfRuin) {
    output += 'Beads of Ruin ';
  }
  if (description.isSwordOfRuin) {
    output += 'Sword of Ruin ';
  }
  output += description.attackerName + ' ';
  if (description.isHelpingHand) {
    output += 'Helping Hand ';
  }
  if (description.isFlowerGiftAttacker) {
    output += 'with an ally\'s Flower Gift ';
  }
  if (description.isSteelySpiritAttacker) {
    output += 'with an ally\'s Steely Spirit ';
  }
  if (description.isBattery) {
    output += 'Battery boosted ';
  }
  if (description.isPowerSpot) {
    output += 'Power Spot boosted ';
  }
  if (description.isSwitching) {
    output += 'switching boosted ';
  }
  if (description.mirrorBeamType) {
    output += description.mirrorBeamType + ' ';
  }
  if (description.moveSlot) {
    output += 'move slot ' + description.moveSlot + ' ';
  }
  output += description.moveName + ' ';
  if (description.moveBP && description.moveType) {
    output += '(' + description.moveBP + ' BP ' + description.moveType + ') ';
  } else if (description.moveBP) {
    output += '(' + description.moveBP + ' BP) ';
  } else if (description.moveType && description.moveType2) {
    output += '(' + description.moveType + ' / ' + description.moveType2 + ') ';
  } else if (description.moveType) {
    output += '(' + description.moveType + ') ';
  }
  if (description.hits) {
    output += '(' + description.hits + ' hits) ';
  }
  output = appendIfSet(output, description.moveTurns);
  output += 'vs. ';
  if (description.defenseBoost) {
    if (description.defenseBoost > 0) {
      output += '+';
    }
    output += description.defenseBoost + ' ';
  }
  output = appendIfSet(output, defenderLevel);
  output = appendIfSet(output, description.HPEVs);
  if (description.defenseEVs) {
    output += '/ ' + description.defenseEVs + ' ';
  }
  output = appendIfSet(output, description.defenderItem);
  output = appendIfSet(output, description.defenderAbility);
  
  if (description.relicanthTurnsDefense) {
    output += Math.min(10, description.relicanthTurnsDefense) +
      ` ${description.relicanthTurnsDefense === 1 ? 'Turn' : 'Turns'} `;
  }
  if (description.isTabletsOfRuin) {
    output += 'Tablets of Ruin ';
  }
  if (description.isVesselOfRuin) {
    output += 'Vessel of Ruin ';
  }
  if (description.isProtected) {
    output += 'protected ';
  }
  if (description.isDefenderDynamaxed) {
    output += 'Dynamax ';
  }
  if (description.defenderTera) {
    output += `Tera ${description.defenderTera} `;
  } else if (description.isDefenderSoak) {
    output += `Soak `;
  } else if (description.defenderType) {
    output += description.defenderType + ' ';
  }
  output += description.defenderName;
  if (description.weather && description.terrain) {
    // do nothing
  } else if (description.weather) {
    output += ' in ' + description.weather;
  } else if (description.terrain) {
    output += ' in ' + description.terrain + ' Terrain';
  }
  if (description.subWeather) {
    output += ' in ' + description.subWeather;
  }
  // Fields - Put field names at the end of damage calc text
  if (description.chromaticField) {
    switch (description.chromaticField) {
    case "Jungle":
    case "Eclipse":
    case "Sky":
    case "Desert":
    case "Factory":
    case "Rainbow":
    case "Inverse":
    case "Tempest":
      output += ' on ' + description.chromaticField + ' Field';
      break;
    case "Dragons-Den":
      output += " on Dragon's Den";
      break;
    case "Waters-Surface": 
      output += " on Water's Surface";
      break;
    case "Cave":
    case "Underwater":
    case "Undercolony":
    case "Thundering-Plateau":
    case "Starlight-Arena":
    case "Ring-Arena":
    case "Volcanic-Top":
    case "Haunted-Graveyard":
    case "Flower-Garden":
    case "Snowy-Peaks":
    case "Blessed-Sanctum":
    case "Acidic-Wasteland":
    case "Ancient-Ruins":
    case "Bewitched-Woods":
    case "Corrosive-Mist":
    case "Ashen-Beach":
    case "Forgotten-Battlefield":
    default:
      output += ' on ' + description.chromaticField.replace('-', ' ');
      break;
    }
  }
  if (description.isReflect) {
    output += ' through Reflect';
  } else if (description.isLightScreen) {
    output += ' through Light Screen';
  }
  if (description.isFlowerGiftDefender) {
    output += ' with an ally\'s Flower Gift';
  }
  if (description.isFriendGuard) {
    output += ' with an ally\'s Friend Guard';
  }
  if (description.isAuroraVeil) {
    output += ' with an ally\'s Aurora Veil';
  }
  if (description.isAreniteWall) {
    output += ' with an ally\'s Arenite Wall';
  }
  if (description.isCritical) {
    output += ' on a critical hit';
  }
  if (description.isWonderRoom) {
    output += ' in Wonder Room';
  }
  return output;
}

function getDescriptionLevels(attacker: Pokemon, defender: Pokemon) {
  if (attacker.level !== defender.level) {
    return [
      attacker.level === 100 ? '' : `Lvl ${attacker.level}`,
      defender.level === 100 ? '' : `Lvl ${defender.level}`,
    ];
  }
  // There's an argument for showing any level thats not 100, but VGC and LC players
  // probably would rather not see level cruft in their calcs
  const elide = [100, 50, 5].includes(attacker.level);
  const level = elide ? '' : `Lvl ${attacker.level}`;
  return [level, level];
}

function serializeText(arr: string[]) {
  if (arr.length === 0) {
    return '';
  } else if (arr.length === 1) {
    return arr[0];
  } else if (arr.length === 2) {
    return arr[0] + ' and ' + arr[1];
  } else {
    let text = '';
    for (let i = 0; i < arr.length - 1; i++) {
      text += arr[i] + ', ';
    }
    return text + 'and ' + arr[arr.length - 1];
  }
}

function appendIfSet(str: string, toAppend?: string) {
  return toAppend ? `${str}${toAppend} ` : str;
}

function toDisplay(notation: string, a: number, b: number, f = 1) {
  return notation === '%' ? Math.floor((a * (1000 / f)) / b) / 10 : Math.floor((a * (48 / f)) / b);
}
