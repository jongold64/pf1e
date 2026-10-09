// Animal companions (Core Rulebook, Druid: Animal Companions): who has one and at what effective druid level, and
// the companion's full statistics from its animal (data/companions.json) and the companion table. No page code here,
// so it can be tested on its own.

import { abilityModifier, SIZE_AC } from './rules.js';
import { featEffects } from './feats.js';
import { acWithEffects } from './effects.js';
import { skillInfo } from './skills.js';

// Animal skills (Core Rulebook): an animal companion can put ranks only in these, and they're its class skills.
export const ANIMAL_SKILLS = ['Acrobatics', 'Climb', 'Escape Artist', 'Fly', 'Intimidate', 'Perception', 'Stealth', 'Survival', 'Swim'];
// Tricks an animal can learn (Core Rulebook, Handle Animal).
// "Attack (all creatures)": Attack taught a second time, so the animal attacks any creature, undead and aberrations too
// (Handle Animal: it counts as two tricks, the first being Attack).
export const TRICKS = ['Attack', 'Attack (all creatures)', 'Come', 'Defend', 'Down', 'Fetch', 'Guard', 'Heel', 'Perform', 'Seek', 'Stay', 'Track', 'Work'];
// Feats a companion takes for one of its natural attacks.
export const ATTACK_FEATS = ['Weapon Focus', 'Improved Natural Attack'];

// Barding (Core Rulebook, Armor for Unusual Creatures): a nonhumanoid's armor costs and weighs this much times the
// listed armor; masterwork and magic cost the same as usual. Tiny or smaller creatures get half the armor bonus.
const BARDING_COST = { Fine: 1, Diminutive: 1, Tiny: 1, Small: 2, Medium: 2, Large: 4, Huge: 8, Gargantuan: 16, Colossal: 32 };
const BARDING_WEIGHT = { Fine: 0.1, Diminutive: 0.1, Tiny: 0.1, Small: 0.5, Medium: 1, Large: 2, Huge: 5, Gargantuan: 8, Colossal: 12 };
// A special material's armor record (materials.js withMaterial) already has its price, masterwork included.
export function bardingCost(armor, size, enh = 0) {
  return (armor.price_gp || 0) * (BARDING_COST[size] || 2) + (enh > 0 ? (armor.mw_included ? 0 : 150) + enh * enh * 1000 : 0);
}
export const bardingWeight = (armor, size) => (armor.weight_lbs || 0) * (BARDING_WEIGHT[size] || 1);
// The companion's size at an effective druid level (its advancement can make it bigger).
export const companionSize = (animal, level) => (animal.advancement && level >= animal.advancement.level ? animal.advancement.size : null) || animal.size;
// Damage one step up (Improved Natural Attack), as a Medium weapon's dice become a Large one's.
const STEP_UP = { '1d2': '1d3', '1d3': '1d4', '1d4': '1d6', '1d6': '1d8', '1d8': '2d6', '1d10': '2d8', '1d12': '3d6', '2d4': '2d6', '2d6': '3d6', '2d8': '3d8', '3d6': '4d6' };
// Speed in medium or heavy armor (barding too): 20 -> 15, 30 -> 20, 40 -> 30, 50 -> 35, 60 -> 40.
const ARMORED_SPEED = { 20: 15, 30: 20, 40: 30, 50: 35, 60: 40 };

// Natural attacks that are secondary (Bestiary, Universal Monster Rules); the Horse marks its hooves with *.
const SECONDARY = /^(hoof|hooves|tentacles?|tail slap|wings?|pincers?)$/;
const ABILITY_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const STEALTH_SIZE = { Fine: 16, Diminutive: 12, Tiny: 8, Small: 4, Medium: 0, Large: -4, Huge: -8, Gargantuan: -12, Colossal: -16 };
const FLY_SIZE = { Fine: 8, Diminutive: 6, Tiny: 4, Small: 2, Medium: 0, Large: -2, Huge: -4, Gargantuan: -6, Colossal: -8 };

