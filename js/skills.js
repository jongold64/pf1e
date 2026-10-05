// Skill rules: the skill list, class skills, skill ranks per level, racial and feat bonuses.
// No page code here, so these functions can be tested on their own.
import { abilityModifier, finalScores, levelIncreases } from './rules.js';

// `untrained`: a trained-only skill the Core Rulebook still lets you use in a limited way without ranks.
// Core Rulebook skills. `family` skills (Craft, Perform, Profession) need a specialty, e.g. Craft (alchemy).
// `acp` skills take the armor check penalty.
export const SKILLS = [
  { name: 'Acrobatics', ability: 'dex', acp: true },
  { name: 'Appraise', ability: 'int' },
  { name: 'Bluff', ability: 'cha' },
  { name: 'Climb', ability: 'str', acp: true },
  { name: 'Craft', ability: 'int', family: true },
  { name: 'Diplomacy', ability: 'cha' },
  { name: 'Disable Device', ability: 'dex', acp: true, trained: true },
  { name: 'Disguise', ability: 'cha' },
  { name: 'Escape Artist', ability: 'dex', acp: true },
  { name: 'Fly', ability: 'dex', acp: true },
  { name: 'Handle Animal', ability: 'cha', trained: true, untrained: 'Without ranks, only to handle or push domestic animals (a Charisma check).' },
  { name: 'Heal', ability: 'wis' },
  { name: 'Intimidate', ability: 'cha' },
  ...['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility',
      'planes', 'religion'].map(k => ({ name: `Knowledge (${k})`, ability: 'int', trained: true,
                                untrained: 'Without ranks, only for checks of DC 10 or lower (common knowledge).' })),
  { name: 'Linguistics', ability: 'int', trained: true },
  { name: 'Perception', ability: 'wis' },
  { name: 'Perform', ability: 'cha', family: true },
  { name: 'Profession', ability: 'wis', trained: true, family: true },
  { name: 'Ride', ability: 'dex', acp: true },
  { name: 'Sense Motive', ability: 'wis' },
  { name: 'Sleight of Hand', ability: 'dex', acp: true, trained: true,
    untrained: 'Without ranks, a Dexterity check that can only beat DC 10 or lower (except hiding an object on your body).' },
  { name: 'Spellcraft', ability: 'int', trained: true },
  { name: 'Stealth', ability: 'dex', acp: true },
  { name: 'Survival', ability: 'wis' },
  { name: 'Swim', ability: 'str', acp: true },
  { name: 'Use Magic Device', ability: 'cha', trained: true },
];

const lower = s => String(s ?? '').toLowerCase();

// Craft specialties for the Skills tab's list: the Core Rulebook's common Craft skills, then ones later Paizo books
// use (clockwork: Blood of the Beast; maps: Ultimate Wilderness; mechanical: Technology Guide; poison: Ultimate
// Combat; siege engines: Ultimate Combat; tattoos: Ultimate Equipment). Others can still be typed in.
export const CRAFTS = ['alchemy', 'armor', 'baskets', 'books', 'bows', 'calligraphy', 'carpentry', 'cloth', 'clothing',
  'glass', 'jewelry', 'leather', 'locks', 'paintings', 'pottery', 'sculptures', 'ships', 'shoes', 'stonemasonry', 'traps',
  'weapons', 'clockwork', 'maps', 'mechanical', 'poison', 'siege engines', 'tattoos'];

// "Craft (alchemy)" -> { base: 'Craft', specialty: 'alchemy' }; "Stealth" -> { base: 'Stealth', specialty: null }
export function splitSkill(name) {
  const m = String(name).match(/^(.+?) \((.+)\)$/);
  return m ? { base: m[1], specialty: m[2] } : { base: String(name), specialty: null };
}

// The SKILLS entry for a skill or a specialty of a family skill.
export function skillInfo(name) {
  return SKILLS.find(s => s.name === name) || SKILLS.find(s => s.family && s.name === splitSkill(name).base) || null;
}

// A class's class skills as a test function: isClassSkill('Knowledge (arcana)'), isClassSkill('Craft (alchemy)').
// Class data uses a few shorthand forms: "Craft (any)", "Knowledge (all)", "Perform (oratory, sing, ...)".
// Pass a list of classes for a multiclass character: a skill is a class skill if any of them has it.
export function classSkillTest(clsOrList) {
  if (Array.isArray(clsOrList)) {
    const tests = clsOrList.map(c => classSkillTest(c));
    return name => tests.some(t => t(name));
  }
  const cls = clsOrList;
  const entries = (cls.class_skills || []).map(s => s.skill);
  const exact = new Set();
  const families = new Map();  // base name -> null (any specialty) or a set of allowed specialties
  let allKnowledge = false;
  for (const entry of entries) {
    const { base, specialty } = splitSkill(entry);
    if (base === 'Knowledge' && /^all/.test(lower(specialty))) { allKnowledge = true; continue; }
    const info = SKILLS.find(s => s.name === base);
    if (info?.family) {
      if (!specialty || lower(specialty) === 'any') families.set(base, null);
      else families.set(base, new Set(specialty.split(/,\s*|\s+or\s+/).map(lower)));
    } else {
      exact.add(entry);
    }
  }
  return name => {
    if (exact.has(name)) return true;
    const { base, specialty } = splitSkill(name);
    if (allKnowledge && base === 'Knowledge') return true;
    if (!families.has(base)) return false;
    const allowed = families.get(base);
    return allowed === null || (specialty !== null && allowed.has(lower(specialty)));
  };
}

