// Skill rules: the skill list, class skills, skill ranks per level, racial and feat bonuses.
// No page code here, so these functions can be tested on their own.
import { abilityModifier, finalScores, levelIncreases } from './rules.js';

// Core Rulebook skills. `family` skills (Craft, Perform, Profession) need a specialty, e.g. Craft (alchemy).
export const SKILLS = [
  { name: 'Acrobatics', ability: 'dex' },
  { name: 'Appraise', ability: 'int' },
  { name: 'Bluff', ability: 'cha' },
  { name: 'Climb', ability: 'str' },
  { name: 'Craft', ability: 'int', family: true },
  { name: 'Diplomacy', ability: 'cha' },
  { name: 'Disable Device', ability: 'dex', trained: true },
  { name: 'Disguise', ability: 'cha' },
  { name: 'Escape Artist', ability: 'dex' },
  { name: 'Fly', ability: 'dex' },
  { name: 'Handle Animal', ability: 'cha', trained: true },
  { name: 'Heal', ability: 'wis' },
  { name: 'Intimidate', ability: 'cha' },
  ...['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility',
      'planes', 'religion'].map(k => ({ name: `Knowledge (${k})`, ability: 'int', trained: true })),
  { name: 'Linguistics', ability: 'int', trained: true },
  { name: 'Perception', ability: 'wis' },
  { name: 'Perform', ability: 'cha', family: true },
  { name: 'Profession', ability: 'wis', trained: true, family: true },
  { name: 'Ride', ability: 'dex' },
  { name: 'Sense Motive', ability: 'wis' },
  { name: 'Sleight of Hand', ability: 'dex', trained: true },
  { name: 'Spellcraft', ability: 'int', trained: true },
  { name: 'Stealth', ability: 'dex' },
  { name: 'Survival', ability: 'wis' },
  { name: 'Swim', ability: 'str' },
  { name: 'Use Magic Device', ability: 'cha', trained: true },
];

const lower = s => String(s ?? '').toLowerCase();

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
export function classSkillTest(cls) {
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

// Skill ranks gained at each level up to `level`. Each level gives class ranks + Int modifier (at least 1),
// using Int as it is at that level (so an Int increase at 4th level only helps from 4th level on),
// plus 1 for humans (Skilled) and 1 if the favored class bonus goes to skill ranks.
export function skillRanksAvailable({ race, cls, level, baseScores, flexibleChoice, increases = [], favoredSkill = false }) {
  const racial = finalScores(baseScores, race, flexibleChoice);
  const skilled = (race?.traits || []).some(t => t.name === 'Skilled' && /additional skill rank/i.test(t.text));
  let total = 0;
  for (let lv = 1; lv <= level; lv++) {
    const int = racial.int + levelIncreases(lv, increases).int;
    total += Math.max(1, cls.skill_ranks_per_level + abilityModifier(int));
    if (skilled) total += 1;
    if (favoredSkill) total += 1;
  }
  return total;
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

export function featSkillBonus(featNames, skillName, ranks) {
  let bonus = 0;
  for (const f of featNames) {
    if (SKILL_FEATS[f]?.includes(skillName)) bonus += ranks >= 10 ? 4 : 2;
  }
  return bonus;
}

// One skill's total. `scores` are final ability scores. Returns { total, usable, classBonus, racial, feat, abilityMod }.
// A trained-only skill with no ranks can't be used (usable: false).
export function skillTotal({ name, ranks, scores, isClassSkill, racialBonuses = {}, featNames = [] }) {
  const info = skillInfo(name);
  const abilityMod = abilityModifier(scores[info.ability]);
  const classBonus = isClassSkill && ranks > 0 ? 3 : 0;
  const racial = racialBonuses[name] || 0;
  const feat = featSkillBonus(featNames, name, ranks);
  return {
    abilityMod, classBonus, racial, feat,
    usable: !(info.trained && ranks === 0),
    total: ranks + abilityMod + classBonus + racial + feat,
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

