// Checks for rules.js and feats.js. Open tests.html through the local server to run them.
import { abilityModifier, pointsSpent, finalScores, characterStats, hitDieSize, formatBab, levelIncreases,
         bonusSpells, spellsPerDay } from './rules.js';
import { featSlots, slotAccepts, grantedFeats, proficiencyFeats, casterLevel, featContext, checkPrereq,
         checkFeat, repeatable, featEffects, monkFeatList, readTextPrereq, BONUS_FEAT_RULES } from './feats.js';
import { SKILLS, SKILL_FEATS, skillInfo, splitSkill, classSkillTest, skillRanksAvailable, racialSkillBonuses,
         skillTotal, skillBreakdown, ranksFor } from './skills.js';
import { armorEffects, speedInArmor, proficiencyWarnings, armorAttackPenalty, druidMetalWarnings } from './armor.js';
import { normalize, buildIndex, search } from './search.js';
import { WEALTH_BY_LEVEL, startingGold, armorCost, entryStats, equipmentTotals, formatGp, formatLbs,
         magicItemStats, magicItemTotals, ownable } from './equipment.js';
import { paragraphs, ordinal } from './dom.js';
import { abilityDamage, damageWithExtras } from './weapons.js';
import { abilityOptions, magicArmsPrice, spellItemPrice, craftCost, craftTime, craftDC, parseRequirements, checkRequirements as checkCraftRequirements, listedCost, magicPart } from './crafting.js';
import { classCounts, babList, racialAdjustments, saveBreakdown } from './rules.js';
import { domainChoices, domainConflict, domainGrants } from './domains.js';
import { withMaterial, materialsFor } from './materials.js';
import { effectTotals, stackTotal, acWithEffects, shiftSize } from './effects.js';
import { companionLevel, companionStats, parseAttacks } from './companion.js';
import { castingClasses, advanceSlots } from './multiclass.js';
import { parseRequirement, castingByTradition, checkRequirements } from './prestige.js';
import { levelsIn, grantedFeatsFor, proficiencyFeatsFor } from './feats.js';
import { proficiencyTest, strToDamage, formatDamage, weaponAttack, weaponCost, twoWeaponPenalties, twoWeaponAttack,
         flurryBabs } from './weapons.js';
import { raceTerms } from './race-terms.js';
import { racialAc, combatManeuvers, initiative, currentHp, changeHp, hpStatus, channelEnergy, layOnHands, smite,
         carryingCapacity, encumbrance, slowedSpeed } from './rules.js';
import { exportData, importData } from './storage.js';
import { tradition } from './multiclass.js';
import { traitEffects, traitSlotCount } from './traits.js';
import { heroPointMax, heroPointsAfter, clampHeroPoints, spendHeroPoint } from './hero-points.js';
import { replacedEntries, archetypeConflict, classWithArchetypes, featureLevel, changedProficiency, archetypesFor, unchainedGaps, unchainedFit, kiPowerTrades, featureDescription } from './archetypes.js';
import { replacedTraits, raceWithAlternates, alternateConflict, favoredOption, favoredOptionTotal, favoredChoices } from './race-options.js';
import { evalFormula, spellContext, spellLines, srCheck } from './spell-math.js';
import { rollDamage, rollSpec } from './dice.js';
import { unarmedForSize, improvedCritical } from './weapons.js';
import { featSkillBonus } from './skills.js';
import { spellFailureByClass } from './armor.js';
import { slotCharacterLevel } from './feats.js';

const results = [];
function check(name, actual, expected) {
  results.push({ name, pass: Object.is(actual, expected), actual, expected });
}

const [races, classes, allFeats, allArmor, allGear] = await Promise.all([
  fetch('data/races.json').then(r => r.json()),
  fetch('data/classes.json').then(r => r.json()),
  fetch('data/feats.json').then(r => r.json()),
  fetch('data/armor.json').then(r => r.json()),
  fetch('data/equipment.json').then(r => r.json()),
]);
const gearById = new Map(allGear.map(i => [i.id, i]));
const allWeapons = await fetch('data/weapons.json').then(r => r.json());
const weapon = name => allWeapons.find(w => w.name === name);
const armorById = id => allArmor.find(a => a.id === id);
const race = id => races.find(r => r.id === id);
const cls = id => classes.find(c => c.id === id);
const feat = name => allFeats.find(f => f.name === name);
const scores = (str, dex, con, int, wis, cha) => ({ str, dex, con, int, wis, cha });

// Ability modifiers
for (const [score, m] of [[7, -2], [8, -1], [9, -1], [10, 0], [11, 0], [12, 1], [18, 4], [20, 5]]) {
  check(`modifier for ${score}`, abilityModifier(score), m);
}

// Point buy
check('all 10s cost 0', pointsSpent(scores(10, 10, 10, 10, 10, 10)), 0);
check('all 7s cost -24', pointsSpent(scores(7, 7, 7, 7, 7, 7)), -24);
check('18 costs 17', pointsSpent(scores(18, 10, 10, 10, 10, 10)), 17);
check('dwarf fighter spread costs 15', pointsSpent(scores(15, 12, 14, 10, 12, 9)), 15);

// Hit dice
check('fighter hit die', hitDieSize(cls('fighter')), 10);
check('wizard hit die', hitDieSize(cls('wizard')), 6);

// Dwarf fighter
{
  const s = characterStats({ race: race('dwarf'), cls: cls('fighter'), baseScores: scores(15, 12, 14, 10, 12, 9) });
  check('dwarf Con 16', s.scores.con, 16);
  check('dwarf Wis 14', s.scores.wis, 14);
  check('dwarf Cha 7', s.scores.cha, 7);
  check('dwarf fighter HP', s.hp, 13);
  check('dwarf fighter BAB', s.bab[0], 1);
  check('dwarf fighter Fort', s.fort, 5);
  check('dwarf fighter Ref', s.ref, 1);
  check('dwarf fighter Will', s.will, 2);
  check('dwarf fighter AC', s.ac, 11);
  check('dwarf fighter touch', s.touch, 11);
  check('dwarf fighter flat-footed', s.flatFooted, 10);
}

// Halfling wizard: Small size, Str -2, Will +2 base
{
  const s = characterStats({ race: race('halfling'), cls: cls('wizard'), baseScores: scores(10, 14, 12, 16, 10, 10) });
  check('halfling Str 8', s.scores.str, 8);
  check('halfling Dex 16', s.scores.dex, 16);
  check('halfling wizard HP', s.hp, 7);
  check('halfling wizard BAB', s.bab[0], 0);
  check('halfling wizard Will', s.will, 2);
  check('halfling wizard AC (10 + 3 Dex + 1 size)', s.ac, 14);
  check('halfling wizard flat-footed', s.flatFooted, 11);
}

// Human: flexible +2
{
  const base = scores(15, 10, 10, 10, 10, 10);
  check('human +2 to Str', finalScores(base, race('human'), 'str').str, 17);
  check('human +2 to Wis', finalScores(base, race('human'), 'wis').wis, 12);
  check('human no choice yet', finalScores(base, race('human'), '').str, 15);
}

// Armor, shield, favored class, low Con
{
  const s = characterStats({ race: race('elf'), cls: cls('sorcerer'), baseScores: scores(10, 8, 7, 10, 10, 10), favoredHp: true,
                             gear: armorEffects({ armor: armorById('chain-shirt'), shield: armorById('heavy-steel-shield') }) });
  check('elf Con 5 gives -3', s.mod.con, -3);
  check('favored class adds 1 HP', s.hp, 4);  // 6 - 3 + 1
  check('armor + shield AC', s.ac, 16);
  check('touch ignores armor and shield', s.touch, 10);
  const low = characterStats({ race: race('elf'), cls: cls('wizard'), baseScores: scores(10, 7, 7, 10, 10, 10) });
  check('HP with Con penalty', low.hp, 3);  // 6 - 3
  check('Dex penalty stays when flat-footed', low.flatFooted, low.ac);
}

// Monk: Wis to AC
{
  const s = characterStats({ race: race('human'), cls: cls('monk'), baseScores: scores(14, 14, 12, 10, 14, 7), flexibleChoice: 'wis' });
  check('monk AC (10 + 2 Dex + 3 Wis)', s.ac, 15);
  check('monk flat-footed keeps Wis', s.flatFooted, 13);
}

// Higher levels
{
  const base = scores(15, 12, 14, 10, 12, 9);
  const s20 = characterStats({ race: race('dwarf'), cls: cls('fighter'), level: 20, baseScores: base });
  check('fighter 20 HP (13 + 19 × (6 + 3))', s20.hp, 184);
  check('fighter 20 BAB', formatBab(s20.bab), '+20/+15/+10/+5');
  check('fighter 20 Fort', s20.fort, 15);
  check('fighter 20 Ref', s20.ref, 7);
  check('fighter 20 Will', s20.will, 8);

  const s5 = characterStats({ race: race('dwarf'), cls: cls('fighter'), level: 5, baseScores: base, increases: ['str'] });
  check('level 4 increase applies at 5', s5.scores.str, 16);
  check('fighter 5 HP (13 + 4 × 9)', s5.hp, 49);
  const s5fav = characterStats({ race: race('dwarf'), cls: cls('fighter'), level: 5, baseScores: base, increases: ['str'], favoredHp: true });
  check('favored class HP at every level', s5fav.hp, 54);
  const s3 = characterStats({ race: race('dwarf'), cls: cls('fighter'), level: 3, baseScores: base, increases: ['str'] });
  check('level 4 increase not yet at 3', s3.scores.str, 15);
}
{
  const inc = levelIncreases(20, ['str', 'str', 'con', '', 'dex']);
  check('two increases to Str', inc.str, 2);
  check('unchosen increase adds nothing', inc.con + inc.dex, 2);
  check('increases stop at current level', levelIncreases(11, ['str', 'str', 'str']).str, 2);
}
{
  const s = characterStats({ race: race('elf'), cls: cls('wizard'), level: 10, baseScores: scores(10, 8, 7, 10, 10, 10) });
  check('wizard 10 with Con -3 gets 1 HP per level', s.hp, 12);  // 3 + 9 × max(1, 4 - 3)
}
{
  const base = scores(14, 14, 12, 10, 14, 7);
  const m4 = characterStats({ race: race('human'), cls: cls('monk'), level: 4, baseScores: base, flexibleChoice: 'wis', increases: ['wis'] });
  check('monk 4 AC bonus +1 (10 + 2 + 3 + 1)', m4.ac, 16);
  const m8 = characterStats({ race: race('human'), cls: cls('monk'), level: 8, baseScores: base, flexibleChoice: 'wis', increases: ['wis', 'wis'] });
  check('monk 8 Wis 18', m8.scores.wis, 18);
  check('monk 8 AC (10 + 2 + 4 + 2)', m8.ac, 18);
  check('monk 8 BAB', formatBab(m8.bab), '+6/+1');
}

// Spells
for (const [mod, sl, n] of [[4, 1, 1], [4, 4, 1], [4, 5, 0], [5, 1, 2], [8, 1, 2], [9, 1, 3], [0, 1, 0], [5, 0, 0]]) {
  check(`bonus spells: mod +${mod}, level ${sl}`, bonusSpells(mod, sl), n);
}
{
  const spell = (id, level, sc, extraSlot) => spellsPerDay({ cls: cls(id), level, scores: sc, extraSlot });
  const lvl = (sp, sl) => sp.rows.find(r => r.spellLevel === sl);

  check('fighter has no spells', spell('fighter', 5, scores(10, 10, 10, 10, 10, 10)), null);

  const cleric = spell('cleric', 1, scores(10, 10, 10, 10, 16, 10));
  check('cleric casts with Wis', cleric.ability, 'wis');
  check('cleric 1 orisons', lvl(cleric, 0).total, 3);
  check('cleric 1 first level (1 + 1 bonus + 1 domain)', lvl(cleric, 1).total, 3);

  const pal3 = spell('paladin', 3, scores(10, 10, 10, 10, 10, 14));
  check('paladin 3 has no spells yet', pal3.rows.length, 0);
  check('paladin spells start at 4', pal3.firstLevel, 4);
  check('paladin 4 Cha 14: bonus spell only', lvl(spell('paladin', 4, scores(10, 10, 10, 10, 10, 14)), 1).total, 1);
  check('paladin 4 Cha 11: none', lvl(spell('paladin', 4, scores(10, 10, 10, 10, 10, 11)), 1).total, 0);

  const sorc = spell('sorcerer', 4, scores(10, 10, 10, 10, 10, 18));
  check('sorcerer cantrips per day not listed', lvl(sorc, 0).base, null);
  check('sorcerer 4 cantrips known', lvl(sorc, 0).known, 6);
  check('sorcerer 4 first level (6 + 1)', lvl(sorc, 1).total, 7);
  check('sorcerer 4 second level (3 + 1)', lvl(sorc, 2).total, 4);
  check('sorcerer 4 second level known', lvl(sorc, 2).known, 1);

  const wiz10 = spell('wizard', 1, scores(10, 10, 10, 10, 10, 10), true);
  check('wizard Int 10 cannot cast 1st', lvl(wiz10, 1).canCast, false);
  check('wizard Int 10 gets no 1st-level spells', lvl(wiz10, 1).total, 0);
  check('specialist wizard 1 Int 11 (1 + school)', lvl(spell('wizard', 1, scores(10, 10, 10, 11, 10, 10), true), 1).total, 2);
  check('universalist wizard 1 Int 11', lvl(spell('wizard', 1, scores(10, 10, 10, 11, 10, 10), false), 1).total, 1);

  check('druid without domain (1 + 1 bonus)', lvl(spell('druid', 1, scores(10, 10, 10, 10, 12, 10), false), 1).total, 2);
  check('druid with domain', lvl(spell('druid', 1, scores(10, 10, 10, 10, 12, 10), true), 1).total, 3);
}

// Feat slots
{
  const ids = (r, c, level) => featSlots({ race: race(r), cls: cls(c), level }).map(s => s.id).join(' ');
  check('human fighter 1 slots', ids('human', 'fighter', 1), 'L1 race class-fighter-L1');
  check('elf wizard 5 slots', ids('elf', 'wizard', 5), 'L1 L3 L5 class-wizard-L5');
  check('human fighter 20 has 22 feats', featSlots({ race: race('human'), cls: cls('fighter'), level: 20 }).length, 22);
  check('monk 6 slots', ids('dwarf', 'monk', 6), 'L1 L3 L5 class-monk-L1 class-monk-L2 class-monk-L6');
  check('inquisitor 3 teamwork slot', ids('dwarf', 'inquisitor', 3), 'L1 L3 class-inquisitor-L3');
}

