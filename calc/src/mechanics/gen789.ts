import {Generation, AbilityName, StatID, Terrain, TypeName, ID} from '../data/interface';
import {toID} from '../util';
import {
  getBerryResistType,
  getFlingPower,
  getItemBoostType,
  getMultiAttack,
  getNaturalGift,
  getTechnoBlast,
  SEED_BOOSTED_STAT,
} from '../items';
import {RawDesc} from '../desc';
import {Field} from '../field';
import {Move} from '../move';
import {Pokemon} from '../pokemon';
import {Result} from '../result';
import {
  chainMods,
  checkAirLock,
  checkCrestBoosts,
  checkDauntlessShield,
  checkDownload,
  checkEmbody,
  checkFieldBoosts,
  checkForecast,
  checkInfiltrator,
  checkIntimidate,
  checkIntrepidSword,
  checkItem,
  checkMultihitBoost,
  checkSeedBoost,
  checkTeraformZero,
  checkWonderRoom,
  computeFinalStats,
  countBoosts,
  getBaseDamage,
  getEVDescriptionText,
  getFinalDamage,
  getModifiedStat,
  getQPBoostedStat,
  getMoveEffectiveness,
  getShellSideArmCategory,
  getWeightFactor,
  handleFixedDamageMoves,
  isGrounded,
  OF16, OF32,
  pokeRound,
  getMimicryType,
  isQPActive,
} from './util';
import { SpeciesName, Type } from '@pkmn/dex';
import { MoveName } from '@pkmn/dex';

