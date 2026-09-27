// Checks for rules.js. Open tests.html through the local server to run them.
import { abilityModifier, pointsSpent, finalScores, characterStats, hitDieSize, formatBab, levelIncreases } from './rules.js';

const results = [];
function check(name, actual, expected) {
  results.push({ name, pass: Object.is(actual, expected), actual, expected });
}

const [races, classes] = await Promise.all([
  fetch('data/races.json').then(r => r.json()),
  fetch('data/classes.json').then(r => r.json()),
]);
const race = id => races.find(r => r.id === id);
const cls = id => classes.find(c => c.id === id);
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

const failed = results.filter(r => !r.pass);
document.getElementById('summary').textContent =
  failed.length ? `${failed.length} of ${results.length} checks FAILED` : `All ${results.length} checks passed`;
document.getElementById('summary').className = failed.length ? 'fail' : 'pass';
document.getElementById('list').innerHTML = results.map(r =>
  `<li class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${r.name}` +
  (r.pass ? '' : ` — expected ${r.expected}, got ${r.actual}`) + '</li>').join('');