// What class bonus slots accept
{
  const slot = (c, level, id) => featSlots({ race: race('dwarf'), cls: cls(c), level }).find(s => s.id === id);
  const fighterSlot = slot('fighter', 1, 'class-fighter-L1');
  check('fighter slot takes Power Attack', slotAccepts(fighterSlot, feat('Power Attack')), true);
  check('fighter slot refuses Toughness', slotAccepts(fighterSlot, feat('Toughness')), false);
  const wizSlot = slot('wizard', 5, 'class-wizard-L5');
  check('wizard slot takes Empower Spell', slotAccepts(wizSlot, feat('Empower Spell')), true);
  check('wizard slot takes Spell Mastery', slotAccepts(wizSlot, feat('Spell Mastery')), true);
  check('wizard slot refuses Toughness', slotAccepts(wizSlot, feat('Toughness')), false);
  check('monk level 2 slot takes Dodge', slotAccepts(slot('monk', 6, 'class-monk-L2'), feat('Dodge')), true);
  check('monk level 2 slot refuses Mobility', slotAccepts(slot('monk', 6, 'class-monk-L2'), feat('Mobility')), false);
  check('monk level 6 slot takes Mobility', slotAccepts(slot('monk', 6, 'class-monk-L6'), feat('Mobility')), true);
  check('general slot takes anything', slotAccepts({ kind: 'general' }, feat('Toughness')), true);
  const missing = monkFeatList(20).filter(n => !feat(n));
  check('every monk bonus feat exists in the data', missing.join(', '), '');
}

// Prerequisites
{
  const names = allFeats.map(f => f.name);
  const ctxFor = (r, c, level, sc, chosen = []) => {
    const k = cls(c);
    const stats = characterStats({ race: race(r), cls: k, level, baseScores: sc });
    return featContext({ race: race(r), cls: k, level, scores: stats.scores, bab: stats.bab[0],
                         haveFeats: [...chosen, ...grantedFeats(k, level, names), ...proficiencyFeats(k)] });
  };
  const status = (f, ctx, slot) => checkFeat(typeof f === 'string' ? feat(f) : f, ctx, slot).status;
  const str13 = scores(13, 10, 10, 10, 10, 10);
  const plain = scores(10, 10, 10, 10, 10, 10);

  check('Power Attack: fighter 1, Str 13', status('Power Attack', ctxFor('human', 'fighter', 1, str13)), 'met');
  check('Power Attack: Str 12', status('Power Attack', ctxFor('human', 'fighter', 1, scores(12, 10, 10, 10, 10, 10))), 'unmet');
  check('Power Attack: wizard 1 (BAB 0)', status('Power Attack', ctxFor('human', 'wizard', 1, str13)), 'unmet');
  check('Cleave without Power Attack', status('Cleave', ctxFor('human', 'fighter', 1, str13)), 'unmet');
  check('Cleave with Power Attack', status('Cleave', ctxFor('human', 'fighter', 1, str13, ['Power Attack'])), 'met');

  check('Extra Channel: cleric 1', status('Extra Channel', ctxFor('human', 'cleric', 1, plain)), 'met');
  check('Extra Channel: fighter 1', status('Extra Channel', ctxFor('human', 'fighter', 1, plain)), 'unmet');
  check('Extra Channel: paladin 3', status('Extra Channel', ctxFor('human', 'paladin', 3, plain)), 'unmet');
  check('Extra Channel: paladin 4', status('Extra Channel', ctxFor('human', 'paladin', 4, plain)), 'met');

  check('monk gets Improved Unarmed Strike free', grantedFeats(cls('monk'), 1, names).includes('Improved Unarmed Strike'), true);
  check('wizard gets Scribe Scroll free', grantedFeats(cls('wizard'), 1, names).includes('Scribe Scroll'), true);
  check('Scorpion Style: monk 1', status('Scorpion Style', ctxFor('human', 'monk', 1, plain)), 'met');
  check('Scorpion Style: fighter 1', status('Scorpion Style', ctxFor('human', 'fighter', 1, plain)), 'unmet');

  check('fighter has tower shield proficiency', proficiencyFeats(cls('fighter')).includes('Tower Shield Proficiency'), true);
  check('cleric has shields', proficiencyFeats(cls('cleric')).includes('Shield Proficiency'), true);
  check('cleric has no tower shields', proficiencyFeats(cls('cleric')).includes('Tower Shield Proficiency'), false);
  check('cleric has no heavy armor', proficiencyFeats(cls('cleric')).includes('Armor Proficiency, Heavy'), false);
  check('wizard has no armor or shields', proficiencyFeats(cls('wizard')).length, 0);
  check('monk has no armor or shields', proficiencyFeats(cls('monk')).length, 0);
  check('Shield Focus: fighter 1', status('Shield Focus', ctxFor('human', 'fighter', 1, plain)), 'met');
  check('Shield Focus: wizard 1', status('Shield Focus', ctxFor('human', 'wizard', 1, plain)), 'unmet');

  const fighter4 = { type: 'class_level', class: 'fighter', value: 4 };
  check('fighter 3 is not fighter level 4', checkPrereq(fighter4, ctxFor('human', 'fighter', 3, plain), feat('Weapon Specialization')).status, 'unmet');
  check('swashbuckler 4 counts as fighter 4 for combat feats',
        checkPrereq(fighter4, ctxFor('human', 'swashbuckler', 4, plain), feat('Weapon Specialization')).status, 'met');
  check('...but not for other feats', checkPrereq(fighter4, ctxFor('human', 'swashbuckler', 4, plain), feat('Toughness')).status, 'unmet');
  const bab6 = { type: 'bab', value: 6 };
  const wp6 = ctxFor('human', 'warpriest', 6, plain);
  check('warpriest 6 has BAB +4', wp6.bab, 4);
  check('warpriest bonus feat uses level as BAB', checkPrereq(bab6, wp6, feat('Power Attack'), BONUS_FEAT_RULES.warpriest).status, 'met');
  check('...but not for other feats', checkPrereq(bab6, wp6, feat('Power Attack')).status, 'unmet');

  check('caster level: wizard 3', casterLevel(cls('wizard'), 3), 3);
  check('caster level: paladin 5', casterLevel(cls('paladin'), 5), 2);
  check('caster level: paladin 3', casterLevel(cls('paladin'), 3), 0);
  check('caster level: fighter', casterLevel(cls('fighter'), 10), 0);
  const cl3 = { type: 'caster_level', value: 3 };
  check('CL 3: paladin 6', checkPrereq(cl3, ctxFor('human', 'paladin', 6, plain), {}).status, 'met');
  check('CL 3: paladin 5', checkPrereq(cl3, ctxFor('human', 'paladin', 5, plain), {}).status, 'unmet');

  const elfOnly = { type: 'race', race: 'elf' };
  check('half-elf counts as an elf', checkPrereq(elfOnly, ctxFor('half-elf', 'fighter', 1, plain), {}).status, 'met');
  check('dwarf is not an elf', checkPrereq(elfOnly, ctxFor('dwarf', 'fighter', 1, plain), {}).status, 'unmet');

  const ctx = ctxFor('human', 'fighter', 1, plain);
  check('skill ranks cannot be checked', checkPrereq({ type: 'skill', skill: 'Acrobatics', ranks: 1 }, ctx, {}).status, 'unknown');
  check('text prerequisites cannot be checked', checkPrereq({ type: 'other', text: 'Small size' }, ctx, {}).status, 'unknown');
  const str20 = { type: 'ability', ability: 'str', value: 20 };
  const skill = { type: 'skill', skill: 'Acrobatics', ranks: 1 };
  check('any_of: unmet or unknown', checkPrereq({ type: 'any_of', options: [str20, skill] }, ctx, {}).status, 'unknown');
  check('any_of: one met', checkPrereq({ type: 'any_of', options: [str20, { type: 'bab', value: 1 }] }, ctx, {}).status, 'met');
  check('one unmet part makes the feat unmet', checkFeat({ prerequisites: [skill, str20] }, ctx).status, 'unmet');

  const monkSlot = featSlots({ race: race('human'), cls: cls('monk'), level: 1 }).find(s => s.kind === 'class');
  check('monk bonus feat waives prerequisites', status('Improved Grapple', ctxFor('human', 'monk', 1, plain), monkSlot), 'met');
  check('...but not in a general slot', status('Improved Grapple', ctxFor('human', 'monk', 1, plain)), 'unmet');

  // Prerequisites the data left as text
  check('reads "8th-level fighter"', JSON.stringify(readTextPrereq('8th-level fighter')),
        JSON.stringify({ type: 'class_level', class: 'fighter', value: 8 }));
  check('reads "Weapon Focus with selected weapon"', readTextPrereq('Weapon Focus with selected weapon').feat, 'Weapon Focus');
  check('leaves "Proficiency with selected weapon"', readTextPrereq('Proficiency with selected weapon'), null);
  check('reads "Ability to cast 4th-level spells"', readTextPrereq('Ability to cast 4th-level spells').value, 4);
  check('Greater Weapon Focus: fighter 1', status('Greater Weapon Focus', ctxFor('human', 'fighter', 1, str13)), 'unmet');
  check('Greater Weapon Focus: fighter 8 without Weapon Focus', status('Greater Weapon Focus', ctxFor('human', 'fighter', 8, str13)), 'unmet');
  check('Greater Weapon Focus: fighter 8 with Weapon Focus (proficiency not checked)',
        status('Greater Weapon Focus', ctxFor('human', 'fighter', 8, str13, ['Weapon Focus'])), 'unknown');
  const int14 = scores(10, 10, 10, 14, 10, 10);
  check('Minor Spell Expertise: wizard 7 Int 14', checkPrereq({ type: 'other', text: 'Ability to cast 4th-level spells' },
        ctxFor('human', 'wizard', 7, int14), {}).status, 'met');
  check('Minor Spell Expertise: wizard 5', checkPrereq({ type: 'other', text: 'Ability to cast 4th-level spells' },
        ctxFor('human', 'wizard', 5, int14), {}).status, 'unmet');
  check('Minor Spell Expertise: wizard 7 Int 13', checkPrereq({ type: 'other', text: 'Ability to cast 4th-level spells' },
        ctxFor('human', 'wizard', 7, scores(10, 10, 10, 13, 10, 10)), {}).status, 'unmet');

  check('Weapon Focus can be taken more than once', repeatable(feat('Weapon Focus')), true);
  check('Power Attack cannot', repeatable(feat('Power Attack')), false);
}

// Feat effects on the numbers
{
  check('Toughness at level 1', featEffects(['Toughness'], 1).hp, 3);
  check('Toughness at level 10', featEffects(['Toughness'], 10).hp, 10);
  const base = scores(15, 12, 14, 10, 12, 9);
  const s = characterStats({ race: race('dwarf'), cls: cls('fighter'), baseScores: base,
                             featBonuses: featEffects(['Toughness', 'Iron Will', 'Dodge'], 1) });
  check('dwarf fighter with Toughness HP', s.hp, 16);
  check('Iron Will', s.will, 4);
  check('Dodge AC', s.ac, 12);
  check('Dodge touch AC', s.touch, 12);
  check('no Dodge when flat-footed', s.flatFooted, 10);
  const g = characterStats({ race: race('dwarf'), cls: cls('fighter'), baseScores: base,
                             featBonuses: featEffects(['Great Fortitude', 'Lightning Reflexes'], 1) });
  check('Great Fortitude', g.fort, 7);
  check('Lightning Reflexes', g.ref, 3);
}

