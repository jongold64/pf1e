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
  // flexibleChoice is one ability, or two for Dual Talent (an alternate trait: +2 to two different abilities).
  const picks = [flexibleChoice].flat().filter(a => ABILITIES.includes(a));
  if (race.flexible_ability_bonus && !race.dual_talent && picks[0]) adj[picks[0]] += 2;
  if (race.dual_talent) [...new Set(picks)].slice(0, 2).forEach(a => { adj[a] += 2; });
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
  // Classes from later books (Foundry data).
  medium: 'cha', mesmerist: 'cha', occultist: 'int', psychic: 'int', spiritualist: 'wis', 'summoner-unchained': 'cha',
};

// Classes with a monk's AC bonus and unarmed strike table.
export const MONK_IDS = ['monk', 'monk-unchained'];

// Classes with one extra slot per spell level they can cast (1st and up). The class tables in the
// data don't include these. `optional` slots depend on a choice the player makes.
export const EXTRA_SLOTS = {
  cleric: { name: 'Domain', optional: false },
  shaman: { name: 'Spirit magic', optional: false },
  wizard: { name: 'School', optional: true, label: 'Specialist wizard (not a universalist)', default: true },
  druid: { name: 'Domain', optional: true, label: 'Chose a domain for Nature Bond', default: false },
};

// Arcanist spells prepared (Advanced Class Guide, Table: Arcanist Spells Prepared), by class level, from spell
// level 0 up. The data build keeps only the spells-per-day table, so this is entered by hand.
export const ARCANIST_PREPARED = [
  [4, 2], [5, 2], [5, 3], [6, 3, 1], [6, 4, 2], [7, 4, 2, 1], [7, 5, 3, 2], [8, 5, 3, 2, 1], [8, 5, 4, 3, 2],
  [9, 5, 4, 3, 2, 1], [9, 5, 5, 4, 3, 2], [9, 5, 5, 4, 3, 2, 1], [9, 5, 5, 4, 4, 3, 2], [9, 5, 5, 4, 4, 3, 2, 1],
  [9, 5, 5, 4, 4, 4, 3, 2], [9, 5, 5, 4, 4, 4, 3, 2, 1], [9, 5, 5, 4, 4, 4, 3, 3, 2], [9, 5, 5, 4, 4, 4, 3, 3, 2, 1],
  [9, 5, 5, 4, 4, 4, 3, 3, 3, 2], [9, 5, 5, 4, 4, 4, 3, 3, 3, 3],
];

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

  const prepared = cls.id === 'arcanist' ? Object.fromEntries((ARCANIST_PREPARED[level - 1] || []).map((n, sl) => [sl, n])) : {};
  const spellLevels = [...new Set([...Object.keys(perDay), ...Object.keys(known), ...Object.keys(prepared)])]
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
      prepared: prepared[sl] ?? null,
      canCast,
    };
  });
  return { ability, score: scores[ability], firstLevel, extraSlotName: hasExtra ? slot.name : null, rows };
}

// Levels in each class, in the order the classes were first taken: [{ cls, level }].
// `classLevels` is the character's class at each level, e.g. [fighter, fighter, rogue].
export function classCounts(classLevels) {
  const out = [];
  for (const cls of classLevels) {
    const entry = out.find(e => e.cls.id === cls.id);
    if (entry) entry.level += 1;
    else out.push({ cls, level: 1 });
  }
  return out;
}

// Attack bonuses from a total base attack bonus: an extra attack at +6, +11 and +16 (e.g. 11 -> [11, 6, 1]).
export function babList(total) {
  const out = [total];
  for (let b = total - 5; b > 0 && out.length < 4; b -= 5) out.push(b);
  return out;
}

