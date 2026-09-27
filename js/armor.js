// Armor rules: what worn armor and a shield do to AC, skills, speed and spellcasting.
// No page code here, so these functions can be tested on their own.

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
export function armorEffects({ armor = null, shield = null, armorEnh = 0, shieldEnh = 0 } = {}) {
  const penalty = (item, enh) => (item ? Math.min(0, item.check_penalty + (enh > 0 ? 1 : 0)) : 0);
  const caps = [armor?.max_dex, shield?.max_dex].filter(v => v !== null && v !== undefined);
  return {
    armorBonus: armor ? armor.bonus + armorEnh : 0,
    shieldBonus: shield ? shield.bonus + shieldEnh : 0,
    maxDex: caps.length ? Math.min(...caps) : null,
    checkPenalty: penalty(armor, armorEnh) + penalty(shield, shieldEnh),
    spellFailure: (armor?.spell_failure || 0) + (shield?.spell_failure || 0),
    // Medium and heavy armor slow the wearer.
    slows: armor ? armor.category === 'medium' || armor.category === 'heavy' : false,
    armor, shield, armorEnh, shieldEnh,
  };
}

export const NO_ARMOR = armorEffects();

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
  const { armor, shield, armorEnh = 0, shieldEnh = 0 } = effects;
  const penalty = (item, enh) => Math.min(0, item.check_penalty + (enh > 0 ? 1 : 0));
  let total = 0;
  if (armor && !have.has(PROFICIENCY[armor.category])) total += penalty(armor, armorEnh);
  if (shield) {
    const need = shield.id === 'tower-shield' ? 'Tower Shield Proficiency' : PROFICIENCY.shield;
    if (!have.has(need)) total += penalty(shield, shieldEnh);
    if (shield.id === 'tower-shield') total -= 2;
  }
  return total;
}

// Proficiency problems with worn armor, given every feat the character has (proficiencies included).
// Returns a list of messages; empty when proficient.
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
