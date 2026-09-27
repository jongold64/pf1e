// Pathfinder 1e rules math. No page code here, so these functions can be tested on their own.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

// Core Rulebook point-buy costs for scores 7-18 (before racial adjustments).
export const POINT_COSTS = { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 };
export const MIN_SCORE = 7;
export const MAX_SCORE = 18;

export const BUDGETS = [
  { points: 10, label: 'Low fantasy (10)' },
  { points: 15, label: 'Standard fantasy (15)' },
  { points: 20, label: 'High fantasy (20)' },
  { points: 25, label: 'Epic fantasy (25)' },
];

// Size modifier to AC and attack rolls.
export const SIZE_AC = { Fine: 8, Diminutive: 4, Tiny: 2, Small: 1, Medium: 0, Large: -1, Huge: -2 };

export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

export function pointsSpent(baseScores) {
  return ABILITIES.reduce((sum, a) => sum + POINT_COSTS[baseScores[a]], 0);
}

// Racial adjustments for this race. `flexibleChoice` is the ability that gets +2
// for races like human that let the player choose.
export function racialAdjustments(race, flexibleChoice) {
  const adj = Object.fromEntries(ABILITIES.map(a => [a, 0]));
  if (!race) return adj;
  for (const [a, v] of Object.entries(race.ability_modifiers || {})) adj[a] += v;
  if (race.flexible_ability_bonus && ABILITIES.includes(flexibleChoice)) adj[flexibleChoice] += 2;
  return adj;
}

export function finalScores(baseScores, race, flexibleChoice) {
  const adj = racialAdjustments(race, flexibleChoice);
  return Object.fromEntries(ABILITIES.map(a => [a, baseScores[a] + adj[a]]));
}

export function hitDieSize(cls) {
  return parseInt(String(cls.hit_die).replace(/^d/i, ''), 10);
}