// Everything the results panel shows. A single-class character can be given as { cls, level }; a
// multiclass one as `classLevels` (the class at each level, first level first).
// Base attack bonus and base saves add up across classes (Core Rulebook, Multiclassing). HP is the first
// class's full hit die at 1st level, then the average for each later level's class.
// favoredHp is true if the favored class bonus goes to HP; it counts only levels in the favored class
// (`favoredClassId`, which defaults to the first class). favoredPicks (from favoredChoices in race-options.js), if
// given, is the choice at each level instead ('hp', 'skill', 'option' or null).
// featBonuses holds the numbers feats add ({ hp, fort, ref, will, dodgeAc }, see featEffects in feats.js).
// gear is what worn armor and a shield do (armorEffects in armor.js); leave it out for no armor.
export function characterStats({ race, cls, level = 1, classLevels = null, favoredClassId = null, baseScores,
                                 flexibleChoice, increases = [], favoredHp = false, favoredPicks = null, featBonuses = {}, gear = null }) {
  const levels = classLevels || Array.from({ length: level }, () => cls);
  const total = levels.length;
  const counts = classCounts(levels);
  const g = { armorBonus: 0, shieldBonus: 0, maxDex: null, ...gear };
  const fb = { hp: 0, fort: 0, ref: 0, will: 0, dodgeAc: 0, ...featBonuses };
  const racial = finalScores(baseScores, race, flexibleChoice);
  const inc = levelIncreases(total, increases);
  const scores = Object.fromEntries(ABILITIES.map(a => [a, racial[a] + inc[a]]));
  const mod = Object.fromEntries(ABILITIES.map(a => [a, abilityModifier(scores[a])]));
  const rowFor = e => e.cls.progression[e.level - 1];
  const sum = key => counts.reduce((n, e) => n + (rowFor(e)[key] || 0), 0);

  // Full hit die at 1st level, the average after that. A Con penalty can't make a level give less than 1 HP.
  let hp = 0;
  levels.forEach((c, i) => { hp += Math.max(1, (i === 0 ? hitDieSize(c) : averageHpPerLevel(c)) + mod.con); });
  const favored = favoredClassId || levels[0].id;
  if (favoredPicks) hp += favoredPicks.filter(p => p === 'hp').length;
  else if (favoredHp) hp += levels.filter(c => c.id === favored).length;
  hp += fb.hp;

  // Monks add Wis (if positive) plus their monk-level AC bonus, but only with no armor and no shield.
  let classAc = 0;
  const monk = counts.find(e => MONK_IDS.includes(e.cls.id));
  if (monk && !g.armor && !g.shield) {
    classAc = Math.max(0, mod.wis) + signedNumber(rowFor(monk).other?.['AC Bonus']);
  }
  const size = SIZE_AC[race?.size] ?? 0;
  // Armor's max Dex caps a Dex bonus to AC; a Dex penalty always applies.
  const dexAc = g.maxDex === null ? mod.dex : Math.min(mod.dex, g.maxDex);
  const armorAc = g.armorBonus + g.shieldBonus;
  // Racial natural armor (kept when flat-footed, lost against touch) and racial dodge bonuses.
  const raceAc = racialAc(race);
  const dodge = fb.dodgeAc + raceAc.dodge;
  const ac = 10 + armorAc + dexAc + size + classAc + dodge + raceAc.natural;
  const bab = counts.reduce((n, e) => n + rowFor(e).bab[0], 0);

  return {
    level: total,
    classCounts: counts,
    increases: inc,
    scores,
    mod,
    hp,
    bab: babList(bab),
    fort: sum('fort') + mod.con + fb.fort,
    ref: sum('ref') + mod.dex + fb.ref,
    will: sum('will') + mod.wis + fb.will,
    ac,
    dexAc,
    naturalArmor: raceAc.natural,
    touch: ac - armorAc - raceAc.natural,
    // Flat-footed loses a Dex bonus and dodge bonuses, but a Dex penalty still applies.
    flatFooted: ac - Math.max(0, dexAc) - dodge,
  };
}

// Current hit points: `current` is what was saved (null = full); it can't be above the maximum (e.g. after the
// character loses a level or Con).
export function currentHp(current, max) {
  return current === null || current === undefined ? max : Math.min(current, max);
}

// Applying damage (negative) or healing (positive): healing stops at the maximum.
export function changeHp(current, max, amount) {
  return Math.min(max, currentHp(current, max) + amount);
}

// What 0 or fewer hit points means (Core Rulebook, Injury and Death): 0 disabled, below 0 dying, and dead at a
// negative amount equal to the Constitution score.
export function hpStatus(hp, conScore) {
  if (hp <= -conScore) return 'dead';
  if (hp < 0) return 'dying';
  if (hp === 0) return 'disabled';
  return '';
}

