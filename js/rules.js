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

// Everything the results panel shows for a single-class character of `level` (1-20).
// favoredHp is true if the favored class bonus goes to HP (it applies at every level).
export function characterStats({ race, cls, level = 1, baseScores, flexibleChoice, increases = [],
                                 armor = 0, shield = 0, favoredHp = false }) {
  const racial = finalScores(baseScores, race, flexibleChoice);
  const inc = levelIncreases(level, increases);
  const scores = Object.fromEntries(ABILITIES.map(a => [a, racial[a] + inc[a]]));
  const mod = Object.fromEntries(ABILITIES.map(a => [a, abilityModifier(scores[a])]));
  const row = cls.progression[level - 1];

  // Full hit die at 1st level, the average after that. A Con penalty can't make a level give less than 1 HP.
  let hp = Math.max(1, hitDieSize(cls) + mod.con);
  hp += (level - 1) * Math.max(1, averageHpPerLevel(cls) + mod.con);
  if (favoredHp) hp += level;

  // Monks add Wis (if positive) plus their level-based AC bonus when unarmored.
  let classAc = 0;
  if (cls.id === 'monk') {
    classAc = Math.max(0, mod.wis) + signedNumber(row.other?.['AC Bonus']);
  }
  const size = SIZE_AC[race?.size] ?? 0;
  const ac = 10 + armor + shield + mod.dex + size + classAc;

  return {
    increases: inc,
    scores,
    mod,
    hp,
    bab: row.bab,
    fort: row.fort + mod.con,
    ref: row.ref + mod.dex,
    will: row.will + mod.wis,
    ac,
    touch: ac - armor - shield,
    // Flat-footed loses a Dex bonus, but a Dex penalty still applies.
    flatFooted: ac - Math.max(0, mod.dex),
  };
}
