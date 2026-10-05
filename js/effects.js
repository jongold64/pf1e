// Active effects: spells and other buffs on the character, and custom bonuses the player types in. No page code
// here, so it can be tested on its own.
//
// An effect is a list of bonuses: { target, type, value }. Targets: the six abilities (str...cha), 'ac', 'attack',
// 'damage', 'melee-attack' and 'melee-damage' (melee weapons only), 'fort', 'ref', 'will', 'saves' (all three), 'init',
// 'speed', 'skills', 'cmb', 'cmd', 'hp'.
// Stacking (Core Rulebook, Combining Magical Effects): bonuses of the same type don't stack (the highest counts),
// except dodge, circumstance and untyped bonuses; penalties all add up.

export const BONUS_TYPES = ['alchemical', 'armor', 'circumstance', 'competence', 'deflection', 'dodge', 'enhancement',
  'insight', 'luck', 'morale', 'natural armor', 'natural armor enhancement', 'profane', 'resistance', 'sacred', 'shield',
  'size', 'untyped'];
const STACKS = new Set(['dodge', 'circumstance', 'untyped']);

export const TARGETS = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'],
  ['wis', 'Wisdom'], ['cha', 'Charisma'], ['ac', 'Armor Class'], ['attack', 'Attack rolls'], ['damage', 'Damage rolls'],
  ['melee-attack', 'Melee attack rolls'], ['melee-damage', 'Melee damage rolls'], ['ranged-attack', 'Ranged attack rolls'],
  ['saves', 'All saves'], ['fort', 'Fortitude'], ['ref', 'Reflex'], ['will', 'Will'], ['init', 'Initiative'],
  ['speed', 'Speed (ft.)'], ['skills', 'Skill checks'], ['checks', 'Ability checks'], ['cmb', 'CMB'], ['cmd', 'CMD'], ['hp', 'Hit points'],
  ['d20', 'All d20 rolls (attacks, saves, skills, ability checks)']];
export const TARGET_NAMES = Object.fromEntries(TARGETS);

const per = (cl, every, max, start = 1) => Math.min(max, Math.max(start, Math.floor(cl / every)));
const b = (target, type, value) => ({ target, type, value });