// Skills
{
  // The class data names skills with an ability; they should agree with the skill list.
  // (Some prestige classes, which the app doesn't offer yet, have source errors like "Handle Animals".)
  const mismatches = [];
  for (const c of classes.filter(x => x.category !== 'prestige' && x.category !== 'npc')) {
    for (const s of c.class_skills || []) {
      const info = skillInfo(s.skill) || SKILLS.find(x => x.name === splitSkill(s.skill).base);
      const expected = info?.ability ?? (splitSkill(s.skill).base === 'Knowledge' ? 'int' : null);
      if (expected !== s.ability) mismatches.push(`${c.id}:${s.skill}`);
    }
  }
  check('class skill abilities match the skill list', mismatches.join(', '), '');

  const fighter = classSkillTest(cls('fighter'));
  check('fighter: Climb is a class skill', fighter('Climb'), true);
  check('fighter: Acrobatics is not', fighter('Acrobatics'), false);
  check('fighter: any Craft is', fighter('Craft (alchemy)'), true);
  check('fighter: Knowledge (engineering) is', fighter('Knowledge (engineering)'), true);
  check('fighter: Knowledge (arcana) is not', fighter('Knowledge (arcana)'), false);
  check('bard: every Knowledge is a class skill', classSkillTest(cls('bard'))('Knowledge (planes)'), true);
  const limited = classes.find(c => (c.class_skills || []).some(s => s.skill.startsWith('Perform (oratory')));
  check('limited Perform list: sing', classSkillTest(limited)('Perform (sing)'), true);
  check('limited Perform list: dance', classSkillTest(limited)('Perform (dance)'), false);

  const ranks = (r, c, level, base, extra = {}) => skillRanksAvailable({ race: race(r), cls: cls(c), level, baseScores: base, ...extra });
  check('human fighter 1, Int 10 (2 + 0 + 1 Skilled)', ranks('human', 'fighter', 1, scores(10, 10, 10, 10, 10, 10), { flexibleChoice: 'str' }), 3);
  check('elf wizard 1, Int 18 (2 + 4)', ranks('elf', 'wizard', 1, scores(10, 10, 10, 16, 10, 10)), 6);
  check('dwarf fighter 3, Int 7: at least 1 per level', ranks('dwarf', 'fighter', 3, scores(10, 10, 10, 7, 10, 10)), 3);
  const int13 = scores(10, 10, 10, 13, 10, 10);
  check('Int increase at 4 counts from 4th level on (3 × 4 + 5)',
        ranks('human', 'fighter', 4, int13, { flexibleChoice: 'str', increases: ['int'] }), 17);
  check('favored class skill ranks', ranks('human', 'fighter', 4, int13, { flexibleChoice: 'str', increases: ['int'], favoredSkill: true }), 21);
  check('aasimar "Skilled" is a skill bonus, not extra ranks', ranks('aasimar', 'fighter', 1, scores(10, 10, 10, 10, 10, 10)), 2);

  const sorted = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  check('elf racial skills (Spellcraft bonus is conditional)', sorted(racialSkillBonuses(race('elf'))), '{"Perception":2}');
  check('halfling racial skills', sorted(racialSkillBonuses(race('halfling'))), '{"Acrobatics":2,"Climb":2,"Perception":2}');
  check('half-orc racial skills', sorted(racialSkillBonuses(race('half-orc'))), '{"Intimidate":2}');
  check('goblin racial skills', sorted(racialSkillBonuses(race('goblin'))), '{"Ride":4,"Stealth":4}');
  check('kobold racial skills', sorted(racialSkillBonuses(race('kobold'))), '{"Craft (trapmaking)":2,"Perception":2,"Profession (miner)":2}');
  check('nagaji: only the unconditional bonus', sorted(racialSkillBonuses(race('nagaji'))), '{"Perception":2}');
  check('svirfneblin racial skills', sorted(racialSkillBonuses(race('svirfneblin'))), '{"Craft (alchemy)":2,"Perception":2,"Stealth":2}');
  check('tengu racial skills', sorted(racialSkillBonuses(race('tengu'))), '{"Linguistics":4,"Perception":2,"Stealth":2}');
  check('kitsune: Disguise bonus is conditional', sorted(racialSkillBonuses(race('kitsune'))), '{"Acrobatics":2}');
  check('strix: dim light bonus is conditional', sorted(racialSkillBonuses(race('strix'))), '{}');
  check('dwarf has no unconditional skill bonus', sorted(racialSkillBonuses(race('dwarf'))), '{}');

  const str16 = scores(16, 10, 10, 10, 12, 10);
  const climb = skillTotal({ name: 'Climb', ranks: 1, scores: str16, isClassSkill: true });
  check('Climb: 1 rank + 3 Str + 3 class', climb.total, 7);
  check('class bonus needs a rank', skillTotal({ name: 'Climb', ranks: 0, scores: str16, isClassSkill: true }).total, 3);
  check('trained-only skill with no ranks is unusable', skillTotal({ name: 'Spellcraft', ranks: 0, scores: str16, isClassSkill: false }).usable, false);
  check('Knowledge with no ranks: limited use (DC 10 or lower)', !!skillTotal({ name: 'Knowledge (arcana)', ranks: 0, scores: str16, isClassSkill: false }).limited, true);
  const why = skillBreakdown({ name: 'Climb', ranks: 2, scores: str16, isClassSkill: true, featNames: ['Athletic'], checkPenalty: -1,
    effects: [{ source: 'Heroism', type: 'morale', value: 2 }, { source: 'Good hope', type: 'morale', value: 2 }], effectTotal: 2 });
  check('skill details add up to the total', why.lines.reduce((n, l) => n + l.value, 0), why.total);
  check('skill details: Climb 2 + Str 3 + class 3 + Athletic 2 - armor 1 + morale 2', why.total, 11);
  check('untrained skill is usable', skillTotal({ name: 'Climb', ranks: 0, scores: str16, isClassSkill: false }).usable, true);
  const perc = skillTotal({ name: 'Perception', ranks: 10, scores: str16, isClassSkill: false,
                            racialBonuses: { Perception: 2 }, featNames: ['Alertness'] });
  check('Perception: 10 ranks + 1 Wis + 2 race + 4 Alertness', perc.total, 17);
  check('Alertness is +2 below 10 ranks', skillTotal({ name: 'Perception', ranks: 9, scores: str16, isClassSkill: false,
                                                       featNames: ['Alertness'] }).feat, 2);
  const missingSkillFeats = Object.keys(SKILL_FEATS).filter(n => !feat(n));
  check('every skill feat exists in the data', missingSkillFeats.join(', '), '');
  const wrongText = Object.entries(SKILL_FEATS).filter(([n, sk]) => !sk.every(s => feat(n).benefit.includes(s))).map(([n]) => n);
  check('skill feat benefits name their skills', wrongText.join(', '), '');

  check('ranksFor exact', ranksFor('Craft (alchemy)', { 'Craft (alchemy)': 3 }), 3);
  check('ranksFor any Craft', ranksFor('Craft', { 'Craft (alchemy)': 3 }), 3);
  check('ranksFor other specialty', ranksFor('Craft (traps)', { 'Craft (alchemy)': 3 }), 0);
  check('ranksFor "or" specialties', ranksFor('Perform (oratory or sing)', { 'Perform (sing)': 2 }), 2);
  check('ranksFor plain skill', ranksFor('Acrobatics', { Acrobatics: 5 }), 5);

  const k = cls('fighter');
  const skillCtx = featContext({ race: race('human'), cls: k, level: 5, scores: str16, bab: 5, haveFeats: [],
                                 skillRanks: { Acrobatics: 5 } });
  check('skill prerequisite met', checkPrereq({ type: 'skill', skill: 'Acrobatics', ranks: 3 }, skillCtx, {}).status, 'met');
  check('skill prerequisite unmet', checkPrereq({ type: 'skill', skill: 'Acrobatics', ranks: 6 }, skillCtx, {}).status, 'unmet');
}

// Armor
{
  const chainmail = armorById('chainmail');
  check('chainmail from the data', [chainmail.bonus, chainmail.max_dex, chainmail.check_penalty, chainmail.spell_failure].join(), '6,2,-5,30');
  check('tower shield from the data', [armorById('tower-shield').bonus, armorById('tower-shield').max_dex].join(), '4,2');
  const e = armorEffects({ armor: chainmail });
  check('chainmail bonus', e.armorBonus, 6);
  check('chainmail max Dex', e.maxDex, 2);
  check('chainmail check penalty', e.checkPenalty, -5);
  const magic = armorEffects({ armor: chainmail, armorEnh: 1 });
  check('+1 chainmail bonus', magic.armorBonus, 7);
  check('+1 chainmail check penalty (masterwork)', magic.checkPenalty, -4);
  const mwChain = armorEffects({ armor: armorById('chainmail'), armorMw: true });
  check('masterwork chainmail: check penalty -4, no AC bonus', `${mwChain.checkPenalty} ${mwChain.armorBonus}`, '-4 6');
  check('masterwork chainmail costs 150 + 150', armorCost(armorById('chainmail'), 0, true), 300);
  check('+1 padded check penalty stays 0', armorEffects({ armor: armorById('padded'), armorEnh: 1 }).checkPenalty, 0);
  const plateTower = armorEffects({ armor: armorById('full-plate'), shield: armorById('tower-shield') });
  check('full plate + tower shield: lowest max Dex', plateTower.maxDex, 1);
  check('full plate + tower shield: penalties add', plateTower.checkPenalty, -16);
  check('full plate + tower shield: spell failure adds', plateTower.spellFailure, 85);
  check('shields have no max Dex', armorEffects({ shield: armorById('heavy-steel-shield') }).maxDex, null);

  const dex18 = scores(10, 18, 10, 10, 10, 10);
  const inChain = characterStats({ race: race('dwarf'), cls: cls('fighter'), baseScores: dex18, gear: e });
  check('Dex +4 capped at +2 in chainmail: AC', inChain.ac, 18);
  check('capped Dex: touch AC', inChain.touch, 12);
  check('capped Dex: flat-footed AC', inChain.flatFooted, 16);
  const dex8 = characterStats({ race: race('dwarf'), cls: cls('fighter'), baseScores: scores(10, 8, 10, 10, 10, 10),
                               gear: armorEffects({ armor: armorById('full-plate') }) });
  check('Dex penalty is not capped (10 + 9 - 1)', dex8.ac, 18);

  const monkBase = scores(14, 14, 12, 10, 14, 7);
  const monk = gear => characterStats({ race: race('human'), cls: cls('monk'), baseScores: monkBase, flexibleChoice: 'wis', gear });
  check('monk unarmored keeps Wis to AC', monk(null).ac, 15);
  check('monk in leather loses Wis to AC (10 + 2 + 2)', monk(armorEffects({ armor: armorById('leather') })).ac, 14);

  check('human in chainmail: 30 -> 20 ft.', speedInArmor(30, e, race('human')), 20);
  check('halfling in chainmail: 20 -> 15 ft.', speedInArmor(20, e, race('halfling')), 15);
  check('dwarf in full plate keeps 20 ft.', speedInArmor(20, plateTower, race('dwarf')), 20);
  check('light armor does not slow', speedInArmor(30, armorEffects({ armor: armorById('leather') }), race('human')), 30);

  const profs = c => proficiencyFeats(cls(c));
  check('fighter proficient with full plate + tower shield', proficiencyWarnings(plateTower, profs('fighter')).length, 0);
  check('wizard not proficient with chainmail', proficiencyWarnings(e, profs('wizard')).length, 1);
  check('cleric not proficient with tower shield',
        proficiencyWarnings(armorEffects({ shield: armorById('tower-shield') }), profs('cleric')).length, 1);
  check('cleric proficient with a heavy shield',
        proficiencyWarnings(armorEffects({ shield: armorById('heavy-steel-shield') }), profs('cleric')).length, 0);
  check('feat gives proficiency', proficiencyWarnings(e, [...profs('wizard'), 'Armor Proficiency, Medium']).length, 0);
  check('attack penalty: proficient fighter in chainmail', armorAttackPenalty(e, profs('fighter')), 0);
  check('attack penalty: wizard in chainmail (-5)', armorAttackPenalty(e, profs('wizard')), -5);
  check('attack penalty: wizard in +1 chainmail (-4)', armorAttackPenalty(armorEffects({ armor: chainmail, armorEnh: 1 }), profs('wizard')), -4);
  check('attack penalty: fighter with a tower shield (-2 always)', armorAttackPenalty(plateTower, profs('fighter')), -2);
  check('attack penalty: cleric with a tower shield (-10 - 2)',
        armorAttackPenalty(armorEffects({ shield: armorById('tower-shield') }), profs('cleric')), -12);

  const s10 = scores(14, 10, 10, 10, 10, 10);
  check('armor check penalty on Climb', skillTotal({ name: 'Climb', ranks: 1, scores: s10, isClassSkill: true, checkPenalty: -5 }).total, 1);
  check('no armor check penalty on Perception', skillTotal({ name: 'Perception', ranks: 1, scores: s10, isClassSkill: false, checkPenalty: -5 }).total, 1);
  check('armor check penalty skills', SKILLS.filter(x => x.acp).map(x => x.name).join(', '),
        'Acrobatics, Climb, Disable Device, Escape Artist, Fly, Ride, Sleight of Hand, Stealth, Swim');
}

// Search
{
  check('normalize strips punctuation and case', normalize("Mage's  Armor"), 'mages armor');
  check('normalize strips accents', normalize('Élan Vital'), 'elan vital');
  const index = buildIndex([
    { type: 'spell', id: 'mage-armor', name: 'Mage Armor' },
    { type: 'armor', id: 'chainmail', name: 'Chainmail' },
    { type: 'magic-item', id: 'ring-of-protection', name: 'Ring of Protection' },
    { type: 'feat', id: 'armor-proficiency-light', name: 'Armor Proficiency, Light' },
    { type: 'race', id: 'elf', name: 'Elf' },
    { type: 'magic-item', id: 'elven-chain', name: 'Elven Chain' },
  ]);
  const names = q => search(index, q).map(e => e.name).join(' | ');
  check('search: one letter finds nothing', names('e'), '');
  check('search: starts-with ranks first', names('elf'), 'Elf');
  check('search: word match', names('armor'), 'Armor Proficiency, Light | Mage Armor');
  check('search: contains', names('chain'), 'Chainmail | Elven Chain');
  check('search: words in any position', names('ring prot'), 'Ring of Protection');
  check('search: "mage\'s" becomes "mages", which isn\'t in "Mage Armor"', names("mage's"), '');
  check('search: limit', search(index, 'ar', 1).length, 1);
}

// Rules text display
{
  check('paragraphs', paragraphs('One.\n\nTwo.'), '<p>One.</p><p>Two.</p>');
  check('line breaks are kept', paragraphs('Line one\nLine two'), '<p>Line one<br>Line two</p>');
  check('text is escaped', paragraphs('a < b & c'), '<p>a &lt; b &amp; c</p>');
  const t = paragraphs('Intro text.\nHit Points | Duration\n50 or less | Permanent\n51-100 | 1d4+1 minutes');
  check('table rows become a table', (t.match(/<tr>/g) || []).length, 3);
  check('first table row is the header', t.includes('<th>Hit Points</th><th>Duration</th>'), true);
  check('text before the table stays text', t.startsWith('<p>Intro text.</p>'), true);
  check('a single "a | b" line stays text', paragraphs('Just | one'), '<p>Just | one</p>');
}

// Equipment
{
  check('formatGp: gold', formatGp(1250), '1,250 gp');
  check('formatGp: silver', formatGp(0.5), '5 sp');
  check('formatGp: copper', formatGp(0.01), '1 cp');
  check('formatGp: mixed', formatGp(2.55), '2 gp 5 sp 5 cp');
  check('formatGp: zero', formatGp(0), '0 gp');
  check('formatGp: negative', formatGp(-12.5), '−12 gp 5 sp');
  check('formatLbs', `${formatLbs(1)} / ${formatLbs(2.5)}`, '1 lb. / 2.5 lbs.');

  check('fighter starting gold', startingGold(cls('fighter'), classes), 175);
  check('wizard starting gold', startingGold(cls('wizard'), classes), 70);
  check('antipaladin uses the paladin figure', startingGold(cls('antipaladin'), classes), 175);
  check('wealth at level 5', WEALTH_BY_LEVEL[5], 10500);
  check('wealth at level 20', WEALTH_BY_LEVEL[20], 880000);

  check('chainmail costs 150 gp', armorCost(armorById('chainmail')), 150);
  check('+1 chainmail: 150 + 150 masterwork + 1,000', armorCost(armorById('chainmail'), 1), 1300);
  check('+2 heavy steel shield: 20 + 150 + 4,000', armorCost(armorById('heavy-steel-shield'), 2), 4170);

  const backpack = gearById.get('backpack');
  check('backpack from the data (common is the default)', `${backpack.price_gp} ${backpack.weight_lbs}`, '2 2');
  check('masterwork backpack version', JSON.stringify(entryStats(backpack, 'Masterwork')), '{"price_gp":50,"weight_lbs":4}');
  check('grappling hook mithral price ignores the footnote',
        gearById.get('grappling-hook').variants.find(v => v.name === 'Mithral').price_gp, 1000);
  check('silk rope merged with "Rope, Silk"', gearById.get('silk-rope').also_in?.includes('Core Rulebook'), true);

  const inv = [{ id: 'backpack', qty: 1 }, { id: 'backpack', variant: 'Masterwork', qty: 1 }, { id: 'rope', qty: 2 },
               { id: 'candle', qty: 10 }, { id: 'no-such-item', qty: 1 }];
  const t = equipmentTotals(inv, gearById, { armor: armorById('chainmail'), armorEnh: 0 });
  check('inventory cost (2 + 50 + 2 + 0.10 + 150 chainmail)', t.cost, 204.1);
  check('inventory weight (2 + 4 + 20 + 40 chainmail; candles have no weight)', t.weight, 66);
  check('items without a weight are listed', t.unweighed.join(), 'Candle');

  const ring = { name: 'Ring of Protection', category: 'Rings', price_gp: 2000, weight_lbs: null,
                 price_options: [{ label: '+1', price_gp: 2000 }, { label: '+2', price_gp: 8000 }] };
  const cloak = { name: 'Cloak of Resistance', category: 'Wondrous Items', price_gp: 1000, weight_lbs: 1 };
  check('magic item price option', magicItemStats(ring, '+2').price_gp, 8000);
  check('magic item default price', magicItemStats(cloak).price_gp, 1000);
  const owned = magicItemTotals([{ id: 'ring', option: '+2', qty: 1 }, { id: 'cloak', qty: 2 }],
                                new Map([['ring', ring], ['cloak', cloak]]));
  check('magic items cost (8,000 + 2 × 1,000)', owned.cost, 10000);
  check('magic items weight', owned.weight, 2);
  check('special abilities can\'t be owned alone', ownable({ category: 'Weapon Special Abilities' }), false);
  check('wondrous items can be owned', ownable(cloak), true);
}

