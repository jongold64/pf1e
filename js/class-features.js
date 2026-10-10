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
  // Dragon disciple natural armor increase: +1 at 1st, +2 at 4th, +3 at 7th, added to existing natural armor.
  const dd = levelOf(counts, ['dragon-disciple']);
  if (dd) add('Natural armor increase (dragon disciple)', [{ target: 'ac', type: 'natural armor increase', value: dd >= 7 ? 3 : dd >= 4 ? 2 : 1 }]);
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
    if (e.cls.id === 'skald' && lv >= 9) out.push({ value: lv >= 19 ? 3 : lv >= 14 ? 2 : 1, against: '—', source: e.cls.name });
    if (e.cls.id === 'stalwart-defender' && lv >= 5) out.push({ value: lv >= 10 ? 5 : lv >= 7 ? 3 : 1, against: '—', source: e.cls.name });
    if (e.cls.id === 'fighter' && lv >= 19 && (armor || shield)) out.push({ value: 5, against: '—', source: 'Armor mastery (fighter)' });
    if (['monk', 'monk-unchained'].includes(e.cls.id) && lv >= 20) out.push({ value: 10, against: 'chaotic', source: 'Perfect self (monk)' });
    if (e.cls.id === 'paladin' && lv >= 17) out.push({ value: lv >= 20 ? 10 : 5, against: 'evil', source: lv >= 20 ? 'Holy champion (paladin)' : 'Aura of righteousness (paladin)' });
    if (e.cls.id === 'antipaladin' && lv >= 17) out.push({ value: lv >= 20 ? 10 : 5, against: 'good', source: lv >= 20 ? 'Unholy champion (antipaladin)' : 'Aura of depravity (antipaladin)' });
  }
  return out;
}

// Weapon training on one weapon: [{ label, value }] for attack and damage rolls.
// - Fighter: one weapon group at 5th, 9th, 13th and 17th (picks in that order); the latest gives +1 and each earlier one
//   1 more. A weapon in several trained groups uses the best.
// - Swashbuckler (5th): +1 with light or one-handed piercing melee weapons, +1 every 4 levels (at most +4).
// picks (archetype-choices.js `picks`): gunslinger gun training (5th, 9th, 13th, 17th: Dex modifier on damage with each
// chosen firearm) and unchained rogue finesse training (3rd, 11th, 19th: Dex instead of Str on damage).
export function weaponTraining(counts, weapon, fighterGroups = [], { mod = {}, picks = {} } = {}) {
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
  const duelist = levelOf(counts, ['duelist']);
  if (duelist && ['light', 'one-handed'].includes(weapon.group) && /P/.test(weapon.type || '')) {
    out.push({ label: 'Precise strike (duelist; nothing in the other hand, living targets)', value: duelist, on: 'damage' });
  }
  if ((picks.gun || []).includes(weapon.id) && mod.dex > 0) out.push({ label: 'Gun training (Dexterity on damage)', value: mod.dex, on: 'damage' });
  if ((picks.finesse || []).includes(weapon.id)) out.push({ label: 'Finesse training', value: 0, swapStr: true });
  return out;
}