// Turns strings like "+2" or "-1" from the class tables into numbers.
function signedNumber(s) {
  const n = parseInt(String(s ?? '').replace(/\s/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Every character gets +1 to an ability score at these levels.
export const INCREASE_LEVELS = [4, 8, 12, 16, 20];

// Per-ability total of the level-based +1 increases reached by `level`.
// `choices` lists the ability picked at each of INCREASE_LEVELS; an empty entry adds nothing.
export function levelIncreases(level, choices = []) {
  const inc = Object.fromEntries(ABILITIES.map(a => [a, 0]));
  INCREASE_LEVELS.forEach((lv, i) => {
    if (level >= lv && ABILITIES.includes(choices[i])) inc[choices[i]] += 1;
  });
  return inc;
}

// Hit points gained after 1st level use the fixed average: half the die plus 1 (d8 -> 5).
export function averageHpPerLevel(cls) {
  return hitDieSize(cls) / 2 + 1;
}

// Iterative attacks as shown on a character sheet, e.g. [11, 6, 1] -> "+11/+6/+1".
export function formatBab(bab) {
  return bab.map(b => (b >= 0 ? `+${b}` : `${b}`)).join('/');
}

// Ability each class casts with, taken from its "Spells" rules text ("must have a ___ score equal to at least 10 + the spell level").
export const CASTING_ABILITY = {
  alchemist: 'int', antipaladin: 'cha', arcanist: 'int', bard: 'cha', bloodrager: 'cha',
  cleric: 'wis', druid: 'wis', hunter: 'wis', inquisitor: 'wis', investigator: 'int', magus: 'int',
  oracle: 'cha', paladin: 'cha', ranger: 'wis', shaman: 'wis', skald: 'cha', sorcerer: 'cha',
  summoner: 'cha', warpriest: 'wis', witch: 'int', wizard: 'int',
};

// Classes with one extra slot per spell level they can cast (1st and up). The class tables in the
// data don't include these. `optional` slots depend on a choice the player makes.
export const EXTRA_SLOTS = {
  cleric: { name: 'Domain', optional: false },
  shaman: { name: 'Spirit magic', optional: false },
  wizard: { name: 'School', optional: true, label: 'Specialist wizard (not a universalist)', default: true },
  druid: { name: 'Domain', optional: true, label: 'Chose a domain for Nature Bond', default: false },
};

// Bonus spells per day from a high casting ability (Core Rulebook Table 1-3). None for level 0.
export function bonusSpells(abilityMod, spellLevel) {
  if (spellLevel < 1 || abilityMod < spellLevel) return 0;
  return Math.floor((abilityMod - spellLevel) / 4) + 1;
}

// Spells per day for a class at `level`, or null for classes that never cast.
// `scores` are final ability scores; `extraSlot` turns on an optional EXTRA_SLOTS entry.
// Each row: { spellLevel, base, bonus, extra, total, known, canCast }. `base` and `known` are null
// when the class table has no number for that spell level (e.g. a sorcerer's cantrips per day).
export function spellsPerDay({ cls, level, scores, extraSlot = false }) {
  const ability = CASTING_ABILITY[cls.id];
  if (!ability) return null;
  const row = cls.progression[level - 1];
  const perDay = row.spells_per_day || {};
  const known = row.spells_known || {};
  const firstLevel = cls.progression.find(r => r.spells_per_day)?.level;
  const mod = abilityModifier(scores[ability]);
  const slot = EXTRA_SLOTS[cls.id];
  const hasExtra = !!slot && (!slot.optional || extraSlot);

  const spellLevels = [...new Set([...Object.keys(perDay), ...Object.keys(known)])]
    .map(Number).sort((a, b) => a - b);
  const rows = spellLevels.map(sl => {
    const canCast = scores[ability] >= 10 + sl;
    const base = perDay[sl] ?? null;
    const bonus = canCast && base !== null ? bonusSpells(mod, sl) : 0;
    const extra = canCast && base !== null && hasExtra && sl >= 1 ? 1 : 0;
    return {
      spellLevel: sl,
      base,
      bonus,
      extra,
      total: base === null ? null : (canCast ? base + bonus + extra : 0),
      known: known[sl] ?? null,
      canCast,
    };
  });
  return { ability, score: scores[ability], firstLevel, extraSlotName: hasExtra ? slot.name : null, rows };
}

// Everything the results panel shows for a single-class character of `level` (1-20).
// favoredHp is true if the favored class bonus goes to HP (it applies at every level).
// featBonuses holds the numbers feats add ({ hp, fort, ref, will, dodgeAc }, see featEffects in feats.js).
// gear is what worn armor and a shield do (armorEffects in armor.js); leave it out for no armor.
export function characterStats({ race, cls, level = 1, baseScores, flexibleChoice, increases = [],
                                 favoredHp = false, featBonuses = {}, gear = null }) {
  const g = { armorBonus: 0, shieldBonus: 0, maxDex: null, ...gear };
  const fb = { hp: 0, fort: 0, ref: 0, will: 0, dodgeAc: 0, ...featBonuses };
  const racial = finalScores(baseScores, race, flexibleChoice);
  const inc = levelIncreases(level, increases);
  const scores = Object.fromEntries(ABILITIES.map(a => [a, racial[a] + inc[a]]));
  const mod = Object.fromEntries(ABILITIES.map(a => [a, abilityModifier(scores[a])]));
  const row = cls.progression[level - 1];

  // Full hit die at 1st level, the average after that. A Con penalty can't make a level give less than 1 HP.
  let hp = Math.max(1, hitDieSize(cls) + mod.con);
  hp += (level - 1) * Math.max(1, averageHpPerLevel(cls) + mod.con);
  if (favoredHp) hp += level;
  hp += fb.hp;

  // Monks add Wis (if positive) plus their level-based AC bonus, but only with no armor and no shield.
  let classAc = 0;
  if (cls.id === 'monk' && !g.armor && !g.shield) {
    classAc = Math.max(0, mod.wis) + signedNumber(row.other?.['AC Bonus']);
  }
  const size = SIZE_AC[race?.size] ?? 0;
  // Armor's max Dex caps a Dex bonus to AC; a Dex penalty always applies.
  const dexAc = g.maxDex === null ? mod.dex : Math.min(mod.dex, g.maxDex);
  const armorAc = g.armorBonus + g.shieldBonus;
  const ac = 10 + armorAc + dexAc + size + classAc + fb.dodgeAc;

  return {
    increases: inc,
    scores,
    mod,
    hp,
    bab: row.bab,
    fort: row.fort + mod.con + fb.fort,
    ref: row.ref + mod.dex + fb.ref,
    will: row.will + mod.wis + fb.will,
    ac,
    dexAc,
    touch: ac - armorAc,
    // Flat-footed loses a Dex bonus and dodge bonuses, but a Dex penalty still applies.
    flatFooted: ac - Math.max(0, dexAc) - fb.dodgeAc,
  };
}