// Weapons
{
  const ls = weapon('Longsword');
  check('longsword from the data', `${ls.proficiency} ${ls.group} ${ls.damage.m} ${ls.threat}/${ls.multiplier} ${ls.price_gp}`, 'martial one-handed 1d8 19/2 15');
  check('rapier works with Weapon Finesse', weapon('Rapier').finesse, true);
  check('longsword does not', ls.finesse, false);
  check('dagger is a thrown light weapon', `${weapon('Dagger').group} ${weapon('Dagger').thrown}`, 'light true');
  check('heavy crossbow merged with "Crossbow, Heavy"', weapon('Heavy Crossbow').also_in?.includes('Core Rulebook'), true);

  const fighterProf = proficiencyTest(cls('fighter'), race('human'));
  check('fighter: martial weapons', fighterProf(ls), true);
  check('fighter: simple weapons too ("simple and martial weapons")', fighterProf(weapon('Dagger')), true);
  check('everyone with simple weapons can use an unarmed strike', fighterProf(weapon('Unarmed Strike')), true);
  check('fighter: not exotic', fighterProf(weapon('Bastard Sword')), false);
  const wizProf = proficiencyTest(cls('wizard'), race('human'));
  check('wizard: dagger (named in class text)', wizProf(weapon('Dagger')), true);
  check('wizard: heavy crossbow (named)', wizProf(weapon('Heavy Crossbow')), true);
  check('wizard: not a longsword', wizProf(ls), false);
  const elfWiz = proficiencyTest(cls('wizard'), race('elf'));
  check('elf wizard: longbow from weapon familiarity', elfWiz(weapon('Longbow')), true);
  check('elf wizard: composite longbow too', elfWiz(weapon('Composite Longbow')), true);
  check('elf fighter: elven curve blade counts as martial', proficiencyTest(cls('fighter'), race('elf'))(weapon('Elven Curve Blade')), true);
  check('human fighter: elven curve blade is exotic', fighterProf(weapon('Elven Curve Blade')), false);
  check('gunslinger: firearms', proficiencyTest(cls('gunslinger'), race('human'))(weapon('Pistol')), true);
  check('fighter: no firearms', fighterProf(weapon('Pistol')), false);

  check('Str to damage: two-handed ×1.5', strToDamage(weapon('Greatsword'), 3), 4);
  check('Str to damage: one-handed', strToDamage(ls, 3), 3);
  check('Str to damage: longbow bonus ignored', strToDamage(weapon('Longbow'), 3), 0);
  check('Str to damage: longbow penalty applies', strToDamage(weapon('Longbow'), -1), -1);
  check('Str to damage: composite longbow', strToDamage(weapon('Composite Longbow'), 3), 3);
  check('Str to damage: crossbow none', strToDamage(weapon('Heavy Crossbow'), 3), 0);
  check('Str to damage: javelin (thrown)', strToDamage(weapon('Javelin'), 2), 2);
  check('formatDamage', `${formatDamage('1d8', 4)} / ${formatDamage('1d6 fire', 0)} / ${formatDamage('1d4', -1)}`, '1d8+4 / 1d6 fire / 1d4-1');

  // Human fighter 6, Str 18 (+4), Dex 14 (+2): BAB +6/+1
  const mod = { str: 4, dex: 2 };
  const a = weaponAttack({ weapon: ls, bab: [6, 1], mod, entry: { enh: 1, focus: true, spec: true },
                           haveFeats: ['Weapon Focus', 'Weapon Specialization'] });
  check('+1 longsword with Focus: +6 +4 Str +1 magic +1 focus', a.attacks.join('/'), '12/7');
  check('+1 longsword with Specialization: 1d8+4+1+2', a.damage, '1d8+7');
  const noFeat = weaponAttack({ weapon: ls, bab: [6, 1], mod, entry: { focus: true } });
  check('Focus flag without the feat adds nothing', noFeat.attacks.join('/'), '10/5');
  check('masterwork: +1 attack, no damage', weaponAttack({ weapon: ls, bab: [1], mod, entry: { masterwork: true } }).attacks[0] +
        ' ' + weaponAttack({ weapon: ls, bab: [1], mod, entry: { masterwork: true } }).damage, '6 1d8+4');
  check('not proficient: -4', weaponAttack({ weapon: weapon('Bastard Sword'), bab: [1], mod, proficient: false }).attacks[0], 1);
  const rapier = weaponAttack({ weapon: weapon('Rapier'), bab: [1], mod: { str: 0, dex: 3 }, haveFeats: ['Weapon Finesse'] });
  check('Weapon Finesse uses Dex for a rapier', `${rapier.attacks[0]} ${rapier.abilityUsed} ${rapier.damage}`, '4 dex 1d6');
  check('longbow uses Dex, no Str damage', `${weaponAttack({ weapon: weapon('Longbow'), bab: [1], mod }).attacks[0]} ${weaponAttack({ weapon: weapon('Longbow'), bab: [1], mod }).damage}`, '3 1d8');
  check('Small size: +1 attack, Small damage dice', `${weaponAttack({ weapon: ls, bab: [1], mod, sizeAttack: 1, size: 'Small' }).attacks[0]} ` +
        weaponAttack({ weapon: ls, bab: [1], mod, sizeAttack: 1, size: 'Small' }).damage, '6 1d6+4');
  check('greatsword two-handed Str', weaponAttack({ weapon: weapon('Greatsword'), bab: [1], mod }).damage, '2d6+6');
  check('a Str penalty isn\'t multiplied two-handed', strToDamage(weapon('Greatsword'), -1), -1);

  // Combat options
  const pa = { powerAttack: true, deadlyAim: true, rapidShot: true };
  const paLs = weaponAttack({ weapon: ls, bab: [1], mod, haveFeats: ['Power Attack'], options: pa });
  check('Power Attack at BAB +1: -1 attack, +2 damage', `${paLs.attacks[0]} ${paLs.damage}`, '4 1d8+6');
  check('Power Attack two-handed: +3 damage', weaponAttack({ weapon: weapon('Greatsword'), bab: [1], mod, haveFeats: ['Power Attack'], options: pa }).damage, '2d6+9');
  check('Power Attack at BAB +8: -3 / +6', weaponAttack({ weapon: ls, bab: [8, 3], mod, haveFeats: ['Power Attack'], options: pa }).attacks.join('/') +
        ' ' + weaponAttack({ weapon: ls, bab: [8, 3], mod, haveFeats: ['Power Attack'], options: pa }).damage, '9/4 1d8+10');
  check('Power Attack switched on without the feat does nothing', weaponAttack({ weapon: ls, bab: [1], mod, options: pa }).damage, '1d8+4');
  check('Power Attack doesn\'t apply to a bow', weaponAttack({ weapon: weapon('Longbow'), bab: [1], mod, haveFeats: ['Power Attack'], options: pa }).damage, '1d8');
  const bow = weaponAttack({ weapon: weapon('Longbow'), bab: [6, 1], mod: { str: 0, dex: 3 }, haveFeats: ['Deadly Aim', 'Rapid Shot'], options: pa });
  check('Deadly Aim + Rapid Shot at BAB +6', `${bow.attacks.join('/')} ${bow.damage}`, '5/5/0 1d8+4');
  check('two-weapon penalties', ['00', '01', '10', '11'].map(k => Object.values(twoWeaponPenalties(k[0] === '1', k[1] === '1')).join('/')).join(' '),
        '-6/-10 -4/-4 -4/-8 -2/-2');
  const twf = twoWeaponAttack({ bab: [6, 1], mod, haveFeats: ['Two-Weapon Fighting', 'Improved Two-Weapon Fighting'],
                                main: { weapon: ls }, off: { weapon: weapon('Shortsword') } });
  check('longsword + short sword, TWF and Improved TWF', `${twf.main.attacks.join('/')} ${twf.main.damage}; ${twf.off.attacks.join('/')} ${twf.off.damage}`,
        '8/3 1d8+4; 8/3 1d6+2');
  const twoLong = twoWeaponAttack({ bab: [1], mod, main: { weapon: ls }, off: { weapon: ls } });
  check('two longswords without the feat: -6 / -10', `${twoLong.main.attacks[0]} ${twoLong.off.attacks[0]}`, '-1 -5');
  const tbs = weapon('Two-Bladed Sword');
  const dbl = twoWeaponAttack({ bab: [1], mod, haveFeats: ['Two-Weapon Fighting', 'Double Slice'], main: { weapon: tbs, end: 0 }, off: { weapon: tbs, end: 1 } });
  check('two-bladed sword as two weapons, Double Slice', `${dbl.main.attacks[0]} ${dbl.main.damage}; ${dbl.off.attacks[0]} ${dbl.off.damage}`, '3 1d8+4; 3 1d8+4');
  check('dwarven urgrosh other end', weaponAttack({ weapon: weapon('Dwarven Urgrosh'), bab: [1], mod, hand: 'off', end: 1 }).damage, '1d6+2');
  check('double weapon held two-handed shows one end', weaponAttack({ weapon: tbs, bab: [1], mod }).damage, '1d8+6');
  check('monk 1 flurry', flurryBabs('monk', 1, 0, 0).map(b => b - 2).join('/'), '-1/-1');
  check('monk 8 flurry matches the class table', flurryBabs('monk', 8, 6, 6).map(b => b - 2).join('/'), '6/6/1/1');
  check('monk 15 flurry matches the class table', flurryBabs('monk', 15, 11, 11).map(b => b - 2).join('/'), '13/13/8/8/3/3');
  check('fighter 4 / monk 4 flurry', flurryBabs('monk', 4, 3, 7).join('/'), '8/8/3');
  check('brawler 1 has no flurry', flurryBabs('brawler', 1, 1, 1), null);
  check('brawler 8 flurry', flurryBabs('brawler', 8, 8, 8).join('/'), '8/8/3/3');
  const flurry = weaponAttack({ weapon: weapon('Quarterstaff'), bab: flurryBabs('monk', 1, 0, 0), mod, hand: 'flurry', penalty: -2 });
  check('flurry with a quarterstaff: full Str, not 1-1/2', `${flurry.attacks.join('/')} ${flurry.damage}`, '3/3 1d6+4');

  check('longsword price', weaponCost(ls), 15);
  check('masterwork longsword', weaponCost(ls, { masterwork: true }), 315);
  check('+2 longsword: 15 + 300 + 8,000', weaponCost(ls, { enh: 2 }), 8315);
}