// A class's damage dice for a weapon, when they're bigger than its own: warpriest sacred weapon with the focus weapon
// (1d6 Medium at 1st, 1d8 at 5th, 1d10 at 10th, 2d6 at 15th, 2d8 at 20th; Small one step less) and brawler close weapon
// mastery (5th: a close weapon deals the unarmed damage of a brawler 4 levels lower). { dice, label } or null.
const SACRED = { Medium: ['1d6', '1d8', '1d10', '2d6', '2d8'], Small: ['1d4', '1d6', '1d8', '1d10', '2d6'] };
const BRAWLER_UNARMED = { Medium: ['1d6', '1d8', '1d10', '2d6', '2d8', '2d10'], Small: ['1d4', '1d6', '1d8', '1d10', '2d6', '2d8'] };
export function classWeaponDice(counts, weapon, { focus = null, size = 'Medium' } = {}) {
  const sz = size === 'Small' ? 'Small' : 'Medium';
  const wp = levelOf(counts, ['warpriest']);
  if (wp && focus === weapon.id) {
    const i = wp >= 20 ? 4 : wp >= 15 ? 3 : wp >= 10 ? 2 : wp >= 5 ? 1 : 0;
    return { dice: SACRED[sz][i], label: 'Sacred weapon (warpriest focus weapon)' };
  }
  const br = levelOf(counts, ['brawler']);
  if (br >= 5 && (weapon.groups || []).some(g => /close/i.test(g))) {
    const lv = br - 4;
    const i = lv >= 20 ? 5 : lv >= 16 ? 4 : lv >= 12 ? 3 : lv >= 8 ? 2 : lv >= 4 ? 1 : 0;
    return { dice: BRAWLER_UNARMED[sz][i], label: 'Close weapon mastery (brawler)' };
  }
  return null;
}

// Attacks and extra damage from class features, for the Character tab: sneak attack (the classes' dice stack), studied
// strike, alchemist bombs (master chymist levels stack) and kinetic blasts. stats: { bab, mod, fx }; sizeAttack: the
// size modifier on attacks. Each: { name, note, attack (or null), dice, uses? }.
export function classAttacks(counts, { bab = [0], mod = {}, fx = {}, sizeAttack = 0 } = {}) {
  const out = [];
  const lv = id => levelOf(counts, [id]);
  const sneak = Math.ceil(lv('rogue') / 2) + Math.ceil(lv('rogue-unchained') / 2) + Math.ceil(lv('ninja') / 2) + Math.ceil(lv('assassin') / 2)
    + Math.floor(lv('slayer') / 3) + Math.floor(lv('arcane-trickster') / 2) + (lv('master-spy') ? 1 + Math.floor((lv('master-spy') - 1) / 3) : 0);
  if (sneak) out.push({ name: 'Sneak attack', note: 'extra damage when the target is flanked or denied its Dex bonus to AC', attack: null, dice: `${sneak}d6` });
  const inv = lv('investigator');
  if (inv >= 4) out.push({ name: 'Studied strike', note: 'extra damage on a melee hit against your studied target, ending studied combat', attack: null, dice: `${Math.floor(inv / 2) - 1}d6` });
  if (inv) out.push({ name: 'Inspiration', note: `add to a skill or ability check (free on trained Knowledge, Linguistics and Spellcraft) · ${Math.max(1, Math.floor(inv / 2) + (mod.int || 0))}/day`,
    attack: null, dice: inv >= 20 ? '2d6' : '1d6' });
  const ranged = bab[0] + (mod.dex || 0) + sizeAttack + (fx.attack || 0) + (fx['ranged-attack'] || 0);
  const alch = lv('alchemist') + lv('master-chymist');
  if (lv('alchemist')) {
    const n = Math.ceil(alch / 2);
    const int = mod.int || 0;
    out.push({ name: 'Bomb', note: `ranged touch (+1 from Throw Anything) · splash ${n + int} · DC ${10 + Math.floor(alch / 2) + int} Reflex for splash · ${lv('alchemist') + int}/day`,
      attack: ranged + 1, dice: `${n}d6${int ? (int > 0 ? `+${int}` : int) : ''}`, kind: 'fire' });
  }
  const kin = lv('kineticist');
  if (kin) {
    const n = 1 + Math.floor((kin - 1) / 2);
    const con = mod.con || 0;
    out.push({ name: 'Kinetic blast (physical)', note: 'ranged attack, 30 ft.', attack: ranged, dice: `${n}d6+${n + con}` });
    out.push({ name: 'Kinetic blast (energy)', note: 'ranged touch attack, 30 ft.', attack: ranged, dice: `${n}d6${Math.floor(con / 2) > 0 ? `+${Math.floor(con / 2)}` : ''}` });
  }
  return out;
}