// Common buffs. `bonuses(cl)` gives the bonuses for a caster level; `scales` = they depend on it; `size` = changes
// size by that many steps; `note` = what isn't counted (extra attacks, conditional bonuses...).
// `group`: which list it's in (EFFECT_GROUPS; spells when not given). `levels`: the amounts to choose from instead of a
// caster level (a belt's +2/+4/+6, negative levels 1-10), with `levelName` saying what they are. `flags`: 'noDexAc'
// (you lose your Dex bonus and dodge bonuses to AC: flat-footed, stunned...) and 'halfSpeed' (entangled, exhausted).
export const EFFECT_GROUPS = [
  ['spell', 'Spell adjustments', 'Spells cast on you.'],
  ['ability', 'Conferred abilities', 'Class abilities you or an ally switch on (rage, bardic performances...).'],
  ['item', 'Other adjustments', 'Worn items that give bonuses, with the bonus they give.'],
  ['circumstance', 'Circumstances', 'Help from others and the situation.'],
  ['combat', 'Combat conditions', 'Positions and actions in a fight.'],
  ['condition', 'Conditions', 'Conditions from the Core Rulebook that change your numbers.'],
];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const item = (id, name, target, type, levels, extra = {}) => ({ id, name, group: 'item', levels, levelName: 'bonus', bonuses: n => [b(target, type, n)], ...extra });
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
  // Class rages (their level is the class level). Barbarian and bloodrager: +4 morale Str and Con, +2 Will (greater
  // rage at 11th: +6/+3; mighty rage at 20th: +8/+4). Unchained barbarian: +2 morale on melee attack and damage rolls
  // and Will saves (+3 at 11th, +4 at 20th) and temporary hit points instead. Skald's inspired rage: +2 Str and Con,
  // +1 Will (+4/+2 at 8th, +6/+3 at 16th), -1 AC.
  { id: 'barbarian-rage', name: 'Rage (barbarian, bloodrager)', scales: true, levelName: 'barbarian level',
    bonuses: l => { const t = l >= 20 ? 8 : l >= 11 ? 6 : 4; return [b('str', 'morale', t), b('con', 'morale', t), b('will', 'morale', t / 2), b('ac', 'untyped', -2)]; },
    note: 'the extra Con hit points are counted; while raging you can\u2019t use Cha, Dex or Int skills except Acrobatics, Fly, Intimidate and Ride, or concentrate' },
  { id: 'unchained-rage', name: 'Rage (unchained barbarian)', scales: true, levelName: 'barbarian level',
    bonuses: l => { const t = l >= 20 ? 4 : l >= 11 ? 3 : 2; return [b('melee-attack', 'morale', t), b('melee-damage', 'morale', t), b('will', 'morale', t), b('ac', 'untyped', -2)]; },
    note: 'also on thrown weapon damage; 2 temporary hit points per Hit Die (3 from 11th, 4 at 20th): add them with Xtra-HP on the Character tab' },
  { id: 'inspired-rage', name: 'Inspired rage (skald)', scales: true, levelName: 'skald level',
    bonuses: l => { const t = l >= 16 ? 6 : l >= 8 ? 4 : 2; return [b('str', 'morale', t), b('con', 'morale', t), b('will', 'morale', t / 2), b('ac', 'untyped', -1)]; },
    note: 'the skald\u2019s allies who accept it get it too; raging allies can\u2019t use Cha, Dex or Int skills except Acrobatics, Fly, Intimidate and Ride' },
  { id: 'rage', name: 'Rage (spell)', bonuses: () => [b('str', 'morale', 2), b('con', 'morale', 2), b('will', 'morale', 1), b('ac', 'untyped', -2)] },
  { id: 'reduce-person', name: 'Reduce person', size: -1, bonuses: () => [b('str', 'size', -2), b('dex', 'size', 2)],
    note: 'reach may shrink (the size change itself is counted: +1 attack and AC, -1 CMB and CMD, smaller weapon damage)' },
  { id: 'resistance', name: 'Resistance', bonuses: () => [b('saves', 'resistance', 1)] },
  { id: 'shield', name: 'Shield', bonuses: () => [b('ac', 'shield', 4)], note: 'immune to magic missile' },
  { id: 'shield-of-faith', name: 'Shield of faith', scales: true, bonuses: cl => [b('ac', 'deflection', Math.min(5, 2 + Math.floor(cl / 6)))] },
  { id: 'magic-vestment', name: 'Magic vestment', scales: true, bonuses: cl => [b('ac', 'enhancement', per(cl, 4, 5))],
    note: 'an enhancement bonus to your armor or shield (it doesn\u2019t add to the item\u2019s own enhancement bonus: the higher counts)' },
  { id: 'magic-weapon', name: 'Magic weapon', bonuses: () => [b('attack', 'enhancement', 1), b('damage', 'enhancement', 1)],
    note: 'on one weapon; doesn\u2019t add to its own enhancement bonus' },
  { id: 'greater-magic-weapon', name: 'Greater magic weapon', scales: true, bonuses: cl => [b('attack', 'enhancement', per(cl, 4, 5)), b('damage', 'enhancement', per(cl, 4, 5))],
    note: 'on one weapon; doesn\u2019t add to its own enhancement bonus' },
  { id: 'true-strike', name: 'True strike', bonuses: () => [b('attack', 'insight', 20)], note: 'your next single attack only; no miss chance from concealment' },
  { id: 'guidance', name: 'Guidance', bonuses: () => [b('d20', 'competence', 1)], note: 'one attack roll, saving throw or skill check' },
  { id: 'invisibility', name: 'Invisibility', bonuses: () => [b('attack', 'untyped', 2)], note: 'the +2 is against foes who can\u2019t see you, and they lose their Dex bonus to AC' },
  { id: 'stoneskin', name: 'Stoneskin', bonuses: () => [], note: 'DR 10/adamantine (until it has stopped 10 per caster level, max 150)' },
  { id: 'blur', name: 'Blur', bonuses: () => [], note: 'attacks against you have a 20% miss chance (concealment)' },
  { id: 'displacement', name: 'Displacement', bonuses: () => [], note: 'attacks against you have a 50% miss chance (total concealment)' },
  { id: 'bless-weapon', name: 'Align weapon / bless weapon', bonuses: () => [], note: 'the weapon overcomes alignment damage reduction' },

  // Conferred abilities: class abilities (their level is the class level).
  { id: 'inspire-competence', name: 'Inspire competence (bard)', group: 'ability', scales: true, levelName: 'bard level',
    bonuses: l => [b('skills', 'competence', 2 + Math.max(0, Math.floor((l - 3) / 4)))], note: 'on one skill the bard chooses (all skills here)' },
  { id: 'inspire-greatness', name: 'Inspire greatness (bard)', group: 'ability', bonuses: () => [b('attack', 'competence', 2), b('fort', 'competence', 1)],
    note: '2 bonus Hit Dice (d10s) of temporary hit points: add them with Xtra-HP' },
  { id: 'inspire-heroics', name: 'Inspire heroics (bard)', group: 'ability', bonuses: () => [b('saves', 'morale', 4), b('ac', 'dodge', 4)] },
  { id: 'defensive-stance', name: 'Defensive stance (stalwart defender)', group: 'ability',
    bonuses: () => [b('str', 'morale', 4), b('con', 'morale', 4), b('will', 'morale', 2), b('ac', 'dodge', 2)], note: 'you can\u2019t move from your spot' },
  { id: 'studied-target', name: 'Studied target (slayer)', group: 'ability', scales: true, levelName: 'slayer level',
    bonuses: l => [b('attack', 'untyped', 1 + Math.floor(l / 5)), b('damage', 'untyped', 1 + Math.floor(l / 5))],
    note: 'only against the studied target (also on Bluff, Knowledge, Perception, Sense Motive and Survival checks against it)' },
  { id: 'favored-enemy', name: 'Favored enemy (ranger)', group: 'ability', levels: [2, 4, 6, 8, 10], levelName: 'bonus',
    bonuses: n => [b('attack', 'untyped', n), b('damage', 'untyped', n)], note: 'only against that kind of creature (also on its skill checks)' },
  { id: 'challenge', name: 'Challenge (cavalier)', group: 'ability', scales: true, levelName: 'cavalier level',
    bonuses: l => [b('melee-damage', 'untyped', l)], note: 'melee damage only against the challenged foe; −2 AC against other foes' },

  // Other adjustments: worn items.
  item('belt-str', 'Belt of giant strength', 'str', 'enhancement', [2, 4, 6]),
  item('belt-dex', 'Belt of incredible dexterity', 'dex', 'enhancement', [2, 4, 6]),
  item('belt-con', 'Belt of mighty constitution', 'con', 'enhancement', [2, 4, 6]),
  item('headband-int', 'Headband of vast intelligence', 'int', 'enhancement', [2, 4, 6]),
  item('headband-wis', 'Headband of inspired wisdom', 'wis', 'enhancement', [2, 4, 6]),
  item('headband-cha', 'Headband of alluring charisma', 'cha', 'enhancement', [2, 4, 6]),
  item('ring-of-protection', 'Ring of protection', 'ac', 'deflection', range(1, 5)),
  item('amulet-of-natural-armor', 'Amulet of natural armor', 'ac', 'natural armor enhancement', range(1, 5)),
  item('cloak-of-resistance', 'Cloak of resistance', 'saves', 'resistance', range(1, 5)),
  item('bracers-of-armor', 'Bracers of armor', 'ac', 'armor', range(1, 8), { note: 'an armor bonus: it doesn\u2019t add to worn armor\u2019s (the higher counts)' }),
  item('boots-of-striding', 'Boots of striding and springing', 'speed', 'enhancement', [10], { levelName: 'feet', note: '+5 competence on Acrobatics checks to jump' }),

  // Circumstances.
  { id: 'aid-attack', name: 'Aid another: attack', group: 'circumstance', bonuses: () => [b('attack', 'circumstance', 2)], note: 'your next attack against that foe' },
  { id: 'aid-ac', name: 'Aid another: AC', group: 'circumstance', bonuses: () => [b('ac', 'circumstance', 2)], note: 'against that foe\u2019s next attack' },
  { id: 'aid-skill', name: 'Aid another: skill', group: 'circumstance', bonuses: () => [b('skills', 'circumstance', 2)], note: 'on the skill check an ally helps with' },
  { id: 'favorable', name: 'Favorable conditions', group: 'circumstance', bonuses: () => [b('skills', 'circumstance', 2)], note: 'good tools or a situation that helps the check' },
  { id: 'unfavorable', name: 'Unfavorable conditions', group: 'circumstance', bonuses: () => [b('skills', 'circumstance', -2)], note: 'improvised tools or a situation that hinders the check' },
  { id: 'higher-ground', name: 'Higher ground', group: 'circumstance', bonuses: () => [b('melee-attack', 'untyped', 1)] },

  // Combat conditions.
  { id: 'flanking', name: 'Flanking', group: 'combat', bonuses: () => [b('melee-attack', 'untyped', 2)], note: 'with an ally on the opposite side of the foe' },
  { id: 'charging', name: 'Charging', group: 'combat', bonuses: () => [b('melee-attack', 'untyped', 2), b('ac', 'untyped', -2)], note: 'until your next turn' },
  { id: 'fighting-defensively', name: 'Fighting defensively', group: 'combat', bonuses: () => [b('attack', 'untyped', -4), b('ac', 'dodge', 2)],
    note: '+3 dodge instead with 3 or more ranks in Acrobatics' },
  { id: 'total-defense', name: 'Total defense', group: 'combat', bonuses: () => [b('ac', 'dodge', 4)], note: 'you can\u2019t attack (+6 with 3 ranks in Acrobatics)' },
  { id: 'partial-cover', name: 'Partial cover', group: 'combat', bonuses: () => [b('ac', 'untyped', 2), b('ref', 'untyped', 1)] },
  { id: 'cover', name: 'Cover', group: 'combat', bonuses: () => [b('ac', 'untyped', 4), b('ref', 'untyped', 2)], note: 'foes can\u2019t make attacks of opportunity against you' },
  { id: 'improved-cover', name: 'Improved cover', group: 'combat', bonuses: () => [b('ac', 'untyped', 8), b('ref', 'untyped', 4)] },
  { id: 'shooting-into-melee', name: 'Shooting into melee', group: 'combat', bonuses: () => [b('ranged-attack', 'untyped', -4)], note: 'Precise Shot removes it' },
  { id: 'squeezing', name: 'Squeezing', group: 'combat', bonuses: () => [b('attack', 'untyped', -4), b('ac', 'untyped', -4)] },

  // Conditions (Core Rulebook, Appendix 2).
  { id: 'blinded', name: 'Blinded', group: 'condition', flags: ['noDexAc'], bonuses: () => [b('ac', 'untyped', -2)],
    note: '−4 on most Str and Dex skills and opposed Perception; 50% miss chance on your attacks; half speed when moving' },
  { id: 'cowering', name: 'Cowering', group: 'condition', flags: ['noDexAc'], bonuses: () => [b('ac', 'untyped', -2)], note: 'you can take no actions' },
  { id: 'dazzled', name: 'Dazzled', group: 'condition', bonuses: () => [b('attack', 'untyped', -1)], note: '−1 on sight-based Perception checks' },
  { id: 'deafened', name: 'Deafened', group: 'condition', bonuses: () => [b('init', 'untyped', -4)], note: '−4 on opposed Perception; 20% chance to fail verbal spells' },
  { id: 'energy-drained', name: 'Energy drained (negative levels)', group: 'condition', levels: range(1, 10), levelName: 'negative levels',
    bonuses: n => [b('d20', 'untyped', -n), b('cmb', 'untyped', -n), b('cmd', 'untyped', -n), b('hp', 'untyped', -5 * n)],
    note: 'also −1 effective level per negative level for level-based effects and caster level' },
  { id: 'entangled', name: 'Entangled', group: 'condition', flags: ['halfSpeed'], bonuses: () => [b('attack', 'untyped', -2), b('dex', 'untyped', -4)],
    note: 'concentration to cast (DC 15 + spell level)' },
  { id: 'exhausted', name: 'Exhausted', group: 'condition', flags: ['halfSpeed'], bonuses: () => [b('str', 'untyped', -6), b('dex', 'untyped', -6)],
    note: 'you can\u2019t run or charge' },
  { id: 'fatigued', name: 'Fatigued', group: 'condition', bonuses: () => [b('str', 'untyped', -2), b('dex', 'untyped', -2)], note: 'you can\u2019t run or charge' },
  { id: 'flat-footed', name: 'Flat-footed', group: 'condition', flags: ['noDexAc'], bonuses: () => [], note: 'you can\u2019t make attacks of opportunity' },
  { id: 'frightened', name: 'Frightened', group: 'condition', bonuses: () => [b('d20', 'untyped', -2)], note: 'you flee from the source of your fear' },
  { id: 'grappled', name: 'Grappled', group: 'condition', bonuses: () => [b('attack', 'untyped', -2), b('dex', 'untyped', -4), b('cmb', 'untyped', -2)],
    note: 'you can\u2019t move; the −2 CMB isn\u2019t for checks to escape or to grapple back; concentration to cast' },
  { id: 'helpless', name: 'Helpless', group: 'condition', flags: ['noDexAc'], bonuses: () => [], note: 'your Dex counts as 0 (−5 to AC); foes can coup de grace you' },
  { id: 'invisible-you', name: 'Invisible', group: 'condition', bonuses: () => [b('attack', 'untyped', 2)], note: 'the +2 is against foes who can\u2019t see you, and they lose their Dex bonus to AC' },
  { id: 'panicked', name: 'Panicked', group: 'condition', bonuses: () => [b('d20', 'untyped', -2)], note: 'you drop what you hold and flee' },
  { id: 'pinned', name: 'Pinned', group: 'condition', flags: ['noDexAc'], bonuses: () => [b('ac', 'untyped', -4)], note: 'you can only try to escape (or take verbal and mental actions)' },
  { id: 'prone', name: 'Prone', group: 'condition', bonuses: () => [b('melee-attack', 'untyped', -4)],
    note: '−4 AC against melee attacks and +4 against ranged ones; you can\u2019t use most ranged weapons' },
  { id: 'shaken', name: 'Shaken', group: 'condition', bonuses: () => [b('d20', 'untyped', -2)] },
  { id: 'sickened', name: 'Sickened', group: 'condition', bonuses: () => [b('d20', 'untyped', -2), b('damage', 'untyped', -2)] },
  { id: 'stunned', name: 'Stunned', group: 'condition', flags: ['noDexAc'], bonuses: () => [b('ac', 'untyped', -2)], note: 'you drop what you hold and can take no actions' },
  { id: 'staggered', name: 'Staggered', group: 'condition', bonuses: () => [], note: 'one move or standard action a turn' },
  { id: 'nauseated', name: 'Nauseated', group: 'condition', bonuses: () => [], note: 'only a single move action a turn; no attacks, spells or concentration' },
  { id: 'dazed', name: 'Dazed', group: 'condition', bonuses: () => [], note: 'you can take no actions (no AC penalty)' },
];
// Class rages and inspire courage are conferred abilities too.
for (const id of ['barbarian-rage', 'unchained-rage', 'inspired-rage', 'inspire-courage']) BUFFS.find(x => x.id === id).group = 'ability';
// A chosen amount that isn't one of the buff's amounts (or none yet) counts as its first.
export const buffAmount = (buff, cl) => (buff.levels ? (buff.levels.includes(cl) ? cl : buff.levels[0]) : cl);
export const buffById = new Map(BUFFS.map(x => [x.id, x]));

