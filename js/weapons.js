// Weapon rules: proficiency, attack bonus and damage for a carried weapon, and its price.
// No page code here, so these functions can be tested on their own.

const lower = s => String(s ?? '').toLowerCase();

// Which weapons a class and race are proficient with, read from the class's "Weapon and Armor Proficiency"
// text and the race's weapon familiarity trait. Returns a test function: proficient(weapon) -> true/false.
export function proficiencyTest(cls, race) {
  const classText = lower((cls.features || []).find(f => /proficien/i.test(f.name))?.text);
  const raceText = lower((race?.traits || []).filter(t => /weapon familiarity|familiarity/i.test(t.name)).map(t => t.text).join(' '));
  // "all simple weapons", "all simple and martial weapons"
  const simple = /simple (and martial )?weapons/.test(classText);
  const martial = /martial weapons/.test(classText);
  const firearms = /firearms/.test(classText) && !/not proficient with firearms/.test(classText);
  // "treat any weapon with the word 'elven' in its name as a martial weapon"
  const racialWords = [...raceText.matchAll(/word ["“']?([a-z]+)["”']? in (?:its|their) name/g)].map(m => m[1]);
  // A weapon named in the text as a whole word, singular or plural ("longbows"); "composite longbow" also
  // matches "longbow" (elves are proficient with longbows, including composite longbows).
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = w => {
    const name = lower(w.name);
    const base = name.replace(/^composite /, '');
    const re = new RegExp(`\\b(${escapeRe(name)}|${escapeRe(base)})s?\\b`);
    return re.test(classText) || re.test(raceText);
  };
  return w => {
    if (w.firearm && firearms) return true;
    if (w.proficiency === 'simple' && simple) return true;
    if (w.proficiency === 'martial' && martial) return true;
    // Racial weapons count as martial for races with familiarity (e.g. an elf with an elven curve blade).
    if (martial && racialWords.some(word => lower(w.name).includes(word))) return true;
    return named(w);
  };
}

// How much of the character's Str modifier goes to damage.
// Two-handed melee: 1.5×. Thrown weapons, slings and composite bows: 1×. Other bows: only a Str penalty.
// Crossbows, firearms and technological weapons: none.
export function strToDamage(weapon, strMod) {
  const name = lower(weapon.name);
  if (weapon.group === 'two-handed') return Math.floor(strMod * 1.5);
  if (weapon.group !== 'ranged') return strMod;
  if (weapon.firearm || weapon.category === 'Technological Weapons' ||
      /crossbow|pistol|musket|rifle|blunderbuss|gun|cannon|launcher|blowgun|dart gun/.test(name)) return 0;
  if (/bow/.test(name)) return /composite/.test(name) ? strMod : Math.min(0, strMod);
  return strMod;  // slings and thrown ranged weapons (javelin, dart, shuriken, ...)
}

// "1d8" + 4 -> "1d8+4"; "1d6 fire" + 0 -> "1d6 fire".
export function formatDamage(dice, bonus) {
  if (!dice) return '—';
  if (!bonus) return dice;
  const m = String(dice).match(/^(\S+)(.*)$/);
  return `${m[1]}${bonus > 0 ? '+' : ''}${bonus}${m[2]}`;
}

// Attack bonuses (one per iterative attack) and damage for a carried weapon.
// entry: { enh (0-5), masterwork, focus, greaterFocus, spec, greaterSpec } — the Focus/Spec flags only
// count if the character has that feat. armorPenalty is the check penalty that applies to attacks when
// not proficient with worn armor (0 or less).
export function weaponAttack({ weapon, entry = {}, bab, mod, sizeAttack = 0, size = 'Medium', haveFeats = [],
                               proficient = true, armorPenalty = 0, unarmedDamage = null }) {
  const has = new Set(haveFeats);
  const enh = entry.enh || 0;
  const melee = weapon.group !== 'ranged';
  const finesse = melee && weapon.finesse && has.has('Weapon Finesse');
  // Melee attacks use Str (or Dex with Weapon Finesse, if higher); ranged attacks use Dex.
  const abilityUsed = !melee || (finesse && mod.dex > mod.str) ? 'dex' : 'str';
  const abilityMod = mod[abilityUsed];
  const focus = (entry.focus && has.has('Weapon Focus') ? 1 : 0) + (entry.greaterFocus && has.has('Greater Weapon Focus') ? 1 : 0);
  const spec = (entry.spec && has.has('Weapon Specialization') ? 2 : 0) + (entry.greaterSpec && has.has('Greater Weapon Specialization') ? 2 : 0);
  const itemBonus = enh > 0 ? enh : entry.masterwork ? 1 : 0;  // masterwork: +1 to attack only
  const toHit = abilityMod + sizeAttack + itemBonus + focus + (proficient ? 0 : -4) + armorPenalty;
  const sizeKey = { Fine: 't', Diminutive: 't', Tiny: 't', Small: 's', Medium: 'm', Large: 'l' }[size] || 'm';
  const dice = unarmedDamage || weapon.damage?.[sizeKey] || weapon.damage?.m || null;
  const damageBonus = strToDamage(weapon, mod.str) + enh + spec;
  return {
    attacks: bab.map(b => b + toHit),
    abilityUsed,
    damage: formatDamage(dice, damageBonus),
    parts: { abilityMod, sizeAttack, itemBonus, focus, proficiency: proficient ? 0 : -4, armorPenalty, damageBonus, spec },
  };
}

// Price of a carried weapon: base, plus masterwork (300 gp) and the enhancement bonus squared × 2,000 gp for
// a magic weapon (Core Rulebook, Magic Weapons). Magic weapons are always masterwork.
export function weaponCost(weapon, entry = {}) {
  const enh = entry.enh || 0;
  return (weapon.price_gp || 0) + (enh > 0 || entry.masterwork ? 300 : 0) + enh * enh * 2000;
}
