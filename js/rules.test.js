// Checks for rules.js and feats.js. Open tests.html through the local server to run them.
import { abilityModifier, pointsSpent, finalScores, characterStats, hitDieSize, formatBab, levelIncreases,
         bonusSpells, spellsPerDay } from './rules.js';
import { featSlots, slotAccepts, grantedFeats, proficiencyFeats, casterLevel, featContext, checkPrereq,
         checkFeat, repeatable, featEffects, monkFeatList, readTextPrereq, BONUS_FEAT_RULES } from './feats.js';

const results = [];
function check(name, actual, expected) {
  results.push({ name, pass: Object.is(actual, expected), actual, expected });
}

const [races, classes, allFeats] = await Promise.all([
  fetch('data/races.json').then(r => r.json()),
  fetch('data/classes.json').then(r => r.json()),
  fetch('data/feats.json').then(r => r.json()),
]);
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
  const s = characterStats({ race: race('elf'), cls: cls('sorcerer'), baseScores: scores(10, 8, 7, 10, 10, 10),
                          armor: 4, shield: 2, favoredHp: true });
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
  check('human fighter 1 slots', ids('human', 'fighter', 1), 'L1 race class-L1');
  check('elf wizard 5 slots', ids('elf', 'wizard', 5), 'L1 L3 L5 class-L5');
  check('human fighter 20 has 22 feats', featSlots({ race: race('human'), cls: cls('fighter'), level: 20 }).length, 22);
  check('monk 6 slots', ids('dwarf', 'monk', 6), 'L1 L3 L5 class-L1 class-L2 class-L6');
  check('inquisitor 3 teamwork slot', ids('dwarf', 'inquisitor', 3), 'L1 L3 class-L3');
}

// What class bonus slots accept
{
  const slot = (c, level, id) => featSlots({ race: race('dwarf'), cls: cls(c), level }).find(s => s.id === id);
  const fighterSlot = slot('fighter', 1, 'class-L1');
  check('fighter slot takes Power Attack', slotAccepts(fighterSlot, feat('Power Attack')), true);
  check('fighter slot refuses Toughness', slotAccepts(fighterSlot, feat('Toughness')), false);
  const wizSlot = slot('wizard', 5, 'class-L5');
  check('wizard slot takes Empower Spell', slotAccepts(wizSlot, feat('Empower Spell')), true);
  check('wizard slot takes Spell Mastery', slotAccepts(wizSlot, feat('Spell Mastery')), true);
  check('wizard slot refuses Toughness', slotAccepts(wizSlot, feat('Toughness')), false);
  check('monk level 2 slot takes Dodge', slotAccepts(slot('monk', 6, 'class-L2'), feat('Dodge')), true);
  check('monk level 2 slot refuses Mobility', slotAccepts(slot('monk', 6, 'class-L2'), feat('Mobility')), false);
  check('monk level 6 slot takes Mobility', slotAccepts(slot('monk', 6, 'class-L6'), feat('Mobility')), true);
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

const failed = results.filter(r => !r.pass);
document.getElementById('summary').textContent =
  failed.length ? `${failed.length} of ${results.length} checks FAILED` : `All ${results.length} checks passed`;
document.getElementById('summary').className = failed.length ? 'fail' : 'pass';
document.getElementById('list').innerHTML = results.map(r =>
  `<li class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${r.name}` +
  (r.pass ? '' : ` — expected ${r.expected}, got ${r.actual}`) + '</li>').join('');