// Skills a class lets you use without ranks, and whether every skill is a class skill: bard jack-of-all-trades (10th:
// any skill untrained; 16th: all class skills), loremaster lore (2nd) and investigator keen recollection (3rd): Knowledge.
export function skillAccess(counts) {
  const bard = levelOf(counts, ['bard']);
  const knowledge = levelOf(counts, ['loremaster']) >= 2 || levelOf(counts, ['investigator']) >= 3;
  return { untrained: name => bard >= 10 || (knowledge && /^Knowledge/.test(name)), allClass: bard >= 16 };
}

// Bonuses that only apply in some situations, as notes: { fort, ref, will, ac, skills: { name: [text] } }.
export function situationalBonuses(counts, mod = {}) {
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
  // Wild empathy: d20 + class level + Charisma modifier (druid, ranger, hunter, shifter: the levels of the classes stack).
  const empathy = counts.filter(e => ['druid', 'ranger', 'hunter', 'shifter'].includes(e.cls.id)).reduce((s, e) => s + e.level, 0);
  if (empathy) skill('Diplomacy', `Wild empathy (to influence an animal): d20 + ${empathy + (mod.cha || 0)} (class level + Charisma modifier).`);
  const inq = lv(['inquisitor']);
  if (inq && mod.wis) for (const k of ['arcana', 'dungeoneering', 'local', 'nature', 'planes', 'religion']) skill(`Knowledge (${k})`, `Monster lore (inquisitor): +${mod.wis} (Wisdom) to identify a creature's abilities and weaknesses.`);
  const assassin = lv(['assassin']);
  if (assassin >= 2) n.fort.push(`Save bonus against poison (assassin): +${Math.floor(assassin / 2)}.`);
  const monkLv = lv(['monk', 'monk-unchained']);
  if (lv(['monk']) >= 5) skill('Acrobatics', `High jump (monk): +${lv(['monk'])} to jump, always with a running start.`);
  if (monkLv >= 5) n.fort.push('Purity of body (monk): immune to all diseases.');
  if (lv(['monk']) >= 11) n.fort.push('Diamond body (monk): immune to poisons.');
  if (lv(['paladin']) >= 8) n.will.push('Aura of resolve (paladin): immune to charm spells and spell-like abilities.');
  if (lv(['barbarian', 'barbarian-unchained', 'bloodrager']) >= 14) n.will.push('Indomitable will: +4 on Will saves against enchantment spells while raging.');
  if (lv(['bloodrager']) >= 3) all('Blood sanctuary (bloodrager): +2 on saves against spells you or an ally cast.');
  if (lv(['inquisitor']) >= 11) { n.fort.push('Stalwart (inquisitor, light or medium armor): no effect at all on a successful save that would reduce it.'); n.will.push('Stalwart (inquisitor, light or medium armor): no effect at all on a successful save that would reduce it.'); }
  const sum = lv(['summoner', 'summoner-unchained']);
  if (sum >= 4) {
    const v = sum >= 12 ? 4 : 2;
    n.ac.push(`Shield ally (summoner): +${v} shield bonus to AC within your eidolon's reach.`);
    all(`Shield ally (summoner): +${v} circumstance bonus on saves within your eidolon's reach.`);
  }
  const swash = lv(['swashbuckler']);
  if (swash >= 2 && mod.cha > 0) all(`Charmed life (swashbuckler): add +${mod.cha} (Charisma) to a save, ${Math.min(7, 3 + Math.floor((swash - 2) / 4))} times a day, before rolling.`);
  const duel = lv(['duelist']);
  if (duel >= 3) n.ac.push('Enhanced mobility (duelist, light or no armor, no shield): +4 AC against attacks of opportunity for moving out of a threatened square.');
  if (duel >= 7) n.ac.push(`Elaborate defense (duelist): +${Math.floor(duel / 3)} more dodge bonus when fighting defensively or in total defense.`);
  if (lv(['vigilante']) >= 3) skill('Intimidate', `Unshakable (vigilante): others add ${lv(['vigilante'])} to the DC to Intimidate you.`);
  return n;
}
