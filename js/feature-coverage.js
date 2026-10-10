// How the builder handles each class feature, for the tag beside it on the Classes tab (and the test that every class
// feature has been looked at). No page code here.
//
// counted: always in your numbers (AC, saves, skills, attacks, speed, damage reduction, proficiencies...).
// effect: switched on in Active effects (Character tab) when it's in use (rage, judgment, smite...).
// note: shown in the Details of the save, AC or skill it changes, since it only applies sometimes.
// choice: chosen on the Classes tab (talents, bloodline, order, weapon choices...).
// feat: a free feat or a feat slot (Feats tab).
// spells: on the Spells tab.
// card: its own card (animal companion, familiar).
// roll: a row with a Roll button on the Character tab (channel energy, bombs, sneak attack...).
// text: rules text used in play (what it does is in its description; there's no number to count).
export const HANDLING = {
  counted: 'counted in your numbers',
  effect: 'switch it on in Active effects',
  note: 'noted in the Details of what it changes',
  choice: 'chosen on this tab',
  feat: 'a free feat or feat slot (Feats tab)',
  spells: 'on the Spells tab',
  card: 'has its own card',
  roll: 'rolled on the Character tab',
  text: 'rules text, used in play',
};

const list = (how, names) => names.map(n => [n, how]);
// By feature name (lower case). A class-specific entry ("class:name") wins over these.
const BY_NAME = new Map([
  ...list('counted', ['weapon and armor proficiency', 'weapon and armor proficiencies', 'fast movement', 'uncanny dodge',
    'improved uncanny dodge', 'damage reduction', 'bardic knowledge', 'nature sense', 'armor training', 'weapon training',
    'armor mastery', 'ac bonus', 'flurry of blows', 'unarmed strike', 'maneuver training', 'divine grace', 'unholy resilience',
    'stern gaze', 'cunning initiative', 'trapfinding', 'nimble', 'defensive instinct', 'gun training', 'swashbuckler weapon training',
    'swashbuckler finesse', 'finesse training', 'natural armor increase', 'ability boost', 'improved reaction', 'canny defense',
    'grace', 'consummate liar', 'towering ego', 'lore', 'no trace', 'medium armor', 'heavy armor', 'jack-of-all-trades',
    'keen recollection', 'focus weapon', 'close weapon mastery', 'enhance arrows', 'aura of righteousness', 'holy champion',
    'aura of depravity', 'unholy champion', 'perfect self', 'brawler\'s flurry', 'diminished spellcasting', 'martial training',
    'fighter training', 'diverse training', 'weapon expertise', 'bomb-thrower', 'dr', 'improved uncannydodge', 'precise strike']),
  ...list('roll', ['channel energy', 'channel positive energy', 'channel negative energy', 'lay on hands', 'touch of corruption',
    'sneak attack', 'studied strike', 'bomb', 'physical kinetic blast', 'energy kinetic blast', 'fervor', 'inspiration']),
  ...list('effect', ['inspire courage', 'inspire competence', 'inspire greatness', 'inspire heroics', 'inspired rage', 'rage', 'bloodrage', 'raging song', 'bardic performance', 'judgment', 'second judgment', 'third judgment',
    'bane', 'greater bane', 'mutagen', 'persistent mutagen', 'animal focus', 'second animal focus', 'studied target',
    'challenge', 'demanding challenge', 'banner', 'greater banner', 'defensive stance', 'divine bond', 'arcane pool',
    'sacred weapon', 'sacred armor', 'studied combat', 'smite evil', 'smite good', 'spirit bonus', 'quarry', 'improved quarry',
    'ki pool', 'deeds', 'panache', 'wild shape', 'greater rage', 'mighty rage', 'greater bloodrage', 'mighty bloodrage',
    'resolve', 'greater resolve', 'true resolve', 'mutagenic form', 'advanced mutagen', 'inspiring command']),
  ...list('note', ['track', 'danger sense', 'trap sense', 'evasion', 'improved evasion', 'bravery', 'still mind',
    'poison resistance', 'well-versed', "resist nature's lure", 'aura of courage', 'divine health', 'purity of body',
    'diamond body', 'high jump', 'aura of resolve', 'indomitable will', 'blood sanctuary', 'wild empathy', 'monster lore',
    'save bonus against poison', 'unshakable', 'poison immunity', 'venom immunity', 'stalwart', 'shield ally',
    'greater shield ally', 'charmed life', 'enhanced mobility', 'elaborate defense']),
  ...list('choice', ['rage powers', 'rogue talents', 'rogue talent', 'advanced talents', 'discovery', 'grand discovery', 'hex',
    'major hex', 'grand hex', 'magus arcana', 'revelation', 'final revelation', 'mystery', "oracle's curse", 'bloodline',
    'arcane school', 'arcane bond', 'domains', 'domain', 'order', 'ninja tricks', 'master tricks', 'slayer talents',
    'investigator talent', 'arcanist exploits', 'greater exploits', 'infusion', 'wild talents', 'mesmerist tricks', 'bold stare',
    'vigilante talent', 'social talent', 'ki powers', 'style strikes', 'spirit', 'versatile performance', 'mercy', 'cruelty',
    'phrenic amplifications', 'focus powers', 'shifter aspect', 'favored enemy', 'favored terrain', 'defensive powers',
    "rogue's edge", 'secret', 'spirit guide', 'eidolon', 'spontaneous casting', 'rage power', 'ninja trick', 'slayer talent',
    'arcanist exploit', 'defensive power', 'bloodline power', 'order ability', 'rage prophet mystery', 'vigilante specialization']),
  ...list('feat', ['bonus feat', 'bonus feats', 'bonus combat feats', 'combat style feat', 'teamwork feat', 'bloodline feat',
    'tactician', 'eschew materials', 'scribe scroll', 'brew potion', 'throw anything', 'endurance', 'combat reflexes',
    'deflect arrows', 'stunning fist', 'improved leadership', 'bonus combat feat']),
  ...list('spells', ['spells', 'cantrips', 'orisons', 'spells per day', 'extracts per day', 'spells per day/spells known',
    'medium spells', 'mesmerist spells', 'occultist spells', 'psychic spells', 'spiritualist spells', 'summoner spells',
    'alchemy', 'chaotic, evil, good, and lawful spells', 'spellbooks', 'knacks', 'blood casting', 'mystery spell', 'bloodline spell',
    'spirit magic']),
  ...list('card', ['animal companion', "hunter's bond", 'mount', 'nature bond', "witch's familiar", 'summon familiar',
    'spirit animal', 'companion bond', 'bonus trick', 'bonus tricks']),
]);
const BY_CLASS = new Map([
  // Same name, handled differently for one class.
  ['kineticist:infusion', 'choice'], ['alchemist:poison use', 'text'], ['shadowdancer:rogue talent', 'choice'],
  ['horizon-walker:favored terrain', 'effect'], ['nature-warden:favored terrain', 'effect'], ['stalwart-defender:ac bonus', 'counted'],
  ['pathfinder-chronicler:bardic performance', 'effect'], ['battle-herald:inspire greatness', 'effect'],
  ['ranger:hunter\'s bond', 'card'], ['druid:wild shape', 'effect'], ['shifter:wild shape', 'effect'],
]);

// "1st favored enemy" -> "favored enemy", "Sneak attack +2d6" -> "sneak attack", "Wild shape (2/day)" -> "wild shape".
const clean = name => String(name).toLowerCase().replace(/\s*\((?:ex|su|sp)\)\s*/g, '').replace(/^\d+(?:st|nd|rd|th)\s+/, '').replace(/^[+-]\d+\s+/, '')
  .replace(/\s*\(.*?\)\s*$/, '').replace(/[\s+\-]*\d.*$/, '').trim();
// The handling key for a class's feature ('text' when nothing in the builder uses it).
export function featureHandling(clsId, name) {
  const n = clean(name);
  return BY_CLASS.get(`${clsId}:${n}`) || BY_NAME.get(n) || 'text';
}