// Skill ranks gained at each level. Each level gives that level's class ranks + Int modifier (at least 1),
// using Int as it is at that level (so an Int increase at 4th level only helps from 4th level on),
// plus 1 for humans (Skilled) and 1 for levels in the favored class if its bonus goes to skill ranks.
// Pass { cls, level } for a single class, or `classLevels` (the class at each level) and `favoredClassId`.
export function skillRanksAvailable(args) {
  return skillRanksByLevel(args).reduce((n, r) => n + r.total, 0);
}

// The skill ranks each level gives: [{ level, cls, perLevel (the class's ranks), intMod (Int modifier at that level),
// fromClass (the two together, at least 1), skilled (a race's Skilled trait: 1), favored (favored class bonus: 1), total }].
export function skillRanksByLevel({ race, cls, level, classLevels = null, favoredClassId = null, baseScores,
                                    flexibleChoice, increases = [], favoredSkill = false, favoredPicks = null }) {
  const levels = classLevels || Array.from({ length: level }, () => cls);
  const favored = favoredClassId || levels[0].id;
  const racial = finalScores(baseScores, race, flexibleChoice);
  const skilled = (race?.traits || []).some(t => t.name === 'Skilled' && /additional skill rank/i.test(t.text)) ? 1 : 0;
  return levels.map((c, i) => {
    const intMod = abilityModifier(racial.int + levelIncreases(i + 1, increases).int);
    const fromClass = Math.max(1, c.skill_ranks_per_level + intMod);
    const fav = (favoredPicks ? favoredPicks[i] === 'skill' : favoredSkill && c.id === favored) ? 1 : 0;
    return { level: i + 1, cls: c, perLevel: c.skill_ranks_per_level, intMod, fromClass, skilled, favored: fav,
             total: fromClass + skilled + fav };
  });
}