// Multiclassing
{
  const f = cls('fighter'), r = cls('rogue'), w = cls('wizard'), c = cls('cleric');
  const levels = [f, f, f, r, r];
  check('class counts', classCounts(levels).map(e => `${e.cls.id} ${e.level}`).join(', '), 'fighter 3, rogue 2');
  check('babList 11', babList(11).join('/'), '11/6/1');
  check('babList 0', babList(0).join('/'), '0');
  check('babList 20', babList(20).join('/'), '20/15/10/5');

  const s = characterStats({ race: race('human'), classLevels: levels, baseScores: scores(10, 10, 10, 10, 10, 10), flexibleChoice: 'str' });
  check('fighter 3 / rogue 2 BAB (3 + 1)', s.bab.join('/'), '4');
  check('fighter 3 / rogue 2 Fort (3 + 0)', s.fort, 3);
  check('fighter 3 / rogue 2 Ref (1 + 3)', s.ref, 4);
  check('fighter 3 / rogue 2 Will (1 + 0)', s.will, 1);
  check('fighter 3 / rogue 2 HP (10 + 6 + 6 + 5 + 5)', s.hp, 32);
  const fav = (favoredClassId) => characterStats({ race: race('human'), classLevels: levels, baseScores: scores(10, 10, 10, 10, 10, 10),
                                                   flexibleChoice: 'str', favoredHp: true, favoredClassId }).hp;
  check('favored class fighter: +3 HP', fav('fighter'), 35);
  check('favored class rogue: +2 HP', fav('rogue'), 34);
  check('single-class call still works', characterStats({ race: race('dwarf'), cls: f, level: 20, baseScores: scores(15, 12, 14, 10, 12, 9) }).hp, 184);

  check('skill ranks per level class (3 × 3 + 9 × 2)',
        skillRanksAvailable({ race: race('human'), classLevels: levels, baseScores: scores(10, 10, 10, 10, 10, 10), flexibleChoice: 'str' }), 27);
  check('favored skill ranks only for favored class levels',
        skillRanksAvailable({ race: race('human'), classLevels: levels, favoredClassId: 'rogue', favoredSkill: true,
                              baseScores: scores(10, 10, 10, 10, 10, 10), flexibleChoice: 'str' }), 29);
  const both = classSkillTest([f, r]);
  check('class skills combine: Acrobatics (rogue)', both('Acrobatics'), true);
  check('class skills combine: Climb (both)', both('Climb'), true);
  check('class skills combine: Spellcraft (neither)', both('Spellcraft'), false);

  check('feat slots for fighter 3 / rogue 2',
        featSlots({ race: race('human'), classLevels: levels }).map(x => x.id).join(' '), 'L1 L3 L5 race class-fighter-L1 class-fighter-L2');
  const names = allFeats.map(x => x.name);
  const ctxFor = lv => {
    const counts = classCounts(lv);
    const st = characterStats({ race: race('human'), classLevels: lv, baseScores: scores(16, 14, 10, 14, 14, 10), flexibleChoice: 'str' });
    return featContext({ race: race('human'), counts, scores: st.scores, bab: st.bab[0],
                         haveFeats: [...grantedFeatsFor(counts, names), ...proficiencyFeatsFor(counts.map(e => e.cls))] });
  };
  const fighter4 = { type: 'class_level', class: 'fighter', value: 4 };
  check('fighter 3 / rogue 2 is not fighter level 4', checkPrereq(fighter4, ctxFor(levels), {}).status, 'unmet');
  check('fighter 4 / rogue 1 is', checkPrereq(fighter4, ctxFor([f, f, f, f, r]), {}).status, 'met');
  check('levelsIn counts one class', levelsIn(ctxFor(levels), 'rogue'), 2);
  check('class feature from the second class (sneak attack)',
        checkPrereq({ type: 'class_feature', feature: 'sneak attack' }, ctxFor(levels), {}).status, 'met');
  check('proficiencies combine (wizard + fighter: heavy armor)', proficiencyFeatsFor([w, f]).includes('Armor Proficiency, Heavy'), true);

  // Spellcasting across classes and prestige classes
  const mt = cls('mystic-theurge'), ek = cls('eldritch-knight');
  const theurge = classCounts([c, c, c, w, w, w, mt, mt]);
  const cast = castingClasses(theurge);
  check('mystic theurge 2 raises both cleric and wizard', cast.casting.map(x => `${x.cls.id} ${x.classLevel}->${x.effectiveLevel}`).join(', '),
        'cleric 3->5, wizard 3->5');
  const knight = classCounts([f, w, w, w, w, w, ek, ek, ek]);
  check('eldritch knight 3 adds 2 (none at 1st)', castingClasses(knight).casting.map(x => `${x.cls.id} ${x.effectiveLevel}`).join(), 'wizard 7');
  const sorcWiz = classCounts([w, w, w, cls('sorcerer'), cls('sorcerer'), cls('sorcerer'), ek, ek]);
  check('advance goes to the first arcane class by default', castingClasses(sorcWiz).casting.map(x => `${x.cls.id} ${x.effectiveLevel}`).join(', '), 'wizard 4, sorcerer 3');
  const slotKey = advanceSlots(sorcWiz)[0].key;
  check('advance can go to another class', castingClasses(sorcWiz, { [slotKey]: 'sorcerer' }).casting.map(x => `${x.cls.id} ${x.effectiveLevel}`).join(', '), 'wizard 3, sorcerer 4');

  // Prestige requirements
  const aa = parseRequirement({ name: 'Feats', text: 'Point Blank Shot, Precise Shot, Weapon Focus (longbow or shortbow).' });
  check('requirement feats', aa.map(p => p.feat).join(' | '), 'Point Blank Shot | Precise Shot | Weapon Focus');
  check('requirement "A or B" feats', parseRequirement({ name: 'Feats', text: 'Alignment Channel or Elemental Channel.' })[0].type, 'any_of');
  check('requirement skills', JSON.stringify(parseRequirement({ name: 'Skills', text: 'Disguise 2 ranks, Stealth 5 ranks.' })),
        '[{"type":"skill","skill":"Disguise","ranks":2},{"type":"skill","skill":"Stealth","ranks":5}]');
  check('requirement spells (two traditions)', parseRequirement({ name: 'Spells', text: 'Able to cast 2nd-level divine spells and 2nd-level arcane spells.' })
        .map(p => `${p.tradition} ${p.level}`).join(', '), 'divine 2, arcane 2');
  check('requirement alignment can\'t be checked', parseRequirement({ name: 'Alignment', text: 'Any evil.' })[0].type, 'text');

  const before = [c, c, c, w, w, w];
  const bctx = ctxFor(before);
  const bcast = castingByTradition(castingClasses(classCounts(before)).casting, bctx.scores);
  check('cleric 3 / wizard 3 casts 2nd-level spells of both kinds', `${bcast.arcane} ${bcast.divine}`, '2 2');
  const mtCheck = checkRequirements(mt, { ...bctx, skillRanks: { 'Knowledge (arcana)': 3, 'Knowledge (religion)': 3 } }, bcast, false);
  check('mystic theurge requirements met', mtCheck.status, 'met');
  const noSkills = checkRequirements(mt, { ...bctx, skillRanks: {} }, bcast, false);
  check('...not without the skill ranks', noSkills.status, 'unmet');
  const ekWizard = checkRequirements(ek, ctxFor([w, w, w, w, w]), castingByTradition(castingClasses(classCounts([w, w, w, w, w])).casting,
                                     ctxFor([w, w, w, w, w]).scores), false);
  check('eldritch knight: wizard 5 lacks martial proficiency', ekWizard.parts.find(p => /martial/.test(p.why)).status, 'unmet');
}

{
  // Rules accuracy
  check('kobold +1 natural armor', JSON.stringify(racialAc(race('kobold'))), '{"natural":1,"dodge":0}');
  check('kasatha +2 dodge', JSON.stringify(racialAc(race('kasatha'))), '{"natural":0,"dodge":2}');
  check('dwarf: giant-only dodge bonus left out', JSON.stringify(racialAc(race('dwarf'))), '{"natural":0,"dodge":0}');
  const kob = characterStats({ race: race('kobold'), cls: cls('fighter'), level: 1, baseScores: scores(10, 14, 10, 10, 10, 10) });
  // Kobold: Dex 16 (+3), Small +1, natural +1 -> 15; touch 14; flat-footed 12
  check('kobold AC / touch / flat-footed', `${kob.ac} ${kob.touch} ${kob.flatFooted}`, '15 14 12');
  const kas = characterStats({ race: race('kasatha'), cls: cls('fighter'), level: 1, baseScores: scores(10, 10, 10, 10, 10, 10) });
  check('kasatha dodge: AC / touch / flat-footed', `${kas.ac} ${kas.touch} ${kas.flatFooted}`, '13 13 10');
  check('a monk is proficient with unarmed strikes', proficiencyTest(cls('monk'), race('human'))(weapon('Unarmed Strike')), true);
  check('Small monk unarmed damage', ['1d6', '1d8', '1d10', '2d6', '2d8', '2d10'].map(d => unarmedForSize(d, 'Small')).join(' '),
        '1d4 1d6 1d8 1d10 2d6 2d8');
  check('Medium monk unarmed damage unchanged', unarmedForSize('1d8', 'Medium'), '1d8');
  const leather = armorEffects({ armor: armorById('leather'), shield: armorById('light-steel-shield') });
  const failure = counts => spellFailureByClass(leather, classCounts(counts)).map(e => `${e.cls.id} ${e.chance}`).join(', ');
  check('leather + light shield: bard only the shield counts... none (bards can use shields)', failure([cls('bard')]), 'bard 0');
  check('...magus: the shield counts', failure([cls('magus')]), 'magus 5');
  check('...wizard: both', failure([cls('wizard')]), 'wizard 15');
  check('...cleric: no arcane spells', failure([cls('cleric')]), '');
  const chain = armorEffects({ armor: armorById('chainmail') });
  check('magus 6 in chainmail (medium) fails, magus 7 doesn\'t',
        `${spellFailureByClass(chain, classCounts(Array(6).fill(cls('magus'))))[0].chance} ${spellFailureByClass(chain, classCounts(Array(7).fill(cls('magus'))))[0].chance}`, '30 0');
  check('Small armor weighs half', equipmentTotals([], new Map(), { armor: armorById('chainmail'), size: 'Small' }).weight, 20);
  const fr = [cls('fighter'), cls('rogue'), cls('fighter'), cls('fighter')];
  check('fighter bonus feat 2 comes at character level 3 (fighter/rogue/fighter)',
        slotCharacterLevel({ kind: 'class', clsId: 'fighter', level: 2 }, fr), 3);
  check('general slots count character levels', slotCharacterLevel({ kind: 'general', level: 3 }, fr), 3);
}

{
  // Data gaps
  check('arcanist 1 prepares 4 cantrips and 2 first-level spells',
        spellsPerDay({ cls: cls('arcanist'), level: 1, scores: scores(10, 10, 10, 16, 10, 10) }).rows.map(r => `${r.spellLevel}:${r.prepared}`).join(' '),
        '0:4 1:2');
  check('arcanist 20 prepares 3 ninth-level spells',
        spellsPerDay({ cls: cls('arcanist'), level: 20, scores: scores(10, 10, 10, 30, 10, 10) }).rows.at(-1).prepared, 3);
  check('wizard has no prepared column', spellsPerDay({ cls: cls('wizard'), level: 1, scores: scores(10, 10, 10, 16, 10, 10) }).rows[1].prepared, null);
  check('Skill Focus: +3', featSkillBonus(['Skill Focus (Stealth)'], 'Stealth', 4), 3);
  check('Skill Focus: +6 at 10 ranks', featSkillBonus(['Skill Focus (Stealth)'], 'Stealth', 10), 6);
  check('Skill Focus for another skill', featSkillBonus(['Skill Focus (Stealth)'], 'Perception', 4), 0);
  check('Improved Critical: longsword', improvedCritical(weapon('Longsword')), '17-20/×2');
  check('Improved Critical: battleaxe', improvedCritical(weapon('Battleaxe')), '19-20/×3');
  check('Improved Critical: rapier', improvedCritical(weapon('Rapier')), '15-20/×2');
  check('no separate masterwork backpack', gearById.has('backpack-masterwork'), false);
  const items = await fetch('data/magic-items.json').then(r => r.json());
  const bag = items.find(i => i.name === 'Bag of Holding');
  check('bag of holding type II', JSON.stringify(magicItemStats(bag, 'Type II')), '{"price_gp":5000,"weight_lbs":25}');
  check('bag of holding without a type uses type I', magicItemStats(bag).price_gp, 2500);
}

{
  // Using the app: combat maneuvers for the sheet, export/import format
  const ftr = characterStats({ race: race('human'), cls: cls('fighter'), level: 4, baseScores: scores(16, 14, 10, 10, 10, 10), flexibleChoice: 'str' });
  // BAB 4, Str 18 (+4), Dex +2: CMB 8, CMD 10 + 4 + 4 + 2 = 20
  check('human fighter 4 CMB / CMD', JSON.stringify(combatManeuvers(ftr, 'Medium')), '{"cmb":8,"cmd":20,"maneuvers":[]}');
  const trip = combatManeuvers(ftr, 'Medium', ['Improved Trip', 'Greater Trip']).maneuvers[0];
  check('Improved + Greater Trip: +4 CMB, +2 CMD against trips', `${trip.name} ${trip.cmb} ${trip.cmd}`, 'Trip 12 22');
  check('Agile Maneuvers uses Dex if higher', combatManeuvers(ftr, 'Medium', ['Agile Maneuvers']).cmb, 8);
  const agile = characterStats({ race: race('human'), cls: cls('rogue'), level: 4, baseScores: scores(10, 16, 10, 10, 10, 10), flexibleChoice: 'dex' });
  check('rogue with Agile Maneuvers: BAB 3 + Dex 4', combatManeuvers(agile, 'Medium', ['Agile Maneuvers']).cmb, 7);
  const monk5 = characterStats({ race: race('human'), cls: cls('monk'), level: 5, baseScores: scores(14, 10, 10, 10, 10, 10), flexibleChoice: 'str' });
  check('monk 5 maneuver training: level 5 instead of BAB 3', combatManeuvers(monk5, 'Medium').cmb, 8);
  check('current hp: full when not tracked, capped at max', `${currentHp(null, 20)} ${currentHp(25, 20)} ${currentHp(7, 20)}`, '20 20 7');
  check('damage and healing (healing stops at max)', `${changeHp(null, 20, -8)} ${changeHp(12, 20, 5)} ${changeHp(18, 20, 10)}`, '12 17 20');
  check('0 disabled, below 0 dying, -Con dead', ['5', '0', '-3', '-12'].map(h => hpStatus(Number(h), 12) || 'ok').join(' '), 'ok disabled dying dead');
  const cl5 = characterStats({ race: race('human'), cls: cls('cleric'), level: 5, baseScores: scores(10, 10, 10, 10, 14, 14), flexibleChoice: 'wis' });
  // Cleric 5, Cha 14 (+2): 3d6, DC 10 + 2 + 2 = 14, 3 + 2 = 5/day
  check('cleric 5 channel energy', JSON.stringify(channelEnergy(cl5).map(c => [c.dice, c.dc, c.uses])), '[["3d6",14,5]]');
  check('Improved Channel adds 2 to the DC', channelEnergy(cl5, ['Improved Channel'])[0].dc, 16);
  const pal4 = characterStats({ race: race('human'), cls: cls('paladin'), level: 4, baseScores: scores(14, 10, 10, 10, 10, 14), flexibleChoice: 'cha' });
  // Paladin 4, Cha 16 (+3): 2d6, DC 10 + 2 + 3 = 15, lay on hands 2 + 3 = 5 uses -> 2 channels
  check('paladin 4 channel energy', JSON.stringify(channelEnergy(pal4).map(c => [c.source, c.dice, c.dc, c.uses])), '[["Paladin","2d6",15,2]]');
  const pal3 = characterStats({ race: race('human'), cls: cls('paladin'), level: 3, baseScores: scores(14, 10, 10, 10, 10, 14), flexibleChoice: 'cha' });
  check('paladin 3 has no channel yet', channelEnergy(pal3).length, 0);
  // Paladin 4, Cha 16 (+3): lay on hands 2d6, 2 + 3 = 5 per day
  check('paladin 4 lay on hands', JSON.stringify(layOnHands(pal4)), '[{"name":"Lay on hands","dice":"2d6","uses":5,"heals":true}]');
  // Paladin 4, Cha 16 (+3): smite +3 attack, +4 damage (+8 first hit), +3 deflection, 2/day (1 + 1 at 4th)
  check('paladin 4 smite evil', JSON.stringify(smite(pal4)), '[{"name":"Smite evil","attack":3,"damage":4,"firstHit":8,"deflection":3,"uses":2}]');
  const lsw = weaponAttack({ weapon: weapon('Longsword'), bab: [4], mod: pal4.mod, penalty: 3, bonusDamage: 4 });
  check('smite on a longsword: +3 to hit, +4 damage', `${lsw.attacks[0]} ${lsw.damage}`, '9 1d8+6');
  check('paladin 1 has no lay on hands yet', layOnHands(characterStats({ race: race('human'), cls: cls('paladin'), level: 1,
        baseScores: scores(14, 10, 10, 10, 10, 14), flexibleChoice: 'cha' })).length, 0);
  const wp7 = characterStats({ race: race('human'), cls: cls('warpriest'), level: 7, baseScores: scores(14, 10, 10, 10, 14, 10), flexibleChoice: 'wis' });
  check('warpriest 7 channels as cleric 4: 2d6', channelEnergy(wp7)[0].dice, '2d6');
  check('carrying capacity Str 10, 18, 30', ['10', '18', '30'].map(s => JSON.stringify(carryingCapacity(Number(s)))).join(' '),
        '{"light":33,"medium":66,"heavy":100} {"light":100,"medium":200,"heavy":300} {"light":533,"medium":1066,"heavy":1600}');
  check('Small carries three quarters', carryingCapacity(10, 'Small').heavy, 75);
  check('loads', [30, 50, 90, 120].map(w => encumbrance(w, carryingCapacity(10)).load).join(' '), 'light medium heavy overloaded');
  check('medium load: max Dex +3, -3 check penalty', JSON.stringify(encumbrance(50, carryingCapacity(10))), '{"load":"medium","maxDex":3,"checkPenalty":-3,"slows":true}');
  check('slowed speeds', [30, 20, 40, 15].map(slowedSpeed).join(' '), '20 15 25 10');
  check('initiative: Dex +2, +4 with Improved Initiative', `${initiative(ftr)} ${initiative(ftr, ['Improved Initiative'])}`, '2 6');
  const hm = characterStats({ race: race('halfling'), cls: cls('monk'), level: 1, baseScores: scores(10, 14, 10, 10, 14, 10) });
  // Halfling monk 1: Str 8 (-1), Dex 16 (+3), Wis 14 (+2), Small. CMB 0 - 1 - 1 = -2; CMD 10 + 0 - 1 + 3 - 1 + 2 Wis = 13
  check('halfling monk 1 CMB / CMD (Small, monk Wis to CMD)', JSON.stringify(combatManeuvers(hm, 'Small')), '{"cmb":-2,"cmd":13,"maneuvers":[]}');
  const exported = exportData({ race: 'elf', classLevels: ['wizard'] });
  check('export has a format tag', exported.format, 'pf1e-builder-character');
  check('import reads an export', importData(JSON.parse(JSON.stringify(exported))).race, 'elf');
  check('import accepts a bare saved character', importData({ race: 'dwarf', classLevels: ['fighter'] }).race, 'dwarf');
  check('import refuses other JSON', importData({ hello: 1 }), null);
}