// The effective druid level for an animal companion, adding up every class that gives one (their levels stack):
// a druid with Nature Bond as a companion (druid level) or the Animal domain (druid level - 3), a hunter (full level),
// a ranger from 4th level (ranger level - 3), a cleric with the Animal domain (cleric level - 3).
// counts: [{ cls, level }]; animalDomain(classId) says whether that class took a domain with the Animal Companion power.
// boon: the Boon Companion feat (abilities as if the class were 4 levels higher, at most the character level).
export function companionLevel(counts, { natureBond = 'companion', animalDomain = () => false, boon = false, characterLevel = 20 } = {}) {
  const sources = [];
  for (const e of counts) {
    const id = e.cls.id;
    let n = 0;
    if (id === 'druid') n = natureBond === 'domain' ? (animalDomain('druid') ? e.level - 3 : 0) : e.level;
    else if (id === 'hunter') n = e.level;
    else if (id === 'ranger') n = e.level - 3;
    else if (id === 'cleric' && animalDomain('cleric')) n = e.level - 3;
    if (n > 0) sources.push({ cls: e.cls, levels: n });
  }
  const base = Math.min(20, sources.reduce((s, x) => s + x.levels, 0));
  const level = base && boon ? Math.min(20, characterLevel, base + 4) : base;
  return { level, sources: level > base ? [...sources, { cls: { name: 'Boon Companion (feat)' }, levels: level - base }] : sources };
}

// "bite (1d6 plus trip), 2 claws (1d4)" -> [{ count, name, dice, rider, secondary }]. Alternatives joined with "or"
// are listed too (marked `alternative`).
export function parseAttacks(text) {
  if (!text) return [];
  const out = [];
  for (const part of String(text).split(/,\s*|\s+and\s+|\s+(?=or\s)/)) {
    const m = part.trim().match(/^(or\s+)?(?:(\d+)\s+)?([a-z][a-z ]*?)(\*)?\s*\((.*)\)$/i);
    if (!m) continue;
    const inner = m[5];
    const dice = inner.match(/^\d+d\d+/)?.[0] || null;
    const name = m[3].trim().toLowerCase();
    out.push({ count: Number(m[2] || 1), name, dice, rider: (dice ? inner.slice(dice.length) : inner).replace(/^\s*plus\s*/, '').trim(),
               secondary: !!m[4] || SECONDARY.test(name), alternative: !!m[1] });
  }
  return out;
}

// The number of ability score increases by an effective druid level (the table's "Ability score increase" rows).
export function increaseCount(progression, level) {
  return progression.slice(0, level).filter(r => r.special.includes('Ability score increase')).length;
}