// Every bonus from the buffs that are on ([{ id, cl }]) and custom effects ([{ name, target, type, value, on }]),
// each with its source's name.
export function activeBonuses(buffs = [], custom = []) {
  const out = [];
  for (const { id, cl } of buffs) {
    const buff = buffById.get(id);
    if (!buff) continue;
    for (const x of buff.bonuses(buffAmount(buff, Math.max(1, Number(cl) || 1)))) out.push({ ...x, source: buff.name });
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
  // Melee-only bonuses stack with the ones on every attack by the usual rules (a morale bonus on melee attacks and
  // one on all attacks don't add up): what melee gets on top of the all-attack total.
  for (const [melee, any] of [['melee-attack', 'attack'], ['melee-damage', 'damage'], ['ranged-attack', 'attack']]) {
    totals[melee] = stackTotal(all.filter(x => x.target === any || x.target === melee)) - totals[any];
  }
  for (const type of new Set(all.filter(x => x.target === 'ac').map(x => x.type))) {
    totals.ac[type] = stackTotal(all.filter(x => x.target === 'ac' && x.type === type));
  }
  totals.size = buffs.reduce((n, x) => n + (buffById.get(x.id)?.size || 0), 0);
  // Conditions that take away your Dex bonus to AC, or halve your speed.
  totals.flags = [...new Set(buffs.flatMap(x => buffById.get(x.id)?.flags || []))];
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
