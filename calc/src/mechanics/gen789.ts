import type {Generation, AbilityName, StatID, Terrain, TypeName, ID} from '../data/interface';
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
import type {RawDesc} from '../desc';
import type {Field} from '../field';
import type {Move} from '../move';
import type {Pokemon} from '../pokemon';
import {Result} from '../result';
import {
  chainMods,
  checkAirLock,
  checkCrestEntryEffects,
  checkDauntlessShield,
  checkDownload,
  checkEmbody,
  checkFieldEntryEffects,
  checkForecast,
  checkInfiltrator,
  checkIntimidate,
  checkIntrepidSword,
  checkItem,
  checkMultihitBoost,
  checkSeedBoost,
  checkStickyWeb,
  checkTeraformZero,
  checkWindRider,
  checkWonderRoom,
  computeFinalStats,
  countBoosts,
  getBaseDamage,
  getStatDescriptionText,
  getFinalDamage,
  getModifiedStat,
  getQPBoostedStat,
  getMoveEffectiveness,
  getShellSideArmCategory,
  getWeight,
  handleFixedDamageMoves,
  isGrounded,
  OF16, OF32,
  pokeRound,
  getMimicryType,
  isQPActive,
  getStabMod,
  getStellarStabMod,
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
  checkIntimidate(gen, attacker, defender, field);
  checkIntimidate(gen, defender, attacker, field);
  checkDownload(attacker, defender, field);
  checkDownload(defender, attacker, field);
  checkIntrepidSword(attacker, gen);
  checkIntrepidSword(defender, gen);
  checkStickyWeb(attacker, field, field.attackerSide.isStickyWeb);
  checkStickyWeb(defender, field, field.defenderSide.isStickyWeb);
  checkCrestEntryEffects(gen, attacker, defender, field);
  checkCrestEntryEffects(gen, defender, attacker, field);
  checkFieldEntryEffects(attacker, field);
  checkFieldEntryEffects(defender, field);

  checkWindRider(attacker, field.attackerSide);
  checkWindRider(defender, field.defenderSide);

  if (move.named('Meteor Beam', 'Electro Shot')) {
    attacker.boosts.spa +=
      attacker.hasAbility('Simple') ? 2
      : attacker.hasAbility('Contrary') ? -1
      : 1;
    // restrict to +- 6
    attacker.boosts.spa = Math.min(6, Math.max(-6, attacker.boosts.spa));
  }

  computeFinalStats(gen, attacker, defender, field, 'def', 'spd', 'spe', 'atk', 'spa');

  checkInfiltrator(attacker, field.defenderSide);
  checkInfiltrator(defender, field.attackerSide);

  const desc: RawDesc = {
    attackerName: attacker.name,
    moveName: move.name,
    defenderName: defender.name,
    isDefenderDynamaxed: defender.isDynamaxed,
    isWonderRoom: field.isWonderRoom,
  };

  // only display tera type if it applies
  if (attacker.teraType !== 'Stellar' || move.name === 'Tera Blast' || move.isStellarFirstUse) {
    // tera blast has special behavior with tera stellar
    desc.isStellarFirstUse = attacker.name !== 'Terapagos-Stellar' && move.name === 'Tera Blast' &&
      attacker.teraType === 'Stellar' && move.isStellarFirstUse;
    desc.attackerTera = attacker.teraType;
  }
  if (defender.teraType !== 'Stellar') desc.defenderTera = defender.teraType;

  if (move.named('Photon Geyser', 'Light That Burns the Sky') ||
      (move.named('Tera Blast') && attacker.teraType)) {
    move.category = attacker.stats.atk > attacker.stats.spa ? 'Physical' : 'Special';
  }

  const result = new Result(gen, attacker, defender, move, field, 0, desc);

  if (move.category === 'Status' && !move.named('Nature Power')) {
    return result;
  }

  if (move.flags.punch && attacker.hasItem('Punching Glove')) {
    desc.attackerItem = attacker.item;
    move.flags.contact = 0;
  }

  if (move.named('Shell Side Arm') &&
    getShellSideArmCategory(attacker, defender) === 'Physical') {
    move.flags.contact = 1;
  }

  const breaksProtect = move.breaksProtect || move.isZ || attacker.isDynamaxed ||
  (attacker.hasAbility('Unseen Fist') && move.flags.contact);

  if (field.defenderSide.isProtected && !breaksProtect) {
    desc.isProtected = true;
    return result;
  }

  if (move.name === 'Pain Split') {
    const average = Math.floor((attacker.curHP() + defender.curHP()) / 2);
    const damage = Math.max(0, defender.curHP() - average);
    result.damage = damage;
    return result;
  }

  const defenderAbilityIgnored = defender.hasAbility(
    'Armor Tail', 'Aroma Veil', 'Aura Break', 'Battle Armor',
    'Big Pecks', 'Bulletproof', 'Clear Body', 'Contrary',
    'Cute Charm', 'Damp', 'Dazzling', 'Disguise', 'Dry Skin',
    'Earth Eater', 'Filter', 'Flash Fire', 'Flower Gift',
    'Flower Veil', 'Fluffy', 'Friend Guard', 'Fur Coat',
    'Good as Gold', 'Grass Pelt', 'Guard Dog', 'Heatproof',
    'Heavy Metal', 'Hyper Cutter', 'Ice Face', 'Ice Scales',
    'Illuminate', 'Immunity', 'Inner Focus', 'Insomnia',
    'Keen Eye', 'Leaf Guard', 'Levitate', 'Light Metal',
    'Lightning Rod', 'Limber', 'Magic Bounce', 'Magma Armor',
    'Marvel Scale', "Mind's Eye", 'Mirror Armor', 'Motor Drive',
    'Multiscale', 'Oblivious', 'Overcoat', 'Own Tempo',
    'Pastel Veil', 'Punk Rock', 'Purifying Salt', 'Queenly Majesty',
    'Sand Veil', 'Sap Sipper', 'Shell Armor', 'Shield Dust',
    'Simple', 'Snow Cloak', 'Solid Rock', 'Soundproof',
    'Sticky Hold', 'Storm Drain', 'Sturdy', 'Suction Cups',
    'Sweet Veil', 'Tangled Feet', 'Telepathy', 'Tera Shell',
    'Thermal Exchange', 'Thick Fat', 'Unaware', 'Vital Spirit',
    'Volt Absorb', 'Water Absorb', 'Water Bubble', 'Water Veil',
    'Well-Baked Body', 'White Smoke', 'Wind Rider', 'Wonder Guard',
    'Wonder Skin'
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
  ) || (field.chromaticField === 'Underwater' && move.named('Wave Crash')); // Underwater - Wave Crash ignores the abilities of other Pokémon

  if (defenderAbilityIgnored && (attackerIgnoresAbility || moveIgnoresAbility)) {
    if (attackerIgnoresAbility) desc.attackerAbility = attacker.ability;
    if (defender.hasItem('Ability Shield')) {
      desc.defenderItem = defender.item;
    } else {
      defender.ability = '' as AbilityName;
    }
  }

  const ignoresNeutralizingGas = [
    'As One (Glastrier)', 'As One (Spectrier)', 'Battle Bond', 'Comatose',
    'Disguise', 'Gulp Missile', 'Ice Face', 'Multitype', 'Neutralizing Gas',
    'Power Construct', 'RKS System', 'Schooling', 'Shields Down',
    'Stance Change', 'Tera Shift', 'Zen Mode', 'Zero to Hero',
  ];

  if (attacker.hasAbility('Neutralizing Gas') &&
    !ignoresNeutralizingGas.includes(defender.ability || '')) {
    desc.attackerAbility = attacker.ability;
    if (defender.hasItem('Ability Shield')) {
      desc.defenderItem = defender.item;
    } else {
      defender.ability = '' as AbilityName;
    }
  }

  if (defender.hasAbility('Neutralizing Gas') &&
    !ignoresNeutralizingGas.includes(attacker.ability || '')) {
    desc.defenderAbility = defender.ability;
    if (attacker.hasItem('Ability Shield')) {
      desc.attackerItem = attacker.item;
    } else {
      attacker.ability = '' as AbilityName;
    }
  }

  // Merciless does not ignore Shell Armor, damage dealt to a poisoned Pokemon with Shell Armor
  // will not be a critical hit (UltiMario)
  let tempCritical = !defender.hasAbility('Battle Armor', 'Shell Armor') &&
    (move.isCrit ||
    (attacker.named('Ariados-Crest') && (defender.status || defender.boosts.spe < 0)) || // Ariados Crest - Guarantees Critical Hits against Statused and/or Slowed targets
    (attacker.named('Samurott-Crest') && move.flags.slicing)) && // Samurott Crest - Slicing moves always Crit
    move.timesUsed === 1;

  if (tempCritical == 0)
    tempCritical = false;

  if (!tempCritical && attacker.hasAbility('Merciless')) { 
    if (defender.hasStatus('psn', 'tox')) {
      tempCritical = true;
      desc.attackerAbility = attacker.ability;
    // Acidic Wasteland - Activates Merciless
    } else if (field.chromaticField === 'Acidic-Wasteland') {
      tempCritical = true;
      desc.attackerAbility = attacker.ability;
      desc.chromaticField = field.chromaticField;
    }
  }

  // Ring Arena - Grit Stage Effects: 3 - 100% Crit chance
  if (!tempCritical && attacker.gritStages! >= 3) {
    tempCritical = true;
    desc.gritStages = attacker.gritStages;
    desc.chromaticField = field.chromaticField;
  }

  const isCritical = tempCritical;

  let type = move.type;
  if (move.originalName === 'Weather Ball') {
    const holdingUmbrella = attacker.hasItem('Utility Umbrella');
    type =
      field.hasWeather('Sun', 'Harsh Sunshine') && !holdingUmbrella ? 'Fire'
      : field.hasWeather('Rain', 'Heavy Rain') && !holdingUmbrella ? 'Water'
      : field.hasWeather('Sand') ? 'Rock'
      : field.hasWeather('Hail', 'Snow') ? 'Ice'
      : 'Normal';
    // Sky - Weather Ball becomes Flying-type during tailwind if no other weathers are active
    if (type === 'Normal' && field.attackerSide.isTailwind && field.chromaticField === 'Sky') {
      type = 'Flying';
      desc.isTailwind = true;
      desc.chromaticField = field.chromaticField;
    } else {
      desc.weather = field.weather;
    }
    desc.moveType = type;
  } else if (move.named('Judgment') && attacker.item && attacker.item.includes('Plate')) {
    type = getItemBoostType(attacker.item)!;
  // Blessed Sanctum - Multipulse: Hyper Voice, Tri Attack, and Echoed Voice become Judgement
  } else if (move.named('Hyper Voice', 'Tri Attack', 'Echoed Voice') && field.chromaticField === 'Blessed-Sanctum' &&
             attacker.item && attacker.item.includes('Plate')) {
    type = getItemBoostType(attacker.item)!;
  } else if (move.originalName === 'Techno Blast' &&
    attacker.item && attacker.item.includes('Drive')) {
    type = getTechnoBlast(attacker.item)!;
    desc.moveType = type;
  } else if (move.originalName === 'Multi-Attack') {
    if (attacker.item && attacker.item.includes('Memory')) {
      type = getMultiAttack(attacker.item)!;
      desc.moveType = type;
    // Silvally Crest - Multi-Attack still matches the Silvally type without holding the Memory item
    } else if (attacker.name.includes('Silvally-Crest-')) {
      type = attacker.name.replace('Silvally-Crest-', '') as TypeName;
      desc.moveType = type;
    }
  } else if (move.named('Natural Gift') && attacker.item?.endsWith('Berry')) {
    const gift = getNaturalGift(gen, attacker.item)!;
    type = gift.t;
    desc.moveType = type;
    desc.attackerItem = attacker.item;
  } else if (
    move.named('Nature Power') ||
    (move.originalName === 'Terrain Pulse' && isGrounded(attacker, field, field.attackerSide))
  ) {
    type =
      field.hasTerrain('Electric') ? 'Electric'
      : field.hasTerrain('Grassy') ? 'Grass'
      : field.hasTerrain('Misty') ? 'Fairy'
      : field.hasTerrain('Psychic') ? 'Psychic'
      : 'Normal';
    // Fields - Nature Power types
    if (move.named('Nature Power') && type === 'Normal') {
      type =
        field.chromaticField === 'Jungle' ? 'Bug'
        : field.chromaticField === 'Eclipse' ? 'Dark'
        : field.chromaticField === 'Dragons-Den' ? 'Steel'
        : field.chromaticField === 'Thundering-Plateau' ? 'Electric'
        : field.chromaticField === 'Starlight-Arena' ? 'Fairy'
        : field.chromaticField === 'Ring-Arena' ? 'Fighting'
        : field.chromaticField === 'Volcanic-Top' ? 'Fire'
        : field.chromaticField === 'Sky' ? 'Flying'
        : field.chromaticField === 'Haunted-Graveyard' ? 'Ghost'
        : field.chromaticField === 'Flower-Garden' ? 'Grass'
        : field.chromaticField === 'Desert' ? 'Ground'
        : field.chromaticField === 'Snowy-Peaks' ? 'Ice'
        : field.chromaticField === 'Blessed-Sanctum' ?
          (attacker.item && attacker.item.includes('Plate')) ? getItemBoostType(attacker.item)! : 'Normal'
        : field.chromaticField === 'Acidic-Wasteland' ? 'Poison'
        : field.chromaticField === 'Ancient-Ruins' ? 'Psychic'
        : field.chromaticField === 'Cave' ? 'Rock'
        : field.chromaticField === 'Factory' ? 'Steel'
        : field.chromaticField === 'Waters-Surface' ? 'Water'
        : field.chromaticField === 'Underwater' ? 'Water'
        : field.chromaticField === 'Rainbow' ? 'Normal'
        : field.chromaticField === 'Undercolony' ? 'Bug'
        : field.chromaticField === 'Inverse' ? 'Psychic'
        : 'Normal';
      if (type !== 'Normal' || field.chromaticField === 'Blessed-Sanctum') {
        desc.chromaticField = field.chromaticField;
      }
    } else {
      desc.terrain = field.terrain;
    }

    if (move.isMax) {
      desc.moveType = type;
    }

    // If the Nature Power user has the ability Prankster, it cannot affect
    // Dark-types or grounded foes if Psychic Terrain is active
    if (!(move.named('Nature Power') && (attacker.hasAbility('Prankster')) ||
      (attacker.hasAbility('Telepathy') && field.chromaticField === 'Ancient-Ruins')) && // Ancient Ruins - Telepathy grants Prankster
      ((defender.types.includes('Dark') ||
      (field.hasTerrain('Psychic') && isGrounded(defender, field, field.defenderSide))))) {
      desc.moveType = type;
    }
  } else if (move.originalName === 'Revelation Dance') {
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

    field.defenderSide.isReflect = false;
    field.defenderSide.isLightScreen = false;
    field.defenderSide.isAuroraVeil = false;
  } else if (move.named('Ivy Cudgel')) {
    if (attacker.name.includes('Ogerpon-Cornerstone')) {
      type = 'Rock';
    } else if (attacker.name.includes('Ogerpon-Hearthflame')) {
      type = 'Fire';
    } else if (attacker.name.includes('Ogerpon-Wellspring')) {
      type = 'Water';
    }
  } else if (
    move.named('Tera Starstorm') && attacker.name === 'Terapagos-Stellar'
  ) {
    move.target = 'allAdjacentFoes';
    type = 'Stellar';
  // Jungle - X-Scissor removes Light Screen, Reflect, and Aurora Veil from the target's side
  } else if (move.named('Brick Break', 'Psychic Fangs') || (move.named('X-Scissor') && field.chromaticField === 'Jungle')) {
    field.defenderSide.isReflect = false;
    field.defenderSide.isLightScreen = false;
    field.defenderSide.isAuroraVeil = false;
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
    'Multi-Attack',
    'Natural Gift',
    'Weather Ball',
    'Terrain Pulse',
    'Struggle',
  ) || (move.named('Tera Blast') && attacker.teraType)
    || (move.named('Hyper Voice', 'Tri Attack', 'Echoed Voice') && field.chromaticField === 'Blessed-Sanctum');

  if (!move.isZ && !noTypeChange) {
    const normal = type === 'Normal';
    if ((isAerilate = attacker.hasAbility('Aerilate') && normal)) {
      type = 'Flying';
    } else if ((isGalvanize = (attacker.hasAbility('Galvanize') || attacker.named('Luxray-Crest')) && normal)) { // Luxray Crest - Gains Galvanize
      type = 'Electric';
    } else if ((isLiquidVoice = attacker.hasAbility('Liquid Voice') && !!move.flags.sound)) {
      type = 'Water';
    } else if ((isPixilate = attacker.hasAbility('Pixilate') && normal)) {
      type = 'Fairy';
    } else if ((isRefrigerate = attacker.hasAbility('Refrigerate') && normal)) {
      type = 'Ice';
    } else if ((isNormalize = attacker.hasAbility('Normalize'))) { // Boosts any type
      type = 'Normal';
    // Custom Eeveelutions - Type Sync: Makes normal moves match the users primary type
    } else if ((isTypeSync = attacker.hasAbility('Type Sync') && normal)) {
      type = attacker.types[0];
    // Sawsbuck Crest - Normal-type moves become seasonal type and are boosted by 20%
    } else if (isSawsbuckCrest = attacker.name.includes('Sawsbuck-Crest-') && normal) {
      type = attacker.types[0];
    // Simipour Crest - Normal-type moves become Grass-type
    } else if ((isSimipourCrest = attacker.named('Simipour-Crest') && normal)) {
      type = 'Grass';
    // Simisage Crest - Normal-type moves become Fire-type
    } else if ((isSimisageCrest = attacker.named('Simisage-Crest') && normal)) {
      type = 'Fire';
    // Simisear Crest - GNormal-type moves become Water-type
    } else if ((isSimisearCrest = attacker.named('Simisear-Crest') && normal)) {
      type = 'Water';
    // Dragon's Den - Intimidate makes user’s Normal-type moves become Dragon type and have 1.2x power
    } else if ((isDDenIntimidate = attacker.hasAbility('Intimidate') && normal && field.chromaticField === 'Dragons-Den')) {
      type = 'Dragon';
    // Starlight Arena - Normal-type moves change to Fairy-type
    } else if ((isDDenIntimidate = attacker.hasAbility('Intimidate') && normal && field.chromaticField === 'Dragons-Den')) {
      type = 'Dragon';
    // Rainbow - Quick Attack matches the typing of the Eevee using it  
    } else if (((attacker.name.includes('Umbreon')) || (attacker.name.includes('Espeon')) || 
      (attacker.name.includes('Flareon')) || (attacker.name.includes('Vaporeon')) || 
      (attacker.name.includes('Jolteon')) || (attacker.name.includes('Glaceon')) || 
      (attacker.name.includes('Leafeon')) || (attacker.name.includes('Sylveon')) || 
      (attacker.name.includes('Eevee'))) && (field.chromaticField === 'Rainbow') && (move.named('Quick Attack'))) {
      type = attacker.types[0];
    } else if (move.named('Mirror Beam')) {
      // Aevian - Mirror Beam: If the user has a secondary type the move changes type to match the secondary typing of the user
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
  if (((attacker.hasAbility('Triage') || attacker.named('Cherrim-Crest') || attacker.named('Cherrim-Crest-Sunshine')) && move.drain) || // Cherrim Crest - Grants Triage
      (attacker.hasAbility('Gale Wings') && move.hasType('Flying') &&
       (attacker.curHP() === attacker.maxHP() || field.chromaticField === 'Sky')) || // Sky - Activates Gale Wings regardless of HP
      (move.named('Grassy Glide') && (field.hasTerrain('Grassy') || field.chromaticField === 'Flower-Garden'))) { // Flower Garden - Grassy Glide has +1 priority
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

  if (field.defenderSide.isSoak) {
    type1 = 'Water' as TypeName;
    type2 = "???";

    desc.isDefenderSoak = true;
    desc.defenderType = type1;
  } else if (defender.hasAbility('Mimicry') && getMimicryType(field) != "???") {
    type1 = getMimicryType(field);
    type2 = "???";

    desc.defenderAbility = defender.ability;
    desc.defenderType = type1;
  }

  // Starlight Arena - Victory Star changes the user’s primary type to Fairy
  if (defender.hasAbility('Victory Star') && field.chromaticField === 'Starlight-Arena') {
    type1 = 'Fairy' as TypeName;
  
    desc.chromaticField = field.chromaticField;
    desc.defenderAbility = defender.ability;
    desc.defenderType = type1;
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

  // XOR between Torterra-Crest and Inverse Field so they cancel each other out
  const inverse =
    (defender.named('Torterra-Crest') && !(field.chromaticField === 'Inverse')) || // Torterra Crest - Inverse type effectiveness
    (!defender.named('Torterra-Crest') && (field.chromaticField === 'Inverse')) // Inverse - Inverse type effectiveness
  
  // Inverse type effectiveness
  if (inverse) {
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

    // Inverse type effectiveness
    if (inverse) {
      if (typeEffectiveness == 0)
        typeEffectiveness = 2;
      else
        typeEffectiveness = 1 / typeEffectiveness;
    }
  }

  // Inverse - Normal type moves always hit for neutral damage
  if (field.chromaticField === 'Inverse' && move.hasType('Normal')) {
    typeEffectiveness = 1;
  }

  // Underwater - Steelworker grants Steel type resistances and immunities
  if (field.chromaticField === 'Underwater' && defender.hasAbility('Steelworker')) {
    if (move.hasType('Normal', 'Flying', 'Rock', 'Bug', 'Steel', 'Grass', 'Psychic', 'Ice', 'Dragon', 'Fairy')) // Steel Resistances
      typeEffectiveness *= 0.5;
    if (move.hasType('Poison')) // Steel Immunities
      typeEffectiveness = 0;    
  }

  // Undercolony - Shell Armor & Battle Armor makes user resist the Rock type
  if (field.chromaticField === 'Undercolony' && defender.hasAbility('Shell Armor', 'Battle Armor') && move.hasType('Rock') && typeEffectiveness > 0.5) {
    typeEffectiveness = 0.5;
    desc.defenderAbility = defender.ability;
    desc.chromaticField = field.chromaticField;
  }

  // Crests - Resistances and Immunities

  // Druddigon Crest - Gives immunity to fire type moves
  if (defender.named('Druddigon-Crest')) {
    if (move.hasType('Fire')) // Fire Immunity
      typeEffectiveness = 0;
  }

  // Glaceon Crest - Gives resistance to fighting and rock type moves
  if (defender.named('Glaceon-Crest') && move.hasType('Fighting', 'Rock') && typeEffectiveness > 0.5) {
    typeEffectiveness = 0.5;
  }

  // Leafeon Crest - Gives resistance to fire and flying type moves
  if (defender.named('Leafeon-Crest') && move.hasType('Fire', 'Flying') && typeEffectiveness > 0.5) {
    typeEffectiveness = 0.5;
  }

  // Luxray Crest - Gives resistance to dark and ghost type moves (dark pseudo-typing without immunities)
  if (defender.named('Luxray-Crest')) {
    if (move.hasType('Dark', 'Ghost')) // Dark Resistances
      typeEffectiveness *= 0.5;
  }

  // Samurott Crest - Gives resistances to dark, bug and rock type moves (fighting pseudo-typing)
  if (defender.named('Samurott-Crest')) {
    if (move.hasType('Dark', 'Bug', 'Rock')) // Fighting Resistances
      typeEffectiveness *= 0.5;
  }

  // Simipour Crest - Gives resistance to grass, water, ground and electric type moves (grass pseudo-typing)
  if (defender.named('Simipour-Crest')) {
    if (move.hasType('Grass', 'Water', 'Ground', 'Electric')) // Grass Resistances
      typeEffectiveness *= 0.5;
  }

  // Simisage Crest - Gives resistance to grass, fire, bug, ice, steel and fairy type moves (fire pseudo-typing)
  if (defender.named('Simisage-Crest')) {
    if (move.hasType('Grass', 'Fire', 'Bug', 'Ice', 'Steel', 'Fairy')) // Fire Resistances
      typeEffectiveness *= 0.5;
  }

  // Simisear Crest - Gives resistance to fire, water, ice and steel type moves (water pseudo-typing)
  if (defender.named('Simisear-Crest')) {
    if (move.hasType('Fire', 'Water', 'Ice', 'Steel')) // Water Resistances
      typeEffectiveness *= 0.5;
  }

  // Skuntank Crest - Gives ground immunity
  if (defender.named('Skuntank-Crest')) {
    if (move.hasType('Ground')) // Ground Immunity
      typeEffectiveness = 0;
  }

  // Whiscash Crest - Gives grass immunity
  if (defender.named('Whiscash-Crest')) {
    if (move.hasType('Grass')) // Grass Immunity
      typeEffectiveness = 0;
  }

  if (typeEffectiveness === 0 && move.hasType('Ground') &&
    defender.hasItem('Iron Ball') && !defender.hasAbility('Klutz')) {
    typeEffectiveness = 1;
  }

  if (typeEffectiveness === 0 && move.named('Thousand Arrows')) {
    typeEffectiveness = 1;
  }

  // Desert - Bulldoze grounds adjacent foes; first hit neutral on Airborne foes
  if (typeEffectiveness === 0 && field.chromaticField === 'Desert' && move.named('Bulldoze')) {
    typeEffectiveness = 1;
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
        (!(defender.hasStatus('slp') || defender.hasAbility('Comatose') || field.chromaticField === 'Haunted-Graveyard'))) || // Haunted Graveyard - Dream Eater never fails
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

  // Fields - Text for description

  const healBlock = (move.named('Psychic Noise') ||
  ((move.named('Shock Wave') || move.named('Nature Power')) && field.chromaticField === 'Thundering-Plateau')) && // Thundering Plateau - Shock Wave applies Heal Block
  !(
    // suppression conditions
    attacker.hasAbility('Sheer Force') ||
    defender.hasItem('Covert Cloak') ||
    defender.hasAbility('Shield Dust', 'Aroma Veil')
  );

  // Jungle - Shield Dust grants Magic Guard
  // Rainbow - Flareon gets Magic Guard
  const defenderMagicGuard = defender.hasAbility('Magic Guard') || (defender.hasAbility('Shield Dust') && field.chromaticField === 'Jungle') || (defender.named('Flareon') && field.chromaticField === 'Rainbow')
  const attackerMagicGuard = attacker.hasAbility('Magic Guard') || (attacker.hasAbility('Shield Dust') && field.chromaticField === 'Jungle') || (defender.named('Flareon') && field.chromaticField === 'Rainbow')

  if (field.chromaticField === 'Jungle') {
    // Jungle - Fell Stinger, Silver Wind, and Steamroller apply Infestation
    if (move.named('Fell Stinger', 'Silver Wind', 'Steamroller') && !defenderMagicGuard) {
      desc.chromaticField = field.chromaticField;
    }
  
    // Jungle - Air Cutter, Air Slash, Cut, Fury Cutter, Psycho Cut, and Slash, have an additional Grass Type
    if (move.named('Air Cutter', 'Air Slash', 'Cut', 'Fury Cutter', 'Psycho Cut', 'Slash')) {
      desc.moveType = '+ Grass' as TypeName;
      desc.chromaticField = field.chromaticField;   
    }
  }

  if (field.chromaticField === 'Eclipse') {
    // Eclipse - Solar Beam and Solar Blade fail
    if (move.named('Solar Beam', 'Solar Blade')) {
      desc.chromaticField = field.chromaticField;
      return result;
    }
  }

  if (field.chromaticField === 'Dragons-Den') {
    // Dragon's Den - Dragon Pulse can now hit Fairy type Pokemon (for Resisted Damage)
    if (move.named('Dragon Pulse') && defender.hasType('Fairy')) {
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Thundering-Plateau') {
    // Thundering Plateau - Prism Scale: Applies Charge
    if (defender.item === 'Prism Scale' && move.category === 'Special') {
      desc.defenderItem = defender.item;
      desc.chromaticField = field.chromaticField;
    }

    // Thundering Plateau - Volt Absorb restores 1/16 of the user's Max HP per turn
    if (defender.hasAbility('Volt Absorb') && !healBlock) {
      desc.chromaticField = field.chromaticField;
    }
  }

  const VOLCANIC_ERUPTION = [
    'Bulldoze', 'Earthquake', 'Eruption', 'Lava Plume', 'Magma Storm', 'Magnitude', 'Stomping Tantrum',
  ];

  if (field.chromaticField === 'Volcanic-Top') {
    // Volcanic Top - Prism Scale: Boosts Special Attack +1
    if (attacker.item === 'Prism Scale' && move.category === 'Special') {
      desc.attackerItem = attacker.item;
      desc.chromaticField = field.chromaticField;
    }

    // Volcanic Top - Volcanic Eruption
    if (((VOLCANIC_ERUPTION.includes(move.name) || (move.named('Nature Power') && !field.terrain)) &&
          !defender.hasAbility('Flash Fire', 'Well-Baked Body') && !defenderMagicGuard) ||
        defender.hasAbility('Solar Power')) {
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Sky') {
    // Sky - Prism Scale: Lowers the user’s Defense and Special Defense by 1
    if (defender.item === 'Prism Scale' && move.bp != 0) {
      desc.defenderItem = defender.item;
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Haunted-Graveyard') {
    if (((defender.hasStatus('slp') || defender.hasAbility('Comatose')) && !defenderMagicGuard && !attacker.hasAbility('Bad Dreams')) || // Haunted Graveyard - Bad Dreams is always active
        (move.named('Dream Eater') && !(defender.hasStatus('slp') || defender.hasAbility('Comatose')))) { // Haunted Graveyward - Dream Eater never fails
      desc.chromaticField = field.chromaticField;
    }

    // Haunted Graveyard - Prism Scale: Boosts Special Defense +1
    if (defender.item === 'Prism Scale' && move.category === 'Special' && !move.named('Nature Power')) {
      desc.defenderItem = defender.item;
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Flower-Garden') {
    // Flower Garden - Prism Scale: Applies Ingrain
    if (defender.item === 'Prism Scale' && field.defenderSide.isIngrain && !healBlock) {
      desc.defenderItem = defender.item;
      desc.chromaticField = field.chromaticField;
    }

    // Flower Garden - Leaf Tornado is now a binding move that deals 1/8 max HP per turn for 2-5 turns
    if (move.named('Leaf Tornado') && !defenderMagicGuard) {
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Desert') {
    // Desert - Prism Scale: Boosts Attack + 1
    if (attacker.item === 'Prism Scale' && move.category === 'Physical') {
      desc.attackerItem = attacker.item;
      desc.chromaticField = field.chromaticField;
    }

    // Desert - Sandsear Storm applies Sand Tomb trapping and chip damage effect
    if (move.named('Sandsear Storm') && !defenderMagicGuard) {
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Snowy-Peaks') {
    // Snow deals 1/16 weather damage like Sandstorm (Ice-types are immune)
    if (field.hasWeather('Snow') &&
        !defender.hasType('Ice') &&
        !defender.hasAbility('Overcoat', 'Snow Cloak') &&
        !defender.hasItem('Safety Goggles') &&
        !defender.named('Empoleon-Crest') &&
        !defenderMagicGuard) {
      desc.chromaticField = field.chromaticField;
    }

    // Snowy Peaks - Activates Ice Body
    if (defender.hasAbility('Ice Body') && !field.hasWeather('Hail', 'Snow') && !healBlock) {
      desc.chromaticField = field.chromaticField;
    }
  
    // Snowy Peaks - Stealth Rocks do neutral damage to Ice Types instead of Super Effective
    if (field.defenderSide.isSR && defender.hasType('Ice') &&
        !defender.hasItem('Heavy-Duty Boots') && !defender.hasAbility('Mountaineer') && !defenderMagicGuard) {
      desc.chromaticField = field.chromaticField;
    }
  }

 
  if (field.chromaticField === 'Acidic-Wasteland') {
    if ((attacker.hasAbility('Toxic Boost') && move.category === "Physical" && !attacker.hasStatus('psn', 'tox')) || // Acidic Wasteland - Activates Toxic Boost
        ((((defender.hasAbility('Poison Heal') || defender.named('Zangoose-Crest')) && !defender.hasStatus('psn', 'tox')) || // Acidic Wasteland - Activates Poison Heal
        defender.hasAbility('Liquid Ooze')) && !healBlock)) { // Acidic Wasteland - Activates Liquid Ooze
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Cave') {
    // Cave - Stealth Rocks do resisted damage to rock types and at least neutral damage to non-rock types
    if (field.defenderSide.isSR && !defender.hasItem('Heavy-Duty Boots') && !defender.hasAbility('Magic Guard', 'Mountaineer')) {
      desc.chromaticField = field.chromaticField;
    }
  
    // Cave - Power Gem targets the opponent's lower defense stat between Defense and Special Defense
    if (move.named('Power Gem') && defender.stats.def < defender.stats.spd) {
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Factory') {
    // Factory - Heatproof grants Fire immunity
    if (defender.hasAbility('Heatproof') && move.hasType('Fire')) {
      desc.defenderAbility = defender.ability;
      desc.chromaticField = field.chromaticField;
      return result;
    }
  }

  if (field.chromaticField === 'Waters-Surface') {
    if ((defender.hasStatus('brn') && !defenderMagicGuard) || // Water's Surface - Burn damage is halved
        (((defender.hasAbility('Rain Dish') && !field.hasWeather('Rain', 'Heavy Rain') && field.chromaticField === 'Waters-Surface') || // Water's Surface - Activates Rain Dish
        (field.defenderSide.isAquaRing || defender.named('Phione-Crest'))) && !healBlock)) { // Water's Surface - Aqua Ring restores 1/10 of the user's Max HP per turn
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Underwater') {
    // Underwater - Prism Scale: Applies Soak (Self)
    if (attacker.item === 'Prism Scale' && field.attackerSide.isSoak && move.bp != 0) {
      desc.attackerItem = attacker.item;
      desc.chromaticField = field.chromaticField;
    }
    if (defender.item === 'Prism Scale' && field.defenderSide.isSoak && move.bp != 0) {
      desc.defenderItem = defender.item;
      desc.chromaticField = field.chromaticField;
    }

    // Underwater - Steelworker grants Steel type resistances and immunities
    if (defender.hasAbility('Steelworker') && move.hasType('Normal', 'Flying', 'Rock', 'Bug', 'Steel', 'Grass', 'Psychic', 'Ice', 'Dragon', 'Fairy', 'Poison')) {
      desc.defenderAbility = defender.ability;
      desc.chromaticField = field.chromaticField;
    }

    if ((move.named('Dive') || (move.named('Nature Power') && !field.terrain)) && defender.hasType('Water') || // Underwater - Dive has the Freeze-Dry effect
        (defender.hasAbility('Dry Skin', 'Water Absorb') && !healBlock)) { // Underwater - Dry Skin and Water Absorb restore 1/8 of the user’s Max HP
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Undercolony') {
    // Undercolony - Rock Throw is super effective vs Ground types
    if (move.named('Rock Throw') && defender.hasType('Ground')) {
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Inverse') {
    // Inverse - The type chart is inverted [Immunities are now 2x weaknesses] (always print the field name because of this)
    desc.chromaticField = field.chromaticField;
  }

  if (move.type === 'Stellar') {
    desc.defenderTera = defender.teraType; // always show in this case
    typeEffectiveness = !defender.teraType ? 1 : 2;
  }

  const turn2typeEffectiveness = typeEffectiveness;

  // Tera Shell works only at full HP, but for all hits of multi-hit moves
  if (defender.hasAbility('Tera Shell') &&
      defender.curHP() === defender.maxHP() &&
      (!field.defenderSide.isSR && (!field.defenderSide.spikes || defender.hasType('Flying')) &&
      !(field.defenderSide.isStickyWeb && defender.hasType('Flying') && field.chromaticField === 'Jungle') || // Jungle - Sticky Web deals 1/8th of a Flying type’s Max HP on entry
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
        !field.isGravity && !move.named('Thousand Arrows') && !(move.named('Bulldoze') && field.chromaticField === 'Desert') && // Desert - Bulldoze grounds adjacent foes; first hit neutral on Airborne foes
        !defender.hasItem('Iron Ball') &&
        (defender.hasAbility('Levitate', 'Lunar Idol', 'Solar Idol') || // Aevian - Solar/Lunar Idol: Immune to Ground-type moves
        defender.named('Probopass-Crest'))) || // Probopass Crest - Grants Levitate
      (move.flags.bullet && defender.hasAbility('Bulletproof')) ||
      (move.flags.sound && !move.named('Clangorous Soul') && defender.hasAbility('Soundproof')) ||
      (move.priority > 0 && defender.hasAbility('Queenly Majesty', 'Dazzling', 'Armor Tail')) ||
      (move.priority > 0 && attacker.name.includes('Espeon') && (field.chromaticField === 'Rainbow')) || // Rainbow - Espeon gains Dazzling
      (move.hasType('Ground') && defender.hasAbility('Earth Eater')) ||
      (move.flags.wind && defender.hasAbility('Wind Rider'))
  ) {
    desc.defenderAbility = defender.ability;
    return result;
  }

  if (move.hasType('Ground') && !move.named('Thousand Arrows') && !(move.named('Bulldoze') && field.chromaticField === 'Desert') && // Desert - Bulldoze grounds adjacent foes; first hit neutral on Airborne foes
      !field.isGravity && defender.hasItem('Air Balloon')) {
    desc.defenderItem = defender.item;
    return result;
  }

  if (move.priority > 0 && field.hasTerrain('Psychic') && isGrounded(defender, field, field.defenderSide)) {
    desc.terrain = field.terrain;
    return result;
  }

  const weightBasedMove = move.named('Heat Crash', 'Heavy Slam', 'Low Kick', 'Grass Knot');
  if (defender.isDynamaxed && weightBasedMove) {
    return result;
  }

  desc.HPEVs = getStatDescriptionText(gen, defender, 'hp');

  let fixedDamage = handleFixedDamageMoves(attacker, move);
  if (fixedDamage) {
    // Haunted Graveyard - Night Shade deals 1.5x damage
    if (field.chromaticField === 'Haunted-Graveyard' && move.named('Night Shade')) {
      fixedDamage = pokeRound(fixedDamage * 3 / 2);
      desc.chromaticField = field.chromaticField
    }

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

  // Crests - Attack Stat Swaps (if combat stages included)
  const attackStat =
    move.named('Shell Side Arm') &&
    getShellSideArmCategory(attacker, defender) === 'Physical'
      ? 'atk'
      : move.named('Body Press')
        ? 'def'
        : attacker.named('Infernape-Crest')
          ? (move.category === 'Special' ? 'spd' : 'def') // Infernape Crest - Uses defense stat (changes) instead of offense stat (changes)
          : attacker.named('Reuniclus-Crest-Fighting')
            ? (move.category === 'Special' ? 'atk' : 'spa') // Reuniclus Crest (Fighting): Swaps offense stat (changes)
            : attacker.named('Typhlosion-Crest') && move.category === 'Physical'
              ? 'spa' // Typhlosion Crest - Uses special attack stat (changes) instead of physical attack stat (changes)
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
      ? (move.category === 'Special' ? 'spa' : 'atk') // Infernape Crest - Uses offense stat (changes) instead of defense stat (changes)
      : (defender.named('Magcargo-Crest') && hitsPhysical)
        ? 'spe' // Magcargo Crest - Uses speed stat (changes) instead of defense stat (changes)
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

  let preStellarStabMod = getStabMod(attacker, move, field, field.attackerSide, desc);
  let stabMod = getStellarStabMod(attacker, move, preStellarStabMod);

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
  // Starlight Arena - Pixilate terastalizes the user into the Stellar Type
  } else if (attacker.hasAbility('Pixilate') && field.chromaticField === 'Starlight-Arena') {
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

  // Probopass Crest - After an attack, each mini nose casts a 20BP type-based damage after a damaging move. (3 Attacks: steel, rock, electric [Special])
  let noseDamage: number[] | undefined;;
  if (attacker.named('Probopass-Crest') && move.hits === 1) {
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

  // Swalot Crest - Belch is always usable, and using it casts Spit-Up
  let spitUpDamage: number[] | undefined;
  if (attacker.named('Swalot-Crest') && move.named('Belch') && move.stockpiles! > 0 && move.hits === 1 && !isSpread) {
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

  // Typhlosion Crest - Non flat damage single turn Contact moves hit twice (like parental bond), the second hit does 30% of the original damage 
  let typhlosionDamage: number[] | undefined;
  if (attacker.named('Typhlosion-Crest') && !attacker.hasAbility('Parental Bond (Typhlosion)') && move.flags.contact &&
      !handleFixedDamageMoves(attacker, move) && move.hits === 1 && !isSpread) {
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

  desc.attackBoost =
    move.named('Foul Play') ? defender.boosts[attackStat] : attacker.boosts[attackStat];

  if (move.timesUsed! > 1 || move.hits > 1) {
    // store boosts so intermediate boosts don't show.
    const origDefBoost = desc.defenseBoost;
    const origAtkBoost = desc.attackBoost;

    let numAttacks = 1;
    if (move.timesUsed! > 1) {
      desc.moveTurns = `over ${move.timesUsed} turns`;
      numAttacks = move.timesUsed!;
    } else {
      numAttacks = move.hits;
    }
    let usedItems = [false, false];
    for (let times = 1; times < numAttacks; times++) {
      usedItems = checkMultihitBoost(gen, attacker, defender, move,
        field, desc, usedItems[0], usedItems[1]);
      const newAttack = calculateAttackSMSSSV(gen, attacker, defender, move,
        field, desc, isCritical);
      const newDefense = calculateDefenseSMSSSV(gen, attacker, defender, move,
        field, desc, isCritical);
      // Check if lost -ate ability. Typing stays the same, only boost is lost
      // Cannot be regained during multihit move and no Normal moves with stat drawbacks
      hasAteAbilityTypeChange = hasAteAbilityTypeChange &&
        attacker.hasAbility('Aerilate', 'Galvanize', 'Pixilate', 'Refrigerate', 'Normalize');

      if (move.timesUsed! > 1) {
        // Adaptability does not change between hits of a multihit, only between turns
        preStellarStabMod = getStabMod(attacker, move, field, field.attackerSide, desc);
        // Hack to make Tera Shell with multihit moves, but not over multiple turns
        typeEffectiveness = turn2typeEffectiveness;
        // Stellar damage boost applies for 1 turn, but all hits of multihit.
        stabMod = getStellarStabMod(attacker, move, preStellarStabMod, times);
      }

      const newBasePower = calculateBasePowerSMSSSV(
        gen,
        attacker,
        defender,
        move,
        field,
        hasAteAbilityTypeChange,
        desc,
        times + 1
      );
      const newBaseDamage = calculateBaseDamageSMSSSV(
        gen,
        attacker,
        defender,
        newBasePower,
        newAttack,
        newDefense,
        move,
        field,
        desc,
        isCritical
      );
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

      let damageMultiplier = 0;
      damage = damage.map(affectedAmount => {
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
      });
    }
    desc.defenseBoost = origDefBoost;
    desc.attackBoost = origAtkBoost;
  }

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
  desc: RawDesc,
  hit = 1,
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
    const w = getWeight(defender, desc, 'defender');
    basePower = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
    desc.moveBP = basePower;
    break;
  case 'Hex':
  case 'Infernal Parade':
  case 'Irritation': // Aevian - Irritation: Does double damage if the target has a status condition
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
        getWeight(attacker, desc, 'attacker') /
        getWeight(defender, desc, 'defender');
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
    // Ring Arena - Acrobatics is always doubled (As if the user was not holding an item)
    if (field.chromaticField === 'Ring-Arena' && basePower == move.bp) {
      basePower *= 2;
      desc.chromaticField = field.chromaticField;
    }
    desc.moveBP = basePower;
    break;
  case 'Assurance':
    basePower = move.bp * (defender.hasAbility('Parental Bond (Child)') ? 2 : 1);
    // NOTE: desc.attackerAbility = 'Parental Bond' will already reflect this boost
    break;
  case 'Wake-Up Slap':
  case 'Wake-Up Shock': // Aevian - Wake-Up Shock: It does double damage against sleeping targets, but also wakes them up
    // Wake-Up Slap deals double damage to Pokemon with Comatose (ih8ih8sn0w)
    basePower = move.bp * (defender.hasStatus('slp') || defender.hasAbility('Comatose') ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Smelling Salts':
    basePower = move.bp * (defender.hasStatus('par') ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Weather Ball':
    // Sky - Weather Ball becomes Flying-type during tailwind if no other weathers are active
    basePower = move.bp * ((field.weather && !field.hasWeather('Strong Winds')) ||
                           (field.attackerSide.isTailwind && field.chromaticField === 'Sky') ? 2 : 1);
    if (field.hasWeather('Sun', 'Harsh Sunshine', 'Rain', 'Heavy Rain') &&
        attacker.hasItem('Utility Umbrella') && !field.attackerSide.isTailwind) {
      basePower = move.bp;
    }
    desc.moveBP = basePower;
    break;
  case 'Terrain Pulse':
    basePower = move.bp * (isGrounded(attacker, field, field.attackerSide) && field.terrain ? 2 : 1);
    desc.moveBP = basePower;
    break;
  case 'Rising Voltage':
    basePower = move.bp * ((isGrounded(defender, field, field.defenderSide) && field.hasTerrain('Electric')) ? 2 : 1);
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
    if (attacker.item?.endsWith('Berry')) {
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

    // Nature Power cannot affect Dark-types if it is affected by Prankster
    if (attacker.hasAbility('Prankster') && (defender.types.includes('Dark') ||
       (attacker.hasAbility('Telepathy') && field.chromaticField === 'Ancient-Ruins'))) { // Ancient Ruins - Telepathy grants Prankster
      basePower = 0;
      desc.moveName = 'Nature Power';
      desc.attackerAbility = attacker.ability;
      break;
    }
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
      // Nature Power does not affect grounded Pokemon if it is affected by
      // Prankster and there is Psychic Terrain active
      if (isGrounded(defender, field, field.defenderSide) && (attacker.hasAbility('Prankster') ||
         (attacker.hasAbility('Telepathy') && field.chromaticField === 'Ancient-Ruins'))) { // Ancient Ruins - Telepathy grants Prankster
        basePower = 0;
        desc.attackerAbility = attacker.ability;
      } else {
        basePower = 90;
        desc.moveName = 'Psychic';
      }
      break;
    default:
      basePower = 80;
      desc.moveName = 'Tri Attack';
    }
    // Fields - Nature Power move base power, name and category
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
      case 'Dragons-Den':
        basePower = 120;
        desc.moveName = 'Make It Rain';
        break;
      case 'Thundering-Plateau':
        basePower = 60;
        desc.moveName = 'Shock Wave';
        break;
      case 'Starlight-Arena':
        basePower = 0;
        desc.moveName = 'Lunar Dance';
        break;
      case 'Ring-Arena':
        basePower = 120;
        move.category = 'Physical';
        desc.moveName = 'Close Combat';
        break;
      case 'Volcanic-Top':
        basePower = Math.max(1, Math.floor((150 * attacker.curHP()) / attacker.maxHP()));;
        desc.moveName = 'Eruption';
        break;
      case 'Sky':
        basePower = 100;
        desc.moveName = 'Bleakwind Storm';
        break;
      case 'Haunted-Graveyard':
        basePower = 90;
        move.category = 'Physical';
        desc.moveName = 'Phantom Force';
        break;
      case 'Flower-Garden':
        basePower = 90;
        desc.moveName = 'Petal Blizzard';
        break;
      case 'Desert':
        basePower = 90;
        move.category = 'Physical';
        desc.moveName = 'Thousand Waves';
        break;
      case 'Snowy-Peaks':
        basePower = 120;
        desc.moveBP = basePower;
        move.category = 'Physical';
        desc.moveName = 'Avalanche';
        break;
      case 'Blessed-Sanctum':
        basePower = 100;
        desc.moveName = 'Judgment';
        break;
      case 'Acidic-Wasteland':
        basePower = 90;
        desc.moveName = 'Sludge Bomb';
        break;
      case 'Ancient-Ruins':
        basePower = 80;
        desc.moveName = 'Eerie Spell';
        break;
      case 'Cave':
        basePower = 75;
        move.category = 'Physical';
        desc.moveName = 'Rock Slide';
        break;
      case 'Factory':
        basePower = 50;
        move.category = 'Physical';
        move.hits = 2;
        desc.moveName = 'Gear Grind';
        desc.hits = move.hits;
        break;
      case 'Waters-Surface':
        basePower = 90;
        desc.moveName = 'Surf';
        break;
      case 'Underwater':
        basePower = 80;
        move.category = 'Physical';
        desc.moveName = 'Dive';
        break;
      case 'Rainbow':
        basePower = 100;
        move.category = 'Physical';
        desc.moveName = 'Jungdement';
        break;
      case 'Undercolony':
        basePower = 80;
        move.category = 'Physical';
        move.drain = [1, 2];
        desc.moveName = 'Leech Life';
        break;
      case 'Inverse':
        basePower = 0;
        desc.moveName = 'Trick Room';
        break;
      default:
        basePower = 80;
        desc.moveName = 'Tri Attack';
        break;
      }
    break;
  case 'Water Shuriken':
    basePower = attacker.named('Greninja-Ash') && attacker.hasAbility('Battle Bond') ? 20 : 15;
    desc.moveBP = basePower;
    break;
  // Triple Axel's damage increases after each consecutive hit (20, 40, 60)
  case 'Triple Axel':
    basePower = hit * 20;
    desc.moveBP = move.hits === 2 ? 60 : move.hits === 3 ? 120 : 20;
    break;
  // Triple Kick's damage increases after each consecutive hit (10, 20, 30)
  case 'Triple Kick':
    basePower = hit * 10;
    desc.moveBP = move.hits === 2 ? 30 : move.hits === 3 ? 60 : 10;
    break;
  case 'Crush Grip':
  case 'Wring Out':
    basePower = 100 * Math.floor((defender.curHP() * 4096) / defender.maxHP());
    basePower = Math.floor(Math.floor((120 * basePower + 2048 - 1) / 4096) / 100) || 1;
    desc.moveBP = basePower;
    break;
  case 'Hard Press':
    basePower = 100 * Math.floor((defender.curHP() * 4096) / defender.maxHP());
    basePower = Math.floor(Math.floor((100 * basePower + 2048 - 1) / 4096) / 100) || 1;
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

  // Fields - Move modifications (base power, name, category)

  // Desert - Dig is 100 base power
  if (field.chromaticField === 'Desert' && move.named('Dig')) {
    basePower = 100;
    desc.moveBP = basePower;
    desc.chromaticField = field.chromaticField;
  }

  // Snowy Peaks - Avalanche's power is always doubled
  if (field.chromaticField === 'Snowy-Peaks' && move.named('Avalanche')) {
    basePower = move.bp * 2;
    desc.moveBP = basePower;
    desc.chromaticField = field.chromaticField;
  }

  // Blessed Sanctum - Multipulse: Hyper Voice, Tri Attack, and Echoed Voice become Judgement
  if (field.chromaticField === 'Blessed-Sanctum' && move.named('Hyper Voice', 'Tri Attack', 'Echoed Voice')) {
    basePower = 100;
    desc.moveName = 'Judgment';
  }

  // Factory - Magnet Bomb now acts like steel-type Special Future Sight
  if (field.chromaticField === 'Factory' && move.named('Magnet Bomb')) {
    move.category = 'Special';
    desc.chromaticField = field.chromaticField;
  }

  // Undercolony - Silver Wind gains +10 power for each of the user’s stat boosts
  if (field.chromaticField === 'Undercolony' && move.named('Silver Wind')) {
    basePower = move.bp + 10 * countBoosts(gen, attacker.boosts);
    desc.moveBP = basePower;
    desc.chromaticField = field.chromaticField;
  }

  // Crests - Move modifications (base power, name, category)

  // Cinccino Crest - All moves non flat damage moves turn into multi-strike moves, 2-5 hits of 35% the BP
  if (attacker.named('Cinccino-Crest') && !handleFixedDamageMoves(attacker, move) && !move.named('Tail Slap', 'Bullet Seed', 'Triple Axel', 'Double Slap', 'Rock Blast')) {
    basePower *= 0.35;
    desc.moveBP = pokeRound(basePower * 10) / 10; // Max 1 decimal
  }

  // Luvdisc Crest - The Base Power of all single-hit moves matches Luvdisc's happiness, capping at a Base Power of 250
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
  ) || move.isMax) {
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
    turnOrder,
    hit
  );
  basePower = OF16(Math.max(1, pokeRound((basePower * chainMods(bpMods, 41, 2097152)) / 4096)));
  if (
    attacker.teraType && move.type === attacker.teraType &&
    (attacker.hasType(attacker.teraType) || attacker.hasInvisisbleType(defender, field, attacker.teraType)) && move.hits === 1 && !move.multiaccuracy &&
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
  turnOrder: string,
  hit: number
) {
  const bpMods = [];

  // Move effects
  const defenderItem = (defender.item && defender.item !== '')
    ? defender.item : defender.disabledItem;
  let resistedKnockOffDamage =
    (!defenderItem || isQPActive(defender, field)) ||
    (defender.named('Dialga-Origin') && defenderItem === 'Adamant Crystal') ||
    (defender.named('Palkia-Origin') && defenderItem === 'Lustrous Globe') ||
    // Griseous Core for gen 9, Griseous Orb otherwise
    (defender.name.includes('Giratina-Origin') && defenderItem.includes('Griseous')) ||
    (defender.name.includes('Arceus') && defenderItem.includes('Plate')) ||
    (defender.name.includes('Genesect') && defenderItem.includes('Drive')) ||
    (defender.named('Groudon', 'Groudon-Primal') && defenderItem === 'Red Orb') ||
    (defender.named('Kyogre', 'Kyogre-Primal') && defenderItem === 'Blue Orb') ||
    (defender.name.includes('Silvally') && defenderItem.includes('Memory')) ||
    defenderItem.includes(' Z') ||
    (defender.named('Zacian') && defenderItem === 'Rusted Sword') ||
    (defender.named('Zamazenta') && defenderItem === 'Rusted Shield') ||
    (defender.name.includes('Ogerpon-Cornerstone') && defenderItem === 'Cornerstone Mask') ||
    (defender.name.includes('Ogerpon-Hearthflame') && defenderItem === 'Hearthflame Mask') ||
    (defender.name.includes('Ogerpon-Wellspring') && defenderItem === 'Wellspring Mask') ||
    (defender.named('Venomicon-Epilogue') && defenderItem === 'Vile Vial');

  // The last case only applies when the Pokemon has the Mega Stone that matches its species
  // (or when it's already a Mega-Evolution)
  if (!resistedKnockOffDamage && defenderItem) {
    const item = gen.items.get(toID(defenderItem))!;
    resistedKnockOffDamage = !!item.megaEvolves && defender.name.includes(item.megaEvolves);
  }

  // Crests - Don't increase Knock Off damage
  if (!resistedKnockOffDamage && defenderItem) {
    resistedKnockOffDamage = defenderItem === 'Up-Grade' && defender.name.includes('-Crest');
  }

  // Resist knock off damage if your item was already knocked off
  if (!resistedKnockOffDamage && hit > 1 && !defender.hasAbility('Sticky Hold')) {
    resistedKnockOffDamage = true;
  }

  if ((move.named('Facade') && attacker.hasStatus('brn', 'par', 'psn', 'tox')) ||
    (move.named('Brine') && defender.curHP() <= defender.maxHP() / 2) ||
    (move.named('Venoshock') && defender.hasStatus('psn', 'tox')) ||
    (move.named('Lash Out') && (countBoosts(gen, attacker.boosts) < 0))
  ) {
    bpMods.push(8192);
    desc.moveBP = basePower * 2;
  } else if (
    move.named('Expanding Force') && isGrounded(attacker, field, field.attackerSide) && field.hasTerrain('Psychic')
  ) {
    move.target = 'allAdjacentFoes';
    bpMods.push(6144);
    desc.moveBP = basePower * 1.5;
  } else if ((move.named('Knock Off') && !resistedKnockOffDamage) ||
    (move.named('Misty Explosion') && isGrounded(attacker, field, field.attackerSide) && field.hasTerrain('Misty')) ||
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
    const types = defender.teraType && defender.teraType !== 'Stellar'
      ? [defender.teraType] : defender.types;
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
  if (isGrounded(attacker, field, field.attackerSide)) {
    if ((field.hasTerrain('Electric') && move.hasType('Electric')) ||
        (field.hasTerrain('Grassy') && move.hasType('Grass')) ||
        (field.hasTerrain('Psychic') && move.hasType('Psychic'))
    ) {
      bpMods.push(terrainMultiplier);
      desc.terrain = field.terrain;
    }
  }
  if (isGrounded(defender, field, field.defenderSide)) {
    if ((field.hasTerrain('Misty') && move.hasType('Dragon')) ||
        (field.hasTerrain('Grassy') && move.named('Bulldoze', 'Earthquake'))
    ) {
      bpMods.push(2048);
      desc.terrain = field.terrain;
    }
  }

  // Eclipse - Dark type Pokemon deal 1.3x damage when any Pokemon on the field has a negative stat drop
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

  // Ring Arena - Grit Stage Effects: 5 - Attacks deal 1.5x damage
  if (attacker.gritStages! >= 5) {
    bpMods.push(6144);
    desc.gritStages = attacker.gritStages;
    desc.chromaticField = field.chromaticField;
  }

  // Abilities

  // Use BasePower after moves with custom BP to determine if Technician should boost
  if ((attacker.hasAbility('Flare Boost') && attacker.hasStatus('brn') && move.category === 'Special') ||
    (attacker.hasAbility('Toxic Boost') &&
      (attacker.hasStatus('psn', 'tox') || field.chromaticField === 'Acidic-Wasteland') && move.category === 'Physical') || // Acidic Wasteland - Activates Toxic Boost
    (attacker.hasAbility('Mega Launcher') && move.flags.pulse) ||
    ((attacker.hasAbility('Strong Jaw') || attacker.named('Feraligatr-Crest')) && move.flags.bite) || // Feraligatr Crest - Gains Strong Jaws
    (attacker.hasAbility('Steely Spirit') && move.hasType('Steel')) ||
    (attacker.hasAbility('Lunar Idol') && move.hasType('Ice')) || // Aevian - Lunar Idol: Ice-type moves deal 50% more damage
    (attacker.hasAbility('Solar Idol') && move.hasType('Fire')) || // Aevian - Solar Idol: Fire-type moves deal 50% more damage
    (attacker.hasAbility('Sharpness') && move.flags.slicing)
  ) {
    bpMods.push(6144);
    desc.attackerAbility = attacker.ability;
  }

  if (attacker.hasAbility('Technician') || attacker.named('Dusknoir-Crest')) {
    if (basePower <= 60) {
      bpMods.push(6144);
      desc.attackerAbility = 'Technician';
    // Factory - Technician boosts base power up to 70 Base (TODO: CHECK IF DUSKNOIR SHOULD BE BUFFED BY THIS)
    } else if (field.chromaticField === 'Factory' && basePower <= 70) {
      bpMods.push(6144);
      desc.attackerAbility = 'Technician';
      desc.chromaticField = field.chromaticField;
    }
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
      (move.secondaries || move.named('Order Up')) && !move.isMax) ||
    (attacker.hasAbility('Sand Force') &&
      field.hasWeather('Sand') && move.hasType('Rock', 'Ground', 'Steel')) ||
    (attacker.hasAbility('Analytic') &&
      (turnOrder !== 'first' || field.defenderSide.isSwitching === 'out')) ||
    // Aevian - Inexorable: If the user moves before the target its Dragon-type moves will get a 1.3x boost in power
    (attacker.hasAbility('Inexorable') && move.hasType('Dragon') &&
      (turnOrder === 'first' || field.defenderSide.isSwitching === 'out')) ||
    (attacker.hasAbility('Tough Claws') && move.flags.contact) ||
    (attacker.hasAbility('Punk Rock') && move.flags.sound)
  ) {
    bpMods.push(5325);
    desc.attackerAbility = attacker.ability;
  // Desert - Activates Sand Force
  } else if ((attacker.hasAbility('Sand Force') &&
              field.chromaticField === 'Desert' && move.hasType('Rock', 'Ground', 'Steel'))) {
    bpMods.push(5325);
    desc.attackerAbility = attacker.ability;
    desc.chromaticField = field.chromaticField;
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
    // Snowy Peaks - Refrigerate damage bonus is increased to 1.5x
    if (attacker.hasAbility('Refrigerate') && field.chromaticField === 'Snowy-Peaks') {
      bpMods.push(6144);
      desc.chromaticField = field.chromaticField;
    // Custom Eeveelutions - Type Sync: Makes normal moves match the users primary type and grants a 1.1 damage boost unless they are ghost
    } else if (attacker.hasAbility('Type Sync')) {
      if (attacker.types[0] !== 'Ghost') {
        bpMods.push(4505);
      }
    } else {
      bpMods.push(4915);
    }
  }

  if ((attacker.hasAbility('Reckless') && (move.recoil || move.hasCrashDamage)) ||
      (attacker.hasAbility('Iron Fist') && move.flags.punch)
  ) {
    bpMods.push(4915);
    desc.attackerAbility = attacker.ability;
  // Undercolony - Rock Head grants Reckless
  } else if ((attacker.hasAbility('Rock Head') && field.chromaticField === 'Undercolony' && (move.recoil || move.hasCrashDamage))) {
    bpMods.push(4915);
    desc.attackerAbility = attacker.ability;
    desc.chromaticField = field.chromaticField;
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
  } else if (attacker.hasItem('Punching Glove') && move.flags.punch) {
    bpMods.push(4506);
  }

  // Crests - Misc Modifiers

  // Beheeyem Crest - Reduces damage taken from Pokemon moving before it by 33%
  if (defender.named('Beheeyem-Crest') && defender.stats.spe <= attacker.stats.spe) {
    bpMods.push(2732);
  }

  // Boltund Crest - Increases damage dealt with bite moves when moving before the opponent by 30%
  if (attacker.named('Boltund-Crest') && move.flags.bite && attacker.stats.spe >= defender.stats.spe) {
    bpMods.push(5324);
  }

  // Claydol Crest - Increases damage dealt with beam moves by 50%
  if (attacker.named('Claydol-Crest') && move.flags.beam) {
    bpMods.push(6144);
  }

  // Druddigon Crest - Increases damage dealt with fire and dragon type moves by 30% 
  if (attacker.named('Druddit') && move.hasType('Fire', 'Dragon')) {
    bpMods.push(5324);
  }

  // Fearow Crest - Increases damage dealt with stabbing moves by 50%
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
  
  // Crests - Attack Stat Swaps (in general)
  const attackStat =
    move.named('Shell Side Arm') &&
    getShellSideArmCategory(attacker, defender) === 'Physical'
      ? 'atk'
      : (attacker.named('Claydol-Crest') && move.category === 'Special') || move.named('Body Press')
        ? 'def' // Claydol Crest - Uses physical defense stat instead of special defense stat
        : attacker.named('Dedenne-Crest')
          ? 'spe' // Dedenne Crest - Uses physical defense stat instead of special defense stat
          : attacker.named('Infernape-Crest')
            ? (move.category === 'Special' ? 'spd' : 'def') // Infernape Crest - Uses defense stats instead of offense stats
            : attacker.named('Reuniclus-Crest-Fighting')
              ? (move.category === 'Special' ? 'atk' : 'spa') // Reuniclus Crest (Fighting): Swaps offense stats
              : attacker.named('Typhlosion-Crest') && move.category === 'Physical'
                ? 'spa' // Typhlosion Crest - Uses special attack stat instead of physical attack stat
                : move.category === 'Special'
                  ? 'spa'
                  : 'atk';
  desc.attackEVs =
    move.named('Foul Play')
      ? getStatDescriptionText(gen, defender, attackStat, defender.nature)
      : getStatDescriptionText(gen, attacker, attackStat, attacker.nature);
  const attackSource = move.named('Foul Play') ? defender : attacker;
  // Claydol Crest - Uses physical defense stat instead of special defense stat, but uses regular stat changes 
  if (attacker.named('Claydol-Crest') && move.category === 'Special') {
    attack = getModifiedStat(attacker.rawStats['def']!, attacker.boosts['spa']!);
    desc.attackBoost = attackSource.boosts['spa'];
  // Dedenne Crest - Uses speed stat instead of offenses, but uses regular stat changes
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
  // Rainbow - Sylveon - gains Unaware defender
  } else if (defender.hasAbility('Unaware') || (defender.named('Sylbeon') && field.chromaticField === 'Rainbow')) {
    attack = attackSource.rawStats[attackStat];
    desc.defenderAbility = defender.ability;
  } else {
    attack = getModifiedStat(attackSource.rawStats[attackStat]!, attackSource.boosts[attackStat]!);
    desc.attackBoost = attackSource.boosts[attackStat];
  }

  // unlike all other attack modifiers, Hustle gets applied directly
  if (attacker.hasAbility('Hustle') && move.category === 'Physical') {
    attack = pokeRound((attack * 3) / 2);
    desc.attackerAbility = attacker.ability;
  }

  // Crests - Attack Increases

  // Aevian Ampharos Crest - Increases move in first move slot by 20% (STAB) or 50% (non-STAB)
  if (attacker.named('Ampharos-Aevian-Crest') && move.moveSlot === 1) {
    attack = attacker.hasType(move.type) ? pokeRound((attack * 6) / 5) : pokeRound((attack * 3) / 2);
    desc.moveSlot = move.moveSlot;
  }

  // Cofagrigus Crest - Increases special attack by 25%
  if (attacker.named('Cofagrigus-Crest') && move.category === 'Special') {
    attack = pokeRound((attack * 5) / 4);
  }

  // Crabominable Crest - Increases physical attack and physical defense by 20%
  if (attacker.named('Crabominable-Crest') && move.named('Body Press')) {
    attack = pokeRound((attack * 6) / 5);
  }

  // Cryogonal Crest - Increases offenses by 10% of its special defense (which is buffed by 20%)
  if (attacker.named('Cryogonal-Crest')) {
    attack += Math.floor((Math.floor(attacker.stats['spd'] * 6 / 5) / 10));
  }

  // Dusknoir Crest - Increases physical attack by 25%
  if (attacker.named('Dusknoir-Crest') && move.category === 'Physical') {
    attack = pokeRound((attack * 5) / 4);
  }

  // Hypno Crest - Increases special attack by 50%
  if (attacker.named('Hypno-Crest') && move.category === 'Special') {
    attack = pokeRound((attack * 3) / 2);
  }

  // Magcargo Crest - Increases special attack by 30%
  if (attacker.named('Magcargo-Crest') && move.category === 'Special') {
    attack = pokeRound((attack * 13) / 10);
  }

  // Oricorio Crest - Increases special attack by 25%
  if ((attacker.named('Oricorio-Crest-Baile') || attacker.named('Oricorio-Crest-Pa\'u') || attacker.named('Oricorio-Crest-Pom-Pom') || attacker.named('Oricorio-Crest-Sensu'))
    && move.category === 'Special') {
    attack = pokeRound((attack * 5) / 4);
  }

  // Relicanth Crest - Increases offenses by 25% + 10% * consecutive turns that it has been on the field
  if (attacker.named('Relicanth-Crest')) {
    let turns = attacker.relicanthTurns!;
    attack = pokeRound((attack * (125 + (10 * turns))) / 100);
    desc.relicanthTurnsAttack = turns;
  }

  // Simi Monkeys Crests: Increases offenses by 20%
  if (attacker.named('Simipour-Crest') || attacker.named('Simisage-Crest') || attacker.named('Simisear-Crest')) {
    attack = pokeRound((attack * 6) / 5);
  }

  // Skuntank Crest - Increases offenses by 20%
  if (attacker.named('Skuntank-Crest')) {
    attack = pokeRound((attack * 6) / 5);
  }

  // Spiritomb Crest - Increases offenses by 20% for each fainted foe
  if (attacker.named('Spiritomb-Crest')) {
    let foesFainted = attacker.foesFainted!;
    if (foesFainted > 0) {
      attack = pokeRound((attack * (5 + foesFainted)) / 5);
      desc.foesFainted = foesFainted;
    }
  }

  // Stantler + Wyrdeer Crest - Increases physical attack by 50%
  if ((attacker.named('Stantler-Crest') || attacker.named('Wyrdeer-Crest')) && move.category === 'Physical') {
    attack = pokeRound((attack * 3) / 2);
  }

  // Vespiquen Crest - Increases offenses by 50% while in attack mode
  if (attacker.named('Vespiquen-Crest-Offense')) {
    attack = pokeRound((attack * 3) / 2);
  }

  // Whiscash Crest - Increases offenses by 20%
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
    (attacker.hasAbility('Solar Idol') && // Aevian - Solar Idol: Attack is boosted by 50% in Sun
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    move.category === 'Physical') ||
    (attacker.hasAbility('Lunar Idol') && // Aevian - Lunar Idol: Special Attack is boosted by 50% in Snow/Hail
    field.hasWeather('Hail', 'Snow') &&
    move.category === 'Special')) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
    desc.weather = field.weather;
  // Flower Garden - Activates Flower Gift
  } else if (attacker.named('Cherrim') &&
             attacker.hasAbility('Flower Gift') &&
             field.chromaticField === 'Flower-Garden' &&
             move.category === 'Physical') {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
    desc.chromaticField = field.chromaticField;
  } else if (
    // Gorilla Tactics has no effect during Dynamax (Anubis)
    (attacker.hasAbility('Gorilla Tactics') && move.category === 'Physical' &&
     !attacker.isDynamaxed)) {
    atMods.push(6144);
    desc.attackerAbility = attacker.ability;
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
  } else if ((field.chromaticField === 'Jungle' && attacker.hasAbility('Swarm') && move.hasType('Bug')) || // Jungle - Activates Swarm
             (field.chromaticField === 'Thundering-Plateau' && attacker.hasAbility('Plus', 'Minus') && move.category === 'Special') || // Thundering Plateau - Activates Plus and Minus
             (field.chromaticField === 'Volcanic-Top' && (attacker.hasAbility('Solar Power') || (attacker.hasAbility('Blaze') && move.hasType('Fire')))) || // Volcanic Top - Activates Blaze and Solar Power
             (field.chromaticField === 'Flower-Garden' && attacker.hasAbility('Overgrow') && move.hasType('Grass')) || // Flower Garden - Activates Overgrow
             (field.chromaticField === 'Waters-Surface' && attacker.hasAbility('Torrent') && move.hasType('Water'))) { // Water's Surface - Activates Torrent
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
  } else if (attacker.hasAbility('Water Bubble') && move.hasType('Water')) {
    atMods.push(8192);
    desc.attackerAbility = attacker.ability;
  } else if (attacker.hasAbility('Huge Power', 'Pure Power')) {
    if (field.chromaticField === 'Ancient-Ruins') {
      // Ancient Ruins - Huge Power and Pure Power now doubles the higher attacking stat
      if (move.category == (attacker.stats.atk > attacker.stats.spa ? 'Physical' : 'Special')) {
        atMods.push(8192);
        desc.attackerAbility = attacker.ability;
        desc.chromaticField = field.chromaticField;
      }
    } else if (move.category === 'Physical') {
      atMods.push(8192);
      desc.attackerAbility = attacker.ability;
    }
  }

  if (
    field.attackerSide.isFlowerGift &&
    !attacker.hasAbility('Flower Gift') &&
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    move.category === 'Physical') {
    atMods.push(6144);
    desc.weather = field.weather;
    desc.isFlowerGiftAttacker = true;
  }

  if (
    field.attackerSide.isSteelySpirit &&
    move.hasType('Steel')
  ) {
    atMods.push(6144);
    desc.isSteelySpiritAttacker = true;
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

  // Ring Arena - Guts additionally grants Special Defense on activation
  if (defender.hasAbility('Guts') && defender.status && move.category === 'Special' && field.chromaticField === 'Ring-Arena') {
    atMods.push(2867);
    desc.defenderAbility = defender.ability;
    desc.chromaticField = field.chromaticField;
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
      field.hasTerrain('Electric')) ||
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

  // Fields - Attack Modifiers

  // Haunted Graveyard - Dazzling Gleam, Draining Kiss, Foul Play, and Spirit Break deal 1.2x damage
  if (field.chromaticField === 'Haunted-Graveyard' && move.named('Dazzling Gleam', 'Draining Kiss', 'Foul Play', 'Spirit Break')) {
    atMods.push(4915);
    desc.chromaticField = field.chromaticField;
  }

  if (field.chromaticField === 'Flower-Garden') {
    // Flower Garden - Horn Leech and Seed Bomb deal 1.3x damage
    if (move.named('Horn Leech', 'Seed Bomb')) {
      atMods.push(5324);
      desc.chromaticField = field.chromaticField;
    // Flower Garden - Leafage, Leaf Blade, Magical Leaf, Razor Leaf deal 1.2x damage
    } else if (move.named('Leafage', 'Leaf Blade', 'Magical Leaf', 'Razor Leaf')) {
      atMods.push(4915);
      desc.chromaticField = field.chromaticField;
    }
  }

  // Desert - Scald and Steam Eruption deal 1.1x damage
  if (field.chromaticField === 'Desert' && move.named('Scald', 'Steam Eruption')) {
    atMods.push(4505);
    desc.chromaticField = field.chromaticField;
  }

  // Blessed Sanctum - Multi-Attack, Mystical Fire, Sacred Fire, Ancient Power gain 1.2x power
  if (field.chromaticField === 'Blessed-Sanctum' && move.named('Multi-Attack', 'Mystical Fire', 'Sacred Fire', 'Ancient Power')) {
    atMods.push(4915);
    desc.chromaticField = field.chromaticField;
  }

  // Acidic Wasteland - Mud Bomb, Mud Shot, Mud-Slap, and Muddy Water deal 1.3x damage
  if (field.chromaticField === 'Acidic-Wasteland' && move.named('Mud Bomb', 'Mud Shot', 'Mud-Slap', 'Muddy Water')) {
    atMods.push(5324);
    desc.chromaticField = field.chromaticField;
  }

  // Ancient Ruins - Aura Sphere deals 1.1x damage, Mystical Fire deals 1.2x damage, and Magical Leaf deals 1.3x damage
  if (field.chromaticField === 'Ancient-Ruins') {
    if (move.named('Aura Sphere')) {
      atMods.push(4505);
      desc.chromaticField = field.chromaticField;
    } else if (move.named('Mystical Fire')) {
      atMods.push(4915);
      desc.chromaticField = field.chromaticField;
    } else if (move.named('Magical Leaf')) {
      atMods.push(5324);
      desc.chromaticField = field.chromaticField;
    }
  }

  // Cave - Sound moves deal 1.3x damage
  if (field.chromaticField === 'Cave' && move.flags.sound) {
    atMods.push(5324);
    desc.chromaticField = field.chromaticField;
  }

  if (field.chromaticField === 'Factory') {
    // Factory - Discharge deals 1.1x damage
    if (move.named('Discharge')) {
      atMods.push(4505);
      desc.chromaticField = field.chromaticField;
    }

    // Factory - Lock On grants 2.5x power to the attack on the next turn
    if (attacker.isLockOn) {
      atMods.push(10240);
      desc.fieldCondition = 'Lock On';
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Waters-Surface') {
    // Water's Surface - Discharge, Parabolic Charge, and Shock Wave deal 1.3x damage
    if (move.named('Discharge', 'Parabolic Charge', 'Shock Wave')) {
      atMods.push(5324);
      desc.chromaticField = field.chromaticField;
    // Water's Surface - Dive is 1-Turn and deals 1.2x damage
    } else if (move.named('Dive')) {
      atMods.push(4915);
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Underwater') {
    // Underwater - Anchor Shot, Discharge, Parabolic Charge, Shock Wave, Sludge Wave, Triple Dive, and Water Pulse deal 1.3x damage
    if (move.named('Anchor Shot', 'Discharge', 'Parabolic Charge', 'Shock Wave', 'Sludge Wave', 'Triple Dive', 'Water Pulse')) {
      atMods.push(5324);
      desc.chromaticField = field.chromaticField;
    }
  }

  if (field.chromaticField === 'Rainbow') {
    // Rainbow -  Mystical Fire, Tri Attack, Sacred Fire, Fire Pledge, Water Pledge, Grass Pledge, Aurora Beam, Judgement, Relic Song, Hidden Power, Secret Power, Mist Ball, Sparkling Aria, Prismatic Laser receive a 1.3x damage boost.
    if (move.named('Prismatic Laser', 'Sparkling Aria', 'Mist Ball', 'Secret Power', 'Hidden Power', 'Relic Song', 'Judgement', 'Aurora Beam', 'Mystical Fire', 'Tri Attack', 'Grass Pledge', 'Water Pledge', 'Water Pledge', 'Fire Pledge', 'Sacred Fire')) {
      atMods.push(5324);
      desc.chromaticField = field.chromaticField;
    }
  }

  // Undercolony - Broken Carapace: While	Bug & Rock types <50% HP gain 1.2x Attack and Spa Attack
  if (field.chromaticField === 'Undercolony' && attacker.hasType('Bug', 'Rock') && attacker.curHP() < (attacker.maxHP() / 2)) {
    atMods.push(4915);
    desc.fieldCondition = 'Broken Carapace';
    desc.chromaticField = field.chromaticField;
  }

  // Fields - Prism Scale Effects: Miscellaneous boosts
  if ((attacker.hasItem('Prism Scale') && !(field.chromaticField === 'None'))) {
    // Inverse - The user's next move becomes typeless and deals 1.5x damage until it's switched out
    if ((field.chromaticField === 'Inverse') && (move.hasType('???'))) {
      atMods.push(6144);
      desc.attackerItem = attacker.item;
    }
  }

  // Crests - Attack Modifiers

  // Seviper Crest - Increases damage by 50% * percentage of target health left / 100
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
    (move.named('Shell Side Arm') && getShellSideArmCategory(attacker, defender) === 'Physical') ||
    (move.named('Power Gem') && field.chromaticField === 'Cave' && defender.stats.def < defender.stats.spd); // Cave - Power Gem targets the opponent's lower defense stat between Defense and Special Defense
  
  // Crests - Defense Stat Swaps (in general)
  const defenseStat = 
    (defender.named('Infernape-Crest'))
      ? (move.category === 'Special' ? 'spa' : 'atk') // Infernape Crest - Uses offense stat (changes) instead of defense stat (changes)
      : (defender.named('Magcargo-Crest') && hitsPhysical)
        ? 'spe' // Magcargo Crest - Uses speed stat (changes) instead of defense stat (changes)
        : hitsPhysical
          ? 'def'
          : 'spd';
  
  desc.defenseEVs = getStatDescriptionText(gen, defender, defenseStat, defender.nature);
  if (defender.boosts[defenseStat] === 0 ||
      (isCritical && defender.boosts[defenseStat] > 0) ||
      move.ignoreDefensive) {
    defense = defender.rawStats[defenseStat];
  // Rainbow - Sylveon - gains Unaware attacker
  } else if ((attacker.hasAbility('Unaware') || (defender.named('Sylbeon') && field.chromaticField === 'Rainbow'))) {
    defense = defender.rawStats[defenseStat];
    desc.attackerAbility = attacker.ability;
  // Ring Arena - Grit Stage Effects: 1 - Attacks ignore the opponent's stat changes
  } else if (attacker.gritStages! >= 1) {
    defense = defender.rawStats[defenseStat];
    desc.gritStages = attacker.gritStages;
    desc.chromaticField = field.chromaticField;
  } else {
    defense = getModifiedStat(defender.rawStats[defenseStat]!, defender.boosts[defenseStat]!);
    desc.defenseBoost = defender.boosts[defenseStat];
  }

  // unlike all other defense modifiers, Sandstorm SpD boost gets applied directly
  if (field.hasWeather('Sand') && (defender.hasType('Rock') || defender.hasInvisisbleType(attacker, field, 'Rock'))) {
    if (!hitsPhysical) {
      defense = pokeRound((defense * 3) / 2);
      desc.weather = field.weather;
    // Cave - Sandstorm boosts the Defense of Rock Types 1.2x
    } else if (hitsPhysical && field.chromaticField === 'Cave') {
      defense = pokeRound((defense * 6) / 5);
      desc.weather = field.weather;
      desc.chromaticField = field.chromaticField;
    }
  }
  if (field.hasWeather('Snow') && (defender.hasType('Ice') || defender.hasInvisisbleType(attacker, field, 'Ice') || defender.named('Empoleon-Crest')) && hitsPhysical) { // Empoleon Crest - Is affected by snow
    defense = pokeRound((defense * 3) / 2);
    desc.weather = field.weather;
  }

  // Crests - Defense Increases

  // Cofagrigus Crest - Increases special defense by 25% 
  if (defender.named('Cofagrigus-Crest') && move.category === 'Special') {
    defense = pokeRound((defense * 5) / 4);
  }

  // Crabominable Crest - Increases defenses by 20%
  if (defender.named('Crabominable-Crest')) {
    defense = pokeRound((defense * 6) / 5);
  }

  // Meganium Crest - Increases defenses by 20%
  if (defender.named('Meganium-Crest')) {
    defense = pokeRound((defense * 6) / 5);
  }

  // Noctowl Crest - Increases physical defense by 20%
  if (defender.named('Noctowl-Crest') && move.category === 'Physical') {
    defense = pokeRound((defense * 6) / 5);
  }

  // Phione Crest - Increases defenses by 50%
  if (defender.named('Phione-Crest')) {
    defense = pokeRound((defense * 3) / 2);
  }

  // Relicanth Crest - Increases special defense by 25% + 10% * consecutive turns that it has been on the field
  if (defender.named('Relicanth-Crest') && move.category === 'Special') {
    let turns = defender.relicanthTurns === undefined ? 0 : defender.relicanthTurns;
    defense = pokeRound((defense * (125 + (10 * turns))) / 100);
    desc.relicanthTurnsDefense = turns;
  }
  
  // Vespiquen Crest (Defense): Increases defense by 50%
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

  // Cryogonal Crest - Increases special defense by 20%, and physical defense by 10% of its special defense
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
    // Dragon's Den - Marvel Scale is activated
    } else if (field.chromaticField === 'Dragons-Den') {
      dfMods.push(6144);
      desc.defenderAbility = defender.ability;
      desc.chromaticField = field.chromaticField;
    }
  } else if (
    defender.named('Cherrim') &&
    defender.hasAbility('Flower Gift') &&
    !hitsPhysical
  ) {
    if (field.hasWeather('Sun', 'Harsh Sunshine')) {
      dfMods.push(6144);
      desc.defenderAbility = defender.ability;
      desc.weather = field.weather;
    // Flower Garden - Activates Flower Gift
    } else if (field.chromaticField === 'Flower-Garden') {
      dfMods.push(6144);
      desc.defenderAbility = defender.ability;
      desc.chromaticField = field.chromaticField;
    }
  } else if (
    field.defenderSide.isFlowerGift &&
    field.hasWeather('Sun', 'Harsh Sunshine') &&
    !hitsPhysical) {
    dfMods.push(6144);
    desc.weather = field.weather;
    desc.isFlowerGiftDefender = true;
  } else if (
    defender.hasAbility('Grass Pelt') &&
    hitsPhysical
  ) {
    // FLower Garden - Activates Grass Pelt | Grass Pelt boosts Defense by 2x (From 1.5x)
    if (field.chromaticField === 'Flower-Garden') {
      dfMods.push(8192);
      desc.defenderAbility = defender.ability;
      desc.chromaticField = field.chromaticField;
    } else if (field.hasTerrain('Grassy')) {
      dfMods.push(6144);
      desc.defenderAbility = defender.ability;
    }
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

  // Ring Arena - Protective Pads gives the holder 1.3x Special Defense
  if (defender.hasItem('Protective Pads') && field.chromaticField === 'Ring-Arena' && !hitsPhysical) {
    dfMods.push(5324);
    desc.defenderItem = defender.item;
    desc.chromaticField = field.chromaticField;
  }

  // Crests - Defense Modifiers

  // Electrode Crest - Decreases the target's physical defense stat by 50%
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
      let modifier = 6144;
      // Water's Surface - Rain boosts Water Type moves 1.6x (From 1.5x)
      if (field.hasWeather('Rain', 'Heavy Rain') && field.chromaticField === 'Waters-Surface') {
        modifier = 6554;
        desc.chromaticField = field.chromaticField;
      }
      baseDamage = pokeRound(OF32(baseDamage * modifier) / 4096);
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
      !isCritical && !field.defenderSide.isAuroraVeil) {
    // doesn't stack with Aurora Veil
    finalMods.push(field.gameType !== 'Singles' ? 2732 : 2048);
    desc.isReflect = true;
  } else if (
    field.defenderSide.isLightScreen && move.category === 'Special' &&
    !isCritical && !field.defenderSide.isAuroraVeil
  ) {
    // doesn't stack with Aurora Veil
    finalMods.push(field.gameType !== 'Singles' ? 2732 : 2048);
    desc.isLightScreen = true;
  }
  if (field.defenderSide.isAuroraVeil && !isCritical) {
    finalMods.push(field.gameType !== 'Singles' ? 2732 : 2048);
    desc.isAuroraVeil = true;
  }
  // Aevian - Arenite Wall: A screen that halves the damage of super effective moves to the user and their allies
  if (field.defenderSide.isAreniteWall && typeEffectiveness > 1) {
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
  // Rainbow Field - Glaceon gains tinted lens
  } else if (attacker.name.includes('Glaceon') && (field.chromaticField === 'Rainbow') && typeEffectiveness < 1) {
    finalMods.push(8192);
    desc.attackerAbility = attacker.ability;
  // Starlight Arena - Starstruck!: If a Pokémon has this effect (manual toggle), their attacks gain the Tinted Lens effect.
  } else if (attacker.isStarstruck && typeEffectiveness < 1) {
    finalMods.push(8192);
    desc.fieldCondition = 'Starstruck';
    desc.chromaticField = field.chromaticField;
  }

  if (defender.isDynamaxed && move.named('Dynamax Cannon', 'Behemoth Blade', 'Behemoth Bash')) {
    finalMods.push(8192);
  }

  // Blessed Sanctum - Cute Charm grants Multiscale
  if (defender.hasAbility('Multiscale', 'Shadow Shield') || (defender.hasAbility('Cute Charm') && field.chromaticField === 'Blessed-Sanctum'))
  {
    if (
      defender.curHP() === defender.maxHP() &&
      hitCount === 0 &&
      (!field.defenderSide.isSR && (!field.defenderSide.spikes || defender.hasType('Flying')) &&
      !(field.defenderSide.isStickyWeb && defender.hasType('Flying') && field.chromaticField === 'Jungle') || // Jungle - Sticky Web deals 1/8th of a Flying type’s Max HP on entry
      defender.hasItem('Heavy-Duty Boots')) && !attacker.hasAbility('Parental Bond (Child)')
    ) {
      finalMods.push(2048);
      desc.defenderAbility = defender.ability;
    // Dragon's Den - Multiscale is active until 75% HP or less
    } else if (defender.hasAbility('Multiscale') && field.chromaticField === 'Dragons-Den') {
      let curHP = defender.curHP();
      // Calculate hazards damage
      if (!defender.hasItem('Heavy-Duty Boots')) {
        if (field.defenderSide.spikes && !defender.hasType('Flying')) {
          curHP -= defender.maxHP() / (10 - field.defenderSide.spikes * 2);
        }
        if (field.defenderSide.isSR) {
          const rockType = gen.types.get('rock' as ID)!;
          let effectiveness =
            rockType.effectiveness[defender.types[0]]! *
            (defender.types[1] ? rockType.effectiveness[defender.types[1]]! : 1);

          // Torterra Crest - Inverse type effectiveness
          if (defender.named('Torterra-Crest')) { 
            effectiveness = 1 / effectiveness;
          } 
          
          curHP -= Math.floor((effectiveness * defender.maxHP()) / 8);
        }
      }

      // Activate Multiscale when above 75% HP (after hazards damage)
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

  // Aevian Ampharos Crest - Reduces by 30% the super-effective damage taken by the holder
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

  // Fields - Final Modifiers

  // Desert - Sand Veil instead makes user receive ¾ damage dealt in Sandstorm
  if (field.chromaticField === 'Desert' && defender.hasAbility('Sand Veil') && field.hasWeather('Sand')) {
    finalMods.push(3072);
    desc.defenderAbility = defender.ability;
    desc.weather = field.weather;
    desc.chromaticField = field.chromaticField;
  }

  return finalMods;
}

function hasTerrainSeed(pokemon: Pokemon) {
  return pokemon.hasItem('Electric Seed', 'Misty Seed', 'Grassy Seed', 'Psychic Seed');
}