// Everything about the companion at an effective druid level. choices: { increases: ['str'...], feats: [feat names],
// skills: { name: ranks } }.
export function companionStats(animal, level, progression, choices = {}) {
  const row = progression[Math.max(1, Math.min(20, level)) - 1];
  const adv = animal.advancement && level >= animal.advancement.level ? animal.advancement : null;
  const size = adv?.size || animal.size;
  const feats = choices.feats || [];
  const has = name => feats.includes(name);

  // Ability scores: the animal's, its advancement's changes, the table's Str/Dex bonus, and the increases chosen.
  const scores = {};
  for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const base = animal.abilities[a];
    scores[a] = base === null || base === undefined ? null : base + (adv?.abilities?.[a] || 0) + (['str', 'dex'].includes(a) ? row.str_dex : 0);
  }
  const allowed = increaseCount(progression, level);
  for (const a of (choices.increases || []).slice(0, allowed)) if (scores[a] !== null && scores[a] !== undefined) scores[a] += 1;
  // Spells and effects on the companion (choices.fx: effects.js effectTotals of its own effects): ability scores here,
  // and AC, saves, attacks, damage, initiative, CMB/CMD, skills, hit points and speed below.
  const fx = choices.fx || { ac: {} };
  for (const a of Object.keys(scores)) if (scores[a] !== null && scores[a] !== undefined && fx[a]) scores[a] += fx[a];
  const mod = Object.fromEntries(Object.entries(scores).map(([a, s]) => [a, s === null ? 0 : abilityModifier(s)]));

  const fb = featEffects(feats, row.hd);
  // d8 Hit Dice at their average (4.5) plus Con each, at least 1 per Hit Die.
  const hp = Math.max(row.hd, Math.floor(4.5 * row.hd) + mod.con * row.hd) + fb.hp + (fx.hp || 0);
  const sizeAc = SIZE_AC[size] ?? 0;
  const natural = animal.natural_armor + (adv?.natural_armor || 0) + row.natural_armor + (has('Improved Natural Armor') ? 1 : 0);
  const dodge = fb.dodgeAc;
  // Barding (choices.armor = { item, enh }): its armor bonus (half for Tiny or smaller) plus enhancement, its max Dex,
  // and its check penalty (1 less if masterwork or magic) on Str and Dex skills, and on attacks too without the Armor
  // Proficiency feat for its kind.
  const barding = choices.armor?.item || null;
  const bEnh = choices.armor?.enh || 0;
  const tiny = ['Fine', 'Diminutive', 'Tiny'].includes(size);
  const armorAc = barding ? (tiny ? Math.floor(barding.bonus / 2) : barding.bonus) + bEnh : 0;
  const profFeat = barding ? `Armor Proficiency, ${barding.category[0].toUpperCase()}${barding.category.slice(1)}` : '';
  const armorProficient = !barding || has(profFeat);
  const acp = barding ? Math.min(0, (barding.check_penalty || 0) + ((bEnh > 0 || choices.armor?.mw) && !barding.mw_included ? 1 : 0)) : 0;
  const dexAc = barding && barding.max_dex !== null && barding.max_dex !== undefined ? Math.min(mod.dex, barding.max_dex) : mod.dex;
  const acParts = acWithEffects({ armor: armorAc, natural, dex: dexAc, dodge, other: sizeAc }, fx.ac || {});
  const ac = acParts.ac;
  const cmSize = -sizeAc;

  // Natural attacks: primary ones at BAB + Str (Dex with Weapon Finesse if higher) + size; secondary ones at -5
  // (-2 with Multiattack) and half Str to damage. A single natural attack adds 1 1/2 times Str.
  const attacks = parseAttacks(adv?.attacks || animal.attacks);
  const real = attacks.filter(x => !x.alternative);
  const totalAttacks = real.reduce((n, x) => n + x.count, 0);
  const multiattack = level >= 9 && totalAttacks >= 3 || has('Multiattack');
  const hitMod = has('Weapon Finesse') ? Math.max(mod.str, mod.dex) : mod.str;
  // Feats taken for one natural attack: choices.featPicks[i] names the attack for feats[i].
  const pickedFor = (feat, name) => feats.some((f, i) => f === feat && (choices.featPicks || [])[i] === name);
  const armorAttack = armorProficient ? 0 : acp;
  const fxAttack = (fx.attack || 0) + (fx['melee-attack'] || 0);
  const fxDamage = (fx.damage || 0) + (fx['melee-damage'] || 0);
  const lines = attacks.map(x => {
    const single = totalAttacks === 1 && !x.secondary;
    const strDamage = x.secondary ? (mod.str > 0 ? Math.floor(mod.str / 2) : mod.str) : single && mod.str > 0 ? Math.floor(mod.str * 1.5) : mod.str;
    const focus = pickedFor('Weapon Focus', x.name) ? 1 : 0;
    const dice = pickedFor('Improved Natural Attack', x.name) && STEP_UP[x.dice] ? STEP_UP[x.dice] : x.dice;
    const bonus = row.bab + hitMod + sizeAc + (x.secondary ? (multiattack ? -2 : -5) : 0) + focus + armorAttack + fxAttack;
    const finesse = has('Weapon Finesse') && mod.dex > mod.str;
    const why = {
      attack: [{ label: 'Base attack bonus', value: row.bab }, { label: finesse ? 'Dexterity modifier (Weapon Finesse)' : 'Strength modifier', value: hitMod },
        ...(sizeAc ? [{ label: `Size (${size})`, value: sizeAc }] : []),
        ...(x.secondary ? [{ label: multiattack ? 'Secondary attack (with Multiattack)' : 'Secondary attack', value: multiattack ? -2 : -5 }] : []),
        ...(focus ? [{ label: `Feat: Weapon Focus (${x.name})`, value: 1 }] : []),
        ...(armorAttack ? [{ label: `Barding without ${profFeat}`, value: armorAttack }] : []),
        ...(fxAttack ? [{ label: 'Spells and effects on it', value: fxAttack }] : [])],
      damage: [{ label: dice !== x.dice ? `Dice (Improved Natural Attack: ${x.dice} becomes ${dice})` : 'Dice', text: dice || '—' },
        { label: x.secondary ? 'Half Strength (secondary attack)' : single && mod.str > 0
        ? 'Strength × 1 1/2 (its only natural attack)' : 'Strength', value: strDamage },
        ...(fxDamage ? [{ label: 'Spells and effects on it', value: fxDamage }] : [])],
    };
    const dmg = strDamage + fxDamage;
    return { ...x, dice, bonus, damageBonus: dmg, why, damage: dice ? `${dice}${dmg ? (dmg > 0 ? `+${dmg}` : dmg) : ''}` : null };
  });

  // Skills: ranks only in animal skills (at most HD each), all class skills.
  const skillRanks = choices.skills || {};
  const skills = ANIMAL_SKILLS.map(name => {
    const info = skillInfo(name);
    const ranks = Math.min(row.hd, skillRanks[name] || 0);
    const sizeSkill = (name === 'Stealth' ? STEALTH_SIZE[size] || 0 : 0) + (name === 'Fly' ? FLY_SIZE[size] || 0 : 0);
    const armorSkill = info.acp ? acp : 0;
    const fxSkill = (fx.skills || 0) + (fx[`skill:${name}`] || 0);
    const total = ranks + mod[info.ability] + (ranks > 0 ? 3 : 0) + sizeSkill + armorSkill + fxSkill;
    const why = [{ label: 'Ranks', value: ranks }, { label: `${ABILITY_NAME[info.ability]} modifier`, value: mod[info.ability] },
      ...(ranks > 0 ? [{ label: 'Class skill (animal skills, with at least 1 rank)', value: 3 }] : []),
      ...(sizeSkill ? [{ label: `Size (${size})`, value: sizeSkill }] : []),
      ...(armorSkill ? [{ label: 'Barding check penalty', value: armorSkill }] : []),
      ...(fxSkill ? [{ label: 'Spells and effects on it', value: fxSkill }] : [])];
    return { name, ranks, total, ability: info.ability, why };
  });
  const ranksUsed = skills.reduce((n, s) => n + s.ranks, 0);

  const specials = progression.slice(0, level).flatMap(r => r.special).filter(s => s !== 'Ability score increase');

  // The pieces of each number, for the card's Details popups.
  const featLine = (name, value) => (has(name) && value ? [{ label: `Feat: ${name}`, value }] : []);
  const saveWhy = (save, ability, feat) => [{ label: `Base save (effective druid level ${level})`, value: row[save] },
    { label: `${ABILITY_NAME[ability]} modifier`, value: mod[ability] }, ...featLine(feat, 2),
    ...(fx[save] ? [{ label: 'Spells and effects on it', value: fx[save] }] : [])];
  const why = {
    hp: [{ label: `${row.hd} Hit Dice (d8, average 4.5 each, rounded down)`, value: Math.floor(4.5 * row.hd) },
      { label: `Constitution modifier × ${row.hd}`, value: Math.max(row.hd, Math.floor(4.5 * row.hd) + mod.con * row.hd) - Math.floor(4.5 * row.hd) },
      ...featLine('Toughness', fb.hp)],
    ac: [{ label: 'Base', ac: 10, touch: 10, flat: 10 },
      { label: `Natural armor (${animal.name} ${animal.natural_armor >= 0 ? '+' : ''}${animal.natural_armor}${adv?.natural_armor ? `, advancement +${adv.natural_armor}` : ''}${row.natural_armor ? `, companion table +${row.natural_armor}` : ''}${has('Improved Natural Armor') ? ', Improved Natural Armor +1' : ''})`,
        ac: natural, touch: null, flat: natural },
      ...(barding ? [{ label: `Barding: ${barding.name}${bEnh ? ` +${bEnh}` : ''}${tiny ? ' (half for Tiny or smaller)' : ''}`, ac: armorAc, touch: null, flat: armorAc }] : []),
      { label: dexAc !== mod.dex ? `Dexterity modifier (barding allows at most +${barding.max_dex})` : 'Dexterity modifier', ac: dexAc, touch: dexAc, flat: dexAc < 0 ? dexAc : null },
      ...(sizeAc ? [{ label: `Size (${size})`, ac: sizeAc, touch: sizeAc, flat: sizeAc }] : []),
      ...(dodge ? [{ label: 'Feat: Dodge', ac: dodge, touch: dodge, flat: null }] : []),
      ...Object.entries(fx.ac || {}).filter(([, v]) => v).map(([type, v]) => ({ label: `Spells and effects on it (${type})`, ac: v,
        touch: ['armor', 'shield', 'natural armor', 'natural armor enhancement'].includes(type) ? null : v, flat: type === 'dodge' ? null : v }))],
    fort: saveWhy('fort', 'con', 'Great Fortitude'),
    ref: saveWhy('ref', 'dex', 'Lightning Reflexes'),
    will: saveWhy('will', 'wis', 'Iron Will'),
    init: [{ label: 'Dexterity modifier', value: mod.dex }, ...featLine('Improved Initiative', 4)],
    cmb: [{ label: 'Base attack bonus', value: row.bab }, { label: 'Strength modifier', value: mod.str },
      ...(cmSize ? [{ label: `Size (${size})`, value: cmSize }] : [])],
    cmd: [{ label: 'Base', value: 10, text: '10' }, { label: 'Base attack bonus', value: row.bab }, { label: 'Strength modifier', value: mod.str },
      { label: 'Dexterity modifier', value: mod.dex }, ...(cmSize ? [{ label: `Size (${size})`, value: cmSize }] : []),
      ...(dodge ? [{ label: 'Feat: Dodge', value: dodge }] : [])],
  };
  return {
    level, row, size, scores, mod, hp, hd: row.hd, bab: row.bab,
    fort: row.fort + mod.con + fb.fort + (fx.fort || 0), ref: row.ref + mod.dex + fb.ref + (fx.ref || 0), will: row.will + mod.wis + fb.will + (fx.will || 0),
    natural, ac, touch: acParts.touch, flatFooted: acParts.flatFooted,
    barding: barding ? { item: barding, enh: bEnh, ac: armorAc, acp, proficient: armorProficient, profFeat } : null,
    cmb: row.bab + mod.str + cmSize + (fx.cmb || 0) + (fx.attack || 0), cmd: 10 + row.bab + mod.str + mod.dex + cmSize + dodge + (fx.cmd || 0),
    init: mod.dex + (has('Improved Initiative') ? 4 : 0) + (fx.init || 0),
    attacks: lines, multiattack, secondAttackNote: level >= 9 && totalAttacks < 3
      ? 'Multiattack: with fewer than three natural attacks, it gets a second attack with its primary natural weapon at -5.' : '',
    // Medium or heavy barding slows it (land speed); a flying animal can't fly in it.
    speed: barding && ['medium', 'heavy'].includes(barding.category)
      ? String(animal.speed || '').replace(/^(\d+)/, n => String(ARMORED_SPEED[Number(n)] ?? n)) + (/fly/i.test(animal.speed || '') ? ' (can\u2019t fly in medium or heavy barding)' : '')
      : fx.speed ? String(animal.speed || '').replace(/^(\d+)/, n => String(Number(n) + fx.speed)) : animal.speed,
    skills, ranksUsed, ranksTotal: row.skills,
    featCount: row.feats, tricksBonus: row.tricks,
    increasesAllowed: allowed,
    specials,
    qualities: [animal.special_qualities, adv?.special_qualities].filter(Boolean).join('; '),
    specialAttacks: [animal.special_attacks, adv?.special_attacks].filter(Boolean).join('; '),
    specialAbilities: [animal.special_abilities, adv?.special_abilities].filter(Boolean).join('; '),
    advanced: !!adv,
    why,
  };
}
