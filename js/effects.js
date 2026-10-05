// Active effects: spells and other buffs on the character, and custom bonuses the player types in. No page code
// here, so it can be tested on its own.
//
// An effect is a list of bonuses: { target, type, value }. Targets: the six abilities (str...cha), 'ac', 'attack',
// 'damage', 'fort', 'ref', 'will', 'saves' (all three), 'init', 'speed', 'skills', 'cmb', 'cmd', 'hp'.
// Stacking (Core Rulebook, Combining Magical Effects): bonuses of the same type don't stack (the highest counts),
// except dodge, circumstance and untyped bonuses; penalties all add up.

export const BONUS_TYPES = ['alchemical', 'armor', 'circumstance', 'competence', 'deflection', 'dodge', 'enhancement',
  'insight', 'luck', 'morale', 'natural armor', 'natural armor enhancement', 'profane', 'resistance', 'sacred', 'shield',
  'size', 'untyped'];
const STACKS = new Set(['dodge', 'circumstance', 'untyped']);

export const TARGETS = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'],
  ['wis', 'Wisdom'], ['cha', 'Charisma'], ['ac', 'Armor Class'], ['attack', 'Attack rolls'], ['damage', 'Damage rolls'],
  ['saves', 'All saves'], ['fort', 'Fortitude'], ['ref', 'Reflex'], ['will', 'Will'], ['init', 'Initiative'],
  ['speed', 'Speed (ft.)'], ['skills', 'Skill checks'], ['checks', 'Ability checks'], ['cmb', 'CMB'], ['cmd', 'CMD'], ['hp', 'Hit points'],
  ['d20', 'All d20 rolls (attacks, saves, skills, ability checks)']];
export const TARGET_NAMES = Object.fromEntries(TARGETS);

const per = (cl, every, max, start = 1) => Math.min(max, Math.max(start, Math.floor(cl / every)));
const b = (target, type, value) => ({ target, type, value });