export function calculateSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field
) {
  // #region Initial

  checkAirLock(attacker, field);
  checkAirLock(defender, field);
  checkTeraformZero(attacker, field);
  checkTeraformZero(defender, field);
  checkForecast(attacker, field.weather);
  checkForecast(defender, field.weather);
  checkItem(attacker, field.isMagicRoom);
  checkItem(defender, field.isMagicRoom);
  checkWonderRoom(attacker, field.isWonderRoom);
  checkWonderRoom(defender, field.isWonderRoom);
  checkSeedBoost(attacker, field);
  checkSeedBoost(defender, field);
  checkDauntlessShield(attacker, gen);
  checkDauntlessShield(defender, gen);
  checkEmbody(attacker, gen);
  checkEmbody(defender, gen);
  checkIntimidate(gen, attacker, defender);
  checkIntimidate(gen, defender, attacker);
  checkDownload(attacker, defender, field.isWonderRoom);
  checkDownload(defender, attacker, field.isWonderRoom);
  checkIntrepidSword(attacker, gen);
  checkIntrepidSword(defender, gen);
  checkCrestBoosts(attacker);
  checkCrestBoosts(defender);
  checkFieldBoosts(attacker, field);
  checkFieldBoosts(defender, field);

  computeFinalStats(gen, attacker, defender, field, 'def', 'spd', 'spe', 'atk', 'spa');

  checkInfiltrator(attacker, field.defenderSide);
  checkInfiltrator(defender, field.attackerSide);

  const desc: RawDesc = {
    attackerName: attacker.name,
    attackerTera: attacker.teraType,
    moveName: move.name,
    defenderName: defender.name,
    defenderTera: defender.teraType,
    isDefenderDynamaxed: defender.isDynamaxed,
    isWonderRoom: field.isWonderRoom,
  };

  const result = new Result(gen, attacker, defender, move, field, 0, desc);

  if (move.category === 'Status' && !move.named('Nature Power')) {
    return result;
  }

  const breaksProtect = move.breaksProtect || move.isZ || attacker.isDynamaxed ||
  (attacker.hasAbility('Unseen Fist') && move.flags.contact);

  if (field.defenderSide.isProtected && !breaksProtect) {
    desc.isProtected = true;
    return result;
  }

  const defenderIgnoresAbility = defender.hasAbility(
    'Full Metal Body',
    'Neutralizing Gas',
    'Prism Armor',
    'Shadow Shield'
  );

  const attackerIgnoresAbility = attacker.hasAbility('Mold Breaker', 'Teravolt', 'Turboblaze');
  const moveIgnoresAbility = move.named(
    'G-Max Drum Solo',
    'G-Max Fire Ball',
    'G-Max Hydrosnipe',
    'Light That Burns the Sky',
    'Menacing Moonraze Maelstrom',
    'Moongeist Beam',
    'Photon Geyser',
    'Searing Sunraze Smash',
    'Sunsteel Strike'
  );
  if (!defenderIgnoresAbility && !defender.hasAbility('Poison Heal') &&
    (attackerIgnoresAbility || moveIgnoresAbility)) {
    if (attackerIgnoresAbility) desc.attackerAbility = attacker.ability;
    if (defender.hasItem('Ability Shield')) {
      desc.defenderItem = defender.item;
    } else {
      defender.ability = '' as AbilityName;
    }
  }

  // Merciless does not ignore Shell Armor, damage dealt to a poisoned Pokemon with Shell Armor
  // will not be a critical hit (UltiMario)
  let tempCritical = !defender.hasAbility('Battle Armor', 'Shell Armor') &&
    (move.isCrit || (attacker.hasAbility('Merciless') && defender.hasStatus('psn', 'tox')) ||
    (attacker.named('Ariados-Crest') && (defender.status || defender.boosts.spe < 0)) ||
    (attacker.named('Samurott-Crest') && move.flags.slicing)) &&
    move.timesUsed === 1;

  if (tempCritical == 0)
    tempCritical = false;

  const isCritical = tempCritical;

  let type = move.type;
  if (move.named('Weather Ball')) {
    const holdingUmbrella = attacker.hasItem('Utility Umbrella');
    type =
      field.hasWeather('Sun', 'Harsh Sunshine') && !holdingUmbrella ? 'Fire'
      : field.hasWeather('Rain', 'Heavy Rain') && !holdingUmbrella ? 'Water'
      : field.hasWeather('Sand') ? 'Rock'
      : field.hasWeather('Hail', 'Snow') ? 'Ice'
      : 'Normal';
    desc.weather = field.weather;
    desc.moveType = type;
  } else if (move.named('Judgment') && attacker.item && attacker.item.includes('Plate')) {
    type = getItemBoostType(attacker.item)!;
  } else if (move.named('Techno Blast') && attacker.item && attacker.item.includes('Drive')) {
    type = getTechnoBlast(attacker.item)!;
  } else if (move.named('Multi-Attack') && attacker.item && attacker.item.includes('Memory')) {
    type = getMultiAttack(attacker.item)!;
  } else if (move.named('Natural Gift') && attacker.item && attacker.item.includes('Berry')) {
    const gift = getNaturalGift(gen, attacker.item)!;
    type = gift.t;
    desc.moveType = type;
    desc.attackerItem = attacker.item;
  } else if (
    move.named('Nature Power') ||
    (move.named('Terrain Pulse') && isGrounded(attacker, field))
  ) {
    type =
      field.hasTerrain('Electric') ? 'Electric'
      : field.hasTerrain('Grassy') ? 'Grass'
      : field.hasTerrain('Misty') ? 'Fairy'
      : field.hasTerrain('Psychic') ? 'Psychic'
      : 'Normal';
    // Fields - Nature Power
    if (move.named('Nature Power') && type === 'Normal') {
      type =
        field.chromaticField === 'Jungle' ? 'Bug'
        : field.chromaticField === 'Eclipse' ? 'Dark'
        : field.chromaticField === "Dragon's Den" ? 'Steel'
        : field.chromaticField === 'Thundering Plateau' ? 'Electric'
        : field.chromaticField === 'Starlight Arena' ? 'Fairy'
        : 'Normal';
      if (!(type === 'Normal')) {
        desc.chromaticField = field.chromaticField;
      }
    } else {
      desc.terrain = field.terrain;
    }
    desc.moveType = type;
  } else if (move.named('Revelation Dance')) {
    if (attacker.teraType) {
      type = attacker.teraType;
    } else {
      type = attacker.types[0];
    }
  } else if (move.named('Aura Wheel')) {
    if (attacker.named('Morpeko')) {
      type = 'Electric';
    } else if (attacker.named('Morpeko-Hangry')) {
      type = 'Dark';
    }
  } else if (move.named('Raging Bull')) {
    if (attacker.named('Tauros-Paldea-Combat')) {
      type = 'Fighting';
    } else if (attacker.named('Tauros-Paldea-Blaze')) {
      type = 'Fire';
    } else if (attacker.named('Tauros-Paldea-Aqua')) {
      type = 'Water';
    }
  } else if (move.named('Ivy Cudgel')) {
    if (attacker.name.includes('Ogerpon-Cornerstone')) {
      type = 'Rock';
    } else if (attacker.name.includes('Ogerpon-Hearthflame')) {
      type = 'Fire';
    } else if (attacker.name.includes('Ogerpon-Wellspring')) {
      type = 'Water';
    }
  }

  let hasAteAbilityTypeChange = false;
  let isAerilate = false;
  let isPixilate = false;
  let isRefrigerate = false;
  let isGalvanize = false;
  let isLiquidVoice = false;
  let isNormalize = false;
  let isTypeSync = false;
  let isSawsbuckCrest = false;
  let isSimipourCrest = false;
  let isSimisageCrest = false;
  let isSimisearCrest = false;
  let isDDenIntimidate = false;
  let isStarlightFairy = false;
  const noTypeChange = move.named(
    'Revelation Dance',
    'Judgment',
    'Nature Power',
    'Techno Blast',
    'Multi Attack',
    'Natural Gift',
    'Weather Ball',
    'Terrain Pulse',
    'Struggle',
  ) || (move.named('Tera Blast') && attacker.teraType);

  if (!move.isZ && !noTypeChange) {
    const normal = move.hasType('Normal');
    if ((isAerilate = attacker.hasAbility('Aerilate') && normal)) {
      type = 'Flying';
    } else if ((isGalvanize = (attacker.hasAbility('Galvanize') || attacker.named('Luxray-Crest')) && normal)) {
      type = 'Electric';
    } else if ((isLiquidVoice = attacker.hasAbility('Liquid Voice') && !!move.flags.sound)) {
      type = 'Water';
    } else if ((isPixilate = attacker.hasAbility('Pixilate') && normal)) {
      type = 'Fairy';
    } else if ((isRefrigerate = attacker.hasAbility('Refrigerate') && normal)) {
      type = 'Ice';
    } else if ((isNormalize = attacker.hasAbility('Normalize'))) { // Boosts any type
      type = 'Normal';
    } else if ((isTypeSync = attacker.hasAbility('Type Sync') && normal)) {
      type = attacker.types[0];
    } else if (isSawsbuckCrest = (attacker.named('Sawsbuck-Crest-Autumn') || attacker.named('Sawsbuck-Crest-Spring') ||
                attacker.named('Sawsbuck-Crest-Summer') || attacker.named('Sawsbuck-Crest-Winter')) && normal) {
      type = attacker.types[0];
    } else if ((isSimipourCrest = attacker.named('Simipour-Crest') && normal)) {
      type = 'Grass';
    } else if ((isSimisageCrest = attacker.named('Simisage-Crest') && normal)) {
      type = 'Fire';
    } else if ((isSimisearCrest = attacker.named('Simisear-Crest') && normal)) {
      type = 'Water';
    } else if ((isDDenIntimidate = attacker.hasAbility('Intimidate') && normal && field.chromaticField === "Dragon's Den")) {
      type = 'Dragon';
    } else if ((isStarlightFairy = normal && field.chromaticField === 'Starlight Arena')) {
      type = 'Fairy';
    } else if (move.named('Mirror Beam')) {
      if (attacker.types[1] && attacker.types[1] != ("???" as TypeName)) {
        type = attacker.types[1];
      }
      desc.mirrorBeamType = type;
    }
    if (isGalvanize || isPixilate || isRefrigerate || isAerilate || isNormalize || isTypeSync) {
      desc.attackerAbility = attacker.ability;
      hasAteAbilityTypeChange = true;
    } else if (isLiquidVoice) {
      desc.attackerAbility = attacker.ability;
    } else if (isSawsbuckCrest) {
      hasAteAbilityTypeChange = true;
    } else if (isDDenIntimidate) {
      desc.attackerAbility = attacker.ability;
      desc.moveType = type;
      desc.chromaticField = field.chromaticField;
      hasAteAbilityTypeChange = true;
    } else if (isStarlightFairy) {
      desc.moveType = type;
      desc.chromaticField = field.chromaticField;
    }
  }

  if (move.named('Tera Blast') && attacker.teraType) {
    type = attacker.teraType;
  }

  move.type = type;

  // FIXME: this is incorrect, should be move.flags.heal, not move.drain
  if ((attacker.hasAbility('Triage') && move.drain) ||
      (attacker.hasAbility('Gale Wings') &&
       move.hasType('Flying') &&
       attacker.curHP() === attacker.maxHP())) {
    move.priority = 1;
    desc.attackerAbility = attacker.ability;
  }

  const isGhostRevealed =
    attacker.hasAbility('Scrappy') || attacker.hasAbility('Mind\'s Eye') ||
      field.defenderSide.isForesight;
  const isRingTarget =
    defender.hasItem('Ring Target') && !defender.hasAbility('Klutz');

  let type1 = defender.types[0];
  let type2 = defender.types[1];

  if (defender.hasAbility('Mimicry') && getMimicryType(field) != "???") {
    type1 = getMimicryType(field);
    type2 = "???";

    desc.mimicryDefenseType = type1;
  }

  if (defender.hasAbility('Victory Star') && field.chromaticField === 'Starlight Arena') {
    type1 = 'Fairy' as TypeName;
    desc.mimicryDefenseType = type1;
  }

  let type1Effectiveness = getMoveEffectiveness(
    gen,
    move,
    type1,
    field,
    isGhostRevealed,
    field.isGravity,
    isRingTarget
  );
  let type2Effectiveness = type2
    ? getMoveEffectiveness(
      gen,
      move,
      type2,
      field,
      isGhostRevealed,
      field.isGravity,
      isRingTarget
    )
    : 1;

  if (defender.named('Torterra-Crest')) {
    if (type1Effectiveness == 0)
      type1Effectiveness = 2;
    else
      type1Effectiveness = 1 / type1Effectiveness;

    if (type2Effectiveness == 0)
      type2Effectiveness = 2;
    else
      type2Effectiveness = 1 / type2Effectiveness;
  }

  let typeEffectiveness = type1Effectiveness * type2Effectiveness;
  
  // Crests - Resistances and Immunities

  // Druddigon Crest: Gives immunity to fire type moves
  if (defender.named('Druddigon-Crest')) {
    if (move.hasType('Fire')) // Fire Immunity
      typeEffectiveness = 0;
  }

  // Glaceon Crest: Gives resistance to fighting and rock type moves
  if (defender.named('Glaceon-Crest') && move.hasType('Fighting', 'Rock')) {
    typeEffectiveness = 0.5;
  }

  // Leafeon Crest: Gives resistance to fire and flying type moves
  if (defender.named('Leafeon-Crest') && move.hasType('Fire', 'Flying')) {
    typeEffectiveness = 0.5;
  }

  // Luxray Crest: Gives resistance to dark and ghost type moves, and immunity to psychic type moves (dark pseudo-typing)
  if (defender.named('Luxray-Crest')) {
    if (move.hasType('Dark', 'Ghost')) // Dark Resistances
      typeEffectiveness *= 0.5;
    if (move.hasType('Psychic')) // Dark Immunities
      typeEffectiveness = 0;
  }

  // Samurott Crest: Gives resistances to dark, bug and rock type moves (fighting pseudo-typing)
  if (defender.named('Samurott-Crest')) {
    if (move.hasType('Dark', 'Bug', 'Rock')) // Fighting Resistances
      typeEffectiveness *= 0.5;
  }

  // Simipour Crest: Gives resistance to grass, water, ground and electric type moves (grass pseudo-typing)
  if (defender.named('Simipour-Crest')) {
    if (move.hasType('Grass', 'Water', 'Ground', 'Electric')) // Grass Resistances
      typeEffectiveness *= 0.5;
  }

  // Simisage Crest: Gives resistance to grass, fire, bug, ice, steel and fairy type moves (fire pseudo-typing)
  if (defender.named('Simisage-Crest')) {
    if (move.hasType('Grass', 'Fire', 'Bug', 'Ice', 'Steel', 'Fairy')) // Fire Resistances
      typeEffectiveness *= 0.5;
  }

  // Simisear Crest: Gives resistance to fire, water, ice and steel type moves (water pseudo-typing)
  if (defender.named('Simisear-Crest')) {
    if (move.hasType('Fire', 'Water', 'Ice', 'Steel')) // Water Resistances
      typeEffectiveness *= 0.5;
  }

  // Skuntank Crest: Gives ground immunity
  if (defender.named('Skuntank-Crest')) {
    if (move.hasType('Ground')) // Ground Immunity
      typeEffectiveness = 0;
  }

  // Whiscash Crest: Gives grass immunity
  if (defender.named('Whiscash-Crest')) {
    if (move.hasType('Grass')) // Grass Immunity
      typeEffectiveness = 0;
  }

  if (defender.teraType && defender.teraType !== 'Stellar') {
    typeEffectiveness = getMoveEffectiveness(
      gen,
      move,
      defender.teraType,
      field,
      isGhostRevealed,
      field.isGravity,
      isRingTarget
    );
  }

  if (typeEffectiveness === 0 && move.hasType('Ground') &&
    defender.hasItem('Iron Ball') && !defender.hasAbility('Klutz')) {
    typeEffectiveness = 1;
  }

  if (typeEffectiveness === 0 && move.named('Thousand Arrows')) {
    typeEffectiveness = 1;
  }

  if (typeEffectiveness === 0 && field.chromaticField === "Dragon's Den" && move.named('Dragon Pulse')) {
    typeEffectiveness = 0.5;
    desc.chromaticField = field.chromaticField;
  }

  if (typeEffectiveness === 0) {
    return result;
  }

  if ((move.named('Sky Drop') &&
        ((defender.hasType('Flying') || defender.hasInvisisbleType(attacker, field, 'Flying')) || defender.weightkg >= 200 || field.isGravity)) ||
      (move.named('Synchronoise') && (!defender.hasType(attacker.types[0]) && !defender.hasInvisisbleType(attacker, field, attacker.types[0])) &&
        (!attacker.types[1] || !defender.hasType(attacker.types[1]))) ||
      (move.named('Dream Eater') &&
        (!(defender.hasStatus('slp') || defender.hasAbility('Comatose')))) ||
      (move.named('Steel Roller') && !field.terrain) ||
      (move.named('Poltergeist') && (!defender.item || isQPActive(defender, field)))
  ) {
    return result;
  }

  if (
    (field.hasWeather('Harsh Sunshine') && move.hasType('Water')) ||
    (field.hasWeather('Heavy Rain') && move.hasType('Fire'))
  ) {
    desc.weather = field.weather;
    return result;
  }

  if (field.hasWeather('Strong Winds') && (defender.hasType('Flying') || defender.hasInvisisbleType(attacker, field, 'Flying')) &&
      gen.types.get(toID(move.type))!.effectiveness['Flying']! > 1) {
    typeEffectiveness /= 2;
    desc.weather = field.weather;
  }

  // Fields - Text Stuff

  if (field.chromaticField === 'Eclipse' && move.named('Solar Beam', 'Solar Blade')) {
    desc.chromaticField = field.chromaticField;
    return result;
  }

  if (field.chromaticField === 'Jungle' && move.named('Air Cutter', 'Air Slash', 'Cut', 'Fury Cutter', 'Psycho Cut', 'Slash')) {
    desc.moveType = '+ Grass' as TypeName;
    desc.chromaticField = field.chromaticField;
  }

  if (field.chromaticField === 'Jungle' && move.named('Fell Stinger', 'Silver Wind', 'Steamroller')) {
    desc.chromaticField = field.chromaticField;
  }

  if (field.chromaticField === 'Starlight Arena' && attacker.hasAbility("Illuminate") && move.category === 'Special') {
    desc.chromaticField = field.chromaticField;
  }

  if (move.type === 'Stellar') {
    typeEffectiveness = !defender.teraType ? 1 : 2;
  }

  // Tera Shell works only at full HP, but for all hits of multi-hit moves
  if (defender.hasAbility('Tera Shell') &&
      defender.curHP() === defender.maxHP() &&
      (!field.defenderSide.isSR && (!field.defenderSide.spikes || defender.hasType('Flying')) ||
      defender.hasItem('Heavy-Duty Boots'))
  ) {
    typeEffectiveness = 0.5;
    desc.defenderAbility = defender.ability;
  }

  if ((defender.hasAbility('Wonder Guard') && typeEffectiveness <= 1) ||
      (move.hasType('Grass') && defender.hasAbility('Sap Sipper')) ||
      (move.hasType('Fire') && (defender.hasAbility('Flash Fire', 'Well-Baked Body'))) ||
      (move.hasType('Water') && defender.hasAbility('Dry Skin', 'Storm Drain', 'Water Absorb')) ||
      (move.hasType('Electric') &&
        defender.hasAbility('Lightning Rod', 'Motor Drive', 'Volt Absorb')) ||
      (move.hasType('Ground') &&
        !field.isGravity && !move.named('Thousand Arrows') &&
        !defender.hasItem('Iron Ball') &&
        (defender.hasAbility('Levitate') || defender.hasAbility('Lunar Idol') ||
        defender.hasAbility('Solar Idol') || defender.named('Probopass-Crest'))) ||
      (move.flags.bullet && defender.hasAbility('Bulletproof')) ||
      (move.flags.sound && !move.named('Clangorous Soul') && defender.hasAbility('Soundproof')) ||
      (move.priority > 0 && defender.hasAbility('Queenly Majesty', 'Dazzling', 'Armor Tail')) ||
      (move.hasType('Ground') && defender.hasAbility('Earth Eater')) ||
      (move.flags.wind && defender.hasAbility('Wind Rider'))
  ) {
    desc.defenderAbility = defender.ability;
    return result;
  }

  if (move.hasType('Ground') && !move.named('Thousand Arrows') &&
      !field.isGravity && defender.hasItem('Air Balloon')) {
    desc.defenderItem = defender.item;
    return result;
  }

  if (move.priority > 0 && field.hasTerrain('Psychic') && isGrounded(defender, field)) {
    desc.terrain = field.terrain;
    return result;
  }

  const weightBasedMove = move.named('Heat Crash', 'Heavy Slam', 'Low Kick', 'Grass Knot');
  if (defender.isDynamaxed && weightBasedMove) {
    return result;
  }

  desc.HPEVs = `${defender.evs.hp} HP`;

  const fixedDamage = handleFixedDamageMoves(attacker, move);
  if (fixedDamage) {
    if (attacker.hasAbility('Parental Bond')) {
      result.damage = [fixedDamage, fixedDamage];
      desc.attackerAbility = attacker.ability;
    } else {
      result.damage = fixedDamage;
    }
    return result;
  }

  if (move.named('Final Gambit')) {
    result.damage = attacker.curHP();
    return result;
  }

  if (move.named('Guardian of Alola')) {
    let zLostHP = Math.floor((defender.curHP() * 3) / 4);
    if (field.defenderSide.isProtected && attacker.item && attacker.item.includes(' Z')) {
      zLostHP = Math.ceil(zLostHP / 4 - 0.5);
    }
    result.damage = zLostHP;
    return result;
  }

  if (move.named('Nature\'s Madness')) {
    const lostHP = field.defenderSide.isProtected ? 0 : Math.floor(defender.curHP() / 2);
    result.damage = lostHP;
    return result;
  }

  if (move.named('Spectral Thief')) {
    let stat: StatID;
    for (stat in defender.boosts) {
      if (defender.boosts[stat] > 0) {
        attacker.boosts[stat] +=
          attacker.hasAbility('Contrary') ? -defender.boosts[stat]! : defender.boosts[stat]!;
        if (attacker.boosts[stat] > 6) attacker.boosts[stat] = 6;
        if (attacker.boosts[stat] < -6) attacker.boosts[stat] = -6;
        attacker.stats[stat] = getModifiedStat(attacker.rawStats[stat]!, attacker.boosts[stat]!);
        defender.boosts[stat] = 0;
        defender.stats[stat] = defender.rawStats[stat];
      }
    }
  }

  if (move.hits > 1) {
    desc.hits = move.hits;
  }

  const turnOrder = attacker.stats.spe > defender.stats.spe ? 'first' : 'last';

  // #endregion
  // #region Base Power

  const basePower = calculateBasePowerSMSSSV(
    gen,
    attacker,
    defender,
    move,
    field,
    hasAteAbilityTypeChange,
    desc
  );
  if (basePower === 0) {
    return result;
  }

  // #endregion
  // #region (Special) Attack
  const attack = calculateAttackSMSSSV(gen, attacker, defender, move, field, desc, isCritical);
  const attackSource = move.named('Foul Play') ? defender : attacker;
  if (move.named('Photon Geyser', 'Light That Burns The Sky') ||
      (move.named('Tera Blast') && attackSource.teraType)) {
    move.category = attackSource.stats.atk > attackSource.stats.spa ? 'Physical' : 'Special';
  }

  // Crests - Attack Stat Swaps (if combat stages included)
  const attackStat =
    move.named('Shell Side Arm') &&
    getShellSideArmCategory(attacker, defender) === 'Physical'
      ? 'atk'
      : move.named('Body Press')
        ? 'def'
        : attacker.named('Infernape-Crest')
          ? (move.category === 'Special' ? 'spd' : 'def') // Infernape Crest: Uses defense stat (changes) instead of offense stat (changes)
          : attacker.named('Reuniclus-Crest-Fighting')
            ? (move.category === 'Special' ? 'atk' : 'spa') // Reuniclus Crest (Fighting): Swaps offense stat (changes)
            : attacker.named('Typhlosion-Crest') && move.category === 'Physical'
              ? 'spa' // Typhlosion Crest: Uses special attack stat (changes) instead of physical attack stat (changes)
              : move.category === 'Special'
                ? 'spa'
                : 'atk';
  // #endregion
  // #region (Special) Defense

  const defense = calculateDefenseSMSSSV(gen, attacker, defender, move, field, desc, isCritical);
  const hitsPhysical = move.overrideDefensiveStat === 'def' || move.category === 'Physical' ||
    (move.named('Shell Side Arm') && getShellSideArmCategory(attacker, defender) === 'Physical');

  // Crests - Defense Stat Swaps (if combat stages included)
  const defenseStat =
    (defender.named('Infernape-Crest'))
      ? (move.category === 'Special' ? 'spa' : 'atk') // Infernape Crest: Uses offense stat (changes) instead of defense stat (changes)
      : (defender.named('Magcargo-Crest') && hitsPhysical)
        ? 'spe' // Magcargo Crest: Uses speed stat (changes) instead of defense stat (changes)
        : hitsPhysical
          ? 'def'
          : 'spd';

  // #endregion
  // #region Damage

  const baseDamage = calculateBaseDamageSMSSSV(
    gen,
    attacker,
    defender,
    basePower,
    attack,
    defense,
    move,
    field,
    desc,
    isCritical
  );

  if (hasTerrainSeed(defender) &&
    field.hasTerrain(defender.item!.substring(0, defender.item!.indexOf(' ')) as Terrain) &&
    SEED_BOOSTED_STAT[defender.item!] === defenseStat) {
    // Last condition applies so the calc doesn't show a seed where it wouldn't affect the outcome
    // (like Grassy Seed when being hit by a special move)
    desc.defenderItem = defender.item;
  }

  // the random factor is applied between the crit mod and the stab mod, so don't apply anything
  // below this until we're inside the loop
  let stabMod = 4096;
  if (attacker.hasOriginalType(move.type) || attacker.hasAbility('Mastery')) {
    stabMod += 2048;
  } else if ((attacker.hasAbility('Protean', 'Libero') || attacker.named('Boltund-Crest')) && !attacker.teraType) {
    stabMod += 2048;
    desc.attackerAbility = attacker.ability;
  } else if (attacker.hasAbility('Mimicry') && getMimicryType(field) === move.type) {
    stabMod += 2048;
    desc.mimicryOffenseType = getMimicryType(field);
  } else if (attacker.hasAbility('Victory Star') && field.chromaticField === 'Starlight Arena' && move.hasType('Fairy')) {
    stabMod += 2048;
    desc.chromaticField = field.chromaticField;
  // Crests - STAB additions
  } else if (attacker.named('Empoleon-Crest') && move.hasType('Ice')) {
    stabMod += 2048;
  } else if (attacker.named('Luxray-Crest') && move.hasType('Dark')) {
    stabMod += 2048;
  } else if ((attacker.named('Probopass-Crest') || attacker.named('Electric Nose')) && move.hasType('Electric')) {
    stabMod += 2048;
  } else if (attacker.named('Samurott-Crest') && move.hasType('Fighting')) {
    stabMod += 2048;
  } else if (attacker.named('Simipour-Crest') && move.hasType('Grass')) {
    stabMod += 2048;
  } else if (attacker.named('Simisage-Crest') && move.hasType('Fire')) {
    stabMod += 2048;
  } else if (attacker.named('Simisear-Crest') && move.hasType('Water')) {
    stabMod += 2048;
  } 

  const teraType = attacker.teraType;
  if (teraType === move.type && teraType !== 'Stellar') {
    stabMod += 2048;
    desc.attackerTera = teraType;
  }
  if (attacker.hasAbility('Adaptability') && attacker.hasType(move.type)) {
    stabMod += teraType && attacker.hasOriginalType(teraType) ? 1024 : 2048;
    desc.attackerAbility = attacker.ability;
  }

  // TODO: For now all moves are always boosted
  const isStellarBoosted =
    attacker.teraType === 'Stellar' &&
    (move.isStellarFirstUse || attacker.named('Terapagos-Stellar'));
  if (isStellarBoosted) {
    if (attacker.hasOriginalType(move.type)) {
      stabMod += 2048;
    } else {
      stabMod = 4915;
    }
  } else if (attacker.hasAbility('Pixilate') && field.chromaticField === 'Starlight Arena') {
    if (attacker.hasOriginalType(move.type)) {
      stabMod += 2048;
    } else {
      stabMod = 4915;
    }
    desc.attackerTera = 'Stellar';
    desc.chromaticField = field.chromaticField;
  }

  const applyBurn =
    attacker.hasStatus('brn') &&
    move.category === 'Physical' &&
    !attacker.hasAbility('Guts') &&
    !move.named('Facade');
  desc.isBurned = applyBurn;
  const finalMods = calculateFinalModsSMSSSV(
    gen,
    attacker,
    defender,
    move,
    field,
    desc,
    isCritical,
    typeEffectiveness
  );

  let protect = false;
  if (field.defenderSide.isProtected &&
    (attacker.isDynamaxed || (move.isZ && attacker.item && attacker.item.includes(' Z')))) {
    protect = true;
    desc.isProtected = true;
  }

  const finalMod = chainMods(finalMods, 41, 131072);

  const isSpread = field.gameType !== 'Singles' &&
     ['allAdjacent', 'allAdjacentFoes'].includes(move.target);

  let childDamage: number[] | undefined;
  if (attacker.hasAbility('Parental Bond') && move.hits === 1 && !isSpread) {
    const child = attacker.clone();
    child.ability = 'Parental Bond (Child)' as AbilityName;
    checkMultihitBoost(gen, child, defender, move, field, desc);
    childDamage = calculateSMSSSV(gen, child, defender, move, field).damage as number[];
    desc.attackerAbility = attacker.ability;
  }

  let noseDamage: number[] | undefined;;
  if (attacker.named('Probopass-Crest') && !['Electric POGCHAMPION', 'Rock POGCHAMPION', 'Steel POGCHAMPION'].includes(move.name) && move.hits === 1) {
    const noseElectric = attacker.clone();
    const noseRock = attacker.clone();
    const noseSteel = attacker.clone();
    noseElectric.name = 'Electric Nose' as SpeciesName;
    noseRock.name = 'Rock Nose' as SpeciesName;
    noseSteel.name = 'Steel Nose' as SpeciesName;
    let noseMove = move.clone(); 
    noseMove.bp = 20;
    noseMove.category = 'Special';
    desc.attackerAbility = "POGCHAMPION";

    noseMove.type = 'Electric';
    noseMove.name = 'Electric POGCHAMPION' as MoveName;
    checkMultihitBoost(gen, noseElectric, defender, noseMove, field, desc);
    let noseElectricDamage = calculateSMSSSV(gen, noseElectric, defender, noseMove, field).damage as number[];

    noseMove.type = 'Rock';
    noseMove.name = 'Rock POGCHAMPION' as MoveName;
    checkMultihitBoost(gen, noseRock, defender, noseMove, field, desc);
    let noseRockDamage = calculateSMSSSV(gen, noseRock, defender, noseMove, field).damage as number[];

    noseMove.type = 'Steel';
    noseMove.name = 'Steel POGCHAMPION' as MoveName;
    checkMultihitBoost(gen, noseSteel, defender, noseMove, field, desc);
    let noseSteelDamage = calculateSMSSSV(gen, noseSteel, defender, noseMove, field).damage as number[];

    noseDamage = noseElectricDamage

    for (let i = 0; i < 16; i++) {
      noseDamage[i] = noseElectricDamage[i] + noseRockDamage[i] + noseSteelDamage[i];
    }
  }

  let spitUpDamage: number[] | undefined;
  if (attacker.named('Swalot-Crest') && move.named('Belch') && !(move.stockpiles === undefined) && move.stockpiles > 0 && move.hits === 1 && !isSpread) {
    const spitUp = move.clone();
    spitUp.name = 'Spit Up' as MoveName;
    spitUp.type = 'Normal';
    spitUp.category = 'Special';

    checkMultihitBoost(gen, attacker, defender, spitUp, field, desc);
    spitUpDamage = calculateSMSSSV(gen, attacker, defender, spitUp, field).damage as number[];
    switch (move.stockpiles)
    {
      case 1:
        desc.attackerAbility = "Spit Up (100 BP)";
        break;
      case 2:
        desc.attackerAbility = "Spit Up (200 BP)";
        break;
      case 3:
      default:
        desc.attackerAbility = "Spit Up (300 BP)";
        break;
    }
  }

  let typhlosionDamage: number[] | undefined;
  if (attacker.named('Typhlosion-Crest') && !attacker.hasAbility('Parental Bond (Typhlosion)') && move.flags.contact && !handleFixedDamageMoves(attacker, move) && move.hits === 1 && !isSpread) {
    const clone = attacker.clone();
    clone.ability = 'Parental Bond (Typhlosion)' as AbilityName;
    checkMultihitBoost(gen, clone, defender, move, field, desc);
    typhlosionDamage = calculateSMSSSV(gen, clone, defender, move, field).damage as number[];
    desc.attackerAbility = "Parental Bond";
  }

  let damage = [];
  for (let i = 0; i < 16; i++) {
    damage[i] =
      getFinalDamage(baseDamage, i, typeEffectiveness, applyBurn, stabMod, finalMod, protect);
  }

  if (move.dropsStats && move.timesUsed! > 1) {
    const simpleMultiplier = attacker.hasAbility('Simple') ? 2 : 1;
    let dropsStats = move.dropsStats;
    
    if (field.chromaticField === "Dragon's Den" && move.named("Draco Meteor")) {
      move.dropsStats = 1;
      desc.chromaticField = field.chromaticField;
    }

    desc.moveTurns = `over ${move.timesUsed} turns`;
    const hasWhiteHerb = attacker.hasItem('White Herb');
    let usedWhiteHerb = false;
    let dropCount = 0;
    for (let times = 0; times < move.timesUsed!; times++) {
      const newAttack = getModifiedStat(attack, dropCount);
      let damageMultiplier = 0;
      damage = damage.map(affectedAmount => {
        if (times) {
          const newBaseDamage = getBaseDamage(attacker.level, basePower, newAttack, defense);
          const newFinalDamage = getFinalDamage(
            newBaseDamage,
            damageMultiplier,
            typeEffectiveness,
            applyBurn,
            stabMod,
            finalMod,
            protect
          );
          damageMultiplier++;
          return affectedAmount + newFinalDamage;
        }
        return affectedAmount;
      });

      if (attacker.hasAbility('Contrary')) {
        dropCount = Math.min(6, dropCount + dropsStats);
        desc.attackerAbility = attacker.ability;
      } else {
        dropCount = Math.max(-6, dropCount - dropsStats * simpleMultiplier);
        if (attacker.hasAbility('Simple')) {
          desc.attackerAbility = attacker.ability;
        }
      }

      // the Pokémon hits THEN the stat rises / lowers
      if (hasWhiteHerb && attacker.boosts[attackStat] < 0 && !usedWhiteHerb) {
        dropCount += dropsStats * simpleMultiplier;
        usedWhiteHerb = true;
        desc.attackerItem = attacker.item;
      }
    }
  }

  if (move.hits > 1) {
    let defenderDefBoost = 0;
    for (let times = 0; times < move.hits; times++) {
      const newDefense = getModifiedStat(defense, defenderDefBoost);
      let damageMultiplier = 0;
      damage = damage.map(affectedAmount => {
        if (times) {
          const newFinalMods = calculateFinalModsSMSSSV(
            gen,
            attacker,
            defender,
            move,
            field,
            desc,
            isCritical,
            typeEffectiveness,
            times
          );
          const newFinalMod = chainMods(newFinalMods, 41, 131072);
          const newBaseDamage = calculateBaseDamageSMSSSV(
            gen,
            attacker,
            defender,
            basePower,
            attack,
            newDefense,
            move,
            field,
            desc,
            isCritical
          );
          const newFinalDamage = getFinalDamage(
            newBaseDamage,
            damageMultiplier,
            typeEffectiveness,
            applyBurn,
            stabMod,
            newFinalMod,
            protect
          );
          damageMultiplier++;
          return affectedAmount + newFinalDamage;
        }
        return affectedAmount;
      });
      if (hitsPhysical && defender.ability === 'Stamina') {
        defenderDefBoost = Math.min(6, defenderDefBoost + 1);
        desc.defenderAbility = 'Stamina';
      } else if (hitsPhysical && defender.ability === 'Weak Armor') {
        defenderDefBoost = Math.max(-6, defenderDefBoost - 1);
        desc.defenderAbility = 'Weak Armor';
      }
    }
  }

  desc.attackBoost =
    move.named('Foul Play') ? defender.boosts[attackStat] : attacker.boosts[attackStat];

  result.damage =
    childDamage
      ? [damage, childDamage]
      : noseDamage
        ? [damage, noseDamage]
        : spitUpDamage
          ? [damage, spitUpDamage]
          : typhlosionDamage
            ? [damage, typhlosionDamage]
            : damage;

  // #endregion

  return result;
}

