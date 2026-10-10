// Class features that change the character's numbers all the time (Core Rulebook, Advanced Player's Guide, Advanced
// Class Guide, Ultimate Combat, Pathfinder Unchained), worked out from the class levels. No page code here.
//
// - classFeatureEffects: bonuses fed into the active effects (so they follow the stacking rules and show in every
//   Details): divine grace, bardic knowledge, nature sense, stern gaze, cunning initiative, trapfinding, nimble,
//   the brawler's AC bonus, the shifter's defensive instinct.
// - armorTrainingStage, uncannyDodge, classDamageReduction, weaponTraining: the fighter's armor and weapon training,
//   keeping Dex when flat-footed, class damage reduction, swashbuckler weapon training.
// - situationalBonuses: the ones that only apply in some situations (bravery against fear, trap sense, evasion...),
//   shown as notes in the Details of the save, AC or skill they touch.

const half = lv => Math.max(1, Math.floor(lv / 2));
// The class levels a feature counts: the highest of the classes listed (the same feature from two classes doesn't
// add up, except where a class says its levels stack).
const levelOf = (counts, ids) => Math.max(0, ...counts.filter(e => ids.includes(e.cls.id)).map(e => e.level));
const nameOf = (counts, ids) => counts.filter(e => ids.includes(e.cls.id)).sort((a, b) => b.level - a.level)[0]?.cls.name || '';
const KNOWLEDGE = ['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility', 'planes', 'religion']
  .map(k => `skill:Knowledge (${k})`);

// gear: { armorCategory (for movement: mithral counts one lighter), shield (bool) }; load: 'light' | 'medium' | 'heavy';
// mod: ability modifiers (with effects). Returns effects as custom effects: [{ name, target, type, value, more, on }].
export function classFeatureEffects(counts, { mod = {}, armorCategory = null, shield = false, load = 'light' } = {}) {
  const out = [];
  const add = (name, parts) => {
    const [first, ...more] = parts.filter(p => p.value);
    if (first) out.push({ name, ...first, ...(more.length ? { more } : {}), on: true, classFeature: true });
  };
  const lightOrNone = !armorCategory || armorCategory === 'light';

  // Divine grace (paladin) / unholy resilience (antipaladin), 2nd level: Charisma bonus on all saves.
  const grace = levelOf(counts, ['paladin', 'antipaladin']);
  if (grace >= 2 && mod.cha > 0) {
    add(`${nameOf(counts, ['paladin', 'antipaladin']) === 'Antipaladin' ? 'Unholy resilience' : 'Divine grace'}`, [{ target: 'saves', type: 'untyped', value: mod.cha }]);
  }
  // Bardic knowledge (bard, skald; a Pathfinder chronicler's levels stack with a bard's): half the level (at least 1)
  // on every Knowledge check.
  const bardic = Math.max(levelOf(counts, ['bard']) + levelOf(counts, ['pathfinder-chronicler']), levelOf(counts, ['skald']));
  if (bardic) add('Bardic knowledge', KNOWLEDGE.map(target => ({ target, type: 'untyped', value: half(bardic) })));
  // Nature sense (druid): +2 Knowledge (nature) and Survival.
  if (levelOf(counts, ['druid'])) add('Nature sense', [{ target: 'skill:Knowledge (nature)', type: 'untyped', value: 2 }, { target: 'skill:Survival', type: 'untyped', value: 2 }]);
  // Inquisitor: stern gaze (half the level, at least 1, on Intimidate and Sense Motive); cunning initiative (2nd: Wis
  // modifier on initiative).
  const inq = levelOf(counts, ['inquisitor']);
  if (inq) add('Stern gaze', [{ target: 'skill:Intimidate', type: 'untyped', value: half(inq) }, { target: 'skill:Sense Motive', type: 'untyped', value: half(inq) }]);
  if (inq >= 2 && mod.wis) add('Cunning initiative', [{ target: 'init', type: 'untyped', value: mod.wis }]);
  // Trapfinding (rogue, unchained rogue, investigator): half the level (at least 1) on Disable Device.
  const trap = levelOf(counts, ['rogue', 'rogue-unchained', 'investigator']);
  if (trap) add('Trapfinding', [{ target: 'skill:Disable Device', type: 'untyped', value: half(trap) }]);
  // Nimble: +1 dodge bonus to AC in light or no armor (gunslinger from 2nd, swashbuckler from 3rd), +1 every 4 levels.
  const gun = levelOf(counts, ['gunslinger']);
  const swash = levelOf(counts, ['swashbuckler']);
  const nimble = Math.max(gun >= 2 ? Math.min(5, 1 + Math.floor((gun - 2) / 4)) : 0, swash >= 3 ? Math.min(5, 1 + Math.floor((swash - 3) / 4)) : 0);
  if (nimble && lightOrNone) add('Nimble', [{ target: 'ac', type: 'dodge', value: nimble }]);
  // Brawler's AC bonus (4th): +1 dodge to AC and CMD in light or no armor, no shield, light load; +1 at 9th, 13th, 18th.
  const brawler = levelOf(counts, ['brawler']);
  const brawlerAc = [4, 9, 13, 18].filter(l => brawler >= l).length;
  if (brawlerAc && lightOrNone && !shield && load === 'light') {
    add('AC bonus (brawler)', [{ target: 'ac', type: 'dodge', value: brawlerAc }, { target: 'cmd', type: 'dodge', value: brawlerAc }]);
  }
  // Defensive instinct (shifter, 2nd): unarmored, no shield, unencumbered: Wis bonus to AC and CMD, +1 at 4th and every
  // 4 levels after (at most +5). It counts against touch attacks and when flat-footed.
  const shifter = levelOf(counts, ['shifter']);
  if (shifter >= 2 && !armorCategory && !shield && load === 'light') {
    const v = Math.max(0, mod.wis || 0) + (shifter >= 4 ? Math.min(5, 1 + Math.floor((shifter - 4) / 4)) : 0);
    add('Defensive instinct', [{ target: 'ac', type: 'untyped', value: v }, { target: 'cmd', type: 'untyped', value: v }]);
  }
  // Duelist: improved reaction (2nd: +2 initiative, 8th: +4); in light or no armor and no shield, canny defense (Int bonus
  // up to the duelist level as a dodge bonus to AC, wielding a melee weapon) and grace (4th: +2 competence on Reflex).
  const duelist = levelOf(counts, ['duelist']);
  if (duelist >= 2) add('Improved reaction (duelist)', [{ target: 'init', type: 'untyped', value: duelist >= 8 ? 4 : 2 }]);
  if (duelist && lightOrNone && !shield) {
    if (mod.int > 0) add('Canny defense (duelist, with a melee weapon)', [{ target: 'ac', type: 'dodge', value: Math.min(mod.int, duelist) }]);
    if (duelist >= 4) add('Grace (duelist)', [{ target: 'ref', type: 'competence', value: 2 }]);
  }
  // Mesmerist: consummate liar (half the level, at least 1, on Bluff); towering ego (2nd: Charisma bonus on Will saves).
  const mes = levelOf(counts, ['mesmerist']);
  if (mes) add('Consummate liar (mesmerist)', [{ target: 'skill:Bluff', type: 'untyped', value: half(mes) }]);
  if (mes >= 2 && mod.cha > 0) add('Towering ego (mesmerist)', [{ target: 'will', type: 'untyped', value: mod.cha }]);
  // Stalwart defender AC bonus: +1 dodge, +2 at 4th, +3 at 7th, +4 at 10th.
  const stal = levelOf(counts, ['stalwart-defender']);
  if (stal) add('AC bonus (stalwart defender)', [{ target: 'ac', type: 'dodge', value: 1 + Math.floor((stal - 1) / 3) }]);
  // Loremaster lore (2nd): half the level on every Knowledge check (stacks with bardic knowledge).
  const lore = levelOf(counts, ['loremaster']);
  if (lore >= 2) add('Lore (loremaster)', KNOWLEDGE.map(target => ({ target, type: 'untyped', value: Math.floor(lore / 2) })));
  // Ninja no trace (3rd): +1 insight on Disguise, +1 every 3 levels (also opposed Stealth while stationary: not counted).
  const ninja = levelOf(counts, ['ninja']);
  if (ninja >= 3) add('No trace (ninja)', [{ target: 'skill:Disguise', type: 'insight', value: Math.floor(ninja / 3) }]);
  return out;
}

