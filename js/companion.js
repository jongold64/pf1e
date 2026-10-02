// Animal companions (Core Rulebook, Druid: Animal Companions): who has one and at what effective druid level, and
// the companion's full statistics from its animal (data/companions.json) and the companion table. No page code here,
// so it can be tested on its own.

import { abilityModifier, SIZE_AC } from './rules.js';
import { featEffects } from './feats.js';
import { skillInfo } from './skills.js';

// Animal skills (Core Rulebook): an animal companion can put ranks only in these, and they're its class skills.
export const ANIMAL_SKILLS = ['Acrobatics', 'Climb', 'Escape Artist', 'Fly', 'Intimidate', 'Perception', 'Stealth', 'Survival', 'Swim'];
// Tricks an animal can learn (Core Rulebook, Handle Animal).
export const TRICKS = ['Attack', 'Come', 'Defend', 'Down', 'Fetch', 'Guard', 'Heel', 'Perform', 'Seek', 'Stay', 'Track', 'Work'];

// Natural attacks that are secondary (Bestiary, Universal Monster Rules); the Horse marks its hooves with *.
const SECONDARY = /^(hoof|hooves|tentacles?|tail slap|wings?|pincers?)$/;
const STEALTH_SIZE = { Fine: 16, Diminutive: 12, Tiny: 8, Small: 4, Medium: 0, Large: -4, Huge: -8, Gargantuan: -12, Colossal: -16 };
const FLY_SIZE = { Fine: 8, Diminutive: 6, Tiny: 4, Small: 2, Medium: 0, Large: -2, Huge: -4, Gargantuan: -6, Colossal: -8 };

// The effective druid level for an animal companion, adding up every class that gives one (their levels stack):
// a druid with Nature Bond as a companion (druid level) or the Animal domain (druid level - 3), a hunter (full level),
// a ranger from 4th level (ranger level - 3), a cleric with the Animal domain (cleric level - 3).
// counts: [{ cls, level }]; animalDomain(classId) says whether that class took a domain with the Animal Companion power.
export function companionLevel(counts, { natureBond = 'companion', animalDomain = () => false } = {}) {
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
  return { level: Math.min(20, sources.reduce((s, x) => s + x.levels, 0)), sources };
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
  const mod = Object.fromEntries(Object.entries(scores).map(([a, s]) => [a, s === null ? 0 : abilityModifier(s)]));

  const fb = featEffects(feats, row.hd);
  // d8 Hit Dice at their average (4.5) plus Con each, at least 1 per Hit Die.
  const hp = Math.max(row.hd, Math.floor(4.5 * row.hd) + mod.con * row.hd) + fb.hp;
  const sizeAc = SIZE_AC[size] ?? 0;
  const natural = animal.natural_armor + (adv?.natural_armor || 0) + row.natural_armor + (has('Improved Natural Armor') ? 1 : 0);
  const dodge = fb.dodgeAc;
  const ac = 10 + natural + mod.dex + sizeAc + dodge;
  const cmSize = -sizeAc;

  // Natural attacks: primary ones at BAB + Str (Dex with Weapon Finesse if higher) + size; secondary ones at -5
  // (-2 with Multiattack) and half Str to damage. A single natural attack adds 1 1/2 times Str.
  const attacks = parseAttacks(adv?.attacks || animal.attacks);
  const real = attacks.filter(x => !x.alternative);
  const totalAttacks = real.reduce((n, x) => n + x.count, 0);
  const multiattack = level >= 9 && totalAttacks >= 3 || has('Multiattack');
  const hitMod = has('Weapon Finesse') ? Math.max(mod.str, mod.dex) : mod.str;
  const lines = attacks.map(x => {
    const single = totalAttacks === 1 && !x.secondary;
    const strDamage = x.secondary ? (mod.str > 0 ? Math.floor(mod.str / 2) : mod.str) : single && mod.str > 0 ? Math.floor(mod.str * 1.5) : mod.str;
    const bonus = row.bab + hitMod + sizeAc + (x.secondary ? (multiattack ? -2 : -5) : 0);
    return { ...x, bonus, damageBonus: strDamage, damage: x.dice ? `${x.dice}${strDamage ? (strDamage > 0 ? `+${strDamage}` : strDamage) : ''}` : null };
  });

  // Skills: ranks only in animal skills (at most HD each), all class skills.
  const skillRanks = choices.skills || {};
  const skills = ANIMAL_SKILLS.map(name => {
    const info = skillInfo(name);
    const ranks = Math.min(row.hd, skillRanks[name] || 0);
    const total = ranks + mod[info.ability] + (ranks > 0 ? 3 : 0)
      + (name === 'Stealth' ? STEALTH_SIZE[size] || 0 : 0) + (name === 'Fly' ? FLY_SIZE[size] || 0 : 0);
    return { name, ranks, total, ability: info.ability };
  });
  const ranksUsed = skills.reduce((n, s) => n + s.ranks, 0);

  const specials = progression.slice(0, level).flatMap(r => r.special).filter(s => s !== 'Ability score increase');
  return {
    level, row, size, scores, mod, hp, hd: row.hd, bab: row.bab,
    fort: row.fort + mod.con + fb.fort, ref: row.ref + mod.dex + fb.ref, will: row.will + mod.wis + fb.will,
    natural, ac, touch: ac - natural, flatFooted: ac - Math.max(0, mod.dex) - dodge,
    cmb: row.bab + mod.str + cmSize, cmd: 10 + row.bab + mod.str + mod.dex + cmSize + dodge,
    init: mod.dex + (has('Improved Initiative') ? 4 : 0),
    attacks: lines, multiattack, secondAttackNote: level >= 9 && totalAttacks < 3
      ? 'Multiattack: with fewer than three natural attacks, it gets a second attack with its primary natural weapon at -5.' : '',
    speed: animal.speed,
    skills, ranksUsed, ranksTotal: row.skills,
    featCount: row.feats, tricksBonus: row.tricks,
    increasesAllowed: allowed,
    specials,
    qualities: [animal.special_qualities, adv?.special_qualities].filter(Boolean).join('; '),
    specialAttacks: [animal.special_attacks, adv?.special_attacks].filter(Boolean).join('; '),
    specialAbilities: [animal.special_abilities, adv?.special_abilities].filter(Boolean).join('; '),
    advanced: !!adv,
  };
}
