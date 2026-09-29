// Weapon rules: proficiency, attack bonus and damage for a carried weapon, and its price.
// No page code here, so these functions can be tested on their own.

import { magicPart, magicPrefix } from './crafting.js';
const lower = s => String(s ?? '').toLowerCase();

// Which weapons a class and race are proficient with, read from the class's "Weapon and Armor Proficiency"
// text and the race's weapon familiarity trait. Returns a test function: proficient(weapon) -> true/false.
// Pass a list of classes for a multiclass character: proficient if any class is.
export function proficiencyTest(clsOrList, race) {
  if (Array.isArray(clsOrList)) {
    const tests = clsOrList.map(c => proficiencyTest(c, race));
    return w => tests.some(t => t(w));
  }
  const cls = clsOrList;
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
    // Everyone is proficient with unarmed strikes (Core Rulebook, Unarmed Attacks).
    if (w.id === 'unarmed-strike') return true;
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
  // 1-1/2 times a Str bonus; a Str penalty isn't multiplied.
  if (weapon.group === 'two-handed') return strMod > 0 ? Math.floor(strMod * 1.5) : strMod;
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

export const isDouble = weapon => (weapon.special || []).some(s => lower(s) === 'double');
export const isMonkWeapon = weapon => weapon.id === 'unarmed-strike' || (weapon.special || []).some(s => lower(s) === 'monk');
// Light weapons (and unarmed strikes, and the other end of a double weapon) are "light" off-hand weapons.
export const isLight = weapon => weapon.group === 'light' || weapon.group === 'unarmed';

// Monk and brawler unarmed damage: the class table gives Medium damage; Small and Large characters use these
// columns (Core Rulebook, Table 3-11: Small or Large Monk Unarmed Damage).
const UNARMED_BY_SIZE = {
  '1d6': { Small: '1d4', Large: '1d8' },
  '1d8': { Small: '1d6', Large: '2d6' },
  '1d10': { Small: '1d8', Large: '2d8' },
  '2d6': { Small: '1d10', Large: '3d6' },
  '2d8': { Small: '2d6', Large: '3d8' },
  '2d10': { Small: '2d8', Large: '4d8' },
};
export function unarmedForSize(mediumDice, size) {
  return UNARMED_BY_SIZE[mediumDice]?.[size] || mediumDice;
}

// Improved Critical doubles the threat range: "19-20/×2" -> "17-20/×2", "×3" -> "19-20/×3".
export function improvedCritical(w) {
  if (!w.threat) return w.critical;
  const doubled = 21 - 2 * (21 - w.threat);
  const multiplier = String(w.critical || '').replace(/^\d+-20\//, '');
  return `${doubled}-20/${multiplier}`;
}

// Power Attack and Deadly Aim: -1 attack / +2 damage, one step more at BAB +4 and every +4 after.
export const powerAttackStep = bab => 1 + Math.floor(Math.max(0, bab) / 4);

// Attack bonuses (one per iterative attack) and damage for a carried weapon.
// entry: { enh (0-5), masterwork, focus, greaterFocus, spec, greaterSpec } — the Focus/Spec flags only
// count if the character has that feat. armorPenalty is the check penalty that applies to attacks when
// not proficient with worn armor (0 or less).
// hand: 'one' (the usual way to wield it), 'main' / 'off' (fighting with two weapons, or each end of a double
// weapon), or 'flurry' (monk or brawler flurry: full Str to damage). end: which end of a double weapon (0 or 1).
// penalty: added to every attack (two-weapon fighting, flurry, Rapid Shot).
// options: { powerAttack, deadlyAim, rapidShot } when chosen; each only counts if the character has the feat
// and the weapon allows it. powerBab is the base attack bonus the Power Attack / Deadly Aim step comes from.
export function weaponAttack({ weapon, entry = {}, bab, mod, sizeAttack = 0, size = 'Medium', haveFeats = [],
                               proficient = true, armorPenalty = 0, unarmedDamage = null,
                               hand = 'one', end = 0, penalty = 0, options = {}, powerBab = bab[0], bonusDamage = 0 }) {
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

  // Strength to damage depends on how the weapon is held.
  let strDamage;
  if (hand === 'off') strDamage = mod.str > 0 && !has.has('Double Slice') ? Math.floor(mod.str / 2) : mod.str;
  else if ((hand === 'main' || hand === 'flurry') && melee) strDamage = mod.str;
  else strDamage = strToDamage(weapon, mod.str);

  // Power Attack (melee) / Deadly Aim (ranged). Damage +50% with a weapon in two hands, halved off-hand.
  const step = powerAttackStep(powerBab);
  const used = [];
  let powerHit = 0, powerDamage = 0;
  if (melee && options.powerAttack && has.has('Power Attack')) {
    powerHit = -step;
    powerDamage = hand === 'off' ? step : weapon.group === 'two-handed' && hand !== 'main' ? 3 * step : 2 * step;
    used.push('Power Attack');
  }
  if (!melee && options.deadlyAim && has.has('Deadly Aim')) {
    powerHit = -step;
    powerDamage = 2 * step;
    used.push('Deadly Aim');
  }
  // Rapid Shot: one more ranged attack at the highest bonus, and -2 on all of them.
  let attackBabs = bab;
  let rapid = 0;
  if (!melee && options.rapidShot && has.has('Rapid Shot')) {
    attackBabs = [bab[0], ...bab];
    rapid = -2;
    used.push('Rapid Shot');
  }

  const toHit = abilityMod + sizeAttack + itemBonus + focus + (proficient ? 0 : -4) + armorPenalty + penalty + powerHit + rapid;
  const sizeKey = { Fine: 't', Diminutive: 't', Tiny: 't', Small: 's', Medium: 'm', Large: 'l' }[size] || 'm';
  const allDice = unarmedDamage || weapon.damage?.[sizeKey] || weapon.damage?.m || null;
  // A double weapon lists each end's damage ("1d8/1d6").
  const ends = String(allDice ?? '').split('/');
  const dice = allDice && ends.length > 1 ? ends[Math.min(end, ends.length - 1)] : allDice;
  // bonusDamage: extra damage such as smite evil's (+paladin level).
  const damageBonus = strDamage + enh + spec + powerDamage + bonusDamage;
  return {
    attacks: attackBabs.map(b => b + toHit),
    abilityUsed,
    damage: formatDamage(dice, damageBonus),
    used,
    parts: { abilityMod, sizeAttack, itemBonus, focus, proficiency: proficient ? 0 : -4, armorPenalty, damageBonus, spec,
             penalty, powerHit, powerDamage, strDamage },
  };
}

// Attack penalties for fighting with two weapons (Core Rulebook Table 8-7), for the main hand and the off hand.
export function twoWeaponPenalties(offLight, hasTwoWeaponFighting) {
  const main = (offLight ? -4 : -6) + (hasTwoWeaponFighting ? 2 : 0);
  const off = (offLight ? -8 : -10) + (hasTwoWeaponFighting ? 6 : 0);
  return { main, off };
}

// Off-hand attacks: one, a second at -5 with Improved Two-Weapon Fighting and a third at -10 with Greater.
export function offHandBabs(firstBab, haveFeats) {
  const has = new Set(haveFeats);
  const out = [firstBab];
  if (has.has('Improved Two-Weapon Fighting')) out.push(firstBab - 5);
  if (has.has('Improved Two-Weapon Fighting') && has.has('Greater Two-Weapon Fighting')) out.push(firstBab - 10);
  return out;
}

// Full attack with two weapons: main is { weapon, entry, end }, off likewise (the same weapon with end 1 for a
// double weapon, whose other end counts as a light weapon). common holds the weaponAttack arguments shared by both.
export function twoWeaponAttack({ main, off, bab, haveFeats = [], ...common }) {
  const offLight = isLight(off.weapon) || off.end === 1;
  const pen = twoWeaponPenalties(offLight, haveFeats.includes('Two-Weapon Fighting'));
  return {
    offLight,
    penalties: pen,
    main: weaponAttack({ ...common, ...main, bab, haveFeats, hand: 'main', penalty: pen.main, powerBab: bab[0] }),
    off: weaponAttack({ ...common, ...off, bab: offHandBabs(bab[0], haveFeats), haveFeats, hand: 'off', penalty: pen.off,
                        powerBab: bab[0] }),
  };
}

// Base attack bonuses for a flurry (before its -2 penalty). kind 'monk': monk levels count as BAB for the flurry,
// extra attacks at 1st, 8th and 15th level. kind 'brawler': normal BAB, extra attacks at 2nd, 8th and 15th.
// classLevel is the monk or brawler level; classBab the BAB those levels give; bab the character's total BAB.
export function flurryBabs(kind, classLevel, classBab, bab) {
  if (kind === 'brawler' && classLevel < 2) return null;
  if (kind === 'monk-unchained') {
    // Unchained monk: one more attack at the highest bonus (two from 11th level), no penalty.
    const list = [bab];
    for (let b = bab - 5; b > 0 && list.length < 4; b -= 5) list.push(b);
    return [...Array(classLevel >= 11 ? 2 : 1).fill(bab), ...list];
  }
  const first = kind === 'monk' ? bab - classBab + classLevel : bab;
  const list = [first];
  for (let b = first - 5; b > 0 && list.length < 4; b -= 5) list.push(b);
  const extra = classLevel >= 15 ? 3 : classLevel >= 8 ? 2 : 1;
  return list.flatMap((b, i) => (i < extra ? [b, b] : [b]));
}

// Price of a carried weapon: base, plus masterwork (300 gp) and the enhancement bonus squared × 2,000 gp for
// a magic weapon (Core Rulebook, Magic Weapons). Magic weapons are always masterwork.
// Special abilities add their bonus equivalent (or flat price); a crafted weapon's magic part costs half (Core
// Rulebook, Magic Item Creation), the masterwork weapon itself full price.
export function weaponCost(weapon, entry = {}) {
  const enh = entry.enh || 0;
  const abilities = entry.abilities || [];
  const magic = magicPart(enh, abilities, 2000);
  return (weapon.price_gp || 0) + (enh > 0 || entry.masterwork || abilities.length ? 300 : 0) + (entry.crafted ? magic / 2 : magic);
}

// "+1 flaming Longsword", "Masterwork Dagger", "Club".
export function weaponLabel(weapon, entry = {}) {
  const prefix = magicPrefix(entry.enh || 0, entry.masterwork, entry.abilities || []);
  return prefix ? `${prefix} ${weapon.name}` : weapon.name;
}
