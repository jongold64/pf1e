// Which tabs still have something to finish, for the light red tint on the tab buttons. No page code here, so it can be
// tested on its own.
//
// left: what is still to do, all numbers (0 when done) except noRace / noClass:
//   noRace, raceFeatsLeft (a racial bonus feat's skill or weapon not chosen), pointsLeft (point buy; negative is over budget), increasesLeft, flexibleLeft (racial +2 not chosen),
//   noClass, classChoicesLeft, ranksLeft (negative is too many), featsLeft, traitsLeft, spellsLeft (spells known not
//   chosen), noSpells (a caster with no spells chosen at all).
// Returns { tabId: 'why' } for each tab with something left (tab ids as in index.html: 'character' is the Build tab).
export function tabsToDo(left = {}) {
  const out = {};
  const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  if (left.noRace) out.character = 'Choose a race';
  else if (left.raceFeatsLeft > 0) out.character = `${n(left.raceFeatsLeft, 'racial bonus feat choice')} to make`;
  const abilities = [];
  if (left.pointsLeft > 0) abilities.push(`${n(left.pointsLeft, 'point')} left to spend`);
  if (left.pointsLeft < 0) abilities.push(`${n(-left.pointsLeft, 'point')} over budget`);
  if (left.flexibleLeft > 0) abilities.push('racial ability bonus to choose');
  if (left.increasesLeft > 0) abilities.push(`${n(left.increasesLeft, 'ability increase')} to choose`);
  if (abilities.length) out.abilities = abilities.join('; ');
  if (left.noClass) out.classes = 'Choose a class';
  else if (left.classChoicesLeft > 0) out.classes = `${n(left.classChoicesLeft, 'class choice')} to make`;
  if (left.ranksLeft > 0) out.skills = `${n(left.ranksLeft, 'skill rank')} left to spend`;
  if (left.ranksLeft < 0) out.skills = `${n(-left.ranksLeft, 'skill rank')} too many`;
  const feats = [];
  if (left.featsLeft > 0) feats.push(`${n(left.featsLeft, 'feat')} to choose`);
  if (left.traitsLeft > 0) feats.push(`${n(left.traitsLeft, 'trait')} to choose`);
  if (feats.length) out.feats = feats.join('; ');
  if (left.spellsLeft > 0) out.spells = `${n(left.spellsLeft, 'spell')} to choose`;
  else if (left.noSpells) out.spells = 'Choose your spells';
  return out;
}