// Racial skill bonuses that always apply, read from the race's traits. Returns { skillName: bonus }.
// Bonuses with a condition ("made to identify...", "against reptiles", "in dim light") are left out.
export function racialSkillBonuses(race) {
  const out = {};
  for (const t of race?.traits || []) {
    const text = String(t.text || '').replace(/ checks and /g, ' and ');
    for (const m of text.matchAll(/\+(\d+) racial bonus on ([A-Za-z ,()']+?) checks([^,;.]*)/g)) {
      const tail = m[3].trim();
      if (tail && !/^due to/.test(tail)) continue;
      const names = m[2].split(/,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()).filter(Boolean);
      if (!names.every(n => skillInfo(n))) continue;
      for (const n of names) out[n] = (out[n] || 0) + Number(m[1]);
    }
  }
  return out;
}

// Feats that give +2 on two skills, rising to +4 in a skill with 10 or more ranks.
export const SKILL_FEATS = {
  'Acrobatic': ['Acrobatics', 'Fly'],
  'Alertness': ['Perception', 'Sense Motive'],
  'Animal Affinity': ['Handle Animal', 'Ride'],
  'Athletic': ['Climb', 'Swim'],
  'Deceitful': ['Bluff', 'Disguise'],
  'Deft Hands': ['Disable Device', 'Sleight of Hand'],
  'Magical Aptitude': ['Spellcraft', 'Use Magic Device'],
  'Persuasive': ['Diplomacy', 'Intimidate'],
  'Self-Sufficient': ['Heal', 'Survival'],
  'Stealthy': ['Escape Artist', 'Stealth'],
};

// featNames can include "Skill Focus (Stealth)": +3, or +6 with 10 or more ranks.
export function featSkillBonus(featNames, skillName, ranks) {
  let bonus = 0;
  for (const f of featNames) {
    if (SKILL_FEATS[f]?.includes(skillName)) bonus += ranks >= 10 ? 4 : 2;
    if (f === `Skill Focus (${skillName})`) bonus += ranks >= 10 ? 6 : 3;
  }
  return bonus;
}

// Everything that adds to one skill, named, for the Skills tab's Details popup: [{ label, value, note? }] plus the
// total (the same as skillTotal's). traits: the chosen trait records (only the highest trait bonus counts);
// effects: active effect bonuses on skill checks ({ source, type, value }) and effectTotal, their total after stacking.
export function skillBreakdown({ name, ranks, scores, isClassSkill, racialBonuses = {}, raceName = 'Race', featNames = [],
                                 checkPenalty = 0, traits = [], effects = [], effectTotal = 0 }) {
  const info = skillInfo(name);
  const t = skillTotal({ name, ranks, scores, isClassSkill, racialBonuses, featNames, checkPenalty,
                         traitBonuses: Object.fromEntries([[name, Math.max(0, ...traits.map(x => x.effects?.skills?.[name] || 0))]]),
                         effectBonus: effectTotal });
  const ABILITY = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  const lines = [{ label: 'Ranks', value: ranks }, { label: `${ABILITY[info.ability]} modifier`, value: t.abilityMod }];
  if (t.classBonus) lines.push({ label: 'Class skill (with at least 1 rank)', value: t.classBonus });
  if (t.racial) lines.push({ label: `Racial bonus (${raceName})`, value: t.racial });
  for (const f of featNames) {
    if (SKILL_FEATS[f]?.includes(name)) lines.push({ label: `Feat: ${f}`, value: ranks >= 10 ? 4 : 2, note: ranks >= 10 ? '10+ ranks' : '' });
    if (f === `Skill Focus (${name})`) lines.push({ label: 'Feat: Skill Focus', value: ranks >= 10 ? 6 : 3, note: ranks >= 10 ? '10+ ranks' : '' });
  }
  // Trait bonuses don't stack with each other: the highest counts.
  const withTrait = traits.filter(x => x.effects?.skills?.[name]).sort((a, b) => b.effects.skills[name] - a.effects.skills[name]);
  withTrait.forEach((x, i) => lines.push({ label: `Trait: ${x.name}`, value: i === 0 ? x.effects.skills[name] : 0,
                                          note: i === 0 ? '' : `+${x.effects.skills[name]}, doesn't stack with another trait bonus` }));
  if (t.armor) lines.push({ label: 'Armor check penalty', value: t.armor });
  for (const e of effects) lines.push({ label: `Effect: ${e.source}`, value: e.value, note: `${e.type} bonus` });
  // Bonuses of the same type that don't stack: the difference between the effects listed and what counts.
  const listed = effects.reduce((n, e) => n + e.value, 0);
  if (listed !== effectTotal) lines.push({ label: 'Effects of the same type do not stack', value: effectTotal - listed });
  return { lines, total: t.total, usable: t.usable, trained: !!info.trained, limited: t.limited };
}

// One skill's total. `scores` are final ability scores; `checkPenalty` (0 or less) is the armor check penalty.
// Returns { total, usable, classBonus, racial, feat, armor, abilityMod }.
// A trained-only skill with no ranks can't be used (usable: false).
// traitBonuses: { skill name: bonus } from chosen traits.
export function skillTotal({ name, ranks, scores, isClassSkill, racialBonuses = {}, featNames = [], checkPenalty = 0, traitBonuses = {},
                             effectBonus = 0 }) {
  const info = skillInfo(name);
  const abilityMod = abilityModifier(scores[info.ability]);
  const classBonus = isClassSkill && ranks > 0 ? 3 : 0;
  const racial = racialBonuses[name] || 0;
  const feat = featSkillBonus(featNames, name, ranks);
  const armor = info.acp ? checkPenalty : 0;
  const trait = traitBonuses[name] || 0;
  return {
    abilityMod, classBonus, racial, feat, armor, trait, effect: effectBonus,
    usable: !(info.trained && ranks === 0) || !!info.untrained,
    limited: info.trained && ranks === 0 ? info.untrained || '' : '',
    // effectBonus: active effects' bonus on all skill checks (heroism...).
    total: ranks + abilityMod + classBonus + racial + feat + armor + trait + effectBonus,
  };
}

// Ranks in a skill as a feat prerequisite names it. "Craft" alone means any Craft specialty,
// "Perform (oratory or sing)" means either one. Returns the best matching rank count.
export function ranksFor(prereqSkill, skillRanks) {
  const { base, specialty } = splitSkill(prereqSkill);
  const info = SKILLS.find(s => s.name === base);
  if (!info?.family) return skillRanks[prereqSkill] || 0;
  const options = specialty ? specialty.split(/\s+or\s+|,\s*/).map(lower) : null;
  let best = 0;
  for (const [name, ranks] of Object.entries(skillRanks)) {
    const s = splitSkill(name);
    if (s.base !== base) continue;
    if (options && !options.includes(lower(s.specialty))) continue;
    best = Math.max(best, ranks);
  }
  return best;
}

