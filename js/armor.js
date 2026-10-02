// Armor rules: what worn armor and a shield do to AC, skills, speed and spellcasting.
// No page code here, so these functions can be tested on their own.

import { ARCANE } from './multiclass.js';

export const ENHANCEMENT_MAX = 5;

// Proficiency a character needs for each armor category (feat names, as proficiencyFeats() returns them).
const PROFICIENCY = {
  light: 'Armor Proficiency, Light',
  medium: 'Armor Proficiency, Medium',
  heavy: 'Armor Proficiency, Heavy',
  shield: 'Shield Proficiency',
};

// Combined effect of worn armor and a shield (either can be null). `armorEnh` / `shieldEnh` are magic
// enhancement bonuses (+1 to +5); magic armor is always masterwork, which lowers its check penalty by 1.
// armorMw / shieldMw: masterwork but not magic (magic armor is always masterwork).
export function armorEffects({ armor = null, shield = null, armorEnh = 0, shieldEnh = 0, armorMw = false, shieldMw = false } = {}) {
  const penalty = (item, enh, mw) => (item ? Math.min(0, item.check_penalty + ((enh > 0 || mw) && !item.mw_included ? 1 : 0)) : 0);
  const caps = [armor?.max_dex, shield?.max_dex].filter(v => v !== null && v !== undefined);
  return {
    armorBonus: armor ? armor.bonus + armorEnh : 0,
    shieldBonus: shield ? shield.bonus + shieldEnh : 0,
    maxDex: caps.length ? Math.min(...caps) : null,
    checkPenalty: penalty(armor, armorEnh, armorMw) + penalty(shield, shieldEnh, shieldMw),
    spellFailure: (armor?.spell_failure || 0) + (shield?.spell_failure || 0),
    // Medium and heavy armor slow the wearer (mithral counts as one category lighter: move_category).
    slows: armor ? ['medium', 'heavy'].includes(armor.move_category || armor.category) : false,
    // Damage reduction from adamantine armor.
    dr: armor?.dr || 0,
    armor, shield, armorEnh, shieldEnh, armorMw, shieldMw,
  };
}

export const NO_ARMOR = armorEffects();

// Armor some classes can cast their own spells in without arcane spell failure, and whether a shield is fine too
// (from each class's Spells / armor class features). A magus gets medium armor at 7th level and heavy at 13th.
const SPELL_FAILURE_FREE = {
  bard: () => ({ armor: ['light'], shield: true }),
  skald: () => ({ armor: ['light', 'medium'], shield: true }),
  bloodrager: () => ({ armor: ['light', 'medium'], shield: false }),
  summoner: () => ({ armor: ['light'], shield: false }),
  'summoner-unchained': () => ({ armor: ['light'], shield: false }),
  magus: level => ({ armor: level >= 13 ? ['light', 'medium', 'heavy'] : level >= 7 ? ['light', 'medium'] : ['light'], shield: false }),
};

// Arcane spell failure chance for each arcane class the character has ([{ cls, level }] from classCounts):
// [{ cls, chance }]. Divine spells and alchemist extracts have none.
export function spellFailureByClass(effects, counts) {
  return counts.filter(e => ARCANE.has(e.cls.id)).map(e => {
    const free = SPELL_FAILURE_FREE[e.cls.id]?.(e.level) || { armor: [], shield: false };
    const armorPart = effects.armor && !free.armor.includes(effects.armor.move_category || effects.armor.category) ? effects.armor.spell_failure || 0 : 0;
    const shieldPart = effects.shield && !free.shield ? effects.shield.spell_failure || 0 : 0;
    return { cls: e.cls, chance: armorPart + shieldPart };
  });
}

// Speed in armor. The armor table lists speeds for 30 ft. and 20 ft. creatures; other speeds are left as
// they are (the table doesn't cover them). Races with "Slow and Steady" (dwarves) are never slowed by armor.
export function speedInArmor(baseSpeed, effects, race) {
  if (!effects.slows || baseSpeed === null || baseSpeed === undefined) return baseSpeed;
  if ((race?.traits || []).some(t => t.name === 'Slow and Steady')) return baseSpeed;
  if (baseSpeed === 30) return effects.armor.speed_30 ?? baseSpeed;
  if (baseSpeed === 20) return effects.armor.speed_20 ?? baseSpeed;
  return baseSpeed;
}

// Attack roll penalty from worn armor and shield: an item's armor check penalty applies to attacks when not
// proficient with it, and a tower shield always gives -2 on attacks (Core Rulebook).
export function armorAttackPenalty(effects, haveFeats) {
  const have = new Set(haveFeats);
  const { armor, shield, armorEnh = 0, shieldEnh = 0, armorMw = false, shieldMw = false } = effects;
  const penalty = (item, enh, mw) => Math.min(0, item.check_penalty + ((enh > 0 || mw) && !item.mw_included ? 1 : 0));
  let total = 0;
  if (armor && !have.has(PROFICIENCY[armor.category])) total += penalty(armor, armorEnh, armorMw);
  if (shield) {
    const need = shield.id === 'tower-shield' ? 'Tower Shield Proficiency' : PROFICIENCY.shield;
    if (!have.has(need)) total += penalty(shield, shieldEnh, shieldMw);
    if (shield.id === 'tower-shield') total -= 2;
  }
  return total;
}

// Proficiency problems with worn armor, given every feat the character has (proficiencies included).
// Returns a list of messages; empty when proficient.
// Armor and shields not made of metal (from their descriptions; the data has no material field). Druids may wear
// only these (Core Rulebook: padded, leather or hide armor, wooden armor and wooden shields).
export const NON_METAL = new Set(['padded', 'quilted-cloth', 'silken-ceremonial', 'leather', 'lamellar-cuirass', 'hide',
  'wooden', 'stone-coat', 'light-wooden-shield', 'heavy-wooden-shield', 'light-wooden-quickdraw-shield', 'tower-shield',
  'klar', 'madu']);

// A druid in metal armor or with a metal shield can't cast druid spells or use supernatural or spell-like class
// abilities while wearing it and for 24 hours after. A special material that isn't metal (darkwood, dragonhide) is fine.
export function druidMetalWarnings(effects, classIds, materials = {}) {
  if (!classIds.includes('druid')) return [];
  // An item made of a special material says whether it's metal (`metal`, from materials.js).
  const metal = (item, material) => item && (item.metal ?? !NON_METAL.has(item.id)) && !['darkwood', 'dragonhide'].includes(material);
  return [[effects.armor, materials.armor, 'armor'], [effects.shield, materials.shield, 'shield']]
    .filter(([item, mat]) => metal(item, mat))
    .map(([item, , what]) => `Druids can't wear metal ${what === 'armor' ? 'armor' : 'shields'} (${item.name}): while wearing it, and for 24 hours after, a druid can't cast druid spells or use supernatural or spell-like class abilities.`);
}

export function proficiencyWarnings(effects, haveFeats) {
  const have = new Set(haveFeats);
  const out = [];
  const { armor, shield } = effects;
  if (armor && !have.has(PROFICIENCY[armor.category])) {
    out.push(`Not proficient with ${armor.category} armor: its armor check penalty also applies to attack rolls.`);
  }
  if (shield) {
    const need = shield.id === 'tower-shield' ? 'Tower Shield Proficiency' : PROFICIENCY.shield;
    if (!have.has(need)) {
      out.push(`Not proficient with ${shield.id === 'tower-shield' ? 'tower shields' : 'shields'}: ` +
               'the shield\'s armor check penalty also applies to attack rolls.');
    }
  }
  return out;
}
