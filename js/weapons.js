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
// A composite bow (Core Rulebook): made for a strength rating; it adds your Str bonus to damage up to that rating, and
// you take -2 on attacks with it if your Str bonus is lower. The rating it counts with: the one set on it, or your
// Str bonus with the adaptive ability, or when none is set (older saved weapons). null for other weapons.
export const isComposite = weapon => /composite/i.test(weapon?.name || '');
export function compositeRating(weapon, entry = {}, strMod = 0) {
  if (!isComposite(weapon)) return null;
  if ((entry.abilities || []).some(a => a.id === 'adaptive') || !Number.isInteger(entry.strRating)) return Math.max(0, strMod);
  return entry.strRating;
}
// Price of a composite bow's strength rating: 100 gp per point for a longbow, 75 gp for a shortbow.
export const ratingPrice = weapon => (/long/i.test(weapon.name) ? 100 : 75);

export function strToDamage(weapon, strMod, rating = null) {
  const name = lower(weapon.name);
  // 1-1/2 times a Str bonus; a Str penalty isn't multiplied.
  if (weapon.group === 'two-handed') return strMod > 0 ? Math.floor(strMod * 1.5) : strMod;
  if (weapon.group !== 'ranged') return strMod;
  if (weapon.firearm || weapon.category === 'Technological Weapons' ||
      /crossbow|pistol|musket|rifle|blunderbuss|gun|cannon|launcher|blowgun|dart gun/.test(name)) return 0;
  if (/bow/.test(name)) return /composite/.test(name) ? (strMod < 0 ? strMod : Math.min(strMod, rating ?? strMod)) : Math.min(0, strMod);
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
// Weapon special abilities that add damage (Core Rulebook and Advanced Player's Guide). `hit`: extra dice on every
// hit, never multiplied on a critical; `burst`: extra dice on a confirmed critical, once per step of the multiplier
// above ×1 (×2 = once, ×3 = twice); `vs`: only against those foes (rolled separately); `note`: something else to know.
export const ABILITY_DAMAGE = {
  flaming: { hit: '1d6', type: 'fire' }, frost: { hit: '1d6', type: 'cold' }, shock: { hit: '1d6', type: 'electricity' },
  corrosive: { hit: '1d6', type: 'acid' },
  'flaming-burst': { hit: '1d6', burst: '1d10', type: 'fire' }, 'icy-burst': { hit: '1d6', burst: '1d10', type: 'cold' },
  'shocking-burst': { hit: '1d6', burst: '1d10', type: 'electricity' }, 'corrosive-burst': { hit: '1d6', burst: '1d10', type: 'acid' },
  thundering: { burst: '1d8', type: 'sonic' },
  merciful: { hit: '1d6', type: 'nonlethal', note: 'all its damage is nonlethal (the wielder can turn this off)' },
  vicious: { hit: '2d6', type: '', note: 'the wielder takes 1d6 damage each hit' },
  holy: { vs: 'evil foes', hit: '2d6' }, unholy: { vs: 'good foes', hit: '2d6' },
  axiomatic: { vs: 'chaotic foes', hit: '2d6' }, anarchic: { vs: 'lawful foes', hit: '2d6' },
  bane: { vs: 'its chosen creature type', hit: '2d6', note: 'against that type it also counts as +2 better (+2 on attack and damage rolls)' },
};

// What a weapon's special abilities add: { hit: [{ dice, type }], burst: [{ dice, type }], vs: [{ name, dice, vs }],
// notes: [text], keen } (keen doubles the threat range; it doesn't stack with Improved Critical).
export function abilityDamage(abilities = []) {
  const out = { hit: [], burst: [], vs: [], notes: [], keen: false };
  for (const a of abilities) {
    if (a.id === 'keen') out.keen = true;
    const d = ABILITY_DAMAGE[a.id];
    if (!d) continue;
    if (d.vs) out.vs.push({ name: a.name, dice: d.hit, vs: d.vs });
    else if (d.hit) out.hit.push({ dice: d.hit, type: d.type, name: a.name });
    if (d.burst) out.burst.push({ dice: d.burst, type: d.type, name: a.name });
    if (d.note) out.notes.push(`${a.name}: ${d.note}`);
  }
  return out;
}

// "1d8+3 plus 1d6 fire" (the extra dice every hit adds).
export function damageWithExtras(damage, fx) {
  return fx.hit.length ? `${damage} plus ${fx.hit.map(x => `${x.dice}${x.type ? ` ${x.type}` : ''}`).join(' plus ')}` : damage;
}

export function improvedCritical(w) {
  if (!w.threat) return w.critical;
  const doubled = 21 - 2 * (21 - w.threat);
  const multiplier = String(w.critical || '').replace(/^\d+-20\//, '');
  return `${doubled}-20/${multiplier}`;
}

// Weapons made for a different size of creature (Core Rulebook, Weapon Size): the sizes offered, and what they change.
export const WEAPON_SIZES = ['Small', 'Medium', 'Large'];
const WEAPON_SIZE_COST = { Small: 1, Medium: 1, Large: 2 };
const WEAPON_SIZE_WEIGHT = { Small: 0.5, Medium: 1, Large: 2 };
const SIZE_ORDER = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
const HANDS = ['light', 'one-handed', 'two-handed'];

// Archetype abilities for big weapons, by class level (0 = the character doesn't have the archetype):
// - Titan Mauler (barbarian, Ultimate Combat): Jotungrip (2nd: a two-handed weapon of her size in one hand, -2 on
//   attacks, one-handed for Strength and Power Attack); Massive Weapons (3rd: the penalty for too-large weapons
//   reduced by 1, +1 more every three levels after 3rd).
// - Titan Fighter (fighter, Giant Hunter's Handbook): Giant Weapon Wielder (1st: a two-handed weapon one size larger
//   used as two-handed, an extra -2); Incredible Heft (3rd: the penalty for weapons one size larger reduced by 1, +1 at
//   7th and every 4 levels after); Unstoppable Momentum (5th: +1 CMB and CMD while wielding an oversized weapon, +1 at
//   9th and every 4 levels after).
export function bigWeaponRules({ titanMauler = 0, titanFighter = 0 } = {}) {
  return {
    titanMauler, titanFighter,
    jotungrip: titanMauler >= 2,
    massive: titanMauler >= 3 ? 1 + Math.floor((titanMauler - 3) / 3) : 0,
    giantWielder: titanFighter >= 1,
    heft: titanFighter >= 3 ? 1 + Math.floor((titanFighter - 3) / 4) : 0,
    momentum: titanFighter >= 5 ? 1 + Math.floor((titanFighter - 5) / 4) : 0,
  };
}

// A weapon as used by a creature of wielderSize when it was made for weaponSize (null = the wielder's own size):
// { weapon (with its handedness shifted one step per size difference: a Large longsword is two-handed for a Medium
// creature), diceSize (the damage column to use), penalty (on attacks: -2 per size step, adjusted by the archetype
// rules), rows (the penalty's pieces, for Details), steps, unusable (more than two-handed for the wielder), notes }.
// Ranged weapons keep their handedness. jotungrip: the Titan Mauler's choice to hold a two-handed weapon in one hand.
export function sizedWeapon(weapon, weaponSize, wielderSize, rules = bigWeaponRules(), jotungrip = false) {
  const own = !weaponSize || weaponSize === wielderSize;
  const steps = own ? 0 : SIZE_ORDER.indexOf(weaponSize) - SIZE_ORDER.indexOf(wielderSize);
  let group = weapon.group;
  let unusable = false;
  const rows = [];
  const notes = [];
  if (steps) rows.push({ label: `Weapon made for a ${weaponSize} creature (-2 per size step)`, value: -2 * Math.abs(steps) });
  if (steps && HANDS.includes(weapon.group)) {
    const i = HANDS.indexOf(weapon.group) + steps;
    unusable = i > 2;
    group = HANDS[Math.max(0, Math.min(2, i))];
    // Giant Weapon Wielder: a two-handed weapon one size larger stays two-handed, at an extra -2.
    if (unusable && rules.giantWielder && steps === 1 && weapon.group === 'two-handed') {
      unusable = false;
      rows.push({ label: 'Giant Weapon Wielder (Titan Fighter): oversized two-handed weapon', value: -2 });
    }
  }
  if (steps > 0) {
    // Massive Weapons and Incredible Heft lower the penalty for too-large weapons (not below 0).
    const total = rows.reduce((n, r) => n + r.value, 0);
    const cut = Math.min(-total, rules.massive + (steps === 1 ? rules.heft : 0));
    if (cut && rules.massive) rows.push({ label: 'Massive Weapons (Titan Mauler)', value: Math.min(cut, rules.massive) });
    if (cut > rules.massive && rules.heft) rows.push({ label: 'Incredible Heft (Titan Fighter)', value: cut - Math.min(cut, rules.massive) });
    if (rules.momentum) notes.push(`Unstoppable Momentum: +${rules.momentum} on combat maneuvers and CMD while wielding it.`);
  }
  // Jotungrip: a two-handed weapon of the wielder's own size in one hand.
  if (jotungrip && rules.jotungrip && !steps && weapon.group === 'two-handed') {
    group = 'one-handed';
    rows.push({ label: 'Jotungrip (Titan Mauler): two-handed weapon in one hand', value: -2 });
  }
  return { weapon: group === weapon.group ? weapon : { ...weapon, group }, diceSize: own ? wielderSize : weaponSize,
           penalty: rows.reduce((n, r) => n + r.value, 0), rows, steps, unusable, notes };
}

// A carried weapon's weight: as listed for Medium, half for Small and double for Large weapons (a weapon with no size
// chosen is sized for the wielder).
export function weaponWeight(weapon, entry = {}, wielderSize = 'Medium') {
  const size = entry.size || wielderSize;
  return (weapon.weight_lbs || 0) * (WEAPON_SIZE_WEIGHT[size] ?? (size === 'Tiny' ? 0.5 : 1));
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
                               hand = 'one', end = 0, penalty = 0, options = {}, powerBab = bab[0], bonusDamage = 0,
                               effectAttack = 0, effectDamage = 0, misfit = 0 }) {
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
  else strDamage = strToDamage(weapon, mod.str, compositeRating(weapon, entry, mod.str));
  // A composite bow whose strength rating is above your Str bonus: -2 on attacks.
  const rating = compositeRating(weapon, entry, mod.str);
  const tooWeak = rating !== null && mod.str < rating ? -2 : 0;

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

  // misfit: -2 per size step for a weapon made for a different size of creature.
  const toHit = abilityMod + sizeAttack + itemBonus + focus + (proficient ? 0 : -4) + armorPenalty + penalty + powerHit + rapid + effectAttack + misfit + tooWeak;
  const sizeKey = { Fine: 't', Diminutive: 't', Tiny: 't', Small: 's', Medium: 'm', Large: 'l' }[size] || 'm';
  const allDice = unarmedDamage || weapon.damage?.[sizeKey] || weapon.damage?.m || null;
  // A double weapon lists each end's damage ("1d8/1d6").
  const ends = String(allDice ?? '').split('/');
  const dice = allDice && ends.length > 1 ? ends[Math.min(end, ends.length - 1)] : allDice;
  // bonusDamage: extra damage such as smite evil's (+paladin level).
  const damageBonus = strDamage + enh + spec + powerDamage + bonusDamage + effectDamage;
  return {
    attacks: attackBabs.map(b => b + toHit),
    babs: attackBabs,
    abilityUsed,
    damage: formatDamage(dice, damageBonus),
    used,
    parts: { abilityMod, sizeAttack, itemBonus, focus, proficiency: proficient ? 0 : -4, armorPenalty, damageBonus, spec,
             penalty, powerHit, powerDamage, strDamage, strMod: mod.str, effectAttack, effectDamage, rapid, enh, bonusDamage, dice, misfit,
             rating, tooWeak },
  };
}

// Everything that adds to a weapon's attack and damage, named (Weapons tab Details popup). a: weaponAttack's result;
// effects: active effect bonuses ({ source, type, value, target: 'attack' | 'damage' }). Returns
// { attackRows, damageRows, attackTotal (first attack), damageTotal (bonus added to the dice) }.
export function attackBreakdown(a, { proficiencyLabel = 'Not proficient', penaltyLabel = 'Fighting penalty', effects = [] } = {}) {
  const p = a.parts;
  const ab = a.abilityUsed === 'dex' ? 'Dexterity' : 'Strength';
  const attackRows = [{ label: a.babs.length > 1 ? `Base attack bonus (attacks at ${a.babs.map(b => (b >= 0 ? `+${b}` : b)).join('/')})` : 'Base attack bonus',
                        value: a.babs[0] }];
  const add = (rows, label, value, note = '') => { if (value) rows.push({ label, value, note }); };
  attackRows.push({ label: `${ab} modifier`, value: p.abilityMod });
  add(attackRows, 'Size', p.sizeAttack);
  add(attackRows, 'Weapon size (and archetype rules)', p.misfit);
  add(attackRows, p.enh > 0 ? 'Enhancement bonus' : 'Masterwork', p.itemBonus);
  add(attackRows, 'Weapon Focus', p.focus);
  add(attackRows, proficiencyLabel, p.proficiency);
  add(attackRows, 'Armor or shield penalty', p.armorPenalty);
  add(attackRows, penaltyLabel, p.penalty);
  add(attackRows, a.used.includes('Deadly Aim') ? 'Deadly Aim' : 'Power Attack', p.powerHit);
  add(attackRows, 'Rapid Shot', p.rapid);
  add(attackRows, `Strength below the bow\u2019s strength rating (+${p.rating})`, p.tooWeak);
  const damageRows = [];
  // Which Strength rule applies: full, 1 1/2 times in two hands, half in the off hand, or a bow's limits.
  const sm = p.strMod;
  const strLabel = p.rating !== null && p.rating !== undefined
    ? `Strength (composite bow: your Str bonus, up to its strength rating of +${p.rating})`
    : p.strDamage === sm ? 'Strength modifier'
    : sm > 0 && p.strDamage === Math.floor(sm * 1.5) ? 'Strength × 1½ (held in two hands)'
    : sm > 0 && p.strDamage === Math.floor(sm / 2) ? 'Strength × ½ (off hand)'
    : 'Strength (a bow adds only a penalty, or up to the strength rating of a composite bow; crossbows and firearms none)';
  if (p.rating !== null && p.rating !== undefined) damageRows.push({ label: strLabel, value: p.strDamage });
  else add(damageRows, strLabel, p.strDamage);
  add(damageRows, 'Enhancement bonus', p.enh);
  add(damageRows, 'Weapon Specialization', p.spec);
  add(damageRows, a.used.includes('Deadly Aim') ? 'Deadly Aim' : 'Power Attack', p.powerDamage);
  add(damageRows, 'Extra damage (smite)', p.bonusDamage);
  for (const [rows, target, total] of [[attackRows, 'attack', p.effectAttack], [damageRows, 'damage', p.effectDamage]]) {
    const mine = effects.filter(e => e.target === target);
    for (const e of mine) rows.push({ label: `Effect: ${e.source}`, value: e.value, note: `${e.type} bonus` });
    const listed = mine.reduce((n, e) => n + e.value, 0);
    if (listed !== total) rows.push({ label: 'Effects of the same type do not stack', value: total - listed });
  }
  return { attackRows, damageRows, attackTotal: a.attacks[0], damageTotal: p.damageBonus };
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
  // A weapon made for a Large creature costs twice as much (the masterwork and magic costs don't change).
  // A composite bow's strength rating: 100 gp (longbow) or 75 gp (shortbow) per point.
  const rating = isComposite(weapon) && Number.isInteger(entry.strRating) ? entry.strRating * ratingPrice(weapon) : 0;
  return (weapon.price_gp || 0) * (WEAPON_SIZE_COST[entry.size] || 1) + rating + (enh > 0 || entry.masterwork || abilities.length ? 300 : 0)
    + (entry.crafted ? magic / 2 : magic);
}

// The parts of a weapon's price, for its Details: [{ label, gp }] adding up to weaponCost.
export function weaponCostRows(weapon, entry = {}) {
  const enh = entry.enh || 0;
  const abilities = entry.abilities || [];
  const mult = WEAPON_SIZE_COST[entry.size] || 1;
  const rows = [{ label: `${weapon.name}${mult > 1 ? ` (made for a ${entry.size} creature: ×${mult})` : ''}`, gp: (weapon.price_gp || 0) * mult }];
  if (isComposite(weapon) && Number.isInteger(entry.strRating) && entry.strRating) {
    rows.push({ label: `Strength rating +${entry.strRating} (${ratingPrice(weapon)} gp a point)`, gp: entry.strRating * ratingPrice(weapon) });
  }
  if (enh > 0 || entry.masterwork || abilities.length) rows.push({ label: 'Masterwork', gp: 300 });
  const bonus = enh + abilities.reduce((n, a) => n + (a.bonus || 0), 0);
  if (bonus) {
    const parts = [`+${enh} enhancement`, ...abilities.filter(a => a.bonus).map(a => `${a.name} +${a.bonus}`)].join(', ');
    rows.push({ label: `Magic: total bonus +${bonus} (${parts}), squared × 2,000 gp`, gp: bonus * bonus * 2000 });
  }
  for (const a of abilities.filter(x => x.gp)) rows.push({ label: a.name, gp: a.gp });
  const magic = magicPart(enh, abilities, 2000);
  if (entry.crafted && magic) rows.push({ label: 'Crafted: the magic costs half', gp: -magic / 2 });
  return rows;
}

// "+1 flaming Longsword", "Masterwork Dagger", "Club", "Greatsword (Large)".
export function weaponLabel(weapon, entry = {}) {
  const prefix = magicPrefix(entry.enh || 0, entry.masterwork, entry.abilities || []);
  const rated = isComposite(weapon) && Number.isInteger(entry.strRating) && !(entry.abilities || []).some(a => a.id === 'adaptive')
    ? ` (+${entry.strRating} Str)` : '';
  const name = (entry.size ? `${weapon.name} (${entry.size})` : weapon.name) + rated;
  return prefix ? `${prefix} ${name}` : name;
}