// Armor training (fighter, 3rd): 1, +1 at 7th, 11th and 15th (at most 4). Each step: armor check penalty 1 less and
// max Dex 1 more; from the 1st step medium armor doesn't slow, from the 2nd heavy armor doesn't.
export function armorTrainingStage(counts) {
  const f = levelOf(counts, ['fighter']);
  return f >= 3 ? Math.min(4, 1 + Math.floor((f - 3) / 4)) : 0;
}

// Uncanny dodge: keeps the Dex bonus to AC when flat-footed. The class and level each class gets it.
const UNCANNY = { barbarian: 2, 'barbarian-unchained': 2, bloodrager: 2, rogue: 4, 'rogue-unchained': 4, skald: 4, ninja: 4,
                  assassin: 2, shadowdancer: 2, 'stalwart-defender': 3 };
export function uncannyDodge(counts) {
  const e = counts.find(x => UNCANNY[x.cls.id] && x.level >= UNCANNY[x.cls.id]);
  return e ? e.cls.name : null;
}

// Damage reduction from class levels: [{ value, against, source }]. Different sources don't stack (the highest
// counts), except as a class says.
export function classDamageReduction(counts, { armor = null, shield = null } = {}) {
  const out = [];
  for (const e of counts) {
    const lv = e.level;
    if (['barbarian', 'barbarian-unchained', 'bloodrager'].includes(e.cls.id) && lv >= 7) {
      out.push({ value: Math.min(5, 1 + Math.floor((lv - 7) / 3)), against: '—', source: e.cls.name });
    }
    if (e.cls.id === 'stalwart-defender' && lv >= 5) out.push({ value: lv >= 10 ? 5 : lv >= 7 ? 3 : 1, against: '—', source: e.cls.name });
    if (e.cls.id === 'fighter' && lv >= 19 && (armor || shield)) out.push({ value: 5, against: '—', source: 'Armor mastery (fighter)' });
    if (['monk', 'monk-unchained'].includes(e.cls.id) && lv >= 20) out.push({ value: 10, against: 'chaotic', source: 'Perfect self (monk)' });
  }
  return out;
}