export function calculateBasePowerSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  hasAteAbilityTypeChange: boolean,
  desc: RawDesc
) {
  const turnOrder = attacker.stats.spe > defender.stats.spe ? 'first' : 'last';

  let basePower: number;

  switch (move.name) {
  case 'Payback':
    basePower = move.bp * (turnOrder === 'last' ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Bolt Beak':
  case 'Fishious Rend':
    basePower = move.bp * (turnOrder !== 'last' ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Pursuit':
    const switching = field.defenderSide.isSwitching === 'out';
    basePower = move.bp * (switching ? 2 : 1);
    if (switching) desc.isSwitching = 'out';
    desc.moveBP = basePower;
    break;
  case 'Electro Ball':
    const r = Math.floor(attacker.stats.spe / defender.stats.spe);
    basePower = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40;
    if (defender.stats.spe === 0) basePower = 40;
    desc.moveBP = basePower;
    break;
  case 'Gyro Ball':
    basePower = Math.min(150, Math.floor((25 * defender.stats.spe) / attacker.stats.spe) + 1);
    if (attacker.stats.spe === 0) basePower = 1;
    desc.moveBP = basePower;
    break;
  case 'Punishment':
    basePower = Math.min(200, 60 + 20 * countBoosts(gen, defender.boosts));
    desc.moveBP = basePower;
    break;
  case 'Low Kick':
  case 'Grass Knot':
    const w = defender.weightkg * getWeightFactor(defender);
    basePower = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
    desc.moveBP = basePower;
    break;
  case 'Hex':
  case 'Infernal Parade':
  case 'Irritation':
    // Hex deals double damage to Pokemon with Comatose (ih8ih8sn0w)
    basePower = move.bp * (defender.status || defender.hasAbility('Comatose') ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Barb Barrage':
    basePower = move.bp * (defender.hasStatus('psn', 'tox') ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Heavy Slam':
  case 'Heat Crash':
    const wr =
        (attacker.weightkg * getWeightFactor(attacker)) /
        (defender.weightkg * getWeightFactor(defender));
    basePower = wr >= 5 ? 120 : wr >= 4 ? 100 : wr >= 3 ? 80 : wr >= 2 ? 60 : 40;
    desc.moveBP = basePower;
    break;
  case 'Stored Power':
  case 'Power Trip':
    basePower = 20 + 20 * countBoosts(gen, attacker.boosts);
    desc.moveBP = basePower;
    break;
  case 'Acrobatics':
    basePower = move.bp * (attacker.hasItem('Flying Gem') ||
        (!attacker.item || isQPActive(attacker, field)) ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Assurance':
    basePower = move.bp * (defender.hasAbility('Parental Bond (Child)') ? 2 : 1);
    // NOTE: desc.attackerAbility = 'Parental Bond' will already reflect this boost
    break;
  case 'Wake-Up Slap':
  case 'Waking Shock':
    // Wake-Up Slap deals double damage to Pokemon with Comatose (ih8ih8sn0w)
    basePower = move.bp * (defender.hasStatus('slp') || defender.hasAbility('Comatose') ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Smelling Salts':
    basePower = move.bp * (defender.hasStatus('par') ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Weather Ball':
    basePower = move.bp * (field.weather && !field.hasWeather('Strong Winds') ? 2 : 1);
    if (field.hasWeather('Sun', 'Harsh Sunshine', 'Rain', 'Heavy Rain') &&
      attacker.hasItem('Utility Umbrella')) basePower = move.bp;
    desc.moveBP = basePower;
    break;
  case 'Terrain Pulse':
    basePower = move.bp * (isGrounded(attacker, field) && field.terrain ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Rising Voltage':
    basePower = move.bp * ((isGrounded(defender, field) && field.hasTerrain('Electric')) ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Psyblade':
    basePower = move.bp * (field.hasTerrain('Electric') ? 1.5 : 1);
    if (field.hasTerrain('Electric')) {
      desc.moveBP = basePower;
      desc.terrain = field.terrain;
    }
    break;
  case 'Fling':
    basePower = getFlingPower(attacker.item);
    desc.moveBP = basePower;
    desc.attackerItem = attacker.item;
    break;
  case 'Dragon Energy':
  case 'Eruption':
  case 'Water Spout':
    basePower = Math.max(1, Math.floor((150 * attacker.curHP()) / attacker.maxHP()));
    desc.moveBP = basePower;
    break;
  case 'Flail':
  case 'Reversal':
    const p = Math.floor((48 * attacker.curHP()) / attacker.maxHP());
    basePower = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20;
    desc.moveBP = basePower;
    break;
  case 'Natural Gift':
    if (attacker.item?.includes('Berry')) {
      const gift = getNaturalGift(gen, attacker.item)!;
      basePower = gift.p;
      desc.attackerItem = attacker.item;
      desc.moveBP = move.bp;
    } else {
      basePower = move.bp;
    }
    break;
  case 'Nature Power':
    move.category = 'Special';
    move.secondaries = true;
    switch (field.terrain) {
    case 'Electric':
      basePower = 90;
      desc.moveName = 'Thunderbolt';
      break;
    case 'Grassy':
      basePower = 90;
      desc.moveName = 'Energy Ball';
      break;
    case 'Misty':
      basePower = 95;
      desc.moveName = 'Moonblast';
      break;
    case 'Psychic':
      basePower = 90;
      desc.moveName = 'Psychic';
      break;
    default:
      basePower = 80;
      desc.moveName = 'Tri Attack';
    }
    // Fields - Nature Power
    if (desc.moveName === 'Tri Attack')
      switch (field.chromaticField) {
      case 'Jungle':
        basePower = 90;
        desc.moveName = 'Bug Buzz';
        break;
      case 'Eclipse':
        basePower = 80;
        desc.moveName = 'Dark Pulse';
        break;
      case "Dragon's Den":
        basePower = 120;
        desc.moveName = 'Make It Rain';
        break;
      case 'Thundering Plateau':
        basePower = 60;
        desc.moveName = 'Shock Wave';
        break;
      case 'Starlight Arena':
        basePower = 0;
        desc.moveName = 'Lunar Dance';
        break;
      default:
        basePower = 80;
        desc.moveName = 'Tri Attack';
      }
    break;
  case 'Water Shuriken':
    basePower = attacker.named('Greninja-Ash') && attacker.hasAbility('Battle Bond') ? 20 : 15;
    desc.moveBP = basePower;
    break;
  // Triple Axel's damage doubles after each consecutive hit (20, 40, 60), this is a hack
  case 'Triple Axel':
    basePower = move.hits === 2 ? 30 : move.hits === 3 ? 40 : 20;
    desc.moveBP = basePower;
    break;
  // Triple Kick's damage doubles after each consecutive hit (10, 20, 30), this is a hack
  case 'Triple Kick':
    basePower = move.hits === 2 ? 15 : move.hits === 3 ? 30 : 10;
    desc.moveBP = basePower;
    break;
  case 'Crush Grip':
  case 'Wring Out':
  case 'Hard Press':
    basePower = 100 * Math.floor((defender.curHP() * 4096) / defender.maxHP());
    basePower = Math.floor(Math.floor((120 * basePower + 2048 - 1) / 4096) / 100) || 1;
    desc.moveBP = basePower;
    break;
  case 'Tera Blast':
    basePower = attacker.teraType === 'Stellar' ? 100 : 80;
    desc.moveBP = basePower;
    break;
  case 'Spit Up':
    basePower = move.stockpiles === undefined ? 0 : move.stockpiles * 100;
    desc.moveBP = basePower;
    break;
  default:
    basePower = move.bp;
  }

  if (attacker.named('Cinccino-Crest')) {
    basePower *= 0.35;
  }

  if (attacker.named('Luvdisc-Crest') && basePower != 0) {
    basePower = 250;
  }

  if (basePower === 0) {
    return 0;
  }
  if (move.named(
    'Breakneck Blitz', 'Bloom Doom', 'Inferno Overdrive', 'Hydro Vortex', 'Gigavolt Havoc',
    'Subzero Slammer', 'Supersonic Skystrike', 'Savage Spin-Out', 'Acid Downpour', 'Tectonic Rage',
    'Continental Crush', 'All-Out Pummeling', 'Shattered Psyche', 'Never-Ending Nightmare',
    'Devastating Drake', 'Black Hole Eclipse', 'Corkscrew Crash', 'Twinkle Tackle'
  )) {
    // show z-move power in description
    desc.moveBP = move.bp;
  }
  const bpMods = calculateBPModsSMSSSV(
    gen,
    attacker,
    defender,
    move,
    field,
    desc,
    basePower,
    hasAteAbilityTypeChange,
    turnOrder
  );
  basePower = OF16(Math.max(1, pokeRound((basePower * chainMods(bpMods, 41, 2097152)) / 4096)));
  if (
    attacker.teraType && move.type === attacker.teraType &&
    (attacker.hasType(attacker.teraType) || attacker.hasInvisisbleType(defender, field, attacker.teraType)) && move.hits === 1 &&
    move.priority <= 0 && move.bp > 0 && !move.named('Dragon Energy', 'Eruption', 'Water Spout') &&
    basePower < 60 && gen.num >= 9
  ) {
    basePower = 60;
    desc.moveBP = 60;
  }
  return basePower;
}

export function calculateBPModsSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  desc: RawDesc,
  basePower: number,
  hasAteAbilityTypeChange: boolean,
  turnOrder: string
) {
  const bpMods = [];

  // Move effects

  let resistedKnockOffDamage =
    (!defender.item || isQPActive(defender, field)) ||
    (defender.named('Dialga-Origin') && defender.hasItem('Adamant Crystal')) ||
    (defender.named('Palkia-Origin') && defender.hasItem('Lustrous Globe')) ||
    // Griseous Core for gen 9, Griseous Orb otherwise
    (defender.name.includes('Giratina-Origin') && defender.item.includes('Griseous')) ||
    (defender.name.includes('Arceus') && defender.item.includes('Plate')) ||
    (defender.name.includes('Genesect') && defender.item.includes('Drive')) ||
    (defender.named('Groudon', 'Groudon-Primal') && defender.hasItem('Red Orb')) ||
    (defender.named('Kyogre', 'Kyogre-Primal') && defender.hasItem('Blue Orb')) ||
    (defender.name.includes('Silvally') && defender.item.includes('Memory')) ||
    defender.item.includes(' Z') ||
    (defender.named('Zacian') && defender.hasItem('Rusted Sword')) ||
    (defender.named('Zamazenta') && defender.hasItem('Rusted Shield')) ||
    (defender.name.includes('Ogerpon-Cornerstone') && defender.hasItem('Cornerstone Mask')) ||
    (defender.name.includes('Ogerpon-Hearthflame') && defender.hasItem('Hearthflame Mask')) ||
    (defender.name.includes('Ogerpon-Wellspring') && defender.hasItem('Wellspring Mask')) ||
    (defender.named('Venomicon-Epilogue') && defender.hasItem('Vile Vial'));

  // The last case only applies when the Pokemon has the Mega Stone that matches its species
  // (or when it's already a Mega-Evolution)
  if (!resistedKnockOffDamage && defender.item) {
    const item = gen.items.get(toID(defender.item))!;
    resistedKnockOffDamage = !!item.megaEvolves && defender.name.includes(item.megaEvolves);
  }

  if ((move.named('Facade') && attacker.hasStatus('brn', 'par', 'psn', 'tox')) ||
    (move.named('Brine') && defender.curHP() <= defender.maxHP() / 2) ||
    (move.named('Venoshock') && defender.hasStatus('psn', 'tox')) ||
    (move.named('Lash Out') && (countBoosts(gen, attacker.boosts) < 0))
  ) {
    bpMods.push(8192);
    desc.moveBP = basePower * 2;
  } else if (
    move.named('Expanding Force') && isGrounded(attacker, field) && field.hasTerrain('Psychic')
  ) {
    move.target = 'allAdjacentFoes';
    bpMods.push(6144);
    desc.moveBP = basePower * 1.5;
  } else if (
    move.named('Tera Starstorm') && attacker.name === 'Terapagos-Stellar'
  ) {
    move.target = 'allAdjacentFoes';
    move.type = 'Stellar';
  } else if ((move.named('Knock Off') && !resistedKnockOffDamage) ||
    (move.named('Misty Explosion') && isGrounded(attacker, field) && field.hasTerrain('Misty')) ||
    (move.named('Grav Apple') && field.isGravity)
  ) {
    bpMods.push(6144);
    desc.moveBP = basePower * 1.5;
  } else if (move.named('Solar Beam', 'Solar Blade') &&
      field.hasWeather('Rain', 'Heavy Rain', 'Sand', 'Hail', 'Snow')) {
    bpMods.push(2048);
    desc.moveBP = basePower / 2;
    desc.weather = field.weather;
  } else if (move.named('Collision Course', 'Electro Drift')) {
    const isGhostRevealed =
      attacker.hasAbility('Scrappy') || attacker.hasAbility('Mind\'s Eye') ||
      field.defenderSide.isForesight;
    const isRingTarget =
      defender.hasItem('Ring Target') && !defender.hasAbility('Klutz');
    const types = defender.teraType ? [defender.teraType] : defender.types;
    const type1Effectiveness = getMoveEffectiveness(
      gen,
      move,
      types[0],
      field,
      isGhostRevealed,
      field.isGravity,
      isRingTarget
    );
    const type2Effectiveness = types[1] ? getMoveEffectiveness(
      gen,
      move,
      types[1],
      field,
      isGhostRevealed,
      field.isGravity,
      isRingTarget
    ) : 1;
    if (type1Effectiveness * type2Effectiveness >= 2) {
      bpMods.push(5461);
      desc.moveBP = basePower * (5461 / 4096);
    }
  }

  if (field.attackerSide.isHelpingHand) {
    bpMods.push(6144);
    desc.isHelpingHand = true;
  }

  // Field effects

  const terrainMultiplier = gen.num > 7 ? 5325 : 6144;
  if (isGrounded(attacker, field)) {
    if ((field.hasTerrain('Electric') && move.hasType('Electric')) ||
        (field.hasTerrain('Grassy') && move.hasType('Grass')) ||
        (field.hasTerrain('Psychic') && move.hasType('Psychic'))
    ) {
      bpMods.push(terrainMultiplier);
      desc.terrain = field.terrain;
    }
  }
  if (isGrounded(defender, field)) {
    if ((field.hasTerrain('Misty') && move.hasType('Dragon')) ||
        (field.hasTerrain('Grassy') && move.named('Bulldoze', 'Earthquake'))
    ) {
      bpMods.push(2048);
      desc.terrain = field.terrain;
    }
  }

  if (field.chromaticField === 'Eclipse' && attacker.hasType('Dark')) {
    let doBoost = false;
    let stat: StatID;
    for (stat in defender.boosts) {
      if (defender.boosts[stat] < 0 || attacker.boosts[stat] < 0) {
        doBoost = true;
        break;
      }
    }
    if (doBoost) {
      bpMods.push(5324);
      desc.chromaticField = field.chromaticField;
    }
  }

  // Abilities

  // Use BasePower after moves with custom BP to determine if Technician should boost
  if (((attacker.hasAbility('Technician') || attacker.named('Dusknoir-Crest')) && basePower <= 60) ||
    (attacker.hasAbility('Flare Boost') &&
      attacker.hasStatus('brn') && move.category === 'Special') ||
    (attacker.hasAbility('Toxic Boost') &&
      attacker.hasStatus('psn', 'tox') && move.category === 'Physical') ||
    (attacker.hasAbility('Mega Launcher') && move.flags.pulse) ||
    ((attacker.hasAbility('Strong Jaw') || attacker.named('Feraligatr-Crest')) && move.flags.bite) ||
    (attacker.hasAbility('Steely Spirit') && move.hasType('Steel')) ||
    (attacker.hasAbility('Lunar Idol') && move.hasType('Ice')) ||
    (attacker.hasAbility('Solar Idol') && move.hasType('Fire')) ||
    (attacker.hasAbility('Sharpness') && move.flags.slicing)
  ) {
    bpMods.push(6144);
    desc.attackerAbility = attacker.ability;
  }

  const aura = `${move.type} Aura`;
  const isAttackerAura = attacker.hasAbility(aura);
  const isDefenderAura = defender.hasAbility(aura);
  const isUserAuraBreak = attacker.hasAbility('Aura Break') || defender.hasAbility('Aura Break');
  const isFieldAuraBreak = field.isAuraBreak;
  const isFieldFairyAura = field.isFairyAura && move.type === 'Fairy';
  const isFieldDarkAura = field.isDarkAura && move.type === 'Dark';
  const auraActive = isAttackerAura || isDefenderAura || isFieldFairyAura || isFieldDarkAura;
  const auraBreak = isFieldAuraBreak || isUserAuraBreak;
  if (auraActive) {
    if (auraBreak) {
      bpMods.push(3072);
      desc.attackerAbility = attacker.ability;
      desc.defenderAbility = defender.ability;
    } else {
      bpMods.push(5448);
      if (isAttackerAura) desc.attackerAbility = attacker.ability;
      if (isDefenderAura) desc.defenderAbility = defender.ability;
    }
  }

  // Sheer Force does not power up max moves or remove the effects (SadisticMystic)
  if (
    (attacker.hasAbility('Sheer Force') &&
      (move.secondaries || move.named('Jet Punch', 'Order Up')) && !move.isMax) ||
    (attacker.hasAbility('Sand Force') &&
      field.hasWeather('Sand') && move.hasType('Rock', 'Ground', 'Steel')) ||
    (attacker.hasAbility('Analytic') &&
      (turnOrder !== 'first' || field.defenderSide.isSwitching === 'out')) ||
    (attacker.hasAbility('Inexorable') && move.hasType('Dragon') &&
      (turnOrder === 'first' || field.defenderSide.isSwitching === 'out')) ||
    (attacker.hasAbility('Tough Claws') && move.flags.contact) ||
    (attacker.hasAbility('Punk Rock') && move.flags.sound)
  ) {
    bpMods.push(5325);
    desc.attackerAbility = attacker.ability;
  }

  if (field.attackerSide.isBattery && move.category === 'Special') {
    bpMods.push(5325);
    desc.isBattery = true;
  }

  if (field.attackerSide.isPowerSpot) {
    bpMods.push(5325);
    desc.isPowerSpot = true;
  }

  if (attacker.hasAbility('Rivalry') && ![attacker.gender, defender.gender].includes('N')) {
    if (attacker.gender === defender.gender) {
      bpMods.push(5120);
      desc.rivalry = 'buffed';
    } else {
      bpMods.push(3072);
      desc.rivalry = 'nerfed';
    }
    desc.attackerAbility = attacker.ability;
  }

  // The -ate abilities already changed move typing earlier, so most checks are done and desc is set
  // However, Max Moves also don't boost -ate Abilities
  if (!move.isMax && hasAteAbilityTypeChange) {
    if (attacker.hasAbility('Type Sync')) {
      if (!attacker.named('Spectreon'))
        bpMods.push(4505);
    }
    else {
      bpMods.push(4915);
    }
  }

  if ((attacker.hasAbility('Reckless') && (move.recoil || move.hasCrashDamage)) ||
      (attacker.hasAbility('Iron Fist') && move.flags.punch)
  ) {
    bpMods.push(4915);
    desc.attackerAbility = attacker.ability;
  }

  if (attacker.hasItem('Punching Glove') && move.flags.punch) {
    bpMods.push(4506);
    desc.attackerItem = attacker.item;
  }

  if (gen.num <= 8 && defender.hasAbility('Heatproof') && move.hasType('Fire')) {
    bpMods.push(2048);
    desc.defenderAbility = defender.ability;
  } else if (defender.hasAbility('Dry Skin') && move.hasType('Fire')) {
    bpMods.push(5120);
    desc.defenderAbility = defender.ability;
  }

  if (attacker.hasAbility('Supreme Overlord') && attacker.alliesFainted) {
    const powMod = [4096, 4506, 4915, 5325, 5734, 6144];
    bpMods.push(powMod[Math.min(5, attacker.alliesFainted)]);
    desc.attackerAbility = attacker.ability;
    desc.alliesFainted = attacker.alliesFainted;
  }

  // Items

  if (attacker.hasItem(`${move.type} Gem`)) {
    bpMods.push(5325);
    desc.attackerItem = attacker.item;
  } else if (
    (((attacker.hasItem('Adamant Crystal') && attacker.named('Dialga-Origin')) ||
      (attacker.hasItem('Adamant Orb') && attacker.named('Dialga'))) &&
     move.hasType('Steel', 'Dragon')) ||
    (((attacker.hasItem('Lustrous Orb') &&
     attacker.named('Palkia')) ||
      (attacker.hasItem('Lustrous Globe') && attacker.named('Palkia-Origin'))) &&
     move.hasType('Water', 'Dragon')) ||
    (((attacker.hasItem('Griseous Orb') || attacker.hasItem('Griseous Core')) &&
     (attacker.named('Giratina-Origin') || attacker.named('Giratina'))) &&
     move.hasType('Ghost', 'Dragon')) ||
    (attacker.hasItem('Vile Vial') &&
     attacker.named('Venomicon-Epilogue') &&
     move.hasType('Poison', 'Flying')) ||
    (attacker.hasItem('Soul Dew') &&
     attacker.named('Latios', 'Latias', 'Latios-Mega', 'Latias-Mega') &&
     move.hasType('Psychic', 'Dragon')) ||
     attacker.item && move.hasType(getItemBoostType(attacker.item)) ||
    (attacker.name.includes('Ogerpon-Cornerstone') && attacker.hasItem('Cornerstone Mask')) ||
    (attacker.name.includes('Ogerpon-Hearthflame') && attacker.hasItem('Hearthflame Mask')) ||
    (attacker.name.includes('Ogerpon-Wellspring') && attacker.hasItem('Wellspring Mask'))
  ) {
    bpMods.push(4915);
    desc.attackerItem = attacker.item;
  } else if (
    (attacker.hasItem('Muscle Band') && move.category === 'Physical') ||
    (attacker.hasItem('Wise Glasses') && move.category === 'Special')
  ) {
    bpMods.push(4505);
    desc.attackerItem = attacker.item;
  }

  // Crests - Misc Modifiers

  // Beheeyem Crest: Reduces damage taken from Pokemon moving before it by 33%
  if (defender.named('Beheeyem-Crest') && defender.stats.spe <= attacker.stats.spe) {
    bpMods.push(2732);
  }

  // Boltund Crest: Increases damage dealt with bite moves when moving before the opponent by 30%
  if (attacker.named('Boltund-Crest') && move.flags.bite && attacker.stats.spe >= defender.stats.spe) {
    bpMods.push(5324);
  }

  // Claydol Crest: Increases damage dealt with beam moves by 50%
  if (attacker.named('Claydol-Crest') && move.flags.beam) {
    bpMods.push(6144);
  }

  // Druddigon Crest: Increases damage dealt with fire and dragon type moves by 30% 
  if (attacker.named('Druddigon-Crest') && move.hasType('Fire', 'Dragon')) {
    bpMods.push(5324);
  }

  // Fearow Crest: Increases damage dealt with stabbing moves by 50%
  if (attacker.named('Fearow-Crest') && move.flags.stabbing) {
    bpMods.push(6144);
  }

  return bpMods;
}

export function calculateAttackSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  desc: RawDesc,
  isCritical = false
) {
  let attack: number;
  const attackSource = move.named('Foul Play') ? defender : attacker;
  if (move.named('Photon Geyser', 'Light That Burns The Sky') ||
      (move.named('Tera Blast') && attackSource.teraType)) {
    move.category = attackSource.stats.atk > attackSource.stats.spa ? 'Physical' : 'Special';
  }
  
  // Crests - Attack Stat Swaps (in general)
  const attackStat =
    move.named('Shell Side Arm') &&
    getShellSideArmCategory(attacker, defender) === 'Physical'
      ? 'atk'
      : (attacker.named('Claydol-Crest') && move.category === 'Special') || move.named('Body Press')
        ? 'def' // Claydol Crest: Uses physical defense stat instead of special defense stat
        : attacker.named('Dedenne-Crest')
          ? 'spe' // Dedenne Crest: Uses physical defense stat instead of special defense stat
          : attacker.named('Infernape-Crest')
            ? (move.category === 'Special' ? 'spd' : 'def') // Infernape Crest: Uses defense stats instead of offense stats
            : attacker.named('Reuniclus-Crest-Fighting')
              ? (move.category === 'Special' ? 'atk' : 'spa') // Reuniclus Crest (Fighting): Swaps offense stats
              : attacker.named('Typhlosion-Crest') && move.category === 'Physical'
                ? 'spa' // Typhlosion Crest: Uses special attack stat instead of physical attack stat
                : move.category === 'Special'
                  ? 'spa'
                  : 'atk';
  desc.attackEVs =
    move.named('Foul Play')
      ? getEVDescriptionText(gen, defender, attackStat, defender.nature)
      : getEVDescriptionText(gen, attacker, attackStat, attacker.nature);

  // Claydol Crest: Uses physical defense stat instead of special defense stat, but uses regular stat changes 
  if (attacker.named('Claydol-Crest') && move.category === 'Special') {
    attack = getModifiedStat(attacker.rawStats['def']!, attacker.boosts['spa']!);
    desc.attackBoost = attackSource.boosts['spa'];
  // Dedenne Crest: Uses speed stat instead of offenses, but uses regular stat changes
  } else if (attacker.named('Dedenne-Crest')){
    if (move.category === 'Special') {
      attack = getModifiedStat(attacker.rawStats['spe']!, attacker.boosts['spa']!);
      desc.attackBoost = attackSource.boosts['spa'];
    } else {
      attack = getModifiedStat(attacker.rawStats['spe']!, attacker.boosts['atk']!);
      desc.attackBoost = attackSource.boosts['atk'];
    }
  } else if (attackSource.boosts[attackStat] === 0 ||
    (isCritical && attackSource.boosts[attackStat] < 0)) {
    attack = attackSource.rawStats[attackStat];
  } else if (defender.hasAbility('Unaware')) {
    attack = attackSource.rawStats[attackStat];
    desc.defenderAbility = defender.ability;
  } else {
    attack = attackSource.stats[attackStat];
    desc.attackBoost = attackSource.boosts[attackStat];
  }

  // unlike all other attack modifiers, Hustle gets applied directly
  if (attacker.hasAbility('Hustle') && move.category === 'Physical') {
    attack = pokeRound((attack * 3) / 2);
    desc.attackerAbility = attacker.ability;
  }

  // Crests - Attack Buffs

  // Aevian Ampharos Crest: Buffs move in first move slot by 20% (STAB) or 50% (non-STAB)
  // TODO: does not detect first moveslot
  if (attacker.named('Ampharos-Aevian-Crest') && move.moveSlot === 1) {
    attack = (move.type === 'Ice' || move.type === 'Electric') ? pokeRound((attack * 6) / 5) : pokeRound((attack * 3) / 2);
    desc.attackerAbility = attacker.ability;
  }

  // Cofagrigus Crest: Buffs special attack by 25%
  if (attacker.named('Cofagrigus-Crest') && move.category === 'Special') {
    attack = pokeRound((attack * 5) / 4);
  }

  // Crabominable Crest: Buffs physical attack and physical defense by 20%
  if (attacker.named('Crabominable-Crest') && move.named('Body Press')) {
    attack = pokeRound((attack * 6) / 5);
  }

  // Cryogonal Crest: Buffs offenses by 10% of its special defense (which is buffed by 20%)
  if (attacker.named('Cryogonal-Crest') && attacker.hasAbility('Levitate')) {
    attack += Math.floor((Math.floor(attacker.stats['spd'] * 6 / 5) / 10));
  }

  // Dusknoir Crest: Buffs physical attack by 25%
  if (attacker.named('Dusknoir-Crest') && move.category === 'Physical') {
    attack = pokeRound((attack * 5) / 4);
  }

  // Hypno Crest: Buffs special attack by 50%
  if (attacker.named('Hypno-Crest') && move.category === 'Special') {
    attack = pokeRound((attack * 3) / 2);
  }

  // Magcargo Crest: Buffs special attack by 30%
  if (attacker.named('Magcargo-Crest') && move.category === 'Special') {
    attack = pokeRound((attack * 13) / 10);
  }

  // Oricorio Crest: Buffs special attack by 25%
  if ((attacker.named('Oricorio-Crest-Baile') || attacker.named('Oricorio-Crest-Pa\'u') || attacker.named('Oricorio-Crest-Pom-Pom') || attacker.named('Oricorio-Crest-Sensu'))
    && move.category === 'Special') {
    attack = pokeRound((attack * 5) / 4);
  }

  // Relicanth Crest: Buffs offenses by 25% + 10% * consecutive turns that it has been on the field
  if (attacker.named('Relicanth-Crest')) {
    let turns = attacker.relicanthTurns === undefined ? 0 : attacker.relicanthTurns;
    attack = pokeRound((attack * (125 + (10 * turns))) / 100);
    desc.relicanthTurnsAttack = turns;
  }

  // Simi Monkeys Crests: Buffs offenses by 20%
  if (attacker.named('Simipour-Crest') || attacker.named('Simisage-Crest') || attacker.named('Simisear-Crest')) {
    attack = pokeRound((attack * 6) / 5);
  }

  // Skuntank Crest: Buffs offenses by 20%
  if (attacker.named('Skuntank-Crest')) {
    attack = pokeRound((attack * 6) / 5);
  }

  // Spiritomb Crest: Buffs offenses by 
  if (attacker.named('Spiritomb-Crest')) {
    let foesFainted = attacker.foesFainted === undefined ? 0 : attacker.foesFainted;
    if (foesFainted > 0) {
      attack = pokeRound((attack * (5 + foesFainted)) / 5);
      desc.foesFainted = foesFainted;
    }
  }

  // Stantler + Wyrdeer Crest: Buffs physical attack by 50%
  if ((attacker.named('Stantler-Crest') || attacker.named('Wyrdeer-Crest')) && move.category === 'Physical') {
    attack = pokeRound((attack * 3) / 2);
  }

  // Whiscash Crest: Buffs offenses by 20%
  if (attacker.named('Whiscash-Crest')) {
    attack = pokeRound((attack * 6) / 5);
  }

  const atMods = calculateAtModsSMSSSV(gen, attacker, defender, move, field, desc);
  attack = OF16(Math.max(1, pokeRound((attack * chainMods(atMods, 410, 131072)) / 4096)));
  return attack;
}

export function calculateAtModsSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  desc: RawDesc
) {
  const atMods = [];

  // Slow Start also halves damage with special Z-moves
  if ((attacker.hasAbility('Slow Start') && attacker.abilityOn &&
       (move.category === 'Physical' || (move.category === 'Special' && move.isZ))) ||
      (attacker.hasAbility('Defeatist') && attacker.curHP() <= attacker.maxHP() / 2)
  ) {
    atMods.push(2048);
    desc.attackerAbility = attacker.ability;
  } else if (
    (attacker.hasAbility('Solar Power') &&
     field.hasWeather('Sun', 'Harsh Sunshine') &&
     move.category === 'Special') ||
    (attacker.named('Cherrim') &&
     attacker.hasAbility('Flower Gift') &&
     field.hasWeather('Sun', 'Harsh Sunshine') &&
     move.category === 'Physical') ||
    (attacker.hasAbility('Solar Idol') &&
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    move.category === 'Physical') ||
    (attacker.hasAbility('Lunar Idol') &&
    field.hasWeather('Hail', 'Snow') &&
    move.category === 'Special')) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
    desc.weather = field.weather;
  } else if (
    // Gorilla Tactics has no effect during Dynamax (Anubis)
    (attacker.hasAbility('Gorilla Tactics') && move.category === 'Physical' &&
     !attacker.isDynamaxed)) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
  } else if (
    field.attackerSide.isFlowerGift &&
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    move.category === 'Physical') {
    atMods.push(6144);
    desc.weather = field.weather;
    desc.isFlowerGiftAttacker = true;
  } else if (
    (attacker.hasAbility('Guts') && attacker.status && move.category === 'Physical') ||
    (attacker.curHP() <= attacker.maxHP() / 3 &&
      ((attacker.hasAbility('Overgrow') && move.hasType('Grass')) ||
       (attacker.hasAbility('Blaze') && move.hasType('Fire')) ||
       (attacker.hasAbility('Torrent') && move.hasType('Water')) ||
       (attacker.hasAbility('Swarm') && move.hasType('Bug')))) ||
    (move.category === 'Special' && attacker.abilityOn && attacker.hasAbility('Plus', 'Minus'))
  ) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
  } else if ((field.chromaticField === 'Jungle' && attacker.hasAbility('Swarm') && move.hasType('Bug')) ||
             (field.chromaticField === 'Thundering Plateau' && attacker.hasAbility('Plus', 'Minus') && move.category === 'Special')) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
    desc.chromaticField = field.chromaticField;
  } else if (attacker.hasAbility('Flash Fire') && attacker.abilityOn && move.hasType('Fire')) {
    atMods.push(6144);
    desc.attackerAbility = 'Flash Fire';
  } else if (
    (attacker.hasAbility('Steelworker') && move.hasType('Steel')) ||
    (attacker.hasAbility('Dragon\'s Maw') && move.hasType('Dragon')) ||
    (attacker.hasAbility('Rocky Payload') && move.hasType('Rock'))
  ) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
  } else if (attacker.hasAbility('Transistor') && move.hasType('Electric')) {
    atMods.push(gen.num >= 9 ? 5325 : 6144);
    desc.attackerAbility = attacker.ability;
  } else if (attacker.hasAbility('Stakeout') && attacker.abilityOn) {
    atMods.push(8192);
    desc.attackerAbility = attacker.ability;
  } else if (
    (attacker.hasAbility('Water Bubble') && move.hasType('Water')) ||
    (attacker.hasAbility('Huge Power', 'Pure Power') && move.category === 'Physical')
  ) {
    atMods.push(8192);
    desc.attackerAbility = attacker.ability;
  }

  if ((defender.hasAbility('Thick Fat') && move.hasType('Fire', 'Ice')) ||
      (defender.hasAbility('Water Bubble') && move.hasType('Fire')) ||
     (defender.hasAbility('Purifying Salt') && move.hasType('Ghost'))) {
    atMods.push(2048);
    desc.defenderAbility = defender.ability;
  }

  if (gen.num >= 9 && defender.hasAbility('Heatproof') && move.hasType('Fire')) {
    atMods.push(2048);
    desc.defenderAbility = defender.ability;
  }
  // Pokemon with "-of Ruin" Ability are immune to the opposing "-of Ruin" ability
  const isTabletsOfRuinActive = (defender.hasAbility('Tablets of Ruin') || field.isTabletsOfRuin) &&
    !attacker.hasAbility('Tablets of Ruin');
  const isVesselOfRuinActive = (defender.hasAbility('Vessel of Ruin') || field.isVesselOfRuin) &&
    !attacker.hasAbility('Vessel of Ruin');
  if (
    (isTabletsOfRuinActive && move.category === 'Physical') ||
    (isVesselOfRuinActive && move.category === 'Special')
  ) {
    if (defender.hasAbility('Tablets of Ruin') || defender.hasAbility('Vessel of Ruin')) {
      desc.defenderAbility = defender.ability;
    } else {
      desc[move.category === 'Special' ? 'isVesselOfRuin' : 'isTabletsOfRuin'] = true;
    }
    atMods.push(3072);
  }

  if (isQPActive(attacker, field)) {
    if (
      (move.category === 'Physical' && getQPBoostedStat(attacker) === 'atk') ||
      (move.category === 'Special' && getQPBoostedStat(attacker) === 'spa')
    ) {
      atMods.push(5325);
      desc.attackerAbility = attacker.ability;
    }
  }

  if (
    (attacker.hasAbility('Hadron Engine') && move.category === 'Special' &&
      field.hasTerrain('Electric') && isGrounded(attacker, field)) ||
    (attacker.hasAbility('Orichalcum Pulse') && move.category === 'Physical' &&
      field.hasWeather('Sun', 'Harsh Sunshine') && !attacker.hasItem('Utility Umbrella'))
  ) {
    atMods.push(5461);
    desc.attackerAbility = attacker.ability;
  }

  if ((attacker.hasItem('Thick Club') &&
       attacker.named('Cubone', 'Marowak', 'Marowak-Alola', 'Marowak-Alola-Totem') &&
       move.category === 'Physical') ||
      (attacker.hasItem('Deep Sea Tooth') &&
       attacker.named('Clamperl') &&
       move.category === 'Special') ||
      (attacker.hasItem('Light Ball') && attacker.name.includes('Pikachu') && !move.isZ)
  ) {
    atMods.push(8192);
    desc.attackerItem = attacker.item;
    // Choice Band/Scarf/Specs move lock and stat boosts are ignored during Dynamax (Anubis)
  } else if (!move.isZ && !move.isMax &&
    ((attacker.hasItem('Choice Band') && move.category === 'Physical') ||
      (attacker.hasItem('Choice Specs') && move.category === 'Special'))
  ) {
    atMods.push(6144);
    desc.attackerItem = attacker.item;
  }

  // Crests - Attack Modifiers

  // Seviper Crest: Buffs damage by 50% * percentage of target health left / 100
  if (attacker.named('Seviper-Crest')) {
    atMods.push(4096 + pokeRound(Math.floor((defender.curHP() * 4096) / defender.maxHP()) / 2));
  }

  return atMods;
}

export function calculateDefenseSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  desc: RawDesc,
  isCritical = false
) {
  let defense: number;
  const hitsPhysical = move.overrideDefensiveStat === 'def' || move.category === 'Physical' ||
    (move.named('Shell Side Arm') && getShellSideArmCategory(attacker, defender) === 'Physical');
  
  // Crests - Defense Stat Swaps (in general)
  const defenseStat = 
    (defender.named('Infernape-Crest'))
      ? (move.category === 'Special' ? 'spa' : 'atk') // Infernape Crest: Uses offense stat (changes) instead of defense stat (changes)
      : (defender.named('Magcargo-Crest') && hitsPhysical)
        ? 'spe' // Magcargo Crest: Uses speed stat (changes) instead of defense stat (changes)
        : hitsPhysical
          ? 'def'
          : 'spd';
  
  desc.defenseEVs = getEVDescriptionText(gen, defender, defenseStat, defender.nature);
  if (defender.boosts[defenseStat] === 0 ||
      (isCritical && defender.boosts[defenseStat] > 0) ||
      move.ignoreDefensive) {
    defense = defender.rawStats[defenseStat];
  } else if (attacker.hasAbility('Unaware')) {
    defense = defender.rawStats[defenseStat];
    desc.attackerAbility = attacker.ability;
  } else {
    defense = defender.stats[defenseStat];
    desc.defenseBoost = defender.boosts[defenseStat];
  }

  // unlike all other defense modifiers, Sandstorm SpD boost gets applied directly
  if (field.hasWeather('Sand') && (defender.hasType('Rock') || defender.hasInvisisbleType(attacker, field, 'Rock')) && !hitsPhysical) {
    defense = pokeRound((defense * 3) / 2);
    desc.weather = field.weather;
  }
  if (field.hasWeather('Snow') && (defender.hasType('Ice') || defender.hasInvisisbleType(attacker, field, 'Ice') || defender.named('Empoleon-Crest')) && hitsPhysical) {
    defense = pokeRound((defense * 3) / 2);
    desc.weather = field.weather;
  }

  // Crests - Defense Buffs

  // Cofagrigus Crest: Buffs special defense by 25% 
  if (defender.named('Cofagrigus-Crest') && move.category === 'Special') {
    defense = pokeRound((defense * 5) / 4);
  }

  // Cofagrigus Crest: Buffs defenses by 20%
  if (defender.named('Crabominable-Crest')) {
    defense = pokeRound((defense * 6) / 5);
  }

  // Meganium Crest: Buffs defenses by 20%
  if (defender.named('Meganium-Crest')) {
    defense = pokeRound((defense * 6) / 5);
  }

  // Noctowl Crest: Buffs physical defense by 20%
  if (defender.named('Noctowl-Crest') && move.category === 'Physical') {
    defense = pokeRound((defense * 6) / 5);
  }

  // Phione Crest: Buffs defenses by 50%
  if (defender.named('Phione-Crest')) {
    defense = pokeRound((defense * 3) / 2);
  }

  // Relicanth Crest: Buffs special defense by 25% + 10% * consecutive turns that it has been on the field
  if (defender.named('Relicanth-Crest') && move.category === 'Special') {
    let turns = defender.relicanthTurns === undefined ? 0 : defender.relicanthTurns;
    defense = pokeRound((defense * (125 + (10 * turns))) / 100);
    desc.relicanthTurnsDefense = turns;
  }
  
  // Vespiquen Crest (Defense): Buffs defense by 50%
  if (defender.named('Vespiquen-Crest-Defense')) {
    defense = pokeRound((defense * 3) / 2);
  }

  const dfMods = calculateDfModsSMSSSV(
    gen,
    attacker,
    defender,
    move,
    field,
    desc,
    isCritical,
    hitsPhysical
  );

  // Cryogonal Crest: Buffs special defense by 20%, and physical defense by 10% of its special defense
  if (defender.named('Cryogonal-Crest')) {
    if (move.category === 'Special') {
      defense = pokeRound((defense * 6) / 5);
    } else {
      defense += Math.floor((Math.floor(defender.stats['spd'] * 6 / 5) / 10));
    }
  }

  return OF16(Math.max(1, pokeRound((defense * chainMods(dfMods, 410, 131072)) / 4096)));
}