{
  // Classes from later books (Foundry data)
  const psy = spellsPerDay({ cls: cls('psychic'), level: 1, scores: scores(10, 10, 10, 16, 10, 10) });
  check('psychic casts with Int', psy.ability, 'int');
  check('psychic 1: 3 + 1 bonus first-level spells, 4 knacks and 2 first known',
        psy.rows.map(r => `${r.spellLevel}:${r.total ?? '-'}/${r.known}`).join(' '), '0:-/4 1:4/2');
  check('psychic magic is its own tradition', `${tradition('psychic')} ${tradition('medium')} ${tradition('summoner-unchained')}`, 'psychic psychic arcane');
  check('medium 1 knows two knacks, no 1st-level spells yet',
        spellsPerDay({ cls: cls('medium'), level: 1, scores: scores(10, 10, 10, 10, 10, 16) }).rows.map(r => `${r.spellLevel}:${r.known}`).join(' '), '0:2');
  check('kineticist: light armor only', proficiencyFeats(cls('kineticist')).join(', '), 'Armor Proficiency, Light');
  check('vigilante: shields but not tower shields', proficiencyFeats(cls('vigilante')).includes('Shield Proficiency') &&
        !proficiencyFeats(cls('vigilante')).includes('Tower Shield Proficiency'), true);
  check('unchained monk proficient with a kama', proficiencyTest(cls('monk-unchained'), race('human'))(weapon('Kama')), true);
  check('unchained rogue gets Weapon Finesse free', grantedFeats(cls('rogue-unchained'), 1, allFeats.map(f => f.name)).includes('Weapon Finesse'), true);
  const um4 = characterStats({ race: race('human'), cls: cls('monk-unchained'), level: 4, baseScores: scores(10, 14, 10, 10, 14, 10), flexibleChoice: 'wis' });
  check('unchained monk 4 AC: 10 + 2 Dex + 3 Wis + 1 monk', um4.ac, 16);
  check('unchained monk bonus feat slots', featSlots({ race: race('dwarf'), cls: cls('monk-unchained'), level: 6 }).filter(s => s.kind === 'class').map(s => s.id).join(' '),
        'class-monk-unchained-L1 class-monk-unchained-L2 class-monk-unchained-L6');
  check('unchained monk flurry: one extra attack at full BAB', flurryBabs('monk-unchained', 1, 1, 1).join('/'), '1/1');
  check('unchained monk 11 flurry: two extra attacks', flurryBabs('monk-unchained', 11, 11, 11).join('/'), '11/11/11/6/1');
  check('duskwalker ability changes', JSON.stringify(finalScores(scores(10, 10, 10, 10, 10, 10), race('duskwalker'))),
        '{"str":10,"dex":12,"con":8,"int":10,"wis":12,"cha":10}');
  check('duskwalker racial skills', JSON.stringify(racialSkillBonuses(race('duskwalker'))), '{"Knowledge (religion)":2,"Heal":2}');
  check('ogre is Large, vine leshy Small', `${race('ogre').size} ${race('vine-leshy').size}`, 'Large Small');
  check('every new race has size, speed and ability changes', races.filter(r => r.origin).every(r => r.size && r.base_speed && Object.keys(r.ability_modifiers).length), true);
  check('occultist 4 casts 2nd-level psychic spells', castingByTradition(castingClasses(classCounts(Array(4).fill(cls('occultist')))).casting,
        scores(10, 10, 10, 16, 10, 10)).psychic, 2);
}

{
  // Spell attack, damage and save DC
  check('fireball at CL 5 and 12', `${evalFormula('(min(10, @cl))d6', { cl: 5 })} ${evalFormula('(min(10, @cl))d6', { cl: 12 })}`, '5d6 10d6');
  check('cure light wounds at CL 3', evalFormula('1d8 + min(5, @cl)', { cl: 3 }), '1d8+3');
  check('heal at CL 11', evalFormula('min(150, @cl * 10)', { cl: 11 }), '110');
  check('per two levels: at least one die', `${evalFormula('(min(5, floor(@cl / 2)))d8', { cl: 1 })} ${evalFormula('(min(5, floor(@cl / 2)))d8', { cl: 6 })}`, '1d8 3d8');
  check('formula it can\'t read', evalFormula('sizeRoll(1, 6, @size)', {}), null);
  const allSpells = await fetch('data/spells.json').then(r => r.json());
  const sp = name => allSpells.find(s => s.name === name);
  const wiz = characterStats({ race: race('human'), cls: cls('wizard'), level: 5, baseScores: scores(10, 14, 10, 16, 10, 10), flexibleChoice: 'int' });
  const wctx = spellContext({ cls: cls('wizard'), effectiveLevel: 5, stats: wiz, size: 'Medium', featChoices: [] });
  const line = name => spellLines(sp(name), wctx).map(l => l.text).join(' | ');
  check('wizard 5 fireball: DC 10 + 3 + 4 Int', line('Fireball'), 'DC 17 Reflex half, 5d6 fire');
  check('wizard 5 magic missile: 3 missiles', line('Magic Missile'), 'hits automatically, 3 missiles of 1d4+1 force');
  check('wizard 5 scorching ray: ranged touch BAB 2 + Dex 2, one ray', line('Scorching Ray'), 'ranged touch +4, 4d6 fire');
  const focused = spellContext({ cls: cls('wizard'), effectiveLevel: 5, stats: wiz, size: 'Medium',
                                 featChoices: [{ feat: 'Spell Focus', value: 'evocation' }] });
  check('Spell Focus (evocation) adds 1 to the DC', spellLines(sp('Fireball'), focused)[0].text.slice(0, 5), 'DC 18');
  const cleric9 = characterStats({ race: race('human'), cls: cls('cleric'), level: 9, baseScores: scores(10, 10, 10, 10, 16, 10), flexibleChoice: 'wis' });
  const cctx = spellContext({ cls: cls('cleric'), effectiveLevel: 9, stats: cleric9, size: 'Medium' });
  const heal = name => spellLines(sp(name), cctx).find(l => l.roll?.groups[0].heal);
  check('cleanse heals 4d8 + CL (read from its text)', heal('Cleanse')?.text, 'heals 4d8+9');
  check('healing roll button is marked as healing', heal('Cure Moderate Wounds')?.roll.groups[0].damage, '2d8+9');
  check('hold person (wizard 3rd level): the save only', line('Hold Person').startsWith('DC 17 Will negates'), true);
}

{
  // Dice rolling (with fixed "dice" so the results are known)
  const dice = (...values) => () => values.shift();
  check('roll 1d8+4', rollDamage('1d8+4', dice(5)).text, '1d8 (5) + 4 = 9');
  check('damage is at least 1', rollDamage('1d4-3', dice(1)).total, 1);
  check('fixed healing', rollDamage('110').total, 110);
  check('several dice types', rollDamage('3d6+2d6', dice(1, 2, 3, 4, 5)).total, 15);
  check('Fortitude save roll', rollSpec({ title: 'Fortitude save', check: 'Fortitude save', groups: [{ attacks: [5] }] }, dice(14)).lines[0],
        'Fortitude save: d20 (14) + 5 = 19');
  const crit = rollSpec({ title: 'Longsword', groups: [{ attacks: [6], damage: '1d8+4', threat: 19, mult: 2 }] }, dice(19, 10, 3, 4, 5)).lines[0];
  check('critical threat is confirmed and critical damage rolled twice',
        crit, 'Attack: d20 (19) + 6 = 25, critical threat! Confirm: d20 (10) + 6 = 16 (if it hits AC, ×2 damage). Damage 1d8 (3) + 4 = 7; critical damage 1d8 (4) + 4 + 1d8 (5) + 4 = 17');
  check('damage only', rollSpec({ title: 'x', groups: [{ attacks: [], damage: '1d8+4' }] }, dice(6)).lines[0], 'damage 1d8 (6) + 4 = 10');
  check('critical damage ×3', rollSpec({ title: 'x', groups: [{ attacks: [], damage: '1d8+4', critMult: 3 }] }, dice(1, 2, 3)).lines[0],
        'critical damage (×3) 1d8 (1) + 4 + 1d8 (2) + 4 + 1d8 (3) + 4 = 18');
  check('Max Healing house rule: healing gives its maximum', rollSpec({ title: 'x', groups: [{ attacks: [], damage: '2d8+5', heal: true }] },
        dice(1, 1), { maxHealing: true }).lines[0], 'healing 2d8 (8, 8) + 5 = 21 (Max Healing)');
  check('...but not damage', rollSpec({ title: 'x', groups: [{ attacks: [], damage: '1d6' }] }, dice(2), { maxHealing: true }).lines[0], 'damage 1d6 (2) = 2');
  check('natural 1 misses', rollSpec({ title: 'x', groups: [{ attacks: [20], damage: '1d6' }] }, dice(1)).lines[0], 'Attack: d20 (1) + 20 = 21, natural 1: miss');
  check('iterative attacks each roll', rollSpec({ title: 'x', groups: [{ attacks: [6, 1], damage: '1d6' }] }, dice(10, 2, 11, 3)).lines.length, 2);
  check('magic missile: 3 missiles, no attack roll', rollSpec({ title: 'Magic Missile', groups: [{ attacks: [], damage: '1d4+1', times: 3 }] }, dice(1, 2, 3)).lines.length, 3);
  const wizard = characterStats({ race: race('human'), cls: cls('wizard'), level: 5, baseScores: scores(10, 14, 10, 16, 10, 10), flexibleChoice: 'int' });
  const spells2 = await fetch('data/spells.json').then(r => r.json());
  const fireball = spells2.find(s => s.name === 'Fireball');
  check('SR check: caster level 5', srCheck(fireball, spellContext({ cls: cls('wizard'), effectiveLevel: 5, stats: wizard, size: 'Medium' })).bonus, 5);
  check('SR check with Spell Penetration', srCheck(fireball, spellContext({ cls: cls('wizard'), effectiveLevel: 5, stats: wizard, size: 'Medium',
                                                                          haveFeats: ['Spell Penetration'] })).bonus, 7);
  check('no SR check for a spell without spell resistance', srCheck(spells2.find(s => s.name === 'Mage Armor'),
        spellContext({ cls: cls('wizard'), effectiveLevel: 5, stats: wizard, size: 'Medium' })), null);
}

{
  // Traits
  const allTraits = await fetch('data/traits.json').then(r => r.json());
  const trait = name => allTraits.find(t => t.name === name);
  check('two trait slots, three with Extra Campaign Trait', `${traitSlotCount({})} ${traitSlotCount({ extraTrait: true })}`, '2 3');
  const fx = traitEffects([trait('Reactionary'), trait('Resilient'), trait('Suspicious')]);
  check('Reactionary +2 initiative, Resilient +1 Fort, Suspicious +1 Sense Motive (class skill)',
        `${fx.initiative} ${fx.saves.fort} ${fx.skills['Sense Motive']} ${fx.classSkills.has('Sense Motive')}`, '2 1 1 true');
  const flawSlots = featSlots({ race: race('dwarf'), cls: cls('wizard'), level: 1, flaws: [{ name: 'Feeble' }, { name: '' }, { name: 'Third' }] });
  check('a named flaw gives a bonus feat slot (at most two; empty ones don\'t count)', flawSlots.map(s => s.id).join(' '), 'flaw-1 L1');
  check('trait bonuses don\'t stack: highest counts', traitEffects([trait('Resilient'), trait('Resilient')]).saves.fort, 1);
  const withTrait = skillTotal({ name: 'Sense Motive', ranks: 1, scores: scores(10, 10, 10, 10, 10, 10), isClassSkill: true,
                                 traitBonuses: fx.skills });
  check('Sense Motive: 1 rank + 3 class + 1 trait', withTrait.total, 5);
}

{
  // Items under the Race picker, each with an explanation
  const dwarf = raceTerms(race('dwarf'));
  check('dwarf items start with size, type, speed', dwarf.slice(0, 3).map(i => i.label).join(' | '), 'Medium | Humanoid | Speed 20 ft.');
  check('size explains the rule', /no size bonuses/.test(dwarf[0].text.join(' ')), true);
  check('speed uses the race\'s own trait', dwarf[2].title, 'Slow and Steady');
  check('languages come last', dwarf.at(-1).label, 'Languages');
  check('every trait is listed once', dwarf.length, race('dwarf').traits.length - 1 + 2);
  check('every item of every race has text', races.every(r => raceTerms(r).every(i => i.label && i.text.length && i.text.every(Boolean))), true);
  check('native outsider explained', raceTerms(race('aasimar'))[1].text.join(' ').includes('native'), true);
}