// Weapon training on one weapon: [{ label, value }] for attack and damage rolls.
// - Fighter: one weapon group at 5th, 9th, 13th and 17th (picks in that order); the latest gives +1 and each earlier one
//   1 more. A weapon in several trained groups uses the best.
// - Swashbuckler (5th): +1 with light or one-handed piercing melee weapons, +1 every 4 levels (at most +4).
export function weaponTraining(counts, weapon, fighterGroups = []) {
  const out = [];
  const f = levelOf(counts, ['fighter']);
  const steps = [5, 9, 13, 17].filter(l => f >= l).length;
  const groups = (weapon.groups || []).map(g => g.toLowerCase());
  const best = fighterGroups.slice(0, steps).map((g, i) => ({ g, bonus: steps - i })).filter(x => x.g && groups.includes(x.g.toLowerCase()))
    .sort((a, b) => b.bonus - a.bonus)[0];
  if (best) out.push({ label: `Weapon training (${best.g})`, value: best.bonus });
  const swash = levelOf(counts, ['swashbuckler']);
  if (swash >= 5 && ['light', 'one-handed'].includes(weapon.group) && /P/.test(weapon.type || '')) {
    out.push({ label: 'Swashbuckler weapon training', value: Math.min(4, 1 + Math.floor((swash - 5) / 4)) });
  }
  return out;
}

// Bonuses that only apply in some situations, as notes: { fort, ref, will, ac, skills: { name: [text] } }.
export function situationalBonuses(counts) {
  const n = { fort: [], ref: [], will: [], ac: [], skills: {} };
  const all = (text) => { n.fort.push(text); n.ref.push(text); n.will.push(text); };
  const skill = (name, text) => (n.skills[name] ??= []).push(text);
  const lv = ids => levelOf(counts, ids);
  const fighter = lv(['fighter']);
  if (fighter >= 2) n.will.push(`Bravery (fighter): +${1 + Math.floor((fighter - 2) / 4)} on Will saves against fear.`);
  const trapSense = lv(['barbarian', 'rogue', 'investigator']);
  if (trapSense >= 3) {
    n.ref.push(`Trap sense: +${Math.floor(trapSense / 3)} on Reflex saves against traps.`);
    n.ac.push(`Trap sense: +${Math.floor(trapSense / 3)} dodge bonus to AC against traps.`);
  }
  const danger = lv(['barbarian-unchained', 'rogue-unchained']);
  if (danger >= 3) {
    n.ref.push(`Danger sense: +${Math.min(6, Math.floor(danger / 3))} on Reflex saves against traps.`);
    n.ac.push(`Danger sense: +${Math.min(6, Math.floor(danger / 3))} dodge bonus to AC against traps.`);
    skill('Perception', `Danger sense: +${Math.min(6, Math.floor(danger / 3))} to avoid being surprised.`);
  }
  const evasion = counts.find(e => ({ monk: 2, 'monk-unchained': 2, rogue: 2, 'rogue-unchained': 2, ranger: 9, shadowdancer: 2 })[e.cls.id] <= e.level);
  if (evasion) n.ref.push('Evasion: no damage on a successful Reflex save against an effect that deals half damage on a save.');
  const monk = counts.find(e => e.cls.id === 'monk' && e.level >= 3) || counts.find(e => e.cls.id === 'monk-unchained' && e.level >= 4);
  if (monk) all('Still mind (monk): +2 on saves against enchantment spells and effects.');
  const poison = Math.max(lv(['alchemist']) >= 10 ? 99 : 0, lv(['investigator']) >= 11 ? 99 : 0, lv(['alchemist', 'investigator']));
  if (poison >= 99) n.fort.push('Poison resistance: immune to poison.');
  else if (poison >= 2) n.fort.push(`Poison resistance: +${2 * [2, 5, 8].filter(l => poison >= l).length} on saves against poison.`);
  if (lv(['bard']) >= 2 || lv(['skald']) >= 2) all('Well-versed: +4 on saves against bardic performance, sonic and language-dependent effects.');
  if (lv(['druid']) >= 4) all('Resist nature’s lure (druid): +4 on saves against fey spell-like and supernatural abilities and plant-targeted effects.');
  if (lv(['paladin']) >= 3) all('Aura of courage and divine health (paladin): immune to fear and to disease.');
  const trap = lv(['rogue', 'rogue-unchained', 'investigator']);
  if (trap) skill('Perception', `Trapfinding: +${half(trap)} to find traps.`);
  const tracker = lv(['ranger', 'inquisitor', 'hunter', 'slayer', 'shifter']);
  if (tracker) skill('Survival', `Track: +${half(tracker)} to follow tracks.`);
  return n;
}