// Common buffs. `bonuses(cl)` gives the bonuses for a caster level; `scales` = they depend on it; `size` = changes
// size by that many steps; `note` = what isn't counted (extra attacks, conditional bonuses...).
export const BUFFS = [
  { id: 'aid', name: 'Aid', bonuses: () => [b('attack', 'morale', 1)], note: '+1 morale on saves against fear; 1d8 + caster level temporary hp (max +10)' },
  { id: 'barkskin', name: 'Barkskin', scales: true, bonuses: cl => [b('ac', 'natural armor enhancement', Math.min(5, 2 + Math.max(0, Math.floor((cl - 3) / 3))))] },
  { id: 'bears-endurance', name: "Bear's endurance", bonuses: () => [b('con', 'enhancement', 4)] },
  { id: 'bless', name: 'Bless', bonuses: () => [b('attack', 'morale', 1)], note: '+1 morale on saves against fear' },
  { id: 'bulls-strength', name: "Bull's strength", bonuses: () => [b('str', 'enhancement', 4)] },
  { id: 'cats-grace', name: "Cat's grace", bonuses: () => [b('dex', 'enhancement', 4)] },
  { id: 'divine-favor', name: 'Divine favor', scales: true, bonuses: cl => [b('attack', 'luck', per(cl, 3, 3)), b('damage', 'luck', per(cl, 3, 3))] },
  { id: 'divine-power', name: 'Divine power', scales: true,
    bonuses: cl => [b('attack', 'luck', per(cl, 3, 6)), b('damage', 'luck', per(cl, 3, 6))],
    note: 'same bonus on Strength checks and skills; 1 temporary hp per caster level; one extra attack at full bonus on a full attack' },
  { id: 'eagles-splendor', name: "Eagle's splendor", bonuses: () => [b('cha', 'enhancement', 4)] },
  { id: 'enlarge-person', name: 'Enlarge person', size: 1, bonuses: () => [b('str', 'size', 2), b('dex', 'size', -2)],
    note: 'reach +5 ft. (the size change itself is counted: -1 attack and AC, +1 CMB and CMD, bigger weapon damage)' },
  { id: 'expeditious-retreat', name: 'Expeditious retreat', bonuses: () => [b('speed', 'enhancement', 30)] },
  { id: 'foxs-cunning', name: "Fox's cunning", bonuses: () => [b('int', 'enhancement', 4)] },
  { id: 'good-hope', name: 'Good hope', bonuses: () => ['attack', 'damage', 'saves', 'skills', 'checks'].map(t => b(t, 'morale', 2)) },
  { id: 'greater-heroism', name: 'Greater heroism', bonuses: () => ['attack', 'saves', 'skills'].map(t => b(t, 'morale', 4)),
    note: 'immune to fear; temporary hp equal to caster level (max 20)' },
  { id: 'haste', name: 'Haste', bonuses: () => [b('attack', 'untyped', 1), b('ac', 'dodge', 1), b('ref', 'dodge', 1), b('speed', 'enhancement', 30)],
    note: 'one extra attack at full bonus on a full attack' },
  { id: 'heroism', name: 'Heroism', bonuses: () => ['attack', 'saves', 'skills'].map(t => b(t, 'morale', 2)) },
  { id: 'inspire-courage', name: 'Inspire courage (bard)', scales: true, levelName: 'bard level',
    bonuses: l => [b('attack', 'competence', 1 + Math.floor((l + 1) / 6)), b('damage', 'competence', 1 + Math.floor((l + 1) / 6))],
    note: 'same bonus on saves against charm and fear' },
  { id: 'longstrider', name: 'Longstrider', bonuses: () => [b('speed', 'enhancement', 10)] },
  { id: 'mage-armor', name: 'Mage armor', bonuses: () => [b('ac', 'armor', 4)] },
  { id: 'owls-wisdom', name: "Owl's wisdom", bonuses: () => [b('wis', 'enhancement', 4)] },
  { id: 'prayer', name: 'Prayer', bonuses: () => ['attack', 'damage', 'saves', 'skills'].map(t => b(t, 'luck', 1)) },
  { id: 'protection-from-evil', name: 'Protection from evil (or chaos, good, law)', bonuses: () => [b('ac', 'deflection', 2), b('saves', 'resistance', 2)],
    note: 'only against attacks and effects by evil (chaotic, good, lawful) creatures' },
  { id: 'rage', name: 'Rage (spell)', bonuses: () => [b('str', 'morale', 2), b('con', 'morale', 2), b('will', 'morale', 1), b('ac', 'untyped', -2)] },
  { id: 'reduce-person', name: 'Reduce person', size: -1, bonuses: () => [b('str', 'size', -2), b('dex', 'size', 2)],
    note: 'reach may shrink (the size change itself is counted: +1 attack and AC, -1 CMB and CMD, smaller weapon damage)' },
  { id: 'resistance', name: 'Resistance', bonuses: () => [b('saves', 'resistance', 1)] },
  { id: 'shield', name: 'Shield', bonuses: () => [b('ac', 'shield', 4)], note: 'immune to magic missile' },
  { id: 'shield-of-faith', name: 'Shield of faith', scales: true, bonuses: cl => [b('ac', 'deflection', Math.min(5, 2 + Math.floor(cl / 6)))] },
];
export const buffById = new Map(BUFFS.map(x => [x.id, x]));

// Every bonus from the buffs that are on ([{ id, cl }]) and custom effects ([{ name, target, type, value, on }]),
// each with its source's name.
export function activeBonuses(buffs = [], custom = []) {
  const out = [];
  for (const { id, cl } of buffs) {
    const buff = buffById.get(id);
    if (!buff) continue;
    for (const x of buff.bonuses(Math.max(1, Number(cl) || 1))) out.push({ ...x, source: buff.name });
  }
  // A custom effect can give several bonuses: its own { target, type, value } and any more in `more`.
  for (const c of custom) {
    if (c.on === false) continue;
    for (const p of [c, ...(c.more || [])]) {
      const value = Number(p.value);
      if (!value || !TARGET_NAMES[p.target]) continue;
      out.push({ target: p.target, type: BONUS_TYPES.includes(p.type) ? p.type : 'untyped', value, source: c.name || 'Custom' });
    }
  }
  // "All saves" counts on each save (so it stacks, or not, with bonuses to one save); "All d20 rolls" on attacks, each
  // save, skills and ability checks.
  const spread = { saves: ['fort', 'ref', 'will'], d20: ['attack', 'fort', 'ref', 'will', 'skills', 'checks'] };
  return out.flatMap(x => (spread[x.target] ? spread[x.target].map(t => ({ ...x, target: t })) : [x]));
}