{
  // Hero points (Action Points house rule, Advanced Player's Guide)
  const fortune = ["Hero's Fortune"];
  check('hero points start at 1 whatever the level', heroPointsAfter(null, { levelsGained: 5 }), 1);
  check('each level gained adds 1', heroPointsAfter(1, { levelsGained: 1 }), 2);
  check('at most 3; extra points are lost', heroPointsAfter(2, { levelsGained: 4 }), 3);
  check('losing levels takes none away', heroPointsAfter(2, { levelsGained: -3 }), 2);
  check("Hero's Fortune: +1 when taken and at most 5", `${heroPointsAfter(3, { gotFortune: true, haveFeats: fortune })} ${heroPointMax(fortune)}`, '4 5');
  check('Blood of Heroes: 2 per level', heroPointsAfter(1, { levelsGained: 1, haveFeats: [...fortune, 'Blood of Heroes'] }), 3);
  check('the count stays between 0 and the maximum', `${clampHeroPoints(-1, [])} ${clampHeroPoints(9, [])}`, '0 3');
  check('a reroll costs 1', spendHeroPoint(2, 'reroll').points, 1);
  check('cheating death costs 2', spendHeroPoint(2, 'cheat-death').points, 0);
  check('cheating death needs 2 points', spendHeroPoint(1, 'cheat-death').spent, 0);
  check('Luck of Heroes keeps the point on 16+ for a reroll', spendHeroPoint(2, 'reroll', { haveFeats: ['Luck of Heroes'], d20: 16 }).points, 2);
  check('Luck of Heroes: 15 spends it', spendHeroPoint(2, 'reroll', { haveFeats: ['Luck of Heroes'], d20: 15 }).points, 1);
  check('Luck of Heroes does not help an extra action', spendHeroPoint(2, 'extra-action', { haveFeats: ['Luck of Heroes'], d20: 20 }).points, 1);
  const anti = featSlots({ race: race('dwarf'), cls: cls('wizard'), level: 1, antihero: true });
  check('an antihero gets a bonus feat at 1st level', anti.map(s => s.id).join(' '), 'antihero L1');
}

{
  // Alternate racial traits and favored class options
  const dwarf = race('dwarf'), human = race('human'), halfling = race('halfling');
  const alt = (r, name) => r.alternate_traits.find(a => a.name === name);
  check('Ancient Enmity replaces Hatred', replacedTraits(dwarf, alt(dwarf, 'Ancient Enmity')).join(), 'Hatred');
  check('Gift of Tongues replaces two gnome traits', replacedTraits(race('gnome'), alt(race('gnome'), 'Gift of Tongues')).join(), 'Defensive Training,Hatred');
  const enmity = raceWithAlternates(dwarf, ['Ancient Enmity']);
  check('the alternate takes the replaced trait\'s place', `${enmity.traits.some(t => t.name === 'Hatred')} ${enmity.traits.some(t => t.name === 'Ancient Enmity')}`, 'false true');
  check('no alternates: the same race', raceWithAlternates(dwarf, []), dwarf);
  check('unknown alternates are ignored', raceWithAlternates(dwarf, ['Nope']), dwarf);
  check('two alternates replacing the same trait conflict', alternateConflict(dwarf, alt(dwarf, 'Deep Warrior'), ['Ancient Enmity']), '');
  const second = dwarf.alternate_traits.find(a => a.name !== 'Ancient Enmity' && replacedTraits(dwarf, a).includes('Hatred'));
  check('another alternate replacing Hatred is blocked', !!(second && alternateConflict(dwarf, second, ['Ancient Enmity'])), true);
  const focused = raceWithAlternates(human, ['Focused Study']);
  check('Focused Study removes the human bonus feat slot', featSlots({ race: focused, cls: cls('fighter'), level: 1 }).some(s => s.id === 'race'), false);
  const fleet = raceWithAlternates(halfling, ['Fleet of Foot']);
  check('Fleet of Foot: base speed 30', fleet.base_speed, 30);
  const dual = raceWithAlternates(human, ['Dual Talent']);
  check('Dual Talent replaces the +2, bonus feat and Skilled', replacedTraits(human, alt(human, 'Dual Talent')).length, 3);
  const dualAdj = racialAdjustments(dual, ['str', 'con']);
  check('Dual Talent: +2 to two abilities', `${dualAdj.str} ${dualAdj.con} ${dualAdj.dex}`, '2 2 0');
  check('Dual Talent: the same ability twice counts once', racialAdjustments(dual, ['str', 'str']).str, 2);
  check('human without Dual Talent: one +2', racialAdjustments(human, 'str').str, 2);
  const leshy = race('vine-leshy');
  const agile = racialAdjustments(raceWithAlternates(leshy, ['Agile']), 'str');
  check('vine leshy Agile: +2 Dex instead of +2 Con', `${agile.con} ${agile.dex}`, '0 2');
  const lashunta = race('lashunta-male');
  check('a race type is never replaced (Lashunta)', replacedTraits(lashunta, alt(lashunta, 'Insidious Telepathy')).join(), 'Lashunta Magic');
  check('"+2 Natural Armor" is matched by "natural armor"', replacedTraits(race('ghoran'), alt(race('ghoran'), 'Natural Camouflage')).join(), '+2 Natural Armor');
  check('human fighter option', favoredOption(human, cls('fighter'))?.class, 'Fighter');
  check('unchained rogue uses the rogue option', favoredOption(human, cls('rogue-unchained'))?.class, 'Rogue');
  check('option total: 5 × +1/4 = +1 1/4', favoredOptionTotal({ text: 'Add +1/4 to the natural armor bonus.' }, 5), '+1 1/4');
  check('option total: 4 × 1/6 = +2/3', favoredOptionTotal({ text: 'Gain 1/6 of a new rage power.' }, 4), '+2/3');
  check('option total: 3 × +1 = +3', favoredOptionTotal({ text: 'Add +1 to the total number of rage rounds per day.' }, 3), '+3');
  check('option total: percent kept', favoredOptionTotal({ text: 'Reduce arcane spell failure chance by +1%. Once the total reaches 10%, ...' }, 5), '+5%');
  const f = cls('fighter'), w = cls('wizard');
  const picks = favoredChoices(human, [f, w, f, f], 'fighter', ['skill', 'skill', 'option', undefined]);
  check('favored choices: only favored class levels, missing = hp', picks.join(), 'skill,,option,hp');
  const base = { race: human, classLevels: [f, w, f, f], favoredClassId: 'fighter', baseScores: scores(10, 10, 10, 10, 10, 10), flexibleChoice: 'str' };
  check('favored picks: 1 HP level', characterStats({ ...base, favoredPicks: picks }).hp - characterStats(base).hp, 1);
  check('favored picks: 1 skill rank level', skillRanksAvailable({ ...base, favoredPicks: picks }) - skillRanksAvailable(base), 1);
}

{
  // Archetypes
  const archetypes = await fetch('data/archetypes.json').then(r => r.json());
  const arch = id => archetypes.find(a => a.id === id);
  const fighter = cls('fighter');
  const thf = arch('fighter-two-handed-fighter');
  check('Two-Handed Fighter replaces every bravery step and armor training 1-4',
        replacedEntries(fighter, thf).map(e => e.level).join(), '2,3,6,7,10,11,14,15,18,19');
  check('Two-Handed Fighter and Armor Master clash over bravery', /bravery/.test(archetypeConflict(fighter, arch('fighter-armor-master'), [thf])), true);
  check('Two-Handed Fighter and Crossbowman ... are fine together or clash for a reason', typeof archetypeConflict(fighter, arch('fighter-crossbowman'), [thf]), 'string');
  const changed = classWithArchetypes(fighter, [thf]);
  check('replaced entries leave the class table', changed.progression[1].special.some(s => /bravery/i.test(s)), false);
  check('the archetype feature is listed at its level', changed.progression[2].archetype_features.map(f => f.name).join(), 'Overhand Chop');
  check('fighter bonus feats stay', featSlots({ race: race('human'), classLevels: [changed, changed], cls: changed }).filter(s => s.kind === 'class').length, 2);
  check('no archetypes: the same class', classWithArchetypes(fighter, []), fighter);
  const zen = classWithArchetypes(cls('monk'), [arch('monk-zen-archer')]);
  check('Zen Archer keeps the monk bonus feat entries (it changes the list)', zen.progression[0].special.some(s => /bonus feat/i.test(s)), true);
  check('Zen Archer loses stunning fist', zen.progression[0].special.some(s => /stunning fist/i.test(s)), false);
  const cad = classWithArchetypes(fighter, [arch('fighter-cad')]);
  check('Cad: Bluff becomes a class skill, Climb stops being one',
        `${classSkillTest(cad)('Bluff')} ${classSkillTest(cad)('Climb')}`, 'true false');
  check('Cad: no heavy armor proficiency', proficiencyFeats(cad).includes('Armor Proficiency, Heavy'), false);
  check('Cad: still light armor', proficiencyFeats(cad).includes('Armor Proficiency, Light'), true);
  check('Urban Barbarian: Diplomacy in, Survival out',
        `${classSkillTest(classWithArchetypes(cls('barbarian'), [arch('barbarian-urban-barbarian')]))('Diplomacy')} ${classSkillTest(classWithArchetypes(cls('barbarian'), [arch('barbarian-urban-barbarian')]))('Survival')}`, 'true false');
  check('proficiency text: tower shields removed', /except tower shields/.test(changedProficiency('all armor (heavy, light, and medium) and shields (including tower shields)', { remove: ['tower shields'] })), true);
  check('Rogue Talents (extra choices) is listed where rogue talents start', featureLevel(cls('rogue'), arch('rogue-scout').features.find(f => f.name === 'Rogue Talents')), 2);
  check('Hedge Witch Major Hexes (extra choices) is listed where major hexes start', featureLevel(cls('witch'), arch('witch-hedge-witch').features.find(f => f.name === 'Major Hexes')), 10);
  check('every archetype belongs to a known class', archetypes.every(a => classes.some(c => c.id === a.class)), true);
  const ur = cls('rogue-unchained');
  check('the unchained rogue is offered rogue archetypes', archetypesFor('rogue-unchained', archetypes).some(a => a.class === 'rogue'), true);
  check('a rogue archetype replacing trap sense fits the unchained rogue (danger sense)', unchainedGaps(cls('rogue'), ur, arch('rogue-scout')).length, 0);
  check('...and replaces danger sense there', replacedEntries(ur, { features: [{ name: 'x', replaces: ['trap sense'] }] }).map(e => e.name).join(), 'Danger Sense');
  const um = cls('monk-unchained'), monk = cls('monk');
  const zenFit = unchainedFit(monk, um, arch('monk-zen-archer'));
  check('Zen Archer on the unchained monk: allowed, trading ki powers for the abilities it lacks', `${zenFit.why === ''} ${zenFit.kiPowers > 0}`, 'true true');
  const trades = kiPowerTrades(monk, um, [arch('monk-zen-archer')]).trades;
  check('each traded ability takes a different ki power, gained at or after its level',
        trades.every((t, i) => t.level >= 4 && trades.findIndex(x => x.level === t.level) === i), true);
  const qing = arch('monk-qinggong-monk'), asp = arch('monk-black-asp');
  const both = kiPowerTrades(monk, um, [qing, asp]);
  check('two archetypes needing more than the 9 ki powers: some abilities are short', both.short.length > 0 || both.trades.length <= 9, true);
  check('the traded ki powers show as replaced in the class table',
        classWithArchetypes(um, [arch('monk-zen-archer')], trades).progression.some(r => (r.replaced || []).some(x => /ki power/.test(x))), true);
  check('feature text: "bravery +1" finds Bravery', /Will saves against fear/.test(featureDescription(cls('fighter'), 'bravery +1')), true);
  check('feature text: a bard performance inside Bardic Performance', /counter magic effects/.test(featureDescription(cls('bard'), 'countersong')), true);
  check('feature text: "Summon monster II" finds Summon Monster I', /summon monster I/.test(featureDescription(cls('summoner'), 'Summon monster II')), true);
  check('ordinal', `${ordinal(1)} ${ordinal(2)} ${ordinal(3)} ${ordinal(11)} ${ordinal(12)} ${ordinal(22)}`, '1st 2nd 3rd 11th 12th 22nd');
  check('the unchained barbarian is offered barbarian archetypes, not rogue ones',
        archetypesFor('barbarian-unchained', archetypes).every(a => ['barbarian', 'barbarian-unchained'].includes(a.class)), true);
}

{
  // Magic item creation (Core Rulebook)
  const p1 = magicArmsPrice({ kind: 'weapon', enh: 1, abilities: [{ bonus: 1 }], abilityCls: [10] });
  check('+1 flaming weapon: +2 in all, 8,000 gp magic, caster level 10', `${p1.effective} ${p1.base} ${p1.casterLevel}`, '2 8000 10');
  check('armor bonuses cost half as much: +3 armor 9,000 gp', magicArmsPrice({ kind: 'armor', enh: 3 }).base, 9000);
  check('abilities need +1 enhancement first', magicArmsPrice({ kind: 'weapon', enh: 0, abilities: [{ bonus: 1 }] }).errors.length, 1);
  check('at most +10 in all', magicArmsPrice({ kind: 'weapon', enh: 5, abilities: [{ bonus: 5 }, { bonus: 1 }] }).errors.length, 1);
  check('+3 enhancement needs caster level 9', magicArmsPrice({ kind: 'weapon', enh: 3 }).casterLevel, 9);
  check('flat-priced abilities add their gp', magicArmsPrice({ kind: 'armor', enh: 1, abilities: [{ gp: 3750 }] }).base, 4750);
  check('potion: 50 × spell level × caster level', spellItemPrice('potion', 1, 1).base, 50);
  check('0-level spell counts as 1/2', spellItemPrice('scroll', 0, 1).base, 12.5);
  check('wand: 750 × 2 × 3', spellItemPrice('wand', 2, 3).base, 4500);
  check('potions hold 3rd-level spells at most', spellItemPrice('potion', 4, 7).errors.length, 1);
  check('cost: half the base price + masterwork item in full', craftCost(8000, 315), 4315);
  check('time: 1 day per 1,000 gp', craftTime(8000, 'item').days, 8);
  check('time: potions of 250 gp or less take 2 hours', craftTime(50, 'potion').hours, 2);
  check('time: rushing halves it', craftTime(8000, 'item', true).hours, 32);
  check('DC: 5 + CL + 5 per unmet requirement + 5 rushed', craftDC(10, 1, true), 25);
  check('fortification comes in light/moderate/heavy', abilityOptions({ id: 'fortification', price: 'varies' }).map(o => o.bonus).join(), '1,3,5');
  check('spell resistance versions', abilityOptions({ id: 'x', price: '+2 bonus (SR 13), +3 bonus (SR 15)' }).length, 2);
  check('a flat ability price', abilityOptions({ id: 'x', price: '+3,750 gp' })[0].gp, 3750);
  const reqs = parseRequirements('Craft Magic Arms and Armor and flame blade, flame strike, or fireball', ['Craft Magic Arms and Armor'],
                                 new Map([['flame blade', 'fb'], ['flame strike', 'fs'], ['fireball', 'fire']]));
  check('requirements: the feat, then any one of three spells', reqs.map(r => r.type + (r.options ? r.options.length : '')).join(), 'feat,spells3');
  const status = checkCraftRequirements(reqs, { haveFeats: [], canCast: id => id === 'fire', casterLevel: 5, skillRanks: () => 0 });
  check('requirements checked: feat missing, one spell castable', status.map(r => r.status).join(), 'unmet,met');
  check('listed cost line per version', listedCost({ construction: { cost: '500 gp (+1), 2,000 gp (+2)' } }, '+2', 4000), 2000);
  check('no cost line: half the price', listedCost({ construction: {} }, null, 1000), 500);
  check('crafted weapon: magic at half, masterwork in full', weaponCost({ price_gp: 15 }, { enh: 1, abilities: [{ bonus: 1 }], crafted: true }), 4315);
  check('bought weapon: full price', weaponCost({ price_gp: 15 }, { enh: 1, abilities: [{ bonus: 1 }] }), 8315);
  check('magic part of a mundane item is 0', magicPart(0, [], 2000), 0);
  const fx = abilityDamage([{ id: 'flaming-burst', name: 'Flaming Burst' }, { id: 'keen', name: 'Keen' }, { id: 'holy', name: 'Holy' }]);
  check('flaming burst: +1d6 fire every hit, 1d10 fire burst; keen; holy only vs evil',
        `${fx.hit.map(x => x.dice + x.type).join()} ${fx.burst.map(x => x.dice).join()} ${fx.keen} ${fx.vs.map(v => v.vs).join()}`, '1d6fire 1d10 true evil foes');
  check('damage text with extras', damageWithExtras('1d8+3', fx), '1d8+3 plus 1d6 fire');
  const seq = [20, 20, 3, 4, 5, 6, 7, 8, 9, 10];  // attack 20, confirm 20, then damage dice
  let k = 0;
  const fixed = () => seq[k++ % seq.length];
  const r = rollSpec({ title: 't', groups: [{ attacks: [5], damage: '1d8', threat: 19, mult: 3, extra: fx.hit, burst: fx.burst }] }, fixed);
  check('a critical with a burst weapon rolls the burst dice (x3: two d10s)', /fire burst 1d10 \(\d+\) \+ 1d10/.test(r.lines[0]), true);
  check('...and the extra 1d6 fire once, not multiplied', (r.lines[0].match(/fire 1d6/g) || []).length, 2);
}