// Channel energy for each class that has it (Core Rulebook cleric and paladin, antipaladin, warpriest; holy vindicator
// levels add to the cleric's). Returns [{ source, energy, level, dice, dc, uses }]: dice = (effective cleric level + 1) / 2
// d6, DC 10 + half the effective level + Cha (+2 Improved Channel), uses per day 3 + Cha for a cleric, or half the lay
// on hands / touch of corruption / fervor uses for the others (2 of those per channel).
export function channelEnergy(stats, haveFeats = []) {
  const counts = stats.classCounts || [];
  const lv = id => counts.find(e => e.cls.id === id)?.level || 0;
  const cha = stats.mod.cha;
  const out = [];
  const add = (source, energy, level, uses) => {
    if (level < 1) return;
    out.push({ source, energy, level, dice: `${Math.ceil(level / 2)}d6`, uses: Math.max(0, uses),
               dc: 10 + Math.floor(level / 2) + cha + (haveFeats.includes('Improved Channel') ? 2 : 0) });
  };
  if (lv('cleric')) add('Cleric', 'positive or negative', lv('cleric') + lv('holy-vindicator'), 3 + cha);
  if (lv('paladin') >= 4) add('Paladin', 'positive', lv('paladin'), Math.floor((Math.floor(lv('paladin') / 2) + cha) / 2));
  if (lv('antipaladin') >= 4) add('Antipaladin', 'negative', lv('antipaladin'), Math.floor((Math.floor(lv('antipaladin') / 2) + cha) / 2));
  if (lv('warpriest') >= 4) add('Warpriest', 'positive or negative', lv('warpriest') - 3,
                               Math.floor((Math.floor(lv('warpriest') / 2) + stats.mod.wis) / 2));
  return out;
}

// Lay on hands (paladin) and touch of corruption (antipaladin) from 2nd level: 1d6 per two class levels, used
// half the class level + Cha times per day. Returns [{ name, dice, uses, heals }].
export function layOnHands(stats) {
  const counts = stats.classCounts || [];
  const out = [];
  for (const [id, name, heals] of [['paladin', 'Lay on hands', true], ['antipaladin', 'Touch of corruption', false]]) {
    const level = counts.find(e => e.cls.id === id)?.level || 0;
    if (level >= 2) out.push({ name, dice: `${Math.floor(level / 2)}d6`, uses: Math.max(0, Math.floor(level / 2) + stats.mod.cha), heals });
  }
  return out;
}

// Smite evil (paladin) / smite good (antipaladin): +Cha bonus (if any) on attack rolls, +class level on damage (the
// first hit against evil outsiders, evil dragons and undead deals +2 per level instead), and +Cha deflection bonus to
// AC against the target. Uses: 1 at 1st level, +1 at 4th and every 3 levels after. Returns [{ name, attack, damage,
// firstHit, deflection, uses }].
export function smite(stats) {
  const counts = stats.classCounts || [];
  const out = [];
  for (const [id, name] of [['paladin', 'Smite evil'], ['antipaladin', 'Smite good']]) {
    const level = counts.find(e => e.cls.id === id)?.level || 0;
    if (!level) continue;
    const cha = Math.max(0, stats.mod.cha);
    out.push({ name, attack: cha, damage: level, firstHit: 2 * level, deflection: cha, uses: 1 + Math.floor((level - 1) / 3) });
  }
  return out;
}

// Carrying capacity (Core Rulebook Table 7-4): the most a character can carry as a heavy load, by Strength; light is
// a third of it and medium two thirds. Above 29, each +10 Strength multiplies by 4. Size multiplies it (bipeds).
const HEAVY_LOAD = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 520, 600,
  700, 800, 920, 1040, 1200, 1400];
const SIZE_CARRY = { Fine: 1 / 8, Diminutive: 1 / 4, Tiny: 1 / 2, Small: 3 / 4, Medium: 1, Large: 2, Huge: 4 };
export function carryingCapacity(str, size = 'Medium') {
  let heavy;
  if (str < 1) heavy = 0;
  else if (str <= 29) heavy = HEAVY_LOAD[str];
  else heavy = HEAVY_LOAD[20 + ((str - 20) % 10)] * 4 ** Math.floor((str - 20) / 10);
  heavy *= SIZE_CARRY[size] ?? 1;
  return { light: Math.floor(heavy / 3), medium: Math.floor(heavy * 2 / 3), heavy: Math.floor(heavy) };
}