export function calculateDfModsSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  desc: RawDesc,
  isCritical = false,
  hitsPhysical = false
) {
  const dfMods = [];
  if (defender.hasAbility('Marvel Scale') && hitsPhysical) {
    if (defender.status) {
      dfMods.push(6144);
      desc.defenderAbility = defender.ability;
    } else if (field.chromaticField === "Dragon's Den") {
      dfMods.push(6144);
      desc.defenderAbility = defender.ability;
      desc.chromaticField = field.chromaticField;
    }
  } else if (
    defender.named('Cherrim') &&
    defender.hasAbility('Flower Gift') &&
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    !hitsPhysical
  ) {
    dfMods.push(6144);
    desc.defenderAbility = defender.ability;
    desc.weather = field.weather;
  } else if (
    field.defenderSide.isFlowerGift &&
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    !hitsPhysical) {
    dfMods.push(6144);
    desc.weather = field.weather;
    desc.isFlowerGiftDefender = true;
  } else if (
    defender.hasAbility('Grass Pelt') &&
    field.hasTerrain('Grassy') &&
    hitsPhysical
  ) {
    dfMods.push(6144);
    desc.defenderAbility = defender.ability;
  } else if (defender.hasAbility('Fur Coat') && hitsPhysical) {
    dfMods.push(8192);
    desc.defenderAbility = defender.ability;
  }
  // Pokemon with "-of Ruin" Ability are immune to the opposing "-of Ruin" ability
  const isSwordOfRuinActive = (attacker.hasAbility('Sword of Ruin') || field.isSwordOfRuin) &&
    !defender.hasAbility('Sword of Ruin');
  const isBeadsOfRuinActive = (attacker.hasAbility('Beads of Ruin') || field.isBeadsOfRuin) &&
    !defender.hasAbility('Beads of Ruin');
  if (
    (isSwordOfRuinActive && hitsPhysical) ||
    (isBeadsOfRuinActive && !hitsPhysical)
  ) {
    if (attacker.hasAbility('Sword of Ruin') || attacker.hasAbility('Beads of Ruin')) {
      desc.attackerAbility = attacker.ability;
    } else {
      desc[hitsPhysical ? 'isSwordOfRuin' : 'isBeadsOfRuin'] = true;
    }
    dfMods.push(3072);
  }

  if (isQPActive(defender, field)) {
    if (
      (hitsPhysical && getQPBoostedStat(defender) === 'def') ||
      (!hitsPhysical && getQPBoostedStat(defender) === 'spd')
    ) {
      desc.defenderAbility = defender.ability;
      dfMods.push(5324);
    }
  }

  if ((defender.hasItem('Eviolite') &&
      (defender.name === 'Dipplin' || gen.species.get(toID(defender.name))?.nfe)) ||
      (!hitsPhysical && defender.hasItem('Assault Vest'))) {
    dfMods.push(6144);
    desc.defenderItem = defender.item;
  } else if (
    (defender.hasItem('Metal Powder') && defender.named('Ditto') && hitsPhysical) ||
    (defender.hasItem('Deep Sea Scale') && defender.named('Clamperl') && !hitsPhysical)
  ) {
    dfMods.push(8192);
    desc.defenderItem = defender.item;
  }

  // Crests - Defense Modifiers

  // Electrode Crest: Decreases the target's physical defense stat by 50%
  if (attacker.named('Electrode-Crest') && hitsPhysical) {
    dfMods.push(2048);
  }

  return dfMods;
}

function calculateBaseDamageSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  basePower: number,
  attack: number,
  defense: number,
  move: Move,
  field: Field,
  desc: RawDesc,
  isCritical = false,
) {
  let baseDamage = getBaseDamage(attacker.level, basePower, attack, defense);
  const isSpread = field.gameType !== 'Singles' &&
     ['allAdjacent', 'allAdjacentFoes'].includes(move.target);
  if (isSpread) {
    baseDamage = pokeRound(OF32(baseDamage * 3072) / 4096);
  }

  if (attacker.hasAbility('Parental Bond (Child)')) {
    baseDamage = pokeRound(OF32(baseDamage * 1024) / 4096);
  }

  if (attacker.hasAbility('Parental Bond (Typhlosion)')) {
    baseDamage = pokeRound(OF32(baseDamage * 1229) / 4096);
  }

  if (
    field.hasWeather('Sun') && move.named('Hydro Steam') && !attacker.hasItem('Utility Umbrella')
  ) {
    baseDamage = pokeRound(OF32(baseDamage * 6144) / 4096);
    desc.weather = field.weather;
  } else if (!defender.hasItem('Utility Umbrella')) {
    if (
      (field.hasWeather('Sun', 'Harsh Sunshine') && move.hasType('Fire')) ||
      (field.hasWeather('Rain', 'Heavy Rain') && move.hasType('Water'))
    ) {
      baseDamage = pokeRound(OF32(baseDamage * 6144) / 4096);
      desc.weather = field.weather;
    } else if (
      (field.hasWeather('Sun') && move.hasType('Water')) ||
      (field.hasWeather('Rain') && move.hasType('Fire'))
    ) {
      baseDamage = pokeRound(OF32(baseDamage * 2048) / 4096);
      desc.weather = field.weather;
    }
  }

  if (isCritical) {
    baseDamage = Math.floor(OF32(baseDamage * 1.5));
    desc.isCritical = isCritical;
  }

  return baseDamage;
}