{
  // Armor proficiency read from class text (druid "light and medium armor"; bard's spell-failure sentence isn't proficiency)
  const armorOf = id => proficiencyFeats(cls(id)).filter(f => /Armor Proficiency/.test(f)).map(f => f.split(', ')[1][0]).join('');
  check('druid: light and medium armor', armorOf('druid'), 'LM');
  check('bard: light armor only', armorOf('bard'), 'L');
  check('paladin: all armor', armorOf('paladin'), 'LMH');
  check('magus: light armor only', armorOf('magus'), 'L');
  check('investigator: light armors', armorOf('investigator'), 'L');
  check('monk: none', armorOf('monk'), '');
  const byId = armorById;
  check('druid in chainmail: warned', druidMetalWarnings({ armor: byId('chainmail') }, ['druid']).length, 1);
  check('druid in hide with a wooden shield: fine', druidMetalWarnings({ armor: byId('hide'), shield: byId('light-wooden-shield') }, ['druid']).length, 0);
  check('fighter in chainmail: no druid warning', druidMetalWarnings({ armor: byId('chainmail') }, ['fighter']).length, 0);
}

// Domains: who chooses which, subdomain conflicts, and what a subdomain gives.
{
  const all = await fetch('data/domains.json').then(r => r.json());
  const byId = new Map(all.map(d => [d.id, d]));
  const ids = cid => domainChoices(cid, all).map(d => d.id);
  check('druid may take Animal', ids('druid').includes('animal'), true);
  check('druid may not take War', ids('druid').includes('war'), false);
  check('druid may take a druid domain (Wolf)', ids('druid').includes('druid-wolf'), true);
  check('druid may take the Feather subdomain (Animal)', ids('druid').includes('subdomain-feather'), true);
  check('cleric may not take druid domains', ids('cleric').includes('druid-wolf'), false);
  check('inquisitor may take an inquisition', ids('inquisitor').some(id => id.startsWith('inquisition-')), true);
  check('wizard: no domains', ids('wizard').length, 0);
  check('Feather with Animal: conflict', domainConflict(byId.get('subdomain-feather'), [byId.get('animal')]) !== '', true);
  check('Feather with War: fine', domainConflict(byId.get('subdomain-feather'), [byId.get('war')]), '');
  const g = domainGrants(byId.get('subdomain-feather'), byId);
  check('Feather keeps nine domain spells', Object.keys(g.spells).length, 9);
  check('Feather replaces one Animal power', g.powers.length, byId.get('animal').powers.length);
  check('Wolf has Improved Trip and Pack Tactics', byId.get('druid-wolf').powers.map(p => p.name).join(', '), 'Improved Trip, Pack Tactics');
}

// Special materials for armor (Core Rulebook / Ultimate Equipment).
{
  const a = id => armorById(id);
  const mc = withMaterial(a('chain-shirt'), 'mithral');
  check('mithral chain shirt: max Dex +6', mc.max_dex, 6);
  check('mithral chain shirt: check penalty 0', mc.check_penalty, 0);
  check('mithral chain shirt: spell failure 10%', mc.spell_failure, 10);
  check('mithral chain shirt: 12.5 lbs.', mc.weight_lbs, 12.5);
  check('mithral chain shirt: 1,100 gp (masterwork included)', armorCost(mc, 0, false), 1100);
  check('+1 mithral chain shirt: 2,100 gp', armorCost(mc, 1, false), 2100);
  const fp = withMaterial(a('full-plate'), 'mithral');
  check('mithral full plate: check penalty -3', fp.check_penalty, -3);
  check('mithral full plate: counts as medium', fp.move_category, 'medium');
  check('mithral full plate: still needs heavy proficiency', fp.category, 'heavy');
  check('mithral full plate: 10,500 gp', fp.price_gp, 10500);
  check('mithral breastplate: not slowed', armorEffects({ armor: withMaterial(a('breastplate'), 'mithral') }).slows, false);
  check('mithral full plate: still slowed', armorEffects({ armor: fp }).slows, true);
  check('mithral armor: the masterwork -1 is not added twice', armorEffects({ armor: fp, armorEnh: 2 }).checkPenalty, -3);
  check('adamantine breastplate: DR 2', armorEffects({ armor: withMaterial(a('breastplate'), 'adamantine') }).dr, 2);
  check('adamantine breastplate: check penalty -3', withMaterial(a('breastplate'), 'adamantine').check_penalty, -3);
  const dw = withMaterial(a('heavy-wooden-shield'), 'darkwood');
  check('darkwood heavy shield: check penalty 0', dw.check_penalty, 0);
  check('darkwood heavy shield: 257 gp (7 + 150 + 10 per lb.)', dw.price_gp, 257);
  check('dragonhide breastplate: 700 gp', withMaterial(a('breastplate'), 'dragonhide').price_gp, 700);
  check('dragonhide breastplate: a druid may wear it', druidMetalWarnings({ armor: withMaterial(a('breastplate'), 'dragonhide') }, ['druid']).length, 0);
  check('mithral chain shirt: still metal for a druid', druidMetalWarnings({ armor: mc }, ['druid']).length, 1);
  check('darkleaf leather: spell failure 5%', withMaterial(a('leather'), 'darkleaf-cloth').spell_failure, 5);
  check('gold breastplate: armor +4, penalty -6', [withMaterial(a('breastplate'), 'gold').bonus, withMaterial(a('breastplate'), 'gold').check_penalty].join(), '4,-6');
  check('no mithral leather', materialsFor(a('leather')).some(m => m.id === 'mithral'), false);
  check('leather can be eel hide', materialsFor(a('leather')).some(m => m.id === 'eel-hide'), true);
  check('a material that does not fit is ignored', withMaterial(a('leather'), 'mithral'), a('leather'));
  check('bard in a mithral breastplate: no spell failure', spellFailureByClass(armorEffects({ armor: withMaterial(a('breastplate'), 'mithral') }), [{ cls: { id: 'bard' }, level: 1 }])[0].chance, 0);
}

// Active effects: stacking and what they change.
{
  check('same type: highest counts (bless + heroism morale)', effectTotals([{ id: 'bless' }, { id: 'heroism' }]).attack, 2);
  check('different types add (heroism morale + prayer luck + haste)', effectTotals([{ id: 'heroism' }, { id: 'prayer' }, { id: 'haste' }]).attack, 4);
  check('dodge bonuses stack', stackTotal([{ type: 'dodge', value: 1 }, { type: 'dodge', value: 1 }]), 2);
  check('penalties all count', stackTotal([{ type: 'morale', value: 2 }, { type: 'untyped', value: -2 }, { type: 'untyped', value: -1 }]), -1);
  check('all saves reach each save', effectTotals([{ id: 'resistance' }]).will, 1);
  check('resistance on all saves and on one: highest', effectTotals([{ id: 'resistance' }], [{ name: 'cloak', target: 'fort', type: 'resistance', value: 2 }]).fort, 2);
  check('custom effect switched off is ignored', effectTotals([], [{ target: 'attack', type: 'luck', value: 2, on: false }]).attack, 0);
  check('shield of faith CL 12: +4', effectTotals([{ id: 'shield-of-faith', cl: 12 }]).ac.deflection, 4);
  check('barkskin CL 12: +5', effectTotals([{ id: 'barkskin', cl: 12 }]).ac['natural armor enhancement'], 5);
  check('inspire courage, bard 5: +2', effectTotals([{ id: 'inspire-courage', cl: 5 }]).damage, 2);
  check('enlarge person: one size up', shiftSize('Medium', effectTotals([{ id: 'enlarge-person' }]).size), 'Large');
  const ac = acWithEffects({ armor: 4, natural: 0, dex: 2 }, { armor: 4, deflection: 2, 'natural armor enhancement': 2, dodge: 1 });
  check('mage armor with a chain shirt: armor counts once', ac.ac, 10 + 4 + 2 + 2 + 2 + 1);
  check('touch leaves out armor and natural armor', ac.touch, 10 + 2 + 2 + 1);
  check('flat-footed leaves out Dex and dodge', ac.flatFooted, 10 + 4 + 2 + 2);
  const fighter = classes.find(c => c.id === 'fighter');
  const human = races.find(r => r.id === 'human');
  const base = { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };
  const plain = characterStats({ race: human, cls: fighter, level: 1, baseScores: base, flexibleChoice: 'str' });
  const buffed = characterStats({ race: human, cls: fighter, level: 1, baseScores: base, flexibleChoice: 'str',
    effects: effectTotals([{ id: 'bulls-strength' }, { id: 'bears-endurance' }]) });
  check("bull's strength: Str +4", buffed.scores.str - plain.scores.str, 4);
  check("bear's endurance: +2 hp at 1st level", buffed.hp - plain.hp, 2);
  check("bear's endurance: Fort +2", buffed.fort - plain.fort, 2);
  const large = characterStats({ race: human, cls: fighter, level: 1, baseScores: base, flexibleChoice: 'str', size: 'Large' });
  check('Large: -1 AC', large.ac - plain.ac, -1);
}

// Animal companions (Core Rulebook table and animals).
{
  const comp = await fetch('data/companions.json').then(r => r.json());
  const animal = id => comp.animals.find(a => a.id === id);
  const cls = id => classes.find(c => c.id === id);
  check('druid 5: companion level 5', companionLevel([{ cls: cls('druid'), level: 5 }]).level, 5);
  check('druid with a domain instead: none', companionLevel([{ cls: cls('druid'), level: 5 }], { natureBond: 'domain' }).level, 0);
  check('druid with the Animal domain: level - 3', companionLevel([{ cls: cls('druid'), level: 5 }], { natureBond: 'domain', animalDomain: () => true }).level, 2);
  check('ranger 3: none yet', companionLevel([{ cls: cls('ranger'), level: 3 }]).level, 0);
  check('druid 4 + ranger 6 stack: 7', companionLevel([{ cls: cls('druid'), level: 4 }, { cls: cls('ranger'), level: 6 }]).level, 7);
  check('cleric 7 without the Animal domain: none', companionLevel([{ cls: cls('cleric'), level: 7 }]).level, 0);
  const w1 = companionStats(animal('wolf'), 1, comp.progression);
  check('wolf at 1st: 13 hp (2d8+4)', w1.hp, 13);
  check('wolf at 1st: AC 14', w1.ac, 14);
  check('wolf at 1st: bite +2, 1d6+1', `${w1.attacks[0].bonus} ${w1.attacks[0].damage}`, '2 1d6+1');
  check('wolf at 1st: Fort +5, Will +1', `${w1.fort} ${w1.will}`, '5 1');
  const w7 = companionStats(animal('wolf'), 7, comp.progression, { increases: ['str'] });
  check('wolf at 7th: Large', w7.size, 'Large');
  check('wolf at 7th: Str 24 (13 + 8 + 2 + 1)', w7.scores.str, 24);
  check('wolf at 7th: AC 19', w7.ac, 19);
  check('wolf at 7th: bite +10, 1d8+10 (one attack: 1 1/2 Str)', `${w7.attacks[0].bonus} ${w7.attacks[0].damage}`, '10 1d8+10');
  check('wolf at 7th: CMD 24 (10 + 4 + Str 7 + Dex 2 + 1)', w7.cmd, 24);
  const horse = companionStats(animal('horse'), 1, comp.progression);
  check('horse hooves are secondary (-5)', horse.attacks.find(x => x.name === 'hooves').bonus, horse.attacks.find(x => x.name === 'bite').bonus - 5);
  check('ape at 9th: Multiattack with 3 attacks', companionStats(animal('ape'), 9, comp.progression).multiattack, true);
  check('attacks parsed with riders', JSON.stringify(parseAttacks('bite (1d6 plus trip), 2 claws (1d4)').map(x => [x.count, x.name, x.dice, x.rider])),
    JSON.stringify([[1, 'bite', '1d6', 'trip'], [2, 'claws', '1d4', '']]));
}

// Saving throw details.
{
  const fighter = classes.find(c => c.id === 'fighter');
  const rogue = classes.find(c => c.id === 'rogue');
  const b = saveBreakdown({ save: 'ref', counts: [{ cls: fighter, level: 2 }, { cls: rogue, level: 2 }], mod: { dex: 2 },
    featNames: ['Lightning Reflexes'], traits: [{ name: 'Reactionary', effects: { saves: { ref: 1 } } }],
    effects: [{ source: 'Resistance', type: 'resistance', value: 1 }, { source: 'Cloak', type: 'resistance', value: 2 }], effectTotal: 2 });
  check('Reflex details: fighter 0 + rogue 3 + Dex 2 + Lightning Reflexes 2 + trait 1 + best resistance 2', b.total, 10);
}

const failed = results.filter(r => !r.pass);
document.getElementById('summary').textContent =
  failed.length ? `${failed.length} of ${results.length} checks FAILED` : `All ${results.length} checks passed`;
document.getElementById('summary').className = failed.length ? 'fail' : 'pass';
document.getElementById('list').innerHTML = results.map(r =>
  `<li class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${r.name}` +
  (r.pass ? '' : ` — expected ${r.expected}, got ${r.actual}`) + '</li>').join('');