// The load a weight makes and what it does (Core Rulebook Table 7-5): medium caps Dex at +3 with a -3 check penalty,
// heavy at +1 with -6; both slow the character like medium or heavy armor. Above heavy the character is overloaded
// (can barely move). { load, maxDex, checkPenalty, slows }
export function encumbrance(weight, capacity) {
  if (weight <= capacity.light) return { load: 'light', maxDex: null, checkPenalty: 0, slows: false };
  if (weight <= capacity.medium) return { load: 'medium', maxDex: 3, checkPenalty: -3, slows: true };
  if (weight <= capacity.heavy) return { load: 'heavy', maxDex: 1, checkPenalty: -6, slows: true };
  return { load: 'overloaded', maxDex: 0, checkPenalty: -6, slows: true };
}

// Speed slowed by medium/heavy armor or load (Core Rulebook Table 7-6): 30 -> 20, 20 -> 15, otherwise two thirds
// rounded to 5 feet.
export function slowedSpeed(speed) {
  if (speed === null || speed === undefined) return speed;
  if (speed === 30) return 20;
  if (speed === 20) return 15;
  return Math.max(5, Math.round(speed * 2 / 3 / 5) * 5);
}

// Initiative: Dex modifier, +4 with Improved Initiative.
export function initiative(stats, haveFeats = [], traitBonus = 0) {
  return stats.mod.dex + (haveFeats.includes('Improved Initiative') ? 4 : 0) + traitBonus;
}

// Combat Maneuver Bonus and Defense (Core Rulebook, Combat Maneuvers). The size modifier is the reverse of the AC
// one (Small -1). CMD adds everything touch AC counts besides Dex and size (dodge, deflection, a monk's AC bonus),
// so it starts from touch AC: touch - size AC bonus + size CMD modifier + BAB + Str.
// haveFeats adds: Agile Maneuvers (Dex instead of Str for CMB, if higher), and Improved / Greater <maneuver> feats
// (+2 each on that maneuver's CMB; Improved also +2 to CMD against it), listed in `maneuvers`.
// A monk from 3rd level uses monk level in place of the monk levels' BAB for CMB (maneuver training).
export const MANEUVERS = ['Bull Rush', 'Dirty Trick', 'Disarm', 'Drag', 'Grapple', 'Overrun', 'Reposition', 'Steal',
  'Sunder', 'Trip'];
export function combatManeuvers(stats, size, haveFeats = []) {
  const sizeMod = -(SIZE_AC[size] ?? 0);
  const bab = stats.bab[0];
  const monk = (stats.classCounts || []).find(e => e.cls.id === 'monk' && e.level >= 3);
  const cmbBab = monk ? bab - monk.cls.progression[monk.level - 1].bab[0] + monk.level : bab;
  const ability = haveFeats.includes('Agile Maneuvers') ? Math.max(stats.mod.str, stats.mod.dex) : stats.mod.str;
  const cmb = cmbBab + ability + sizeMod;
  const cmd = stats.touch + sizeMod + sizeMod + bab + stats.mod.str;
  const maneuvers = MANEUVERS.map(name => {
    const improved = haveFeats.includes(`Improved ${name}`);
    const greater = haveFeats.includes(`Greater ${name}`);
    return improved || greater ? { name, cmb: cmb + (improved ? 2 : 0) + (greater ? 2 : 0), cmd: cmd + (improved ? 2 : 0) } : null;
  }).filter(Boolean);
  return { cmb, cmd, maneuvers };
}

// Racial AC bonuses that always apply, read from the race's traits: "Kobolds have a +1 natural armor bonus.",
// "Kasathas have a +2 dodge bonus to Armor Class." Conditional ones ("against giants", "when adjacent to…")
// are left out.
export function racialAc(race) {
  const out = { natural: 0, dodge: 0 };
  for (const t of race?.traits || []) {
    const text = String(t.text || '');
    if (/\b(against|when|while|if)\b/i.test(text)) continue;
    // "have a +1 natural armor bonus", "granting them a +1 natural armor bonus", "grants a +2 natural armor bonus"
    const natural = text.match(/\b(?:have|has|gain|gains|granting \w+|grants?) a \+(\d+) (?:racial bonus to )?natural armor bonus\b/i);
    if (natural) out.natural += Number(natural[1]);
    const dodge = text.match(/\b(?:have|has|gain|gains) a \+(\d+) dodge bonus to (?:AC|Armor Class)\b/i);
    if (dodge) out.dodge += Number(dodge[1]);
  }
  return out;
}