export function calculateFinalModsSMSSSV(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
  desc: RawDesc,
  isCritical = false,
  typeEffectiveness: number,
  hitCount = 0
) {
  const finalMods = [];

  if (field.defenderSide.isReflect && move.category === 'Physical' &&
      !isCritical && !field.defenderSide.isAuroraVeil &&
      !move.named('Brick Break') && !(move.named('X-Scissor') && field.chromaticField === 'Jungle')) {
    // doesn't stack with Aurora Veil
    finalMods.push(field.gameType !== 'Singles' ? 2732 : 2048);
    desc.isReflect = true;
  } else if (
    field.defenderSide.isLightScreen && move.category === 'Special' &&
    !isCritical && !field.defenderSide.isAuroraVeil &&
    !move.named('Brick Break') && !(move.named('X-Scissor') && field.chromaticField === 'Jungle')
  ) {
    // doesn't stack with Aurora Veil
    finalMods.push(field.gameType !== 'Singles' ? 2732 : 2048);
    desc.isLightScreen = true;
  }
  if (field.defenderSide.isAuroraVeil && !isCritical &&
      !move.named('Brick Break') && !(move.named('X-Scissor') && field.chromaticField === 'Jungle')) {
    finalMods.push(field.gameType !== 'Singles' ? 2732 : 2048);
    desc.isAuroraVeil = true;
  }
  if (field.defenderSide.isAreniteWall && typeEffectiveness > 1 &&
      !move.named('Brick Break') && !(move.named('X-Scissor') && field.chromaticField === 'Jungle')) {
    finalMods.push(2048);
    desc.isAreniteWall = true;
  }

  if (attacker.hasAbility('Neuroforce') && typeEffectiveness > 1) {
    finalMods.push(5120);
    desc.attackerAbility = attacker.ability;
  } else if (attacker.hasAbility('Sniper') && isCritical) {
    finalMods.push(6144);
    desc.attackerAbility = attacker.ability;
  } else if (attacker.hasAbility('Tinted Lens') && typeEffectiveness < 1) {
    finalMods.push(8192);
    desc.attackerAbility = attacker.ability;
  }

  if (defender.isDynamaxed && move.named('Dynamax Cannon', 'Behemoth Blade', 'Behemoth Bash')) {
    finalMods.push(8192);
  }

  if (defender.hasAbility('Multiscale', 'Shadow Shield'))
  {
    if (
      defender.curHP() === defender.maxHP() &&
      hitCount === 0 &&
      (!field.defenderSide.isSR && (!field.defenderSide.spikes || defender.hasType('Flying')) ||
      defender.hasItem('Heavy-Duty Boots')) && !attacker.hasAbility('Parental Bond (Child)')
    ) {
      finalMods.push(2048);
      desc.defenderAbility = defender.ability;
    } else if (defender.hasAbility('Multiscale') && field.chromaticField === "Dragon's Den") {
      let curHP = defender.curHP();
      // calculate hazard damage to determine whether the pokemon is above or below 3/4 maxHP
      if (!defender.hasItem('Heavy-Duty Boots')) {
        if (field.defenderSide.spikes && !defender.hasType('Flying')) {
          curHP -= defender.maxHP() / (10 - field.defenderSide.spikes * 2);
        }
        if (field.defenderSide.isSR) {
          const rockType = gen.types.get('rock' as ID)!;
          const effectiveness =
            rockType.effectiveness[defender.types[0]]! *
            (defender.types[1] ? rockType.effectiveness[defender.types[1]]! : 1);
          if (defender.named('Torterra-Crest')) {
            curHP -= Math.floor(((1 / effectiveness) * defender.maxHP()) / 8);
          } else {
            curHP -= Math.floor((effectiveness * defender.maxHP()) / 8);
          }
        }
      }

      if (curHP >= pokeRound(defender.maxHP() * 3 / 4))
      {
        finalMods.push(2048);
        desc.defenderAbility = defender.ability;
        desc.chromaticField = field.chromaticField;
      }
    }
  }

  if (defender.hasAbility('Fluffy') && move.flags.contact && !attacker.hasAbility('Long Reach')) {
    finalMods.push(2048);
    desc.defenderAbility = defender.ability;
  } else if (
    (defender.hasAbility('Punk Rock') && move.flags.sound) ||
    (defender.hasAbility('Ice Scales') && move.category === 'Special')
  ) {
    finalMods.push(2048);
    desc.defenderAbility = defender.ability;
  }

  if (defender.hasAbility('Solid Rock', 'Filter', 'Prism Armor') && typeEffectiveness > 1) {
    finalMods.push(3072);
    desc.defenderAbility = defender.ability;
  }

  if (defender.named('Ampharos-Aevian-Crest') && typeEffectiveness > 1) {
    finalMods.push(2867);
  }
  
  if (field.defenderSide.isFriendGuard) {
    finalMods.push(3072);
    desc.isFriendGuard = true;
  }

  if (defender.hasAbility('Fluffy') && move.hasType('Fire')) {
    finalMods.push(8192);
    desc.defenderAbility = defender.ability;
  }

  if (attacker.hasItem('Expert Belt') && typeEffectiveness > 1 && !move.isZ) {
    finalMods.push(4915);
    desc.attackerItem = attacker.item;
  } else if (attacker.hasItem('Life Orb')) {
    finalMods.push(5324);
    desc.attackerItem = attacker.item;
  } else if (attacker.hasItem('Metronome') && move.timesUsedWithMetronome! >= 1) {
    const timesUsedWithMetronome = Math.floor(move.timesUsedWithMetronome!);
    if (timesUsedWithMetronome <= 4) {
      finalMods.push(4096 + timesUsedWithMetronome * 819);
    } else {
      finalMods.push(8192);
    }
    desc.attackerItem = attacker.item;
  }

  if (move.hasType(getBerryResistType(defender.item)) &&
      (typeEffectiveness > 1 || move.hasType('Normal')) &&
      hitCount === 0 &&
      !attacker.hasAbility('Unnerve', 'As One (Glastrier)', 'As One (Spectrier)')) {
    if (defender.hasAbility('Ripen')) {
      finalMods.push(1024);
    } else {
      finalMods.push(2048);
    }
    desc.defenderItem = defender.item;
  }

  return finalMods;
}

function hasTerrainSeed(pokemon: Pokemon) {
  return pokemon.hasItem('Electric Seed', 'Misty Seed', 'Grassy Seed', 'Psychic Seed');
}