// Total of a list of bonuses to one thing, by the stacking rules.
// Each bonus marked with whether it counts: penalties and dodge, circumstance and untyped bonuses always do; of the
// other bonuses of one type only the highest counts (the first of equal ones). Adds up to stackTotal.
export function countedBonuses(bonuses) {
  const best = new Map();
  bonuses.forEach((x, i) => {
    if (x.value >= 0 && !STACKS.has(x.type) && (!best.has(x.type) || x.value > bonuses[best.get(x.type)].value)) best.set(x.type, i);
  });
  return bonuses.map((x, i) => ({ ...x, counts: x.value < 0 || STACKS.has(x.type) || best.get(x.type) === i }));
}

export function stackTotal(bonuses) {
  let total = 0;
  const best = new Map();
  for (const x of bonuses) {
    if (x.value < 0 || STACKS.has(x.type)) total += x.value;
    else best.set(x.type, Math.max(best.get(x.type) || 0, x.value));
  }
  for (const v of best.values()) total += v;
  return total;
}

// What the effects add up to: { str..., attack, damage, fort, ref, will, init, speed, skills, cmb, cmd, hp, size,
// ac: { [type]: total } } (AC is kept by type, since armor, shield and natural armor bonuses compete with worn armor and
// racial natural armor, and touch / flat-footed AC leave some types out). `size` is the size change in steps.
export function effectTotals(buffs = [], custom = []) {
  const all = activeBonuses(buffs, custom);
  const totals = { ac: {} };
  for (const [t] of TARGETS) {
    if (t === 'saves' || t === 'ac' || t === 'd20') continue;
    totals[t] = stackTotal(all.filter(x => x.target === t));
  }
  for (const type of new Set(all.filter(x => x.target === 'ac').map(x => x.type))) {
    totals.ac[type] = stackTotal(all.filter(x => x.target === 'ac' && x.type === type));
  }
  totals.size = buffs.reduce((n, x) => n + (buffById.get(x.id)?.size || 0), 0);
  return totals;
}

const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];

// A size moved by some steps ("Medium", 1 -> "Large").
export function shiftSize(size, steps) {
  const i = SIZES.indexOf(size);
  if (i < 0 || !steps) return size;
  return SIZES[Math.max(0, Math.min(SIZES.length - 1, i + steps))];
}

// Armor Class with effects: the AC parts characterStats works out plus the effects' AC by type.
// Armor (mage armor) and shield (the shield spell) bonuses don't stack with worn armor's / shield's: the higher counts.
// A natural armor bonus competes with racial natural armor; an enhancement to natural armor (barkskin) adds to it.
// Touch AC leaves out armor, shield and natural armor; flat-footed leaves out Dex and dodge bonuses.
export function acWithEffects({ base = 10, armor = 0, shield = 0, natural = 0, dex = 0, dodge = 0, other = 0 }, acFx = {}) {
  const armorPart = Math.max(armor, acFx.armor || 0);
  const shieldPart = Math.max(shield, acFx.shield || 0);
  // (A creature with no natural armor counts as having +0, so barkskin still adds its bonus.)
  const naturalPart = Math.max(natural, acFx['natural armor'] || 0) + (acFx['natural armor enhancement'] || 0);
  const dodgePart = dodge + (acFx.dodge || 0);
  const rest = Object.entries(acFx).filter(([t]) => !['armor', 'shield', 'natural armor', 'natural armor enhancement', 'dodge'].includes(t))
    .reduce((n, [, v]) => n + v, 0);
  const ac = base + armorPart + shieldPart + naturalPart + dex + dodgePart + other + rest;
  return {
    ac,
    touch: ac - armorPart - shieldPart - naturalPart,
    flatFooted: ac - Math.max(0, dex) - Math.max(0, dodgePart),
    armorPart, shieldPart, naturalPart,
  };
}

// One line per bonus that counts, for the card and the sheet: "Strength +4 (enhancement, bull's strength)".
export function describeBonuses(buffs = [], custom = []) {
  return activeBonuses(buffs, custom).map(x => `${TARGET_NAMES[x.target]} ${x.value > 0 ? '+' : ''}${x.value} (${x.type}, ${x.source})`);
}
